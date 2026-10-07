// @vitest-environment node
// Cópia revisada e adaptada de taskflow-extension@a763e7a tests/infrastructure/ai-adapters.test.ts
// e tests/infrastructure/ai-generation.test.ts (MIT, mesmo autor). Somente fakes locais: nenhuma
// chamada paga, nenhum segredo real.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiProviderConfig } from '../../src/domain/ai-provider.js'
import { createAiAbortController } from '../../src/application/ai/ai-abort.js'
import { createProviderConnectionTester, createProviderSubtaskSuggester } from '../../src/main/ai/provider-adapters.js'
import { AI_GENERATION_BODY_LIMIT } from '../../src/main/ai/ai-generation.js'
import type { AiFetch } from '../../src/main/ai/ai-probe.js'

const openai: AiProviderConfig = { provider: 'OPENAI', credential: 'sk-secreta', model: 'gpt-4o-mini' }
const custom: AiProviderConfig = { provider: 'CUSTOM', apiBase: 'https://gateway.exemplo/v1', credential: 'sk-secreta', model: 'gateway-model' }
const anthropic: AiProviderConfig = { provider: 'ANTHROPIC', credential: 'sk-ant', model: 'claude-sonnet-4' }

interface Recorded {
  url: string
  init: RequestInit
}

function transportReturning(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Recorded[] = []
  const transport: AiFetch = async (url, init) => {
    calls.push({ url, init: init ?? {} })
    return respond(url, init ?? {})
  }
  return { transport, calls }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('verificação compatível com OpenAI e CUSTOM', () => {
  it('consulta a listagem autenticando por portador sob a base fixa', async () => {
    const { transport, calls } = transportReturning(() => new Response('{}', { status: 200 }))

    const result = await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: true })
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/models')
    expect(calls[0]?.init.method).toBe('GET')
    expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-secreta')
    expect(calls[0]?.init).toMatchObject({ redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
  })

  it('usa a base informada quando o provedor é CUSTOM', async () => {
    const { transport, calls } = transportReturning(() => new Response('{}', { status: 200 }))

    await createProviderConnectionTester(transport).testConnection({ config: custom, probe: 'MODEL_LIST' })

    expect(calls[0]?.url).toBe('https://gateway.exemplo/v1/models')
  })

  it('recusa seguir redirecionamento e informa resposta inesperada', async () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { transport } = transportReturning(() => new Response(null, { status: 302, headers: { location: 'https://outro.invalido/' } }))

    const result = await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: false, reason: 'UNEXPECTED_RESPONSE', status: 302 })
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toContain('outro.invalido')
  })

  it('aborta e informa tempo esgotado quando o provedor não responde', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      const transport: AiFetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })

      const pending = createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })
      await vi.advanceTimersByTimeAsync(15_000)

      expect(await pending).toEqual({ ok: false, reason: 'TIMEOUT' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('informa origem inalcançável quando a requisição falha antes da resposta', async () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const transport: AiFetch = async () => {
      throw new Error('caiu antes de responder')
    }

    const result = await createProviderConnectionTester(transport).testConnection({ config: custom, probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: false, reason: 'ENDPOINT_UNREACHABLE' })
    expect(String(log.mock.calls[0]?.[0])).toContain(JSON.stringify({ reason: 'ENDPOINT_UNREACHABLE', origin: 'https://gateway.exemplo' }))
  })

  it('é cancelável por sinal externo sem esperar o timeout', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const transport: AiFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const controller = createAiAbortController()

    const pending = createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST', signal: controller.signal })
    controller.abort()

    expect(await pending).toEqual({ ok: false, reason: 'ENDPOINT_UNREACHABLE' })
  })

  it('não lê o corpo de uma resposta bem-sucedida', async () => {
    const reads = { text: 0, reader: 0 }
    const response = {
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          reads.reader += 1
          return { read: async () => ({ done: true }), cancel: async () => undefined }
        },
      },
      text: async () => {
        reads.text += 1
        return 'secreto'
      },
    } as unknown as Response
    const { transport } = transportReturning(() => response)

    await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })

    expect(reads).toEqual({ text: 0, reader: 0 })
  })
})

