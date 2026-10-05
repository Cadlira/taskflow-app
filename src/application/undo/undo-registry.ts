import type { Revision } from '../storage/revisions.js'
import type { TrashEntryRef } from '../storage/unit-of-work.js'
import type { UndoFacts } from '../tasks/undo-types.js'
import { StorageFailure } from '../storage/task-storage-error.js'
import { utf8ByteLength } from '../../contracts/text.js'

// Registro temporário de recibos/confirmações do main: uma oferta publicada e uma confirmação
// corrente por documento, contexto monotônico, slot de ação único e orçamento lógico global.
// Nada é persistido: fechar/reload/crash perde recibos intencionalmente.

/** Orçamento lógico global de recibos + confirmações + candidatos (D9). */
export const UNDO_BUDGET_BYTES = 64 * 1024 * 1024

/** Margem do envelope de confirmação, além dos bytes das referências. */
const CONFIRMATION_ENVELOPE_BYTES = 512
/** Margem por entrada de base EMPTY. */
const CONFIRMATION_ENTRY_BYTES = 128

export type ConfirmationBase =
  | { kind: 'MOVE'; taskId: string; expectedContentRevision: Revision }
  | { kind: 'PERMANENT'; entry: TrashEntryRef }
  | { kind: 'EMPTY'; entries: TrashEntryRef[] }

export type ConfirmationKind = ConfirmationBase['kind']

export interface UndoOffer {
  token: string
  payload: UndoFacts
}

export interface UndoReservation {
  readonly id: number
  readonly bytes: number
}

export type ContextResult = { status: 'ok' } | { status: 'STALE_CONTEXT' }

/** Barreira transitória de invalidação: sempre positiva e sem revisão SQL associada. */
export type UndoInvalidationReason = 'BACKUP_RESTORED' | 'STORAGE_RECOVERED'

export interface UndoInvalidationEvent {
  epoch: number
  reason: UndoInvalidationReason
}

export type ReserveResult =
  | { status: 'ok'; reservation: UndoReservation }
  | { status: 'busy' }
  | { status: 'resource-limit' }

export interface UndoRegistryOptions {
  budgetBytes?: number
  /** Token opaco gerado pelo main (base64url); nunca derivado de dados da tarefa. */
  randomToken: () => string
  /** Charge determinístico do recibo; injetável para os testes de orçamento. */
  chargeBytes?: (payload: UndoFacts) => number
  /** Época inicial; usada somente por testes de esgotamento/overflow da época. */
  initialEpoch?: number
}

interface ActiveReservation {
  bytes: number
  /** Contexto vigente quando a reserva foi feita. */
  documentKey: string
  sequence: number
  epoch: number
}

interface DocumentSlot {
  sequence: number
  offer?: { token: string; payload: UndoFacts; bytes: number }
  confirmation?: { token: string; base: ConfirmationBase; bytes: number }
  candidate?: { id: number; bytes: number }
}

/** Bytes do JSON canônico com revisões `bigint` convertidas para decimal (sem perder tamanho). */
function jsonBytesWithBigInt(value: unknown): number {
  const json = JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString(10) : item))
  return typeof json === 'string' ? utf8ByteLength(json) : 0
}

function defaultChargeBytes(payload: UndoFacts): number {
  if (payload.kind === 'DELETE') return 256
  // Clone conservador do before-image + envelope/margem (D9).
  return 2 * jsonBytesWithBigInt(payload.beforeImage) + 4096
}

export function confirmationChargeBytes(base: ConfirmationBase): number {
  const entries = base.kind === 'EMPTY' ? base.entries.length : 1
  return jsonBytesWithBigInt(base) + CONFIRMATION_ENVELOPE_BYTES + entries * CONFIRMATION_ENTRY_BYTES
}

export class UndoRegistry {
  readonly #budgetBytes: number
  readonly #randomToken: () => string
  readonly #chargeBytes: (payload: UndoFacts) => number
  readonly #documents = new Map<string, DocumentSlot>()
  readonly #reservations = new Map<number, ActiveReservation>()
  readonly #invalidatedListeners = new Set<(event: UndoInvalidationEvent) => void>()
  readonly #contextListeners = new Set<(documentKey: string, sequence: number) => void>()
  #usedBytes = 0
  #nextReservationId = 1
  #epoch = 1

