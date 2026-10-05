import { describe, expect, it, vi } from 'vitest'
import type { BackupCommandServices } from '../../src/main/backup/backup-restore-service.js'
import { BackupCommandIpcService } from '../../src/main/ipc/backup.js'
import type { DocumentTicket, InvocationLike } from '../../src/main/ipc/document-sessions.js'

const TICKET: DocumentTicket = { contentsId: 1, generation: 1, key: '1:1' }
const EVENT = { sender: { id: 1 }, senderFrame: { url: 'taskflow://app' } } as unknown as InvocationLike

function fixture(options: { authorized?: boolean; current?: boolean } = {}) {
  const authorized = options.authorized ?? true
  let current = options.current ?? true
  const sessions = {
    authorize: vi.fn(() => (authorized ? TICKET : null)),
    isCurrent: vi.fn(() => current),
  }
  const services = {
    exportBackup: vi.fn(async () => ({ version: 1 as const, status: 'cancelled' as const })),
    prepareBackupRestore: vi.fn(async () => ({ version: 1 as const, status: 'cancelled' as const })),
    confirmBackupRestore: vi.fn(async () => ({
      version: 1 as const,
      status: 'ok' as const,
      outcome: 'APPLIED' as const,
      revision: '4',
      restoredCount: 1,
      verification: 'VERIFIED' as const,
      undoEpoch: 2,
    })),
    cancelBackupRestore: vi.fn(() => ({ version: 1 as const, status: 'ok' as const, cancelled: true as const })),
  }
  const ipc = new BackupCommandIpcService({
    sessions,
    services: services as unknown as BackupCommandServices,
  })
  return {
    ipc,
    sessions,
    services,
    setCurrent: (value: boolean) => (current = value),
  }
}

describe('BackupCommandIpcService (B13/B05)', () => {
  it('recusa remetente não autorizado antes de olhar o request ou o serviço', async () => {
    const f = fixture({ authorized: false })
    expect(await f.ipc.handleExport(EVENT, { version: 1, contextSequence: 1 })).toEqual({
      version: 1,
      status: 'error',
      code: 'UNAUTHORIZED',
    })
    expect(await f.ipc.handlePrepare(EVENT, { version: 1, contextSequence: 1 })).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await f.ipc.handleConfirm(EVENT, { version: 1, contextSequence: 1, restoreToken: 'a'.repeat(32) })).toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await f.ipc.handleCancel(EVENT, { version: 1, contextSequence: 1, restoreToken: 'a'.repeat(32) })).toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(f.services.exportBackup).not.toHaveBeenCalled()
    expect(f.services.prepareBackupRestore).not.toHaveBeenCalled()
    expect(f.services.confirmBackupRestore).not.toHaveBeenCalled()
    expect(f.services.cancelBackupRestore).not.toHaveBeenCalled()
  })

  it('recusa schema/versão/path antes de acessar serviço', async () => {
    const f = fixture()
    expect(await f.ipc.handleExport(EVENT, { version: 2, contextSequence: 1 })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(await f.ipc.handleExport(EVENT, { version: 1, contextSequence: 1, path: 'x' })).toMatchObject({
      code: 'INVALID_REQUEST',
    })
    expect(await f.ipc.handleConfirm(EVENT, { version: 1, contextSequence: 1 })).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(f.services.exportBackup).not.toHaveBeenCalled()
    expect(f.services.confirmBackupRestore).not.toHaveBeenCalled()
  })

  it('encaminha ticket e contexto corretos e devolve o resultado do serviço', async () => {
    const f = fixture()
    const result = await f.ipc.handleExport(EVENT, { version: 1, contextSequence: 7 })
    expect(result).toEqual({ version: 1, status: 'cancelled' })
    expect(f.services.exportBackup).toHaveBeenCalledWith(TICKET, 7)

    const confirmed = await f.ipc.handleConfirm(EVENT, {
      version: 1,
      contextSequence: 7,
      restoreToken: 'b'.repeat(32),
    })
    expect(confirmed).toMatchObject({ status: 'ok', undoEpoch: 2 })
    expect(f.services.confirmBackupRestore).toHaveBeenCalledWith(TICKET, 7, 'b'.repeat(32))

    const cancelled = await f.ipc.handleCancel(EVENT, { version: 1, contextSequence: 7, restoreToken: 'b'.repeat(32) })
    expect(cancelled).toEqual({ version: 1, status: 'ok', cancelled: true })
    expect(f.services.cancelBackupRestore).toHaveBeenCalledWith('b'.repeat(32), TICKET.key)
  })

  it('sessão encerrada no meio suprime a entrega, mas o efeito já concluído permanece', async () => {
    const f = fixture()
    f.services.exportBackup.mockImplementationOnce(async () => {
      f.setCurrent(false)
      return { version: 1, status: 'ok', outcome: 'SAVED', taskCount: 2, revision: '3' } as never
    })
    expect(await f.ipc.handleExport(EVENT, { version: 1, contextSequence: 1 })).toMatchObject({
      code: 'SESSION_CLOSED',
    })

    const g = fixture()
    g.services.confirmBackupRestore.mockImplementationOnce(async () => {
      g.setCurrent(false)
      return {
        version: 1,
        status: 'ok',
        outcome: 'APPLIED',
        revision: '9',
        restoredCount: 3,
        verification: 'VERIFIED',
        undoEpoch: 1,
      }
    })
    expect(await g.ipc.handleConfirm(EVENT, { version: 1, contextSequence: 1, restoreToken: 'c'.repeat(32) })).toMatchObject({
      code: 'SESSION_CLOSED',
    })
  })
})
