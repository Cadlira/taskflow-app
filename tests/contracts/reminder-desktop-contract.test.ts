import { describe, expect, it } from 'vitest'
import { parseTaskCreateRequest, parseTaskCreateResult, parseTaskUpdateRequest, parseTaskUpdateResult, parseSubtaskDoneResult, parseTaskMutationResult } from '../../src/contracts/tasks.js'
import { parseDesktopRequest, parseStartupRequest, parseActivationRequest, parseDesktopEvent, parseDesktopStatusResult } from '../../src/contracts/desktop.js'

describe('M01/M11 versões/reminder drafts/desktop fechados', () => {
  it('create4/update5 aceitam só intenções sem clock/marker ou IDs novos de cliente', () => {
    const draft = { title: 'Tarefa', dueAt: '2026-10-07T12:00:00.000Z', reminders: [{ type: 'OFFSET', offsetMinutes: 37 }, { type: 'AT', at: '2026-10-07T11:00:00.123Z' }] }
    expect(parseTaskCreateRequest({ version: 4, contextSequence: 1, draft }).kind).toBe('ok')
    expect(parseTaskCreateRequest({ version: 3, contextSequence: 1, draft }).kind).toBe('invalid-request')
    for (const reminder of [{ type: 'OFFSET', offsetMinutes: 0, id: 'forged' }, { type: 'OFFSET', offsetMinutes: 0, processedFor: 'x' }, { type: 'OFFSET', offsetMinutes: 0, at: 'x' }]) {
      expect(parseTaskCreateRequest({ version: 4, contextSequence: 1, draft: { ...draft, reminders: [reminder] } }).kind).toBe('invalid-request')
    }
    const request = { version: 5, contextSequence: 1, taskId: 'histórico😀', expectedEditRevision: '1', patch: { reminders: [{ id: 'old', type: 'OFFSET', offsetMinutes: 1 }] } }
    expect(parseTaskUpdateRequest(request).kind).toBe('ok')
    expect(parseTaskUpdateRequest({ ...request, version: 4 }).kind).toBe('invalid-request')
    expect(parseTaskUpdateRequest({ ...request, patch: { reminders: null } }).kind).toBe('invalid-request')
    expect(parseTaskUpdateRequest({ ...request, patch: { reminders: [] } }).kind).toBe('ok')
    expect(parseTaskUpdateRequest({ ...request, patch: {}, now: 'clock' }).kind).toBe('invalid-request')
  })
  it('falhas/acks de operações mantêm versões distintas e erro de lembrete só índices0–9/códigos finitos', () => {
    const failure = { version: 5, status: 'error', code: 'VALIDATION_FAILED', fields: { reminders: { items: [{ index: 9, code: 'ELAPSED' }] } } }
    expect(parseTaskUpdateResult(failure)).toEqual(failure)
    expect(parseTaskUpdateResult({ ...failure, version: 4 })).toBeNull()
    expect(parseTaskUpdateResult({ ...failure, fields: { reminders: { items: [{ index: 10, code: 'ELAPSED' }] } } })).toBeNull()
    expect(parseTaskUpdateResult({ ...failure, fields: { reminders: { items: [{ index: 0, code: 'raw-secret' }] } } })).toBeNull()
    expect(parseTaskCreateResult({ version: 4, status: 'error', code: 'BUSY' })).not.toBeNull()
    expect(parseTaskCreateResult({ version: 3, status: 'error', code: 'BUSY' })).toBeNull()
    expect(parseSubtaskDoneResult({ version: 3, status: 'error', code: 'BUSY' })).not.toBeNull()
    expect(parseTaskMutationResult({ version: 4, status: 'error', code: 'BUSY' })).not.toBeNull()
  })
  it('wrappers desktopv1/eventos1KiB recusam extras/opções nativas/versão/seq/tag inválidos', () => {
    expect(parseDesktopRequest({ version: 1 })).toEqual({ version: 1 })
    expect(parseDesktopRequest({ version: 1, path: 'C:\\' })).toBeNull()
    expect(parseStartupRequest({ version: 1, desired: false })).toEqual({ version: 1, desired: false })
    expect(parseStartupRequest({ version: 1, desired: 'false' })).toBeNull()
    expect(parseActivationRequest({ version: 1, tag: 'a'.repeat(64) })).not.toBeNull()
    expect(parseActivationRequest({ version: 1, tag: 'A'.repeat(64) })).toBeNull()
    expect(parseDesktopEvent({ version: 1, sequence: 1, kind: 'surface-active' })).not.toBeNull()
    expect(parseDesktopEvent({ version: 1, sequence: 0, kind: 'surface-active' })).toBeNull()
    expect(parseDesktopEvent({ version: 1, sequence: 1, kind: 'surface-active', tag: 'a'.repeat(64) })).toBeNull()
    expect(parseDesktopStatusResult({ version: 1, status: 'error', code: 'NATIVE_OPERATION_FAILED', stack: 'secret' })).toBeNull()
  })
})
