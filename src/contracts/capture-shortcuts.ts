import { asExactRecord, asPlainRecord, serializedBytes } from './record.js'
import { isShortcutAction, isShortcutCombination, SHORTCUT_ACTIONS } from '../domain/global-shortcuts.js'
import type { ShortcutAction, ShortcutCombination } from '../domain/global-shortcuts.js'
import { isWellFormedCaptureText, validateCaptureSource } from '../domain/clipboard-capture.js'
import type { CapturedDraft } from '../domain/clipboard-capture.js'
import type { CaptureEnvelope, CaptureInboxRead, CaptureReceipt, CaptureReference } from '../application/capture/capture-ports.js'
import type { ShortcutObservation, ShortcutReason } from '../application/shortcuts/shortcut-ports.js'

export const ENTRY_CHANNELS = {
  openQuickAdd: 'entry:open-quick-add:v1', openTaskManager: 'entry:open-task-manager:v1',
  captureClipboard: 'entry:capture-clipboard:v1', getPendingCapture: 'entry:get-pending-capture:v1',
  acknowledgeCapture: 'entry:acknowledge-capture:v1', discardCapture: 'entry:discard-capture:v1',
  getShortcutSettings: 'entry:get-shortcut-settings:v1', setShortcut: 'entry:set-shortcut:v1',
  setShortcutEditing: 'entry:set-shortcut-editing:v1',
} as const
export const ENTRY_LIMITS = { requestBytes: 1024, resultBytes: 8192, captureBytes: 65536 } as const
export const ENTRY_ERROR_CODES = ['INVALID_REQUEST', 'UNAUTHORIZED', 'BUSY', 'EMPTY', 'UNSUPPORTED', 'INVALID_TEXT',
  'UNAVAILABLE', 'TIMEOUT', 'RESOURCE_LIMIT', 'STALE_CAPTURE', 'STALE_SETTINGS', 'PREFERENCES_INVALID', 'UNKNOWN', 'SESSION_CLOSED'] as const
export type EntryErrorCode = (typeof ENTRY_ERROR_CODES)[number]
export type EntryRequest = Readonly<{ version: 1 }>
export type CaptureAckRequest = Readonly<{ version: 1; id: string; sequence: string; disposition: 'presented' | 'applied' }>
export type CaptureDiscardRequest = Readonly<{ version: 1; id: string; sequence: string }>
export type SetShortcutRequest = Readonly<{ version: 1; action: ShortcutAction; combination: ShortcutCombination | null; expectedConfigRevision: string }>
export type ShortcutEditingRequest = Readonly<{ version: 1; editing: boolean }>
export type EntryFailure = Readonly<{ version: 1; status: 'error'; code: EntryErrorCode }>
export type EntryAck = Readonly<{ version: 1; status: 'ok' }> | EntryFailure
export type CaptureResult = Readonly<{ version: 1; status: 'ok'; reference: CaptureReference; replaced: boolean }> | EntryFailure
export type PendingCaptureResult = Readonly<{ version: 1; status: 'ok'; inbox: CaptureInboxRead }> | EntryFailure
export type CaptureAckResult = Readonly<{ version: 1; status: 'ok'; receipt: CaptureReceipt }> | EntryFailure
export interface ShortcutSettings {
  configRevision: string
  statusSequence: string
  actions: ShortcutObservation[]
  editing: boolean
  settersBlocked: boolean
}
export type ShortcutSettingsResult = Readonly<{ version: 1; status: 'ok'; settings: ShortcutSettings }> | EntryFailure

