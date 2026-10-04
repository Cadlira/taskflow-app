import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { FoundationFailure, FoundationResult } from '../../contracts/foundation.js'
import { isTrustedRendererUrl } from '../protocol.js'

export const FOUNDATION_CHANNEL = 'foundation:verify:v1'
const MAX_REQUEST_BYTES = 1024

function failure(code: FoundationFailure['code']): FoundationFailure {
  return { version: 1, status: 'error', code }
}

export function isValidFoundationRequest(request: unknown): boolean {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return false
  try {
    const prototype = Object.getPrototypeOf(request)
    if (prototype !== Object.prototype && prototype !== null) return false
    const keys = Object.keys(request)
    if (keys.length !== 1 || keys[0] !== 'version') return false
    const json = JSON.stringify(request)
    if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_REQUEST_BYTES) return false
    return (request as { version?: unknown }).version === 1
  } catch {
    return false
  }
}

export function isAuthorizedFoundationInvocation(
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  expectedContents: WebContents,
  expectedOrigin: string,
): boolean {
  return (
    event.sender.id === expectedContents.id &&
    event.senderFrame === event.sender.mainFrame &&
    isTrustedRendererUrl(event.senderFrame.url, expectedOrigin)
  )
}

export class FoundationBusyGate {
  #busy = false

  async run(operation: () => Promise<FoundationResult> | FoundationResult): Promise<FoundationResult> {
    if (this.#busy) return failure('BUSY')
    this.#busy = true
    try {
      return await operation()
    } catch {
      return failure('PROOF_UNAVAILABLE')
    } finally {
      this.#busy = false
    }
  }
}

export function invalidFoundationRequest(): FoundationFailure {
  return failure('INVALID_REQUEST')
}

export function unauthorizedFoundationInvocation(): FoundationFailure {
  return failure('UNAUTHORIZED')
}
