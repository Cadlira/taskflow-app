import { afterEach, describe, expect, it } from 'vitest'
import { UndoRegistry } from '../../src/application/undo/undo-registry.js'
import type { TaskStorageReader, TaskStorageUnit, UnitResult } from '../../src/application/storage/unit-of-work.js'
import type { InvocationLike } from '../../src/main/ipc/document-sessions.js'
import { TrashCommandIpcService, type TrashCommandSessions, type TrashCommandStorage } from '../../src/main/ipc/trash.js'
import type { UnitOptions } from '../../src/main/storage/coordinator.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'
import { buildTask } from '../support/task-fixtures.js'

// L05/L06/L11/L12 no IPC real: contexto/tokens/confirmações, consumos, recusas exatas,
// sessões e orçamento. Banco temporário e dados fictícios.

afterEach(cleanupStorage)

const EVENT = {} as InvocationLike
const CLOCK = () => new Date('2026-10-04T12:00:00.000Z')
const DUE = '2026-10-10T10:00:00.000Z'

interface FakeSessions extends TrashCommandSessions {
  invalidate(): void
  restore(): void
}

function fakeSessions(): FakeSessions {
  const state = { current: true, generation: 1 }
  return {
    authorize: () => ({ role: 'MANAGER', contentsId: 1, generation: state.generation, key: 'doc:1' }),
    isCurrent: (ticket) => state.current && ticket.generation === state.generation,
    invalidate: () => {
      state.current = false
    },
    restore: () => {
      state.current = true
    },
  }
}

function createService(options: { budgetBytes?: number } = {}) {
  const coordinator = openCoordinator(createProductFile())
  const sessions = fakeSessions()
  let counts = { run: 0, read: 0 }
  const storage: TrashCommandStorage = {
    run<T>(unit: (unit: TaskStorageUnit) => T, unitOptions?: UnitOptions): Promise<UnitResult<T>> {
      counts.run += 1
      return coordinator.run(unit, unitOptions)
    },
    read<T>(reader: (reader: TaskStorageReader) => T, unitOptions?: UnitOptions): Promise<UnitResult<T>> {
      counts.read += 1
      return coordinator.read(reader, unitOptions)
    },
  }
  const undo = new UndoRegistry({
    ...(options.budgetBytes !== undefined && { budgetBytes: options.budgetBytes }),
    randomToken: (() => {
      let token = 0
      return () => `token-opaco-${String((token += 1)).padStart(10, '0')}`
    })(),
  })
  const service = new TrashCommandIpcService({ sessions, storage, clock: CLOCK, undo })
  let sequence = 0
  const clear = async (): Promise<number> => {
    sequence += 1
    const result = await service.handleClearUndoOffer(EVENT, { version: 1, contextSequence: sequence })
    expect(result).toMatchObject({ version: 1, status: 'ok', contextSequence: sequence })
    return sequence
  }
  return {
    coordinator,
    service,
    sessions,
    undo,
    storage,
    counts: () => ({ ...counts }),
    resetCounts: () => {
      counts = { run: 0, read: 0 }
    },
    sequence: () => sequence,
    clear,
    contextSequence: (): number => sequence,
  }
}

async function seed(coordinator: ReturnType<typeof openCoordinator>, task = buildTask({ id: 'a', dueAt: DUE })): Promise<string> {
  expectOk(await coordinator.run((unit) => unit.saveTask(task)))
  return task.id
}

async function trashEntry(coordinator: ReturnType<typeof openCoordinator>, taskId: string) {
  const item = expectOk(await coordinator.read((reader) => reader.getTrashItem(taskId))).value
  if (item === undefined) throw new Error('entrada ausente')
  return { taskId: item.task.id, contentRevision: item.contentRevision.toString(10), deletedAt: item.deletedAt }
}

