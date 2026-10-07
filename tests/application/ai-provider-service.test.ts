import { describe, expect, it, vi } from 'vitest'
import { AiConfigStorageError } from '../../src/application/ai/ai-provider-config-repository.js'
import { AiConsentRegistry } from '../../src/application/ai/ai-consent.js'
import { AiRequestRegistry } from '../../src/application/ai/ai-request-registry.js'
import { createAiProviderService } from '../../src/application/ai/ai-provider-service.js'
import type { AiConnectionTester } from '../../src/application/ai/ai-connection-tester.js'
import { OPENAI_API_BASE } from '../../src/domain/ai-provider.js'
import { createFakeAiRepository, type FakeAiState } from '../support/ai.js'

function setup(options: { state?: Partial<FakeAiState>; tester?: Partial<AiConnectionTester> } = {}) {
  const fake = createFakeAiRepository(options.state)
  const consents = new AiConsentRegistry()
  const requests = new AiRequestRegistry()
  const tester: AiConnectionTester = {
    testConnection: vi.fn(async () => ({ ok: true as const })),
    ...options.tester,
  }
  const service = createAiProviderService({ repository: fake.repository, consents, requests, tester })
  return { state: fake.state, repository: fake.repository, calls: fake.calls, consents, requests, tester, service }
}

describe('estado e resumo sem segredo', () => {
  it('sem configuração: NONE e nenhuma decifra nem rede', async () => {
    const h = setup({ state: { summary: undefined, credential: undefined, revision: '0' } })

    const status = await h.service.load('doc-1')

    expect(status).toEqual({
      state: 'NONE',
      revision: '0',
      protection: 'AVAILABLE',
    })
    expect(h.tester.testConnection).not.toHaveBeenCalled()
  })

  it('configurada: resumo sem credencial e marca irreconstruível', async () => {
    const h = setup()

    const status = await h.service.load('doc-1')

    expect(status.state).toBe('CONFIGURED')
    expect(status.state === 'CONFIGURED' && status.summary).toEqual({
      provider: 'OPENAI',
      apiBase: OPENAI_API_BASE,
      origin: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      hasCredential: true,
    })
    expect(JSON.stringify(status)).not.toContain('sk-segredo')
  })

  it('proteção indisponível mantém o resumo e sinaliza bloqueio de uso', async () => {
    const h = setup({ state: { protection: false } })

    const status = await h.service.load('doc-1')

    expect(status.state === 'CONFIGURED' && status.protection).toBe('UNAVAILABLE')
  })

  it('arquivo incompatível vira BLOCKED sem vazar a causa', async () => {
    const h = setup({ state: { readError: new AiConfigStorageError('INCOMPATIBLE_DATA', 'detalhe interno') } })

    expect(await h.service.load('doc-1')).toEqual({ state: 'BLOCKED', blocked: 'INCOMPATIBLE' })
  })

  it('publicação incerta reconcilia uma vez e retoma', async () => {
    const h = setup()
    const originalRead = h.repository.read
    let first = true
    h.repository.read = async () => {
      if (first) {
        first = false
        throw new AiConfigStorageError('UNKNOWN', 'incerto')
      }
      return originalRead()
    }

    const status = await h.service.load('doc-1')

    expect(status.state).toBe('CONFIGURED')
    expect(h.calls.reconcile).toBe(1)
  })
})

