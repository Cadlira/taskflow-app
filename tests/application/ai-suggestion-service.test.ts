import { describe, expect, it, vi } from 'vitest'
import { AiConfigStorageError } from '../../src/application/ai/ai-provider-config-repository.js'
import { AiConsentRegistry } from '../../src/application/ai/ai-consent.js'
import { AiRequestRegistry } from '../../src/application/ai/ai-request-registry.js'
import { createAiSuggestionService } from '../../src/application/ai/ai-suggestion-service.js'
import { createAiProviderService } from '../../src/application/ai/ai-provider-service.js'
import type { AiSubtaskSuggester } from '../../src/application/ai/ai-subtask-suggester.js'
import { createFakeAiRepository, configuredSummary } from '../support/ai.js'

let nextRequestId = 0

function setup(suggester?: Partial<AiSubtaskSuggester>) {
  const fake = createFakeAiRepository()
  const consents = new AiConsentRegistry()
  const requests = new AiRequestRegistry()
  const provider = createAiProviderService({ repository: fake.repository, consents, requests, tester: { testConnection: async () => ({ ok: true as const }) } })
  const stub: AiSubtaskSuggester = {
    suggestSubtasks: vi.fn(async () => ({ ok: true as const, text: 'Primeira\nSegunda' })),
    ...suggester,
  }
  const service = createAiSuggestionService({
    repository: fake.repository,
    consents,
    requests,
    suggester: stub,
    generateRequestId: () => `pedido-${(nextRequestId += 1)}`,
  })
  return { fake, consents, requests, provider, suggester: stub, service }
}

async function prepared(h: ReturnType<typeof setup>, title = 'Preparar a demo', existing = 0) {
  const result = await h.service.prepare('doc-1', { title, description: 'Roteiro', existingSubtaskCount: existing })
  if (!result.ok) throw new Error(`preparação falhou: ${result.state}`)
  return result.prepared
}

describe('preparação no main', () => {
  it('sem configuração não prepara nem contata a rede', async () => {
    const h = setup()
    h.fake.state.summary = undefined

    expect(await h.service.prepare('doc-1', { title: 'T', description: '', existingSubtaskCount: 0 })).toEqual({
      ok: false,
      state: 'NOT_CONFIGURED',
    })
  })

  it('título vazio ou limite atingido ficam indisponíveis com motivo legível', async () => {
    const h = setup()

    expect(await h.service.prepare('doc-1', { title: '   ', description: '', existingSubtaskCount: 0 })).toEqual({
      ok: false,
      state: 'TITLE_REQUIRED',
    })
    expect(await h.service.prepare('doc-1', { title: 'T', description: '', existingSubtaskCount: 20 })).toEqual({
      ok: false,
      state: 'NO_SLOTS',
    })
  })

  it('devolve o texto exato, o vínculo e a origem, com corte sinalizado', async () => {
    const h = setup()

    const result = await prepared(h, 'Preparar a demo')
    const long = await h.service.prepare('doc-2', { title: 'T', description: 'a'.repeat(1_001), existingSubtaskCount: 0 })

    expect(result.content).toContain('Título: Preparar a demo')
    expect(result.content).toContain('Descrição:\nRoteiro')
    expect(result.origin).toBe('https://api.openai.com')
    expect(result.consentRequired).toBe(true)
    expect(long.ok === true && long.prepared.descriptionTruncated).toBe(true)
    expect(long.ok === true && long.prepared.content.endsWith('a'.repeat(20))).toBe(true)
  })

  it('re-preparar invalida o requestId anterior', async () => {
    const h = setup()
    const first = await prepared(h)

    const second = await prepared(h, 'Outro título')

    expect(second.requestId).not.toBe(first.requestId)
    expect(await h.service.suggest('doc-1', { requestId: first.requestId })).toEqual({
      ok: false,
      state: 'STALE_REQUEST',
    })
  })

  it('configuração bloqueada não prepara', async () => {
    const h = setup()
    h.fake.state.readError = new AiConfigStorageError('INCOMPATIBLE_DATA', 'futuro')

    expect(await h.service.prepare('doc-1', { title: 'T', description: '', existingSubtaskCount: 0 })).toEqual({
      ok: false,
      state: 'BLOCKED',
      blocked: 'INCOMPATIBLE',
    })
  })
})

