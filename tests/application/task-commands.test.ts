import { afterEach, describe, expect, it } from 'vitest'
import {
  changeTaskStatusInUnit,
  createTaskInUnit,
  setSubtaskDoneInUnit,
  updateTaskInUnit,
} from '../../src/application/tasks/task-commands.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'
import { buildTask } from '../support/task-fixtures.js'

afterEach(cleanupStorage)

const NOW = new Date('2026-10-04T12:00:00.000Z')
const DUE = '2026-10-10T10:00:00.000Z'
const DELETED_AT = '2026-10-03T08:00:00.000Z'

function idGenerator(...ids: string[]): () => string {
  let index = 0
  return () => ids[Math.min(index++, ids.length - 1)] ?? 'fallback-id'
}

function draft(overrides: Partial<Parameters<typeof createTaskInUnit>[1]['draft']> = {}) {
  return { title: 'Tarefa fictícia', ...overrides }
}

async function revisionsOf(
  coordinator: ReturnType<typeof openCoordinator>,
  id: string,
): Promise<{ contentRevision: bigint; editRevision: bigint }> {
  const stored = expectOk(await coordinator.read((reader) => reader.getTask(id)))
  if (stored.value === undefined) throw new Error('tarefa ausente')
  return { contentRevision: stored.value.contentRevision, editRevision: stored.value.editRevision }
}

describe('comandos de tarefas na unidade: criação', () => {
  it('cria com identidade/relógio do proprietário e devolve conteúdo/edição iguais', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ status: 'DONE', tags: ['A', 'a'] }), now: NOW, generateId: idGenerator('novo-1') }),
      ),
    )
    expect(result.value).toEqual({
      status: 'CREATED',
      taskId: 'novo-1',
      contentRevision: result.revision,
      editRevision: result.revision,
    })
    expect(result.committed).toBe(true)

    const stored = expectOk(await coordinator.read((reader) => reader.getTask('novo-1')))
    expect(stored.value?.task).toMatchObject({
      id: 'novo-1',
      status: 'DONE',
      createdAt: '2026-10-04T12:00:00.000Z',
      completedAt: '2026-10-04T12:00:00.000Z',
      tags: ['A'],
    })
  })

  it('cria com regra/série da autoridade e subtarefas desmarcadas sem gerar', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({
            dueAt: DUE,
            recurrence: { frequency: 'WEEKLY', weekdays: [1, 3], until: '2026-12-01T10:00:00.000Z' },
            subtasks: [{ title: 'Primeiro' }, { title: 'Segundo' }],
          }),
          now: NOW,
          generateId: idGenerator('tarefa', 'serie', 's1', 's2'),
        }),
      ),
    )
    if (result.value.status !== 'CREATED') throw new Error('esperado CREATED')
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('tarefa')))
    expect(stored.value?.task.seriesId).toBe('serie')
    expect(stored.value?.task.recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [1, 3], until: '2026-12-01T10:00:00.000Z' })
    expect(stored.value?.task.subtasks).toEqual([
      { id: 's1', title: 'Primeiro', done: false },
      { id: 's2', title: 'Segundo', done: false },
    ])
    // Somente a tarefa criada existe: criação não gera a próxima.
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(1)
    expect(result.value.contentRevision).toBe(result.value.editRevision)
  })

  it('criação terminal com regra persiste sem geração imediata', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({ status: 'CANCELLED', dueAt: DUE, recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
          now: NOW,
          generateId: idGenerator('terminal', 'serie'),
        }),
      ),
    )
    expect(result.value.status).toBe('CREATED')
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(1)
  })

  it('validação falha sem gravar nem confirmar; regra sem prazo e AT recusam', async () => {
    const coordinator = openCoordinator(createProductFile())
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const invalid = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: '   ' }), now: NOW, generateId: idGenerator('x') })),
    )
    expect(invalid.value).toEqual({ status: 'VALIDATION_FAILED', fields: { title: 'REQUIRED' } })
    expect(invalid.committed).toBe(false)

    const noDue = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ recurrence: { frequency: 'DAILY', intervalDays: 1 } }), now: NOW, generateId: idGenerator('y') }),
      ),
    )
    expect(noDue.value).toEqual({ status: 'VALIDATION_FAILED', fields: { dueAt: 'DUE_REQUIRED' } })

    const untilBefore = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({ dueAt: DUE, recurrence: { frequency: 'DAILY', intervalDays: 1, until: '2026-10-09T10:00:00.000Z' } }),
          now: NOW,
          generateId: idGenerator('z'),
        }),
      ),
    )
    expect(untilBefore.value).toEqual({
      status: 'VALIDATION_FAILED',
      fields: { recurrence: { until: 'UNTIL_BEFORE_DUE' } },
    })

    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(0)
    expect(events).toEqual([])
  })

  it('colisão de identidade em tarefas/lixeira/série nunca sobrescreve e falha segura', async () => {
    const coordinator = openCoordinator(createProductFile())
    const first = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Primeira' }), now: NOW, generateId: idGenerator('colide') }),
      ),
    )
    expect(first.value.status).toBe('CREATED')
    expectOk(await coordinator.run((unit) => unit.moveToTrash('colide', DELETED_AT)))

    // Mesmo ID na lixeira: recusado; segunda tentativa usa ID novo.
    const second = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Segunda' }), now: NOW, generateId: idGenerator('colide', 'novo-id') }),
      ),
    )
    expect(second.value).toMatchObject({ status: 'CREATED', taskId: 'novo-id' })

    // Três colisões seguidas: IDENTITY_CONFLICT sem commit e sem evento novo.
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    const exhausted = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Terceira' }), now: NOW, generateId: idGenerator('colide') }),
      ),
    )
    expect(exhausted.value).toEqual({ status: 'IDENTITY_CONFLICT' })
    expect(exhausted.committed).toBe(false)
    expect(events).toEqual([])

    // Série colidente com a existente: IDENTITY_CONFLICT sem substituir nada.
    expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({ title: 'Portadora', dueAt: DUE, recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
          now: NOW,
          generateId: idGenerator('carrier', 'serie-ocupada'),
        }),
      ),
    )
    const seriesClash = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({ title: 'Série', dueAt: DUE, recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
          now: NOW,
          generateId: idGenerator('outra-id', 'serie-ocupada'),
        }),
      ),
    )
    expect(seriesClash.value).toEqual({ status: 'IDENTITY_CONFLICT' })

    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    const trash = expectOk(await coordinator.read((reader) => reader.listTrash())).value
    expect(tasks.map((stored) => stored.task.title).sort()).toEqual(['Portadora', 'Segunda'])
    expect(trash.map((item) => item.task.title)).toEqual(['Primeira'])
  })
})

