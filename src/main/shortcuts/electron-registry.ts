import { globalShortcut } from 'electron'
import type { ShortcutCombination } from '../../domain/global-shortcuts.js'
import type { ShortcutRegistry } from '../../application/shortcuts/shortcut-ports.js'

/** Somente combinações tipadas/revalidadas chegam ao adapter; nenhum accelerator livre no IPC. */
function accelerator(combination: ShortcutCombination): string {
  return `${combination.modifiers === 'CTRL_SHIFT' ? 'Control+Shift' : 'Alt+Shift'}+${combination.key}`
}
export const electronShortcutRegistry: ShortcutRegistry = {
  register: (combination, callback) => globalShortcut.register(accelerator(combination), callback),
  isRegistered: combination => globalShortcut.isRegistered(accelerator(combination)),
  unregister: combination => globalShortcut.unregister(accelerator(combination)),
}
