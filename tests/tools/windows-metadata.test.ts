// @vitest-environment node
import { readFileSync } from 'node:fs'
import { NtExecutable, NtExecutableResource } from 'resedit'
import { describe, expect, it } from 'vitest'
import { clearCompanyNames, readCompanyNames } from '../../scripts/windows-metadata.mjs'
import { readPeManifest } from '../../scripts/verify-package.mjs'

describe('metadados Windows sem atribuição empresarial', () => {
  it('remove CompanyName herdado conservando manifest, ícones e demais recursos', () => {
    const before = readFileSync('node_modules/electron/dist/electron.exe')
    expect(readCompanyNames(before)).toContain('GitHub, Inc.')
    const after = clearCompanyNames(before)
    expect(readCompanyNames(after).every(name => name === '')).toBe(true)
    expect(readPeManifest(after)).toBe(readPeManifest(before))
    const entries = (bytes: Buffer) => NtExecutableResource.from(NtExecutable.from(bytes)).entries.filter(entry => entry.type !== 16)
    expect(entries(after)).toEqual(entries(before))
  // Releitura do PE completo do Electron; não é orçamento de latência do produto.
  }, 30_000)
})
