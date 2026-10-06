<script setup lang="ts">
// Adaptação revisada de taskflow-extension@a763e7a src/components/tasks/TaskManager.vue
// (MIT, mesmo autor). Preserva fluxo lista/criar/editar, estados, foco pós-ação e live regions.
// Acrescenta diálogo SKIP/END, marcação de subtarefa e consulta temporária de lembrete; não
// monta captura, lixeira, backup, IA nem undo (o formulário-filho edita lembretes).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TaskRecord } from '../../../../contracts/state.js'
import type { TaskCancellation } from '../../../../contracts/tasks.js'
import type { EditTaskPatch, TaskFieldErrors } from '../../../../domain/task-draft.js'
import type { Task, TaskStatus } from '../../../../domain/task.js'
import { useTasksStore, type TaskCommandStoreResult, type TrashCommandStoreResult } from '../../stores/tasks.js'
import BackupManager from '../backup/BackupManager.vue'
import TrashManager from '../trash/TrashManager.vue'
import TaskCancellationDialog from './TaskCancellationDialog.vue'
import TaskFilters from './TaskFilters.vue'
import TaskForm, { type TaskFormSubmission } from './TaskForm.vue'
import TaskList from './TaskList.vue'
import { STATUS_LABELS } from './task-labels.js'
import type { StatusChangeOrigin, TaskStatusAction } from './task-status-origin.js'

type Feedback = { tone: 'success' | 'warning' | 'error'; text: string }

interface PendingListAction {
  taskId: string
  position: number
  action: TaskStatusAction
  fromFocusout: boolean
}

/** Escolha SKIP/END pendente: só existe depois do pedido explícito do main, nada gravado antes. */
type PendingCancellation =
  | {
      kind: 'status'
      taskId: string
      taskTitle: string
      editRevision: string
      status: TaskStatus
      pending: PendingListAction
    }
  | { kind: 'update'; taskId: string; taskTitle: string; editRevision: string; patch: EditTaskPatch }

const store = useTasksStore()

const mode = ref<'list' | 'form'>('list')
const editingRecord = ref<TaskRecord | null>(null)
const formKey = ref(0)
const formErrors = ref<TaskFieldErrors>({})
const formMessage = ref<string | null>(null)
const feedback = ref<Feedback | null>(null)
const actionError = ref<string | null>(null)
const busyTaskId = ref<string | null>(null)
const pendingAction = ref<PendingListAction | null>(null)
const pendingCancellation = ref<PendingCancellation | null>(null)
const conflictInspect = ref<TaskRecord | null>(null)
const reloadConfirm = ref(false)
/** Exclusão recuperável aguardando confirmação (base preparada no main). */
const deleteTarget = ref<Task | null>(null)
const deletePanel = ref<HTMLElement | null>(null)

const newTaskButton = ref<HTMLButtonElement | null>(null)
const retryButton = ref<HTMLButtonElement | null>(null)
const createFirstButton = ref<HTMLButtonElement | null>(null)
const clearFiltersButton = ref<HTMLButtonElement | null>(null)
const formMessageAlert = ref<HTMLElement | null>(null)
const conflictPanel = ref<HTMLElement | null>(null)
const taskList = ref<InstanceType<typeof TaskList> | null>(null)
const taskForm = ref<InstanceType<typeof TaskForm> | null>(null)
const locationHeading = ref<HTMLElement | null>(null)
watch(() => [store.locatedTask, store.locationMessage], () => { void nextTick(() => locationHeading.value?.focus()) })
watch(() => store.surfaceSuspended, suspended => {
  if (!suspended) return
  pendingCancellation.value = null; pendingAction.value = null; deleteTarget.value = null
  busyTaskId.value = null; reloadConfirm.value = false
})

const conflictForEditing = computed(
  () => store.conflict !== null && editingRecord.value !== null && store.conflict.taskId === editingRecord.value.task.id,
)
const notFoundForEditing = computed(
  () => store.notFound !== null && editingRecord.value !== null && store.notFound.taskId === editingRecord.value.task.id,
)

watch(retryButton, (button) => button?.focus())

onMounted(() => {
  void store.connect()
})
onBeforeUnmount(() => {
  void store.disconnect()
})

