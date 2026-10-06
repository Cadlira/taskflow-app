import { describe, expect, it, vi } from 'vitest'
import { buildCreateTask, planTaskUpdate } from '../../src/domain/task-draft.js'
import { resolveReminderDrafts, type TaskReminderDraft } from '../../src/domain/reminder-draft.js'
import { canDeliverReminder, classifyReminderOccurrence, REMINDER_PRESETS } from '../../src/domain/task-reminders.js'
import { buildTask } from '../support/task-fixtures.js'

const DUE = '2026-10-06T15:00:00.123Z'
const NOW = new Date('2026-10-06T12:00:00.000Z')
const context = () => ({ dueAt: DUE, recurring: false, now: NOW, mode: 'create' as const, generateId: vi.fn(() => 'new') })

describe('M01 reminder drafts: regras revisadas e autoridade do main', () => {
  it('presets conservam minutos exatos e permitem offsets fora da lista', () => {
    expect(REMINDER_PRESETS).toEqual([0, 15, 60, 1440])
    for (const offsetMinutes of [...REMINDER_PRESETS, 37]) {
      const result = resolveReminderDrafts([{ type: 'OFFSET', offsetMinutes }], [], {
        ...context(), now: new Date('2026-10-01T12:00:00Z'),
      })
      expect(result).toEqual({ ok: true, reminders: [{ id: 'new', type: 'OFFSET', offsetMinutes }] })
    }
  })
  it('aceita 0 e 10, recusa 11 sem alocar IDs ou retornar lista parcial', () => {
    let ordinal = 0
    const generateId = vi.fn(() => `r${ordinal++}`)
    const drafts = Array.from({ length: 10 }, (_, offsetMinutes): TaskReminderDraft => ({ type: 'OFFSET', offsetMinutes }))
    expect(resolveReminderDrafts([], [], context())).toEqual({ ok: true, reminders: [] })
    expect(resolveReminderDrafts(drafts, [], { ...context(), generateId }).ok).toBe(true)
    expect(generateId).toHaveBeenCalledTimes(10)
    generateId.mockClear()
    expect(resolveReminderDrafts([...drafts, { type: 'OFFSET', offsetMinutes: 11 }], [], { ...context(), generateId }))
      .toEqual({ ok: false, kind: 'validation', errors: { list: 'TOO_MANY' } })
    expect(generateId).not.toHaveBeenCalled()
  })
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity])('recusa OFFSET inválido %s', (offsetMinutes) => {
    expect(resolveReminderDrafts([{ type: 'OFFSET', offsetMinutes }], [], context()))
      .toEqual({ ok: false, kind: 'validation', errors: { items: [{ index: 0, code: 'INVALID_VALUE' }] } })
  })
  it('recusa trigger impossível, AT>due, instantes repetidos entre tipos, prazo ausente e AT recorrente', () => {
    expect(resolveReminderDrafts([{ type: 'OFFSET', offsetMinutes: Number.MAX_SAFE_INTEGER }], [], context()))
      .toMatchObject({ errors: { items: [{ code: 'OUT_OF_RANGE' }] } })
    expect(resolveReminderDrafts([{ type: 'AT', at: '2026-10-07T00:00:00Z' }], [], context()))
      .toMatchObject({ errors: { items: [{ code: 'AFTER_DUE' }] } })
    expect(resolveReminderDrafts([{ type: 'AT', at: DUE }, { type: 'OFFSET', offsetMinutes: 0 }], [], context()))
      .toMatchObject({ errors: { items: [{ index: 1, code: 'DUPLICATE_INSTANT' }] } })
    expect(resolveReminderDrafts([{ type: 'AT', at: DUE }], [], { ...context(), dueAt: undefined }))
      .toMatchObject({ errors: { list: 'DUE_REQUIRED' } })
    expect(resolveReminderDrafts([{ type: 'AT', at: DUE }], [], { ...context(), recurring: true }))
      .toMatchObject({ errors: { items: [{ code: 'ABSOLUTE_REMINDER_INCOMPATIBLE' }] } })
  })
  it('configuração nova/alterada <= clock da execução falha; intacta vencida conserva precisão e marker atual', () => {
    const existing = [{ id: 'r', type: 'AT' as const, at: DUE, processedFor: DUE }]
    const late = { ...context(), mode: 'edit' as const, now: new Date('2026-10-06T16:00:00Z') }
    expect(resolveReminderDrafts([{ id: 'r', type: 'AT', at: DUE }], existing, late))
      .toEqual({ ok: true, reminders: existing })
    expect(resolveReminderDrafts([{ id: 'r', type: 'AT', at: '2026-10-06T14:00:00Z' }], existing, late))
      .toMatchObject({ errors: { items: [{ code: 'ELAPSED' }] } })
    expect(resolveReminderDrafts([{ type: 'AT', at: DUE }], existing, { ...late, now: new Date(DUE) }))
      .toMatchObject({ errors: { items: [{ code: 'ELAPSED' }] } })
  })
  it('IDs de criação/estranhos/repetidos recusam; novos têm até três tentativas e não reutilizam removidos', () => {
    const old = [{ id: 'r', type: 'OFFSET' as const, offsetMinutes: 0 }]
    const edit = { ...context(), mode: 'edit' as const }
    expect(resolveReminderDrafts([{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }], [], context()))
      .toMatchObject({ errors: { items: [{ code: 'INVALID_VALUE' }] } })
    expect(resolveReminderDrafts([{ id: 'unknown', type: 'OFFSET', offsetMinutes: 0 }], old, edit))
      .toMatchObject({ errors: { items: [{ code: 'UNKNOWN_ID' }] } })
    expect(resolveReminderDrafts([
      { id: 'r', type: 'OFFSET', offsetMinutes: 0 }, { id: 'r', type: 'OFFSET', offsetMinutes: 1 },
    ], old, edit)).toMatchObject({ errors: { items: [{ code: 'DUPLICATE_ID' }] } })
    const collision = vi.fn(() => 'r')
    expect(resolveReminderDrafts([{ type: 'OFFSET', offsetMinutes: 0 }], old, { ...edit, generateId: collision }))
      .toEqual({ ok: false, kind: 'identity' })
    expect(collision).toHaveBeenCalledTimes(3)
  })
  it('criação e patch conservam ISO e marker depois da base; omissão conserva e [] limpa', () => {
    const current = buildTask({ dueAt: DUE, reminders: [{ id: 'r', type: 'AT', at: DUE, processedFor: DUE }] })
    const update = { now: NOW, generateId: () => 'new' }
    expect(planTaskUpdate(current, {}, update)).toEqual({ ok: true, next: undefined })
    const edited = planTaskUpdate(current, { title: 'Editada' }, update)
    expect(edited).toMatchObject({ next: { dueAt: DUE, reminders: current.reminders } })
    expect(planTaskUpdate(current, { reminders: [] }, update)).toMatchObject({ next: { reminders: [] } })
    expect(buildCreateTask({ title: 'Nova', dueAt: DUE, reminders: [{ type: 'AT', at: DUE }] }, { ...update, id: 'task' }))
      .toMatchObject({ task: { reminders: [{ id: 'new', type: 'AT', at: DUE }] } })
  })
})

