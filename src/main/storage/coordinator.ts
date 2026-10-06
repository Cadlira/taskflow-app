import type { Revision } from '../../application/storage/revisions.js'
import { nextRevision } from '../../application/storage/revisions.js'
import { createTaskStorageUnit } from '../../application/storage/task-storage-unit.js'
import {
  StorageFailure,
  storageFailureReasonOf,
  type StorageFailureReason,
} from '../../application/storage/task-storage-error.js'
import type {
  StorageRowPort,
  TaskStorageReader,
  TaskStorageUnit,
  UnitResult,
} from '../../application/storage/unit-of-work.js'
import type {
  OpenProductDatabaseResult,
  ProductDatabase,
  StorageFaultPoint,
  StorageFaults,
  StorageRuntimeInfo,
} from './product-database.js'
import { classifyStorageError, requiresReopen, sqliteResultCode } from './sqlite-errors.js'

export const QUEUE_LIMITS = {
  /** Entradas aguardando na fila, no total. */
  total: 64,
  /** Entradas aguardando por sessão. */
  perOwner: 8,
  /** Espera máxima antes de iniciar; depois disso a entrada é recusada sem efeito. */
  waitMs: 2_000,
} as const

export type StorageAvailability =
  | { state: 'ready' }
  | { state: 'blocked'; reason: StorageFailureReason }
  | { state: 'closed' }

export interface UnitCompletion {
  /** Resultado final da unidade (sucesso, no-op ou recusa/rollback). */
  result: UnitResult<unknown>
  /** `true` quando um commit de alteração foi confirmado. */
  committed: boolean
  /** Revisão confirmada; `undefined` quando não houve commit. */
  revision: Revision | undefined
}

export interface UnitOptions {
  /** Sessão dona da entrada; limita a admissão por sessão e permite cancelamento. */
  owner?: string
  /** Reavaliada imediatamente antes da execução; `false` impede qualquer acesso aos dados. */
  admit?: () => boolean
  /**
   * Conclusão síncrona, somente leitura/in-memory, executada depois do término da unidade e ANTES
   * da publicação/da próxima entrada. Não pode reenfileirar unidade, aguardar filesystem nem
   * escrever SQL; lançar mantém o commit (se houve), bloqueia a admissão e não publica evento.
   */
  onCompleted?: (completion: UnitCompletion) => void
}

export interface CoordinatorOptions {
  /** Abre (com preflight) o banco de produto. Chamada na partida e após resultado incerto. */
  open: () => OpenProductDatabaseResult
  faults?: StorageFaults
  limits?: { total: number; perOwner: number; waitMs: number }
  now?: () => number
  /** Agenda o próximo item da fila; por padrão um macrotask, para o event loop respirar. */
  schedule?: (callback: () => void) => void
  /** Diagnóstico restrito a fase e razão: nunca recebe caminho, SQL, ID ou payload. */
  onDiagnostic?: (event: { phase: string; reason: StorageFailureReason }) => void
}

export interface CoordinatorMetrics {
  units: number
  /** Maior bloqueio síncrono de uma unidade, em milissegundos. */
  maxUnitMs: number
  lastUnitMs: number
}

export interface ShutdownReport {
  drained: number
  cancelled: number
  drainMs: number
}

interface QueueEntry {
  owner: string | undefined
  admit: (() => boolean) | undefined
  onCompleted: ((completion: UnitCompletion) => void) | undefined
  afterReleased: ((result: UnitResult<unknown>) => void) | undefined
  enqueuedAt: number
  execute: () => UnitResult<unknown>
  resolve: (result: UnitResult<unknown>) => void
}

const RETRYABLE_BLOCKS: readonly StorageFailureReason[] = ['UNAVAILABLE', 'UNCERTAIN', 'LOCKED']

function isThenable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

function unitFailureReason(error: unknown): StorageFailureReason {
  const reason = storageFailureReasonOf(error)
  if (reason !== undefined) return reason
  return sqliteResultCode(error) === undefined ? 'INVALID_UNIT' : classifyStorageError(error)
}

