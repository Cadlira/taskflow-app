import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FoundationResult, FoundationSuccess } from '../../../contracts/foundation.js'

type FoundationState = 'idle' | 'running' | 'verified' | 'error'

export const useFoundationStore = defineStore('foundation', () => {
  const state = ref<FoundationState>('idle')
  const diagnostic = ref<FoundationSuccess | null>(null)
  const isRunning = computed(() => state.value === 'running')

  async function verify(): Promise<void> {
    if (isRunning.value) return
    state.value = 'running'
    diagnostic.value = null

    try {
      const result: FoundationResult = await window.taskflowDesktop.verifyFoundation({ version: 1 })
      if (result.status === 'verified') {
        diagnostic.value = result
        state.value = 'verified'
      } else {
        state.value = 'error'
      }
    } catch {
      state.value = 'error'
    }
  }

  return { state, diagnostic, isRunning, verify }
})
