// Cópia revisada (recorte) de taskflow-extension@a763e7a src/domain/task-recurrence.ts.
// Somente tipos e validação estrutural usados pelo codec; cálculo e geração de
// ocorrências ficam na TFA-005.
import { isRepresentableInstant } from './task-reminders.js'

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

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
