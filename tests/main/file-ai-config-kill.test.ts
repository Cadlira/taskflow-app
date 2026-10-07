// @vitest-environment node
import { build } from 'vite'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FileAiProviderConfig } from '../../src/main/ai/file-ai-config.js'
import type { AiConfigFaultPoint } from '../../src/main/ai/file-ai-config.js'
import type { AiNativeProtection } from '../../src/main/ai/native-protection.js'

let root: string
let actor: string

const protection: AiNativeProtection = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
  decrypt: (data: Buffer) => {
    const text = data.toString('utf8')
    if (!text.startsWith('enc:')) throw new Error('blob inválido')
    return text.slice(4)
  },
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tfa010-ai-kill-'))
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: true,
      write: false,
      minify: false,
      rollupOptions: {
        input: resolve('src/main/ai/file-ai-config.ts'),
        preserveEntrySignatures: 'strict',
        output: { format: 'es', inlineDynamicImports: true },
      },
    },
  })
  if (!('output' in result)) throw new Error('fixture build unavailable')
  const chunk = result.output.find((item) => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('fixture chunk missing')
  const module = join(root, 'ai-config.mjs')
  await writeFile(module, chunk.code)
  actor = join(root, 'actor.mjs')
  await writeFile(
    actor,
    `import { FileAiProviderConfig } from ${JSON.stringify(pathToFileURL(module).href)};
const [directory, point] = process.argv.slice(2);
const protection = { available: () => true, encrypt: (text) => Buffer.from('enc:' + text, 'utf8'), decrypt: (data) => data.toString('utf8').slice(4) };
const store = new FileAiProviderConfig(directory, protection, { at: async phase => {
  if (phase !== point) return;
  process.send({ ready: phase });
  setInterval(() => {}, 1000);
  await new Promise(() => {});
} });
await store.save({ expectedRevision: '1', provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', model: 'gpt-4o-mini', credential: 'sk-nova' });
process.exit(3);
`,
  )
}, 20000)

afterAll(async () => {
  if (root && resolve(root).startsWith(resolve(tmpdir()) + sep + 'tfa010-ai-kill-')) await rm(root, { recursive: true, force: true })
})

describe('kill real da configuração de IA em diretório fictício', () => {
  it.each<AiConfigFaultPoint>([
    'temp:write',
    'temp:flush',
    'temp:readback',
    'previous:write',
    'publication:before',
    'publication:after',
    'publication:readback',
  ])('kill na barreira %s deixa o principal completo e legível, sem restaurar previous', async (point) => {
    const directory = await mkdtemp(join(root, 'case-'))
    if (!resolve(directory).startsWith(resolve(root) + sep)) throw new Error('fixture path escaped')
    const store = new FileAiProviderConfig(directory, protection)
    await store.save({
      expectedRevision: '0',
      provider: 'CUSTOM',
      apiBase: 'https://gateway.exemplo/v1',
      model: 'gpt-4o-mini',
      credential: 'sk-segredo',
    })
    const child = spawn(process.execPath, [actor, directory, point], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true })
    try {
      await new Promise<void>((done, reject) => {
        const timer = setTimeout(() => reject(new Error('barrier timeout')), 5000)
        child.once('error', (error) => { clearTimeout(timer); reject(error) })
        child.once('exit', () => { clearTimeout(timer); reject(new Error('exited before barrier')) })
        child.once('message', (value) => {
          clearTimeout(timer)
          if (typeof value === 'object' && value !== null && 'ready' in value && value.ready === point) done()
          else reject(new Error('wrong barrier'))
        })
      })
      const exited = new Promise<void>((done) => child.once('exit', () => done()))
      child.kill('SIGKILL')
      await exited
      const published = point === 'publication:after' || point === 'publication:readback'
      const reopened = new FileAiProviderConfig(directory, protection)
      const state = await reopened.read()
      const opened = await reopened.openCredential()
      expect(state.revision).toBe(published ? '2' : '1')
      expect(opened?.config.credential).toBe(published ? 'sk-nova' : 'sk-segredo')
      const bytes = await readFile(store.file, 'utf8')
      expect(JSON.parse(bytes)).toMatchObject({ version: 1, revision: published ? '2' : '1' })
      expect(bytes).not.toContain(published ? 'sk-segredo' : 'sk-nova')
      const files = await readdir(directory)
      expect(files.every((file) => ['ai.json', 'ai.json.temporary', 'ai.json.previous'].includes(file))).toBe(true)
      expect(files.length).toBeLessThanOrEqual(3)
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  }, 10000)
})
