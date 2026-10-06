import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { StorageFailure } from '../../src/application/storage/task-storage-error.js'
import type { TaskStorageUnit, UnitResult } from '../../src/application/storage/unit-of-work.js'
import { processReminder, type ReminderRuntimePort } from '../../src/main/reminders/processor.js'
import { buildTask } from '../support/task-fixtures.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)
const DUE = '2026-10-06T12:00:00.000Z'
const task = () => buildTask({ dueAt: DUE, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }] })
const key = { taskId: task().id, reminderId: 'r', triggerISO: DUE }
function runtime(): ReminderRuntimePort {
  return { ready: () => true, epoch: () => 1, now: () => new Date(DUE), completed: () => undefined, report: vi.fn() }
}

describe('M02/M03/M04 processamento em SQLite real', () => {
  it.each([-1, 0, 300000, 300001])('execução no clock %dms conserva revisões de conteúdo/auditoria', async (delta) => {
    const coordinator = openCoordinator(createProductFile())
    const base = expectOk(await coordinator.run((unit) => { unit.saveTask(task()); return unit.getTask(key.taskId) }))
    const submit = vi.fn()
    const release = vi.fn()
    const outcome = expectOk(await processReminder(coordinator, key, {
      ...runtime(), now: () => new Date(Date.parse(DUE) + delta),
    }, { valid: () => true, submit, release }))
    expect(outcome.value.status).toBe(delta < 0 ? 'FUTURE' : delta > 300000 ? 'EXPIRED' : 'CLAIMED')
    expect(submit).toHaveBeenCalledTimes(delta >= 0 && delta <= 300000 ? 1 : 0)
    const current = expectOk(await coordinator.read((reader) => reader.getTask(key.taskId))).value
    expect(current?.contentRevision).toBe(base.value?.contentRevision)
    expect(current?.editRevision).toBe(base.value?.editRevision)
    expect(current?.task.updatedAt).toBe(base.value?.task.updatedAt)
    expect(current?.task.reminders[0]?.processedFor).toBe(delta < 0 ? undefined : DUE)
    expect(outcome.revision).toBe(delta < 0 ? base.revision : base.revision + 1n)
  })
  it('dois candidatos têm um consumo/submissão; terminal vencida liquida sem reserva', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(task())))
    const submit = vi.fn()
    const reservation = { valid: () => true, submit, release: vi.fn() }
    const first = processReminder(coordinator, key, runtime(), reservation)
    const second = processReminder(coordinator, key, runtime(), reservation)
    expect(expectOk(await first).value.status).toBe('CLAIMED')
    expect(expectOk(await second).value.status).toBe('INAPPLICABLE')
    expect(submit).toHaveBeenCalledTimes(1)
    expectOk(await coordinator.run((unit) => unit.saveTask({ ...task(), status: 'CANCELLED' })))
    expect(expectOk(await processReminder(coordinator, key, runtime(), undefined)).value.status).toBe('EXPIRED')
  })
  it('usa título atual e impede SQL reentrante/objeto expirado entre claim e submit', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(task())))
    const events: string[] = []
    let captured: TaskStorageUnit | undefined
    let nested: Promise<UnitResult<unknown>> | undefined
    const first = coordinator.runReminder((unit) => {
      captured = unit
      return unit.processReminderOccurrence(key, new Date(DUE))
    }, { onCompleted: () => events.push('concluded') }, (outcome) => {
      events.push('submit')
      expect(expectOk(outcome).value.status).toBe('CLAIMED')
      expect(() => captured?.getTask(key.taskId)).toThrow(StorageFailure)
      nested = coordinator.run(() => events.push('reentrant'))
    })
    const next = coordinator.run(() => events.push('next'))
    expectOk(await first)
    expect(nested === undefined ? undefined : await nested).toEqual({ ok: false, reason: 'INVALID_UNIT' })
    expectOk(await next)
    expect(events).toEqual(['concluded', 'submit', 'next'])
    expectOk(await coordinator.run((unit) => unit.saveTask({ ...task(), title: 'Título atual' })))
    const submit = vi.fn()
    await processReminder(coordinator, key, runtime(), { valid: () => true, submit, release: vi.fn() })
    expect(submit).toHaveBeenCalledWith({ ...key, title: 'Título atual', dueAt: DUE })
  })
  it.each(['advance', 'rewind', 'suspend', 'capacity', 'epoch'] as const)('guarda pós-claim %s suprime sem retry', async (change) => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(task())))
    let afterClaim = false
    let epochs = 0
    const submit = vi.fn()
    const release = vi.fn()
    const port: ReminderRuntimePort = {
      ...runtime(),
      completed: () => { afterClaim = true },
      now: () => new Date(Date.parse(DUE) + (afterClaim && change === 'advance' ? 300001 : afterClaim && change === 'rewind' ? -1 : 0)),
      ready: () => !(afterClaim && change === 'suspend'),
      epoch: () => change === 'epoch' && afterClaim ? ++epochs : 1,
    }
    await processReminder(coordinator, key, port, { valid: () => !(afterClaim && change === 'capacity'), submit, release })
    expect(submit).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalled()
    expect(expectOk(await coordinator.read((reader) => reader.getTask(key.taskId))).value?.task.reminders[0]?.processedFor).toBe(DUE)
  })
  it.each(['unit:before-commit', 'unit:commit', 'unit:rollback'] as const)('falha %s não autoriza efeito', async (point) => {
    let fail = false
    const coordinator = openCoordinator(createProductFile(), { faults: { at: (reached) => {
      if (fail && (reached === point || (point === 'unit:rollback' && reached === 'unit:before-commit'))) {
        throw new StorageFailure('UNAVAILABLE')
      }
    } } })
    expectOk(await coordinator.run((unit) => unit.saveTask(task())))
    fail = true
    const submit = vi.fn()
    const release = vi.fn()
    expect((await processReminder(coordinator, key, runtime(), { valid: () => true, submit, release })).ok).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalled()
    fail = false
    expect(expectOk(await coordinator.read((reader) => reader.getTask(key.taskId))).value?.task.reminders[0]?.processedFor).toBeUndefined()
  })
  it('falha externa conserva commit e não repete; erro em onCompleted bloqueia efeito até reopen', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(task())))
    const submit = vi.fn(() => { throw new Error('detalhe fictício privado') })
    const port = runtime()
    const result = expectOk(await processReminder(coordinator, key, port, { valid: () => true, submit, release: vi.fn() }))
    expect(result.committed).toBe(true)
    expect(port.report).toHaveBeenCalledWith('NATIVE_NOTIFICATION_FAILED')
    await processReminder(coordinator, key, port, { valid: () => true, submit, release: vi.fn() })
    expect(submit).toHaveBeenCalledTimes(1)
    expectOk(await coordinator.run((unit) => unit.saveTask(task())))
    const blocked = expectOk(await processReminder(coordinator, key, {
      ...runtime(), completed: () => { throw new Error('falha de conclusão') },
    }, { valid: () => true, submit, release: vi.fn() }))
    expect(blocked.committed).toBe(true)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(expectOk(await coordinator.read((reader) => reader.getTask(key.taskId))).value?.task.reminders[0]?.processedFor).toBe(DUE)
  })
  it('queue full, espera vencida e lock real liberam reserva sem consumir pendência', async () => {
    for (const failure of ['QUEUE_FULL', 'WAIT_TIMEOUT', 'LOCKED'] as const) {
      const file = createProductFile()
      const seed = openCoordinator(file)
      expectOk(await seed.run((unit) => unit.saveTask(task())))
      seed.shutdown()
      const callbacks: Array<() => void> = []
      let clock = 0
      const coordinator = openCoordinator(file, failure === 'LOCKED' ? {} : {
        limits: { total: 1, perOwner: 1, waitMs: 2000 }, now: () => clock,
        schedule: (callback) => callbacks.push(callback),
      })
      let blocking: DatabaseSync | undefined
      if (failure === 'LOCKED') {
        blocking = new DatabaseSync(file)
        blocking.exec('BEGIN IMMEDIATE')
      }
      const queued = failure === 'QUEUE_FULL' ? coordinator.read(() => undefined) : undefined
      const submit = vi.fn()
      const release = vi.fn()
      const result = processReminder(coordinator, key, runtime(), { valid: () => true, submit, release })
      if (failure === 'WAIT_TIMEOUT') { clock = 2001; callbacks.shift()?.() }
      expect(await result).toEqual({ ok: false, reason: failure })
      expect(submit).not.toHaveBeenCalled()
      expect(release).toHaveBeenCalled()
      if (queued !== undefined) { callbacks.shift()?.(); await queued }
      blocking?.exec('ROLLBACK'); blocking?.close()
      const read = coordinator.read((reader) => reader.getTask(key.taskId))
      callbacks.shift()?.()
      expect(expectOk(await read).value?.task.reminders[0]?.processedFor).toBeUndefined()
    }
  })
})
