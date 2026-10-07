import { describe, expect, it } from 'vitest'
import { DesktopLifecycle } from '../../src/main/desktop/lifecycle.js'
import type { SurfaceRole } from '../../src/application/capture/capture-ports.js'
function setup() {
  const calls: string[] = [], exists = new Set<SurfaceRole>(['MANAGER'])
  const window = (role: SurfaceRole) => ({ destroyed: () => !exists.has(role), hide: () => calls.push(`hide:${role}`), show: () => calls.push(`show:${role}`), restore: () => calls.push(`restore:${role}`), focus: () => calls.push(`focus:${role}`) })
  const lifecycle = new DesktopLifecycle({ window: role => exists.has(role) ? window(role) : undefined,
    create: role => { calls.push(`create:${role}`); exists.add(role); return window(role) },
    admit: role => calls.push(`admit:${role}`), withdraw: role => calls.push(`withdraw:${role}`),
    active: role => calls.push(`active:${role}`), suspended: role => calls.push(`suspended:${role}`),
    pauseReminders: () => calls.push('pause'), resumeReminders: () => { calls.push('resume') }, stop: () => calls.push('stop'), quit: () => calls.push('quit'),
  })
  return { lifecycle, calls, exists }
}
describe('Q10 duas superfícies, uma agenda e saída', () => {
  it('resume aguarda recuperação, preserva hidden e ignora conclusão depois de quit', async () => {
    const h = setup(); h.lifecycle.setTray(true); h.lifecycle.open('QUICK_ADD'); h.lifecycle.hide('MANAGER')
    let release!: (ok: boolean) => void
    h.lifecycle.ports.resumeReminders = () => new Promise<boolean>(resolve => { release = resolve })
    h.lifecycle.suspend(); h.calls.length = 0; h.lifecycle.resume(); h.lifecycle.resume()
    expect(h.lifecycle.power).toBe('SUSPENDED'); expect(h.calls).toEqual([])
    h.lifecycle.open('QUICK_ADD'); expect(h.calls).not.toContain('admit:QUICK_ADD')
    release(true); await Promise.resolve()
    expect(h.lifecycle.power).toBe('ACTIVE'); expect(h.calls).toContain('admit:QUICK_ADD'); expect(h.calls).not.toContain('admit:MANAGER')
    h.lifecycle.suspend(); h.lifecycle.resume(); h.lifecycle.quit(); h.calls.length = 0
    release(true); await Promise.resolve(); expect(h.calls).toEqual([])
  })
  it('falha de recuperação e suspend repetido durante await não liberam autoridade', async () => {
    const h = setup(); let release!: (ok: boolean) => void
    h.lifecycle.ports.resumeReminders = () => new Promise<boolean>(resolve => { release = resolve })
    h.lifecycle.suspend(); h.lifecycle.resume(); release(false); await Promise.resolve()
    expect(h.lifecycle.power).toBe('SUSPENDED'); expect(h.calls).not.toContain('admit:MANAGER')
    h.lifecycle.resume(); h.lifecycle.suspend(); release(true); await Promise.resolve()
    expect(h.lifecycle.power).toBe('SUSPENDED'); expect(h.calls).not.toContain('admit:MANAGER')
  })
  it('close/reopen retira só a admissão alvo, conserva a outra e não recria draft vivo', () => {
    const h = setup(); h.lifecycle.setTray(true); h.lifecycle.open('QUICK_ADD'); h.calls.length = 0
    expect(h.lifecycle.close('QUICK_ADD')).toBe(true)
    expect(h.calls).toEqual(['withdraw:QUICK_ADD', 'suspended:QUICK_ADD', 'hide:QUICK_ADD'])
    expect(h.lifecycle.visibilityFor('MANAGER')).toBe('VISIBLE')
    h.lifecycle.open('QUICK_ADD'); expect(h.calls).not.toContain('create:QUICK_ADD')
    h.lifecycle.close('MANAGER'); expect(h.lifecycle.visibilityFor('QUICK_ADD')).toBe('VISIBLE')
    expect(h.calls).not.toContain('pause')
  })
  it('suspend ambas uma vez; resume só visível e a agenda única', () => {
    const h = setup(); h.lifecycle.setTray(true); h.lifecycle.open('QUICK_ADD'); h.lifecycle.hide('MANAGER'); h.calls.length = 0
    h.lifecycle.suspend(); h.lifecycle.suspend(); h.lifecycle.resume()
    expect(h.calls).toEqual(['withdraw:MANAGER', 'suspended:MANAGER', 'withdraw:QUICK_ADD', 'suspended:QUICK_ADD', 'pause', 'resume', 'admit:QUICK_ADD', 'active:QUICK_ADD'])
  })
  it('sem tray fecha uma sem encerrar a outra; última drena uma vez', () => {
    const h = setup(); h.lifecycle.open('QUICK_ADD'); h.calls.length = 0
    expect(h.lifecycle.close('MANAGER')).toBe(false); h.exists.delete('MANAGER')
    expect(h.calls).toEqual(['withdraw:MANAGER', 'suspended:MANAGER'])
    expect(h.lifecycle.close('QUICK_ADD')).toBe(false); h.lifecycle.quit()
    expect(h.calls.filter(c => c === 'stop')).toHaveLength(1); expect(h.calls.filter(c => c === 'quit')).toHaveLength(1)
  })
  it('tray ausente na inicialização não cria janela extra; falha posterior recupera somente quando todas ocultas', () => {
    const h = setup(); h.lifecycle.setTray(false); expect(h.calls).toEqual([])
    h.lifecycle.setTray(true); h.lifecycle.open('QUICK_ADD'); h.lifecycle.hide('MANAGER'); h.lifecycle.hide('QUICK_ADD'); h.calls.length = 0
    h.lifecycle.setTray(false); expect(h.lifecycle.visibilityFor('MANAGER')).toBe('VISIBLE')
    expect(h.calls).toContain('admit:MANAGER'); expect(h.calls).not.toContain('create:MANAGER')
  })
})
