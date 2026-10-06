import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { parseActivationRelay, parseNativeActivation, ReminderActivationRoute } from '../../src/main/desktop/activation.js'
import { NATIVE_IDENTITIES, ownStartupCommand, prepareNativeIdentity, type IdentityPorts, type NativeRegistrySnapshot } from '../../src/main/desktop/native-identity.js'
import { StartupService } from '../../src/main/desktop/startup.js'
import { parseNativeRegistrySnapshot, REGISTRY_SCRIPTS } from '../../src/main/desktop/windows-registry.js'
import { createNativeNotifier } from '../../src/main/reminders/notifier.js'

const exe = 'C:\\Users\\Padrão fictício\\AppData\\Local\\Programs\\TaskFlowApp\\TaskFlowApp.exe'
const shortcut = 'C:\\Users\\Padrão fictício\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\TaskFlow App.lnk'
function fixture(options: { launchArgs?: string[] } = {}) {
  let raw: NativeRegistrySnapshot = { metadata: { aumid: NATIVE_IDENTITIES.prod.aumid, clsid: NATIVE_IDENTITIES.prod.clsid, executable: exe, shortcut }, future: false, foreignStartup: false, run: null, localServer: null }
  let enabled = true
  const link = { target: exe, appUserModelId: NATIVE_IDENTITIES.prod.aumid, toastActivatorClsid: undefined as string | undefined, cwd: '' }
  const registry = { read: vi.fn(async () => raw), removeStartupApproval: vi.fn(async () => true) }
  const identity: IdentityPorts = { profile: 'prod', packaged: true, executable: exe, localAppData: 'C:\\Users\\Padrão fictício\\AppData\\Local', appData: 'C:\\Users\\Padrão fictício\\AppData\\Roaming', registry,
    safePath: vi.fn(async () => true), shortcut: () => ({ target: link.target, appUserModelId: link.appUserModelId, cwd: link.cwd, ...(link.toastActivatorClsid === undefined ? {} : { toastActivatorClsid: link.toastActivatorClsid }) }),
    updateShortcut: vi.fn((_path, clsid, cwd) => { link.toastActivatorClsid = clsid; link.cwd = cwd; return true }),
  }
  const set = vi.fn((desired: boolean) => { raw.run = desired ? ownStartupCommand(exe) : null; enabled = desired })
  const service = new StartupService({ installed: () => true, validate: () => prepareNativeIdentity({ ...identity, readonlyOnly: true }), executable: exe, registry,
    get: () => ({ launchItems: raw.run === null ? [] : [{ name: 'taskflow.app.startup.v1', scope: 'user', path: exe, args: options.launchArgs ?? ['--taskflow-login'], enabled }] }), set, changed: vi.fn() })
  return { identity, registry, service, raw, link, set, mutate: (next: NativeRegistrySnapshot) => { raw = next }, disable: () => { enabled = false } }
}
describe('M09/M10 identidade/startup/notifier em adapters fictícios', () => {
  it('Unicode, metadata e shortcut próprios antecedem presenter; dev/test não fazem cadastro', async () => {
    const f = fixture()
    expect(await prepareNativeIdentity(f.identity)).toBe(true)
    expect(f.link.toastActivatorClsid).toBe(NATIVE_IDENTITIES.prod.clsid)
    f.registry.read.mockClear()
    expect(await prepareNativeIdentity({ ...f.identity, profile: 'test' })).toBe(false)
    expect(await prepareNativeIdentity({ ...f.identity, profile: 'dev' })).toBe(false)
    expect(f.registry.read).not.toHaveBeenCalled()
  })
  it('atalho NSIS com CLSID vazio é preenchido; valor estrangeiro não vazio é recusado', async () => {
    const empty = fixture()
    empty.link.toastActivatorClsid = ''
    expect(await prepareNativeIdentity(empty.identity)).toBe(true)
    expect(empty.link.toastActivatorClsid).toBe(NATIVE_IDENTITIES.prod.clsid)

    const foreign = fixture()
    foreign.link.toastActivatorClsid = '{00000000-0000-0000-0000-000000000000}'
    expect(await prepareNativeIdentity(foreign.identity)).toBe(false)
    expect(foreign.identity.updateShortcut).not.toHaveBeenCalled()
  })
  it('target/CLSID/COM alheios, reparse e metadata futura recusam antes de escrever', async () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.link.target = 'C:\\outro.exe' },
      (f: ReturnType<typeof fixture>) => { f.link.toastActivatorClsid = '{00000000-0000-0000-0000-000000000000}' },
      (f: ReturnType<typeof fixture>) => { f.raw.future = true },
      (f: ReturnType<typeof fixture>) => { f.raw.localServer = 'C:\\outro.exe' },
      (f: ReturnType<typeof fixture>) => { f.identity.safePath = async () => false },
    ]) {
      const f = fixture(); mutate(f)
      expect(await prepareNativeIdentity(f.identity)).toBe(false)
      expect(f.identity.updateShortcut).not.toHaveBeenCalled()
    }
  })
  it('ausência OFF não escreve; opt-in/out explícitos relêem o SO e preservam disabled externamente', async () => {
    const f = fixture(); await prepareNativeIdentity(f.identity)
    expect(await f.service.read()).toBe('OFF'); expect(f.set).not.toHaveBeenCalled()
    expect(await f.service.set(true, () => true)).toEqual({ version: 1, status: 'ok', startup: 'ON' })
    f.disable(); expect(await f.service.read()).toBe('DISABLED_EXTERNALLY'); expect(f.set).toHaveBeenCalledTimes(1)
    expect(await f.service.set(false, () => true)).toEqual({ version: 1, status: 'ok', startup: 'OFF' })
    expect(f.registry.removeStartupApproval).toHaveBeenCalledOnce()
    expect(f.identity.updateShortcut).toHaveBeenCalledOnce()
  })
  it('launchItem sem args (Electron real no Windows) é reconhecido pelo Run canônico do adapter', async () => {
    const noArgs = fixture({ launchArgs: [] })
    await prepareNativeIdentity(noArgs.identity)
    expect(await noArgs.service.read()).toBe('OFF')
    expect(await noArgs.service.set(true, () => true)).toEqual({ version: 1, status: 'ok', startup: 'ON' })
    noArgs.disable()
    expect(await noArgs.service.read()).toBe('DISABLED_EXTERNALLY')
  })
  it('registro alheio/futuro e sessão retirada bloqueiam setter; falha parcial não compensa ou repete', async () => {
    const f = fixture(); await prepareNativeIdentity(f.identity)
    f.raw.run = 'C:\\alheio.exe'
    expect(await f.service.set(true, () => true)).toMatchObject({ code: 'STATE_UNKNOWN' }); expect(f.set).not.toHaveBeenCalled()
    f.raw.run = null
    expect(await f.service.set(true, () => false)).toMatchObject({ code: 'SESSION_CLOSED' }); expect(f.set).not.toHaveBeenCalled()
    await f.service.set(true, () => true)
    f.registry.removeStartupApproval.mockResolvedValue(false)
    expect(await f.service.set(false, () => true)).toMatchObject({ code: 'NATIVE_OPERATION_FAILED' })
    expect(f.raw.run).toBeNull(); expect(f.set).toHaveBeenCalledTimes(2)
  })
  it('gate nativo limita concorrência e admissão é relida imediatamente antes do efeito', async () => {
    const f = fixture(); await prepareNativeIdentity(f.identity)
    let release: (() => void) | undefined
    f.registry.read.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(f.raw) }))
    const first = f.service.set(true, () => false)
    expect(await f.service.set(true, () => true)).toMatchObject({ code: 'BUSY' })
    release?.(); expect(await first).toMatchObject({ code: 'SESSION_CLOSED' }); expect(f.set).not.toHaveBeenCalled()
  })
  it('registro aceita só shapes UTF-8 fechados, scripts fixos sem bypass/paths recebidos', () => {
    const f = fixture()
    expect(parseNativeRegistrySnapshot(f.raw)).toEqual(f.raw)
    expect(parseNativeRegistrySnapshot({ ...f.raw, raw: 'secret' })).toBeUndefined()
    expect(parseNativeRegistrySnapshot({ ...f.raw, metadata: { aumid: 'x' } })).toBeUndefined()
    expect(REGISTRY_SCRIPTS.read).toContain(NATIVE_IDENTITIES.prod.clsid)
    expect(Object.values(REGISTRY_SCRIPTS).join(' ')).not.toMatch(/ExecutionPolicy|reg\.exe|Invoke-Expression|Start-Process/i)
  })
  it('ativação e relay fechados/coalescimento recusam extras, duplicatas e referências arbitrárias', () => {
    const tag = 'a'.repeat(64)
    expect(parseNativeActivation({ type: 'click', arguments: `type=click&tag=${tag}`, userInputs: {} })).toBe(tag)
    expect(parseNativeActivation({ type: 'click', arguments: `tag=${tag}&type=click` })).toBe(tag)
    for (const args of [`tag=${tag}&tag=${tag}`, `type=click&tag=${tag}&url=evil`, 'type=click&tag=x']) expect(parseNativeActivation({ type: 'click', arguments: args })).toBeUndefined()
    expect(parseNativeActivation({ type: 'click', arguments: `type=click&tag=${tag}`, actionIndex: 0 })).toBeUndefined()
    expect(parseActivationRelay({ version: 1, kind: 'reminder-activation', tag })).toBe(tag)
    expect(parseActivationRelay({ version: 1, kind: 'reminder-activation', tag, cwd: 'C:\\' })).toBeUndefined()
    const open = vi.fn(), locate = vi.fn(); let clock = 0
    const route = new ReminderActivationRoute(() => clock, open, locate)
    route.accept(tag); route.accept(tag); route.ready(); route.ready()
    expect(open).toHaveBeenCalledOnce(); expect(locate).toHaveBeenCalledOnce()
    clock = 2000; expect(route.accept(tag)).toBe(true)
  })
  it('notifier usa título/prazo/ícone/tag atuais; liberação pós-show conserva o click na mesma rota', () => {
    const handlers = new Map<string, () => void>()
    const native = { on: vi.fn((name: string, fn: () => void) => { handlers.set(name, fn) }), removeAllListeners: vi.fn(), show: vi.fn(), close: vi.fn() }
    const create = vi.fn((_options: { id: string; title: string; body: string; icon: string }) => { void _options; return native }), failed = vi.fn(), complete = vi.fn(), activated = vi.fn()
    const submit = createNativeNotifier({ supported: () => true, create }, 'fixed-icon', failed, activated)
    const dispose = submit({ taskId: 't', reminderId: 'r', triggerISO: '2026-10-06T12:00:00.000Z', title: 'Atual', dueAt: '2026-10-06T12:00:00.000Z' }, complete)
    expect(create.mock.calls[0]?.[0]).toMatchObject({ title: 'Atual', icon: 'fixed-icon', body: expect.stringContaining('Prazo:') })
    handlers.get('show')?.()
    expect(complete).toHaveBeenCalledOnce()
    dispose(false) // liberação pós-show do serviço não remove o listener de click
    expect(native.removeAllListeners).not.toHaveBeenCalled()
    handlers.get('click')?.()
    expect(activated).toHaveBeenCalledExactlyOnceWith(create.mock.calls[0]?.[0].id)
    expect(native.removeAllListeners).toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()

    const cancelling = createNativeNotifier({ supported: () => true, create }, 'fixed-icon', failed, activated)
    const cancelDispose = cancelling({ taskId: 't2', reminderId: 'r2', triggerISO: '2026-10-06T12:00:00.000Z', title: 'Outra', dueAt: '2026-10-06T12:00:00.000Z' }, vi.fn())
    cancelDispose(true)
    expect(native.close).toHaveBeenCalledOnce()
  })
  it('metadata NSIS v1 casa com a identidade e o uninstaller exige ownership antes de remover', () => {
    const script = readFileSync('build/installer.nsh', 'utf8')
    const installStart = script.indexOf('!macro customInstall')
    const uninstallStart = script.indexOf('!macro customUnInstall')
    expect(installStart).toBeGreaterThan(-1); expect(uninstallStart).toBeGreaterThan(installStart)
    const install = script.slice(installStart, uninstallStart)
    const remove = script.slice(uninstallStart)
    expect(script).toContain(`!define TFA_TOAST_CLSID "${NATIVE_IDENTITIES.prod.clsid}"`)
    expect(script).toContain('!define TFA_STARTUP_NAME "taskflow.app.startup.v1"')
    for (const guard of ['AUMID', 'InstalledExecutable', 'CLSID']) expect(install).toContain(guard)
    expect(install).toContain('StartMenuLink')
    expect(install).toContain('TFA_FAIL')
    expect(install).not.toContain('HKLM')

    expect(remove).toContain('${IfNot} ${isUpdated}')
    const clsidRead = remove.indexOf('LocalServer32')
    const clsidDelete = remove.indexOf('DeleteRegKey HKCU "Software\\Classes\\CLSID')
    expect(clsidRead).toBeGreaterThan(-1); expect(clsidDelete).toBeGreaterThan(clsidRead)
    const runRead = remove.indexOf('ReadRegStr $tfaCurrent HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run"')
    const runCompare = remove.indexOf("--taskflow-login'")
    const runDelete = remove.indexOf('DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run"')
    expect(runRead).toBeGreaterThan(-1); expect(runCompare).toBeGreaterThan(runRead); expect(runDelete).toBeGreaterThan(runCompare)
    const metadataDelete = remove.indexOf('DeleteRegValue HKCU "${TFA_NATIVE_KEY}" "AUMID"')
    expect(metadataDelete).toBeGreaterThan(clsidDelete)
    expect(remove).not.toContain('HKLM')
  })
})