/**
 * Único coordenador do banco de produto: uma conexão e uma fila no main. Toda leitura e toda
 * mutação de qualquer produtor passa por aqui; a unidade lê, decide, valida e confirma sobre
 * o estado atual. Eventos só saem depois do commit confirmado e fora da transação.
 *
 * `DatabaseSync` é síncrono: os limites de fila e espera valem antes de iniciar; não há
 * timeout capaz de interromper um COMMIT em andamento.
 */
export class StorageCoordinator {
  readonly #open: () => OpenProductDatabaseResult
  readonly #faults: StorageFaults | undefined
  readonly #limits: { total: number; perOwner: number; waitMs: number }
  readonly #now: () => number
  readonly #schedule: (callback: () => void) => void
  readonly #onDiagnostic: ((event: { phase: string; reason: StorageFailureReason }) => void) | undefined
  readonly #queue: QueueEntry[] = []
  readonly #committedListeners = new Set<(revision: Revision) => void>()
  readonly #unavailableListeners = new Set<(reason: StorageFailureReason) => void>()
  readonly #measureListeners = new Set<(milliseconds: number) => void>()
  readonly #taskChangeListeners = new Set<(ids: readonly string[], reminder: boolean) => void>()
  readonly #recoveredListeners = new Set<() => void>()
  readonly #metrics: CoordinatorMetrics = { units: 0, maxUnitMs: 0, lastUnitMs: 0 }
  #database: ProductDatabase | undefined
  #availability: StorageAvailability = { state: 'blocked', reason: 'UNAVAILABLE' }
  #runtime: StorageRuntimeInfo | undefined
  #confirmedRevision: Revision | undefined
  #committedToPublish: Revision | undefined
  #changedTaskIds: readonly string[] = []
  #executing = false
  #releasing = false
  #pumpScheduled = false
  #closing = false

  constructor(options: CoordinatorOptions) {
    this.#open = options.open
    this.#faults = options.faults
    this.#limits = options.limits ?? QUEUE_LIMITS
    this.#now = options.now ?? (() => performance.now())
    this.#schedule = options.schedule ?? ((callback) => void setImmediate(callback))
    this.#onDiagnostic = options.onDiagnostic
  }

  get availability(): StorageAvailability {
    return this.#availability
  }

  get runtime(): StorageRuntimeInfo | undefined {
    return this.#runtime
  }

  /** Última revisão global confirmada conhecida pelo coordenador. */
  get confirmedRevision(): Revision | undefined {
    return this.#confirmedRevision
  }