describe('salvar com CAS e credencial intocada', () => {
  it('recusa sem credencial quando não há nenhuma gravada, sem tocar o repositório', async () => {
    const h = setup({ state: { summary: undefined, credential: undefined, revision: '0' } })

    const result = await h.service.save('doc-1', { provider: 'OPENAI', model: 'm' }, '0')

    expect(result.ok).toBe(false)
    expect(!result.ok && 'errors' in result && result.errors.credential).toBeTruthy()
    expect(h.calls.save).toHaveLength(0)
  })

  it('campo de credencial intocado preserva o ciphertext existente', async () => {
    const h = setup()

    const result = await h.service.save('doc-1', { provider: 'OPENAI', model: 'gpt-4o' }, '1')

    expect(result.ok).toBe(true)
    expect(h.calls.save[0]).toEqual({ expectedRevision: '1', provider: 'OPENAI', model: 'gpt-4o' })
    expect(h.state.credential).toBe('sk-segredo')
  })

  it('credencial nova substitui e a revisão avança', async () => {
    const h = setup()

    const result = await h.service.save('doc-1', { provider: 'OPENAI', credential: '  sk-nova  ', model: 'gpt-4o' }, '1')

    expect(result.ok).toBe(true)
    expect(h.calls.save[0]).toMatchObject({ credential: 'sk-nova' })
    expect(result.ok === true && result.status.state === 'CONFIGURED' && result.status.revision).toBe('2')
  })

  it('revisão esperada antiga é recusada sem sobrescrever', async () => {
    const h = setup()

    const result = await h.service.save('doc-1', { provider: 'OPENAI', credential: 'sk-nova', model: 'm' }, '0')

    expect(result).toEqual({ ok: false, blocked: 'STALE_REVISION' })
    expect(h.state.credential).toBe('sk-segredo')
  })

  it('CUSTOM exige base válida e a recusa não grava', async () => {
    const h = setup()

    const invalid = await h.service.save('doc-1', { provider: 'CUSTOM', apiBase: 'http://remoto', credential: 'sk', model: 'm' }, '1')
    const valid = await h.service.save('doc-1', { provider: 'CUSTOM', apiBase: 'http://localhost:11434/v1', credential: 'sk', model: 'm' }, '1')

    expect(invalid.ok).toBe(false)
    expect(valid.ok).toBe(true)
    expect(h.calls.save).toHaveLength(1)
  })

  it('proteção indisponível bloqueia a gravação sem degradar para texto simples', async () => {
    const h = setup({ state: { protection: false, readError: undefined, saveError: new AiConfigStorageError('PROTECTION_UNAVAILABLE', 'sem safeStorage') } })

    const result = await h.service.save('doc-1', { provider: 'OPENAI', credential: 'sk-nova', model: 'm' }, '1')

    expect(result).toEqual({ ok: false, blocked: 'PROTECTION_UNAVAILABLE' })
  })

  it('sucesso aborta pedidos e limpa consentimentos (revisão monotônica)', async () => {
    const h = setup()
    await h.service.authorizeCredential('doc-1')
    expect(h.consents.size).toBe(1)
    const ticket = h.requests.begin('doc-1', { configRevision: '1' })
    expect(ticket).toBeDefined()

    await h.service.save('doc-1', { provider: 'OPENAI', credential: 'sk-nova', model: 'm' }, '1')

    expect(h.consents.size).toBe(0)
    expect(h.requests.size).toBe(0)
    expect(ticket?.signal.aborted).toBe(true)
  })

  it('save bloqueado por incompatibilidade não aborta nem limpa nada', async () => {
    const h = setup({ state: { readError: new AiConfigStorageError('INCOMPATIBLE_DATA', 'formato futuro') } })
    const ticket = h.requests.begin('doc-fantasma', { configRevision: '1' })

    const result = await h.service.save('doc-1', { provider: 'OPENAI', credential: 'sk', model: 'm' }, '1')

    expect(result).toEqual({ ok: false, blocked: 'INCOMPATIBLE' })
    expect(ticket?.signal.aborted).toBe(false)
  })
})

