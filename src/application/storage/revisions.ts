import { StorageFailure } from './task-storage-error.js'

/**
 * Revisões são inteiros não negativos de 64 bits com sinal, o intervalo de um INTEGER do
 * SQLite. Em memória usam `bigint`; no transporte usam string decimal canônica, pois o
 * `number` do JS perde precisão acima de 2^53 - 1. Não derivam de timestamp.
 */
export type Revision = bigint

export const INITIAL_REVISION: Revision = 0n
export const MAX_REVISION: Revision = 9_223_372_036_854_775_807n

const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]{0,18})$/

export function isRevision(value: unknown): value is Revision {
  return typeof value === 'bigint' && value >= INITIAL_REVISION && value <= MAX_REVISION
}

/** Próxima revisão; no limite persistível a escrita falha, sem wrap nem reinício. */
export function nextRevision(current: Revision): Revision {
  if (!isRevision(current)) throw new StorageFailure('INCOMPATIBLE_DATA')
  if (current >= MAX_REVISION) throw new StorageFailure('REVISION_EXHAUSTED')
  return current + 1n
}

export function formatRevision(revision: Revision): string {
  if (!isRevision(revision)) throw new StorageFailure('INCOMPATIBLE_DATA')
  return revision.toString(10)
}

/** Aceita somente a forma decimal canônica (sem sinal, espaços ou zeros à esquerda). */
export function parseRevision(text: unknown): Revision | undefined {
  if (typeof text !== 'string' || !CANONICAL_DECIMAL.test(text)) return undefined
  const value = BigInt(text)
  return value <= MAX_REVISION ? value : undefined
}
