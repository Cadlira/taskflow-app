import type {
  SnapshotCollection,
  SnapshotPage,
  StateSnapshot,
  TaskRecord,
  TrashRecord,
} from '../../contracts/state.js'
import { isRevisionText } from '../../contracts/state.js'
import type { Task } from '../../domain/task.js'
import {
  CURRENT_PAYLOAD_VERSION,
  decodeStoredTaskRecords,
  isSameJsonValue,
  isStoredDeletedAt,
} from '../storage/stored-task-codec.js'

/** Resposta do main fora do contrato; nunca carrega o conteúdo recebido. */
export class MalformedSnapshotError extends Error {
  constructor() {
    super('malformed snapshot')
    this.name = 'MalformedSnapshotError'
  }
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function validateTask(value: unknown): Task {
  let decoded: Task | undefined
  try {
    decoded = decodeStoredTaskRecords(CURRENT_PAYLOAD_VERSION, [value])[0]
  } catch {
    throw new MalformedSnapshotError()
  }
  if (decoded === undefined || !isSameJsonValue(decoded, value)) throw new MalformedSnapshotError()
  return decoded
}

function validateRevision(value: unknown): string {
  if (!isRevisionText(value) || value === '0') throw new MalformedSnapshotError()
  return value
}

/** Par conteúdo/edição de um registro: ambas válidas e `edit <= content`. */
function validateRevisionPair(content: unknown, edit: unknown): { contentRevision: string; editRevision: string } {
  const contentRevision = validateRevision(content)
  const editRevision = validateRevision(edit)
  if (BigInt(editRevision) > BigInt(contentRevision)) throw new MalformedSnapshotError()
  return { contentRevision, editRevision }
}

/**
 * Reúne as páginas de um snapshot. Nada é publicado antes da conclusão: registros
 * fragmentados só são decodificados depois de reunidos, todas as páginas precisam ter a
 * mesma revisão e a contagem final precisa conferir.
 */
export class SnapshotAssembler {
  #revision: string | undefined
  #collection: SnapshotCollection = 'tasks'
  #partial = ''
  #hasPartial = false
  readonly #tasks: TaskRecord[] = []
  readonly #trash: TrashRecord[] = []
  readonly #seen = { tasks: new Set<string>(), trash: new Set<string>() }
  #finished = false

  /** Devolve o snapshot completo na última página; `undefined` enquanto houver continuação. */
  accept(page: SnapshotPage): StateSnapshot | undefined {
    if (this.#finished) throw new MalformedSnapshotError()
    if (this.#revision === undefined) this.#revision = page.revision
    else if (this.#revision !== page.revision) throw new MalformedSnapshotError()

    for (const fragment of page.fragments) {
      if (fragment.collection !== this.#collection) {
        if (this.#hasPartial || this.#collection === 'trash') throw new MalformedSnapshotError()
        this.#collection = 'trash'
      }

      this.#partial += fragment.data
      this.#hasPartial = true
      if (fragment.final) {
        this.#addRecord(this.#partial)
        this.#partial = ''
        this.#hasPartial = false
      }
    }

    if (page.complete === undefined) return undefined

    if (
      this.#hasPartial ||
      page.complete.tasks !== this.#tasks.length ||
      page.complete.trash !== this.#trash.length
    ) {
      throw new MalformedSnapshotError()
    }

    this.#finished = true
    return { revision: this.#revision, tasks: this.#tasks, trash: this.#trash }
  }

  #addRecord(json: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new MalformedSnapshotError()
    }

    if (this.#collection === 'tasks') {
      if (!hasExactKeys(parsed, ['task', 'contentRevision', 'editRevision'])) throw new MalformedSnapshotError()
      const task = validateTask(parsed['task'])
      this.#remember('tasks', task.id)
      this.#tasks.push({ task, ...validateRevisionPair(parsed['contentRevision'], parsed['editRevision']) })
      return
    }

    if (!hasExactKeys(parsed, ['task', 'deletedAt', 'contentRevision', 'editRevision'])) {
      throw new MalformedSnapshotError()
    }
    const task = validateTask(parsed['task'])
    const deletedAt = parsed['deletedAt']
    if (!isStoredDeletedAt(deletedAt)) throw new MalformedSnapshotError()
    this.#remember('trash', task.id)
    this.#trash.push({ task, deletedAt, ...validateRevisionPair(parsed['contentRevision'], parsed['editRevision']) })
  }

  #remember(collection: SnapshotCollection, id: string): void {
    if (this.#seen[collection].has(id)) throw new MalformedSnapshotError()
    this.#seen[collection].add(id)
  }
}