  get metrics(): CoordinatorMetrics {
    return { ...this.#metrics }
  }

  get pending(): number {
    return this.#queue.length
  }

  /** Abre o banco de produto. Só deve ser chamado pelo processo dono do perfil. */
  start(): StorageAvailability {
    if (this.#closing) return this.#availability
    this.#openDatabase('start')
    return this.#availability
  }

  onCommitted(listener: (revision: Revision) => void): () => void {
    this.#committedListeners.add(listener)
    return () => this.#committedListeners.delete(listener)
  }

  onUnavailable(listener: (reason: StorageFailureReason) => void): () => void {
    this.#unavailableListeners.add(listener)
    return () => this.#unavailableListeners.delete(listener)
  }

  /** Medição do bloqueio síncrono de cada unidade (somente duração; usada pelo benchmark). */
  onUnitMeasured(listener: (milliseconds: number) => void): () => void {
    this.#measureListeners.add(listener)
    return () => this.#measureListeners.delete(listener)
  }

  /** Invalidação interna pós-confirmação; somente IDs/memória, sem SQL/efeito externo. */
  onTasksChanged(listener: (ids: readonly string[], reminder: boolean) => void): () => void {
    this.#taskChangeListeners.add(listener)
    return () => this.#taskChangeListeners.delete(listener)
  }
  onRecovered(listener: () => void): () => void {
    this.#recoveredListeners.add(listener)
    return () => this.#recoveredListeners.delete(listener)
  }

  /** Unidade de escrita: `BEGIN IMMEDIATE`, read/decide/validate/commit. O callback é síncrono. */
  run<T>(unit: (unit: TaskStorageUnit) => T, options: UnitOptions = {}): Promise<UnitResult<T>> {
    return this.#enqueue(options, () => this.#executeWrite(unit))
  }

  /**
   * Fronteira exclusiva da operação main de reminders. O efeito é síncrono, após #execute
   * retornar, fora de SQL/onCompleted e antes de resolver/agendar outra entrada. Sem leitura
   * reentrante, await ou filesystem. Falha externa nunca transforma commit em rollback.
   */
  runReminder<T>(
    unit: (unit: TaskStorageUnit) => T,
    options: UnitOptions,
    afterReleased: (result: UnitResult<T>) => void,
  ): Promise<UnitResult<T>> {
    return this.#enqueue(options, () => this.#executeWrite(unit), afterReleased)
  }

  /** Unidade de leitura coordenada: nunca grava, expurga ou altera revisões. */
  read<T>(reader: (reader: TaskStorageReader) => T, options: UnitOptions = {}): Promise<UnitResult<T>> {
    return this.#enqueue(options, () => this.#executeRead(reader))
  }

  /** Cancela as entradas ainda não iniciadas de uma sessão invalidada. */
  cancelOwner(owner: string): number {
    return this.#cancel((entry) => entry.owner === owner, 'SESSION_CLOSED')
  }

  /**
   * Encerramento: fecha a admissão, cancela entradas de sessão ainda não iniciadas, drena as
   * unidades internas já admitidas e só então fecha a conexão. Não força saída durante commit.
   */
  shutdown(): ShutdownReport {
    const started = this.#now()
    this.#closing = true
    const cancelled = this.#cancel((entry) => entry.owner !== undefined, 'CLOSED')

    let drained = 0
    for (let entry = this.#queue.shift(); entry !== undefined; entry = this.#queue.shift()) {
      this.#release(entry)
      drained += 1
    }

    this.#closeDatabase()
    this.#availability = { state: 'closed' }
    return { drained, cancelled, drainMs: this.#now() - started }
  }

  #cancel(match: (entry: QueueEntry) => boolean, reason: StorageFailureReason): number {
    let cancelled = 0
    for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
      const entry = this.#queue[index]
      if (entry !== undefined && match(entry)) {
        this.#queue.splice(index, 1)
        entry.resolve({ ok: false, reason })
        cancelled += 1
      }
    }
    return cancelled
  }

  #enqueue<T>(options: UnitOptions, execute: () => UnitResult<T>, afterReleased?: (result: UnitResult<T>) => void): Promise<UnitResult<T>> {
    // Recusas de admissão acontecem antes de qualquer efeito.
    if (this.#closing) return Promise.resolve({ ok: false, reason: 'CLOSED' })
    // Uma unidade não reenfileira nem aninha outra: receberia um estado que ainda não existe.
    if (this.#executing || this.#releasing) return Promise.resolve({ ok: false, reason: 'INVALID_UNIT' })
    if (this.#queue.length >= this.#limits.total) return Promise.resolve({ ok: false, reason: 'QUEUE_FULL' })
    if (
      options.owner !== undefined &&
      this.#queue.filter((entry) => entry.owner === options.owner).length >= this.#limits.perOwner
    ) {
      return Promise.resolve({ ok: false, reason: 'QUEUE_FULL' })
    }

    return new Promise((resolve) => {
      this.#queue.push({
        owner: options.owner,
        admit: options.admit,
        onCompleted: options.onCompleted,
        afterReleased: afterReleased as ((result: UnitResult<unknown>) => void) | undefined,
        enqueuedAt: this.#now(),
        execute,
        resolve: resolve as (result: UnitResult<unknown>) => void,
      })
      this.#schedulePump()
    })
  }

  #schedulePump(): void {
    if (this.#pumpScheduled || this.#closing) return
    this.#pumpScheduled = true
    this.#schedule(() => {
      this.#pumpScheduled = false
      const entry = this.#queue.shift()
      if (entry === undefined) return
      this.#release(entry)
      if (this.#queue.length > 0) this.#schedulePump()
    })
  }

