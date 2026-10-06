import { ReminderService, REMINDER_RUNTIME_LIMITS } from '../../application/reminders/reminder-service.js'
import type { ReminderServicePorts, ReminderServiceStatus } from '../../application/reminders/reminder-ports.js'
import type { ReminderProjection } from '../../application/reminders/reminder-index.js'
import type { StorageCoordinator } from '../storage/coordinator.js'
import { processReminder, REMINDER_OWNER, type ReminderEffectCode } from './processor.js'
import { projectTaskReminders } from './projection.js'

export interface ReminderRuntimeOptions {
  storage: StorageCoordinator
  active(): boolean
  now?: () => Date
  monotonic?: () => number
  submit: ReminderServicePorts['submit']
  statusChanged(status: ReminderServiceStatus): void
  effect(code: ReminderEffectCode): void
  agenda?: Pick<ReminderServicePorts, 'arm' | 'yield'>
  memoryLimit?: number
}

/** Todos os produtores compartilham o coordenador, sem segunda conexão. */
export function createReminderRuntime(options: ReminderRuntimeOptions): {
  service: ReminderService
  dispose(): void
} {
  const now = options.now ?? (() => new Date())
  const storage = options.storage
  let disposed = false
  const ready = (): boolean => !disposed && options.active() && storage.availability.state === 'ready'
  const agenda = options.agenda ?? {
    arm: (delay: number, callback: () => void): (() => void) => {
      const timer = setTimeout(callback, delay)
      return () => clearTimeout(timer)
    },
    yield: (): Promise<void> => new Promise((resolve) => setImmediate(resolve)),
  }
  const service: ReminderService = new ReminderService({
    now, monotonic: options.monotonic ?? (() => performance.now()), ...agenda,
    ready,
    statusChanged: options.statusChanged,
    submit: options.submit,
    page: (afterId) => storage.read((reader) => {
      const tasks: Array<{ id: string; reminders: ReminderProjection[] }> = []
      let lastId = afterId
      let complete = true
      const clock = now()
      for (const stored of reader.iterateTasks(afterId)) {
        if (tasks.length >= REMINDER_RUNTIME_LIMITS.page) { complete = false; break }
        tasks.push({ id: stored.task.id, reminders: projectTaskReminders(stored.task, clock) })
        lastId = stored.task.id
      }
      return { tasks, afterId: lastId, complete }
    }, { owner: REMINDER_OWNER, admit: ready }),
    tasks: (ids) => storage.read((reader) => {
      const clock = now()
      return ids.map((id) => {
        const stored = reader.getTask(id)
        return { id, reminders: stored === undefined ? [] : projectTaskReminders(stored.task, clock) }
      })
    }, { owner: REMINDER_OWNER, admit: ready }),
    process: (key, reservation) => processReminder(storage, key, {
      ready, epoch: () => service.epoch, now,
      completed: (occurrence, completion) => {
        if (completion.result.ok && completion.committed) service.consumed(occurrence)
      },
      report: options.effect,
    }, reservation),
  }, options.memoryLimit)
  let wakeScheduled = false
  const wakeAfterRelease = (): void => {
    if (wakeScheduled || disposed) return
    wakeScheduled = true
    setImmediate(() => { wakeScheduled = false; if (!disposed) service.wake() })
  }
  const changed = storage.onTasksChanged((ids, reminder) => {
    if (!reminder) { service.dirty(ids); wakeAfterRelease() }
  })
  const recovered = storage.onRecovered(() => { service.reset(); wakeAfterRelease() })
  const unavailable = storage.onUnavailable(() => { service.reset() })
  return {
    service,
    dispose: () => {
      if (disposed) return
      disposed = true; service.stop(); storage.cancelOwner(REMINDER_OWNER)
      changed(); recovered(); unavailable()
    },
  }
}

/** Barreira de backup APPLIED/UNCHANGED/empty: reset imediato e reconstrução fora da conclusão. */
export function resetForBackup(runtime: { service: Pick<ReminderService, 'reset' | 'wake'> } | undefined): void {
  if (runtime === undefined) return
  runtime.service.reset()
  setImmediate(() => runtime.service.wake())
}
