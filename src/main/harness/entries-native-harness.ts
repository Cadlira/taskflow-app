import { readFile } from 'node:fs/promises'
import type { BrowserWindow } from 'electron'
import type { EntryHarnessPorts } from './entries-harness.js'
import type { DesktopLifecycle } from '../desktop/lifecycle.js'
import type { ShortcutAction } from '../../domain/global-shortcuts.js'

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
async function wait(predicate: () => boolean | Promise<boolean>): Promise<boolean> {
  const until = Date.now() + 10000
  while (Date.now() < until) { if (await predicate()) return true; await delay(25) }
  return false
}
function evaluate<T>(window: BrowserWindow, code: string): Promise<T> { return window.webContents.executeJavaScript(code) as Promise<T> }
function hwnd(window: BrowserWindow): string {
  const handle = window.getNativeWindowHandle()
  return (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString()
}
/** Opt-in de main apenas: nenhum hook, canal ou setter de harness entra no preload. */
export async function runNativeEntryHarness(ports: EntryHarnessPorts, lifecycle: DesktopLifecycle, reopen: boolean, stepFile: string): Promise<void> {
  const checks: Record<string, boolean> = {}
  const candidate = ports.window('MANAGER'); if (!candidate) throw new Error('native manager missing')
  const manager: BrowserWindow = candidate
  async function phase(name: string, focus?: BrowserWindow): Promise<void> {
    process.stdout.write(`TASKFLOW_NATIVE_PHASE ${JSON.stringify({ phase: name, ...(focus ? { hwnd: hwnd(focus), pid: process.pid } : {}) })}\n`)
    const until = Date.now() + 30000
    while (Date.now() < until) {
      try { if (await readFile(stepFile, 'utf8') === `next:${name}`) return } catch { /* Runner ainda não confirmou a fase. */ }
      await delay(50)
    }
    throw new Error(`native phase timeout: ${name}`)
  }
  async function set(action: ShortcutAction, key: string): Promise<boolean> {
    lifecycle.open('MANAGER')
    await wait(async () => evaluate(manager, `(async () => (await window.taskflowDesktop.getStateSnapshot({version:3})).status === 'ok')()`))
    return evaluate(manager, `(async () => { const s = await window.taskflowDesktop.getShortcutSettings({version:1});
      if (s.status !== 'ok') return false;
      const r = await window.taskflowDesktop.setShortcut({version:1,action:${JSON.stringify(action)},combination:{modifiers:'CTRL_SHIFT',key:${JSON.stringify(key)}},expectedConfigRevision:s.settings.configRevision});
      return r.status === 'ok' && r.settings.actions.find(a => a.action === ${JSON.stringify(action)})?.observed === 'REGISTERED'; })()`)
  }
  function hide(): void { for (const role of ['MANAGER', 'QUICK_ADD'] as const) ports.window(role)?.close() }
  try {
    checks['trayAvailable'] = lifecycle.trayValid
    if (!lifecycle.trayValid) throw new Error('native campaign requires tray')
    const initial = await ports.shortcuts.settings()
    if (reopen) {
      checks['persistedRebindRegistered'] = initial.status === 'ok' && initial.settings.configRevision === '2' &&
        initial.settings.actions.every(item => item.observed === 'REGISTERED') && initial.settings.actions[0]?.desired?.key === 'F23'
      hide(); await phase('restart-f23')
      checks['restartHotkeyOpensQuick'] = await wait(() => lifecycle.visibilityFor('QUICK_ADD') === 'VISIBLE')
      checks['restartQuickEmpty'] = await evaluate(ports.window('QUICK_ADD')!, `document.querySelector('[name="title"]')?.value === ''`)
    } else {
      checks['realConflict'] = initial.status === 'ok' && initial.settings.actions[0]?.observed === 'UNAVAILABLE' && initial.settings.actions[0]?.reason === 'CONFLICT'
      checks['managerRegistered'] = initial.status === 'ok' && initial.settings.actions[1]?.observed === 'REGISTERED'
      checks['captureInitiallyNone'] = initial.status === 'ok' && initial.settings.actions[2]?.observed === 'NONE'
      await phase('release-conflict')
      checks['explicitReconcile'] = await set('QUICK_ADD', 'F20')
      hide(); await phase('f20-from-other-app')
      checks['quickHotkeyOpensHidden'] = await wait(() => lifecycle.visibilityFor('QUICK_ADD') === 'VISIBLE')
      const quick = ports.window('QUICK_ADD'); if (!quick) throw new Error('native quick missing')
      const quickId = quick.webContents.id
      checks['quickEmptyWithoutCapture'] = await wait(async () => evaluate(quick, `document.querySelector('[name="title"]')?.value === '' && document.querySelector('[name="sourceUrl"]')?.value === ''`))
      await evaluate(quick, `(() => { const i = document.querySelector('[name="description"]'); i.value = 'Draft fictício nativo'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`)
      hide(); await phase('f21-from-other-app')
      checks['managerHotkeyOpensHidden'] = await wait(() => lifecycle.visibilityFor('MANAGER') === 'VISIBLE')
      checks['managerDoesNotOpenQuick'] = lifecycle.visibilityFor('QUICK_ADD') === 'HIDDEN'
      checks['configureCapture'] = await set('CAPTURE_CLIPBOARD', 'F22')
      hide(); await phase('f22-clipboard')
      checks['nativeClipboardTargetsQuick'] = await wait(async () => lifecycle.visibilityFor('QUICK_ADD') === 'VISIBLE' && evaluate(quick, `document.querySelector('.capture-offer')?.textContent.includes('Captura nativa fictícia TFA009')`))
      checks['nativeCapturePreservesDraft'] = await evaluate(quick, `document.querySelector('[name="description"]')?.value === 'Draft fictício nativo'`)
      checks['rebindConfirmed'] = await set('QUICK_ADD', 'F23')
      hide(); await phase('old-f20')
      await delay(300)
      checks['oldBindingInactive'] = lifecycle.visibilityFor('QUICK_ADD') === 'HIDDEN'
      await phase('new-f23')
      checks['newBindingSingleton'] = await wait(() => lifecycle.visibilityFor('QUICK_ADD') === 'VISIBLE') && ports.window('QUICK_ADD')?.webContents.id === quickId
      checks['repeatedOpenKeepsDraft'] = await evaluate(quick, `document.querySelector('[name="description"]')?.value === 'Draft fictício nativo'`)
      lifecycle.open('MANAGER'); manager.focus()
      await wait(() => manager.isFocused())
      const lease = await evaluate<{status: string}>(manager, `window.taskflowDesktop.setShortcutEditing({version:1,editing:true})`)
      checks['focusedEditingLease'] = lease.status === 'ok' && ports.shortcuts.editing
      const beforeLease = ports.nativeActions()['QUICK_ADD'] ?? 0
      await phase('lease-f23', manager)
      await delay(300)
      checks['leaseGatesNativeCallback'] = (ports.nativeActions()['QUICK_ADD'] ?? 0) === beforeLease
      await phase('blur-other-app')
      checks['blurReleasesLease'] = await wait(() => !ports.shortcuts.editing)
      hide(); lifecycle.suspend()
      const beforeSuspend = ports.nativeActions()['QUICK_ADD'] ?? 0
      await phase('suspended-f23'); await delay(300)
      checks['suspendGatesCallback'] = (ports.nativeActions()['QUICK_ADD'] ?? 0) === beforeSuspend
      lifecycle.resume(); checks['resumeReconciled'] = await wait(() => lifecycle.power === 'ACTIVE'); await phase('resumed-f23')
      checks['resumeAllowsFreshGesture'] = await wait(() => lifecycle.visibilityFor('QUICK_ADD') === 'VISIBLE')
      const final = await ports.shortcuts.settings()
      checks['revision2'] = final.status === 'ok' && final.settings.configRevision === '2'
    }
    process.stdout.write(`TASKFLOW_PRODUCT_TEST ${JSON.stringify({scenario:reopen ? 'entries-native-reopen' : 'entries-native',ok:Object.values(checks).every(Boolean),checks,nativeActions:ports.nativeActions()})}\n`)
  } finally { lifecycle.quit() }
}
