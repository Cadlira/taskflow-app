import type { SurfaceRole } from '../application/capture/capture-ports.js'

export const QUICK_ADD_OPERATIONS = ['getStateSnapshot', 'subscribeState', 'unsubscribeState', 'createTask', 'clearUndoOffer',
  'getDesktopStatus', 'requestQuit', 'subscribeDesktopEvents', 'openTaskManager', 'captureClipboard', 'getPendingCapture',
  'acknowledgeCapture', 'discardCapture', 'getShortcutSettings'] as const
export const MANAGER_OPERATIONS = ['verifyFoundation', ...QUICK_ADD_OPERATIONS, 'updateTask', 'changeTaskStatus', 'setSubtaskDone',
  'openTaskSource', 'prepareTrashConfirmation', 'moveTaskToTrash', 'restoreTrashItem', 'deleteTrashItem', 'emptyTrash', 'prepareTrashView',
  'undoLastTaskAction', 'exportBackup', 'prepareBackupRestore', 'confirmBackupRestore', 'cancelBackupRestore', 'setStartAtLogin',
  'resolveReminderActivation', 'openQuickAdd', 'setShortcut', 'setShortcutEditing'] as const
export type SurfaceOperation = (typeof MANAGER_OPERATIONS)[number]
export function surfaceAllows(role: SurfaceRole, operation: SurfaceOperation): boolean {
  return role === 'MANAGER' || (QUICK_ADD_OPERATIONS as readonly string[]).includes(operation)
}
