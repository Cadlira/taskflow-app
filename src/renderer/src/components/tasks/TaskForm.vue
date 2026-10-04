<script setup lang="ts">
// Adaptação básica revisada de taskflow-extension@a763e7a src/components/tasks/TaskForm.vue (MIT,
// mesmo autor). Preserva campos básicos, rótulos, aria, foco inicial/primeiro erro e estilos.
// Não monta subtarefas editáveis, recorrência, lembretes, IA, captura ou confirmação de série.
import { computed, nextTick, onMounted, reactive, ref, useId } from 'vue'
import type { BasicFieldErrors, BasicTaskDraft, BasicTaskPatch } from '../../../../domain/task-draft.js'
import { normalizeTags, TASK_LIMITS } from '../../../../domain/task-draft.js'
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskStatus } from '../../../../domain/task.js'
import { countSubtaskProgress } from '../../../../domain/task-subtasks.js'
import { formatInstant, fromLocalDateTimeInput, INVALID_DATE_INPUT, needsTimeZoneReview, toLocalDateTimeInput } from './date-time.js'
import { fieldErrorMessage, PRIORITY_LABELS, RECURRENCE_READONLY_LABEL, REMINDERS_RESTRICTED_HINT, STATUS_LABELS, SUBTASKS_READONLY_LABEL, subtaskProgressLabel } from './task-labels.js'

export type TaskFormSubmission = { kind: 'create'; draft: BasicTaskDraft } | { kind: 'edit'; patch: BasicTaskPatch }

const props = withDefaults(
  defineProps<{
    /** Tarefa em edição; ausente para criação. */
    task?: Task | null
    errors?: BasicFieldErrors
    saving?: boolean
    /** Conversão do prazo usada na detecção de mudança de fuso; injetável em teste. */
    timeZoneConvert?: (iso: string) => string
  }>(),
  // Default inline: `withDefaults` não pode referenciar bindings criados no próprio script setup.
  { task: null, errors: () => ({}), saving: false, timeZoneConvert: (iso: string) => toLocalDateTimeInput(iso) },
)

const emit = defineEmits<{
  submit: [submission: TaskFormSubmission]
  cancel: []
  'open-source': []
}>()

type BasicField = 'title' | 'description' | 'requester' | 'assignee' | 'status' | 'priority' | 'dueAt' | 'tags' | 'sourceUrl'

const idPrefix = useId()
const titleInput = ref<HTMLInputElement | null>(null)
const formElement = ref<HTMLFormElement | null>(null)
const reviewPanel = ref<HTMLElement | null>(null)

const isEditing = computed(() => props.task !== null && props.task !== undefined)
const isRecurring = computed(() => props.task?.recurrence !== undefined)
const readOnly = computed(() => isRecurring.value)
const heading = computed(() => (isEditing.value ? 'Editar tarefa' : 'Nova tarefa'))

const form = reactive({
  title: props.task?.title ?? '',
  description: props.task?.description ?? '',
  requester: props.task?.requester ?? '',
  assignee: props.task?.assignee ?? '',
  status: props.task?.status ?? 'TODO',
  priority: props.task?.priority ?? 'MEDIUM',
  dueAt: toLocalDateTimeInput(props.task?.dueAt),
  tags: props.task?.tags.join(', ') ?? '',
  sourceUrl: props.task?.sourceUrl ?? '',
})

/** Texto do prazo capturado ao abrir: base da detecção de mudança de fuso. */
let capturedDueInput = toLocalDateTimeInput(props.task?.dueAt)
const dueAtDirty = ref(false)
const timeZoneReview = ref(false)
const hasReminders = computed(() => (props.task?.reminders.length ?? 0) > 0)
const subtaskProgress = computed(() => {
  const subtasks = props.task?.subtasks ?? []
  if (subtasks.length === 0) return ''
  const { done, total } = countSubtaskProgress(subtasks)
  return subtaskProgressLabel(done, total)
})

function fieldId(field: BasicField): string {
  return `${idPrefix}-${field}`
}

function errorId(field: BasicField): string {
  return `${fieldId(field)}-error`
}

function describedBy(field: BasicField): string | undefined {
  return props.errors[field] !== undefined ? errorId(field) : undefined
}

