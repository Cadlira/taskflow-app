// @vitest-environment node
//
// P03 — interrupção de processo. Um processo filho exclusivamente de teste (o mesmo runtime
// Node do gate) abre um banco fictício em diretório temporário, para numa barreira
// identificada e é encerrado à força pelo teste, que valida o PID antes de matar. Isso prova
// atomicidade diante de interrupção de PROCESSO; não é prova de falha de energia, pois o
// sistema operacional continua vivo e seus buffers chegam ao disco.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'vite'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildFictitiousTask, buildFictitiousTasks } from '../../src/main/harness/fixtures.js'
import { ProductDatabase, type StorageFaultPoint } from '../../src/main/storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION } from '../../src/main/storage/product-schema.js'
import { CRASH_CLAIM, crashMigrationDefinition } from '../support/crash-fixture.js'
import { cleanupStorage, createProductFile, createTempRoot, expectOk, openCoordinator } from '../support/storage.js'

const BARRIER_TIMEOUT_MS = 30_000
const children = new Set<ChildProcess>()
let childScript = ''

beforeAll(async () => {
  // O filho roda fora do Vitest: o harness é empacotado num único módulo em pasta temporária.
  const outDir = createTempRoot('taskflow-crash-child-')
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: path.resolve(import.meta.dirname, '..', 'support', 'crash-child.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'node24',
      rollupOptions: { output: { format: 'es', entryFileNames: 'crash-child.mjs' } },
    },
    ssr: { noExternal: true },
  })
  childScript = path.join(outDir, 'crash-child.mjs')
  expect(existsSync(childScript)).toBe(true)
}, 120_000)

afterEach(() => {
  // Somente processos criados por este arquivo de teste.
  for (const child of children) child.kill('SIGKILL')
  children.clear()
})

afterAll(cleanupStorage)

interface Seeded {
  file: string
  revision: bigint
  taskIds: string[]
  processedFor: string
}

async function seed(): Promise<Seeded> {
  const file = createProductFile()
  const claimTask = buildFictitiousTask(1, { idPrefix: 'claim' })
  const coordinator = openCoordinator(file)
  expectOk(await coordinator.run((unit) => unit.saveTasks([...buildFictitiousTasks(20), claimTask])))
  const revision = coordinator.confirmedRevision ?? 0n
  coordinator.shutdown()

  const pending = claimTask.reminders.find((reminder) => reminder.id === CRASH_CLAIM.reminderId)
  if (pending?.type !== 'OFFSET' || claimTask.dueAt === undefined || claimTask.id !== CRASH_CLAIM.taskId) {
    throw new Error('claim fixture mismatch')
  }
  return {
    file,
    revision,
    taskIds: [...buildFictitiousTasks(20).map((task) => task.id), claimTask.id].sort(),
    processedFor: new Date(Date.parse(claimTask.dueAt) - pending.offsetMinutes * 60_000).toISOString(),
  }
}

/** Inicia o filho, espera a barreira, confere o PID e encerra somente esse processo. */
async function interruptAt(seeded: Seeded, point: StorageFaultPoint, unit: 'save' | 'claim' | 'migrate'): Promise<void> {
  const barrierFile = path.join(createTempRoot('taskflow-crash-barrier-'), 'barrier.json')
  const child = spawn(process.execPath, [childScript, seeded.file, point, unit, barrierFile, seeded.processedFor], {
    stdio: 'ignore',
    windowsHide: true,
  })
  children.add(child)
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))

  const deadline = Date.now() + BARRIER_TIMEOUT_MS
  while (!existsSync(barrierFile)) {
    if (child.exitCode !== null) throw new Error(`child exited (${child.exitCode}) before the barrier`)
    if (Date.now() > deadline) throw new Error('barrier was not reached in time')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  const barrier = JSON.parse(readFileSync(barrierFile, 'utf8')) as { pid: number; point: string; reached?: boolean }
  expect(barrier.reached).toBeUndefined()
  expect(barrier.point).toBe(point)
  // Só o PID validado do harness é encerrado; nenhum outro processo é tocado.
  expect(barrier.pid).toBe(child.pid)
  expect(child.exitCode).toBeNull()

  expect(child.kill('SIGKILL')).toBe(true)
  await exited
  children.delete(child)
}

async function reopen(file: string): Promise<{ revision: bigint; taskIds: string[]; claimed: string | undefined }> {
  const coordinator = openCoordinator(file)
  expect(coordinator.availability).toEqual({ state: 'ready' })
  const read = expectOk(
    await coordinator.read((reader) => ({
      revision: reader.baseRevision,
      taskIds: reader.listTasks().map((stored) => stored.task.id),
      claimed: reader.getTask(CRASH_CLAIM.taskId)?.task.reminders.find((reminder) => reminder.id === CRASH_CLAIM.reminderId)
        ?.processedFor,
    })),
  )
  coordinator.shutdown()
  return read.value
}

