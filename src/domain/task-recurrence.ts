// Cópia revisada (recorte) de taskflow-extension@a763e7a src/domain/task-recurrence.ts.
// Mantém tipos, validação estrutural, avanço civil local, cálculo da próxima ocorrência com
// resultado finito e a construção pura da próxima ocorrência. Acrescenta somente o limite de
// 32.768 passos por decisão e erros tipados no lugar de `undefined`/exceção.
import { createIdentityAllocator } from './identity.js'
import type { IdGenerator, Task, TaskReminder } from './task.js'
import { isRepresentableInstant } from './task-reminders.js'
import type { Subtask } from './task-subtasks.js'

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** Limite de passos de uma única decisão de cálculo; excedente é `RESOURCE_LIMIT`. */
export const RECURRENCE_STEP_LIMIT = 32_768

/** Limites da regra de recorrência aceitos pelo domínio. */
export const RECURRENCE_LIMITS = {
  intervalDaysMin: 1,
  intervalDaysMax: 365,
  weekdaysMin: 1,
  weekdaysMax: 7,
  dayOfMonthMin: 1,
  dayOfMonthMax: 31,
} as const

interface RecurrenceBase {
  /** Instante agendado da série (ISO 8601 UTC) quando difere de `dueAt`. */
  anchorAt?: string
  /** Instante limite da série (ISO 8601 UTC); ocorrências posteriores não são geradas. */
  until?: string
}

export type Recurrence =
  | (RecurrenceBase & { frequency: 'DAILY'; intervalDays: number })
  | (RecurrenceBase & { frequency: 'WEEKLY'; weekdays: number[] })
  | (RecurrenceBase & { frequency: 'MONTHLY'; dayOfMonth: number })

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && isRepresentableInstant(Date.parse(value))
}

function hasValidBoundaries(value: Record<string, unknown>): boolean {
  return (
    (value['anchorAt'] === undefined || isInstant(value['anchorAt'])) &&
    (value['until'] === undefined || isInstant(value['until']))
  )
}

/**
 * Verifica estruturalmente uma regra de recorrência: frequência conhecida, parâmetros inteiros
 * dentro dos limites e instantes delimitadores representáveis. Não normaliza nem exige formato
 * textual canônico.
 */
export function isRecurrence(value: unknown): value is Recurrence {
  if (!isRecord(value) || !isRecurrenceFrequency(value['frequency']) || !hasValidBoundaries(value)) {
    return false
  }

  if (value['frequency'] === 'DAILY') {
    const intervalDays = value['intervalDays']

    return (
      typeof intervalDays === 'number' &&
      Number.isSafeInteger(intervalDays) &&
      intervalDays >= RECURRENCE_LIMITS.intervalDaysMin &&
      intervalDays <= RECURRENCE_LIMITS.intervalDaysMax
    )
  }

  if (value['frequency'] === 'WEEKLY') {
    const weekdays = value['weekdays']

    if (
      !Array.isArray(weekdays) ||
      weekdays.length < RECURRENCE_LIMITS.weekdaysMin ||
      weekdays.length > RECURRENCE_LIMITS.weekdaysMax
    ) {
      return false
    }

    const seen = new Set<number>()

    for (const weekday of weekdays as unknown[]) {
      if (typeof weekday !== 'number' || !Number.isSafeInteger(weekday) || weekday < 0 || weekday > 6) {
        return false
      }

      if (seen.has(weekday)) {
        return false
      }

      seen.add(weekday)
    }

    return true
  }

  const dayOfMonth = value['dayOfMonth']

  return (
    typeof dayOfMonth === 'number' &&
    Number.isSafeInteger(dayOfMonth) &&
    dayOfMonth >= RECURRENCE_LIMITS.dayOfMonthMin &&
    dayOfMonth <= RECURRENCE_LIMITS.dayOfMonthMax
  )
}

