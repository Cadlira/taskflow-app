// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FileAiProviderConfig, AI_CONFIG_FILE_BYTES } from '../../src/main/ai/file-ai-config.js'
import type { AiConfigFaultPoint } from '../../src/main/ai/file-ai-config.js'
import type { AiNativeProtection } from '../../src/main/ai/native-protection.js'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tfa010-ai-config-'))
})

afterAll(async () => {
  if (root && resolve(root).startsWith(resolve(tmpdir()) + sep + 'tfa010-ai-config-')) await rm(root, { recursive: true, force: true })
})

interface FakeProtection extends AiNativeProtection {
  available: () => boolean
  encryptCalls: number
  decryptCalls: number
}

function protection(options: { available?: boolean; decryptFails?: boolean; encryptFails?: boolean } = {}): FakeProtection {
  const available = options.available ?? true
  const fake: FakeProtection = {
    available: () => available,
    encryptCalls: 0,
    decryptCalls: 0,
    encrypt: (text: string) => {
      if (options.encryptFails) throw new Error('sem cifra')
      fake.encryptCalls += 1
      return Buffer.from(`enc:${text}`, 'utf8')
    },
    decrypt: (data: Buffer) => {
      if (options.decryptFails) throw new Error('outro perfil')
      fake.decryptCalls += 1
      const text = data.toString('utf8')
      if (!text.startsWith('enc:')) throw new Error('blob inválido')
      return text.slice(4)
    },
  }
  // Permite alternar disponibilidade em tempo de execução nos testes.
  return fake
}

async function directory(): Promise<string> {
  const path = await mkdtemp(join(root, 'case-'))
  if (!resolve(path).startsWith(resolve(root) + sep)) throw new Error('fixture path escaped')
  return path
}

const first = {
  expectedRevision: '0',
  provider: 'CUSTOM' as const,
  apiBase: 'https://gateway.exemplo/v1',
  model: 'gpt-4o-mini',
  credential: 'sk-segredo',
}

