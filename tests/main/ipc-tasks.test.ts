import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotAssembler } from '../../src/application/state/snapshot-assembler.js'
import {
  buildSnapshotPage,
  initialSnapshotPosition,
  serializeTaskRecord,
  serializeTrashRecord,
  type SerializedRecord,
} from '../../src/application/state/snapshot-paging.js'
import type { TaskStorageReader, TaskStorageUnit, UnitResult } from '../../src/application/storage/unit-of-work.js'
import { STATE_LIMITS, type SnapshotCollection, type StateSnapshot } from '../../src/contracts/state.js'
import {
  TASK_CREATE_CHANNEL,
  TASK_OPEN_SOURCE_CHANNEL,
  TASK_STATUS_CHANNEL,
  TASK_SUBTASK_DONE_CHANNEL,
  TASK_UPDATE_CHANNEL,
  type TaskCommandFailure,
} from '../../src/contracts/tasks.js'
import type { InvocationLike } from '../../src/main/ipc/document-sessions.js'
import { TaskCommandIpcService, type TaskCommandSessions, type TaskCommandStorage } from '../../src/main/ipc/tasks.js'
import type { UnitOptions } from '../../src/main/storage/coordinator.js'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'
import { buildTask } from '../support/task-fixtures.js'

afterEach(cleanupStorage)

const EVENT = {} as InvocationLike
const CLOCK = () => new Date('2026-10-04T12:00:00.000Z')
const DUE = '2026-10-10T10:00:00.000Z'

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

interface ServiceHooks {
  /** Chamado depois de cada unidade do serviço e antes de a resposta voltar. */
  afterStorage: (() => void) | undefined
}

