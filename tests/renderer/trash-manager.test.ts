import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import type { StateSnapshot, StateUpdate, TaskRecord, TrashRecord } from '../../src/contracts/state.js'
import type { Task } from '../../src/domain/task.js'
import TaskManager from '../../src/renderer/src/components/tasks/TaskManager.vue'
import { buildTask } from '../support/task-fixtures.js'

// Lixeira/desfazer na UI real do gerenciamento: acesso, confirmações, oferta, foco e recusas.
// Dados fictícios; nenhum main/SQLite real é usado.

let wrapper: VueWrapper | undefined

function record(task: Task, contentRevision = '1', editRevision = contentRevision): TaskRecord {
  return { task, contentRevision, editRevision }
}

function trashRecord(task: Task, deletedAt = '2026-10-03T10:00:00.000Z', revision = '2'): TrashRecord {
  return { task, deletedAt, contentRevision: revision, editRevision: revision }
}

function snapshot(revision: string, tasks: TaskRecord[], trash: TrashRecord[] = []): StateSnapshot {
  return { revision, tasks, trash }
}

type Mock = ReturnType<typeof vi.fn>

interface Harness {
  api: {
    verifyFoundation: Mock
    getStateSnapshot: Mock
    subscribeState: Mock
    unsubscribeState: Mock
    createTask: Mock
    updateTask: Mock
    changeTaskStatus: Mock
    setSubtaskDone: Mock
    openTaskSource: Mock
    clearUndoOffer: Mock
    prepareTrashConfirmation: Mock
    moveTaskToTrash: Mock
    restoreTrashItem: Mock
    deleteTrashItem: Mock
    emptyTrash: Mock
    prepareTrashView: Mock
    undoLastTaskAction: Mock
  }
  emit(update: StateUpdate): void
  setSnapshot(next: StateSnapshot): void
}

function setupHarness(initial: StateSnapshot): Harness {
  let current = initial
  let listener: ((update: StateUpdate) => void) | undefined
  const api = {
    verifyFoundation: vi.fn(),
    getStateSnapshot: vi.fn(async () => ({ version: 2 as const, status: 'ok' as const, snapshot: current })),
    subscribeState: vi.fn(async (_request: unknown, next?: (update: StateUpdate) => void) => {
      listener = next
      return { version: 2 as const, status: 'ok' as const, subscriptionId: 'sub'.padEnd(24, 'S'), snapshot: current }
    }),
    unsubscribeState: vi.fn(async () => ({ version: 2 as const, status: 'ok' as const })),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    setSubtaskDone: vi.fn(),
    openTaskSource: vi.fn(),
    clearUndoOffer: vi.fn(async (request: { contextSequence: number }) => ({
      version: 1 as const,
      status: 'ok' as const,
      contextSequence: request.contextSequence,
    })),
    prepareTrashConfirmation: vi.fn(),
    moveTaskToTrash: vi.fn(),
    restoreTrashItem: vi.fn(),
    deleteTrashItem: vi.fn(),
    emptyTrash: vi.fn(),
    prepareTrashView: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const, revision: current.revision, purgedCount: 0 })),
    undoLastTaskAction: vi.fn(),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api as unknown as TaskFlowDesktopApi })
  setActivePinia(createPinia())
  return {
    api,
    emit: (update) => listener?.(update),
    setSnapshot: (next) => {
      current = next
    },
  }
}

async function mountManager(): Promise<VueWrapper> {
  wrapper = mount(TaskManager, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

function buttonByText(view: VueWrapper, text: string) {
  return view.findAll('button').find((button) => button.text().includes(text))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  Reflect.deleteProperty(window, 'taskflowDesktop')
  vi.useRealTimers()
})

describe('lixeira na interface', () => {
  it('abre pelo cabeçalho, mostra política/data pt-BR e volta conservando a lista', async () => {
    const task = buildTask({ id: 'a', title: 'Na lixeira' })
    const harness = setupHarness(snapshot('1', [], [trashRecord(task)]))
    const view = await mountManager()

    const trashButton = buttonByText(view, 'Lixeira')
    expect(trashButton).toBeDefined()
    await trashButton?.trigger('click')
    await flushPromises()

    expect(harness.api.prepareTrashView).toHaveBeenCalledTimes(1)
    expect(view.text()).toContain('Na lixeira')
    expect(view.text()).toContain('30 dias')
    expect(view.text()).toContain('Restaurar')
    expect(view.text()).toContain('Excluir definitivamente')

    await buttonByText(view, 'Voltar')?.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Tarefas')
  })

  it('restaurar consome a entrada observada e devolve foco a Voltar quando a lista esvazia', async () => {
    const task = buildTask({ id: 'a', title: 'Voltará' })
    const harness = setupHarness(snapshot('1', [], [trashRecord(task)]))
    const view = await mountManager()
    await buttonByText(view, 'Lixeira')?.trigger('click')
    await flushPromises()

    harness.api.restoreTrashItem.mockResolvedValue({ version: 1, status: 'ok', revision: '2', contentRevision: '2', editRevision: '2' })
    harness.setSnapshot(snapshot('2', [record(task, '2', '2')], []))
    const restore = buttonByText(view, 'Restaurar')
    await restore?.trigger('click')
    await flushPromises()
    harness.setSnapshot(snapshot('2', [record(task, '2', '2')], []))
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(task, '2', '2')], []) })
    vi.advanceTimersByTime(100)
    await flushPromises()

    expect(harness.api.restoreTrashItem).toHaveBeenCalledWith({
      version: 1,
      contextSequence: expect.any(Number),
      entry: { taskId: 'a', contentRevision: '2', deletedAt: '2026-10-03T10:00:00.000Z' },
    })
    expect(view.text()).toContain('foi restaurada')
    expect(document.activeElement?.getAttribute('data-action')).toBe('back')
  })

  it('esvaziar exige confirmação irreversível; Escape abandona sem comando', async () => {
    const task = buildTask({ id: 'a', title: 'Fica' })
    const harness = setupHarness(snapshot('1', [], [trashRecord(task)]))
    const view = await mountManager()
    await buttonByText(view, 'Lixeira')?.trigger('click')
    await flushPromises()

    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'A'.repeat(32),
      revision: '1',
      itemCount: 1,
    })
    await buttonByText(view, 'Esvaziar lixeira')?.trigger('click')
    await flushPromises()

    expect(harness.api.prepareTrashConfirmation).toHaveBeenCalledWith({
      version: 1,
      contextSequence: expect.any(Number),
      kind: 'EMPTY',
    })
    expect(view.text()).toContain('irreversível')
    await view.find('[role="alertdialog"]').trigger('keydown.esc')
    await flushPromises()
    expect(harness.api.emptyTrash).not.toHaveBeenCalled()
    expect(view.text()).toContain('Fica')
  })
})