describe('envelope versionado e credencial cifrada', () => {
  it('grava somente o arquivo próprio, com ciphertext e revisão decimal', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())

    const state = await store.save(first)

    expect(state.revision).toBe('1')
    expect(state.summary).toMatchObject({ provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', model: 'gpt-4o-mini', hasCredential: true })
    const bytes = await readFile(store.file, 'utf8')
    expect(bytes).not.toContain('sk-segredo')
    expect(JSON.parse(bytes)).toMatchObject({ version: 1, revision: '1', config: { provider: 'CUSTOM' } })
    expect(await readdir(dir)).toEqual(['ai.json'])
  })

  it('reabertura não expõe a credencial e a decifra é sob demanda', async () => {
    const dir = await directory()
    const fake = protection()
    const store = new FileAiProviderConfig(dir, fake)

    await store.save(first)
    expect(fake.decryptCalls).toBe(0)

    const reopened = new FileAiProviderConfig(dir, fake)
    const state = await reopened.read()

    expect(fake.decryptCalls).toBe(0)
    expect(JSON.stringify(state)).not.toContain('sk-segredo')
    const opened = await reopened.openCredential()
    expect(opened?.config.credential).toBe('sk-segredo')
    expect(opened?.revision).toBe('1')
    expect(fake.decryptCalls).toBe(1)
  })

  it('preserva o ciphertext quando a credencial não é informada', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await store.save(first)
    const before = JSON.parse(await readFile(store.file, 'utf8')) as { config: { credential: string } }

    const state = await store.save({ expectedRevision: '1', provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', model: 'gpt-4o' })

    const after = JSON.parse(await readFile(store.file, 'utf8')) as { config: { credential: string } }
    expect(after.config.credential).toBe(before.config.credential)
    expect(state.revision).toBe('2')
  })

  it('credential nova substitui o ciphertext', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await store.save(first)

    await store.save({ expectedRevision: '1', provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', model: 'gpt-4o', credential: 'sk-nova' })

    expect((await store.openCredential())?.config.credential).toBe('sk-nova')
  })
})

describe('recusas integrais e preservação', () => {
  it('versão futura é recusada sem sobrescrever e só a remoção a substitui', async () => {
    const dir = await directory()
    const future = JSON.stringify({ version: 2, revision: '9', config: { provider: 'OPENAI', model: 'm', credential: 'eA==' } })
    await writeFile(join(dir, 'ai.json'), future)
    const store = new FileAiProviderConfig(dir, protection())

    await expect(store.read()).rejects.toMatchObject({ reason: 'INCOMPATIBLE_DATA' })
    await expect(store.save({ ...first, expectedRevision: '0' })).rejects.toMatchObject({ reason: 'INCOMPATIBLE_DATA' })
    expect(await readFile(store.file, 'utf8')).toBe(future)

    const removed = await store.remove()
    expect(removed.revision).toBe('10')
    const tombstone = JSON.parse(await readFile(store.file, 'utf8')) as { version: number; revision: string; config: null }
    expect(tombstone).toEqual({ version: 1, revision: '10', config: null })
    await expect(store.read()).resolves.toEqual({ revision: '10' })
  })

  it('JSON corrompido e bytes inválidos são recusados preservando o arquivo', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await writeFile(store.file, '{corrompido')

    await expect(store.read()).rejects.toMatchObject({ reason: 'INCOMPATIBLE_DATA' })
    expect(await readFile(store.file, 'utf8')).toBe('{corrompido')

    const other = await directory()
    const invalidUtf8 = new FileAiProviderConfig(other, protection())
    await writeFile(invalidUtf8.file, Buffer.from([0xff, 0xfe, 0xfd]))
    await expect(invalidUtf8.read()).rejects.toMatchObject({ reason: 'INCOMPATIBLE_DATA' })
  })

  it('campo extra em provedor oficial e base ausente em CUSTOM são recusados', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await writeFile(store.file, JSON.stringify({ version: 1, revision: '1', config: { provider: 'OPENAI', apiBase: 'https://proxy.exemplo', model: 'm', credential: 'eA==' } }))
    await expect(store.read()).rejects.toMatchObject({ reason: 'INCOMPATIBLE_DATA' })

    await writeFile(store.file, JSON.stringify({ version: 1, revision: '1', config: { provider: 'CUSTOM', model: 'm', credential: 'eA==' } }))
    await expect(store.read()).rejects.toMatchObject({ reason: 'INCOMPATIBLE_DATA' })
  })

  it('arquivo acima do limite é recusado e pode ser removido', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await writeFile(store.file, 'x'.repeat(AI_CONFIG_FILE_BYTES + 1))

    await expect(store.read()).rejects.toMatchObject({ reason: 'RESOURCE_LIMIT' })
    const removed = await store.remove()
    expect(removed.revision).toBe('1')
    await expect(store.read()).resolves.toEqual({ revision: '1' })
  })

  it('CAS recusa revisão antiga sem tocar o arquivo', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await store.save(first)
    const before = await readFile(store.file)
    const size = before.length

    await expect(store.save({ ...first, expectedRevision: '0', credential: 'sk-outra' })).rejects.toMatchObject({ reason: 'STALE_REVISION' })
    const after = await readFile(store.file)
    expect(after.equals(before)).toBe(true)
    expect(after.length).toBe(size)
  })
})

describe('proteção nativa indisponível ou indecifrável', () => {
  it('sem proteção disponível, salvar e decifrar bloqueiam sem plaintext', async () => {
    const dir = await directory()
    const fake = protection({ available: false })
    const store = new FileAiProviderConfig(dir, fake)

    await expect(store.save(first)).rejects.toMatchObject({ reason: 'PROTECTION_UNAVAILABLE' })
    expect(await readdir(dir)).toEqual([])

    const writable = new FileAiProviderConfig(dir, protection())
    await writable.save(first)
    const blocked = new FileAiProviderConfig(dir, protection({ available: false }))
    await expect(blocked.openCredential()).rejects.toMatchObject({ reason: 'PROTECTION_UNAVAILABLE' })
    expect(await readFile(join(dir, 'ai.json'), 'utf8')).not.toContain('sk-segredo')
  })

  it('falha de decifra bloqueia o uso preservando o arquivo e permite remover', async () => {
    const dir = await directory()
    await new FileAiProviderConfig(dir, protection()).save(first)
    const before = await readFile(join(dir, 'ai.json'), 'utf8')
    const broken = new FileAiProviderConfig(dir, protection({ decryptFails: true }))

    await expect(broken.openCredential()).rejects.toMatchObject({ reason: 'CREDENTIAL_UNREADABLE' })
    expect(await readFile(join(dir, 'ai.json'), 'utf8')).toBe(before)

    await broken.remove()
    expect(await readFile(join(dir, 'ai.json'), 'utf8')).not.toContain('sk-segredo')
  })
})

