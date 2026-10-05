<script setup lang="ts">
// Área da lixeira (TFA-006): retenção/limite visíveis, restore/definitiva/esvaziamento
// condicionados à base preparada no main, foco previsível e nenhuma oferta de desfazer para
// essas ações. A apresentação filtra vencidos pelo relógio local sem escrever.
import { computed, nextTick, ref, watch } from 'vue'
import type { TrashRecord } from '../../../../contracts/state.js'
import { useTasksStore, type TrashCommandStoreResult } from '../../stores/tasks.js'
import { formatDateTime } from '../tasks/date-time.js'

const store = useTasksStore()
const emit = defineEmits<{ back: [] }>()

type Feedback = { tone: 'success' | 'warning' | 'error'; text: string }

const feedback = ref<Feedback | null>(null)
const actionError = ref<string | null>(null)
const busyTaskId = ref<string | null>(null)
const pendingPermanent = ref<TrashRecord | null>(null)
const pendingEmpty = ref(false)
const confirmPanel = ref<HTMLElement | null>(null)
const emptyAlert = ref<HTMLElement | null>(null)
const backButton = ref<HTMLButtonElement | null>(null)
const emptyButton = ref<HTMLButtonElement | null>(null)
const listElement = ref<HTMLUListElement | null>(null)

const entries = computed(() => store.trashVisible)
const emptyDisabled = computed(() => entries.value.length === 0 || store.submitting)

watch(confirmPanel, (panel) => panel?.focus())

function entryPosition(taskId: string): number {
  return entries.value.findIndex((record) => record.task.id === taskId)
}

function focusEntryControl(taskId: string, action: 'restore' | 'permanent'): boolean {
  const items = listElement.value?.querySelectorAll<HTMLElement>('[data-trash-id]')
  if (!items) return false
  for (const item of items) {
    if (item.dataset['trashId'] !== taskId) continue
    const control = item.querySelector<HTMLElement>(`[data-action="${action}"]`)
    if (!control) return false
    control.focus()
    return true
  }
  return false
}

async function focusAfterRemoval(position: number): Promise<void> {
  await nextTick()
  const neighbor = entries.value[position] ?? entries.value.at(-1)
  if (neighbor !== undefined && focusEntryControl(neighbor.task.id, 'restore')) return
  backButton.value?.focus()
}

function resultText(result: TrashCommandStoreResult): string {
  switch (result.status) {
    case 'not-in-trash':
      return 'O item não está mais na lixeira.'
    case 'entry-changed':
      return 'O item mudou depois da confirmação; nada foi removido. Revise a lista.'
    case 'entry-expired':
      return 'O item venceu a retenção de 30 dias e não pode ser restaurado.'
    case 'id-exists':
      return 'Já existe uma tarefa ativa com esse identificador; nada foi restaurado.'
    case 'series-conflict':
      return 'Há outra ocorrência da mesma série; nada foi alterado.'
    case 'confirmation-changed':
      return 'A composição da lixeira mudou depois da preparação. Revise a lista antes de tentar de novo.'
    case 'confirmation-invalid':
      return 'A confirmação não é mais válida; abra o diálogo novamente.'
    case 'stale-context':
      return 'A ação ficou desatualizada por outra operação; tente novamente.'
    case 'undo-not-available':
      return 'A oferta de desfazer não está mais disponível.'
    case 'removed':
      return 'O item não existe mais; nada foi alterado.'
    case 'changed':
      return 'O conteúdo mudou depois da ação; nada foi desfeito.'
    case 'generated-changed':
      return 'A ocorrência gerada mudou depois da ação; nada foi desfeito.'
    case 'uncertain':
      return 'Resultado incerto: confira a lixeira antes de decidir; nada é reenviado automaticamente.'
    case 'blocked':
      return blockedText(result.code)
    default:
      return 'A operação não foi concluída.'
  }
}

function blockedText(code: string): string {
  const messages: Record<string, string> = {
    BUSY: 'O aplicativo está ocupado; tente novamente.',
    SESSION_CLOSED: 'A janela foi recarregada; tente novamente.',
    STORAGE_UNAVAILABLE: 'O armazenamento local está indisponível. Nenhum dado foi redefinido.',
    INCOMPATIBLE_DATA: 'Os dados locais estão em uma versão incompatível.',
    CORRUPTED_DATA: 'Os dados locais não puderam ser lidos.',
    RESOURCE_LIMIT: 'A operação excedeu um limite local.',
    SNAPSHOT_STALE: 'A lixeira está desatualizada; aguarde a reconciliação.',
    INVALID_REQUEST: 'A solicitação não pôde ser aceita.',
    UNAUTHORIZED: 'A janela atual não está autorizada.',
  }
  return messages[code] ?? 'Não foi possível concluir a operação.'
}

