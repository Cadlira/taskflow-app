<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { AiBlockCode, AiErrorCode, AiFailureReason, AiProviderStatus, PreparedAiSuggestion } from '../../../../contracts/ai.js'
import { MAX_SUBTASKS } from '../../../../domain/task-subtasks.js'
import { aiBlockLabel, aiErrorLabel, aiReasonLabel } from './ai-labels.js'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    existingSubtaskCount: number
    /** Salvamento em andamento: a ação de IA fica indisponível. */
    saving?: boolean
  }>(),
  { saving: false },
)

const emit = defineEmits<{ accept: [drafts: { title: string }[]] }>()

type Stage = 'idle' | 'preview' | 'running' | 'proposal'

const provider = ref<AiProviderStatus | null>(null)
const stage = ref<Stage>('idle')
const prepared = ref<PreparedAiSuggestion | null>(null)
const proposal = ref<{ items: { title: string; selected: boolean }[]; discardedByLimit: boolean } | null>(null)
const message = ref('')
const busy = ref(false)
const cancelledNotice = ref(false)

/** Disponível somente com provedor configurado; nenhum elemento é apresentado antes disso. */
const available = computed(() => provider.value?.state === 'CONFIGURED')
const slotsFull = computed(() => props.existingSubtaskCount >= MAX_SUBTASKS)
const titleMissing = computed(() => props.title.trim() === '')

const disabledReason = computed(() => {
  if (provider.value?.state === 'BLOCKED') return aiBlockLabel(provider.value.blocked)
  if (!available.value) return ''
  if (props.saving) return 'Aguarde o salvamento da tarefa.'
  if (titleMissing.value) return 'Informe o título da tarefa para sugerir subtarefas.'
  if (slotsFull.value) return 'A tarefa já tem o máximo de subtarefas.'
  return ''
})
const actionDisabled = computed(() => disabledReason.value !== '' || busy.value || stage.value === 'running')

function describe(result: { code: AiErrorCode; blocked?: AiBlockCode; reason?: AiFailureReason; statusCode?: number }): string {
  if (result.blocked !== undefined) return aiBlockLabel(result.blocked)
  const base = aiErrorLabel(result.code)
  const reason = result.reason === undefined ? '' : ` ${aiReasonLabel(result.reason)}`
  const http = result.statusCode === undefined ? '' : ` (HTTP ${result.statusCode})`
  return `${base}${reason}${http}`
}

function reset(clearMessage = true): void {
  stage.value = 'idle'
  prepared.value = null
  proposal.value = null
  busy.value = false
  if (clearMessage) message.value = ''
}

async function readStatus(): Promise<void> {
  try {
    const result = await window.taskflowDesktop.getAiProviderStatus({ version: 1 })
    provider.value = result.status === 'ok' ? result.provider : null
  } catch {
    provider.value = null
  }
}

async function prepare(): Promise<void> {
  if (actionDisabled.value) return
  busy.value = true
  message.value = ''
  cancelledNotice.value = false
  proposal.value = null
  try {
    const result = await window.taskflowDesktop.prepareAiSuggestion({
      version: 1,
      title: props.title,
      description: props.description,
      existingSubtaskCount: props.existingSubtaskCount,
    })
    if (result.status === 'ok') {
      prepared.value = result.prepared
      stage.value = 'preview'
    } else {
      prepared.value = null
      stage.value = 'idle'
      message.value = describe(result)
      if (result.code === 'NOT_CONFIGURED' || result.code === 'BLOCKED') await readStatus()
    }
  } catch {
    message.value = 'A prévia não foi confirmada. Nada foi enviado.'
  } finally {
    busy.value = false
  }
}

async function send(): Promise<void> {
  const current = prepared.value
  if (busy.value || stage.value === 'running' || current === null) return
  busy.value = true
  message.value = ''
  try {
    if (current.consentRequired) {
      const consent = await window.taskflowDesktop.authorizeAiUse({ version: 1, scope: 'CONTENT', requestId: current.requestId })
      if (consent.status !== 'ok') {
        message.value = describe(consent)
        await readStatus()
        return
      }
    }
    stage.value = 'running'
    const result = await window.taskflowDesktop.suggestAiSubtasks({ version: 1, requestId: current.requestId })
    if (result.status === 'ok') {
      proposal.value = {
        items: result.proposal.drafts.map((draft) => ({ title: draft.title, selected: true })),
        discardedByLimit: result.proposal.discardedByLimit,
      }
      prepared.value = null
      stage.value = 'proposal'
    } else if (result.code === 'BUSY') {
      // A prévia é conservada; o pedido em voo precisa terminar antes de novo envio.
      stage.value = 'preview'
      message.value = describe(result)
    } else if (result.code === 'CANCELLED' || result.code === 'DISCARDED' || result.code === 'SESSION_CLOSED') {
      reset(false)
      cancelledNotice.value = true
      message.value = describe(result)
    } else {
      reset(false)
      message.value = describe(result)
      if (result.code === 'NOT_CONFIGURED' || result.code === 'BLOCKED') await readStatus()
    }
  } catch {
    reset(false)
    message.value = 'O resultado da sugestão não foi confirmado. O formulário não foi alterado.'
  } finally {
    busy.value = false
  }
}

async function cancel(): Promise<void> {
  const current = prepared.value
  const running = stage.value === 'running'
  if (running && current === null) return

  // Em qualquer estágio o `requestId` preparado é invalidado no main; nada é entregue depois.
  if (current !== null) {
    try {
      await window.taskflowDesktop.cancelAiSuggestion({ version: 1, requestId: current.requestId })
    } catch {
      // O cancelamento local segue valendo: a resposta tardia é descartada pelo main.
    }
  }
  reset(false)
  cancelledNotice.value = true
  message.value = running ? 'Sugestão cancelada; o formulário permanece como estava.' : 'Prévia descartada; nada foi enviado.'
}

