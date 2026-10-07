import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readBackupFile } from '../../src/application/backup/backup-file.js'
import { BackupResourceLedger } from '../../src/application/backup/backup-resources.js'
import type { Task } from '../../src/domain/task.js'
import type { TaskStorageReader } from '../../src/application/storage/unit-of-work.js'
import { BackupExportService, type BackupExportStorage } from '../../src/main/backup/backup-export-service.js'
import { BackupJobGate, type BackupDialogAnswer, type BackupDialogBroker } from '../../src/main/backup/backup-job.js'
import type { DocumentTicket } from '../../src/main/ipc/document-sessions.js'
import { buildTask } from '../support/task-fixtures.js'

const workDir = mkdtempSync(join(tmpdir(), 'tfa007-export-'))
const protectedRoot = join(workDir, 'userData')
mkdirSync(protectedRoot, { recursive: true })

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

const ticket: DocumentTicket = { role: 'MANAGER', contentsId: 1, generation: 1, key: '1:1' }

function storageWith(tasks: Task[]): BackupExportStorage {
  return {
    read: async (callback) => {
      const reader = {
        baseRevision: 7n,
        listTasks: () => tasks.map((task) => ({ task, contentRevision: 7n, editRevision: 7n })),
        getTask: () => undefined,
        listTrash: () => [],
        getTrashItem: () => undefined,
        iterateTasks: function* () {
          for (const task of tasks) yield { task, contentRevision: 7n, editRevision: 7n }
        },
        iterateTrash: function* () {},
        iterateCarrierSummaries: function* () {},
      } as unknown as TaskStorageReader
      return { ok: true, value: callback(reader), committed: false, revision: 7n }
    },
  }
}

function dialogsSavingAt(filePaths: string[]): BackupDialogBroker {
  return { show: async (): Promise<BackupDialogAnswer> => ({ canceled: false, filePaths }) }
}

interface Harness {
  service: BackupExportService
  gate: BackupJobGate
  ledger: BackupResourceLedger
  state: { authorized: boolean; context: number }
}

function harness(options: { tasks?: Task[]; filePaths?: string[]; now?: Date; ledgerBytes?: number } = {}): Harness {
  const state = { authorized: true, context: 3 }
  const gate = new BackupJobGate()
  const ledger = new BackupResourceLedger(options.ledgerBytes ?? 128 * 1024 * 1024)
  const service = new BackupExportService({
    dialogs: dialogsSavingAt(options.filePaths ?? [join(workDir, 'saida.json')]),
    storage: storageWith(options.tasks ?? [buildTask()]),
    ledger,
    gate,
    clock: () => options.now ?? new Date('2026-10-05T15:00:00.000Z'),
    appVersion: () => '0.1.0',
    protectedRoots: () => [protectedRoot],
    isAuthorized: () => state.authorized,
    contextSequence: () => state.context,
  })
  return { service, gate, ledger, state }
}

describe('BackupExportService (B04/B05/B12)', () => {
  it('exporta todas as tarefas independentemente de filtros e valida pelo próprio leitor', async () => {
    const tasks = [
      buildTask({ id: 'a', tags: ['casa'] }),
      buildTask({ id: 'b', title: 'Outra', subtasks: [{ id: 's1', title: 'Item', done: true }] }),
    ]
    const file = join(workDir, 'completo.json')
    const h = harness({ tasks, filePaths: [file] })
    const outcome = await h.service.exportBackup(ticket, 3)
    expect(outcome).toMatchObject({ kind: 'ok', outcome: 'SAVED', taskCount: 2 })
    expect(h.gate.active).toBe(false)
    expect(h.ledger.usedBytes).toBe(0)

    const parsed = readBackupFile(readFileSync(file, 'utf8'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.tasks.map((task) => task.id).sort()).toEqual(['a', 'b'])
    expect(parsed.backup.exportedAt).toBe('2026-10-05T15:00:00.000Z')
  })

  it('cancelamento é neutro: sem arquivo, sem reserva e gate liberado', async () => {
    const h = harness()
    h.service = new BackupExportService({
      dialogs: { show: async () => ({ canceled: true, filePaths: [] }) },
      storage: storageWith([buildTask()]),
      ledger: h.ledger,
      gate: h.gate,
      clock: () => new Date(),
      appVersion: () => '0.1.0',
      protectedRoots: () => [protectedRoot],
      isAuthorized: () => true,
      contextSequence: () => 3,
    })
    expect(await h.service.exportBackup(ticket, 3)).toEqual({ kind: 'cancelled' })
    expect(h.gate.active).toBe(false)
    expect(h.ledger.usedBytes).toBe(0)
  })

  it('recusa BUSY quando outro job nativo está ativo, sem tocar o diálogo', async () => {
    const h = harness()
    h.gate.tryAcquire()
    expect(await h.service.exportBackup(ticket, 3)).toEqual({ kind: 'error', code: 'BUSY' })
    h.gate.release()
  })

  it('exige contexto corrente na admissão e em cada fronteira', async () => {
    const h = harness()
    expect(await h.service.exportBackup(ticket, 2)).toEqual({ kind: 'error', code: 'STALE_CONTEXT' })
    expect(h.gate.active).toBe(false)
  })

  it('encerramento durante o diálogo não grava nem responde ao novo documento', async () => {
    const file = join(workDir, 'sessao.json')
    const state = { authorized: true, context: 3 }
    const gate = new BackupJobGate()
    const service = new BackupExportService({
      dialogs: {
        show: async () => {
          state.authorized = false
          return { canceled: false, filePaths: [file] }
        },
      },
      storage: storageWith([buildTask()]),
      ledger: new BackupResourceLedger(),
      gate,
      clock: () => new Date(),
      appVersion: () => '0.1.0',
      protectedRoots: () => [protectedRoot],
      isAuthorized: () => state.authorized,
      contextSequence: () => state.context,
    })
    expect(await service.exportBackup(ticket, 3)).toEqual({ kind: 'error', code: 'SESSION_CLOSED' })
    expect(existsSync(file)).toBe(false)
    expect(gate.active).toBe(false)
  })

  it('recusa destino interno do app antes de ler dados ou abrir temporário', async () => {
    const h = harness({ filePaths: [join(protectedRoot, 'backup.json')] })
    expect(await h.service.exportBackup(ticket, 3)).toEqual({ kind: 'error', code: 'DESTINATION_NOT_ALLOWED' })
    expect(h.ledger.usedBytes).toBe(0)
    expect(h.gate.active).toBe(false)
  })

  it('dado histórico não exportável recusa tudo com issues seguros', async () => {
    const file = join(workDir, 'historico.json')
    const h = harness({ tasks: [buildTask({ id: 'a', title: '  espaços  ' })], filePaths: [file] })
    const outcome = await h.service.exportBackup(ticket, 3)
    expect(outcome.kind).toBe('error')
    if (outcome.kind !== 'error') return
    expect(outcome.code).toBe('LOCAL_DATA_NOT_EXPORTABLE')
    expect(outcome.issues?.[0]).toMatchObject({ field: 'title', code: 'INVALID_VALUE' })
    expect(existsSync(file)).toBe(false)
    expect(h.ledger.usedBytes).toBe(0)
  })

  it('reserva insuficiente recusa sem escrever', async () => {
    const file = join(workDir, 'reserva.json')
    const h = harness({ filePaths: [file], ledgerBytes: 1024 })
    expect(await h.service.exportBackup(ticket, 3)).toEqual({ kind: 'error', code: 'RESOURCE_LIMIT' })
    expect(existsSync(file)).toBe(false)
    expect(h.ledger.usedBytes).toBe(0)
  })
})
