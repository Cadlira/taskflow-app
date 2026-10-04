import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { TaskCommandTransportError } from '../../../application/tasks/task-client.js'
import type { StateErrorCode, StateSnapshot, StateUpdate, TaskRecord } from '../../../contracts/state.js'
import type { TaskCommandErrorCode, TaskCommandFailure, TaskMutationResult } from '../../../contracts/tasks.js'
import type { BasicFieldErrors, BasicTaskDraft, BasicTaskPatch } from '../../../domain/task-draft.js'
import {
  EMPTY_TASK_FILTERS,
  filterTasks,
  getDueSituation,
  sortTasks,
  type DueSituation,
  type TaskFilters,
  type TaskSortKey,
} from '../../../domain/task-queries.js'
import type { Task, TaskStatus } from '../../../domain/task.js'

/** Estados de apresentação explícitos; erro nunca vira coleção vazia. */
export type TasksPresentation = 'loading' | 'ready' | 'empty' | 'stale' | 'blocked'

export type TaskCommandStoreResult =
  | { status: 'accepted'; kind: 'create' | 'update' | 'status'; taskId?: string }
  | { status: 'validation'; fields: BasicFieldErrors }
  | { status: 'conflict'; currentContentRevision?: string }
  | { status: 'not-found' }
  | { status: 'restricted' }
  | { status: 'blocked'; code: TaskCommandErrorCode }
  | { status: 'uncertain' }

export type OpenSourceStoreResult =
  | { status: 'requested' }
  | { status: 'blocked'; code: TaskCommandErrorCode }
  | { status: 'not-found' }
  | { status: 'conflict' }
  | { status: 'unavailable' }
  | { status: 'refused' }
  | { status: 'failed' }

/** Relógio de apresentação: 60 s enquanto ativo e imediatamente ao retomar o foco. */
const CLOCK_REFRESH_MS = 60_000

interface PendingAck {
  kind: 'create' | 'update' | 'status'
  taskId?: string
  revision: bigint
  contentRevision: string
}

export interface TaskConfirmation {
  kind: 'create' | 'update' | 'status'
  taskId?: string
  revision: string
  contentRevision: string
  sequence: number
}

