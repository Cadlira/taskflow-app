<script setup lang="ts">
// Adaptação revisada de taskflow-extension@a763e7a src/components/tasks/TaskList.vue (MIT, mesmo
// autor): o cartão é um componente persistente por tarefa. Em uma ordenação, o componente com as
// mesmas props não é re-renderizado — apenas o nó é movido —, o que mantém o orçamento D10 sem
// truncar, virtualizar ou paginar a lista. Preserva o seletor de status com teclado/foco, as ações
// rápidas e habilita resumo da regra, expansão transitória e marcação de subtarefa por intenção.
import { ref, watch } from 'vue'
import { TASK_STATUSES, type Task, type TaskStatus } from '../../../../domain/task.js'
import { getDueSituation } from '../../../../domain/task-queries.js'
import { countSubtaskProgress } from '../../../../domain/task-subtasks.js'
import { formatDateTime } from './date-time.js'
import {
  DUE_SITUATION_LABELS,
  PRIORITY_LABELS,
  recurrenceSummaryLabel,
  STATUS_LABELS,
  SUBTASKS_TOGGLE_LABEL,
  subtaskProgressLabel,
} from './task-labels.js'
import type { StatusChangeOrigin, TaskStatusAction } from './task-status-origin.js'

const props = defineProps<{
  task: Task
  now: Date
  busy: boolean
}>()

const emit = defineEmits<{
  edit: [task: Task]
  'change-status': [task: Task, status: TaskStatus, origin: StatusChangeOrigin]
  'toggle-subtask': [task: Task, subtaskId: string, done: boolean]
}>()

const cardElement = ref<HTMLElement | null>(null)
const expandedSubtasks = ref(false)

function dueSituation(): ReturnType<typeof getDueSituation> {
  return getDueSituation(props.task, props.now)
}

function isRecurring(): boolean {
  return props.task.recurrence !== undefined
}

function recurrenceLabel(): string {
  return props.task.recurrence === undefined ? '' : recurrenceSummaryLabel(props.task.recurrence)
}

function titleId(): string {
  return `task-${encodeURIComponent(props.task.id)}-title`
}

function subtaskListId(): string {
  return `task-${encodeURIComponent(props.task.id)}-subtasks`
}

function progressLabel(): string {
  const { done, total } = countSubtaskProgress(props.task.subtasks)
  return subtaskProgressLabel(done, total)
}

function toggleSubtasks(): void {
  expandedSubtasks.value = !expandedSubtasks.value
}

/**
 * Intenção explícita: o clique é cancelado no DOM (`prevent`) e o valor confirmado continua vindo
 * do snapshot. Sem marcação otimista, falha não inventa sucesso e o controle conserva o foco.
 */
function handleSubtaskToggle(subtaskId: string, done: boolean): void {
  if (props.busy) return
  emit('toggle-subtask', props.task, subtaskId, !done)
}

/** Status escolhido no seletor e ainda não confirmado. */
const pendingStatus = ref<TaskStatus | null>(null)
let keyboardNavigation = false

/** Descarta a escolha pendente sem gravar, voltando a exibir o status persistido. */
function resetStatus(): void {
  pendingStatus.value = null
  keyboardNavigation = false
  if (cardElement.value !== null) {
    const select = cardElement.value.querySelector<HTMLSelectElement>('select[data-action="status"]')
    if (select !== null) select.value = props.task.status
  }
}

defineExpose({ resetStatus })

watch(
  () => props.task,
  () => resetStatus(),
)

watch(
  () => props.busy,
  (busy) => {
    if (busy) resetStatus()
  },
)

function displayedStatus(): TaskStatus {
  return pendingStatus.value ?? props.task.status
}

function handleEdit(): void {
  if (props.busy) return
  emit('edit', props.task)
}

function handleQuickStatus(status: TaskStatus, action: TaskStatusAction): void {
  if (props.busy) return
  emit('change-status', props.task, status, { action, fromFocusout: false })
}

