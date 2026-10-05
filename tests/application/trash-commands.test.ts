import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteTrashItemInUnit,
  emptyTrashInUnit,
  moveTaskToTrashInUnit,
  prepareTrashViewInUnit,
  restoreTrashItemInUnit,
  undoLastTaskActionInUnit,
} from '../../src/application/tasks/trash-commands.js'
import type { TrashEntryRef } from '../../src/application/storage/unit-of-work.js'
import type { Task } from '../../src/domain/task.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'
import { buildTask } from '../support/task-fixtures.js'

// L02–L10 no núcleo portável: política, identidade de entrada, restore/undo condicionados,
// manutenção explícita, reversão integral e concorrência. Dados fictícios e banco temporário.

afterEach(cleanupStorage)

const NOW = new Date('2026-10-04T12:00:00.000Z')
const DUE = '2026-10-10T10:00:00.000Z'

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

function richTask(overrides: Partial<Task> = {}): Task {
  return buildTask({
    id: 'tarefa-rica',
    title: 'Tarefa rica',
    description: 'Descrição',
    requester: 'Ana',
    assignee: 'Bruno',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueAt: DUE,
    tags: ['casa', 'mercado'],
    sourceUrl: 'https://example.test/pedido',
    subtasks: [
      { id: 's1', title: 'A', done: true },
      { id: 's2', title: 'B', done: false },
    ],
    createdAt: '2026-10-01T10:00:00.123Z',
    updatedAt: '2026-10-02T11:00:00.456Z',
    ...overrides,
  })
}

async function seed(coordinator: ReturnType<typeof openCoordinator>, tasks: Task[]): Promise<void> {
  expectOk(await coordinator.run((unit) => unit.saveTasks(tasks)))
}

async function move(
  coordinator: ReturnType<typeof openCoordinator>,
  taskId: string,
  now: Date = NOW,
  expected?: bigint,
) {
  const stored = expectOk(await coordinator.read((reader) => reader.getTask(taskId))).value
  const revision = expected ?? stored?.contentRevision ?? 1n
  return expectOk(
    await coordinator.run((unit) => moveTaskToTrashInUnit(unit, { taskId, expectedContentRevision: revision, now })),
  )
}

function entryOf(coordinator: ReturnType<typeof openCoordinator>, taskId: string): Promise<TrashEntryRef> {
  return coordinator.read((reader) => reader.getTrashItem(taskId)).then((result) => {
    const item = expectOk(result).value
    if (item === undefined) throw new Error('entrada ausente')
    return { taskId: item.task.id, contentRevision: item.contentRevision, deletedAt: item.deletedAt }
  })
}

