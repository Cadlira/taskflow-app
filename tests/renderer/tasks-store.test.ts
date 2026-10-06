import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskCommandTransportError } from '../../src/application/tasks/task-client.js'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import type { StateSnapshot, StateUpdate, TaskRecord } from '../../src/contracts/state.js'
import type { Task } from '../../src/domain/task.js'
import { useTasksStore } from '../../src/renderer/src/stores/tasks.js'
import { buildTask } from '../support/task-fixtures.js'

function record(task: Task, contentRevision = '1', editRevision = contentRevision): TaskRecord {
  return { task, contentRevision, editRevision }
}

function snapshot(revision: string, tasks: TaskRecord[], undoEpoch = 1): StateSnapshot {
  return { revision, undoEpoch, tasks, trash: [] }
}

interface Harness {
  api: {
    verifyFoundation: ReturnType<typeof vi.fn>
    getStateSnapshot: ReturnType<typeof vi.fn>
    subscribeState: ReturnType<typeof vi.fn>
    unsubscribeState: ReturnType<typeof vi.fn>
    createTask: ReturnType<typeof vi.fn>
    updateTask: ReturnType<typeof vi.fn>
    changeTaskStatus: ReturnType<typeof vi.fn>
    setSubtaskDone: ReturnType<typeof vi.fn>
    openTaskSource: ReturnType<typeof vi.fn>
    clearUndoOffer: ReturnType<typeof vi.fn>
    prepareTrashConfirmation: ReturnType<typeof vi.fn>
    moveTaskToTrash: ReturnType<typeof vi.fn>
    restoreTrashItem: ReturnType<typeof vi.fn>
    deleteTrashItem: ReturnType<typeof vi.fn>
    emptyTrash: ReturnType<typeof vi.fn>
    prepareTrashView: ReturnType<typeof vi.fn>
    undoLastTaskAction: ReturnType<typeof vi.fn>
    resolveReminderActivation: ReturnType<typeof vi.fn>
  }
  emit(update: StateUpdate): void
  setSnapshot(next: StateSnapshot): void
  subscribeFails(code: 'STORAGE_UNAVAILABLE' | 'BUSY'): void
}

function setupStore(): Harness {
  let current = snapshot('1', [])
  let listener: ((update: StateUpdate) => void) | undefined
  let subscriptionId: string | undefined = 'sub'.padEnd(24, 'S')
  let subscribeFailure: string | null = null

  const api = {
    verifyFoundation: vi.fn(),
    getStateSnapshot: vi.fn(async () =>
      subscribeFailure === null
        ? { version: 3 as const, status: 'ok' as const, snapshot: current }
        : { version: 3 as const, status: 'error' as const, code: 'STORAGE_UNAVAILABLE' as const },
    ),
    subscribeState: vi.fn(async (_request: unknown, next?: (update: StateUpdate) => void) => {
      if (subscribeFailure !== null) {
        return { version: 3 as const, status: 'error' as const, code: subscribeFailure as 'STORAGE_UNAVAILABLE' }
      }
      listener = next
      return { version: 3 as const, status: 'ok' as const, subscriptionId, snapshot: current }
    }),
    unsubscribeState: vi.fn(async () => ({ version: 3 as const, status: 'ok' as const })),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    setSubtaskDone: vi.fn(),
    openTaskSource: vi.fn(),
    clearUndoOffer: vi.fn(async (request: { contextSequence: number }) => ({
      version: 1 as const,
      status: 'ok' as const,
      contextSequence: request.contextSequence,
    })),
    prepareTrashConfirmation: vi.fn(),
    moveTaskToTrash: vi.fn(),
    restoreTrashItem: vi.fn(),
    deleteTrashItem: vi.fn(),
    emptyTrash: vi.fn(),
    prepareTrashView: vi.fn(),
    undoLastTaskAction: vi.fn(),
    resolveReminderActivation: vi.fn(),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api as unknown as TaskFlowDesktopApi })
  setActivePinia(createPinia())

  return {
    api,
    emit: (update) => listener?.(update),
    setSnapshot: (next) => {
      current = next
    },
    subscribeFails: (code) => {
      subscribeFailure = code
      subscriptionId = undefined
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'taskflowDesktop')
})

