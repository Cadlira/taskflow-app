import type { ReminderSubmissionCandidate } from '../../application/storage/unit-of-work.js'
import type { ReminderServicePorts } from '../../application/reminders/reminder-ports.js'
import { reminderTag } from './projection.js'

export interface NativeNotice {
  on(event: 'show' | 'close' | 'failed' | 'click', callback: () => void): void
  removeAllListeners(): void
  show(): void
  close(): void
}
export interface NotificationPort {
  supported(): boolean
  create(options: { id: string; title: string; body: string; icon: string }): NativeNotice
}
const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Notifier com a MESMA rota única de ativação. No Electron 44.5.1/Windows um clique em toast
 * sem ações com o app aberto só dispara o evento in-process `click` (o `handleActivation` COM
 * cobre ativação estruturada/cold start); por isso o `click` alimenta a mesma rota, e o
 * coalescimento de 2 s da rota evita navegação dupla quando as duas vias coincidirem.
 */
export function createNativeNotifier(
  port: NotificationPort,
  icon: string,
  failed: () => void,
  activated: (tag: string) => void,
): ReminderServicePorts['submit'] {
  return (candidate: ReminderSubmissionCandidate, completed: () => void) => {
    if (!port.supported()) { failed(); completed(); return () => undefined }
    const tag = reminderTag(candidate)
    const notification = port.create({ id: tag, title: candidate.title, body: `Prazo: ${format.format(new Date(candidate.dueAt))}`, icon })
    let settled = false
    const cleanup = (): void => { notification.removeAllListeners() }
    const settle = (): void => { if (settled) return; settled = true; completed() }
    notification.on('show', settle)
    notification.on('close', () => { settle(); cleanup() })
    notification.on('failed', () => { failed(); settle(); cleanup() })
    notification.on('click', () => { activated(tag); cleanup() })
    try { notification.show() } catch { failed(); settle(); cleanup() }
    return (cancel: boolean): void => {
      if (!cancel) return // Liberação pós-show conserva o listener de click até close/click.
      try { notification.close() } catch { /* Cancelamento best effort. */ }
      cleanup(); settled = true
    }
  }
}
/** Dev/test não instanciam Notification nem escrevem identidade de produção. */
export const fakeReminderSubmit: ReminderServicePorts['submit'] = (_candidate, completed) => {
  completed(); return () => undefined
}