  #release(entry: QueueEntry): void {
    const result = this.#execute(entry)
    // Listeners de publicação podem agendar leituras para macrotask futuro; a barreira
    // não recusa essa ressincronização existente, apenas reentrância do efeito externo.
    this.#releasing = true
    try {
      if (entry.afterReleased !== undefined) {
        try {
          const returned: unknown = entry.afterReleased(result)
          if (isThenable(returned)) throw new StorageFailure('INVALID_UNIT')
        } catch {
          // Marker/commit e disponibilidade permanecem. Nenhuma segunda solicitação.
          this.#onDiagnostic?.({ phase: 'reminder-submit', reason: 'UNAVAILABLE' })
        }
      }
    } finally {
      this.#releasing = false
    }
    entry.resolve(result)
  }

  #execute(entry: QueueEntry): UnitResult<unknown> {
    if (this.#now() - entry.enqueuedAt > this.#limits.waitMs) return { ok: false, reason: 'WAIT_TIMEOUT' }
    // Sessão expirada na fila não chega a tocar os dados.
    if (entry.admit !== undefined && !entry.admit()) return { ok: false, reason: 'SESSION_CLOSED' }

    const blocked = this.#ensureOpen()
    if (blocked !== undefined) return { ok: false, reason: blocked }

    const started = this.#now()
    this.#executing = true
    let result: UnitResult<unknown>
    try {
      result = entry.execute()
    } finally {
      this.#executing = false
      const elapsed = this.#now() - started
      this.#metrics.units += 1
      this.#metrics.lastUnitMs = elapsed
      if (elapsed > this.#metrics.maxUnitMs) this.#metrics.maxUnitMs = elapsed
      for (const listener of [...this.#measureListeners]) listener(elapsed)
    }

    const committed = this.#committedToPublish
    this.#committedToPublish = undefined
    const changedIds = this.#changedTaskIds
    this.#changedTaskIds = []

    // Conclusão serializada: roda antes de publicar e antes da próxima entrada. Falha na própria
    // conclusão não reverte um commit confirmado, mas impede publicar e bloqueia a admissão.
    if (entry.onCompleted !== undefined) {
      try {
        entry.onCompleted({ result, committed: committed !== undefined, revision: committed })
      } catch {
        this.#invalidate('conclusion', 'UNCERTAIN')
        return result
      }
    }

    if (committed !== undefined) {
      for (const listener of this.#taskChangeListeners) {
        try { listener(changedIds, entry.afterReleased !== undefined) } catch {
          // Projeção descartável: sua falha não reverte commit nem disponibilidade SQL.
        }
      }
      try {
        this.#fault('unit:before-publish')
      } catch {
        // O commit já está confirmado; falha posterior não o reverte nem muda o resultado.
      }
      this.#publish(committed)
    }
    return result
  }

  #fault(point: StorageFaultPoint): void {
    this.#faults?.at?.(point)
  }

  #executeWrite<T>(callback: (unit: TaskStorageUnit) => T): UnitResult<T> {
    const database = this.#database
    if (database === undefined) return { ok: false, reason: 'UNAVAILABLE' }

    try {
      this.#fault('unit:before-begin')
      database.beginImmediate()
    } catch (error) {
      // Nada foi iniciado: lock além da espera é recusa segura e a fila segue disponível.
      const reason = classifyStorageError(error)
      if (reason !== 'LOCKED') this.#invalidate('begin', 'UNCERTAIN')
      return { ok: false, reason }
    }

    let base: Revision
    let revision: Revision | undefined
    let value: T
    const active = { expire: (): void => undefined }
    const changedIds = new Set<string>()

    try {
      base = database.readGlobalRevision()
      const port: StorageRowPort = {
        baseRevision: base,
        readRow: (collection, id) => database.readRow(collection, id),
        listRows: (collection) => database.listRows(collection),
        iterateRows: (collection, afterId) => database.iterateRows(collection, afterId),
        writeRow: (collection, row) => {
          database.writeRow(collection, row)
          if (collection === 'tasks') changedIds.add(row.id)
        },
        deleteRow: (collection, id) => {
          database.deleteRow(collection, id)
          if (collection === 'tasks') changedIds.add(id)
        },
        allocateRevision: () => {
          revision ??= nextRevision(base)
          return revision
        },
      }
      const created = createTaskStorageUnit(port)
      active.expire = created.expire

      value = callback(created.unit)
      if (isThenable(value)) throw new StorageFailure('INVALID_UNIT')
      if (revision !== undefined) {
        this.#fault('unit:in-transaction')
        database.writeGlobalRevision(revision)
      }
      this.#fault('unit:before-commit')
    } catch (error) {
      active.expire()
      const reason = unitFailureReason(error)
      const reported = this.#rollback(database, reason) ?? reason
      // Rollback confirmado, mas a causa é do ambiente: a próxima unidade reabre e valida.
      if (reported === 'UNAVAILABLE' && requiresReopen(error)) this.#invalidate('unit', 'UNAVAILABLE')
      return { ok: false, reason: reported }
    }

    active.expire()

    if (revision === undefined) {
      // No-op ou recusa: nada a confirmar, nenhuma revisão nova, nenhum evento.
      const rolledBack = this.#rollback(database, undefined)
      return rolledBack === undefined ? { ok: true, value, committed: false, revision: base } : { ok: false, reason: rolledBack }
    }

    try {
      this.#fault('unit:commit')
      database.commit()
    } catch (error) {
      if (classifyStorageError(error) === 'LOCKED' && database.inTransaction) {
        const rolledBack = this.#rollback(database, 'LOCKED')
        return { ok: false, reason: rolledBack ?? 'LOCKED' }
      }
      // Confirmação incerta: a conexão não é mais confiável até reopen validado.
      this.#invalidate('commit', 'UNCERTAIN')
      return { ok: false, reason: 'UNCERTAIN' }
    }

    this.#confirmedRevision = revision
    try {
      this.#fault('unit:after-commit')
    } catch {
      // O commit já está confirmado; nada depois dele o reverte.
    }
    // A publicação acontece depois que a unidade termina, fora da transação.
    this.#committedToPublish = revision
    this.#changedTaskIds = [...changedIds]
    return { ok: true, value, committed: true, revision }
  }

  #executeRead<T>(callback: (reader: TaskStorageReader) => T): UnitResult<T> {
    const database = this.#database
    if (database === undefined) return { ok: false, reason: 'UNAVAILABLE' }

    try {
      database.beginRead()
    } catch (error) {
      const reason = classifyStorageError(error)
      if (reason !== 'LOCKED') this.#invalidate('begin-read', 'UNCERTAIN')
      return { ok: false, reason }
    }

    const active = { expire: (): void => undefined }
    try {
      const base = database.readGlobalRevision()
      const refuseWrite = (): never => {
        throw new StorageFailure('INVALID_UNIT')
      }
      const created = createTaskStorageUnit({
        baseRevision: base,
        readRow: (collection, id) => database.readRow(collection, id),
        listRows: (collection) => database.listRows(collection),
        iterateRows: (collection, afterId) => database.iterateRows(collection, afterId),
        writeRow: refuseWrite,
        deleteRow: refuseWrite,
        allocateRevision: refuseWrite,
      })
      active.expire = created.expire

      const value = callback(created.unit)
      if (isThenable(value)) throw new StorageFailure('INVALID_UNIT')
      active.expire()

      const rolledBack = this.#rollback(database, undefined)
      return rolledBack === undefined ? { ok: true, value, committed: false, revision: base } : { ok: false, reason: rolledBack }
    } catch (error) {
      active.expire()
      const reason = unitFailureReason(error)
      return { ok: false, reason: this.#rollback(database, reason) ?? reason }
    }
  }

  /**
   * Encerra a transação sem confirmar. Devolve a razão a reportar: a original quando o
   * rollback é confirmado; `UNCERTAIN` (com a conexão invalidada) quando ele falha.
   */
  #rollback(database: ProductDatabase, reason: StorageFailureReason | undefined): StorageFailureReason | undefined {
    try {
      this.#fault('unit:rollback')
      // Alguns erros do motor (ex.: SQLITE_FULL) já revertem a transação sozinhos.
      if (database.inTransaction) database.rollback()
    } catch {
      this.#invalidate('rollback', 'UNCERTAIN')
      return 'UNCERTAIN'
    }

    if (reason === 'INCOMPATIBLE_DATA' || reason === 'CORRUPTED_DATA') {
      // Dado que deixou de ser válido bloqueia o estado de produto; nada é descartado.
      this.#invalidate('validate', reason)
    } else if (reason !== undefined) {
      this.#onDiagnostic?.({ phase: 'unit', reason })
    }
    return reason
  }

  #publish(revision: Revision): void {
    for (const listener of [...this.#committedListeners]) {
      try {
        listener(revision)
      } catch {
        // Falha de efeito posterior ao commit não reverte nem altera o resultado da unidade.
      }
    }
  }

  #invalidate(phase: string, reason: StorageFailureReason): void {
    this.#onDiagnostic?.({ phase, reason })
    this.#closeDatabase()
    this.#availability = { state: 'blocked', reason }
    for (const listener of [...this.#unavailableListeners]) {
      try {
        listener(reason)
      } catch {
        // Notificação de indisponibilidade é melhor esforço.
      }
    }
  }

  #closeDatabase(): void {
    const database = this.#database
    this.#database = undefined
    try {
      database?.close()
    } catch {
      // A conexão já foi descartada; o próximo acesso reabre e valida.
    }
  }

  /** Devolve a razão do bloqueio, ou `undefined` quando o banco está pronto. */
  #ensureOpen(): StorageFailureReason | undefined {
    if (this.#availability.state === 'ready') return undefined
    if (this.#availability.state === 'closed') return 'CLOSED'
    // Incompatibilidade e corrupção não se resolvem reabrindo; indisponibilidade pode ter passado.
    if (!RETRYABLE_BLOCKS.includes(this.#availability.reason)) return this.#availability.reason
    this.#openDatabase('reopen')
    const reopened = this.availability
    return reopened.state === 'ready' ? undefined : reopened.state === 'blocked' ? reopened.reason : 'CLOSED'
  }

  #openDatabase(phase: string): void {
    let result: OpenProductDatabaseResult
    try {
      result = this.#open()
    } catch (error) {
      result = { ok: false, reason: classifyStorageError(error) }
    }

    if (!result.ok) {
      this.#availability = { state: 'blocked', reason: result.reason }
      this.#onDiagnostic?.({ phase, reason: result.reason })
      return
    }

    try {
      this.#confirmedRevision = result.database.readGlobalRevision()
    } catch (error) {
      try {
        result.database.close()
      } catch {
        // Sem efeito: a abertura já foi recusada.
      }
      this.#availability = { state: 'blocked', reason: classifyStorageError(error) }
      return
    }

    this.#database = result.database
    this.#runtime = result.database.runtime
    this.#availability = { state: 'ready' }

    // Depois de um reopen, um commit cuja resposta se perdeu aparece na revisão confirmada:
    // os inscritos são invalidados para ressincronizar por snapshot, sem replay de escrita.
    if (phase === 'reopen') {
      for (const listener of this.#recoveredListeners) {
        try { listener() } catch { /* Projeção externa não altera abertura confirmada. */ }
      }
      this.#publish(this.#confirmedRevision)
    }
  }
}
