// @vitest-environment node
// Servidor HTTP fictício em loopback: cobre rede real local, recusa de redirecionamento, corpo
// acima do limite e respostas malformadas sem nenhuma chamada paga.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createProviderConnectionTester, createProviderSubtaskSuggester } from '../../src/main/ai/provider-adapters.js'
import type { AiProviderConfig } from '../../src/domain/ai-provider.js'
import type { AiFetch } from '../../src/main/ai/ai-probe.js'

let server: Server
let base: string
const hits: string[] = []

beforeAll(async () => {
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = request.url ?? '/'
    hits.push(url)

    if (url === '/redirect/v1/models') {
      response.writeHead(302, { location: `${base}/redirect-target/v1/models` })
      response.end()
      return
    }

    if (url === '/big/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'application/json' })
      const chunk = 'x'.repeat(16 * 1024)
      for (let index = 0; index < 8; index += 1) response.write(chunk)
      response.end()
      return
    }

    if (url === '/malformed/v1/chat/completions') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{não é json')
      return
    }

    if (url === '/unauthorized/v1/models') {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'chave inválida sk-secreta' }))
      return
    }

    if (url.endsWith('/v1/models')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'local-model' }] }))
      return
    }

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: 'Primeira\nSegunda' } }] }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

const transport: AiFetch = (input, init) => fetch(input, init)

function loopbackConfig(path: string): AiProviderConfig {
  return { provider: 'CUSTOM', apiBase: `${base}${path}`, credential: 'sk-ficticia', model: 'local-model' }
}

describe('loopback local sem chamadas pagas (AI05/AI14)', () => {
  it('consulta a listagem em http loopback e informa sucesso', async () => {
    const result = await createProviderConnectionTester(transport).testConnection({
      config: loopbackConfig('/loop/v1'),
      probe: 'MODEL_LIST',
    })

    expect(result).toEqual({ ok: true })
    expect(hits).toContain('/loop/v1/models')
  })

  it('recusa redirecionamento e não alcança o destino', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const result = await createProviderConnectionTester(transport).testConnection({
      config: loopbackConfig('/redirect/v1'),
      probe: 'MODEL_LIST',
    })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: 'ENDPOINT_UNREACHABLE' })
    expect(hits).not.toContain('/redirect-target/v1/models')
  })

  it('corpo acima de 64 KiB é recusado sem entrar na memória do produto', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({
      config: loopbackConfig('/big/v1'),
      content: 'conteúdo fictício',
      maxOutputTokens: 10,
    })

    expect(result).toMatchObject({ reason: 'UNREADABLE_RESPONSE' })
  })

  it('resposta malformada é ilegível e o formulário não recebe nada', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({
      config: loopbackConfig('/malformed/v1'),
      content: 'conteúdo fictício',
      maxOutputTokens: 10,
    })

    expect(result).toMatchObject({ reason: 'UNREADABLE_RESPONSE' })
  })

  it('401 com corpo contendo a chave devolve motivo fechado', async () => {
    const log = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const result = await createProviderConnectionTester(transport).testConnection({
      config: loopbackConfig('/unauthorized/v1'),
      probe: 'MODEL_LIST',
    })

    expect(result).toEqual({ ok: false, reason: 'INVALID_CREDENTIALS', status: 401 })
    expect(JSON.stringify(result)).not.toContain('sk-secreta')
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-secreta')
  })

  it('geração local bem-sucedida devolve o texto para a validação do domínio', async () => {
    const result = await createProviderSubtaskSuggester(transport).suggestSubtasks({
      config: loopbackConfig('/ok/v1'),
      content: 'conteúdo fictício',
      maxOutputTokens: 10,
    })

    expect(result).toEqual({ ok: true, text: 'Primeira\nSegunda' })
  })
})
