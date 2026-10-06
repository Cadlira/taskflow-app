import type { ReminderOccurrenceKey } from '../../domain/task-reminders.js'
import type { ReminderProcessingResult, ReminderSubmissionCandidate, UnitResult } from '../storage/unit-of-work.js'
import type { ReminderProjection } from './reminder-index.js'

export interface ReminderReservation {
  valid(): boolean
  submit(candidate: ReminderSubmissionCandidate): void
  release(): void
}
export interface ReminderProjectionPage {
  tasks: Array<{ id: string; reminders: ReminderProjection[] }>
  afterId: string | undefined
  complete: boolean
}
export interface ReminderServicePorts {
  now(): Date
  monotonic(): number
  /** Uma única agenda; devolve cancelamento idempotente. */
  arm(delayMs: number, callback: () => void): () => void
  yield(): Promise<void>
  page(afterId: string | undefined): Promise<UnitResult<ReminderProjectionPage>>
  tasks(ids: readonly string[]): Promise<UnitResult<ReminderProjectionPage['tasks']>>
  process(key: ReminderOccurrenceKey, reservation: ReminderReservation | undefined): Promise<UnitResult<ReminderProcessingResult>>
  submit(candidate: ReminderSubmissionCandidate, completed: () => void): (cancel: boolean) => void
  ready(): boolean
  statusChanged(status: ReminderServiceStatus): void
}
export type ReminderServiceStatus = 'RECOVERING' | 'READY' | 'SUSPENDED' | 'UNAVAILABLE' | 'RESOURCE_LIMIT' | 'BUSY' | 'STOPPED'
