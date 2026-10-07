import { describe, expect, it, vi } from 'vitest'
import {
  AI_BLOCK_CODES,
  AI_CHANNELS,
  AI_CHANNEL_LIST,
  AI_ERROR_CODES,
  AI_LIMITS,
  aiFailure,
  parseAiAuthorizeRequest,
  parseAiAuthorizeResult,
  parseAiCancelSuggestionResult,
  parseAiFailure,
  parseAiPrepareSuggestionRequest,
  parseAiPrepareSuggestionResult,
  parseAiProviderStatus,
  parseAiProviderStatusResult,
  parseAiRemoveConfigRequest,
  parseAiRequestIdRequest,
  parseAiSaveConfigRequest,
  parseAiSaveConfigResult,
  parseAiStatusRequest,
  parseAiSuggestSubtasksResult,
  parseAiTestConnectionRequest,
} from '../../src/contracts/ai.js'
import { createAiCommandClient, AiCommandTransportError } from '../../src/application/ai/ai-client.js'
import { utf8ByteLength } from '../../src/contracts/text.js'

describe('catálogo e orçamentos', () => {
  it('expõe exatamente as oito operações :v1 em canais distintos', () => {
    expect(AI_CHANNEL_LIST).toHaveLength(8)
    expect(new Set(AI_CHANNEL_LIST).size).toBe(8)
    expect(AI_CHANNEL_LIST.every((channel) => /^ai:[a-z-]+:v1$/.test(channel))).toBe(true)
    expect(AI_CHANNELS.prepareAiSuggestion).toBe('ai:prepare-suggestion:v1')
  })

  it('declara os orçamentos 1/8/16 KiB', () => {
    expect(AI_LIMITS.requestBytes).toBe(1024)
    expect(AI_LIMITS.resultBytes).toBe(8192)
    expect(AI_LIMITS.configBytes).toBe(8192)
    expect(AI_LIMITS.suggestionBytes).toBe(16384)
  })

  it('mantém uniões fechadas de erro, bloqueio e motivo', () => {
    expect(AI_ERROR_CODES).toContain('CONSENT_REQUIRED')
    expect(AI_BLOCK_CODES).toContain('PROTECTION_UNAVAILABLE')
    expect(AI_BLOCK_CODES).toContain('CREDENTIAL_UNREADABLE')
  })
})

