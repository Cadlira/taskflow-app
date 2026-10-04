import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'

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
  it('expõe um único objeto congelado com exatamente as quatro operações', () => {
    expect([...electron.exposed.keys()]).toEqual(['taskflowDesktop'])
    expect(Object.keys(api).sort()).toEqual(['getStateSnapshot', 'subscribeState', 'unsubscribeState', 'verifyFoundation'])
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.values(api).every((operation) => typeof operation === 'function')).toBe(true)
  })

  it('não há mutação, SQL, caminho, repository, Task livre, UndoPlan, canal genérico ou abertura externa', () => {
    const names = Object.keys(api).join(' ')
    for (const forbidden of [
      /create|update|save|delete|remove|restore|trash|status|undo|import|export|claim/i,
      /sql|query|exec|path|file|repository|invoke|send|channel|ipc|on$/i,
      /open|external|shell|clipboard|notif|ai|credential/i,
    ]) {
      expect(forbidden.test(names.replace(/unsubscribeState|subscribeState|getStateSnapshot|verifyFoundation/g, ''))).toBe(false)
    }
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api).not.toHaveProperty('invoke')
  })

  it('instala os listeners fixos de evento uma única vez, antes de qualquer pedido', () => {
    expect(listenersAtLoad).toEqual(['state:changed:v1', 'state:unavailable:v1'])
    expect(invocationsAtLoad).toBe(0)
    expect(electron.on).not.toHaveBeenCalled()
  })

  it('usa somente os quatro canais fixos e nunca envia o callback local', async () => {
    await api.verifyFoundation({ version: 1 })
    await api.getStateSnapshot({ version: 1 })
    await api.subscribeState({ version: 1 }, () => undefined)
    await api.unsubscribeState({ version: 1, subscriptionId: 'A'.repeat(32) })

    const calls = electron.invoke.mock.calls
    expect(calls.map((call) => call[0])).toEqual([
      'foundation:verify:v1',
      'state:snapshot:v1',
      'state:subscribe:v1',
      'state:unsubscribe:v1',
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
    expect(electron.invoke).not.toHaveBeenCalled()

    electron.invoke.mockResolvedValueOnce({ version: 1, status: 'error', code: 'BUSY', stack: 'at C:\\x' } as never)
    expect(await api.getStateSnapshot({ version: 1 })).toEqual({ version: 1, status: 'error', code: 'STORAGE_UNAVAILABLE' })
  })

  it('o código do preload não referencia Node, filesystem, SQLite ou canais livres', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'preload', 'index.ts'), 'utf8')
    expect(source).not.toMatch(/node:|require\(|sqlite|\bfs\b|child_process|ipcRenderer\.send|sendSync|postMessage/)
    expect(source.match(/exposeInMainWorld/g)).toHaveLength(1)
  })
})
