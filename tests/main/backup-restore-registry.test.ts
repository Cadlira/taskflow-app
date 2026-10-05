import { describe, expect, it } from 'vitest'
import { BackupResourceLedger } from '../../src/application/backup/backup-resources.js'
import { BACKUP_PREVIEW_TTL_MS } from '../../src/contracts/backup.js'
import { BackupRestoreRegistry } from '../../src/main/backup/backup-restore-registry.js'
import { buildTask } from '../support/task-fixtures.js'

function registryFixture(budget = 1024 * 1024, ttlMs = BACKUP_PREVIEW_TTL_MS) {
  const ledger = new BackupResourceLedger(budget)
  let clock = 1_000_000
  let token = 0
  const registry = new BackupRestoreRegistry({
    ledger,
    randomToken: () => `token-${(token += 1)}`,
    now: () => clock,
    ttlMs,
  })
  return { registry, ledger, advance: (ms: number) => (clock += ms), now: () => clock }
}

const publishInput = {
  contextSequence: 3,
  baseRevision: 7n,
  sourceFormatVersion: 1,
  exportedAt: '2026-10-05T12:00:00.000Z',
  appVersion: '0.1.0',
  fileTaskCount: 1,
  localTaskCount: 2,
  tasks: [buildTask()],
  chargeBytes: 512,
}

describe('BackupRestoreRegistry (B05/B06)', () => {
  it('publica com token próprio e reserva, consome uma única vez e libera o charge', () => {
    const { registry, ledger } = registryFixture()
    const published = registry.publish('doc-1', publishInput)
    expect(published.status).toBe('ok')
    if (published.status !== 'ok') return
    expect(published.preparation.token).toBe('token-1')
    expect(ledger.usedBytes).toBe(512)
    expect(registry.activePreparations).toBe(1)

    const consumed = registry.consume('doc-1', published.preparation.token)
    expect(consumed.status).toBe('ok')
    if (consumed.status !== 'ok') return
    expect(consumed.preparation.tasks).toEqual(publishInput.tasks)
    expect(ledger.usedBytes).toBe(0)

    // Consumo repetido e token alheio são inválidos e não consomem outra preparação.
    expect(registry.consume('doc-1', published.preparation.token)).toEqual({ status: 'invalid' })
    expect(registry.consume('outro-doc', published.preparation.token)).toEqual({ status: 'invalid' })
  })

  it('expira em 5 minutos monotônicos, libera a reserva e distingue expirado de inválido', () => {
    const { registry, ledger, advance } = registryFixture()
    const published = registry.publish('doc-1', publishInput)
    if (published.status !== 'ok') return
    advance(BACKUP_PREVIEW_TTL_MS - 1)
    expect(registry.current('doc-1')?.token).toBe(published.preparation.token)
    advance(1)
    expect(registry.current('doc-1')).toBeUndefined()
    expect(ledger.usedBytes).toBe(0)
    expect(registry.consume('doc-1', published.preparation.token)).toEqual({ status: 'expired' })
  })

  it('cancelar é idempotente para token próprio e não toca preparação alheia', () => {
    const { registry, ledger } = registryFixture()
    const first = registry.publish('doc-1', publishInput)
    const other = registry.publish('doc-2', publishInput)
    if (first.status !== 'ok' || other.status !== 'ok') return

    expect(registry.cancel('doc-1', first.preparation.token)).toEqual({ status: 'ok' })
    expect(registry.cancel('doc-1', first.preparation.token)).toEqual({ status: 'ok' })
    expect(ledger.usedBytes).toBe(512)
    // Token do documento 1 não cancela a preparação do documento 2.
    expect(registry.cancel('doc-2', first.preparation.token)).toEqual({ status: 'invalid' })
    expect(registry.current('doc-2')?.token).toBe(other.preparation.token)
    expect(registry.cancel('doc-2', other.preparation.token)).toEqual({ status: 'ok' })
    expect(ledger.usedBytes).toBe(0)
  })

  it('nova publicação substitui a anterior sem acumular charge e aposenta o token antigo', () => {
    const { registry, ledger } = registryFixture()
    const first = registry.publish('doc-1', publishInput)
    if (first.status !== 'ok') return
    const second = registry.publish('doc-1', { ...publishInput, chargeBytes: 700 })
    if (second.status !== 'ok') return
    expect(ledger.usedBytes).toBe(700)
    expect(registry.activePreparations).toBe(1)
    expect(registry.consume('doc-1', first.preparation.token)).toEqual({ status: 'invalid' })
    expect(registry.cancel('doc-1', first.preparation.token)).toEqual({ status: 'ok' })
    expect(registry.current('doc-1')?.token).toBe(second.preparation.token)
  })

  it('contexto novo libera preparação obsoleta; o contexto corrente permanece', () => {
    const { registry, ledger } = registryFixture()
    const published = registry.publish('doc-1', publishInput)
    if (published.status !== 'ok') return
    registry.releaseOutdated('doc-1', 3)
    expect(registry.current('doc-1')).toBeDefined()
    registry.releaseOutdated('doc-1', 4)
    expect(registry.current('doc-1')).toBeUndefined()
    expect(ledger.usedBytes).toBe(0)
  })

  it('barreira global e encerramento liberam todas as preparações', () => {
    const { registry, ledger } = registryFixture()
    registry.publish('doc-1', publishInput)
    registry.publish('doc-2', publishInput)
    expect(ledger.usedBytes).toBe(1024)
    registry.invalidateAll()
    expect(ledger.usedBytes).toBe(0)
    expect(registry.activePreparations).toBe(0)

    registry.publish('doc-1', publishInput)
    registry.forgetDocument('doc-1')
    expect(ledger.usedBytes).toBe(0)
  })

  it('recusa publicação que não cabe no orçamento sem reter reserva', () => {
    const { registry, ledger } = registryFixture(256)
    const published = registry.publish('doc-1', publishInput)
    expect(published).toEqual({ status: 'resource-limit' })
    expect(ledger.usedBytes).toBe(0)
    expect(registry.activePreparations).toBe(0)
  })
})
