import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskCommandTransportError } from '../../src/application/tasks/task-client.js'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import type { StateSnapshot, StateUpdate, TaskRecord } from '../../src/contracts/state.js'
import type { Task } from '../../src/domain/task.js'
import TaskManager from '../../src/renderer/src/components/tasks/TaskManager.vue'
import { buildTask } from '../support/task-fixtures.js'

let wrapper: VueWrapper | undefined

function record(task: Task, contentRevision = '1'): TaskRecord {
  return { task, contentRevision }
}

function snapshot(revision: string, tasks: TaskRecord[]): StateSnapshot {
  return { revision, tasks, trash: [] }
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
    openTaskSource: Mock
  }
  emit(update: StateUpdate): void
  setSnapshot(next: StateSnapshot): void
}

function setupHarness(initial: StateSnapshot, subscribeFails = false): Harness {
  let current = initial
  let listener: ((update: StateUpdate) => void) | undefined

  const api = {
    verifyFoundation: vi.fn(),
    getStateSnapshot: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const, snapshot: current })),
    subscribeState: vi.fn(async (_request: unknown, next?: (update: StateUpdate) => void) => {
      if (subscribeFails) return { version: 1 as const, status: 'error' as const, code: 'STORAGE_UNAVAILABLE' as const }
      listener = next
      return { version: 1 as const, status: 'ok' as const, subscriptionId: 'sub'.padEnd(24, 'S'), snapshot: current }
    }),
    unsubscribeState: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const })),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    openTaskSource: vi.fn(),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api as unknown as TaskFlowDesktopApi })

  return {
    api,
    emit: (update) => listener?.(update),
    setSnapshot: (next) => {
      current = next
    },
  }
}

