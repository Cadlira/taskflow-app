import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_REVISION } from '../../src/application/storage/revisions.js'
import { storageFailureReasonOf, StorageFailure } from '../../src/application/storage/task-storage-error.js'
import type { TaskStorageUnit } from '../../src/application/storage/unit-of-work.js'
import type { Task } from '../../src/domain/task.js'
import { buildFictitiousTask, buildFictitiousTasks, buildMinimalFictitiousTask, fictitiousText } from '../../src/main/harness/fixtures.js'
import { QUEUE_LIMITS } from '../../src/main/storage/coordinator.js'
import type { StorageFaultPoint, StorageFaults } from '../../src/main/storage/product-database.js'
import { cleanupStorage, createProductFile, expectOk, failureReason, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)

const DELETED_AT = '2026-09-12T08:00:00.000Z'
const DUE = '2026-09-20T10:00:00.000Z'

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function reminderTask(overrides: Partial<Task> = {}): Task {
  return {
    ...buildMinimalFictitiousTask('lembrete'),
    dueAt: DUE,
    reminders: [
      { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
      { id: 'r2', type: 'AT', at: '2026-09-20T07:00:00.000Z' },
    ],
    ...overrides,
  }
}

/** Erro com a forma dos erros do node:sqlite — fault injection identificado. */
function sqliteFault(errcode: number): Error {
  return Object.assign(new Error('fixture: injected sqlite fault'), { code: 'ERR_SQLITE_ERROR', errcode })
}

function faultAt(point: StorageFaultPoint, error: () => Error, state: { armed: boolean }): StorageFaults {
  return {
    at: (reached) => {
      if (state.armed && reached === point) throw error()
    },
  }
}

async function readState(coordinator: ReturnType<typeof openCoordinator>): Promise<{
  tasks: Task[]
  trash: string[]
  revision: bigint
}> {
  const read = expectOk(
    await coordinator.read((reader) => ({
      tasks: reader.listTasks().map((stored) => stored.task),
      trash: reader.listTrash().map((item) => item.task.id),
      revision: reader.baseRevision,
    })),
  )
  return read.value
}

describe('unidade de trabalho coordenada', () => {
  it('produtores concorrentes decidem sobre o estado atual, sem resultado stale', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(buildMinimalFictitiousTask('contador'))))

    const append = (suffix: string) => (unit: TaskStorageUnit) => {
      const current = unit.getTask('contador')
      if (current === undefined) throw new StorageFailure('INVALID_DATA')
      unit.saveTask({ ...current.task, title: `${current.task.title}${suffix}` })
      return current.task.title
    }
    // Admitidos no mesmo turno, antes de qualquer execução: a fila é a barreira determinística.
    const [first, second, third] = await Promise.all([
      coordinator.run(append('+A')),
      coordinator.run(append('+B')),
      coordinator.run(append('+C')),
    ])

    expect(expectOk(first).value).toBe('Mínima fictícia')
    expect(expectOk(second).value).toBe('Mínima fictícia+A')
    expect(expectOk(third).value).toBe('Mínima fictícia+A+B')
    expect((await readState(coordinator)).tasks[0]?.title).toBe('Mínima fictícia+A+B+C')
    expect(expectOk(third).revision).toBe(4n)
  })

  it('falha na unidade reverte tudo: estado e revisão anteriores, sem evento', async () => {
    const coordinator = openCoordinator(createProductFile())
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))

    const failed = await coordinator.run((unit) => {
      unit.saveTask(buildFictitiousTask(2))
      unit.deleteTask(buildFictitiousTask(1).id)
      throw new StorageFailure('INVALID_DATA')
    })

    expect(failureReason(failed)).toBe('INVALID_DATA')
    const state = await readState(coordinator)
    expect(state.tasks.map((task) => task.id)).toEqual([buildFictitiousTask(1).id])
    expect(state.revision).toBe(1n)
    expect(events).toEqual([1n])
  })

  it('recusa enqueue recursivo e transação aninhada', async () => {
    const coordinator = openCoordinator(createProductFile())
    let nested: Promise<unknown> | undefined
    let nestedRead: Promise<unknown> | undefined

    const outer = await coordinator.run((unit) => {
      nested = coordinator.run((inner) => inner.saveTask(buildFictitiousTask(2)))
      nestedRead = coordinator.read((reader) => reader.listTasks())
      return unit.saveTask(buildFictitiousTask(1))
    })

    expect(expectOk(outer).value).toBe('CREATED')
    await expect(nested).resolves.toEqual({ ok: false, reason: 'INVALID_UNIT' })
    await expect(nestedRead).resolves.toEqual({ ok: false, reason: 'INVALID_UNIT' })
    expect((await readState(coordinator)).tasks.map((task) => task.id)).toEqual([buildFictitiousTask(1).id])
  })

  it('callback assíncrono é recusado e revertido: nenhum await externo dentro da transação', async () => {
    const coordinator = openCoordinator(createProductFile())
    const result = await coordinator.run((unit) => {
      unit.saveTask(buildFictitiousTask(1))
      return Promise.resolve('efeito externo')
    })

    expect(failureReason(result)).toBe('INVALID_UNIT')
    expect((await readState(coordinator)).tasks).toEqual([])
  })

  it('as portas da transação expiram com a unidade e a leitura não pode gravar', async () => {
    const coordinator = openCoordinator(createProductFile())
    let leaked: TaskStorageUnit | undefined
    expectOk(
      await coordinator.run((unit) => {
        leaked = unit
        return unit.saveTask(buildFictitiousTask(1))
      }),
    )

    expect(() => leaked?.listTasks()).toThrowError(StorageFailure)
    expect(() => leaked?.saveTask(buildFictitiousTask(2))).toThrowError(StorageFailure)

    const writeFromRead = await coordinator.read((reader) => (reader as TaskStorageUnit).saveTask(buildFictitiousTask(3)))
    expect(failureReason(writeFromRead)).toBe('INVALID_UNIT')
    expect((await readState(coordinator)).tasks).toHaveLength(1)
  })
})

