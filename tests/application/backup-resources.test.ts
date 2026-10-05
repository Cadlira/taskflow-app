import { describe, expect, it } from 'vitest'
import { BACKUP_SCAN_LIMITS, scanBackupJson } from '../../src/application/backup/backup-scanner.js'
import {
  backupParseChargeBytes,
  BackupResourceLedger,
  BACKUP_BUDGET_BYTES,
} from '../../src/application/backup/backup-resources.js'
import { utf8ByteLength } from '../../src/contracts/text.js'

describe('scanBackupJson (B03/B13)', () => {
  it('conta nós de chaves, containers e escalares', () => {
    expect(scanBackupJson('{"a":1}')).toEqual({ ok: true, nodes: 3 })
    expect(scanBackupJson('[1,[2],{}]')).toEqual({ ok: true, nodes: 5 })
    expect(scanBackupJson('"texto"')).toEqual({ ok: true, nodes: 1 })
  })

  it('aceita exatamente 64 de profundidade e recusa 65', () => {
    const depth = (value: number): string => '['.repeat(value) + '0' + ']'.repeat(value)
    expect(scanBackupJson(depth(64))).toEqual({ ok: true, nodes: 65 })
    expect(scanBackupJson(depth(65))).toEqual({ ok: false, reason: 'RESOURCE_LIMIT' })
  })

  it('respeita o teto de nós injetado como representação do limite real', () => {
    const limits = { maxDepth: BACKUP_SCAN_LIMITS.maxDepth, maxNodes: 5 }
    expect(scanBackupJson('[1,2,3,4]', limits)).toEqual({ ok: true, nodes: 5 })
    expect(scanBackupJson('[1,2,3,4,5]', limits)).toEqual({ ok: false, reason: 'RESOURCE_LIMIT' })
  })

  it('distingue sintaxe/escape inválidos de excesso de recursos', () => {
    expect(scanBackupJson('{')).toEqual({ ok: false, reason: 'INVALID_JSON' })
    expect(scanBackupJson('{"a":"\\x"}')).toEqual({ ok: false, reason: 'INVALID_JSON' })
    expect(scanBackupJson('{"a":"\n"}')).toEqual({ ok: false, reason: 'INVALID_JSON' })
    expect(scanBackupJson('')).toEqual({ ok: false, reason: 'INVALID_JSON' })
    expect(scanBackupJson('{"a":1} extra')).toEqual({ ok: false, reason: 'INVALID_JSON' })
  })

  it('lê um arquivo no teto sem estourar limites estruturais', () => {
    const file = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-10-05T12:00:00.000Z',
      app: { version: '1.0.0' },
      tasks: Array.from({ length: 2000 }, (_, index) => ({ id: `t-${index}`, title: 'x'.repeat(200) })),
    })
    const result = scanBackupJson(file)
    expect(result.ok).toBe(true)
  })
})

describe('BackupResourceLedger (B13)', () => {
  it('recusa reserva que não cabe sem alterar o total e libera em release', () => {
    const ledger = new BackupResourceLedger(1000)
    const first = ledger.reserve(600)
    expect(first.status).toBe('ok')
    expect(ledger.usedBytes).toBe(600)
    expect(ledger.reserve(500)).toEqual({ status: 'resource-limit' })
    expect(ledger.usedBytes).toBe(600)
    if (first.status === 'ok') ledger.release(first.reservation)
    expect(ledger.usedBytes).toBe(0)
    expect(ledger.activeReservations).toBe(0)
  })

  it('admite sobreposição de fases somente quando as duas charges cabem juntas', () => {
    const ledger = new BackupResourceLedger(2000)
    const parse = ledger.reserve(1200)
    expect(parse.status).toBe('ok')
    expect(ledger.reserve(900)).toEqual({ status: 'resource-limit' })
    const preparation = ledger.reserve(800)
    expect(preparation.status).toBe('ok')
    expect(ledger.usedBytes).toBe(2000)
  })

  it('troca uma reserva ativa por outra sem contar duas vezes', () => {
    const ledger = new BackupResourceLedger(1000)
    const reservation = ledger.reserve(600)
    expect(reservation.status).toBe('ok')
    if (reservation.status !== 'ok') return
    const replaced = ledger.replace(reservation.reservation, 700)
    expect(replaced.status).toBe('ok')
    expect(ledger.usedBytes).toBe(700)
    expect(ledger.activeReservations).toBe(1)
    if (replaced.status === 'ok') {
      expect(ledger.replace(replaced.reservation, 2000)).toEqual({ status: 'resource-limit' })
      expect(ledger.usedBytes).toBe(700)
      ledger.release(replaced.reservation)
      expect(ledger.usedBytes).toBe(0)
    }
  })

  it('calcula as charges D2 em bytes UTF-8 reais', () => {
    const bytes = utf8ByteLength('çãé')
    expect(bytes).toBe(6)
    expect(backupParseChargeBytes(10, 2)).toBe(3 * 10 + 128 * 2 + 4096)
    expect(BACKUP_BUDGET_BYTES).toBe(128 * 1024 * 1024)
  })

  it('oito preparações independentes cabem no orçamento global sem vazamento', () => {
    const ledger = new BackupResourceLedger()
    const reservations = Array.from({ length: 8 }, () => ledger.reserve(BACKUP_BUDGET_BYTES / 8))
    for (const reservation of reservations) expect(reservation.status).toBe('ok')
    expect(ledger.usedBytes).toBe(8 * (BACKUP_BUDGET_BYTES / 8))
    expect(ledger.reserve(1)).toEqual({ status: 'resource-limit' })
    for (const reservation of reservations) {
      if (reservation.status === 'ok') ledger.release(reservation.reservation)
    }
    expect(ledger.usedBytes).toBe(0)
  })
})
