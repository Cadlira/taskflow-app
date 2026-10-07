<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue'
import type { AiBlockCode, AiErrorCode, AiFailureReason, AiFieldErrors, AiProviderStatus } from '../../../../contracts/ai.js'
import type { AiProvider } from '../../../../domain/ai-provider.js'
import { aiBlockLabel, aiErrorLabel, aiReasonLabel, AI_OFFICIAL_BASE_LABELS, AI_PROVIDER_LABELS } from './ai-labels.js'

const idPrefix = useId()
const status = ref<AiProviderStatus | null>(null)
const provider = ref<AiProvider>('OPENAI')
const apiBase = ref('')
const model = ref('')
const credential = ref('')
const revealCredential = ref(false)
const fieldErrors = ref<AiFieldErrors>({})
const busy = ref(false)
const message = ref('')
const probe = ref<'MODEL_LIST' | 'MINIMAL_COMPLETION'>('MODEL_LIST')
const consentNotice = ref(false)
const removeConfirm = ref(false)
const pendingPanel = ref<HTMLElement | null>(null)

const configured = computed(() => status.value?.state === 'CONFIGURED' ? status.value : null)
const blocked = computed(() => status.value?.state === 'BLOCKED' ? status.value.blocked : null)
const protectionUnavailable = computed(() => configured.value?.protection === 'UNAVAILABLE')
const hasSetters = computed(() => status.value !== null && status.value.state !== 'BLOCKED')

function fieldId(field: 'provider' | 'apiBase' | 'model' | 'credential'): string {
  return `${idPrefix}-${field}`
}

function errorText(field: 'apiBase' | 'credential' | 'model'): string | undefined {
  const code = fieldErrors.value[field]
  return code === undefined ? undefined : code
}

function describe(result: { code: AiErrorCode; blocked?: AiBlockCode; reason?: AiFailureReason; statusCode?: number }): string {
  if (result.blocked !== undefined) return aiBlockLabel(result.blocked)
  const base = aiErrorLabel(result.code)
  const reason = result.reason === undefined ? '' : ` ${aiReasonLabel(result.reason)}`
  const http = result.statusCode === undefined ? '' : ` (HTTP ${result.statusCode})`
  return `${base}${reason}${http}`
}

async function read(): Promise<void> {
  try {
    const result = await window.taskflowDesktop.getAiProviderStatus({ version: 1 })
    if (result.status !== 'ok') {
      status.value = null
      message.value = describe(result)
      return
    }
    status.value = result.provider
    if (result.provider.state === 'CONFIGURED') {
      provider.value = result.provider.summary.provider
      apiBase.value = result.provider.summary.provider === 'CUSTOM' ? result.provider.summary.apiBase : ''
      model.value = result.provider.summary.model
    }
    credential.value = ''
    removeConfirm.value = false
  } catch {
    status.value = null
    message.value = 'O resultado não foi confirmado. Consulte o estado novamente.'
  }
}