/** Igualdade lógica da regra (inclui âncora e until); usada para detectar alteração efetiva. */
export function isSameRecurrence(left: Recurrence | undefined, right: Recurrence | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  if (left.frequency !== right.frequency) return false
  if (left.until !== right.until) return false
  if (left.anchorAt !== right.anchorAt) return false
  if (left.frequency === 'DAILY' && right.frequency === 'DAILY') return left.intervalDays === right.intervalDays
  if (left.frequency === 'WEEKLY' && right.frequency === 'WEEKLY') {
    return left.weekdays.length === right.weekdays.length && left.weekdays.every((day, index) => day === right.weekdays[index])
  }
  return left.frequency === 'MONTHLY' && right.frequency === 'MONTHLY' && left.dayOfMonth === right.dayOfMonth
}

function withLocalTime(source: Date, year: number, month: number, day: number): Date {
  return new Date(
    year,
    month,
    day,
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  )
}

/**
 * Avança um passo civil no fuso local do sistema, preservando a hora local do dia. Em
 * `MONTHLY`, dia do mês inexistente é ajustado para o último dia daquele mês, sem tornar o
 * ajuste permanente. Devolve `undefined` somente para regra estruturalmente impossível.
 */
export function stepRecurrence(recurrence: Recurrence, instant: Date): Date | undefined {
  const year = instant.getFullYear()
  const month = instant.getMonth()
  const day = instant.getDate()

  if (recurrence.frequency === 'DAILY') {
    return withLocalTime(instant, year, month, day + recurrence.intervalDays)
  }

  if (recurrence.frequency === 'WEEKLY') {
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = withLocalTime(instant, year, month, day + offset)

      if (recurrence.weekdays.includes(candidate.getDay())) {
        return candidate
      }
    }

    return undefined
  }

  const nextMonth = month + 1
  const lastDay = new Date(year, nextMonth + 1, 0).getDate()

  return withLocalTime(instant, year, nextMonth, Math.min(recurrence.dayOfMonth, lastDay))
}

/** Resultado finito de uma decisão de cálculo; erro nunca vira fim natural. */
export type NextScheduledResult =
  | { status: 'NEXT'; scheduledAt: string }
  | { status: 'EXHAUSTED' }
  | { status: 'OUT_OF_RANGE' }
  | { status: 'RESOURCE_LIMIT' }

/**
 * Instante agendado da próxima ocorrência após `now`, ancorado em `anchorAt ?? dueAt` e avançando
 * quantas vezes forem necessárias, no máximo `RECURRENCE_STEP_LIMIT` passos. Ocorrências perdidas
 * são puladas. Cada passo verifica instante representável e avanço estritamente positivo antes de
 * converter para ISO; overflow devolve `OUT_OF_RANGE` e excesso de passos `RESOURCE_LIMIT`.
 */
export function resolveNextScheduledAt(
  recurrence: Recurrence,
  dueAt: string,
  now: Date,
): NextScheduledResult {
  const anchorMs = Date.parse(recurrence.anchorAt ?? dueAt)

  if (!isRepresentableInstant(anchorMs)) {
    return { status: 'OUT_OF_RANGE' }
  }

  let instant = new Date(anchorMs)
  let steps = 0

  for (;;) {
    if (steps >= RECURRENCE_STEP_LIMIT) {
      return { status: 'RESOURCE_LIMIT' }
    }

    const stepped = stepRecurrence(recurrence, instant)

    if (stepped === undefined) {
      return { status: 'OUT_OF_RANGE' }
    }

    const steppedMs = stepped.getTime()

    if (!isRepresentableInstant(steppedMs) || steppedMs <= instant.getTime()) {
      return { status: 'OUT_OF_RANGE' }
    }

    instant = stepped
    steps += 1

    if (instant.getTime() > now.getTime()) break
  }

  if (recurrence.until !== undefined) {
    const untilMs = Date.parse(recurrence.until)

    if (!isRepresentableInstant(untilMs)) {
      return { status: 'OUT_OF_RANGE' }
    }

    if (instant.getTime() > untilMs) {
      return { status: 'EXHAUSTED' }
    }
  }

  return { status: 'NEXT', scheduledAt: instant.toISOString() }
}

