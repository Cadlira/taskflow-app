import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClipboardCaptureReader } from '../../src/application/capture/clipboard-reader.js'
import type { CaptureClock, ClipboardTextReader } from '../../src/application/capture/capture-ports.js'

const clock: CaptureClock = { monotonic: () => Date.now(), arm: (delay, callback) => { const handle = setTimeout(callback, delay); return () => clearTimeout(handle) } }
afterEach(() => vi.useRealTimers())
describe('Q03 leitura física única e deadline lógico', () => {
  it('mantém BUSY após timeout até Promise física terminar; tardio descartado', async () => {
    vi.useFakeTimers()
    let finish: (value: string) => void = () => { throw new Error('barreira não instalada') }
    const physical = new Promise<string>((resolve) => { finish = resolve })
    const reader: ClipboardTextReader = { readText: vi.fn(() => physical) }
    const service = new ClipboardCaptureReader(reader, clock)
    const first = service.read(() => true)
    expect(await service.read(() => true)).toEqual({ ok: false, code: 'BUSY' })
    await vi.advanceTimersByTimeAsync(4999)
    expect(service.busy).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(await first).toEqual({ ok: false, code: 'TIMEOUT' })
    expect(await service.read(() => true)).toEqual({ ok: false, code: 'BUSY' })
    expect(reader.readText).toHaveBeenCalledTimes(1)
    finish('tardio fictício')
    await Promise.resolve()
    expect(service.busy).toBe(false)
    expect(await first).toEqual({ ok: false, code: 'TIMEOUT' })
  })
  it('não lê sem admissão e invalida epoch/sessão durante await', async () => {
    let admitted = false
    let finish: (value: string) => void = () => undefined
    const reader = { readText: vi.fn(() => new Promise<string>(resolve => { finish = resolve })) }
    const service = new ClipboardCaptureReader(reader, clock)
    expect(await service.read(() => admitted)).toEqual({ ok: false, code: 'SESSION_CLOSED' })
    expect(reader.readText).not.toHaveBeenCalled()
    admitted = true
    const pending = service.read(() => admitted)
    admitted = false; finish('fictício')
    expect(await pending).toEqual({ ok: false, code: 'SESSION_CLOSED' })
  })
  it.each(['', ' \t\n '])('vazio conserva estado externo', async (raw) => {
    expect(await new ClipboardCaptureReader({ readText: async () => raw }, clock).read(() => true)).toEqual({ ok: false, code: 'EMPTY' })
  })
  it('rejeição e throw síncrono liberam gate com erro seguro', async () => {
    for (const readText of [() => Promise.reject(new Error('conteúdo fictício')), () => { throw new Error('conteúdo fictício') }]) {
      const service = new ClipboardCaptureReader({ readText }, clock)
      expect(await service.read(() => true)).toEqual({ ok: false, code: 'UNAVAILABLE' })
      expect(service.busy).toBe(false)
    }
  })
  it('limite raw é UTF-8 após leitura, antes do mapeamento', async () => {
    expect(await new ClipboardCaptureReader({ readText: async () => '😀'.repeat(262145) }, clock).read(() => true)).toEqual({ ok: false, code: 'RESOURCE_LIMIT' })
    const allowed = await new ClipboardCaptureReader({ readText: async () => 'a'.repeat(1048576) }, clock).read(() => true)
    expect(allowed.ok && allowed.draft.title.length).toBe(200)
  })
})
