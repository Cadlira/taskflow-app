import { describe, expect, it } from 'vitest'
import { BackupResourceLedger } from '../../src/application/backup/backup-resources.js'
import type { BackupFileOpenPort } from '../../src/main/backup/backup-file-access.js'
import { readBackupPipeline } from '../../src/main/backup/backup-read-pipeline.js'

function memoryPort(content: string): BackupFileOpenPort {
  const bytes = Buffer.from(content, 'utf8')
  return {
    open: async () => {
      let offset = 0
      return {
        stat: async () => ({ isFile: true, size: bytes.length }),
        read: async (buffer: Buffer, length: number) => {
          const bytesRead = Math.min(length, bytes.length - offset)
          if (bytesRead <= 0) return { bytesRead: 0 }
          bytes.copy(buffer, 0, offset, offset + bytesRead)
          offset += bytesRead
          return { bytesRead }
        },
        close: async () => undefined,
      }
    },
  }
}

function validFile(tasks: unknown[] = []): string {
  return JSON.stringify({
    format: 'taskflow-backup',
    formatVersion: 4,
    exportedAt: '2026-10-05T12:00:00.000Z',
    app: { version: '0.1.0' },
    tasks,
  })
}

describe('readBackupPipeline (B03/B13)', () => {
  it('lê, varre e parseia sob reserva convertida, mantendo-a ativa para a preparação', async () => {
    const content = validFile([
      {
        id: 'a',
        title: 'Tarefa',
        status: 'TODO',
        priority: 'LOW',
        reminders: [],
        subtasks: [],
        tags: [],
        createdAt: '2026-09-10T09:00:00.000Z',
        updatedAt: '2026-09-10T09:00:00.000Z',
      },
    ])
    const ledger = new BackupResourceLedger()
    const result = await readBackupPipeline({ path: 'ficticio.json', ledger, openPort: memoryPort(content) })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const bytes = Buffer.byteLength(content)
    expect(result.fileBytes).toBe(bytes)
    expect(result.nodeCount).toBeGreaterThan(0)
    expect(ledger.usedBytes).toBe(3 * bytes + 128 * result.nodeCount + 4096)
    expect(ledger.activeReservations).toBe(1)
    expect(result.backup.sourceFormatVersion).toBe(4)

    ledger.release(result.reservation)
    expect(ledger.usedBytes).toBe(0)
  })

  it('recusa excesso estrutural pela varredura antes do parse, sem reserva retida', async () => {
    const depth = 70
    const content = '['.repeat(depth) + '0' + ']'.repeat(depth)
    const ledger = new BackupResourceLedger()
    const result = await readBackupPipeline({ path: 'ficticio.json', ledger, openPort: memoryPort(content) })
    expect(result).toEqual({ ok: false, code: 'RESOURCE_LIMIT' })
    expect(ledger.usedBytes).toBe(0)
  })

  it('recusa JSON inválido e separa problema de tarefas com issues seguros', async () => {
    const ledger = new BackupResourceLedger()
    expect(await readBackupPipeline({ path: 'x.json', ledger, openPort: memoryPort('{') })).toEqual({
      ok: false,
      code: 'INVALID_JSON',
    })

    const invalidTask = validFile([{ id: '', title: '' }])
    const result = await readBackupPipeline({ path: 'x.json', ledger, openPort: memoryPort(invalidTask) })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('INVALID_TASKS')
    expect(result.issues?.length).toBeGreaterThan(0)
    expect(result.issues?.every((issue) => typeof issue.field === 'string')).toBe(true)
    expect(ledger.usedBytes).toBe(0)
  })

  it('recusa quando a reserva não cabe no orçamento e libera tudo em falhas', async () => {
    const content = validFile([])
    const ledger = new BackupResourceLedger(1024)
    const result = await readBackupPipeline({ path: 'x.json', ledger, openPort: memoryPort(content) })
    expect(result).toEqual({ ok: false, code: 'RESOURCE_LIMIT' })
    expect(ledger.usedBytes).toBe(0)

    const tiny = new BackupResourceLedger()
    const tooLarge = await readBackupPipeline({
      path: 'x.json',
      ledger: tiny,
      openPort: memoryPort(content),
      limitBytes: 10,
    })
    expect(tooLarge).toEqual({ ok: false, code: 'FILE_TOO_LARGE' })
    expect(tiny.usedBytes).toBe(0)
  })

  it('recusa encoding inválido antes de qualquer parse', async () => {
    const ledger = new BackupResourceLedger()
    const invalidUtf8 = Buffer.from([0x7b, 0xc3, 0x28, 0x7d])
    const port: BackupFileOpenPort = {
      open: async () => {
        let offset = 0
        return {
          stat: async () => ({ isFile: true, size: invalidUtf8.length }),
          read: async (buffer: Buffer, length: number) => {
            const bytesRead = Math.min(length, invalidUtf8.length - offset)
            if (bytesRead <= 0) return { bytesRead: 0 }
            invalidUtf8.copy(buffer, 0, offset, offset + bytesRead)
            offset += bytesRead
            return { bytesRead }
          },
          close: async () => undefined,
        }
      },
    }
    expect(await readBackupPipeline({ path: 'x.json', ledger, openPort: port })).toEqual({
      ok: false,
      code: 'INVALID_ENCODING',
    })
    expect(ledger.usedBytes).toBe(0)
  })
})
