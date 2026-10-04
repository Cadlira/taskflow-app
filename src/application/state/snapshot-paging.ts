import type { SnapshotCollection, SnapshotCounts, SnapshotFragment } from '../../contracts/state.js'
import { measureJsonStringContent } from '../../contracts/text.js'
import { formatRevision } from '../storage/revisions.js'
import type { StoredTask, StoredTrashItem } from '../storage/unit-of-work.js'

/** `{"collection":"tasks","data":"","final":false}` mais a vírgula separadora. */
const FRAGMENT_OVERHEAD_BYTES = 48
const MINIMUM_CHUNK_BYTES = 16

export interface SerializedRecord {
  id: string
  /** JSON do registro público (`TaskRecord` ou `TrashRecord`). */
  json: string
}

/** Registros de uma coleção em ordem estável de identificador, a partir de `afterId` (exclusivo). */
export interface SnapshotRecordSource {
  records(collection: SnapshotCollection, afterId: string | undefined): Iterable<SerializedRecord>
}

/** Posição de uma montagem em andamento; vive somente no main, vinculada à sessão. */
export interface SnapshotPosition {
  collection: SnapshotCollection
  afterId: string | undefined
  /** Registro maior que a página: texto restante a enviar nas próximas páginas. */
  carry: { id: string; json: string; offset: number } | undefined
  counts: { tasks: number; trash: number }
}

export interface BuiltSnapshotPage {
  fragments: SnapshotFragment[]
  position: SnapshotPosition
  /** Presente quando as duas coleções terminaram nesta página. */
  complete: SnapshotCounts | undefined
}

export function initialSnapshotPosition(): SnapshotPosition {
  return { collection: 'tasks', afterId: undefined, carry: undefined, counts: { tasks: 0, trash: 0 } }
}

export function serializeTaskRecord(stored: StoredTask): SerializedRecord {
  return {
    id: stored.task.id,
    json: JSON.stringify({ task: stored.task, contentRevision: formatRevision(stored.contentRevision) }),
  }
}

export function serializeTrashRecord(stored: StoredTrashItem): SerializedRecord {
  return {
    id: stored.task.id,
    json: JSON.stringify({
      task: stored.task,
      deletedAt: stored.deletedAt,
      contentRevision: formatRevision(stored.contentRevision),
    }),
  }
}

/**
 * Monta uma página dentro do orçamento de bytes dos fragmentos. Um registro que não cabe é
 * fragmentado em fronteira de caractere e continua na página seguinte; nada é cortado nem
 * omitido. Não há limite para o total da coleção.
 */
export function buildSnapshotPage(
  source: SnapshotRecordSource,
  start: SnapshotPosition,
  fragmentBudgetBytes: number,
): BuiltSnapshotPage {
  const fragments: SnapshotFragment[] = []
  const position: SnapshotPosition = { ...start, counts: { ...start.counts } }
  let remaining = fragmentBudgetBytes

  /** Devolve `false` quando a página encheu. */
  function emit(collection: SnapshotCollection, record: SerializedRecord, offset: number): boolean {
    const available = remaining - FRAGMENT_OVERHEAD_BYTES
    if (available < MINIMUM_CHUNK_BYTES && fragments.length > 0) {
      position.carry = offset === 0 && position.carry === undefined ? undefined : { ...record, offset }
      return false
    }

    const measured = measureJsonStringContent(record.json, offset, available)
    if (measured.end === offset && offset < record.json.length) {
      if (fragments.length === 0) throw new RangeError('snapshot page budget is too small')
      position.carry = offset === 0 && position.carry === undefined ? undefined : { ...record, offset }
      return false
    }

    const final = measured.end === record.json.length
    fragments.push({ collection, data: record.json.slice(offset, measured.end), final })
    remaining -= measured.bytes + FRAGMENT_OVERHEAD_BYTES

    if (final) {
      position.carry = undefined
      position.afterId = record.id
      position.counts[collection] += 1
      return true
    }

    position.carry = { ...record, offset: measured.end }
    return false
  }

  if (position.carry !== undefined) {
    const { offset, ...record } = position.carry
    if (!emit(position.collection, record, offset)) {
      return { fragments, position, complete: undefined }
    }
  }

  for (;;) {
    let full = false
    for (const record of source.records(position.collection, position.afterId)) {
      if (!emit(position.collection, record, 0)) {
        full = true
        break
      }
    }

    if (full) return { fragments, position, complete: undefined }
    if (position.collection === 'trash') break
    position.collection = 'trash'
    position.afterId = undefined
  }

  return { fragments, position, complete: { ...position.counts } }
}