describe('comandos de tarefas na unidade: edição por revisão de edição', () => {
  it('edita por CAS de edição, recusa base antiga e expõe as duas revisões no conflito', async () => {
    const coordinator = openCoordinator(createProductFile())
    const created = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft(), now: NOW, generateId: idGenerator('a') })),
    )
    if (created.value.status !== 'CREATED') throw new Error('unexpected')
    const base = created.value.editRevision

    const updated = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedEditRevision: base, patch: { title: 'Editada' }, now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(updated.value.status).toBe('UPDATED')

    const conflict = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedEditRevision: base, patch: { title: 'Stale' }, now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(conflict.value).toMatchObject({ status: 'CONFLICT' })
    if (conflict.value.status === 'CONFLICT') {
      expect(conflict.value.currentContentRevision).toBe(updated.revision)
      expect(conflict.value.currentEditRevision).toBe(updated.revision)
    }

    const stored = expectOk(await coordinator.read((reader) => reader.getTask('a')))
    expect(stored.value?.task.title).toBe('Editada')
  })

  it('tarefa ausente retorna NOT_FOUND e nunca é recriada', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'inexistente', expectedEditRevision: 1n, patch: { title: 'x' }, now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(result.value).toEqual({ status: 'NOT_FOUND' })
    expect(result.committed).toBe(false)
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toEqual([])
  })

  it('no-op não grava, não incrementa e não emite evento', async () => {
    const coordinator = openCoordinator(createProductFile())
    const created = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft(), now: NOW, generateId: idGenerator('a') })),
    )
    if (created.value.status !== 'CREATED') throw new Error('unexpected')
    const revisionBefore = created.revision
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const noop = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedEditRevision: created.value.status === 'CREATED' ? created.value.editRevision : 0n, patch: {}, now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(noop.value).toMatchObject({ status: 'UNCHANGED' })
    expect(noop.committed).toBe(false)
    expect(noop.revision).toBe(revisionBefore)
    expect(events).toEqual([])

    const sameStatus = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'a',
          expectedEditRevision: created.value.status === 'CREATED' ? created.value.editRevision : 0n,
          status: 'TODO',
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(sameStatus.value).toMatchObject({ status: 'UNCHANGED' })
    expect(sameStatus.committed).toBe(false)
    expect(events).toEqual([])
  })

  it('recriar ID aloca revisões novas: base antiga não autoriza (sem ABA)', async () => {
    const coordinator = openCoordinator(createProductFile())
    const first = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft(), now: NOW, generateId: idGenerator('a') })),
    )
    if (first.value.status !== 'CREATED') throw new Error('unexpected')
    const firstEdit = first.value.editRevision
    expectOk(await coordinator.run((unit) => unit.deleteTask('a')))
    const second = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: 'Nova' }), now: NOW, generateId: idGenerator('a') })),
    )
    if (second.value.status !== 'CREATED') throw new Error('unexpected')
    expect(second.value.editRevision).toBeGreaterThan(firstEdit)

    const stale = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedEditRevision: firstEdit, patch: { title: 'Stale' }, now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(stale.value).toMatchObject({ status: 'CONFLICT' })
  })

  it('salvar depois de marcações externas conserva o done atual sem conflito', async () => {
    const coordinator = openCoordinator(createProductFile())
    const created = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({ subtasks: [{ title: 'A' }, { title: 'B' }] }),
          now: NOW,
          generateId: idGenerator('t', 's1', 's2'),
        }),
      ),
    )
    if (created.value.status !== 'CREATED') throw new Error('unexpected')
    const baseEdit = created.value.editRevision

    // Outra superfície marca o item 1: conteúdo avança, edição é conservada.
    const toggled = expectOk(
      await coordinator.run((unit) =>
        setSubtaskDoneInUnit(unit, { taskId: 't', expectedEditRevision: baseEdit, subtaskId: 's1', done: true, now: NOW }),
      ),
    )
    expect(toggled.value).toMatchObject({ status: 'UPDATED', editRevision: baseEdit })

    // O save do formulário (mesma revisão de edição) confirma e conserva o done lido agora.
    const saved = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 't',
          expectedEditRevision: baseEdit,
          patch: { title: 'Editada', subtasks: [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }] },
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(saved.value.status).toBe('UPDATED')
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('t')))
    expect(stored.value?.task.subtasks[0]?.done).toBe(true)
    expect(stored.value?.task.title).toBe('Editada')
    expect(stored.value?.editRevision).toBeGreaterThan(baseEdit)
  })

  it('reordenação e remoção voltando ao valor anterior conflitam (ABA estrutural)', async () => {
    const coordinator = openCoordinator(createProductFile())
    const created = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, {
          draft: draft({ subtasks: [{ title: 'A' }, { title: 'B' }] }),
          now: NOW,
          generateId: idGenerator('t', 's1', 's2'),
        }),
      ),
    )
    if (created.value.status !== 'CREATED') throw new Error('unexpected')
    const baseEdit = created.value.editRevision

    // A → B → A por outra superfície.
    const swap = await coordinator.run((unit) =>
      updateTaskInUnit(unit, {
        taskId: 't',
        expectedEditRevision: baseEdit,
        patch: { subtasks: [{ id: 's2', title: 'B' }, { id: 's1', title: 'A' }] },
        now: NOW,
        generateId: idGenerator(),
      }),
    )
    expect(swap.ok && swap.value.status === 'UPDATED').toBe(true)
    const back = await coordinator.run((unit) =>
      updateTaskInUnit(unit, {
        taskId: 't',
        expectedEditRevision: baseEdit,
        patch: { subtasks: [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }] },
        now: NOW,
        generateId: idGenerator(),
      }),
    )
    expect(back.ok && back.value.status === 'CONFLICT').toBe(true)
  })

  it('claim isolado conserva conteúdo/edição e não invalida o save aberto', async () => {
    const coordinator = openCoordinator(createProductFile())
    const created = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ dueAt: DUE }), now: NOW, generateId: idGenerator('alvo') })),
    )
    if (created.value.status !== 'CREATED') throw new Error('unexpected')

    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask('alvo')
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({ ...stored.task, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }] })
      }),
    )
    const before = await revisionsOf(coordinator, 'alvo')
    const trigger = new Date(Date.parse(DUE) - 60 * 60 * 1000).toISOString()
    const claimed = expectOk(
      await coordinator.run((unit) => unit.claimReminderOccurrence({ taskId: 'alvo', reminderId: 'r1', processedFor: trigger })),
    )
    expect(claimed.value).toBe(true)
    const after = await revisionsOf(coordinator, 'alvo')
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.editRevision).toBe(before.editRevision)

    const edited = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'alvo',
          expectedEditRevision: before.editRevision,
          patch: { description: 'editada com lembretes' },
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(edited.value.status).toBe('UPDATED')
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('alvo')))
    expect(stored.value?.task.reminders[0]?.processedFor).toBe(trigger)
  })
})

