<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useTasksStore } from '../../stores/tasks.js'
import TaskForm, { type TaskFormSubmission } from '../tasks/TaskForm.vue'
import CapturePanel from './CapturePanel.vue'
import ShortcutHint from './ShortcutHint.vue'
import { useCaptureReview } from './use-capture-review.js'
import type { TaskFieldErrors } from '../../../../domain/task-draft.js'

const store = useTasksStore()
const form = ref<InstanceType<typeof TaskForm> | null>(null)
const formKey = ref(0)
const errors = ref<TaskFieldErrors>({})
const message = ref('')
const unconfirmed = ref(false)
const waiting = computed(() => store.commandsBlocked || store.submitting || store.awaitingConfirmation || unconfirmed.value)
const safe = () => !waiting.value && form.value?.pristine === true
const { review, state } = useCaptureReview({ active: () => !store.surfaceSuspended,
  epoch: () => store.surfaceEpoch, generation: () => formKey.value * 1000000 + (form.value?.generation ?? 0), safe,
  apply: draft => { form.value?.applyCapture(draft); errors.value = {} },
}, event => {
  if (event.kind === 'surface-suspended') { if (store.submitting || store.awaitingConfirmation) unconfirmed.value = true; store.suspendSurface() }
  else if (event.kind === 'surface-active') void store.resumeSurface().then(() => review.refresh())
})
watch(() => store.lastConfirmed, confirmation => {
  if (confirmation?.kind !== 'create' || store.surfaceSuspended) return
  formKey.value += 1; errors.value = {}; message.value = 'Tarefa criada.'; unconfirmed.value = false
})
async function submit(submission: TaskFormSubmission): Promise<void> {
  if (waiting.value || submission.kind !== 'create') return
  const result = await store.create(submission.draft)
  if (result.status === 'validation') { errors.value = result.fields; await nextTick(); form.value?.focusFirstInvalid() }
  else if (result.status === 'uncertain') { unconfirmed.value = true; message.value = 'Resultado desconhecido. Consulte as tarefas antes de decidir criar novamente.' }
  else if (result.status !== 'accepted') { message.value = 'Não foi possível confirmar a criação. Seu rascunho foi conservado.'; await nextTick(); form.value?.focusSubmit() }
  else if (store.awaitingConfirmation) message.value = 'Criação recebida; aguardando a lista confirmada. Seu rascunho foi conservado.'
}
function clear(): void { if (waiting.value) return; formKey.value += 1; errors.value = {}; message.value = 'Rascunho limpo por sua ação.' }
async function openManager(): Promise<void> {
  try { const result = await window.taskflowDesktop.openTaskManager({ version: 1 }); if (result.status !== 'ok') message.value = 'Não foi possível abrir o gerenciamento. Seu rascunho foi conservado.' }
  catch { message.value = 'A abertura não foi confirmada. Seu rascunho foi conservado.' }
}
async function quit(): Promise<void> { try { await window.taskflowDesktop.requestQuit({ version: 1 }) } catch { message.value = 'A saída não foi confirmada. Use Sair na bandeja.' } }
async function reconcile(): Promise<void> {
  if (store.submitting || store.awaitingConfirmation) return
  const ok = await store.reviewAfterUncertain()
  message.value = ok ? 'Lista consultada. Verifique no gerenciamento se a tarefa foi criada antes de repetir.' : 'A lista ainda não foi confirmada.'
  // Uma consulta não prova que um create sem ack falhou: só o gesto humano permite outra criação.
}
function allowAnother(): void { if (store.outcomeUnknown !== null || store.surfaceSuspended || store.submitting) return; unconfirmed.value = false; message.value = 'Nova tentativa habilitada por sua decisão. Revise antes de salvar.' }
let lastFocus: HTMLElement | undefined
function rememberFocus(event: FocusEvent): void { if (event.target instanceof HTMLElement) lastFocus = event.target }
function restoreFocus(): void { if (lastFocus?.isConnected) void nextTick(() => lastFocus?.focus()) }
function keydown(event: KeyboardEvent): void { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); window.close() } }
onMounted(() => { void store.connect(); window.addEventListener('focus', restoreFocus) })
onBeforeUnmount(() => { window.removeEventListener('focus', restoreFocus); void store.disconnect() })
</script>

<template>
  <main
    class="quick-add"
    @focusin="rememberFocus"
    @keydown="keydown"
  >
    <header>
      <h1>Adicionar tarefa</h1><button
        type="button"
        class="button-secondary"
        @click="openManager"
      >
        Abrir gerenciamento<ShortcutHint action="OPEN_TASK_MANAGER" />
      </button>
    </header>
    <p>Fechar conserva este rascunho nesta execução quando há bandeja. Sair ou uma falha pode perdê-lo.</p>
    <CapturePanel
      :state="state"
      :review="review"
      :can-review="safe()"
      :inactive="store.surfaceSuspended"
    />
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ message }}
    </p>
    <p
      v-if="store.commandsBlocked && !unconfirmed"
      role="alert"
    >
      A lista está indisponível ou desatualizada. Consulte antes de salvar.
    </p>
    <button
      v-if="store.commandsBlocked || unconfirmed"
      type="button"
      class="button-secondary"
      :disabled="store.submitting || store.awaitingConfirmation"
      @click="reconcile"
    >
      Consultar tarefas
    </button>
    <button
      v-if="unconfirmed && !store.outcomeUnknown"
      type="button"
      class="button-secondary"
      @click="allowAnother"
    >
      Revisei as tarefas; permitir nova criação
    </button>
    <TaskForm
      ref="form"
      :key="formKey"
      compact
      :errors="errors"
      :saving="waiting"
      @submit="submit"
      @cancel="clear"
    />
    <button
      type="button"
      class="button-secondary"
      @click="quit"
    >
      Sair do TaskFlow
    </button>
  </main>
</template>

<style scoped>
.quick-add { max-width: 40rem; margin-inline: auto; padding: 1rem; overflow-wrap: anywhere; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
:deep(.task-form) { max-width: 100%; }
:deep(input), :deep(textarea), :deep(select) { min-width: 0; max-width: 100%; }
:deep(button) { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
@media (max-width: 480px) { :deep(.field-row) { grid-template-columns: 1fr; } }
</style>