describe('M02 recuperação difere do settlement das mutações', () => {
  const task = buildTask({ dueAt: DUE, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }] })
  const key = { taskId: task.id, reminderId: 'r', triggerISO: DUE }
  it.each([[-1, 'FUTURE'], [0, 'ELIGIBLE'], [300000, 'ELIGIBLE'], [300001, 'EXPIRED']] as const)(
    'fronteira %dms = %s', (delta, expected) => {
      const now = new Date(Date.parse(DUE) + delta)
      expect(classifyReminderOccurrence(task, key, now)).toBe(expected)
      expect(canDeliverReminder(DUE, now)).toBe(expected === 'ELIGIBLE')
    },
  )
  it('não aceita tupla alterada por 1ms, futura terminal, ausente ou marker já processado', () => {
    expect(classifyReminderOccurrence(task, { ...key, triggerISO: '2026-10-06T15:00:00.124Z' }, new Date(DUE))).toBe('INAPPLICABLE')
    expect(classifyReminderOccurrence(undefined, key, new Date(DUE))).toBe('INAPPLICABLE')
    expect(classifyReminderOccurrence({ ...task, status: 'CANCELLED' }, key, new Date(Date.parse(DUE) - 1))).toBe('INAPPLICABLE')
    expect(classifyReminderOccurrence({ ...task, status: 'CANCELLED' }, key, new Date(DUE))).toBe('EXPIRED')
    expect(classifyReminderOccurrence({ ...task, reminders: [{ ...task.reminders[0]!, processedFor: DUE }] }, key, new Date(DUE)))
      .toBe('INAPPLICABLE')
    const result = planTaskUpdate(task, { title: 'Alterada' }, { now: new Date(DUE), generateId: () => 'new' })
    expect(result).toMatchObject({ next: { reminders: [{ processedFor: DUE }] } })
  })
})