async function restore(record: TrashRecord): Promise<void> {
  if (busyTaskId.value !== null || store.submitting) return
  feedback.value = null
  actionError.value = null
  const position = entryPosition(record.task.id)
  busyTaskId.value = record.task.id
  const result = await store.restoreFromArea(record.task.id)
  busyTaskId.value = null
  if (result.status === 'accepted') {
    await store.waitForSnapshot(result.revision ?? store.revision ?? '0')
    feedback.value = { tone: 'success', text: `“${record.task.title}” foi restaurada.` }
    await focusAfterRemoval(position)
    return
  }
  actionError.value = resultText(result)
  await nextTick()
  if (!focusEntryControl(record.task.id, 'restore')) backButton.value?.focus()
}

function requestPermanent(record: TrashRecord): void {
  if (busyTaskId.value !== null || store.submitting) return
  feedback.value = null
  actionError.value = null
  pendingPermanent.value = record
}

async function confirmPermanent(): Promise<void> {
  const record = pendingPermanent.value
  if (record === null) return
  const position = entryPosition(record.task.id)
  busyTaskId.value = record.task.id
  const result = await store.confirmPermanentDelete()
  busyTaskId.value = null
  if (result.status === 'accepted') {
    pendingPermanent.value = null
    await store.waitForSnapshot(store.revision ?? '0')
    feedback.value = { tone: 'success', text: 'Exclusão definitiva concluída; esta ação não tem desfazer.' }
    await focusAfterRemoval(position)
    return
  }
  pendingPermanent.value = null
  actionError.value = resultText(result)
  await nextTick()
  if (!focusEntryControl(record.task.id, 'permanent')) backButton.value?.focus()
}

function abandonPermanent(): void {
  const record = pendingPermanent.value
  pendingPermanent.value = null
  void nextTick(() => {
    if (record !== null && !focusEntryControl(record.task.id, 'permanent')) backButton.value?.focus()
  })
}

async function requestEmpty(): Promise<void> {
  if (busyTaskId.value !== null || store.submitting || entries.value.length === 0) return
  feedback.value = null
  actionError.value = null
  const result = await store.requestEmptyTrash()
  if (result.status === 'confirmation') {
    pendingEmpty.value = true
    return
  }
  actionError.value = resultText(result)
}

async function confirmEmpty(): Promise<void> {
  busyTaskId.value = 'empty'
  const result = await store.confirmEmptyTrash()
  busyTaskId.value = null
  pendingEmpty.value = false
  if (result.status === 'accepted') {
    await store.waitForSnapshot(store.revision ?? '0')
    feedback.value = { tone: 'success', text: `Lixeira esvaziada (${result.removedCount ?? 0} itens). Esta ação não tem desfazer.` }
    backButton.value?.focus()
    return
  }
  actionError.value = resultText(result)
  await nextTick()
  emptyAlert.value?.focus()
}

function abandonEmpty(): void {
  pendingEmpty.value = false
  void nextTick(() => emptyButton.value?.focus())
}

async function retryMaintenance(): Promise<void> {
  const result = await store.runTrashMaintenance()
  if (result.status !== 'accepted') actionError.value = resultText(result)
}

function back(): void {
  void store.leaveTrash()
  emit('back')
}
</script>

