import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopIpcService } from '../../src/main/ipc/desktop.js'
import { DocumentSessions } from '../../src/main/ipc/document-sessions.js'
import { createReminderRuntime } from '../../src/main/reminders/runtime.js'
import { reminderTag } from '../../src/main/reminders/projection.js'
import { PACKAGED_ORIGIN, fakeContents, fakeFrame, invocation } from '../support/documents.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'
import { buildTask } from '../support/task-fixtures.js'
import { createDesktopClient } from '../../src/application/reminders/desktop-client.js'
import { parseActivationResult, parseDesktopEvent, parseDesktopStatusResult, type DesktopStatus } from '../../src/contracts/desktop.js'

const disposers: Array<() => void> = []
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); cleanupStorage() })
function fixture() {
  const control = new DocumentSessions(PACKAGED_ORIGIN), product = new DocumentSessions(PACKAGED_ORIGIN)
  const contents = fakeContents(1); control.register(contents); product.register(contents)
  const storage = openCoordinator(createProductFile())
  const runtime = createReminderRuntime({ storage, active: () => true, submit: (_candidate, done) => { done(); return () => undefined }, statusChanged: () => undefined, effect: () => undefined })
  const status: DesktopStatus = { surfaceSequence: 1, visibility: 'VISIBLE', recovery: 'ACTIVE', reminders: 'READY', reminderCapability: 'FAKE', startup: 'UNAVAILABLE' }
  const startup = vi.fn(async () => ({ version: 1 as const, status: 'ok' as const, startup: 'ON' as const }))
  const quit = vi.fn()
  const service = new DesktopIpcService({ control, product, storage, reminders: () => runtime.service, status: () => status, startup, quit })
  disposers.push(() => { service.dispose(); runtime.dispose(); storage.shutdown() })
  return { service, storage, runtime, contents, event: invocation(contents), product, control, status, startup, quit }
}
describe('M07/M09/M11 controle/ativação', () => {
  it('conserva somente a última ativação fria e entrega depois da inscrição com estado ativo primeiro', async () => {
    const f = fixture()
    f.service.locate('a'.repeat(64))
    f.service.locate('b'.repeat(64))
    expect(f.contents.mainFrame.sent).toHaveLength(0)
    await f.service.subscribe(f.event, { version: 1 })
    expect(f.contents.mainFrame.sent.map(item => parseDesktopEvent(item.payload))).toEqual([
      { version: 1, sequence: 4, kind: 'surface-active' },
      { version: 1, sequence: 5, kind: 'locate-reminder', tag: 'b'.repeat(64) },
    ])
    await f.service.subscribe(f.event, { version: 1 })
    expect(f.contents.mainFrame.sent).toHaveLength(2)
  })
  it('oculto perde produto e setter; controle entrega suspensão/ativação sem reativar sessão', async () => {
    const f = fixture()
    expect(await f.service.subscribe(f.event, { version: 1 })).toMatchObject({ status: 'ok' })
    await f.service.subscribe(f.event, { version: 1 }); expect(f.service.subscribers).toBe(1)
    const old = f.product.authorize(f.event)
    f.product.unregister(1); f.status.visibility = 'HIDDEN'; f.service.emit('surface-suspended')
    expect(old === null ? false : f.product.isCurrent(old)).toBe(false)
    expect(parseDesktopEvent(f.contents.mainFrame.sent.at(-1)?.payload)?.kind).toBe('surface-suspended')
    expect(await f.service.startup(f.event, { version: 1, desired: true })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(f.startup).not.toHaveBeenCalled()
    expect(parseDesktopStatusResult(await f.service.status(f.event, { version: 1 }))?.status).toBe('ok')
    f.product.register(f.contents); f.status.visibility = 'VISIBLE'; f.service.emit('surface-active')
    expect(old === null ? false : f.product.isCurrent(old)).toBe(false)
    expect(f.product.authorize(f.event)?.generation).not.toBe(old?.generation)
  })
  it('frame alheio/blob/about:blank e extras são recusados; reload limpa inscrição, limite oito', async () => {
    const f = fixture()
    expect(await f.service.subscribe(invocation(f.contents, fakeFrame()), { version: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
    for (const url of ['about:blank', 'blob:taskflow://app/x', 'taskflow://app/?q=x']) {
      f.contents.mainFrame.url = url
      expect(await f.service.subscribe(f.event, { version: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
    }
    f.contents.mainFrame.url = 'taskflow://app/'
    expect(await f.service.subscribe(f.event, { version: 1, channel: 'x' })).toMatchObject({ code: 'INVALID_REQUEST' })
    await f.service.subscribe(f.event, { version: 1 }); f.control.invalidate(1)
    expect(f.service.subscribers).toBe(0)
    for (let id = 2; id <= 8; id++) expect(f.control.register(fakeContents(id))).toBe(true)
    expect(f.control.register(fakeContents(9))).toBe(false)
  })
  it('resolve tupla processada atual por ordinal SQL, aceita IDs Unicode longos e recusa removida/alterada', async () => {
    const f = fixture()
    const triggerISO = '2026-10-06T12:00:00.000Z'
    const id = `á😀-${'x'.repeat(1500)}`
    const tasks = ['A', 'a', 'z', '😀', id].map(taskId => buildTask({ id: taskId, dueAt: triggerISO, reminders: [{ id: 'r|á😀', type: 'OFFSET' as const, offsetMinutes: 0, processedFor: triggerISO }] }))
    expectOk(await f.storage.run(unit => unit.saveTasks(tasks))); expect(await f.runtime.service.recover()).toBe(true)
    const result = await f.service.resolve(f.event, { version: 1, tag: reminderTag({ taskId: id, reminderId: 'r|á😀', triggerISO }) })
    expect(parseActivationResult(result)).toEqual(result)
    const ordered = expectOk(await f.storage.read(reader => [...reader.iterateTasks(undefined)].map(row => row.task.id)))
    expect(result).toEqual({ version: 1, status: 'ok', revision: ordered.revision.toString(), taskOrdinal: ordered.value.indexOf(id) })
    expectOk(await f.storage.run(unit => unit.deleteTask(id)))
    expect(await f.service.resolve(f.event, { version: 1, tag: reminderTag({ taskId: id, reminderId: 'r|á😀', triggerISO }) })).toMatchObject({ code: 'NOT_AVAILABLE' })
    expect(await f.service.resolve(f.event, { version: 1, tag: 'bad' })).toMatchObject({ code: 'INVALID_REQUEST' })
  })
  it('preload de controle instala listener antes do handshake, coalesce sequência e disposer idempotente', async () => {
    const events: string[] = []; let receive: ((payload: unknown) => void) | undefined
    let reply: ((value: unknown) => void) | undefined
    const desktop: DesktopStatus = { surfaceSequence: 1, visibility: 'VISIBLE', recovery: 'ACTIVE', reminders: 'READY', reminderCapability: 'FAKE', startup: 'OFF' }
    const invoke = vi.fn((channel: string): Promise<unknown> => {
      events.push(channel)
      return channel === 'desktop:subscribe:v1' ? new Promise(resolve => { reply = resolve }) : Promise.resolve({ version: 1, status: 'ok' })
    })
    const client = createDesktopClient({ invoke, on: (_channel, fn) => { events.push('listener'); receive = fn; return () => undefined } }, () => undefined)
    const listener = vi.fn()
    const pending = client.subscribeDesktopEvents({ version: 1 }, listener)
    receive?.({ version: 1, sequence: 2, kind: 'surface-suspended' })
    receive?.({ version: 1, sequence: 2, kind: 'surface-suspended' })
    reply?.({ version: 1, status: 'ok', desktop })
    const subscription = await pending
    expect(events[0]).toBe('listener'); expect(listener).toHaveBeenCalledOnce()
    subscription.dispose(); subscription.dispose()
    expect(invoke.mock.calls.filter(call => call[0] === 'desktop:unsubscribe:v1')).toHaveLength(1)
  })
})
