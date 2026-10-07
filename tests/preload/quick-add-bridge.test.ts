import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { QuickAddDesktopApi } from '../../src/contracts/desktop-api.js'
import { QUICK_ADD_OPERATIONS } from '../../src/contracts/surface-catalog.js'
const electron = vi.hoisted(() => ({ api: undefined as unknown, invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() }))
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: (_key: string, api: unknown) => { electron.api = api } },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener } }))
let api: QuickAddDesktopApi
let desktop: (event: unknown, payload: unknown) => void
beforeAll(async () => {
  await import('../../src/preload/quick-add.js'); api = electron.api as QuickAddDesktopApi
  desktop = electron.on.mock.calls.find(([channel]) => channel === 'desktop:event:v2')?.[1] as typeof desktop
})
describe('Q11 facade Quick Add', () => {
  it('exatamente14 operações congeladas, sem mutação de manager ou bootstrap por argv/URL', () => {
    expect(Object.keys(api).sort()).toEqual([...QUICK_ADD_OPERATIONS].sort()); expect(Object.isFrozen(api)).toBe(true)
    for (const name of ['openQuickAdd', 'setShortcut', 'setShortcutEditing', 'updateTask', 'exportBackup', 'verifyFoundation', 'setStartAtLogin', 'resolveReminderActivation']) expect(api).not.toHaveProperty(name)
  })
  it('contratos inválidos não invocam IPC e resposta malformada não entrega conteúdo', async () => {
    expect(await api.captureClipboard({ version: 2 } as unknown as { version: 1 })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(electron.invoke).not.toHaveBeenCalled()
    electron.invoke.mockResolvedValue({ version: 1, status: 'ok', raw: 'não entregar' })
    expect(await api.getPendingCapture({ version: 1 })).toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
  it('evento de outra role não retira sua sessão; suspensão própria barra entrega tardia', async () => {
    desktop({}, { version: 2, role: 'MANAGER', kind: 'surface-suspended', sequence: 10 })
    electron.invoke.mockResolvedValue({ version: 1, status: 'error', code: 'EMPTY' })
    expect(await api.captureClipboard({ version: 1 })).toMatchObject({ code: 'EMPTY' })
    let resolve!: (value: unknown) => void
    electron.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = api.captureClipboard({ version: 1 })
    desktop({}, { version: 2, role: 'QUICK_ADD', kind: 'surface-suspended', sequence: 11 })
    resolve({ version: 1, status: 'error', code: 'EMPTY' })
    expect(await pending).toMatchObject({ code: 'SESSION_CLOSED' })
    electron.invoke.mockClear(); await api.captureClipboard({ version: 1 }); expect(electron.invoke).not.toHaveBeenCalled()
    desktop({}, { version: 2, role: 'QUICK_ADD', kind: 'surface-active', sequence: 12 })
  })
})