function handleStatusSelect(event: Event): void {
  const select = event.target as HTMLSelectElement
  const status = select.value as TaskStatus

  if (props.busy) {
    select.value = displayedStatus()
    return
  }

  if (status === props.task.status) {
    pendingStatus.value = null
    return
  }

  pendingStatus.value = status

  if (!keyboardNavigation) {
    emit('change-status', props.task, status, { action: 'status', fromFocusout: false })
  }
}

const STATUS_NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

function handleStatusKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    resetStatus()
    return
  }

  if (event.key === 'Enter') {
    const pending = pendingStatus.value
    if (pending !== null && pending !== props.task.status && !props.busy) {
      emit('change-status', props.task, pending, { action: 'status', fromFocusout: false })
    }
    keyboardNavigation = false
    return
  }

  if (STATUS_NAVIGATION_KEYS.has(event.key)) keyboardNavigation = true
}

function handleStatusFocusout(): void {
  const pending = pendingStatus.value
  if (pending !== null && pending !== props.task.status && !props.busy) {
    // Exceção documentada: CANCELLED de recorrente por saída de foco restaura a seleção sem
    // diálogo, sem comando e sem deslocar o foco que o usuário já levou para outro controle.
    if (pending === 'CANCELLED' && isRecurring()) {
      resetStatus()
      return
    }
    pendingStatus.value = null
    emit('change-status', props.task, pending, { action: 'status', fromFocusout: true })
  }
  keyboardNavigation = false
}
</script>

<template>
  <li
    ref="cardElement"
    class="task-card"
    :class="[`status-${task.status.toLowerCase()}`, dueSituation()?.toLowerCase()]"
    :aria-labelledby="titleId()"
    :data-task-id="task.id"
  >
    <header class="task-header">
      <h3 :id="titleId()">
        {{ task.title }}
      </h3>
      <span
        v-if="isRecurring()"
        class="badge badge-recurrence"
        data-test="recurrence-badge"
      >
        Recorrente
      </span>
      <span
        v-if="dueSituation()"
        class="badge"
        :class="`badge-${dueSituation()?.toLowerCase()}`"
        data-test="due-situation"
      >
        {{ DUE_SITUATION_LABELS[dueSituation()!] }}
      </span>
    </header>

    <p
      v-if="isRecurring()"
      class="task-recurrence"
      data-test="recurrence-summary"
    >
      {{ recurrenceLabel() }}
      <template v-if="task.recurrence?.until">
        · limite <time :datetime="task.recurrence.until">{{ formatDateTime(task.recurrence.until) }}</time>
      </template>
    </p>

    <dl class="task-meta">
      <div>
        <dt>Status</dt>
        <dd data-test="status">
          {{ STATUS_LABELS[task.status] }}
        </dd>
      </div>
      <div>
        <dt>Prioridade</dt>
        <dd
          data-test="priority"
          :class="`priority-${task.priority.toLowerCase()}`"
        >
          {{ PRIORITY_LABELS[task.priority] }}
        </dd>
      </div>
      <div v-if="task.dueAt">
        <dt>Prazo</dt>
        <dd data-test="due-at">
          <time :datetime="task.dueAt">{{ formatDateTime(task.dueAt) }}</time>
        </dd>
      </div>
    </dl>

    <div
      v-if="task.subtasks.length > 0"
      class="task-subtasks"
    >
      <button
        type="button"
        class="button-small button-secondary subtasks-toggle"
        data-action="subtasks"
        :aria-expanded="expandedSubtasks ? 'true' : 'false'"
        :aria-controls="subtaskListId()"
        @click="toggleSubtasks"
      >
        {{ SUBTASKS_TOGGLE_LABEL }}<span class="visually-hidden"> de {{ task.title }}</span>,
        <span data-test="subtask-progress">{{ progressLabel() }}</span>
      </button>

      <ul
        v-if="expandedSubtasks"
        :id="subtaskListId()"
        class="subtask-list"
      >
        <li
          v-for="subtask in task.subtasks"
          :key="subtask.id"
          class="subtask-item"
          :class="{ 'subtask-done': subtask.done }"
        >
          <label class="subtask-toggle">
            <input
              type="checkbox"
              class="subtask-checkbox"
              :checked="subtask.done"
              :data-subtask-id="subtask.id"
              :aria-disabled="busy ? 'true' : undefined"
              @click.prevent="handleSubtaskToggle(subtask.id, subtask.done)"
            >
            <span>{{ subtask.title }}</span>
          </label>
        </li>
      </ul>
    </div>

    <div class="task-actions">
      <button
        type="button"
        class="button-small button-secondary"
        data-action="edit"
        :aria-disabled="busy ? 'true' : undefined"
        @click="handleEdit"
      >
        Editar<span class="visually-hidden"> {{ task.title }}</span>
      </button>

      <template v-if="task.status === 'TODO' || task.status === 'IN_PROGRESS'">
        <button
          type="button"
          class="button-small"
          data-action="complete"
          :aria-disabled="busy ? 'true' : undefined"
          @click="handleQuickStatus('DONE', 'complete')"
        >
          Concluir<span class="visually-hidden"> {{ task.title }}</span>
        </button>
        <button
          type="button"
          class="button-small button-secondary"
          data-action="cancel"
          :aria-disabled="busy ? 'true' : undefined"
          @click="handleQuickStatus('CANCELLED', 'cancel')"
        >
          Cancelar tarefa<span class="visually-hidden"> {{ task.title }}</span>
        </button>
      </template>
      <button
        v-else
        type="button"
        class="button-small button-secondary"
        data-action="reopen"
        :aria-disabled="busy ? 'true' : undefined"
        @click="handleQuickStatus('TODO', 'reopen')"
      >
        Reabrir<span class="visually-hidden"> {{ task.title }}</span>
      </button>

      <label class="status-select">
        <span class="visually-hidden">Alterar status de {{ task.title }}</span>
        <select
          :value="displayedStatus()"
          data-action="status"
          :aria-disabled="busy ? 'true' : undefined"
          @keydown="handleStatusKeydown"
          @focusout="handleStatusFocusout"
          @change="handleStatusSelect"
        >
          <option
            v-for="status in TASK_STATUSES"
            :key="status"
            :value="status"
          >
            {{ STATUS_LABELS[status] }}
          </option>
        </select>
      </label>
    </div>
  </li>
