export interface DesktopWindow {
  destroyed(): boolean
  hide(): void
  show(): void
  focus(): void
  restore(): void
}
export interface DesktopLifecyclePorts {
  window(): DesktopWindow | undefined
  create(): DesktopWindow
  admit(): void
  withdraw(): void
  suspended(): void
  active(): void
  pauseReminders(): void
  resumeReminders(): void
  stop(): void
  quit(): void
}

/** O main é o único dono da visibilidade, energia e encerramento. */
export class DesktopLifecycle {
  #hidden = false
  #suspended = false
  #quitting = false
  #tray = false
  constructor(readonly ports: DesktopLifecyclePorts) {}
  get visibility(): 'VISIBLE' | 'HIDDEN' { return this.#hidden ? 'HIDDEN' : 'VISIBLE' }
  get power(): 'ACTIVE' | 'SUSPENDED' | 'QUITTING' { return this.#quitting ? 'QUITTING' : this.#suspended ? 'SUSPENDED' : 'ACTIVE' }
  get remindersActive(): boolean { return !this.#suspended && !this.#quitting }
  get trayValid(): boolean { return this.#tray }
  setTray(valid: boolean): void {
    this.#tray = valid
    if (!valid && this.#hidden && !this.#quitting) this.open()
  }
  close(): boolean {
    if (this.#quitting) return false
    if (!this.#tray) { this.quit(); return false }
    this.hide(); return true
  }
  hide(): void {
    if (this.#quitting || this.#hidden || !this.#tray) return
    this.#hidden = true
    this.ports.withdraw(); this.ports.suspended(); this.ports.window()?.hide()
  }
  open(): void {
    if (this.#quitting) return
    let window = this.ports.window()
    if (window === undefined || window.destroyed()) window = this.ports.create()
    this.#hidden = false
    window.restore(); window.show(); window.focus()
    if (!this.#suspended) { this.ports.admit(); this.ports.active() }
  }
  suspend(): void {
    if (this.#quitting || this.#suspended) return
    this.#suspended = true
    this.ports.withdraw(); this.ports.suspended(); this.ports.pauseReminders()
  }
  resume(): void {
    if (this.#quitting || !this.#suspended) return
    this.#suspended = false; this.ports.resumeReminders()
    if (!this.#hidden) { this.ports.admit(); this.ports.active() }
  }
  rendererGone(): void {
    this.ports.withdraw()
    if (!this.#quitting) this.open()
  }
  /** `window-all-closed`: sem janela não se recria superfície; tray válido mantém o processo. */
  windowAllClosed(trayValid: boolean): void {
    this.#tray = trayValid
    if (!trayValid && !this.#quitting) this.quit()
  }
  quit(): void {
    if (this.#quitting) return
    this.#quitting = true
    this.ports.withdraw(); this.ports.suspended(); this.ports.stop(); this.ports.quit()
  }
}
