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

function snapshot(revision: string, tasks: TaskRecord[]): StateSnapshot {
  return { revision, tasks, trash: [] }
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
        ? { version: 2 as const, status: 'ok' as const, snapshot: current }
        : { version: 2 as const, status: 'error' as const, code: 'STORAGE_UNAVAILABLE' as const },
    ),
    subscribeState: vi.fn(async (_request: unknown, next?: (update: StateUpdate) => void) => {
      if (subscribeFailure !== null) {
        return { version: 2 as const, status: 'error' as const, code: subscribeFailure as 'STORAGE_UNAVAILABLE' }
      }
      listener = next
      return { version: 2 as const, status: 'ok' as const, subscriptionId, snapshot: current }
    }),
    unsubscribeState: vi.fn(async () => ({ version: 2 as const, status: 'ok' as const })),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    setSubtaskDone: vi.fn(),
    openTaskSource: vi.fn(),
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
  it('conecta uma única vez com v2, adota o snapshot e desconecta a inscrição', async () => {
    const harness = setupStore()
    const store = useTasksStore()

    expect(store.presentation).toBe('loading')
    await store.connect()
    await store.connect()

    expect(harness.api.subscribeState).toHaveBeenCalledTimes(1)
    expect(harness.api.subscribeState.mock.calls[0]?.[0]).toEqual({ version: 2 })
    expect(store.presentation).toBe('empty')
    expect(store.revision).toBe('1')

    await store.disconnect()
    expect(harness.api.unsubscribeState).toHaveBeenCalledTimes(1)
    expect(harness.api.unsubscribeState.mock.calls[0]?.[0]).toEqual({ version: 2, subscriptionId: 'sub'.padEnd(24, 'S') })
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
  it('cria: envia v2, só anuncia depois do ack e confirma com conteúdo e edição', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.createTask.mockResolvedValue({
      version: 2,
      status: 'ok',
      taskId: 'novo',
      revision: '5',
      contentRevision: '5',
      editRevision: '5',
    })

    const result = await store.create({ title: 'Tarefa', subtasks: [{ title: 'Passo' }] })
    expect(result).toMatchObject({ status: 'accepted', kind: 'create', taskId: 'novo' })
    expect(harness.api.createTask.mock.calls[0]?.[0]).toMatchObject({
      version: 2,
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
      version: 2,
      status: 'ok',
      revision: '1',
      contentRevision: '1',
      editRevision: '1',
    })

    const result = await store.changeStatus('a', '1', 'TODO')
    expect(result).toMatchObject({ status: 'accepted', kind: 'status' })
    expect(harness.api.changeTaskStatus.mock.calls[0]?.[0]).toEqual({
      version: 2,
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
      version: 2,
      status: 'ok',
      revision: '9',
      contentRevision: '9',
      editRevision: '7',
    })

    const result = await store.update('a', '6', { title: 'Nova' })
    expect(result).toMatchObject({ status: 'accepted', kind: 'update' })
    expect(harness.api.updateTask.mock.calls[0]?.[0]).toEqual({
      version: 2,
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
            resolve({ version: 2, status: 'ok', taskId: 'x', revision: '2', contentRevision: '2', editRevision: '2' })
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
      version: 2,
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
    harness.api.updateTask.mockResolvedValue({ version: 2, status: 'error', code: 'NOT_FOUND' })

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
      version: 2,
      status: 'ok',
      taskId: 'nova',
      revision: '2',
      contentRevision: '2',
      editRevision: '2',
    })
    const again = await store.create({ title: 'Decisão explícita' })
    expect(again).toMatchObject({ status: 'accepted' })
  })

  it('validação posicional e restrição D8 são estados finitos sem alterar a lista', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValueOnce({
      version: 2,
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

    harness.api.updateTask.mockResolvedValueOnce({ version: 2, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'restricted' })
  })

  it('mapeia os códigos de série, identidade, escolha, limite e item ausente', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    harness.api.updateTask.mockResolvedValueOnce({ version: 2, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
    expect(await store.update('a', '1', { status: 'CANCELLED' })).toEqual({ status: 'choice-required' })

    harness.api.updateTask.mockResolvedValueOnce({ version: 2, status: 'error', code: 'SERIES_CONFLICT' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'series-conflict' })

    harness.api.updateTask.mockResolvedValueOnce({ version: 2, status: 'error', code: 'IDENTITY_CONFLICT' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'identity-conflict' })

    harness.api.updateTask.mockResolvedValueOnce({ version: 2, status: 'error', code: 'RECURRENCE_OUT_OF_RANGE' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'recurrence-out-of-range' })

    harness.api.setSubtaskDone.mockResolvedValueOnce({ version: 2, status: 'error', code: 'SUBTASK_NOT_FOUND' })
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
      version: 2,
      status: 'ok',
      revision: '6',
      contentRevision: '6',
      editRevision: '5',
    })

    const result = await store.setSubtaskDone('a', '5', 's1', true)
    expect(result).toMatchObject({ status: 'accepted', kind: 'subtask' })
    expect(harness.api.setSubtaskDone.mock.calls[0]?.[0]).toEqual({
      version: 2,
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
      version: 2,
      status: 'ok',
      revision: '7',
      contentRevision: '7',
      editRevision: '7',
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
      version: 2,
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
