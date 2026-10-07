import type { SurfaceRole } from '../../application/capture/capture-ports.js'
export interface DesktopWindow {
  destroyed(): boolean
  hide(): void
  show(): void
  focus(): void
  restore(): void
}
export interface DesktopLifecyclePorts {
  window(role: SurfaceRole): DesktopWindow | undefined
  create(role: SurfaceRole): DesktopWindow
  admit(role: SurfaceRole): void
  withdraw(role: SurfaceRole): void
  suspended(role: SurfaceRole): void
  active(role: SurfaceRole): void
  pauseReminders(): void
  resumeReminders(): void | Promise<boolean>
  resumed?(): void
  stop(): void
  quit(): void
}

/** O main é o único dono da visibilidade, energia e encerramento. */
export class DesktopLifecycle {
  readonly #hidden = new Map<SurfaceRole, boolean>([['MANAGER', false]])
  #suspended = false
  #resuming = false
  #resumeEpoch = 0
  #quitting = false
  #tray = false
  constructor(readonly ports: DesktopLifecyclePorts) {}
  get visibility(): 'VISIBLE' | 'HIDDEN' { return this.visibilityFor('MANAGER') }
  visibilityFor(role: SurfaceRole): 'VISIBLE' | 'HIDDEN' { return this.#hidden.get(role) === false ? 'VISIBLE' : 'HIDDEN' }
  get power(): 'ACTIVE' | 'SUSPENDED' | 'QUITTING' { return this.#quitting ? 'QUITTING' : this.#suspended ? 'SUSPENDED' : 'ACTIVE' }
  get remindersActive(): boolean { return (!this.#suspended || this.#resuming) && !this.#quitting }
  get trayValid(): boolean { return this.#tray }
  setTray(valid: boolean): void {
    this.#tray = valid
    if (!valid && !this.#quitting && [...this.#hidden.values()].some(hidden => hidden) &&
      ![...this.#hidden].some(([role, hidden]) => !hidden && this.#live(role))) this.open()
  }
  #live(role: SurfaceRole): boolean { const window = this.ports.window(role); return window !== undefined && !window.destroyed() }
  close(role: SurfaceRole = 'MANAGER'): boolean {
    if (this.#quitting) return false
    if (!this.#tray) {
      const other = [...this.#hidden].some(([candidate, hidden]) => candidate !== role && !hidden && this.#live(candidate))
      if (!other) this.quit()
      else { this.#hidden.delete(role); this.ports.withdraw(role); this.ports.suspended(role) }
      return false
    }
    this.hide(role); return true
  }
  hide(role: SurfaceRole = 'MANAGER'): void {
    if (this.#quitting || this.#hidden.get(role) === true || !this.#tray) return
    this.#hidden.set(role, true)
    this.ports.withdraw(role); this.ports.suspended(role); this.ports.window(role)?.hide()
  }
  open(role: SurfaceRole = 'MANAGER'): void {
    if (this.#quitting) return
    let window = this.ports.window(role)
    if (window === undefined || window.destroyed()) window = this.ports.create(role)
    this.#hidden.set(role, false)
    window.restore(); window.show(); window.focus()
    if (!this.#suspended) { this.ports.admit(role); this.ports.active(role) }
  }
  suspend(): void {
    if (this.#quitting || (this.#suspended && !this.#resuming)) return
    this.#resumeEpoch++; this.#resuming = false
    this.#suspended = true
    for (const role of this.#hidden.keys()) { this.ports.withdraw(role); this.ports.suspended(role) }
    this.ports.pauseReminders()
  }
  resume(): void {
    if (this.#quitting || !this.#suspended || this.#resuming) return
    this.#resuming = true
    const epoch = ++this.#resumeEpoch
    const finish = (recovered: boolean): void => {
      if (epoch !== this.#resumeEpoch || this.#quitting) return
      this.#resuming = false
      if (!recovered) { this.ports.pauseReminders(); return }
      this.#suspended = false; this.ports.resumed?.()
      this.#admitVisible()
    }
    try {
      const result = this.ports.resumeReminders()
      if (result === undefined) finish(true)
      else void result.then(finish, () => finish(false))
    } catch { finish(false) }
  }
  #admitVisible(): void {
    for (const [role, hidden] of this.#hidden) if (!hidden && this.#live(role)) { this.ports.admit(role); this.ports.active(role) }
  }
  rendererGone(role: SurfaceRole = 'MANAGER'): void {
    this.ports.withdraw(role)
    if (!this.#quitting) this.open(role)
  }
  /** `window-all-closed`: sem janela não se recria superfície; tray válido mantém o processo. */
  windowAllClosed(trayValid: boolean): void {
    this.#tray = trayValid
    if (!trayValid && !this.#quitting) this.quit()
  }
  quit(): void {
    if (this.#quitting) return
    this.#quitting = true; this.#resumeEpoch++; this.#resuming = false
    for (const role of this.#hidden.keys()) { this.ports.withdraw(role); this.ports.suspended(role) }
    this.ports.stop(); this.ports.quit()
  }
}
