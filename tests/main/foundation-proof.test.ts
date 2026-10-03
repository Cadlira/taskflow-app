import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runFoundationProof } from '../../src/main/foundation-proof.js'

let temporaryRoots: string[] = []

function createProofPath(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'taskflow-sqlite-test-'))
  temporaryRoots.push(root)
  return path.join(root, 'user-data', 'foundation-proof', 'proof.sqlite')
}

function successFingerprint(result: ReturnType<typeof runFoundationProof>): string {
  if (result.status !== 'verified') throw new Error('Expected a successful foundation proof')
  return result.fingerprint
}

afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true })
  temporaryRoots = []
})

describe('prova SQLite isolada', () => {
  it('cria o marcador uma vez, confirma rollback/reopen e conserva fingerprint', () => {
    const databaseFile = createProofPath()
    const first = runFoundationProof(databaseFile, '0.1.0', '44.5.1', '24.21.0')
    const firstFingerprint = successFingerprint(first)
    const second = runFoundationProof(databaseFile, '0.1.0', '44.5.1', '24.21.0')

    expect(firstFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(successFingerprint(second)).toBe(firstFingerprint)
  })

  it('falha sem reset quando o arquivo existente não é um banco válido', () => {
    const databaseFile = createProofPath()
    const original = Buffer.from('fixture-invalid-sqlite')
    mkdirSync(path.dirname(databaseFile), { recursive: true })
    writeFileSync(databaseFile, original)

    expect(runFoundationProof(databaseFile, '0.1.0', '44.5.1', '24.21.0')).toMatchObject({
      version: 1,
      status: 'error',
      code: 'PROOF_UNAVAILABLE',
    })
    expect(readFileSync(databaseFile)).toEqual(original)
  })

  it('rejeita diretório inacessível sem fallback e permite depois uma prova em raiz própria', () => {
    const blockedRoot = mkdtempSync(path.join(tmpdir(), 'taskflow-blocked-parent-'))
    temporaryRoots.push(blockedRoot)
    const notDirectory = path.join(blockedRoot, 'not-directory')
    writeFileSync(notDirectory, 'fixture')
    const blockedDatabase = path.join(notDirectory, 'foundation-proof', 'proof.sqlite')

    expect(runFoundationProof(blockedDatabase, '0.1.0', '44.5.1', '24.21.0')).toMatchObject({
      version: 1,
      status: 'error',
      code: 'PROOF_UNAVAILABLE',
    })
    expect(readFileSync(notDirectory, 'utf8')).toBe('fixture')
    expect(successFingerprint(runFoundationProof(createProofPath(), '0.1.0', '44.5.1', '24.21.0'))).toMatch(
      /^[a-f0-9]{64}$/,
    )
  })
})