  constructor(options: UndoRegistryOptions) {
    this.#budgetBytes = options.budgetBytes ?? UNDO_BUDGET_BYTES
    this.#randomToken = options.randomToken
    this.#chargeBytes = options.chargeBytes ?? defaultChargeBytes
    if (options.initialEpoch !== undefined) {
      if (!Number.isSafeInteger(options.initialEpoch) || options.initialEpoch < 1) {
        throw new Error('invalid initial epoch')
      }
      this.#epoch = options.initialEpoch
    }
  }

  get usedBytes(): number {
    return this.#usedBytes
  }

  get budgetBytes(): number {
    return this.#budgetBytes
  }

  get epoch(): number {
    return this.#epoch
  }

  get activeReservations(): number {
    return this.#reservations.size
  }

  get openOffers(): number {
    return [...this.#documents.values()].filter((slot) => slot.offer !== undefined).length
  }

  get openConfirmations(): number {
    return [...this.#documents.values()].filter((slot) => slot.confirmation !== undefined).length
  }

  /** Contexto corrente do documento (`0` quando nenhum foi estabelecido). */
  contextSequence(documentKey: string): number {
    return this.#documents.get(documentKey)?.sequence ?? 0
  }

  /** Sequência maior estabelece contexto e invalida oferta/confirmação; igual é clear idempotente. */
  clear(documentKey: string, sequence: number): ContextResult {
    if (!Number.isSafeInteger(sequence) || sequence < 1) return { status: 'STALE_CONTEXT' }

    const slot = this.#documents.get(documentKey)
    if (slot !== undefined && sequence < slot.sequence) return { status: 'STALE_CONTEXT' }

    const target = slot ?? { sequence: 0 }
    this.#documents.set(documentKey, { sequence })
    this.#clearTransient(target)
    for (const listener of [...this.#contextListeners]) {
      try {
        listener(documentKey, sequence)
      } catch {
        // O contexto já mudou; falha de consumidor não o reverte.
      }
    }
    return { status: 'ok' }
  }

  #clearTransient(slot: DocumentSlot): void {
    if (slot.offer !== undefined) this.#usedBytes -= slot.offer.bytes
    if (slot.confirmation !== undefined) this.#usedBytes -= slot.confirmation.bytes
    delete slot.offer
    delete slot.confirmation
    delete slot.candidate
  }

  /**
   * Reserva um candidato de recibo antes da escrita. Recusa quando já existe candidato pendente
   * no documento ou quando o charge não cabe no orçamento global. O charge é mantido até a
   * referência ser liberada, mesmo que o contexto seja invalidado no meio.
   */
  reserve(documentKey: string, sequence: number, payload: UndoFacts): ReserveResult {
    const slot = this.#documents.get(documentKey)
    if (slot === undefined || slot.sequence !== sequence) return { status: 'busy' }
    if (slot.candidate !== undefined) return { status: 'busy' }

    const bytes = this.#chargeBytes(payload)
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.#usedBytes + bytes > this.#budgetBytes) {
      return { status: 'resource-limit' }
    }

    const reservation: UndoReservation = { id: this.#nextReservationId, bytes }
    this.#nextReservationId += 1
    this.#reservations.set(reservation.id, { bytes, documentKey, sequence, epoch: this.#epoch })
    slot.candidate = { id: reservation.id, bytes }
    this.#usedBytes += bytes
    return { status: 'ok', reservation }
  }

  /** Libera uma reserva; idempotente e seguro após invalidação/consumo. */
  release(reservation: UndoReservation): void {
    const active = this.#reservations.get(reservation.id)
    if (active === undefined) return
    this.#reservations.delete(reservation.id)
    this.#usedBytes -= active.bytes
    const slot = this.#documents.get(active.documentKey)
    if (slot?.candidate?.id === reservation.id) delete slot.candidate
  }

  /**
   * Publica o recibo reservado somente se a época, o documento e o contexto ainda forem os
   * mesmos. Devolve o token opaco quando publicado; `undefined` quando uma troca de
   * contexto/backup invalidou a publicação tardia (a reserva precisa ser liberada pelo chamador).
   */
  publish(reservation: UndoReservation, payload: UndoFacts): string | undefined {
    const active = this.#reservations.get(reservation.id)
    if (active === undefined || active.epoch !== this.#epoch) return undefined

    const slot = this.#documents.get(active.documentKey)
    if (slot === undefined || slot.sequence !== active.sequence || slot.candidate?.id !== reservation.id) {
      return undefined
    }

    this.#reservations.delete(reservation.id)
    delete slot.candidate
    // O charge sai da reserva e permanece contabilizado pela oferta publicada.
    const token = this.#randomToken()
    slot.offer = { token, payload, bytes: active.bytes }
    return token
  }

  /** Oferta mais recente do documento (somente leitura, para testes/diagnóstico). */
  offerOf(documentKey: string): UndoOffer | undefined {
    const offer = this.#documents.get(documentKey)?.offer
    return offer === undefined ? undefined : { token: offer.token, payload: offer.payload }
  }

  /** Consome a oferta própria uma vez; token ausente/repetido/alheio devolve `undefined`. */
  consumeOffer(documentKey: string, sequence: number, token: string): UndoFacts | undefined {
    const slot = this.#documents.get(documentKey)
    if (slot === undefined || slot.sequence !== sequence || slot.offer === undefined) return undefined
    if (slot.offer.token !== token) return undefined
    const payload = slot.offer.payload
    this.#usedBytes -= slot.offer.bytes
    delete slot.offer
    return payload
  }

  /** Registra a confirmação corrente do documento (uma por vez; a anterior é substituída). */
  setConfirmation(documentKey: string, sequence: number, base: ConfirmationBase): { token: string } | undefined {
    const slot = this.#documents.get(documentKey)
    if (slot === undefined || slot.sequence !== sequence) return undefined

    const bytes = confirmationChargeBytes(base)
    const previousBytes = slot.confirmation?.bytes ?? 0
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.#usedBytes - previousBytes + bytes > this.#budgetBytes) {
      // Base grande falha antes de publicar token, sem listas parciais.
      return undefined
    }

    if (slot.confirmation !== undefined) this.#usedBytes -= slot.confirmation.bytes
    const token = this.#randomToken()
    slot.confirmation = { token, base, bytes }
    this.#usedBytes += bytes
    return { token }
  }

  /** Consome a confirmação uma vez; token errado/alheio não a consome. */
  consumeConfirmation(documentKey: string, token: string): ConfirmationBase | undefined {
    const slot = this.#documents.get(documentKey)
    if (slot?.confirmation === undefined || slot.confirmation.token !== token) return undefined
    const base = slot.confirmation.base
    this.#usedBytes -= slot.confirmation.bytes
    delete slot.confirmation
    return base
  }

  /**
   * Porta interna de sucesso de backup/recuperação: invalida recibos/confirmações/publicações de
   * TODAS as sessões por época monotônica, sem alterar revisão SQL. Cancelamento/falha confirmada
   * não chama esta porta. A reserva da próxima época é conferida antes do efeito: no limite
   * seguro a operação falha sem wrap, sem reiniciar e sem limpar estado parcialmente.
   */
  invalidateAll(reason: UndoInvalidationReason = 'BACKUP_RESTORED'): number {
    if (this.#epoch >= Number.MAX_SAFE_INTEGER) throw new StorageFailure('REVISION_EXHAUSTED')
    this.#epoch += 1
    for (const slot of this.#documents.values()) this.#clearTransient(slot)
    // Reservas em execução continuam contabilizadas até serem liberadas pelo próprio fluxo.
    const event: UndoInvalidationEvent = { epoch: this.#epoch, reason }
    for (const listener of [...this.#invalidatedListeners]) {
      try {
        listener(event)
      } catch {
        // A invalidação já aconteceu; falha de consumidor não a reverte.
      }
    }
    return this.#epoch
  }

  /** Observa as barreiras de invalidação (época/reason) na mesma ordem síncrona da conclusão. */
  onInvalidated(listener: (event: UndoInvalidationEvent) => void): () => void {
    this.#invalidatedListeners.add(listener)
    return () => this.#invalidatedListeners.delete(listener)
  }

  /** Observa a mudança de contexto por documento (para liberar preparações de backup obsoletas). */
  onContextEstablished(listener: (documentKey: string, sequence: number) => void): () => void {
    this.#contextListeners.add(listener)
    return () => this.#contextListeners.delete(listener)
  }

  /** Sessão encerrada/navegada: libera o estado transitório do documento. */
  forgetDocument(documentKey: string): void {
    const slot = this.#documents.get(documentKey)
    if (slot !== undefined) this.#clearTransient(slot)
    this.#documents.delete(documentKey)
    for (const [id, reservation] of [...this.#reservations]) {
      if (reservation.documentKey !== documentKey) continue
      this.#reservations.delete(id)
      this.#usedBytes -= reservation.bytes
    }
  }
}