describe('requests exatos', () => {
  it('recusa versões anteriores e campos extras', () => {
    expect(parseAiStatusRequest({ version: 1 })).toEqual({ version: 1 })
    expect(parseAiStatusRequest({ version: 2 })).toBeNull()
    expect(parseAiStatusRequest({ version: 1, extra: true })).toBeNull()
    expect(parseAiRemoveConfigRequest({ version: 1 })).toEqual({ version: 1 })
    expect(parseAiRemoveConfigRequest({ version: 1, path: 'C:\\x' })).toBeNull()
    expect(parseAiTestConnectionRequest({ version: 1, probe: 'MODEL_LIST' })).toEqual({ version: 1, probe: 'MODEL_LIST' })
    expect(parseAiTestConnectionRequest({ version: 1, probe: 'CHAT' })).toBeNull()
    expect(parseAiRequestIdRequest({ version: 1, requestId: 'A'.repeat(32) })).toEqual({ version: 1, requestId: 'A'.repeat(32) })
    expect(parseAiRequestIdRequest({ version: 1, requestId: 'curto' })).toBeNull()
    expect(parseAiRequestIdRequest({ version: 1, requestId: 'A'.repeat(32), body: 'x' })).toBeNull()
  })

  it('autorização separa os dois escopos e exige requestId somente no conteúdo', () => {
    expect(parseAiAuthorizeRequest({ version: 1, scope: 'CREDENTIAL' })).toEqual({ version: 1, scope: 'CREDENTIAL' })
    expect(parseAiAuthorizeRequest({ version: 1, scope: 'CREDENTIAL', requestId: 'A'.repeat(32) })).toBeNull()
    expect(parseAiAuthorizeRequest({ version: 1, scope: 'CONTENT' })).toBeNull()
    expect(parseAiAuthorizeRequest({ version: 1, scope: 'CONTENT', requestId: 'A'.repeat(32) })).toEqual({
      version: 1,
      scope: 'CONTENT',
      requestId: 'A'.repeat(32),
    })
    expect(parseAiAuthorizeRequest({ version: 1, scope: 'ALL' })).toBeNull()
  })

  it('salvar exige revisão, provedor exato e recusa base em provedor oficial', () => {
    const valid = parseAiSaveConfigRequest({
      version: 1,
      expectedRevision: '0',
      provider: 'CUSTOM',
      apiBase: 'https://gateway.exemplo/v1',
      model: 'm',
    })
    expect(valid).toMatchObject({ provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1' })

    expect(parseAiSaveConfigRequest({ version: 1, expectedRevision: '01', provider: 'OPENAI', model: 'm' })).toBeNull()
    expect(parseAiSaveConfigRequest({ version: 1, expectedRevision: '0', provider: 'GEMINI', model: 'm' })).toBeNull()
    expect(
      parseAiSaveConfigRequest({ version: 1, expectedRevision: '0', provider: 'OPENAI', apiBase: 'https://proxy.exemplo', model: 'm' }),
    ).toBeNull()
    expect(
      parseAiSaveConfigRequest({ version: 1, expectedRevision: '0', provider: 'CUSTOM', model: 'm', credential: 42 }),
    ).toBeNull()
    // Campo de credencial vazio é válido: significa preservar a credencial gravada.
    expect(
      parseAiSaveConfigRequest({ version: 1, expectedRevision: '1', provider: 'OPENAI', model: 'm', credential: '' }),
    ).toMatchObject({ credential: '' })
  })

  it('preparação limita título, descrição e vagas', () => {
    const base = { version: 1, title: 'Título', description: 'Descrição', existingSubtaskCount: 0 } as const
    expect(parseAiPrepareSuggestionRequest(base)).toEqual(base)
    expect(parseAiPrepareSuggestionRequest({ ...base, title: '' })).toBeNull()
    expect(parseAiPrepareSuggestionRequest({ ...base, title: 'a'.repeat(201) })).toBeNull()
    expect(parseAiPrepareSuggestionRequest({ ...base, description: 'a'.repeat(4001) })).toBeNull()
    expect(parseAiPrepareSuggestionRequest({ ...base, existingSubtaskCount: 20 })).toBeNull()
    expect(parseAiPrepareSuggestionRequest({ ...base, existingSubtaskCount: -1 })).toBeNull()
    expect(parseAiPrepareSuggestionRequest({ ...base, existingSubtaskCount: 1.5 })).toBeNull()
  })

  it('mede o orçamento em bytes UTF-8 completos antes de qualquer efeito', () => {
    // Descrição no limite de caracteres com escapes longos: não cabe em 16 KiB.
    const escaped = parseAiPrepareSuggestionRequest({
      version: 1,
      title: 'Título',
      description: '\u0001'.repeat(4000),
      existingSubtaskCount: 0,
    })
    expect(escaped).toBeNull()

    // Unicode real no limite útil de envio (título 200 + descrição 1.000) cabe com folga.
    const realistic = parseAiPrepareSuggestionRequest({
      version: 1,
      title: 'ç'.repeat(200),
      description: '🚀'.repeat(1000),
      existingSubtaskCount: 0,
    })
    expect(realistic).not.toBeNull()
    const bytes = utf8ByteLength(JSON.stringify(realistic))
    expect(bytes).toBeLessThanOrEqual(AI_LIMITS.suggestionBytes)

    // Configuração com base e modelo extensos: excesso recusado antes de gravar.
    expect(
      parseAiSaveConfigRequest({ version: 1, expectedRevision: '0', provider: 'OPENAI', model: 'm'.repeat(9000) }),
    ).toBeNull()
  })
})

describe('results exatos', () => {
  it('valida o resumo sem segredo e recusa estrutura desconhecida', () => {
    const configured = {
      version: 1,
      status: 'ok',
      provider: {
        state: 'CONFIGURED',
        revision: '3',
        protection: 'AVAILABLE',
        summary: { provider: 'OPENAI', apiBase: 'https://api.openai.com/v1', origin: 'https://api.openai.com', model: 'gpt', hasCredential: true },
        credentialConsent: true,
        contentConsent: false,
      },
    }
    expect(parseAiProviderStatusResult(configured)).toMatchObject({ status: 'ok' })
    expect(parseAiProviderStatusResult({ ...configured, extra: true })).toBeNull()
    expect(
      parseAiProviderStatusResult({ ...configured, provider: { ...configured.provider, summary: { ...configured.provider.summary, credential: 'sk-vazada' } } }),
    ).toBeNull()
    expect(parseAiProviderStatus({ state: 'NONE', revision: '0', protection: 'AVAILABLE' })).toEqual({
      state: 'NONE',
      revision: '0',
      protection: 'AVAILABLE',
    })
    expect(parseAiProviderStatus({ state: 'BLOCKED', blocked: 'PROTECTION_UNAVAILABLE' })).toEqual({
      state: 'BLOCKED',
      blocked: 'PROTECTION_UNAVAILABLE',
    })
    expect(parseAiProviderStatus({ state: 'BLOCKED', blocked: 'QUALQUER' })).toBeNull()
  })

  it('valida falhas fechadas com campos opcionais controlados', () => {
    expect(parseAiFailure(aiFailure('CONSENT_REQUIRED'))).toEqual({ version: 1, status: 'error', code: 'CONSENT_REQUIRED' })
    expect(
      parseAiFailure({ version: 1, status: 'error', code: 'BLOCKED', blocked: 'CREDENTIAL_UNREADABLE' }),
    ).toMatchObject({ code: 'BLOCKED', blocked: 'CREDENTIAL_UNREADABLE' })
    expect(
      parseAiFailure({ version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { credential: 'Informe a credencial do provedor.' } }),
    ).toMatchObject({ fields: { credential: 'Informe a credencial do provedor.' } })
    expect(
      parseAiFailure({ version: 1, status: 'error', code: 'FAILED', reason: 'INVALID_CREDENTIALS', statusCode: 401 }),
    ).toMatchObject({ reason: 'INVALID_CREDENTIALS', statusCode: 401 })
    expect(parseAiFailure({ version: 1, status: 'error', code: 'QUEBRADO' })).toBeNull()
    expect(parseAiFailure({ version: 1, status: 'error', code: 'FAILED', reason: 'QUALQUER' })).toBeNull()
    expect(parseAiFailure({ version: 1, status: 'error', code: 'BLOCKED', blocked: 'QUALQUER' })).toBeNull()
    expect(parseAiFailure({ version: 1, status: 'error', code: 'FAILED', statusCode: 999 })).toBeNull()
    expect(parseAiFailure({ version: 1, status: 'error', code: 'FAILED', fields: { corpo: 'x' } })).toBeNull()
  })

  it('valida a prévia com requestId, conteúdo exato e corte', () => {
    const prepared = {
      version: 1,
      status: 'ok',
      prepared: {
        requestId: 'A'.repeat(32),
        content: 'Título: x',
        descriptionTruncated: true,
        origin: 'https://api.openai.com',
        consentRequired: true,
      },
    }
    expect(parseAiPrepareSuggestionResult(prepared)).toMatchObject({ status: 'ok' })
    expect(parseAiPrepareSuggestionResult({ ...prepared, prepared: { ...prepared.prepared, requestId: 'curto' } })).toBeNull()
    expect(parseAiPrepareSuggestionResult({ ...prepared, prepared: { ...prepared.prepared, extra: 1 } })).toBeNull()
  })

  it('valida a proposta: títulos 1–200, até 20 itens e nenhum id/done', () => {
    const ok = parseAiSuggestSubtasksResult({
      version: 1,
      status: 'ok',
      proposal: { drafts: [{ title: 'Item' }], discardedByLimit: true },
    })
    expect(ok).toMatchObject({ status: 'ok', proposal: { discardedByLimit: true } })
    expect(
      parseAiSuggestSubtasksResult({ version: 1, status: 'ok', proposal: { drafts: [{ title: 'x', id: 'a' }], discardedByLimit: false } }),
    ).toBeNull()
    expect(
      parseAiSuggestSubtasksResult({ version: 1, status: 'ok', proposal: { drafts: [{ title: '' }], discardedByLimit: false } }),
    ).toBeNull()
    expect(
      parseAiSuggestSubtasksResult({ version: 1, status: 'ok', proposal: { drafts: [{ title: 'x'.repeat(201) }], discardedByLimit: false } }),
    ).toBeNull()
    expect(
      parseAiSuggestSubtasksResult({
        version: 1,
        status: 'ok',
        proposal: { drafts: Array.from({ length: 21 }, (_, index) => ({ title: `Item ${index}` })), discardedByLimit: false },
      }),
    ).toBeNull()
  })

  it('valida autorização, salvar e cancelar com schemas exatos', () => {
    expect(parseAiAuthorizeResult({ version: 1, status: 'ok', scope: 'CONTENT' })).toEqual({ version: 1, status: 'ok', scope: 'CONTENT' })
    expect(parseAiAuthorizeResult({ version: 1, status: 'ok', scope: 'ALL' })).toBeNull()
    expect(parseAiCancelSuggestionResult({ version: 1, status: 'ok' })).toEqual({ version: 1, status: 'ok' })
    expect(
      parseAiSaveConfigResult({
        version: 1,
        status: 'ok',
        provider: { state: 'NONE', revision: '1', protection: 'AVAILABLE' },
      }),
    ).toMatchObject({ status: 'ok' })
    expect(
      parseAiSaveConfigResult({ version: 1, status: 'ok', provider: { state: 'NONE', revision: '01', protection: 'AVAILABLE' } }),
    ).toBeNull()
  })
})

describe('cliente do preload', () => {
  it('request inválido nem chega ao main', async () => {
    const invoke = vi.fn(async () => ({
      version: 1,
      status: 'ok',
      provider: { state: 'NONE', revision: '0', protection: 'AVAILABLE' },
    }))
    const client = createAiCommandClient({ invoke })

    expect(await client.getAiProviderStatus({ version: 2 })).toEqual({ version: 1, status: 'error', code: 'INVALID_REQUEST' })
    expect(await client.saveAiProviderConfig({ version: 1, expectedRevision: '0', provider: 'CUSTOM', model: 'm' })).toMatchObject({
      status: 'ok',
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('ai:save-config:v1', expect.objectContaining({ expectedRevision: '0' }))
  })

  it('saída malformada vira falha local de transporte, sem sucesso inventado', async () => {
    const client = createAiCommandClient({ invoke: async () => ({ version: 1, status: 'ok', provider: { state: 'CONFIGURED' } }) })
    await expect(client.getAiProviderStatus({ version: 1 })).rejects.toThrow(AiCommandTransportError)
    const rejecting = createAiCommandClient({ invoke: async () => Promise.reject(new Error('caiu')) })
    await expect(rejecting.testAiConnection({ version: 1, probe: 'MODEL_LIST' })).rejects.toThrow('ai-command-transport')
  })
})
