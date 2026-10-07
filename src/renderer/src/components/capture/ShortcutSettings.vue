<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { ShortcutSettings } from '../../../../contracts/capture-shortcuts.js'
import type { DesktopSubscription } from '../../../../contracts/desktop.js'
import { defaultShortcutActions, SHORTCUT_ACTIONS } from '../../../../domain/global-shortcuts.js'
import type { ShortcutAction, ShortcutCombination } from '../../../../domain/global-shortcuts.js'
import { useTasksStore } from '../../stores/tasks.js'

const store = useTasksStore()
const settings = ref<ShortcutSettings | null>(null)
const busy = ref(false)
const message = ref('')
const panel = ref<HTMLElement | null>(null)
const drafts = ref<Record<ShortcutAction, { enabled: boolean; modifiers: ShortcutCombination['modifiers']; key: string }>>({
  QUICK_ADD: { enabled: true, modifiers: 'CTRL_SHIFT', key: 'K' },
  OPEN_TASK_MANAGER: { enabled: true, modifiers: 'CTRL_SHIFT', key: 'L' },
  CAPTURE_CLIPBOARD: { enabled: false, modifiers: 'CTRL_SHIFT', key: 'C' },
})
const labels: Record<ShortcutAction, string> = { QUICK_ADD: 'Adicionar tarefa', OPEN_TASK_MANAGER: 'Abrir gerenciamento', CAPTURE_CLIPBOARD: 'Capturar texto copiado' }
const observations = { REGISTERED: 'Registro próprio confirmado', NONE: 'Desativado', UNAVAILABLE: 'Indisponível ou pausado', UNKNOWN: 'Estado não confirmado' }
const reasons = { CONFLICT: 'Combinação indisponível no Windows', NATIVE_FAILURE: 'Falha de registro nativo', PREFERENCES_INVALID: 'Arquivo de preferências incompatível ou ilegível', PROFILE_DISABLED: 'Registro automático desativado neste perfil', SUSPENDED: 'Pausa temporária de edição ou energia' }
const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`).filter(key => key !== 'F4')]
let subscription: DesktopSubscription | undefined, disposed = false
let latestRead = 0
async function read(resetDrafts = false): Promise<void> {
  const generation = ++latestRead
  try {
    const result = await window.taskflowDesktop.getShortcutSettings({ version: 1 })
    if (disposed || generation !== latestRead) return
    if (result.status !== 'ok') { message.value = 'As preferências não puderam ser consultadas.'; return }
    settings.value = result.settings
    if (resetDrafts) for (const item of result.settings.actions) {
      drafts.value[item.action] = { enabled: item.desired !== null, modifiers: item.desired?.modifiers ?? 'CTRL_SHIFT', key: item.desired?.key ?? (item.action === 'QUICK_ADD' ? 'K' : item.action === 'OPEN_TASK_MANAGER' ? 'L' : 'C') }
    }
  } catch { if (!disposed) message.value = 'A consulta não foi confirmada.' }
}
async function lease(editing: boolean): Promise<void> {
  try { const result = await window.taskflowDesktop.setShortcutEditing({ version: 1, editing }); if (editing && result.status !== 'ok') message.value = 'A pausa dos atalhos não foi confirmada. Use os seletores e consulte o estado.' }
  catch { if (!disposed) message.value = 'A pausa dos atalhos não foi confirmada.' }
}
function focusout(event: FocusEvent): void { if (!(event.relatedTarget instanceof Node) || !panel.value?.contains(event.relatedTarget)) void lease(false) }
async function set(action: ShortcutAction, mode: 'save' | 'default' | 'reconcile' = 'save'): Promise<void> {
  if (busy.value || !settings.value || store.surfaceSuspended || (mode !== 'reconcile' && settings.value.settersBlocked)) return
  const current = settings.value.actions.find(item => item.action === action)
  if (!current) return
  const draft = drafts.value[action]
  const combination = mode === 'reconcile' ? current.desired : mode === 'default' ? defaultShortcutActions()[action] :
    draft.enabled ? { modifiers: draft.modifiers, key: draft.key } : null
  busy.value = true; message.value = ''
  try {
    const result = await window.taskflowDesktop.setShortcut({ version: 1, action, combination, expectedConfigRevision: settings.value.configRevision })
    if (disposed) return
    if (result.status === 'ok') { settings.value = result.settings; message.value = 'Preferência e registro consultados. Confira a observação da ação.'; await read(true) }
    else message.value = result.code === 'STALE_SETTINGS' ? 'A configuração mudou. Consulte e revise antes de enviar novamente.' : result.code === 'UNKNOWN' ? 'Estado incerto. Consulte e use Reconciliar explicitamente.' : 'A alteração não foi confirmada. Sua seleção foi conservada.'
  } catch { if (!disposed) message.value = 'Resultado desconhecido. Consulte antes de decidir alterar novamente.' }
  finally { busy.value = false; if (!disposed) await read() }
}
onMounted(async () => {
  await read(true)
  try {
    subscription = await window.taskflowDesktop.subscribeDesktopEvents({ version: 2 }, event => {
      if (event.kind === 'shortcuts-changed' || event.kind === 'surface-active') void read()
    })
    if (disposed) subscription.dispose()
  } catch { if (!disposed) message.value = 'Atualizações de atalhos indisponíveis; consulte manualmente.' }
})
onBeforeUnmount(() => { disposed = true; latestRead++; subscription?.dispose(); void lease(false) })
</script>

<template>
  <details class="diagnostic-section">
    <summary>Atalhos globais</summary>
    <section
      ref="panel"
      class="diagnostic-panel"
      aria-label="Configuração de atalhos"
      :aria-busy="busy"
      @focusin="lease(true)"
      @focusout="focusout"
    >
      <p>As ações globais pausam enquanto esta configuração está focada. Uma combinação desejada só fica disponível após confirmação do registro.</p>
      <p
        v-if="settings?.settersBlocked"
        role="alert"
      >
        As gravações estão bloqueadas. Consulte o estado; preferências futuras ou corrompidas exigem recuperação manual.
      </p>
      <fieldset
        v-for="action in SHORTCUT_ACTIONS"
        :key="action"
        :aria-disabled="busy || store.surfaceSuspended"
      >
        <legend>{{ labels[action] }}</legend>
        <p
          v-for="item in settings?.actions.filter(item => item.action === action)"
          :key="item.action"
          role="status"
        >
          Desejado: {{ item.reason === 'PREFERENCES_INVALID' ? 'não confirmado' : item.desired ? `${item.desired.modifiers === 'CTRL_SHIFT' ? 'Ctrl+Shift' : 'Alt+Shift'}+${item.desired.key}` : 'nenhum' }}.
          {{ observations[item.observed] }}{{ item.reason ? `: ${reasons[item.reason]}` : '' }}.
        </p>
        <label><input
          v-model="drafts[action].enabled"
          type="checkbox"
        > Ativar combinação</label>
        <label>Modificadores <select
          v-model="drafts[action].modifiers"
          :disabled="!drafts[action].enabled"
        ><option value="CTRL_SHIFT">Ctrl + Shift</option><option value="ALT_SHIFT">Alt + Shift</option></select></label>
        <label>Tecla <select
          v-model="drafts[action].key"
          :disabled="!drafts[action].enabled"
        ><option
          v-for="key in keys"
          :key="key"
          :value="key"
        >{{ key }}</option></select></label>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy || store.surfaceSuspended || settings?.settersBlocked"
          @click="set(action)"
        >
          Salvar atalho
        </button>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy || store.surfaceSuspended || settings?.settersBlocked"
          @click="set(action, 'default')"
        >
          Restaurar padrão
        </button>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy || store.surfaceSuspended"
          @click="set(action, 'reconcile')"
        >
          Reconciliar registro
        </button>
      </fieldset>
      <button
        type="button"
        class="button-secondary"
        :aria-disabled="busy || store.surfaceSuspended"
        @click="!busy && !store.surfaceSuspended && read()"
      >
        Consultar atalhos
      </button>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ message }}
      </p>
    </section>
  </details>
</template>

<style scoped>
fieldset { display: grid; gap: .75rem; min-width: 0; margin-block: 1rem; }
label { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
select { max-width: 100%; }
</style>
