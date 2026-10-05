import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeTaskCarrierSummary } from '../../src/application/storage/stored-task-codec.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'
import { buildTask } from '../support/task-fixtures.js'

// Tabela D4: classificação das revisões (conteúdo x edição) nas primitivas de armazenamento.

afterEach(cleanupStorage)

const NOW = new Date('2026-10-04T12:00:00.000Z')
const DUE = '2026-10-10T10:00:00.000Z'
const DELETED_AT = '2026-10-03T08:00:00.000Z'

async function revisionsOf(
  coordinator: ReturnType<typeof openCoordinator>,
  id: string,
): Promise<{ contentRevision: bigint; editRevision: bigint }> {
  const stored = expectOk(await coordinator.read((reader) => reader.getTask(id)))
  if (stored.value === undefined) throw new Error('tarefa ausente')
  return { contentRevision: stored.value.contentRevision, editRevision: stored.value.editRevision }
}

describe('revisões persistidas: criação, edição e marcação', () => {
  it('criar/editar estrutura avançam conteúdo e edição; marcação conserva a edição', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildTask({
      id: 't',
      dueAt: DUE,
      subtasks: [
        { id: 's1', title: 'A', done: false },
        { id: 's2', title: 'B', done: false },
      ],
    })
    const saved = expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    expect(saved.revision).toBe(1n)
    expect(await revisionsOf(coordinator, 't')).toEqual({ contentRevision: 1n, editRevision: 1n })

    // Edição genérica (título): ambas avançam para a mesma revisão global.
    const edited = expectOk(
      await coordinator.run((unit) => unit.updateTaskConditionally('t', 1n, (current) => ({ ...current, title: 'Editada' }))),
    )
    expect(edited.value).toMatchObject({ status: 'UPDATED', contentRevision: 2n, editRevision: 2n })

    // Marcação tipada: conteúdo (e global) avançam; a edição permanece em 2.
    const marked = expectOk(
      await coordinator.run((unit) => unit.markSubtaskDone('t', 2n, 's1', true, NOW)),
    )
    expect(marked.value).toMatchObject({ status: 'UPDATED', contentRevision: 3n, editRevision: 2n })
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('t')))
    expect(stored.value?.task.subtasks[0]?.done).toBe(true)
    expect(stored.value?.task.updatedAt).toBe('2026-10-04T12:00:00.000Z')
    expect(stored.value?.contentRevision).toBe(3n)
    expect(stored.value?.editRevision).toBe(2n)

    // Segunda marcação (valor já satisfeito) é no-op sem revisão nova.
    const noop = expectOk(await coordinator.run((unit) => unit.markSubtaskDone('t', 2n, 's1', true, NOW)))
    expect(noop.value).toEqual({ status: 'UNCHANGED', task: stored.value?.task, contentRevision: 3n, editRevision: 2n })
    expect(noop.committed).toBe(false)

    // Save com a revisão de edição 2 (anterior à marcação) ainda aplica sobre o done lido agora.
    const save = expectOk(
      await coordinator.run((unit) =>
        unit.updateTaskConditionally('t', 2n, (current) => ({
          ...current,
          title: 'Salva depois do check',
        })),
      ),
    )
    expect(save.value).toMatchObject({ status: 'UPDATED', contentRevision: 4n, editRevision: 4n })
    const afterSave = expectOk(await coordinator.read((reader) => reader.getTask('t')))
    expect(afterSave.value?.task.subtasks[0]?.done).toBe(true)
  })

  it('marcação com item ausente devolve SUBTASK_NOT_FOUND; base estrutural antiga conflita', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(buildTask({ id: 't', subtasks: [{ id: 's1', title: 'A', done: false }] }))))

    const missing = expectOk(await coordinator.run((unit) => unit.markSubtaskDone('t', 1n, 's9', true, NOW)))
    expect(missing.value.status).toBe('SUBTASK_NOT_FOUND')
    expect(missing.committed).toBe(false)

    const structural = expectOk(
      await coordinator.run((unit) => unit.updateTaskConditionally('t', 1n, (current) => ({ ...current, title: 'Estrutura' }))),
    )
    expect(structural.value.status).toBe('UPDATED')
    const stale = expectOk(await coordinator.run((unit) => unit.markSubtaskDone('t', 1n, 's1', true, NOW)))
    expect(stale.value).toEqual({ status: 'CONFLICT', currentContentRevision: 2n, currentEditRevision: 2n })
  })
})