watch(
  () => store.lastConfirmed,
  (confirmation) => {
    if (confirmation === null) return
    if (mode.value === 'form') {
      closeForm(false)
      feedback.value = {
        tone: 'success',
        text: confirmation.kind === 'create' ? 'Tarefa criada.' : 'Alterações salvas.',
      }
    }
    if (pendingAction.value !== null) {
      const pending = pendingAction.value
      pendingAction.value = null
      void focusAfterListAction(pending)
    }
  },
)

watch(
  () => store.updatePending,
  (pending) => {
    if (pending && mode.value === 'form') {
      formMessage.value = 'Tarefa salva no banco; a atualização da lista está pendente. Os inputs serão mantidos até a reconciliação.'
    }
  },
)

watch(
  () => store.conflict,
  (conflict) => {
    conflictInspect.value = null
    reloadConfirm.value = false
    if (conflict !== null) void nextTick(() => conflictPanel.value?.focus())
  },
)

function listPosition(taskId: string): number {
  return store.visibleTasks.findIndex((task) => task.id === taskId)
}

function equivalentAction(action: TaskStatusAction): TaskStatusAction {
  if (action === 'complete' || action === 'cancel') return 'reopen'
  if (action === 'reopen') return 'complete'
  return 'status'
}

async function focusAfterListAction(pending: PendingListAction): Promise<void> {
  await nextTick()
  if (pending.fromFocusout) {
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
  }

  const task = store.visibleTasks.find((candidate) => candidate.id === pending.taskId)
  if (task) {
    taskList.value?.focusControl(task.id, equivalentAction(pending.action))
    return
  }

  const neighbor = store.visibleTasks[pending.position] ?? store.visibleTasks.at(-1)
  if (neighbor) {
    taskList.value?.focusControl(neighbor.id, 'edit')
    return
  }

  if (store.totalTasks === 0) createFirstButton.value?.focus()
  else clearFiltersButton.value?.focus()
}

function resetMessages(): void {
  feedback.value = null
  actionError.value = null
  formMessage.value = null
  formErrors.value = {}
}

function openCreate(): void {
  // Abrir formulário é uma ação nova: limpa oferta/confirmação próprias antes do percurso.
  void store.startAction()
  resetMessages()
  editingRecord.value = null
  formKey.value += 1
  mode.value = 'form'
}

function openEdit(task: Task): void {
  const record = store.records.find((candidate) => candidate.task.id === task.id)
  if (record === undefined) {
    actionError.value = 'A tarefa não está mais na lista atual.'
    return
  }
  void store.startAction()
  resetMessages()
  store.clearConflict()
  store.clearNotFound()
  editingRecord.value = record
  formKey.value += 1
  mode.value = 'form'
}

function closeForm(focusButton = true): void {
  mode.value = 'list'
  editingRecord.value = null
  formMessage.value = null
  formErrors.value = {}
  pendingCancellation.value = null
  store.clearConflict()
  store.clearNotFound()
  // Voltar/cancelar explicitamente também limpa estado transitório próprio.
  void store.startAction()
  if (focusButton) void nextTick(() => newTaskButton.value?.focus())
}

function errorText(code: string): string {
  const messages: Record<string, string> = {
    BUSY: 'O aplicativo está ocupado; tente novamente.',
    SESSION_CLOSED: 'A janela foi recarregada; tente novamente.',
    STORAGE_UNAVAILABLE: 'O armazenamento local está indisponível. Nenhum dado foi redefinido.',
    INCOMPATIBLE_DATA: 'Os dados locais estão em uma versão incompatível.',
    CORRUPTED_DATA: 'Os dados locais não puderam ser lidos.',
    RESOURCE_LIMIT: 'A operação excedeu um limite local.',
    SNAPSHOT_STALE: 'A lista está desatualizada; aguarde a reconciliação.',
    INVALID_REQUEST: 'A solicitação não pôde ser aceita.',
    UNAUTHORIZED: 'A janela atual não está autorizada.',
  }
  return messages[code] ?? 'Não foi possível concluir a operação.'
}

/** Mensagens específicas de recorrência/subtarefas; nunca refletem payload do main. */
function mutationFailureText(result: TaskCommandStoreResult): string {
  switch (result.status) {
    case 'choice-required':
      return 'Escolha como tratar as próximas ocorrências antes de continuar.'
    case 'series-conflict':
      return 'Há outra ocorrência da mesma série; nada foi gravado.'
    case 'identity-conflict':
      return 'Não foi possível reservar a identidade da nova ocorrência; nada foi gravado.'
    case 'recurrence-out-of-range':
      return 'O cálculo da próxima ocorrência saiu do intervalo representável; nada foi gravado.'
    case 'subtask-not-found':
      return 'A subtarefa não está mais na tarefa; nada foi gravado.'
    case 'blocked':
      return errorText(result.code)
    default:
      return 'A operação não foi concluída.'
  }
}

