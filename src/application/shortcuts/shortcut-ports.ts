import type { ShortcutAction, ShortcutCombination, ShortcutPreferences } from '../../domain/global-shortcuts.js'

export const SHORTCUT_PREFERENCES_BYTES = 8 * 1024
export interface ShortcutRegistry {
  register(combination: ShortcutCombination, callback: () => void): boolean
  isRegistered(combination: ShortcutCombination): boolean
  unregister(combination: ShortcutCombination): void
}
export type ShortcutPreferencesRead =
  | { ok: true; preferences: ShortcutPreferences; missing: boolean }
  | { ok: false; code: 'PREFERENCES_INVALID' | 'UNKNOWN' }
export type ShortcutPreferencesWrite =
  | { ok: true; preferences: ShortcutPreferences }
  | { ok: false; code: 'PREFERENCES_INVALID' | 'STALE_SETTINGS' | 'UNAVAILABLE' | 'RESOURCE_LIMIT' | 'UNKNOWN' }
export interface ShortcutPreferencesStore {
  /** Revalide fonte durável inclusive mudanças externas; missing nunca grava defaults. */
  read(): Promise<ShortcutPreferencesRead>
  /** Publicação verificada com CAS; incerto bloqueia novas escritas até reconciliação explícita. */
  publish(expected: ShortcutPreferences, next: ShortcutPreferences): Promise<ShortcutPreferencesWrite>
  reconcile(): Promise<ShortcutPreferencesRead>
}
export type ShortcutReason = 'CONFLICT' | 'NATIVE_FAILURE' | 'PREFERENCES_INVALID' | 'PROFILE_DISABLED' | 'SUSPENDED'
export interface ShortcutObservation {
  action: ShortcutAction
  desired: ShortcutCombination | null
  observed: 'REGISTERED' | 'NONE' | 'UNAVAILABLE' | 'UNKNOWN'
  reason?: ShortcutReason
}
export interface ShortcutClock {
  monotonic(): number
  arm(delayMs: number, callback: () => void): () => void
}