describe('primitives de tarefas', () => {
  it('save cria, altera e reconhece no-op; cada commit incrementa a revisão uma vez', async () => {
    const coordinator = openCoordinator(createProductFile())
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    const task = buildFictitiousTask(1)

    const created = expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    const unchanged = expectOk(await coordinator.run((unit) => unit.saveTask({ ...task })))
    const updated = expectOk(await coordinator.run((unit) => unit.saveTask({ ...task, title: 'Alterada' })))

    expect([created.value, unchanged.value, updated.value]).toEqual(['CREATED', 'UNCHANGED', 'UPDATED'])
    expect([created.committed, unchanged.committed, updated.committed]).toEqual([true, false, true])
    expect([created.revision, unchanged.revision, updated.revision]).toEqual([1n, 1n, 2n])
    expect(events).toEqual([1n, 2n])
  })

  it('saveMany confirma todos no mesmo commit e com a mesma revisão de conteúdo', async () => {
    const coordinator = openCoordinator(createProductFile())
    const tasks = buildFictitiousTasks(25)
    const saved = expectOk(await coordinator.run((unit) => unit.saveTasks(tasks)))
    const read = expectOk(await coordinator.read((reader) => reader.listTasks()))

    expect(saved.revision).toBe(1n)
    expect(read.value.map((stored) => stored.task)).toEqual(tasks)
    expect(new Set(read.value.map((stored) => stored.contentRevision))).toEqual(new Set([1n]))
  })

  it('saveMany com registro inválido ou falha entre registros não persiste nenhum', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    const invalid = { ...buildFictitiousTask(4), status: 'ARCHIVED' } as unknown as Task

    const rejected = await coordinator.run((unit) => unit.saveTasks([buildFictitiousTask(2), buildFictitiousTask(3), invalid]))
    const interrupted = await coordinator.run((unit) => {
      unit.saveTask(buildFictitiousTask(2))
      unit.saveTask(buildFictitiousTask(3))
      throw new Error('fixture: falha entre registros')
    })
    const duplicated = await coordinator.run((unit) => unit.saveTasks([buildFictitiousTask(5), buildFictitiousTask(5)]))

    expect(failureReason(rejected)).toBe('INVALID_DATA')
    expect(failureReason(interrupted)).toBe('INVALID_UNIT')
    expect(failureReason(duplicated)).toBe('INVALID_DATA')
    const state = await readState(coordinator)
    expect(state.tasks).toHaveLength(1)
    expect(state.revision).toBe(1n)
  })

  it('replaceAll substitui a coleção inteira somente sobre a base global esperada', async () => {
    const coordinator = openCoordinator(createProductFile())
    const original = buildFictitiousTasks(4)
    expectOk(await coordinator.run((unit) => unit.saveTasks(original)))
    expectOk(await coordinator.run((unit) => unit.moveToTrash(original[3]?.id ?? '', DELETED_AT)))
    const kept = original[0]
    const changed = original[1]
    if (kept === undefined || changed === undefined) throw new Error('fixtures unavailable')
    const next = [kept, { ...changed, title: 'Substituída' }, buildFictitiousTask(50)]

    const stale = expectOk(await coordinator.run((unit) => unit.replaceAllTasks(next, 1n)))
    const replaced = expectOk(await coordinator.run((unit) => unit.replaceAllTasks(next, unit.baseRevision)))
    const again = expectOk(await coordinator.run((unit) => unit.replaceAllTasks(next, unit.baseRevision)))

    expect(stale.value).toEqual({ status: 'CONFLICT', currentRevision: 2n })
    expect(stale.committed).toBe(false)
    expect(replaced.value).toEqual({ status: 'REPLACED', created: 1, updated: 1, removed: 1 })
    expect(again.value).toEqual({ status: 'UNCHANGED' })
    expect(again.committed).toBe(false)

    const read = expectOk(await coordinator.read((reader) => ({ tasks: reader.listTasks(), trash: reader.listTrash() })))
    expect(read.value.tasks.map((stored) => [stored.task.id, stored.contentRevision])).toEqual([
      [kept.id, 1n],
      [changed.id, 3n],
      [buildFictitiousTask(50).id, 3n],
    ])
    // A lixeira não pertence à coleção substituída.
    expect(read.value.trash.map((item) => item.task.id)).toEqual([original[3]?.id])
  })

  it('substituição inválida no meio não deixa coleção parcial', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTasks(buildFictitiousTasks(3))))
    const invalid = { ...buildFictitiousTask(9), createdAt: 'ontem' }

    const result = await coordinator.run((unit) => unit.replaceAllTasks([buildFictitiousTask(8), invalid], unit.baseRevision))

    expect(failureReason(result)).toBe('INVALID_DATA')
    expect((await readState(coordinator)).tasks).toEqual(buildFictitiousTasks(3))
  })

  it('delete remove somente a tarefa informada e ausência é no-op', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTasks(buildFictitiousTasks(2))))

    const removed = expectOk(await coordinator.run((unit) => unit.deleteTask(buildFictitiousTask(1).id)))
    const missing = expectOk(await coordinator.run((unit) => unit.deleteTask('inexistente')))

    expect([removed.value, removed.committed]).toEqual([true, true])
    expect([missing.value, missing.committed, missing.revision]).toEqual([false, false, 2n])
    expect((await readState(coordinator)).tasks).toEqual([buildFictitiousTask(2)])
  })

  it('leitura e no-op não regravam payload histórico', async () => {
    const file = createProductFile()
    const first = openCoordinator(file)
    expectOk(await first.run((unit) => unit.saveTask(buildMinimalFictitiousTask('historica'))))
    first.shutdown()

    // Fixture: a mesma tarefa como teria sido gravada na versão 1 do codec.
    const legacy = JSON.stringify({ ...buildMinimalFictitiousTask('historica'), reminders: undefined, subtasks: undefined, tags: undefined })
    const raw = new DatabaseSync(file)
    raw.prepare('UPDATE tasks SET payload_version = 1, payload_json = ? WHERE id = ?').run(legacy, 'historica')
    raw.close()
    const before = sha256(file)

    const coordinator = openCoordinator(file)
    const read = await readState(coordinator)
    const noop = expectOk(await coordinator.run((unit) => unit.saveTask(buildMinimalFictitiousTask('historica'))))
    coordinator.shutdown()

    expect(read.tasks).toEqual([buildMinimalFictitiousTask('historica')])
    expect([noop.value, noop.committed]).toEqual(['UNCHANGED', false])
    expect(sha256(file)).toBe(before)

    // Alteração efetiva grava a representação atual (v4).
    const writer = openCoordinator(file)
    expectOk(await writer.run((unit) => unit.saveTask({ ...buildMinimalFictitiousTask('historica'), title: 'Editada' })))
    writer.shutdown()
    const check = new DatabaseSync(file)
    expect(check.prepare('SELECT payload_version FROM tasks').get()).toMatchObject({ payload_version: 4 })
    check.close()
  })

  it('a revisão global sobrevive ao reopen e continua depois do último commit', async () => {
    const file = createProductFile()
    const first = openCoordinator(file)
    for (let index = 1; index <= 3; index += 1) {
      expectOk(await first.run((unit) => unit.saveTask(buildFictitiousTask(index))))
    }
    first.shutdown()

    const second = openCoordinator(file)
    expect(second.confirmedRevision).toBe(3n)
    expect(expectOk(await second.run((unit) => unit.saveTask(buildFictitiousTask(4)))).revision).toBe(4n)
  })

  it('revisões acima da precisão do JS são exatas; no limite a escrita falha sem wrap', async () => {
    const file = createProductFile()
    const seed = openCoordinator(file)
    expectOk(await seed.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    seed.shutdown()

    const beyondSafe = BigInt(Number.MAX_SAFE_INTEGER) + 10n
    let raw = new DatabaseSync(file)
    raw.prepare('UPDATE taskflow_metadata SET global_revision = ?').run(beyondSafe)
    raw.close()

    const precise = openCoordinator(file)
    const saved = expectOk(await precise.run((unit) => unit.saveTask(buildFictitiousTask(2))))
    const stored = expectOk(await precise.read((reader) => reader.getTask(buildFictitiousTask(2).id)?.contentRevision))
    expect(saved.revision).toBe(beyondSafe + 1n)
    expect(stored.value).toBe(beyondSafe + 1n)
    precise.shutdown()

    raw = new DatabaseSync(file)
    raw.prepare('UPDATE taskflow_metadata SET global_revision = ?').run(MAX_REVISION)
    raw.close()

    const exhausted = openCoordinator(file)
    const refused = await exhausted.run((unit) => unit.saveTask(buildFictitiousTask(3)))
    expect(failureReason(refused)).toBe('REVISION_EXHAUSTED')
    const state = await readState(exhausted)
    expect(state.revision).toBe(MAX_REVISION)
    expect(state.tasks).toHaveLength(2)
  })

  it('ID recriado recebe revisão de conteúdo nova (sem ABA)', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildFictitiousTask(1)
    const created = expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    expectOk(await coordinator.run((unit) => unit.deleteTask(task.id)))
    const recreated = expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    const revisions = expectOk(await coordinator.read((reader) => reader.getTask(task.id)?.contentRevision))

    expect(created.revision).toBe(1n)
    expect(recreated.revision).toBe(3n)
    expect(revisions.value).toBe(3n)

    const stale = expectOk(
      await coordinator.run((unit) => unit.updateTaskConditionally(task.id, 1n, (current) => ({ ...current, title: 'Stale' }))),
    )
    expect(stale.value).toEqual({ status: 'CONFLICT', currentContentRevision: 3n, currentEditRevision: 3n })
    expect(stale.committed).toBe(false)
  })
})

