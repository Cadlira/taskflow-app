import { describe, expect, it } from 'vitest'
import {
  TRASH_COMMAND_CHANNELS,
  TRASH_COMMAND_LIMITS,
  TRASH_ERROR_CODES,
  fitsTrashResponseBudget,
  parseClearUndoOfferRequest,
  parseDeleteTrashItemRequest,
  parseEmptyTrashRequest,
  parseMoveTaskToTrashRequest,
  parsePrepareTrashConfirmationRequest,
  parsePrepareTrashViewRequest,
  parseRestoreTrashItemRequest,
  parseUndoLastTaskActionRequest,
  trashFailure,
  trashMoveFailure,
} from '../../src/contracts/trash.js'
import {
  parseClearUndoOfferResult,
  parseDeleteTrashItemResult,
  parseEmptyTrashResult,
  parseMoveTaskToTrashResult,
  parsePrepareTrashConfirmationResult,
  parsePrepareTrashViewResult,
  parseRestoreTrashItemResult,
  parseUndoLastTaskActionResult,
} from '../../src/contracts/trash.js'

// Contrato fechado dos oito wrappers (move v2, demais v1): shapes exatos, versões, tokens, budgets e erros finitos.

const TOKEN = 'A'.repeat(32)
const ENTRY = { taskId: 'tarefa-1', contentRevision: '2', deletedAt: '2026-10-04T12:00:00.000Z' }