describe('store de tarefas: inscrição e estados', () => {
  it('conecta uma única vez com v3, adota o snapshot e desconecta a inscrição', async () => {
    const harness = setupStore()
    const store = useTasksStore()

    expect(store.presentation).toBe('loading')
    await store.connect()
    await store.connect()

    expect(harness.api.subscribeState).toHaveBeenCalledTimes(1)
    expect(harness.api.subscribeState.mock.calls[0]?.[0]).toEqual({ version: 3 })
    expect(store.presentation).toBe('empty')
    expect(store.revision).toBe('1')

    await store.disconnect()
    expect(harness.api.unsubscribeState).toHaveBeenCalledTimes(1)
    expect(harness.api.unsubscribeState.mock.calls[0]?.[0]).toEqual({ version: 3, subscriptionId: 'sub'.padEnd(24, 'S') })
  })

  it('erro inicial vira blocked, nunca coleção vazia; stale conserva o snapshot', async () => {
    const harness = setupStore()
    harness.subscribeFails('STORAGE_UNAVAILABLE')
    const store = useTasksStore()
    await store.connect()

    expect(store.presentation).toBe('blocked')
    expect(store.initialError).toBe('STORAGE_UNAVAILABLE')
    expect(store.visibleTasks).toEqual([])

    const harness2 = setupStore()
    const store2 = useTasksStore()
    await store2.connect()
    harness2.setSnapshot(snapshot('2', [record(buildTask({ id: 'a' }))]))
    harness2.emit({ type: 'snapshot', snapshot: snapshot('2', [record(buildTask({ id: 'a' }))]) })
    expect(store2.presentation).toBe('ready')

    harness2.emit({ type: 'stale', code: 'BUSY' })
    expect(store2.presentation).toBe('stale')
    expect(store2.visibleTasks.map((task) => task.id)).toEqual(['a'])
  })

  it('ignora snapshot regressivo e mantém filtros/ordem transitórios', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('3', [
        record(buildTask({ id: 'b', title: 'Beta', createdAt: '2026-10-03T00:00:00.000Z' })),
        record(buildTask({ id: 'a', title: 'Alfa', createdAt: '2026-10-01T00:00:00.000Z' })),
      ]),
    })
    expect(store.revision).toBe('3')
    store.setFilters({ search: 'alfa' })
    expect(store.visibleTasks.map((task) => task.id)).toEqual(['a'])

    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(buildTask({ id: 'c' }))]) })
    expect(store.revision).toBe('3')
    expect(store.visibleTasks.map((task) => task.id)).toEqual(['a'])

    store.setSortKey('PRIORITY')
    store.clearFilters()
    expect(store.sortKey).toBe('PRIORITY')
    expect(store.visibleTasks.map((task) => task.id).sort()).toEqual(['a', 'b'])
  })

  it('atualiza o relógio a cada 60 s e ao retomar o foco', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    const initial = store.now.getTime()

    vi.advanceTimersByTime(60_000)
    expect(store.now.getTime()).toBe(initial + 60_000)

    vi.setSystemTime(new Date(initial + 120_000))
    window.dispatchEvent(new Event('focus'))
    expect(store.now.getTime()).toBe(initial + 120_000)
    void harness
  })

  it('sem resultados é distinto de vazio real', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    expect(store.presentation).toBe('empty')
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(buildTask({ id: 'a', title: 'Alfa' }))]) })
    expect(store.presentation).toBe('ready')

    store.setFilters({ search: 'inexistente' })
    expect(store.noResults).toBe(true)
    expect(store.presentation).toBe('ready')
  })
})

