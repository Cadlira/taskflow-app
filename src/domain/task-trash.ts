// Cópia revisada e ampliada de taskflow-extension@a763e7a src/domain/task-trash.ts (MIT, mesmo autor).
// Retenção, limite, ordem e planejamento puro da lixeira; o clock é injetado pelo proprietário.
import type { Task } from './task.js'

/** Tarefa excluída guardada na lixeira com o instante da exclusão. */
export interface TrashItem {
  /** Instante ISO 8601 UTC da exclusão. */
  deletedAt: string
  task: Task
}

/** Retenção: 30 × 24 h decorridos, independentes de calendário/DST. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Capacidade da lixeira: o move mantém no máximo as 100 primeiras entradas da ordem. */
export const TRASH_CAPACITY = 100

/**
 * Chave de ordenação/identidade de uma entrada já decodificada. A revisão de conteúdo da linha
 * de lixeira é criada no move (D3) e é comparada exatamente.
 */
export interface TrashEntryKey {
  taskId: string
  contentRevision: bigint
  deletedAt: string
}

export function trashDeletedAtMs(deletedAt: string): number {
  return Date.parse(deletedAt)
}

/** Remove somente deletedAt anterior a now − 30×24 h; exatamente 30 dias e datas futuras ficam. */
export function isTrashExpired(deletedAt: string, now: Date): boolean {
  const deletedMs = trashDeletedAtMs(deletedAt)
  return deletedMs < now.getTime() - TRASH_RETENTION_MS
}

/**
 * Ordem da lixeira: deletedAt numérico decrescente; empate por contentRevision da entrada
 * decrescente; último desempate por ID em ordem lexicográfica UTF-16 (sem localeCompare).
 */
export function compareTrashEntries(a: TrashEntryKey, b: TrashEntryKey): number {
  const aDeleted = trashDeletedAtMs(a.deletedAt)
  const bDeleted = trashDeletedAtMs(b.deletedAt)
  if (aDeleted !== bDeleted) return aDeleted < bDeleted ? 1 : -1
  if (a.contentRevision !== b.contentRevision) return a.contentRevision < b.contentRevision ? 1 : -1
  if (a.taskId === b.taskId) return 0
  return a.taskId < b.taskId ? -1 : 1
}

export interface TrashInsertionPlan<T extends TrashEntryKey> {
  /** Entradas sobreviventes na ordem final (as 100 primeiras). */
  kept: T[]
  /** IDs de entradas existentes descartadas por vencimento, substituição ou limite. */
  discardedTaskIds: string[]
  /** `true` quando a nova entrada permaneceu entre as 100 primeiras. */
  retained: boolean
}

/**
 * Planejamento puro do move: filtra vencidos, retira a versão anterior do mesmo ID, insere a
 * nova entrada, ordena e mantém as 100 primeiras. Não conhece banco nem clock global.
 */
export function planTrashInsertion<T extends TrashEntryKey>(
  entries: readonly T[],
  inserted: T,
  now: Date,
): TrashInsertionPlan<T> {
  const survivors = entries.filter((entry) => !isTrashExpired(entry.deletedAt, now))
  const withoutSameId = survivors.filter((entry) => entry.taskId !== inserted.taskId)
  const ordered = [...withoutSameId, inserted].sort(compareTrashEntries)
  const kept = ordered.slice(0, TRASH_CAPACITY)
  const keptSet = new Set(kept)
  const discardedTaskIds = entries
    .filter((entry) => !keptSet.has(entry) && entry.taskId !== inserted.taskId)
    .map((entry) => entry.taskId)
  return { kept, discardedTaskIds, retained: keptSet.has(inserted) }
}

/** Identidade observada de uma entrada para confirmações e recibos (D3). */
export function sameTrashEntryKey(a: TrashEntryKey, b: TrashEntryKey): boolean {
  return a.taskId === b.taskId && a.contentRevision === b.contentRevision && a.deletedAt === b.deletedAt
}

/**
 * Compara a composição completa capturada com a observada: mesma quantidade e mesmas identidades
 * (taskId/contentRevision/deletedAt), independentemente da ordem de leitura.
 */
export function sameTrashComposition(captured: readonly TrashEntryKey[], current: readonly TrashEntryKey[]): boolean {
  if (captured.length !== current.length) return false
  const byId = new Map(current.map((entry) => [entry.taskId, entry]))
  for (const entry of captured) {
    const observed = byId.get(entry.taskId)
    if (observed === undefined || !sameTrashEntryKey(entry, observed)) return false
  }
  return true
}
