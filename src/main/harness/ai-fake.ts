import type { AiNativeProtection } from '../ai/native-protection.js'
import type { AiFetch } from '../ai/ai-probe.js'

/**
 * Proteção e transporte fictícios do cenário `ai` do harness empacotado. Substituem DPAPI e a
 * rede somente no perfil `test` com `--product-harness=ai`: nenhuma chamada paga, nenhum segredo
 * real e nenhuma dependência de proteção nativa da máquina de build.
 */
export function createHarnessAiProtection(): AiNativeProtection {
  return {
    available: () => true,
    encrypt: (text: string) => Buffer.from(`harness:${text}`, 'utf8'),
    decrypt: (data: Buffer) => {
      const text = data.toString('utf8')
      if (!text.startsWith('harness:')) throw new Error('blob inválido')
      return text.slice('harness:'.length)
    },
  }
}

export function createHarnessAiTransport(): AiFetch {
  return async (_input, init) => {
    if (init?.method === 'GET') {
      return new Response(JSON.stringify({ data: [{ id: 'modelo-fake' }] }), { status: 200 })
    }

    return new Response(JSON.stringify({ choices: [{ message: { content: 'Item um\nItem dois' } }] }), { status: 200 })
  }
}