export const useTasksStore = defineStore('tasks', () => {
  // Raso: os objetos de tarefa vêm prontos do snapshot e nunca são mutados no renderer; manter
  // 10.000 tarefas profundamente reativas custaria proxy/dependency tracking em cada propriedade.
  const records = shallowRef<TaskRecord[]>([])
  const revision = ref<string | undefined>(undefined)
  const stale = ref(false)
  const initialError = ref<StateErrorCode | null>(null)
  const filters = ref<TaskFilters>({ ...EMPTY_TASK_FILTERS })
  const sortKey = ref<TaskSortKey>('DUE_DATE')
  const selectedTaskId = ref<string | null>(null)
  const now = ref(new Date())
  const submitting = ref(false)
  const awaitingConfirmation = ref(false)
  /** Ack confirmado, mas o snapshot de revisão >= ack ainda não chegou. */
  const updatePending = ref(false)
  const conflict = ref<{ taskId: string; currentContentRevision?: string } | null>(null)
  const notFound = ref<{ taskId: string } | null>(null)
  const outcomeUnknown = ref<{ kind: 'create' | 'update' | 'status'; taskId?: string } | null>(null)
  const resyncError = ref<StateErrorCode | null>(null)
  const lastConfirmed = shallowRef<TaskConfirmation | null>(null)

  let subscriptionId: string | undefined
  let pendingAck: PendingAck | undefined
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let removeFocus: (() => void) | undefined
  let confirmationSequence = 0

  const presentation = computed<TasksPresentation>(() => {
    if (revision.value === undefined) return initialError.value === null ? 'loading' : 'blocked'
    if (stale.value) return 'stale'
    return records.value.length === 0 ? 'empty' : 'ready'
  })

  const visibleTasks = computed(() =>
    sortTasks(
      filterTasks(
        records.value.map((record) => record.task),
        filters.value,
        now.value,
      ),
      sortKey.value,
    ),
  )
  const visibleRecords = computed(() => {
    const byId = new Map(records.value.map((record) => [record.task.id, record]))
    return visibleTasks.value.map((task) => byId.get(task.id) as TaskRecord)
  })
  const totalTasks = computed(() => records.value.length)
  const hasActiveFilters = computed(
    () =>
      filters.value.search.trim() !== '' ||
      filters.value.status !== 'ALL' ||
      filters.value.priority !== 'ALL' ||
      filters.value.dueSituation !== 'ALL',
  )
  const noResults = computed(
    () => presentation.value === 'ready' && visibleRecords.value.length === 0 && hasActiveFilters.value,
  )
  /** Conflito/resultado incerto exigem decisão explícita antes de uma nova escrita. */
  const submissionBlocked = computed(() => conflict.value !== null || outcomeUnknown.value !== null)
  const commandsBlocked = computed(
    () => presentation.value === 'loading' || presentation.value === 'blocked' || submissionBlocked.value,
  )

  function taskRecord(taskId: string): TaskRecord | undefined {
    return records.value.find((record) => record.task.id === taskId)
  }

  function taskById(taskId: string): Task | undefined {
    return taskRecord(taskId)?.task
  }

  function adopt(snapshot: StateSnapshot): void {
    // O cliente nunca regride; o store reforça para snapshots injetados fora do fluxo.
    if (revision.value !== undefined && BigInt(snapshot.revision) < BigInt(revision.value)) return
    revision.value = snapshot.revision
    records.value = snapshot.tasks
    stale.value = false
    initialError.value = null
    if (pendingAck !== undefined && BigInt(snapshot.revision) >= pendingAck.revision) resolveConfirmation()
  }

  function resolveConfirmation(): void {
    if (pendingAck === undefined) return
    confirmationSequence += 1
    lastConfirmed.value = {
      kind: pendingAck.kind,
      ...(pendingAck.taskId !== undefined && { taskId: pendingAck.taskId }),
      revision: revision.value ?? '0',
      contentRevision: pendingAck.contentRevision,
      sequence: confirmationSequence,
    }
    pendingAck = undefined
    awaitingConfirmation.value = false
    updatePending.value = false
  }

  function handleUpdate(update: StateUpdate): void {
    if (update.type === 'snapshot') {
      adopt(update.snapshot)
      return
    }
    stale.value = true
    // Ack já recebido, mas a atualização da lista não chegou: o save está confirmado.
    if (pendingAck !== undefined) updatePending.value = true
  }

  function startClock(): void {
    if (clockTimer !== undefined) return
    clockTimer = setInterval(() => {
      now.value = new Date()
    }, CLOCK_REFRESH_MS)
    const onFocus = (): void => {
      now.value = new Date()
    }
    window.addEventListener('focus', onFocus)
    removeFocus = () => window.removeEventListener('focus', onFocus)
  }

  function stopClock(): void {
    if (clockTimer !== undefined) clearInterval(clockTimer)
    clockTimer = undefined
    removeFocus?.()
    removeFocus = undefined
  }

  /** Inscrição idempotente: uma única subscription por superfície, com o cliente existente. */
  async function connect(): Promise<void> {
    if (subscriptionId !== undefined) return
    startClock()

    const result = await window.taskflowDesktop.subscribeState({ version: 1 }, handleUpdate)
    if (result.status !== 'ok') {
      initialError.value = result.code
      return
    }
    subscriptionId = result.subscriptionId
    adopt(result.snapshot)
  }

  async function disconnect(): Promise<void> {
    stopClock()
    const id = subscriptionId
    subscriptionId = undefined
    if (id !== undefined) await window.taskflowDesktop.unsubscribeState({ version: 1, subscriptionId: id })
  }

  /** Ressincronização por snapshot; nunca regride nem converte erro em lista vazia. */
  async function refresh(): Promise<boolean> {
    const result = await window.taskflowDesktop.getStateSnapshot({ version: 1 })
    if (result.status !== 'ok') {
      resyncError.value = result.code
      return false
    }
    resyncError.value = null
    adopt(result.snapshot)
    return true
  }

  function mapFailure(failure: TaskCommandFailure, taskId: string | undefined): TaskCommandStoreResult {
    switch (failure.code) {
      case 'VALIDATION_FAILED':
        return { status: 'validation', fields: failure.fields ?? {} }
      case 'CONFLICT':
        conflict.value = {
          taskId: taskId ?? '',
          ...(failure.currentContentRevision !== undefined && { currentContentRevision: failure.currentContentRevision }),
        }
        return {
          status: 'conflict',
          ...(failure.currentContentRevision !== undefined && { currentContentRevision: failure.currentContentRevision }),
        }
      case 'NOT_FOUND':
        notFound.value = { taskId: taskId ?? '' }
        return { status: 'not-found' }
      case 'ADVANCED_TASK_RESTRICTED':
        return { status: 'restricted' }
      default:
        return { status: 'blocked', code: failure.code }
    }
  }

  function acceptAck(kind: PendingAck['kind'], taskId: string | undefined, ackRevision: string, contentRevision: string): void {
    pendingAck = { kind, ...(taskId !== undefined && { taskId }), revision: BigInt(ackRevision), contentRevision }
    awaitingConfirmation.value = true
    updatePending.value = false
    // No-op ou snapshot já corrente: resolve sem esperar evento novo.
    if (revision.value !== undefined && BigInt(revision.value) >= pendingAck.revision) resolveConfirmation()
  }

  /** Gates comuns: estado válido, sem incerteza pendente e sem escrita em andamento. */
  function gateBeforeWrite(taskId: string | undefined): TaskCommandStoreResult | null {
    if (presentation.value === 'loading' || presentation.value === 'blocked') {
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    }
    if (presentation.value === 'stale') return { status: 'blocked', code: 'SNAPSHOT_STALE' }
    if (outcomeUnknown.value !== null) return { status: 'blocked', code: 'BUSY' }
    if (submitting.value) return { status: 'blocked', code: 'BUSY' }
    if (conflict.value !== null && (taskId === undefined || conflict.value.taskId === taskId)) {
      return {
        status: 'conflict',
        ...(conflict.value.currentContentRevision !== undefined && {
          currentContentRevision: conflict.value.currentContentRevision,
        }),
      }
    }
    return null
  }

  async function runCreate(draft: BasicTaskDraft): Promise<TaskCommandStoreResult> {
    const blocked = gateBeforeWrite(undefined)
    if (blocked !== null) return blocked

    submitting.value = true
    try {
      const response = await window.taskflowDesktop.createTask({ version: 1, draft: { ...draft } })
      if (response.status === 'error') return mapFailure(response, undefined)
      acceptAck('create', response.taskId, response.revision, response.contentRevision)
      return { status: 'accepted', kind: 'create', taskId: response.taskId }
    } catch (error) {
      if (error instanceof TaskCommandTransportError) {
        outcomeUnknown.value = { kind: 'create' }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  async function runMutation(
    kind: 'update' | 'status',
    taskId: string,
    operation: () => Promise<TaskMutationResult>,
  ): Promise<TaskCommandStoreResult> {
    const blocked = gateBeforeWrite(taskId)
    if (blocked !== null) return blocked

    submitting.value = true
    try {
      const response = await operation()
      if (response.status === 'error') return mapFailure(response, taskId)
      acceptAck(kind, taskId, response.revision, response.contentRevision)
      return { status: 'accepted', kind }
    } catch (error) {
      if (error instanceof TaskCommandTransportError) {
        outcomeUnknown.value = { kind, taskId }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  function create(draft: BasicTaskDraft): Promise<TaskCommandStoreResult> {
    return runCreate(draft)
  }

  function update(taskId: string, expectedContentRevision: string, patch: BasicTaskPatch): Promise<TaskCommandStoreResult> {
    return runMutation('update', taskId, () =>
      window.taskflowDesktop.updateTask({ version: 1, taskId, expectedContentRevision, patch }),
    )
  }

  function changeStatus(taskId: string, expectedContentRevision: string, status: TaskStatus): Promise<TaskCommandStoreResult> {
    return runMutation('status', taskId, () =>
      window.taskflowDesktop.changeTaskStatus({ version: 1, taskId, expectedContentRevision, status }),
    )
  }

  async function openSource(taskId: string, expectedContentRevision: string): Promise<OpenSourceStoreResult> {
    if (presentation.value === 'loading' || presentation.value === 'blocked') {
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    }
    if (presentation.value === 'stale') return { status: 'blocked', code: 'SNAPSHOT_STALE' }

    try {
      const result = await window.taskflowDesktop.openTaskSource({ version: 1, taskId, expectedContentRevision })
      if (result.status === 'ok') return { status: 'requested' }
      switch (result.code) {
        case 'NOT_FOUND':
          notFound.value = { taskId }
          return { status: 'not-found' }
        case 'CONFLICT':
          conflict.value = {
            taskId,
            ...(result.currentContentRevision !== undefined && { currentContentRevision: result.currentContentRevision }),
          }
          return { status: 'conflict' }
        case 'SOURCE_NOT_AVAILABLE':
          return { status: 'unavailable' }
        case 'SOURCE_NOT_ALLOWED':
        case 'SOURCE_TOO_LONG':
          return { status: 'refused' }
        case 'EXTERNAL_OPEN_FAILED':
          return { status: 'failed' }
        default:
          return { status: 'blocked', code: result.code }
      }
    } catch {
      // Efeito pode ter sido solicitado; não repetimos automaticamente.
      return { status: 'failed' }
    }
  }

  /** Conferência da versão atual em leitura; usa o snapshot e, se preciso, ressincroniza. */
  async function inspectCurrent(taskId: string): Promise<TaskRecord | null> {
    const local = taskRecord(taskId)
    if (local !== undefined) return local
    await refresh()
    return taskRecord(taskId) ?? null
  }

  /** Conferir lista depois de resultado incerto: ressincroniza e libera nova decisão explícita. */
  async function reviewAfterUncertain(): Promise<boolean> {
    const ok = await refresh()
    if (ok) outcomeUnknown.value = null
    return ok
  }

  /** Confirmar descarte do draft e recarregar a base do formulário a partir da versão atual. */
  async function reloadBase(taskId: string): Promise<TaskRecord | null> {
    const record = await inspectCurrent(taskId)
    conflict.value = null
    notFound.value = null
    return record
  }

  function clearConflict(): void {
    conflict.value = null
  }

  function clearNotFound(): void {
    notFound.value = null
  }

  function setFilters(changes: Partial<TaskFilters>): void {
    filters.value = { ...filters.value, ...changes }
  }

  function clearFilters(): void {
    filters.value = { ...EMPTY_TASK_FILTERS }
  }

  function setSortKey(key: TaskSortKey): void {
    sortKey.value = key
  }

  function select(id: string | null): void {
    selectedTaskId.value = id
  }

  function dueSituationOf(task: Task): DueSituation | undefined {
    return getDueSituation(task, now.value)
  }

  return {
    records,
    revision,
    stale,
    initialError,
    filters,
    sortKey,
    selectedTaskId,
    now,
    submitting,
    awaitingConfirmation,
    updatePending,
    conflict,
    notFound,
    outcomeUnknown,
    resyncError,
    lastConfirmed,
    presentation,
    visibleRecords,
    visibleTasks,
    totalTasks,
    hasActiveFilters,
    noResults,
    commandsBlocked,
    submissionBlocked,
    taskById,
    connect,
    disconnect,
    refresh,
    create,
    update,
    changeStatus,
    openSource,
    inspectCurrent,
    reviewAfterUncertain,
    reloadBase,
    clearConflict,
    clearNotFound,
    setFilters,
    clearFilters,
    setSortKey,
    select,
    dueSituationOf,
  }
})

export type TasksStore = ReturnType<typeof useTasksStore>