export function entryFailure(code: EntryErrorCode): EntryFailure { return { version: 1, status: 'error', code } }
/** Medir JSON nunca deve executar getters/toJSON de uma entrada ainda não validada. */
function safeJson(value: unknown, ancestors = new Set<object>(), depth = 0): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || depth > 16 || ancestors.has(value)) return false
  ancestors.add(value)
  let values: unknown[]
  if (Array.isArray(value)) {
    if (value.length > 32 || Object.getOwnPropertySymbols(value).length > 0) return false
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'length') continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !('value' in descriptor) || !/^(?:0|[1-9][0-9]*)$/.test(key)) return false
    }
    values = value as unknown[]
  } else {
    const record = asPlainRecord(value)
    if (!record || Object.keys(record).length > 32) return false
    values = Object.values(record)
  }
  const valid = values.every(item => safeJson(item, ancestors, depth + 1))
  ancestors.delete(value)
  return valid
}
function within(value: unknown, budget: number): boolean { return safeJson(value) && (serializedBytes(value) ?? Infinity) <= budget }
export function isCaptureId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
}
export function isEntryRevision(value: unknown): value is string { return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,31})$/.test(value) }
export function isEntrySequence(value: unknown): value is string { return isEntryRevision(value) && value !== '0' }
export function parseEntryRequest(value: unknown): EntryRequest | null {
  const record = asExactRecord(value, ['version'])
  return within(value, ENTRY_LIMITS.requestBytes) && record?.['version'] === 1 ? { version: 1 } : null
}
export function parseCaptureAckRequest(value: unknown): CaptureAckRequest | null {
  const record = asExactRecord(value, ['version', 'id', 'sequence', 'disposition'])
  if (!within(value, ENTRY_LIMITS.requestBytes) || record?.['version'] !== 1 || !isCaptureId(record['id']) || !isEntrySequence(record['sequence']) ||
    (record['disposition'] !== 'presented' && record['disposition'] !== 'applied')) return null
  return { version: 1, id: record['id'], sequence: record['sequence'], disposition: record['disposition'] }
}
export function parseCaptureDiscardRequest(value: unknown): CaptureDiscardRequest | null {
  const record = asExactRecord(value, ['version', 'id', 'sequence'])
  if (!within(value, ENTRY_LIMITS.requestBytes) || record?.['version'] !== 1 || !isCaptureId(record['id']) || !isEntrySequence(record['sequence'])) return null
  return { version: 1, id: record['id'], sequence: record['sequence'] }
}
export function parseSetShortcutRequest(value: unknown): SetShortcutRequest | null {
  const record = asExactRecord(value, ['version', 'action', 'combination', 'expectedConfigRevision'])
  if (!within(value, ENTRY_LIMITS.requestBytes) || record?.['version'] !== 1 || !isShortcutAction(record['action']) ||
    !isEntryRevision(record['expectedConfigRevision']) || (record['combination'] !== null && !isShortcutCombination(record['combination']))) return null
  return { version: 1, action: record['action'], combination: record['combination'] === null ? null : { ...record['combination'] }, expectedConfigRevision: record['expectedConfigRevision'] }
}
export function parseShortcutEditingRequest(value: unknown): ShortcutEditingRequest | null {
  const record = asExactRecord(value, ['version', 'editing'])
  return within(value, ENTRY_LIMITS.requestBytes) && record?.['version'] === 1 && typeof record['editing'] === 'boolean'
    ? { version: 1, editing: record['editing'] } : null
}
export function parseEntryFailure(value: unknown): EntryFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'])
  return within(value, ENTRY_LIMITS.resultBytes) && record?.['version'] === 1 && record['status'] === 'error' &&
    typeof record['code'] === 'string' && ENTRY_ERROR_CODES.some(code => code === record['code'])
    ? entryFailure(record['code'] as EntryErrorCode) : null
}
export function parseEntryAck(value: unknown): EntryAck | null {
  const failure = parseEntryFailure(value)
  if (failure) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return within(value, ENTRY_LIMITS.resultBytes) && record?.['version'] === 1 && record['status'] === 'ok' ? { version: 1, status: 'ok' } : null
}
function reference(value: unknown): CaptureReference | null {
  const record = asExactRecord(value, ['id', 'sequence'])
  return record && isCaptureId(record['id']) && isEntrySequence(record['sequence']) ? { id: record['id'], sequence: record['sequence'] } : null
}
function receipt(value: unknown): CaptureReceipt | null {
  const record = asExactRecord(value, ['id', 'sequence', 'disposition'])
  if (!record || !isCaptureId(record['id']) || !isEntrySequence(record['sequence']) ||
    typeof record['disposition'] !== 'string' || !['presented', 'applied', 'discarded'].includes(record['disposition'])) return null
  return { id: record['id'], sequence: record['sequence'], disposition: record['disposition'] as CaptureReceipt['disposition'] }
}
function capturedDraft(value: unknown): CapturedDraft | null {
  const record = asExactRecord(value, ['kind', 'title', 'flags'], ['description', 'sourceUrl'])
  if (!record || (record['kind'] !== 'URL' && record['kind'] !== 'TEXT') || typeof record['title'] !== 'string' ||
    record['title'].length > 200 || !isWellFormedCaptureText(record['title'])) return null
  const flags = asExactRecord(record['flags'], ['titleTruncated', 'descriptionTruncated', 'sourceOpeningLimited'])
  if (!flags || !Object.values(flags).every(flag => typeof flag === 'boolean')) return null
  if ('description' in record && (typeof record['description'] !== 'string' || record['description'].length > 4000 || !isWellFormedCaptureText(record['description']))) return null
  if ('sourceUrl' in record && (typeof record['sourceUrl'] !== 'string' || !validateCaptureSource(record['sourceUrl']).ok)) return null
  if (record['kind'] === 'URL' && (record['title'] !== '' || typeof record['sourceUrl'] !== 'string' || 'description' in record)) return null
  if (record['kind'] === 'TEXT' && (record['title'].length === 0 || 'sourceUrl' in record)) return null
  return { kind: record['kind'], title: record['title'],
    ...('description' in record ? { description: record['description'] as string } : {}),
    ...('sourceUrl' in record ? { sourceUrl: record['sourceUrl'] as string } : {}),
    flags: { titleTruncated: flags['titleTruncated'] as boolean, descriptionTruncated: flags['descriptionTruncated'] as boolean, sourceOpeningLimited: flags['sourceOpeningLimited'] as boolean } }
}
function envelope(value: unknown): CaptureEnvelope | null {
  const record = asExactRecord(value, ['id', 'sequence', 'draft', 'replaced'])
  if (!record || !isCaptureId(record['id']) || !isEntrySequence(record['sequence']) || typeof record['replaced'] !== 'boolean') return null
  const draft = capturedDraft(record['draft'])
  return draft ? { id: record['id'], sequence: record['sequence'], draft, replaced: record['replaced'] } : null
}
export function parseCaptureResult(value: unknown): CaptureResult | null {
  const failure = parseEntryFailure(value)
  if (failure) return failure
  const record = asExactRecord(value, ['version', 'status', 'reference', 'replaced'])
  if (!within(value, ENTRY_LIMITS.resultBytes) || record?.['version'] !== 1 || record['status'] !== 'ok' || typeof record['replaced'] !== 'boolean') return null
  const ref = reference(record['reference'])
  return ref ? { version: 1, status: 'ok', reference: ref, replaced: record['replaced'] } : null
}
export function parseCaptureAckResult(value: unknown): CaptureAckResult | null {
  const failure = parseEntryFailure(value)
  if (failure) return failure
  const record = asExactRecord(value, ['version', 'status', 'receipt'])
  if (!within(value, ENTRY_LIMITS.resultBytes) || record?.['version'] !== 1 || record['status'] !== 'ok') return null
  const ack = receipt(record['receipt'])
  return ack ? { version: 1, status: 'ok', receipt: ack } : null
}
export function parsePendingCaptureResult(value: unknown): PendingCaptureResult | null {
  const failure = parseEntryFailure(value)
  if (failure) return failure
  const record = asExactRecord(value, ['version', 'status', 'inbox'])
  if (!within(value, ENTRY_LIMITS.captureBytes) || record?.['version'] !== 1 || record['status'] !== 'ok') return null
  const inbox = asExactRecord(record['inbox'], ['state'], ['capture', 'receipt'])
  if (!inbox || typeof inbox['state'] !== 'string') return null
  const ack = 'receipt' in inbox ? receipt(inbox['receipt']) : undefined
  if (ack === null) return null
  const previous = ack ? { receipt: ack } : {}
  if (inbox['state'] === 'none' || inbox['state'] === 'expired') {
    return 'capture' in inbox ? null : { version: 1, status: 'ok', inbox: { state: inbox['state'], ...previous } }
  }
  if (inbox['state'] !== 'staged' && inbox['state'] !== 'held') return null
  const capture = envelope(inbox['capture'])
  return capture ? { version: 1, status: 'ok', inbox: { state: inbox['state'], capture, ...previous } } : null
}
export function parseShortcutSettingsResult(value: unknown): ShortcutSettingsResult | null {
  const failure = parseEntryFailure(value)
  if (failure) return failure
  const record = asExactRecord(value, ['version', 'status', 'settings'])
  if (!within(value, ENTRY_LIMITS.resultBytes) || record?.['version'] !== 1 || record['status'] !== 'ok') return null
  const settings = asExactRecord(record['settings'], ['configRevision', 'statusSequence', 'actions', 'editing', 'settersBlocked'])
  if (!settings || !isEntryRevision(settings['configRevision']) || !isEntrySequence(settings['statusSequence']) ||
    typeof settings['editing'] !== 'boolean' || typeof settings['settersBlocked'] !== 'boolean' ||
    !Array.isArray(settings['actions']) || settings['actions'].length !== 3) return null
  const actions: ShortcutObservation[] = []
  for (const value of settings['actions'] as unknown[]) {
    const item = asExactRecord(value, ['action', 'desired', 'observed'], ['reason'])
    if (!item || !isShortcutAction(item['action']) || (item['desired'] !== null && !isShortcutCombination(item['desired'])) ||
      typeof item['observed'] !== 'string' || !['REGISTERED', 'NONE', 'UNAVAILABLE', 'UNKNOWN'].includes(item['observed']) ||
      ('reason' in item && (typeof item['reason'] !== 'string' || !['CONFLICT', 'NATIVE_FAILURE', 'PREFERENCES_INVALID', 'PROFILE_DISABLED', 'SUSPENDED'].includes(item['reason']))) ||
      actions.some(action => action.action === item['action'])) return null
    if (item['observed'] === 'REGISTERED' && item['desired'] === null || item['observed'] === 'NONE' && item['desired'] !== null) return null
    actions.push({ action: item['action'], desired: item['desired'] === null ? null : { ...item['desired'] },
      observed: item['observed'] as ShortcutObservation['observed'], ...('reason' in item ? { reason: item['reason'] as ShortcutReason } : {}) })
  }
  if (!SHORTCUT_ACTIONS.every(action => actions.some(item => item.action === action))) return null
  return { version: 1, status: 'ok', settings: { configRevision: settings['configRevision'], statusSequence: settings['statusSequence'],
    actions, editing: settings['editing'], settersBlocked: settings['settersBlocked'] } }
}
