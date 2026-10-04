import { afterEach, describe, expect, it } from 'vitest'
import { changeTaskStatusInUnit, createTaskInUnit, updateTaskInUnit } from '../../src/application/tasks/task-commands.js'
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

describe('comandos de tarefas na unidade', () => {
  it('cria com identidade/relógio injetados e devolve a revisão de conteúdo', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ status: 'DONE', tags: ['A', 'a'] }), now: NOW, generateId: idGenerator('novo-1') }),
      ),
    )
    expect(result.value).toEqual({ status: 'CREATED', taskId: 'novo-1', contentRevision: result.revision })
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

  it('validação falha sem gravar nem confirmar', async () => {
    const coordinator = openCoordinator(createProductFile())
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    const result = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: '   ' }), now: NOW, generateId: idGenerator('x') })),
    )
    expect(result.value).toEqual({ status: 'VALIDATION_FAILED', fields: { title: 'REQUIRED' } })
    expect(result.committed).toBe(false)
    expect(events).toEqual([])
    expect(expectOk(await coordinator.read((reader) => reader.listTasks())).value.length).toBe(0)
  })

  it('colisão de identidade em tarefas ou lixeira nunca sobrescreve: tenta outra e falha segura', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: 'Primeira' }), now: NOW, generateId: idGenerator('colide') })),
    )
    expectOk(await coordinator.run((unit) => unit.moveToTrash('colide', DELETED_AT)))

    // Mesmo ID na lixeira: recusado; segunda tentativa usa ID novo.
    const second = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Segunda' }), now: NOW, generateId: idGenerator('colide', 'novo-id') }),
      ),
    )
    expect(second.value).toMatchObject({ status: 'CREATED', taskId: 'novo-id' })

    // Três colisões seguidas: RESOURCE_LIMIT sem commit e sem evento novo.
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    const exhausted = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Terceira' }), now: NOW, generateId: idGenerator('colide') }),
      ),
    )
    expect(exhausted.value).toEqual({ status: 'RESOURCE_LIMIT' })
    expect(exhausted.committed).toBe(false)
    expect(events).toEqual([])

    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    const trash = expectOk(await coordinator.read((reader) => reader.listTrash())).value
    expect(tasks.map((stored) => stored.task.title).sort()).toEqual(['Segunda'])
    expect(trash.map((item) => item.task.title)).toEqual(['Primeira'])
  })

  it('edita por CAS, recusa base antiga e conserva a revisão atual no conflito', async () => {
    const coordinator = openCoordinator(createProductFile())
    const created = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft(), now: NOW, generateId: idGenerator('a') })),
    )
    if (created.value.status !== 'CREATED') throw new Error('unexpected')
    const base = created.value.contentRevision

    const updated = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedContentRevision: base, patch: { title: 'Editada' }, now: NOW }),
      ),
    )
    expect(updated.value.status).toBe('UPDATED')

    const conflict = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedContentRevision: base, patch: { title: 'Stale' }, now: NOW }),
      ),
    )
    expect(conflict.value).toMatchObject({ status: 'CONFLICT' })
    if (conflict.value.status === 'CONFLICT') expect(conflict.value.currentRevision).toBe(updated.revision)

    const stored = expectOk(await coordinator.read((reader) => reader.getTask('a')))
    expect(stored.value?.task.title).toBe('Editada')
  })

  it('tarefa ausente retorna NOT_FOUND e não é recriada', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'inexistente', expectedContentRevision: 1n, patch: { title: 'x' }, now: NOW }),
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
        updateTaskInUnit(unit, {
          taskId: 'a',
          expectedContentRevision: created.value.status === 'CREATED' ? created.value.contentRevision : 0n,
          patch: {},
          now: NOW,
        }),
      ),
    )
    expect(noop.value).toMatchObject({ status: 'UNCHANGED' })
    expect(noop.committed).toBe(false)
    expect(noop.revision).toBe(revisionBefore)
    expect(events).toEqual([])

    // Status igual com base válida também é no-op.
    const sameStatus = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 'a',
          expectedContentRevision: created.value.status === 'CREATED' ? created.value.contentRevision : 0n,
          status: 'TODO',
          now: NOW,
        }),
      ),
    )
    expect(sameStatus.value).toMatchObject({ status: 'UNCHANGED' })
    expect(sameStatus.committed).toBe(false)
    expect(events).toEqual([])

    // Status igual com base stale não é no-op: a revisão é verificada primeiro.
    const stale = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, { taskId: 'a', expectedContentRevision: revisionBefore, status: 'TODO', now: NOW }),
      ),
    )
    expect(stale.value).toMatchObject({ status: 'UNCHANGED' })
    expect(stale.committed).toBe(false)
  })

  it('reintroduzir ID removido aloca revisão nova: base antiga não autoriza (sem ABA)', async () => {
    const coordinator = openCoordinator(createProductFile())
    const first = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft(), now: NOW, generateId: idGenerator('a') })),
    )
    if (first.value.status !== 'CREATED') throw new Error('unexpected')
    const firstRevision = first.value.contentRevision
    expectOk(await coordinator.run((unit) => unit.deleteTask('a')))
    const second = expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft({ title: 'Nova' }), now: NOW, generateId: idGenerator('a') })),
    )
    if (second.value.status !== 'CREATED') throw new Error('unexpected')
    expect(second.value.contentRevision).toBeGreaterThan(firstRevision)

    const stale = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'a', expectedContentRevision: firstRevision, patch: { title: 'Stale' }, now: NOW }),
      ),
    )
    expect(stale.value).toMatchObject({ status: 'CONFLICT' })
  })

  it('mudar outra tarefa ou claim isolado não gera falso conflito', async () => {
    const coordinator = openCoordinator(createProductFile())
    const target = expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ dueAt: DUE, title: 'Alvo' }), now: NOW, generateId: idGenerator('alvo') }),
      ),
    )
    if (target.value.status !== 'CREATED') throw new Error('unexpected')

    // Outra tarefa muda: a revisão de conteúdo do alvo permanece.
    expectOk(
      await coordinator.run((unit) => createTaskInUnit(unit, { draft: draft(), now: NOW, generateId: idGenerator('outra') })),
    )

    // Inserimos um lembrete e registramos a ocorrência: claim muda só a revisão global.
    const trigger = new Date(Date.parse(DUE) - 60 * 60 * 1000).toISOString()
    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask('alvo')
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({ ...stored.task, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }] })
      }),
    )
    const withReminder = expectOk(await coordinator.read((reader) => reader.getTask('alvo')))
    const reminderRevision = withReminder.value?.contentRevision
    if (reminderRevision === undefined) throw new Error('missing revision')
    const claimed = expectOk(
      await coordinator.run((unit) => unit.claimReminderOccurrence({ taskId: 'alvo', reminderId: 'r1', processedFor: trigger })),
    )
    expect(claimed.value).toBe(true)
    expect(claimed.revision).toBeGreaterThan(reminderRevision)

    const edited = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'alvo',
          expectedContentRevision: reminderRevision,
          patch: { description: 'editada com lembretes' },
          now: NOW,
        }),
      ),
    )
    expect(edited.value.status).toBe('UPDATED')
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('alvo')))
    expect(stored.value?.task.reminders[0]?.processedFor).toBe(trigger)
  })

  it('recorrência presente bloqueia mutação; lembretes bloqueiam prazo/status efetivos', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Recorrente' }), now: NOW, generateId: idGenerator('rec') }),
      ),
    )
    // Série/recorrência não entram pelo comando; inserimos via primitive para o cenário de dados.
    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask('rec')
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({
          ...stored.task,
          seriesId: 'serie',
          recurrence: { frequency: 'DAILY', intervalDays: 1 },
          dueAt: DUE,
        })
      }),
    )
    const recorded = expectOk(await coordinator.read((reader) => reader.getTask('rec')))
    const revision = recorded.value?.contentRevision
    if (revision === undefined) throw new Error('missing')

    const updateBlocked = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'rec', expectedContentRevision: revision, patch: { description: 'x' }, now: NOW }),
      ),
    )
    expect(updateBlocked.value).toEqual({ status: 'ADVANCED_TASK_RESTRICTED' })
    expect(updateBlocked.committed).toBe(false)

    const statusBlocked = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, { taskId: 'rec', expectedContentRevision: revision, status: 'DONE', now: NOW }),
      ),
    )
    expect(statusBlocked.value).toEqual({ status: 'ADVANCED_TASK_RESTRICTED' })

    // Tarefa com lembretes: edição independente é aceita; prazo e status efetivos são recusados.
    expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Lembrete', dueAt: DUE }), now: NOW, generateId: idGenerator('lem') }),
      ),
    )
    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask('lem')
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({ ...stored.task, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 10 }] })
      }),
    )
    const reminderStored = expectOk(await coordinator.read((reader) => reader.getTask('lem')))
    const reminderRevision = reminderStored.value?.contentRevision
    if (reminderRevision === undefined) throw new Error('missing')

    const dueBlocked = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'lem',
          expectedContentRevision: reminderRevision,
          patch: { dueAt: '2026-10-11T10:00:00.000Z' },
          now: NOW,
        }),
      ),
    )
    expect(dueBlocked.value).toEqual({ status: 'ADVANCED_TASK_RESTRICTED' })

    const statusBlocked2 = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, { taskId: 'lem', expectedContentRevision: reminderRevision, status: 'CANCELLED', now: NOW }),
      ),
    )
    expect(statusBlocked2.value).toEqual({ status: 'ADVANCED_TASK_RESTRICTED' })

    const independent = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, {
          taskId: 'lem',
          expectedContentRevision: reminderRevision,
          patch: { title: 'Título novo', requester: 'Ana' },
          now: NOW,
        }),
      ),
    )
    expect(independent.value.status).toBe('UPDATED')
    const afterIndependent = expectOk(await coordinator.read((reader) => reader.getTask('lem')))
    expect(afterIndependent.value?.task.reminders).toEqual(reminderStored.value?.task.reminders)
  })

  it('valores históricos excessivos sobrevivem à edição que não os altera', async () => {
    const coordinator = openCoordinator(createProductFile())
    const longDescription = `#${'á'.repeat(19_999)}`
    const longSourceUrl = `https://example.invalid/${'x'.repeat(3000)}`
    // Registro histórico gravado pela primitive: o codec aceita; o formulário não é aplicado retroativamente.
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask({
          ...buildTask({ id: 'hist', description: longDescription, sourceUrl: longSourceUrl }),
        }),
      ),
    )
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('hist')))
    const revision = stored.value?.contentRevision
    if (revision === undefined) throw new Error('missing')

    const result = expectOk(
      await coordinator.run((unit) =>
        updateTaskInUnit(unit, { taskId: 'hist', expectedContentRevision: revision, patch: { title: 'Editada' }, now: NOW }),
      ),
    )
    expect(result.value.status).toBe('UPDATED')
    const after = expectOk(await coordinator.read((reader) => reader.getTask('hist')))
    expect(after.value?.task.description).toBe(longDescription)
    expect(after.value?.task.sourceUrl).toBe(longSourceUrl)
    expect(after.value?.task.updatedAt).toBe('2026-10-04T12:00:00.000Z')
  })

  it('falha no commit reverte a unidade e devolve erro seguro, sem commit parcial', async () => {
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
        createTaskInUnit(unit, { draft: draft({ title: 'Base' }), now: NOW, generateId: idGenerator('base') }),
      ),
    )
    const before = expectOk(await coordinator.read((reader) => reader.getTask('base')))
    const revision = before.value?.contentRevision
    if (revision === undefined) throw new Error('missing')

    armed.value = true
    const failed = await coordinator.run((unit) =>
      updateTaskInUnit(unit, { taskId: 'base', expectedContentRevision: revision, patch: { title: 'Não deve gravar' }, now: NOW }),
    )
    expect(failed.ok).toBe(false)
    armed.value = false

    const after = expectOk(await coordinator.read((reader) => reader.getTask('base')))
    expect(after.value?.task.title).toBe('Base')
    expect(after.value?.contentRevision).toBe(revision)
  })

  it('status simples registra/limpa completedAt e subtarefas não interferem', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(
      await coordinator.run((unit) =>
        createTaskInUnit(unit, { draft: draft({ title: 'Simples' }), now: NOW, generateId: idGenerator('s') }),
      ),
    )
    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask('s')
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({ ...stored.task, subtasks: [{ id: 'st1', title: 'Passo', done: false }] })
      }),
    )
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('s')))
    const revision = stored.value?.contentRevision
    if (revision === undefined) throw new Error('missing')

    const done = expectOk(
      await coordinator.run((unit) => changeTaskStatusInUnit(unit, { taskId: 's', expectedContentRevision: revision, status: 'DONE', now: NOW })),
    )
    expect(done.value.status).toBe('UPDATED')
    const afterDone = expectOk(await coordinator.read((reader) => reader.getTask('s')))
    expect(afterDone.value?.task.completedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(afterDone.value?.task.subtasks[0]?.done).toBe(false)

    const reopen = expectOk(
      await coordinator.run((unit) =>
        changeTaskStatusInUnit(unit, {
          taskId: 's',
          expectedContentRevision: afterDone.value?.contentRevision ?? 0n,
          status: 'TODO',
          now: NOW,
        }),
      ),
    )
    expect(reopen.value.status).toBe('UPDATED')
    const afterReopen = expectOk(await coordinator.read((reader) => reader.getTask('s')))
    expect(afterReopen.value?.task.completedAt).toBeUndefined()
  })
})
