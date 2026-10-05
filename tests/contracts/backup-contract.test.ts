import { describe, expect, it } from 'vitest'
import {
  BACKUP_COMMAND_LIMITS,
  fitsBackupPreviewBudget,
  parseCancelBackupRestoreRequest,
  parseCancelBackupRestoreResult,
  parseConfirmBackupRestoreRequest,
  parseConfirmBackupRestoreResult,
  parseExportBackupRequest,
  parseExportBackupResult,
  parsePrepareBackupRestoreRequest,
  parsePrepareBackupRestoreResult,
} from '../../src/contracts/backup.js'

const ISSUE = { taskIndex: 0, field: 'title', code: 'REQUIRED' } as const

describe('requests de backup (v1)', () => {
  it('aceita somente o schema exato com contexto válido', () => {
    expect(parseExportBackupRequest({ version: 1, contextSequence: 1 })).toEqual({ version: 1, contextSequence: 1 })
    expect(parsePrepareBackupRestoreRequest({ version: 1, contextSequence: 2 })).toEqual({ version: 1, contextSequence: 2 })
    expect(parseConfirmBackupRestoreRequest({ version: 1, contextSequence: 1, restoreToken: 'a'.repeat(32) })).toEqual({
      version: 1,
      contextSequence: 1,
      restoreToken: 'a'.repeat(32),
    })
    expect(parseCancelBackupRestoreRequest({ version: 1, contextSequence: 1, restoreToken: 'a'.repeat(32) })).not.toBeNull()
  })

  it('recusa versão antiga/futura, campo extra, path e token curto ou ausente', () => {
    expect(parseExportBackupRequest({ version: 2, contextSequence: 1 })).toBeNull()
    expect(parseExportBackupRequest({ version: 1, contextSequence: 1, path: 'C:/x.json' })).toBeNull()
    expect(parseExportBackupRequest({ version: 1, contextSequence: 0 })).toBeNull()
    expect(parseConfirmBackupRestoreRequest({ version: 1, contextSequence: 1, restoreToken: 'curto' })).toBeNull()
    expect(parseConfirmBackupRestoreRequest({ version: 1, contextSequence: 1 })).toBeNull()
    expect(parseConfirmBackupRestoreRequest({ version: 1, contextSequence: 1, restoreToken: 'a'.repeat(32), json: '{}' })).toBeNull()
  })

  it('respeita o orçamento de 64 KiB do request', () => {
    const padded = { version: 1, contextSequence: 1, pad: 'x'.repeat(BACKUP_COMMAND_LIMITS.requestBytes) }
    expect(parseExportBackupRequest(padded)).toBeNull()
    expect(parseExportBackupRequest({ version: 1, contextSequence: 1, pad: 'x'.repeat(100) })).toBeNull()
  })
})

