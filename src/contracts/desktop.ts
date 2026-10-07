import { asExactRecord, serializedBytes } from './record.js'
import { STATE_ERROR_CODES, isRevisionText } from './state.js'
import type { ReminderServiceStatus } from '../application/reminders/reminder-ports.js'
import type { SurfaceRole } from '../application/capture/capture-ports.js'
import { isCaptureId, isEntryRevision, isEntrySequence } from './capture-shortcuts.js'

export const DESKTOP_CHANNELS = {
  status: 'desktop:status:v2', startup: 'desktop:startup:v1', quit: 'desktop:quit:v1',
  subscribe: 'desktop:subscribe:v2', unsubscribe: 'desktop:unsubscribe:v2',
} as const
export const DESKTOP_RESOLVE_CHANNEL = 'desktop:resolve-reminder:v1'
export const DESKTOP_EVENT_CHANNEL = 'desktop:event:v2'
export const DESKTOP_ERROR_CODES = [...STATE_ERROR_CODES, 'UNAVAILABLE', 'NATIVE_OPERATION_FAILED', 'STATE_UNKNOWN', 'NOT_AVAILABLE'] as const
export type DesktopErrorCode = (typeof DESKTOP_ERROR_CODES)[number]
export type StartupState = 'OFF' | 'ON' | 'DISABLED_EXTERNALLY' | 'UNAVAILABLE' | 'UNKNOWN'
export type ReminderCapability = 'FAKE' | 'NATIVE' | 'UNAVAILABLE'
export interface DesktopStatus {
  role: SurfaceRole
  surfaceSequence: number
  visibility: 'VISIBLE' | 'HIDDEN'
  recovery: 'ACTIVE' | 'SUSPENDED' | 'QUITTING'
  reminders: ReminderServiceStatus
  reminderCapability: ReminderCapability
  startup: StartupState
}
export type DesktopRequest = Readonly<{ version: 2 }>
export type DesktopLegacyRequest = Readonly<{ version: 1 }>
export type StartupRequest = Readonly<{ version: 1; desired: boolean }>
export type ActivationRequest = Readonly<{ version: 1; tag: string }>
export type DesktopFailure = Readonly<{ version: 1; status: 'error'; code: DesktopErrorCode }>
export type DesktopAck = Readonly<{ version: 1; status: 'ok' }>
export type DesktopControlFailure = Readonly<{ version: 2; status: 'error'; code: DesktopErrorCode }>
export type DesktopStatusResult = Readonly<{ version: 2; status: 'ok'; desktop: DesktopStatus }> | DesktopControlFailure
export type DesktopControlAck = Readonly<{ version: 2; status: 'ok' }> | DesktopControlFailure
export type StartupResult = Readonly<{ version: 1; status: 'ok'; startup: StartupState }> | DesktopFailure
export type ActivationResult = Readonly<{ version: 1; status: 'ok'; revision: string; taskOrdinal: number }> | DesktopFailure
export type DesktopEvent =
  | Readonly<{ version: 2; role: SurfaceRole; sequence: number; kind: 'surface-active' | 'surface-suspended' | 'desktop-status-changed' }>
  | Readonly<{ version: 2; role: 'MANAGER'; sequence: number; kind: 'locate-reminder'; tag: string }>
  | Readonly<{ version: 2; role: SurfaceRole; sequence: number; kind: 'capture-available'; id: string; captureSequence: string; replaced: boolean }>
  | Readonly<{ version: 2; role: SurfaceRole; sequence: number; kind: 'shortcuts-changed'; configRevision: string; statusSequence: string }>
export type DesktopListener = (event: DesktopEvent) => void
export type DesktopSubscription = { dispose(): void }

