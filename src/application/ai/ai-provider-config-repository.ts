import type { AiProvider, AiProviderConfig } from '../../domain/ai-provider.js'

/**
 * Motivos fechados de falha do armazenamento da configuração de provedor. Nunca carregam a
 * credencial nem qualquer trecho da configuração na mensagem.
 *
 * - `INCOMPATIBLE_DATA`: envelope desconhecido ou versão futura; nada foi sobrescrito.
 * - `PROTECTION_UNAVAILABLE`: o mecanismo nativo de proteção não está disponível; gravar e usar
 *   são bloqueados, sem degradar para texto simples.
 * - `CREDENTIAL_UNREADABLE`: o ciphertext não decifra neste perfil; o arquivo é preservado e o uso
 *   bloqueado, restando a remoção explícita.
 * - `UNKNOWN`: a publicação ficou incerta; novos setters bloqueiam até a reconciliação explícita.
 * - `UNAVAILABLE`: falha de E/S sem publicação confirmada.
 * - `STALE_REVISION`: a revisão esperada não é a corrente; nada foi gravado.
 * - `RESOURCE_LIMIT`: o arquivo excederia o limite declarado; nada foi gravado.
 */
export type AiConfigStorageErrorReason =
  | 'INCOMPATIBLE_DATA'
  | 'PROTECTION_UNAVAILABLE'
  | 'CREDENTIAL_UNREADABLE'
  | 'UNKNOWN'
  | 'UNAVAILABLE'
  | 'STALE_REVISION'
  | 'RESOURCE_LIMIT'

export class AiConfigStorageError extends Error {
  readonly reason: AiConfigStorageErrorReason

  constructor(reason: AiConfigStorageErrorReason, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiConfigStorageError'
    this.reason = reason
  }
}

/**
 * Bloqueios que impedem salvar, testar e sugerir, deixando ao usuário a remoção explícita ou a
 * correção do arquivo. Códigos fechados: nenhum detalhe do motivo interno acompanha o estado.
 */
export type AiConfigBlock =
  | 'INCOMPATIBLE'
  | 'PROTECTION_UNAVAILABLE'
  | 'CREDENTIAL_UNREADABLE'
  | 'UNKNOWN'
  | 'UNAVAILABLE'
  | 'STALE_REVISION'
  | 'RESOURCE_LIMIT'

const BLOCK_BY_REASON: Record<AiConfigStorageErrorReason, AiConfigBlock> = {
  INCOMPATIBLE_DATA: 'INCOMPATIBLE',
  PROTECTION_UNAVAILABLE: 'PROTECTION_UNAVAILABLE',
  CREDENTIAL_UNREADABLE: 'CREDENTIAL_UNREADABLE',
  UNKNOWN: 'UNKNOWN',
  UNAVAILABLE: 'UNAVAILABLE',
  STALE_REVISION: 'STALE_REVISION',
  RESOURCE_LIMIT: 'RESOURCE_LIMIT',
}

/** Traduz a falha do armazenamento para o bloqueio fechado; nunca deixa passar a causa. */
export function aiBlockFor(error: unknown): AiConfigBlock {
  return error instanceof AiConfigStorageError ? BLOCK_BY_REASON[error.reason] : 'UNAVAILABLE'
}

/** Visão sem segredo da configuração gravada: presença de credencial, nunca o valor. */
export interface AiStoredConfigSummary {
  provider: AiProvider
  /** Base efetiva das requisições: fixa nos oficiais e informada em `CUSTOM`. */
  apiBase: string
  model: string
  /** Marca irreconstruível: existe ciphertext gravado. O valor jamais é devolvido por aqui. */
  hasCredential: boolean
}

/**
 * Estado persistido sempre conhecido pela revisão. `summary` ausente significa "nenhum provedor
 * configurado" — inclusive depois de uma remoção, que conserva a revisão monotônica.
 */
export interface AiStoredState {
  revision: string
  summary?: AiStoredConfigSummary | undefined
}

/**
 * Entrada de substituição completa. `credential` ausente preserva o ciphertext já gravado
 * (campo intocado); presente substitui o segredo. A revisão esperada é conferida antes de
 * qualquer efeito.
 */
export interface AiProviderConfigSaveInput {
  expectedRevision: string
  provider: AiProvider
  apiBase?: string | undefined
  model: string
  credential?: string | undefined
}

/**
 * Fonte persistente da configuração de provedor. No máximo uma configuração ativa: `save`
 * substitui a anterior por completo. A decifra é sob demanda (`openCredential`), nunca na leitura
 * de resumo; o resultado em texto claro existe apenas para a requisição imediata e não é cacheado.
 */
export interface AiProviderConfigRepository {
  /** Estado corrente: revisão sempre presente; resumo ausente quando não há configuração. */
  read(): Promise<AiStoredState>
  /** Decifra a credencial sob demanda para uma única requisição; `undefined` sem configuração. */
  openCredential(): Promise<{ config: AiProviderConfig; revision: string } | undefined>
  /** Substitui a configuração ativa sob CAS de revisão; devolve o novo estado. */
  save(input: AiProviderConfigSaveInput): Promise<AiStoredState>
  /** Apaga a configuração, inclusive o ciphertext, mesmo em estado bloqueado. */
  remove(): Promise<{ revision: string }>
  /** Reconciliação explícita após publicação incerta. Lança `AiConfigStorageError`. */
  reconcile(): Promise<void>
  /** Disponibilidade do mecanismo nativo de proteção, conferida antes de gravar e de usar. */
  protectionAvailable(): boolean
  /** Revisão corrente sem decifrar nem carregar o resumo completo. */
  currentRevision(): Promise<string>
}
