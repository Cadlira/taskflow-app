import { afterEach, describe, expect, it } from 'vitest'
import { restoreBackupInUnit } from '../../src/application/backup/backup-restore-plan.js'
import { StorageFailure } from '../../src/application/storage/task-storage-error.js'
import type { TaskStorageUnit } from '../../src/application/storage/unit-of-work.js'
import type { Task } from '../../src/domain/task.js'
import { buildTask } from '../support/task-fixtures.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)

const NOW = new Date('2026-10-05T12:00:00.000Z')

function carrier(id: string, seriesId: string): Task {
  return buildTask({
    id,
    title: `Tarefa ${id}`,
    dueAt: '2026-11-10T12:00:00.000Z',
    seriesId,
    recurrence: { frequency: 'WEEKLY', weekdays: [1] },
  })
}

describe('restoreBackupInUnit (B07/B08/B10)', () => {
  it('substitui tasks numa unidade, preserva a lixeira inteira e não manda removidas à lixeira', async () => {
    const coordinator = openCoordinator(createProductFile())
    const identical = buildTask({ id: 'mesma' })
    const changed = buildTask({ id: 'alterada', title: 'Antes' })
    const removed = buildTask({ id: 'removida', title: 'Sai do conjunto' })
    const trashed = buildTask({ id: 'na-lixeira', title: 'Fica na lixeira' })
    expectOk(
      await coordinator.run((unit) => {
        unit.saveTasks([identical, changed, removed, trashed])
        unit.moveToTrash('na-lixeira', '2026-10-01T12:00:00.000Z')
      }),
    )

    const before = expectOk(
      await coordinator.read((reader) => ({
        trash: reader.listTrash(),
        tasks: reader.listTasks(),
        revision: reader.baseRevision,
      })),
    )
    const trashRef = before.value.trash[0]!
    const identicalBefore = before.value.tasks.find((stored) => stored.task.id === 'mesma')!
    const base = before.value.revision

    const next = [identical, buildTask({ id: 'alterada', title: 'Depois' }), buildTask({ id: 'nova' })]
    const result = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, { tasks: next, expectedGlobalRevision: base, now: NOW }),
      ),
    )
    expect(result.committed).toBe(true)
    const outcome = result.value
    expect(outcome.status).toBe('APPLIED')
    if (outcome.status !== 'APPLIED') return
    expect(outcome.restoredCount).toBe(3)
    expect(outcome.created).toBe(1)
    expect(outcome.updated).toBe(1)
    expect(outcome.removed).toBe(1)

    const after = expectOk(
      await coordinator.read((reader) => ({
        tasks: reader.listTasks(),
        trash: reader.listTrash(),
        revision: reader.baseRevision,
      })),
    )
    const ids = after.value.tasks.map((stored) => stored.task.id).sort()
    expect(ids).toEqual(['alterada', 'mesma', 'nova'])
    // Removida não vai para a lixeira; a lixeira anterior permanece idêntica.
    expect(after.value.trash.map((item) => item.task.id)).toEqual(['na-lixeira'])
    expect(after.value.trash[0]!.contentRevision).toBe(trashRef.contentRevision)
    expect(after.value.trash[0]!.editRevision).toBe(trashRef.editRevision)
    expect(after.value.trash[0]!.deletedAt).toBe(trashRef.deletedAt)

    // Idêntica conserva metadata; nova/alterada recebem a revisão da unidade.
    const byId = new Map(after.value.tasks.map((stored) => [stored.task.id, stored]))
    expect(byId.get('mesma')!.contentRevision).toBe(identicalBefore.contentRevision)
    expect(byId.get('mesma')!.editRevision).toBe(identicalBefore.editRevision)
    expect(byId.get('alterada')!.contentRevision).toBe(outcome.revision)
    expect(byId.get('alterada')!.editRevision).toBe(outcome.revision)
    expect(byId.get('nova')!.contentRevision).toBe(outcome.revision)
    expect(after.value.revision).toBe(outcome.revision)
  })

  it('tasks:[] remove todas as tarefas ativas sem tocar a lixeira e retorna APPLIED', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) => {
        unit.saveTasks([buildTask({ id: 'a' }), buildTask({ id: 'b', title: 'B' })])
        unit.moveToTrash('b', '2026-10-01T12:00:00.000Z')
      }),
    )
    const base = coordinator.confirmedRevision!
    const result = expectOk(
      await coordinator.run((unit) => restoreBackupInUnit(unit, { tasks: [], expectedGlobalRevision: base, now: NOW })),
    )
    expect(result.value.status).toBe('APPLIED')
    const after = expectOk(await coordinator.read((reader) => ({ tasks: reader.listTasks(), trash: reader.listTrash() })))
    expect(after.value.tasks).toHaveLength(0)
    expect(after.value.trash).toHaveLength(1)
  })

  it('plano idêntico é UNCHANGED sem revisão nova e com metadata preservada', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildTask({ id: 'mesma' })
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    const before = expectOk(await coordinator.read((reader) => ({ stored: reader.listTasks()[0]!, revision: reader.baseRevision })))

    const result = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, { tasks: [task], expectedGlobalRevision: before.value.revision, now: NOW }),
      ),
    )
    expect(result.committed).toBe(false)
    expect(result.value).toMatchObject({ status: 'UNCHANGED', restoredCount: 1, revision: before.value.revision })

    const after = expectOk(await coordinator.read((reader) => reader.listTasks()[0]!))
    expect(after.value.contentRevision).toBe(before.value.stored.contentRevision)
    expect(after.value.editRevision).toBe(before.value.stored.editRevision)
  })

  it('base global divergente recusa com BACKUP_BASE_CHANGED sem efeito', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(buildTask({ id: 'a' }))))
    const base = coordinator.confirmedRevision!
    // Outro produtor avança a revisão global depois da prévia.
    expectOk(await coordinator.run((unit) => unit.saveTask(buildTask({ id: 'b', title: 'B' }))))

    const result = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, {
          tasks: [buildTask({ id: 'c' })],
          expectedGlobalRevision: base,
          now: NOW,
        }),
      ),
    )
    expect(result.value.status).toBe('BASE_CHANGED')
    expect(result.committed).toBe(false)
    const after = expectOk(await coordinator.read((reader) => reader.listTasks().map((stored) => stored.task.id)))
    expect(after.value.sort()).toEqual(['a', 'b'])
  })

  it('duas portadoras importadas, ou importada contra a lixeira, recusam sem efeito', async () => {
    const coordinator = openCoordinator(createProductFile())
    // A entrada da lixeira porta a série, mesmo terminal/vencida.
    expectOk(await coordinator.run((unit) => unit.saveTask(carrier('na-lixeira', 'serie-x'))))
    expectOk(await coordinator.run((unit) => unit.moveToTrash('na-lixeira', '2026-10-01T12:00:00.000Z')))
    const base = coordinator.confirmedRevision!

    const duplicated = [carrier('c1', 'serie-x'), carrier('c2', 'serie-x')]
    const first = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, { tasks: duplicated, expectedGlobalRevision: base, now: NOW }),
      ),
    )
    expect(first.value.status).toBe('SERIES_CONFLICT')

    const againstTrash = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, { tasks: [carrier('c3', 'serie-x')], expectedGlobalRevision: base, now: NOW }),
      ),
    )
    expect(againstTrash.value.status).toBe('SERIES_CONFLICT')
    const after = expectOk(await coordinator.read((reader) => ({ tasks: reader.listTasks(), trash: reader.listTrash() })))
    expect(after.value.tasks).toHaveLength(0)
    expect(after.value.trash).toHaveLength(1)

    // Homônimo de ID entre tasks e trash é permitido se não criar segunda portadora.
    const homonym = buildTask({ id: 'na-lixeira', title: 'Homônima' })
    const allowed = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, { tasks: [homonym], expectedGlobalRevision: base, now: NOW }),
      ),
    )
    expect(allowed.value.status).toBe('APPLIED')
  })

  it('liquida somente lembretes pendentes <= now, preservando marcas futuras e timestamps', async () => {
    const coordinator = openCoordinator(createProductFile())
    const base = coordinator.confirmedRevision!
    // Vencido: OFFSET grande sobre prazo futuro alcança o passado; futuro permanece pendente.
    const reminderTask = buildTask({
      id: 'lembretes',
      dueAt: '2026-10-10T12:00:00.000Z',
      reminders: [
        { id: 'r-vencido', type: 'OFFSET', offsetMinutes: 28800 },
        { id: 'r-abs', type: 'AT', at: '2026-10-09T12:00:00.000Z' },
        { id: 'r-marcado', type: 'AT', at: '2026-10-08T12:00:00.000Z', processedFor: '2026-10-08T12:00:00.000Z' },
      ],
    })
    const alreadyProcessed = buildTask({
      id: 'processada',
      dueAt: '2026-12-01T12:00:00.000Z',
      reminders: [{ id: 'r-futuro', type: 'OFFSET', offsetMinutes: 0, processedFor: '2026-11-01T12:00:00.000Z' }],
    })

    const result = expectOk(
      await coordinator.run((unit) =>
        restoreBackupInUnit(unit, { tasks: [reminderTask, alreadyProcessed], expectedGlobalRevision: base, now: NOW }),
      ),
    )
    expect(result.value.status).toBe('APPLIED')
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks().map((stored) => stored.task)))
    const byId = new Map(tasks.value.map((task) => [task.id, task]))

    expect(byId.get('lembretes')!.reminders).toEqual([
      { id: 'r-vencido', type: 'OFFSET', offsetMinutes: 28800, processedFor: '2026-09-20T12:00:00.000Z' },
      { id: 'r-abs', type: 'AT', at: '2026-10-09T12:00:00.000Z' },
      {
        id: 'r-marcado',
        type: 'AT',
        at: '2026-10-08T12:00:00.000Z',
        processedFor: '2026-10-08T12:00:00.000Z',
      },
    ])
    expect(byId.get('lembretes')!.updatedAt).toBe(reminderTask.updatedAt)
    expect(byId.get('processada')!.reminders[0]!.processedFor).toBe('2026-11-01T12:00:00.000Z')
  })

  it('divergência de verificação lança BACKUP_VERIFICATION_FAILED para rollback integral', () => {
    const expected = buildTask({ id: 'x' })
    // Simula divergência entre a expectativa e a releitura efetivamente gravada pela unidade.
    const corrupted: TaskStorageUnit = {
      get baseRevision() {
        return 5n
      },
      listTasks: () => [{ task: { ...expected, title: 'Divergente' }, contentRevision: 6n, editRevision: 6n }],
      getTask: () => undefined,
      listTrash: () => [],
      getTrashItem: () => undefined,
      *iterateTasks() {},
      *iterateTrash() {},
      *iterateCarrierSummaries() {},
      saveTask: () => 'CREATED',
      saveTasks: () => [],
      replaceAllTasks: () => ({ status: 'REPLACED', created: 1, updated: 0, removed: 0, revision: 6n }),
      deleteTask: () => false,
      moveToTrash: () => undefined,
      moveToTrashConditionally: () => ({ status: 'NOT_FOUND' }),
      restoreFromTrash: () => ({ status: 'NOT_IN_TRASH' }),
      restoreTrashItemConditionally: () => ({ status: 'NOT_IN_TRASH' }),
      deleteFromTrash: () => false,
      deleteTrashItemConditionally: () => ({ status: 'NOT_IN_TRASH' }),
      emptyTrash: () => 0,
      emptyTrashConditionally: () => ({ status: 'CONFIRMATION_CHANGED' }),
      purgeTrash: () => 0,
      purgeExpiredTrash: () => 0,
      updateTaskConditionally: () => ({ status: 'NOT_FOUND' }),
      markSubtaskDone: () => ({ status: 'NOT_FOUND' }),
      revertConditionally: () => ({ status: 'REMOVED' }),
      claimReminderOccurrence: () => false,
    } as unknown as TaskStorageUnit

    const failure = (() => {
      try {
        restoreBackupInUnit(corrupted, { tasks: [expected], expectedGlobalRevision: 5n, now: NOW })
        return undefined
      } catch (error) {
        return error
      }
    })()
    expect(failure).toBeInstanceOf(StorageFailure)
    expect((failure as StorageFailure).reason).toBe('BACKUP_VERIFICATION_FAILED')
  })
})