describe('revisões persistidas: claim, lixeira e reversão', () => {
  it('claim conserva conteúdo/edição/updatedAt e só a global avança; edição vence quando muda', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildTask({
      id: 'lembrete',
      dueAt: DUE,
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
      updatedAt: '2026-10-01T11:00:00.000Z',
    })
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    const trigger = new Date(Date.parse(DUE) - 60 * 60 * 1000).toISOString()

    const claimed = expectOk(
      await coordinator.run((unit) => unit.claimReminderOccurrence({ taskId: 'lembrete', reminderId: 'r1', processedFor: trigger })),
    )
    expect(claimed.revision).toBe(2n)
    const stored = expectOk(await coordinator.read((reader) => reader.getTask('lembrete')))
    expect(stored.value?.contentRevision).toBe(1n)
    expect(stored.value?.editRevision).toBe(1n)
    expect(stored.value?.task.updatedAt).toBe('2026-10-01T11:00:00.000Z')
    expect(stored.value?.task.reminders[0]?.processedFor).toBe(trigger)

    // Edição baseada na mesma revisão de edição aplica e conserva o marcador atual.
    const edited = expectOk(
      await coordinator.run((unit) => unit.updateTaskConditionally('lembrete', 1n, (current) => ({ ...current, title: 'Editada' }))),
    )
    expect(edited.value).toMatchObject({ status: 'UPDATED', contentRevision: 3n, editRevision: 3n })
    const after = expectOk(await coordinator.read((reader) => reader.getTask('lembrete')))
    expect(after.value?.task.reminders[0]?.processedFor).toBe(trigger)
  })

  it('mover conserva as revisões; restaurar recebe conteúdo e edição novos', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildTask({ id: 't' })
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    expectOk(await coordinator.run((unit) => unit.moveToTrash('t', DELETED_AT)))

    const trashed = expectOk(await coordinator.read((reader) => reader.getTrashItem('t')))
    expect(trashed.value).toMatchObject({ contentRevision: 1n, editRevision: 1n })

    const restored = expectOk(await coordinator.run((unit) => unit.restoreFromTrash('t', (current) => current)))
    expect(restored.value).toMatchObject({ status: 'RESTORED', contentRevision: 3n, editRevision: 3n })
    const active = expectOk(await coordinator.read((reader) => reader.getTask('t')))
    expect(active.value).toMatchObject({ contentRevision: 3n, editRevision: 3n })
  })

  it('reversão condicional grava conteúdo/edição novos e remove a gerada no mesmo commit', async () => {
    const coordinator = openCoordinator(createProductFile())
    const previous = buildTask({ id: 'anterior' })
    const generated = buildTask({ id: 'gerada' })
    expectOk(await coordinator.run((unit) => unit.saveTask(previous)))
    expectOk(
      await coordinator.run((unit) => {
        unit.updateTaskConditionally('anterior', 1n, (current) => ({ ...current, title: 'Alterada' }))
        unit.saveTask(generated)
      }),
    )

    const reverted = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          {
            target: { id: 'anterior', expectedContentRevision: 2n },
            generated: { id: 'gerada', expectedContentRevision: 2n },
          },
          () => previous,
          NOW,
        ),
      ),
    )
    expect(reverted.value).toMatchObject({ status: 'REVERTED', contentRevision: 3n, editRevision: 3n })
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks.map((stored) => stored.task.id)).toEqual(['anterior'])
    expect(tasks[0]).toMatchObject({ contentRevision: 3n, editRevision: 3n })

    // Gerada alterada (conteúdo completo) bloqueia a reversão inteira, mesmo com as revisões
    // declaradas corretas para a ação original.
    expectOk(
      await coordinator.run((unit) => {
        unit.updateTaskConditionally('anterior', 3n, (current) => ({ ...current, title: 'Alterada de novo' }))
        unit.saveTask(generated)
      }),
    )
    expectOk(await coordinator.run((unit) => unit.updateTaskConditionally('gerada', 4n, (current) => ({ ...current, title: 'Gerada editada' }))))
    const blocked = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          { target: { id: 'anterior', expectedContentRevision: 4n }, generated: { id: 'gerada', expectedContentRevision: 4n } },
          () => previous,
          NOW,
        ),
      ),
    )
    expect(blocked.value).toEqual({ status: 'GENERATED_CHANGED' })
  })

  it('claim isolado da gerada não bloqueia a reversão por conteúdo completo', async () => {
    const coordinator = openCoordinator(createProductFile())
    const previous = buildTask({ id: 'anterior' })
    const generated = buildTask({
      id: 'gerada',
      dueAt: DUE,
      reminders: [{ id: 'rg', type: 'OFFSET', offsetMinutes: 60 }],
    })
    expectOk(await coordinator.run((unit) => unit.saveTask(previous)))
    expectOk(
      await coordinator.run((unit) => {
        unit.updateTaskConditionally('anterior', 1n, (current) => ({ ...current, title: 'Alterada' }))
        unit.saveTask(generated)
      }),
    )

    const trigger = new Date(Date.parse(DUE) - 60 * 60 * 1000).toISOString()
    const claimed = expectOk(
      await coordinator.run((unit) => unit.claimReminderOccurrence({ taskId: 'gerada', reminderId: 'rg', processedFor: trigger })),
    )
    expect(claimed.value).toBe(true)
    // Claim conserva a revisão de conteúdo: a reversão por conteúdo continua válida e remove a
    // gerada, sem disponibilizar undo/token/notificação.
    const reverted = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          { target: { id: 'anterior', expectedContentRevision: 2n }, generated: { id: 'gerada', expectedContentRevision: 2n } },
          () => previous,
          NOW,
        ),
      ),
    )
    expect(reverted.value).toMatchObject({ status: 'REVERTED' })
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks.map((stored) => stored.task.id)).toEqual(['anterior'])
  })
})