async function showFormErrors(errors: TaskFieldErrors, message: string): Promise<void> {
  formErrors.value = errors
  formMessage.value = message
  await nextTick()
  if (Object.keys(errors).length > 0 && taskForm.value?.focusFirstInvalid()) return
  formMessageAlert.value?.focus()
}

async function handleMutationResult(result: TaskCommandStoreResult): Promise<void> {
  switch (result.status) {
    case 'accepted':
      // O formulário fecha quando o snapshot >= ack chega (watch de lastConfirmed).
      formMessage.value = 'Tarefa salva; sincronizando a lista…'
      feedback.value = null
      return
    case 'validation':
      await showFormErrors(result.fields, 'Revise os campos destacados.')
      return
    case 'conflict':
      formMessage.value = 'A tarefa mudou enquanto você editava. O preenchimento foi mantido.'
      return
    case 'not-found':
      formMessage.value = 'A tarefa não existe mais. O preenchimento foi mantido.'
      return
    case 'choice-required':
      await showFormErrors({}, 'Escolha como tratar as próximas ocorrências; nada foi gravado.')
      return
    case 'uncertain':
      formMessage.value = 'Resultado incerto: confira a lista antes de tentar novamente. O preenchimento foi mantido.'
      return
    case 'blocked':
      await showFormErrors({}, errorText(result.code))
      return
    default:
      await showFormErrors({}, mutationFailureText(result))
      return
  }
}

async function handleSubmit(submission: TaskFormSubmission): Promise<void> {
  if (pendingCancellation.value !== null) return
  formMessage.value = null
  formErrors.value = {}
  const record = editingRecord.value

  if (submission.kind === 'create') {
    await handleMutationResult(await store.create(submission.draft))
    return
  }

  if (record === null) {
    await handleMutationResult({ status: 'blocked', code: 'STORAGE_UNAVAILABLE' })
    return
  }

  const result = await store.update(record.task.id, record.editRevision, submission.patch)
  if (result.status === 'choice-required') {
    pendingCancellation.value = {
      kind: 'update',
      taskId: record.task.id,
      taskTitle: record.task.title,
      editRevision: record.editRevision,
      patch: submission.patch,
    }
    return
  }
  await handleMutationResult(result)
}

async function handleChangeStatus(task: Task, status: TaskStatus, origin: StatusChangeOrigin): Promise<void> {
  if (busyTaskId.value !== null || pendingCancellation.value !== null) return
  resetMessages()
  const record = store.records.find((candidate) => candidate.task.id === task.id)
  if (record === undefined) {
    actionError.value = 'A tarefa não está mais na lista atual.'
    taskList.value?.resetStatus(task.id)
    return
  }

  const pending: PendingListAction = {
    taskId: task.id,
    position: listPosition(task.id),
    action: origin.action,
    fromFocusout: origin.fromFocusout,
  }
  await performStatus(task.id, task.title, status, record.editRevision, pending)
}

/** Executa a mudança de status; a mesma revisão capturada é usada após a escolha SKIP/END. */
async function performStatus(
  taskId: string,
  taskTitle: string,
  status: TaskStatus,
  editRevision: string,
  pending: PendingListAction,
  cancellation?: TaskCancellation,
): Promise<void> {
  busyTaskId.value = taskId
  const result = await store.changeStatus(taskId, editRevision, status, cancellation)
  busyTaskId.value = null

  if (result.status === 'accepted') {
    pendingAction.value = pending
    feedback.value = { tone: 'success', text: `Status de “${taskTitle}” alterado para ${STATUS_LABELS[status]}.` }
    return
  }

  if (result.status === 'choice-required') {
    pendingCancellation.value = { kind: 'status', taskId, taskTitle, editRevision, status, pending }
    return
  }

  taskList.value?.resetStatus(taskId)
  if (result.status === 'conflict' || result.status === 'not-found') {
    feedback.value = null
    return
  }
  actionError.value = mutationFailureText(result)
  await nextTick()
  taskList.value?.focusControl(taskId, pending.action)
}

