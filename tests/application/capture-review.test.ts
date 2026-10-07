import { describe, expect, it, vi } from 'vitest'
import { CaptureReview } from '../../src/application/capture/capture-review.js'
import { MemoryCaptureInbox } from '../../src/application/capture/memory-capture-inbox.js'
import { mapClipboardText } from '../../src/domain/clipboard-capture.js'
import type { CaptureAckResult, PendingCaptureResult } from '../../src/contracts/capture-shortcuts.js'
import type { CaptureAckRequest } from '../../src/contracts/capture-shortcuts.js'

function setup() {
  let now = 0, counter = 0, generation = 0, epoch = 0, active = true, safe = true
  const inbox = new MemoryCaptureInbox({ monotonic: () => now }, { next: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` })
  const owner = { role: 'MANAGER' as const, documentId: 'document', sessionId: 'session' }
  const stage = (text = 'Tarefa fictícia') => { const mapped = mapClipboardText(text); if (!mapped.ok) throw new Error('fixture'); return inbox.stage('MANAGER', mapped.draft)! }
  const acknowledge = async (request: CaptureAckRequest): Promise<CaptureAckResult> => {
    const result = inbox.acknowledge(owner, request, request.disposition)
    return result.ok ? { version: 1, status: 'ok', receipt: result.receipt } : { version: 1, status: 'error', code: result.code }
  }
  const api = { getPendingCapture: vi.fn(async (): Promise<PendingCaptureResult> => ({ version: 1, status: 'ok', inbox: inbox.get(owner) })),
    acknowledgeCapture: vi.fn(acknowledge), discardCapture: vi.fn(async () => ({ version: 1 as const, status: 'error' as const, code: 'UNAVAILABLE' as const })),
    captureClipboard: vi.fn(async () => ({ version: 1 as const, status: 'error' as const, code: 'EMPTY' as const })),
  }
  const apply = vi.fn(() => { generation++; safe = false })
  const review = new CaptureReview({ api, active: () => active, epoch: () => epoch, generation: () => generation, safe: () => safe, apply, changed: vi.fn() })
  return { review, inbox, owner, stage, api, apply, acknowledge,
    time: (n: number) => { now = n }, dirty: () => { generation++; safe = false }, empty: () => { generation++; safe = true },
    hide: () => { epoch++; active = false }, reopen: () => { epoch++; active = true }, busy: () => { safe = false },
  }
}
function barrier<T>() { let release!: (value: T) => void; const promise = new Promise<T>(resolve => { release = resolve }); return { promise, release } }

describe('Q05–Q07 confirmação e geração do formulário', () => {
  it('publica cópia provisória ocupada antes de confirmar presented', async () => {
    const h = setup(); h.busy(); h.stage()
    const presentations: boolean[] = []
    h.review.options.changed = () => { if (h.review.offer) presentations.push(h.review.busy && !h.review.offer.held) }
    h.api.acknowledgeCapture.mockImplementation(async request => {
      if (request.disposition === 'presented') expect(presentations).toContain(true)
      return h.acknowledge(request)
    })
    await h.review.refresh()
    expect(h.review.offer?.held).toBe(true); expect(h.apply).not.toHaveBeenCalled()
  })
  it('aplica uma vez somente após presented/applied e não cria tarefa', async () => {
    const h = setup(); h.stage(); await h.review.refresh()
    expect(h.api.acknowledgeCapture.mock.calls.map(([r]) => r.disposition)).toEqual(['presented', 'applied'])
    expect(h.apply).toHaveBeenCalledTimes(1); expect(h.review.offer).toBeUndefined()
    await h.review.refresh(); expect(h.apply).toHaveBeenCalledTimes(1)
  })
  it('captura recebida em ocupação vira oferta; voltar à lista não aplica automaticamente', async () => {
    const h = setup(); h.busy(); h.stage(); await h.review.refresh()
    expect(h.apply).not.toHaveBeenCalled(); expect(h.review.offer?.held).toBe(true)
    h.empty(); await h.review.refresh(); expect(h.apply).not.toHaveBeenCalled()
    await h.review.review(); expect(h.apply).toHaveBeenCalledTimes(1)
  })
  it('TTL expira durante presented, retira cópia sem alterar inputs', async () => {
    const h = setup(); h.stage(); const gate = barrier<void>()
    h.api.acknowledgeCapture.mockImplementationOnce(async request => { await gate.promise; return h.acknowledge(request) })
    const pending = h.review.refresh(); await Promise.resolve(); h.time(600000); gate.release(); await pending
    expect(h.review.offer).toBeUndefined(); expect(h.apply).not.toHaveBeenCalled()
  })
  it('geração mudou enquanto presented: mesmo um formulário novo vazio exige Revisar', async () => {
    const h = setup(); h.stage(); const gate = barrier<void>()
    h.api.acknowledgeCapture.mockImplementationOnce(async request => { await gate.promise; return h.acknowledge(request) })
    const pending = h.review.refresh(); await Promise.resolve(); h.empty(); gate.release(); await pending
    expect(h.apply).not.toHaveBeenCalled(); await h.review.review(); expect(h.apply).toHaveBeenCalledTimes(1)
  })
  it('late applied conserva o formulário alterado e uma oferta local confirmada', async () => {
    const h = setup(); h.stage(); const gate = barrier<void>()
    h.api.acknowledgeCapture.mockImplementation(async request => { const result = await h.acknowledge(request); if (request.disposition === 'applied') await gate.promise; return result })
    const pending = h.review.refresh(); await vi.waitFor(() => expect(h.api.acknowledgeCapture).toHaveBeenCalledTimes(2))
    h.dirty(); gate.release(); await pending
    expect(h.apply).not.toHaveBeenCalled(); expect(h.review.offer?.applied).toBe(true)
    h.empty(); await h.review.review(); expect(h.apply).toHaveBeenCalledTimes(1)
  })
  it('ack applied perdido reconcilia recibo sem repetir ack ou aplicação', async () => {
    const h = setup(); h.stage()
    h.api.acknowledgeCapture.mockImplementation(async request => { const result = await h.acknowledge(request); if (request.disposition === 'applied') throw new Error('lost ack'); return result })
    await h.review.refresh(); expect(h.apply).not.toHaveBeenCalled()
    await h.review.refresh(); expect(h.review.offer?.applied).toBe(true)
    await h.review.review(); expect(h.api.acknowledgeCapture).toHaveBeenCalledTimes(2); expect(h.apply).toHaveBeenCalledTimes(1)
  })
  it('hide durante applied conserva cópia; nova sessão consulta recibo antes de Revisar', async () => {
    const h = setup(); h.stage(); const gate = barrier<void>()
    h.api.acknowledgeCapture.mockImplementation(async request => { const result = await h.acknowledge(request); if (request.disposition === 'applied') await gate.promise; return result })
    const pending = h.review.refresh(); await vi.waitFor(() => expect(h.api.acknowledgeCapture).toHaveBeenCalledTimes(2))
    h.hide(); gate.release(); await pending; expect(h.apply).not.toHaveBeenCalled()
    h.reopen(); await h.review.refresh(); await h.review.review(); expect(h.apply).toHaveBeenCalledTimes(1)
  })
  it('captura substituta vence applied tardio sem fila de cópias antigas', async () => {
    const h = setup(); h.stage(); const gate = barrier<void>()
    h.api.acknowledgeCapture.mockImplementation(async request => { const result = await h.acknowledge(request); if (request.disposition === 'applied') await gate.promise; return result })
    const pending = h.review.refresh(); await vi.waitFor(() => expect(h.api.acknowledgeCapture).toHaveBeenCalledTimes(2))
    const replacement = h.stage('Nova captura')!; h.review.reference(replacement); h.busy(); gate.release(); await pending
    await vi.waitFor(() => expect(h.review.offer?.capture.id).toBe(replacement.id))
    expect(h.apply).not.toHaveBeenCalled(); expect(h.review.offer?.capture.draft.title).toBe('Nova captura')
  })
  it('vazio/falha conserva pendência; dispose não publica resposta tardia', async () => {
    const h = setup(); h.busy(); h.stage(); await h.review.refresh(); const old = h.review.offer
    await h.review.capture(); expect(h.review.offer).toBe(old); expect(h.review.message).toContain('Não há texto')
    const gate = barrier<PendingCaptureResult>(); h.api.getPendingCapture.mockReturnValueOnce(gate.promise)
    const pending = h.review.refresh(); h.review.dispose(); gate.release({ version: 1, status: 'ok', inbox: h.inbox.get(h.owner) }); await pending
    expect(h.review.offer).toBeUndefined(); expect(h.apply).not.toHaveBeenCalled()
  })
})
