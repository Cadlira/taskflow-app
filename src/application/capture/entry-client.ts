import { ENTRY_CHANNELS, entryFailure, parseEntryAck, parseEntryRequest, parseCaptureAckRequest, parseCaptureDiscardRequest,
  parseCaptureAckResult, parseCaptureResult, parsePendingCaptureResult, parseSetShortcutRequest, parseShortcutEditingRequest,
  parseShortcutSettingsResult } from '../../contracts/capture-shortcuts.js'
import type { EntryRequest, CaptureAckRequest, CaptureDiscardRequest, SetShortcutRequest, ShortcutEditingRequest } from '../../contracts/capture-shortcuts.js'

export interface EntryTransport { invoke(channel: string, request: unknown): Promise<unknown> }
/** Requests e respostas exatos; os canais nunca são argumentos do renderer. */
export function createEntryClient(transport: EntryTransport) {
  async function call<T>(channel: string, request: unknown, validate: (value: unknown) => unknown,
    parse: (value: unknown) => T | null): Promise<T | ReturnType<typeof entryFailure>> {
    if (!validate(request)) return entryFailure('INVALID_REQUEST')
    try { return parse(await transport.invoke(channel, request)) ?? entryFailure('RESOURCE_LIMIT') }
    catch { return entryFailure('SESSION_CLOSED') }
  }
  return {
    openQuickAdd: (request: EntryRequest) => call(ENTRY_CHANNELS.openQuickAdd, request, parseEntryRequest, parseEntryAck),
    openTaskManager: (request: EntryRequest) => call(ENTRY_CHANNELS.openTaskManager, request, parseEntryRequest, parseEntryAck),
    captureClipboard: (request: EntryRequest) => call(ENTRY_CHANNELS.captureClipboard, request, parseEntryRequest, parseCaptureResult),
    getPendingCapture: (request: EntryRequest) => call(ENTRY_CHANNELS.getPendingCapture, request, parseEntryRequest, parsePendingCaptureResult),
    acknowledgeCapture: (request: CaptureAckRequest) => call(ENTRY_CHANNELS.acknowledgeCapture, request, parseCaptureAckRequest, parseCaptureAckResult),
    discardCapture: (request: CaptureDiscardRequest) => call(ENTRY_CHANNELS.discardCapture, request, parseCaptureDiscardRequest, parseCaptureAckResult),
    getShortcutSettings: (request: EntryRequest) => call(ENTRY_CHANNELS.getShortcutSettings, request, parseEntryRequest, parseShortcutSettingsResult),
    setShortcut: (request: SetShortcutRequest) => call(ENTRY_CHANNELS.setShortcut, request, parseSetShortcutRequest, parseShortcutSettingsResult),
    setShortcutEditing: (request: ShortcutEditingRequest) => call(ENTRY_CHANNELS.setShortcutEditing, request, parseShortcutEditingRequest, parseEntryAck),
  }
}