describe('resumos leves de portadora', () => {
  it('equivalem à leitura completa nas duas coleções e preservam série sem regra', async () => {
    const coordinator = openCoordinator(createProductFile())
    const carrier = buildTask({ id: 'c1', dueAt: DUE, seriesId: 'serie-1', recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    const reopened = buildTask({ id: 'r1', seriesId: 'serie-2' })
    const plain = buildTask({ id: 'p1' })
    expectOk(await coordinator.run((unit) => unit.saveTasks([carrier, reopened, plain])))
    expectOk(await coordinator.run((unit) => unit.moveToTrash('p1', DELETED_AT)))

    const read = expectOk(
      await coordinator.read((reader) => ({
        tasks: [...reader.iterateCarrierSummaries('tasks', undefined)],
        trash: [...reader.iterateCarrierSummaries('trash', undefined)],
        tasksFull: reader.listTasks().map((stored) => ({
          id: stored.task.id,
          seriesId: stored.task.seriesId,
          hasRecurrence: stored.task.recurrence !== undefined,
        })),
        trashFull: reader.listTrash().map((stored) => ({
          id: stored.task.id,
          seriesId: stored.task.seriesId,
          hasRecurrence: stored.task.recurrence !== undefined,
        })),
      })),
    )
    expect(read.value.tasks).toEqual(read.value.tasksFull)
    expect(read.value.trash).toEqual(read.value.trashFull)
    // Série sem regra (histórica reaberta) continua visível para a checagem de reutilização.
    expect(read.value.tasks.find((summary) => summary.id === 'r1')).toEqual({
      id: 'r1',
      seriesId: 'serie-2',
      hasRecurrence: false,
    })
  })

  it('recusa linha inválida em vez de omitir: id divergente, série vazia e regra não estruturada', () => {
    expect(
      decodeTaskCarrierSummary(JSON.stringify({ id: 'a', seriesId: 's', recurrence: { frequency: 'DAILY', intervalDays: 1 } }), 'a'),
    ).toEqual({ id: 'a', seriesId: 's', hasRecurrence: true })
    expect(decodeTaskCarrierSummary(JSON.stringify({ id: 'a', seriesId: 's' }), 'a')).toEqual({
      id: 'a',
      seriesId: 's',
      hasRecurrence: false,
    })
    expect(decodeTaskCarrierSummary(JSON.stringify({ id: 'a' }), 'a')).toEqual({
      id: 'a',
      seriesId: undefined,
      hasRecurrence: false,
    })

    for (const [payload, expected] of [
      ['{', 'a'],
      [JSON.stringify({ id: 'b' }), 'a'],
      [JSON.stringify({ id: 'a', seriesId: '' }), 'a'],
      [JSON.stringify({ id: 'a', recurrence: 7 }), 'a'],
      ['[]', 'a'],
    ] as const) {
      expect(() => decodeTaskCarrierSummary(payload, expected)).toThrowError('storage failure: INCOMPATIBLE_DATA')
    }
  })
})

describe('revisões persistidas: precisão e limite', () => {
  it('revisões acima da precisão JS permanecem exatas no banco e no transporte', async () => {
    const file = createProductFile()
    const coordinator = openCoordinator(file)
    expectOk(await coordinator.run((unit) => unit.saveTask(buildTask({ id: 't' }))))
    coordinator.shutdown()

    const beyondSafe = 9_007_199_254_740_993n // 2^53 + 1
    const raw = new DatabaseSync(file)
    raw.prepare('UPDATE taskflow_metadata SET global_revision = ?').run(beyondSafe)
    raw.close()

    const precise = openCoordinator(file)
    const saved = expectOk(await precise.run((unit) => unit.saveTask(buildTask({ id: 'u' }))))
    expect(saved.revision).toBe(beyondSafe + 1n)
    const stored = expectOk(await precise.read((reader) => reader.getTask('u')))
    expect(stored.value?.contentRevision).toBe(beyondSafe + 1n)
    expect(stored.value?.editRevision).toBe(beyondSafe + 1n)
    precise.shutdown()

    const check = new DatabaseSync(file)
    const metaStatement = check.prepare('SELECT global_revision FROM taskflow_metadata')
    metaStatement.setReadBigInts(true)
    const row = metaStatement.get() as { global_revision: bigint }
    const taskStatement = check.prepare('SELECT content_revision, edit_revision FROM tasks WHERE id = ?')
    taskStatement.setReadBigInts(true)
    const taskRow = taskStatement.get('u') as { content_revision: bigint; edit_revision: bigint }
    expect(row.global_revision).toBe(beyondSafe + 1n)
    expect(taskRow.content_revision).toBe(beyondSafe + 1n)
    expect(taskRow.edit_revision).toBe(beyondSafe + 1n)
    check.close()
  })
})