describe('store de tarefas: comandos, ack e snapshot', () => {
  it('cria: envia v3, só anuncia depois do ack e confirma com conteúdo e edição', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.createTask.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      taskId: 'novo',
      revision: '5',
      contentRevision: '5',
      editRevision: '5',
    })

    const result = await store.create({ title: 'Tarefa', subtasks: [{ title: 'Passo' }] })
    expect(result).toMatchObject({ status: 'accepted', kind: 'create', taskId: 'novo' })
    expect(harness.api.createTask.mock.calls[0]?.[0]).toMatchObject({
      version: 4,
      draft: { title: 'Tarefa', subtasks: [{ title: 'Passo' }] },
    })
    expect(store.awaitingConfirmation).toBe(true)
    expect(store.lastConfirmed).toBeNull()

    harness.emit({ type: 'snapshot', snapshot: snapshot('5', [record(buildTask({ id: 'novo' }), '5', '5')]) })
    expect(store.awaitingConfirmation).toBe(false)
    expect(store.lastConfirmed).toMatchObject({
      kind: 'create',
      taskId: 'novo',
      revision: '5',
      contentRevision: '5',
      editRevision: '5',
    })
  })

  it('no-op devolve revisões atuais e resolve sem evento novo', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.changeTaskStatus.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '1',
      contentRevision: '1',
      editRevision: '1',
      undoEpoch: 1,
    })

    const result = await store.changeStatus('a', '1', 'TODO')
    expect(result).toMatchObject({ status: 'accepted', kind: 'status' })
    expect(harness.api.changeTaskStatus.mock.calls[0]?.[0]).toEqual({
      version: 4,
      contextSequence: expect.any(Number),
      taskId: 'a',
      expectedEditRevision: '1',
      status: 'TODO',
    })
    expect(store.awaitingConfirmation).toBe(false)
    expect(store.lastConfirmed?.kind).toBe('status')
  })

  it('update usa expectedEditRevision e ack com ressync falhado informa atualização pendente', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '9',
      contentRevision: '9',
      editRevision: '7',
      undoEpoch: 1,
    })

    const result = await store.update('a', '6', { title: 'Nova' })
    expect(result).toMatchObject({ status: 'accepted', kind: 'update' })
    expect(harness.api.updateTask.mock.calls[0]?.[0]).toEqual({
      version: 5,
      contextSequence: expect.any(Number),
      taskId: 'a',
      expectedEditRevision: '6',
      patch: { title: 'Nova' },
    })
    expect(store.awaitingConfirmation).toBe(true)

    harness.emit({ type: 'stale', code: 'BUSY' })
    expect(store.updatePending).toBe(true)
    expect(store.lastConfirmed).toBeNull()

    harness.emit({ type: 'snapshot', snapshot: snapshot('9', [record(buildTask({ id: 'a' }), '9', '7')]) })
    expect(store.updatePending).toBe(false)
    expect(store.lastConfirmed?.contentRevision).toBe('9')
    expect(store.lastConfirmed?.editRevision).toBe('7')
  })

  it('duplo envio na mesma interação é bloqueado; segundo comando não sai', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    let release: (() => void) | undefined
    harness.api.createTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ version: 4, status: 'ok', outcome: 'APPLIED', taskId: 'x', revision: '2', contentRevision: '2', editRevision: '2' })
        }),
    )

    const first = store.create({ title: 'Uma' })
    const second = await store.create({ title: 'Duas' })
    expect(second).toEqual({ status: 'blocked', code: 'BUSY' })
    release?.()
    expect(await first).toMatchObject({ status: 'accepted' })
    expect(harness.api.createTask).toHaveBeenCalledTimes(1)
  })

  it('stale bloqueia comandos dependentes de estado sem perder filtros', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    store.setFilters({ search: 'a' })
    harness.emit({ type: 'stale', code: 'BUSY' })

    const result = await store.create({ title: 'x' })
    expect(result).toEqual({ status: 'blocked', code: 'SNAPSHOT_STALE' })
    expect(harness.api.createTask).not.toHaveBeenCalled()
    expect(store.filters.search).toBe('a')
  })

  it('conflito preserva base e expõe as revisões atuais sem trocá-la', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('4', [record(buildTask({ id: 'a', title: 'Atual' }), '4', '4')]),
    })
    harness.api.updateTask.mockResolvedValue({
      version: 4,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '7',
      currentEditRevision: '9',
    })

    const conflict = await store.update('a', '2', { title: 'Meu draft' })
    expect(conflict).toEqual({ status: 'conflict', currentContentRevision: '7', currentEditRevision: '9' })
    expect(store.conflict).toMatchObject({ taskId: 'a', currentContentRevision: '7', currentEditRevision: '9' })

    // Enquanto o conflito não for resolvido, o mesmo item não reenvia.
    const retry = await store.update('a', '2', { title: 'Meu draft' })
    expect(retry.status).toBe('conflict')
    expect(harness.api.updateTask).toHaveBeenCalledTimes(1)

    // Conferir versão atual é leitura, sem alterar a base nem o draft do formulário.
    const current = await store.inspectCurrent('a')
    expect(current?.task.title).toBe('Atual')

    // Recarregar é explícito e libera o gate.
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('8', [record(buildTask({ id: 'a', title: 'Mais nova' }), '6', '11')]),
    })
    const reloaded = await store.reloadBase('a')
    expect(reloaded?.task.title).toBe('Mais nova')
    expect(store.conflict).toBeNull()
  })

  it('NOT_FOUND conserva a lista e não recria a tarefa', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValue({ version: 4, status: 'error', code: 'NOT_FOUND' })

    const result = await store.update('ausente', '1', { title: 'x' })
    expect(result).toEqual({ status: 'not-found' })
    expect(store.notFound).toEqual({ taskId: 'ausente' })
    expect(store.visibleTasks).toEqual([])
  })

  it('resultado incerto exige conferir lista por ressync antes de enviar de novo', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.createTask.mockRejectedValueOnce(new TaskCommandTransportError())

    const uncertain = await store.create({ title: 'Talvez criada' })
    expect(uncertain).toEqual({ status: 'uncertain' })
    expect(store.outcomeUnknown).toEqual({ kind: 'create' })

    const blocked = await store.create({ title: 'Talvez criada' })
    expect(blocked).toEqual({ status: 'blocked', code: 'BUSY' })
    expect(harness.api.createTask).toHaveBeenCalledTimes(1)

    expect(await store.reviewAfterUncertain()).toBe(true)
    expect(store.outcomeUnknown).toBeNull()

    harness.api.createTask.mockResolvedValueOnce({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      taskId: 'nova',
      revision: '2',
      contentRevision: '2',
      editRevision: '2',
    })
    const again = await store.create({ title: 'Decisão explícita' })
    expect(again).toMatchObject({ status: 'accepted' })
  })

  it('validação posicional é estado finito sem alterar a lista', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValueOnce({
      version: 5,
      status: 'error',
      code: 'VALIDATION_FAILED',
      fields: {
        dueAt: 'DUE_REQUIRED',
        recurrence: { frequency: 'INVALID_VALUE' },
        subtasks: { items: [{ index: 1, title: 'TOO_LONG' }] },
      },
    })
    expect(await store.update('a', '1', { title: '' })).toEqual({
      status: 'validation',
      fields: {
        dueAt: 'DUE_REQUIRED',
        recurrence: { frequency: 'INVALID_VALUE' },
        subtasks: { items: [{ index: 1, title: 'TOO_LONG' }] },
      },
    })
  })

  it('mapeia os códigos de série, identidade, escolha, limite e item ausente', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    harness.api.updateTask.mockResolvedValueOnce({ version: 4, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
    expect(await store.update('a', '1', { status: 'CANCELLED' })).toEqual({ status: 'choice-required' })

    harness.api.updateTask.mockResolvedValueOnce({ version: 4, status: 'error', code: 'SERIES_CONFLICT' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'series-conflict' })

    harness.api.updateTask.mockResolvedValueOnce({ version: 4, status: 'error', code: 'IDENTITY_CONFLICT' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'identity-conflict' })

    harness.api.updateTask.mockResolvedValueOnce({ version: 4, status: 'error', code: 'RECURRENCE_OUT_OF_RANGE' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'recurrence-out-of-range' })

    harness.api.setSubtaskDone.mockResolvedValueOnce({ version: 3, status: 'error', code: 'SUBTASK_NOT_FOUND' })
    expect(await store.setSubtaskDone('a', '1', 'sumiu', true)).toEqual({ status: 'subtask-not-found' })
  })

  it('marcação por intenção usa expectedEditRevision e conserva a edição no ack', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('5', [
        record(
          buildTask({
            id: 'a',
            subtasks: [
              { id: 's1', title: 'Passo um', done: false },
              { id: 's2', title: 'Passo dois', done: false },
            ],
          }),
          '5',
          '5',
        ),
      ]),
    })
    harness.api.setSubtaskDone.mockResolvedValue({
      version: 3,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '6',
      contentRevision: '6',
      editRevision: '5',
    })

    const result = await store.setSubtaskDone('a', '5', 's1', true)
    expect(result).toMatchObject({ status: 'accepted', kind: 'subtask' })
    expect(harness.api.setSubtaskDone.mock.calls[0]?.[0]).toEqual({
      version: 3,
      contextSequence: expect.any(Number),
      taskId: 'a',
      expectedEditRevision: '5',
      subtaskId: 's1',
      done: true,
    })

    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('6', [
        record(
          buildTask({
            id: 'a',
            subtasks: [
              { id: 's1', title: 'Passo um', done: true },
              { id: 's2', title: 'Passo dois', done: false },
            ],
          }),
          '6',
          '5',
        ),
      ]),
    })
    expect(store.lastConfirmed).toMatchObject({ kind: 'subtask', contentRevision: '6', editRevision: '5' })

    // Save depois de checks: a mesma revisão de edição continua aplicável e o snapshot é a fonte.
    harness.api.updateTask.mockResolvedValueOnce({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '7',
      contentRevision: '7',
      editRevision: '7',
      undoEpoch: 1,
    })
    const saved = await store.update('a', '5', { title: 'Renomeada' })
    expect(saved).toMatchObject({ status: 'accepted', kind: 'update' })
    expect(harness.api.updateTask.mock.calls[0]?.[0]).toMatchObject({ expectedEditRevision: '5' })
  })

  it('marcação com conflito ou incerto conserva a base e bloqueia nova decisão', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('5', [record(buildTask({ id: 'a', subtasks: [{ id: 's1', title: 'Passo', done: false }] }), '5', '5')]),
    })
    harness.api.setSubtaskDone.mockResolvedValueOnce({
      version: 3,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '6',
      currentEditRevision: '6',
    })
    expect(await store.setSubtaskDone('a', '4', 's1', true)).toEqual({
      status: 'conflict',
      currentContentRevision: '6',
      currentEditRevision: '6',
    })
    expect(store.conflict).toMatchObject({ taskId: 'a', currentEditRevision: '6' })

    // Decisão explícita de descartar o aviso libera nova tentativa; o incerto exige ressync.
    store.clearConflict()
    harness.api.setSubtaskDone.mockRejectedValueOnce(new TaskCommandTransportError())
    expect(await store.setSubtaskDone('a', '5', 's1', true)).toEqual({ status: 'uncertain' })
    expect(store.outcomeUnknown).toEqual({ kind: 'subtask', taskId: 'a' })
  })

  it('abrir origem mapeia os resultados sem repetir automaticamente', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    harness.api.openTaskSource.mockResolvedValueOnce({ version: 1, status: 'ok' })
    expect(await store.openSource('a', '1')).toEqual({ status: 'requested' })

    harness.api.openTaskSource.mockResolvedValueOnce({ version: 1, status: 'error', code: 'SOURCE_NOT_ALLOWED' })
    expect(await store.openSource('a', '1')).toEqual({ status: 'refused' })

    harness.api.openTaskSource.mockResolvedValueOnce({ version: 1, status: 'error', code: 'SOURCE_NOT_AVAILABLE' })
    expect(await store.openSource('a', '1')).toEqual({ status: 'unavailable' })

    harness.api.openTaskSource.mockResolvedValueOnce({ version: 1, status: 'error', code: 'EXTERNAL_OPEN_FAILED' })
    expect(await store.openSource('a', '1')).toEqual({ status: 'failed' })

    harness.api.openTaskSource.mockRejectedValueOnce(new TaskCommandTransportError())
    expect(await store.openSource('a', '1')).toEqual({ status: 'failed' })
    expect(harness.api.openTaskSource).toHaveBeenCalledTimes(5)
  })
})

