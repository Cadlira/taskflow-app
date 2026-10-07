import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShortcutController } from '../../src/application/shortcuts/shortcut-controller.js'
import type { ShortcutClock, ShortcutPreferencesRead, ShortcutPreferencesStore, ShortcutPreferencesWrite, ShortcutRegistry } from '../../src/application/shortcuts/shortcut-ports.js'
import { defaultShortcutActions } from '../../src/domain/global-shortcuts.js'
import type { ShortcutAction, ShortcutCombination, ShortcutPreferences } from '../../src/domain/global-shortcuts.js'
import type { SetShortcutRequest } from '../../src/contracts/capture-shortcuts.js'

function key(combo: ShortcutCombination): string { return `${combo.modifiers}:${combo.key}` }
class FakeRegistry implements ShortcutRegistry {
  readonly callbacks = new Map<string, () => void>()
  readonly calls: string[] = []
  refuse = new Set<string>()
  failCleanup = new Set<string>()
  failObserve = new Set<string>()
  throwRegister = new Set<string>()
  register(combo: ShortcutCombination, callback: () => void): boolean {
    const code = key(combo); this.calls.push(`register:${code}`)
    if (this.refuse.has(code)) return false
    this.callbacks.set(code, callback)
    if (this.throwRegister.has(code)) throw new Error('falha fictícia após registro')
    return true
  }
  isRegistered(combo: ShortcutCombination): boolean {
    const code = key(combo); this.calls.push(`observe:${code}`)
    if (this.failObserve.has(code)) throw new Error('falha fictícia de observação')
    return this.callbacks.has(code)
  }
  unregister(combo: ShortcutCombination): void {
    const code = key(combo); this.calls.push(`unregister:${code}`)
    if (this.failCleanup.has(code)) throw new Error('falha fictícia de cleanup')
    this.callbacks.delete(code)
  }
  fire(key: string): void { this.callbacks.get(key)?.() }
}
class FakePreferences implements ShortcutPreferencesStore {
  value: ShortcutPreferences = { version: 1, revision: '0', actions: defaultShortcutActions() }
  writes = 0
  unknown = false
  invalid = false
  barrier: ((next: ShortcutPreferences) => Promise<ShortcutPreferencesWrite>) | undefined
  async read(): Promise<ShortcutPreferencesRead> {
    if (this.invalid) return { ok: false, code: 'PREFERENCES_INVALID' }
    return this.unknown ? { ok: false, code: 'UNKNOWN' } : { ok: true, preferences: structuredClone(this.value), missing: false }
  }
  async publish(expected: ShortcutPreferences, next: ShortcutPreferences): Promise<ShortcutPreferencesWrite> {
    this.writes++
    if (expected.revision !== this.value.revision) return { ok: false, code: 'STALE_SETTINGS' }
    if (this.barrier) return this.barrier(next)
    this.value = structuredClone(next)
    return { ok: true, preferences: structuredClone(next) }
  }
  async reconcile(): Promise<ShortcutPreferencesRead> { this.unknown = false; return this.read() }
}
const clock: ShortcutClock = { monotonic: () => Date.now(), arm: (delay, callback) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer) } }
function request(key: string | null, revision = '0', action: ShortcutAction = 'QUICK_ADD'): SetShortcutRequest {
  return { version: 1, action, combination: key === null ? null : { modifiers: 'ALT_SHIFT', key }, expectedConfigRevision: revision }
}
async function setup(nativeEnabled = true) {
  const registry = new FakeRegistry(), preferences = new FakePreferences(), invoke = vi.fn()
  const controller = new ShortcutController({ registry, preferences, clock, nativeEnabled, invoke })
  await controller.start()
  return { registry, preferences, invoke, controller }
}
async function waitForWrite(preferences: FakePreferences): Promise<void> {
  for (let i = 0; i < 10 && preferences.writes === 0; i++) await Promise.resolve()
  expect(preferences.writes).toBe(1)
}
afterEach(() => vi.useRealTimers())
describe('Q08/Q09 controlador de registro e preferências', () => {
  it('rebind registra B gated, publica, ativa B e libera A individualmente', async () => {
    const { registry, preferences, invoke, controller } = await setup()
    let finish: (result: ShortcutPreferencesWrite) => void = () => undefined
    let proposed: ShortcutPreferences | undefined
    preferences.barrier = next => { proposed = next; return new Promise(resolve => { finish = resolve }) }
    const pending = controller.set(request('X'), () => true)
    await waitForWrite(preferences)
    registry.fire('ALT_SHIFT:X'); expect(invoke).not.toHaveBeenCalled()
    registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledWith('QUICK_ADD')
    if (!proposed) throw new Error('barreira não instalada')
    preferences.value = proposed; finish({ ok: true, preferences: proposed })
    const result = await pending
    expect(result.status).toBe('ok')
    expect(registry.callbacks.has('CTRL_SHIFT:K')).toBe(false)
    registry.fire('ALT_SHIFT:X'); expect(invoke).toHaveBeenCalledTimes(2)
    expect((await controller.settings()).status).toBe('ok')
    await controller.stop(); expect(registry.callbacks.size).toBe(0)
  })
  it('register false conserva A e não grava; hint permanece confirmação própria de A', async () => {
    const { registry, preferences, invoke, controller } = await setup()
    registry.refuse.add('ALT_SHIFT:X')
    expect(await controller.set(request('X'), () => true)).toEqual({ version: 1, status: 'error', code: 'UNAVAILABLE' })
    expect(preferences.writes).toBe(0)
    registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledWith('QUICK_ADD')
    const result = await controller.settings()
    expect(result.status === 'ok' && result.settings.actions[0]).toMatchObject({ observed: 'REGISTERED', desired: { key: 'K' } })
    await controller.stop()
  })
  it('throw após registro compensa B sem anunciar rollback nativo presumido', async () => {
    const { registry, preferences, controller } = await setup()
    registry.throwRegister.add('ALT_SHIFT:X')
    expect((await controller.set(request('X'), () => true))).toMatchObject({ status: 'error', code: 'UNAVAILABLE' })
    expect(registry.callbacks.has('ALT_SHIFT:X')).toBe(false)
    expect(registry.callbacks.has('CTRL_SHIFT:K')).toBe(true)
    expect(preferences.writes).toBe(0)
    await controller.stop()
  })
  it('falha comprovada anterior conserva A/arquivo e compensa provisório', async () => {
    const { registry, preferences, invoke, controller } = await setup()
    preferences.barrier = async () => ({ ok: false, code: 'UNAVAILABLE' })
    expect(await controller.set(request('X'), () => true)).toMatchObject({ status: 'error', code: 'UNAVAILABLE' })
    expect(preferences.value.revision).toBe('0')
    expect(registry.callbacks.has('ALT_SHIFT:X')).toBe(false)
    registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledWith('QUICK_ADD')
    await controller.stop()
  })
  it('publicação incerta bloqueia todos callbacks/setters; releitura explícita sem replay', async () => {
    const { registry, preferences, invoke, controller } = await setup()
    preferences.barrier = async next => { preferences.value = next; preferences.unknown = true; return { ok: false, code: 'UNKNOWN' } }
    expect(await controller.set(request('X'), () => true)).toMatchObject({ status: 'error', code: 'UNKNOWN' })
    registry.fire('CTRL_SHIFT:K'); registry.fire('CTRL_SHIFT:L'); registry.fire('ALT_SHIFT:X')
    expect(invoke).not.toHaveBeenCalled()
    expect((await controller.settings())).toMatchObject({ status: 'ok', settings: { settersBlocked: true } })
    expect(await controller.set(request('Y'), () => true)).toMatchObject({ code: 'UNKNOWN' })
    const before = preferences.writes
    expect(await controller.set({ ...request('X'), combination: { modifiers: 'CTRL_SHIFT', key: 'K' } }, () => true)).toMatchObject({ code: 'STALE_SETTINGS' })
    preferences.barrier = undefined
    expect((await controller.set(request('X', '1'), () => true)).status).toBe('ok')
    expect(preferences.writes).toBe(before)
    registry.fire('ALT_SHIFT:X'); expect(invoke).toHaveBeenCalledWith('QUICK_ADD')
    registry.fire('CTRL_SHIFT:L'); expect(invoke).toHaveBeenCalledWith('OPEN_TASK_MANAGER')
    expect(registry.callbacks.has('CTRL_SHIFT:K')).toBe(false)
    await controller.stop()
  })
  it('cleanup incerto só bloqueia ação afetada; desired B é conservado', async () => {
    const { registry, preferences, invoke, controller } = await setup()
    registry.failCleanup.add('CTRL_SHIFT:K')
    expect(await controller.set(request('X'), () => true)).toMatchObject({ code: 'UNKNOWN' })
    expect(preferences.value.actions.QUICK_ADD?.key).toBe('X')
    registry.fire('CTRL_SHIFT:K'); registry.fire('ALT_SHIFT:X'); expect(invoke).not.toHaveBeenCalled()
    registry.fire('CTRL_SHIFT:L'); expect(invoke).toHaveBeenCalledTimes(1)
    expect(await controller.set(request('Y', '1'), () => true)).toMatchObject({ code: 'UNKNOWN' })
    registry.failCleanup.clear()
    expect((await controller.set(request('X', '1'), () => true)).status).toBe('ok')
    registry.fire('ALT_SHIFT:X'); expect(invoke).toHaveBeenCalledTimes(2)
    await controller.stop()
  })
  it('desabilitar gateia A durante arquivo; falha restaura somente se observado', async () => {
    const { registry, preferences, invoke, controller } = await setup()
    let finish: (result: ShortcutPreferencesWrite) => void = () => undefined
    preferences.barrier = () => new Promise(resolve => { finish = resolve })
    const pending = controller.set(request(null), () => true)
    await waitForWrite(preferences)
    registry.fire('CTRL_SHIFT:K'); expect(invoke).not.toHaveBeenCalled()
    finish({ ok: false, code: 'UNAVAILABLE' })
    expect(await pending).toMatchObject({ code: 'UNAVAILABLE' })
    registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledTimes(1)
    preferences.barrier = undefined
    expect((await controller.set(request(null), () => true)).status).toBe('ok')
    expect(registry.callbacks.has('CTRL_SHIFT:K')).toBe(false)
    expect(preferences.value.actions.QUICK_ADD).toBeNull()
    await controller.stop()
  })
  it('CAS entre clientes, duplicata/defaults e no-op não escrevem nem rebindam registro certo', async () => {
    const { registry, preferences, controller } = await setup()
    const calls = registry.calls.filter(call => !call.startsWith('observe:')).length
    const unchanged: SetShortcutRequest = { version: 1, action: 'QUICK_ADD', combination: { modifiers: 'CTRL_SHIFT', key: 'K' }, expectedConfigRevision: '0' }
    expect((await controller.set(unchanged, () => true)).status).toBe('ok')
    expect(preferences.writes).toBe(0)
    expect(registry.calls.filter(call => !call.startsWith('observe:'))).toHaveLength(calls)
    expect(await controller.set({ ...unchanged, action: 'CAPTURE_CLIPBOARD' }, () => true)).toMatchObject({ code: 'INVALID_REQUEST' })
    expect((await controller.set(request('X'), () => true)).status).toBe('ok')
    expect(await controller.set(request('Y'), () => true)).toMatchObject({ code: 'STALE_SETTINGS' })
    expect(preferences.writes).toBe(1)
    await controller.stop()
  })
  it('dev/test não registra defaults e inválido preserva fonte sem efeitos', async () => {
    const { registry, preferences, controller } = await setup(false)
    expect(registry.calls).toHaveLength(0)
    expect(await controller.settings()).toMatchObject({ settings: { actions: [
      { observed: 'UNAVAILABLE', reason: 'PROFILE_DISABLED' }, { observed: 'UNAVAILABLE', reason: 'PROFILE_DISABLED' }, { observed: 'NONE' },
    ] } })
    preferences.invalid = true
    expect(await controller.set(request('X'), () => true)).toMatchObject({ code: 'PREFERENCES_INVALID' })
    expect(preferences.writes).toBe(0)
    expect(registry.calls).toHaveLength(0)
    await controller.stop()
  })
  it('lease/blur/close/crash por documento, suspend e quit impedem callback', async () => {
    const { registry, invoke, controller } = await setup()
    controller.setEditing('doc1', true)
    registry.fire('CTRL_SHIFT:K'); expect(invoke).not.toHaveBeenCalled()
    controller.releaseEditing('doc2'); expect(controller.editing).toBe(true)
    controller.releaseEditing('doc1'); registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledTimes(1)
    controller.suspend(true); registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledTimes(1)
    controller.suspend(false); registry.fire('CTRL_SHIFT:K'); expect(invoke).toHaveBeenCalledTimes(2)
    const callback = registry.callbacks.get('CTRL_SHIFT:K')
    await controller.stop(); callback?.(); expect(invoke).toHaveBeenCalledTimes(2)
    expect(await controller.set(request('X'), () => true)).toMatchObject({ code: 'SESSION_CLOSED' })
  })
  it('fila 1 ativa+8 aguardando, timeout 2s sem efeito; quit drena publicação ativa', async () => {
    vi.useFakeTimers()
    const { registry, preferences, controller } = await setup()
    let finish: (result: ShortcutPreferencesWrite) => void = () => undefined
    let nextValue: ShortcutPreferences | undefined
    preferences.barrier = next => { nextValue = next; return new Promise(resolve => { finish = resolve }) }
    const active = controller.set(request('X'), () => true)
    await waitForWrite(preferences)
    const queued = Array.from({ length: 8 }, () => controller.set(request('Y'), () => true))
    expect(await controller.set(request('Z'), () => true)).toMatchObject({ code: 'BUSY' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(await Promise.all(queued)).toEqual(Array.from({ length: 8 }, () => ({ version: 1, status: 'error', code: 'BUSY' })))
    expect(preferences.writes).toBe(1)
    const quitting = controller.stop()
    if (!nextValue) throw new Error('barreira não instalada')
    preferences.value = nextValue; finish({ ok: true, preferences: nextValue })
    expect((await active).status).toBe('ok')
    await quitting
    expect(registry.callbacks.size).toBe(0)
    expect(preferences.value.revision).toBe('1')
  })
})
