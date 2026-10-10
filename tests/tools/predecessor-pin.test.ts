// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contratos de leitura do pin do predecessor e da coerência de versão do candidato.
// Nenhum Setup/uninstaller é executado; as fixtures são bytes fictícios do próprio teste.
const pin = readFileSync('build/nsis/trusted-predecessors.nsh', 'utf8')
const readDefine = (name: string): string => {
  const match = pin.match(new RegExp(`^!define ${name} "([^"]*)"$`, 'm'))
  expect(match, `${name} ausente`).not.toBeNull()
  return match![1]!
}
const predecessorVersion = readDefine('TFA_PREDECESSOR_VERSION')
const predecessorHash = readDefine('TFA_PREDECESSOR_SHA256')
const candidate = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  version: string
  packages: Record<string, { version?: string }>
}

// B′ 0.2.1/1195277 — Reader/uninstaller conferido por leitura em 2026-10-10 (docs/desktop-homologation-results.md).
const B_PRIME_READER_SHA256 = '6e34919d27244dd54293b4feb0d394222338a449df4f63150a9c8041188ce341'
// Pin anterior (A 0.2.0) — não pode voltar a admitir o uninstaller antigo por herança.
const LEGACY_A_READER_SHA256 = 'f4e13085c910d729f4f448bb8bfbf06cbdebdd4fb3d373dc2a1e7500e8c08d89'
const parseVersion = (value: string): number[] => value.split('.').map(Number)

describe('pin do predecessor — versão e hash exatos (compatível/diverso/adulterado)', () => {
  it('fixa B′ 0.2.1 pelo hash exato do Reader, sem valor vazio ou genérico', () => {
    expect(predecessorVersion).toBe('0.2.1')
    expect(predecessorHash).toBe(B_PRIME_READER_SHA256)
    expect(predecessorHash).toMatch(/^[a-f0-9]{64}$/)
    expect(predecessorHash).not.toBe('0'.repeat(64))
    expect(new Set(predecessorHash).size).toBeGreaterThan(4)
  })

  it('não admite o predecessor anterior nem uninstaller diverso/adulterado', () => {
    // Diverso: o pin antigo (A 0.2.0) permanece diferente do pin atual.
    expect(predecessorHash).not.toBe(LEGACY_A_READER_SHA256)
    // Adulterado: bytes diferentes dos do Reader B′ produzem hash diferente do pin.
    const tampered = createHash('sha256').update('TFA012-TAMPERED-READER-FIXTURE').digest('hex')
    expect(tampered).not.toBe(predecessorHash)
    // Compatível: o hash do B′ está registrado no stage com o mesmo valor (somente leitura).
    const stage = 'release/candidates/0.2.1-win-x64-1195277df63579aa244b0b76b8d889e112929594-pair-021-fix/uninstaller-sha256.json'
    let stageHash: string | null = null
    try {
      stageHash = (JSON.parse(readFileSync(stage, 'utf8')) as { sha256: string }).sha256
    } catch {
      stageHash = null // stage local ausente: a conferência de bytes pertence à campanha (AC02).
    }
    if (stageHash !== null) expect(stageHash).toBe(predecessorHash)
  })

  it('mantém versão monotônica e metadados de candidato coerentes', () => {
    expect(candidate.version).toBe('0.2.2')
    expect(lock.version).toBe('0.2.2')
    expect(lock.packages['']?.version).toBe('0.2.2')
    const predecessor = parseVersion(predecessorVersion)
    const candidateParts = parseVersion(candidate.version)
    expect(predecessor).toHaveLength(3)
    expect(candidateParts).toHaveLength(3)
    expect(predecessor.every(Number.isInteger)).toBe(true)
    expect(candidateParts.every(Number.isInteger)).toBe(true)
    const monotonic =
      candidateParts[0]! > predecessor[0]! ||
      (candidateParts[0] === predecessor[0] &&
        (candidateParts[1]! > predecessor[1]! ||
          (candidateParts[1] === predecessor[1] && candidateParts[2]! > predecessor[2]!)))
    expect(monotonic).toBe(true)
  })

  it('mantém os guards do preflight legível (31/32, hash encadeado e sem aceitação por nome)', () => {
    const preflight = readFileSync('build/nsis/predecessor-preflight.ps1', 'utf8')
    expect(preflight).toContain('$env:TFA_PREDECESSOR_VERSION')
    expect(preflight).toContain('$env:TFA_PREDECESSOR_HASH')
    expect(preflight).toContain('exit 31')
    expect(preflight).toContain('exit $phase')
    // A procedência exige versão E hash; nada aceita só o nome/versão.
    expect(preflight).toMatch(/\$prior\s*=.*\$hash\s+-eq\s+\$env:TFA_PREDECESSOR_HASH.*\$version\s+-eq\s+\$env:TFA_PREDECESSOR_VERSION/)
  })
})
