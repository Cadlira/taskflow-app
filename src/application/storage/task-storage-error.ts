/**
 * Razões portáveis de falha do armazenamento. São discriminantes de dados: nenhuma camada
 * depende de `instanceof` atravessando IPC, e a causa original fica restrita ao main.
 *
 * - `INCOMPATIBLE_DATA`: dados existentes não reconhecidos (schema/codec/assinatura/payload).
 * - `CORRUPTED_DATA`: integridade estrutural inválida.
 * - `UNAVAILABLE`: abertura, I/O, permissão, disco cheio ou configuração indisponível.
 * - `LOCKED`: outro acesso manteve o lock além da espera limitada.
 * - `UNCERTAIN`: rollback ou confirmação falhou; exige reopen validado antes de continuar.
 * - `INVALID_DATA`: a unidade tentou gravar dado que o codec recusa.
 * - `REVISION_EXHAUSTED`: a revisão persistível chegou ao limite; nunca reinicia.
 * - `QUEUE_FULL` / `WAIT_TIMEOUT`: admissão ou espera da fila excedida, antes de qualquer efeito.
 * - `CLOSED`: admissão encerrada (saída do app).
 * - `SESSION_CLOSED`: a sessão/documento que pediu a unidade deixou de ser corrente.
 * - `INVALID_UNIT`: uso incorreto da unidade (reentrada, callback assíncrono, porta expirada).
 */
export type StorageFailureReason =
  | 'INCOMPATIBLE_DATA'
  | 'CORRUPTED_DATA'
  | 'UNAVAILABLE'
  | 'LOCKED'
  | 'UNCERTAIN'
  | 'INVALID_DATA'
  | 'REVISION_EXHAUSTED'
  | 'QUEUE_FULL'
  | 'WAIT_TIMEOUT'
  | 'CLOSED'
  | 'SESSION_CLOSED'
  | 'INVALID_UNIT'

export const STORAGE_FAILURE_REASONS: readonly StorageFailureReason[] = [
  'INCOMPATIBLE_DATA',
  'CORRUPTED_DATA',
  'UNAVAILABLE',
  'LOCKED',
  'UNCERTAIN',
  'INVALID_DATA',
  'REVISION_EXHAUSTED',
  'QUEUE_FULL',
  'WAIT_TIMEOUT',
  'CLOSED',
  'SESSION_CLOSED',
  'INVALID_UNIT',
]

/**
 * Erro interno lançado dentro de uma unidade de trabalho para forçar rollback. A mensagem é
 * fixa por razão: nunca carrega caminho, SQL, identificador de tarefa ou payload.
 */
export class StorageFailure extends Error {
  readonly reason: StorageFailureReason

  constructor(reason: StorageFailureReason) {
    super(`storage failure: ${reason}`)
    this.name = 'StorageFailure'
    this.reason = reason
  }
}

export function isStorageFailureReason(value: unknown): value is StorageFailureReason {
  return typeof value === 'string' && (STORAGE_FAILURE_REASONS as readonly string[]).includes(value)
}

/** Lê a razão por discriminante, sem `instanceof` (o erro pode vir de outro realm/bundle). */
export function storageFailureReasonOf(error: unknown): StorageFailureReason | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { name?: unknown; reason?: unknown }
  return candidate.name === 'StorageFailure' && isStorageFailureReason(candidate.reason) ? candidate.reason : undefined
}
