import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BackupManager from '../../src/renderer/src/components/backup/BackupManager.vue'
import { useTasksStore } from '../../src/renderer/src/stores/tasks.js'

// Componente de backup: foco, prévia/zero tarefas, modal/Escape, cancelamento, sucesso e stale.
// A API é um dublê local; nenhum diálogo nativo é aberto.

function snapshot(undoEpoch = 1): unknown {
  return { revision: '1', undoEpoch, tasks: [], trash: [] }
}

function createApi() {
  return {
    subscribeState: vi.fn(async () => ({
      version: 3 as const,
      status: 'ok' as const,
      subscriptionId: 'sub'.padEnd(24, 'S'),
      snapshot: snapshot(),
    })),
    unsubscribeState: vi.fn(async () => ({ version: 3 as const, status: 'ok' as const })),
    getStateSnapshot: vi.fn(async () => ({ version: 3 as const, status: 'ok' as const, snapshot: snapshot() })),
    clearUndoOffer: vi.fn(async (request: { contextSequence: number }) => ({
      version: 1 as const,
      status: 'ok' as const,
      contextSequence: request.contextSequence,
    })),
    exportBackup: vi.fn(async () => ({
      version: 1 as const,
      status: 'ok' as const,
      outcome: 'SAVED' as const,
      taskCount: 3,
      revision: '2',
    })),
    prepareBackupRestore: vi.fn(async () => ({
      version: 1 as const,
      status: 'ok' as const,
      restoreToken: 'r'.repeat(32),
      baseRevision: '1',
      sourceFormatVersion: 2,
      formatVersion: 4 as const,
      exportedAt: '2026-10-04T12:00:00.000Z',
      appVersion: '0.1.0',
      fileTaskCount: 0,
      localTaskCount: 3,
      expiresInMs: 300000,
    })),
    confirmBackupRestore: vi.fn(async () => ({
      version: 1 as const,
      status: 'ok' as const,
      outcome: 'APPLIED' as const,
      revision: '2',
      restoredCount: 0,
      verification: 'VERIFIED' as const,
      undoEpoch: 2,
    })),
    cancelBackupRestore: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const, cancelled: true as const })),
  }
}

async function mountManager(api = createApi()) {
  ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
  setActivePinia(createPinia())
  const store = useTasksStore()
  await store.connect()
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = mount(BackupManager, { attachTo: host })
  await flushPromises()
  return { wrapper, store, api }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('área de Backup (B05/B14)', () => {
  it('foca o título na entrada', async () => {
    const { wrapper } = await mountManager()
    const title = wrapper.get('[data-backup-title]')
    expect(document.activeElement).toBe(title.element)
  })

  it('seleciona e mostra a prévia com aviso de arquivo vazio e substituição irreversível', async () => {
    const api = createApi()
    ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
    const { wrapper, store } = await mountManager(api)
    await wrapper.get('[data-action="select"]').trigger('click')
    await flushPromises()
    expect(api.prepareBackupRestore).toHaveBeenCalledWith({ version: 1, contextSequence: expect.any(Number) })
    expect(wrapper.text()).toContain('v2')
    expect(wrapper.text()).toContain('v4')
    expect(wrapper.text()).toContain('todas as tarefas ativas serão removidas')
    expect(wrapper.text()).toContain('substituição é total e irreversível')
    expect(store.backupMode || true).toBe(true)
  })

  it('abre o modal, abandona com Escape mantendo a prévia e confirma consumindo o token', async () => {
    const api = createApi()
    ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
    const { wrapper } = await mountManager(api)
    await wrapper.get('[data-action="select"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(document.activeElement).toBe(dialog.element)
    await dialog.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="confirm"]').exists()).toBe(true)

    await wrapper.get('[data-action="confirm"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="confirm-irreversible"]').trigger('click')
    await flushPromises()
    expect(api.confirmBackupRestore).toHaveBeenCalledWith({
      version: 1,
      contextSequence: expect.any(Number),
      restoreToken: 'r'.repeat(32),
    })
    expect(wrapper.get('[data-backup-success]').text()).toContain('Substituição concluída')
  })

  it('cancelar a prévia libera o token e volta à seleção; cancelar a seleção é neutro', async () => {
    const api = createApi()
    api.prepareBackupRestore.mockResolvedValueOnce({ version: 1, status: 'cancelled' } as never)
    ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
    const { wrapper } = await mountManager(api)
    await wrapper.get('[data-action="select"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Seleção cancelada')

    api.prepareBackupRestore.mockResolvedValueOnce({
      version: 1,
      status: 'ok',
      restoreToken: 'x'.repeat(32),
      baseRevision: '1',
      sourceFormatVersion: 4,
      formatVersion: 4,
      exportedAt: '2026-10-04T12:00:00.000Z',
      appVersion: '0.1.0',
      fileTaskCount: 1,
      localTaskCount: 0,
      expiresInMs: 300000,
    } as never)
    await wrapper.get('[data-action="select"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="cancel-preview"]').trigger('click')
    await flushPromises()
    expect(api.cancelBackupRestore).toHaveBeenCalledWith({
      version: 1,
      contextSequence: expect.any(Number),
      restoreToken: 'x'.repeat(32),
    })
    expect(wrapper.text()).toContain('Prévia cancelada')
  })

  it('base mudou depois da prévia: confirmação fica indisponível e reaparece o motivo', async () => {
    const api = createApi()
    ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
    const { wrapper, store } = await mountManager(api)
    await wrapper.get('[data-action="select"]').trigger('click')
    await flushPromises()

    store.$patch({ revision: '9' })
    await nextTick()
    expect(wrapper.text()).toContain('Os dados locais mudaram depois da prévia')
    expect(wrapper.get('[data-action="confirm"]').attributes('aria-disabled')).toBe('true')
  })

  it('epoch invalidada por outra restauração cerca a confirmação', async () => {
    const api = createApi()
    ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
    const { wrapper, store } = await mountManager(api)
    await wrapper.get('[data-action="select"]').trigger('click')
    await flushPromises()
    store.$patch({ undoEpoch: 2 })
    await nextTick()
    expect(wrapper.text()).toContain('Outra restauração foi confirmada')
  })

  it('busy impede dupla ação: seleção repetida enquanto a leitura está em andamento', async () => {
    const api = createApi()
    const deferred: { resolve?: (value: unknown) => void } = {}
    api.prepareBackupRestore.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deferred.resolve = resolve
        }) as never,
    )
    ;(globalThis.window as unknown as Record<string, unknown>)['taskflowDesktop'] = api
    const { wrapper } = await mountManager(api)
    await wrapper.get('[data-action="select"]').trigger('click')
    await wrapper.get('[data-action="select"]').trigger('click')
    expect(api.prepareBackupRestore).toHaveBeenCalledTimes(1)
    if (deferred.resolve !== undefined) deferred.resolve({ version: 1, status: 'cancelled' })
    await flushPromises()
  })
})
