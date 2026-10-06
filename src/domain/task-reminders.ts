// Cópia revisada (recorte) de taskflow-extension@a763e7a src/domain/task-reminders.ts.
// Invariantes, markers e política temporal desktop; sem tolerância de alarmes Chrome.
import { isActiveStatus, type Task, type TaskReminder } from './task.js'

/** Limite de lembretes distintos por tarefa. */
export const MAX_REMINDERS = 10
export const REMINDER_PRESETS = [0, 15, 60, 1440] as const
export const REMINDER_DELAY_TOLERANCE_MS = 300_000

/** Identidade exata de uma ocorrência; não contém título nem autoridade externa. */
export interface ReminderOccurrenceKey {
  taskId: string
  reminderId: string
  triggerISO: string
}

export type ReminderClassification = 'FUTURE' | 'ELIGIBLE' | 'EXPIRED' | 'INAPPLICABLE'

/** Recuperação desktop inclusiva; settlement das mutações é deliberadamente separado. */
export function classifyReminderOccurrence(
  task: Task | undefined,
  occurrence: ReminderOccurrenceKey,
  now: Date,
): ReminderClassification {
  if (task?.id !== occurrence.taskId || task.dueAt === undefined) return 'INAPPLICABLE'
  const reminder = task.reminders.find((item) => item.id === occurrence.reminderId)
  if (reminder === undefined || !isReminderPending(reminder, task.dueAt)) return 'INAPPLICABLE'
  const trigger = resolveReminderTriggerAt(reminder, task.dueAt)
  if (!isRepresentableInstant(trigger) || instantIso(trigger) !== occurrence.triggerISO) return 'INAPPLICABLE'
  const clock = now.getTime()
  if (!isRepresentableInstant(clock)) return 'INAPPLICABLE'
  if (clock < trigger) return isActiveStatus(task.status) ? 'FUTURE' : 'INAPPLICABLE'
  if (!isActiveStatus(task.status) || clock - trigger > REMINDER_DELAY_TOLERANCE_MS) return 'EXPIRED'
  return 'ELIGIBLE'
}

/** Guarda final de clock, usada após claim sem tentar reaplicar o marker consumido. */
export function canDeliverReminder(triggerISO: string, now: Date): boolean {
  const trigger = Date.parse(triggerISO)
  const clock = now.getTime()
  return isRepresentableInstant(trigger) && isRepresentableInstant(clock) &&
    clock >= trigger && clock - trigger <= REMINDER_DELAY_TOLERANCE_MS
}

/** Maior instante representável por `Date`; além disso `toISOString` lança `RangeError`. */
export const MAX_DATE_INSTANT_MS = 8_640_000_000_000_000

const MINUTE_MS = 60_000

/** Um instante só pode ser formatado, comparado e persistido dentro do intervalo de `Date`. */
export function isRepresentableInstant(epochMs: number): boolean {
  return Number.isFinite(epochMs) && Math.abs(epochMs) <= MAX_DATE_INSTANT_MS
}