describe('consentimento de conteúdo', () => {
  it('autorizar o conteúdo de uma prévia não autoriza outra', async () => {
    const h = setup()
    const first = await prepared(h)

    expect(await h.service.authorizeContent('doc-1', first.requestId)).toEqual({ ok: true })
    const second = await prepared(h, 'Outro título')

    expect(await h.service.suggest('doc-1', { requestId: second.requestId })).toEqual({
      ok: false,
      state: 'CONSENT_REQUIRED',
    })
  })

  it('requestId alheio ou antigo não autoriza', async () => {
    const h = setup()
    await prepared(h)

    expect(await h.service.authorizeContent('doc-1', 'pedido-alheio')).toEqual({
      ok: false,
      state: 'STALE_REQUEST',
    })
  })

  it('credencial autorizada não autoriza conteúdo', async () => {
    const h = setup()
    await h.provider.authorizeCredential('doc-1')
    const preparedNow = await prepared(h)

    expect(await h.service.suggest('doc-1', { requestId: preparedNow.requestId })).toEqual({
      ok: false,
      state: 'CONSENT_REQUIRED',
    })
  })
})

describe('geração única, cancelável e sem persistência', () => {
  it('executa o snapshot com teto de 3.000 tokens e devolve a proposta validada', async () => {
    const h = setup()
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)

    const result = await h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(result.ok).toBe(true)
    const request = vi.mocked(h.suggester.suggestSubtasks).mock.calls[0]?.[0]
    expect(request?.content).toBe(snapshot.content)
    expect(request?.maxOutputTokens).toBe(3_000)
    expect(result.ok === true && result.proposal.drafts).toEqual([{ title: 'Primeira' }, { title: 'Segunda' }])
  })

  it('o requestId é consumido: uma segunda sugestão com o mesmo valor é recusada', async () => {
    const h = setup()
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    await h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(await h.service.suggest('doc-1', { requestId: snapshot.requestId })).toEqual({
      ok: false,
      state: 'STALE_REQUEST',
    })
    expect(h.suggester.suggestSubtasks).toHaveBeenCalledTimes(1)
  })

  it('segundo acionamento concorrente responde BUSY sem iniciar outra requisição e conserva a prévia', async () => {
    let release: (value: { ok: true; text: string }) => void = () => undefined
    const suggestSubtasks = vi.fn()
    suggestSubtasks.mockImplementationOnce(
      () =>
        new Promise<{ ok: true; text: string }>((resolve) => {
          release = resolve
        }),
    )
    suggestSubtasks.mockImplementation(async () => ({ ok: true, text: 'Item' }))
    const h = setup({ suggestSubtasks: suggestSubtasks as unknown as AiSubtaskSuggester['suggestSubtasks'] })
    const first = await prepared(h)
    await h.service.authorizeContent('doc-1', first.requestId)
    const running = h.service.suggest('doc-1', { requestId: first.requestId })

    const second = await prepared(h, 'Outro')
    await h.service.authorizeContent('doc-1', second.requestId)
    const busy = await h.service.suggest('doc-1', { requestId: second.requestId })

    expect(busy).toEqual({ ok: false, state: 'BUSY' })
    release({ ok: true, text: 'Item' })
    expect((await running).ok).toBe(true)
    expect(suggestSubtasks).toHaveBeenCalledTimes(1)

    // A prévia conservada continua válida para novo acionamento depois do pedido em voo.
    expect((await h.service.suggest('doc-1', { requestId: second.requestId })).ok).toBe(true)
    expect(suggestSubtasks).toHaveBeenCalledTimes(2)
  })

  it('cancelar descarta a resposta que chega depois e preserva o formulário', async () => {
    let release: (value: { ok: true; text: string }) => void = () => undefined
    const h = setup({
      suggestSubtasks: vi.fn(
        () =>
          new Promise<{ ok: true; text: string }>((resolve) => {
            release = resolve
          }),
      ) as unknown as AiSubtaskSuggester['suggestSubtasks'],
    })
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    const pending = h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(h.service.cancel('doc-1', snapshot.requestId)).toEqual({ ok: true, cancelled: true })
    release({ ok: true, text: 'Tarde demais' })

    expect(await pending).toEqual({ ok: false, state: 'CANCELLED' })
  })

  it('cancelamento de outro documento é recusado sem afetar o pedido alheio', async () => {
    const h = setup({ suggestSubtasks: vi.fn(async () => ({ ok: true as const, text: 'Item válido' })) })
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    const pending = h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(h.service.cancel('doc-2', snapshot.requestId)).toEqual({ ok: false, state: 'UNKNOWN_REQUEST' })
    expect((await pending).ok).toBe(true)
  })

  it('cancelar uma preparação ainda não enviada invalida o requestId', async () => {
    const h = setup()
    const snapshot = await prepared(h)

    expect(h.service.cancel('doc-1', snapshot.requestId)).toEqual({ ok: true, cancelled: true })
    expect(await h.service.suggest('doc-1', { requestId: snapshot.requestId })).toEqual({
      ok: false,
      state: 'STALE_REQUEST',
    })
  })

  it('salvar configuração aborta o pedido e o resultado é descartado sem entrega', async () => {
    let release: (value: { ok: true; text: string }) => void = () => undefined
    const h = setup({
      suggestSubtasks: vi.fn(
        () =>
          new Promise<{ ok: true; text: string }>((resolve) => {
            release = resolve
          }),
      ) as unknown as AiSubtaskSuggester['suggestSubtasks'],
    })
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    const pending = h.service.suggest('doc-1', { requestId: snapshot.requestId })

    const saved = await h.provider.save('doc-1', { provider: 'OPENAI', credential: 'sk-nova', model: 'gpt-4o' }, '1')
    expect(saved.ok).toBe(true)
    release({ ok: true, text: 'Resposta atrasada' })

    expect(await pending).toEqual({ ok: false, state: 'DISCARDED' })
  })

  it('invalidação de sessão aborta e descarta o pedido do documento', async () => {
    let release: (value: { ok: true; text: string }) => void = () => undefined
    const h = setup({
      suggestSubtasks: vi.fn(
        () =>
          new Promise<{ ok: true; text: string }>((resolve) => {
            release = resolve
          }),
      ) as unknown as AiSubtaskSuggester['suggestSubtasks'],
    })
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    const pending = h.service.suggest('doc-1', { requestId: snapshot.requestId })

    h.service.forgetDocument('doc-1')
    release({ ok: true, text: 'Resposta atrasada' })

    expect(await pending).toEqual({ ok: false, state: 'DISCARDED' })
    expect(h.consents.size).toBe(0)
  })

  it('resposta sem item válido devolve motivo fechado e não altera o formulário', async () => {
    const h = setup({ suggestSubtasks: vi.fn(async () => ({ ok: true as const, text: '   \n-  \n' })) })
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)

    expect(await h.service.suggest('doc-1', { requestId: snapshot.requestId })).toEqual({
      ok: false,
      state: 'FAILED',
      reason: 'NO_VALID_ITEM',
    })
  })

  it('falha do provedor mantém motivo fechado e status, sem corpo', async () => {
    const h = setup({
      suggestSubtasks: vi.fn(async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const, status: 401 })),
    })
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)

    const result = await h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(result).toEqual({ ok: false, state: 'FAILED', reason: 'INVALID_CREDENTIALS', status: 401 })
    expect(JSON.stringify(result)).not.toContain('sk-')
  })

  it('corte por vagas sinaliza discardedByLimit na proposta', async () => {
    const h = setup({ suggestSubtasks: vi.fn(async () => ({ ok: true as const, text: 'A\nB\nC' })) })
    const snapshot = await prepared(h, 'T', 19)
    await h.service.authorizeContent('doc-1', snapshot.requestId)

    const result = await h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(result.ok === true && result.proposal.drafts).toEqual([{ title: 'A' }])
    expect(result.ok === true && result.proposal.discardedByLimit).toBe(true)
  })

  it('sucesso não persiste nada: repositório intacto e somente memória', async () => {
    const h = setup()
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    await h.service.suggest('doc-1', { requestId: snapshot.requestId })

    expect(h.fake.calls.save).toHaveLength(0)
    expect(h.fake.calls.remove).toBe(0)
    expect(h.fake.state.summary).toEqual(configuredSummary())
  })

  it('troca de configuração entre a preparação e a execução invalida o snapshot pela revisão', async () => {
    const h = setup()
    const snapshot = await prepared(h)
    await h.service.authorizeContent('doc-1', snapshot.requestId)

    // Salvar substitui a configuração, incrementa a revisão e limpa consentimentos.
    const saved = await h.provider.save('doc-1', { provider: 'ANTHROPIC', credential: 'sk-nova', model: 'claude' }, '1')
    expect(saved.ok).toBe(true)
    expect(h.consents.size).toBe(0)

    // Mesmo um consentimento forjado para a prévia antiga não passa da barreira de revisão.
    await h.service.authorizeContent('doc-1', snapshot.requestId)
    expect(await h.service.suggest('doc-1', { requestId: snapshot.requestId })).toEqual({
      ok: false,
      state: 'STALE_REQUEST',
    })
    expect(h.suggester.suggestSubtasks).not.toHaveBeenCalled()
  })
})
