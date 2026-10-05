import { describe, expect, it } from 'vitest'
import {
  UNDO_BUDGET_BYTES,
  UndoRegistry,
  confirmationChargeBytes,
} from '../../src/application/undo/undo-registry.js'
import type { UndoFacts } from '../../src/application/tasks/undo-types.js'
import { buildTask } from '../support/task-fixtures.js'

// Registro temporário de recibos: contexto monotônico, slot único, tokens de uso único e
// orçamento lógico global (L06/L12). Nenhum estado persiste.

function tokenFactory(): () => string {
  let index = 0
  return () => `token-opaco-${String((index += 1)).padStart(10, '0')}`
}

function revertFacts(id = 'a', titleLength = 10): UndoFacts {
  return {
    kind: 'REVERT',
    target: { id, expectedContentRevision: 2n },
    beforeImage: buildTask({ id, title: 'x'.repeat(titleLength) }),
  }
}

const deleteFacts: UndoFacts = {
  kind: 'DELETE',
  entry: { taskId: 'a', contentRevision: 2n, deletedAt: '2026-10-04T12:00:00.000Z' },
}

const moveBase = { kind: 'MOVE' as const, taskId: 'a', expectedContentRevision: 1n }

describe('UndoRegistry: contexto monotônico e slot único', () => {
  it('sequência maior estabelece contexto e limpa oferta/confirmação; igual é idempotente; menor é stale', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    expect(registry.clear('doc', 1)).toEqual({ status: 'ok' })
    expect(registry.contextSequence('doc')).toBe(1)

    const reservation = registry.reserve('doc', 1, deleteFacts)
    expect(reservation.status).toBe('ok')
    if (reservation.status !== 'ok') return
    expect(registry.publish(reservation.reservation, deleteFacts)).toBeTypeOf('string')
    expect(registry.offerOf('doc')).toBeDefined()
    expect(registry.setConfirmation('doc', 1, moveBase)).toBeDefined()

    // Sequência maior troca o contexto e invalida os transitórios próprios.
    expect(registry.clear('doc', 2)).toEqual({ status: 'ok' })
    expect(registry.offerOf('doc')).toBeUndefined()
    expect(registry.openConfirmations).toBe(0)

    // Igual é clear idempotente; menor é recusado sem efeito.
    expect(registry.clear('doc', 2)).toEqual({ status: 'ok' })
    expect(registry.clear('doc', 1)).toEqual({ status: 'STALE_CONTEXT' })
    expect(registry.contextSequence('doc')).toBe(2)
  })

  it('publicação tardia depois de troca de contexto não ressuscita oferta e libera o charge', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const reservation = registry.reserve('doc', 1, revertFacts())
    if (reservation.status !== 'ok') throw new Error('reserva esperada')
    const bytes = registry.usedBytes

    registry.clear('doc', 2)
    expect(registry.publish(reservation.reservation, revertFacts())).toBeUndefined()
    expect(registry.offerOf('doc')).toBeUndefined()
    // A reserva continua contabilizada até ser liberada pelo fluxo que a criou.
    expect(registry.usedBytes).toBe(bytes)
    registry.release(reservation.reservation)
    expect(registry.usedBytes).toBe(0)
  })

  it('uma reserva de candidato por documento: segundo candidato concorrente recebe busy', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const first = registry.reserve('doc', 1, deleteFacts)
    expect(first.status).toBe('ok')
    expect(registry.reserve('doc', 1, deleteFacts)).toEqual({ status: 'busy' })
    expect(registry.reserve('other', 1, deleteFacts)).toEqual({ status: 'busy' })
  })
})

describe('UndoRegistry: tokens consumidos uma vez', () => {
  it('oferta própria é consumida no primeiro uso; repetida/alheia não autoriza', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const reservation = registry.reserve('doc', 1, deleteFacts)
    if (reservation.status !== 'ok') throw new Error('reserva esperada')
    const token = registry.publish(reservation.reservation, deleteFacts)
    if (token === undefined) throw new Error('token esperado')

    expect(registry.consumeOffer('doc', 1, 'token-opaco-9999999999')).toBeUndefined()
    expect(registry.consumeOffer('doc', 2, token)).toBeUndefined()
    expect(registry.consumeOffer('doc', 1, token)).toEqual(deleteFacts)
    expect(registry.consumeOffer('doc', 1, token)).toBeUndefined()
    expect(registry.offerOf('doc')).toBeUndefined()
    expect(registry.usedBytes).toBe(0)
  })

  it('confirmação é consumida uma vez; token errado não consome a legítima', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const confirmation = registry.setConfirmation('doc', 1, moveBase)
    if (confirmation === undefined) throw new Error('confirmação esperada')

    expect(registry.consumeConfirmation('doc', 'token-opaco-9999999999')).toBeUndefined()
    expect(registry.consumeConfirmation('doc', confirmation.token)).toEqual(moveBase)
    expect(registry.consumeConfirmation('doc', confirmation.token)).toBeUndefined()
    expect(registry.usedBytes).toBe(0)
  })
})