function createService(
  options: {
    openExternal?: (href: string) => Promise<void>
    schedule?: (callback: () => void) => void
    generateId?: () => string
  } = {},
) {
  const coordinator = openCoordinator(createProductFile(), options.schedule === undefined ? {} : { schedule: options.schedule })
  const { storage, counts } = countingStorage(coordinator)
  const sessions = fakeSessions()
  const opened: string[] = []
  const hooks: ServiceHooks = { afterStorage: undefined }
  const service = new TaskCommandIpcService({
    sessions,
    storage: {
      run: (unit, unitOptions) => storage.run(unit, unitOptions).then((result) => {
        hooks.afterStorage?.()
        return result
      }),
      read: (reader, unitOptions) => storage.read(reader, unitOptions).then((result) => {
        hooks.afterStorage?.()
        return result
      }),
    },
    clock: CLOCK,
    generateId:
      options.generateId ??
      (() => {
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
  return { coordinator, service, sessions, counts, opened, hooks }
}

async function createTask(service: TaskCommandIpcService, draft: Record<string, unknown> = { title: 'Tarefa' }) {
  return service.handleCreate(EVENT, { version: 2, draft })
}

async function updateTask(
  service: TaskCommandIpcService,
  taskId: string,
  expectedEditRevision: string,
  patch: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return service.handleUpdate(EVENT, { version: 2, taskId, expectedEditRevision, patch, ...extra })
}

async function changeStatus(
  service: TaskCommandIpcService,
  taskId: string,
  expectedEditRevision: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return service.handleStatus(EVENT, { version: 2, taskId, expectedEditRevision, status, ...extra })
}

async function setSubtaskDone(
  service: TaskCommandIpcService,
  taskId: string,
  expectedEditRevision: string,
  subtaskId: string,
  done: boolean,
) {
  return service.handleSubtaskDone(EVENT, { version: 2, taskId, expectedEditRevision, subtaskId, done })
}

async function storedTask(coordinator: ReturnType<typeof openCoordinator>, id: string) {
  const stored = expectOk(await coordinator.read((reader) => reader.getTask(id)))
  if (stored.value === undefined) throw new Error(`tarefa ausente: ${id}`)
  return stored.value
}

/** Snapshot autoritativo montado como o main faria, sobre uma leitura coordenada. */
async function readSnapshot(coordinator: ReturnType<typeof openCoordinator>): Promise<StateSnapshot> {
  const assembled = expectOk(
    await coordinator.read((reader): StateSnapshot => {
      const source = {
        *records(collection: SnapshotCollection, afterId: string | undefined): Generator<SerializedRecord> {
          if (collection === 'tasks') {
            for (const stored of reader.iterateTasks(afterId)) yield serializeTaskRecord(stored)
          } else {
            for (const stored of reader.iterateTrash(afterId)) yield serializeTrashRecord(stored)
          }
        },
      }
      const built = buildSnapshotPage(source, initialSnapshotPosition(), STATE_LIMITS.pageBytes - 512)
      if (built.complete === undefined) throw new Error('fixture: snapshot não terminou numa página')
      const snapshot = new SnapshotAssembler().accept({ revision: reader.baseRevision.toString(), fragments: built.fragments, complete: built.complete })
      if (snapshot === undefined) throw new Error('fixture: snapshot incompleto')
      return snapshot
    }),
  ).value
  return assembled
}

describe('IPC dos comandos de tarefas v2', () => {
  it('recusa remetente não autorizado sem nenhuma leitura/escrita nos cinco comandos', async () => {
    const { service, counts, sessions } = createService()
    sessions.deny()
    expect(await createTask(service)).toMatchObject({ version: 2, status: 'error', code: 'UNAUTHORIZED' })
    expect(await updateTask(service, 'a', '1', {})).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await changeStatus(service, 'a', '1', 'DONE')).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await setSubtaskDone(service, 'a', '1', 's', true)).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(
      await service.handleOpenSource(EVENT, { version: 1, taskId: 'a', expectedContentRevision: '1' }),
    ).toMatchObject({ version: 1, status: 'error', code: 'UNAUTHORIZED' })
    expect(counts).toEqual({ run: 0, read: 0 })
  })

  it('recusa schema inválido (inclusive v1) antes de ler dados: versão, chave extra, ID e revisão', async () => {
    const { service, counts } = createService()
    expect(await service.handleCreate(EVENT, { version: 1, draft: { title: 'x' } })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await service.handleCreate(EVENT, { version: 2, draft: { title: 'x', id: 'forjado' } })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(await updateTask(service, '', '1', {})).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await updateTask(service, 'a', '1.0', {})).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await changeStatus(service, 'a', '1', 'NOPE')).toEqual({
      version: 2,
      status: 'error',
      code: 'VALIDATION_FAILED',
      fields: { status: 'INVALID_VALUE' },
    })
    expect(await setSubtaskDone(service, 'a', '1', 's', 'yes' as never)).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await service.handleOpenSource(EVENT, { version: 2, taskId: 'a', expectedContentRevision: '1' })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(await service.handleOpenSource(EVENT, { version: 1, taskId: 'a' })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(counts).toEqual({ run: 0, read: 0 })
  })

  it('devolve VALIDATION_FAILED por campo sem confirmar a unidade', async () => {
    const { service, coordinator } = createService()
    const result = await createTask(service, { title: '   ', tags: ['a', 'a'] })
    expect(result).toEqual({ version: 2, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'REQUIRED' } })
    expect(coordinator.confirmedRevision).toBe(0n)
  })

  it('cria, edita e muda status com ack v2 e revisões exatas', async () => {
    const { service, coordinator } = createService()
    const created = await createTask(service, { title: 'Comprar leite' })
    expect(created).toEqual({
      version: 2,
      status: 'ok',
      taskId: 'gerado-1',
      revision: '1',
      contentRevision: '1',
      editRevision: '1',
    })
    if (created.status !== 'ok') return

    const updated = await updateTask(service, created.taskId, created.editRevision, { title: 'Comprar pão', tags: [] })
    expect(updated).toEqual({ version: 2, status: 'ok', revision: '2', contentRevision: '2', editRevision: '2' })

    const conflict = await updateTask(service, created.taskId, created.editRevision, { title: 'Stale' })
    expect(conflict).toEqual({
      version: 2,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '2',
      currentEditRevision: '2',
    })

    const stored = await storedTask(coordinator, 'gerado-1')
    expect(stored.task.title).toBe('Comprar pão')
    expect(stored.task.tags).toEqual([])

    const status = await changeStatus(service, created.taskId, '2', 'DONE')
    expect(status).toEqual({ version: 2, status: 'ok', revision: '3', contentRevision: '3', editRevision: '3' })

    const noop = await changeStatus(service, created.taskId, '3', 'DONE')
    expect(noop).toEqual({ version: 2, status: 'ok', revision: '3', contentRevision: '3', editRevision: '3' })

    const missing = await updateTask(service, 'ausente', '1', { title: 'x' })
    expect(missing).toEqual({ version: 2, status: 'error', code: 'NOT_FOUND' })
  })

  it('ack pós-commit informa global/conteúdo/edição; no-op usa revisões atuais e não emite evento', async () => {
    const { service, coordinator } = createService()
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))

    const created = await createTask(service, { title: 'Sem eventos extras' })
    if (created.status !== 'ok') throw new Error('esperado ack')
    expect(events).toEqual([1n])
    expect(coordinator.confirmedRevision).toBe(1n)
    expect(created.revision).toBe('1')

    // Patch vazio e status igual são no-op: ack com as revisões atuais, sem commit nem evento.
    const emptyPatch = await updateTask(service, created.taskId, created.editRevision, {})
    expect(emptyPatch).toEqual({ version: 2, status: 'ok', revision: '1', contentRevision: '1', editRevision: '1' })
    const sameStatus = await changeStatus(service, created.taskId, created.editRevision, 'TODO')
    expect(sameStatus).toEqual({ version: 2, status: 'ok', revision: '1', contentRevision: '1', editRevision: '1' })
    expect(events).toEqual([1n])
    expect(coordinator.confirmedRevision).toBe(1n)
  })

  it('setSubtaskDone: sucesso conserva edição, no-op é silencioso e negativas são exatas', async () => {
    const { service, coordinator } = createService()
    const events: bigint[] = []
    coordinator.onCommitted((revision) => events.push(revision))
    const created = await createTask(service, { title: 'Com subtarefas', subtasks: [{ title: 'A' }, { title: 'B' }] })
    if (created.status !== 'ok') throw new Error('esperado ack')
    expect((await storedTask(coordinator, created.taskId)).task.subtasks).toEqual([
      { id: 'gerado-2', title: 'A', done: false },
      { id: 'gerado-3', title: 'B', done: false },
    ])

    const marked = await setSubtaskDone(service, created.taskId, created.editRevision, 'gerado-2', true)
    expect(marked).toEqual({ version: 2, status: 'ok', revision: '2', contentRevision: '2', editRevision: '1' })

    // Repetir a intenção já satisfeita é no-op: nada grava nem emite.
    const noop = await setSubtaskDone(service, created.taskId, created.editRevision, 'gerado-2', true)
    expect(noop).toEqual({ version: 2, status: 'ok', revision: '2', contentRevision: '2', editRevision: '1' })
    expect(events).toEqual([1n, 2n])

    const missing = await setSubtaskDone(service, created.taskId, created.editRevision, 'ausente', true)
    expect(missing).toEqual({ version: 2, status: 'error', code: 'SUBTASK_NOT_FOUND' })

    const conflict = await setSubtaskDone(service, created.taskId, '7', 'gerado-2', false)
    expect(conflict).toEqual({
      version: 2,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '2',
      currentEditRevision: '1',
    })
    expect(events).toEqual([1n, 2n])
  })

  it('cria regra/subtarefas com identidades do main e nunca reflete Task no ack', async () => {
    const { service, coordinator } = createService()
    const created = await createTask(service, {
      title: 'Recorrente',
      dueAt: DUE,
      recurrence: { frequency: 'WEEKLY', weekdays: [1, 3] },
      subtasks: [{ title: 'A' }, { title: 'B' }],
    })
    expect(created).toEqual({
      version: 2,
      status: 'ok',
      taskId: 'gerado-1',
      revision: '1',
      contentRevision: '1',
      editRevision: '1',
    })
    if (created.status !== 'ok') return

    const stored = await storedTask(coordinator, created.taskId)
    expect(stored.task.seriesId).toBe('gerado-2')
    expect(stored.task.recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [1, 3] })
    expect(stored.task.subtasks).toEqual([
      { id: 'gerado-3', title: 'A', done: false },
      { id: 'gerado-4', title: 'B', done: false },
    ])
    expect(Object.keys(created).sort()).toEqual(['contentRevision', 'editRevision', 'revision', 'status', 'taskId', 'version'])
    expect(JSON.stringify(created)).not.toContain('Recorrente')
  })

  it('aplica a guarda D8 no main: lembretes bloqueiam prazo/status; edição independente passa', async () => {
    const { service, coordinator } = createService()
    expectOk(
      await coordinator.run((unit) =>
        unit.saveTask(
          buildTask({
            id: 'com-lembretes',
            dueAt: DUE,
            reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
          }),
        ),
      ),
    )

    const blockedDue = await updateTask(service, 'com-lembretes', '1', { dueAt: '2026-10-11T10:00:00.000Z' })
    expect(blockedDue).toEqual({ version: 2, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })
    const blockedStatus = await changeStatus(service, 'com-lembretes', '1', 'DONE')
    expect(blockedStatus).toEqual({ version: 2, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })
    expect(coordinator.confirmedRevision).toBe(1n)

    const allowed = await updateTask(service, 'com-lembretes', '1', { title: 'Editada' })
    expect(allowed).toEqual({ version: 2, status: 'ok', revision: '2', contentRevision: '2', editRevision: '2' })
    const stored = await storedTask(coordinator, 'com-lembretes')
    expect(stored.task.title).toBe('Editada')
    expect(stored.task.reminders).toHaveLength(1)
  })

  it('negativas de recorrência: escolha obrigatória, escolha extrínseca e série duplicada', async () => {
    const { service, coordinator } = createService()
    const created = await createTask(service, { title: 'Série', dueAt: DUE, recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    if (created.status !== 'ok') throw new Error('esperado ack')

    const required = await changeStatus(service, created.taskId, created.editRevision, 'CANCELLED')
    expect(required).toEqual({ version: 2, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })

    const extrinsic = await updateTask(service, created.taskId, created.editRevision, { title: 'Sem terminal' }, { cancellation: 'SKIP' })
    expect(extrinsic).toEqual({ version: 2, status: 'error', code: 'INVALID_REQUEST' })

    // Duas portadoras históricas da mesma série: regra/prazo conflitam; título independente passa.
    expectOk(
      await coordinator.run((unit) => {
        unit.saveTask(buildTask({ id: 'portadora-a', dueAt: DUE, seriesId: 'serie-x', recurrence: { frequency: 'DAILY', intervalDays: 1 } }))
        unit.saveTask(buildTask({ id: 'portadora-b', dueAt: DUE, seriesId: 'serie-x', recurrence: { frequency: 'DAILY', intervalDays: 1 } }))
      }),
    )
    const carrier = await storedTask(coordinator, 'portadora-a')
    const seriesConflict = await updateTask(service, 'portadora-a', carrier.editRevision.toString(), { dueAt: '2026-10-12T10:00:00.000Z' })
    expect(seriesConflict).toEqual({ version: 2, status: 'error', code: 'SERIES_CONFLICT' })
    const independent = await updateTask(service, 'portadora-a', carrier.editRevision.toString(), { title: 'Independente' })
    expect(independent).toEqual({ version: 2, status: 'ok', revision: '3', contentRevision: '3', editRevision: '3' })
  })

  it('colisão de identidade não substitui item existente e devolve IDENTITY_CONFLICT', async () => {
    const { service, coordinator } = createService({ generateId: () => 'fixo' })
    const first = await createTask(service, { title: 'Primeira' })
    expect(first.status).toBe('ok')
    const second = await createTask(service, { title: 'Segunda' })
    expect(second).toEqual({ version: 2, status: 'error', code: 'IDENTITY_CONFLICT' })
    const tasks = expectOk(await coordinator.read((reader) => reader.listTasks())).value
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.task.title).toBe('Primeira')
  })

  it('ack de fechamento e snapshot autoritativo mostram antiga e gerada na mesma revisão (I01)', async () => {
    const { service, coordinator } = createService()
    const created = await createTask(service, { title: 'Recorrente', dueAt: DUE, recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    if (created.status !== 'ok') throw new Error('esperado ack')

    const closed = await changeStatus(service, created.taskId, created.editRevision, 'CANCELLED', { cancellation: 'SKIP' })
    expect(closed).toEqual({ version: 2, status: 'ok', revision: '2', contentRevision: '2', editRevision: '2' })
    if (closed.status !== 'ok') return

    // O snapshot autoritativo (não o ack) mostra a antiga fechada e a gerada juntas, na revisão do ack.
    const snapshot = await readSnapshot(coordinator)
    expect(snapshot.revision).toBe(closed.revision)
    expect(snapshot.tasks).toHaveLength(2)
    expect(snapshot.tasks.every((record) => record.contentRevision === closed.revision && record.editRevision === closed.revision)).toBe(true)

    const oldRecord = snapshot.tasks.find((record) => record.task.id === created.taskId)
    const nextRecord = snapshot.tasks.find((record) => record.task.id !== created.taskId)
    expect(oldRecord?.task.status).toBe('CANCELLED')
    expect('recurrence' in (oldRecord?.task ?? {})).toBe(false)
    expect(nextRecord?.task.status).toBe('TODO')
    expect(nextRecord?.task.seriesId).toBe(oldRecord?.task.seriesId)
    expect(nextRecord?.task.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1 })
    expect(JSON.stringify(closed)).not.toContain(nextRecord?.task.id ?? '')
  })

  it('sessão invalidada na fila: nenhuma unidade executa nos cinco comandos', async () => {
    const queued: Array<() => void> = []
    const { service, sessions, counts, coordinator } = createService({ schedule: (callback) => queued.push(callback) })
    let units = 0
    coordinator.onUnitMeasured(() => (units += 1))

    const commands: Array<() => Promise<unknown>> = [
      () => service.handleCreate(EVENT, { version: 2, draft: { title: 'x' } }),
      () => service.handleUpdate(EVENT, { version: 2, taskId: 'a', expectedEditRevision: '1', patch: {} }),
      () => service.handleStatus(EVENT, { version: 2, taskId: 'a', expectedEditRevision: '1', status: 'DONE' }),
      () => service.handleSubtaskDone(EVENT, { version: 2, taskId: 'a', expectedEditRevision: '1', subtaskId: 's', done: true }),
      () => service.handleOpenSource(EVENT, { version: 1, taskId: 'a', expectedContentRevision: '1' }),
    ]
    for (const command of commands) {
      const pending = command()
      sessions.invalidate()
      while (queued.length > 0) queued.shift()?.()
      expect(await pending).toMatchObject({ code: 'SESSION_CLOSED' })
      sessions.restore()
    }

    // A recusa acontece dentro do coordenador (admissão), antes de qualquer unidade tocar os dados.
    expect(counts).toEqual({ run: 4, read: 1 })
    expect(units).toBe(0)
    const listing = coordinator.read((reader) => reader.listTasks())
    while (queued.length > 0) queued.shift()?.()
    expect(expectOk(await listing).value).toHaveLength(0)
  })

  it('sessão invalidada depois da unidade: commit preservado e resposta suprimida nos cinco comandos', async () => {
    const { service, sessions, hooks, coordinator } = createService()
    const created = await createTask(service, { title: 'Base' })
    if (created.status !== 'ok') throw new Error('esperado ack')
    hooks.afterStorage = () => sessions.invalidate()

    // Criação confirmada no banco, resposta suprimida.
    const pendingCreate = createTask(service, { title: 'Nova' })
    expect(await pendingCreate).toMatchObject({ code: 'SESSION_CLOSED' })
    sessions.restore()
    expect((await readSnapshot(coordinator)).tasks.map((record) => record.task.id).sort()).toEqual(['gerado-1', 'gerado-2'])

    // Edição confirmada, resposta suprimida.
    const base = await storedTask(coordinator, created.taskId)
    const pendingEdit = updateTask(service, created.taskId, base.editRevision.toString(), { title: 'Editada' })
    expect(await pendingEdit).toMatchObject({ code: 'SESSION_CLOSED' })
    sessions.restore()
    const edited = await storedTask(coordinator, created.taskId)
    expect(edited.task.title).toBe('Editada')

    // Status confirmado, resposta suprimida.
    const pendingStatus = changeStatus(service, created.taskId, edited.editRevision.toString(), 'DONE')
    expect(await pendingStatus).toMatchObject({ code: 'SESSION_CLOSED' })
    sessions.restore()
    const done = await storedTask(coordinator, created.taskId)
    expect(done.task.status).toBe('DONE')

    // Toggle e origem executam sob a sessão ainda vigente e também são suprimidos na entrega.
    const pendingToggle = setSubtaskDone(service, created.taskId, done.editRevision.toString(), 'ausente', true)
    expect(await pendingToggle).toMatchObject({ code: 'SESSION_CLOSED' })
    sessions.restore()
    const pendingSource = service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: done.contentRevision.toString(),
    })
    expect(await pendingSource).toMatchObject({ code: 'SESSION_CLOSED' })
    sessions.restore()

    // A guarda de saída suprime a resposta, nunca o commit.
    expect((await storedTask(coordinator, created.taskId)).task.status).toBe('DONE')
  })

  it('abre somente a origem salva validada; URL proibida não chama o opener e não altera o histórico', async () => {
    const { service, coordinator, opened } = createService()
    const created = await createTask(service, { title: 'Origem' })
    if (created.status !== 'ok') throw new Error('esperado ack')

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
      const current = await storedTask(coordinator, created.taskId)
      const result = await service.handleOpenSource(EVENT, {
        version: 1,
        taskId: created.taskId,
        expectedContentRevision: current.contentRevision.toString(),
      })
      expect(['SOURCE_NOT_ALLOWED', 'SOURCE_TOO_LONG']).toContain((result as TaskCommandFailure).code)
      // O valor histórico permanece exatamente como estava.
      expect((await storedTask(coordinator, created.taskId)).task.sourceUrl).toBe(sourceUrl)
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
    const before = await storedTask(coordinator, created.taskId)
    const ok = await service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: before.contentRevision.toString(),
    })
    expect(ok).toEqual({ version: 1, status: 'ok' })
    expect(opened).toEqual(['https://example.test/pedido?a=1#b'])
    const after = await storedTask(coordinator, created.taskId)
    expect(after.contentRevision).toBe(before.contentRevision)
    expect(after.task.sourceUrl).toBe('https://example.test/pedido?a=1#b')

    // Base stale: conflito com a revisão atual, sem opener.
    const stale = await service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
    })
    expect(stale).toEqual({
      version: 1,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: before.contentRevision.toString(),
    })
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
    if (created.status !== 'ok') throw new Error('esperado ack')

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
    if (created.status !== 'ok') throw new Error('esperado ack')

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
    if (created.status !== 'ok') throw new Error('esperado ack')

    const result = await service.handleOpenSource(EVENT, {
      version: 1,
      taskId: created.taskId,
      expectedContentRevision: created.contentRevision,
    })
    expect(result).toMatchObject({ code: 'EXTERNAL_OPEN_FAILED' })
    expect(opened).toHaveLength(1)
    const stored = await storedTask(coordinator, created.taskId)
    expect(stored.task.sourceUrl).toBe('https://example.test/x')
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
    expect(result).toEqual({ version: 2, status: 'error', code: 'RESOURCE_LIMIT' })
  })

  it('expõe os cinco canais do catálogo versionado e nenhum a mais', () => {
    expect([TASK_CREATE_CHANNEL, TASK_UPDATE_CHANNEL, TASK_STATUS_CHANNEL, TASK_SUBTASK_DONE_CHANNEL, TASK_OPEN_SOURCE_CHANNEL]).toEqual([
      'task:create:v2',
      'task:update:v2',
      'task:status:v2',
      'task:subtask-done:v2',
      'task:source:open:v1',
    ])
  })
})
