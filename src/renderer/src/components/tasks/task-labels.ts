// Subconjunto revisado de taskflow-extension@a763e7a src/components/tasks/task-labels.ts
// (MIT, mesmo autor). Sem rótulos de recorrência mutável, lembretes, IA ou unidades.
import type { TaskPriority, TaskStatus } from '../../../../domain/task.js'
import type { DueSituation, TaskSortKey } from '../../../../domain/task-queries.js'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'A fazer',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
}

export const DUE_SITUATION_LABELS: Record<DueSituation, string> = {
  OVERDUE: 'Atrasada',
  DUE_SOON: 'Vence em até 24 h',
}

export const SORT_LABELS: Record<TaskSortKey, string> = {
  DUE_DATE: 'Prazo',
  PRIORITY: 'Prioridade',
  STATUS: 'Status',
}

/** Nome do controle que expande as subtarefas no cartão. */
export const SUBTASKS_TOGGLE_LABEL = 'Subtarefas'

/** Progresso textual das subtarefas, por exemplo "2 de 5". */
export function subtaskProgressLabel(done: number, total: number): string {
  return `${done} de ${total}`
}

export const RECURRENCE_READONLY_LABEL =
  'Tarefa recorrente: a edição de recorrência e ocorrências chega em uma atualização futura. Esta tarefa está em somente leitura.'

export const SUBTASKS_READONLY_LABEL =
  'Subtarefas existentes (somente leitura nesta versão). A edição de subtarefas chega em uma atualização futura.'

export const REMINDERS_RESTRICTED_HINT =
  'Esta tarefa tem lembretes: nesta versão, prazo e status não podem ser alterados. Outros campos podem ser editados normalmente.'

/** Mensagens pt-BR dos códigos finitos de erro por campo. */
export function fieldErrorMessage(field: string, code: string): string {
  const label = FIELD_LABELS[field] ?? 'Campo'
  switch (code) {
    case 'REQUIRED':
      return `Informe ${label}.`
    case 'TOO_LONG':
      return `${capitalize(label)} excede o tamanho máximo permitido.`
    case 'TOO_MANY':
      return `Informe no máximo ${field === 'tags' ? '10 tags distintas' : 'o limite permitido'}.`
    case 'INVALID_DATE':
      return 'Informe uma data e hora válidas.'
    case 'INVALID_URL':
      return 'Informe uma URL válida iniciada por http:// ou https://.'
    default:
      return `Valor inválido em ${label}.`
  }
}

const FIELD_LABELS: Record<string, string> = {
  title: 'um título',
  description: 'a descrição',
  requester: 'o solicitante',
  assignee: 'o responsável',
  status: 'um status',
  priority: 'uma prioridade',
  dueAt: 'um prazo',
  tags: 'tags',
  sourceUrl: 'uma URL de origem',
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}
