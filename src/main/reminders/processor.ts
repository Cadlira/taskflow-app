import { canDeliverReminder, type ReminderOccurrenceKey } from '../../domain/task-reminders.js'
import type { ReminderProcessingResult, UnitResult } from '../../application/storage/unit-of-work.js'
import type { StorageCoordinator, UnitCompletion } from '../storage/coordinator.js'
import type { ReminderReservation } from '../../application/reminders/reminder-ports.js'
export type { ReminderReservation } from '../../application/reminders/reminder-ports.js'

export const REMINDER_OWNER = 'reminder-runtime'
export type ReminderEffectCode = 'SUBMITTED' | 'SUPPRESSED' | 'NATIVE_NOTIFICATION_FAILED'
export interface ReminderRuntimePort {
  ready(): boolean
  epoch(): number
  now(): Date
  /** Somente IDs/estado em memória, sem SQL/notifier. */
  completed(key: ReminderOccurrenceKey, completion: UnitCompletion): void
  report(code: ReminderEffectCode): void
}

/** Única composição autorizada da fronteira claim→solicitação síncrona. */
export function processReminder(
  coordinator: StorageCoordinator,
  key: ReminderOccurrenceKey,
  runtime: ReminderRuntimePort,
  reservation: ReminderReservation | undefined,
): Promise<UnitResult<ReminderProcessingResult>> {
  const admittedEpoch = runtime.epoch()
  let confirmedEpoch: number | undefined
  let enteredCompletion = false
  const result = coordinator.runReminder(
    (unit) => runtime.ready() && runtime.epoch() === admittedEpoch
      ? unit.processReminderOccurrence(key, runtime.now(), reservation?.valid() === true)
      : { status: 'INAPPLICABLE' as const },
    {
      owner: REMINDER_OWNER,
      admit: () => runtime.ready() && runtime.epoch() === admittedEpoch,
      onCompleted: (completion) => {
        enteredCompletion = true
        runtime.completed(key, completion)
        confirmedEpoch = runtime.epoch()
      },
    },
    (outcome) => {
      if (!outcome.ok || !outcome.committed || outcome.value.status !== 'CLAIMED') {
        reservation?.release()
        return
      }
      if (!enteredCompletion || confirmedEpoch !== runtime.epoch() || !runtime.ready() ||
        coordinator.availability.state !== 'ready' || coordinator.confirmedRevision !== outcome.revision ||
        reservation === undefined || !reservation.valid() || !canDeliverReminder(key.triggerISO, runtime.now())) {
        reservation?.release()
        runtime.report('SUPPRESSED')
        return
      }
      try {
        reservation.submit(outcome.value.candidate)
        runtime.report('SUBMITTED')
      } catch {
        reservation.release()
        runtime.report('NATIVE_NOTIFICATION_FAILED')
      }
    },
  )
  // Recusa anterior à admissão nunca chega à conclusão; apenas libera recurso, sem efeito.
  return result.then((outcome) => {
    if (!outcome.ok) reservation?.release()
    return outcome
  })
}
