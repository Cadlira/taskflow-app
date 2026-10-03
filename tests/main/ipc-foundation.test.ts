import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'
import { describe, expect, it } from 'vitest'
import type { FoundationResult } from '../../src/contracts/foundation.js'
import {
  FoundationBusyGate,
  isAuthorizedFoundationInvocation,
  isValidFoundationRequest,
} from '../../src/main/ipc/foundation.js'

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

  it('exige o webContents registrado, main frame e origem exata', () => {
    const frame = { url: 'taskflow://app/index.html' } as unknown as WebFrameMain
    const otherFrame = { url: 'taskflow://app/iframe.html' } as unknown as WebFrameMain
    const contents = { id: 17, mainFrame: frame } as unknown as WebContents
    const valid = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent
    const iframe = { sender: contents, senderFrame: otherFrame } as unknown as IpcMainInvokeEvent
    const otherContents = { id: 18, mainFrame: frame } as unknown as WebContents

    expect(isAuthorizedFoundationInvocation(valid, contents, 'taskflow://app')).toBe(true)
    expect(isAuthorizedFoundationInvocation(iframe, contents, 'taskflow://app')).toBe(false)
    expect(isAuthorizedFoundationInvocation(valid, otherContents, 'taskflow://app')).toBe(false)
    expect(isAuthorizedFoundationInvocation(valid, contents, 'http://127.0.0.1:5173')).toBe(false)
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
})
