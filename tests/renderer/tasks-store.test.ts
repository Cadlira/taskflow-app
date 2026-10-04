import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskCommandTransportError } from '../../src/application/tasks/task-client.js'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import type { StateSnapshot, StateUpdate, TaskRecord } from '../../src/contracts/state.js'
import type { Task } from '../../src/domain/task.js'
import { useTasksStore } from '../../src/renderer/src/stores/tasks.js'
import { buildTask } from '../support/task-fixtures.js'

function record(task: Task, contentRevision = '1'): TaskRecord {
  return { task, contentRevision }
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
        ? { version: 1 as const, status: 'ok' as const, snapshot: current }
        : { version: 1 as const, status: 'error' as const, code: 'STORAGE_UNAVAILABLE' as const },
    ),
    subscribeState: vi.fn(async (_request: unknown, next?: (update: StateUpdate) => void) => {
      if (subscribeFailure !== null) {
        return { version: 1 as const, status: 'error' as const, code: subscribeFailure as 'STORAGE_UNAVAILABLE' }
      }
      listener = next
      return { version: 1 as const, status: 'ok' as const, subscriptionId, snapshot: current }
    }),
    unsubscribeState: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const })),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    changeTaskStatus: vi.fn(),
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
  it('conecta uma única vez, adota o snapshot e desconecta a inscrição', async () => {
    const harness = setupStore()
    const store = useTasksStore()

    expect(store.presentation).toBe('loading')
    await store.connect()
    await store.connect()

    expect(harness.api.subscribeState).toHaveBeenCalledTimes(1)
    expect(store.presentation).toBe('empty')
    expect(store.revision).toBe('1')

    await store.disconnect()
    expect(harness.api.unsubscribeState).toHaveBeenCalledTimes(1)
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
  it('cria: só anuncia depois do ack; aguarda snapshot >= revisão e encerra sincronização', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.createTask.mockResolvedValue({
      version: 1,
      status: 'ok',
      taskId: 'novo',
      revision: '5',
      contentRevision: '5',
    })

    const result = await store.create({ title: 'Tarefa' })
    expect(result).toMatchObject({ status: 'accepted', kind: 'create', taskId: 'novo' })
    expect(store.awaitingConfirmation).toBe(true)
    expect(store.lastConfirmed).toBeNull()

    harness.emit({ type: 'snapshot', snapshot: snapshot('5', [record(buildTask({ id: 'novo' }), '5')]) })
    expect(store.awaitingConfirmation).toBe(false)
    expect(store.lastConfirmed).toMatchObject({ kind: 'create', taskId: 'novo', revision: '5' })
  })

  it('no-op resolve imediatamente com o snapshot já corrente', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.changeTaskStatus.mockResolvedValue({ version: 1, status: 'ok', revision: '1', contentRevision: '1' })

    const result = await store.changeStatus('a', '1', 'TODO')
    expect(result).toMatchObject({ status: 'accepted' })
    expect(store.awaitingConfirmation).toBe(false)
    expect(store.lastConfirmed?.kind).toBe('status')
  })

  it('ack com ressync falhado informa atualização pendente sem anunciar rollback', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValue({ version: 1, status: 'ok', revision: '9', contentRevision: '9' })

    const result = await store.update('a', '1', { title: 'Nova' })
    expect(result).toMatchObject({ status: 'accepted' })
    expect(store.awaitingConfirmation).toBe(true)

    harness.emit({ type: 'stale', code: 'BUSY' })
    expect(store.updatePending).toBe(true)
    expect(store.lastConfirmed).toBeNull()

    harness.emit({ type: 'snapshot', snapshot: snapshot('9', [record(buildTask({ id: 'a' }), '9')]) })
    expect(store.updatePending).toBe(false)
    expect(store.lastConfirmed?.contentRevision).toBe('9')
  })

  it('duplo envio na mesma interação é bloqueado; segundo comando não sai', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()

    let release: (() => void) | undefined
    harness.api.createTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ version: 1, status: 'ok', taskId: 'x', revision: '2', contentRevision: '2' })
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

  it('conflito preserva base: resultado, gate do mesmo item e recarga explícita', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('4', [record(buildTask({ id: 'a', title: 'Atual' }), '4')]),
    })
    harness.api.updateTask.mockResolvedValue({
      version: 1,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '7',
    })

    const conflict = await store.update('a', '2', { title: 'Meu draft' })
    expect(conflict).toEqual({ status: 'conflict', currentContentRevision: '7' })
    expect(store.conflict).toMatchObject({ taskId: 'a', currentContentRevision: '7' })

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
      snapshot: snapshot('8', [record(buildTask({ id: 'a', title: 'Mais nova' }), '6')]),
    })
    const reloaded = await store.reloadBase('a')
    expect(reloaded?.task.title).toBe('Mais nova')
    expect(store.conflict).toBeNull()
  })

  it('NOT_FOUND conserva a lista e não recria a tarefa', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValue({ version: 1, status: 'error', code: 'NOT_FOUND' })

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
      version: 1,
      status: 'ok',
      taskId: 'nova',
      revision: '2',
      contentRevision: '2',
    })
    const again = await store.create({ title: 'Decisão explícita' })
    expect(again).toMatchObject({ status: 'accepted' })
  })

  it('validação e restrição são estados finitos sem alterar a lista', async () => {
    const harness = setupStore()
    const store = useTasksStore()
    await store.connect()
    harness.api.updateTask.mockResolvedValueOnce({
      version: 1,
      status: 'error',
      code: 'VALIDATION_FAILED',
      fields: { title: 'REQUIRED' },
    })
    expect(await store.update('a', '1', { title: '' })).toEqual({
      status: 'validation',
      fields: { title: 'REQUIRED' },
    })

    harness.api.updateTask.mockResolvedValueOnce({ version: 1, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })
    expect(await store.update('a', '1', { title: 'x' })).toEqual({ status: 'restricted' })
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