describe('IPC da lixeira: contexto e preparação', () => {
  it('clear estabelece contexto; sequência menor é STALE_CONTEXT; igual é idempotente', async () => {
    const fixture = createService()
    const first = await fixture.clear()
    expect(first).toBe(1)
    expect(fixture.undo.contextSequence('doc:1')).toBe(1)

    const repeated = await fixture.service.handleClearUndoOffer(EVENT, { version: 1, contextSequence: 1 })
    expect(repeated).toMatchObject({ version: 1, status: 'ok', contextSequence: 1 })
    await fixture.clear()
    const stale = await fixture.service.handleClearUndoOffer(EVENT, { version: 1, contextSequence: 1 })
    expect(stale).toMatchObject({ version: 1, status: 'error', code: 'STALE_CONTEXT' })
    expect(fixture.undo.contextSequence('doc:1')).toBe(2)
  })

  it('comandos exigem o contexto estabelecido e não tocam dados com sequência antiga', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    await fixture.clear()
    await fixture.clear()
    fixture.resetCounts()

    const stale = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: 1,
      confirmationToken: 'A'.repeat(32),
    })
    expect(stale).toMatchObject({ code: 'STALE_CONTEXT' })
    const view = await fixture.service.handlePrepareView(EVENT, { version: 1, contextSequence: 1 })
    expect(view).toMatchObject({ code: 'STALE_CONTEXT' })
    expect(fixture.counts()).toEqual({ run: 0, read: 0 })
  })

  it('prepara MOVE com base lida no main e recusa CONFLICT quando a revisão mudou', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()

    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '99',
    })
    expect(prepared).toMatchObject({ version: 1, status: 'error', code: 'CONFLICT' })

    const ok = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    expect(ok).toMatchObject({ version: 1, status: 'ok', revision: '1', itemCount: 1, hasRecurrence: false })
    if (ok.status !== 'ok') return
    expect(ok.confirmationToken).toMatch(/^[A-Za-z0-9_-]{16,128}$/)

    const absent = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'ausente',
      expectedContentRevision: '1',
    })
    expect(absent).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('prepara EMPTY com a composição atual; PERMANENT exige a identidade exata', async () => {
    const fixture = createService()
    await seed(fixture.coordinator, buildTask({ id: 'a' }))
    await seed(fixture.coordinator, buildTask({ id: 'b' }))
    const sequence = await fixture.clear()

    const move = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (move.status !== 'ok') throw new Error('preparação esperada')
    const moved = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: move.confirmationToken,
    })
    expect(moved).toMatchObject({ version: 2, status: 'ok', retained: true, undoEpoch: 1 })
    expect(moved).toHaveProperty('undoToken')

    const entry = await trashEntry(fixture.coordinator, 'a')
    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'PERMANENT',
      entry: { ...entry, contentRevision: '99' },
    })
    expect(prepared).toMatchObject({ code: 'ENTRY_CHANGED' })
    const empty = await fixture.service.handlePrepareConfirmation(EVENT, { version: 1, contextSequence: sequence, kind: 'EMPTY' })
    expect(empty).toMatchObject({ version: 1, status: 'ok', itemCount: 1 })
  })
})