describe('primitives da lixeira', () => {
  it('move e restore confirmam as duas coleções no mesmo commit', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildFictitiousTask(1)
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))

    const moved = expectOk(await coordinator.run((unit) => unit.moveToTrash(task.id, DELETED_AT)))
    const trashed = expectOk(await coordinator.read((reader) => ({ item: reader.getTrashItem(task.id), active: reader.getTask(task.id) })))
    expect(moved.value).toEqual(task)
    expect(moved.revision).toBe(2n)
    expect(trashed.value).toEqual({ item: { task, deletedAt: DELETED_AT, contentRevision: 1n, editRevision: 1n }, active: undefined })

    const restored = expectOk(
      await coordinator.run((unit) => unit.restoreFromTrash(task.id, (current) => ({ ...current, updatedAt: '2026-09-13T00:00:00.000Z' }))),
    )
    expect(restored.value).toMatchObject({ status: 'RESTORED', contentRevision: 3n, editRevision: 3n })
    const state = await readState(coordinator)
    expect(state.trash).toEqual([])
    expect(state.tasks).toEqual([{ ...task, updatedAt: '2026-09-13T00:00:00.000Z' }])
  })

  it('falha entre remover da origem e inserir no destino preserva as duas coleções', async () => {
    const file = createProductFile()
    const seed = openCoordinator(file)
    const tasks = buildFictitiousTasks(2)
    expectOk(await seed.run((unit) => unit.saveTasks(tasks)))
    expectOk(await seed.run((unit) => unit.moveToTrash(tasks[1]?.id ?? '', DELETED_AT)))
    seed.shutdown()

    // Falha real do motor entre as duas escritas: gatilhos temporários da própria conexão.
    const coordinator = openCoordinator(file, {
      faults: {
        afterConfigure: (connection) => {
          connection.exec("CREATE TEMP TRIGGER fixture_fail_trash BEFORE INSERT ON trash BEGIN SELECT RAISE(ABORT, 'fixture'); END")
          connection.exec("CREATE TEMP TRIGGER fixture_fail_tasks BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'fixture'); END")
        },
      },
    })
    const before = await readState(coordinator)

    const move = await coordinator.run((unit) => unit.moveToTrash(tasks[0]?.id ?? '', DELETED_AT))
    const restore = await coordinator.run((unit) => unit.restoreFromTrash(tasks[1]?.id ?? '', (task) => task))

    expect(failureReason(move)).toBe('UNAVAILABLE')
    expect(failureReason(restore)).toBe('UNAVAILABLE')
    expect(await readState(coordinator)).toEqual(before)
    expect(coordinator.availability).toEqual({ state: 'ready' })
  })

  it('restore com ID ativo existente devolve ID_EXISTS sem alterar nada', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildFictitiousTask(1)
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    expectOk(await coordinator.run((unit) => unit.moveToTrash(task.id, DELETED_AT)))
    expectOk(await coordinator.run((unit) => unit.saveTask({ ...task, title: 'Ativa' })))
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    const before = expectOk(await coordinator.read((reader) => [reader.getTask(task.id), reader.getTrashItem(task.id)]))

    const result = expectOk(await coordinator.run((unit) => unit.restoreFromTrash(task.id, (current) => current)))
    const after = expectOk(await coordinator.read((reader) => [reader.getTask(task.id), reader.getTrashItem(task.id)]))

    expect(result.value).toEqual({ status: 'ID_EXISTS' })
    expect([result.committed, result.revision]).toEqual([false, 3n])
    expect(after.value).toEqual(before.value)
    expect(events).toEqual([])
  })

  it('ausência e preparação inválida não alteram tarefas, lixeira ou revisão', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildFictitiousTask(1)
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    expectOk(await coordinator.run((unit) => unit.moveToTrash(task.id, DELETED_AT)))
    const before = await readState(coordinator)

    const missing = expectOk(await coordinator.run((unit) => unit.restoreFromTrash('inexistente', (current) => current)))
    const absentMove = expectOk(await coordinator.run((unit) => unit.moveToTrash('inexistente', DELETED_AT)))
    const invalid = await coordinator.run((unit) =>
      unit.restoreFromTrash(task.id, (current) => ({ ...current, status: 'ARCHIVED' }) as unknown as Task),
    )
    const otherId = await coordinator.run((unit) => unit.restoreFromTrash(task.id, (current) => ({ ...current, id: 'outro' })))
    const thrown = await coordinator.run((unit) =>
      unit.restoreFromTrash(task.id, () => {
        throw new Error('fixture: prepare failed')
      }),
    )
    const badDate = await coordinator.run((unit) => unit.moveToTrash(task.id, 'ontem'))

    expect(missing.value).toEqual({ status: 'NOT_IN_TRASH' })
    expect([absentMove.value, absentMove.committed]).toEqual([undefined, false])
    expect([invalid, otherId, thrown, badDate].map(failureReason)).toEqual([
      'INVALID_DATA',
      'INVALID_DATA',
      'INVALID_DATA',
      'INVALID_DATA',
    ])
    expect(await readState(coordinator)).toEqual(before)
  })

  it('exclusão definitiva, esvaziar e expurgo são unidades explícitas; leitura nunca expurga', async () => {
    const coordinator = openCoordinator(createProductFile())
    const tasks = buildFictitiousTasks(5)
    expectOk(await coordinator.run((unit) => unit.saveTasks(tasks)))
    expectOk(
      await coordinator.run((unit) => {
        // Lixeira antiga: muito além de qualquer retenção futura.
        tasks.forEach((task, index) => unit.moveToTrash(task.id, `201${index}-01-01T00:00:00.000Z`))
      }),
    )
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const firstRead = await readState(coordinator)
    const secondRead = await readState(coordinator)
    expect(firstRead.trash).toHaveLength(5)
    expect(secondRead).toEqual(firstRead)
    expect(events).toEqual([])

    const removed = expectOk(await coordinator.run((unit) => unit.deleteFromTrash(tasks[0]?.id ?? '')))
    const absent = expectOk(await coordinator.run((unit) => unit.deleteFromTrash('inexistente')))
    const purged = expectOk(await coordinator.run((unit) => unit.purgeTrash((item) => item.deletedAt < '2013')))
    const nothing = expectOk(await coordinator.run((unit) => unit.purgeTrash(() => false)))
    expect([removed.value, absent.value, purged.value, nothing.value]).toEqual([true, false, 2, 0])
    expect([absent.committed, nothing.committed]).toEqual([false, false])
    expect((await readState(coordinator)).trash).toEqual([tasks[3]?.id, tasks[4]?.id])

    const emptied = expectOk(await coordinator.run((unit) => unit.emptyTrash()))
    const emptyAgain = expectOk(await coordinator.run((unit) => unit.emptyTrash()))
    expect([emptied.value, emptyAgain.value, emptyAgain.committed]).toEqual([2, 0, false])
    expect(events).toEqual([3n, 4n, 5n])
  })
})