describe('move com retenção/limite/identidade (L01/L02)', () => {
  it('preserva payload/timestamps e cria identidade content=edit=g sem tocar a Task', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = richTask()
    await seed(coordinator, [task])

    const moved = await move(coordinator, task.id)
    expect(moved.value).toMatchObject({ status: 'MOVED', retained: true })
    if (moved.value.status !== 'MOVED') return
    expect(moved.value.entry).toEqual({ taskId: task.id, contentRevision: moved.revision, deletedAt: NOW.toISOString() })

    const trash = expectOk(await coordinator.read((reader) => reader.getTrashItem(task.id))).value
    expect(trash?.task).toEqual(task)
    expect(trash?.contentRevision).toBe(moved.revision)
    expect(trash?.editRevision).toBe(moved.revision)
    expect(trash?.deletedAt).toBe(NOW.toISOString())
    expect(expectOk(await coordinator.read((reader) => reader.getTask(task.id))).value).toBeUndefined()
  })

  it('confere a revisão observada e recusa sem gravar quando a base mudou', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask()])
    const before = expectOk(await coordinator.read((reader) => reader.listTasks())).value

    const stale = expectOk(
      await coordinator.run((unit) =>
        moveTaskToTrashInUnit(unit, { taskId: 'tarefa-rica', expectedContentRevision: 99n, now: NOW }),
      ),
    )
    expect(stale.value).toEqual({ status: 'CHANGED', currentContentRevision: 1n })
    const missing = expectOk(
      await coordinator.run((unit) =>
        moveTaskToTrashInUnit(unit, { taskId: 'ausente', expectedContentRevision: 1n, now: NOW }),
      ),
    )
    expect(missing.value).toEqual({ status: 'NOT_FOUND' })
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toEqual(before)
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual([])
  })

  it('expurga vencidos, substitui o mesmo ID e corta a coleção em 100 no mesmo commit', { timeout: 20_000 }, async () => {
    const coordinator = openCoordinator(createProductFile())
    const existing: Task[] = []
    for (let index = 0; index < 100; index += 1) {
      existing.push(buildTask({ id: `antiga-${String(index).padStart(3, '0')}` }))
    }
    existing.push(buildTask({ id: 'vencida' }))
    existing.push(buildTask({ id: 'repetida' }))
    await seed(coordinator, existing)

    // Semeia a lixeira: 99 entradas recentes + 1 vencida + uma versão antiga de 'repetida'.
    for (const task of existing.slice(0, 99)) await move(coordinator, task.id, daysAgo(1))
    await move(coordinator, 'vencida', daysAgo(31))
    await move(coordinator, 'repetida', daysAgo(2))

    // A tarefa 'repetida' volta às tasks e é excluída de novo com o mesmo ID: substituição.
    expectOk(await coordinator.run((unit) => unit.saveTask(buildTask({ id: 'repetida' }))))
    const result = await move(coordinator, 'repetida')
    expect(result.value).toMatchObject({ status: 'MOVED', retained: true })

    const trash = expectOk(await coordinator.read((reader) => reader.listTrash())).value
    expect(trash).toHaveLength(100)
    expect(trash.filter((item) => item.task.id === 'repetida')).toHaveLength(1)
    expect(trash.some((item) => item.task.id === 'vencida')).toBe(false)
    expect(trash.find((item) => item.task.id === 'repetida')?.contentRevision).toBe(result.revision)
  })

  it('relógio recuado com 100 entradas futuras descarta a nova exclusão: retained:false sem desfazer', { timeout: 20_000 }, async () => {
    const coordinator = openCoordinator(createProductFile())
    const future: Task[] = []
    for (let index = 0; index < 100; index += 1) future.push(buildTask({ id: `futura-${String(index).padStart(3, '0')}` }))
    await seed(coordinator, [...future, buildTask({ id: 'nova' })])
    for (const [index, task] of future.entries()) {
      await move(coordinator, task.id, new Date(NOW.getTime() + 60_000 + index))
    }

    const result = await move(coordinator, 'nova')
    expect(result.value).toMatchObject({ status: 'MOVED', retained: false })
    if (result.value.status !== 'MOVED') return
    expect(result.value.undo).toBeUndefined()
    expect(expectOk(await coordinator.read((reader) => reader.getTask('nova'))).value).toBeUndefined()
    const trash = expectOk(await coordinator.read((reader) => reader.listTrash())).value
    expect(trash).toHaveLength(100)
    expect(trash.some((item) => item.task.id === 'nova')).toBe(false)
  })
})

