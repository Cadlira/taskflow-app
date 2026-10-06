import { desktopFailure, type StartupResult, type StartupState } from '../../contracts/desktop.js'
import { STARTUP_NAME, ownStartupCommand, sameWindowsPath, type NativeRegistry } from './native-identity.js'

export interface StartupPorts {
  installed(): boolean
  validate(): Promise<boolean>
  executable: string
  registry: NativeRegistry
  get(): { launchItems: readonly { name: string; scope: string; path: string; args: readonly string[]; enabled: boolean }[] }
  set(enabled: boolean): void
  changed(state: StartupState): void
}
/** Windows é a única fonte durável; estado incerto não conserva/reexecuta intenção. */
export class StartupService {
  #busy = false
  #state: StartupState = 'UNAVAILABLE'
  constructor(readonly ports: StartupPorts) {}
  get state(): StartupState { return this.#state }
  #adopt(state: StartupState): StartupState {
    if (state !== this.#state) { this.#state = state; this.ports.changed(state) }
    return state
  }
  async read(): Promise<StartupState> {
    if (!this.ports.installed()) return this.#adopt('UNAVAILABLE')
    try {
      const raw = await this.ports.registry.read()
      if (raw === undefined) return this.#adopt('UNKNOWN')
      if (raw.future || raw.foreignStartup) return this.#adopt('UNKNOWN')
      if (raw.run === null) return this.#adopt('OFF')
      if (raw.run !== ownStartupCommand(this.ports.executable)) return this.#adopt('UNKNOWN')
      // No Electron 44.5.1 (Windows) `launchItems` devolve `args: []` mesmo quando o Run tem
      // argumentos; o adapter restrito já confere nome+args exatos em `raw.run`. O launchItem
      // entra apenas com nome/escopo/path e define habilitado/desabilitado externamente.
      const own = this.ports.get().launchItems.filter(item => item.name === STARTUP_NAME && item.scope === 'user' &&
        sameWindowsPath(item.path, this.ports.executable))
      return this.#adopt(own.length !== 1 ? 'UNKNOWN' : own[0]?.enabled === true ? 'ON' : 'DISABLED_EXTERNALLY')
    } catch { return this.#adopt('UNKNOWN') }
  }
  async set(desired: boolean, current: () => boolean): Promise<StartupResult> {
    if (this.#busy) return desktopFailure('BUSY')
    if (!this.ports.installed()) return desktopFailure('UNAVAILABLE')
    this.#busy = true
    try {
      if (!await this.ports.validate()) return desktopFailure('UNAVAILABLE')
      const before = await this.read()
      if (before === 'UNKNOWN' || before === 'UNAVAILABLE') return desktopFailure('STATE_UNKNOWN')
      if (!current()) return desktopFailure('SESSION_CLOSED')
      if ((desired && before === 'ON') || (!desired && before === 'OFF')) return { version: 1, status: 'ok', startup: before }
      this.ports.set(desired)
      if (!desired && !await this.ports.registry.removeStartupApproval()) {
        await this.read(); return desktopFailure('NATIVE_OPERATION_FAILED')
      }
      const after = await this.read()
      if (!current()) return desktopFailure('SESSION_CLOSED')
      return (desired && after === 'ON') || (!desired && after === 'OFF')
        ? { version: 1, status: 'ok', startup: after }
        : desktopFailure(after === 'UNKNOWN' ? 'STATE_UNKNOWN' : 'NATIVE_OPERATION_FAILED')
    } catch { await this.read(); return desktopFailure('NATIVE_OPERATION_FAILED') }
    finally { this.#busy = false }
  }
}