describe('store de tarefas: época transitória do undo', () => {
  it('undo-invalidated limpa oferta e confirmação pendentes e avança a época', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    const task = buildTask({ id: 'a', title: 'Alvo' })
    harness.setSnapshot(snapshot('1', [record(task, '1', '1')]))
    harness.emit({ type: 'snapshot', snapshot: snapshot('1', [record(task, '1', '1')]) })

    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'A'.repeat(32),
      revision: '1',
      itemCount: 1,
      hasRecurrence: false,
    })
    expect(await store.requestDelete('a')).toEqual({ status: 'confirmation', kind: 'move' })
    expect(store.confirmation).toMatchObject({ kind: 'MOVE', taskId: 'a' })

    harness.api.updateTask.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '2',
      contentRevision: '2',
      editRevision: '2',
      undoEpoch: 1,
      undoToken: 'B'.repeat(32),
    })
    expect(await store.update('a', '1', { title: 'Nova' })).toMatchObject({ status: 'accepted', kind: 'update' })
    expect(store.offer).toBeNull()
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(buildTask({ id: 'a', title: 'Nova' }), '2', '2')]) })
    expect(store.offer).toMatchObject({ token: 'B'.repeat(32), kind: 'update', taskId: 'a' })

    harness.emit({ type: 'undo-invalidated', undoEpoch: 2, reason: 'BACKUP_RESTORED' })
    expect(store.offer).toBeNull()
    expect(store.confirmation).toBeNull()
    expect(store.undoEpoch).toBe(2)
  })

  it('snapshot com mesma revisão e época maior limpa a oferta e avança undoEpoch', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    harness.emit({ type: 'snapshot', snapshot: snapshot('1', [record(buildTask({ id: 'a' }), '1', '1')]) })
    harness.api.changeTaskStatus.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '2',
      contentRevision: '2',
      editRevision: '2',
      undoEpoch: 1,
      undoToken: 'B'.repeat(32),
    })
    expect(await store.changeStatus('a', '1', 'DONE')).toMatchObject({ status: 'accepted', kind: 'status' })
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('2', [record(buildTask({ id: 'a', status: 'DONE' }), '2', '2')]),
    })
    expect(store.offer).toMatchObject({ token: 'B'.repeat(32), kind: 'status' })
    expect(store.undoEpoch).toBe(1)

    // Mesma revisão SQL, época transitória nova: a oferta antiga deixa de valer.
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('2', [record(buildTask({ id: 'a', status: 'DONE' }), '2', '2')], 2),
    })
    expect(store.offer).toBeNull()
    expect(store.undoEpoch).toBe(2)
    expect(store.revision).toBe('2')
  })

  it('ack de update com época anterior à conhecida é confirmado mas não publica oferta', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    // Barreira chega antes do comando: a época avança para 2.
    harness.emit({ type: 'undo-invalidated', undoEpoch: 2, reason: 'STORAGE_RECOVERED' })

    // Ack resolvido enquanto a época já avançou: recibo carrega época antiga (1).
    harness.api.updateTask.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '2',
      contentRevision: '2',
      editRevision: '2',
      undoEpoch: 1,
      undoToken: 'B'.repeat(32),
    })
    expect(await store.update('a', '1', { title: 'Nova' })).toMatchObject({ status: 'accepted', kind: 'update' })
    expect(store.awaitingConfirmation).toBe(true)

    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('2', [record(buildTask({ id: 'a', title: 'Nova' }), '2', '2')], 2),
    })
    expect(store.awaitingConfirmation).toBe(false)
    expect(store.lastConfirmed?.kind).toBe('update')
    expect(store.offer).toBeNull()
  })

  it('move carrega a época no ack e só publica a oferta com a época corrente', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    const task = buildTask({ id: 'a', title: 'Excluir' })
    harness.setSnapshot(snapshot('1', [record(task, '1', '1')]))
    harness.emit({ type: 'snapshot', snapshot: snapshot('1', [record(task, '1', '1')]) })

    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'A'.repeat(32),
      revision: '1',
      itemCount: 1,
      hasRecurrence: false,
    })
    expect(await store.requestDelete('a')).toEqual({ status: 'confirmation', kind: 'move' })

    harness.api.moveTaskToTrash.mockResolvedValue({
      version: 2,
      status: 'ok',
      revision: '2',
      retained: true,
      undoEpoch: 1,
      undoToken: 'B'.repeat(32),
    })
    expect(await store.confirmMove()).toMatchObject({ status: 'accepted', kind: 'move', retained: true, revision: '2' })
    expect(harness.api.moveTaskToTrash.mock.calls[0]?.[0]).toEqual({
      version: 2,
      contextSequence: expect.any(Number),
      confirmationToken: 'A'.repeat(32),
    })
    expect(store.offer).toBeNull()

    // Ack da época corrente: a oferta de exclusão aparece depois do snapshot >= ack.
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', []) })
    expect(store.offer).toMatchObject({ token: 'B'.repeat(32), kind: 'delete', taskId: 'a' })

    // Avanço de época: um novo move com ack antigo não republica a oferta.
    harness.emit({ type: 'undo-invalidated', undoEpoch: 2, reason: 'STORAGE_RECOVERED' })
    harness.setSnapshot(snapshot('2', [record(task, '2', '2')]))
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(task, '2', '2')], 2) })
    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'C'.repeat(32),
      revision: '2',
      itemCount: 1,
      hasRecurrence: false,
    })
    expect(await store.requestDelete('a')).toEqual({ status: 'confirmation', kind: 'move' })

    harness.api.moveTaskToTrash.mockResolvedValue({
      version: 2,
      status: 'ok',
      revision: '3',
      retained: true,
      undoEpoch: 1,
      undoToken: 'D'.repeat(32),
    })
    expect(await store.confirmMove()).toMatchObject({ status: 'accepted', kind: 'move' })
    harness.emit({ type: 'snapshot', snapshot: snapshot('3', [], 2) })
    expect(store.offer).toBeNull()
  })
})


