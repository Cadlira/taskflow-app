import { mapClipboardText } from '../../domain/clipboard-capture.js'
import type { CapturedDraft } from '../../domain/clipboard-capture.js'
import { utf8ByteLength } from '../../contracts/text.js'
import { CLIPBOARD_RAW_BYTES, CLIPBOARD_TIMEOUT_MS } from './capture-ports.js'
import type { CaptureClock, ClipboardTextReader } from './capture-ports.js'

export type ClipboardReadResult =
  | { ok: true; draft: CapturedDraft }
  | { ok: false; code: 'BUSY' | 'TIMEOUT' | 'UNAVAILABLE' | 'EMPTY' | 'UNSUPPORTED' | 'INVALID_TEXT' | 'RESOURCE_LIMIT' | 'SESSION_CLOSED' }

/** Uma Promise física para o processo; timeout lógico nunca libera o gate físico. */
export class ClipboardCaptureReader {
  #busy = false
  constructor(readonly reader: ClipboardTextReader, readonly clock: CaptureClock) {}
  get busy(): boolean { return this.#busy }

  read(current: () => boolean): Promise<ClipboardReadResult> {
    if (!current()) return Promise.resolve({ ok: false, code: 'SESSION_CLOSED' })
    if (this.#busy) return Promise.resolve({ ok: false, code: 'BUSY' })
    this.#busy = true
    return new Promise((resolve) => {
      let settled = false
      const complete = (result: ClipboardReadResult): void => {
        if (settled) return
        settled = true
        cancelDeadline()
        resolve(result)
      }
      const cancelDeadline = this.clock.arm(CLIPBOARD_TIMEOUT_MS, () => complete({ ok: false, code: 'TIMEOUT' }))
      let physical: Promise<string>
      try { physical = this.reader.readText() }
      catch { this.#busy = false; complete({ ok: false, code: 'UNAVAILABLE' }); return }
      void physical.then((raw) => {
        this.#busy = false
        if (settled) return
        if (!current()) { complete({ ok: false, code: 'SESSION_CLOSED' }); return }
        if (utf8ByteLength(raw) > CLIPBOARD_RAW_BYTES) { complete({ ok: false, code: 'RESOURCE_LIMIT' }); return }
        complete(mapClipboardText(raw))
      }, () => {
        this.#busy = false
        complete(current() ? { ok: false, code: 'UNAVAILABLE' } : { ok: false, code: 'SESSION_CLOSED' })
      })
    })
  }
}
