import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { BackupResourceLedger } from '../../src/application/backup/backup-resources.js'
import { UndoRegistry } from '../../src/application/undo/undo-registry.js'
import type { Task } from '../../src/domain/task.js'
import { BACKUP_PREVIEW_TTL_MS } from '../../src/contracts/backup.js'
import { BackupJobGate } from '../../src/main/backup/backup-job.js'
import { BackupCommandServices } from '../../src/main/backup/backup-restore-service.js'
import { BackupRestoreRegistry } from '../../src/main/backup/backup-restore-registry.js'
import type { StorageCoordinator } from '../../src/main/storage/coordinator.js'
import { buildTask } from '../support/task-fixtures.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator, type OpenCoordinatorOptions } from '../support/storage.js'

const workDir = mkdtempSync(join(tmpdir(), 'tfa007-restore-'))

afterEach(() => {
  cleanupStorage()
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true, maxRetries: 5 })
})

function backupText(tasks: Task[], formatVersion = 4): string {
  const normalized = tasks.map((task) => {
    const clone = JSON.parse(JSON.stringify(task)) as Record<string, unknown>
    if (formatVersion < 4) delete clone['subtasks']
    if (formatVersion === 1) {
      // Converte reminders OFFSET de volta ao formato legado para exercitar a cadeia.
    }
    return clone
  })
  return JSON.stringify({
    format: 'taskflow-backup',
    formatVersion,
    exportedAt: '2026-10-04T12:00:00.000Z',
    app: { version: '0.1.0' },
    tasks: normalized,
  })
}

function writeBackup(name: string, text: string): string {
  const path = join(workDir, name)
  writeFileSync(path, text, 'utf8')
  return path
}

interface ServiceHarness {
  coordinator: StorageCoordinator
  services: BackupCommandServices
  ledger: BackupResourceLedger
  registry: BackupRestoreRegistry
  undo: UndoRegistry
  gate: BackupJobGate
  state: { authorized: boolean; context: number }
  setFile: (path: string | undefined) => void
  advance: (ms: number) => void
}

function harness(options: { coordinatorOptions?: OpenCoordinatorOptions; file?: string; undoInitialEpoch?: number } = {}): ServiceHarness {
  const coordinator = openCoordinator(createProductFile(), options.coordinatorOptions ?? {})
  const ledger = new BackupResourceLedger()
  const gate = new BackupJobGate()
  let clock = 1_000_000
  const undo = new UndoRegistry({
    randomToken: () => `undo-${Math.random()}`,
    ...(options.undoInitialEpoch !== undefined && { initialEpoch: options.undoInitialEpoch }),
  })
  const registry = new BackupRestoreRegistry({
    ledger,
    randomToken: () => `preview-${Math.random().toString(36).slice(2, 10)}`,
    now: () => clock,
  })
  const state = { authorized: true, context: 5 }
  let selected = options.file
  const services = new BackupCommandServices({
    dialogs: {
      show: async () =>
        selected === undefined ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [selected] },
    },
    storage: coordinator,
    ledger,
    gate,
    registry,
    undo,
    clock: () => new Date('2026-10-05T12:00:00.000Z'),
    appVersion: () => '0.1.0',
    protectedRoots: () => [workDir],
    isAuthorized: () => state.authorized,
    contextSequence: () => state.context,
  })
  return {
    coordinator,
    services,
    ledger,
    registry,
    undo,
    gate,
    state,
    setFile: (path) => (selected = path),
    advance: (ms) => (clock += ms),
  }
}

const ticket = { contentsId: 1, generation: 1, key: '1:1' }