/** Marca/desmarca por intenção; o valor exibido só muda com a confirmação no snapshot. */
async function handleToggleSubtask(task: Task, subtaskId: string, done: boolean): Promise<void> {
  if (busyTaskId.value !== null || pendingCancellation.value !== null) return
  resetMessages()
  const record = store.records.find((candidate) => candidate.task.id === task.id)
  if (record === undefined) {
    actionError.value = 'A tarefa não está mais na lista atual.'
    return
  }

  busyTaskId.value = task.id
  const result = await store.setSubtaskDone(task.id, record.editRevision, subtaskId, done)
  busyTaskId.value = null

  switch (result.status) {
    case 'accepted':
      feedback.value = { tone: 'success', text: done ? 'Subtarefa marcada.' : 'Subtarefa desmarcada.' }
      return
    case 'subtask-not-found':
      actionError.value = 'A subtarefa não está mais na tarefa; nada foi marcado.'
      await nextTick()
      if (taskList.value?.focusSubtask(task.id, subtaskId) !== true) taskList.value?.focusControl(task.id, 'edit')
      return
    case 'conflict':
    case 'not-found':
      feedback.value = null
      return
    case 'uncertain':
      // O painel de resultado incerto fica visível; nenhuma marcação é anunciada.
      return
    default:
      actionError.value = mutationFailureText(result)
      return
  }
}

async function resolveCancellation(choice: TaskCancellation): Promise<void> {
  const pending = pendingCancellation.value
  if (pending === null) return
  pendingCancellation.value = null

  if (pending.kind === 'update') {
    const result = await store.update(pending.taskId, pending.editRevision, pending.patch, choice)
    await handleMutationResult(result)
    return
  }

  await performStatus(pending.taskId, pending.taskTitle, pending.status, pending.editRevision, pending.pending, choice)
}

/** Abandonar o diálogo conserva dados/draft e devolve o foco ao controle pertinente. */
async function abandonCancellation(): Promise<void> {
  const pending = pendingCancellation.value
  if (pending === null) return
  pendingCancellation.value = null
  await nextTick()
  if (pending.kind === 'update') {
    taskForm.value?.focusSubmit()
    return
  }
  if (taskList.value?.focusControl(pending.pending.taskId, pending.pending.action) !== true) {
    void focusAfterListAction(pending.pending)
  }
}

async function inspectConflict(): Promise<void> {
  const conflict = store.conflict
  if (conflict === null) return
  conflictInspect.value = await store.inspectCurrent(conflict.taskId)
  if (conflictInspect.value === null) {
    actionError.value = 'A tarefa não foi encontrada na lista atual.'
  }
}

async function confirmReload(): Promise<void> {
  const conflict = store.conflict
  if (conflict === null) return
  const record = await store.reloadBase(conflict.taskId)
  reloadConfirm.value = false
  if (record === null) {
    actionError.value = 'A tarefa não foi encontrada; o preenchimento foi mantido.'
    return
  }
  if (editingRecord.value?.task.id === record.task.id) {
    editingRecord.value = record
    formKey.value += 1
    formErrors.value = {}
    formMessage.value = null
    feedback.value = { tone: 'warning', text: 'Versão atual recarregada; o preenchimento anterior foi descartado.' }
  } else {
    feedback.value = { tone: 'warning', text: 'Lista atualizada.' }
  }
}

async function discardConflict(): Promise<void> {
  store.clearConflict()
  conflictInspect.value = null
  reloadConfirm.value = false
}

async function reviewUncertain(): Promise<void> {
  const ok = await store.reviewAfterUncertain()
  if (ok && formMessage.value !== null && formMessage.value.startsWith('Resultado incerto')) {
    formMessage.value = null
  }
  feedback.value = ok
    ? {
        tone: 'warning',
        text: editingRecord.value === null ? 'Lista conferida.' : 'Lista conferida; decida se reenvia ou abandona o preenchimento.',
      }
    : { tone: 'error', text: 'Não foi possível conferir a lista; tente novamente.' }
}

async function closeNotFound(): Promise<void> {
  if (notFoundForEditing.value && mode.value === 'form') closeForm()
  else store.clearNotFound()
}

async function retry(): Promise<void> {
  const ok = await store.refresh()
  if (!ok) actionError.value = errorText(store.resyncError ?? 'STORAGE_UNAVAILABLE')
}

