import { describe, expect, it } from 'vitest'
import { ENTRY_CHANNELS, ENTRY_LIMITS, entryFailure, parseCaptureAckRequest, parseCaptureAckResult, parseCaptureDiscardRequest, parseCaptureResult,
  parseEntryAck, parseEntryFailure, parseEntryRequest, parsePendingCaptureResult, parseSetShortcutRequest, parseShortcutEditingRequest, parseShortcutSettingsResult } from '../../src/contracts/capture-shortcuts.js'
import { serializedBytes } from '../../src/contracts/record.js'
import { mapClipboardText } from '../../src/domain/clipboard-capture.js'
import { defaultShortcutActions, SHORTCUT_ACTIONS } from '../../src/domain/global-shortcuts.js'

const ref = { id: '00000000-0000-4000-8000-000000000001', sequence: '1' }
const acknowledged = { version: 1, ...ref, disposition: 'presented' }
const setter = { version: 1, action: 'QUICK_ADD', combination: { modifiers: 'ALT_SHIFT', key: 'F24' }, expectedConfigRevision: '0' }
describe('Q11 novos contratos finitos v1', () => {
  it('nove canais fixos sem argumento de canal/destino/URL', () => {
    expect(Object.keys(ENTRY_CHANNELS)).toHaveLength(9)
    expect(parseEntryRequest({ version: 1 })).toEqual({ version: 1 })
    for (const extra of ['destination', 'role', 'path', 'url', 'clipboard', 'channel']) expect(parseEntryRequest({ version: 1, [extra]: 'fictício' })).toBeNull()
    expect(parseEntryRequest({ version: 2 })).toBeNull()
  })
  it('ack/discard exatos UUID/sequence/disposition', () => {
    expect(parseCaptureAckRequest(acknowledged)).toEqual(acknowledged)
    expect(parseCaptureDiscardRequest({ version: 1, ...ref })).toEqual({ version: 1, ...ref })
    for (const id of ['task-id', '', ref.id.toUpperCase(), '00000000-0000-1000-8000-000000000001']) {
      // A fixture usa somente dígitos; caixa alta dessa fixture é idêntica.
      if (id === ref.id) continue
      expect(parseCaptureAckRequest({ ...acknowledged, id })).toBeNull()
    }
    for (const sequence of ['0', '00', '1e1', '-1', '9'.repeat(33), 1]) expect(parseCaptureDiscardRequest({ version: 1, ...ref, sequence })).toBeNull()
    for (const disposition of ['discarded', 'take', true, {}]) expect(parseCaptureAckRequest({ ...acknowledged, disposition })).toBeNull()
    expect(parseCaptureAckRequest({ ...acknowledged, extra: 'ignored?' })).toBeNull()
  })
  it('setter não aceita acelerador livre/AltGr/extra ou revisão arbitrária', () => {
    expect(parseSetShortcutRequest(setter)).toEqual(setter)
    expect(parseSetShortcutRequest({ ...setter, combination: null })).toMatchObject({ combination: null })
    for (const combination of ['Ctrl+Shift+K', { modifiers: 'CTRL_ALT', key: 'K' }, { modifiers: 'ALT_SHIFT', key: 'F4' }, { modifiers: 'CTRL_SHIFT', key: 'K', extra: true }]) {
      expect(parseSetShortcutRequest({ ...setter, combination })).toBeNull()
    }
    expect(parseSetShortcutRequest({ ...setter, expectedConfigRevision: '9'.repeat(33) })).toBeNull()
    expect(parseSetShortcutRequest({ ...setter, action: 'SHELL' })).toBeNull()
    expect(parseShortcutEditingRequest({ version: 1, editing: true })).toEqual({ version: 1, editing: true })
    expect(parseShortcutEditingRequest({ version: 1, editing: true, leaseOwner: 'alheio' })).toBeNull()
  })
  it('rejeita acessores sem acioná-los, símbolos e protótipos', () => {
    let effects = 0
    const bad = { version: 1, get editing() { effects++; return true } }
    expect(parseShortcutEditingRequest(bad)).toBeNull()
    // A medição JSON completa também precisa evitar acessores quando shape já foi recusado.
    expect(effects).toBe(0)
    expect(parseEntryRequest(Object.create({ version: 1 }))).toBeNull()
    expect(parseEntryRequest({ version: 1, [Symbol('extra')]: true })).toBeNull()
  })
  it('results/error sem dados arbitrários; shapes e versions exatos', () => {
    const capture = { version: 1, status: 'ok', reference: ref, replaced: false }
    expect(parseCaptureResult(capture)).toEqual(capture)
    const ack = { version: 1, status: 'ok', receipt: { ...ref, disposition: 'applied' } }
    expect(parseCaptureAckResult(ack)).toEqual(ack)
    expect(parseEntryAck({ version: 1, status: 'ok' })).toEqual({ version: 1, status: 'ok' })
    expect(parseEntryFailure(entryFailure('TIMEOUT'))).toEqual(entryFailure('TIMEOUT'))
    expect(parseEntryFailure({ ...entryFailure('UNKNOWN'), raw: 'fictício' })).toBeNull()
    expect(parseEntryFailure({ version: 1, status: 'error', code: 'filesystem path' })).toBeNull()
    expect(parseCaptureResult({ ...capture, version: 2 })).toBeNull()
  })
  it('draft 64KiB com escaping completo e nenhuma URL truncada', () => {
    const mapped = mapClipboardText(`${'😀"\\'.repeat(1200)}fim`)
    if (!mapped.ok) throw new Error('fixture inválida')
    const result = { version: 1, status: 'ok', inbox: { state: 'staged', capture: { ...ref, replaced: false, draft: mapped.draft } } }
    expect(serializedBytes(result)).toBeGreaterThan(8192)
    expect(parsePendingCaptureResult(result)).toEqual(result)
    const large = mapClipboardText(`https://example.test/${'a'.repeat(65536)}`)
    if (!large.ok) throw new Error('fixture inválida')
    expect(parsePendingCaptureResult({ ...result, inbox: { ...result.inbox, capture: { ...result.inbox.capture, draft: large.draft } } })).toBeNull()
    expect(ENTRY_LIMITS).toEqual({ requestBytes: 1024, resultBytes: 8192, captureBytes: 65536 })
  })
  it('inbox rejeita campo extra/órfão e ack malformado', () => {
    const mapped = mapClipboardText('fictício')
    if (!mapped.ok) throw new Error('fixture inválida')
    const capture = { ...ref, replaced: false, draft: mapped.draft }
    expect(parsePendingCaptureResult({ version: 1, status: 'ok', inbox: { state: 'none', capture } })).toBeNull()
    expect(parsePendingCaptureResult({ version: 1, status: 'ok', inbox: { state: 'held', capture: { ...capture, draft: { ...mapped.draft, title: '\ud800' } } } })).toBeNull()
    expect(parsePendingCaptureResult({ version: 1, status: 'ok', inbox: { state: 'expired', receipt: { ...ref, disposition: 'invalid' } } })).toBeNull()
  })
  it('settings exige exatamente três ações, revisão/status e desired/observed coerentes', () => {
    const defaults = defaultShortcutActions()
    const actions = SHORTCUT_ACTIONS.map(action => ({ action, desired: defaults[action], observed: defaults[action] ? 'REGISTERED' : 'NONE' }))
    const settings = { configRevision: '0', statusSequence: '1', actions, editing: false, settersBlocked: false }
    expect(parseShortcutSettingsResult({ version: 1, status: 'ok', settings })).toEqual({ version: 1, status: 'ok', settings })
    expect(parseShortcutSettingsResult({ version: 1, status: 'ok', settings: { ...settings, actions: [actions[0], actions[0], actions[2]] } })).toBeNull()
    expect(parseShortcutSettingsResult({ version: 1, status: 'ok', settings: { ...settings, actions: actions.map(action => ({ ...action, observed: 'NONE' })) } })).toBeNull()
    expect(parseShortcutSettingsResult({ version: 1, status: 'ok', settings: { ...settings, rawPath: 'fictício' } })).toBeNull()
  })
})