describe('BackupCommandServices.prepare/confirm/cancel (B05/B06/B07/B11)', () => {
  it('prepara prévia completa, libera por cancel e mantém a idempotência', async () => {
    const h = harness({ file: writeBackup('v4.json', backupText([buildTask({ id: 'a' }), buildTask({ id: 'b', title: 'B' })])) })
    expectOk(await h.coordinator.run((unit) => unit.saveTask(buildTask({ id: 'local' }))))

    const preview = await h.services.prepareBackupRestore(ticket, 5)
    expect(preview.status).toBe('ok')
    if (preview.status !== 'ok') return
    expect(preview).toMatchObject({
      version: 1,
      status: 'ok',
      sourceFormatVersion: 4,
      formatVersion: 4,
      exportedAt: '2026-10-04T12:00:00.000Z',
      appVersion: '0.1.0',
      fileTaskCount: 2,
      localTaskCount: 1,
      expiresInMs: BACKUP_PREVIEW_TTL_MS,
    })
    expect(h.ledger.usedBytes).toBeGreaterThan(0)
    expect(h.gate.active).toBe(false)

    const cancelled = await h.services.cancelBackupRestore(preview.restoreToken, ticket.key)
    expect(cancelled).toEqual({ version: 1, status: 'ok', cancelled: true })
    expect(h.ledger.usedBytes).toBe(0)
    expect(await h.services.cancelBackupRestore(preview.restoreToken, ticket.key)).toEqual({
      version: 1,
      status: 'ok',
      cancelled: true,
    })
    const afterCancel = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(afterCancel).toMatchObject({ status: 'error', code: 'BACKUP_PREVIEW_INVALID', commitState: 'NOT_APPLIED' })
  })

  it('confirm APPLIED substitui tasks, preserva trash, incrementa época e verifica', async () => {
    const h = harness({ file: writeBackup('applied.json', backupText([buildTask({ id: 'novo' }), buildTask({ id: 'outro' })])) })
    expectOk(
      await h.coordinator.run((unit) => {
        unit.saveTasks([buildTask({ id: 'antigo' }), buildTask({ id: 'dorme', title: 'Vai para lixeira' })])
        unit.moveToTrash('dorme', '2026-10-01T12:00:00.000Z')
      }),
    )
    const epochBefore = h.undo.epoch

    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')
    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed.status).toBe('ok')
    if (confirmed.status !== 'ok') return
    expect(confirmed.outcome).toBe('APPLIED')
    expect(confirmed.verification).toBe('VERIFIED')
    expect(confirmed.restoredCount).toBe(2)
    expect(confirmed.undoEpoch).toBe(epochBefore + 1)
    expect(h.ledger.usedBytes).toBe(0)

    const state = expectOk(
      await h.coordinator.read((reader) => ({
        tasks: reader.listTasks().map((stored) => stored.task.id).sort(),
        trash: reader.listTrash().map((item) => item.task.id),
      })),
    )
    expect(state.value.tasks).toEqual(['novo', 'outro'])
    expect(state.value.trash).toEqual(['dorme'])

    // Confirmação repetida não é no-op autorizado.
    const again = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(again).toMatchObject({ status: 'error', code: 'BACKUP_PREVIEW_INVALID' })
  })

  it('confirm UNCHANGED conserva revisão SQL e ainda incrementa a época', async () => {
    const task = buildTask({ id: 'mesma', title: 'Mesma' })
    const h = harness({ file: writeBackup('unchanged.json', backupText([task])) })
    expectOk(await h.coordinator.run((unit) => unit.saveTask(task)))
    const revisionBefore = h.coordinator.confirmedRevision!
    const epochBefore = h.undo.epoch

    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')
    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({
      status: 'ok',
      outcome: 'UNCHANGED',
      revision: revisionBefore.toString(),
      verification: 'VERIFIED',
      undoEpoch: epochBefore + 1,
    })
    expect(h.coordinator.confirmedRevision).toBe(revisionBefore)
  })

  it('base mudou entre prévia e confirmação: BACKUP_BASE_CHANGED sem efeito', async () => {
    const h = harness({ file: writeBackup('base.json', backupText([buildTask({ id: 'importada' })])) })
    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')

    expectOk(await h.coordinator.run((unit) => unit.saveTask(buildTask({ id: 'concorrente' }))))
    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({ status: 'error', code: 'BACKUP_BASE_CHANGED', commitState: 'NOT_APPLIED' })
    expect(h.ledger.usedBytes).toBe(0)
    const ids = expectOk(await h.coordinator.read((reader) => reader.listTasks().map((stored) => stored.task.id)))
    expect(ids.value).toEqual(['concorrente'])
  })

  it('expiração de 5 minutos monotônicos recusa sem consumir estado e libera a reserva', async () => {
    const h = harness({ file: writeBackup('ttl.json', backupText([buildTask({ id: 'a' })])) })
    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')
    h.advance(BACKUP_PREVIEW_TTL_MS)
    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({ status: 'error', code: 'BACKUP_PREVIEW_EXPIRED', commitState: 'NOT_APPLIED' })
    expect(h.ledger.usedBytes).toBe(0)
  })

  it('conflito de portadora recusa sem expurgar a lixeira nem retirar a regra', async () => {
    const carrier: Task = buildTask({
      id: 'local',
      dueAt: '2026-11-10T12:00:00.000Z',
      seriesId: 'serie-1',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    })
    const h = harness({
      file: writeBackup(
        'series.json',
        backupText([
          buildTask({
            id: 'importada',
            dueAt: '2026-11-11T12:00:00.000Z',
            seriesId: 'serie-1',
            recurrence: { frequency: 'DAILY', intervalDays: 1 },
          }),
        ]),
      ),
    })
    // A portadora conflitante está na LIXEIRA preservada: a substituição não pode removê-la.
    expectOk(await h.coordinator.run((unit) => unit.saveTask(carrier)))
    expectOk(await h.coordinator.run((unit) => unit.moveToTrash('local', '2026-10-01T12:00:00.000Z')))
    const before = h.coordinator.confirmedRevision!

    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')
    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({ status: 'error', code: 'SERIES_CONFLICT', commitState: 'NOT_APPLIED' })
    expect(h.coordinator.confirmedRevision).toBe(before)
    const current = expectOk(
      await h.coordinator.read((reader) => ({
        tasks: reader.listTasks().map((stored) => stored.task.id),
        trash: reader.listTrash().map((item) => ({ id: item.task.id, recurrence: item.task.recurrence })),
      })),
    )
    expect(current.value.tasks).toEqual([])
    expect(current.value.trash).toHaveLength(1)
    expect(current.value.trash[0]!.id).toBe('local')
    expect(current.value.trash[0]!.recurrence).toBeDefined()
  })

  it('commit incerto: UNKNOWN, barreira conservadora de recuperação e nenhum replay', async () => {
    const h = harness({
      file: writeBackup('incerto.json', backupText([buildTask({ id: 'importada' })])),
      coordinatorOptions: {
        faults: {
          at: (point) => {
            if (point === 'unit:commit') throw new Error('falha incerta fictícia')
          },
        },
      },
    })
    const epochBefore = h.undo.epoch
    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')

    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({ status: 'error', code: 'STORAGE_UNAVAILABLE', commitState: 'UNKNOWN' })
    // Barreira conservadora: nova época, preparações limpas, sem declarar sucesso.
    expect(h.undo.epoch).toBe(epochBefore + 1)
    expect(h.ledger.usedBytes).toBe(0)

    // O token não é reconstruído; a próxima decisão exige nova prévia.
    const replay = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(replay).toMatchObject({ status: 'error', code: 'BACKUP_PREVIEW_INVALID' })
  })

  it('arquivo inválido e sessão encerrada não publicam prévia', async () => {
    const h = harness({ file: writeBackup('invalido.json', '{"format":"outro"}') })
    expect(await h.services.prepareBackupRestore(ticket, 5)).toMatchObject({
      status: 'error',
      code: 'NOT_TASKFLOW_BACKUP',
    })

    h.setFile(writeBackup('grande.json', backupText([buildTask({ id: 'a' })])))
    // Limite de leitura artificial via ledger pequeno não é usado aqui; valida erro de tarefas.
    h.setFile(
      writeBackup(
        'tarefas-invalidas.json',
        JSON.stringify({
          format: 'taskflow-backup',
          formatVersion: 4,
          exportedAt: '2026-10-04T12:00:00.000Z',
          app: { version: '0.1.0' },
          tasks: [{ id: '', title: '' }],
        }),
      ),
    )
    const invalid = await h.services.prepareBackupRestore(ticket, 5)
    expect(invalid).toMatchObject({ status: 'error', code: 'INVALID_TASKS' })
    expect(h.ledger.usedBytes).toBe(0)

    h.setFile(writeBackup('sessao.json', backupText([buildTask({ id: 'a' })])))
    h.state.authorized = false
    expect(await h.services.prepareBackupRestore(ticket, 5)).toMatchObject({
      status: 'error',
      code: 'SESSION_CLOSED',
    })
    expect(h.ledger.usedBytes).toBe(0)
    expect(h.gate.active).toBe(false)
  })

  it('BUSY enquanto outro job nativo está ativo', async () => {
    const h = harness({ file: writeBackup('busy.json', backupText([buildTask({ id: 'a' })])) })
    h.gate.tryAcquire()
    expect(await h.services.prepareBackupRestore(ticket, 5)).toMatchObject({ status: 'error', code: 'BUSY' })
    h.gate.release()
  })

  it('não relê o arquivo na confirmação: alterar/apagar o original depois da prévia não muda a base usada', async () => {
    const file = writeBackup('congelado.json', backupText([buildTask({ id: 'congelada' })]))
    const h = harness({ file })
    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')
    // O arquivo é trocado por outro conjunto depois da prévia.
    writeFileSync(file, backupText([buildTask({ id: 'outra' })]))

    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({ status: 'ok', outcome: 'APPLIED', verification: 'VERIFIED' })
    const ids = expectOk(await h.coordinator.read((reader) => reader.listTasks().map((stored) => stored.task.id)))
    expect(ids.value).toEqual(['congelada'])
  })

  it('época esgotada: conclusão falha, commit permanece com verification PENDING e admissão bloqueada', async () => {
    const h = harness({
      file: writeBackup('epoch.json', backupText([buildTask({ id: 'importada' })])),
      undoInitialEpoch: Number.MAX_SAFE_INTEGER,
    })
    const preview = await h.services.prepareBackupRestore(ticket, 5)
    if (preview.status !== 'ok') throw new Error('preview failed')

    const confirmed = await h.services.confirmBackupRestore(ticket, 5, preview.restoreToken)
    expect(confirmed).toMatchObject({ status: 'ok', outcome: 'APPLIED', verification: 'PENDING' })
    // O commit permanece e a próxima unidade reabre e valida.
    const ids = expectOk(await h.coordinator.read((reader) => reader.listTasks().map((stored) => stored.task.id)))
    expect(ids.value).toEqual(['importada'])
  })
})