describe('restore condicionado (L02/L03/L09)', () => {
  it('restaura integralmente sem gerar ocorrência e liquidando só vencidos', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = richTask({
      dueAt: '2026-10-04T14:00:00.000Z',
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 120 },
        { id: 'r2', type: 'OFFSET', offsetMinutes: 30 },
      ],
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      seriesId: 'serie-rica',
    })
    await seed(coordinator, [task])
    await move(coordinator, task.id)
    const entry = await entryOf(coordinator, task.id)

    const restored = expectOk(
      await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry, now: NOW })),
    )
    expect(restored.value.status).toBe('RESTORED')
    if (restored.value.status !== 'RESTORED') return
    expect(restored.value.task).toMatchObject({
      id: task.id,
      title: task.title,
      status: 'IN_PROGRESS',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      seriesId: 'serie-rica',
    })
    expect(restored.value.task.reminders[0]?.processedFor).toBe('2026-10-04T12:00:00.000Z')
    expect(restored.value.task.reminders[1]?.processedFor).toBeUndefined()
    // Ocorrência futura permanece pendente, sem agendamento fictício.
    expect(restored.value.task.reminders[1]?.type).toBe('OFFSET')
    expect(restored.value.contentRevision).toBe(restored.revision)
    // Nenhuma próxima nasceu: só a tarefa original.
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks.map((stored) => stored.task.id)).toEqual([task.id])
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual([])
  })

  it('recusa ausência, identidade, idade, ID ativo e série sem alterar nem expurgar', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask({ id: 'a' })])
    await move(coordinator, 'a')
    const entry = await entryOf(coordinator, 'a')
    const before = {
      tasks: expectOk(await coordinator.read((reader) => reader.listTasks())).value,
      trash: expectOk(await coordinator.read((reader) => reader.listTrash())).value,
    }

    const absent = expectOk(
      await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry: { ...entry, taskId: 'x' }, now: NOW })),
    )
    expect(absent.value).toEqual({ status: 'NOT_IN_TRASH' })
    const changed = expectOk(
      await coordinator.run((unit) =>
        restoreTrashItemInUnit(unit, { entry: { ...entry, contentRevision: entry.contentRevision + 1n }, now: NOW }),
      ),
    )
    expect(changed.value).toEqual({ status: 'ENTRY_CHANGED' })
    const expired = expectOk(
      await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry, now: daysAgo(-31) })),
    )
    expect(expired.value).toEqual({ status: 'ENTRY_EXPIRED' })
    // Vencida não é expurgada como efeito da recusa.
    expect(expectOk(await coordinator.read((reader) => reader.getTrashItem('a'))).value).toBeDefined()

    expectOk(await coordinator.run((unit) => unit.saveTask(richTask({ id: 'a', title: 'Ativa' }))))
    const idExists = expectOk(await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry, now: NOW })))
    expect(idExists.value).toEqual({ status: 'ID_EXISTS' })

    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual(before.trash)
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.task.title).toBe('Ativa')
  })

  it('portadora concorrente na lixeira recebe SERIES_CONFLICT sem meia restauração', async () => {
    const coordinator = openCoordinator(createProductFile())
    const carrier = richTask({
      id: 'carrier',
      dueAt: DUE,
      seriesId: 'serie-x',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    })
    const other = richTask({ id: 'other', dueAt: DUE, seriesId: 'serie-x', recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    await seed(coordinator, [carrier, other])
    await move(coordinator, 'other', daysAgo(1))
    await move(coordinator, 'carrier', daysAgo(1))
    const entry = await entryOf(coordinator, 'carrier')

    const conflict = expectOk(
      await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry, now: NOW })),
    )
    expect(conflict.value).toEqual({ status: 'SERIES_CONFLICT' })
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toEqual([])
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toHaveLength(2)
  })
})