describe('edição e reversão condicionais', () => {
  it('duas edições da mesma base: só a primeira confirma, a segunda recebe conflito', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildFictitiousTask(1)
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))

    const [first, second] = await Promise.all([
      coordinator.run((unit) => unit.updateTaskConditionally(task.id, 1n, (current) => ({ ...current, title: 'Primeira' }))),
      coordinator.run((unit) => unit.updateTaskConditionally(task.id, 1n, (current) => ({ ...current, assignee: 'Segunda' }))),
    ])

    expect(expectOk(first).value).toMatchObject({ status: 'UPDATED', contentRevision: 2n, editRevision: 2n })
    expect(expectOk(second).value).toEqual({ status: 'CONFLICT', currentContentRevision: 2n, currentEditRevision: 2n })
    expect(expectOk(second).committed).toBe(false)
    const stored = (await readState(coordinator)).tasks[0]
    expect(stored).toEqual({ ...task, title: 'Primeira' })
  })

  it('tarefas distintas confirmam em sequência sem falso conflito pela revisão global', async () => {
    const coordinator = openCoordinator(createProductFile())
    const [left, right] = buildFictitiousTasks(2)
    if (left === undefined || right === undefined) throw new Error('fixtures unavailable')
    expectOk(await coordinator.run((unit) => unit.saveTasks([left, right])))

    const results = await Promise.all([
      coordinator.run((unit) => unit.updateTaskConditionally(left.id, 1n, (current) => ({ ...current, title: 'L' }))),
      coordinator.run((unit) => unit.updateTaskConditionally(right.id, 1n, (current) => ({ ...current, title: 'R' }))),
    ])

    expect(results.map((result) => expectOk(result).value.status)).toEqual(['UPDATED', 'UPDATED'])
    expect((await readState(coordinator)).tasks.map((task) => task.title)).toEqual(['L', 'R'])
  })

  it('ausência, no-op e dado inválido não gravam', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = buildFictitiousTask(1)
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))

    const missing = expectOk(await coordinator.run((unit) => unit.updateTaskConditionally('x', 1n, (current) => current)))
    const same = expectOk(await coordinator.run((unit) => unit.updateTaskConditionally(task.id, 1n, (current) => current)))
    const equal = expectOk(await coordinator.run((unit) => unit.updateTaskConditionally(task.id, 1n, (current) => ({ ...current }))))
    const declined = expectOk(await coordinator.run((unit) => unit.updateTaskConditionally(task.id, 1n, () => undefined)))
    const invalid = await coordinator.run((unit) =>
      unit.updateTaskConditionally(task.id, 1n, (current) => ({ ...current, priority: 'MAX' }) as unknown as Task),
    )

    expect(missing.value).toEqual({ status: 'NOT_FOUND' })
    expect([same.value.status, equal.value.status, declined.value.status]).toEqual(['UNCHANGED', 'UNCHANGED', 'UNCHANGED'])
    expect([same, equal, declined].every((result) => !result.committed)).toBe(true)
    expect(failureReason(invalid)).toBe('INVALID_DATA')
    expect((await readState(coordinator)).revision).toBe(1n)
  })

  it('reversão condicional restaura a versão anterior e remove a tarefa gerada', async () => {
    const coordinator = openCoordinator(createProductFile())
    const previous = buildFictitiousTask(1)
    const generated = buildFictitiousTask(2)
    expectOk(await coordinator.run((unit) => unit.saveTask(previous)))
    const action = expectOk(
      await coordinator.run((unit) => {
        const updated = unit.updateTaskConditionally(previous.id, 1n, (current) => ({ ...current, status: 'CANCELLED' as const }))
        unit.saveTask(generated)
        return updated
      }),
    )
    expect(action.revision).toBe(2n)

    const reverted = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          {
            target: { id: previous.id, expectedContentRevision: 2n },
            generated: { id: generated.id, expectedContentRevision: 2n },
          },
          () => previous,
        ),
      ),
    )

    expect(reverted.value).toMatchObject({ status: 'REVERTED', contentRevision: 3n })
    expect((await readState(coordinator)).tasks).toEqual([previous])
  })

  it('reversão recusa quando a tarefa mudou, sumiu ou a gerada mudou', async () => {
    const coordinator = openCoordinator(createProductFile())
    const [target, generated] = buildFictitiousTasks(2)
    if (target === undefined || generated === undefined) throw new Error('fixtures unavailable')
    expectOk(await coordinator.run((unit) => unit.saveTasks([target, generated])))
    expectOk(await coordinator.run((unit) => unit.saveTask({ ...generated, title: 'Editada depois' })))
    const before = await readState(coordinator)

    const changed = expectOk(
      await coordinator.run((unit) => unit.revertConditionally({ target: { id: target.id, expectedContentRevision: 9n } }, () => target)),
    )
    const removed = expectOk(
      await coordinator.run((unit) => unit.revertConditionally({ target: { id: 'x', expectedContentRevision: 1n } }, () => target)),
    )
    const generatedChanged = expectOk(
      await coordinator.run((unit) =>
        unit.revertConditionally(
          { target: { id: target.id, expectedContentRevision: 1n }, generated: { id: generated.id, expectedContentRevision: 1n } },
          () => ({ ...target, title: 'Revertida' }),
        ),
      ),
    )

    expect(changed.value).toEqual({ status: 'CHANGED', currentRevision: 1n })
    expect(removed.value).toEqual({ status: 'REMOVED' })
    expect(generatedChanged.value).toEqual({ status: 'GENERATED_CHANGED' })
    expect(await readState(coordinator)).toEqual(before)
  })
})