export function desktopFailure(code: DesktopErrorCode): DesktopFailure { return { version: 1, status: 'error', code } }
export function desktopControlFailure(code: DesktopErrorCode): DesktopControlFailure { return { version: 2, status: 'error', code } }
export function isReminderTag(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) }
export function parseDesktopRequest(value: unknown): DesktopRequest | null {
  const record = asExactRecord(value, ['version'])
  return record?.['version'] === 2 && (serializedBytes(value) ?? Infinity) <= 1024 ? { version: 2 } : null
}
export function parseDesktopLegacyRequest(value: unknown): DesktopLegacyRequest | null {
  const record = asExactRecord(value, ['version'])
  return record?.['version'] === 1 && (serializedBytes(value) ?? Infinity) <= 1024 ? { version: 1 } : null
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
  const failure = parseDesktopControlFailure(value)
  if (failure !== null) return failure
  const record = asExactRecord(value, ['version', 'status', 'desktop'])
  if (record?.['version'] !== 2 || record['status'] !== 'ok') return null
  const desktop = asExactRecord(record['desktop'], ['role', 'surfaceSequence', 'visibility', 'recovery', 'reminders', 'reminderCapability', 'startup'])
  if (desktop === null || !finite(desktop['role'], ['MANAGER', 'QUICK_ADD']) || !positive(desktop['surfaceSequence']) || !finite(desktop['visibility'], ['VISIBLE', 'HIDDEN']) ||
      !finite(desktop['recovery'], ['ACTIVE', 'SUSPENDED', 'QUITTING']) ||
      !finite(desktop['reminders'], ['RECOVERING', 'READY', 'SUSPENDED', 'UNAVAILABLE', 'RESOURCE_LIMIT', 'BUSY', 'STOPPED']) ||
      !finite(desktop['reminderCapability'], ['FAKE', 'NATIVE', 'UNAVAILABLE']) || !finite(desktop['startup'], STARTUP_STATES)) return null
  if ((serializedBytes(value) ?? Infinity) > 1024) return null
  return { version: 2, status: 'ok', desktop: desktop as unknown as DesktopStatus }
}
export function parseDesktopControlFailure(value: unknown): DesktopControlFailure | null {
  const record = asExactRecord(value, ['version', 'status', 'code'])
  return record?.['version'] === 2 && record['status'] === 'error' && finite(record['code'], DESKTOP_ERROR_CODES)
    ? desktopControlFailure(record['code'] as DesktopErrorCode) : null
}
export function parseDesktopControlAck(value: unknown): DesktopControlAck | null {
  const failure = parseDesktopControlFailure(value)
  if (failure) return failure
  const record = asExactRecord(value, ['version', 'status'])
  return record?.['version'] === 2 && record['status'] === 'ok' ? { version: 2, status: 'ok' } : null
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
  const record = asExactRecord(value, ['version', 'role', 'sequence', 'kind'], ['tag', 'id', 'captureSequence', 'replaced', 'configRevision', 'statusSequence'])
  if (record?.['version'] !== 2 || !positive(record['sequence']) || !finite(record['role'], ['MANAGER', 'QUICK_ADD'])) return null
  const role = record['role'] as SurfaceRole
  const kind = record['kind']
  const base = { version: 2 as const, role, sequence: record['sequence'] }
  // Medição após validar propriedades primitivas; não executa getters/toJSON de payload inválido.
  if (Object.values(record).some(field => field !== null && typeof field === 'object' || typeof field === 'function') || (serializedBytes(record) ?? Infinity) > 1024) return null
  if (kind === 'locate-reminder') return Object.keys(record).length === 5 && role === 'MANAGER' && isReminderTag(record['tag'])
    ? { ...base, role: 'MANAGER', kind, tag: record['tag'] } : null
  if (kind === 'capture-available') return Object.keys(record).length === 7 && isCaptureId(record['id']) && isEntrySequence(record['captureSequence']) && typeof record['replaced'] === 'boolean'
    ? { ...base, kind, id: record['id'], captureSequence: record['captureSequence'], replaced: record['replaced'] } : null
  if (kind === 'shortcuts-changed') return Object.keys(record).length === 6 && isEntryRevision(record['configRevision']) && isEntrySequence(record['statusSequence'])
    ? { ...base, kind, configRevision: record['configRevision'], statusSequence: record['statusSequence'] } : null
  if (Object.keys(record).length !== 4 || !finite(kind, ['surface-active', 'surface-suspended', 'desktop-status-changed'])) return null
  return { ...base, kind: kind as 'surface-active' | 'surface-suspended' | 'desktop-status-changed' }
}
