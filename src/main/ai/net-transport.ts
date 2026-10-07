import { net } from 'electron'
import type { AiFetch } from './ai-probe.js'

/**
 * Transporte de produção. `net.fetch` usa a pilha de rede do Chromium e, no Windows, integra
 * proxy/PAC e os certificados do sistema — requisito para redes corporativas. O transporte é
 * injetável: os testes trocam esta função por um fake e nenhum teste faz chamada paga.
 *
 * `fetch` global do Node permanece como alternativa de uma linha na composição, sem mudar o
 * domínio nem os executores.
 */
export function createNetTransport(): AiFetch {
  return (input, init) => net.fetch(input, init)
}
