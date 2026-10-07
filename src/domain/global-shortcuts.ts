export const SHORTCUT_ACTIONS = ['QUICK_ADD', 'OPEN_TASK_MANAGER', 'CAPTURE_CLIPBOARD'] as const
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export interface ShortcutCombination {
  modifiers: 'CTRL_SHIFT' | 'ALT_SHIFT'
  key: string
}
export type ShortcutActions = Record<ShortcutAction, ShortcutCombination | null>
export interface ShortcutPreferences {
  version: 1
  revision: string
  actions: ShortcutActions
}
export function defaultShortcutActions(): ShortcutActions {
  return { QUICK_ADD: { modifiers: 'CTRL_SHIFT', key: 'K' },
    OPEN_TASK_MANAGER: { modifiers: 'CTRL_SHIFT', key: 'L' }, CAPTURE_CLIPBOARD: null }
}
export function isShortcutAction(value: unknown): value is ShortcutAction {
  return typeof value === 'string' && SHORTCUT_ACTIONS.some((action) => action === value)
}
function exactData(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length) return undefined
    const own = Object.getOwnPropertyNames(value)
    if (own.length !== keys.length || !keys.every(key => own.includes(key))) return undefined
    if (own.some(key => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return !descriptor?.enumerable || !('value' in descriptor) })) return undefined
    return value as Record<string, unknown>
  } catch { return undefined }
}
export function isShortcutCombination(value: unknown): value is ShortcutCombination {
  const record = exactData(value, ['modifiers', 'key'])
  return record !== undefined &&
    (record['modifiers'] === 'CTRL_SHIFT' || record['modifiers'] === 'ALT_SHIFT') &&
    typeof record['key'] === 'string' && record['key'] !== 'F4' &&
    /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(record['key'])
}
export function sameShortcut(a: ShortcutCombination | null, b: ShortcutCombination | null): boolean {
  return a === null || b === null ? a === b : a.modifiers === b.modifiers && a.key === b.key
}
export function hasDuplicateShortcuts(actions: ShortcutActions): boolean {
  return SHORTCUT_ACTIONS.some((action, index) => actions[action] !== null &&
    SHORTCUT_ACTIONS.slice(index + 1).some((other) => sameShortcut(actions[action], actions[other])))
}
export function isShortcutPreferences(value: unknown): value is ShortcutPreferences {
  const record = exactData(value, ['version', 'revision', 'actions'])
  if (record === undefined || record['version'] !== 1 || typeof record['revision'] !== 'string' ||
    !/^(?:0|[1-9][0-9]{0,31})$/.test(record['revision'])) return false
  const entries = exactData(record['actions'], SHORTCUT_ACTIONS)
  if (entries === undefined) return false
  if (!SHORTCUT_ACTIONS.every((action) => entries[action] === null || isShortcutCombination(entries[action]))) return false
  return !hasDuplicateShortcuts(entries as ShortcutActions)
}
