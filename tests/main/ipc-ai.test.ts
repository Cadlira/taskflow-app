// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { DocumentSessions } from '../../src/main/ipc/document-sessions.js'
import { AiIpcService } from '../../src/main/ipc/ai.js'
import { createAiProviderService } from '../../src/application/ai/ai-provider-service.js'
import { createAiSuggestionService } from '../../src/application/ai/ai-suggestion-service.js'
import { AiConsentRegistry } from '../../src/application/ai/ai-consent.js'
import { AiRequestRegistry } from '../../src/application/ai/ai-request-registry.js'
import type { AiConnectionTester } from '../../src/application/ai/ai-connection-tester.js'
import type { AiSubtaskSuggester } from '../../src/application/ai/ai-subtask-suggester.js'
import { PACKAGED_ORIGIN, fakeContents, fakeFrame, invocation } from '../support/documents.js'
import { createFakeAiRepository, type FakeAiState } from '../support/ai.js'

let nextRequestId = 0

function setup(options: { role?: 'MANAGER' | 'QUICK_ADD'; state?: Partial<FakeAiState>; tester?: Partial<AiConnectionTester>; suggester?: Partial<AiSubtaskSuggester> } = {}) {
  const role = options.role ?? 'MANAGER'
  const sessions = new DocumentSessions(PACKAGED_ORIGIN)
  const contents = fakeContents(1)
  sessions.register(contents, role)
  const fake = createFakeAiRepository(options.state)
  const consents = new AiConsentRegistry()
  const requests = new AiRequestRegistry()
  const tester: AiConnectionTester = { testConnection: vi.fn(async () => ({ ok: true as const })), ...options.tester }
  const suggester: AiSubtaskSuggester = {
    suggestSubtasks: vi.fn(async () => ({ ok: true as const, text: 'Um\nDois' })),
    ...options.suggester,
  }
  const providers = createAiProviderService({ repository: fake.repository, consents, requests, tester })
  const suggestions = createAiSuggestionService({
    repository: fake.repository,
    consents,
    requests,
    suggester,
    generateRequestId: () => `P${String((nextRequestId += 1)).padStart(31, '0')}`,
  })
  const ipc = new AiIpcService({ sessions, providers, suggestions })
  sessions.onInvalidated((key) => ipc.forgetDocument(key))
  return { role, sessions, contents, fake, consents, requests, tester, suggester, providers, suggestions, ipc, event: invocation(contents) }
}

const saveRequest = { version: 1, expectedRevision: '1', provider: 'OPENAI', model: 'gpt-4o' } as const

async function preparedRequestId(h: ReturnType<typeof setup>): Promise<string> {
  const prepared = await h.ipc.handlePrepare(h.event, {
    version: 1,
    title: 'Preparar a demo',
    description: 'Roteiro',
    existingSubtaskCount: 0,
  })
  if (prepared.status !== 'ok' || !('prepared' in prepared)) throw new Error('prévia indisponível')
  return prepared.prepared.requestId
}

