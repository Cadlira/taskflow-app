import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { FoundationFailure, FoundationResult, FoundationSuccess } from '../contracts/foundation.js'

// Prova transacional fictícia (G4 revisado em 2026-10-04): armazenamento
// embarcado `node:sqlite` do runtime Electron, sem addon externo ou fallback.
const FOUNDATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS foundation_marker (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    marker TEXT NOT NULL CHECK (length(marker) = 64)
  )
`
const READ_MARKER_SQL = 'SELECT marker FROM foundation_marker WHERE id = 1'
const ROLLBACK_PROBE = Symbol('foundation rollback probe')

type MarkerRow = { marker: unknown }

function failure(code: FoundationFailure['code']): FoundationFailure {
  return { version: 1, status: 'error', code }
}

function readMarker(database: DatabaseSync): string | null {
  const row = database.prepare(READ_MARKER_SQL).get() as MarkerRow | undefined
  if (row === undefined) return null
  if (typeof row.marker !== 'string' || !/^[a-f0-9]{64}$/.test(row.marker)) {
    throw new Error('Foundation marker is invalid')
  }
  return row.marker
}

export function runFoundationProof(databaseFile: string, appVersion: string, electronVersion: string, nodeVersion: string): FoundationResult {
  let database: DatabaseSync | undefined

  try {
    const databaseDirectory = path.dirname(databaseFile)
    mkdirSync(databaseDirectory, { recursive: true })
    database = new DatabaseSync(databaseFile)
    database.exec(FOUNDATION_TABLE_SQL)

    let marker = readMarker(database)
    if (marker === null) {
      marker = randomBytes(32).toString('hex')
      database.prepare('INSERT INTO foundation_marker (id, marker) VALUES (1, ?)').run(marker)
      if (readMarker(database) !== marker) throw new Error('Foundation marker write did not persist')
    }

    const rollbackMarker = randomBytes(32).toString('hex')
    let rolledBack = false
    database.exec('BEGIN IMMEDIATE')
    try {
      database.prepare('UPDATE foundation_marker SET marker = ? WHERE id = 1').run(rollbackMarker)
      throw ROLLBACK_PROBE
    } catch (error) {
      if (error !== ROLLBACK_PROBE) throw error
      database.exec('ROLLBACK')
      rolledBack = true
    }
    if (!rolledBack || database.isTransaction) throw new Error('Foundation rollback did not complete')

    const beforeClose = readMarker(database)
    database.close()
    database = undefined

    const reopened = new DatabaseSync(databaseFile, { readOnly: true })
    const afterReopen = readMarker(reopened)
    reopened.close()
    if (beforeClose === null || beforeClose !== marker || afterReopen !== marker) {
      throw new Error('Foundation marker changed during rollback or reopen')
    }

    const result: FoundationSuccess = {
      version: 1,
      status: 'verified',
      appVersion,
      electronVersion,
      nodeVersion,
      fingerprint: createHash('sha256').update(marker, 'utf8').digest('hex'),
    }
    return result
  } catch {
    try {
      database?.close()
    } catch {
      // A failed close is deliberately not surfaced to the renderer.
    }
    return failure('PROOF_UNAVAILABLE')
  }
}