describe('IPC da lixeira: confirmações, tokens e recusas exatas', () => {
  it('move retido publica undoToken só com contexto válido; token consumido uma vez', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')

    const moved = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(moved).toMatchObject({ version: 2, status: 'ok', retained: true, undoEpoch: 1 })
    if (moved.status !== 'ok' || moved.undoToken === undefined) throw new Error('undoToken esperado')
    expect(expectOk(await fixture.coordinator.read((reader) => reader.getTask('a'))).value).toBeUndefined()

    const undo = await fixture.service.handleUndo(EVENT, {
      version: 1,
      contextSequence: sequence,
      undoToken: moved.undoToken,
    })
    expect(undo).toMatchObject({ version: 1, status: 'ok' })
    const again = await fixture.service.handleUndo(EVENT, {
      version: 1,
      contextSequence: sequence,
      undoToken: moved.undoToken,
    })
    expect(again).toMatchObject({ code: 'UNDO_NOT_AVAILABLE' })
    expect(expectOk(await fixture.coordinator.read((reader) => reader.getTask('a'))).value?.task.id).toBe('a')
  })

  it('token alheio/errado/repetido é CONFIRMATION_INVALID sem consumir o legítimo', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')

    const foreign = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: 'B'.repeat(32),
    })
    expect(foreign).toMatchObject({ code: 'CONFIRMATION_INVALID' })
    // O token legítimo continua válido.
    const moved = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(moved).toMatchObject({ status: 'ok' })
    // Repetição agora é inválida e não remove outra entrada.
    const repeated = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(repeated).toMatchObject({ code: 'CONFIRMATION_INVALID' })
  })

  it('mudança depois da preparação recusa CONFIRMATION_CHANGED sem escrever e exige novo diálogo', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')

    // Outra sessão edita a tarefa (check/edição) depois da preparação.
    expectOk(await fixture.coordinator.run((unit) => unit.updateTaskConditionally('a', 1n, (current) => ({ ...current, title: 'Outra' }))))
    const refused = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(refused).toMatchObject({ code: 'CONFIRMATION_CHANGED' })
    const stored = expectOk(await fixture.coordinator.read((reader) => reader.getTask('a'))).value
    expect(stored?.task.title).toBe('Outra')
  })

  it('EMPTY recusa composição alterada, aceita tarefa independente e remove a capturada', async () => {
    const fixture = createService()
    await seed(fixture.coordinator, buildTask({ id: 'a' }))
    await seed(fixture.coordinator, buildTask({ id: 'b' }))
    const sequence = await fixture.clear()

    for (const id of ['a', 'b']) {
      const revision = expectOk(await fixture.coordinator.read((reader) => reader.getTask(id))).value?.contentRevision
      if (revision === undefined) throw new Error('tarefa ausente')
      const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
        version: 1,
        contextSequence: sequence,
        kind: 'MOVE',
        taskId: id,
        expectedContentRevision: revision.toString(10),
      })
      if (prepared.status !== 'ok') throw new Error('preparação esperada')
      const moved = await fixture.service.handleMove(EVENT, {
        version: 2,
        contextSequence: sequence,
        confirmationToken: prepared.confirmationToken,
      })
      expect(moved).toMatchObject({ status: 'ok' })
    }

    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, { version: 1, contextSequence: sequence, kind: 'EMPTY' })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')
    expect(prepared.itemCount).toBe(2)

    // Outra exclusão muda a composição: confirmação antiga é recusada.
    await seed(fixture.coordinator, buildTask({ id: 'c' }))
    expectOk(
      await fixture.coordinator.run((unit) => unit.moveToTrash('c', '2026-10-04T11:00:00.000Z')),
    )
    const refused = await fixture.service.handleEmpty(EVENT, {
      version: 1,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(refused).toMatchObject({ code: 'CONFIRMATION_CHANGED' })
    expect(expectOk(await fixture.coordinator.read((reader) => reader.listTrash())).value).toHaveLength(3)
  })

  it('PERMANENT remove a entrada observada (mesmo vencida) e devolve ENTRY_CHANGED fora da identidade', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const move = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (move.status !== 'ok') throw new Error('preparação esperada')
    await fixture.service.handleMove(EVENT, { version: 2, contextSequence: sequence, confirmationToken: move.confirmationToken })

    const entry = await trashEntry(fixture.coordinator, 'a')
    const changed = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'PERMANENT',
      entry: { ...entry, deletedAt: '2026-01-01T00:00:00.000Z' },
    })
    expect(changed).toMatchObject({ code: 'ENTRY_CHANGED' })

    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'PERMANENT',
      entry,
    })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')
    const deleted = await fixture.service.handleDelete(EVENT, {
      version: 1,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(deleted).toMatchObject({ version: 1, status: 'ok' })
    expect(expectOk(await fixture.coordinator.read((reader) => reader.listTrash())).value).toEqual([])
  })

  it('restore devolve códigos exatos e conserva coleções em cada recusa', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const move = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (move.status !== 'ok') throw new Error('preparação esperada')
    await fixture.service.handleMove(EVENT, { version: 2, contextSequence: sequence, confirmationToken: move.confirmationToken })
    const entry = await trashEntry(fixture.coordinator, 'a')

    const absent = await fixture.service.handleRestore(EVENT, {
      version: 1,
      contextSequence: sequence,
      entry: { ...entry, taskId: 'x' },
    })
    expect(absent).toMatchObject({ code: 'NOT_IN_TRASH' })
    const changed = await fixture.service.handleRestore(EVENT, {
      version: 1,
      contextSequence: sequence,
      entry: { ...entry, contentRevision: '99' },
    })
    expect(changed).toMatchObject({ code: 'ENTRY_CHANGED' })
    const restored = await fixture.service.handleRestore(EVENT, { version: 1, contextSequence: sequence, entry })
    expect(restored).toMatchObject({ version: 1, status: 'ok', revision: '3', contentRevision: '3', editRevision: '3' })
    expect(expectOk(await fixture.coordinator.read((reader) => reader.listTrash())).value).toEqual([])
  })

  it('reload/sessão invalidada suprime resposta e não entrega oferta', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')

    fixture.sessions.invalidate()
    const result = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(result).toMatchObject({ code: 'SESSION_CLOSED' })
  })

  it('contexto trocado depois do commit impede a oferta, mas conserva o commit e o ack', async () => {
    const fixture = createService()
    await seed(fixture.coordinator)
    const sequence = await fixture.clear()
    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, {
      version: 1,
      contextSequence: sequence,
      kind: 'MOVE',
      taskId: 'a',
      expectedContentRevision: '1',
    })
    if (prepared.status !== 'ok') throw new Error('preparação esperada')

    // Clear intercalado entre o commit da unidade e a resposta: o commit permanece, a oferta não.
    const originalRun = fixture.storage.run.bind(fixture.storage)
    fixture.storage.run = async (unit, options) => {
      const result = await originalRun(unit, options)
      await fixture.service.handleClearUndoOffer(EVENT, { version: 1, contextSequence: sequence + 1 })
      return result
    }

    const moved = await fixture.service.handleMove(EVENT, {
      version: 2,
      contextSequence: sequence,
      confirmationToken: prepared.confirmationToken,
    })
    expect(moved).toMatchObject({ version: 2, status: 'ok', retained: true, undoEpoch: 1 })
    expect(moved).not.toHaveProperty('undoToken')
    expect(expectOk(await fixture.coordinator.read((reader) => reader.getTask('a'))).value).toBeUndefined()
    expect(fixture.undo.offerOf('doc:1')).toBeUndefined()
  })

  it('orçamento insuficiente recusa a preparação de EMPTY antes de efeito', async () => {
    const fixture = createService({ budgetBytes: 2048 })
    const tasks = Array.from({ length: 100 }, (_unused, index) => buildTask({ id: `t-${String(index).padStart(3, '0')}` }))
    expectOk(await fixture.coordinator.run((unit) => unit.saveTasks(tasks)))
    expectOk(
      await fixture.coordinator.run((unit) => {
        for (const task of tasks) unit.moveToTrash(task.id, '2026-10-04T11:00:00.000Z')
      }),
    )
    const sequence = await fixture.clear()

    const prepared = await fixture.service.handlePrepareConfirmation(EVENT, { version: 1, contextSequence: sequence, kind: 'EMPTY' })
    expect(prepared).toMatchObject({ code: 'RESOURCE_LIMIT' })
    expect(fixture.undo.openConfirmations).toBe(0)
    expect(expectOk(await fixture.coordinator.read((reader) => reader.listTrash())).value).toHaveLength(100)
  })

  it('maintenance purga vencidos, responde purgedCount e leitura pura não expurga', async () => {
    const fixture = createService()
    await seed(fixture.coordinator, buildTask({ id: 'a' }))
    await seed(fixture.coordinator, buildTask({ id: 'b' }))
    expectOk(await fixture.coordinator.run((unit) => unit.moveToTrash('a', '2026-08-01T00:00:00.000Z')))
    expectOk(await fixture.coordinator.run((unit) => unit.moveToTrash('b', '2026-10-03T00:00:00.000Z')))
    const sequence = await fixture.clear()

    const view = await fixture.service.handlePrepareView(EVENT, { version: 1, contextSequence: sequence })
    expect(view).toMatchObject({ version: 1, status: 'ok', purgedCount: 1 })
    const trash = expectOk(await fixture.coordinator.read((reader) => reader.listTrash())).value
    expect(trash.map((item) => item.task.id)).toEqual(['b'])

    const noop = await fixture.service.handlePrepareView(EVENT, { version: 1, contextSequence: sequence })
    expect(noop).toMatchObject({ status: 'ok', purgedCount: 0 })
  })
})