describe('UndoRegistry: orçamento global de 64 MiB', () => {
  it('falta de recurso recusa antes de publicar token, sem listas parciais', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory(), budgetBytes: 8 * 1024 })
    registry.clear('doc', 1)
    const small = registry.reserve('doc', 1, deleteFacts)
    expect(small.status).toBe('ok')
    if (small.status === 'ok') registry.release(small.reservation)

    // Base EMPTY grande: charge excede o orçamento restante e a confirmação é recusada.
    const entries = Array.from({ length: 100 }, (_unused, index) => ({
      taskId: `tarefa-${index}`,
      contentRevision: 1n,
      deletedAt: '2026-10-04T12:00:00.000Z',
    }))
    const base = { kind: 'EMPTY' as const, entries }
    expect(confirmationChargeBytes(base)).toBeGreaterThan(8 * 1024)
    expect(registry.setConfirmation('doc', 1, base)).toBeUndefined()
    expect(registry.openConfirmations).toBe(0)
    expect(registry.usedBytes).toBe(0)
  })

  it('reserva de before-image grande falha por RESOURCE_LIMIT antes de qualquer escrita', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory(), budgetBytes: 4096 })
    registry.clear('doc', 1)
    // charge = 2 * bytes + 4096; qualquer before-image não vazio excede o orçamento de 4 KiB.
    expect(registry.reserve('doc', 1, revertFacts('a', 32))).toEqual({ status: 'resource-limit' })
    expect(registry.usedBytes).toBe(0)
    expect(registry.activeReservations).toBe(0)
  })

  it('charge é determinístico e proporcional ao before-image; orçamento padrão é 64 MiB', () => {
    expect(UNDO_BUDGET_BYTES).toBe(64 * 1024 * 1024)
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const small = registry.reserve('doc', 1, revertFacts('a', 10))
    const large = registry.reserve('doc', 1, revertFacts('a', 10))
    // Segunda reserva é busy (slot único); comparação de charge usa liberações.
    expect(large.status).toBe('busy')
    if (small.status !== 'ok') throw new Error('reserva esperada')
    expect(small.reservation.bytes).toBeGreaterThan(4096)
    registry.release(small.reservation)
  })
})

describe('UndoRegistry: invalidação por backup e limpeza de sessão', () => {
  it('invalidateAll cerca candidatos antigos e não muda contexto/charge de reservas em execução', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const reservation = registry.reserve('doc', 1, revertFacts())
    if (reservation.status !== 'ok') throw new Error('reserva esperada')
    const bytes = registry.usedBytes

    registry.invalidateAll()
    expect(registry.epoch).toBe(2)
    expect(registry.publish(reservation.reservation, revertFacts())).toBeUndefined()
    expect(registry.offerOf('doc')).toBeUndefined()
    expect(registry.contextSequence('doc')).toBe(1)
    // O candidato em execução continua contabilizado até liberar.
    expect(registry.usedBytes).toBe(bytes)
    registry.release(reservation.reservation)
    expect(registry.usedBytes).toBe(0)
  })

  it('invalidateAll limpa ofertas/confirmações de todas as sessões; UNCHANGED também invalida', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    for (const doc of ['a', 'b']) {
      registry.clear(doc, 1)
      const reservation = registry.reserve(doc, 1, deleteFacts)
      if (reservation.status !== 'ok') throw new Error('reserva esperada')
      registry.publish(reservation.reservation, deleteFacts)
      registry.setConfirmation(doc, 1, moveBase)
    }
    expect(registry.openOffers).toBe(2)
    expect(registry.openConfirmations).toBe(2)

    registry.invalidateAll()
    expect(registry.openOffers).toBe(0)
    expect(registry.openConfirmations).toBe(0)
    expect(registry.usedBytes).toBe(0)
  })

  it('oito sessões com ciclos de ação/limpeza não vazam charge nem referências', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    for (let round = 0; round < 20; round += 1) {
      for (let doc = 0; doc < 8; doc += 1) {
        const key = `doc-${doc}`
        const sequence = registry.contextSequence(key) + 1
        registry.clear(key, sequence)
        const reservation = registry.reserve(key, sequence, deleteFacts)
        if (reservation.status !== 'ok') throw new Error('reserva esperada')
        const token = registry.publish(reservation.reservation, deleteFacts)
        if (token === undefined) throw new Error('token esperado')
        expect(registry.consumeOffer(key, sequence, token)).toEqual(deleteFacts)
      }
    }
    expect(registry.usedBytes).toBe(0)
    expect(registry.activeReservations).toBe(0)
    expect(registry.openOffers).toBe(0)
  })

  it('sessão encerrada libera estado transitório e reservas do documento', () => {
    const registry = new UndoRegistry({ randomToken: tokenFactory() })
    registry.clear('doc', 1)
    const reservation = registry.reserve('doc', 1, revertFacts())
    if (reservation.status !== 'ok') throw new Error('reserva esperada')
    registry.setConfirmation('doc', 1, moveBase)

    registry.forgetDocument('doc')
    expect(registry.contextSequence('doc')).toBe(0)
    expect(registry.openConfirmations).toBe(0)
    expect(registry.usedBytes).toBe(0)
    expect(registry.publish(reservation.reservation, revertFacts())).toBeUndefined()
  })
})