describe('admissão e guardas antes de qualquer efeito', () => {
  it('Quick Add recusa todas as oito operações sem tocar repositório, consentimento ou rede', async () => {
    const h = setup({ role: 'QUICK_ADD' })
    const readSpy = vi.spyOn(h.fake.repository, 'read')
    const openSpy = vi.spyOn(h.fake.repository, 'openCredential')

    const replies = await Promise.all([
      h.ipc.handleStatus(h.event, { version: 1 }),
      h.ipc.handleSave(h.event, saveRequest),
      h.ipc.handleRemove(h.event, { version: 1 }),
      h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' }),
      h.ipc.handleTest(h.event, { version: 1, probe: 'MODEL_LIST' }),
      h.ipc.handlePrepare(h.event, { version: 1, title: 'T', description: '', existingSubtaskCount: 0 }),
      h.ipc.handleSuggest(h.event, { version: 1, requestId: 'A'.repeat(32) }),
      h.ipc.handleCancel(h.event, { version: 1, requestId: 'A'.repeat(32) }),
    ])

    expect(replies.every((reply) => reply.status === 'error' && reply.code === 'UNAUTHORIZED')).toBe(true)
    expect(readSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(h.tester.testConnection).not.toHaveBeenCalled()
    expect(h.suggester.suggestSubtasks).not.toHaveBeenCalled()
  })

  it('frame não autorizado é recusado antes do parser', async () => {
    const h = setup()
    const event = { sender: h.contents, senderFrame: fakeFrame('about:blank', 'null') }

    expect(await h.ipc.handleStatus(event, { version: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await h.ipc.handleSave(event, { version: 1, expectedRevision: '0', provider: 'OPENAI', model: 'm' })).toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('schema exato e orçamento são medidos antes de qualquer leitura', async () => {
    const h = setup()
    const readSpy = vi.spyOn(h.fake.repository, 'read')

    expect(await h.ipc.handleStatus(h.event, { version: 2 })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await h.ipc.handleStatus(h.event, { version: 1, extra: true })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await h.ipc.handleSave(h.event, { ...saveRequest, expectedRevision: '01' })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await h.ipc.handleSave(h.event, { ...saveRequest, apiBase: 'https://proxy.exemplo' })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await h.ipc.handleSave(h.event, { version: 1, expectedRevision: '1', provider: 'OPENAI', model: 'm'.repeat(9000) })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(await h.ipc.handlePrepare(h.event, { version: 1, title: 'T', description: '', existingSubtaskCount: 20 })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(readSpy).not.toHaveBeenCalled()
  })
})

describe('status, salvar e remover', () => {
  it('status devolve resumo sem segredo', async () => {
    const h = setup()

    const result = await h.ipc.handleStatus(h.event, { version: 1 })

    expect(result).toMatchObject({ version: 1, status: 'ok', provider: { state: 'CONFIGURED', revision: '1' } })
    expect(JSON.stringify(result)).not.toContain('sk-segredo')
  })

  it('salvar devolve sucesso com a configuração nova', async () => {
    const h = setup()

    const result = await h.ipc.handleSave(h.event, { ...saveRequest, credential: 'sk-nova' })

    expect(result).toMatchObject({ version: 1, status: 'ok', provider: { state: 'CONFIGURED', revision: '2' } })
    expect(h.fake.calls.save).toHaveLength(1)
  })

  it('salvar mapeia erros de campo e bloqueios para códigos fechados', async () => {
    const h = setup()
    const invalid = await h.ipc.handleSave(h.event, { version: 1, expectedRevision: '1', provider: 'CUSTOM', apiBase: 'http://remoto', model: 'm', credential: 'sk' })
    expect(invalid).toMatchObject({ code: 'VALIDATION_FAILED', fields: { apiBase: expect.stringContaining('https') } })

    const stale = await h.ipc.handleSave(h.event, { ...saveRequest, expectedRevision: '0' })
    expect(stale).toMatchObject({ code: 'BLOCKED', blocked: 'STALE_REVISION' })
  })

  it('salvar com sessão invalidada durante a gravação devolve SESSION_CLOSED', async () => {
    const h = setup()
    const original = h.fake.repository.save
    let release: () => void = () => undefined
    let entered: () => void = () => undefined
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve
    })
    h.fake.repository.save = async (input) => {
      entered()
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return original(input)
    }

    const pending = h.ipc.handleSave(h.event, { ...saveRequest, credential: 'sk-nova' })
    await enteredPromise
    h.sessions.invalidate(h.contents.id)
    release()

    expect(await pending).toMatchObject({ code: 'SESSION_CLOSED' })
  })

  it('remover apaga a configuração e revoga consentimentos', async () => {
    const h = setup()
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' })

    const result = await h.ipc.handleRemove(h.event, { version: 1 })

    expect(result).toMatchObject({ version: 1, status: 'ok', provider: { state: 'NONE' } })
    expect(h.consents.size).toBe(0)
    expect(h.fake.state.summary).toBeUndefined()
  })
})

describe('autorização por escopo', () => {
  it('credencial e conteúdo são escopos independentes', async () => {
    const h = setup()
    expect(await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' })).toMatchObject({ status: 'ok', scope: 'CREDENTIAL' })

    const prepared = await h.ipc.handlePrepare(h.event, { version: 1, title: 'T', description: '', existingSubtaskCount: 0 })
    if (prepared.status !== 'ok' || !('prepared' in prepared)) throw new Error('prévia indisponível')
    const requestId = prepared.prepared.requestId

    // Ainda sem consentimento de conteúdo: o teste continua exigindo o próprio escopo.
    expect(await h.ipc.handleTest(h.event, { version: 1, probe: 'MODEL_LIST' })).toMatchObject({ status: 'ok' })
    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId })).toMatchObject({ code: 'CONSENT_REQUIRED' })

    expect(await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CONTENT', requestId })).toMatchObject({ status: 'ok', scope: 'CONTENT' })
  })

  it('autorizar conteúdo exige prévia vigente do próprio documento', async () => {
    const h = setup()

    expect(await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CONTENT', requestId: 'A'.repeat(32) })).toMatchObject({
      code: 'STALE_REQUEST',
    })
  })

  it('sem configuração, autorizar credencial devolve NOT_CONFIGURED', async () => {
    const h = setup({ state: { summary: undefined, revision: '0' } })

    expect(await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' })).toMatchObject({ code: 'NOT_CONFIGURED' })
  })
})

describe('teste de conexão por IPC', () => {
  it('exige consentimento e depois devolve sucesso', async () => {
    const h = setup()

    expect(await h.ipc.handleTest(h.event, { version: 1, probe: 'MODEL_LIST' })).toMatchObject({ code: 'CONSENT_REQUIRED' })
    expect(h.tester.testConnection).not.toHaveBeenCalled()
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' })

    expect(await h.ipc.handleTest(h.event, { version: 1, probe: 'MINIMAL_COMPLETION' })).toEqual({ version: 1, status: 'ok' })
    expect(h.tester.testConnection).toHaveBeenCalledTimes(1)
  })

  it('falha fechada devolve motivo e código de estado', async () => {
    const h = setup({
      tester: { testConnection: vi.fn(async () => ({ ok: false as const, reason: 'INVALID_CREDENTIALS' as const, status: 401 })) },
    })
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' })

    expect(await h.ipc.handleTest(h.event, { version: 1, probe: 'MODEL_LIST' })).toEqual({
      version: 1,
      status: 'error',
      code: 'FAILED',
      reason: 'INVALID_CREDENTIALS',
      statusCode: 401,
    })
  })

  it('bloqueio de proteção é devolvido como BLOCKED fechado', async () => {
    const h = setup({ state: { protection: false, openError: new Error('sem DPAPI') } })
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CREDENTIAL' })

    expect(await h.ipc.handleTest(h.event, { version: 1, probe: 'MODEL_LIST' })).toMatchObject({ code: 'BLOCKED', blocked: 'UNAVAILABLE' })
  })
})

describe('prévia, sugestão e cancelamento', () => {
  it('prévia devolve o texto exato e o vínculo; edição re-prepara e invalida', async () => {
    const h = setup()
    const first = await preparedRequestId(h)

    const again = await h.ipc.handlePrepare(h.event, { version: 1, title: 'Outro', description: 'Roteiro', existingSubtaskCount: 0 })
    if (!again.status || again.status !== 'ok') throw new Error('prévia indisponível')
    const second = (again as { prepared: { requestId: string; content: string } }).prepared

    expect(second.requestId).not.toBe(first)
    expect(second.content).toContain('Título: Outro')
    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId: first })).toMatchObject({ code: 'STALE_REQUEST' })
  })

  it('título vazio e limite atingido devolvem VALIDATION_FAILED com o campo', async () => {
    const h = setup()

    expect(await h.ipc.handlePrepare(h.event, { version: 1, title: '  ', description: '', existingSubtaskCount: 0 })).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { title: expect.any(String) },
    })
    expect(await h.ipc.handlePrepare(h.event, { version: 1, title: 'T', description: '', existingSubtaskCount: 19 })).toMatchObject({
      status: 'ok',
    })
    // 19 é válido; somente o limite já atingido (20) é recusado pelo parser.
    expect(await h.ipc.handlePrepare(h.event, { version: 1, title: 'T', description: '', existingSubtaskCount: 20 })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
  })

  it('sugestão exige consentimento, devolve proposta e consome o requestId', async () => {
    const h = setup()
    const requestId = await preparedRequestId(h)

    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId })).toMatchObject({ code: 'CONSENT_REQUIRED' })
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CONTENT', requestId })

    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId })).toEqual({
      version: 1,
      status: 'ok',
      proposal: { drafts: [{ title: 'Um' }, { title: 'Dois' }], discardedByLimit: false },
    })
    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId })).toMatchObject({ code: 'STALE_REQUEST' })
  })

  it('cancelar atinge somente o requestId do próprio documento', async () => {
    const h = setup()
    const requestId = await preparedRequestId(h)

    expect(await h.ipc.handleCancel(h.event, { version: 1, requestId: 'A'.repeat(32) })).toMatchObject({ code: 'UNKNOWN_REQUEST' })
    expect(await h.ipc.handleCancel(h.event, { version: 1, requestId })).toEqual({ version: 1, status: 'ok' })
    // Preparação cancelada: requestId inválido para sugestão.
    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId })).toMatchObject({ code: 'STALE_REQUEST' })
  })

  it('resposta de sugestão com sessão invalidada não é entregue', async () => {
    const h = setup({
      suggester: {
        suggestSubtasks: vi.fn(
          () =>
            new Promise<{ ok: true; text: string }>((resolve) => {
              setTimeout(() => resolve({ ok: true, text: 'Item' }), 0)
            }),
        ) as unknown as AiSubtaskSuggester['suggestSubtasks'],
      },
    })
    const requestId = await preparedRequestId(h)
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CONTENT', requestId })

    const pending = h.ipc.handleSuggest(h.event, { version: 1, requestId })
    h.sessions.invalidate(h.contents.id)

    expect(await pending).toMatchObject({ code: 'SESSION_CLOSED' })
  })
})

describe('aborto por suspensão/ocultação', () => {
  it('suspend aborta o pedido em voo; o snapshot preparado foi consumido e o consentimento permanece', async () => {
    const h = setup({
      suggester: {
        suggestSubtasks: vi.fn(
          () => new Promise<{ ok: true; text: string }>((resolve) => setTimeout(() => resolve({ ok: true, text: 'Item' }), 10)),
        ) as unknown as AiSubtaskSuggester['suggestSubtasks'],
      },
    })
    const requestId = await preparedRequestId(h)
    await h.ipc.handleAuthorize(h.event, { version: 1, scope: 'CONTENT', requestId })

    const pending = h.ipc.handleSuggest(h.event, { version: 1, requestId })
    await vi.waitFor(() => expect(h.requests.size).toBe(1))
    h.ipc.suspend()

    expect(await pending).toMatchObject({ code: 'DISCARDED' })
    // O aborto da suspensão não revoga consentimentos: isso pertence a invalidar sessão/salvar.
    expect(h.consents.size).toBe(1)
    // Pedido cancelado é consumido: novo acionamento exige nova preparação.
    expect(await h.ipc.handleSuggest(h.event, { version: 1, requestId })).toMatchObject({ code: 'STALE_REQUEST' })
  })
})