describe('comandos de tarefas na unidade: fechamento, geração e série', () => {
  it('DONE/SKIP fecham e geram no mesmo commit; END não gera; antes+próxima juntas', async () => {
    const coordinator = openCoordinator(createProductFile())
    const carrier = buildTask({
      id: 'portadora',
      title: 'Recorrente',
      description: 'Descrição',
      priority: 'HIGH',
      dueAt: '2026-10-10T10:00:00.000Z',
      seriesId: 'serie-1',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      tags: ['ação'],
      subtasks: [
        { id: 's1', title: 'A', done: true },
        { id: 's2', title: 'B', done: false },
      ],
    })
    expectOk(await coordinator.run((unit) => unit.saveTask(carrier)))
    const base = await revisionsOf(coordinator, 'portadora')

    const result = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'portadora',
          expectedEditRevision: base.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator('proxima', 'novo-s1', 'novo-s2'),
        }),
      ),
    )
    expect(result.value.status).toBe('UPDATED')

    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(2)
    const closed = tasks.find((stored) => stored.task.id === 'portadora')
    const next = tasks.find((stored) => stored.task.id === 'proxima')
    expect(closed?.task.recurrence).toBeUndefined()
    expect(closed?.task.seriesId).toBe('serie-1')
    expect(closed?.task.status).toBe('DONE')
    expect(closed?.task.completedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(next?.task.status).toBe('TODO')
    expect(next?.task.seriesId).toBe('serie-1')
    expect(next?.task.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect(next?.task.dueAt).toBe('2026-10-11T10:00:00.000Z')
    expect(next?.task.subtasks).toEqual([
      { id: 'novo-s1', title: 'A', done: false },
      { id: 'novo-s2', title: 'B', done: false },
    ])
    // Um único commit: as duas linhas compartilham a revisão global confirmada.
    expect(closed?.contentRevision).toBe(result.revision)
    expect(next?.contentRevision).toBe(result.revision)
  })

  it('END fecha CANCELLED sem gerar; escolha ausente não grava; escolha fora de plano é inválida', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(
          buildTask({ id: 'c', dueAt: DUE, seriesId: 'serie-c', recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
        ),
      ),
    )
    const base = await revisionsOf(coordinator, 'c')
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const missing = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, { taskId: 'c', expectedEditRevision: base.editRevision, status: 'CANCELLED', now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(missing.value).toEqual({ status: 'RECURRENCE_CHOICE_REQUIRED' })
    expect(missing.committed).toBe(false)

    const ended = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'c',
          expectedEditRevision: base.editRevision,
          status: 'CANCELLED',
          cancellation: 'END',
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(ended.value.status).toBe('UPDATED')
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.task.status).toBe('CANCELLED')
    expect(tasks[0]?.task.recurrence).toBeUndefined()
    expect(tasks[0]?.task.seriesId).toBe('serie-c')

    // Escolha em plano não pertinente (DONE simples) é INVALID_REQUEST sem write.
    expectOk(await coordinator.run((unit) => unit.saveTask(buildTask({ id: 'simples' }))))
    const simple = await revisionsOf(coordinator, 'simples')
    const extrinsic = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'simples',
          expectedEditRevision: simple.editRevision,
          status: 'DONE',
          cancellation: 'SKIP',
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(extrinsic.value).toEqual({ status: 'INVALID_REQUEST' })
    expect(extrinsic.committed).toBe(false)
  })

  it('SKIP em CANCELLED gera a próxima; fim natural remove a regra sem inventar série', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(
          buildTask({
            id: 'ate',
            dueAt: '2026-10-09T10:00:00.000Z',
            seriesId: 'serie-ate',
            recurrence: { frequency: 'DAILY', intervalDays: 1, until: DUE },
          }),
        ),
      ),
    )
    const base = await revisionsOf(coordinator, 'ate')
    // Candidato exatamente em until (10/10): gera.
    const closed = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'ate',
          expectedEditRevision: base.editRevision,
          status: 'CANCELLED',
          cancellation: 'SKIP',
          now: NOW,
          generateId: idGenerator('ate-2'),
        }),
      ),
    )
    expect(closed.value.status).toBe('UPDATED')
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(2)

    // Fecha a gerada (until já vencido pelo relógio): sem candidato, perde a regra e não gera.
    const second = await revisionsOf(coordinator, 'ate-2')
    const ended = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'ate-2',
          expectedEditRevision: second.editRevision,
          status: 'CANCELLED',
          cancellation: 'SKIP',
          now: new Date('2026-10-12T12:00:00.000Z'),
          generateId: idGenerator('nunca'),
        }),
      ),
    )
    expect(ended.value.status).toBe('UPDATED')
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(2)
    expect(tasks.find((stored) => stored.task.id === 'ate-2')?.task.recurrence).toBeUndefined()
  })

  it('editar terminal com regra fecha/gera; criar terminal não gera; reabrir não recupera regra', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(
          buildTask({
            id: 't-done',
            status: 'DONE',
            completedAt: '2026-10-01T10:00:00.000Z',
            dueAt: DUE,
            seriesId: 'serie-d',
            recurrence: { frequency: 'DAILY', intervalDays: 2 },
          }),
        ),
      ),
    )
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(1)

    const base = await revisionsOf(coordinator, 't-done')
    const edited = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 't-done',
          expectedEditRevision: base.editRevision,
          patch: { title: 'Editada' },
          now: NOW,
          generateId: idGenerator('gerada-d'),
        }),
      ),
    )
    expect(edited.value.status).toBe('UPDATED')
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(2)
    const closed = tasks.find((stored) => stored.task.id === 't-done')
    expect(closed?.task.recurrence).toBeUndefined()
    expect(closed?.task.completedAt).toBeDefined()

    // Reabrir a antiga conserva série e subtarefas, sem recolocar a regra nem gerar.
    const closedRevisions = await revisionsOf(coordinator, 't-done')
    const reopened = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 't-done',
          expectedEditRevision: closedRevisions.editRevision,
          status: 'TODO',
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(reopened.value.status).toBe('UPDATED')
    const after = expectOk(await coordinator.read((reader) => reader.getTask('t-done')))
    expect(after.value?.task.status).toBe('TODO')
    expect(after.value?.task.completedAt).toBeUndefined()
    expect(after.value?.task.recurrence).toBeUndefined()
    expect(after.value?.task.seriesId).toBe('serie-d')
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(2)
  })

  it('out-of-range/resource limit recusam sem mudar regra/status/dados', async () => {
    const coordinator = openCoordinator(createProductFile())
    const maxIso = new Date(8_640_000_000_000_000).toISOString()
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(
          buildTask({ id: 'extremo', dueAt: maxIso, seriesId: 'serie-x', recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
        ),
      ),
    )
    const base = await revisionsOf(coordinator, 'extremo')
    const result = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'extremo',
          expectedEditRevision: base.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator('nao-deve'),
        }),
      ),
    )
    expect(result.value).toEqual({ status: 'RECURRENCE_OUT_OF_RANGE' })
    expect(result.committed).toBe(false)
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('extremo')))
    expect(stored.value?.task.status).toBe('TODO')
    expect(stored.value?.task.recurrence).toBeDefined()
    expect(stored.value?.editRevision).toBe(base.editRevision)
  })

  it('duas sessões fecham a mesma base: só a primeira aplica; a segunda conflita', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(buildTask({ id: 'sinc', dueAt: DUE, seriesId: 'serie-s', recurrence: { frequency: 'DAILY', intervalDays: 1 } })),
      ),
    )
    const base = await revisionsOf(coordinator, 'sinc')
    const first = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'sinc',
          expectedEditRevision: base.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator('sinc-2'),
        }),
      ),
    )
    expect(first.value.status).toBe('UPDATED')
    const second = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'sinc',
          expectedEditRevision: base.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator('sinc-3'),
        }),
      ),
    )
    expect(second.value).toMatchObject({ status: 'CONFLICT' })
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks.map((stored) => stored.task.id).sort()).toEqual(['sinc', 'sinc-2'])
  })

  it('portadora duplicada histórica (inclusive lixeira) recusa mutação de regra/prazo/fechamento', async () => {
    const coordinator = openCoordinator(createProductFile())
    const rule = { frequency: 'DAILY', intervalDays: 1 } as const
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(buildTask({ id: 'car-1', dueAt: DUE, seriesId: 'serie-dup', recurrence: rule })),
      ),
    )
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(buildTask({ id: 'car-2', dueAt: DUE, seriesId: 'serie-dup', recurrence: { ...rule, intervalDays: 2 } })),
      ),
    )
    // Leitura continua íntegra e edição independente/marcação continuam possíveis nas duas.
    const one = await revisionsOf(coordinator, 'car-1')
    const rename = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'car-1',
          expectedEditRevision: one.editRevision,
          patch: { title: 'Independente' },
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(rename.value.status).toBe('UPDATED')

    // Mudar prazo/regra e fechar recusam com SERIES_CONFLICT sem reparação.
    const afterRename = await revisionsOf(coordinator, 'car-1')
    const dueChange = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'car-1',
          expectedEditRevision: afterRename.editRevision,
          patch: { dueAt: '2026-10-20T10:00:00.000Z' },
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(dueChange.value).toEqual({ status: 'SERIES_CONFLICT' })
    expect(dueChange.committed).toBe(false)

    const close = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'car-1',
          expectedEditRevision: afterRename.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(close.value).toEqual({ status: 'SERIES_CONFLICT' })

    // Portadora na lixeira também conta.
    expectOk(await coordinator.run((unit) => unit.moveToTrash('car-2', DELETED_AT)))
    const closeAgain = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'car-1',
          expectedEditRevision: afterRename.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(closeAgain.value).toEqual({ status: 'SERIES_CONFLICT' })
  })

  it('falha entre escritas de fechamento reverte as duas e conserva a revisão anterior', async () => {
    const armed = { value: false }
    const coordinator = openCoordinator(createProductFile(), {
      faults: {
        at: (point) => {
          if (armed.value && point === 'unit:before-commit') throw new Error('fixture: falha antes do commit')
        },
      },
    })
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(buildTask({ id: 'falha', dueAt: DUE, seriesId: 'serie-f', recurrence: { frequency: 'DAILY', intervalDays: 1 } })),
      ),
    )
    const before = await revisionsOf(coordinator, 'falha')
    const revisionBefore = coordinator.confirmedRevision

    armed.value = true
    const failed = await coordinator.run((unit) =>
      changeTaskStatusInUnit(unit, {
        taskId: 'falha',
        expectedEditRevision: before.editRevision,
        status: 'DONE',
        now: NOW,
        generateId: idGenerator('meia'),
      }),
    )
    expect(failed.ok).toBe(false)
    armed.value = false

    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.task.status).toBe('TODO')
    expect(tasks[0]?.task.recurrence).toBeDefined()
    expect(tasks[0]?.contentRevision).toBe(before.contentRevision)
    expect(coordinator.confirmedRevision).toBe(revisionBefore)
  })

  it('gerador de ID da próxima colidente recusa com IDENTITY_CONFLICT sem meia geração', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(buildTask({ id: 'col', dueAt: DUE, seriesId: 'serie-col', recurrence: { frequency: 'DAILY', intervalDays: 1 } })),
      ),
    )
    const base = await revisionsOf(coordinator, 'col')
    const result = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'col',
          expectedEditRevision: base.editRevision,
          status: 'DONE',
          now: NOW,
          generateId: idGenerator('col'),
        }),
      ),
    )
    expect(result.value).toEqual({ status: 'IDENTITY_CONFLICT' })
    expect(result.committed).toBe(false)
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('col')))
    expect(stored.value?.task.status).toBe('TODO')
    expect(stored.value?.task.recurrence).toBeDefined()
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value).toHaveLength(1)
  })
})

