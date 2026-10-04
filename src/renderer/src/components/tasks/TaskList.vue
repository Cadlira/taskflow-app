<script setup lang="ts">
// Lista fina: cada cartão é um componente persistente por tarefa (`TaskCard`). Reordenar/filtrar
// apenas move os nós com props inalteradas — sem re-render por cartão, sem truncar nem virtualizar.
import { ref } from 'vue'
import type { Task, TaskStatus } from '../../../../domain/task.js'
import TaskCard from './TaskCard.vue'
import type { StatusChangeOrigin } from './task-status-origin.js'

const props = defineProps<{
  tasks: readonly Task[]
  now: Date
  busyTaskId?: string | null
}>()

const emit = defineEmits<{
  edit: [task: Task]
  'change-status': [task: Task, status: TaskStatus, origin: StatusChangeOrigin]
}>()

const listElement = ref<HTMLUListElement | null>(null)

/** Foca o controle `action` do cartão `taskId`; IDs históricos hostis não interpolam seletor. */
function focusControl(taskId: string, action: string): boolean {
  const items = listElement.value?.querySelectorAll<HTMLElement>('[data-task-id]')
  if (!items) return false
  for (const item of items) {
    if (item.dataset['taskId'] !== taskId) continue
    const control = item.querySelector<HTMLElement>(`[data-action="${action}"]`)
    if (!control) return false
    control.focus()
    return true
  }
  return false
}

/**
 * Descarta a escolha pendente do seletor sem gravar. O cartão já limpa o estado quando a ação
 * entra em andamento; aqui apenas garantimos o valor exibido do seletor.
 */
function resetStatus(taskId: string): void {
  const items = listElement.value?.querySelectorAll<HTMLElement>('[data-task-id]')
  if (!items) return
  for (const item of items) {
    if (item.dataset['taskId'] !== taskId) continue
    const select = item.querySelector<HTMLSelectElement>('select[data-action="status"]')
    const task = props.tasks.find((candidate) => candidate.id === taskId)
    if (select !== null && task !== undefined) select.value = task.status
    return
  }
}

defineExpose({ focusControl, resetStatus })

function forwardEdit(task: Task): void {
  emit('edit', task)
}

function forwardChangeStatus(task: Task, status: TaskStatus, origin: StatusChangeOrigin): void {
  emit('change-status', task, status, origin)
}
</script>

<template>
  <ul
    ref="listElement"
    class="task-list"
  >
    <TaskCard
      v-for="task in tasks"
      :key="task.id"
      :task="task"
      :now="now"
      :busy="task.id === busyTaskId"
      @edit="forwardEdit"
      @change-status="forwardChangeStatus"
    />
  </ul>
</template>

<style scoped>
.task-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