describe('definitiva, esvaziamento e manutenção (L04)', () => {
  it('definitiva remove só a entrada observada e ignora idade', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask({ id: 'a' }), richTask({ id: 'b' })])
    await move(coordinator, 'b', daysAgo(1))
    await move(coordinator, 'a', daysAgo(40))
    const entry = await entryOf(coordinator, 'a')

    const changed = expectOk(
      await coordinator.run((unit) =>
        deleteTrashItemInUnit(unit, { entry: { ...entry, deletedAt: '2026-01-01T00:00:00.000Z' } }),
      ),
    )
    expect(changed.value).toEqual({ status: 'ENTRY_CHANGED' })
    const deleted = expectOk(await coordinator.run((unit) => deleteTrashItemInUnit(unit, { entry })))
    expect(deleted.value).toEqual({ status: 'DELETED' })
    expect(expectOk(await coordinator.read((reader) => reader.getTrashItem('a'))).value).toBeUndefined()
    expect(expectOk(await coordinator.read((reader) => reader.getTrashItem('b'))).value).toBeDefined()
  })

  it('esvaziamento recusa composição alterada e remove tudo na composição exata', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask({ id: 'a' }), richTask({ id: 'b' }), richTask({ id: 'c' })])
    await move(coordinator, 'a', daysAgo(1))
    await move(coordinator, 'b', daysAgo(2))
    const captured = await Promise.all([entryOf(coordinator, 'a'), entryOf(coordinator, 'b')])

    // Outra sessão muda a lixeira: composição deixa de ser a capturada.
    await move(coordinator, 'c', daysAgo(3))
    const stale = expectOk(
      await coordinator.run((unit) => emptyTrashInUnit(unit, { captured })),
    )
    expect(stale.value).toEqual({ status: 'CONFIRMATION_CHANGED' })
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toHaveLength(3)

    // Tarefa independente fora da lixeira não invalida a composição capturada.
    const fullCapture = expectOk(await coordinator.read((reader) => reader.listTrash())).value.map((item) => ({
      taskId: item.task.id,
      contentRevision: item.contentRevision,
      deletedAt: item.deletedAt,
    }))
    expectOk(await coordinator.run((unit) => unit.saveTask(richTask({ id: 'independente' }))))
    const emptied = expectOk(await coordinator.run((unit) => emptyTrashInUnit(unit, { captured: fullCapture })))
    expect(emptied.value).toEqual({ status: 'EMPTIED', removedCount: 3 })
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual([])
  })

  it('esvaziar vazio é no-op sem revisão; manutenção só remove vencidos e não corta coleção >100', async () => {
    const coordinator = openCoordinator(createProductFile())
    const empty = expectOk(await coordinator.run((unit) => emptyTrashInUnit(unit, { captured: [] })))
    expect(empty.value).toEqual({ status: 'EMPTIED', removedCount: 0 })
    expect(empty.committed).toBe(false)

    const tasks: Task[] = [richTask({ id: 'vencida' }), richTask({ id: 'viva' })]
    await seed(coordinator, tasks)
    await move(coordinator, 'vencida', daysAgo(31))
    await move(coordinator, 'viva', daysAgo(1))
    const revisionBefore = coordinator.confirmedRevision

    const maintained = expectOk(await coordinator.run((unit) => prepareTrashViewInUnit(unit, { now: NOW })))
    expect(maintained.value).toEqual({ status: 'MAINTAINED', purgedCount: 1 })
    expect(maintained.committed).toBe(true)
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toHaveLength(1)

    const noop = expectOk(await coordinator.run((unit) => prepareTrashViewInUnit(unit, { now: NOW })))
    expect(noop.value).toEqual({ status: 'MAINTAINED', purgedCount: 0 })
    expect(noop.committed).toBe(false)
    expect(coordinator.confirmedRevision).not.toBe(revisionBefore)

    // Leitura pura não expurga.
    const stillThere = expectOk(await coordinator.read((reader) => reader.listTrash())).value
    expect(stillThere).toHaveLength(1)
  })
})

