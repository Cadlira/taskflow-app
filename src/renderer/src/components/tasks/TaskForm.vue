<script setup lang="ts">
// Adaptação revisada de taskflow-extension@a763e7a src/components/tasks/TaskForm.vue (MIT, mesmo
// autor). Preserva campos básicos, rótulos, aria, foco inicial/primeiro erro e estilos. Habilita
// regra de recorrência com retirada explícita e lista ordenada de subtarefas com controles de
// teclado; não monta lembretes, IA, captura ou confirmação de série (o diálogo fica no gerente).
import { computed, nextTick, onMounted, reactive, ref, useId, watch } from 'vue'
import type { CapturedDraft } from '../../../../domain/clipboard-capture.js'
import type {
  CreateTaskDraft,
  EditTaskPatch,
  RecurrenceField,
  TaskFieldErrors,
  TaskRecurrenceDraft,
} from '../../../../domain/task-draft.js'
import { normalizeTags, TASK_LIMITS } from '../../../../domain/task-draft.js'
import { RECURRENCE_LIMITS, type RecurrenceFrequency } from '../../../../domain/task-recurrence.js'
import { MAX_SUBTASKS, SUBTASK_TITLE_LIMIT, type SubtaskDraft } from '../../../../domain/task-subtasks.js'
import type { TaskReminderDraft, ReminderItemErrorCode } from '../../../../domain/reminder-draft.js'
import { REMINDER_PRESETS } from '../../../../domain/task-reminders.js'
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskStatus } from '../../../../domain/task.js'
import {
  formatInstant,
  fromLocalDateTimeInput,
  INVALID_DATE_INPUT,
  needsTimeZoneReview,
  needsUntilTimeZoneReview,
  toLocalDateTimeInput,
} from './date-time.js'
import {
  fieldErrorMessage,
  PRIORITY_LABELS,
  RECURRENCE_FREQUENCY_LABELS,
  recurrenceErrorMessage,
  recurrenceSummaryLabel,
  REMOVE_RECURRENCE_LABEL,
  RECURRENCE_REMOVAL_HINT,
  STATUS_LABELS,
  subtaskItemErrorMessage,
  WEEKDAYS,
  WEEKDAY_LABELS,
} from './task-labels.js'

export type TaskFormSubmission = { kind: 'create'; draft: CreateTaskDraft } | { kind: 'edit'; patch: EditTaskPatch }

const props = withDefaults(
  defineProps<{
    /** Tarefa em edição; ausente para criação. */
    task?: Task | null
    errors?: TaskFieldErrors
    saving?: boolean
    initialCapture?: CapturedDraft | undefined
    compact?: boolean
    /** Conversão do prazo usada na detecção de mudança de fuso; injetável em teste. */
    timeZoneConvert?: (iso: string) => string
  }>(),
  // Default inline: `withDefaults` não pode referenciar bindings criados no próprio script setup.
  { task: null, errors: () => ({}), saving: false, compact: false, initialCapture: undefined, timeZoneConvert: (iso: string) => toLocalDateTimeInput(iso) },
)

const emit = defineEmits<{
  submit: [submission: TaskFormSubmission]
  cancel: []
  'open-source': []
}>()

type BasicField = 'title' | 'description' | 'requester' | 'assignee' | 'status' | 'priority' | 'dueAt' | 'tags' | 'sourceUrl'
type RecurrenceMode = 'NONE' | RecurrenceFrequency

const idPrefix = useId()
const titleInput = ref<HTMLInputElement | null>(null)
const formElement = ref<HTMLFormElement | null>(null)
const reviewPanel = ref<HTMLElement | null>(null)
const submitButton = ref<HTMLButtonElement | null>(null)

const isEditing = computed(() => props.task !== null && props.task !== undefined)
const heading = computed(() => (isEditing.value ? 'Editar tarefa' : 'Nova tarefa'))

const form = reactive({
  title: props.task?.title ?? props.initialCapture?.title ?? '',
  description: props.task?.description ?? props.initialCapture?.description ?? '',
  requester: props.task?.requester ?? '',
  assignee: props.task?.assignee ?? '',
  status: props.task?.status ?? 'TODO',
  priority: props.task?.priority ?? 'MEDIUM',
  dueAt: toLocalDateTimeInput(props.task?.dueAt),
  tags: props.task?.tags.join(', ') ?? '',
  sourceUrl: props.task?.sourceUrl ?? props.initialCapture?.sourceUrl ?? '',
})

interface FormSubtask {
  key: number
  id?: string
  title: string
}

