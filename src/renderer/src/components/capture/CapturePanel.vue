<script setup lang="ts">
import type { CaptureReview } from '../../../../application/capture/capture-review.js'
import type { CaptureView } from './use-capture-review.js'
import ShortcutHint from './ShortcutHint.vue'
withDefaults(defineProps<{ state: CaptureView; review: CaptureReview; canReview: boolean; inactive?: boolean }>(), { inactive: false })
</script>

<template>
  <section
    class="capture-panel"
    aria-label="Captura de texto copiado"
    :aria-busy="state.busy"
  >
    <button
      type="button"
      class="button-secondary"
      :disabled="state.busy || inactive"
      @click="review.capture()"
    >
      {{ state.busy ? 'Confirmando captura…' : 'Capturar texto copiado' }}
      <ShortcutHint action="CAPTURE_CLIPBOARD" />
    </button>
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ state.message }}
    </p>
    <div
      v-if="state.offer"
      class="capture-offer"
    >
      <h2>Captura para revisar</h2>
      <p>{{ state.offer.capture.draft.title || 'Endereço copiado — informe um título' }}</p>
      <p
        v-if="state.offer.capture.draft.description"
        class="capture-text"
      >
        {{ state.offer.capture.draft.description }}
      </p>
      <p
        v-if="state.offer.capture.draft.sourceUrl"
        class="capture-source"
      >
        {{ state.offer.capture.draft.sourceUrl }}
      </p>
      <p v-if="state.offer.capture.draft.flags.titleTruncated || state.offer.capture.draft.flags.descriptionTruncated">
        O texto foi cortado no limite dos campos.
      </p>
      <p v-if="state.offer.capture.draft.flags.sourceOpeningLimited">
        Origem longa conservada; abertura externa indisponível.
      </p>
      <p v-if="!canReview">
        Conclua ou cancele o formulário atual antes de revisar. Seus campos serão conservados.
      </p>
      <button
        type="button"
        class="button-secondary"
        :disabled="state.busy || inactive || !canReview"
        @click="review.review()"
      >
        Revisar captura
      </button>
      <button
        type="button"
        class="button-secondary"
        :disabled="state.busy || inactive"
        @click="review.discard()"
      >
        Descartar captura
      </button>
      <button
        type="button"
        class="button-secondary"
        :disabled="state.busy || inactive"
        @click="review.refresh()"
      >
        Consultar captura
      </button>
    </div>
  </section>
</template>

<style scoped>
.capture-panel { margin-block: 1rem; }
.capture-offer { border: 1px solid var(--border-color, #cbd5e1); border-radius: .75rem; padding: 1rem; }
.capture-source, .capture-text { overflow-wrap: anywhere; white-space: pre-wrap; max-height: 10rem; overflow: auto; }
.capture-panel button { margin: .25rem .5rem .25rem 0; }
</style>
