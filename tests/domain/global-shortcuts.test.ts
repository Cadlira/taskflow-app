import { describe, expect, it } from 'vitest'
import { defaultShortcutActions, hasDuplicateShortcuts, isShortcutAction, isShortcutCombination, isShortcutPreferences } from '../../src/domain/global-shortcuts.js'

describe('Q08 gramática de atalhos', () => {
  it('defaults independentes K/L/null com objetos próprios', () => {
    expect(defaultShortcutActions()).toEqual({ QUICK_ADD: { modifiers: 'CTRL_SHIFT', key: 'K' },
      OPEN_TASK_MANAGER: { modifiers: 'CTRL_SHIFT', key: 'L' }, CAPTURE_CLIPBOARD: null })
    const first = defaultShortcutActions()
    if (first.QUICK_ADD) first.QUICK_ADD.key = 'X'
    expect(defaultShortcutActions().QUICK_ADD?.key).toBe('K')
  })
  it.each(['A', 'Z', '0', '9', 'F1', 'F3', 'F5', 'F12', 'F24'])('aceita %s nas duas combinações', (key) => {
    expect(isShortcutCombination({ modifiers: 'CTRL_SHIFT', key })).toBe(true)
    expect(isShortcutCombination({ modifiers: 'ALT_SHIFT', key })).toBe(true)
  })
  it.each(['F0', 'F4', 'F25', 'F01', 'a', 'Ctrl', 'Space', 'Escape', 'AltGr', '😀', '', 'AA'])('recusa tecla %s', (key) => {
    expect(isShortcutCombination({ modifiers: 'CTRL_SHIFT', key })).toBe(false)
  })
  it.each(['WIN', 'CTRL_ALT', 'ALTGR', 'CTRL', 'CTRL_SHIFT_ALT', 'Alt+Shift'])('recusa modificador %s', (modifiers) => {
    expect(isShortcutCombination({ modifiers, key: 'K' })).toBe(false)
  })
  it.each([null, [], 'Ctrl+Shift+K', { key: 'K' }, { modifiers: 'CTRL_SHIFT', key: 'K', extra: true }])('recusa shape inválido', (input) => {
    expect(isShortcutCombination(input)).toBe(false)
  })
  it('valida duplicatas antes de efeitos; null repetido é permitido', () => {
    const actions = defaultShortcutActions()
    actions.CAPTURE_CLIPBOARD = { modifiers: 'CTRL_SHIFT', key: 'K' }
    expect(hasDuplicateShortcuts(actions)).toBe(true)
    actions.CAPTURE_CLIPBOARD = { modifiers: 'ALT_SHIFT', key: 'K' }
    expect(hasDuplicateShortcuts(actions)).toBe(false)
    actions.QUICK_ADD = null
    actions.CAPTURE_CLIPBOARD = null
    expect(hasDuplicateShortcuts(actions)).toBe(false)
  })
  it('documento exato versionado com revisão decimal até 32 dígitos', () => {
    const base = { version: 1, revision: '0', actions: defaultShortcutActions() }
    expect(isShortcutPreferences(base)).toBe(true)
    for (const revision of ['00', '-1', '1.2', '1e3', '', '9'.repeat(33)]) expect(isShortcutPreferences({ ...base, revision })).toBe(false)
    expect(isShortcutPreferences({ ...base, revision: '9'.repeat(32) })).toBe(true)
    expect(isShortcutPreferences({ ...base, version: 2 })).toBe(false)
    expect(isShortcutPreferences({ ...base, extra: true })).toBe(false)
    expect(isShortcutPreferences({ ...base, actions: { ...base.actions, EXTRA: null } })).toBe(false)
  })
  it('ações fechadas', () => {
    expect(isShortcutAction('QUICK_ADD')).toBe(true)
    expect(isShortcutAction('OPEN_TASK_MANAGER')).toBe(true)
    expect(isShortcutAction('CAPTURE_CLIPBOARD')).toBe(true)
    expect(isShortcutAction('EXECUTE')).toBe(false)
  })
})
