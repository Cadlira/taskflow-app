import { afterEach, describe, expect, it } from 'vitest'
import type { TaskStorageReader, TaskStorageUnit, UnitResult } from '../../src/application/storage/unit-of-work.js'
import {
  TASK_CREATE_CHANNEL,
  TASK_OPEN_SOURCE_CHANNEL,
  TASK_STATUS_CHANNEL,
  TASK_UPDATE_CHANNEL,
  type TaskCommandFailure,
} from '../../src/contracts/tasks.js'
import type { InvocationLike } from '../../src/main/ipc/document-sessions.js'
import { TaskCommandIpcService, type TaskCommandSessions, type TaskCommandStorage } from '../../src/main/ipc/tasks.js'
import type { UnitOptions } from '../../src/main/storage/coordinator.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)

const EVENT = {} as InvocationLike
const CLOCK = () => new Date('2026-10-04T12:00:00.000Z')

interface FakeSessions extends TaskCommandSessions {
  invalidate(): void
  restore(): void
  deny(): void
}

function fakeSessions(): FakeSessions {
  const state = { authorized: true, current: true, generation: 1 }
  return {
    authorize: () => (state.authorized ? { contentsId: 1, generation: state.generation, key: 'doc:1' } : null),
    isCurrent: (ticket) => state.current && ticket.generation === state.generation,
    invalidate: () => {
      state.current = false
    },
    restore: () => {
      state.current = true
    },
    deny: () => {
      state.authorized = false
    },
  }
}

function countingStorage(coordinator: ReturnType<typeof openCoordinator>): {
  storage: TaskCommandStorage
  counts: { run: number; read: number }
} {
  const counts = { run: 0, read: 0 }
  return {
    counts,
    storage: {
      run<T>(unit: (unit: TaskStorageUnit) => T, options?: UnitOptions): Promise<UnitResult<T>> {
        counts.run += 1
        return coordinator.run(unit, options)
      },
      read<T>(reader: (reader: TaskStorageReader) => T, options?: UnitOptions): Promise<UnitResult<T>> {
        counts.read += 1
        return coordinator.read(reader, options)
      },
    },
  }
}

function createService(options: { openExternal?: (href: string) => Promise<void> } = {}) {
  const coordinator = openCoordinator(createProductFile())
  const { storage, counts } = countingStorage(coordinator)
  const sessions = fakeSessions()
  const opened: string[] = []
  const service = new TaskCommandIpcService({
    sessions,
    storage,
    clock: CLOCK,
    generateId: (() => {
      let index = 0
      return () => `gerado-${++index}`
    })(),
    opener: {
      openExternal: async (href: string) => {
        opened.push(href)
        if (options.openExternal !== undefined) await options.openExternal(href)
      },
    },
  })
  return { coordinator, service, sessions, counts, opened }
}

async function createTask(service: TaskCommandIpcService, draft: Record<string, unknown> = { title: 'Tarefa' }) {
  return service.handleCreate(EVENT, { version: 1, draft })
}

