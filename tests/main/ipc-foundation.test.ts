import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FoundationResult } from '../../src/contracts/foundation.js'
import { buildFictitiousTask } from '../../src/main/harness/fixtures.js'
import { DocumentSessions } from '../../src/main/ipc/document-sessions.js'
import {
  FoundationBusyGate,
  handleFoundationInvocation,
  isValidFoundationRequest,
} from '../../src/main/ipc/foundation.js'
import { PACKAGED_ORIGIN, fakeContents, fakeFrame, invocation } from '../support/documents.js'
import { cleanupStorage, createProductFile, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)

function verifiedResult(): FoundationResult {
  return {
    version: 1,
    status: 'verified',
    appVersion: '0.1.0',
    electronVersion: '44.5.1',
    nodeVersion: '24.21.0',
    fingerprint: 'a'.repeat(64),
  }
}

function registered(): { sessions: DocumentSessions; contents: ReturnType<typeof fakeContents> } {
  const sessions = new DocumentSessions(PACKAGED_ORIGIN)
  const contents = fakeContents(17)
  sessions.register(contents)
  return { sessions, contents }
}

describe('contrato verifyFoundation v1', () => {
  it('aceita somente schema exato e versão 1', () => {
    expect(isValidFoundationRequest({ version: 1 })).toBe(true)
    expect(isValidFoundationRequest({ version: 2 })).toBe(false)
    expect(isValidFoundationRequest({ version: 1, path: 'C:\\secret' })).toBe(false)
    expect(isValidFoundationRequest(null)).toBe(false)
    expect(isValidFoundationRequest([])).toBe(false)
    expect(isValidFoundationRequest('version=1')).toBe(false)
  })

  it('aplica o limite serializado de 1 KiB', () => {
    const small = JSON.stringify({ version: 1 })
    const oversized = `${JSON.stringify({ version: 1 })}${'x'.repeat(1024)}`
    expect(new TextEncoder().encode(small).byteLength).toBeLessThanOrEqual(1024)
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(1024)
    const request = { version: 1 }
    Object.defineProperty(request, 'toJSON', {
      enumerable: false,
      value: () => ({ version: 1, padding: 'x'.repeat(1024) }),
    })
    expect(isValidFoundationRequest(request)).toBe(false)
  })
})

describe('guards de documento no diagnóstico', () => {
  it('documento autorizado recebe o resultado fechado da prova, com o mesmo shape', async () => {
    const { sessions, contents } = registered()
    const proof = vi.fn(verifiedResult)

    const result = await handleFoundationInvocation(invocation(contents), { version: 1 }, sessions, new FoundationBusyGate(), proof)

    expect(result).toEqual(verifiedResult())
    expect(Object.keys(result).sort()).toEqual(['appVersion', 'electronVersion', 'fingerprint', 'nodeVersion', 'status', 'version'])
    expect(proof).toHaveBeenCalledTimes(1)
  })

  it('remetente não autorizado é recusado antes de acessar a prova', async () => {
    const { sessions, contents } = registered()
    const proof = vi.fn(verifiedResult)
    const gate = new FoundationBusyGate()
    const blank = fakeContents(20, fakeFrame('about:blank'))
    const dev = fakeContents(21, fakeFrame('http://127.0.0.1:5173/', 'http://127.0.0.1:5173'))
    sessions.register(blank)
    sessions.register(dev)
    const removed = fakeContents(22)
    sessions.register(removed)
    removed.mainFrame.destroyed = true

    const events = [
      invocation(fakeContents(18)),
      invocation(contents, fakeFrame()),
      invocation(contents, null),
      invocation(blank),
      invocation(dev),
      invocation(removed),
    ]
    for (const event of events) {
      expect(await handleFoundationInvocation(event, { version: 1 }, sessions, gate, proof)).toEqual({
        version: 1,
        status: 'error',
        code: 'UNAUTHORIZED',
      })
    }
    expect(proof).not.toHaveBeenCalled()
  })

  it('payload inválido é recusado antes de qualquer efeito', async () => {
    const { sessions, contents } = registered()
    const proof = vi.fn(verifiedResult)

    for (const request of [{ version: 2 }, { version: 1, extra: true }, { version: 1, pad: 'x'.repeat(2048) }, null]) {
      expect(await handleFoundationInvocation(invocation(contents), request, sessions, new FoundationBusyGate(), proof)).toEqual({
        version: 1,
        status: 'error',
        code: 'INVALID_REQUEST',
      })
    }
    expect(proof).not.toHaveBeenCalled()
  })

  it('documento que muda durante o diagnóstico não recebe a resposta', async () => {
    const { sessions, contents } = registered()
    let finish: ((result: FoundationResult) => void) | undefined
    const pending = handleFoundationInvocation(invocation(contents), { version: 1 }, sessions, new FoundationBusyGate(), () =>
      new Promise<FoundationResult>((resolve) => {
        finish = resolve
      }),
    )
    await Promise.resolve()

    // Reload da mesma URL depois da autorização.
    sessions.invalidate(contents.id)
    finish?.(verifiedResult())

    const result = await pending
    expect(result).toEqual({ version: 1, status: 'error', code: 'UNAUTHORIZED' })
    expect(JSON.stringify(result)).not.toContain('fingerprint')
  })

  it('sessão que expira enquanto espera o gate não inicia a prova', async () => {
    const { sessions, contents } = registered()
    const proof = vi.fn(verifiedResult)
    const gate = { run: (operation: () => FoundationResult | Promise<FoundationResult>) => {
      sessions.invalidate(contents.id)
      return Promise.resolve(operation())
    } } as unknown as FoundationBusyGate

    expect(await handleFoundationInvocation(invocation(contents), { version: 1 }, sessions, gate, proof)).toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(proof).not.toHaveBeenCalled()
  })
})

