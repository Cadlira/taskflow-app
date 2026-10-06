import { describe, expect, it, vi } from 'vitest'
import { createDesktopTray, type TrayHandle, type TrayMenuItem } from '../../src/main/desktop/tray.js'

function fixture(options: { empty?: boolean; destroyed?: boolean; throwAt?: 'tooltip' } = {}) {
  const calls: string[] = []
  const items: TrayMenuItem[] = []
  let destroyed = options.destroyed ?? false
  const handlers = new Map<string, () => void>()
  const tray: TrayHandle = {
    setToolTip: (text) => {
      if (options.throwAt === 'tooltip') throw new Error('fixture: tooltip falhou')
      calls.push(`tooltip:${text}`)
    },
    setContextMenu: () => { calls.push('menu') },
    on: (event, callback) => { handlers.set(event, callback) },
    isDestroyed: () => destroyed,
    destroy: () => { destroyed = true; calls.push('destroy') },
  }
  const ports = {
    name: 'TaskFlow App',
    icon: () => ({ isEmpty: () => options.empty === true }),
    create: vi.fn(() => tray),
    menu: vi.fn((menuItems: ReadonlyArray<TrayMenuItem>) => { items.push(...menuItems); return {} }),
    open: vi.fn(),
    quit: vi.fn(),
  }
  return { ports, calls, items, handlers, destroy: () => { destroyed = true } }
}

describe('M08 bandeja: fake Tray/menu, ativação e falha', () => {
  it('aplica tooltip/nome, menu Abrir/Sair e clique abre; destroy é repassado', () => {
    const f = fixture()
    const tray = createDesktopTray(f.ports)
    expect(tray).toBeDefined()
    expect(f.calls).toEqual(['tooltip:TaskFlow App', 'menu'])
    expect(f.items.map((item) => item.label)).toEqual(['Abrir', 'Sair'])
    f.items[0]?.click()
    expect(f.ports.open).toHaveBeenCalledOnce()
    f.items[1]?.click()
    expect(f.ports.quit).toHaveBeenCalledOnce()
    f.handlers.get('click')?.()
    expect(f.ports.open).toHaveBeenCalledTimes(2)

    expect(tray?.valid()).toBe(true)
    f.destroy()
    expect(tray?.valid()).toBe(false)
    tray?.destroy()
    expect(f.calls).toContain('destroy')
  })

  it('ícone vazio e falha parcial não deixam bandeja utilizável nem objeto retido', () => {
    const empty = fixture({ empty: true })
    expect(createDesktopTray(empty.ports)).toBeUndefined()
    expect(empty.ports.create).not.toHaveBeenCalled()

    const failing = fixture({ throwAt: 'tooltip' })
    expect(createDesktopTray(failing.ports)).toBeUndefined()
    expect(failing.calls).toContain('destroy')
  })
})
