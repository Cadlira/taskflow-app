import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'

const ALLOWED_OPERATIONS = [
  'changeTaskStatus',
  'clearUndoOffer',
  'createTask',
  'deleteTrashItem',
  'emptyTrash',
  'getStateSnapshot',
  'moveTaskToTrash',
  'openTaskSource',
  'prepareTrashConfirmation',
  'prepareTrashView',
  'restoreTrashItem',
  'setSubtaskDone',
  'subscribeState',
  'undoLastTaskAction',
  'unsubscribeState',
  'updateTask',
  'verifyFoundation',
] as const

const electron = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve({ version: 2, status: 'error', code: 'UNAUTHORIZED' }),
  ),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, api: unknown) => electron.exposed.set(key, api) },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener, send: electron.send },
}))

let api: TaskFlowDesktopApi
let listenersAtLoad: unknown[] = []
let invocationsAtLoad = -1

beforeAll(async () => {
  await import('../../src/preload/index.js')
  api = electron.exposed.get('taskflowDesktop') as TaskFlowDesktopApi
  // Capturado na carga: os mocks são limpos antes de cada teste.
  listenersAtLoad = electron.on.mock.calls.map((call) => call[0])
  invocationsAtLoad = electron.invoke.mock.calls.length
})

const ENTRY = { taskId: 'tarefa-1', contentRevision: '2', deletedAt: '2026-10-04T12:00:00.000Z' }