describe('resultados de backup', () => {
  it('exporta cancelled/ok/error com formas fechadas', () => {
    expect(parseExportBackupResult({ version: 1, status: 'cancelled' })).toEqual({ version: 1, status: 'cancelled' })
    expect(
      parseExportBackupResult({ version: 1, status: 'ok', outcome: 'SAVED', taskCount: 3, revision: '7' }),
    ).toMatchObject({ outcome: 'SAVED', taskCount: 3 })
    expect(
      parseExportBackupResult({
        version: 1,
        status: 'ok',
        outcome: 'SAVED_WITH_WARNING',
        taskCount: 0,
        revision: '0',
      }),
    ).not.toBeNull()
    expect(parseExportBackupResult({ version: 1, status: 'ok', outcome: 'PENDING', taskCount: 1, revision: '1' })).toBeNull()
    expect(parseExportBackupResult({ version: 1, status: 'error', code: 'FILE_WRITE_FAILED' })).not.toBeNull()
  })

  it('issues só acompanham INVALID_TASKS/LOCAL_DATA_NOT_EXPORTABLE, com até 5 e contagem restante', () => {
    const withIssues = {
      version: 1,
      status: 'error',
      code: 'INVALID_TASKS',
      issues: [ISSUE],
      extraIssueCount: 9,
    }
    expect(parseExportBackupResult(withIssues)).toMatchObject({ extraIssueCount: 9 })
    expect(
      parseExportBackupResult({ version: 1, status: 'error', code: 'FILE_WRITE_FAILED', issues: [ISSUE] }),
    ).toBeNull()
    expect(
      parseExportBackupResult({ version: 1, status: 'error', code: 'INVALID_TASKS', issues: Array(6).fill(ISSUE) }),
    ).toBeNull()
    expect(
      parseExportBackupResult({ version: 1, status: 'error', code: 'INVALID_TASKS', issues: [{ taskIndex: 0, field: 'título', code: 'REQUIRED' }] }),
    ).toBeNull()
  })

  it('commitState só existe para falha de verificação/storage com valor fechado', () => {
    expect(
      parseConfirmBackupRestoreResult({
        version: 1,
        status: 'error',
        code: 'BACKUP_VERIFICATION_FAILED',
        commitState: 'NOT_APPLIED',
      }),
    ).toMatchObject({ commitState: 'NOT_APPLIED' })
    expect(
      parseConfirmBackupRestoreResult({
        version: 1,
        status: 'error',
        code: 'STORAGE_UNAVAILABLE',
        commitState: 'UNKNOWN',
      }),
    ).toMatchObject({ commitState: 'UNKNOWN' })
    expect(
      parseConfirmBackupRestoreResult({ version: 1, status: 'error', code: 'SERIES_CONFLICT', commitState: 'UNKNOWN' }),
    ).toBeNull()
  })

  it('prévia publica campos exatos, token opaco, TTL de 5 min e versões válidas', () => {
    const preview = {
      version: 1,
      status: 'ok',
      restoreToken: 't'.repeat(32),
      baseRevision: '12',
      sourceFormatVersion: 1,
      formatVersion: 4,
      exportedAt: '2026-10-04T12:00:00.000Z',
      appVersion: '0.1.0',
      fileTaskCount: 2,
      localTaskCount: 5,
      expiresInMs: 300000,
    }
    expect(parsePrepareBackupRestoreResult(preview)).toMatchObject({ sourceFormatVersion: 1, fileTaskCount: 2 })
    expect(parsePrepareBackupRestoreResult({ ...preview, expiresInMs: 60000 })).toBeNull()
    expect(parsePrepareBackupRestoreResult({ ...preview, sourceFormatVersion: 5 })).toBeNull()
    expect(parsePrepareBackupRestoreResult({ ...preview, formatVersion: 3 })).toBeNull()
    expect(parsePrepareBackupRestoreResult({ ...preview, appVersion: '' })).toBeNull()
    expect(parsePrepareBackupRestoreResult({ ...preview, restoreToken: 'curto' })).toBeNull()
    expect(fitsBackupPreviewBudget(preview)).toBe(true)
    expect(fitsBackupPreviewBudget({ ...preview, appVersion: 'a'.repeat(BACKUP_COMMAND_LIMITS.responseBytes) })).toBe(false)
  })

  it('confirmação ok exige outcome, contagem, verificação e época positiva segura', () => {
    const ack = {
      version: 1,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '9',
      restoredCount: 4,
      verification: 'VERIFIED',
      undoEpoch: 3,
    }
    expect(parseConfirmBackupRestoreResult(ack)).toMatchObject({ outcome: 'APPLIED', undoEpoch: 3 })
    expect(parseConfirmBackupRestoreResult({ ...ack, undoEpoch: 0 })).toBeNull()
    expect(parseConfirmBackupRestoreResult({ ...ack, verification: 'OK' })).toBeNull()
    expect(parseConfirmBackupRestoreResult({ ...ack, outcome: 'SAVED' })).toBeNull()
    expect(parseConfirmBackupRestoreResult({ ...ack, version: 2 })).toBeNull()
  })

  it('cancelamento é exatamente ok/cancelled ou erro fechado', () => {
    expect(parseCancelBackupRestoreResult({ version: 1, status: 'ok', cancelled: true })).toEqual({
      version: 1,
      status: 'ok',
      cancelled: true,
    })
    expect(parseCancelBackupRestoreResult({ version: 1, status: 'ok', cancelled: false })).toBeNull()
    expect(parseCancelBackupRestoreResult({ version: 1, status: 'error', code: 'BACKUP_PREVIEW_INVALID' })).not.toBeNull()
    expect(parseCancelBackupRestoreResult({ version: 1, status: 'error', code: 'QUALQUER' })).toBeNull()
  })
})
