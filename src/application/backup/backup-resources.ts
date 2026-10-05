// Orçamento lógico global dos recursos de backup (D2): um teto próprio, independente dos 64 MiB
// de undo. Charge é orçamento lógico, não garantia de heap: as provas medem heap/RSS/pico/bloqueio
// separadamente. Toda referência/candidato/job de backup entra no charge enquanto existir.
export const BACKUP_BUDGET_BYTES = 128 * 1024 * 1024

export interface BackupReservation {
  readonly id: number
  readonly bytes: number
}

export type BackupReserveResult =
  | { status: 'ok'; reservation: BackupReservation }
  | { status: 'resource-limit' }

/** Charge de leitura/parse: buffers incrementais + string + objetos, sem contar a mesma referência duas vezes. */
export function backupParseChargeBytes(fileBytes: number, nodeCount: number): number {
  return 3 * fileBytes + 128 * nodeCount + 4096
}

/** Charge de cópia retida (preparação, snapshot, expectativa, clone): tarefas canônicas + nós conhecidos. */
export function backupPreparationChargeBytes(canonicalTaskBytes: number, knownNodeCount: number): number {
  return 2 * canonicalTaskBytes + 128 * knownNodeCount + 4096
}

/** Charge de bytes serializados mantidos em memória (temporário lógico/readback). */
export function backupSerializedChargeBytes(serializedBytes: number): number {
  return 2 * serializedBytes + 4096
}

/**
 * Conta nós de um valor JS já materializado com a mesma regra do scanner (cada chave, container e
 * escalar conta), sem serializar nem clonar. Usada para o charge de preparação/snapshot.
 */
export function countValueNodes(value: unknown): number {
  if (value === null || typeof value !== 'object') return 1
  if (Array.isArray(value)) {
    let nodes = 1
    for (const item of value) nodes += countValueNodes(item)
    return nodes
  }
  let nodes = 1
  for (const [key, item] of Object.entries(value)) {
    void key
    nodes += 1 + countValueNodes(item)
  }
  return nodes
}

function isCharge(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * Registro global: reserva antes de alocar e libera em `finally`. Sobreposição de fases
 * (parse + preparação durante a projeção) é admitida somente quando as duas reservas cabem.
 */
export class BackupResourceLedger {
  readonly #budgetBytes: number
  readonly #active = new Map<number, number>()
  #usedBytes = 0
  #nextId = 1

  constructor(budgetBytes: number = BACKUP_BUDGET_BYTES) {
    if (!isCharge(budgetBytes) || budgetBytes <= 0) throw new Error('invalid backup budget')
    this.#budgetBytes = budgetBytes
  }

  get usedBytes(): number {
    return this.#usedBytes
  }

  get budgetBytes(): number {
    return this.#budgetBytes
  }

  get activeReservations(): number {
    return this.#active.size
  }

  reserve(bytes: number): BackupReserveResult {
    if (!isCharge(bytes) || this.#usedBytes + bytes > this.#budgetBytes) return { status: 'resource-limit' }
    const reservation: BackupReservation = { id: this.#nextId, bytes }
    this.#nextId += 1
    this.#active.set(reservation.id, bytes)
    this.#usedBytes += bytes
    return { status: 'ok', reservation }
  }

  /** Idempotente e seguro após qualquer troca de fase; nunca deixa charge negativo. */
  release(reservation: BackupReservation): void {
    const bytes = this.#active.get(reservation.id)
    if (bytes === undefined) return
    this.#active.delete(reservation.id)
    this.#usedBytes -= bytes
  }

  /**
   * Troca uma reserva ativa por outra charge sem liberar antes: mantém o total correto e recusa
   * sem efeito quando a nova charge não cabe. Usada na transição leitura→parse→preparação.
   */
  replace(reservation: BackupReservation, bytes: number): BackupReserveResult {
    const current = this.#active.get(reservation.id)
    if (current === undefined) return { status: 'resource-limit' }
    if (!isCharge(bytes) || this.#usedBytes - current + bytes > this.#budgetBytes) {
      return { status: 'resource-limit' }
    }
    const next: BackupReservation = { id: this.#nextId, bytes }
    this.#nextId += 1
    this.#active.delete(reservation.id)
    this.#active.set(next.id, bytes)
    this.#usedBytes = this.#usedBytes - current + bytes
    return { status: 'ok', reservation: next }
  }
}