describe('serialização da prova', () => {
  it('responde BUSY antes de uma segunda operação e libera a fila após concluir', async () => {
    const gate = new FoundationBusyGate()
    let finishFirst: ((result: FoundationResult) => void) | undefined
    const first = gate.run(
      () => new Promise<FoundationResult>((resolve) => {
        finishFirst = resolve
      }),
    )

    await expect(gate.run(() => verifiedResult())).resolves.toEqual({
      version: 1,
      status: 'error',
      code: 'BUSY',
    })
    finishFirst?.(verifiedResult())
    await expect(first).resolves.toMatchObject({ status: 'verified' })
    await expect(gate.run(() => verifiedResult())).resolves.toMatchObject({ status: 'verified' })
  })

  it('libera a fila após exceção sem expor a mensagem', async () => {
    const gate = new FoundationBusyGate()
    await expect(gate.run(() => { throw new Error('private path') })).resolves.toEqual({
      version: 1,
      status: 'error',
      code: 'PROOF_UNAVAILABLE',
    })
    await expect(gate.run(() => verifiedResult())).resolves.toMatchObject({ status: 'verified' })
  })

  it('o gate BUSY do diagnóstico é independente da fila do produto', async () => {
    const { sessions, contents } = registered()
    const queued: Array<() => void> = []
    const coordinator = openCoordinator(createProductFile(), { schedule: (callback) => queued.push(callback) })
    const gate = new FoundationBusyGate()

    // Diagnóstico em andamento: o segundo recebe BUSY, mas o produto segue aceitando unidades.
    let finish: ((result: FoundationResult) => void) | undefined
    const running = handleFoundationInvocation(invocation(contents), { version: 1 }, sessions, gate, () =>
      new Promise<FoundationResult>((resolve) => {
        finish = resolve
      }),
    )
    await Promise.resolve()
    const second = await handleFoundationInvocation(invocation(contents), { version: 1 }, sessions, gate, verifiedResult)
    const product = coordinator.run((unit) => unit.saveTask(buildFictitiousTask(1)))
    while (queued.length > 0) queued.shift()?.()

    expect(second).toEqual({ version: 1, status: 'error', code: 'BUSY' })
    expect(await product).toMatchObject({ ok: true, committed: true })

    // Fila do produto cheia não rejeita o diagnóstico.
    finish?.(verifiedResult())
    await running
    const flood = Array.from({ length: 64 }, (_unused, index) => coordinator.run((unit) => unit.saveTask(buildFictitiousTask(index + 2))))
    expect(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(999)))).toEqual({ ok: false, reason: 'QUEUE_FULL' })
    expect(await handleFoundationInvocation(invocation(contents), { version: 1 }, sessions, gate, verifiedResult)).toMatchObject({
      status: 'verified',
    })
    while (queued.length > 0) queued.shift()?.()
    await Promise.all(flood)
  })
})