describe('remover revoga', () => {
  it('remove apaga credencial, limpa consentimentos e aborta pedidos', async () => {
    const h = setup()
    await h.service.authorizeCredential('doc-1')
    const ticket = h.requests.begin('doc-1', { configRevision: '1' })

    const result = await h.service.remove()

    expect(result.ok).toBe(true)
    expect(h.state.summary).toBeUndefined()
    expect(h.state.credential).toBeUndefined()
    expect(h.consents.size).toBe(0)
    expect(ticket?.signal.aborted).toBe(true)
    expect(result.ok === true && result.status.state).toBe('NONE')
  })

  it('remove funciona sobre arquivo indecifrável sem exigir a credencial', async () => {
    const h = setup({ state: { openError: new AiConfigStorageError('CREDENTIAL_UNREADABLE', 'outro perfil') } })

    const result = await h.service.remove()

    expect(result.ok).toBe(true)
  })
})

describe('teste de conexão por gesto e com consentimento', () => {
  it('sem consentimento vigente nada é enviado', async () => {
    const h = setup()

    const result = await h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: false, state: 'CONSENT_REQUIRED' })
    expect(h.tester.testConnection).not.toHaveBeenCalled()
  })

  it('com consentimento chama o tester uma única vez com a configuração decifrada', async () => {
    const h = setup()
    await h.service.authorizeCredential('doc-1')

    const result = await h.service.testConnection('doc-1', { probe: 'MINIMAL_COMPLETION' })

    expect(result).toEqual({ ok: true })
    expect(h.tester.testConnection).toHaveBeenCalledTimes(1)
    const request = vi.mocked(h.tester.testConnection).mock.calls[0]?.[0]
    expect(request?.probe).toBe('MINIMAL_COMPLETION')
    expect(request?.config.provider).toBe('OPENAI')
  })

  it('segundo acionamento concorrente responde BUSY sem iniciar outra requisição', async () => {
    let release: (value: { ok: true }) => void = () => undefined
    const h = setup({
      tester: {
        testConnection: vi.fn(
          () =>
            new Promise<{ ok: true }>((resolve) => {
              release = resolve
            }),
        ) as unknown as AiConnectionTester['testConnection'],
      },
    })
    await h.service.authorizeCredential('doc-1')

    const first = h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })
    const second = await h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })

    expect(second).toEqual({ ok: false, state: 'BUSY' })
    release({ ok: true })
    expect(await first).toEqual({ ok: true })
    expect(h.tester.testConnection).toHaveBeenCalledTimes(1)
  })

  it('cancelamento por requestId não atinge verificação sem requestId', async () => {
    const h = setup({
      tester: {
        testConnection: vi.fn(() => new Promise(() => undefined)) as unknown as AiConnectionTester['testConnection'],
      },
    })
    await h.service.authorizeCredential('doc-1')
    void h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })

    expect(h.requests.cancel('doc-1', 'pedido-alheio')).toBe(false)
  })

  it('proteção indisponível no momento da requisição devolve bloqueio', async () => {
    const h = setup({ state: { protection: false, openError: new AiConfigStorageError('PROTECTION_UNAVAILABLE', 'sem DPAPI') } })
    await h.service.authorizeCredential('doc-1')

    const result = await h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: false, state: 'BLOCKED', blocked: 'PROTECTION_UNAVAILABLE' })
    expect(h.tester.testConnection).not.toHaveBeenCalled()
  })

  it('falha do provedor mantém o motivo fechado e o status', async () => {
    const h = setup({
      tester: {
        testConnection: vi.fn(async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const, status: 401 })),
      },
    })
    await h.service.authorizeCredential('doc-1')

    expect(await h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })).toEqual({
      ok: false,
      state: 'FAILED',
      reason: 'INVALID_CREDENTIALS',
      status: 401,
    })
  })

  it('troca de configuração invalida o consentimento antigo', async () => {
    const h = setup()
    await h.service.authorizeCredential('doc-1')
    await h.service.save('doc-1', { provider: 'ANTHROPIC', credential: 'sk-nova', model: 'claude' }, '1')

    const result = await h.service.testConnection('doc-1', { probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: false, state: 'CONSENT_REQUIRED' })
  })
})
