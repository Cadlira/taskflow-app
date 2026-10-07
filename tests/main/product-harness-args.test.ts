import { describe, expect, it } from 'vitest'
import { harnessSkipsCoordinatorStart, parseProductHarnessScenario } from '../../src/main/harness/product-harness.js'
import { selectFoundationProfile } from '../../src/main/profile.js'

describe('harness restrito de produto', () => {
  it('aceita exatamente um argumento com cenário conhecido', () => {
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=bridge'])).toEqual({ name: 'bridge' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=reopen'])).toEqual({ name: 'reopen' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=bench'])).toEqual({ name: 'bench' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=drain'])).toEqual({ name: 'drain' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=tasks'])).toEqual({ name: 'tasks' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=ui-bench'])).toEqual({ name: 'ui-bench' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=seed-sql1'])).toEqual({ name: 'seed-sql1' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=inspect-sql1'])).toEqual({ name: 'inspect-sql1' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=recurrence'])).toEqual({ name: 'recurrence' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=trash'])).toEqual({ name: 'trash' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=lifecycle'])).toEqual({ name: 'lifecycle' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=reminders'])).toEqual({ name: 'reminders' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=reminders-seed'])).toEqual({ name: 'reminders-seed' })
    for (const name of ['entries', 'ai', 'entries-native', 'entries-native-reopen'] as const) {
      expect(parseProductHarnessScenario(['app.exe', `--product-harness=${name}`])).toEqual({ name })
    }
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=backup'])).toEqual({ name: 'backup' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=backup|export-fail|temp:after-write'])).toEqual({
      name: 'backup',
      exportFail: 'temp:after-write',
    })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=backup|export-fail|readback:before'])).toEqual({
      name: 'backup',
      exportFail: 'readback:before',
    })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=a11y'])).toEqual({ name: 'a11y', opener: 'real' })
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=a11y|fake-opener'])).toEqual({
      name: 'a11y',
      opener: 'fake',
    })
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
    expect(parseProductHarnessScenario(['app.exe', '--product-harness=crash|migrate:before-commit|migrate'])).toEqual({
      name: 'crash',
      point: 'migrate:before-commit',
      unit: 'migrate',
    })
  })

  it('só os cenários de migração impedem a abertura prévia do coordenador', () => {
    expect(harnessSkipsCoordinatorStart({ name: 'seed-sql1' })).toBe(true)
    expect(harnessSkipsCoordinatorStart({ name: 'inspect-sql1' })).toBe(true)
    expect(harnessSkipsCoordinatorStart({ name: 'crash', point: 'migrate:before-commit', unit: 'migrate' })).toBe(true)
    expect(harnessSkipsCoordinatorStart({ name: 'crash', point: 'unit:before-commit', unit: 'save' })).toBe(false)
    expect(harnessSkipsCoordinatorStart({ name: 'bridge' })).toBe(false)
    expect(harnessSkipsCoordinatorStart({ name: 'reopen' })).toBe(false)
    expect(harnessSkipsCoordinatorStart({ name: 'backup' })).toBe(false)
  })

  it.each([
    [[]],
    [['--product-harness=']],
    [['--product-harness=write']],
    [['--product-harness=tasks|extra']],
    [['--product-harness=ui-bench|1']],
    [['--product-harness=entries-native|prod']],
    [['--product-harness=entries-native', '--product-harness=entries']],
    [['--product-harness=a11y|outro']],
    [['--product-harness=backup|extra']],
    [['--product-harness=backup|export-fail']],
    [['--product-harness=backup|export-fail|nope']],
    [['--product-harness=backup|export-fail|temp:before-write|extra']],
    [['--product-harness=bridge', '--product-harness=bench']],
    [['--product-harness=crash']],
    [['--product-harness=crash|unit:commit']],
    [['--product-harness=crash|migrate:antes']],
    [['--product-harness=crash|migrate:before-commit|delete']],
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
