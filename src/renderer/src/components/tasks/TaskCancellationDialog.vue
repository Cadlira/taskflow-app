<script setup lang="ts">
// Diálogo acessível de escolha SKIP/END para cancelar uma ocorrência que carrega a regra.
// Nada é gravado antes da escolha; Escape ou "Voltar sem alterar" abandonam sem comando.
import { onMounted, ref, useId } from 'vue'

defineProps<{ taskTitle: string }>()

const emit = defineEmits<{
  choose: [choice: 'SKIP' | 'END']
  cancel: []
}>()

const idPrefix = useId()
const dialogElement = ref<HTMLElement | null>(null)
const firstButton = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  firstButton.value?.focus()
})

function dialogButtons(): HTMLButtonElement[] {
  return Array.from(dialogElement.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
}

/** Mantém Tab/Shift+Tab dentro do diálogo e trata Escape como abandono sem write. */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('cancel')
    return
  }
  if (event.key !== 'Tab') return

  const buttons = dialogButtons()
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (first === undefined || last === undefined) return

  const active = document.activeElement
  if (event.shiftKey) {
    if (active === first || !(active instanceof HTMLButtonElement)) {
      event.preventDefault()
      last.focus()
    }
  } else if (active === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <div class="dialog-backdrop">
    <section
      ref="dialogElement"
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${idPrefix}-title`"
      :aria-describedby="`${idPrefix}-description`"
      data-test="cancellation-dialog"
      @keydown="handleKeydown"
    >
      <h2 :id="`${idPrefix}-title`">
        Cancelar tarefa recorrente
      </h2>
      <p :id="`${idPrefix}-description`">
        “{{ taskTitle }}” é recorrente. Escolha o que acontece com as próximas ocorrências.
        Nada foi gravado ainda.
      </p>
      <div class="dialog-actions">
        <button
          ref="firstButton"
          type="button"
          @click="emit('choose', 'SKIP')"
        >
          Pular esta ocorrência
        </button>
        <button
          type="button"
          class="button-secondary"
          @click="emit('choose', 'END')"
        >
          Encerrar a série
        </button>
        <button
          type="button"
          class="button-secondary"
          @click="emit('cancel')"
        >
          Voltar sem alterar
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 45%);
}

.dialog {
  display: grid;
  gap: 0.75rem;
  width: min(32rem, 100%);
  padding: 1rem;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.dialog h2 {
  margin: 0;
  font-size: 1.05rem;
}

.dialog p {
  margin: 0;
  line-height: 1.45;
}

.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
