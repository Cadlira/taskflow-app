import type { BrowserWindow } from 'electron'
import { MANAGER_OPERATIONS, QUICK_ADD_OPERATIONS } from '../../contracts/surface-catalog.js'
import type { SurfaceRole } from '../../application/capture/capture-ports.js'
import type { DesktopLifecycle } from '../desktop/lifecycle.js'
import type { StorageCoordinator } from '../storage/coordinator.js'
import type { ShortcutController } from '../../application/shortcuts/shortcut-controller.js'

export interface EntryHarnessPorts {
  window(role: SurfaceRole): BrowserWindow | null
  clipboardText(text: string): void
  reads(): number
  globalCapture(): Promise<void>
  rejectManagerOperations(): Promise<boolean>
  sandboxed(role: SurfaceRole): boolean | undefined
  shortcuts: ShortcutController
  nativeActions(): Readonly<Record<string, number>>
  metrics(): { mainHeapBytes: number; renderers: Array<{ pid: number; workingSetKiB: number }> }
}
async function evaluate<T>(window: BrowserWindow, script: string): Promise<T> { return window.webContents.executeJavaScript(script) as Promise<T> }
async function wait(window: BrowserWindow, condition: string): Promise<boolean> {
  return evaluate(window, `(async () => { const end = Date.now() + 10000; while (Date.now() < end) {
    if (${condition}) return true; await new Promise(r => setTimeout(r, 25)); } return false; })()`)
}
const value = (name: string) => `document.querySelector('[name="${name}"]')?.value`
function fill(name: string, text: string): string {
  return `(() => { const input = document.querySelector('[name="${name}"]'); if (!input) return false;
    input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`
}
function click(text: string): string {
  return `(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes(${JSON.stringify(text)})); if (!button || button.disabled) return false; button.click(); return true; })()`
}
/** Perfil test fictício, duas superfícies reais e somente a bridge pública dentro do renderer. */
export async function runEntryHarness(ports: EntryHarnessPorts, lifecycle: DesktopLifecycle, storage: StorageCoordinator): Promise<void> {
  const checks: Record<string, boolean> = {}, info: Record<string, unknown> = {}
  const manager = ports.window('MANAGER'); if (!manager) throw new Error('manager missing')
  const reset = await storage.run(unit => { unit.emptyTrash(); return unit.replaceAllTasks([], unit.baseRevision) })
  if (!reset.ok) throw new Error('fixture reset failed')
  checks['managerCatalog43'] = await evaluate(manager, `JSON.stringify(Object.keys(window.taskflowDesktop).sort()) === ${JSON.stringify(JSON.stringify([...MANAGER_OPERATIONS].sort()))}`)
  await evaluate(manager, `(async () => { await window.taskflowDesktop.clearUndoOffer({ version: 1, contextSequence: 1 });
    return window.taskflowDesktop.createTask({ version: 4, contextSequence: 1, draft: { title: 'Base fictícia para edição' } }); })()`)
  checks['managerSeedVisible'] = await wait(manager, `document.querySelector('[data-task-id] [data-action="edit"]')`)
  await evaluate(manager, `document.querySelector('[data-task-id] [data-action="edit"]').click()`)
  await wait(manager, `document.querySelector('form [name="title"]')`)
  await evaluate(manager, fill('title', 'Edição local conservada'))
  await evaluate(manager, `window.scrollTo(0, 120); document.querySelector('form [name="title"]').focus()`)
  const managerBefore = await evaluate(manager, `JSON.stringify([...document.querySelectorAll('form input, form textarea, form select')].map(e => [e.name, e.value]))`)
  const opened = await evaluate<{ status: string }>(manager, `window.taskflowDesktop.openQuickAdd({ version: 1 })`)
  checks['openedQuick'] = opened.status === 'ok'
  const quick = ports.window('QUICK_ADD'); if (!quick) throw new Error('quick missing')
  const quickId = quick.webContents.id
  checks['quickReady'] = await wait(quick, `document.querySelector('.quick-add form input[name="title"]') && document.querySelector('form button[type="submit"]')?.getAttribute('aria-disabled') !== 'true'`)
  checks['quickCatalog14'] = await evaluate(quick, `JSON.stringify(Object.keys(window.taskflowDesktop).sort()) === ${JSON.stringify(JSON.stringify([...QUICK_ADD_OPERATIONS].sort()))}`)
  checks['quickRoleV2'] = await evaluate(quick, `(async () => { const r = await window.taskflowDesktop.getDesktopStatus({ version: 2 }); return r.status === 'ok' && r.desktop.role === 'QUICK_ADD'; })()`)
  checks['oldDesktopVersionRefused'] = await evaluate(quick, `(async () => { const r = await window.taskflowDesktop.getDesktopStatus({ version: 1 }); return r.status === 'error' && r.code === 'INVALID_REQUEST'; })()`)
  checks['openDoesNotRead'] = ports.reads() === 0 && await evaluate(quick, `${value('title')} === '' && ${value('sourceUrl')} === ''`)
  checks['quickMainEnforcement'] = await ports.rejectManagerOperations()
  await evaluate(quick, fill('title', 'Criação rápida fictícia'))
  await evaluate(quick, `document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`)
  checks['ownConfirmationClears'] = await wait(quick, `${value('title')} === '' && document.body.textContent.includes('Tarefa criada.')`)
  const saved = await storage.read(reader => reader.listTasks().filter(item => item.task.title === 'Criação rápida fictícia').length)
  checks['singleCreatePersisted'] = saved.ok && saved.value === 1
  checks['managerEditorPreserved'] = managerBefore === await evaluate(manager, `JSON.stringify([...document.querySelectorAll('form input, form textarea, form select')].map(e => [e.name, e.value]))`)
  await evaluate(quick, fill('description', 'Rascunho rápido conservado'))
  await evaluate(quick, `document.querySelector('textarea').focus()`)
  if (lifecycle.trayValid) {
    quick.close()
    checks['closeOnlyQuick'] = lifecycle.visibilityFor('QUICK_ADD') === 'HIDDEN' && lifecycle.visibilityFor('MANAGER') === 'VISIBLE'
    checks['otherSessionAlive'] = await evaluate(manager, `(async () => (await window.taskflowDesktop.getStateSnapshot({ version: 3 })).status === 'ok')()`)
    lifecycle.open('QUICK_ADD')
    checks['sameSingletonDraft'] = ports.window('QUICK_ADD')?.webContents.id === quickId && await wait(quick, `${value('description')} === 'Rascunho rápido conservado'`)
  } else info['trayLimitation'] = 'Tray indisponível: política sem tray coberta pela suíte; hide/reopen não exercitado neste cenário.'
  checks['reopenDoesNotRead'] = ports.reads() === 0
  ports.clipboardText('Captura fictícia em formulário dirty')
  await evaluate(quick, click('Capturar texto copiado'))
  checks['dirtyOffer'] = await wait(quick, `document.querySelector('.capture-offer') && ${value('description')} === 'Rascunho rápido conservado'`)
  await evaluate(quick, click('Descartar captura'))
  checks['discardNoSave'] = await wait(quick, `!document.querySelector('.capture-offer')`)
  info['clearState'] = await evaluate(quick, `({ cancelPresent: !!document.querySelector('form .form-actions button[type="button"]'), cancelDisabled: document.querySelector('form .form-actions button[type="button"]')?.getAttribute('aria-disabled'), submitting: document.querySelector('form button[type="submit"]')?.getAttribute('aria-disabled'), blockedMessage: document.body.textContent.includes('A lista está indisponível') })`)
  await evaluate(quick, `document.querySelector('form .form-actions button[type="button"]').click()`)
  checks['explicitClear'] = await wait(quick, `${value('description')} === ''`)
  ports.clipboardText('HTTPS://EXAMPLE.TEST/origem-ficticia?q=1')
  await evaluate(quick, click('Capturar texto copiado'))
  checks['urlWholeManualTitle'] = await wait(quick, `${value('sourceUrl')} === 'https://example.test/origem-ficticia?q=1' && ${value('title')} === ''`)
  checks['captureTitleFocus'] = await evaluate(quick, `document.activeElement === document.querySelector('[name="title"]')`)
  const captureCount = await storage.read(reader => reader.listTasks().length)
  checks['captureDoesNotSave'] = captureCount.ok && captureCount.value === 2
  // Captura global entrega Quick Add; manager em edição conserva cópia e não recebe oferta.
  ports.clipboardText('Captura global fictícia')
  await ports.globalCapture()
  checks['globalTargetsQuick'] = await wait(quick, `document.querySelector('.capture-offer')?.textContent.includes('Captura global fictícia')`)
  checks['globalDoesNotRetargetManager'] = await evaluate(manager, `!document.querySelector('.capture-offer') && ${value('title')} === 'Edição local conservada'`)
  // Dois runtimes locais compartilham dados, não estado de confirmação ou formulário.
  info['windows'] = 2; info['reads'] = ports.reads(); info['trayValid'] = lifecycle.trayValid
  const globalsHidden = await evaluate<boolean>(quick, `['process', 'require', 'Buffer', 'ipcRenderer'].every(key => typeof window[key] === 'undefined') && Object.isFrozen(window.taskflowDesktop)`)
  info['quickPreloadSandbox'] = { sandboxed: ports.sandboxed('QUICK_ADD'), nodeGlobalsHidden: globalsHidden }
  checks['quickIsolated'] = ports.sandboxed('QUICK_ADD') === true && globalsHidden
  const bounds = quick.getBounds()
  quick.setBounds({ ...bounds, width: 360, height: 640 }); quick.webContents.setZoomFactor(2)
  await new Promise<void>(resolve => setTimeout(resolve, 100))
  const compactGeometry = await evaluate<{width: number; scrollWidth: number; canScroll: boolean; fields: number}>(quick,
    `({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      canScroll: document.documentElement.scrollHeight > window.innerHeight,
      fields: document.querySelectorAll('form input, form textarea, form select').length })`)
  info['quick360Zoom200'] = compactGeometry
  checks['quick360Zoom200NoHorizontalOverflow'] = compactGeometry.scrollWidth <= compactGeometry.width + 1 && compactGeometry.canScroll && compactGeometry.fields >= 7
  quick.webContents.setZoomFactor(1); quick.setBounds(bounds)
  quick.webContents.reload()
  checks['reloadDoesNotRecoverDraft'] = await wait(quick, `document.querySelector('.quick-add') && ${value('title')} === '' && ${value('sourceUrl')} === '' && !document.querySelector('.capture-offer')`)
  process.stdout.write(`TASKFLOW_PRODUCT_TEST ${JSON.stringify({ scenario: 'entries', ok: Object.values(checks).every(Boolean), checks, info })}\n`)
  lifecycle.quit()
}
