import {
  DESKTOP_CHANNELS, DESKTOP_EVENT_CHANNEL, DESKTOP_RESOLVE_CHANNEL, desktopFailure,
  parseActivationRequest, parseActivationResult, parseDesktopAck, parseDesktopEvent,
  parseDesktopRequest, parseDesktopLegacyRequest, parseDesktopStatusResult, parseStartupRequest, parseStartupResult,
  desktopControlFailure, parseDesktopControlAck,
  type DesktopEvent, type DesktopListener, type DesktopSubscription,
} from '../../contracts/desktop.js'
import type { SurfaceRole } from '../capture/capture-ports.js'

export interface DesktopTransport {
  invoke(channel: string, request: unknown): Promise<unknown>
  on(channel: string, callback: (payload: unknown) => void): () => void
}
/** Apenas callbacks locais; uma inscrição compartilhada e disposer por consumidor. */
export function createDesktopClient(transport: DesktopTransport, control: (event: DesktopEvent) => void, role: SurfaceRole = 'MANAGER') {
  const listeners = new Map<DesktopListener, number>()
  let sequence = 0
  let lastControl: DesktopEvent | undefined
  let lastLocate: DesktopEvent | undefined
  let lastCapture: DesktopEvent | undefined
  let lastShortcuts: DesktopEvent | undefined
  let handshake: Promise<unknown> | undefined
  const emit = (event: DesktopEvent): void => {
    for (const [listener, seen] of listeners) {
      if (event.sequence <= seen) continue
      listeners.set(listener, event.sequence)
      try { listener(event) } catch { /* Callback local isolado. */ }
    }
  }
  transport.on(DESKTOP_EVENT_CHANNEL, payload => {
    const event = parseDesktopEvent(payload)
    if (event === null || event.role !== role || event.sequence <= sequence) return
    sequence = event.sequence
    control(event)
    if (event.kind === 'locate-reminder') lastLocate = event
    else if (event.kind === 'capture-available') lastCapture = event
    else if (event.kind === 'shortcuts-changed') lastShortcuts = event
    else lastControl = event
    emit(event)
  })
  async function invoke<T>(channel: string, request: unknown, parse: (value: unknown) => T | null): Promise<T> {
    const result = parse(await transport.invoke(channel, request))
    if (result === null) throw new Error('desktop-transport')
    return result
  }
  return {
    getDesktopStatus: (request: unknown) => parseDesktopRequest(request) === null
      ? Promise.resolve(desktopControlFailure('INVALID_REQUEST')) : invoke(DESKTOP_CHANNELS.status, request, parseDesktopStatusResult),
    setStartAtLogin: (request: unknown) => parseStartupRequest(request) === null
      ? Promise.resolve(desktopFailure('INVALID_REQUEST')) : invoke(DESKTOP_CHANNELS.startup, request, parseStartupResult),
    requestQuit: (request: unknown) => parseDesktopLegacyRequest(request) === null
      ? Promise.resolve(desktopFailure('INVALID_REQUEST')) : invoke(DESKTOP_CHANNELS.quit, request, parseDesktopAck),
    resolveReminderActivation: (request: unknown) => parseActivationRequest(request) === null
      ? Promise.resolve(desktopFailure('INVALID_REQUEST')) : invoke(DESKTOP_RESOLVE_CHANNEL, request, parseActivationResult),
    async subscribeDesktopEvents(request: unknown, listener: DesktopListener): Promise<DesktopSubscription> {
      if (parseDesktopRequest(request) === null || typeof listener !== 'function') throw new Error('desktop-subscription')
      if (!listeners.has(listener) && listeners.size >= 8) throw new Error('desktop-subscription-limit')
      listeners.set(listener, 0)
      handshake ??= invoke(DESKTOP_CHANNELS.subscribe, { version: 2 }, parseDesktopStatusResult)
      try {
        const result = await handshake as ReturnType<typeof parseDesktopStatusResult>
        if (result?.status !== 'ok' || result.desktop.role !== role) throw new Error('desktop-subscription')
        if (result.desktop.surfaceSequence > sequence) {
          const event: DesktopEvent = { version: 2, role, sequence: result.desktop.surfaceSequence,
            kind: result.desktop.visibility === 'VISIBLE' && result.desktop.recovery === 'ACTIVE' ? 'surface-active' : 'surface-suspended' }
          sequence = event.sequence; lastControl = event; control(event)
        }
        const buffered = [lastControl, lastLocate, lastCapture, lastShortcuts].filter((event): event is DesktopEvent => event !== undefined).sort((left, right) => left.sequence - right.sequence)
        for (const event of buffered) {
          if (event.sequence <= (listeners.get(listener) ?? Infinity)) continue
          listeners.set(listener, event.sequence); listener(event)
        }
      } catch (error) { listeners.delete(listener); handshake = undefined; throw error }
      let disposed = false
      return { dispose: () => {
        if (disposed) return
        disposed = true; listeners.delete(listener)
        if (listeners.size === 0) {
          handshake = undefined; lastLocate = undefined; lastCapture = undefined; lastShortcuts = undefined
          void invoke(DESKTOP_CHANNELS.unsubscribe, { version: 2 }, parseDesktopControlAck).catch(() => undefined)
        }
      } }
    },
  }
}
