import { describe, expect, it } from 'vitest'
import {
  TRASH_CAPACITY,
  TRASH_RETENTION_MS,
  compareTrashEntries,
  isTrashExpired,
  planTrashInsertion,
  sameTrashComposition,
  sameTrashEntryKey,
  type TrashEntryKey,
} from '../../src/domain/task-trash.js'

// Dados fictícios; nenhum clock global é alterado.

const NOW = new Date('2026-10-04T12:00:00.000Z')

function atDaysAgo(days: number, offsetMs = 0): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 + offsetMs).toISOString()
}

function entry(taskId: string, deletedAt: string, contentRevision = 1n): TrashEntryKey & { label: string } {
  return { taskId, deletedAt, contentRevision, label: taskId }
}

describe('política de retenção da lixeira (L01)', () => {
  it('mantém 29 dias, exatamente 30 dias e datas futuras; vence 30d+1ms e 31d', () => {
    expect(isTrashExpired(atDaysAgo(29), NOW)).toBe(false)
    expect(isTrashExpired(atDaysAgo(30), NOW)).toBe(false)
    expect(isTrashExpired(atDaysAgo(30, -1), NOW)).toBe(true)
    expect(isTrashExpired(atDaysAgo(31), NOW)).toBe(true)
    expect(isTrashExpired(new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe(false)
  })

  it('usa 30×24h decorridos, sem converter para dias civis nem mudar timestamps', () => {
    // 30 dias decorridos atravessando uma transição DST continuam sendo o mesmo limite em ms.
    expect(TRASH_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000)
    const crossing = new Date(Date.UTC(2026, 2, 1, 12, 0, 0)).toISOString()
    const nowAfterDst = new Date(Date.parse(crossing) + TRASH_RETENTION_MS - 1)
    expect(isTrashExpired(crossing, nowAfterDst)).toBe(false)
    const pastLimit = new Date(Date.parse(crossing) + TRASH_RETENTION_MS + 1)
    expect(isTrashExpired(crossing, pastLimit)).toBe(true)
  })
})

describe('ordem, empates e composição (L01/L05)', () => {
  it('ordena por deletedAt decrescente, revisão decrescente e ID UTF-16 sem locale', () => {
    const older = entry('b', atDaysAgo(2), 9n)
    const newer = entry('a', atDaysAgo(1), 1n)
    expect(compareTrashEntries(newer, older)).toBeLessThan(0)

    const tieHigh = entry('a', atDaysAgo(1), 5n)
    const tieLow = entry('b', atDaysAgo(1), 2n)
    expect(compareTrashEntries(tieHigh, tieLow)).toBeLessThan(0)

    // UTF-16: 'Z' (90) vem antes de 'a' (97); localeCompare diria o contrário.
    const upper = entry('Z', atDaysAgo(1), 1n)
    const lower = entry('a', atDaysAgo(1), 1n)
    expect(compareTrashEntries(upper, lower)).toBeLessThan(0)
  })

  it('compara composição completa por identidade, não só por IDs', () => {
    const original = [entry('a', atDaysAgo(1), 1n), entry('b', atDaysAgo(2), 2n)]
    const sameOtherOrder = [entry('b', atDaysAgo(2), 2n), entry('a', atDaysAgo(1), 1n)]
    expect(sameTrashComposition(original, sameOtherOrder)).toBe(true)
    expect(sameTrashComposition(original, [entry('a', atDaysAgo(1), 9n), entry('b', atDaysAgo(2), 2n)])).toBe(false)
    expect(sameTrashComposition(original, [entry('a', atDaysAgo(1), 1n)])).toBe(false)
  })

  it('identidade exata usa taskId/contentRevision/deletedAt, sem normalizar deletedAt', () => {
    expect(sameTrashEntryKey(entry('a', atDaysAgo(1), 1n), entry('a', atDaysAgo(1), 1n))).toBe(true)
    expect(sameTrashEntryKey(entry('a', atDaysAgo(1), 1n), entry('a', atDaysAgo(1), 2n))).toBe(false)
    expect(sameTrashEntryKey(entry('a', atDaysAgo(1), 1n), entry('a', atDaysAgo(2), 1n))).toBe(false)
  })
})

describe('planejamento puro do move (L01/L02)', () => {
  it('filtra vencidos, substitui o mesmo ID, insere e corta em 100 sem mutar a entrada', () => {
    const existing: Array<TrashEntryKey & { label: string }> = []
    for (let index = 0; index < 101; index += 1) {
      existing.push(entry(`tarefa-${String(index).padStart(3, '0')}`, atDaysAgo(1, index)))
    }
    const expired = entry('vencida', atDaysAgo(31))
    const before = [...existing]
    // A mesma tarefa volta à lixeira: a versão anterior (mesmo ID) é substituída pela nova.
    const inserted = entry('tarefa-000', atDaysAgo(0))

    const plan = planTrashInsertion([...existing, expired], inserted, NOW)

    expect(plan.kept).toHaveLength(TRASH_CAPACITY)
    expect(plan.kept[0]).toBe(inserted)
    expect(plan.kept.some((item) => item.taskId === 'vencida')).toBe(false)
    expect(plan.kept.filter((item) => item.taskId === 'tarefa-000')).toEqual([inserted])
    expect(plan.discardedTaskIds).toContain('vencida')
    expect(plan.discardedTaskIds).not.toContain('tarefa-000')
    expect(plan.retained).toBe(true)
    expect(existing).toEqual(before)
  })

  it('relógio recuado com 100 entradas futuras descarta a própria exclusão e informa retained:false', () => {
    const future: Array<TrashEntryKey & { label: string }> = []
    for (let index = 0; index < TRASH_CAPACITY; index += 1) {
      future.push(entry(`futura-${String(index).padStart(3, '0')}`, new Date(NOW.getTime() + 60_000 + index).toISOString()))
    }
    const inserted = entry('recem-excluida', NOW.toISOString())
    const plan = planTrashInsertion(future, inserted, NOW)

    expect(plan.retained).toBe(false)
    expect(plan.kept).toHaveLength(TRASH_CAPACITY)
    expect(plan.kept.some((item) => item.taskId === 'recem-excluida')).toBe(false)
    expect(plan.discardedTaskIds).not.toContain('recem-excluida')
    expect(plan.discardedTaskIds).toHaveLength(0)
  })

  it('no limite exato de 100, a entrada nova é retida', () => {
    const existing: Array<TrashEntryKey & { label: string }> = []
    for (let index = 0; index < TRASH_CAPACITY - 1; index += 1) {
      existing.push(entry(`tarefa-${index}`, atDaysAgo(1, index + 1)))
    }
    const inserted = entry('nova', NOW.toISOString())
    const plan = planTrashInsertion(existing, inserted, NOW)
    expect(plan.kept).toHaveLength(TRASH_CAPACITY)
    expect(plan.retained).toBe(true)
  })
})