<template>
  <section class="trash-manager">
    <header class="trash-header">
      <h1>Lixeira</h1>
      <button
        ref="backButton"
        type="button"
        class="button-secondary"
        data-action="back"
        @click="back"
      >
        Voltar
      </button>
    </header>

    <p class="trash-policy">
      Itens ficam recuperáveis por <strong>30 dias</strong>; a lixeira mantém até <strong>100</strong> entradas.
      Descartados por idade, limite, substituição ou relógio ajustado não têm desfazer. Exclusão definitiva e
      esvaziamento são irreversíveis (remoção lógica, sem promessa de apagar cópias de backup).
    </p>

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
      v-if="store.trashPresentation === 'loading'"
      class="state"
      role="status"
    >
      Carregando lixeira…
    </section>

    <section
      v-else-if="store.trashPresentation === 'blocked'"
      class="state state-error"
      role="alert"
    >
      <p>{{ blockedText(store.initialError ?? 'STORAGE_UNAVAILABLE') }} Nenhum dado foi redefinido.</p>
      <button
        type="button"
        class="button-secondary"
        @click="retryMaintenance"
      >
        Tentar novamente
      </button>
    </section>

    <section
      v-else-if="store.trashPresentation === 'stale'"
      class="state state-warning"
      role="status"
    >
      <p>A lixeira pode estar desatualizada. As ações ficam bloqueadas até a reconciliação.</p>
      <button
        type="button"
        class="button-secondary"
        @click="retryMaintenance"
      >
        Tentar novamente
      </button>
    </section>

    <section
      v-else-if="store.trashPresentation === 'maintenance-failed'"
      class="state state-error"
      role="alert"
    >
      <p>Não foi possível concluir a manutenção da lixeira; a lista exibida pode estar incompleta.</p>
      <button
        type="button"
        class="button-secondary"
        @click="retryMaintenance"
      >
        Tentar novamente
      </button>
    </section>

    <template v-else>
      <div class="trash-actions">
        <button
          ref="emptyButton"
          type="button"
          class="button-danger"
          data-action="empty"
          :aria-disabled="emptyDisabled ? 'true' : undefined"
          @click="requestEmpty"
        >
          Esvaziar lixeira
        </button>
      </div>

      <section
        v-if="entries.length === 0"
        class="state"
      >
        <h2>Lixeira vazia</h2>
        <p>Nenhuma tarefa excluída está aguardando recuperação.</p>
      </section>

      <ul
        v-else
        ref="listElement"
        class="trash-list"
      >
        <li
          v-for="record in entries"
          :key="record.task.id"
          class="trash-item"
          :data-trash-id="record.task.id"
        >
          <h2>{{ record.task.title }}</h2>
          <p class="trash-date">
            Excluída em <time :datetime="record.deletedAt">{{ formatDateTime(record.deletedAt) }}</time>
          </p>
          <div class="trash-item-actions">
            <button
              type="button"
              class="button-small"
              data-action="restore"
              :aria-disabled="busyTaskId === record.task.id ? 'true' : undefined"
              @click="restore(record)"
            >
              Restaurar<span class="visually-hidden"> {{ record.task.title }}</span>
            </button>
            <button
              type="button"
              class="button-small button-danger"
              data-action="permanent"
              :aria-disabled="busyTaskId === record.task.id ? 'true' : undefined"
              @click="requestPermanent(record)"
            >
              Excluir definitivamente<span class="visually-hidden"> {{ record.task.title }}</span>
            </button>
          </div>
        </li>
      </ul>
    </template>

    <section
      v-if="pendingPermanent !== null"
      ref="confirmPanel"
      class="state state-warning"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      :aria-label="`Excluir definitivamente ${pendingPermanent.task.title}`"
      @keydown.esc="abandonPermanent"
    >
      <h2>Excluir definitivamente?</h2>
      <p>
        “{{ pendingPermanent.task.title }}” será removida logicamente do aplicativo. Esta ação é
        irreversível e não oferece desfazer; cópias de backup não são apagadas.
      </p>
      <div class="state-actions">
        <button
          type="button"
          class="button-danger"
          :aria-disabled="store.submitting ? 'true' : undefined"
          @click="confirmPermanent"
        >
          Excluir definitivamente
        </button>
        <button
          type="button"
          class="button-secondary"
          @click="abandonPermanent"
        >
          Cancelar
        </button>
      </div>
    </section>

    <section
      v-if="pendingEmpty"
      ref="confirmPanel"
      class="state state-warning"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-label="Esvaziar lixeira"
      @keydown.esc="abandonEmpty"
    >
      <h2>Esvaziar a lixeira?</h2>
      <p>
        As {{ entries.length }} entradas atuais serão removidas logicamente. A operação é irreversível
        e não oferece desfazer. Se a lixeira mudar até a confirmação, nada será apagado e a lista
        precisará ser revista.
      </p>
      <div class="state-actions">
        <button
          type="button"
          class="button-danger"
          :aria-disabled="store.submitting ? 'true' : undefined"
          @click="confirmEmpty"
        >
          Esvaziar lixeira
        </button>
        <button
          type="button"
          class="button-secondary"
          @click="abandonEmpty"
        >
          Cancelar
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.trash-manager {
  display: grid;
  gap: 1rem;
  align-content: start;
}

.trash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.trash-header h1 {
  margin: 0;
  font-size: 1.35rem;
}

.trash-policy {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}

.trash-actions {
  display: flex;
  justify-content: flex-end;
}

.trash-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trash-item {
  display: grid;
  gap: 0.4rem;
  padding: 0.9rem;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-border-strong);
  border-radius: 0.8rem;
  background: var(--color-surface);
}

.trash-item h2 {
  margin: 0;
  font-size: 0.98rem;
  overflow-wrap: anywhere;
}

.trash-date {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.trash-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
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
.state p {
  margin: 0;
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

.button-danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.live-region:empty {
  position: absolute;
}
</style>
