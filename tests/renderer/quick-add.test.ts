import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import QuickAdd from '../../src/renderer/src/components/capture/QuickAdd.vue'
import type { QuickAddDesktopApi } from '../../src/contracts/desktop-api.js'
import type { StateSnapshot, StateUpdate } from '../../src/contracts/state.js'
import type { DesktopEvent } from '../../src/contracts/desktop.js'
import { MemoryCaptureInbox } from '../../src/application/capture/memory-capture-inbox.js'
import { mapClipboardText } from '../../src/domain/clipboard-capture.js'
import { TaskCommandTransportError } from '../../src/application/tasks/task-client.js'
import { buildTask } from '../support/task-fixtures.js'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })
async function setup() {
  setActivePinia(createPinia())
  let snapshot: StateSnapshot = { revision: '0', undoEpoch: 0, tasks: [], trash: [] }
  let stateListener: ((update: StateUpdate) => void) | undefined
  const desktopListeners = new Set<(event: DesktopEvent) => void>()
  let counter = 0, clipboardText = ''
  const owner = { role: 'QUICK_ADD' as const, documentId: 'doc', sessionId: 'session' }
  const inbox = new MemoryCaptureInbox({ monotonic: () => 0 }, { next: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` })
  const api = {
    subscribeState: vi.fn<QuickAddDesktopApi['subscribeState']>(async (_request, listener) => { stateListener = listener; return { version: 3, status: 'ok', subscriptionId: 'A'.repeat(32), snapshot } }),
    unsubscribeState: vi.fn<QuickAddDesktopApi['unsubscribeState']>(async () => ({ version: 3, status: 'ok' })),
    getStateSnapshot: vi.fn<QuickAddDesktopApi['getStateSnapshot']>(async () => ({ version: 3, status: 'ok', snapshot })),
    clearUndoOffer: vi.fn<QuickAddDesktopApi['clearUndoOffer']>(async request => ({ version: 1, status: 'ok', contextSequence: request.contextSequence })),
    createTask: vi.fn<QuickAddDesktopApi['createTask']>(), requestQuit: vi.fn<QuickAddDesktopApi['requestQuit']>(), getDesktopStatus: vi.fn<QuickAddDesktopApi['getDesktopStatus']>(),
    subscribeDesktopEvents: vi.fn<QuickAddDesktopApi['subscribeDesktopEvents']>(async (_request, listener) => { desktopListeners.add(listener); return { dispose: () => { desktopListeners.delete(listener) } } }),
    openTaskManager: vi.fn<QuickAddDesktopApi['openTaskManager']>(async () => ({ version: 1, status: 'ok' })),
    captureClipboard: vi.fn<QuickAddDesktopApi['captureClipboard']>(async () => {
      const mapped = mapClipboardText(clipboardText); if (!mapped.ok) return { version: 1, status: 'error', code: mapped.code }
      const capture = inbox.stage('QUICK_ADD', mapped.draft)!
      return { version: 1, status: 'ok', reference: { id: capture.id, sequence: capture.sequence }, replaced: capture.replaced }
    }),
    getPendingCapture: vi.fn<QuickAddDesktopApi['getPendingCapture']>(async () => ({ version: 1, status: 'ok', inbox: inbox.get(owner) })),
    acknowledgeCapture: vi.fn<QuickAddDesktopApi['acknowledgeCapture']>(async request => {
      const ack = inbox.acknowledge(owner, request, request.disposition)
      return ack.ok ? { version: 1, status: 'ok', receipt: ack.receipt } : { version: 1, status: 'error', code: ack.code }
    }),
    discardCapture: vi.fn<QuickAddDesktopApi['discardCapture']>(async request => { const ack = inbox.discard(owner, request); return ack.ok ? { version: 1, status: 'ok', receipt: ack.receipt } : { version: 1, status: 'error', code: ack.code } }),
    getShortcutSettings: vi.fn<QuickAddDesktopApi['getShortcutSettings']>(),
  } satisfies QuickAddDesktopApi
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api })
  wrapper = mount(QuickAdd, { attachTo: document.body }); await flushPromises()
  return { view: wrapper, api, clipboard: (text: string) => { clipboardText = text },
    emit: (next: StateSnapshot) => { snapshot = next; stateListener?.({ type: 'snapshot', snapshot: next }) },
    control: (event: DesktopEvent) => { for (const listener of desktopListeners) listener(event) },
  }
}
describe('Q04/Q12 Quick Add com facade14', () => {
  it('abre vazio sem leitura, campos básicos e defaults; nenhum editor avançado', async () => {
    const h = await setup()
    expect(h.api.captureClipboard).not.toHaveBeenCalled()
    expect((h.view.get('input[name="title"]').element as HTMLInputElement).value).toBe('')
    expect(h.view.find('select[name="status"]').exists()).toBe(false)
    expect(h.view.find('input[name="tags"]').exists()).toBe(false)
    expect(h.view.text()).not.toContain('Adicionar lembrete'); expect(h.view.text()).not.toContain('Adicionar subtarefa')
    expect(document.activeElement).toBe(h.view.get('input[name="title"]').element)
  })
  it('ack próprio espera snapshot antes de limpar e foco volta ao título', async () => {
    const h = await setup(); await h.view.get('input[name="title"]').setValue('Rascunho fictício')
    h.api.createTask.mockResolvedValue({ version: 4, status: 'ok', outcome: 'APPLIED', taskId: 'task1', revision: '1', contentRevision: '1', editRevision: '1' })
    await h.view.get('form').trigger('submit'); await flushPromises()
    expect((h.view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Rascunho fictício')
    h.emit({ revision: '1', undoEpoch: 0, tasks: [{ task: buildTask({ id: 'task1', title: 'Rascunho fictício' }), contentRevision: '1', editRevision: '1' }], trash: [] }); await flushPromises()
    expect((h.view.get('input[name="title"]').element as HTMLInputElement).value).toBe('')
    expect(document.activeElement).toBe(h.view.get('input[name="title"]').element)
    expect(h.api.createTask.mock.calls[0]?.[0]).toMatchObject({ version: 4, draft: { status: 'TODO', priority: 'MEDIUM' } })
  })
  it('erro por campo conserva inputs e foca título obrigatório', async () => {
    const h = await setup(); await h.view.get('textarea[name="description"]').setValue('Descrição conservada')
    h.api.createTask.mockResolvedValue({ version: 4, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'REQUIRED' } })
    await h.view.get('form').trigger('submit'); await flushPromises()
    expect((h.view.get('textarea').element as HTMLTextAreaElement).value).toBe('Descrição conservada')
    expect(h.view.get('input[name="title"]').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(h.view.get('input[name="title"]').element)
  })
  it('origem isolada inteira mantém título vazio/foco e não salva nem abre draft', async () => {
    const h = await setup(); h.clipboard('HTTPS://EXAMPLE.TEST/caminho?q=1')
    await h.view.get('.capture-panel button').trigger('click'); await flushPromises()
    expect((h.view.get('input[name="sourceUrl"]').element as HTMLInputElement).value).toBe('https://example.test/caminho?q=1')
    expect((h.view.get('input[name="title"]').element as HTMLInputElement).value).toBe('')
    expect(h.api.createTask).not.toHaveBeenCalled(); expect(document.activeElement).toBe(h.view.get('input[name="title"]').element)
  })
  it('descrição dirty recebe oferta, não sobrescreve; Descarta não salva', async () => {
    const h = await setup(); await h.view.get('textarea').setValue('Meu texto'); h.clipboard('Captura nova')
    await h.view.get('.capture-panel button').trigger('click'); await flushPromises()
    expect((h.view.get('textarea').element as HTMLTextAreaElement).value).toBe('Meu texto')
    const buttons = h.view.findAll('.capture-offer button'); expect(buttons[0]?.attributes('disabled')).toBeDefined()
    await buttons[1]?.trigger('click'); await flushPromises(); expect(h.view.find('.capture-offer').exists()).toBe(false)
    expect(h.api.createTask).not.toHaveBeenCalled()
  })
  it('resposta perdida/hide conserva draft; consulta não repete create', async () => {
    const h = await setup(); await h.view.get('input[name="title"]').setValue('Resultado incerto')
    h.api.createTask.mockRejectedValueOnce(new TaskCommandTransportError())
    await h.view.get('form').trigger('submit'); await flushPromises()
    h.control({ version: 2, role: 'QUICK_ADD', sequence: 2, kind: 'surface-suspended' }); await flushPromises()
    h.control({ version: 2, role: 'QUICK_ADD', sequence: 3, kind: 'surface-active' }); await flushPromises()
    await h.view.get('form').trigger('submit'); await flushPromises()
    expect(h.api.createTask).toHaveBeenCalledTimes(1)
    expect((h.view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Resultado incerto')
  })
  it('IME e textarea Enter não criam; Escape fecha sem descartar, falha de abrir conserva', async () => {
    const h = await setup(); await h.view.get('input[name="title"]').setValue('Texto')
    await h.view.get('input[name="title"]').trigger('compositionstart'); await h.view.get('form').trigger('submit')
    expect(h.api.createTask).not.toHaveBeenCalled(); await h.view.get('input[name="title"]').trigger('compositionend')
    await h.view.get('textarea').trigger('keydown', { key: 'Enter' }); expect(h.api.createTask).not.toHaveBeenCalled()
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    await h.view.get('main').trigger('keydown', { key: 'Escape' }); expect(close).toHaveBeenCalledTimes(1)
    h.api.openTaskManager.mockRejectedValueOnce(new Error('failed')); await h.view.get('header button').trigger('click'); await flushPromises()
    expect((h.view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Texto')
  })
})