describe('verificação na Anthropic', () => {
  it('envia a chave própria, a versão da API e o cabeçalho de paridade na listagem', async () => {
    const { transport, calls } = transportReturning(() => new Response('{}', { status: 200 }))

    await createProviderConnectionTester(transport).testConnection({ config: anthropic, probe: 'MODEL_LIST' })

    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/models')
    expect(calls[0]?.init.headers).toMatchObject({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
  })

  it('mantém os três cabeçalhos também no envio mínimo com ping e um token', async () => {
    const { transport, calls } = transportReturning(() => new Response('{}', { status: 200 }))

    await createProviderConnectionTester(transport).testConnection({ config: anthropic, probe: 'MINIMAL_COMPLETION' })

    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'claude-sonnet-4',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    })
    expect(calls[0]?.init.headers).toMatchObject({ 'x-api-key': 'sk-ant', 'anthropic-version': '2023-06-01' })
  })
})

describe('alternativa quando a listagem não existe', () => {
  it('informa listagem indisponível em vez de falha genérica', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { transport } = transportReturning(() => new Response('{}', { status: 404 }))

    expect(await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })).toEqual({
      ok: false,
      reason: 'MODEL_LIST_UNSUPPORTED',
      status: 404,
    })
  })

  it('envia conteúdo literal fixo e um token de resposta no envio mínimo', async () => {
    const { transport, calls } = transportReturning(() => new Response('{}', { status: 200 }))

    await createProviderConnectionTester(transport).testConnection({ config: custom, probe: 'MINIMAL_COMPLETION' })

    expect(calls[0]?.url).toBe('https://gateway.exemplo/v1/chat/completions')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'gateway-model',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    })
  })

  it('não trata 404 do envio mínimo como listagem indisponível', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { transport } = transportReturning(() => new Response('{}', { status: 404 }))

    expect(await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MINIMAL_COMPLETION' })).toMatchObject({
      reason: 'UNEXPECTED_RESPONSE',
      status: 404,
    })
  })
})

describe('falhas fechadas sem vazamento', () => {
  it('traduz 401 com trecho da chave no corpo sem ler nem registrar o corpo', async () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const reads = { text: 0, reader: 0 }
    const response = {
      ok: false,
      status: 401,
      body: {
        getReader: () => {
          reads.reader += 1
          return { read: async () => ({ done: true }), cancel: async () => undefined }
        },
      },
      text: async () => {
        reads.text += 1
        return 'chave inválida sk-secreta'
      },
    } as unknown as Response
    const { transport } = transportReturning(() => response)

    const result = await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })

    expect(result).toEqual({ ok: false, reason: 'INVALID_CREDENTIALS', status: 401 })
    expect(reads).toEqual({ text: 0, reader: 0 })
    expect(JSON.stringify(result)).not.toContain('sk-secreta')
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-secreta')
  })

  it('registra apenas motivo, origem e código de estado', async () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { transport } = transportReturning(() => new Response('{}', { status: 500 }))

    await createProviderConnectionTester(transport).testConnection({ config: custom, probe: 'MINIMAL_COMPLETION' })

    expect(String(log.mock.calls[0]?.[0])).toContain(
      JSON.stringify({ reason: 'UNEXPECTED_RESPONSE', origin: 'https://gateway.exemplo', status: 500 }),
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain('/chat/completions')
    expect(JSON.stringify(log.mock.calls)).not.toContain('Bearer')
  })

  it('traz no máximo origem e status em resposta desconhecida', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { transport } = transportReturning(() => new Response('{}', { status: 418 }))

    const result = await createProviderConnectionTester(transport).testConnection({ config: custom, probe: 'MODEL_LIST' })

    expect(Object.keys(result).sort()).toEqual(['ok', 'reason', 'status'])
  })

  it('não envia credencial em cookies nem no referenciador', async () => {
    const { transport, calls } = transportReturning(() => new Response('{}', { status: 200 }))

    await createProviderConnectionTester(transport).testConnection({ config: openai, probe: 'MODEL_LIST' })

    expect(calls[0]?.init.credentials).toBe('omit')
    expect(calls[0]?.init.referrerPolicy).toBe('no-referrer')
  })
})