function instantIso(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

/** Instante efetivo da ocorrência: deslocamento exato antes do prazo ou instante absoluto. */
export function resolveReminderTriggerAt(reminder: TaskReminder, dueAt: string): number {
  return reminder.type === 'OFFSET'
    ? Date.parse(dueAt) - reminder.offsetMinutes * MINUTE_MS
    : Date.parse(reminder.at)
}

/** Uma ocorrência está pendente enquanto o instante processado difere do instante efetivo. */
export function isReminderPending(reminder: TaskReminder, dueAt: string): boolean {
  const triggerAt = resolveReminderTriggerAt(reminder, dueAt)
  return isRepresentableInstant(triggerAt) && reminder.processedFor !== instantIso(triggerAt)
}

/**
 * Verifica as invariantes de uma coleção de lembretes já normalizada: limite de itens, exigência
 * de prazo, identificadores únicos, instantes efetivos representáveis e sem repetição e `AT` até
 * o prazo. Não exige formato textual canônico, apenas coerência estrutural e temporal.
 */
export function isReminderCollectionValid(task: Task): boolean {
  const { dueAt, reminders } = task

  if (reminders.length > MAX_REMINDERS) {
    return false
  }

  if (reminders.length === 0) {
    return true
  }

  if (dueAt === undefined) {
    return false
  }

  const dueMs = Date.parse(dueAt)

  if (!isRepresentableInstant(dueMs)) {
    return false
  }

  const seenIds = new Set<string>()
  const seenInstants = new Set<number>()

  for (const reminder of reminders) {
    if (reminder.id === '' || seenIds.has(reminder.id)) {
      return false
    }

    seenIds.add(reminder.id)

    const triggerAt = resolveReminderTriggerAt(reminder, dueAt)

    if (!isRepresentableInstant(triggerAt)) {
      return false
    }

    if (reminder.type === 'AT' && triggerAt > dueMs) {
      return false
    }

    if (seenInstants.has(triggerAt)) {
      return false
    }

    seenInstants.add(triggerAt)
  }

  return true
}

/** Registra o instante efetivo como processado no lembrete informado. */
export function markReminderProcessed(task: Task, reminderId: string, processedFor: string): Task {
  return {
    ...task,
    reminders: task.reminders.map((reminder) =>
      reminder.id === reminderId ? { ...reminder, processedFor } : reminder,
    ),
  }
}

/**
 * Registra condicionalmente a ocorrência como processada. Retorna a tarefa atualizada somente
 * quando o lembrete ainda está pendente para o mesmo instante efetivo informado.
 */
export function claimReminderOccurrence(task: Task, reminderId: string, processedFor: string): Task | undefined {
  const { dueAt } = task

  if (dueAt === undefined || !isActiveStatus(task.status)) {
    return undefined
  }

  const reminder = task.reminders.find((candidate) => candidate.id === reminderId)

  if (!reminder || !isReminderPending(reminder, dueAt)) {
    return undefined
  }

  if (instantIso(resolveReminderTriggerAt(reminder, dueAt)) !== processedFor) {
    return undefined
  }

  return markReminderProcessed(task, reminderId, processedFor)
}

/**
 * Liquidação pura (recorte desktop da TFA-006): marca como processado todo gatilho pendente
 * representável <= now, sem aviso retroativo. Futuros permanecem pendentes; gatilho não
 * representável permanece íntegro. Não depende de status ativo (terminal também liquida) e não
 * agenda/notifica nada.
 */
export function settleElapsedReminders(task: Task, now: Date): Task {
  const { dueAt } = task

  if (dueAt === undefined || task.reminders.length === 0) {
    return task
  }

  const nowMs = now.getTime()
  let changed = false
  const reminders = task.reminders.map((reminder) => {
    const triggerAt = resolveReminderTriggerAt(reminder, dueAt)

    if (!isRepresentableInstant(triggerAt) || triggerAt > nowMs) {
      return reminder
    }

    const processedFor = instantIso(triggerAt)

    if (reminder.processedFor === processedFor) {
      return reminder
    }

    changed = true
    return { ...reminder, processedFor }
  })

  return changed ? { ...task, reminders } : task
}

/**
 * Ordem da restauração/reversão: conserva primeiro os marcadores atuais de mesmo
 * lembrete/instante (preserveProcessedMarkers) e só então liquida os vencidos <= now.
 */
export function settleElapsedRemindersPreservingMarkers(current: Task, restored: Task, now: Date): Task {
  return settleElapsedReminders(preserveProcessedMarkers(current, restored), now)
}

/**
 * Conserva o marcador `processedFor` atual das ocorrências que a nova versão não alterou:
 * mesmo lembrete e mesmo instante efetivo. Ocorrência alterada fica com o que `next` trouxer.
 * (Acréscimo desktop da TFA-003: o claim não muda a revisão de conteúdo, então uma edição
 * baseada em leitura anterior ao claim não pode apagar o marcador.)
 */
export function preserveProcessedMarkers(current: Task, next: Task): Task {
  const currentDueAt = current.dueAt
  const nextDueAt = next.dueAt

  if (currentDueAt === undefined || nextDueAt === undefined) {
    return next
  }

  let changed = false
  const reminders = next.reminders.map((reminder) => {
    const previous = current.reminders.find((candidate) => candidate.id === reminder.id)

    if (previous?.processedFor === undefined || reminder.processedFor === previous.processedFor) {
      return reminder
    }

    const previousTrigger = resolveReminderTriggerAt(previous, currentDueAt)
    const nextTrigger = resolveReminderTriggerAt(reminder, nextDueAt)

    if (
      !isRepresentableInstant(nextTrigger) ||
      previousTrigger !== nextTrigger ||
      previous.processedFor !== instantIso(nextTrigger)
    ) {
      return reminder
    }

    changed = true
    return { ...reminder, processedFor: previous.processedFor }
  })

  return changed ? { ...next, reminders } : next
}