async function mountManager(): Promise<VueWrapper> {
  setActivePinia(createPinia())
  wrapper = mount(TaskManager, { attachTo: document.body })
  await flushPromises()
  return wrapper
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

describe('TaskManager: estados e fluxo básico', () => {
  it('erro inicial mostra estado bloqueado com Retry; vazio real oferece Criar primeira tarefa', async () => {
    setupHarness(snapshot('1', []), true)
    const blocked = await mountManager()
    expect(blocked.text()).toContain('armazenamento local está indisponível')
    expect(blocked.get('.state-error button').text()).toContain('Tentar novamente')

    setupHarness(snapshot('1', []))
    const empty = await mountManager()
    expect(empty.text()).toContain('Nenhuma tarefa ainda')
    expect(empty.text()).toContain('Criar primeira tarefa')
  })

  it('sem resultados usa Limpar filtros e não trata como vazio', async () => {
    setupHarness(snapshot('1', [record(buildTask({ id: 'a', title: 'Alfa' }))]))
    const view = await mountManager()
    expect(view.text()).toContain('1 de 1')

    await view.get('input[type="search"]').setValue('inexistente')
    await flushPromises()
    expect(view.text()).toContain('Nenhuma tarefa encontrada')
    expect(view.text()).toContain('Limpar filtros')
  })

  it('cria: formulário só fecha após snapshot >= ack, com feedback de confirmação', async () => {
    const harness = setupHarness(snapshot('1', []))
    const view = await mountManager()

    await view.get('button').trigger('click')
    await view.get('input[name="title"]').setValue('Comprar leite')
    harness.api.createTask.mockResolvedValue({ version: 1, status: 'ok', taskId: 'nova', revision: '2', contentRevision: '2' })
    await view.get('form').trigger('submit')
    await flushPromises()

    expect(harness.api.createTask).toHaveBeenCalledTimes(1)
    expect((harness.api.createTask.mock.calls[0]?.[0] as { draft: { title: string } }).draft.title).toBe('Comprar leite')
    // Ack confirmado: formulário permanece com mensagem de sincronização até o snapshot chegar.
    expect(view.find('form').exists()).toBe(true)
    expect(view.text()).toContain('sincronizando a lista')

    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(buildTask({ id: 'nova', title: 'Comprar leite' }), '2')]) })
    await flushPromises()
    expect(view.find('form').exists()).toBe(false)
    expect(view.text()).toContain('Tarefa criada.')
    expect(view.text()).toContain('Comprar leite')
  })

  it('conflito preserva draft, confere versão em leitura e recarrega só com descarte explícito', async () => {
    const original = buildTask({ id: 'a', title: 'Original' })
    const harness = setupHarness(snapshot('4', [record(original, '4')]))
    const view = await mountManager()

    await view.get('button[data-action="edit"]').trigger('click')
    await view.get('input[name="title"]').setValue('Meu draft')
    harness.api.updateTask.mockResolvedValue({
      version: 1,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '7',
    })
    await view.get('form').trigger('submit')
    await flushPromises()

    expect(view.text()).toContain('A tarefa mudou')
    expect((view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Meu draft')

    // Primeiro botão do painel: Conferir versão atual.
    await view.findAll('button').find((button) => button.text().includes('Conferir versão atual'))?.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Versão atual (somente leitura)')

    const updated = snapshot('8', [record(buildTask({ id: 'a', title: 'Mais nova' }), '6')])
    harness.setSnapshot(updated)
    harness.emit({ type: 'snapshot', snapshot: updated })
    const reload = view.findAll('button').find((button) => button.text() === 'Recarregar tarefa')
    await reload?.trigger('click')
    const confirm = view.findAll('button').find((button) => button.text() === 'Descartar e recarregar')
    await confirm?.trigger('click')
    await flushPromises()

    expect((view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Mais nova')
    expect(view.text()).not.toContain('A tarefa mudou')
  })

  it('resultado incerto exige Conferir lista por ressync antes de decidir', async () => {
    const harness = setupHarness(snapshot('1', []))
    const view = await mountManager()

    await view.get('button').trigger('click')
    await view.get('input[name="title"]').setValue('Talvez')
    harness.api.createTask.mockRejectedValueOnce(new TaskCommandTransportError())
    await view.get('form').trigger('submit')
    await flushPromises()

    expect(view.text()).toContain('Resultado incerto')
    expect(view.text()).toContain('Nada é reenviado automaticamente')

    await view.findAll('button').find((button) => button.text() === 'Conferir lista')?.trigger('click')
    await flushPromises()
    expect(view.text()).not.toContain('Nada é reenviado automaticamente')
    expect(view.text()).toContain('Lista conferida')
    expect(harness.api.getStateSnapshot).toHaveBeenCalled()
  })

  it('ação rápida de status usa a revisão do snapshot e anuncia o resultado', async () => {
    const task = buildTask({ id: 'a', title: 'Concluir', status: 'TODO' })
    const harness = setupHarness(snapshot('3', [record(task, '3')]))
    const view = await mountManager()

    harness.api.changeTaskStatus.mockResolvedValue({ version: 1, status: 'ok', revision: '4', contentRevision: '4' })
    await view.get('button[data-action="complete"]').trigger('click')
    await flushPromises()

    expect(harness.api.changeTaskStatus).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      taskId: 'a',
      expectedContentRevision: '3',
      status: 'DONE',
    })
    expect(view.text()).toContain('Status de “Concluir” alterado para Concluída.')
  })

  it('abrir origem salva comunica o significado limitado do sucesso', async () => {
    const task = buildTask({ id: 'a', sourceUrl: 'https://example.test/x' })
    const harness = setupHarness(snapshot('2', [record(task, '2')]))
    const view = await mountManager()

    await view.get('button[data-action="edit"]').trigger('click')
    harness.api.openTaskSource.mockResolvedValue({ version: 1, status: 'ok' })
    await view.get('button[data-action="open-source"]').trigger('click')
    await flushPromises()

    expect(view.text()).toContain('não confirma que a página foi carregada')
    expect(harness.api.openTaskSource).toHaveBeenCalledExactlyOnceWith({
      version: 1,
      taskId: 'a',
      expectedContentRevision: '2',
    })
  })
})