describe('geração compatível com OpenAI', () => {
  it('envia o conteúdo à rota de conversa, com teto e sem streaming', async () => {
    const { transport, calls } = transportReturning(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'Item' } }] }), { status: 200 }),
    )

    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({
      config: openai,
      content: 'Título: x\nDescrição:\ny',
      maxOutputTokens: 3_000,
    })

    expect(result).toEqual({ ok: true, text: 'Item' })
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Título: x\nDescrição:\ny' }],
      max_tokens: 3_000,
      stream: false,
    })
  })

  it('transmite o conteúdo recebido caractere por caractere, sem reconstrução', async () => {
    const content = 'Título: ção 🚀 \r\nlinha\ntraço — fim'
    const { transport, calls } = transportReturning(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
    )

    await createProviderSubtaskSuggester(transport).suggestSubtasks({ config: custom, content, maxOutputTokens: 10 })

    expect((JSON.parse(String(calls[0]?.init.body)) as { messages: { content: string }[] }).messages[0]?.content).toBe(content)
  })

  it('resposta bem formada sem texto é vazia; estrutura diversa é ilegível', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const empty = transportReturning(() => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 })).transport
    const other = transportReturning(() => new Response(JSON.stringify({ result: 'x' }), { status: 200 })).transport

    expect(await createProviderSubtaskSuggester(empty).suggestSubtasks({ config: openai, content: 'c', maxOutputTokens: 1 })).toMatchObject({
      reason: 'EMPTY_RESPONSE',
    })
    expect(await createProviderSubtaskSuggester(other).suggestSubtasks({ config: openai, content: 'c', maxOutputTokens: 1 })).toMatchObject({
      reason: 'UNREADABLE_RESPONSE',
    })
  })

  it('401 devolve credencial inválida sem expor o corpo', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const response = {
      ok: false,
      status: 401,
      body: null,
      text: async () => 'sk-secreta ecoada',
    } as unknown as Response
    const { transport } = transportReturning(() => response)

    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({ config: openai, content: 'c', maxOutputTokens: 1 })

    expect(result).toEqual({ ok: false, reason: 'INVALID_CREDENTIALS', status: 401 })
    expect(JSON.stringify(result)).not.toContain('sk-secreta')
  })
})

describe('geração na Anthropic', () => {
  it('envia cabeçalhos, conteúdo e teto, sem streaming', async () => {
    const { transport, calls } = transportReturning(() =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'Primeira\nSegunda' }] }), { status: 200 }),
    )

    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({
      config: anthropic,
      content: 'conteúdo',
      maxOutputTokens: 3_000,
    })

    expect(result).toEqual({ ok: true, text: 'Primeira\nSegunda' })
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(calls[0]?.init.headers).toMatchObject({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: 'claude-sonnet-4',
      max_tokens: 3_000,
      messages: [{ role: 'user', content: 'conteúdo' }],
      stream: false,
    })
  })

  it('lista sem bloco de texto é resposta vazia; estrutura diversa é ilegível', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const empty = transportReturning(() => new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 'x' }] }), { status: 200 })).transport
    const other = transportReturning(() => new Response(JSON.stringify({ data: [] }), { status: 200 })).transport

    expect(await createProviderSubtaskSuggester(empty).suggestSubtasks({ config: anthropic, content: 'c', maxOutputTokens: 1 })).toMatchObject({
      reason: 'EMPTY_RESPONSE',
    })
    expect(await createProviderSubtaskSuggester(other).suggestSubtasks({ config: anthropic, content: 'c', maxOutputTokens: 1 })).toMatchObject({
      reason: 'UNREADABLE_RESPONSE',
    })
  })
})

describe('limite defensivo do corpo', () => {
  it('interrompe a leitura de um corpo desproporcional e cancela o fluxo', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(AI_GENERATION_BODY_LIMIT))
      },
      cancel() {
        cancelled = true
      },
    })
    const { transport } = transportReturning(() => new Response(stream, { status: 200 }))

    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({ config: openai, content: 'c', maxOutputTokens: 1 })

    expect(result).toMatchObject({ reason: 'UNREADABLE_RESPONSE' })
    expect(cancelled).toBe(true)
  })

  it('aplica o limite também quando a resposta não expõe fluxo legível', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const response = {
      ok: true,
      status: 200,
      body: null,
      text: async () => 'x'.repeat(AI_GENERATION_BODY_LIMIT + 1),
    } as unknown as Response
    const { transport } = transportReturning(() => response)

    expect(await createProviderSubtaskSuggester(transport).suggestSubtasks({ config: openai, content: 'c', maxOutputTokens: 1 })).toMatchObject({
      reason: 'UNREADABLE_RESPONSE',
    })
  })

  it('corpo não-JSON é ilegível sem propagar o erro que o produziu', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { transport } = transportReturning(() => new Response('{quebrado', { status: 200 }))

    expect(await createProviderSubtaskSuggester(transport).suggestSubtasks({ config: openai, content: 'c', maxOutputTokens: 1 })).toMatchObject({
      reason: 'UNREADABLE_RESPONSE',
    })
  })
})
