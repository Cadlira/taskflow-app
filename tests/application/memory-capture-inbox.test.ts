import { describe, expect, it } from 'vitest'
import { MemoryCaptureInbox } from '../../src/application/capture/memory-capture-inbox.js'
import type { CaptureOwner } from '../../src/application/capture/capture-ports.js'
import { mapClipboardText } from '../../src/domain/clipboard-capture.js'

const owner: CaptureOwner = { role: 'MANAGER', documentId: 'doc1', sessionId: 'session1' }
function setup() {
  let now = 0, counter = 0
  const inbox = new MemoryCaptureInbox({ monotonic: () => now }, { next: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` })
  const mapped = mapClipboardText('fictício')
  if (!mapped.ok) throw new Error('fixture inválida')
  const stage = () => { const capture = inbox.stage('MANAGER', mapped.draft); if (!capture) throw new Error('fixture excessiva'); return capture }
  return { inbox, stage, time: (value: number) => { now = value } }
}
describe('Q06/Q07 inbox portável limitada', () => {
  it('get não consome nem renova TTL; expire exatamente 600000', () => {
    const { inbox, stage, time } = setup()
    const capture = stage()
    expect(inbox.get(owner)).toMatchObject({ state: 'staged', capture })
    time(599999); expect(inbox.get(owner).state).toBe('staged')
    time(600000); expect(inbox.get(owner).state).toBe('expired')
    expect(inbox.acknowledge(owner, capture, 'presented')).toEqual({ ok: false, code: 'STALE_CAPTURE' })
  })
  it('held não expira e sessão nova do mesmo documento pode reconciliar', () => {
    const { inbox, stage, time } = setup()
    const capture = stage()
    expect(inbox.acknowledge(owner, capture, 'presented').ok).toBe(true)
    time(6000000)
    expect(inbox.get({ ...owner, sessionId: 'reopened' }).state).toBe('held')
    expect(inbox.get({ ...owner, documentId: 'alheio' }).state).toBe('none')
    expect(inbox.acknowledge({ ...owner, documentId: 'alheio' }, capture, 'applied').ok).toBe(false)
  })
  it('applied exige presented; duplicate ack/discard só devolve último recibo', () => {
    const { inbox, stage } = setup()
    const capture = stage()
    expect(inbox.acknowledge(owner, capture, 'applied').ok).toBe(false)
    const presented = inbox.acknowledge(owner, capture, 'presented')
    expect(inbox.acknowledge(owner, capture, 'presented')).toEqual(presented)
    const applied = inbox.acknowledge(owner, capture, 'applied')
    expect(inbox.acknowledge(owner, capture, 'applied')).toEqual(applied)
    expect(inbox.get(owner)).toMatchObject({ state: 'none', receipt: { disposition: 'applied' } })
    const next = stage()
    const discarded = inbox.discard(owner, next)
    expect(inbox.discard(owner, next)).toEqual(discarded)
  })
  it('substituta mantém sequence; ack atrasado não remove substituta', () => {
    const { inbox, stage } = setup()
    const first = stage()
    inbox.acknowledge(owner, first, 'presented')
    const next = stage()
    expect(next.replaced).toBe(true)
    expect(BigInt(next.sequence)).toBe(BigInt(first.sequence) + 1n)
    expect(inbox.acknowledge(owner, first, 'applied')).toEqual({ ok: false, code: 'STALE_CAPTURE' })
    expect(inbox.discard(owner, first)).toEqual({ ok: false, code: 'STALE_CAPTURE' })
    expect(inbox.get(owner)).toMatchObject({ capture: { id: next.id } })
  })
  it('roles isolados e forget elimina held/recibo, conserva staged abstrato', () => {
    const { inbox, stage } = setup()
    const first = stage()
    expect(inbox.get({ ...owner, role: 'QUICK_ADD' }).state).toBe('none')
    inbox.forgetDocument(owner.documentId)
    expect(inbox.get(owner).state).toBe('staged')
    inbox.acknowledge(owner, first, 'presented')
    inbox.forgetDocument(owner.documentId)
    expect(inbox.get(owner)).toEqual({ state: 'none' })
  })
  it('recusa envelope excessivo sem substituir captura nem cortar URL', () => {
    const { inbox, stage } = setup()
    const current = stage()
    const mapped = mapClipboardText(`https://example.test/${'a'.repeat(65536)}`)
    expect(mapped.ok && inbox.stage('MANAGER', mapped.draft)).toBeUndefined()
    expect(inbox.get(owner)).toMatchObject({ capture: { id: current.id } })
  })
  it('não compartilha referências mutáveis de conteúdo', () => {
    const { inbox, stage } = setup()
    const capture = stage()
    capture.draft.title = 'alterado'
    const fetched = inbox.get(owner)
    if (fetched.state === 'staged' || fetched.state === 'held') fetched.capture.draft.title = 'alterado de novo'
    expect(inbox.get(owner)).toMatchObject({ capture: { draft: { title: 'fictício' } } })
  })
})