async function save(): Promise<void> {
  const current = status.value
  if (busy.value || current === null || current.state === 'BLOCKED') return
  busy.value = true
  message.value = ''
  fieldErrors.value = {}
  try {
    const result = await window.taskflowDesktop.saveAiProviderConfig({
      version: 1,
      expectedRevision: current.revision,
      provider: provider.value,
      ...(provider.value === 'CUSTOM' && { apiBase: apiBase.value }),
      ...(credential.value.trim() !== '' && { credential: credential.value }),
      model: model.value,
    })
    if (result.status === 'ok') {
      status.value = result.provider
      credential.value = ''
      message.value = 'Configuração salva com a credencial cifrada pelo Windows.'
      await read()
    } else if (result.code === 'VALIDATION_FAILED' && result.fields !== undefined) {
      fieldErrors.value = result.fields
      message.value = 'Revise os campos indicados.'
    } else {
      message.value = describe(result)
      await read()
    }
  } catch {
    message.value = 'O resultado da gravação não foi confirmado. Consulte o estado antes de repetir.'
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  if (busy.value) return
  if (!removeConfirm.value) {
    removeConfirm.value = true
    return
  }
  busy.value = true
  message.value = ''
  try {
    const result = await window.taskflowDesktop.removeAiProviderConfig({ version: 1 })
    removeConfirm.value = false
    if (result.status === 'ok') {
      status.value = result.provider
      credential.value = ''
      apiBase.value = ''
      model.value = ''
      message.value = 'Configuração removida e consentimentos revogados.'
    } else {
      message.value = describe(result)
    }
  } catch {
    message.value = 'A remoção não foi confirmada. Consulte o estado antes de repetir.'
  } finally {
    busy.value = false
  }
}

async function requestConsent(): Promise<void> {
  consentNotice.value = false
  busy.value = true
  message.value = ''
  try {
    const result = await window.taskflowDesktop.authorizeAiUse({ version: 1, scope: 'CREDENTIAL' })
    if (result.status === 'ok') message.value = 'Autorização registrada para esta origem. Use Testar conexão.'
    else message.value = describe(result)
  } catch {
    message.value = 'A autorização não foi confirmada.'
  } finally {
    busy.value = false
    await read()
  }
}

async function test(): Promise<void> {
  const current = configured.value
  if (busy.value || current === null) return
  if (!current.credentialConsent) {
    consentNotice.value = true
    void nextTick(() => pendingPanel.value?.focus())
    return
  }
  busy.value = true
  message.value = ''
  try {
    const result = await window.taskflowDesktop.testAiConnection({ version: 1, probe: probe.value })
    if (result.status === 'ok') message.value = 'Conexão confirmada; nenhum conteúdo de tarefa foi enviado.'
    else if (result.reason === 'MODEL_LIST_UNSUPPORTED') {
      message.value = 'Este endereço não oferece listagem de modelos. Use o envio mínimo explícito (ping, 1 token).'
      probe.value = 'MINIMAL_COMPLETION'
    } else message.value = describe(result)
  } catch {
    message.value = 'O teste não foi confirmado; nenhuma configuração foi alterada.'
  } finally {
    busy.value = false
    await read()
  }
}

const officialBase = computed(() => provider.value === 'OPENAI' || provider.value === 'ANTHROPIC' ? AI_OFFICIAL_BASE_LABELS[provider.value] : '')
const originBlocked = computed(() => blocked.value !== null)

onMounted(() => {
  void read()
})
</script>

<template>
  <details class="diagnostic-section">
    <summary>Assistência de IA (opcional)</summary>
    <section
      class="diagnostic-panel"
      aria-label="Configuração de provedor de IA"
      :aria-busy="busy"
    >
      <p>
        A IA é opcional e só funciona por ação sua. A credencial fica cifrada pelo Windows e nunca
        é exibida de volta. Nenhum dado de tarefa sai do dispositivo sem a sua confirmação.
      </p>

      <template v-if="originBlocked">
        <p
          role="alert"
          data-test="ai-blocked"
        >
          {{ blocked === null ? '' : aiBlockLabel(blocked) }}
        </p>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy ? 'true' : undefined"
          @click="remove"
        >
          {{ removeConfirm ? 'Confirmar remoção' : 'Remover configuração' }}
        </button>
      </template>

      <template v-else-if="hasSetters">
        <div class="field">
          <label :for="fieldId('provider')">Provedor</label>
          <select
            :id="fieldId('provider')"
            v-model="provider"
            name="aiProvider"
          >
            <option
              v-for="value in (['OPENAI', 'ANTHROPIC', 'CUSTOM'] as const)"
              :key="value"
              :value="value"
            >
              {{ AI_PROVIDER_LABELS[value] }}
            </option>
          </select>
        </div>

        <div
          v-if="provider === 'CUSTOM'"
          class="field"
        >
          <label :for="fieldId('apiBase')">Base da API</label>
          <input
            :id="fieldId('apiBase')"
            v-model="apiBase"
            name="aiApiBase"
            type="url"
            placeholder="https://gateway.exemplo/v1 ou http://localhost:11434/v1"
            :aria-invalid="Boolean(errorText('apiBase'))"
          >
          <p
            v-if="errorText('apiBase')"
            class="field-error"
          >
            {{ errorText('apiBase') }}
          </p>
        </div>
        <p
          v-else
          class="field-hint"
        >
          Base fixa: {{ officialBase }}
        </p>

        <div class="field">
          <label :for="fieldId('model')">Modelo</label>
          <input
            :id="fieldId('model')"
            v-model="model"
            name="aiModel"
            type="text"
            :aria-invalid="Boolean(errorText('model'))"
          >
          <p
            v-if="errorText('model')"
            class="field-error"
          >
            {{ errorText('model') }}
          </p>
        </div>

        <div class="field">
          <label :for="fieldId('credential')">
            Credencial
            <span
              v-if="configured?.summary.hasCredential"
              class="field-hint"
              data-test="ai-credential-saved"
            >(credencial salva; deixe em branco para mantê-la)</span>
          </label>
          <input
            :id="fieldId('credential')"
            v-model="credential"
            name="aiCredential"
            :type="revealCredential ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            :aria-invalid="Boolean(errorText('credential'))"
          >
          <label class="field-hint">
            <input
              v-model="revealCredential"
              type="checkbox"
              name="aiRevealCredential"
            >
            Mostrar credencial digitada
          </label>
          <p
            v-if="errorText('credential')"
            class="field-error"
          >
            {{ errorText('credential') }}
          </p>
        </div>

        <p
          v-if="configured"
          class="field-hint"
          data-test="ai-origin"
        >
          Origem de destino: <strong>{{ configured.summary.origin }}</strong>
        </p>
        <p
          v-if="protectionUnavailable"
          role="alert"
          data-test="ai-protection"
        >
          {{ aiBlockLabel('PROTECTION_UNAVAILABLE') }}
        </p>

        <div class="form-actions">
          <button
            type="button"
            :aria-disabled="busy || protectionUnavailable ? 'true' : undefined"
            @click="save"
          >
            {{ configured ? 'Salvar alterações' : 'Salvar configuração' }}
          </button>
          <button
            type="button"
            class="button-secondary"
            :aria-disabled="busy || configured === null || protectionUnavailable ? 'true' : undefined"
            @click="test"
          >
            Testar conexão
          </button>
          <button
            type="button"
            class="button-secondary"
            :aria-disabled="busy ? 'true' : undefined"
            @click="remove"
          >
            {{ removeConfirm ? 'Confirmar remoção' : 'Remover configuração' }}
          </button>
        </div>

        <fieldset
          v-if="configured"
          class="field"
        >
          <legend>Forma do teste</legend>
          <label class="field-hint">
            <input
              v-model="probe"
              type="radio"
              value="MODEL_LIST"
            >
            Listagem de modelos (não envia conteúdo)
          </label>
          <label class="field-hint">
            <input
              v-model="probe"
              type="radio"
              value="MINIMAL_COMPLETION"
            >
            Envio mínimo explícito (ping, 1 token)
          </label>
        </fieldset>

        <section
          v-if="consentNotice"
          ref="pendingPanel"
          class="form-notice"
          role="alert"
          tabindex="-1"
          data-test="ai-consent"
        >
          <p>
            A credencial será enviada a
            <strong>{{ configured?.summary.origin }}</strong>
            para o teste. Nenhum conteúdo de tarefa acompanha esse envio.
          </p>
          <div class="form-actions">
            <button
              type="button"
              @click="requestConsent"
            >
              Autorizar e continuar
            </button>
            <button
              type="button"
              class="button-secondary"
              @click="consentNotice = false"
            >
              Cancelar
            </button>
          </div>
        </section>

        <p
          role="status"
          aria-live="polite"
        >
          {{ message }}
        </p>
      </template>

      <p
        v-else-if="message"
        role="status"
        aria-live="polite"
      >
        {{ message }}
      </p>

      <button
        type="button"
        class="button-secondary"
        :aria-disabled="busy ? 'true' : undefined"
        @click="read"
      >
        Consultar estado
      </button>
    </section>
  </details>
</template>