describe('reversão integral e undo (L07/L08/L09/L10)', () => {
  it('REVERT restaura before-image com done/ordens, updatedAt novo e revisões novas', async () => {
    const coordinator = openCoordinator(createProductFile())
    const before = richTask({
      status: 'IN_PROGRESS',
      subtasks: [
        { id: 's1', title: 'A', done: true },
        { id: 's2', title: 'B', done: false },
      ],
    })
    await seed(coordinator, [before])
    const changed = expectOk(
      await coordinator.run((unit) =>
        unit.updateTaskConditionally('tarefa-rica', 1n, (current) => ({
          ...current,
          status: 'DONE',
          completedAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          subtasks: current.subtasks.map((item) => ({ ...item, done: true })),
        })),
      ),
    )
    expect(changed.value.status).toBe('UPDATED')
    if (changed.value.status !== 'UPDATED') return
    const changedRevision = changed.value.contentRevision

    const reverted = expectOk(
      await coordinator.run((unit) =>
        undoLastTaskActionInUnit(unit, {
          receipt: {
            kind: 'REVERT',
            target: { id: 'tarefa-rica', expectedContentRevision: changedRevision },
            beforeImage: before,
          },
          now: NOW,
        }),
      ),
    )
    expect(reverted.value.status).toBe('REVERTED')
    if (reverted.value.status !== 'REVERTED') return
    expect(reverted.value.task).toMatchObject({
      status: 'IN_PROGRESS',
      createdAt: before.createdAt,
      subtasks: [
        { id: 's1', title: 'A', done: true },
        { id: 's2', title: 'B', done: false },
      ],
    })
    expect(reverted.value.task.completedAt).toBeUndefined()
    expect(reverted.value.contentRevision).toBe(reverted.revision)
    expect(reverted.value.task.updatedAt).toBe(before.updatedAt)
  })

  it('check posterior bloqueia; claim isolado conserva aplicabilidade; ABA por conteúdo bloqueia', async () => {
    const coordinator = openCoordinator(createProductFile())
    const before = richTask({ dueAt: DUE, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }] })
    await seed(coordinator, [before])
    // Ação efetiva enquanto a tarefa continua ativa (claim exige status ativo).
    const changed = expectOk(
      await coordinator.run((unit) =>
        unit.updateTaskConditionally('tarefa-rica', 1n, (current) => ({ ...current, title: 'Editada' })),
      ),
    )
    if (changed.value.status !== 'UPDATED') throw new Error('edição esperada')
    const changedRevision = changed.value.contentRevision

    // Claim isolado na tarefa alvo não altera a revisão de conteúdo.
    const claimed = expectOk(
      await coordinator.run((unit) =>
        unit.claimReminderOccurrence({
          taskId: 'tarefa-rica',
          reminderId: 'r1',
          processedFor: '2026-10-10T09:00:00.000Z',
        }),
      ),
    )
    expect(claimed.value).toBe(true)
    const reverted = expectOk(
      await coordinator.run((unit) =>
        undoLastTaskActionInUnit(unit, {
          receipt: {
            kind: 'REVERT',
            target: { id: 'tarefa-rica', expectedContentRevision: changedRevision },
            beforeImage: before,
          },
          now: NOW,
        }),
      ),
    )
    expect(reverted.value.status).toBe('REVERTED')
    if (reverted.value.status !== 'REVERTED') return
    const revertedEditRevision = reverted.value.editRevision
    const revertedContentRevision = reverted.value.contentRevision
    expect(reverted.value.task.title).toBe(before.title)
    // Marcador atual da mesma ocorrência é preservado.
    expect(reverted.value.task.reminders[0]?.processedFor).toBe('2026-10-10T09:00:00.000Z')

    // Check (marcação) posterior avança a revisão de conteúdo e bloqueia a reversão.
    const marked = expectOk(
      await coordinator.run((unit) =>
        unit.markSubtaskDone('tarefa-rica', revertedEditRevision, 's2', true, NOW),
      ),
    )
    expect(marked.value.status).toBe('UPDATED')
    const blocked = expectOk(
      await coordinator.run((unit) =>
        undoLastTaskActionInUnit(unit, {
          receipt: {
            kind: 'REVERT',
            target: { id: 'tarefa-rica', expectedContentRevision: revertedContentRevision },
            beforeImage: before,
          },
          now: NOW,
        }),
      ),
    )
    expect(blocked.value).toEqual({ status: 'CHANGED' })
  })

  it('reversão de fechamento remove a gerada no mesmo commit e recusa se a gerada mudou', async () => {
    const coordinator = openCoordinator(createProductFile())
    const carrier = richTask({
      dueAt: DUE,
      seriesId: 'serie-y',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    })
    await seed(coordinator, [carrier])
    // Fechamento planejado: antiga perde a regra, gerada nasce TODO.
    const closed = expectOk(
      await coordinator.run((unit) => {
        const closedTask = { ...carrier }
        delete closedTask.recurrence
        closedTask.status = 'DONE'
        closedTask.completedAt = NOW.toISOString()
        const generated = richTask({ id: 'gerada', dueAt: '2026-10-11T10:00:00.000Z', seriesId: 'serie-y' })
        delete generated.recurrence
        unit.saveTasks([closedTask, generated])
        return unit.getTask('tarefa-rica')
      }),
    )
    if (closed.value === undefined) throw new Error('fechada ausente')
    const generated = expectOk(await coordinator.read((reader) => reader.getTask('gerada'))).value
    if (generated === undefined) throw new Error('gerada ausente')
    if (closed.value === undefined) throw new Error('fechada ausente')
    const closedRevision = closed.value.contentRevision
    const generatedRevision = generated.contentRevision

    // Reversão válida: restaura a portadora e remove a gerada direto de tasks, num commit.
    const reverted = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          { target: { id: 'tarefa-rica', expectedContentRevision: closedRevision }, generated: { id: 'gerada', expectedContentRevision: generatedRevision } },
          () => carrier,
          NOW,
        ),
      ),
    )
    expect(reverted.value.status).toBe('REVERTED')
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks.map((stored) => stored.task.id)).toEqual(['tarefa-rica'])
    expect(tasks[0]?.task.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual([])

    // Segundo par: gerada editada bloqueia a reversão inteira.
    await seed(coordinator, [
      richTask({ id: 'carrier-2', dueAt: DUE, seriesId: 'serie-z', recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
    ])
    const closed2 = expectOk(
      await coordinator.run((unit) => {
        const closedTask = richTask({ id: 'carrier-2', dueAt: DUE, seriesId: 'serie-z' })
        closedTask.status = 'DONE'
        const generated = richTask({ id: 'gerada-2', dueAt: '2026-10-12T10:00:00.000Z', seriesId: 'serie-z' })
        unit.saveTasks([closedTask, generated])
        return unit.getTask('carrier-2')
      }),
    )
    const generated2 = expectOk(await coordinator.read((reader) => reader.getTask('gerada-2'))).value
    if (closed2.value === undefined || generated2 === undefined) throw new Error('par 2 ausente')
    const closed2Revision = closed2.value.contentRevision
    const generated2Revision = generated2.contentRevision
    expectOk(
      await coordinator.run((unit) =>
        unit.updateTaskConditionally('gerada-2', generated2.editRevision, (current) => ({ ...current, title: 'Editada' })),
      ),
    )
    const blocked = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          { target: { id: 'carrier-2', expectedContentRevision: closed2Revision }, generated: { id: 'gerada-2', expectedContentRevision: generated2Revision } },
          () => richTask({ id: 'carrier-2', dueAt: DUE, seriesId: 'serie-z', recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
          NOW,
        ),
      ),
    )
    expect(blocked.value).toEqual({ status: 'GENERATED_CHANGED' })
    const remaining = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(remaining.map((stored) => stored.task.id)).toEqual(['carrier-2', 'gerada-2', 'tarefa-rica'])
  })

  it('undo de exclusão usa restore condicionado: vencida recusa sem expurgo, válida volta', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask({ id: 'a' })])
    const moved = await move(coordinator, 'a', daysAgo(31))
    if (moved.value.status !== 'MOVED' || moved.value.undo === undefined) throw new Error('move esperado')
    const receipt = moved.value.undo

    const expired = expectOk(await coordinator.run((unit) => undoLastTaskActionInUnit(unit, { receipt, now: NOW })))
    expect(expired.value).toEqual({ status: 'ENTRY_EXPIRED' })
    expect(expectOk(await coordinator.read((reader) => reader.getTrashItem('a'))).value).toBeDefined()

    const restored = expectOk(
      await coordinator.run((unit) => undoLastTaskActionInUnit(unit, { receipt, now: daysAgo(20) })),
    )
    expect(restored.value.status).toBe('RESTORED')
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual([])
  })
})