describe('M07 sessões da superfície', () => {
  it('conserva filtros e seleção, rejeita snapshot/ack antigo após ocultar e reinscreve uma vez', async () => {
    const harness = setupStore(), store = useTasksStore()
    const original = record(buildTask({ id: 'a', title: 'Original' }))
    harness.setSnapshot(snapshot('1', [original])); await store.connect()
    store.setFilters({ search: 'rascunho' }); store.select('a')
    const oldListener = harness.api.subscribeState.mock.calls[0]?.[1] as ((update: StateUpdate) => void)
    let resolve: ((value: unknown) => void) | undefined
    harness.api.updateTask.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = store.update('a', '1', { title: 'Novo' })
    await vi.waitFor(() => expect(harness.api.updateTask).toHaveBeenCalledOnce())
    store.suspendSurface(); expect(store.surfaceSuspended).toBe(true)
    oldListener({ type: 'snapshot', snapshot: snapshot('99', []) })
    expect(store.revision).toBe('1'); expect(store.offer).toBeNull()
    harness.setSnapshot(snapshot('2', [record(buildTask({ id: 'a', title: 'Novo' }), '2')]))
    await store.resumeSurface(); await store.connect()
    resolve?.({ version: 5, status: 'ok', outcome: 'APPLIED', revision: '2', contentRevision: '2', editRevision: '2', undoEpoch: 1, undoToken: 'A'.repeat(32) })
    expect(await pending).toEqual({ status: 'blocked', code: 'SESSION_CLOSED' })
    expect(harness.api.subscribeState).toHaveBeenCalledTimes(2)
    expect(store.filters.search).toBe('rascunho'); expect(store.selectedTaskId).toBe('a')
    expect(store.offer).toBeNull(); expect(store.lastConfirmed).toBeNull()
  })
  it('resposta de confirmação da lixeira após ocultar não ressuscita token ou resultado incerto', async () => {
    const harness = setupStore(), store = useTasksStore()
    harness.setSnapshot(snapshot('1', [record(buildTask({ id: 'a' }))])); await store.connect()
    let resolve: ((value: unknown) => void) | undefined
    harness.api.prepareTrashConfirmation.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = store.requestDelete('a')
    await vi.waitFor(() => expect(harness.api.prepareTrashConfirmation).toHaveBeenCalledOnce())
    store.suspendSurface(); await store.resumeSurface()
    resolve?.({ version: 1, status: 'ok', confirmationToken: 'A'.repeat(32), revision: '1', itemCount: 1, hasRecurrence: false })
    expect(await pending).toEqual({ status: 'blocked', code: 'SESSION_CLOSED' })
    expect(store.confirmation).toBeNull(); expect(store.outcomeUnknown).toBeNull()
  })
})

