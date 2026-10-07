import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShortcutSettings from '../../src/renderer/src/components/capture/ShortcutSettings.vue'
import ShortcutHint from '../../src/renderer/src/components/capture/ShortcutHint.vue'
import { defaultShortcutActions, SHORTCUT_ACTIONS } from '../../src/domain/global-shortcuts.js'
import type { ShortcutSettingsResult } from '../../src/contracts/capture-shortcuts.js'
import type { DesktopEvent, DesktopListener } from '../../src/contracts/desktop.js'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = '' })
async function setup() {
  setActivePinia(createPinia())
  const desired = defaultShortcutActions()
  let result: ShortcutSettingsResult = { version: 1, status: 'ok', settings: { configRevision: '1', statusSequence: '2', editing: false, settersBlocked: false,
    actions: SHORTCUT_ACTIONS.map(action => ({ action, desired: desired[action], observed: desired[action] ? 'REGISTERED' : 'NONE' })),
  } }
  const listeners = new Set<DesktopListener>()
  const api = { getShortcutSettings: vi.fn(async () => result),
    setShortcut: vi.fn<TaskFlowDesktopApi['setShortcut']>(async () => result),
    setShortcutEditing: vi.fn<TaskFlowDesktopApi['setShortcutEditing']>(async () => ({ version: 1, status: 'ok' })),
    subscribeDesktopEvents: vi.fn<TaskFlowDesktopApi['subscribeDesktopEvents']>(async (_request, listener) => { listeners.add(listener); return { dispose: () => { listeners.delete(listener) } } }),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api })
  wrapper = mount(ShortcutSettings, { attachTo: document.body }); await flushPromises()
  return { view: wrapper, api, replace: (next: ShortcutSettingsResult) => { result = next }, result: () => result,
    event: (event: DesktopEvent) => { for (const listener of listeners) listener(event) },
  }
}
describe('Q08/Q12 editor estruturado de atalhos', () => {
  it('três ações, allowlist e CAS de setter sem accelerator livre', async () => {
    const h = await setup(); const fields = h.view.findAll('fieldset'); expect(fields).toHaveLength(3)
    const keys = fields[0]!.findAll('select').at(1)!.findAll('option').map(o => o.attributes('value'))
    expect(keys).toContain('F24'); expect(keys).not.toContain('F4'); expect(keys).not.toContain('Win')
    await fields[0]!.findAll('select')[0]!.setValue('ALT_SHIFT'); await fields[0]!.findAll('select')[1]!.setValue('X')
    await fields[0]!.findAll('button')[0]!.trigger('click'); await flushPromises()
    expect(h.api.setShortcut).toHaveBeenCalledWith({ version: 1, action: 'QUICK_ADD', combination: { modifiers: 'ALT_SHIFT', key: 'X' }, expectedConfigRevision: '1' })
  })
  it('lease ao focar e saída de foco/fim libera; defaults individuais incluem null de captura', async () => {
    const h = await setup(); await h.view.get('section').trigger('focusin'); await flushPromises()
    expect(h.api.setShortcutEditing).toHaveBeenCalledWith({ version: 1, editing: true })
    await h.view.get('section').trigger('focusout', { relatedTarget: null }); await flushPromises()
    expect(h.api.setShortcutEditing).toHaveBeenCalledWith({ version: 1, editing: false })
    await h.view.findAll('fieldset')[2]!.findAll('button')[1]!.trigger('click'); await flushPromises()
    expect(h.api.setShortcut).toHaveBeenCalledWith({ version: 1, action: 'CAPTURE_CLIPBOARD', combination: null, expectedConfigRevision: '1' })
  })
  it('stale não repete; UNKNOWN permite gesto no-op explícito de reconciliação', async () => {
    const h = await setup(); h.api.setShortcut.mockResolvedValueOnce({ version: 1, status: 'error', code: 'STALE_SETTINGS' })
    await h.view.findAll('fieldset')[0]!.findAll('button')[0]!.trigger('click'); await flushPromises()
    expect(h.api.setShortcut).toHaveBeenCalledTimes(1); expect(h.view.text()).toContain('A configuração mudou')
    const old = h.result(); if (old.status !== 'ok') throw new Error('fixture')
    h.replace({ ...old, settings: { ...old.settings, settersBlocked: true, actions: old.settings.actions.map(item => ({ ...item, observed: 'UNKNOWN' })) } })
    h.event({ version: 2, role: 'MANAGER', sequence: 2, kind: 'shortcuts-changed', configRevision: '1', statusSequence: '3' }); await flushPromises()
    expect(h.view.findAll('fieldset')[0]!.findAll('button')[0]!.attributes('aria-disabled')).toBe('true')
    await h.view.findAll('fieldset')[0]!.findAll('button')[2]!.trigger('click'); await flushPromises()
    expect(h.api.setShortcut.mock.calls[1]?.[0]).toMatchObject({ action: 'QUICK_ADD', combination: defaultShortcutActions().QUICK_ADD, expectedConfigRevision: '1' })
  })
  it('hint mostra somente REGISTERED; desaparece para UNKNOWN/conflito/none', async () => {
    const h = await setup(); h.view.unmount()
    wrapper = mount(ShortcutHint, { props: { action: 'QUICK_ADD' } }); await flushPromises()
    expect(wrapper.text()).toContain('Ctrl+Shift+K')
    const old = h.result(); if (old.status !== 'ok') throw new Error('fixture')
    h.replace({ ...old, settings: { ...old.settings, actions: old.settings.actions.map(item => ({ ...item, observed: 'UNKNOWN' })) } })
    h.event({ version: 2, role: 'MANAGER', sequence: 2, kind: 'shortcuts-changed', configRevision: '1', statusSequence: '3' }); await flushPromises()
    expect(wrapper.text()).toBe('')
  })
  it('preferência inválida não aparece desativada nem permite setter; consulta continua disponível', async () => {
    const h = await setup(), old = h.result(); if (old.status !== 'ok') throw new Error('fixture')
    h.replace({ ...old, settings: { ...old.settings, settersBlocked: true, actions: old.settings.actions.map(item => ({ ...item, desired: null, observed: 'UNAVAILABLE', reason: 'PREFERENCES_INVALID' })) } })
    h.event({ version: 2, role: 'MANAGER', sequence: 2, kind: 'shortcuts-changed', configRevision: '1', statusSequence: '3' }); await flushPromises()
    expect(h.view.text()).toContain('Desejado: não confirmado')
    expect(h.view.text()).not.toContain('Desejado: nenhum')
    await h.view.findAll('fieldset')[0]!.findAll('button')[0]!.trigger('click')
    expect(h.api.setShortcut).not.toHaveBeenCalled()
  })
  it('enquanto grava, controle focado permanece operável por Tab e duplo gesto não reenvia', async () => {
    const h = await setup()
    let finish: ((value: ShortcutSettingsResult) => void) | undefined
    h.api.setShortcut.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const button = h.view.findAll('fieldset')[0]!.findAll('button')[0]!
    ;(button.element as HTMLButtonElement).focus()
    await button.trigger('click'); await button.trigger('click')
    expect(h.api.setShortcut).toHaveBeenCalledTimes(1)
    expect(button.attributes('aria-disabled')).toBe('true')
    expect((button.element as HTMLButtonElement).disabled).toBe(false)
    expect(document.activeElement).toBe(button.element)
    finish?.(h.result()); await flushPromises()
  })
})