describe('comandos de tarefas na unidade: subtarefas e guarda D8', () => {
  it('marcação muda só done/updatedAt, conserva edição e funciona nos quatro status', async () => {
    const coordinator = openCoordinator(createProductFile())
    const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const

    for (const [index, status] of statuses.entries()) {
      const id = `marca-${index}`
      expectOk(
        await coordinator.run((unit) =>
          unit.saveTask(
            buildTask({
              id,
              status,
              subtasks: [
                { id: 's1', title: 'A', done: false },
                { id: 's2', title: 'B', done: true },
              ],
            }),
          ),
        ),
      )
      const before = await revisionsOf(coordinator, id)
      const result = expectOk(
        await coordinator.run((unit) =>
          setSubtaskDoneInUnit(unit, { taskId: id, expectedEditRevision: before.editRevision, subtaskId: 's1', done: true, now: NOW }),
        ),
      )
      expect(result.value).toMatchObject({ status: 'UPDATED', editRevision: before.editRevision })
      const stored = expectOk(await coordinator.read((reader) => reader.getTask(id)))
      expect(stored.value?.task.subtasks).toEqual([
        { id: 's1', title: 'A', done: true },
        { id: 's2', title: 'B', done: true },
      ])
      expect(stored.value?.task.status).toBe(status)
      expect(stored.value?.contentRevision).toBeGreaterThan(before.contentRevision)
      expect(stored.value?.editRevision).toBe(before.editRevision)
      expect(stored.value?.task.updatedAt).toBe('2026-10-04T12:00:00.000Z')
    }
  })

  it('no-op, item ausente e base estrutural stale são seguros', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(buildTask({ id: 't', subtasks: [{ id: 's1', title: 'A', done: true }] })),
      ),
    )
    const base = await revisionsOf(coordinator, 't')
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const noop = expectOk(
      await coordinator.run((unit) =>
        setSubtaskDoneInUnit(unit, { taskId: 't', expectedEditRevision: base.editRevision, subtaskId: 's1', done: true, now: NOW }),
      ),
    )
    expect(noop.value.status).toBe('UNCHANGED')
    expect(noop.committed).toBe(false)
    expect(events).toEqual([])

    const missing = expectOk(
      await coordinator.run((unit) =>
        setSubtaskDoneInUnit(unit, { taskId: 't', expectedEditRevision: base.editRevision, subtaskId: 's9', done: false, now: NOW }),
      ),
    )
    expect(missing.value).toEqual({ status: 'SUBTASK_NOT_FOUND' })

    // Uma edição estrutural invalida a base de edição.
    const structural = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 't',
          expectedEditRevision: base.editRevision,
          patch: { subtasks: [{ id: 's1', title: 'A renomeada' }] },
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(structural.value.status).toBe('UPDATED')
    const stale = expectOk(
      await coordinator.run((unit) =>
        setSubtaskDoneInUnit(unit, { taskId: 't', expectedEditRevision: base.editRevision, subtaskId: 's1', done: false, now: NOW }),
      ),
    )
    expect(stale.value).toMatchObject({ status: 'CONFLICT' })
    if (stale.value.status === 'CONFLICT') expect(stale.value.currentEditRevision).toBeGreaterThan(base.editRevision)
  })

  it('M05: prazo/status e geração com OFFSET conservam marcadores e identidades próprias', async () => {
    const coordinator = openCoordinator(createProductFile())
    const original = buildTask({ id: 'lem', dueAt: DUE, seriesId: 'serie-l', recurrence: { frequency: 'DAILY', intervalDays: 1 }, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 10 }] })
    expectOk(await coordinator.run(unit => unit.saveTask(original)))
    let base = await revisionsOf(coordinator, 'lem')
    const edited = expectOk(await coordinator.run(unit => updateTaskInUnit(unit, { taskId: 'lem', expectedEditRevision: base.editRevision, patch: { dueAt: '2026-10-11T10:00:00.000Z' }, now: NOW, generateId: idGenerator() })))
    expect(edited.value.status).toBe('UPDATED')
    base = await revisionsOf(coordinator, 'lem')
    const closed = expectOk(await coordinator.run(unit => changeTaskStatusInUnit(unit, { taskId: 'lem', expectedEditRevision: base.editRevision, status: 'DONE', now: NOW, generateId: idGenerator('new-task', 'new-reminder') })))
    expect(closed.value.status).toBe('UPDATED')
    const rows = expectOk(await coordinator.read(reader => [...reader.iterateTasks(undefined)]))
    expect(rows.value).toHaveLength(2)
    const old = rows.value.find(row => row.task.id === 'lem')?.task
    const generated = rows.value.find(row => row.task.id !== 'lem')?.task
    expect(old?.recurrence).toBeUndefined()
    expect(old?.reminders).toEqual(original.reminders)
    expect(generated?.status).toBe('TODO')
    expect(generated?.reminders[0]?.id).not.toBe('r')
    expect(generated?.reminders[0]?.processedFor).toBeUndefined()
    expect(generated?.reminders[0]).toMatchObject({ type: 'OFFSET', offsetMinutes: 10 })
  })

  it('mudar outra tarefa não gera falso conflito', async () => {
    const coordinator = openCoordinator(createProductFile())
    const target = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: 'Alvo' }), now: NOW, generateId: idGenerator('alvo') })),
    )
    if (target.value.status !== 'CREATED') throw new Error('unexpected')

    expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: 'Outra' }), now: NOW, generateId: idGenerator('outra') })),
    )

    const edited = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'alvo',
          expectedEditRevision: target.value.status === 'CREATED' ? target.value.editRevision : 0n,
          patch: { description: 'editada' },
          now: NOW,
          generateId: idGenerator(),
        }),
      ),
    )
    expect(edited.value.status).toBe('UPDATED')
  })

  it('valores históricos excessivos sobrevivem à edição que não os altera', async () => {
    const coordinator = openCoordinator(createProductFile())
    const longDescription = `#${'á'.repeat(19_999)}`
    const longSourceUrl = `https://example.invalid/${'x'.repeat(3000)}`
    expectOk(
      await coordinator.run((unit) => unit.saveTask(buildTask({ id: 'hist', description: longDescription, sourceUrl: longSourceUrl }))),
    )
    const base = await revisionsOf(coordinator, 'hist')

    const result = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'hist', expectedEditRevision: base.editRevision, patch: { title: 'Editada' }, now: NOW, generateId: idGenerator() }),
      ),
    )
    expect(result.value.status).toBe('UPDATED')
    const after = expectOk(await coordinator.read((reader) => reader.getTask('hist')))
    expect(after.value?.task.description).toBe(longDescription)
    expect(after.value?.task.sourceUrl).toBe(longSourceUrl)
    expect(after.value?.task.updatedAt).toBe('2026-10-04T12:00:00.000Z')
  })
})