let nextSubtaskKey = 1
interface ReminderRow {
  key: number; id?: string; type: 'OFFSET' | 'AT'; offset: string; unit: string
  at: string; originalAt: string | undefined; captured: string; dirty: boolean
}
let nextReminderKey = 1
const reminderRows = ref<ReminderRow[]>((props.task?.reminders ?? []).map(item => ({
  key: nextReminderKey++, id: item.id, type: item.type,
  offset: item.type === 'OFFSET' ? String(item.offsetMinutes) : '15', unit: '1',
  at: item.type === 'AT' ? toLocalDateTimeInput(item.at) : '',
  originalAt: item.type === 'AT' ? item.at : undefined,
  captured: item.type === 'AT' ? toLocalDateTimeInput(item.at) : '', dirty: false,
})))
const reminderMessages: Record<ReminderItemErrorCode, string> = {
  INVALID_VALUE: 'Informe um valor inteiro válido.', INVALID_DATE: 'Informe data e hora válidas.',
  DUPLICATE_ID: 'Este lembrete está repetido.', UNKNOWN_ID: 'O lembrete mudou; revise a tarefa.',
  DUPLICATE_INSTANT: 'Dois lembretes não podem ocorrer no mesmo instante.',
  OUT_OF_RANGE: 'O instante está fora do intervalo permitido.', AFTER_DUE: 'O lembrete deve ocorrer até o prazo.',
  ELAPSED: 'Um lembrete novo ou alterado precisa ocorrer no futuro.',
  ABSOLUTE_REMINDER_INCOMPATIBLE: 'Em recorrências, use uma antecedência relativa ao prazo.',
}
function reminderError(index: number): string | undefined {
  const code = props.errors.reminders?.items?.find(item => item.index === index)?.code
  return code === undefined ? undefined : reminderMessages[code]
}
function reminderId(index: number, field: string): string { return `${idPrefix}-reminder-${index}-${field}` }
function buildRemindersIntent(): TaskReminderDraft[] | undefined {
  const drafts: TaskReminderDraft[] = reminderRows.value.map(row => {
    const id = row.id === undefined ? {} : { id: row.id }
    const offsetText = row.offset === undefined || row.offset === null ? '' : String(row.offset)
    return row.type === 'OFFSET' ? { ...id, type: 'OFFSET', offsetMinutes: (offsetText.trim() === '' ? Number.NaN : Number(offsetText)) * Number(row.unit) }
      : { ...id, type: 'AT', at: !row.dirty && row.originalAt !== undefined ? row.originalAt : fromLocalDateTimeInput(row.at) ?? INVALID_DATE_INPUT }
  })
  const base = props.task?.reminders.map(item => item.type === 'OFFSET'
    ? { id: item.id, type: item.type, offsetMinutes: item.offsetMinutes }
    : { id: item.id, type: item.type, at: item.at }) ?? []
  if (isEditing.value && JSON.stringify(drafts) === JSON.stringify(base)) return undefined
  return !isEditing.value && drafts.length === 0 ? undefined : drafts
}
function addReminder(): void {
  if (reminderRows.value.length >= 10) return
  reminderRows.value.push({ key: nextReminderKey++, type: 'OFFSET', offset: '15', unit: '1', at: '', originalAt: undefined, captured: '', dirty: false })
  void nextTick(() => formElement.value?.querySelector<HTMLElement>(`[data-reminder-row="${reminderRows.value.length - 1}"] select`)?.focus())
}
function removeReminder(index: number): void {
  reminderRows.value.splice(index, 1)
  void nextTick(() => {
    const target = formElement.value?.querySelector<HTMLElement>(`[data-reminder-row="${Math.min(index, reminderRows.value.length - 1)}"] select`)
    ;(target ?? formElement.value?.querySelector<HTMLElement>('[data-action="add-reminder"]'))?.focus()
  })
}
const subtaskRows = ref<FormSubtask[]>(
  (props.task?.subtasks ?? []).map((subtask) => ({ key: nextSubtaskKey++, id: subtask.id, title: subtask.title })),
)

const recurrence = reactive({
  mode: (props.task?.recurrence?.frequency ?? 'NONE') as RecurrenceMode,
  intervalDays: props.task?.recurrence?.frequency === 'DAILY' ? String(props.task.recurrence.intervalDays) : '1',
  weekdays:
    props.task?.recurrence?.frequency === 'WEEKLY' ? [...props.task.recurrence.weekdays] : ([] as number[]),
  dayOfMonth: props.task?.recurrence?.frequency === 'MONTHLY' ? String(props.task.recurrence.dayOfMonth) : '1',
  until: toLocalDateTimeInput(props.task?.recurrence?.until),
})