describe('contrato dos wrappers de lixeira/undo (move v2, demais v1)', () => {
  it('expõe exatamente oito canais versionados (move v2) e o orçamento 64 KiB/8 KiB', () => {
    expect(TRASH_COMMAND_CHANNELS).toHaveLength(8)
    expect(TRASH_COMMAND_CHANNELS).toEqual([
      'trash:clear-undo:v1',
      'trash:prepare-confirm:v1',
      'trash:move:v2',
      'trash:restore:v1',
      'trash:delete:v1',
      'trash:empty:v1',
      'trash:prepare-view:v1',
      'task:undo:v1',
    ])
    expect(TRASH_COMMAND_LIMITS).toEqual({ requestBytes: 64 * 1024, responseBytes: 8 * 1024 })
  })

  it('aceita os shapes exatos e recusa versão errada, chave extra, contexto inválido e Task livre', () => {
    expect(parseClearUndoOfferRequest({ version: 1, contextSequence: 1 })).toEqual({ version: 1, contextSequence: 1 })
    expect(parseClearUndoOfferRequest({ version: 1, contextSequence: 0 })).toBeNull()
    expect(parseClearUndoOfferRequest({ version: 1, contextSequence: 1.5 })).toBeNull()
    expect(parseClearUndoOfferRequest({ version: 2, contextSequence: 1 })).toBeNull()
    expect(parseClearUndoOfferRequest({ version: 1, contextSequence: 1, extra: true })).toBeNull()
    expect(parsePrepareTrashViewRequest({ version: 1, contextSequence: 1 })).toEqual({ version: 1, contextSequence: 1 })

    expect(
      parsePrepareTrashConfirmationRequest({ version: 1, contextSequence: 2, kind: 'MOVE', taskId: 'a', expectedContentRevision: '1' }),
    ).toEqual({ version: 1, contextSequence: 2, kind: 'MOVE', taskId: 'a', expectedContentRevision: '1' })
    expect(
      parsePrepareTrashConfirmationRequest({ version: 1, contextSequence: 2, kind: 'PERMANENT', entry: ENTRY }),
    ).toEqual({ version: 1, contextSequence: 2, kind: 'PERMANENT', entry: ENTRY })
    expect(parsePrepareTrashConfirmationRequest({ version: 1, contextSequence: 2, kind: 'EMPTY' })).toEqual({
      version: 1,
      contextSequence: 2,
      kind: 'EMPTY',
    })
    expect(
      parsePrepareTrashConfirmationRequest({ version: 1, contextSequence: 2, kind: 'EMPTY', taskId: 'a' }),
    ).toBeNull()
    expect(
      parsePrepareTrashConfirmationRequest({ version: 1, contextSequence: 2, kind: 'PERMANENT', entry: { ...ENTRY, task: {} } }),
    ).toBeNull()
    expect(
      parsePrepareTrashConfirmationRequest({ version: 1, contextSequence: 2, kind: 'PERMANENT', entry: { ...ENTRY, contentRevision: '01' } }),
    ).toBeNull()

    expect(parseMoveTaskToTrashRequest({ version: 2, contextSequence: 3, confirmationToken: TOKEN })).toEqual({
      version: 2,
      contextSequence: 3,
      confirmationToken: TOKEN,
    })
    expect(parseMoveTaskToTrashRequest({ version: 2, contextSequence: 3, confirmationToken: 'curto' })).toBeNull()
    // A v1 anterior do move (e qualquer alias) é recusada sem tocar no token.
    expect(parseMoveTaskToTrashRequest({ version: 1, contextSequence: 3, confirmationToken: TOKEN })).toBeNull()
    expect(parseRestoreTrashItemRequest({ version: 1, contextSequence: 3, entry: ENTRY })).toEqual({
      version: 1,
      contextSequence: 3,
      entry: ENTRY,
    })
    expect(parseRestoreTrashItemRequest({ version: 1, contextSequence: 3, entry: { ...ENTRY, task: {} } })).toBeNull()
    expect(parseDeleteTrashItemRequest({ version: 1, contextSequence: 3, confirmationToken: TOKEN })).not.toBeNull()
    expect(parseEmptyTrashRequest({ version: 1, contextSequence: 3, confirmationToken: TOKEN })).not.toBeNull()
    expect(parseUndoLastTaskActionRequest({ version: 1, contextSequence: 3, undoToken: TOKEN })).not.toBeNull()
    expect(
      parseUndoLastTaskActionRequest({ version: 1, contextSequence: 3, undoToken: TOKEN, beforeImage: {} }),
    ).toBeNull()
  })

  it('recusa request acima de 64 KiB e resposta acima de 8 KiB sem truncar', () => {
    const huge = { version: 1, contextSequence: 1, kind: 'PERMANENT', entry: { ...ENTRY, deletedAt: `2026-10-04T12:00:00.${'0'.repeat(70_000)}Z` } }
    expect(parsePrepareTrashConfirmationRequest(huge)).toBeNull()
    expect(fitsTrashResponseBudget({ version: 1, status: 'ok', confirmationToken: TOKEN, revision: '1', itemCount: 1 })).toBe(true)
    expect(
      fitsTrashResponseBudget({ version: 1, status: 'ok', confirmationToken: TOKEN, revision: '1', itemCount: 1, pad: 'x'.repeat(9000) }),
    ).toBe(false)
  })

  it('aceita as saídas exatas dos oito wrappers', () => {
    expect(parseClearUndoOfferResult({ version: 1, status: 'ok', contextSequence: 4 })).toEqual({
      version: 1,
      status: 'ok',
      contextSequence: 4,
    })
    expect(
      parsePrepareTrashConfirmationResult({ version: 1, status: 'ok', confirmationToken: TOKEN, revision: '2', itemCount: 3 }),
    ).toMatchObject({ status: 'ok', itemCount: 3 })
    expect(
      parsePrepareTrashConfirmationResult({
        version: 1,
        status: 'ok',
        confirmationToken: TOKEN,
        revision: '2',
        itemCount: 1,
        hasRecurrence: true,
      }),
    ).toMatchObject({ hasRecurrence: true })
    expect(
      parseMoveTaskToTrashResult({ version: 2, status: 'ok', revision: '3', retained: true, undoEpoch: 1, undoToken: TOKEN }),
    ).toMatchObject({ retained: true, undoEpoch: 1, undoToken: TOKEN })
    expect(parseMoveTaskToTrashResult({ version: 2, status: 'ok', revision: '3', retained: false, undoEpoch: 1 })).not.toBeNull()
    expect(
      parseRestoreTrashItemResult({ version: 1, status: 'ok', revision: '4', contentRevision: '4', editRevision: '4' }),
    ).not.toBeNull()
    expect(parseDeleteTrashItemResult({ version: 1, status: 'ok', revision: '5' })).not.toBeNull()
    expect(parseEmptyTrashResult({ version: 1, status: 'ok', revision: '6', removedCount: 2 })).not.toBeNull()
    expect(parsePrepareTrashViewResult({ version: 1, status: 'ok', revision: '7', purgedCount: 1 })).not.toBeNull()
    expect(
      parseUndoLastTaskActionResult({ version: 1, status: 'ok', revision: '8', contentRevision: '8', editRevision: '8' }),
    ).not.toBeNull()
  })

  it('recusa saídas malformadas e erros fora da união fechada', () => {
    expect(parseClearUndoOfferResult({ version: 1, status: 'ok' })).toBeNull()
    expect(parsePrepareTrashConfirmationResult({ version: 1, status: 'ok', confirmationToken: TOKEN, revision: '2' })).toBeNull()
    expect(
      parseMoveTaskToTrashResult({ version: 2, status: 'ok', revision: '3', retained: true, undoEpoch: 1, undoToken: 'curto' }),
    ).toBeNull()
    expect(parseMoveTaskToTrashResult({ version: 2, status: 'ok', revision: '3', retained: 'sim', undoEpoch: 1 })).toBeNull()
    // Ack v1 anterior e época ausente/inválida são recusados; falha da move exige v2.
    expect(parseMoveTaskToTrashResult({ version: 1, status: 'ok', revision: '3', retained: true, undoEpoch: 1 })).toBeNull()
    expect(parseMoveTaskToTrashResult({ version: 2, status: 'ok', revision: '3', retained: true })).toBeNull()
    expect(parseMoveTaskToTrashResult({ version: 2, status: 'ok', revision: '3', retained: true, undoEpoch: 0 })).toBeNull()
    expect(parseMoveTaskToTrashResult(trashMoveFailure('NOT_IN_TRASH'))).toEqual({ version: 2, status: 'error', code: 'NOT_IN_TRASH' })
    expect(parseMoveTaskToTrashResult(trashFailure('NOT_IN_TRASH'))).toBeNull()
    expect(parseEmptyTrashResult({ version: 1, status: 'ok', revision: '6', removedCount: -1 })).toBeNull()
    expect(parseUndoLastTaskActionResult({ version: 1, status: 'ok', revision: '8', contentRevision: '8' })).toBeNull()
    for (const code of TRASH_ERROR_CODES) {
      expect(parseDeleteTrashItemResult(trashFailure(code))).toMatchObject({ version: 1, status: 'error', code })
    }
    expect(parseDeleteTrashItemResult({ version: 1, status: 'error', code: 'SQLITE_BUSY' })).toBeNull()
    expect(parseDeleteTrashItemResult({ version: 1, status: 'error', code: 'NOT_IN_TRASH', stack: 'x' })).toBeNull()
    expect(parseDeleteTrashItemResult({ version: 2, status: 'error', code: 'NOT_IN_TRASH' })).toBeNull()
  })
})
