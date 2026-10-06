// @vitest-environment node
// Matriz SQLite real: mutações/séries/lixeira/undo/backup versus agenda e claim de lembretes.
// O serviço é o de produção (ReminderService sobre o coordenador), com agenda/relógio falsos.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReminderService } from '../../src/application/reminders/reminder-service.js'
import type { ReminderSubmissionCandidate } from '../../src/application/storage/unit-of-work.js'
import { changeTaskStatusInUnit, createTaskInUnit, updateTaskInUnit } from '../../src/application/tasks/task-commands.js'
import { moveTaskToTrashInUnit, restoreTrashItemInUnit, undoLastTaskActionInUnit } from '../../src/application/tasks/trash-commands.js'
import { createReminderRuntime, resetForBackup } from '../../src/main/reminders/runtime.js'
import { REMINDER_OWNER } from '../../src/main/reminders/processor.js'
import { buildTask } from '../support/task-fixtures.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)
const BASE = Date.parse('2026-10-06T12:00:00Z')
function timers() {
  let clock = BASE
  let next = 0
  const entries = new Map<number, { delay: number; callback: () => void }>()
  return {
    get delay() { return entries.values().next().value?.delay },
    now: () => new Date(clock), monotonic: () => clock - BASE,
    advance: (ms: number) => { clock += ms },
    arm: (delay: number, callback: () => void) => {
      const id = next++; entries.set(id, { delay, callback })
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
async function settle(): Promise<void> { await new Promise((resolve) => setImmediate(resolve)) }
function fixture(id: string, delta: number, title = id) {
  return buildTask({ id, title, dueAt: new Date(BASE + delta).toISOString(),
    reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }] })
}
function runtimeOf(storage: ReturnType<typeof openCoordinator>, time: ReturnType<typeof timers>, submit: SubmitMock) {
  return createReminderRuntime({ storage, active: () => true, now: time.now, monotonic: time.monotonic,
    agenda: time, submit, statusChanged: vi.fn(), effect: vi.fn() })
}
function accepting() {
  return vi.fn((_candidate: ReminderSubmissionCandidate, completed: () => void) => { completed(); return () => undefined })
}
type SubmitMock = ReturnType<typeof accepting>
function ids(...values: string[]): () => string {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 'extra'
}

describe('M03/M05/M06 mutações versus agenda/claim em SQLite real', () => {
  it('mutação efetiva liquida vencidos ≤ now sem aviso e mantém o futuro agendado', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTasks([
      fixture('a', -60_000, 'A vencida'), fixture('b', 60_000, 'B futura'),
    ])))
    const time = timers()
    const submit = accepting()
    const runtime = runtimeOf(storage, time, submit)
    expect(await runtime.service.recover()).toBe(true)
    expect(runtime.service.occurrences).toBe(2)

    const stored = expectOk(await storage.read((reader) => reader.getTask('a'))).value
    if (stored === undefined) throw new Error('missing')
    const updated = expectOk(await storage.run((unit) => updateTaskInUnit(unit, {
      taskId: 'a', expectedEditRevision: stored.editRevision, patch: { title: 'A editada' }, now: time.now(), generateId: () => 'x',
    })))
    expect(updated.value.status).toBe('UPDATED')

    await settle()
    await time.step(runtime.service)
    expect(submit).not.toHaveBeenCalled()
    const after = expectOk(await storage.read((reader) => reader.getTask('a'))).value
    expect(after?.task.reminders[0]?.processedFor).toBe(new Date(BASE - 60_000).toISOString())

    time.advance(60_000)
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ taskId: 'b', title: 'B futura' })
    runtime.dispose()
  })

  it('reset de backup não repete claim consumido e coleção vazia não deixa timer curto', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTask(fixture('a', -30_000))))
    const time = timers()
    const submit = accepting()
    const runtime = runtimeOf(storage, time, submit)
    expect(await runtime.service.recover()).toBe(true)
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(1)

    // APPLIED/UNCHANGED: barreira explícita recompõe a projeção sobre o arquivo autoritativo.
    runtime.service.reset()
    expect(await runtime.service.recover()).toBe(true)
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(runtime.service.occurrences).toBe(0)

    // Coleção vazia: nenhum timer órfão de 1 ms; agenda fica no fallback de 60 s.
    expectOk(await storage.run((unit) => unit.deleteTask('a')))
    await settle()
    await time.step(runtime.service)
    expect(runtime.service.occurrences).toBe(0)
    expect(runtime.service.status).toBe('READY')
    expect(time.delay).toBe(60_000)

    // Nova tarefa futura volta a encurtar a agenda após a invalidação.
    expectOk(await storage.run((unit) => unit.saveTask(fixture('b', 5_000))))
    await settle()
    await time.step(runtime.service)
    expect(time.delay).toBe(5_000)
    time.advance(5_000)
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1]?.[0]).toMatchObject({ taskId: 'b' })
    runtime.dispose()
  })

  it('mover para a lixeira interrompe o claim; restore liquida o vencido sem aviso retroativo', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTask(fixture('trash', -1_000))))
    const time = timers()
    const submit = accepting()
    const runtime = runtimeOf(storage, time, submit)
    expect(await runtime.service.recover()).toBe(true)

    const stored = expectOk(await storage.read((reader) => reader.getTask('trash'))).value
    if (stored === undefined) throw new Error('missing')
    const moved = expectOk(await storage.run((unit) => moveTaskToTrashInUnit(unit, {
      taskId: 'trash', expectedContentRevision: stored.contentRevision, now: time.now(),
    })))
    expect(moved.value.status).toBe('MOVED')
    if (moved.value.status !== 'MOVED') throw new Error('unexpected')
    const entry = moved.value.entry
    await settle()
    await time.step(runtime.service)
    expect(submit).not.toHaveBeenCalled()
    expect(runtime.service.occurrences).toBe(0)

    // Restore na janela de graça: liquidação pura marca o vencido e não reproduz o alarme.
    const restored = expectOk(await storage.run((unit) => restoreTrashItemInUnit(unit, {
      entry, now: time.now(),
    })))
    expect(restored.value.status).toBe('RESTORED')
    if (restored.value.status !== 'RESTORED') throw new Error('unexpected')
    expect(restored.value.task.reminders[0]?.processedFor).toBe(new Date(BASE - 1_000).toISOString())
    await settle()
    await time.step(runtime.service)
    expect(submit).not.toHaveBeenCalled()
    expect(runtime.service.occurrences).toBe(0)
    runtime.dispose()
  })

  it('DONE gera cópia sem marker; undo posterior não reaviva o gatilho vencido', async () => {
    const storage = openCoordinator(createProductFile())
    const carrier = buildTask({
      id: 'carrier', title: 'Rotina', dueAt: new Date(BASE + 60_000).toISOString(),
      seriesId: 'serie-m', recurrence: { frequency: 'DAILY', intervalDays: 1 },
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }],
    })
    expectOk(await storage.run((unit) => unit.saveTask(carrier)))
    const time = timers()
    const submit = accepting()
    const runtime = runtimeOf(storage, time, submit)
    expect(await runtime.service.recover()).toBe(true)

    const base = expectOk(await storage.read((reader) => reader.getTask('carrier'))).value
    if (base === undefined) throw new Error('missing')
    const closed = expectOk(await storage.run((unit) => changeTaskStatusInUnit(unit, {
      taskId: 'carrier', expectedEditRevision: base.editRevision, status: 'DONE', now: time.now(), generateId: ids('gerada', 'r-gerada'),
    })))
    if (closed.value.status !== 'UPDATED') throw new Error('unexpected: ' + JSON.stringify(closed.value))
    const receipt = closed.value.undo
    const rows = expectOk(await storage.read((reader) => [...reader.iterateTasks(undefined)])).value
    const generated = rows.find((row) => row.task.id === 'gerada')?.task
    expect(generated?.reminders[0]?.processedFor).toBeUndefined()
    expect(generated?.reminders[0]).toMatchObject({ type: 'OFFSET', offsetMinutes: 0 })

    await settle()
    await time.step(runtime.service)
    expect(submit).not.toHaveBeenCalled()
    expect(runtime.service.occurrences).toBe(1)

    // Avança até a graça do gatilho da gerada: primeira passagem consome a antiga expirada
    // sem aviso; a segunda decide a gerada com uma única tentativa.
    time.advance(86_461_000)
    await time.step(runtime.service)
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ taskId: 'gerada' })

    // Undo do fechamento: remove a gerada, liquida o gatilho já vencido e não notifica de novo.
    const reverted = expectOk(await storage.run((unit) => undoLastTaskActionInUnit(unit, {
      receipt, now: new Date(BASE + 86_461_000),
    })))
    expect(reverted.value.status).toBe('REVERTED')
    if (reverted.value.status !== 'REVERTED') throw new Error('unexpected')
    expect(reverted.value.task.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect(reverted.value.task.reminders[0]?.processedFor).toBe(new Date(BASE + 60_000).toISOString())
    const after = expectOk(await storage.read((reader) => [...reader.iterateTasks(undefined)])).value
    expect(after.map((row) => row.task.id)).toEqual(['carrier'])
    await settle()
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(runtime.service.occurrences).toBe(0)
    runtime.dispose()
  })

  it('barreira de backup aplica reset, recompõe fora da conclusão e não repete claim', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTask(fixture('a', -30_000))))
    const time = timers()
    const submit = accepting()
    const runtime = runtimeOf(storage, time, submit)
    expect(await runtime.service.recover()).toBe(true)
    await time.step(runtime.service)
    expect(submit).toHaveBeenCalledTimes(1)

    const epoch = runtime.service.epoch
    resetForBackup(runtime)
    expect(runtime.service.epoch).toBe(epoch + 1)
    await settle()
    await time.step(runtime.service)
    expect(runtime.service.status).toBe('READY')
    expect(runtime.service.occurrences).toBe(0)
    expect(submit).toHaveBeenCalledTimes(1)

    resetForBackup(undefined)
    runtime.dispose()
  })

  it('quit/dispose cancela claim interno ainda não iniciado sem consumir a ocorrência', async () => {
    const storage = openCoordinator(createProductFile())
    expectOk(await storage.run((unit) => unit.saveTask(fixture('a', -30_000))))
    let executed = 0
    // Enfileirado e descartado no mesmo tick: a entrada interna ainda não começou.
    const queued = storage.read(() => { executed += 1; return 'leitura' }, { owner: REMINDER_OWNER })
    const time = timers()
    const submit = accepting()
    const runtime = runtimeOf(storage, time, submit)
    runtime.dispose()
    expect(storage.cancelOwner(REMINDER_OWNER)).toBe(0)
    expect(await queued).toEqual({ ok: false, reason: 'SESSION_CLOSED' })
    expect(executed).toBe(0)
    expect(submit).not.toHaveBeenCalled()
    const stored = expectOk(await storage.read((reader) => reader.getTask('a'))).value
    expect(stored?.task.reminders[0]?.processedFor).toBeUndefined()
  })

  it('create/update de collection com IDs do main e erros por item em SQLite real', async () => {
    const storage = openCoordinator(createProductFile())
    const created = expectOk(await storage.run((unit) => createTaskInUnit(unit, {
      draft: {
        title: 'Com lembretes', dueAt: new Date(BASE + 3_600_000).toISOString(),
        reminders: [
          { type: 'OFFSET', offsetMinutes: 15 },
          { type: 'AT', at: new Date(BASE + 1_800_000).toISOString() },
        ],
      },
      now: new Date(BASE), generateId: ids('t1', 'r1', 'r2'),
    })))
    if (created.value.status !== 'CREATED') throw new Error('unexpected')
    const stored = expectOk(await storage.read((reader) => reader.getTask('t1'))).value
    expect(stored?.task.reminders).toEqual([
      { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
      { id: 'r2', type: 'AT', at: new Date(BASE + 1_800_000).toISOString() },
    ])

    const replaced = expectOk(await storage.run((unit) => updateTaskInUnit(unit, {
      taskId: 't1', expectedEditRevision: stored?.editRevision ?? 0n,
      patch: { reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 30 }, { type: 'OFFSET', offsetMinutes: 45 }] },
      now: new Date(BASE), generateId: ids('r3'),
    })))
    expect(replaced.value.status).toBe('UPDATED')
    const after = expectOk(await storage.read((reader) => reader.getTask('t1'))).value
    expect(after?.task.reminders).toEqual([
      { id: 'r1', type: 'OFFSET', offsetMinutes: 30 },
      { id: 'r3', type: 'OFFSET', offsetMinutes: 45 },
    ])

    const ghost = expectOk(await storage.run((unit) => updateTaskInUnit(unit, {
      taskId: 't1', expectedEditRevision: after?.editRevision ?? 0n,
      patch: { reminders: [{ id: 'ghost', type: 'OFFSET', offsetMinutes: 5 }] },
      now: new Date(BASE), generateId: ids('r4'),
    })))
    expect(ghost.value).toEqual({ status: 'VALIDATION_FAILED', fields: { reminders: { items: [{ index: 0, code: 'UNKNOWN_ID' }] } } })
    const untouched = expectOk(await storage.read((reader) => reader.getTask('t1'))).value
    expect(untouched?.task.reminders).toEqual(after?.task.reminders)
  })
})
