// Recorte revisado de taskflow-extension@a763e7a task-draft/task-reminders (MIT).
// Desktop: IDs existentes estritos, erros finitos, três tentativas e sem marker do cliente.
import { createIdentityAllocator } from './identity.js'
import type { IdGenerator, TaskReminder } from './task.js'
import { isRepresentableInstant, MAX_REMINDERS, resolveReminderTriggerAt } from './task-reminders.js'

export type TaskReminderDraft =
  | { id?: string; type: 'OFFSET'; offsetMinutes: number }
  | { id?: string; type: 'AT'; at: string }

export const REMINDER_ITEM_ERROR_CODES = [
  'INVALID_VALUE', 'INVALID_DATE', 'DUPLICATE_ID', 'UNKNOWN_ID', 'DUPLICATE_INSTANT',
  'OUT_OF_RANGE', 'AFTER_DUE', 'ELAPSED', 'ABSOLUTE_REMINDER_INCOMPATIBLE',
] as const
export type ReminderItemErrorCode = (typeof REMINDER_ITEM_ERROR_CODES)[number]
export interface ReminderItemErrors { index: number; code: ReminderItemErrorCode }
export interface ReminderListErrors {
  list?: 'TOO_MANY' | 'DUE_REQUIRED'
  items?: ReminderItemErrors[]
}
export type ReminderDraftResolution =
  | { ok: true; reminders: TaskReminder[] }
  | { ok: false; kind: 'validation'; errors: ReminderListErrors }
  | { ok: false; kind: 'identity' }

export function sameReminderConfiguration(left: TaskReminderDraft, right: TaskReminder): boolean {
  return left.type === 'OFFSET' && right.type === 'OFFSET'
    ? left.offsetMinutes === right.offsetMinutes
    : left.type === 'AT' && right.type === 'AT' && left.at === right.at
}

/** Resolvido contra o estado atual pelo proprietário, antes de qualquer escrita. */
export function resolveReminderDrafts(
  drafts: readonly TaskReminderDraft[],
  current: readonly TaskReminder[],
  context: { dueAt: string | undefined; recurring: boolean; now: Date; generateId: IdGenerator; mode: 'create' | 'edit' },
): ReminderDraftResolution {
  if (drafts.length > MAX_REMINDERS) return { ok: false, kind: 'validation', errors: { list: 'TOO_MANY' } }
  if (drafts.length > 0 && context.dueAt === undefined) {
    return { ok: false, kind: 'validation', errors: { list: 'DUE_REQUIRED' } }
  }
  const byId = new Map(current.map((item) => [item.id, item]))
  const ids = new Set<string>()
  const instants = new Set<number>()
  const items: ReminderItemErrors[] = []
  const normalized: Array<{ draft: TaskReminderDraft; previous: TaskReminder | undefined }> = []
  for (const [index, draft] of drafts.entries()) {
    const fail = (code: ReminderItemErrorCode): void => { items.push({ index, code }) }
    if (draft.id !== undefined) {
      if (context.mode === 'create' || typeof draft.id !== 'string' || draft.id.trim() === '') {
        fail('INVALID_VALUE'); continue
      }
      if (ids.has(draft.id)) { fail('DUPLICATE_ID'); continue }
      ids.add(draft.id)
      if (!byId.has(draft.id)) { fail('UNKNOWN_ID'); continue }
    }
    const previous = draft.id === undefined ? undefined : byId.get(draft.id)
    let candidate: TaskReminderDraft
    if (draft.type === 'OFFSET') {
      if (!Number.isSafeInteger(draft.offsetMinutes) || draft.offsetMinutes < 0) { fail('INVALID_VALUE'); continue }
      candidate = draft
    } else if (draft.type === 'AT') {
      if (context.recurring) { fail('ABSOLUTE_REMINDER_INCOMPATIBLE'); continue }
      const parsed = typeof draft.at === 'string' ? Date.parse(draft.at) : Number.NaN
      if (!isRepresentableInstant(parsed)) { fail('INVALID_DATE'); continue }
      // Intacto conserva a representação e a precisão; somente intenção nova normaliza ISO.
      candidate = previous !== undefined && sameReminderConfiguration(draft, previous)
        ? draft : { ...draft, at: new Date(parsed).toISOString() }
    } else {
      fail('INVALID_VALUE'); continue
    }
    const trigger = resolveReminderTriggerAt({ ...candidate, id: candidate.id ?? '' }, context.dueAt ?? '')
    if (!isRepresentableInstant(trigger)) { fail('OUT_OF_RANGE'); continue }
    if (trigger > Date.parse(context.dueAt ?? '')) { fail('AFTER_DUE'); continue }
    if (instants.has(trigger)) { fail('DUPLICATE_INSTANT'); continue }
    instants.add(trigger)
    if (!(previous !== undefined && sameReminderConfiguration(candidate, previous)) && trigger <= context.now.getTime()) {
      fail('ELAPSED'); continue
    }
    normalized.push({ draft: candidate, previous })
  }
  if (items.length > 0) return { ok: false, kind: 'validation', errors: { items } }
  const identity = createIdentityAllocator((id) => byId.has(id))
  const reminders: TaskReminder[] = []
  for (const { draft, previous } of normalized) {
    const id = previous?.id ?? identity.allocate(context.generateId)
    if (id === undefined) return { ok: false, kind: 'identity' }
    const reminder: TaskReminder = draft.type === 'OFFSET'
      ? { id, type: 'OFFSET', offsetMinutes: draft.offsetMinutes }
      : { id, type: 'AT', at: draft.at }
    // Marcador somente do estado relido e somente para configuração intacta. O storage
    // também conserva markers quando o instante continua igual após mudança de parâmetro.
    if (previous?.processedFor !== undefined && sameReminderConfiguration(draft, previous)) {
      reminder.processedFor = previous.processedFor
    }
    reminders.push(reminder)
  }
  return { ok: true, reminders }
}