function accept(): void {
  const current = proposal.value
  if (current === null || props.saving) return
  const drafts = current.items
    .filter((item) => item.selected && item.title.trim() !== '')
    .slice(0, Math.max(0, MAX_SUBTASKS - props.existingSubtaskCount))
    .map((item) => ({ title: item.title.trim() }))
  if (drafts.length === 0) {
    message.value = 'Selecione ao menos um item com título.'
    return
  }
  emit('accept', drafts)
  reset()
  message.value = 'Itens adicionados à lista do formulário. Salve para gravar; desfazer segue disponível.'
}

function discardProposal(): void {
  reset(false)
  message.value = 'Proposta descartada; a lista do formulário permanece como estava.'
}

// Qualquer edição de título/descrição depois da prévia invalida o pedido preparado.
watch(
  () => [props.title, props.description],
  () => {
    if (stage.value === 'preview') {
      prepared.value = null
      stage.value = 'idle'
      message.value = 'O conteúdo mudou; prepare novamente para revisar o que será enviado.'
    }
  },
)

onMounted(() => {
  void readStatus()
})

defineExpose({ stage, prepared, proposal })
</script>

<template>
  <section
    v-if="available"
    class="ai-suggestion"
    :aria-labelledby="'ai-suggestion-title'"
  >
    <h3 id="ai-suggestion-title">
      Sugerir subtarefas com IA
    </h3>
    <p class="field-hint">
      Opcional. O provedor recebe somente o título e a descrição atuais, depois da sua conferência.
    </p>

    <template v-if="stage === 'idle'">
      <button
        type="button"
        class="button-secondary"
        data-action="ai-suggest"
        :aria-disabled="actionDisabled ? 'true' : undefined"
        :aria-describedby="disabledReason ? 'ai-suggestion-reason' : undefined"
        @click="prepare"
      >
        Sugerir subtarefas
      </button>
      <p
        v-if="disabledReason"
        id="ai-suggestion-reason"
        class="field-hint"
        data-test="ai-disabled-reason"
      >
        {{ disabledReason }}
      </p>
    </template>

    <template v-else-if="stage === 'preview' && prepared">
      <p>Será enviado exatamente este conteúdo:</p>
      <pre
        class="ai-preview"
        data-test="ai-preview"
      >{{ prepared.content }}</pre>
      <p class="field-hint">
        Destino: <strong>{{ prepared.origin }}</strong>
      </p>
      <p
        v-if="prepared.descriptionTruncated"
        class="field-hint"
        data-test="ai-truncated"
      >
        A descrição excedeu 1.000 caracteres e foi cortada antes da prévia.
      </p>
      <p
        v-if="prepared.consentRequired"
        class="field-hint"
        data-test="ai-consent-hint"
      >
        Enviar o título e a descrição a essa origem exige a sua autorização explícita.
      </p>
      <div class="form-actions">
        <button
          type="button"
          data-action="ai-send"
          :aria-disabled="busy ? 'true' : undefined"
          @click="send"
        >
          {{ prepared.consentRequired ? 'Autorizar e sugerir' : 'Enviar e sugerir' }}
        </button>
        <button
          type="button"
          class="button-secondary"
          data-action="ai-dismiss-preview"
          @click="cancel"
        >
          Fechar prévia
        </button>
      </div>
    </template>

    <template v-else-if="stage === 'running'">
      <p
        role="status"
        aria-live="polite"
      >
        Gerando sugestão… o pedido pode ser cancelado.
      </p>
      <button
        type="button"
        class="button-secondary"
        data-action="ai-cancel"
        @click="cancel"
      >
        Cancelar sugestão
      </button>
    </template>

    <template v-else-if="stage === 'proposal' && proposal">
      <p
        v-if="proposal.discardedByLimit"
        class="field-hint"
        data-test="ai-discarded"
      >
        Alguns itens excederam as vagas restantes e foram cortados.
      </p>
      <ul class="ai-proposal">
        <li
          v-for="(item, index) in proposal.items"
          :key="index"
          class="ai-proposal-item"
        >
          <label>
            <input
              v-model="item.selected"
              type="checkbox"
            >
            <span class="visually-hidden">Incluir o item {{ index + 1 }}</span>
          </label>
          <input
            v-model="item.title"
            type="text"
            :maxlength="200"
            :aria-label="`Título sugerido ${index + 1}`"
          >
        </li>
      </ul>
      <div class="form-actions">
        <button
          type="button"
          data-action="ai-accept"
          :aria-disabled="saving ? 'true' : undefined"
          @click="accept"
        >
          Adicionar selecionados
        </button>
        <button
          type="button"
          class="button-secondary"
          data-action="ai-discard"
          @click="discardProposal"
        >
          Descartar proposta
        </button>
      </div>
    </template>

    <p
      v-if="message"
      role="status"
      aria-live="polite"
      data-test="ai-message"
    >
      {{ message }}
    </p>
  </section>
</template>

<style scoped>
.ai-suggestion {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.8rem;
}

.ai-suggestion h3 {
  margin: 0;
  font-size: 0.9rem;
}

.ai-preview {
  margin: 0;
  padding: 0.6rem;
  max-height: 12rem;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-surface);
  font-family: inherit;
  font-size: 0.8rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ai-proposal {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ai-proposal-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
}

.ai-proposal-item input[type='text'] {
  min-width: 0;
}
</style>