describe('IPC dos comandos de tarefas', () => {
  it('recusa remetente não autorizado sem nenhuma leitura/escrita', async () => {
    const { service, counts, sessions } = createService()
    sessions.deny()
    const result = await createTask(service)
    expect(result).toMatchObject({ status: 'error', code: 'UNAUTHORIZED' })
    expect(counts).toEqual({ run: 0, read: 0 })
  })

  it('recusa schema inválido antes de ler dados: versão, chave extra, ID e revisão', async () => {
    const { service, counts } = createService()
    expect(await service.handleCreate(EVENT, { version: 2, draft: { title: 'x' } })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await service.handleCreate(EVENT, { version: 1, draft: { title: 'x', id: 'forjado' } })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(
      await service.handleUpdate(EVENT, { version: 1, taskId: '', expectedContentRevision: '1', patch: {} }),
    ).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(
      await service.handleStatus(EVENT, { version: 1, taskId: 'a', expectedContentRevision: '1.0', status: 'DONE' }),
    ).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await service.handleOpenSource(EVENT, { version: 1, taskId: 'a' })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(counts).toEqual({ run: 0, read: 0 })
  })

  it('devolve VALIDATION_FAILED por campo sem confirmar a unidade', async () => {
    const { service, coordinator } = createService()
    const result = await createTask(service, { title: '   ', tags: ['a', 'a'] })
    expect(result).toEqual({ version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'REQUIRED' } })

    const status = await service.handleStatus(EVENT, {
      version: 1,
      taskId: 'a',
      expectedContentRevision: '1',
      status: 'NOPE',
    })
    expect(status).toEqual({ version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { status: 'INVALID_VALUE' } })
    expect(coordinator.confirmedRevision).toBe(0n)
  })

  it('cria, edita e muda status com ack curto e revisões exatas', async () => {
    const { service, coordinator } = createService()
    const created = await createTask(service, { title: 'Comprar leite' })
    expect(created).toMatchObject({ version: 1, status: 'ok', taskId: 'gerado-1' })
    if (created.status !== 'ok') return
    expect(created.revision).toBe('1')
    expect(created.contentRevision).toBe('1')

    const updated = await service.handleUpdate(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
      patch: { title: 'Comprar pão', tags: [] },
    })
    expect(updated).toMatchObject({ version: 1, status: 'ok', revision: '2' })

    const conflict = await service.handleUpdate(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
      patch: { title: 'Stale' },
    })
    expect(conflict).toEqual({
      version: 1,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: updated.status === 'ok' ? updated.contentRevision : '',
    })

    const stored = expectOk(await coordinator.read((reader) => reader.getTask('gerado-1')))
    expect(stored.value?.task.title).toBe('Comprar pão')
    expect(stored.value?.task.tags).toEqual([])

    const status = await service.handleStatus(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: updated.status === 'ok' ? updated.contentRevision : '',
      status: 'DONE',
    })
    expect(status).toMatchObject({ version: 1, status: 'ok' })

    const noop = await service.handleStatus(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: status.status === 'ok' ? status.contentRevision : '',
      status: 'DONE',
    })
    expect(noop).toMatchObject({ version: 1, status: 'ok', revision: '3' })

    const missing = await service.handleUpdate(EVENT, {
      version: 1,
      taskId: 'ausente',
      expectedContentRevision: '1',
      patch: { title: 'x' },
    })
    expect(missing).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('aplica o recorte avançado no main: recorrência bloqueia; lembretes bloqueiam prazo/status efetivos', async () => {
    const { service, coordinator } = createService()
    const created = await createTask(service, { title: 'Recorrente', dueAt: '2026-10-10T10:00:00.000Z' })
    if (created.status !== 'ok') throw new Error('unexpected')

    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask(created.taskId)
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({ ...stored.task, recurrence: { frequency: 'DAILY', intervalDays: 1 }, seriesId: 's' })
      }),
    )
    const recorded = expectOk(await coordinator.read((reader) => reader.getTask(created.taskId)))
    const revisionText = recorded.value?.contentRevision.toString() ?? ''
    const blocked = await service.handleUpdate(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: revisionText,
      patch: { description: 'x' },
    })
    expect(blocked).toMatchObject({ code: 'ADVANCED_TASK_RESTRICTED' })
  })

  it('abre somente a origem salva validada; URL proibida não chama o opener e não altera o histórico', async () => {
    const { service, coordinator, opened } = createService()
    const created = await createTask(service, { title: 'Origem' })
    if (created.status !== 'ok') throw new Error('unexpected')

    // Sem origem: indisponível, sem opener.
    expect(
      await service.handleOpenSource(EVENT, {
        version: 1,
        taskId: created.taskId,
        expectedContentRevision: created.contentRevision,
      }),
    ).toMatchObject({ code: 'SOURCE_NOT_AVAILABLE' })
    expect(opened).toEqual([])

    const invalidUrls = [
      'file:///C:/segredo.txt',
      'javascript:alert(1)',
      'data:text/plain,oi',
      'mailto:alguem@example.test',
      '\\\\servidor\\pasta',
      'https://usuario:senha@example.test/x',
      'https://example.test/\u0000',
      `https://example.test/${'x'.repeat(3000)}`,
    ]
    for (const sourceUrl of invalidUrls) {
      expectOk(
        await coordinator.run((unit) => {
          const stored = unit.getTask(created.taskId)
          if (stored === undefined) throw new Error('missing')
          unit.saveTask({ ...stored.task, sourceUrl })
        }),
      )
      const current = expectOk(await coordinator.read((reader) => reader.getTask(created.taskId)))
      const revision = current.value?.contentRevision.toString() ?? ''
      const result = await service.handleOpenSource(EVENT, {
        version: 1,
        taskId: created.taskId,
        expectedContentRevision: revision,
      })
      expect(['SOURCE_NOT_ALLOWED', 'SOURCE_TOO_LONG']).toContain((result as TaskCommandFailure).code)
      // O valor histórico permanece exatamente como estava.
      const after = expectOk(await coordinator.read((reader) => reader.getTask(created.taskId)))
      expect(after.value?.task.sourceUrl).toBe(sourceUrl)
    }
    expect(opened).toEqual([])

    // Origem válida: opener recebe o href validado e a tarefa não muda.
    expectOk(
      await coordinator.run((unit) => {
        const stored = unit.getTask(created.taskId)
        if (stored === undefined) throw new Error('missing')
        unit.saveTask({ ...stored.task, sourceUrl: 'https://example.test/pedido?a=1#b' })
      }),
    )
    const before = expectOk(await coordinator.read((reader) => reader.getTask(created.taskId)))
    const revision = before.value?.contentRevision.toString() ?? ''
    const revisionBefore = before.value?.contentRevision
    const ok = await service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: revision,
    })
    expect(ok).toEqual({ version: 1, status: 'ok' })
    expect(opened).toEqual(['https://example.test/pedido?a=1#b'])
    const after = expectOk(await coordinator.read((reader) => reader.getTask(created.taskId)))
    expect(after.value?.contentRevision).toBe(revisionBefore)
    expect(after.value?.task.sourceUrl).toBe('https://example.test/pedido?a=1#b')

    // Base stale: conflito sem opener.
    const stale = await service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
    })
    expect(stale).toMatchObject({ code: 'CONFLICT' })
    expect(opened).toHaveLength(1)
  })

  it('sanitiza falha do opener e revalida a sessão antes do efeito e da entrega', async () => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const { service, sessions } = createService({
      openExternal: () => blocked,
    })
    const created = await createTask(service, { title: 'Origem', sourceUrl: 'https://example.test/x' })
    if (created.status !== 'ok') throw new Error('unexpected')

    // Sessão invalidada enquanto a leitura está em andamento: nada de efeito.
    const pending = service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
    })
    sessions.invalidate()
    release?.()
    const result = await pending
    expect(result).toMatchObject({ code: 'SESSION_CLOSED' })
    sessions.restore()
  })

  it('sessão invalidada durante a espera do opener: efeito único e resposta suprimida', async () => {
    let release: (() => void) | undefined
    let signalOpened: (() => void) | undefined
    const openedOnce = new Promise<void>((resolve) => {
      signalOpened = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { service, sessions, opened } = createService({
      openExternal: async () => {
        signalOpened?.()
        await gate
      },
    })
    const created = await createTask(service, { title: 'Origem', sourceUrl: 'https://example.test/x' })
    if (created.status !== 'ok') throw new Error('unexpected')

    const pending = service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
    })
    await openedOnce
    expect(opened).toEqual(['https://example.test/x'])
    sessions.invalidate()
    release?.()
    expect(await pending).toEqual({ version: 1, status: 'error', code: 'SESSION_CLOSED' })
    // Efeito já solicitado não é repetido nem anunciado como reversível.
    expect(opened).toHaveLength(1)
  })

  it('mapeia falha externa para EXTERNAL_OPEN_FAILED sem alterar a tarefa', async () => {
    const { service, coordinator, opened } = createService({
      openExternal: () => Promise.reject(new Error('shell recusou')),
    })
    const created = await createTask(service, { title: 'Origem', sourceUrl: 'https://example.test/x' })
    if (created.status !== 'ok') throw new Error('unexpected')

    const result = await service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
    })
    expect(result).toMatchObject({ code: 'EXTERNAL_OPEN_FAILED' })
    expect(opened).toHaveLength(1)
    const stored = expectOk(await coordinator.read((reader) => reader.getTask(created.taskId)))
    expect(stored.value?.task.sourceUrl).toBe('https://example.test/x')
  })

  it('respostas de sucesso nunca excedem 8 KiB: ID gigante vira RESOURCE_LIMIT sem truncar', async () => {
    const coordinator = openCoordinator(createProductFile())
    const { storage } = countingStorage(coordinator)
    const sessions = fakeSessions()
    const hugeId = 'x'.repeat(9 * 1024)
    const service = new TaskCommandIpcService({
      sessions,
      storage,
      clock: CLOCK,
      generateId: () => hugeId,
      opener: { openExternal: () => Promise.resolve() },
    })
    const result = await createTask(service)
    expect(result).toEqual({ version: 1, status: 'error', code: 'RESOURCE_LIMIT' })
  })

  it('expõe os quatro canais do catálogo e nenhum a mais', () => {
    expect([TASK_CREATE_CHANNEL, TASK_UPDATE_CHANNEL, TASK_STATUS_CHANNEL, TASK_OPEN_SOURCE_CHANNEL]).toEqual([
      'task:create:v1',
      'task:update:v1',
      'task:status:v1',
      'task:source:open:v1',
    ])
  })
})