describe('M09 localização de lembrete no renderer', () => {
  const tag = 'a'.repeat(64)
  it('BUSY relê o snapshot e localiza pelo ordinal da revisão estável', async () => {
    const harness = setupStore(), store = useTasksStore()
    harness.setSnapshot(snapshot('2', [record(buildTask({ id: 'antes' })), record(buildTask({ id: 'alvo', title: 'Alvo' }), '2', '2')]))
    await store.connect()
    harness.api.resolveReminderActivation
      .mockResolvedValueOnce({ version: 1, status: 'error', code: 'BUSY' })
      .mockResolvedValueOnce({ version: 1, status: 'ok', revision: '2', taskOrdinal: 1 })
    await store.locateReminder(tag)
    expect(harness.api.resolveReminderActivation).toHaveBeenCalledTimes(2)
    expect(store.locatedTask?.task.id).toBe('alvo')
    expect(store.locationMessage).toBeNull()
  })
  it('revisão divergente converge na tentativa seguinte sem selecionar o alvo errado', async () => {
    const harness = setupStore(), store = useTasksStore()
    harness.setSnapshot(snapshot('2', [record(buildTask({ id: 'outro', title: 'Outro' }), '2', '2')]))
    await store.connect()
    harness.setSnapshot(snapshot('3', [record(buildTask({ id: 'a0' }), '3', '3'), record(buildTask({ id: 'alvo', title: 'Alvo' }), '3', '3')]))
    harness.api.resolveReminderActivation
      .mockResolvedValueOnce({ version: 1, status: 'ok', revision: '2', taskOrdinal: 0 })
      .mockResolvedValueOnce({ version: 1, status: 'ok', revision: '3', taskOrdinal: 1 })
    await store.locateReminder(tag)
    expect(harness.api.resolveReminderActivation).toHaveBeenCalledTimes(2)
    expect(store.locatedTask?.task.id).toBe('alvo')
  })
  it('três leituras sem revisão estável informam sem localizar; rejeição de transporte é segura', async () => {
    const harness = setupStore(), store = useTasksStore()
    harness.setSnapshot(snapshot('2', [record(buildTask({ id: 'a' }), '2', '2')]))
    await store.connect()
    harness.setSnapshot(snapshot('3', [record(buildTask({ id: 'a' }), '3', '3')]))
    harness.api.resolveReminderActivation.mockResolvedValue({ version: 1, status: 'ok', revision: '2', taskOrdinal: 0 })
    await store.locateReminder(tag)
    expect(harness.api.resolveReminderActivation).toHaveBeenCalledTimes(3)
    expect(store.locatedTask).toBeNull()
    expect(store.locationMessage).toContain('Os dados estão mudando')

    harness.api.resolveReminderActivation.mockRejectedValueOnce(new Error('transporte fictício'))
    await store.locateReminder(tag)
    expect(store.locatedTask).toBeNull()
    expect(store.locationMessage).toBe('Não foi possível consultar o lembrete agora.')

    harness.api.resolveReminderActivation.mockResolvedValueOnce({ version: 1, status: 'error', code: 'NOT_AVAILABLE' })
    await store.locateReminder(tag)
    expect(store.locatedTask).toBeNull()
    expect(store.locationMessage).toBe('Este lembrete não corresponde mais a uma tarefa disponível.')
  })
  it('suspensão durante a consulta descarta resposta tardia e não localiza', async () => {
    const harness = setupStore(), store = useTasksStore()
    harness.setSnapshot(snapshot('1', [record(buildTask({ id: 'a' }))]))
    await store.connect()
    let resolve: ((value: unknown) => void) | undefined
    harness.api.resolveReminderActivation.mockImplementation(() => new Promise(done => { resolve = done }))
    const pending = store.locateReminder(tag)
    await vi.waitFor(() => expect(harness.api.resolveReminderActivation).toHaveBeenCalledOnce())
    store.suspendSurface()
    resolve?.({ version: 1, status: 'ok', revision: '1', taskOrdinal: 0 })
    await pending
    expect(store.locatedTask).toBeNull()
    expect(store.locationMessage).toBeNull()
  })
})
