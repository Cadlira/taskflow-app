import { describe, expect, it } from 'vitest'
import {
  checkManifest,
  findAllowedViolations,
  findForbiddenFiles,
  findMissingFiles,
  PACKAGE_ALLOWLIST,
  REQUIRED_ASAR_FILES,
} from '../../scripts/verify-package.mjs'

describe('verify:package — inventário do ASAR', () => {
  it('aceita o inventário mínimo esperado do pacote', () => {
    const files = [...REQUIRED_ASAR_FILES, '/out/renderer/assets/app.js']
    expect(findMissingFiles(files)).toEqual([])
    expect(findAllowedViolations(files, PACKAGE_ALLOWLIST)).toEqual([])
    expect(findForbiddenFiles(files)).toEqual([])
  })

  it('reprova quando um recurso obrigatório está ausente', () => {
    const files = REQUIRED_ASAR_FILES.filter((file) => file !== '/out/preload/index.cjs')
    expect(findMissingFiles(files)).toContain('/out/preload/index.cjs')
  })

  it('reprova arquivos fora da allowlist', () => {
    const violations = findAllowedViolations([...REQUIRED_ASAR_FILES, '/docs/interno.md', '/.env'])
    expect(violations).toContain('/docs/interno.md')
    expect(violations).toContain('/.env')
  })

  it('reprova node_modules, addon nativo, segredos, updater, elevate helper e testes', () => {
    const forbidden = [
      '/node_modules/vue/index.js',
      '/out/main/native.node',
      '/node_modules/better-sqlite3/lib/index.js',
      '/.env.production',
      '/app-update.yml',
      '/updater/patch.js',
      '/elevate.exe',
      '/tests/main/ipc.test.js',
      '/secrets-credentials.json',
      '/chrome/manifest.json',
    ]
    const problems = findForbiddenFiles(forbidden)
    for (const file of forbidden) {
      expect(problems.some((problem: string) => problem.startsWith(file))).toBe(true)
    }
  })
})

describe('verify:package — manifests de execução', () => {
  it('exige asInvoker e uiAccess=false', () => {
    expect(checkManifest('<assembly><trustInfo><requestedExecutionLevel level="asInvoker" uiAccess="false"/></trustInfo></assembly>', 'asInvoker')).toEqual([])
    expect(checkManifest('<assembly><requestedExecutionLevel level="requireAdministrator" uiAccess="false"/></assembly>', 'asInvoker')).toContain(
      'requestedExecutionLevel != asInvoker',
    )
    expect(checkManifest('<assembly><requestedExecutionLevel level="asInvoker" uiAccess="true"/></assembly>', 'asInvoker')).toContain(
      'uiAccess ausente ou diferente de false',
    )
    expect(checkManifest(null, 'asInvoker')).toEqual(['manifest ausente'])
  })
})
