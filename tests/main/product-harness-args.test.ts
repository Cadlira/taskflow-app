import { describe, expect, it } from 'vitest'
import { parseProductHarnessScenario } from '../../src/main/harness/product-harness.js'
import { selectFoundationProfile } from '../../src/main/profile.js'

describe('harness restrito de produto', () => {
  it('aceita exatamente um argumento com cenário conhecido', () => {
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=bridge'])).toEqual({ name: 'bridge' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=reopen'])).toEqual({ name: 'reopen' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=bench'])).toEqual({ name: 'bench' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=drain'])).toEqual({ name: 'drain' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=tasks'])).toEqual({ name: 'tasks' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=ui-bench'])).toEqual({ name: 'ui-bench' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=a11y'])).toEqual({ name: 'a11y' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=crash|unit:before-commit'])).toEqual({
      name: 'crash',
      point: 'unit:before-commit',
      unit: 'save',
    })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=crash|unit:after-commit|claim'])).toEqual({
      name: 'crash',
      point: 'unit:after-commit',
      unit: 'claim',
    })
  })

  it.each([
    [[]],
    [['--product-harness=']],
    [['--product-harness=write']],
    [['--product-harness=tasks|extra']],
    [['--product-harness=ui-bench|1']],
    [['--product-harness=bridge', '--product-harness=bench']],
    [['--product-harness=crash']],
    [['--product-harness=crash|unit:commit']],
    [['--product-harness=crash|migrate:before-commit']],
    [['--product-harness=crash|unit:before-commit|delete']],
    [['--product-harness=crash|unit:before-commit|save|extra']],
    [['--product-harness=C:\\dados\\outro.sqlite']],
    [['--PRODUCT-HARNESS=bridge']],
  ])('ignora forma inválida ou ambígua: %j', (argv) => {
    expect(parseProductHarnessScenario(argv)).toBeNull()
  })

  it('só existe no perfil test: o perfil prod empacotado nunca o seleciona', () => {
    // O main só consulta o cenário quando o perfil é `test`, que no pacote exige exatamente
    // um `--foundation-test`; sem ele o perfil é prod e o argumento do harness é ignorado.
    expect(selectFoundationProfile(true, ['TaskFlowApp.exe', '--product-harness=bridge'], {})).toBe('prod')
    expect(selectFoundationProfile(true, ['TaskFlowApp.exe', '--foundation-test', '--product-harness=bridge'], {})).toBe('test')
    expect(selectFoundationProfile(true, ['TaskFlowApp.exe', '--product-harness=bridge'], { TASKFLOW_PROFILE: 'test' })).toBe('prod')
  })
})
