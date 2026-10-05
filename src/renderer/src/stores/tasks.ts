import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { TaskCommandTransportError } from '../../../application/tasks/task-client.js'
import { TrashCommandTransportError } from '../../../application/tasks/trash-client.js'
import type { StateErrorCode, StateSnapshot, StateUpdate, TaskRecord, TrashRecord } from '../../../contracts/state.js'
import type {
  TaskCancellation,
  TaskCommandErrorCode,
  TaskMutationResult,
  TaskCheckResult,
} from '../../../contracts/tasks.js'
import type { TrashErrorCode } from '../../../contracts/trash.js'
import type { CreateTaskDraft, EditTaskPatch, TaskFieldErrors } from '../../../domain/task-draft.js'
import { compareTrashEntries, isTrashExpired } from '../../../domain/task-trash.js'
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

/** Falha de contrato com os campos comuns das três versões (criação/check v3, mutação v4). */
type AnyTaskFailure = Readonly<{
  code: TaskCommandErrorCode
  fields?: TaskFieldErrors
  currentContentRevision?: string
  currentEditRevision?: string
}>

/** Estados de apresentação explícitos; erro nunca vira coleção vazia. */
export type TasksPresentation = 'loading' | 'ready' | 'empty' | 'stale' | 'blocked'

export type TaskCommandKind = 'create' | 'update' | 'status' | 'subtask'
export type TrashCommandKind = 'move' | 'restore' | 'delete' | 'empty' | 'undo' | 'maintenance'
export type CommandKind = TaskCommandKind | TrashCommandKind

export type TaskCommandStoreResult =
  | { status: 'accepted'; kind: TaskCommandKind; taskId?: string }
  | { status: 'validation'; fields: TaskFieldErrors }
  | { status: 'conflict'; currentContentRevision?: string; currentEditRevision?: string }
  | { status: 'not-found' }
  | { status: 'subtask-not-found' }
  | { status: 'restricted' }
  | { status: 'choice-required' }
  | { status: 'series-conflict' }
  | { status: 'identity-conflict' }
  | { status: 'recurrence-out-of-range' }
  | { status: 'blocked'; code: TaskCommandErrorCode }
  | { status: 'uncertain' }

export type TrashCommandStoreResult =
  | {
      status: 'accepted'
      kind: TrashCommandKind
      /** Revisão confirmada no ack; usar com waitForSnapshot antes de mexer no foco. */
      revision?: string
      /** Presente em move: distingue exclusão retida da descartada pelo limite/relógio. */
      retained?: boolean
      removedCount?: number
    }
  | { status: 'confirmation'; kind: 'move' | 'permanent' | 'empty' }
  | { status: 'not-found' }
  | { status: 'not-in-trash' }
  | { status: 'entry-changed' }
  | { status: 'entry-expired' }
  | { status: 'id-exists' }
  | { status: 'series-conflict' }
  | { status: 'confirmation-changed' }
  | { status: 'confirmation-invalid' }
  | { status: 'stale-context' }
  | { status: 'undo-not-available' }
  | { status: 'removed' }
  | { status: 'changed' }
  | { status: 'generated-changed' }
  | { status: 'uncertain' }
  | { status: 'blocked'; code: TrashErrorCode }

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

/** Espera máxima por um snapshot >= revisão confirmada antes de bloquear a interface. */
const SNAPSHOT_WAIT_MS = 5_000

interface PendingAck {
  kind: CommandKind
  taskId?: string
  revision: bigint
  contentRevision: string
  editRevision: string
  /** Contexto em que a ação foi executada: oferta só publica se ainda for o corrente. */
  context: number
  /** Época do ack elegível; oferta só publica se ainda for a época conhecida. */
  epoch: number
  /** Token opaco da oferta de undo, publicado somente com snapshot >= ack. */
  undoToken?: string
}

export interface TaskConfirmation {
  kind: CommandKind
  taskId?: string
  revision: string
  contentRevision: string
  editRevision: string
  sequence: number
}

export interface TaskConflictState {
  taskId: string
  currentContentRevision?: string
  currentEditRevision?: string
}

/** Oferta de desfazer visível: token opaco + rótulo/identidade para mensagem e foco. */
export interface UndoOfferView {
  token: string
  kind: 'update' | 'status' | 'delete'
  taskId?: string
  sequence: number
}

