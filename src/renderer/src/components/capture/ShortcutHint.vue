<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { ShortcutAction } from '../../../../domain/global-shortcuts.js'
import type { DesktopSubscription } from '../../../../contracts/desktop.js'
const props = defineProps<{ action: ShortcutAction }>()
const hint = ref('')
let disposed = false, generation = 0
let subscription: DesktopSubscription | undefined
async function read(): Promise<void> {
  const current = ++generation
  try {
    const result = await window.taskflowDesktop.getShortcutSettings({ version: 1 })
    if (disposed || current !== generation) return
    const observed = result.status === 'ok' ? result.settings.actions.find(item => item.action === props.action) : undefined
    hint.value = observed?.observed === 'REGISTERED' && observed.desired ?
      `${observed.desired.modifiers === 'CTRL_SHIFT' ? 'Ctrl+Shift' : 'Alt+Shift'}+${observed.desired.key}` : ''
  } catch { if (!disposed && current === generation) hint.value = '' }
}
onMounted(async () => {
  await read()
  try {
    subscription = await window.taskflowDesktop.subscribeDesktopEvents({ version: 2 }, event => {
      if (event.kind === 'shortcuts-changed' || event.kind === 'surface-active' || event.kind === 'surface-suspended') void read()
    })
    if (disposed) subscription.dispose()
  } catch { if (!disposed) hint.value = '' }
})
onBeforeUnmount(() => { disposed = true; generation++; subscription?.dispose() })
</script>

<template>
  <span
    v-if="hint"
    class="shortcut-hint"
    aria-label="Atalho global registrado"
  > · {{ hint }}</span>
</template>

<style scoped>
.shortcut-hint { font-size: .85em; font-weight: normal; white-space: nowrap; }
</style>
