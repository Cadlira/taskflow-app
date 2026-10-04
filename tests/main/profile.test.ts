import { describe, expect, it } from 'vitest'
import {
  resolveFoundationProofFile,
  resolveProductDatabaseFile,
  resolveProfilePaths,
  selectFoundationProfile,
} from '../../src/main/profile.js'

describe('profiles locais', () => {
  it('separa dev, test e prod sem aceitar perfil arbitrário em produção', () => {
    expect(selectFoundationProfile(false, [], {})).toBe('dev')
    expect(selectFoundationProfile(false, [], { TASKFLOW_PROFILE: 'test' })).toBe('test')
    expect(selectFoundationProfile(true, ['TaskFlowApp.exe'], { TASKFLOW_PROFILE: 'test' })).toBe('prod')
    expect(selectFoundationProfile(true, ['TaskFlowApp.exe', '--foundation-test'], {})).toBe('test')
    expect(selectFoundationProfile(true, ['TaskFlowApp.exe', '--foundation-test', '--foundation-test'], {})).toBe('prod')
  })

  it('ancora userData/sessionData no LocalAppData e mantém os perfis separados', () => {
    const localAppData = 'C:\\Users\\Standard\\AppData\\Local'
    const development = resolveProfilePaths(localAppData, 'dev')
    const production = resolveProfilePaths(localAppData, 'prod')

    expect(development.userData).toBe('C:\\Users\\Standard\\AppData\\Local\\TaskFlowApp\\profiles\\dev\\user-data')
    expect(development.sessionData).toContain('\\dev\\session-data')
    expect(production.userData).toContain('\\prod\\user-data')
    expect(production.userData).not.toBe(development.userData)
  })

  it('mantém produto, prova e sessão em destinos distintos dentro do perfil', () => {
    const paths = resolveProfilePaths('C:\\Users\\Standard\\AppData\\Local', 'prod')

    expect(resolveProductDatabaseFile(paths.userData)).toBe(`${paths.userData}\\data\\taskflow.sqlite`)
    expect(resolveFoundationProofFile(paths.userData)).toBe(`${paths.userData}\\foundation-proof\\proof.sqlite`)
    expect(resolveProductDatabaseFile(paths.userData).startsWith(paths.sessionData)).toBe(false)
  })

  it.each([undefined, '', 'relative\\path', '\\\\server\\share\\LocalAppData', '\\\\?\\C:\\outside'])(
    'rejeita raiz inválida: %s',
    (root) => {
      expect(() => resolveProfilePaths(root, 'prod')).toThrow()
    },
  )
})