function errorMessage(field: BasicField): string | undefined {
  const code = props.errors[field]
  return code === undefined ? undefined : fieldErrorMessage(field, code)
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function buildCreateDraft(): BasicTaskDraft {
  const dueAt = fromLocalDateTimeInput(form.dueAt)
  return {
    title: form.title,
    description: form.description,
    requester: form.requester,
    assignee: form.assignee,
    status: form.status,
    priority: form.priority,
    ...(dueAt !== undefined && { dueAt }),
    tags: form.tags.split(','),
    sourceUrl: form.sourceUrl,
  }
}

function buildPatch(): BasicTaskPatch {
  const base = props.task
  if (base === null || base === undefined) return {}

  const patch: BasicTaskPatch = {}
  if (optionalValue(form.title) !== base.title) patch.title = form.title

  const textFields = ['description', 'requester', 'assignee'] as const
  for (const field of textFields) {
    const next = optionalValue(form[field])
    if (next !== base[field]) patch[field] = next ?? null
  }

  if (form.status !== base.status) patch.status = form.status as TaskStatus
  if (form.priority !== base.priority) patch.priority = form.priority as Task['priority']

  if (dueAtDirty.value) {
    const converted = fromLocalDateTimeInput(form.dueAt)
    patch.dueAt = converted === undefined ? null : converted
  }

  const tags = normalizeTags(form.tags.split(','))
  if (!sameTags(tags, base.tags)) patch.tags = tags

  const sourceUrl = optionalValue(form.sourceUrl)
  if (sourceUrl !== base.sourceUrl) patch.sourceUrl = sourceUrl ?? null

  return patch
}

/** Foca o primeiro campo inválido em ordem de documento. */
function focusFirstInvalid(): boolean {
  const invalid = formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!invalid) return false
  invalid.focus()
  return true
}

defineExpose({ focusFirstInvalid })

function handleSubmit(): void {
  if (readOnly.value || props.saving === true) return

  if (
    isEditing.value &&
    dueAtDirty.value &&
    needsTimeZoneReview({
      originalIso: props.task?.dueAt,
      capturedInput: capturedDueInput,
      nextInput: form.dueAt,
      dirty: dueAtDirty.value,
      ...(props.timeZoneConvert !== undefined && { convert: props.timeZoneConvert }),
    })
  ) {
    timeZoneReview.value = true
    void nextTick(() => reviewPanel.value?.focus())
    return
  }

  emit('submit', isEditing.value ? { kind: 'edit', patch: buildPatch() } : { kind: 'create', draft: buildCreateDraft() })
}

/** Revisão explícita: confirma a interpretação no fuso corrente e libera o save. */
function confirmTimeZone(): void {
  const convert = props.timeZoneConvert ?? toLocalDateTimeInput
  capturedDueInput = props.task?.dueAt ? convert(props.task.dueAt) : ''
  timeZoneReview.value = false
}

/** Restaura o prazo salvo e abandona a alteração pendente. */
function restoreSavedDue(): void {
  form.dueAt = capturedDueInput
  dueAtDirty.value = false
  timeZoneReview.value = false
}

function handleDueInput(): void {
  dueAtDirty.value = true
}

onMounted(() => {
  titleInput.value?.focus()
})
</script>

