// @vitest-environment node
import { build } from 'vite'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FileShortcutPreferences } from '../../src/main/shortcuts/file-preferences.js'
import { defaultShortcutActions } from '../../src/domain/global-shortcuts.js'
import type { PreferencesFaultPoint } from '../../src/main/shortcuts/file-preferences.js'

let root: string, actor: string
const original = { version: 1 as const, revision: '0', actions: defaultShortcutActions() }
const next = { ...original, revision: '1', actions: { ...original.actions, QUICK_ADD: { modifiers: 'ALT_SHIFT' as const, key: 'X' } } }
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tfa009-prefs-kill-'))
  const result = await build({ configFile: false, logLevel: 'silent', build: { ssr: true, write: false, minify: false,
    rollupOptions: { input: resolve('src/main/shortcuts/file-preferences.ts'), preserveEntrySignatures: 'strict', output: { format: 'es', inlineDynamicImports: true } },
  } })
  if (!('output' in result)) throw new Error('fixture build unavailable')
  const chunk = result.output.find(item => item.type === 'chunk'); if (!chunk || chunk.type !== 'chunk') throw new Error('fixture chunk missing')
  const module = join(root, 'preferences.mjs'); await writeFile(module, chunk.code)
  actor = join(root, 'actor.mjs')
  await writeFile(actor, `import { FileShortcutPreferences } from ${JSON.stringify(pathToFileURL(module).href)};
const [directory, point] = process.argv.slice(2);
const store = new FileShortcutPreferences(directory, { at: async phase => {
  if (phase !== point) return;
  process.send({ ready: phase });
  setInterval(() => {}, 1000);
  await new Promise(() => {});
} });
await store.publish(${JSON.stringify(original)}, ${JSON.stringify(next)});
process.exit(3);
`)
}, 20000)
afterAll(async () => {
  if (root && resolve(root).startsWith(resolve(tmpdir()) + sep + 'tfa009-prefs-kill-')) await rm(root, { recursive: true, force: true })
})
describe('Q09 kill real de preferências em diretório fictício', () => {
  it.each<PreferencesFaultPoint>(['temp:write', 'temp:flush', 'temp:readback', 'previous:write', 'publication:before', 'publication:after', 'publication:readback'])('kill na barreira %s preserva principal completo sem restauração', async point => {
    const directory = await mkdtemp(join(root, 'case-'))
    if (!resolve(directory).startsWith(resolve(root) + sep)) throw new Error('fixture path escaped')
    const store = new FileShortcutPreferences(directory)
    await writeFile(store.file, JSON.stringify(original))
    const child = spawn(process.execPath, [actor, directory, point], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
    try {
      await new Promise<void>((done, reject) => {
        const timer = setTimeout(() => reject(new Error('barrier timeout')), 5000)
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', () => { clearTimeout(timer); reject(new Error('exited before barrier')) })
        child.once('message', value => { clearTimeout(timer); if (typeof value === 'object' && value !== null && 'ready' in value && value.ready === point) done(); else reject(new Error('wrong barrier')) })
      })
      const exited = new Promise<void>(done => child.once('exit', () => done()))
      child.kill('SIGKILL'); await exited
      const bytes = await readFile(store.file, 'utf8')
      const published = point === 'publication:after' || point === 'publication:readback'
      expect(JSON.parse(bytes)).toEqual(published ? next : original)
      expect(await new FileShortcutPreferences(directory).read()).toMatchObject({ ok: true, preferences: published ? next : original })
      expect(await readFile(store.file, 'utf8')).toBe(bytes)
      const files = await readdir(directory)
      expect(files.every(file => ['shortcuts.json', 'shortcuts.json.temporary', 'shortcuts.json.previous'].includes(file))).toBe(true)
      expect(files.length).toBeLessThanOrEqual(3)
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }
  }, 10000)
})
