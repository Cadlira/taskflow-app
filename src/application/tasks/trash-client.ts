import {
  TRASH_CLEAR_UNDO_OFFER_CHANNEL,
  TRASH_DELETE_CHANNEL,
  TRASH_EMPTY_CHANNEL,
  TRASH_MOVE_CHANNEL,
  TRASH_PREPARE_CONFIRMATION_CHANNEL,
  TRASH_PREPARE_VIEW_CHANNEL,
  TRASH_RESTORE_CHANNEL,
  TRASH_UNDO_CHANNEL,
  parseClearUndoOfferRequest,
  parseClearUndoOfferResult,
  parseDeleteTrashItemRequest,
  parseDeleteTrashItemResult,
  parseEmptyTrashRequest,
  parseEmptyTrashResult,
  parseMoveTaskToTrashRequest,
  parseMoveTaskToTrashResult,
  parsePrepareTrashConfirmationRequest,
  parsePrepareTrashConfirmationResult,
  parsePrepareTrashViewRequest,
  parsePrepareTrashViewResult,
  parseRestoreTrashItemRequest,
  parseRestoreTrashItemResult,
  parseUndoLastTaskActionRequest,
  parseUndoLastTaskActionResult,
  trashFailure,
  type ClearUndoOfferResult,
  type DeleteTrashItemResult,
  type EmptyTrashResult,
  type MoveTaskToTrashResult,
  type PrepareTrashConfirmationResult,
  type PrepareTrashViewResult,
  type RestoreTrashItemResult,
  type UndoLastTaskActionResult,
} from '../../contracts/trash.js'

/** Transporte fechado: o preload só deixa passar os oito canais deste catálogo. */
export interface TrashCommandTransport {
  invoke(channel: string, request: unknown): Promise<unknown>
}

/**
 * Falha local de transporte/saída inválida: a ação pode ter sido confirmada no banco, então quem
 * chamou precisa tratar como **resultado incerto** (ressincronizar antes de decidir), sem receber
 * envelope de erro inventado pelo main e sem repetir automaticamente.
 */
export class TrashCommandTransportError extends Error {
  constructor() {
    super('trash-command-transport')
    this.name = 'TrashCommandTransportError'
  }
}

export interface TrashCommandClient {
  clearUndoOffer(request: unknown): Promise<ClearUndoOfferResult>
  prepareTrashConfirmation(request: unknown): Promise<PrepareTrashConfirmationResult>
  moveTaskToTrash(request: unknown): Promise<MoveTaskToTrashResult>
  restoreTrashItem(request: unknown): Promise<RestoreTrashItemResult>
  deleteTrashItem(request: unknown): Promise<DeleteTrashItemResult>
  emptyTrash(request: unknown): Promise<EmptyTrashResult>
  prepareTrashView(request: unknown): Promise<PrepareTrashViewResult>
  undoLastTaskAction(request: unknown): Promise<UndoLastTaskActionResult>
}

async function invokeStrict(transport: TrashCommandTransport, channel: string, request: unknown): Promise<unknown> {
  try {
    return await transport.invoke(channel, request)
  } catch {
    throw new TrashCommandTransportError()
  }
}

/**
 * Lado do documento dos oito wrappers v1: valida o request antes de enviar e a resposta antes de
 * devolver. Request inválido nem chega ao main; saída malformada vira falha local de transporte.
 */
export function createTrashCommandClient(transport: TrashCommandTransport): TrashCommandClient {
  return {
    async clearUndoOffer(request: unknown): Promise<ClearUndoOfferResult> {
      const parsed = parseClearUndoOfferRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parseClearUndoOfferResult(await invokeStrict(transport, TRASH_CLEAR_UNDO_OFFER_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async prepareTrashConfirmation(request: unknown): Promise<PrepareTrashConfirmationResult> {
      const parsed = parsePrepareTrashConfirmationRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parsePrepareTrashConfirmationResult(
        await invokeStrict(transport, TRASH_PREPARE_CONFIRMATION_CHANNEL, parsed),
      )
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async moveTaskToTrash(request: unknown): Promise<MoveTaskToTrashResult> {
      const parsed = parseMoveTaskToTrashRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parseMoveTaskToTrashResult(await invokeStrict(transport, TRASH_MOVE_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async restoreTrashItem(request: unknown): Promise<RestoreTrashItemResult> {
      const parsed = parseRestoreTrashItemRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parseRestoreTrashItemResult(await invokeStrict(transport, TRASH_RESTORE_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async deleteTrashItem(request: unknown): Promise<DeleteTrashItemResult> {
      const parsed = parseDeleteTrashItemRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parseDeleteTrashItemResult(await invokeStrict(transport, TRASH_DELETE_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async emptyTrash(request: unknown): Promise<EmptyTrashResult> {
      const parsed = parseEmptyTrashRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parseEmptyTrashResult(await invokeStrict(transport, TRASH_EMPTY_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async prepareTrashView(request: unknown): Promise<PrepareTrashViewResult> {
      const parsed = parsePrepareTrashViewRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parsePrepareTrashViewResult(await invokeStrict(transport, TRASH_PREPARE_VIEW_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },

    async undoLastTaskAction(request: unknown): Promise<UndoLastTaskActionResult> {
      const parsed = parseUndoLastTaskActionRequest(request)
      if (parsed === null) return trashFailure('INVALID_REQUEST')
      const response = parseUndoLastTaskActionResult(await invokeStrict(transport, TRASH_UNDO_CHANNEL, parsed))
      if (response === null) throw new TrashCommandTransportError()
      return response
    },
  }
}
