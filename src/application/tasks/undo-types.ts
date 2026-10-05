import type { Task } from '../../domain/task.js'
import type { Revision } from '../storage/revisions.js'
import type { TrashEntryRef } from '../storage/unit-of-work.js'

// Fatos internos de undo produzidos DENTRO da unidade, a partir da leitura atual. Nunca
// atravessam o IPC: o renderer só recebe o token opaco emitido pelo main.

/** Reversão de edição/status/fechamento: before-image realmente relida e revisões produzidas. */
export interface RevertUndoFacts {
  kind: 'REVERT'
  target: { id: string; expectedContentRevision: Revision }
  beforeImage: Task
  generated?: { id: string; expectedContentRevision: Revision }
}

/** Exclusão retida: somente a referência da nova entrada; o payload fica na lixeira. */
export interface DeleteUndoFacts {
  kind: 'DELETE'
  entry: TrashEntryRef
}

export type UndoFacts = RevertUndoFacts | DeleteUndoFacts

/** Reserva lógica já contabilizada no orçamento global (referência opaca do main). */
export interface ReservedUndo {
  id: number
  bytes: number
}

/**
 * Porta de reserva usada DENTRO da unidade: reserva antes da primeira escrita e libera quando a
 * ação não publica recibo. O main liga esta porta ao registro de recibos; o núcleo não conhece
 * armazenamento nem IPC.
 */
export interface UndoReservationPort {
  reserve(facts: UndoFacts): ReservedUndo | undefined
  release(reserved: ReservedUndo): void
}

