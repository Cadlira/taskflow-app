import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'

const ALLOWED_OPERATIONS = [
  'changeTaskStatus',
  'createTask',
  'getStateSnapshot',
  'openTaskSource',
  'subscribeState',
  'unsubscribeState',
  'updateTask',
  'verifyFoundation',
] as const

const electron = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(() =>
    Promise.resolve({ version: 1, status: 'error', code: 'UNAUTHORIZED' }),
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
  it('expõe um único objeto congelado com exatamente as oito operações', () => {
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
    ]) {
      expect(forbidden.test(names.join(' '))).toBe(false)
    }
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api).not.toHaveProperty('invoke')
  })

  it('instala os listeners fixos de evento uma única vez, antes de qualquer pedido', () => {
    expect(listenersAtLoad).toEqual(['state:changed:v1', 'state:unavailable:v1'])
    expect(invocationsAtLoad).toBe(0)
    expect(electron.on).not.toHaveBeenCalled()
  })

  it('usa somente os canais fixos do catálogo e nunca envia o callback local', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockResolvedValue({ version: 1, status: 'error', code: 'UNAUTHORIZED' })
    await api.verifyFoundation({ version: 1 })
    await api.getStateSnapshot({ version: 1 })
    await api.subscribeState({ version: 1 }, () => undefined)
    await api.unsubscribeState({ version: 1, subscriptionId: 'A'.repeat(32) })
    await api.createTask({ version: 1, draft: { title: 'x' } })
    await api.updateTask({ version: 1, taskId: 'a', expectedContentRevision: '1', patch: {} })
    await api.changeTaskStatus({ version: 1, taskId: 'a', expectedContentRevision: '1', status: 'DONE' })
    await api.openTaskSource({ version: 1, taskId: 'a', expectedContentRevision: '1' })

    const calls = electron.invoke.mock.calls
    expect(calls.map((call) => call[0])).toEqual([
      'foundation:verify:v1',
      'state:snapshot:v1',
      'state:subscribe:v1',
      'state:unsubscribe:v1',
      'task:create:v1',
      'task:update:v1',
      'task:status:v1',
      'task:source:open:v1',
    ])
    expect(calls.every((call) => call.length === 2)).toBe(true)
    expect(calls.flatMap((call) => Object.values(call[1] as object)).some((value) => typeof value === 'function')).toBe(false)
    expect(calls[2]?.[1]).toEqual({ version: 1 })
    expect(electron.send).not.toHaveBeenCalled()
  })

  it('request inválido não chega ao main; resposta do main é validada antes de voltar', async () => {
    electron.invoke.mockClear()
    const invalid = await api.getStateSnapshot({ version: 1, sql: 'SELECT 1' } as never)
    expect(invalid).toEqual({ version: 1, status: 'error', code: 'INVALID_REQUEST' })
    const forbiddenTask = await api.createTask({ version: 1, draft: { title: 'x', id: 'forjado' } } as never)
    expect(forbiddenTask).toEqual({ version: 1, status: 'error', code: 'INVALID_REQUEST' })
    expect(electron.invoke).not.toHaveBeenCalled()

    electron.invoke.mockResolvedValueOnce({ version: 1, status: 'error', code: 'BUSY', stack: 'at C:\\x' } as never)
    expect(await api.getStateSnapshot({ version: 1 })).toEqual({ version: 1, status: 'error', code: 'STORAGE_UNAVAILABLE' })

    // Saída malformada de comando vira falha local de transporte (resultado incerto), não sucesso.
    electron.invoke.mockResolvedValueOnce({ version: 1, status: 'ok', taskId: 'x' } as never)
    await expect(api.createTask({ version: 1, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')
  })

  it('transporte falhou: falha local e nenhuma repetição automática', async () => {
    electron.invoke.mockClear()
    electron.invoke.mockRejectedValueOnce(new Error('transporte caiu'))
    await expect(api.createTask({ version: 1, draft: { title: 'x' } })).rejects.toThrow('task-command-transport')
    expect(electron.invoke).toHaveBeenCalledTimes(1)
    expect(electron.invoke.mock.calls[0]?.[0]).toBe('task:create:v1')
  })

  it('o código do preload não referencia Node, filesystem, SQLite, shell ou canais livres', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'preload', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/node:|require\(|sqlite|\bfs\b|child_process|\bshell\b|ipcRenderer\.send|sendSync|postMessage/)
    expect(source.match(/exposeInMainWorld/g)).toHaveLength(1)
  })
})
