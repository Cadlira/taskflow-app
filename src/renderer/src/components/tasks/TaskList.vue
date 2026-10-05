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
  'toggle-subtask': [task: Task, subtaskId: string, done: boolean]
}>()

interface TaskCardHandle {
  resetStatus(): void
}

const listElement = ref<HTMLUListElement | null>(null)
const cardRefs = ref<Array<TaskCardHandle | null>>([])

/** Ref de função por índice: o cartão expõe `resetStatus` para descartar escolha pendente. */
function assignCard(index: number, element: unknown): void {
  cardRefs.value[index] = element as TaskCardHandle | null
}

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

/** Foca o checkbox da subtarefa `subtaskId` no cartão `taskId`, sem interpolar o ID em seletor. */
function focusSubtask(taskId: string, subtaskId: string): boolean {
  const items = listElement.value?.querySelectorAll<HTMLElement>('[data-task-id]')
  if (!items) return false
  for (const item of items) {
    if (item.dataset['taskId'] !== taskId) continue
    for (const checkbox of item.querySelectorAll<HTMLInputElement>('input[data-subtask-id]')) {
      if (checkbox.dataset['subtaskId'] !== subtaskId) continue
      checkbox.focus()
      return true
    }
    return false
  }
  return false
}

/**
 * Descarta a escolha pendente do seletor sem gravar, delegando ao cartão (que limpa o estado
 * interno). O valor exibido é restaurado a partir da tarefa atual.
 */
function resetStatus(taskId: string): void {
  const index = props.tasks.findIndex((task) => task.id === taskId)
  const card = index >= 0 ? cardRefs.value[index] : null
  if (card !== undefined && card !== null) {
    card.resetStatus()
    return
  }

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

defineExpose({ focusControl, focusSubtask, resetStatus })

function forwardEdit(task: Task): void {
  emit('edit', task)
}

function forwardChangeStatus(task: Task, status: TaskStatus, origin: StatusChangeOrigin): void {
  emit('change-status', task, status, origin)
}

function forwardToggleSubtask(task: Task, subtaskId: string, done: boolean): void {
  emit('toggle-subtask', task, subtaskId, done)
}
</script>

<template>
  <ul
    ref="listElement"
    class="task-list"
  >
    <TaskCard
      v-for="(task, index) in tasks"
      :key="task.id"
      :ref="(element) => assignCard(index, element)"
      :task="task"
      :now="now"
      :busy="task.id === busyTaskId"
      @edit="forwardEdit"
      @change-status="forwardChangeStatus"
      @toggle-subtask="forwardToggleSubtask"
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
