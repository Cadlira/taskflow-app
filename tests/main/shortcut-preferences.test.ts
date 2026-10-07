import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FileShortcutPreferences } from '../../src/main/shortcuts/file-preferences.js'
import type { PreferencesFaultPoint } from '../../src/main/shortcuts/file-preferences.js'
import { defaultShortcutActions } from '../../src/domain/global-shortcuts.js'
import type { ShortcutPreferences } from '../../src/domain/global-shortcuts.js'

let root: string
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'tfa009-prefs-')) })
afterAll(async () => { if (root.startsWith(join(tmpdir(), 'tfa009-prefs-'))) await rm(root, { recursive: true, force: true }) })
async function directory(): Promise<string> { return mkdtemp(join(root, 'case-')) }
function original(): ShortcutPreferences { return { version: 1, revision: '0', actions: defaultShortcutActions() } }
function changed(): ShortcutPreferences { return { version: 1, revision: '1', actions: { ...defaultShortcutActions(), QUICK_ADD: { modifiers: 'ALT_SHIFT', key: 'X' } } } }
describe('Q09 preferências em arquivo próprio', () => {
  it('missing fornece defaults sem escrita; publicação confirma e conserva previous', async () => {
    const dir = await directory()
    const store = new FileShortcutPreferences(dir)
    expect(await store.read()).toEqual({ ok: true, missing: true, preferences: original() })
    expect(await readdir(dir)).toEqual([])
    expect(await store.publish(original(), changed())).toEqual({ ok: true, preferences: changed() })
    expect(await store.read()).toEqual({ ok: true, missing: false, preferences: changed() })
    const next = { ...changed(), revision: '2', actions: { ...changed().actions, CAPTURE_CLIPBOARD: { modifiers: 'CTRL_SHIFT' as const, key: 'F24' } } }
    expect((await store.publish(changed(), next)).ok).toBe(true)
    expect(JSON.parse(await readFile(store.previous, 'utf8'))).toEqual(changed())
    expect(await readdir(dir)).toEqual(['shortcuts.json', 'shortcuts.json.previous'])
  })
  it.each(['{', JSON.stringify({ ...original(), version: 2 }), JSON.stringify({ ...original(), extra: true }), 'x'.repeat(8193)])('futuro/corrupto/excessivo preservado sem fallback', async (contents) => {
    const store = new FileShortcutPreferences(await directory())
    await writeFile(store.file, contents)
    expect(await store.read()).toEqual({ ok: false, code: 'PREFERENCES_INVALID' })
    expect((await store.publish(original(), changed())).ok).toBe(false)
    expect(await readFile(store.file, 'utf8')).toBe(contents)
    expect((await store.reconcile()).ok).toBe(false)
    expect(await readFile(store.file, 'utf8')).toBe(contents)
  })
  it('revisão/CAS stale, mudança externa e no-op não gravam', async () => {
    const store = new FileShortcutPreferences(await directory())
    expect((await store.publish(original(), original())).ok).toBe(true)
    expect(await readdir(join(store.file, '..'))).toEqual([])
    await writeFile(store.file, JSON.stringify(changed()))
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'STALE_SETTINGS' })
    expect((await store.publish(changed(), changed())).ok).toBe(true)
    expect(await readdir(join(store.file, '..'))).toEqual(['shortcuts.json'])
  })
  it.each<PreferencesFaultPoint>(['temp:open', 'temp:write', 'temp:flush', 'temp:readback', 'previous:write', 'previous:readback', 'publication:before'])('falha em %s antes de publicar conserva original', async (point) => {
    const dir = await directory()
    const store = new FileShortcutPreferences(dir, { at: candidate => { if (candidate === point) throw new Error('falha fictícia') } })
    const bytes = JSON.stringify(original())
    await writeFile(store.file, bytes)
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'UNAVAILABLE' })
    expect(await readFile(store.file, 'utf8')).toBe(bytes)
    expect((await readdir(dir)).filter(file => file.endsWith('.temporary'))).toEqual([])
  })
  it.each<PreferencesFaultPoint>(['publication:after', 'publication:readback'])('falha em %s bloqueia todas escritas até reconciliação explícita', async (point) => {
    const store = new FileShortcutPreferences(await directory(), { at: candidate => { if (candidate === point) throw new Error('falha fictícia') } })
    await writeFile(store.file, JSON.stringify(original()))
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'UNKNOWN' })
    expect(await store.read()).toEqual({ ok: false, code: 'UNKNOWN' })
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'UNKNOWN' })
    expect(JSON.parse(await readFile(store.file, 'utf8'))).toEqual(changed())
    expect(await store.reconcile()).toEqual({ ok: true, missing: false, preferences: changed() })
    expect(await store.read()).toEqual({ ok: true, missing: false, preferences: changed() })
  })
  it('alteração externa na barreira recusa sem sobrescrever', async () => {
    const dir = await directory()
    const external = { ...changed(), revision: '9' }
    const store = new FileShortcutPreferences(dir, { at: async point => { if (point === 'publication:before') await writeFile(store.file, JSON.stringify(external)) } })
    await writeFile(store.file, JSON.stringify(original()))
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'STALE_SETTINGS' })
    expect(JSON.parse(await readFile(store.file, 'utf8'))).toEqual(external)
  })
  it('órfão preservado sem restauração de previous ou replay de temp', async () => {
    const store = new FileShortcutPreferences(await directory())
    await writeFile(store.temporary, JSON.stringify(changed()))
    expect(await store.read()).toEqual({ ok: true, missing: true, preferences: original() })
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'UNKNOWN' })
    expect(JSON.parse(await readFile(store.temporary, 'utf8'))).toEqual(changed())
    expect(await store.reconcile()).toEqual({ ok: true, missing: true, preferences: original() })
    expect(await readdir(join(store.file, '..'))).toEqual([])
  })
  it('cleanup incerto não é anunciado como falha comprovada anterior', async () => {
    const store = new FileShortcutPreferences(await directory(), { at: point => { if (point === 'temp:write' || point === 'cleanup:before') throw new Error('falha fictícia') } })
    expect(await store.publish(original(), changed())).toEqual({ ok: false, code: 'UNKNOWN' })
    expect(await store.read()).toEqual({ ok: false, code: 'UNKNOWN' })
    expect((await readdir(join(store.file, '..'))).filter(file => file.endsWith('.temporary'))).toHaveLength(1)
    expect((await store.reconcile()).ok).toBe(true)
  })
  it('rejeita UTF-8 inválido sem reescrita', async () => {
    const store = new FileShortcutPreferences(await directory())
    const bytes = Buffer.from([0xff, 0xfe, 0x7b, 0x7d])
    await writeFile(store.file, bytes)
    expect(await store.read()).toEqual({ ok: false, code: 'PREFERENCES_INVALID' })
    expect((await readFile(store.file)).equals(bytes)).toBe(true)
  })
})
