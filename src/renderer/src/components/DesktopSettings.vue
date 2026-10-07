<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { DesktopStatus, DesktopSubscription, DesktopEvent } from '../../../contracts/desktop.js'
import { useTasksStore } from '../stores/tasks.js'

const store = useTasksStore()
const status = ref<DesktopStatus | null>(null)
const busy = ref(false)
const message = ref('')
let subscription: DesktopSubscription | undefined
let disposed = false
let sequence = 0
async function read(): Promise<void> {
  try {
    const result = await window.taskflowDesktop.getDesktopStatus({ version: 2 })
    if (!disposed && result.status === 'ok' && result.desktop.surfaceSequence >= sequence) status.value = result.desktop
  } catch { if (!disposed) message.value = 'Não foi possível consultar o estado do aplicativo.' }
}
function control(event: DesktopEvent): void {
  if (disposed || event.sequence <= sequence) return
  sequence = event.sequence
  if (event.kind === 'surface-suspended') store.suspendSurface()
  else if (event.kind === 'surface-active') { void store.resumeSurface(); void read() }
  else if (event.kind === 'locate-reminder') {
    void store.resumeSurface().then(() => store.locateReminder(event.tag)).catch(() => {
      message.value = 'Não foi possível localizar o lembrete agora.'
    })
  } else void read()
}
async function setStartup(event: Event): Promise<void> {
  const desired = (event.target as HTMLInputElement).checked
  if (busy.value || status.value === null || status.value.startup === 'UNAVAILABLE' || store.surfaceSuspended) {
    ;(event.target as HTMLInputElement).checked = status.value?.startup === 'ON'; return
  }
  busy.value = true; message.value = ''
  try {
    const result = await window.taskflowDesktop.setStartAtLogin({ version: 1, desired })
    message.value = result.status === 'ok' ? 'Estado de inicialização consultado no Windows.' : 'Não foi possível confirmar a alteração. Consulte o estado novamente.'
  } catch { message.value = 'O resultado não foi confirmado. A opção será consultada novamente.' }
  finally { busy.value = false; await read(); (event.target as HTMLInputElement).checked = status.value?.startup === 'ON' }
}
async function quit(): Promise<void> {
  try { await window.taskflowDesktop.requestQuit({ version: 1 }) }
  catch { message.value = 'Não foi possível solicitar a saída agora.' }
}
onMounted(async () => {
  try {
    subscription = await window.taskflowDesktop.subscribeDesktopEvents({ version: 2 }, control)
    if (disposed) subscription.dispose()
    else await read()
  } catch { message.value = 'Controle do aplicativo indisponível. Abra a janela novamente.' }
})
onBeforeUnmount(() => { disposed = true; subscription?.dispose() })
</script>

<template>
  <details class="diagnostic-section">
    <summary>Comportamento do aplicativo</summary>
    <section
      class="diagnostic-panel"
      aria-label="Opções do aplicativo"
    >
      <p>Fechar mantém o TaskFlow na bandeja e os lembretes ativos. Para encerrar, use Sair.</p>
      <p>Ao retomar ou abrir, pendentes com até 5 minutos de atraso podem ser avisados. Com o aplicativo encerrado, computador desligado ou avisos bloqueados pelo Windows, não há garantia de aviso.</p>
      <p>Rascunho e filtros permanecem nesta execução; Sair ou falha pode perdê-los. Desfazer e prévias são descartados ao fechar.</p>
      <p
        v-if="status"
        role="status"
      >
        Lembretes: {{ status.reminderCapability === 'FAKE' ? 'modo de teste, sem avisos do Windows' : status.reminders === 'READY' ? 'ativos' : status.reminders === 'RECOVERING' ? 'reconstruindo agenda' : 'indisponíveis ou suspensos' }}.
      </p>
      <label>
        <input
          type="checkbox"
          :checked="status?.startup === 'ON'"
          :aria-disabled="busy || !status || status.startup === 'UNAVAILABLE' ? 'true' : undefined"
          @change="setStartup"
        >
        Iniciar com o usuário
      </label>
      <p v-if="status?.startup === 'DISABLED_EXTERNALLY'">
        Desativado nas opções de inicialização do Windows.
      </p>
      <p v-else-if="status?.startup === 'UNAVAILABLE'">
        Disponível na instalação de produção para este usuário.
      </p>
      <p v-else-if="status?.startup === 'UNKNOWN'">
        O estado não pôde ser confirmado. A preferência não foi repetida.
      </p>
      <p
        role="status"
        aria-live="polite"
      >
        {{ message }}
      </p>
      <button
        type="button"
        class="button-secondary"
        @click="read"
      >
        Consultar estado
      </button>
      <button
        type="button"
        class="button-secondary"
        @click="quit"
      >
        Sair
      </button>
    </section>
  </details>
</template>