/** Confirmação corrente preparada no main: MOVE/PERMANENT/EMPTY. */
export interface TrashConfirmationView {
  kind: 'MOVE' | 'PERMANENT' | 'EMPTY'
  token: string
  taskId?: string
  entry?: { taskId: string; contentRevision: string; deletedAt: string }
  itemCount: number
  hasRecurrence: boolean
}

export const useTasksStore = defineStore('tasks', () => {
  // Raso: os objetos vêm prontos do snapshot e nunca são mutados no renderer; manter 10.000
  // tarefas profundamente reativas custaria proxy/dependency tracking em cada propriedade.
  const records = shallowRef<TaskRecord[]>([])
  const trashRecords = shallowRef<TrashRecord[]>([])
  const revision = ref<string | undefined>(undefined)
  /** Época transitória do undo conhecida; ack/oferta só valem para a época corrente. */
  const undoEpoch = ref<number | undefined>(undefined)
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
  const conflict = ref<TaskConflictState | null>(null)
  const notFound = ref<{ taskId: string } | null>(null)
  const outcomeUnknown = ref<{ kind: CommandKind; taskId?: string } | null>(null)
  const resyncError = ref<StateErrorCode | null>(null)
  const lastConfirmed = shallowRef<TaskConfirmation | null>(null)
  // ---- Lixeira e desfazer (TFA-006) ----
  const trashMode = ref(false)
  /** Área de backup (TFA-007): uma inscrição existente, sem serviços futuros. */
  const backupMode = ref(false)
  const trashMaintenance = ref<'idle' | 'running' | 'failed'>('idle')
  const trashError = ref<TrashErrorCode | null>(null)
  const offer = ref<UndoOfferView | null>(null)
  const confirmation = ref<TrashConfirmationView | null>(null)
  /** Aviso honesto do resultado do move: retida com Desfazer ou descartada sem recuperação. */
  const deleteNotice = ref<{ retained: boolean; discarded: number } | null>(null)

  let subscriptionId: string | undefined
  let pendingAck: PendingAck | undefined
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let removeFocus: (() => void) | undefined
  let confirmationSequence = 0
  /** Contexto monotônico por documento; cada ação começa em uma sequência nova. */
  let contextSequence = 0

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
  /** Apresentação da lixeira: filtra vencidos pelo relógio local, sem gravar nem mutar o snapshot. */
  const trashVisible = computed(() => {
    const entries = trashRecords.value.filter((record) => !isTrashExpired(record.deletedAt, now.value))
    return [...entries].sort((a, b) =>
      compareTrashEntries(
        { taskId: a.task.id, contentRevision: BigInt(a.contentRevision), deletedAt: a.deletedAt },
        { taskId: b.task.id, contentRevision: BigInt(b.contentRevision), deletedAt: b.deletedAt },
      ),
    )
  })
  const trashTotal = computed(() => trashRecords.value.length)
  const trashPresentation = computed<'loading' | 'ready' | 'empty' | 'stale' | 'blocked' | 'maintenance-failed'>(() => {
    if (revision.value === undefined) return initialError.value === null ? 'loading' : 'blocked'
    if (stale.value) return 'stale'
    if (trashMaintenance.value === 'failed') return 'maintenance-failed'
    return trashVisible.value.length === 0 ? 'empty' : 'ready'
  })

  function taskRecord(taskId: string): TaskRecord | undefined {
    return records.value.find((record) => record.task.id === taskId)
  }

  function taskById(taskId: string): Task | undefined {
    return taskRecord(taskId)?.task
  }

  function trashRecord(taskId: string): TrashRecord | undefined {
    return trashRecords.value.find((record) => record.task.id === taskId)
  }

  function adopt(snapshot: StateSnapshot): void {
    // O cliente nunca regride; o store reforça para snapshots injetados fora do fluxo.
    const epochAdvanced = undoEpoch.value === undefined || snapshot.undoEpoch > undoEpoch.value
    if (revision.value !== undefined && BigInt(snapshot.revision) < BigInt(revision.value) && !epochAdvanced) return
    revision.value = snapshot.revision
    if (undoEpoch.value === undefined || snapshot.undoEpoch > undoEpoch.value) {
      undoEpoch.value = snapshot.undoEpoch
      // Época maior limpa ofertas/confirmações mesmo com revisão SQL igual.
      offer.value = null
      confirmation.value = null
      if (pendingAck !== undefined) delete pendingAck.undoToken
    }
    records.value = snapshot.tasks
    trashRecords.value = snapshot.trash
    stale.value = false
    initialError.value = null
    if (pendingAck !== undefined && BigInt(snapshot.revision) >= pendingAck.revision) resolveConfirmation()
  }

  function resolveConfirmation(): void {
    if (pendingAck === undefined) return
    const ack = pendingAck
    confirmationSequence += 1
    lastConfirmed.value = {
      kind: ack.kind,
      ...(ack.taskId !== undefined && { taskId: ack.taskId }),
      revision: revision.value ?? '0',
      contentRevision: ack.contentRevision,
      editRevision: ack.editRevision,
      sequence: confirmationSequence,
    }
    pendingAck = undefined
    awaitingConfirmation.value = false
    updatePending.value = false
    // Oferta somente depois do snapshot >= ack, com contexto E época ainda correntes.
    if (ack.undoToken !== undefined && ack.context === contextSequence && ack.epoch === undoEpoch.value) {
      offer.value = {
        token: ack.undoToken,
        kind: ack.kind === 'move' ? 'delete' : ack.kind === 'status' ? 'status' : 'update',
        ...(ack.taskId !== undefined && { taskId: ack.taskId }),
        sequence: ack.context,
      }
    }
  }

  function handleUpdate(update: StateUpdate): void {
    if (update.type === 'snapshot') {
      adopt(update.snapshot)
      return
    }
    if (update.type === 'undo-invalidated') {
      if (undoEpoch.value !== undefined && update.undoEpoch <= undoEpoch.value) return
      undoEpoch.value = update.undoEpoch
      // Barreira transitória: oferta/confirmação antigas não valem mais; nada é revertido.
      offer.value = null
      confirmation.value = null
      if (pendingAck !== undefined) delete pendingAck.undoToken
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

    const result = await window.taskflowDesktop.subscribeState({ version: 3 }, handleUpdate)
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
    if (id !== undefined) await window.taskflowDesktop.unsubscribeState({ version: 3, subscriptionId: id })
  }

  /** Ressincronização por snapshot; nunca regride nem converte erro em lista vazia. */
  async function refresh(): Promise<boolean> {
    const result = await window.taskflowDesktop.getStateSnapshot({ version: 3 })
    if (result.status !== 'ok') {
      resyncError.value = result.code
      return false
    }
    resyncError.value = null
    adopt(result.snapshot)
    return true
  }

  /** Aguarda (limitado) um snapshot com revisão >= alvo; usado antes de habilitar confirmações. */
  async function waitForSnapshot(target: string): Promise<boolean> {
    const goal = BigInt(target)
    if (revision.value !== undefined && BigInt(revision.value) >= goal) return true
    const started = Date.now()
    while (Date.now() - started < SNAPSHOT_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      if (revision.value !== undefined && BigInt(revision.value) >= goal) return true
    }
    return false
  }

  function mapFailure(failure: AnyTaskFailure, taskId: string | undefined): TaskCommandStoreResult {
    switch (failure.code) {
      case 'VALIDATION_FAILED':
        return { status: 'validation', fields: failure.fields ?? {} }
      case 'CONFLICT':
        conflict.value = {
          taskId: taskId ?? '',
          ...(failure.currentContentRevision !== undefined && { currentContentRevision: failure.currentContentRevision }),
          ...(failure.currentEditRevision !== undefined && { currentEditRevision: failure.currentEditRevision }),
        }
        return {
          status: 'conflict',
          ...(failure.currentContentRevision !== undefined && { currentContentRevision: failure.currentContentRevision }),
          ...(failure.currentEditRevision !== undefined && { currentEditRevision: failure.currentEditRevision }),
        }
      case 'NOT_FOUND':
        notFound.value = { taskId: taskId ?? '' }
        return { status: 'not-found' }
      case 'SUBTASK_NOT_FOUND':
        return { status: 'subtask-not-found' }
      case 'ADVANCED_TASK_RESTRICTED':
        return { status: 'restricted' }
      case 'RECURRENCE_CHOICE_REQUIRED':
        return { status: 'choice-required' }
      case 'SERIES_CONFLICT':
        return { status: 'series-conflict' }
      case 'IDENTITY_CONFLICT':
        return { status: 'identity-conflict' }
      case 'RECURRENCE_OUT_OF_RANGE':
        return { status: 'recurrence-out-of-range' }
      default:
        return { status: 'blocked', code: failure.code }
    }
  }

  function mapTrashFailure(code: TrashErrorCode): TrashCommandStoreResult {
    switch (code) {
      case 'NOT_FOUND':
        return { status: 'not-found' }
      case 'NOT_IN_TRASH':
        return { status: 'not-in-trash' }
      case 'ENTRY_CHANGED':
        return { status: 'entry-changed' }
      case 'ENTRY_EXPIRED':
        return { status: 'entry-expired' }
      case 'ID_EXISTS':
        return { status: 'id-exists' }
      case 'SERIES_CONFLICT':
        return { status: 'series-conflict' }
      case 'CONFIRMATION_CHANGED':
        return { status: 'confirmation-changed' }
      case 'CONFIRMATION_INVALID':
        return { status: 'confirmation-invalid' }
      case 'STALE_CONTEXT':
        return { status: 'stale-context' }
      case 'UNDO_NOT_AVAILABLE':
        return { status: 'undo-not-available' }
      case 'REMOVED':
        return { status: 'removed' }
      case 'CHANGED':
        return { status: 'changed' }
      case 'GENERATED_CHANGED':
        return { status: 'generated-changed' }
      default:
        return { status: 'blocked', code }
    }
  }

  function acceptAck(
    kind: CommandKind,
    taskId: string | undefined,
    ack: { revision: string; contentRevision: string; editRevision: string; undoToken?: string },
    epoch?: number,
  ): void {
    pendingAck = {
      kind,
      ...(taskId !== undefined && { taskId }),
      revision: BigInt(ack.revision),
      contentRevision: ack.contentRevision,
      editRevision: ack.editRevision,
      context: contextSequence,
      epoch: epoch ?? undoEpoch.value ?? 0,
      ...(ack.undoToken !== undefined && { undoToken: ack.undoToken }),
    }
    awaitingConfirmation.value = true
    updatePending.value = false
    // No-op ou snapshot já corrente: resolve sem esperar evento novo.
    if (revision.value !== undefined && BigInt(revision.value) >= pendingAck.revision) resolveConfirmation()
  }

  /** Ack de lixeira/undo: pode não trazer revisões de conteúdo/edição (move/delete/empty). */
  function acceptTrashAck(
    kind: TrashCommandKind,
    taskId: string | undefined,
    ack: { revision: string; contentRevision?: string; editRevision?: string; undoToken?: string },
    epoch?: number,
  ): void {
    pendingAck = {
      kind,
      ...(taskId !== undefined && { taskId }),
      revision: BigInt(ack.revision),
      contentRevision: ack.contentRevision ?? '0',
      editRevision: ack.editRevision ?? '0',
      context: contextSequence,
      epoch: epoch ?? undoEpoch.value ?? 0,
      ...(ack.undoToken !== undefined && { undoToken: ack.undoToken }),
    }
    awaitingConfirmation.value = true
    updatePending.value = false
    if (revision.value !== undefined && BigInt(revision.value) >= pendingAck.revision) resolveConfirmation()
  }

  /**
   * Início de qualquer ação/área: esconde a oferta imediatamente, incrementa o contexto e espera
   * o ack do clear antes do comando dependente. `false` bloqueia a ação (sem comando).
   */
  async function startAction(): Promise<boolean> {
    offer.value = null
    deleteNotice.value = null
    const next = contextSequence + 1
    if (!Number.isSafeInteger(next)) return false
    contextSequence = next
    // Token de ack antigo nunca publica depois de uma ação nova.
    if (pendingAck !== undefined) delete pendingAck.undoToken
    try {
      const result = await window.taskflowDesktop.clearUndoOffer({ version: 1, contextSequence: next })
      if (result.status !== 'ok') return false
      return true
    } catch {
      return false
    }
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
        ...(conflict.value.currentEditRevision !== undefined && {
          currentEditRevision: conflict.value.currentEditRevision,
        }),
      }
    }
    return null
  }

  async function runCreate(draft: CreateTaskDraft): Promise<TaskCommandStoreResult> {
    const blocked = gateBeforeWrite(undefined)
    if (blocked !== null) return blocked

    submitting.value = true
    try {
      if (!(await startAction())) return { status: 'blocked', code: 'BUSY' }
      const response = await window.taskflowDesktop.createTask({
        version: 3,
        contextSequence,
        draft: { ...draft },
      })
      if (response.status === 'error') return mapFailure(response, undefined)
      acceptAck('create', response.taskId, response)
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
    kind: Exclude<TaskCommandKind, 'create'>,
    taskId: string,
    operation: () => Promise<TaskMutationResult | TaskCheckResult>,
  ): Promise<TaskCommandStoreResult> {
    const blocked = gateBeforeWrite(taskId)
    if (blocked !== null) return blocked

    submitting.value = true
    try {
      if (!(await startAction())) return { status: 'blocked', code: 'BUSY' }
      const response = await operation()
      if (response.status === 'error') return mapFailure(response, taskId)
      acceptAck(kind, taskId, response, 'undoEpoch' in response ? response.undoEpoch : undefined)
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

  function create(draft: CreateTaskDraft): Promise<TaskCommandStoreResult> {
    return runCreate(draft)
  }

  function update(
    taskId: string,
    expectedEditRevision: string,
    patch: EditTaskPatch,
    cancellation?: TaskCancellation,
  ): Promise<TaskCommandStoreResult> {
    return runMutation('update', taskId, () =>
      window.taskflowDesktop.updateTask({
        version: 4,
        contextSequence,
        taskId,
        expectedEditRevision,
        patch,
        ...(cancellation !== undefined && { cancellation }),
      }),
    )
  }

  function changeStatus(
    taskId: string,
    expectedEditRevision: string,
    status: TaskStatus,
    cancellation?: TaskCancellation,
  ): Promise<TaskCommandStoreResult> {
    return runMutation('status', taskId, () =>
      window.taskflowDesktop.changeTaskStatus({
        version: 4,
        contextSequence,
        taskId,
        expectedEditRevision,
        status,
        ...(cancellation !== undefined && { cancellation }),
      }),
    )
  }

  /** Marca/desmarca por intenção um item da lista atual, sem fechar nem gerar ocorrência. */
  function setSubtaskDone(
    taskId: string,
    expectedEditRevision: string,
    subtaskId: string,
    done: boolean,
  ): Promise<TaskCommandStoreResult> {
    return runMutation('subtask', taskId, () =>
      window.taskflowDesktop.setSubtaskDone({ version: 3, contextSequence, taskId, expectedEditRevision, subtaskId, done }),
    )
  }

  async function openSource(taskId: string, expectedContentRevision: string): Promise<OpenSourceStoreResult> {
    if (presentation.value === 'loading' || presentation.value === 'blocked') {
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    }
    if (presentation.value === 'stale') return { status: 'blocked', code: 'SNAPSHOT_STALE' }
    // Abertura não oferece recibo, mas participa do contexto ordenado como qualquer ação.
    await startAction()

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

  // ---- Lixeira e desfazer (TFA-006) ----

  /** Entra na área: limpa oferta/confirmação e executa a manutenção explícita por idade. */
  async function enterTrash(): Promise<TrashCommandStoreResult> {
    const prepared = await startAction()
    trashMode.value = true
    if (!prepared) return { status: 'blocked', code: 'BUSY' }
    return runTrashMaintenance()
  }

  async function leaveTrash(): Promise<void> {
    trashMode.value = false
    confirmation.value = null
    await startAction()
  }

  /** Entra na área de Backup: limpa oferta própria pelo contexto, mantendo uma inscrição. */
  async function enterBackup(): Promise<boolean> {
    trashMode.value = false
    confirmation.value = null
    backupMode.value = true
    return startAction()
  }

  async function leaveBackup(): Promise<void> {
    backupMode.value = false
    await startAction()
  }

  /** Manutenção explícita (expurgo por idade) seguida de snapshot; leitura pura não expurga. */
  async function runTrashMaintenance(): Promise<TrashCommandStoreResult> {
    trashMaintenance.value = 'running'
    trashError.value = null
    submitting.value = true
    try {
      const response = await window.taskflowDesktop.prepareTrashView({ version: 1, contextSequence })
      if (response.status === 'error') {
        trashError.value = response.code
        trashMaintenance.value = 'failed'
        return mapTrashFailure(response.code)
      }
      await refresh()
      trashMaintenance.value = 'idle'
      return { status: 'accepted', kind: 'maintenance', revision: response.revision }
    } catch (error) {
      trashMaintenance.value = 'failed'
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'maintenance' }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  /** Prepara a confirmação (base no main) e só habilita depois de snapshot >= revisão lida. */
  async function prepareConfirmation(
    kind: 'MOVE' | 'PERMANENT' | 'EMPTY',
    target: { taskId?: string; expectedContentRevision?: string; entry?: { taskId: string; contentRevision: string; deletedAt: string } },
  ): Promise<TrashCommandStoreResult> {
    if (presentation.value === 'loading' || presentation.value === 'blocked') {
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    }
    if (submitting.value) return { status: 'blocked', code: 'BUSY' }

    submitting.value = true
    try {
      if (!(await startAction())) return { status: 'blocked', code: 'BUSY' }
      const request =
        kind === 'MOVE'
          ? {
              version: 1 as const,
              contextSequence,
              kind: 'MOVE' as const,
              taskId: target.taskId ?? '',
              expectedContentRevision: target.expectedContentRevision ?? '',
            }
          : kind === 'PERMANENT'
            ? { version: 1 as const, contextSequence, kind: 'PERMANENT' as const, entry: target.entry! }
            : { version: 1 as const, contextSequence, kind: 'EMPTY' as const }
      const response = await window.taskflowDesktop.prepareTrashConfirmation(request)
      if (response.status === 'error') return mapTrashFailure(response.code)
      // Diálogo só habilita com snapshot completo igual/superior à revisão preparada.
      const current = await refresh()
      if (!current || revision.value === undefined || BigInt(revision.value) < BigInt(response.revision)) {
        resyncError.value = 'SNAPSHOT_STALE'
        return { status: 'blocked', code: 'SNAPSHOT_STALE' }
      }
      const view: TrashConfirmationView = {
        kind,
        token: response.confirmationToken,
        itemCount: kind === 'EMPTY' ? response.itemCount : 1,
        hasRecurrence: kind === 'MOVE' ? response.hasRecurrence === true : false,
        ...(kind === 'MOVE' && target.taskId !== undefined && { taskId: target.taskId }),
        ...(kind === 'PERMANENT' && target.entry !== undefined && { entry: target.entry }),
      }
      confirmation.value = view
      return { status: 'confirmation', kind: kind === 'MOVE' ? 'move' : kind === 'PERMANENT' ? 'permanent' : 'empty' }
    } catch (error) {
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'maintenance' }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  function abandonConfirmation(): void {
    confirmation.value = null
  }

  /** Confirma a exclusão recuperável; ack informa retained e pode trazer a oferta de Desfazer. */
  async function confirmMove(): Promise<TrashCommandStoreResult> {
    const current = confirmation.value
    if (current === null || current.kind !== 'MOVE') return { status: 'confirmation-invalid' }
    submitting.value = true
    try {
      const response = await window.taskflowDesktop.moveTaskToTrash({
        version: 2,
        contextSequence,
        confirmationToken: current.token,
      })
      confirmation.value = null
      if (response.status === 'error') return mapTrashFailure(response.code)
      acceptTrashAck('move', current.taskId, response, response.undoEpoch)
      deleteNotice.value = { retained: response.retained, discarded: 0 }
      return { status: 'accepted', kind: 'move', retained: response.retained, revision: response.revision }
    } catch (error) {
      confirmation.value = null
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'move', ...(current.taskId !== undefined && { taskId: current.taskId }) }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  /** Restore normal: sem confirmação adicional e sem oferta de desfazer. */
  async function restoreTrash(entry: { taskId: string; contentRevision: string; deletedAt: string }): Promise<TrashCommandStoreResult> {
    if (submitting.value) return { status: 'blocked', code: 'BUSY' }
    submitting.value = true
    try {
      if (!(await startAction())) return { status: 'blocked', code: 'BUSY' }
      const response = await window.taskflowDesktop.restoreTrashItem({ version: 1, contextSequence, entry })
      if (response.status === 'error') return mapTrashFailure(response.code)
      acceptTrashAck('restore', entry.taskId, response)
      return { status: 'accepted', kind: 'restore', revision: response.revision }
    } catch (error) {
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'restore', taskId: entry.taskId }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  async function requestPermanentDelete(entry: {
    taskId: string
    contentRevision: string
    deletedAt: string
  }): Promise<TrashCommandStoreResult> {
    return prepareConfirmation('PERMANENT', { entry })
  }

  async function confirmPermanentDelete(): Promise<TrashCommandStoreResult> {
    const current = confirmation.value
    if (current === null || current.kind !== 'PERMANENT') return { status: 'confirmation-invalid' }
    submitting.value = true
    try {
      const response = await window.taskflowDesktop.deleteTrashItem({
        version: 1,
        contextSequence,
        confirmationToken: current.token,
      })
      confirmation.value = null
      if (response.status === 'error') return mapTrashFailure(response.code)
      acceptTrashAck('delete', current.entry?.taskId, response)
      return { status: 'accepted', kind: 'delete', revision: response.revision }
    } catch (error) {
      confirmation.value = null
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'delete' }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  async function requestEmptyTrash(): Promise<TrashCommandStoreResult> {
    return prepareConfirmation('EMPTY', {})
  }

  async function confirmEmptyTrash(): Promise<TrashCommandStoreResult> {
    const current = confirmation.value
    if (current === null || current.kind !== 'EMPTY') return { status: 'confirmation-invalid' }
    submitting.value = true
    try {
      const response = await window.taskflowDesktop.emptyTrash({
        version: 1,
        contextSequence,
        confirmationToken: current.token,
      })
      confirmation.value = null
      if (response.status === 'error') return mapTrashFailure(response.code)
      acceptTrashAck('empty', undefined, response)
      return { status: 'accepted', kind: 'empty', removedCount: response.removedCount, revision: response.revision }
    } catch (error) {
      confirmation.value = null
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'empty' }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
    }
  }

  /** Desfaz a última ação própria consumindo o token uma única vez, na sequência da oferta. */
  async function undoLastAction(): Promise<TrashCommandStoreResult> {
    const current = offer.value
    if (current === null) return { status: 'undo-not-available' }
    offer.value = null
    submitting.value = true
    try {
      const response = await window.taskflowDesktop.undoLastTaskAction({
        version: 1,
        contextSequence: current.sequence,
        undoToken: current.token,
      })
      if (response.status === 'error') return mapTrashFailure(response.code)
      acceptTrashAck('undo', current.taskId, response)
      return { status: 'accepted', kind: 'undo', revision: response.revision }
    } catch (error) {
      if (error instanceof TrashCommandTransportError) {
        outcomeUnknown.value = { kind: 'undo', ...(current.taskId !== undefined && { taskId: current.taskId }) }
        return { status: 'uncertain' }
      }
      return { status: 'blocked', code: 'STORAGE_UNAVAILABLE' }
    } finally {
      submitting.value = false
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

  /** Preparação da confirmação de exclusão recuperável a partir da tarefa atual. */
  function requestDelete(taskId: string): Promise<TrashCommandStoreResult> {
    const record = taskRecord(taskId)
    if (record === undefined) return Promise.resolve({ status: 'not-found' })
    return prepareConfirmation('MOVE', { taskId, expectedContentRevision: record.contentRevision })
  }

  function trashEntryOf(taskId: string): { taskId: string; contentRevision: string; deletedAt: string } | undefined {
    const record = trashRecord(taskId)
    if (record === undefined) return undefined
    return { taskId, contentRevision: record.contentRevision, deletedAt: record.deletedAt }
  }

  function restoreFromArea(taskId: string): Promise<TrashCommandStoreResult> {
    const entry = trashEntryOf(taskId)
    if (entry === undefined) return Promise.resolve({ status: 'not-in-trash' })
    return restoreTrash(entry)
  }

  function permanentFromArea(taskId: string): Promise<TrashCommandStoreResult> {
    const entry = trashEntryOf(taskId)
    if (entry === undefined) return Promise.resolve({ status: 'not-in-trash' })
    return requestPermanentDelete(entry)
  }

  return {
    records,
    trashRecords,
    revision,
    undoEpoch,
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
    trashVisible,
    trashTotal,
    trashMode,
    backupMode,
    trashPresentation,
    trashMaintenance,
    trashError,
    offer,
    confirmation,
    deleteNotice,
    connect,
    disconnect,
    refresh,
    waitForSnapshot,
    startAction,
    currentContext: () => contextSequence,
    create,
    update,
    changeStatus,
    setSubtaskDone,
    openSource,
    enterTrash,
    leaveTrash,
    enterBackup,
    leaveBackup,
    runTrashMaintenance,
    requestDelete,
    confirmMove,
    abandonConfirmation,
    restoreTrash,
    restoreFromArea,
    requestPermanentDelete,
    permanentFromArea,
    confirmPermanentDelete,
    requestEmptyTrash,
    confirmEmptyTrash,
    undoLastAction,
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
