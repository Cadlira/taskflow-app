import { describe, expect, it, vi } from 'vitest'
import { DesktopLifecycle } from '../../src/main/desktop/lifecycle.js'

function fixture() {
  const calls: string[] = []
  let destroyed = false
  const window = { destroyed: () => destroyed, hide: () => calls.push('hide'), show: () => calls.push('show'), focus: () => calls.push('focus'), restore: () => calls.push('restore') }
  const ports = {
    window: () => window,
    create: () => { calls.push('create'); destroyed = false; return window },
    admit: () => calls.push('admit'), withdraw: () => calls.push('withdraw'), suspended: () => calls.push('suspended'), active: () => calls.push('active'),
    pauseReminders: () => calls.push('pause'), resumeReminders: () => calls.push('resume'), stop: () => calls.push('stop'), quit: () => calls.push('quit'),
  }
  return { lifecycle: new DesktopLifecycle(ports), calls, crash: () => { destroyed = true }, ports }
}
describe('M07/M08 lifecycle main', () => {
  it('close retira admissão antes do hide e abrir estabelece sessão sem recriar Vue', () => {
    const f = fixture(); f.lifecycle.setTray(true)
    expect(f.lifecycle.close()).toBe(true)
    expect(f.calls).toEqual(['withdraw', 'suspended', 'hide'])
    expect(f.lifecycle.remindersActive).toBe(true)
    f.lifecycle.open()
    expect(f.calls.slice(3)).toEqual(['restore', 'show', 'focus', 'admit', 'active'])
    expect(f.calls).not.toContain('create')
  })
  it('tray ausente fecha completamente, saída/logoff repetidos não escondem nem drenam duas vezes', () => {
    const f = fixture()
    expect(f.lifecycle.close()).toBe(false)
    f.lifecycle.quit(); f.lifecycle.close(); f.lifecycle.open()
    expect(f.calls).toEqual(['withdraw', 'suspended', 'stop', 'quit'])
    expect(f.lifecycle.power).toBe('QUITTING')
    expect(f.lifecycle.remindersActive).toBe(false)
  })
  it('suspend cancela agenda e admissão; resume oculto não concede sessão ao renderer', () => {
    const f = fixture(); f.lifecycle.setTray(true); f.lifecycle.hide(); f.calls.length = 0
    f.lifecycle.suspend(); f.lifecycle.suspend()
    expect(f.calls).toEqual(['withdraw', 'suspended', 'pause'])
    expect(f.lifecycle.remindersActive).toBe(false)
    f.lifecycle.resume()
    expect(f.calls).toEqual(['withdraw', 'suspended', 'pause', 'resume'])
    expect(f.lifecycle.visibility).toBe('HIDDEN')
    f.lifecycle.open()
    expect(f.calls.slice(-2)).toEqual(['admit', 'active'])
  })
  it('falha conhecida de tray abre a janela; renderer destruído recria uma única superfície', () => {
    const f = fixture(); f.lifecycle.setTray(true); f.lifecycle.hide(); f.calls.length = 0
    f.lifecycle.setTray(false)
    expect(f.calls).toEqual(['restore', 'show', 'focus', 'admit', 'active'])
    f.crash(); f.lifecycle.rendererGone()
    expect(f.calls.filter(item => item === 'create')).toHaveLength(1)
  })
  it('não existe efeito de minimize no ciclo de vida', () => {
    const f = fixture()
    const stop = vi.spyOn(f.ports, 'withdraw')
    expect(f.lifecycle.visibility).toBe('VISIBLE')
    expect(stop).not.toHaveBeenCalled()
  })
  it('bandeja invalidada com janela oculta recupera a janela; fechar em seguida encerra uma vez', () => {
    const f = fixture(); f.lifecycle.setTray(true); f.lifecycle.hide(); f.calls.length = 0
    f.lifecycle.setTray(false)
    expect(f.calls).toEqual(['restore', 'show', 'focus', 'admit', 'active'])
    expect(f.lifecycle.close()).toBe(false)
    f.lifecycle.quit()
    expect(f.calls.filter(item => item === 'quit')).toHaveLength(1)
    expect(f.calls.filter(item => item === 'stop')).toHaveLength(1)
  })
  it('window-all-closed mantém o processo com tray válido e encerra sem tray, uma única vez', () => {
    const f = fixture(); f.lifecycle.setTray(true); f.lifecycle.hide(); f.calls.length = 0
    f.lifecycle.windowAllClosed(true)
    expect(f.calls).toEqual([])
    expect(f.lifecycle.visibility).toBe('HIDDEN')
    f.lifecycle.windowAllClosed(false)
    expect(f.calls).toEqual(['withdraw', 'suspended', 'stop', 'quit'])
    f.lifecycle.windowAllClosed(false)
    expect(f.calls.filter(item => item === 'quit')).toHaveLength(1)
  })
})
