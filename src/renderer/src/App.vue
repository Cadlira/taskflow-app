<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useFoundationStore } from './stores/foundation'

const store = useFoundationStore()
const { state, diagnostic, isRunning } = storeToRefs(store)
</script>

<template>
  <main class="shell">
    <header class="brand">
      <span
        class="brand-mark"
        aria-hidden="true"
      >✓</span>
      <div>
        <p class="eyebrow">
          TASKFLOW DESKTOP
        </p>
        <h1>TaskFlow App</h1>
      </div>
    </header>

    <section
      class="panel"
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
          Confirme o shell isolado e a prova local de armazenamento.
        </p>
      </div>

      <button
        class="verify-button"
        type="button"
        :disabled="isRunning"
        @click="store.verify"
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

    <footer>Dados fictícios locais · Nenhuma conexão de rede</footer>
  </main>
</template>