describe('claim condicional de ocorrência', () => {
  const claim = { taskId: 'lembrete', reminderId: 'r1', processedFor: '2026-09-20T09:00:00.000Z' }

  it('dois claims da mesma ocorrência: só um confirma e só um evento é emitido', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(reminderTask())))
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const [first, second] = await Promise.all([
      coordinator.run((unit) => unit.claimReminderOccurrence(claim)),
      coordinator.run((unit) => unit.claimReminderOccurrence(claim)),
    ])

    expect([expectOk(first).value, expectOk(first).committed]).toEqual([true, true])
    expect([expectOk(second).value, expectOk(second).committed]).toEqual([false, false])
    expect(events).toEqual([2n])
  })

  it('claim altera a revisão global e conserva updatedAt e revisão de conteúdo', async () => {
    const coordinator = openCoordinator(createProductFile())
    const task = reminderTask()
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))

    const claimed = expectOk(await coordinator.run((unit) => unit.claimReminderOccurrence(claim)))
    const stored = expectOk(await coordinator.read((reader) => reader.getTask(task.id)))

    expect(claimed.revision).toBe(2n)
    expect(stored.value?.contentRevision).toBe(1n)
    expect(stored.value?.task.updatedAt).toBe(task.updatedAt)
    expect(stored.value?.task.reminders).toEqual([
      { id: 'r1', type: 'OFFSET', offsetMinutes: 60, processedFor: claim.processedFor },
      { id: 'r2', type: 'AT', at: '2026-09-20T07:00:00.000Z' },
    ])
  })

  it.each([
    ['prazo alterado', (task: Task): Task => ({ ...task, dueAt: '2026-09-21T10:00:00.000Z' })],
    ['status concluído', (task: Task): Task => ({ ...task, status: 'DONE', completedAt: '2026-09-19T10:00:00.000Z' })],
    ['lembrete alterado', (task: Task): Task => ({ ...task, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 30 }] })],
    ['lembrete removido', (task: Task): Task => ({ ...task, reminders: [] })],
  ])('edição vence (%s): o claim antigo fica inaplicável', async (_label, edit) => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(reminderTask())))

    const [edited, claimed] = await Promise.all([
      coordinator.run((unit) => unit.updateTaskConditionally('lembrete', 1n, edit)),
      coordinator.run((unit) => unit.claimReminderOccurrence(claim)),
    ])

    expect(expectOk(edited).value.status).toBe('UPDATED')
    expect([expectOk(claimed).value, expectOk(claimed).committed]).toEqual([false, false])
    expect((await readState(coordinator)).tasks[0]).toEqual(edit(reminderTask()))
  })

  it('tarefa removida ou movida para a lixeira torna o claim inaplicável', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(reminderTask())))
    expectOk(await coordinator.run((unit) => unit.moveToTrash('lembrete', DELETED_AT)))

    const claimed = expectOk(await coordinator.run((unit) => unit.claimReminderOccurrence(claim)))
    expect([claimed.value, claimed.committed, claimed.revision]).toEqual([false, false, 2n])
  })

  it('claim vence: edição de outro campo, mesmo vinda de leitura anterior, conserva o marcador', async () => {
    const coordinator = openCoordinator(createProductFile())
    const staleCopy = reminderTask()
    expectOk(await coordinator.run((unit) => unit.saveTask(staleCopy)))

    const [claimed, edited] = await Promise.all([
      coordinator.run((unit) => unit.claimReminderOccurrence(claim)),
      // A decisão monta a tarefa a partir de uma cópia lida antes do claim (sem processedFor).
      coordinator.run((unit) => unit.updateTaskConditionally('lembrete', 1n, () => ({ ...staleCopy, title: 'Outro campo' }))),
    ])

    expect(expectOk(claimed).value).toBe(true)
    // A revisão de conteúdo não mudou com o claim: a edição não é invalidada pelo processamento.
    expect(expectOk(edited).value).toMatchObject({ status: 'UPDATED', contentRevision: 3n })
    const stored = (await readState(coordinator)).tasks[0]
    expect(stored?.title).toBe('Outro campo')
    expect(stored?.reminders[0]).toEqual({ id: 'r1', type: 'OFFSET', offsetMinutes: 60, processedFor: claim.processedFor })

    const again = expectOk(await coordinator.run((unit) => unit.claimReminderOccurrence(claim)))
    expect(again.value).toBe(false)
  })

  it('ocorrência alterada pela edição não herda o marcador antigo', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask(reminderTask())))
    expectOk(await coordinator.run((unit) => unit.claimReminderOccurrence(claim)))

    expectOk(
      await coordinator.run((unit) =>
        unit.updateTaskConditionally('lembrete', 1n, (current) => ({
          ...current,
          dueAt: '2026-09-22T10:00:00.000Z',
          reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
        })),
      ),
    )

    const next = { ...claim, processedFor: '2026-09-22T09:00:00.000Z' }
    expect(expectOk(await coordinator.run((unit) => unit.claimReminderOccurrence(next))).value).toBe(true)
  })
})