describe('catálogo da bridge', () => {
  it('expõe um único objeto congelado com exatamente as dezessete operações', () => {
    expect([...electron.exposed.keys()]).toEqual(['taskflowDesktop'])
    expect(Object.keys(api).sort()).toEqual([...ALLOWED_OPERATIONS])
    expect(Object.keys(api)).toHaveLength(17)
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.values(api).every((operation) => typeof operation === 'function')).toBe(true)
  })

  it('não expõe SQL, caminho, repository, Task livre, UndoPlan, canal genérico, shell, clipboard ou hooks de teste', () => {
    const names = Object.keys(api)
    for (const name of names) {
      expect(ALLOWED_OPERATIONS as readonly string[]).toContain(name)
    }
    for (const forbidden of [
      /sql|query|exec|path|file|repository|invoke|send|channel|ipc/i,
      /shell|clipboard|notif|credential|ai\b/i,
      /harness|smoke|test|hook/i,
      /UndoPlan|beforeImage|clock|predicate|sessionId/i,
    ]) {
      expect(forbidden.test(names.join(' '))).toBe(false)
    }
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api).not.toHaveProperty('invoke')
  })

  it('instala os listeners fixos de evento v2 uma única vez, antes de qualquer pedido', () => {
    expect(listenersAtLoad).toEqual(['state:changed:v2', 'state:unavailable:v2'])
    expect(invocationsAtLoad).toBe(0)
    expect(electron.on).not.toHaveBeenCalled()
  })

  it('usa somente os canais fixos do catálogo (v3 nas mutações, v2 no estado, v1 nas novas operações)', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockImplementation((channel: unknown) => {
      if (channel === 'foundation:verify:v1' || channel === 'task:source:open:v1') {
        return Promise.resolve({ version: 1, status: 'error', code: 'UNAUTHORIZED' })
      }
      if (String(channel).startsWith('trash:') || channel === 'task:undo:v1') {
        return Promise.resolve({ version: 1, status: 'error', code: 'UNAUTHORIZED' })
      }
      if (String(channel).startsWith('task:')) {
        return Promise.resolve({ version: 3, status: 'error', code: 'UNAUTHORIZED' })
      }
      return Promise.resolve({ version: 2, status: 'error', code: 'UNAUTHORIZED' })
    })
    await api.verifyFoundation({ version: 1 })
    await api.getStateSnapshot({ version: 2 })
    await api.subscribeState({ version: 2 }, () => undefined)
    await api.unsubscribeState({ version: 2, subscriptionId: 'A'.repeat(32) })
    await api.createTask({ version: 3, contextSequence: 1, draft: { title: 'x' } })
    await api.updateTask({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', patch: {} })
    await api.changeTaskStatus({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', status: 'DONE' })
    await api.setSubtaskDone({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', subtaskId: 's1', done: true })
    await api.openTaskSource({ version: 1, taskId: 'a', expectedContentRevision: '1' })
    await api.clearUndoOffer({ version: 1, contextSequence: 1 })
    await api.prepareTrashConfirmation({ version: 1, contextSequence: 1, kind: 'MOVE', taskId: 'a', expectedContentRevision: '1' })
    await api.moveTaskToTrash({ version: 1, contextSequence: 1, confirmationToken: 'A'.repeat(32) })
    await api.restoreTrashItem({ version: 1, contextSequence: 1, entry: ENTRY })
    await api.deleteTrashItem({ version: 1, contextSequence: 1, confirmationToken: 'A'.repeat(32) })
    await api.emptyTrash({ version: 1, contextSequence: 1, confirmationToken: 'A'.repeat(32) })
    await api.prepareTrashView({ version: 1, contextSequence: 1 })
    await api.undoLastTaskAction({ version: 1, contextSequence: 1, undoToken: 'A'.repeat(32) })

    const calls = electron.invoke.mock.calls
    expect(calls.map((call) => call[0])).toEqual([
      'foundation:verify:v1',
      'state:snapshot:v2',
      'state:subscribe:v2',
      'state:unsubscribe:v2',
      'task:create:v3',
      'task:update:v3',
      'task:status:v3',
      'task:subtask-done:v3',
      'task:source:open:v1',
      'trash:clear-undo:v1',
      'trash:prepare-confirm:v1',
      'trash:move:v1',
      'trash:restore:v1',
      'trash:delete:v1',
      'trash:empty:v1',
      'trash:prepare-view:v1',
      'task:undo:v1',
    ])
    expect(calls.every((call) => call.length === 2)).toBe(true)
    expect(calls.flatMap((call) => Object.values(call[1] as object)).some((value) => typeof value === 'function')).toBe(false)
    expect(calls[2]?.[1]).toEqual({ version: 2 })
    expect(electron.send).not.toHaveBeenCalled()
  })

  it('não aceita alias permissivo de versões antigas, tokens inválidos ou canais fora do catálogo', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockResolvedValue({ version: 1, status: 'error', code: 'UNAUTHORIZED' })

    const invalidRequests: Array<{ run: () => Promise<unknown>; expected: unknown }> = [
      { run: () => api.getStateSnapshot({ version: 1 } as never), expected: { version: 2, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.unsubscribeState({ version: 1, subscriptionId: 'A'.repeat(32) } as never), expected: { version: 2, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.createTask({ version: 1, draft: { title: 'x' } } as never), expected: { version: 3, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.createTask({ version: 2, contextSequence: 1, draft: { title: 'x' } } as never), expected: { version: 3, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.updateTask({ version: 2, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', patch: {} } as never), expected: { version: 3, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.changeTaskStatus({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', status: 'NOPE' } as never), expected: { version: 3, status: 'error', code: 'VALIDATION_FAILED', fields: { status: 'INVALID_VALUE' } } },
      { run: () => api.setSubtaskDone({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', subtaskId: 's1', done: 'yes' as never }), expected: { version: 3, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.getStateSnapshot({ version: 2, sql: 'SELECT 1' } as never), expected: { version: 2, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.createTask({ version: 3, contextSequence: 1, draft: { title: 'x', id: 'forjado' } } as never), expected: { version: 3, status: 'error', code: 'INVALID_REQUEST' } },
      // A abertura da origem conserva a falha v1 mesmo com o request recusado.
      { run: () => api.openTaskSource({ version: 2, taskId: 'a', expectedContentRevision: '1' } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      // Lixeira/undo: contexto, tokens e referências têm schema exato no preload.
      { run: () => api.clearUndoOffer({ version: 1, contextSequence: 0 } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.prepareTrashConfirmation({ version: 1, contextSequence: 1, kind: 'MOVE', taskId: 'a' } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.moveTaskToTrash({ version: 1, contextSequence: 1, confirmationToken: 'curto' } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.restoreTrashItem({ version: 1, contextSequence: 1, entry: { taskId: 'a', contentRevision: '01', deletedAt: ENTRY.deletedAt } } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.deleteTrashItem({ version: 1, contextSequence: 1, confirmationToken: 'A'.repeat(32), task: {} } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.emptyTrash({ version: 1, contextSequence: 1 } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.prepareTrashView({ version: 1 } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
      { run: () => api.undoLastTaskAction({ version: 1, contextSequence: 1, undoToken: 'A'.repeat(32), beforeImage: {} } as never), expected: { version: 1, status: 'error', code: 'INVALID_REQUEST' } },
    ]
    for (const invalid of invalidRequests) {
      expect(await invalid.run()).toEqual(invalid.expected)
    }
    expect(electron.invoke).not.toHaveBeenCalled()
  })

  it('request inválido não chega ao main; resposta do main é validada antes de voltar', async () => {
    electron.invoke.mockClear()
    const invalid = await api.getStateSnapshot({ version: 2, sql: 'SELECT 1' } as never)
    expect(invalid).toEqual({ version: 2, status: 'error', code: 'INVALID_REQUEST' })
    const forbiddenTask = await api.createTask({ version: 3, contextSequence: 1, draft: { title: 'x', id: 'forjado' } } as never)
    expect(forbiddenTask).toEqual({ version: 3, status: 'error', code: 'INVALID_REQUEST' })
    expect(electron.invoke).not.toHaveBeenCalled()

    electron.invoke.mockResolvedValueOnce({ version: 2, status: 'error', code: 'BUSY', stack: 'at C:\\x' } as never)
    expect(await api.getStateSnapshot({ version: 2 })).toEqual({ version: 2, status: 'error', code: 'STORAGE_UNAVAILABLE' })

    // Saída malformada de comando vira falha local de transporte (resultado incerto), não sucesso.
    electron.invoke.mockResolvedValueOnce({ version: 3, status: 'ok', taskId: 'x' } as never)
    await expect(api.createTask({ version: 3, contextSequence: 1, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')

    // Ack v2 antigo de mutação também é recusado, sem virar sucesso.
    electron.invoke.mockResolvedValueOnce({ version: 2, status: 'ok', taskId: 'x', revision: '1', contentRevision: '1', editRevision: '1' } as never)
    await expect(api.createTask({ version: 3, contextSequence: 1, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')

    // Saída malformada de lixeira/undo vira resultado incerto local.
    electron.invoke.mockResolvedValueOnce({ version: 1, status: 'ok', task: { id: 'x' } } as never)
    await expect(api.moveTaskToTrash({ version: 1, contextSequence: 1, confirmationToken: 'A'.repeat(32) })).rejects.toThrow(
      'trash-command-transport',
    )
  })

  it('transporte falhou: falha local e nenhuma repetição automática', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockRejectedValueOnce(new Error('transporte caiu'))
    await expect(api.createTask({ version: 3, contextSequence: 1, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')
    expect(electron.invoke).toHaveBeenCalledTimes(1)
    expect(electron.invoke.mock.calls[0]?.[0]).toBe('task:create:v3')

    electron.invoke.mockRejectedValueOnce(new Error('transporte caiu'))
    await expect(api.setSubtaskDone({ version: 3, contextSequence: 1, taskId: 'a', expectedEditRevision: '1', subtaskId: 's1', done: false })).rejects.toThrow(
      'task-command-transport',
    )
    expect(electron.invoke.mock.calls[1]?.[0]).toBe('task:subtask-done:v3')

    electron.invoke.mockRejectedValueOnce(new Error('transporte caiu'))
    await expect(api.undoLastTaskAction({ version: 1, contextSequence: 1, undoToken: 'A'.repeat(32) })).rejects.toThrow(
      'trash-command-transport',
    )
    expect(electron.invoke.mock.calls[2]?.[0]).toBe('task:undo:v1')
  })

  it('o código do preload não referencia Node, filesystem, SQLite, shell, canais livres ou canal de teste', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'preload', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/node:|require\(|sqlite|\bfs\b|child_process|\bshell\b|ipcRenderer\.send|sendSync|postMessage/)
    expect(source).not.toMatch(/harness|smoke|:test:|__test|testChannel/)
    expect(source).not.toMatch(/task:(create|update|status|subtask-done):v1/)
    expect(source).not.toMatch(/state:[a-z]+:v1/)
    expect(source.match(/exposeInMainWorld/g)).toHaveLength(1)
  })
})
