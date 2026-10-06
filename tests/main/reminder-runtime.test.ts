// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReminderService } from '../../src/application/reminders/reminder-service.js'
import type { ReminderServicePorts } from '../../src/application/reminders/reminder-ports.js'
import { createReminderRuntime } from '../../src/main/reminders/runtime.js'
import { projectTaskReminders, reminderTag } from '../../src/main/reminders/projection.js'
import { buildTask } from '../support/task-fixtures.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)
const BASE = Date.parse('2026-10-06T12:00:00Z')
function timers() {
  let clock = BASE
  let next = 0
  let peak = 0
  const entries = new Map<number, { delay: number; callback: () => void }>()
  return {
    get peak() { return peak },
    get size() { return entries.size },
    get delay() { return entries.values().next().value?.delay },
    now: () => new Date(clock), monotonic: () => clock - BASE,
    advance: (ms: number) => { clock += ms },
    arm: (delay: number, callback: () => void) => {
      const id = next++; entries.set(id, { delay, callback }); peak = Math.max(peak, entries.size)
      return () => { entries.delete(id) }
    },
    yield: (): Promise<void> => new Promise((resolve) => setImmediate(resolve)),
    step: async (service: ReminderService) => {
      const [id, entry] = entries.entries().next().value ?? []
      if (id === undefined || entry === undefined) throw new Error('agenda missing')
      entries.delete(id); entry.callback()
      for (let i = 0; service.busy && i < 10000; i++) await new Promise((resolve) => setImmediate(resolve))
      expect(service.busy).toBe(false)
    },
  }
}
function fixture(id: string, delta: number) {
  return buildTask({ id, dueAt: new Date(BASE + delta).toISOString(),
    reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }] })
}