describe('efeitos e eventos sucedem o commit', () => {
  it('o evento sai depois do commit confirmado e fora da unidade', async () => {
    const coordinator = openCoordinator(createProductFile())
    const observed: Array<Promise<unknown>> = []
    coordinator.onCommitted(() => {
      // Fora da transação: o listener já pode ler o estado confirmado pela fila.
      observed.push(coordinator.read((reader) => reader.listTasks().length))
    })

    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    await expect(observed[0]).resolves.toMatchObject({ ok: true, value: 1 })
  })

  it('falha de efeito posterior ao commit não reverte nem muda o resultado', async () => {
    const coordinator = openCoordinator(createProductFile())
    coordinator.onCommitted(() => {
      throw new Error('fixture: notifier failed')
    })

    const result = expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    expect([result.committed, result.revision]).toEqual([true, 1n])
    expect((await readState(coordinator)).tasks).toHaveLength(1)
  })

  it('resposta perdida depois do commit: o snapshot mostra o commit, sem replay de escrita', async () => {
    const file = createProductFile()
    const state = { armed: true }
    const coordinator = openCoordinator(file, {
      faults: faultAt('unit:before-publish', () => new Error('fixture: transport lost'), state),
    })
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    // O chamador não recebe a resposta (descarta o resultado) e ressincroniza por leitura.
    void coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1)))
    const resync = await readState(coordinator)

    expect(resync.revision).toBe(1n)
    expect(resync.tasks).toEqual([buildFictitiousTask(1)])
    expect(events).toEqual([1n])
  })
})