describe('interrupção de processo em barreiras da unidade', () => {
  it.each<[StorageFaultPoint]>([['unit:before-begin'], ['unit:in-transaction'], ['unit:before-commit']])(
    'encerrado em %s: reopen encontra o estado anterior inteiro',
    async (point) => {
      const seeded = await seed()
      await interruptAt(seeded, point, 'save')
      const journalLeft = existsSync(`${seeded.file}-journal`)

      const state = await reopen(seeded.file)

      expect(state.revision).toBe(seeded.revision)
      expect(state.taskIds).toEqual(seeded.taskIds)
      // Recuperação normal do motor: o journal da transação interrompida some após o reopen
      // validado; a aplicação não o apaga nem o interpreta.
      if (point !== 'unit:before-begin') expect(journalLeft).toBe(true)
      expect(existsSync(`${seeded.file}-journal`)).toBe(false)
    },
    60_000,
  )

  it.each<[StorageFaultPoint]>([['unit:after-commit'], ['unit:before-publish']])(
    'encerrado em %s (antes da resposta/evento): reopen encontra o novo estado inteiro',
    async (point) => {
      const seeded = await seed()
      await interruptAt(seeded, point, 'save')

      const state = await reopen(seeded.file)

      expect(state.revision).toBe(seeded.revision + 1n)
      expect(state.taskIds).toHaveLength(seeded.taskIds.length + 300)
      expect(existsSync(`${seeded.file}-journal`)).toBe(false)
    },
    60_000,
  )

  it('claim confirmado antes do efeito externo: reopen conserva processedFor e recusa segundo claim', async () => {
    const seeded = await seed()
    await interruptAt(seeded, 'unit:before-publish', 'claim')

    const state = await reopen(seeded.file)
    expect(state.revision).toBe(seeded.revision + 1n)
    expect(state.claimed).toBe(seeded.processedFor)

    const coordinator = openCoordinator(seeded.file)
    const again = expectOk(
      await coordinator.run((unit) => unit.claimReminderOccurrence({ ...CRASH_CLAIM, processedFor: seeded.processedFor })),
    )
    expect([again.value, again.committed]).toEqual([false, false])
    coordinator.shutdown()
  }, 60_000)

  it('claim interrompido antes do commit não fica registrado', async () => {
    const seeded = await seed()
    await interruptAt(seeded, 'unit:before-commit', 'claim')

    const state = await reopen(seeded.file)
    expect(state.revision).toBe(seeded.revision)
    expect(state.claimed).toBeUndefined()
  }, 60_000)
})

describe('interrupção de processo durante migração (fixture isolada)', () => {
  function userVersion(file: string): number {
    const connection = new DatabaseSync(file)
    try {
      return Number(Object.values(connection.prepare('PRAGMA user_version').get() ?? {})[0])
    } finally {
      connection.close()
    }
  }

  it.each<[StorageFaultPoint]>([['migrate:in-transaction'], ['migrate:before-commit']])(
    'encerrado em %s: reopen encontra o schema e os dados anteriores, sem migração parcial',
    async (point) => {
      const seeded = await seed()
      await interruptAt(seeded, point, 'migrate')

      // O produto (schema 1) reabre normalmente: nada parcialmente migrado.
      const state = await reopen(seeded.file)
      expect(state.revision).toBe(seeded.revision)
      expect(state.taskIds).toEqual(seeded.taskIds)
      expect(userVersion(seeded.file)).toBe(1)
    },
    60_000,
  )

  it('encerrado depois do commit da migração: o destino está inteiro e o leitor antigo recusa', async () => {
    const seeded = await seed()
    await interruptAt(seeded, 'migrate:after-commit', 'migrate')

    expect(userVersion(seeded.file)).toBe(2)
    expect(ProductDatabase.open(seeded.file, PRODUCT_STORAGE_DEFINITION)).toEqual({ ok: false, reason: 'INCOMPATIBLE_DATA' })

    const migrated = ProductDatabase.open(seeded.file, crashMigrationDefinition())
    if (!migrated.ok) throw new Error(migrated.reason)
    expect(migrated.migrated).toBe(false)
    expect(migrated.database.readGlobalRevision()).toBe(seeded.revision + 1n)
    expect(migrated.database.listRows('tasks')).toHaveLength(seeded.taskIds.length)
    migrated.database.close()
  }, 60_000)
})