async function handleOpenSource(): Promise<void> {
  const record = editingRecord.value
  if (record === null) return
  const result = await store.openSource(record.task.id, record.contentRevision)
  switch (result.status) {
    case 'requested':
      feedback.value = { tone: 'success', text: 'Solicitação de abertura enviada ao sistema — isso não confirma que a página foi carregada.' }
      return
    case 'unavailable':
      actionError.value = 'A tarefa não tem origem salva.'
      return
    case 'refused':
      actionError.value = 'A origem salva não pode ser aberta (URL, credenciais, protocolo ou tamanho).'
      return
    case 'failed':
      actionError.value = 'Não foi possível confirmar a abertura; o pedido não será repetido automaticamente.'
      return
    case 'blocked':
      actionError.value = errorText(result.code)
      return
    default:
      return
  }
}

function clearFilters(): void {
  store.clearFilters()
  void nextTick(() => clearFiltersButton.value?.focus())
}

// ---- Lixeira e desfazer (TFA-006) ----

watch(deletePanel, (panel) => {
  if (panel !== null) panel.focus()
})

/** Texto seguro para recusas da lixeira/undo; nunca reflete payload do main. */
function trashFailureText(result: TrashCommandStoreResult): string {
  switch (result.status) {
    case 'not-found':
      return 'A tarefa não está mais na lista atual.'
    case 'not-in-trash':
      return 'O item não está mais na lixeira.'
    case 'entry-changed':
      return 'O item mudou depois da confirmação; nada foi removido. Revise a lista.'
    case 'entry-expired':
      return 'O item venceu a retenção de 30 dias; nada foi restaurado.'
    case 'id-exists':
      return 'Já existe uma tarefa ativa com esse identificador; nada foi restaurado.'
    case 'series-conflict':
      return 'Há outra ocorrência da mesma série; nada foi alterado.'
    case 'confirmation-changed':
      return 'A lixeira mudou depois da preparação. Revise a lista e confirme novamente.'
    case 'confirmation-invalid':
      return 'A confirmação não é mais válida; abra o diálogo novamente.'
    case 'stale-context':
      return 'A ação ficou desatualizada por outra operação; tente novamente.'
    case 'undo-not-available':
      return 'A oferta de desfazer não está mais disponível.'
    case 'removed':
      return 'A tarefa não existe mais; nada foi desfeito.'
    case 'changed':
      return 'O conteúdo mudou depois da ação; nada foi desfeito.'
    case 'generated-changed':
      return 'A ocorrência gerada mudou depois da ação; nada foi desfeito.'
    case 'uncertain':
      return 'Resultado incerto: confira a lista antes de decidir; nada é reenviado automaticamente.'
    case 'blocked':
      return errorText(result.code)
    default:
      return 'A operação não foi concluída.'
  }
}

async function focusAfterRemoval(taskId: string, position: number): Promise<void> {
  await nextTick()
  const task = store.visibleTasks.find((candidate) => candidate.id === taskId)
  if (task !== undefined && taskList.value?.focusControl(task.id, 'edit') === true) return
  const neighbor = store.visibleTasks[position] ?? store.visibleTasks.at(-1)
  if (neighbor !== undefined && taskList.value?.focusControl(neighbor.id, 'edit') === true) return
  if (store.totalTasks === 0) createFirstButton.value?.focus()
  else clearFiltersButton.value?.focus()
}

async function handleDelete(task: Task): Promise<void> {
  if (busyTaskId.value !== null || store.submitting) return
  resetMessages()
  const position = listPosition(task.id)
  busyTaskId.value = task.id
  const result = await store.requestDelete(task.id)
  busyTaskId.value = null
  if (result.status === 'confirmation') {
    deleteTarget.value = task
    void position
    return
  }
  actionError.value = trashFailureText(result)
  await nextTick()
  taskList.value?.focusControl(task.id, 'delete')
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (target === null) return
  const position = listPosition(target.id)
  const result = await store.confirmMove()
  deleteTarget.value = null
  if (result.status === 'accepted') {
    await store.waitForSnapshot(result.revision ?? store.revision ?? '0')
    feedback.value =
      result.retained === false
        ? {
            tone: 'warning',
            text: 'A tarefa foi removida, mas a exclusão não foi retida pela lixeira (limite/relógio): não há desfazer.',
          }
        : { tone: 'success', text: 'Tarefa movida para a lixeira. Use Desfazer enquanto a oferta estiver visível.' }
    await focusAfterRemoval(target.id, position)
    return
  }
  actionError.value = trashFailureText(result)
  await nextTick()
  taskList.value?.focusControl(target.id, 'delete')
}