describe('falhas de armazenamento', () => {
  it('falha injetada no COMMIT é resultado incerto: invalida, reabre validando e não anuncia sucesso', async () => {
    const file = createProductFile()
    const state = { armed: false }
    const diagnostics: unknown[] = []
    const coordinator = openCoordinator(file, {
      faults: faultAt('unit:commit', () => sqliteFault(10), state),
      onDiagnostic: (event) => diagnostics.push(event),
    })
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    const events: bigint[] = []
    const unavailable: string[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    coordinator.onUnavailable((reason) => unavailable.push(reason))

    state.armed = true
    const failed = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2)))
    expect(failureReason(failed)).toBe('UNCERTAIN')
    expect(coordinator.availability).toEqual({ state: 'blocked', reason: 'UNCERTAIN' })
    expect(unavailable).toEqual(['UNCERTAIN'])
    expect(events).toEqual([])

    // A causa passou: a próxima unidade reabre com validação completa e segue.
    state.armed = false
    const next = expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(3))))
    expect(coordinator.availability).toEqual({ state: 'ready' })
    expect(next.revision).toBe(2n)
    expect((await readState(coordinator)).tasks.map((task) => task.id)).toEqual([buildFictitiousTask(1).id, buildFictitiousTask(3).id])
    // Reopen republica a revisão confirmada para os inscritos ressincronizarem.
    expect(events).toEqual([1n, 2n])
    expect(diagnostics).toEqual([{ phase: 'commit', reason: 'UNCERTAIN' }])
  })

  it('falha de rollback também é resultado incerto e impede novas unidades até o reopen', async () => {
    const file = createProductFile()
    const state = { armed: false }
    const coordinator = openCoordinator(file, { faults: faultAt('unit:rollback', () => sqliteFault(10), state) })
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))

    state.armed = true
    const failed = await coordinator.run((unit) => {
      unit.saveTask(buildFictitiousTask(2))
      throw new StorageFailure('INVALID_DATA')
    })
    expect(failureReason(failed)).toBe('UNCERTAIN')
    expect(coordinator.availability).toEqual({ state: 'blocked', reason: 'UNCERTAIN' })

    // Reopen validado: a conexão incerta foi descartada e o estado é o anterior inteiro.
    state.armed = false
    const state1 = await readState(coordinator)
    expect(coordinator.availability).toEqual({ state: 'ready' })
    expect(state1.tasks).toEqual([buildFictitiousTask(1)])
    expect(state1.revision).toBe(1n)
  })

  it('SQLITE_FULL real do motor (limite de páginas) reverte o saveMany inteiro e a fila continua', async () => {
    const file = createProductFile()
    let connection: DatabaseSync | undefined
    const coordinator = openCoordinator(file, { faults: { afterConfigure: (opened) => (connection = opened) } })
    expectOk(await coordinator.run((unit) => unit.saveTasks(buildFictitiousTasks(5))))
    const before = await readState(coordinator)

    // Ambiente controlado: o motor recusa crescer o arquivo, como num disco cheio. Não é disco físico.
    const pages = Number(Object.values(connection?.prepare('PRAGMA page_count').get() ?? {})[0])
    connection?.exec(`PRAGMA max_page_count = ${pages + 2}`)
    const large = buildFictitiousTasks(200, { idPrefix: 'cheio', descriptionLength: 4000 })
    const full = await coordinator.run((unit) => unit.saveTasks(large))

    expect(failureReason(full)).toBe('UNAVAILABLE')
    expect(await readState(coordinator)).toEqual(before)
    expect(coordinator.availability).toEqual({ state: 'ready' })

    connection?.exec('PRAGMA max_page_count = 1073741823')
    const recovered = expectOk(await coordinator.run((unit) => unit.saveTasks(large)))
    expect(recovered.revision).toBe(2n)
    expect((await readState(coordinator)).tasks).toHaveLength(205)
  })

  it('arquivo somente leitura (permissão real): escrita falha sem falso sucesso e recupera depois', async () => {
    const file = createProductFile()
    const seed = openCoordinator(file)
    expectOk(await seed.run((unit) => unit.saveTask(buildFictitiousTask(1))))
    seed.shutdown()

    chmodSync(file, 0o444)
    try {
      const coordinator = openCoordinator(file)
      const events: bigint[] = []
      coordinator.onCommitted((revision) => events.push(revision))
      const refused = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2)))

      expect(failureReason(refused)).toBe('UNAVAILABLE')
      expect(events).toEqual([])

      chmodSync(file, 0o666)
      const recovered = expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2))))
      expect(recovered.revision).toBe(2n)
      expect((await readState(coordinator)).tasks).toHaveLength(2)
    } finally {
      chmodSync(file, 0o666)
    }
  })

  it('abertura indisponível nunca vira coleção vazia e permite nova abertura após correção', async () => {
    const file = createProductFile()
    mkdirSync(file, { recursive: true })
    const coordinator = openCoordinator(file)

    expect(coordinator.availability).toEqual({ state: 'blocked', reason: 'UNAVAILABLE' })
    expect(await coordinator.read((reader) => reader.listTasks())).toEqual({ ok: false, reason: 'UNAVAILABLE' })
    expect(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1)))).toEqual({ ok: false, reason: 'UNAVAILABLE' })
  })

  it('dado que deixa de ser válido bloqueia o estado sem reset nem descarte', async () => {
    const file = createProductFile()
    const coordinator = openCoordinator(file)
    expectOk(await coordinator.run((unit) => unit.saveTasks(buildFictitiousTasks(3))))
    const unavailable: string[] = []
    coordinator.onUnavailable((reason) => unavailable.push(reason))

    const raw = new DatabaseSync(file)
    raw.exec("UPDATE tasks SET payload_json = '{' WHERE id = (SELECT min(id) FROM tasks)")
    raw.close()

    const read = await coordinator.read((reader) => reader.listTasks())
    const write = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(9)))
    expect(read).toEqual({ ok: false, reason: 'INCOMPATIBLE_DATA' })
    expect(write).toEqual({ ok: false, reason: 'INCOMPATIBLE_DATA' })
    expect(coordinator.availability).toEqual({ state: 'blocked', reason: 'INCOMPATIBLE_DATA' })
    expect(unavailable).toEqual(['INCOMPATIBLE_DATA'])

    const check = new DatabaseSync(file)
    expect(check.prepare('SELECT count(*) AS total FROM tasks').get()).toMatchObject({ total: 3 })
    check.close()
  })

  it('diagnóstico e resultado não carregam caminho, SQL, stack ou payload', async () => {
    const file = createProductFile()
    const diagnostics: unknown[] = []
    const coordinator = openCoordinator(file, { onDiagnostic: (event) => diagnostics.push(event) })
    const secret = { ...buildFictitiousTask(1), title: 'conteúdo-sigiloso', status: 'ARCHIVED' } as unknown as Task

    const result = await coordinator.run((unit) => unit.saveTask(secret))
    const serialized = JSON.stringify([result, diagnostics])

    expect(result).toEqual({ ok: false, reason: 'INVALID_DATA' })
    expect(diagnostics).toEqual([{ phase: 'unit', reason: 'INVALID_DATA' }])
    for (const forbidden of ['conteúdo-sigiloso', 'taskflow.sqlite', 'INSERT', 'stack', secret.id]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

describe('lock real e espera finita', () => {
  it('outra conexão segurando o lock de escrita: recusa segura, sem retry infinito, fila disponível depois', async () => {
    const file = createProductFile()
    const coordinator = openCoordinator(file)
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))

    const other = new DatabaseSync(file)
    other.exec('BEGIN IMMEDIATE')
    const started = performance.now()
    const locked = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2)))
    const elapsed = performance.now() - started

    expect(failureReason(locked)).toBe('LOCKED')
    expect(elapsed).toBeLessThan(1_500)
    expect(coordinator.availability).toEqual({ state: 'ready' })

    other.exec('ROLLBACK')
    other.close()
    const after = expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2))))
    expect(after.revision).toBe(2n)
    expect((await readState(coordinator)).tasks).toHaveLength(2)

    const check = new DatabaseSync(file)
    expect(check.prepare('PRAGMA quick_check').get()).toMatchObject({ quick_check: 'ok' })
    check.close()
  })

  it('leitor externo bloqueando o COMMIT: rollback confirmado, estado anterior inteiro', async () => {
    const file = createProductFile()
    const coordinator = openCoordinator(file)
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1))))

    // Conexão de teste mantém lock compartilhado com uma leitura em andamento.
    const reader = new DatabaseSync(file)
    reader.exec('BEGIN')
    reader.prepare('SELECT count(*) FROM tasks').get()
    const blocked = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2)))

    expect(failureReason(blocked)).toBe('LOCKED')
    expect(coordinator.availability).toEqual({ state: 'ready' })
    reader.exec('ROLLBACK')
    reader.close()

    const state = await readState(coordinator)
    expect(state.tasks).toEqual([buildFictitiousTask(1)])
    expect(state.revision).toBe(1n)
    expect(expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2)))).revision).toBe(2n)
  })
})