</template>

<style scoped>
.task-card {
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-border-strong);
  border-radius: 0.8rem;
  background: var(--color-surface);
  /* Revisão de abordagem para o orçamento D10: todos os cartões continuam no DOM e na árvore de
     acessibilidade; o navegador só evita layout/pintura de conteúdo fora da viewport. */
  content-visibility: auto;
  contain-intrinsic-size: auto 7rem;
}

.task-card.overdue {
  border-left-color: var(--color-danger);
}

.task-card.due_soon {
  border-left-color: #dc6803;
}

.task-card.status-done h3,
.task-card.status-cancelled h3 {
  text-decoration: line-through;
}

.task-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.task-header h3 {
  margin: 0;
  font-size: 0.98rem;
  overflow-wrap: anywhere;
}

.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.badge-overdue {
  color: #ffffff;
  background: var(--color-danger);
}

.badge-due_soon {
  color: #7a2e0e;
  background: #fef0c7;
}

.badge-recurrence {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
}

.task-recurrence {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-muted);
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0;
  font-size: 0.8rem;
}

.task-meta div {
  display: flex;
  gap: 0.3rem;
}

.task-meta dt {
  color: var(--color-muted);
}

.task-meta dd {
  margin: 0;
  font-weight: 600;
}

.priority-urgent {
  color: var(--color-danger);
}

.task-subtasks {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
}

.subtask-list {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.subtask-item {
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.subtask-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
}

.subtask-toggle input {
  flex: none;
  margin-top: 0.15rem;
}

.subtask-done span {
  color: var(--color-muted);
  text-decoration: line-through;
}

.task-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.status-select select {
  width: auto;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
}
</style>