function abandonDelete(): void {
  const target = deleteTarget.value
  deleteTarget.value = null
  void nextTick(() => {
    if (target !== null) taskList.value?.focusControl(target.id, 'delete')
    else newTaskButton.value?.focus()
  })
}

async function handleUndo(): Promise<void> {
  const current = store.offer
  if (current === null || store.submitting) return
  const result = await store.undoLastAction()
  if (result.status === 'accepted') {
    await store.waitForSnapshot(store.revision ?? '0')
    feedback.value = { tone: 'success', text: 'Ação desfeita; a versão anterior foi restaurada.' }
    await nextTick()
    if (current.taskId !== undefined && taskList.value?.focusControl(current.taskId, 'edit') === true) return
    if (store.totalTasks === 0) createFirstButton.value?.focus()
    else if (store.noResults) clearFiltersButton.value?.focus()
    else newTaskButton.value?.focus()
    return
  }
  actionError.value = trashFailureText(result)
}

function openTrash(): void {
  void store.enterTrash()
}

function openBackup(): void {
  void store.enterBackup()
}

/** Volta do backup preservando filtros/ordem e devolvendo o foco a um controle útil. */
async function closeBackup(): Promise<void> {
  await store.leaveBackup()
  await nextTick()
  if (store.totalTasks === 0) createFirstButton.value?.focus()
  else if (store.noResults) clearFiltersButton.value?.focus()
  else newTaskButton.value?.focus()
}
</script>

