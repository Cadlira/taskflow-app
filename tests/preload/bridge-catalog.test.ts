import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'

const ALLOWED_OPERATIONS = [
  'changeTaskStatus',
  'createTask',
  'getStateSnapshot',
  'openTaskSource',
  'setSubtaskDone',
  'subscribeState',
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

describe('catálogo da bridge', () => {
  it('expõe um único objeto congelado com exatamente as nove operações', () => {
    expect([...electron.exposed.keys()]).toEqual(['taskflowDesktop'])
    expect(Object.keys(api).sort()).toEqual([...ALLOWED_OPERATIONS])
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.values(api).every((operation) => typeof operation === 'function')).toBe(true)
  })

  it('não expõe SQL, caminho, repository, Task livre, UndoPlan, canal genérico, lixeira, undo, shell ou clipboard', () => {
    const names = Object.keys(api)
    for (const name of names) {
      expect(ALLOWED_OPERATIONS as readonly string[]).toContain(name)
    }
    for (const forbidden of [
      /delete|remove|restore|trash|undo|import|export|claim/i,
      /sql|query|exec|path|file|repository|invoke|send|channel|ipc/i,
      /shell|clipboard|notif|credential|ai\b/i,
      /harness|smoke|test/i,
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

  it('usa somente os canais fixos do catálogo (v2 nas mutações/estado, v1 em fundação/origem)', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockImplementation((channel: unknown) =>
      Promise.resolve(
        channel === 'task:source:open:v1' || channel === 'foundation:verify:v1'
          ? { version: 1, status: 'error', code: 'UNAUTHORIZED' }
          : { version: 2, status: 'error', code: 'UNAUTHORIZED' },
      ),
    )
    await api.verifyFoundation({ version: 1 })
    await api.getStateSnapshot({ version: 2 })
    await api.subscribeState({ version: 2 }, () => undefined)
    await api.unsubscribeState({ version: 2, subscriptionId: 'A'.repeat(32) })
    await api.createTask({ version: 2, draft: { title: 'x' } })
    await api.updateTask({ version: 2, taskId: 'a', expectedEditRevision: '1', patch: {} })
    await api.changeTaskStatus({ version: 2, taskId: 'a', expectedEditRevision: '1', status: 'DONE' })
    await api.setSubtaskDone({ version: 2, taskId: 'a', expectedEditRevision: '1', subtaskId: 's1', done: true })
    await api.openTaskSource({ version: 1, taskId: 'a', expectedContentRevision: '1' })

    const calls = electron.invoke.mock.calls
    expect(calls.map((call) => call[0])).toEqual([
      'foundation:verify:v1',
      'state:snapshot:v2',
      'state:subscribe:v2',
      'state:unsubscribe:v2',
      'task:create:v2',
      'task:update:v2',
      'task:status:v2',
      'task:subtask-done:v2',
      'task:source:open:v1',
    ])
    expect(calls.every((call) => call.length === 2)).toBe(true)
    expect(calls.flatMap((call) => Object.values(call[1] as object)).some((value) => typeof value === 'function')).toBe(false)
    expect(calls[2]?.[1]).toEqual({ version: 2 })
    expect(electron.send).not.toHaveBeenCalled()
  })

  it('não aceita alias permissivo de versões antigas e não alcança canais fora do catálogo', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockResolvedValue({ version: 1, status: 'error', code: 'UNAUTHORIZED' })

    // v1 de estado/mutação e canais/campos livres são recusados no preload, sem invoke.
    const invalidRequests: Array<{ run: () => Promise<unknown>; version: 1 | 2 }> = [
      { run: () => api.getStateSnapshot({ version: 1 } as never), version: 2 },
      { run: () => api.unsubscribeState({ version: 1, subscriptionId: 'A'.repeat(32) } as never), version: 2 },
      { run: () => api.createTask({ version: 1, draft: { title: 'x' } } as never), version: 2 },
      { run: () => api.updateTask({ version: 1, taskId: 'a', expectedContentRevision: '1', patch: {} } as never), version: 2 },
      { run: () => api.changeTaskStatus({ version: 1, taskId: 'a', expectedContentRevision: '1', status: 'DONE' } as never), version: 2 },
      { run: () => api.setSubtaskDone({ version: 2, taskId: 'a', expectedEditRevision: '1', subtaskId: 's1', done: 'yes' as never }), version: 2 },
      { run: () => api.getStateSnapshot({ version: 2, sql: 'SELECT 1' } as never), version: 2 },
      { run: () => api.createTask({ version: 2, draft: { title: 'x', id: 'forjado' } } as never), version: 2 },
      // A abertura da origem conserva a falha v1 mesmo com o request recusado.
      { run: () => api.openTaskSource({ version: 2, taskId: 'a', expectedContentRevision: '1' } as never), version: 1 },
    ]
    for (const invalid of invalidRequests) {
      expect(await invalid.run()).toEqual({ version: invalid.version, status: 'error', code: 'INVALID_REQUEST' })
    }
    expect(electron.invoke).not.toHaveBeenCalled()
  })

  it('request inválido não chega ao main; resposta do main é validada antes de voltar', async () => {
    electron.invoke.mockClear()
    const invalid = await api.getStateSnapshot({ version: 2, sql: 'SELECT 1' } as never)
    expect(invalid).toEqual({ version: 2, status: 'error', code: 'INVALID_REQUEST' })
    const forbiddenTask = await api.createTask({ version: 2, draft: { title: 'x', id: 'forjado' } } as never)
    expect(forbiddenTask).toEqual({ version: 2, status: 'error', code: 'INVALID_REQUEST' })
    expect(electron.invoke).not.toHaveBeenCalled()

    electron.invoke.mockResolvedValueOnce({ version: 2, status: 'error', code: 'BUSY', stack: 'at C:\\x' } as never)
    expect(await api.getStateSnapshot({ version: 2 })).toEqual({ version: 2, status: 'error', code: 'STORAGE_UNAVAILABLE' })

    // Saída malformada de comando vira falha local de transporte (resultado incerto), não sucesso.
    electron.invoke.mockResolvedValueOnce({ version: 2, status: 'ok', taskId: 'x' } as never)
    await expect(api.createTask({ version: 2, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')

    // Ack v1 antigo de mutação também é recusado, sem virar sucesso.
    electron.invoke.mockResolvedValueOnce({ version: 1, status: 'ok', taskId: 'x', revision: '1', contentRevision: '1' } as never)
    await expect(api.createTask({ version: 2, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')
  })

  it('transporte falhou: falha local e nenhuma repetição automática', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockRejectedValueOnce(new Error('transporte caiu'))
    await expect(api.createTask({ version: 2, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')
    expect(electron.invoke).toHaveBeenCalledTimes(1)
    expect(electron.invoke.mock.calls[0]?.[0]).toBe('task:create:v2')

    electron.invoke.mockRejectedValueOnce(new Error('transporte caiu'))
    await expect(api.setSubtaskDone({ version: 2, taskId: 'a', expectedEditRevision: '1', subtaskId: 's1', done: false })).rejects.toThrow(
      'task-command-transport',
    )
    expect(electron.invoke.mock.calls[1]?.[0]).toBe('task:subtask-done:v2')
  })

  it('o código do preload não referencia Node, filesystem, SQLite, shell, canais livres ou canal de teste', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'preload', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/node:|require\(|sqlite|\bfs\b|child_process|\bshell\b|ipcRenderer\.send|sendSync|postMessage/)
    expect(source).not.toMatch(/harness|smoke|:test:|__test|testChannel/)
    expect(source).not.toMatch(/task:(create|update|status|subtask-done):v1/)
    expect(source.match(/exposeInMainWorld/g)).toHaveLength(1)
  })
})
