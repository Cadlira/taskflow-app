// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { NtExecutable, NtExecutableResource } from 'resedit'
import { describe, expect, it } from 'vitest'
import { clearCompanyNames, readCompanyNames } from '../../scripts/windows-metadata.mjs'
import { readPeManifest } from '../../scripts/verify-package.mjs'

const require = createRequire(import.meta.url)
// O pacote electron (44.x) não usa postinstall: `require('electron')` devolve o
// caminho do executável e baixa o binário sob demanda quando ele está ausente —
// necessário em clones/pipelines frescos, sem depender de dist pré-baixado.
const electronExecutable = require('electron') as unknown as string

describe('metadados Windows sem atribuição empresarial', () => {
  it('remove CompanyName herdado conservando manifest, ícones e demais recursos', () => {
    const before = readFileSync(electronExecutable)
    expect(readCompanyNames(before)).toContain('GitHub, Inc.')
    const after = clearCompanyNames(before)
    expect(readCompanyNames(after).every(name => name === '')).toBe(true)
    expect(readPeManifest(after)).toBe(readPeManifest(before))
    const entries = (bytes: Buffer) => NtExecutableResource.from(NtExecutable.from(bytes)).entries.filter(entry => entry.type !== 16)
    expect(entries(after)).toEqual(entries(before))
  // Releitura do PE completo do Electron; não é orçamento de latência do produto.
  }, 30_000)
})
