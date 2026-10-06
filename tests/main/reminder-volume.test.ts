// @vitest-environment node
import { cpus } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createReminderRuntime } from '../../src/main/reminders/runtime.js'
import { buildTask } from '../support/task-fixtures.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)
describe('M12 rebuild sobre SQLite e projeção reais, notificações fictícias', () => {
  it.each([1000, 10000])('mede %d tarefas ×10 sem truncar nem duplicar agenda', async (count) => {
    const storage = openCoordinator(createProductFile())
    const dueAt = '2026-12-01T12:00:00.000Z'
    const tasks = Array.from({ length: count }, (_, i) => buildTask({
      id: `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`, dueAt,
      reminders: Array.from({ length: 10 }, (_, r) => ({
        id: `11111111-1111-4111-8111-${r.toString().padStart(12, '0')}`, type: 'OFFSET' as const, offsetMinutes: r,
      })),
    }))
    expectOk(await storage.run((unit) => unit.saveTasks(tasks)))
    const measurements: number[] = []
    const off = storage.onUnitMeasured((ms) => measurements.push(ms))
    const before = process.memoryUsage()
    const started = performance.now()
    const runtime = createReminderRuntime({ storage, active: () => true, now: () => new Date('2026-10-06T12:00:00Z'),
      submit: () => () => undefined, statusChanged: () => undefined, effect: () => undefined })
    expect(await runtime.service.recover()).toBe(true)
    const elapsed = performance.now() - started
    const memory = process.memoryUsage()
    const sorted = measurements.sort((a, b) => a - b)
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
    process.stdout.write(`REMINDER_M12 ${JSON.stringify({ count, reminders: count * 10,
      rebuildMs: elapsed, sqlP95Ms: p95, charge: runtime.service.charge, heapDelta: memory.heapUsed - before.heapUsed,
      rss: memory.rss, runtime: storage.runtime, cpu: cpus()[0]?.model })}\n`)
    expect(runtime.service.occurrences).toBe(count * 10)
    expect(runtime.service.charge).toBeLessThanOrEqual(64 * 1024 * 1024)
    expect(elapsed).toBeLessThanOrEqual(count === 1000 ? 5000 : 10000)
    expect(p95).toBeLessThanOrEqual(100)
    runtime.dispose(); off()
  }, 60000)
})
