<script setup lang="ts">
import { storeToRefs } from 'pinia'
import TaskManager from './components/tasks/TaskManager.vue'
import DesktopSettings from './components/DesktopSettings.vue'
import AiProviderSettings from './components/ai/AiProviderSettings.vue'
import QuickAdd from './components/capture/QuickAdd.vue'
import ShortcutSettings from './components/capture/ShortcutSettings.vue'
import { useFoundationStore } from './stores/foundation'

const foundation = useFoundationStore()
const { state, diagnostic, isRunning } = storeToRefs(foundation)
// Facade escolhida pela entrada constante main/preload; nunca query/argv/request do renderer.
const quickAdd = typeof window.taskflowDesktop.openQuickAdd !== 'function'
</script>

<template>
  <QuickAdd v-if="quickAdd" />
  <div
    v-else
    class="app-shell"
  >
    <TaskManager />

    <details class="diagnostic-section">
      <summary>Diagnóstico da fundação</summary>
      <section
        class="diagnostic-panel"
        aria-labelledby="foundation-title"
      >
        <div>
          <p class="eyebrow">
            FUNDAÇÃO TÉCNICA
          </p>
          <h2 id="foundation-title">
            Verificação local
          </h2>
          <p class="intro">
            Confirme o shell isolado e a prova local de armazenamento. O diagnóstico é separado das tarefas.
          </p>
        </div>

        <button
          type="button"
          class="button-secondary"
          :aria-disabled="isRunning ? 'true' : undefined"
          @click="foundation.verify"
        >
          {{ isRunning ? 'Verificando…' : 'Verificar fundação' }}
        </button>

        <p
          class="status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <template v-if="state === 'idle'">
            Pronto para verificar.
          </template>
          <template v-else-if="state === 'running'">
            Verificação em andamento.
          </template>
          <template v-else-if="state === 'verified'">
            Fundação verificada neste perfil.
          </template>
          <template v-else>
            Não foi possível concluir a verificação. Nenhum dado foi redefinido.
          </template>
        </p>

        <dl
          v-if="diagnostic"
          class="diagnostic"
        >
          <div><dt>Versão do app</dt><dd>{{ diagnostic.appVersion }}</dd></div>
          <div><dt>Electron</dt><dd>{{ diagnostic.electronVersion }}</dd></div>
          <div><dt>Node embarcado</dt><dd>{{ diagnostic.nodeVersion }}</dd></div>
          <div>
            <dt>Fingerprint da prova</dt><dd class="fingerprint">
              {{ diagnostic.fingerprint }}
            </dd>
          </div>
        </dl>
      </section>
    </details>
    <DesktopSettings />
    <AiProviderSettings />
    <ShortcutSettings />
  </div>
</template>
