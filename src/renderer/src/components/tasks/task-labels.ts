// Subconjunto revisado de taskflow-extension@a763e7a src/components/tasks/task-labels.ts
// (MIT, mesmo autor). Sem rótulos de lembretes mutáveis, IA ou unidades. Acrescenta rótulos e
// mensagens finitas de recorrência/subtarefas.
import type { Recurrence, RecurrenceFrequency } from '../../../../domain/task-recurrence.js'
import type { SubtaskItemErrors } from '../../../../domain/task-subtasks.js'
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

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  DAILY: 'Diariamente',
  WEEKLY: 'Semanalmente',
  MONTHLY: 'Mensalmente',
}

/** Domínio primeiro, como o calendário local da origem. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
}

export const WEEKDAY_SHORT_LABELS: Record<number, string> = {
  0: 'dom',
  1: 'seg',
  2: 'ter',
  3: 'qua',
  4: 'qui',
  5: 'sex',
  6: 'sáb',
}

/** Resumo acessível da regra de recorrência, sem horário (o prazo é exibido à parte). */
export function recurrenceSummaryLabel(recurrence: Recurrence): string {
  if (recurrence.frequency === 'DAILY') {
    return recurrence.intervalDays === 1 ? 'Diariamente' : `A cada ${recurrence.intervalDays} dias`
  }
  if (recurrence.frequency === 'WEEKLY') {
    const days = [...recurrence.weekdays].sort((left, right) => left - right)
    return `Semanalmente: ${days.map((day) => WEEKDAY_SHORT_LABELS[day] ?? String(day)).join(', ')}`
  }
  return `Mensalmente: dia ${recurrence.dayOfMonth}`
}

/** Nome do controle que remove a regra de recorrência da ocorrência portadora. */
export const REMOVE_RECURRENCE_LABEL = 'Remover recorrência'

/** Aviso exibido após pedir a retirada da regra; a retirada conserva status, prazo e lembretes. */
export const RECURRENCE_REMOVAL_HINT =
  'Remover a recorrência mantém o status, o prazo e os lembretes desta tarefa. As próximas ocorrências deixam de ser geradas.'

/** Mensagens pt-BR dos códigos finitos de erro por campo básico. */
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
    case 'DUE_REQUIRED':
      return 'Informe o prazo para usar recorrência.'
    default:
      return `Valor inválido em ${label}.`
  }
}

/** Mensagens pt-BR dos erros finitos da regra de recorrência. */
export function recurrenceErrorMessage(field: string, code: string): string {
  if (field === 'frequency') {
    if (code === 'REQUIRED') return 'Escolha a frequência da recorrência.'
    if (code === 'ABSOLUTE_REMINDER_INCOMPATIBLE') {
      return 'Esta tarefa tem lembrete em data absoluta; adicionar recorrência não é permitido.'
    }
    return 'Frequência de recorrência inválida.'
  }
  if (field === 'intervalDays') {
    if (code === 'REQUIRED') return 'Informe o intervalo em dias.'
    return 'Informe um intervalo entre 1 e 365 dias.'
  }
  if (field === 'weekdays') {
    if (code === 'REQUIRED') return 'Escolha ao menos um dia da semana.'
    return 'Escolha dias da semana distintos, de domingo a sábado.'
  }
  if (field === 'dayOfMonth') {
    if (code === 'REQUIRED') return 'Informe o dia do mês.'
    return 'Informe um dia do mês entre 1 e 31.'
  }
  if (field === 'until') {
    if (code === 'UNTIL_BEFORE_DUE') return 'O limite não pode ser anterior ao prazo.'
    return 'Informe um limite de série válido.'
  }
  return 'Revise a recorrência.'
}

/** Mensagens pt-BR dos erros finitos de um item da lista de subtarefas. */
export function subtaskItemErrorMessage(errors: SubtaskItemErrors): string {
  if (errors.title === 'REQUIRED') return 'Informe o título da subtarefa.'
  if (errors.title === 'TOO_LONG') return 'O título da subtarefa excede 200 caracteres.'
  if (errors.id === 'UNKNOWN_ID') return 'Esta subtarefa não existe mais na tarefa.'
  if (errors.id === 'DUPLICATE_ID') return 'Esta subtarefa está repetida na lista enviada.'
  if (errors.id === 'INVALID_VALUE') return 'Identificador de subtarefa inválido.'
  return 'Revise a subtarefa.'
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