describe('concorrência e falhas entre efeitos (L05/L10)', () => {
  it('restore×restore e restore→delete com o mesmo relógio: só a primeira decisão aplica', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask({ id: 'a' })])
    await move(coordinator, 'a')
    const entry = await entryOf(coordinator, 'a')

    const first = expectOk(await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry, now: NOW })))
    expect(first.value.status).toBe('RESTORED')
    const second = expectOk(await coordinator.run((unit) => restoreTrashItemInUnit(unit, { entry, now: NOW })))
    expect(second.value).toEqual({ status: 'NOT_IN_TRASH' })

    // Restore → delete de novo com o mesmo relógio: identidade nova impede a operação antiga.
    const again = await move(coordinator, 'a')
    if (again.value.status !== 'MOVED') throw new Error('move esperado')
    expect(again.value.entry.contentRevision).not.toBe(entry.contentRevision)
    const staleDelete = expectOk(await coordinator.run((unit) => deleteTrashItemInUnit(unit, { entry })))
    expect(staleDelete.value).toEqual({ status: 'ENTRY_CHANGED' })
    expect(expectOk(await coordinator.read((reader) => reader.getTrashItem('a'))).value).toBeDefined()
  })

  it('falha entre efeitos reverte a unidade inteira (move e reversão)', async () => {
    let armed = false
    const faults = {
      at: (point: string) => {
        if (armed && point === 'unit:in-transaction') throw new Error('fixture: falha entre efeitos')
      },
    }
    const coordinator = openCoordinator(createProductFile(), { faults })
    await seed(coordinator, [richTask({ id: 'a' }), richTask({ id: 'b' })])
    const before = {
      tasks: expectOk(await coordinator.read((reader) => reader.listTasks())).value,
      trash: expectOk(await coordinator.read((reader) => reader.listTrash())).value,
    }

    armed = true
    const failed = await coordinator.run((unit) => moveTaskToTrashInUnit(unit, { taskId: 'a', expectedContentRevision: 1n, now: NOW }))
    armed = false
    expect(failed.ok).toBe(false)
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toEqual(before.tasks)
    expect(expectOk(await coordinator.read((reader) => reader.listTrash())).value).toEqual(before.trash)

    // A fila continua após a falha recuperável.
    const recovered = await move(coordinator, 'a')
    expect(recovered.value.status).toBe('MOVED')
  })
})

describe('recibos: before-image e referência da gerada vêm da leitura real', () => {
  it('update devolve undo com before-image relida e alvo; move retido devolve referência', async () => {
    const coordinator = openCoordinator(createProductFile())
    await seed(coordinator, [richTask({ id: 'a', title: 'Original' })])
    const updated = expectOk(
      await coordinator.run((unit) =>
        unit.updateTaskConditionally('a', 1n, (current) => ({ ...current, title: 'Editada' })),
      ),
    )
    expect(updated.value.status).toBe('UPDATED')
    if (updated.value.status !== 'UPDATED') return
    expect(updated.value.task.title).toBe('Editada')

    const moved = await move(coordinator, 'a')
    if (moved.value.status !== 'MOVED' || moved.value.undo === undefined) throw new Error('move esperado')
    expect(moved.value.undo).toEqual({
      kind: 'DELETE',
      entry: { taskId: 'a', contentRevision: moved.revision, deletedAt: NOW.toISOString() },
    })
  })
})
