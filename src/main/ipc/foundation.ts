import type { FoundationFailure, FoundationResult } from '../../contracts/foundation.js'
import type { DocumentSessions, InvocationLike } from './document-sessions.js'

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

/**
 * Diagnóstico com os mesmos guards de documento/sessão do estado: autoriza antes de qualquer
 * efeito, revalida antes de executar a prova e antes de responder. O gate BUSY é próprio do
 * diagnóstico e independente da fila do banco de produto.
 */
export async function handleFoundationInvocation(
  event: InvocationLike,
  request: unknown,
  sessions: DocumentSessions,
  gate: FoundationBusyGate,
  runProof: () => Promise<FoundationResult> | FoundationResult,
): Promise<FoundationResult> {
  const ticket = sessions.authorize(event)
  if (ticket === null) return unauthorizedFoundationInvocation()
  if (!isValidFoundationRequest(request)) return invalidFoundationRequest()

  const result = await gate.run(() => (sessions.isCurrent(ticket) ? runProof() : unauthorizedFoundationInvocation()))
  // Documento mudou durante a prova: a resposta não segue para o documento novo.
  return sessions.isCurrent(ticket) ? result : unauthorizedFoundationInvocation()
}
