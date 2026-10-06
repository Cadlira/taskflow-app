import type { ReminderOccurrenceKey } from '../../domain/task-reminders.js'

export const REMINDER_INDEX_BYTES = 64 * 1024 * 1024
export interface ReminderProjection extends ReminderOccurrenceKey {
  tag: string
  triggerAt: number
  pending: boolean
  /** Ativa pendente ou terminal já vencida a liquidar. */
  scheduled: boolean
}
interface Entry extends ReminderProjection { position: number; charge: number }

/** Heap removível + mapas por tarefa/tag. Sem Tasks/títulos, tombstones ou chave concatenada. */
export class ReminderIndex {
  readonly #tasks = new Map<string, Set<Entry>>()
  readonly #tags = new Map<string, Set<Entry>>()
  readonly #heap: Entry[] = []
  #charge = 0
  constructor(readonly limit = REMINDER_INDEX_BYTES) {}
  get charge(): number { return this.#charge }
  get size(): number { return this.#heap.length }
  get first(): ReminderProjection | undefined { return this.#heap[0] }
  resolve(tag: string): ReminderOccurrenceKey | undefined {
    const entries = this.#tags.get(tag)
    // Duas tuplas (inclusive processamento diferente) jamais escolhem arbitrariamente.
    if (entries?.size !== 1) return undefined
    const entry = entries.values().next().value
    return entry !== undefined && !entry.pending ? entry : undefined
  }
  replace(taskId: string, projections: readonly ReminderProjection[]): boolean {
    const charges = projections.map((key) => 256 + 2 *
      (key.taskId.length + key.reminderId.length + key.triggerISO.length + key.tag.length))
    let previousCharge = 0
    for (const entry of this.#tasks.get(taskId) ?? []) previousCharge += entry.charge
    // Charges incluem heap/mapas/sets/referências; journal será contabilizado pelo serviço.
    if (this.#charge - previousCharge + charges.reduce((sum, item) => sum + item, 0) > this.limit) return false
    this.removeTask(taskId)
    if (projections.length === 0) return true
    const entries = new Set<Entry>()
    for (const [index, projection] of projections.entries()) {
      const entry: Entry = { ...projection, position: -1, charge: charges[index] ?? 0 }
      entries.add(entry)
      this.#charge += entry.charge
      let tags = this.#tags.get(entry.tag)
      if (tags === undefined) { tags = new Set(); this.#tags.set(entry.tag, tags) }
      tags.add(entry)
      if (entry.scheduled && entry.pending) {
        entry.position = this.#heap.length
        this.#heap.push(entry)
        this.#up(entry.position)
      }
    }
    this.#tasks.set(taskId, entries)
    return true
  }
  consume(key: ReminderOccurrenceKey): void {
    for (const entry of this.#tasks.get(key.taskId) ?? []) {
      if (entry.reminderId === key.reminderId && entry.triggerISO === key.triggerISO) {
        if (entry.position >= 0) this.#removeHeap(entry.position)
        entry.pending = false
        entry.scheduled = false
        return
      }
    }
  }
  removeTask(taskId: string): void {
    for (const entry of this.#tasks.get(taskId) ?? []) {
      if (entry.position >= 0) this.#removeHeap(entry.position)
      this.#charge -= entry.charge
      const tags = this.#tags.get(entry.tag)
      tags?.delete(entry)
      if (tags?.size === 0) this.#tags.delete(entry.tag)
    }
    this.#tasks.delete(taskId)
  }
  #before(left: Entry, right: Entry): boolean {
    return left.triggerAt < right.triggerAt || (left.triggerAt === right.triggerAt && left.tag < right.tag)
  }
  #swap(left: number, right: number): void {
    const a = this.#heap[left]
    const b = this.#heap[right]
    if (a === undefined || b === undefined) return
    this.#heap[left] = b; b.position = left
    this.#heap[right] = a; a.position = right
  }
  #up(start: number): void {
    let index = start
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      const entry = this.#heap[index]
      const above = this.#heap[parent]
      if (entry === undefined || above === undefined || !this.#before(entry, above)) break
      this.#swap(index, parent); index = parent
    }
  }
  #down(start: number): void {
    let index = start
    while (index < this.#heap.length) {
      let smaller = index
      for (const child of [2 * index + 1, 2 * index + 2]) {
        const entry = this.#heap[child]
        const current = this.#heap[smaller]
        if (entry !== undefined && current !== undefined && this.#before(entry, current)) smaller = child
      }
      if (smaller === index) break
      this.#swap(index, smaller); index = smaller
    }
  }
  #removeHeap(index: number): void {
    const removed = this.#heap[index]
    const last = this.#heap.pop()
    if (removed !== undefined) removed.position = -1
    if (last !== undefined && index < this.#heap.length) {
      this.#heap[index] = last; last.position = index
      this.#up(index)
      this.#down(last.position)
    }
  }
}
