import { asExactRecord, serializedBytes } from './record.js'
import { STATE_ERROR_CODES, isRevisionText } from './state.js'
import type { ReminderServiceStatus } from '../application/reminders/reminder-ports.js'

export const DESKTOP_CHANNELS = {
  status: 'desktop:status:v1', startup: 'desktop:startup:v1', quit: 'desktop:quit:v1',
  subscribe: 'desktop:subscribe:v1', unsubscribe: 'desktop:unsubscribe:v1',
} as const
export const DESKTOP_RESOLVE_CHANNEL = 'desktop:resolve-reminder:v1'
export const DESKTOP_EVENT_CHANNEL = 'desktop:event:v1'
export const DESKTOP_ERROR_CODES = [...STATE_ERROR_CODES, 'UNAVAILABLE', 'NATIVE_OPERATION_FAILED', 'STATE_UNKNOWN', 'NOT_AVAILABLE'] as const
export type DesktopErrorCode = (typeof DESKTOP_ERROR_CODES)[number]
export type StartupState = 'OFF' | 'ON' | 'DISABLED_EXTERNALLY' | 'UNAVAILABLE' | 'UNKNOWN'
export type ReminderCapability = 'FAKE' | 'NATIVE' | 'UNAVAILABLE'
export interface DesktopStatus {
  surfaceSequence: number
  visibility: 'VISIBLE' | 'HIDDEN'
  recovery: 'ACTIVE' | 'SUSPENDED' | 'QUITTING'
  reminders: ReminderServiceStatus
  reminderCapability: ReminderCapability
  startup: StartupState
}
export type DesktopRequest = Readonly<{ version: 1 }>
export type StartupRequest = Readonly<{ version: 1; desired: boolean }>
export type ActivationRequest = Readonly<{ version: 1; tag: string }>
export type DesktopFailure = Readonly<{ version: 1; status: 'error'; code: DesktopErrorCode }>
export type DesktopAck = Readonly<{ version: 1; status: 'ok' }>
export type DesktopStatusResult = Readonly<{ version: 1; status: 'ok'; desktop: DesktopStatus }> | DesktopFailure
export type StartupResult = Readonly<{ version: 1; status: 'ok'; startup: StartupState }> | DesktopFailure
export type ActivationResult = Readonly<{ version: 1; status: 'ok'; revision: string; taskOrdinal: number }> | DesktopFailure
export type DesktopEvent =
  | Readonly<{ version: 1; sequence: number; kind: 'surface-active' | 'surface-suspended' | 'desktop-status-changed' }>
  | Readonly<{ version: 1; sequence: number; kind: 'locate-reminder'; tag: string }>
export type DesktopListener = (event: DesktopEvent) => void
export type DesktopSubscription = { dispose(): void }

export function desktopFailure(code: DesktopErrorCode): DesktopFailure { return { version: 1, status: 'error', code } }
export function isReminderTag(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) }
export function parseDesktopRequest(value: unknown): DesktopRequest | null {
  const record = asExactRecord(value, ['version'])
  return record?.['version'] === 1 ? { version: 1 } : null
}
export function parseStartupRequest(value: unknown): StartupRequest | null {
  const record = asExactRecord(value, ['version', 'desired'])
  return record?.['version'] === 1 && typeof record['desired'] === 'boolean' ? { version: 1, desired: record['desired'] } : null
}
export function parseActivationRequest(value: unknown): ActivationRequest | null {
  const record = asExactRecord(value, ['version', 'tag'])
  return record?.['version'] === 1 && isReminderTag(record['tag']) ? { version: 1, tag: record['tag'] } : null
}
function finite(value: unknown, allowed: readonly string[]): value is string { return typeof value === 'string' && allowed.includes(value) }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 }
export function parseDesktopFailure(value: unknown): DesktopFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'])
  return record?.['version'] === 1 && record['status'] === 'error' && finite(record['code'], DESKTOP_ERROR_CODES)
    ? desktopFailure(record['code'] as DesktopErrorCode) : null
}
export function parseDesktopAck(value: unknown): DesktopAck | DesktopFailure | null {
  const failure = parseDesktopFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return record?.['version'] === 1 && record['status'] === 'ok' ? { version: 1, status: 'ok' } : null
}
const STARTUP_STATES = ['OFF', 'ON', 'DISABLED_EXTERNALLY', 'UNAVAILABLE', 'UNKNOWN'] as const
export function parseStartupResult(value: unknown): StartupResult | null {
  const failure = parseDesktopFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'startup'])
  return record?.['version'] === 1 && record['status'] === 'ok' && finite(record['startup'], STARTUP_STATES)
    ? { version: 1, status: 'ok', startup: record['startup'] as StartupState } : null
}
export function parseDesktopStatusResult(value: unknown): DesktopStatusResult | null {
  const failure = parseDesktopFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'desktop'])
  if (record?.['version'] !== 1 || record['status'] !== 'ok' || (serializedBytes(value) ?? Infinity) > 1024) return null
  const desktop = asExactRecord(record['desktop'], ['surfaceSequence', 'visibility', 'recovery', 'reminders', 'reminderCapability', 'startup'])
  if (desktop === null || !positive(desktop['surfaceSequence']) || !finite(desktop['visibility'], ['VISIBLE', 'HIDDEN']) ||
      !finite(desktop['recovery'], ['ACTIVE', 'SUSPENDED', 'QUITTING']) ||
      !finite(desktop['reminders'], ['RECOVERING', 'READY', 'SUSPENDED', 'UNAVAILABLE', 'RESOURCE_LIMIT', 'BUSY', 'STOPPED']) ||
      !finite(desktop['reminderCapability'], ['FAKE', 'NATIVE', 'UNAVAILABLE']) || !finite(desktop['startup'], STARTUP_STATES)) return null
  return { version: 1, status: 'ok', desktop: desktop as unknown as DesktopStatus }
}
export function parseActivationResult(value: unknown): ActivationResult | null {
  const failure = parseDesktopFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'revision', 'taskOrdinal'])
  if (record?.['version'] !== 1 || record['status'] !== 'ok' || !isRevisionText(record['revision']) ||
      typeof record['taskOrdinal'] !== 'number' || !Number.isSafeInteger(record['taskOrdinal']) || record['taskOrdinal'] < 0) return null
  return { version: 1, status: 'ok', revision: record['revision'], taskOrdinal: record['taskOrdinal'] }
}
export function parseDesktopEvent(value: unknown): DesktopEvent | null {
  if ((serializedBytes(value) ?? Infinity) > 1024) return null
  const record = asExactRecord(value, ['version', 'sequence', 'kind'], ['tag'])
  if (record?.['version'] !== 1 || !positive(record['sequence'])) return null
  const kind = record['kind']
  if (kind === 'locate-reminder') return isReminderTag(record['tag']) ? { version: 1, sequence: record['sequence'], kind, tag: record['tag'] } : null
  if ('tag' in record || !finite(kind, ['surface-active', 'surface-suspended', 'desktop-status-changed'])) return null
  return { version: 1, sequence: record['sequence'], kind: kind as 'surface-active' | 'surface-suspended' | 'desktop-status-changed' }
}