describe('excluir e desfazer na interface', () => {
  it('confirma a exclusão com aviso de 30 dias e oferece Desfazer após o snapshot', async () => {
    const task = buildTask({ id: 'a', title: 'Excluir-me' })
    const harness = setupHarness(snapshot('1', [record(task)]))
    const view = await mountManager()

    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'A'.repeat(32),
      revision: '1',
      itemCount: 1,
      hasRecurrence: false,
    })
    harness.api.moveTaskToTrash.mockResolvedValue({
      version: 1,
      status: 'ok',
      revision: '2',
      retained: true,
      undoToken: 'B'.repeat(32),
    })
    await view.get('[data-action="delete"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('30 dias')
    expect(view.text()).toContain('100')

    await view.find('[role="alertdialog"] button').trigger('click')
    await flushPromises()
    // Ack confirmado, mas a oferta só aparece com snapshot >= ack.
    expect(view.find('[data-action="undo"]').exists()).toBe(false)
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [], [trashRecord(task)]) })
    await flushPromises()
    expect(view.find('[data-action="undo"]').exists()).toBe(true)
    expect(view.text()).toContain('Desfazer')
  })

  it('move não retido avisa que não há recuperação e não oferece Desfazer', async () => {
    const task = buildTask({ id: 'a', title: 'Descartada' })
    const harness = setupHarness(snapshot('1', [record(task)]))
    const view = await mountManager()
    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'A'.repeat(32),
      revision: '1',
      itemCount: 1,
    })
    harness.api.moveTaskToTrash.mockResolvedValue({ version: 1, status: 'ok', revision: '2', retained: false })
    await view.get('[data-action="delete"]').trigger('click')
    await flushPromises()
    await view.find('[role="alertdialog"] button').trigger('click')
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', []) })
    await flushPromises()
    vi.advanceTimersByTime(100)
    await flushPromises()

    expect(view.text()).toContain('não foi retida')
    expect(view.find('[data-action="undo"]').exists()).toBe(false)
  })

  it('Desfazer usa o token próprio e recusa tardia exige conferência', async () => {
    const task = buildTask({ id: 'a', title: 'Desfazível' })
    const harness = setupHarness(snapshot('1', [record(task)]))
    const view = await mountManager()
    harness.api.prepareTrashConfirmation.mockResolvedValue({
      version: 1,
      status: 'ok',
      confirmationToken: 'A'.repeat(32),
      revision: '1',
      itemCount: 1,
    })
    harness.api.moveTaskToTrash.mockResolvedValue({
      version: 1,
      status: 'ok',
      revision: '2',
      retained: true,
      undoToken: 'B'.repeat(32),
    })
    await view.get('[data-action="delete"]').trigger('click')
    await flushPromises()
    await view.find('[role="alertdialog"] button').trigger('click')
    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [], [trashRecord(task)]) })
    await flushPromises()

    harness.api.undoLastTaskAction.mockResolvedValue({
      version: 1,
      status: 'ok',
      revision: '3',
      contentRevision: '3',
      editRevision: '3',
    })
    harness.setSnapshot(snapshot('3', [record(task, '3', '3')], []))
    await view.get('[data-action="undo"]').trigger('click')
    await flushPromises()
    harness.emit({ type: 'snapshot', snapshot: snapshot('3', [record(task, '3', '3')], []) })
    vi.advanceTimersByTime(100)
    await flushPromises()

    const call = harness.api.undoLastTaskAction.mock.calls[0]?.[0] as { undoToken: string; contextSequence: number }
    expect(call.undoToken).toBe('B'.repeat(32))
    expect(call.contextSequence).toBeGreaterThanOrEqual(1)
    expect(view.text()).toContain('desfeita')

    // Segunda tentativa (token consumido) recebe recusa segura e mensagem local.
    harness.api.moveTaskToTrash.mockResolvedValueOnce({
      version: 1,
      status: 'ok',
      revision: '4',
      retained: true,
      undoToken: 'C'.repeat(32),
    })
    harness.api.undoLastTaskAction.mockResolvedValueOnce({ version: 1, status: 'error', code: 'UNDO_NOT_AVAILABLE' })
    await view.get('[data-action="delete"]').trigger('click')
    await flushPromises()
    await view.find('[role="alertdialog"] button').trigger('click')
    harness.emit({ type: 'snapshot', snapshot: snapshot('4', [], [trashRecord(task, '2026-10-03T10:00:00.000Z', '4')]) })
    await flushPromises()
    await view.get('[data-action="undo"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('não está mais disponível')
  })
})
