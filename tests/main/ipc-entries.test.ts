import { describe, expect, it, vi } from 'vitest'
import { DocumentSessions } from '../../src/main/ipc/document-sessions.js'
import { EntryIpcService } from '../../src/main/ipc/entries.js'
import { ClipboardCaptureReader } from '../../src/application/capture/clipboard-reader.js'
import { MemoryCaptureInbox } from '../../src/application/capture/memory-capture-inbox.js'
import { ShortcutController } from '../../src/application/shortcuts/shortcut-controller.js'
import type { CaptureClock } from '../../src/application/capture/capture-ports.js'
import { defaultShortcutActions } from '../../src/domain/global-shortcuts.js'
import { MANAGER_OPERATIONS, QUICK_ADD_OPERATIONS, surfaceAllows } from '../../src/contracts/surface-catalog.js'
import { PACKAGED_ORIGIN, fakeContents, fakeFrame, invocation } from '../support/documents.js'

function setup(role: 'MANAGER' | 'QUICK_ADD' = 'MANAGER') {
  const product = new DocumentSessions(PACKAGED_ORIGIN), control = new DocumentSessions(PACKAGED_ORIGIN)
  const contents = fakeContents(1)
  product.register(contents, role); control.register(contents, role)
  const clock: CaptureClock = { monotonic: () => 0, arm: (delay, callback) => { const id = setTimeout(callback, delay); return () => clearTimeout(id) } }
  const readText = vi.fn(async () => 'conteúdo fictício'), readPreferences = vi.fn(async () => ({ ok: true as const, missing: true,
    preferences: { version: 1 as const, revision: '0', actions: defaultShortcutActions() } }))
  const register = vi.fn(() => false), publish = vi.fn(async () => ({ ok: false as const, code: 'UNAVAILABLE' as const }))
  const shortcuts = new ShortcutController({ registry: { register, unregister: vi.fn(), isRegistered: vi.fn(() => false) },
    preferences: { read: readPreferences, reconcile: readPreferences, publish }, clock, nativeEnabled: false, invoke: vi.fn() })
  const inbox = new MemoryCaptureInbox(clock, { next: () => '00000000-0000-4000-8000-000000000001' })
  const clipboard = new ClipboardCaptureReader({ readText }, clock)
  const open = vi.fn(), reference = vi.fn(), focus = { value: true }
  const ipc = new EntryIpcService({ product, control, inbox, clipboard, shortcuts, open, focused: () => focus.value, reference })
  return { contents, product, control, ipc, readText, readPreferences, register, publish, open, focus, shortcuts, reference }
}
describe('Q11 guards de entradas e Q07 apresentação', () => {
  it('catálogos exatos 35/14 e nenhum acesso exclusivo de manager no Quick Add', () => {
    expect(MANAGER_OPERATIONS).toHaveLength(35)
    expect(new Set(MANAGER_OPERATIONS).size).toBe(35)
    expect(QUICK_ADD_OPERATIONS).toHaveLength(14)
    for (const operation of MANAGER_OPERATIONS) expect(surfaceAllows('QUICK_ADD', operation)).toBe((QUICK_ADD_OPERATIONS as readonly string[]).includes(operation))
  })
  it('sessão/main frame/origem/URL/shape inválidos precedem todo efeito', async () => {
    const h = setup()
    const invalid = [invocation(fakeContents(9)), invocation(h.contents, null), invocation(h.contents, fakeFrame('taskflow://app/'))]
    for (const event of invalid) {
      expect(await h.ipc.capture(event, { version: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
      expect(await h.ipc.settings(event, { version: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
      expect(await h.ipc.open(event, { version: 1 }, 'QUICK_ADD')).toMatchObject({ code: 'UNAUTHORIZED' })
    }
    for (const request of [{ version: 2 }, { version: 1, raw: 'fictício' }, { version: 1, role: 'MANAGER' }]) {
      expect(await h.ipc.capture(invocation(h.contents), request)).toMatchObject({ code: 'INVALID_REQUEST' })
      expect(await h.ipc.settings(invocation(h.contents), request)).toMatchObject({ code: 'INVALID_REQUEST' })
    }
    expect(h.readText).not.toHaveBeenCalled(); expect(h.readPreferences).not.toHaveBeenCalled()
    expect(h.open).not.toHaveBeenCalled(); expect(h.register).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled()
    h.ipc.dispose()
  })
  it('Quick Add recusa setter/openQuickAdd/lease; destino local é próprio role', async () => {
    const h = setup('QUICK_ADD'), event = invocation(h.contents)
    expect(await h.ipc.setShortcut(event, { version: 1, action: 'QUICK_ADD', combination: null, expectedConfigRevision: '0' })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await h.ipc.editing(event, { version: 1, editing: true })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await h.ipc.open(event, { version: 1 }, 'QUICK_ADD')).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(h.readPreferences).not.toHaveBeenCalled(); expect(h.open).not.toHaveBeenCalled()
    expect((await h.ipc.capture(event, { version: 1 })).status).toBe('ok')
    expect(h.reference).toHaveBeenCalledWith('QUICK_ADD', expect.objectContaining({ sequence: '1' }))
    h.ipc.dispose()
  })
  it('apresentação/aplicação/recibos por documento; hidden não recebe conteúdo e reabertura conserva held', async () => {
    const h = setup(), event = invocation(h.contents)
    const captured = await h.ipc.capture(event, { version: 1 })
    if (captured.status !== 'ok') throw new Error('fixture inválida')
    expect(await h.ipc.pending(event, { version: 1 })).toMatchObject({ inbox: { state: 'staged' } })
    const presented = { version: 1, ...captured.reference, disposition: 'presented' }
    expect((await h.ipc.acknowledge(event, presented)).status).toBe('ok')
    h.product.unregister(h.contents.id)
    expect(await h.ipc.pending(event, { version: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
    h.product.register(h.contents, 'MANAGER')
    expect(await h.ipc.pending(event, { version: 1 })).toMatchObject({ inbox: { state: 'held' } })
    const applied = { ...presented, disposition: 'applied' }
    const receipt = await h.ipc.acknowledge(event, applied)
    expect(await h.ipc.acknowledge(event, applied)).toEqual(receipt)
    expect(await h.ipc.pending(event, { version: 1 })).toMatchObject({ inbox: { state: 'none', receipt: { disposition: 'applied' } } })
    h.control.invalidate(h.contents.id)
    expect(await h.ipc.pending(event, { version: 1 })).toMatchObject({ inbox: { state: 'none' } })
    h.ipc.dispose()
  })
  it('leitura terminada após hide não publica captura na sessão nova', async () => {
    const h = setup()
    let finish: (value: string) => void = () => undefined
    h.readText.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.ipc.capture(invocation(h.contents), { version: 1 })
    h.product.unregister(h.contents.id); h.product.register(h.contents, 'MANAGER')
    finish('tardio fictício')
    expect(await pending).toMatchObject({ code: 'SESSION_CLOSED' })
    expect(h.reference).not.toHaveBeenCalled()
    expect(await h.ipc.pending(invocation(h.contents), { version: 1 })).toMatchObject({ inbox: { state: 'none' } })
    h.ipc.dispose()
  })
  it('lease exige manager focado; invalidação do controle libera a edição', async () => {
    const h = setup(), event = invocation(h.contents)
    h.focus.value = false
    expect(await h.ipc.editing(event, { version: 1, editing: true })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(h.shortcuts.editing).toBe(false)
    h.focus.value = true
    expect((await h.ipc.editing(event, { version: 1, editing: true })).status).toBe('ok')
    expect(h.shortcuts.editing).toBe(true)
    h.control.invalidate(h.contents.id)
    expect(h.shortcuts.editing).toBe(false)
    h.ipc.dispose()
  })
})