describe('publicação atômica e estado incerto', () => {
  it('falha antes da publicação não deixa temporário e preserva o principal', async () => {
    const dir = await directory()
    const faults: { at: (point: AiConfigFaultPoint) => void; point?: AiConfigFaultPoint } = {
      at: (point: AiConfigFaultPoint) => {
        if (point === faults.point) throw new Error('falha simulada')
      },
    }
    const store = new FileAiProviderConfig(dir, protection(), faults)
    await store.save(first)
    const original = await readFile(store.file)
    faults.point = 'temp:readback'

    await expect(
      new FileAiProviderConfig(dir, protection(), faults).save({ ...first, expectedRevision: '1', credential: 'sk-outra' }),
    ).rejects.toMatchObject({ reason: 'UNAVAILABLE' })
    expect((await readFile(store.file)).equals(original)).toBe(true)
    expect((await readdir(dir)).sort()).toEqual(['ai.json'])
  })

  it('falha depois da publicação marca UNKNOWN e bloqueia setters até reconciliar', async () => {
    const dir = await directory()
    const faults: { at?: (point: AiConfigFaultPoint) => void } = {
      at: (point) => {
        if (point === 'publication:after') throw new Error('falha simulada')
      },
    }
    const store = new FileAiProviderConfig(dir, protection(), faults)

    await expect(store.save(first)).rejects.toMatchObject({ reason: 'UNKNOWN' })
    await expect(store.read()).rejects.toMatchObject({ reason: 'UNKNOWN' })
    await expect(store.save({ ...first, expectedRevision: '1', credential: 'sk-outra' })).rejects.toMatchObject({ reason: 'UNKNOWN' })

    await store.reconcile()
    await expect(store.read()).resolves.toMatchObject({ revision: '1', summary: { hasCredential: true } })
    await expect(
      new FileAiProviderConfig(dir, protection()).save({ expectedRevision: '1', provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', model: 'gpt-4o', credential: 'sk-depois' }),
    ).resolves.toMatchObject({ revision: '2' })
  })

  it('temporário órfão bloqueia e a reconciliação o descarta sem tocar o principal', async () => {
    const dir = await directory()
    await new FileAiProviderConfig(dir, protection()).save(first)
    const main = await readFile(join(dir, 'ai.json'))
    await writeFile(join(dir, 'ai.json.temporary'), 'órfão')
    const store = new FileAiProviderConfig(dir, protection())

    await expect(store.save({ ...first, expectedRevision: '1', credential: 'sk-outra' })).rejects.toMatchObject({ reason: 'UNKNOWN' })
    expect((await readFile(join(dir, 'ai.json'))).equals(main)).toBe(true)

    await store.reconcile()
    await expect(readdir(dir)).resolves.toEqual(['ai.json'])
    await expect(store.read()).resolves.toMatchObject({ revision: '1' })
  })

  it('publica previous com o conteúdo anterior sem usá-lo como fallback', async () => {
    const dir = await directory()
    const store = new FileAiProviderConfig(dir, protection())
    await store.save(first)
    const main = await readFile(store.file)

    await store.save({ expectedRevision: '1', provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', model: 'gpt-4o' })

    expect((await readFile(store.previous)).equals(main)).toBe(true)
    const files = await readdir(dir)
    expect(files.sort()).toEqual(['ai.json', 'ai.json.previous'])
    const info = await stat(store.file)
    expect(info.isFile()).toBe(true)
  })
})