/** Regra transportada para a nova ocorrência: a ancoragem passa a ser o próprio prazo dela. */
export function transferRecurrence(recurrence: Recurrence): Recurrence {
  const base = recurrence.until === undefined ? {} : { until: recurrence.until }

  if (recurrence.frequency === 'DAILY') {
    return { ...base, frequency: 'DAILY', intervalDays: recurrence.intervalDays }
  }

  if (recurrence.frequency === 'WEEKLY') {
    return { ...base, frequency: 'WEEKLY', weekdays: [...recurrence.weekdays] }
  }

  return { ...base, frequency: 'MONTHLY', dayOfMonth: recurrence.dayOfMonth }
}

export interface NextOccurrenceContext {
  now: Date
  generateId: IdGenerator
  /** Colisão adicional (tarefas/lixeira e reservas do plano); nunca consulta o renderer. */
  isIdTaken?: (id: string) => boolean
}

export type BuildNextOccurrenceResult =
  | { ok: true; task: Task }
  | { ok: false; reason: 'IDENTITY_CONFLICT' }

/**
 * Cria a próxima ocorrência a partir da ocorrência fechada: nova identidade, status `TODO`, os
 * campos editáveis copiados, a regra transferida sem âncora antiga, o mesmo `seriesId`.
 * Identificadores de tarefa, lembretes OFFSET e subtarefas são próprios, não reutilizam os do
 * conjunto substituído e não duplicam dentro da lista nova; lembretes não conservam
 * `processedFor` e as subtarefas ficam desmarcadas na mesma ordem.
 */
export function buildNextOccurrence(
  task: Task,
  recurrence: Recurrence,
  scheduledAt: string,
  context: NextOccurrenceContext,
): BuildNextOccurrenceResult {
  const seriesId = task.seriesId
  if (seriesId === undefined || seriesId === '') {
    return { ok: false, reason: 'IDENTITY_CONFLICT' }
  }

  const isTaken = context.isIdTaken ?? ((): boolean => false)
  const identity = createIdentityAllocator(isTaken)
  for (const subtask of task.subtasks) identity.reserve(subtask.id)
  for (const reminder of task.reminders) identity.reserve(reminder.id)

  const id = identity.allocate(context.generateId)
  if (id === undefined) return { ok: false, reason: 'IDENTITY_CONFLICT' }

  const reminders: TaskReminder[] = []

  for (const reminder of task.reminders) {
    if (reminder.type !== 'OFFSET') continue
    const reminderId = identity.allocate(context.generateId)
    if (reminderId === undefined) return { ok: false, reason: 'IDENTITY_CONFLICT' }
    reminders.push({ id: reminderId, type: 'OFFSET', offsetMinutes: reminder.offsetMinutes })
  }

  const subtasks: Subtask[] = []

  for (const subtask of task.subtasks) {
    const subtaskId = identity.allocate(context.generateId)
    if (subtaskId === undefined) return { ok: false, reason: 'IDENTITY_CONFLICT' }
    subtasks.push({ id: subtaskId, title: subtask.title, done: false })
  }

  const timestamp = context.now.toISOString()

  return {
    ok: true,
    task: {
      id,
      title: task.title,
      ...(task.description !== undefined && { description: task.description }),
      ...(task.requester !== undefined && { requester: task.requester }),
      ...(task.assignee !== undefined && { assignee: task.assignee }),
      status: 'TODO',
      priority: task.priority,
      dueAt: scheduledAt,
      reminders,
      recurrence: transferRecurrence(recurrence),
      subtasks,
      seriesId,
      tags: [...task.tags],
      ...(task.sourceUrl !== undefined && { sourceUrl: task.sourceUrl }),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  }
}