describe('M02/M03/M06/M12 agenda no coordenador real', () => {
  it('startup e resume recuperam graça inclusiva, expiradas e clock recuado; agenda única', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTasks([
      fixture('eligible', 0), fixture('border', -300000), fixture('expired', -300001), fixture('future', 1),
    ])))
    const time = timers()
    const submit = vi.fn((_candidate, completed: () => void) => { completed(); return () => undefined })
    const runtime = createReminderRuntime({ storage, active: () => true,
      now: time.now, monotonic: time.monotonic, agenda: time, submit, statusChanged: vi.fn(), effect: vi.fn() })
    expect(await runtime.service.recover()).toBe(true)
    for (let i = 0; i < 3; i++) await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(2)
    expect(runtime.service.occurrences).toBe(1)
    expect(time.peak).toBe(1)
    runtime.service.suspend()
    time.advance(300001)
    runtime.service.resume()
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(3)
    runtime.dispose()
    expect(time.size).toBe(0)
  })
  it('16 reservas precedem claims; callback/deadline libera e capacidade cheia não consome', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTasks(Array.from({ length: 17 }, (_, i) => fixture(`t${i}`, 0)))))
    const time = timers()
    const completions: Array<() => void> = []
    const runtime = createReminderRuntime({ storage, active: () => true, now: time.now,
      monotonic: time.monotonic, agenda: time,
      submit: (_candidate, completed) => { completions.push(completed); return () => undefined },
      statusChanged: vi.fn(), effect: vi.fn() })
    await runtime.service.recover()
    for (let i = 0; i < 17; i++) await time.step(runtime.service)
    expect(runtime.service.pendingSubmissions).toBe(16)
    expect(runtime.service.occurrences).toBe(1)
    expect(completions).toHaveLength(16)
    expect(time.delay).toBe(1000)
    completions[0]?.()
    await time.step(runtime.service)
    expect(completions).toHaveLength(17)
    time.advance(10000)
    await time.step(runtime.service)
    expect(runtime.service.pendingSubmissions).toBe(0)
    expect(completions).toHaveLength(17)
    runtime.dispose()
  })
  it('dirty IDs e remoção corrigem projeção sem scan total; fallback corrige perda', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTasks([fixture('a', 120000), fixture('b', 180000)])))
    const time = timers()
    const runtime = createReminderRuntime({ storage, active: () => true, now: time.now,
      monotonic: time.monotonic, agenda: time, submit: () => () => undefined,
      statusChanged: vi.fn(), effect: vi.fn() })
    await runtime.service.recover()
    const units = storage.metrics.units
    expectOk(await storage.run((unit) => unit.deleteTask('a')))
    await new Promise((resolve) => setImmediate(resolve))
    await time.step(runtime.service)
    expect(runtime.service.occurrences).toBe(1)
    expect(storage.metrics.units - units).toBe(2) // delete + leitura somente dos IDs afetados
    runtime.service.reset() // backup UNCHANGED sem evento SQL
    expect(await runtime.service.recover()).toBe(true)
    expect(runtime.service.occurrences).toBe(1)
    time.advance(60000)
    await time.step(runtime.service)
    expect(runtime.service.status).toBe('READY')
    runtime.dispose()
  })
  it('RESOURCE_LIMIT não corta dados; timeout distante não vira 1ms', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTasks([fixture('long', 2147483648), fixture('other', 2147483649)])))
    const time = timers()
    const options = { storage, active: () => true, now: time.now, monotonic: time.monotonic,
      agenda: time, submit: () => () => undefined, statusChanged: vi.fn(), effect: vi.fn() }
    const limited = createReminderRuntime({ ...options, memoryLimit: 512 })
    expect(await limited.service.recover()).toBe(false)
    expect(limited.service.status).toBe('RESOURCE_LIMIT')
    expect(time.delay).toBe(60000)
    limited.dispose()
    const runtime = createReminderRuntime(options)
    expect(await runtime.service.recover()).toBe(true)
    expect(time.delay).toBe(60000)
    expect(expectOk(await storage.read((reader) => reader.listTasks().length)).value).toBe(2)
    runtime.dispose()
  })
  it('três resets durante rebuild retornam BUSY sem índice parcial nem loop', async () => {
    const time = timers()
    const page = vi.fn(async () => {
      service.reset()
      return { ok: true as const, value: { tasks: [], afterId: undefined, complete: true }, revision: 0n, committed: false }
    })
    const ports: ReminderServicePorts = {
      ...time, ready: () => true, page,
      tasks: async () => ({ ok: true, value: [], revision: 0n, committed: false }),
      process: async () => ({ ok: true, value: { status: 'INAPPLICABLE' }, revision: 0n, committed: false }),
      submit: () => () => undefined, statusChanged: vi.fn(),
    }
    const service: ReminderService = new ReminderService(ports)
    expect(await service.recover()).toBe(false)
    expect(page).toHaveBeenCalledTimes(3)
    expect(service.status).toBe('BUSY')
    expect(time.delay).toBe(60000)
    expect(service.resolve(reminderTag({ taskId: 'a', reminderId: 'r', triggerISO: new Date(BASE).toISOString() }))).toBeUndefined()
    service.stop()
  })
  it('journal relê tarefa alterada durante montagem antes de publicar índice', async () => {
    const time = timers()
    let changed = false
    const oldTask = fixture('a', 120000)
    const newTask = fixture('a', 180000)
    const page = vi.fn(async () => {
      if (!changed) { changed = true; service.dirty(['a']) }
      return { ok: true as const, value: { tasks: [{ id: 'a', reminders: projectTaskReminders(oldTask, time.now()) }],
        afterId: 'a', complete: true }, revision: 1n, committed: false }
    })
    const readDirty = vi.fn(async (ids: readonly string[]) => ({ ok: true as const,
      value: ids.map((id) => ({ id, reminders: projectTaskReminders(newTask, time.now()) })), revision: 2n, committed: false }))
    const service: ReminderService = new ReminderService({ ...time, ready: () => true, page, tasks: readDirty,
      process: async () => ({ ok: true, value: { status: 'INAPPLICABLE' }, revision: 0n, committed: false }),
      submit: () => () => undefined, statusChanged: vi.fn() })
    expect(await service.recover()).toBe(true)
    expect(readDirty).toHaveBeenCalledWith(['a'])
    expect(time.delay).toBe(60000)
    expect(service.occurrences).toBe(1)
    expect(service.charge).toBe(projectTaskReminders(newTask, time.now()).reduce((charge, key) =>
      charge + 256 + 2 * (key.taskId.length + key.reminderId.length + key.triggerISO.length + key.tag.length), 0))
    service.stop()
  })
  it('rollback não publica IDs sujos; claim não reconstrói a coleção', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTask(fixture('a', 0))))
    const changed = vi.fn()
    const off = storage.onTasksChanged(changed)
    await storage.run((unit) => { unit.deleteTask('a'); throw new Error('rollback fictício') })
    expect(changed).not.toHaveBeenCalled()
    const time = timers()
    const runtime = createReminderRuntime({ storage, active: () => true, now: time.now, monotonic: time.monotonic,
      agenda: time, submit: (_candidate, completed) => { completed(); return () => undefined },
      statusChanged: vi.fn(), effect: vi.fn() })
    await runtime.service.recover()
    const units = storage.metrics.units
    await time.step(runtime.service)
    expect(storage.metrics.units - units).toBe(1)
    expect(changed).toHaveBeenCalledWith(['a'], true)
    expect(runtime.service.occurrences).toBe(0)
    runtime.dispose(); off()
  })
})