/** Retirada explícita da regra; preserva status/prazo e não é enviada até o save. */
const recurrenceRemoved = ref(false)
const hasBaseRule = computed(() => props.task?.recurrence !== undefined)
const baseRuleSummary = computed(() =>
  props.task?.recurrence === undefined ? '' : recurrenceSummaryLabel(props.task.recurrence),
)

/** Texto do prazo capturado ao abrir: base da detecção de mudança de fuso. */
let capturedDueInput = toLocalDateTimeInput(props.task?.dueAt)
const dueAtDirty = ref(false)
/** Texto do limite de série capturado ao abrir; mesmo contrato do prazo. */
let capturedUntilInput = toLocalDateTimeInput(props.task?.recurrence?.until)
const untilDirty = ref(false)
const timeZoneReview = ref(false)
const subtaskLimitReached = computed(() => subtaskRows.value.length >= MAX_SUBTASKS)

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

function recurrenceFieldId(field: RecurrenceField): string {
  return `${idPrefix}-recurrence-${field}`
}

function recurrenceErrorId(field: RecurrenceField): string {
  return `${recurrenceFieldId(field)}-error`
}

function recurrenceDescribedBy(field: RecurrenceField): string | undefined {
  return props.errors.recurrence?.[field] === undefined ? undefined : recurrenceErrorId(field)
}

function recurrenceError(field: RecurrenceField): string | undefined {
  const code = props.errors.recurrence?.[field]
  return code === undefined ? undefined : recurrenceErrorMessage(field, code)
}

function subtaskInputId(index: number): string {
  return `${idPrefix}-subtask-${index}`
}

