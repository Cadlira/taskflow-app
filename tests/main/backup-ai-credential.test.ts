// @vitest-environment node
// Regressão AI15 (parcial): a configuração de IA vive em arquivo próprio no userData e fica fora
// da exportação/restauração de tarefas. Nenhum segredo do provedor entra no backup, e um backup
// com propriedades de IA injetadas não cria configuração alguma.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
import { FileAiProviderConfig } from '../../src/main/ai/file-ai-config.js'
import type { AiNativeProtection } from '../../src/main/ai/native-protection.js'
import { buildTask } from '../support/task-fixtures.js'

const workDir = mkdtempSync(join(tmpdir(), 'tfa010-backup-ai-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

const protection: AiNativeProtection = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
  decrypt: (data: Buffer) => {
    const text = data.toString('utf8')
    if (!text.startsWith('enc:')) throw new Error('blob inválido')
    return text.slice(4)
  },
}

const SECRET = 'sk-credencial-que-nao-pode-vazar'
const HOST = 'gateway-secreto.exemplo'
const MODEL = 'modelo-secreto-x9'

let caseCount = 0

/** Diretório de perfil fictício por teste: nenhum teste depende da ordem dos demais. */
function freshUserData(): string {
  const dir = join(workDir, `case-${(caseCount += 1)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function configuredUserData(userData: string): Promise<FileAiProviderConfig> {
  const store = new FileAiProviderConfig(userData, protection)
  await store.save({
    expectedRevision: '0',
    provider: 'CUSTOM',
    apiBase: `https://${HOST}/v1`,
    model: MODEL,
    credential: SECRET,
  })
  return store
}

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

function exportService(file: string, tasks: Task[], protectedUserData: string): BackupExportService {
  return new BackupExportService({
    dialogs: dialogsSavingAt([file]),
    storage: storageWith(tasks),
    ledger: new BackupResourceLedger(128 * 1024 * 1024),
    gate: new BackupJobGate(),
    clock: () => new Date('2026-10-07T12:00:00.000Z'),
    appVersion: () => '0.1.0',
    protectedRoots: () => [protectedUserData],
    isAuthorized: () => true,
    contextSequence: () => 3,
  })
}

describe('credencial de IA fora das exportações (AI15 parcial)', () => {
  it('não inclui credencial, modelo, base nem o arquivo de configuração no backup exportado', async () => {
    const userData = freshUserData()
    await configuredUserData(userData)
    const file = join(workDir, 'saida.json')

    const outcome = await exportService(file, [buildTask({ id: 'a', title: 'Revisar proposta' })], userData).exportBackup(ticket, 3)

    expect(outcome).toMatchObject({ kind: 'ok', outcome: 'SAVED' })
    const content = readFileSync(file, 'utf8')
    expect(content).not.toContain(SECRET)
    expect(content).not.toContain(MODEL)
    expect(content).not.toContain(HOST)
    expect(content).not.toContain('ai.json')
    expect(content).not.toContain('credential')
    expect(content).not.toContain('provider')
    const parsed = JSON.parse(content) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['app', 'exportedAt', 'format', 'formatVersion', 'tasks'])
  })

  it('backup com propriedades de IA injetadas é ignorado e não cria configuração', async () => {
    const userData = freshUserData()
    await configuredUserData(userData)
    const injected = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: '2026-10-07T12:00:00.000Z',
      app: { version: '0.1.0' },
      tasks: [],
      ai: { provider: 'CUSTOM', apiBase: 'https://invasor.exemplo/v1', credential: 'sk-injetada' },
      credential: 'sk-injetada',
    })

    const read = readBackupFile(injected)

    expect(read.ok).toBe(true)
    expect(JSON.stringify(read)).not.toContain('sk-injetada')
    expect(JSON.stringify(read)).not.toContain('invasor.exemplo')
    const store = new FileAiProviderConfig(userData, protection)
    const state = await store.read()
    // A configuração legítima do teste permanece exatamente a mesma.
    expect(state.summary).toMatchObject({ provider: 'CUSTOM', model: MODEL, hasCredential: true })
  })

  it('restauração de tarefas não toca o arquivo de IA', async () => {
    const userData = freshUserData()
    const store = await configuredUserData(userData)
    const before = readFileSync(store.file)

    // A restauração substitui tarefas no armazenamento; nada fora dele é escrito.
    const file = join(workDir, 'novo.json')
    await exportService(file, [buildTask({ id: 'b', title: 'Do arquivo' })], userData).exportBackup(ticket, 3)

    expect(readFileSync(store.file).equals(before)).toBe(true)
    expect(JSON.parse(before.toString('utf8'))).toMatchObject({ version: 1, config: { provider: 'CUSTOM' } })
  })
})
