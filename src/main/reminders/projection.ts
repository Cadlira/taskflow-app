import { createHash } from 'node:crypto'
import { isActiveStatus, type Task } from '../../domain/task.js'
import { isReminderPending, isRepresentableInstant, resolveReminderTriggerAt, type ReminderOccurrenceKey } from '../../domain/task-reminders.js'
import type { ReminderProjection } from '../../application/reminders/reminder-index.js'

export function reminderTag(key: ReminderOccurrenceKey): string {
  return createHash('sha256').update(JSON.stringify([key.taskId, key.reminderId, key.triggerISO]), 'utf8').digest('hex')
}
export function projectTaskReminders(task: Task, now: Date): ReminderProjection[] {
  if (task.dueAt === undefined) return []
  const projections: ReminderProjection[] = []
  for (const reminder of task.reminders) {
    const triggerAt = resolveReminderTriggerAt(reminder, task.dueAt)
    if (!isRepresentableInstant(triggerAt)) continue
    const key = { taskId: task.id, reminderId: reminder.id, triggerISO: new Date(triggerAt).toISOString() }
    const pending = isReminderPending(reminder, task.dueAt)
    projections.push({ ...key, triggerAt, tag: reminderTag(key), pending,
      scheduled: pending && (isActiveStatus(task.status) || triggerAt <= now.getTime()) })
  }
  return projections
}