function subtaskError(index: number): string | undefined {
  const item = props.errors.subtasks?.items?.find((candidate) => candidate.index === index)
  return item === undefined ? undefined : subtaskItemErrorMessage(item)
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function newInstant(input: string): string | undefined {
  const converted = fromLocalDateTimeInput(input)
  return converted !== undefined && converted !== INVALID_DATE_INPUT ? converted : undefined
}

// ---- Recorrência: intenção construída só quando difere da regra atual ----

type RecurrenceIntent = { type: 'omit' } | { type: 'remove' } | { type: 'rule'; rule: TaskRecurrenceDraft }

function sortedWeekdays(days: readonly number[]): number[] {
  return [...days].sort((left, right) => left - right)
}

function sameWeekdays(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((day) => set.has(day))
}

function ruleOf(mode: RecurrenceFrequency, until: string | null | undefined): TaskRecurrenceDraft {
  const untilPart = until === undefined ? {} : { until }
  if (mode === 'DAILY') {
    const parsed = Number(recurrence.intervalDays)
    return { ...untilPart, frequency: 'DAILY', intervalDays: Number.isFinite(parsed) ? parsed : 0 }
  }
  if (mode === 'WEEKLY') {
    return { ...untilPart, frequency: 'WEEKLY', weekdays: sortedWeekdays(recurrence.weekdays) }
  }
  const parsed = Number(recurrence.dayOfMonth)
  return { ...untilPart, frequency: 'MONTHLY', dayOfMonth: Number.isFinite(parsed) ? parsed : 0 }
}

function baseRuleMatches(mode: RecurrenceFrequency, untilIntent: string | null | undefined): boolean {
  const base = props.task?.recurrence
  if (base === undefined || base.frequency !== mode) return false

  if (mode === 'DAILY' && base.frequency === 'DAILY') {
    const parsed = Number(recurrence.intervalDays)
    if (!Number.isFinite(parsed) || parsed !== base.intervalDays) return false
  }
  if (mode === 'WEEKLY' && base.frequency === 'WEEKLY') {
    if (!sameWeekdays(sortedWeekdays(recurrence.weekdays), base.weekdays)) return false
  }
  if (mode === 'MONTHLY' && base.frequency === 'MONTHLY') {
    const parsed = Number(recurrence.dayOfMonth)
    if (!Number.isFinite(parsed) || parsed !== base.dayOfMonth) return false
  }
  if (untilIntent !== undefined) {
    const baseUntil = base.until ?? null
    if (untilIntent !== baseUntil) return false
  }
  return true
}

function buildRecurrenceIntent(): RecurrenceIntent {
  if (hasBaseRule.value && recurrenceRemoved.value) return { type: 'remove' }
  if (recurrence.mode === 'NONE') return { type: 'omit' }

  const mode = recurrence.mode
  const untilIntent: string | null | undefined = untilDirty.value
    ? recurrence.until.trim()
      ? fromLocalDateTimeInput(recurrence.until) ?? null
      : null
    : undefined

  if (baseRuleMatches(mode, untilIntent)) return { type: 'omit' }
  return { type: 'rule', rule: ruleOf(mode, untilIntent) }
}

// ---- Subtarefas: lista ausente conserva, [] limpa, itens novos sem ID e sem done ----

function buildSubtasksIntent(): readonly SubtaskDraft[] | undefined {
  const base = props.task?.subtasks ?? []
  const rows = subtaskRows.value

  if (!isEditing.value) {
    return rows.length === 0 ? undefined : rows.map((row) => ({ title: row.title }))
  }

  const changed =
    rows.length !== base.length ||
    rows.some((row, index) => row.id !== base[index]?.id || row.title !== base[index]?.title)
  if (!changed) return undefined
  return rows.map((row) => (row.id === undefined ? { title: row.title } : { id: row.id, title: row.title }))
}

// ---- Construção do draft/patch ----

function buildCreateDraft(): CreateTaskDraft {
  const dueAt = fromLocalDateTimeInput(form.dueAt)
  const draft: CreateTaskDraft = {
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

  const recurrenceIntent = buildRecurrenceIntent()
  if (recurrenceIntent.type === 'rule') draft.recurrence = recurrenceIntent.rule

  const subtasks = buildSubtasksIntent()
  if (subtasks !== undefined) draft.subtasks = subtasks
  const reminders = buildRemindersIntent()
  if (reminders !== undefined) draft.reminders = reminders

  return draft
}

function buildPatch(): EditTaskPatch {
  const base = props.task
  if (base === null || base === undefined) return {}

  const patch: EditTaskPatch = {}
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

  const recurrenceIntent = buildRecurrenceIntent()
  if (recurrenceIntent.type === 'remove') patch.recurrence = null
  else if (recurrenceIntent.type === 'rule') patch.recurrence = recurrenceIntent.rule

  const subtasks = buildSubtasksIntent()
  if (subtasks !== undefined) patch.subtasks = subtasks
  const reminders = buildRemindersIntent()
  if (reminders !== undefined) patch.reminders = reminders

  return patch
}

// ---- Ações da lista de subtarefas (acessíveis por teclado) ----

function focusSubtaskInput(index: number): void {
  formElement.value?.querySelector<HTMLInputElement>(`[data-subtask-row="${index}"] input`)?.focus()
}

function subtaskActionButton(index: number, action: string): HTMLButtonElement | null {
  return (
    formElement.value?.querySelector<HTMLButtonElement>(`[data-subtask-row="${index}"] [data-action="${action}"]`) ??
    null
  )
}

function addSubtask(): void {
  if (subtaskLimitReached.value) return
  subtaskRows.value.push({ key: nextSubtaskKey++, title: '' })
  void nextTick(() => focusSubtaskInput(subtaskRows.value.length - 1))
}

function removeSubtask(index: number): void {
  if (index < 0 || index >= subtaskRows.value.length) return
  const wasLast = index === subtaskRows.value.length - 1
  subtaskRows.value.splice(index, 1)
  void nextTick(() => {
    if (subtaskRows.value.length === 0) {
      formElement.value?.querySelector<HTMLButtonElement>('[data-action="add-subtask"]')?.focus()
      return
    }
    if (wasLast) focusSubtaskInput(subtaskRows.value.length - 1)
    else focusSubtaskInput(index)
  })
}

function moveSubtask(index: number, delta: -1 | 1): void {
  const target = index + delta
  if (index < 0 || index >= subtaskRows.value.length || target < 0 || target >= subtaskRows.value.length) return
  const rows = subtaskRows.value
  const current = rows[index]
  const other = rows[target]
  if (current === undefined || other === undefined) return
  rows[index] = other
  rows[target] = current
  const action = delta === -1 ? 'move-up' : 'move-down'
  void nextTick(() => subtaskActionButton(target, action)?.focus())
}

// ---- Foco e save ----

/** Foca o primeiro campo inválido em ordem de documento (básicos, regra e subtarefas). */
function focusFirstInvalid(): boolean {
  const invalid = formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!invalid) return false
  invalid.focus()
  return true
}

function focusSubmit(): void {
  submitButton.value?.focus()
}

const generation = ref(0)
function currentFields(): string { return JSON.stringify([form, recurrence, recurrenceRemoved.value, subtaskRows.value, reminderRows.value]) }
const initialFields = currentFields()
const pristine = computed(() => !isEditing.value && props.initialCapture === undefined && currentFields() === initialFields)
watch(currentFields, () => { generation.value += 1 }, { flush: 'sync' })
function applyCapture(draft: CapturedDraft): void {
  if (!pristine.value || props.saving) return
  form.title = draft.title; form.description = draft.description ?? ''; form.sourceUrl = draft.sourceUrl ?? ''
  void nextTick(() => titleInput.value?.focus())
}
defineExpose({ focusFirstInvalid, focusSubmit, pristine, generation, applyCapture })

function handleSubmit(): void {
  if (props.saving === true || composing.value) return

  const dueReview =
    isEditing.value &&
    dueAtDirty.value &&
    needsTimeZoneReview({
      originalIso: props.task?.dueAt,
      capturedInput: capturedDueInput,
      nextInput: form.dueAt,
      dirty: dueAtDirty.value,
      ...(props.timeZoneConvert !== undefined && { convert: props.timeZoneConvert }),
    })

  const untilReview =
    isEditing.value &&
    !recurrenceRemoved.value &&
    untilDirty.value &&
    needsUntilTimeZoneReview({
      originalUntilIso: props.task?.recurrence?.until,
      capturedUntilInput,
      nextUntilInput: recurrence.until,
      dirty: untilDirty.value,
      ...(props.timeZoneConvert !== undefined && { convert: props.timeZoneConvert }),
    })

  const reminderReview = reminderRows.value.some(row => row.type === 'AT' && needsTimeZoneReview({
    originalIso: row.originalAt, capturedInput: row.captured, nextInput: row.at, dirty: row.dirty,
    ...(props.timeZoneConvert !== undefined && { convert: props.timeZoneConvert }),
  }))
  if (dueReview || untilReview || reminderReview) {
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
  capturedUntilInput = props.task?.recurrence?.until ? convert(props.task.recurrence.until) : ''
  for (const row of reminderRows.value) if (row.originalAt !== undefined) row.captured = convert(row.originalAt)
  timeZoneReview.value = false
}

/** Restaura os valores salvos e abandona as alterações pendentes de prazo/limite. */
function restoreSavedDue(): void {
  form.dueAt = capturedDueInput
  dueAtDirty.value = false
  if (untilDirty.value) {
    recurrence.until = capturedUntilInput
    untilDirty.value = false
  }
  timeZoneReview.value = false
  for (const row of reminderRows.value) if (row.originalAt !== undefined) { row.at = toLocalDateTimeInput(row.originalAt); row.dirty = false }
}

function handleDueInput(): void {
  dueAtDirty.value = true
}

function handleUntilInput(): void {
  untilDirty.value = true
}

function removeRecurrence(): void {
  recurrenceRemoved.value = true
  timeZoneReview.value = false
}

function undoRemoveRecurrence(): void {
  recurrenceRemoved.value = false
}

onMounted(() => {
  titleInput.value?.focus()
})
const composing = ref(false)
</script>

<template>
  <form
    ref="formElement"
    class="task-form"
    :aria-labelledby="`${idPrefix}-heading`"
    novalidate
    @submit.prevent="handleSubmit"
    @compositionstart="composing = true"
    @compositionend="composing = false"
  >
    <h2 :id="`${idPrefix}-heading`">
      {{ heading }}
    </h2>

    <div class="field">
      <label :for="fieldId('title')">Título <span aria-hidden="true">*</span></label>
      <input
        :id="fieldId('title')"
        ref="titleInput"
        v-model="form.title"
        name="title"
        type="text"
        required
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
        <label
          v-if="!compact"
          :for="fieldId('status')"
        >Status</label>
        <select
          v-if="!compact"
          :id="fieldId('status')"
          v-model="form.status"
          name="status"
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
        Um prazo, limite da série ou lembrete foi alterado enquanto o fuso do sistema mudou. Revise os
        horários antes de salvar.
      </p>
      <ul class="time-zone-values">
        <li v-if="dueAtDirty">
          Prazo salvo: <strong>{{ props.task?.dueAt ? formatInstant(props.task.dueAt) : 'sem valor' }}</strong>
          <template v-if="newInstant(form.dueAt)">
            · novo prazo: <strong>{{ formatInstant(newInstant(form.dueAt) as string) }}</strong>
          </template>
        </li>
        <li v-if="untilDirty && !recurrenceRemoved">
          Limite salvo:
          <strong>{{ props.task?.recurrence?.until ? formatInstant(props.task.recurrence.until) : 'sem valor' }}</strong>
          <template v-if="newInstant(recurrence.until)">
            · novo limite: <strong>{{ formatInstant(newInstant(recurrence.until) as string) }}</strong>
          </template>
        </li>
      </ul>
      <p
        v-for="row in reminderRows.filter(item => item.type === 'AT' && item.dirty && item.originalAt)"
        :key="row.key"
      >
        Lembrete salvo: {{ formatInstant(row.originalAt as string) }} · novo: {{ newInstant(row.at) ? formatInstant(newInstant(row.at) as string) : 'data inválida' }}
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
          Restaurar valores salvos
        </button>
      </div>
    </section>

    <section
      v-if="!compact"
      class="field recurrence"
      :aria-labelledby="`${idPrefix}-recurrence-title`"
    >
      <h3 :id="`${idPrefix}-recurrence-title`">
        Recorrência
      </h3>
      <p
        v-if="hasBaseRule"
        class="field-hint"
        data-test="base-recurrence-summary"
      >
        Regra atual: {{ baseRuleSummary }}
      </p>

      <template v-if="!recurrenceRemoved">
        <div class="field">
          <label :for="recurrenceFieldId('frequency')">Frequência</label>
          <select
            :id="recurrenceFieldId('frequency')"
            v-model="recurrence.mode"
            name="recurrenceFrequency"
            :aria-invalid="Boolean(errors.recurrence?.frequency)"
            :aria-describedby="recurrenceDescribedBy('frequency')"
          >
            <option
              v-if="!hasBaseRule"
              value="NONE"
            >
              Não se repete
            </option>
            <option
              v-for="frequency in (['DAILY', 'WEEKLY', 'MONTHLY'] as const)"
              :key="frequency"
              :value="frequency"
            >
              {{ RECURRENCE_FREQUENCY_LABELS[frequency] }}
            </option>
          </select>
          <p
            v-if="recurrenceError('frequency')"
            :id="recurrenceErrorId('frequency')"
            class="field-error"
          >
            {{ recurrenceError('frequency') }}
          </p>
        </div>

        <div
          v-if="recurrence.mode === 'DAILY'"
          class="field"
        >
          <label :for="recurrenceFieldId('intervalDays')">A cada quantos dias (1–365)</label>
          <input
            :id="recurrenceFieldId('intervalDays')"
            v-model="recurrence.intervalDays"
            name="recurrenceIntervalDays"
            type="number"
            :min="RECURRENCE_LIMITS.intervalDaysMin"
            :max="RECURRENCE_LIMITS.intervalDaysMax"
            step="1"
            :aria-invalid="Boolean(errors.recurrence?.intervalDays)"
            :aria-describedby="recurrenceDescribedBy('intervalDays')"
          >
          <p
            v-if="recurrenceError('intervalDays')"
            :id="recurrenceErrorId('intervalDays')"
            class="field-error"
          >
            {{ recurrenceError('intervalDays') }}
          </p>
        </div>

        <fieldset
          v-if="recurrence.mode === 'WEEKLY'"
          class="field weekday-fieldset"
        >
          <legend>Dias da semana</legend>
          <div class="weekday-options">
            <label
              v-for="day in WEEKDAYS"
              :key="day"
              class="weekday-option"
            >
              <input
                v-model="recurrence.weekdays"
                type="checkbox"
                name="recurrenceWeekdays"
                :value="day"
              >
              {{ WEEKDAY_LABELS[day] }}
            </label>
          </div>
          <p
            v-if="recurrenceError('weekdays')"
            :id="recurrenceErrorId('weekdays')"
            class="field-error"
          >
            {{ recurrenceError('weekdays') }}
          </p>
        </fieldset>

        <div
          v-if="recurrence.mode === 'MONTHLY'"
          class="field"
        >
          <label :for="recurrenceFieldId('dayOfMonth')">Dia do mês (1–31)</label>
          <input
            :id="recurrenceFieldId('dayOfMonth')"
            v-model="recurrence.dayOfMonth"
            name="recurrenceDayOfMonth"
            type="number"
            :min="RECURRENCE_LIMITS.dayOfMonthMin"
            :max="RECURRENCE_LIMITS.dayOfMonthMax"
            step="1"
            :aria-invalid="Boolean(errors.recurrence?.dayOfMonth)"
            :aria-describedby="recurrenceDescribedBy('dayOfMonth')"
          >
          <p
            v-if="recurrenceError('dayOfMonth')"
            :id="recurrenceErrorId('dayOfMonth')"
            class="field-error"
          >
            {{ recurrenceError('dayOfMonth') }}
          </p>
        </div>

        <div class="field">
          <label :for="recurrenceFieldId('until')">Limite da série (opcional)</label>
          <input
            :id="recurrenceFieldId('until')"
            v-model="recurrence.until"
            name="recurrenceUntil"
            type="datetime-local"
            :aria-invalid="Boolean(errors.recurrence?.until)"
            :aria-describedby="recurrenceDescribedBy('until')"
            @input="handleUntilInput"
          >
          <p class="field-hint">
            Depois do limite, novas ocorrências deixam de ser geradas.
          </p>
          <p
            v-if="recurrenceError('until')"
            :id="recurrenceErrorId('until')"
            class="field-error"
          >
            {{ recurrenceError('until') }}
          </p>
        </div>
      </template>

      <template v-else>
        <p
          class="form-notice"
          data-test="recurrence-removal"
        >
          {{ RECURRENCE_REMOVAL_HINT }}
        </p>
        <button
          type="button"
          class="button-secondary"
          data-action="undo-remove-recurrence"
          @click="undoRemoveRecurrence"
        >
          Manter recorrência
        </button>
      </template>

      <button
        v-if="hasBaseRule && !recurrenceRemoved"
        type="button"
        class="button-secondary"
        data-action="remove-recurrence"
        @click="removeRecurrence"
      >
        {{ REMOVE_RECURRENCE_LABEL }}
      </button>
    </section>

    <section
      v-if="!compact"
      class="field subtasks-edit"
      :aria-labelledby="`${idPrefix}-subtasks-title`"
    >
      <h3 :id="`${idPrefix}-subtasks-title`">
        Subtarefas
      </h3>
      <p
        class="field-hint"
        data-test="subtask-limit"
      >
        {{ subtaskRows.length }} de {{ MAX_SUBTASKS }} subtarefas. Cada título aceita até {{ SUBTASK_TITLE_LIMIT }} caracteres.
      </p>

      <ol
        v-if="subtaskRows.length > 0"
        class="subtask-edit-list"
      >
        <li
          v-for="(row, index) in subtaskRows"
          :key="row.key"
          class="subtask-edit-item"
          :data-subtask-row="index"
        >
          <span
            class="subtask-position"
            aria-hidden="true"
          >{{ index + 1 }}.</span>
          <label
            class="visually-hidden"
            :for="subtaskInputId(index)"
          >Título da subtarefa {{ index + 1 }}</label>
          <input
            :id="subtaskInputId(index)"
            v-model="row.title"
            class="subtask-title-input"
            type="text"
            :maxlength="SUBTASK_TITLE_LIMIT"
            :aria-invalid="Boolean(subtaskError(index))"
            :aria-describedby="subtaskError(index) ? `${subtaskInputId(index)}-error` : undefined"
          >
          <div class="subtask-actions">
            <button
              type="button"
              class="button-small button-secondary"
              data-action="move-up"
              :aria-disabled="index === 0 ? 'true' : undefined"
              @click="moveSubtask(index, -1)"
            >
              Mover para cima<span class="visually-hidden">: subtarefa {{ index + 1 }}</span>
            </button>
            <button
              type="button"
              class="button-small button-secondary"
              data-action="move-down"
              :aria-disabled="index === subtaskRows.length - 1 ? 'true' : undefined"
              @click="moveSubtask(index, 1)"
            >
              Mover para baixo<span class="visually-hidden">: subtarefa {{ index + 1 }}</span>
            </button>
            <button
              type="button"
              class="button-small button-secondary"
              data-action="remove-subtask"
              @click="removeSubtask(index)"
            >
              Remover<span class="visually-hidden"> a subtarefa {{ index + 1 }}</span>
            </button>
          </div>
          <p
            v-if="subtaskError(index)"
            :id="`${subtaskInputId(index)}-error`"
            class="field-error"
          >
            {{ subtaskError(index) }}
          </p>
        </li>
      </ol>

      <button
        type="button"
        class="button-secondary"
        data-action="add-subtask"
        :aria-disabled="subtaskLimitReached ? 'true' : undefined"
        @click="addSubtask"
      >
        Adicionar subtarefa
      </button>
    </section>

    <fieldset
      v-if="!compact"
      class="field recurrence"
      :aria-describedby="`${idPrefix}-reminders-hint`"
    >
      <legend>Lembretes</legend>
      <p
        :id="`${idPrefix}-reminders-hint`"
        class="field-hint"
      >
        Até 10 lembretes, com prazo definido. Em recorrências, use antecedência relativa.
      </p>
      <p
        v-if="errors.reminders?.list"
        class="field-error"
        role="alert"
      >
        {{ errors.reminders.list === 'TOO_MANY' ? 'O limite é 10 lembretes.' : 'Defina um prazo para os lembretes.' }}
      </p>
      <div
        v-for="(row, index) in reminderRows"
        :key="row.key"
        class="field"
        :data-reminder-row="index"
      >
        <label :for="reminderId(index, 'type')">Lembrete {{ index + 1 }}</label>
        <select
          :id="reminderId(index, 'type')"
          v-model="row.type"
          :aria-invalid="Boolean(reminderError(index))"
          :aria-describedby="reminderError(index) ? reminderId(index, 'error') : undefined"
        >
          <option value="OFFSET">
            Antes do prazo
          </option>
          <option value="AT">
            Em data e hora
          </option>
        </select>
        <template v-if="row.type === 'OFFSET'">
          <div class="field-row">
            <div class="field">
              <label :for="reminderId(index, 'offset')">Antecedência</label>
              <input
                :id="reminderId(index, 'offset')"
                v-model="row.offset"
                type="number"
                min="0"
                step="1"
                :aria-invalid="Boolean(reminderError(index))"
                :aria-describedby="reminderError(index) ? reminderId(index, 'error') : undefined"
              >
            </div>
            <div class="field">
              <label :for="reminderId(index, 'unit')">Unidade</label>
              <select
                :id="reminderId(index, 'unit')"
                v-model="row.unit"
              >
                <option value="1">
                  Minutos
                </option><option value="60">
                  Horas
                </option><option value="1440">
                  Dias
                </option>
              </select>
            </div>
          </div>
          <div class="subtask-actions">
            <button
              v-for="preset in REMINDER_PRESETS"
              :key="preset"
              type="button"
              class="button-small button-secondary"
              :aria-label="`Lembrete ${index + 1}: ${preset} minutos antes do prazo`"
              @click="row.offset = String(preset); row.unit = '1'"
            >
              {{ preset === 0 ? 'No prazo' : preset === 60 ? '1 hora' : preset === 1440 ? '1 dia' : '15 minutos' }}
            </button>
          </div>
        </template>
        <template v-else>
          <label :for="reminderId(index, 'at')">Data e hora do lembrete {{ index + 1 }}</label>
          <input
            :id="reminderId(index, 'at')"
            v-model="row.at"
            type="datetime-local"
            :aria-invalid="Boolean(reminderError(index))"
            :aria-describedby="reminderError(index) ? reminderId(index, 'error') : undefined"
            @input="row.dirty = true"
          >
        </template>
        <p
          v-if="reminderError(index)"
          :id="reminderId(index, 'error')"
          class="field-error"
        >
          {{ reminderError(index) }}
        </p>
        <button
          type="button"
          class="button-secondary"
          @click="removeReminder(index)"
        >
          Remover lembrete {{ index + 1 }}
        </button>
      </div>
      <button
        type="button"
        class="button-secondary"
        data-action="add-reminder"
        :aria-disabled="reminderRows.length >= 10 ? 'true' : undefined"
        @click="addReminder"
      >
        Adicionar lembrete
      </button>
    </fieldset>

    <div class="field">
      <label
        v-if="!compact"
        :for="fieldId('tags')"
      >Tags</label>
      <input
        v-if="!compact"
        :id="fieldId('tags')"
        v-model="form.tags"
        name="tags"
        type="text"
        :aria-invalid="Boolean(errors.tags)"
        :aria-describedby="describedBy('tags')"
      >
      <p
        v-if="!compact"
        class="field-hint"
      >
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
        ref="submitButton"
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
        Cancelar
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

.time-zone-values {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding-left: 1.1rem;
}

.recurrence,
.subtasks-edit {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.8rem;
}

.recurrence h3,
.subtasks-edit h3 {
  margin: 0;
  font-size: 0.9rem;
}

.weekday-fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.weekday-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
}

.weekday-option {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
}

.subtask-edit-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.subtask-edit-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.35rem 0.5rem;
  align-items: center;
}

.subtask-edit-item .subtask-title-input {
  min-width: 0;
}

.subtask-position {
  font-size: 0.85rem;
  color: var(--color-muted);
}

.subtask-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  grid-column: 1 / -1;
}

.subtask-edit-item .field-error {
  grid-column: 1 / -1;
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