<template>
  <main class="task-manager">
    <section
      v-if="store.locatedTask || store.locationMessage"
      class="form-notice"
      aria-labelledby="located-reminder-title"
    >
      <h2
        id="located-reminder-title"
        ref="locationHeading"
        tabindex="-1"
      >
        {{ store.locatedTask?.task.title ?? 'Lembrete indisponível' }}
      </h2>
      <template v-if="store.locatedTask">
        <p>Consulta do lembrete · {{ STATUS_LABELS[store.locatedTask.task.status] }}</p>
        <p v-if="store.locatedTask.task.description">
          {{ store.locatedTask.task.description }}
        </p>
        <p v-if="store.locatedTask.task.dueAt">
          Prazo: {{ new Date(store.locatedTask.task.dueAt).toLocaleString('pt-BR') }}
        </p>
        <p>O formulário e os filtros atuais foram conservados.</p>
      </template>
      <p v-else>
        {{ store.locationMessage }}
      </p>
      <button
        type="button"
        class="button-secondary"
        @click="store.clearLocation(); mode === 'form' ? taskForm?.focusSubmit() : newTaskButton?.focus()"
      >
        Voltar à lista
      </button>
    </section>
    <TrashManager v-if="store.trashMode" />
    <BackupManager
      v-else-if="store.backupMode"
      @back="closeBackup"
    />
    <template v-else>
      <header class="manager-header">
        <h1>Tarefas</h1>
        <div
          v-if="mode === 'list'"
          class="header-actions"
        >
          <button
            ref="newTaskButton"
            type="button"
            @click="openCreate"
          >
            Nova tarefa
          </button>
          <button

            type="button"
            class="button-secondary"
            data-action="trash"
            @click="openTrash"
          >
            Lixeira
          </button>
          <button
            type="button"
            class="button-secondary"
            data-action="backup"
            @click="openBackup"
          >
            Backup
          </button>
        </div>
      </header>

      <div
        aria-live="polite"
        class="live-region"
      >
        <p
          v-if="feedback"
          class="feedback"
          :class="`feedback-${feedback.tone}`"
        >
          {{ feedback.text }}
        </p>
      </div>
      <p
        v-if="actionError"
        class="feedback feedback-error"
        role="alert"
      >
        {{ actionError }}
      </p>

      <section
        v-if="store.offer !== null && mode === 'list'"
        class="state offer-banner"
        role="status"
      >
        <p>
          {{ store.offer.kind === 'delete' ? 'Tarefa movida para a lixeira.' : 'Alteração concluída.' }}
          A oferta de desfazer vale até a próxima ação desta janela; nada é mantido após fechar.
        </p>
        <button

          type="button"
          class="button-secondary"
          data-action="undo"
          :aria-disabled="store.submitting ? 'true' : undefined"
          @click="handleUndo"
        >
          Desfazer
        </button>
      </section>

      <section
        v-if="store.presentation === 'stale'"
        class="state state-warning"
        role="status"
      >
        <p>A lista pode estar desatualizada enquanto o armazenamento se recupera. As escritas ficam bloqueadas até a reconciliação.</p>
        <button
          type="button"
          class="button-secondary"
          @click="retry"
        >
          Tentar novamente
        </button>
      </section>

      <section
        v-if="store.conflict"
        ref="conflictPanel"
        class="state state-warning"
        tabindex="-1"
        role="alert"
      >
        <h2>A tarefa mudou</h2>
        <p>O preenchimento não foi aplicado. Sua revisão-base e o que foi digitado foram mantidos.</p>

        <div
          v-if="conflictInspect"
          class="conflict-inspect"
        >
          <h3>Versão atual (somente leitura)</h3>
          <dl>
            <div>
              <dt>Título</dt><dd>{{ conflictInspect.task.title }}</dd>
            </div>
            <div v-if="conflictInspect.task.description">
              <dt>Descrição</dt><dd>{{ conflictInspect.task.description }}</dd>
            </div>
            <div v-if="conflictInspect.task.status">
              <dt>Status</dt><dd>{{ STATUS_LABELS[conflictInspect.task.status] }}</dd>
            </div>
            <div v-if="conflictInspect.task.dueAt">
              <dt>Prazo</dt><dd>{{ conflictInspect.task.dueAt }}</dd>
            </div>
          </dl>
        </div>

        <div class="state-actions">
          <button
            type="button"
            class="button-secondary"
            @click="inspectConflict"
          >
            Conferir versão atual
          </button>
          <template v-if="conflictForEditing">
            <template v-if="!reloadConfirm">
              <button
                type="button"
                class="button-secondary"
                @click="reloadConfirm = true"
              >
                Recarregar tarefa
              </button>
            </template>
            <template v-else>
              <p>Recarregar descarta o preenchimento atual. Confirmar?</p>
              <button
                type="button"
                @click="confirmReload"
              >
                Descartar e recarregar
              </button>
              <button
                type="button"
                class="button-secondary"
                @click="reloadConfirm = false"
              >
                Cancelar
              </button>
            </template>
          </template>
          <button
            v-else
            type="button"
            class="button-secondary"
            @click="discardConflict"
          >
            Descartar aviso
          </button>
        </div>
      </section>

      <section
        v-if="store.notFound"
        class="state state-error"
        role="alert"
      >
        <h2>Tarefa não encontrada</h2>
        <p>A tarefa não existe mais na lista. Nada foi recriado.</p>
        <div class="state-actions">
          <button
            type="button"
            class="button-secondary"
            @click="retry"
          >
            Conferir lista
          </button>
          <button
            type="button"
            class="button-secondary"
            @click="closeNotFound"
          >
            Fechar aviso
          </button>
        </div>
      </section>

      <section
        v-if="store.outcomeUnknown"
        class="state state-warning"
        role="alert"
      >
        <h2>Resultado incerto</h2>
        <p>
          Não foi possível confirmar se a operação foi concluída. Confira a lista antes de decidir;
          um título igual não prova que a tarefa foi criada. Nada é reenviado automaticamente.
        </p>
        <button
          type="button"
          @click="reviewUncertain"
        >
          Conferir lista
        </button>
      </section>

      <template v-if="mode === 'form'">
        <p
          v-if="formMessage"
          ref="formMessageAlert"
          tabindex="-1"
          class="feedback feedback-error"
          role="alert"
        >
          {{ formMessage }}
        </p>
        <TaskForm
          ref="taskForm"
          :key="formKey"
          :task="editingRecord?.task ?? null"
          :errors="formErrors"
          :saving="store.submitting"
          @submit="handleSubmit"
          @cancel="closeForm()"
          @open-source="handleOpenSource"
        />
      </template>

      <template v-else>
        <p
          v-if="store.presentation === 'loading'"
          class="state"
          role="status"
        >
          Carregando tarefas…
        </p>

        <section
          v-else-if="store.presentation === 'blocked'"
          class="state state-error"
          role="alert"
        >
          <p>{{ errorText(store.initialError ?? 'STORAGE_UNAVAILABLE') }} Nenhum dado foi redefinido.</p>
          <button
            ref="retryButton"
            type="button"
            class="button-secondary"
            @click="retry"
          >
            Tentar novamente
          </button>
        </section>

        <section
          v-else-if="store.presentation === 'empty'"
          class="state"
        >
          <h2>Nenhuma tarefa ainda</h2>
          <p>Crie sua primeira tarefa para começar a organizar o que precisa ser feito.</p>
          <div class="state-actions">
            <button
              ref="createFirstButton"
              type="button"
              @click="openCreate"
            >
              Criar primeira tarefa
            </button>
            <button
              type="button"
              class="button-secondary"
              data-action="trash"
              @click="openTrash"
            >
              Abrir lixeira
            </button>
            <button
              type="button"
              class="button-secondary"
              data-action="backup"
              @click="openBackup"
            >
              Backup…
            </button>
          </div>
        </section>

        <template v-else>
          <TaskFilters
            :filters="store.filters"
            :sort-key="store.sortKey"
            :has-active-filters="store.hasActiveFilters"
            @update:filters="store.setFilters"
            @update:sort-key="store.setSortKey"
            @clear="store.clearFilters"
          />

          <p
            class="result-count"
            role="status"
          >
            {{ store.visibleTasks.length }} de {{ store.totalTasks }}
            {{ store.totalTasks === 1 ? 'tarefa' : 'tarefas' }}
          </p>

          <section
            v-if="store.visibleTasks.length === 0"
            class="state"
          >
            <h2>Nenhuma tarefa encontrada</h2>
            <p>Nenhuma tarefa corresponde à pesquisa e aos filtros atuais.</p>
            <button
              ref="clearFiltersButton"
              type="button"
              class="button-secondary"
              @click="clearFilters"
            >
              Limpar filtros
            </button>
          </section>

          <section
            v-else
            aria-labelledby="task-list-heading"
          >
            <h2
              id="task-list-heading"
              class="visually-hidden"
            >
              Lista de tarefas
            </h2>
            <TaskList
              ref="taskList"
              :tasks="store.visibleTasks"
              :now="store.now"
              :busy-task-id="busyTaskId"
              @edit="openEdit"
              @change-status="handleChangeStatus"
              @toggle-subtask="handleToggleSubtask"
              @delete="handleDelete"
            />
          </section>
        </template>
      </template>

      <TaskCancellationDialog
        v-if="pendingCancellation !== null"
        :task-title="pendingCancellation.taskTitle"
        @choose="resolveCancellation"
        @cancel="abandonCancellation"
      />

      <section
        v-if="deleteTarget !== null"
        ref="deletePanel"
        class="state state-warning"
        tabindex="-1"
        role="alertdialog"
        aria-modal="true"
        :aria-label="`Excluir ${deleteTarget.title}`"
        @keydown.esc="abandonDelete"
      >
        <h2>Mover para a lixeira?</h2>
        <p>
          “{{ deleteTarget.title }}” ficará recuperável por <strong>30 dias</strong>; a lixeira mantém até
          <strong>100</strong> entradas. Descartados por limite, idade, substituição do mesmo ID ou relógio
          ajustado não têm desfazer.
        </p>
        <p v-if="store.confirmation?.hasRecurrence">
          Esta ocorrência carrega a regra da série: excluí-la interrompe novas ocorrências enquanto estiver
          na lixeira; nenhuma próxima é criada agora.
        </p>
        <div class="state-actions">
          <button
            type="button"
            :aria-disabled="store.submitting ? 'true' : undefined"
            @click="confirmDelete"
          >
            Excluir
          </button>
          <button
            type="button"
            class="button-secondary"
            @click="abandonDelete"
          >
            Cancelar
          </button>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.task-manager {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  align-content: start;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.manager-header h1 {
  margin: 0;
  font-size: 1.35rem;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.live-region:empty {
  position: absolute;
}

.state {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  margin: 0;
  padding: 1rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.state h2,
.state h3,
.state p {
  margin: 0;
}

.state h2 {
  font-size: 1rem;
}

.state p {
  color: var(--color-muted);
  line-height: 1.45;
}

.state-warning {
  border-color: #dc6803;
}

.state-error {
  border-color: var(--color-danger);
}

.state-error p {
  color: var(--color-danger);
}

.state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.conflict-inspect {
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
}

.conflict-inspect dl {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  font-size: 0.85rem;
}

.conflict-inspect dl div {
  display: flex;
  gap: 0.4rem;
}

.conflict-inspect dt {
  font-weight: 600;
}

.conflict-inspect dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.result-count {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