<template>
  <form
    ref="formElement"
    class="task-form"
    :aria-labelledby="`${idPrefix}-heading`"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <h2 :id="`${idPrefix}-heading`">
      {{ heading }}
    </h2>

    <p
      v-if="readOnly"
      class="form-notice"
      data-test="recurrence-notice"
    >
      {{ RECURRENCE_READONLY_LABEL }}
    </p>

    <div class="field">
      <label :for="fieldId('title')">Título <span aria-hidden="true">*</span></label>
      <input
        :id="fieldId('title')"
        ref="titleInput"
        v-model="form.title"
        name="title"
        type="text"
        required
        :readonly="readOnly"
        :maxlength="TASK_LIMITS.title"
        :aria-invalid="Boolean(errors.title)"
        :aria-describedby="describedBy('title')"
      >
      <p
        v-if="errorMessage('title')"
        :id="errorId('title')"
        class="field-error"
      >
        {{ errorMessage('title') }}
      </p>
    </div>

    <div class="field">
      <label :for="fieldId('description')">Descrição</label>
      <textarea
        :id="fieldId('description')"
        v-model="form.description"
        name="description"
        rows="3"
        :readonly="readOnly"
        :maxlength="TASK_LIMITS.description"
        :aria-invalid="Boolean(errors.description)"
        :aria-describedby="describedBy('description')"
      />
      <p
        v-if="errorMessage('description')"
        :id="errorId('description')"
        class="field-error"
      >
        {{ errorMessage('description') }}
      </p>
    </div>

    <div class="field-row">
      <div class="field">
        <label :for="fieldId('requester')">Solicitante</label>
        <input
          :id="fieldId('requester')"
          v-model="form.requester"
          name="requester"
          type="text"
          :readonly="readOnly"
          :maxlength="TASK_LIMITS.person"
          :aria-invalid="Boolean(errors.requester)"
          :aria-describedby="describedBy('requester')"
        >
        <p
          v-if="errorMessage('requester')"
          :id="errorId('requester')"
          class="field-error"
        >
          {{ errorMessage('requester') }}
        </p>
      </div>

      <div class="field">
        <label :for="fieldId('assignee')">Responsável</label>
        <input
          :id="fieldId('assignee')"
          v-model="form.assignee"
          name="assignee"
          type="text"
          :readonly="readOnly"
          :maxlength="TASK_LIMITS.person"
          :aria-invalid="Boolean(errors.assignee)"
          :aria-describedby="describedBy('assignee')"
        >
        <p
          v-if="errorMessage('assignee')"
          :id="errorId('assignee')"
          class="field-error"
        >
          {{ errorMessage('assignee') }}
        </p>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label :for="fieldId('status')">Status</label>
        <select
          :id="fieldId('status')"
          v-model="form.status"
          name="status"
          :disabled="readOnly"
          :aria-invalid="Boolean(errors.status)"
          :aria-describedby="describedBy('status')"
        >
          <option
            v-for="status in TASK_STATUSES"
            :key="status"
            :value="status"
          >
            {{ STATUS_LABELS[status] }}
          </option>
        </select>
        <p
          v-if="errorMessage('status')"
          :id="errorId('status')"
          class="field-error"
        >
          {{ errorMessage('status') }}
        </p>
      </div>

      <div class="field">
        <label :for="fieldId('priority')">Prioridade</label>
        <select
          :id="fieldId('priority')"
          v-model="form.priority"
          name="priority"
          :disabled="readOnly"
          :aria-invalid="Boolean(errors.priority)"
          :aria-describedby="describedBy('priority')"
        >
          <option
            v-for="priority in TASK_PRIORITIES"
            :key="priority"
            :value="priority"
          >
            {{ PRIORITY_LABELS[priority] }}
          </option>
        </select>
        <p
          v-if="errorMessage('priority')"
          :id="errorId('priority')"
          class="field-error"
        >
          {{ errorMessage('priority') }}
        </p>
      </div>
    </div>

    <div class="field">
      <label :for="fieldId('dueAt')">Prazo</label>
      <input
        :id="fieldId('dueAt')"
        v-model="form.dueAt"
        name="dueAt"
        type="datetime-local"
        :readonly="readOnly"
        :aria-invalid="Boolean(errors.dueAt)"
        :aria-describedby="describedBy('dueAt')"
        @input="handleDueInput"
      >
      <p
        v-if="errorMessage('dueAt')"
        :id="errorId('dueAt')"
        class="field-error"
      >
        {{ errorMessage('dueAt') }}
      </p>
    </div>

    <section
      v-if="timeZoneReview"
      ref="reviewPanel"
      class="form-notice time-zone-review"
      tabindex="-1"
      role="alert"
      aria-labelledby="time-zone-review-title"
      data-test="time-zone-review"
    >
      <h3 id="time-zone-review-title">
        O fuso horário do sistema mudou
      </h3>
      <p>
        O prazo foi alterado enquanto o fuso do sistema mudou. Revise o horário antes de salvar.
        Instante atual no fuso corrente:
        <strong>{{ props.task?.dueAt ? formatInstant(props.task.dueAt) : '' }}</strong>
        <template v-if="fromLocalDateTimeInput(form.dueAt) && fromLocalDateTimeInput(form.dueAt) !== INVALID_DATE_INPUT">
          · novo prazo: <strong>{{ formatInstant(fromLocalDateTimeInput(form.dueAt) as string) }}</strong>
        </template>
      </p>
      <div class="form-actions">
        <button
          type="button"
          @click="confirmTimeZone"
        >
          Confirmar no fuso atual
        </button>
        <button
          type="button"
          class="button-secondary"
          @click="restoreSavedDue"
        >
          Restaurar prazo salvo
        </button>
      </div>
    </section>

    <div
      v-if="hasReminders"
      class="form-notice"
      data-test="reminders-hint"
    >
      {{ REMINDERS_RESTRICTED_HINT }}
    </div>

    <section
      v-if="(props.task?.subtasks.length ?? 0) > 0"
      class="field subtasks-readonly"
      :aria-labelledby="`${idPrefix}-subtasks-title`"
    >
      <h3 :id="`${idPrefix}-subtasks-title`">
        {{ SUBTASKS_READONLY_LABEL }}
      </h3>
      <p class="field-hint">
        Progresso: {{ subtaskProgress }}
      </p>
      <ul class="subtask-list">
        <li
          v-for="subtask in props.task?.subtasks ?? []"
          :key="subtask.id"
          class="subtask-item"
          :class="{ 'subtask-done': subtask.done }"
        >
          <span class="subtask-state">{{ subtask.done ? 'Feita' : 'Pendente' }}:</span>
          <span>{{ subtask.title }}</span>
        </li>
      </ul>
    </section>

    <div class="field">
      <label :for="fieldId('tags')">Tags</label>
      <input
        :id="fieldId('tags')"
        v-model="form.tags"
        name="tags"
        type="text"
        :readonly="readOnly"
        :aria-invalid="Boolean(errors.tags)"
        :aria-describedby="describedBy('tags')"
      >
      <p class="field-hint">
        Separe por vírgulas. Até {{ TASK_LIMITS.tags }} tags com {{ TASK_LIMITS.tag }} caracteres cada.
      </p>
      <p
        v-if="errorMessage('tags')"
        :id="errorId('tags')"
        class="field-error"
      >
        {{ errorMessage('tags') }}
      </p>
    </div>

    <div class="field">
      <label :for="fieldId('sourceUrl')">URL de origem</label>
      <input
        :id="fieldId('sourceUrl')"
        v-model="form.sourceUrl"
        name="sourceUrl"
        type="url"
        inputmode="url"
        placeholder="https://"
        :readonly="readOnly"
        :aria-invalid="Boolean(errors.sourceUrl)"
        :aria-describedby="describedBy('sourceUrl')"
      >
      <p
        v-if="errorMessage('sourceUrl')"
        :id="errorId('sourceUrl')"
        class="field-error"
      >
        {{ errorMessage('sourceUrl') }}
      </p>
      <div
        v-if="isEditing && props.task?.sourceUrl"
        class="open-source"
      >
        <button
          type="button"
          class="button-secondary"
          data-action="open-source"
          @click="emit('open-source')"
        >
          Abrir origem salva
        </button>
        <p class="field-hint">
          Abre o valor salvo no navegador padrão, mesmo que o campo tenha sido alterado.
        </p>
      </div>
    </div>

    <div class="form-actions">
      <button
        v-if="!readOnly"
        type="submit"
        :aria-disabled="saving ? 'true' : undefined"
      >
        {{ saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar tarefa' }}
      </button>
      <button
        type="button"
        class="button-secondary"
        :aria-disabled="saving ? 'true' : undefined"
        @click="emit('cancel')"
      >
        {{ readOnly ? 'Fechar' : 'Cancelar' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.task-form {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.task-form h2 {
  margin: 0;
  font-size: 1.05rem;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.9rem;
}

.form-notice {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.8rem;
  color: var(--color-ink);
  font-size: 0.85rem;
}

.form-notice h3 {
  margin: 0;
  font-size: 0.95rem;
}

.form-notice p {
  margin: 0;
  line-height: 1.45;
}

.subtasks-readonly {
  margin: 0;
  padding: 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.8rem;
}

.subtasks-readonly h3 {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
}

.subtask-list {
  display: grid;
  gap: 0.3rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
}

.subtask-item {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.subtask-done span {
  color: var(--color-muted);
  text-decoration: line-through;
}

.subtask-state {
  flex: none;
  font-weight: 600;
}

.open-source {
  display: grid;
  gap: 0.35rem;
  justify-items: start;
  margin-top: 0.4rem;
}

.open-source .field-hint {
  margin: 0;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
</style>