describe('limites de admissão e espera', () => {
  function manualQueue(): { schedule: (callback: () => void) => void; pump: () => void } {
    const callbacks: Array<() => void> = []
    return {
      schedule: (callback) => callbacks.push(callback),
      pump: () => {
        for (let callback = callbacks.shift(); callback !== undefined; callback = callbacks.shift()) callback()
      },
    }
  }

  it('fila limitada a 64 entradas: o excedente é recusado antes de qualquer efeito', async () => {
    const queue = manualQueue()
    // Relógio fixo: 64 commits reais podem passar de 2 s em disco lento, e o limite de espera
    // (verificado em teste próprio) não deve interferir na verificação do limite de admissão.
    const coordinator = openCoordinator(createProductFile(), { schedule: queue.schedule, now: () => 0 })
    const admitted = Array.from({ length: QUEUE_LIMITS.total }, (_unused, index) =>
      coordinator.run((unit) => unit.saveTask(buildFictitiousTask(index + 1))),
    )
    const excess = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(999)))

    expect(QUEUE_LIMITS).toEqual({ total: 64, perOwner: 8, waitMs: 2000 })
    expect(excess).toEqual({ ok: false, reason: 'QUEUE_FULL' })
    expect(coordinator.pending).toBe(64)

    queue.pump()
    const results = await Promise.all(admitted)
    expect(results.every((result) => result.ok && result.committed)).toBe(true)
    const state = await (async () => {
      const read = coordinator.read((reader) => reader.listTasks().length)
      queue.pump()
      return expectOk(await read).value
    })()
    expect(state).toBe(64)
  })

  it('no máximo 8 entradas aguardando por sessão', async () => {
    const queue = manualQueue()
    const coordinator = openCoordinator(createProductFile(), { schedule: queue.schedule })
    const own = Array.from({ length: QUEUE_LIMITS.perOwner }, () =>
      coordinator.read((reader) => reader.listTasks().length, { owner: 'sessao-a' }),
    )

    expect(await coordinator.read((reader) => reader.listTasks(), { owner: 'sessao-a' })).toEqual({
      ok: false,
      reason: 'QUEUE_FULL',
    })
    const other = coordinator.read((reader) => reader.listTasks().length, { owner: 'sessao-b' })
    queue.pump()
    expect((await Promise.all([...own, other])).every((result) => result.ok)).toBe(true)
  })

  it('entrada que espera mais de 2 s antes de iniciar é recusada sem efeito', async () => {
    const queue = manualQueue()
    let now = 0
    const coordinator = openCoordinator(createProductFile(), { schedule: queue.schedule, now: () => now })
    const waiting = coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1)))
    const onTime = (() => {
      now = 1_500
      return coordinator.run((unit) => unit.saveTask(buildFictitiousTask(2)))
    })()

    now = 2_001
    queue.pump()
    expect(await waiting).toEqual({ ok: false, reason: 'WAIT_TIMEOUT' })
    expect(expectOk(await onTime).committed).toBe(true)

    const read = coordinator.read((reader) => reader.listTasks().map((stored) => stored.task.id))
    queue.pump()
    expect(expectOk(await read).value).toEqual([buildFictitiousTask(2).id])
  })

  it('sessão expirada na fila não acessa os dados; cancelamento por sessão resolve com erro seguro', async () => {
    const queue = manualQueue()
    const coordinator = openCoordinator(createProductFile(), { schedule: queue.schedule })
    let reads = 0
    let current = true
    const expired = coordinator.read(() => (reads += 1), { owner: 'sessao-a', admit: () => current })
    const cancelled = coordinator.read(() => (reads += 1), { owner: 'sessao-b' })
    const kept = coordinator.read(() => (reads += 1), { owner: 'sessao-c' })

    current = false
    expect(coordinator.cancelOwner('sessao-b')).toBe(1)
    queue.pump()

    expect(await expired).toEqual({ ok: false, reason: 'SESSION_CLOSED' })
    expect(await cancelled).toEqual({ ok: false, reason: 'SESSION_CLOSED' })
    expect(expectOk(await kept).value).toBe(1)
    expect(reads).toBe(1)
  })
})

describe('encerramento e drain', () => {
  it('fecha a admissão, cancela entradas de sessão, drena unidades internas e libera a conexão', async () => {
    const callbacks: Array<() => void> = []
    const file = createProductFile()
    const coordinator = openCoordinator(file, { schedule: (callback) => callbacks.push(callback) })
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const internal = Array.from({ length: 5 }, (_unused, index) =>
      coordinator.run((unit) => unit.saveTask(buildFictitiousTask(index + 1))),
    )
    const sessionReads = Array.from({ length: 3 }, () => coordinator.read((reader) => reader.listTasks(), { owner: 'sessao-a' }))

    const report = coordinator.shutdown()
    const late = await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(99)))

    expect(report).toMatchObject({ drained: 5, cancelled: 3 })
    expect(report.drainMs).toBeLessThan(5_000)
    expect((await Promise.all(internal)).every((result) => result.ok && result.committed)).toBe(true)
    expect(await Promise.all(sessionReads)).toEqual(Array(3).fill({ ok: false, reason: 'CLOSED' }))
    expect(late).toEqual({ ok: false, reason: 'CLOSED' })
    expect(coordinator.availability).toEqual({ state: 'closed' })
    expect(events).toEqual([1n, 2n, 3n, 4n, 5n])

    // A conexão foi liberada: outra conexão obtém o lock de escrita e vê as cinco unidades.
    const check = new DatabaseSync(file)
    check.exec('BEGIN IMMEDIATE')
    expect(check.prepare('SELECT count(*) AS total FROM tasks').get()).toMatchObject({ total: 5 })
    check.exec('ROLLBACK')
    check.close()
  })

  it('start depois do encerramento não reabre o banco', () => {
    const coordinator = openCoordinator(createProductFile())
    coordinator.shutdown()
    expect(coordinator.start()).toEqual({ state: 'closed' })
  })

  it('texto grande e Unicode sobrevivem a commit, encerramento e reabertura', async () => {
    const file = createProductFile()
    const big = { ...buildFictitiousTask(1), description: fictitiousText(300_000, 7) }
    const first = openCoordinator(file)
    expectOk(await first.run((unit) => unit.saveTask(big)))
    first.shutdown()

    expect((await readState(openCoordinator(file))).tasks).toEqual([big])
  })

  it('razões internas continuam discriminadas por dados', () => {
    expect(storageFailureReasonOf(new StorageFailure('LOCKED'))).toBe('LOCKED')
  })
})
