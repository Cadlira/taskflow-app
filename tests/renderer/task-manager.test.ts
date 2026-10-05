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

function record(task: Task, contentRevision = '1', editRevision = contentRevision): TaskRecord {
  return { task, contentRevision, editRevision }
}

function snapshot(revision: string, tasks: TaskRecord[], undoEpoch = 1): StateSnapshot {
  return { revision, undoEpoch, tasks, trash: [] }
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

function setupHarness(initial: StateSnapshot, subscribeFails = false): Harness {
  let current = initial
  let listener: ((update: StateUpdate) => void) | undefined

  const api = {
    verifyFoundation: vi.fn(),
    getStateSnapshot: vi.fn(async () => ({ version: 3 as const, status: 'ok' as const, snapshot: current })),
    subscribeState: vi.fn(async (_request: unknown, next?: (update: StateUpdate) => void) => {
      if (subscribeFails) return { version: 3 as const, status: 'error' as const, code: 'STORAGE_UNAVAILABLE' as const }
      listener = next
      return { version: 3 as const, status: 'ok' as const, subscriptionId: 'sub'.padEnd(24, 'S'), snapshot: current }
    }),
    unsubscribeState: vi.fn(async () => ({ version: 3 as const, status: 'ok' as const })),
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
    prepareTrashView: vi.fn(),
    undoLastTaskAction: vi.fn(),
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

  it('cria: envia v3, formulário só fecha após snapshot >= ack, com feedback de confirmação', async () => {
    const harness = setupHarness(snapshot('1', []))
    const view = await mountManager()

    await view.get('button').trigger('click')
    await view.get('input[name="title"]').setValue('Comprar leite')
    harness.api.createTask.mockResolvedValue({
      version: 3,
      status: 'ok',
      outcome: 'APPLIED',
      taskId: 'nova',
      revision: '2',
      contentRevision: '2',
      editRevision: '2',
    })
    await view.get('form').trigger('submit')
    await flushPromises()

    expect(harness.api.createTask).toHaveBeenCalledTimes(1)
    expect(harness.api.createTask.mock.calls[0]?.[0]).toMatchObject({ version: 3, draft: { title: 'Comprar leite' } })
    // Ack confirmado: formulário permanece com mensagem de sincronização até o snapshot chegar.
    expect(view.find('form').exists()).toBe(true)
    expect(view.text()).toContain('sincronizando a lista')

    harness.emit({ type: 'snapshot', snapshot: snapshot('2', [record(buildTask({ id: 'nova', title: 'Comprar leite' }), '2', '2')]) })
    await flushPromises()
    expect(view.find('form').exists()).toBe(false)
    expect(view.text()).toContain('Tarefa criada.')
    expect(view.text()).toContain('Comprar leite')
  })

  it('conflito preserva draft, confere versão em leitura e recarrega só com descarte explícito', async () => {
    const original = buildTask({ id: 'a', title: 'Original' })
    const harness = setupHarness(snapshot('4', [record(original, '4', '4')]))
    const view = await mountManager()

    await view.get('button[data-action="edit"]').trigger('click')
    await view.get('input[name="title"]').setValue('Meu draft')
    harness.api.updateTask.mockResolvedValue({
      version: 4,
      status: 'error',
      code: 'CONFLICT',
      currentContentRevision: '7',
      currentEditRevision: '9',
    })
    await view.get('form').trigger('submit')
    await flushPromises()

    expect(view.text()).toContain('A tarefa mudou')
    expect((view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Meu draft')

    // Primeiro botão do painel: Conferir versão atual.
    await buttonByText(view, 'Conferir versão atual')?.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Versão atual (somente leitura)')

    const updated = snapshot('8', [record(buildTask({ id: 'a', title: 'Mais nova' }), '6', '11')])
    harness.setSnapshot(updated)
    harness.emit({ type: 'snapshot', snapshot: updated })
    await buttonByText(view, 'Recarregar tarefa')?.trigger('click')
    await buttonByText(view, 'Descartar e recarregar')?.trigger('click')
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

    await buttonByText(view, 'Conferir lista')?.trigger('click')
    await flushPromises()
    expect(view.text()).not.toContain('Nada é reenviado automaticamente')
    expect(view.text()).toContain('Lista conferida')
    expect(harness.api.getStateSnapshot).toHaveBeenCalled()
  })

  it('ação rápida de status usa a revisão de edição do snapshot e anuncia o resultado', async () => {
    const task = buildTask({ id: 'a', title: 'Concluir', status: 'TODO' })
    const harness = setupHarness(snapshot('3', [record(task, '3', '5')]))
    const view = await mountManager()

    harness.api.changeTaskStatus.mockResolvedValue({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '4',
      contentRevision: '4',
      editRevision: '6',
      undoEpoch: 1,
    })
    await view.get('button[data-action="complete"]').trigger('click')
    await flushPromises()

    expect(harness.api.changeTaskStatus).toHaveBeenCalledExactlyOnceWith({
      version: 4,
      contextSequence: expect.any(Number),
      taskId: 'a',
      expectedEditRevision: '5',
      status: 'DONE',
    })
    expect(view.text()).toContain('Status de “Concluir” alterado para Concluída.')
  })

  it('abrir origem salva comunica o significado limitado do sucesso', async () => {
    const task = buildTask({ id: 'a', sourceUrl: 'https://example.test/x' })
    const harness = setupHarness(snapshot('2', [record(task, '2', '2')]))
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

describe('TaskManager: cancelamento recorrente SKIP/END', () => {
  const recurring = () => buildTask({ id: 'rec', title: 'Rotina', status: 'TODO', seriesId: 's', recurrence: { frequency: 'DAILY', intervalDays: 1 } })

  it('diálogo abandonado não grava, conserva a base e devolve o foco ao controle', async () => {
    const harness = setupHarness(snapshot('3', [record(recurring(), '3', '3')]))
    const view = await mountManager()

    harness.api.changeTaskStatus.mockResolvedValue({ version: 4, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
    const cancelButton = view.get('button[data-action="cancel"]')
    ;(cancelButton.element as HTMLElement).focus()
    await cancelButton.trigger('click')
    await flushPromises()

    // Nada é gravado antes da escolha: um único comando, sem cancellation.
    expect(harness.api.changeTaskStatus).toHaveBeenCalledTimes(1)
    expect(harness.api.changeTaskStatus.mock.calls[0]?.[0]).toMatchObject({
      taskId: 'rec',
      expectedEditRevision: '3',
      status: 'CANCELLED',
    })
    const dialog = view.get('[data-test="cancellation-dialog"]')
    expect(dialog.text()).toContain('Nada foi gravado ainda')
    expect(document.activeElement).toBe(dialog.get('button').element)

    await buttonByText(view, 'Voltar sem alterar')?.trigger('click')
    await flushPromises()
    expect(view.find('[data-test="cancellation-dialog"]').exists()).toBe(false)
    expect(harness.api.changeTaskStatus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(view.get('button[data-action="cancel"]').element)
    // A base continua a mesma: o seletor exibe o status persistido.
    expect((view.get('select[data-action="status"]').element as HTMLSelectElement).value).toBe('TODO')
  })

  it('Escape abandona sem write; escolher SKIP reenvia com a mesma revisão e cancellation', async () => {
    const harness = setupHarness(snapshot('3', [record(recurring(), '3', '3')]))
    const view = await mountManager()

    harness.api.changeTaskStatus
      .mockResolvedValueOnce({ version: 4, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
      .mockResolvedValueOnce({ version: 4, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
      .mockResolvedValueOnce({ version: 4, status: 'ok', revision: '4', contentRevision: '4', editRevision: '4', undoEpoch: 1 })

    await view.get('button[data-action="cancel"]').trigger('click')
    await flushPromises()
    await view.get('[data-test="cancellation-dialog"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(view.find('[data-test="cancellation-dialog"]').exists()).toBe(false)
    expect(harness.api.changeTaskStatus).toHaveBeenCalledTimes(1)

    await view.get('button[data-action="cancel"]').trigger('click')
    await flushPromises()
    await buttonByText(view, 'Pular esta ocorrência')?.trigger('click')
    await flushPromises()

    expect(harness.api.changeTaskStatus).toHaveBeenCalledTimes(3)
    expect(harness.api.changeTaskStatus.mock.calls[2]?.[0]).toEqual({
      version: 4,
      contextSequence: expect.any(Number),
      taskId: 'rec',
      expectedEditRevision: '3',
      status: 'CANCELLED',
      cancellation: 'SKIP',
    })
    expect(view.text()).toContain('Status de “Rotina” alterado para Cancelada.')
  })

  it('save do formulário pede a escolha sem gravar e reenvia o patch com a escolha END', async () => {
    const harness = setupHarness(snapshot('3', [record(recurring(), '3', '3')]))
    const view = await mountManager()

    await view.get('button[data-action="edit"]').trigger('click')
    await view.get('select[name="status"]').setValue('CANCELLED')
    await view.get('input[name="title"]').setValue('Rotina nova')

    harness.api.updateTask
      .mockResolvedValueOnce({ version: 4, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
      .mockResolvedValueOnce({ version: 4, status: 'ok', revision: '4', contentRevision: '4', editRevision: '4', undoEpoch: 1 })

    await view.get('form').trigger('submit')
    await flushPromises()

    expect(harness.api.updateTask).toHaveBeenCalledTimes(1)
    expect(harness.api.updateTask.mock.calls[0]?.[0]).toMatchObject({
      expectedEditRevision: '3',
      patch: { title: 'Rotina nova', status: 'CANCELLED' },
    })
    expect('cancellation' in (harness.api.updateTask.mock.calls[0]?.[0] as Record<string, unknown>)).toBe(false)
    expect((view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Rotina nova')

    await buttonByText(view, 'Encerrar a série')?.trigger('click')
    await flushPromises()

    expect(harness.api.updateTask).toHaveBeenCalledTimes(2)
    expect(harness.api.updateTask.mock.calls[1]?.[0]).toMatchObject({
      taskId: 'rec',
      expectedEditRevision: '3',
      patch: { title: 'Rotina nova', status: 'CANCELLED' },
      cancellation: 'END',
    })

    // Sem snapshot >= ack, o formulário continua com o preenchimento; com o snapshot, fecha.
    harness.emit({ type: 'snapshot', snapshot: snapshot('4', [record(buildTask({ id: 'rec', title: 'Rotina nova', status: 'CANCELLED' }), '4', '4')]) })
    await flushPromises()
    expect(view.find('form').exists()).toBe(false)
    expect(view.text()).toContain('Alterações salvas.')
  })

  it('CONFLICT posterior à abertura do diálogo não troca a base em silêncio', async () => {
    const harness = setupHarness(snapshot('3', [record(recurring(), '3', '3')]))
    const view = await mountManager()

    harness.api.changeTaskStatus
      .mockResolvedValueOnce({ version: 4, status: 'error', code: 'RECURRENCE_CHOICE_REQUIRED' })
      .mockResolvedValueOnce({
        version: 4,
        status: 'error',
        code: 'CONFLICT',
        currentContentRevision: '9',
        currentEditRevision: '9',
      })

    await view.get('button[data-action="cancel"]').trigger('click')
    await flushPromises()
    await buttonByText(view, 'Pular esta ocorrência')?.trigger('click')
    await flushPromises()

    // A escolha reutiliza a revisão capturada; o conflito aparece e a base não é recarregada.
    expect(harness.api.changeTaskStatus.mock.calls[1]?.[0]).toMatchObject({ expectedEditRevision: '3', cancellation: 'SKIP' })
    expect(view.text()).toContain('A tarefa mudou')
    expect((view.get('select[data-action="status"]').element as HTMLSelectElement).value).toBe('TODO')
    // Sem recarga explícita, a versão em exibição continua a base antiga.
    expect(view.text()).toContain('Rotina')
    expect(view.find('[data-test="cancellation-dialog"]').exists()).toBe(false)
  })
})

describe('TaskManager: D8, subtarefas e foco', () => {
  it('guarda D8 bloqueia prazo/status com motivo e libera edição independente', async () => {
    const task = buildTask({
      id: 'lem',
      title: 'Com lembretes',
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
    })
    const harness = setupHarness(snapshot('2', [record(task, '2', '2')]))
    const view = await mountManager()

    // Status com lembretes: recusa do main vira o motivo D8 no aviso da lista.
    harness.api.changeTaskStatus.mockResolvedValueOnce({ version: 4, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })
    await view.get('button[data-action="complete"]').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Esta tarefa tem lembretes. Alterar prazo ou status e gerar outra ocorrência depende da integração de lembretes.')
    expect((view.get('select[data-action="status"]').element as HTMLSelectElement).value).toBe('TODO')

    // Edição independente (título) é aceita pelo main e conclui normalmente.
    await view.get('button[data-action="edit"]').trigger('click')
    await view.get('input[name="title"]').setValue('Título novo')
    harness.api.updateTask.mockResolvedValueOnce({ version: 4, status: 'ok', outcome: 'APPLIED', revision: '3', contentRevision: '3', editRevision: '3', undoEpoch: 1 })
    await view.get('form').trigger('submit')
    await flushPromises()
    harness.emit({ type: 'snapshot', snapshot: snapshot('3', [record(buildTask({ id: 'lem', title: 'Título novo', reminders: task.reminders }), '3', '3')]) })
    await flushPromises()
    expect(view.find('form').exists()).toBe(false)
    expect(view.text()).toContain('Título novo')

    // Mudança efetiva de prazo no formulário recebe o mesmo motivo D8.
    await view.get('button[data-action="edit"]').trigger('click')
    await view.get('input[name="dueAt"]').setValue('2026-10-10T10:00')
    harness.api.updateTask.mockResolvedValueOnce({ version: 4, status: 'error', code: 'ADVANCED_TASK_RESTRICTED' })
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.text()).toContain('Esta tarefa tem lembretes.')
    expect((view.get('input[name="dueAt"]').element as HTMLInputElement).value).toBe('2026-10-10T10:00')
  })

  it('marcação de subtarefa confirma pelo snapshot e falha de item ausente recupera o controle', async () => {
    const task = buildTask({
      id: 'sub',
      title: 'Com passos',
      subtasks: [{ id: 's1', title: 'Passo', done: false }],
    })
    const harness = setupHarness(snapshot('2', [record(task, '2', '2')]))
    const view = await mountManager()

    await view.get('button[data-action="subtasks"]').trigger('click')
    const checkbox = view.get('input[type="checkbox"]')
    ;(checkbox.element as HTMLElement).focus()

    harness.api.setSubtaskDone.mockResolvedValueOnce({
      version: 3,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '3',
      contentRevision: '3',
      editRevision: '2',
    })
    await checkbox.trigger('click')
    await flushPromises()

    expect(harness.api.setSubtaskDone).toHaveBeenCalledExactlyOnceWith({
      version: 3,
      contextSequence: expect.any(Number),
      taskId: 'sub',
      expectedEditRevision: '2',
      subtaskId: 's1',
      done: true,
    })
    expect(view.text()).toContain('Subtarefa marcada.')

    // Snapshot confirma a marcação: progresso e checkbox vêm dele.
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('3', [record(buildTask({ id: 'sub', title: 'Com passos', subtasks: [{ id: 's1', title: 'Passo', done: true }] }), '3', '2')]),
    })
    await flushPromises()
    expect(view.get('[data-test="subtask-progress"]').text()).toBe('1 de 1')

    // Item ausente: erro claro e foco no controle do cartão, sem marcação falsa. O snapshot que
    // remove o item chega antes da resposta para exercitar a recuperação de foco do gerente.
    harness.api.setSubtaskDone.mockResolvedValueOnce({ version: 3, status: 'error', code: 'SUBTASK_NOT_FOUND' })
    await view.get('input[type="checkbox"]').trigger('click')
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('4', [record(buildTask({ id: 'sub', title: 'Com passos' }), '4', '2')]),
    })
    await flushPromises()
    expect(view.text()).toContain('A subtarefa não está mais na tarefa; nada foi marcado.')
    expect(view.find('input[type="checkbox"]').exists()).toBe(false)
    expect(document.activeElement).toBe(view.get('button[data-action="edit"]').element)
  })

  it('cancelar o formulário não grava e a lista mantém os dados confirmados', async () => {
    const task = buildTask({ id: 'a', title: 'Original' })
    const harness = setupHarness(snapshot('2', [record(task, '2', '2')]))
    const view = await mountManager()

    await view.get('button[data-action="edit"]').trigger('click')
    await view.get('input[name="title"]').setValue('Rascunho')
    await buttonByText(view, 'Cancelar')?.trigger('click')
    await flushPromises()

    expect(view.find('form').exists()).toBe(false)
    expect(harness.api.updateTask).not.toHaveBeenCalled()
    expect(view.text()).toContain('Original')

    await view.get('button[data-action="edit"]').trigger('click')
    expect((view.get('input[name="title"]').element as HTMLInputElement).value).toBe('Original')
  })

  it('cartão que sai pelos filtros e ocorrência gerada mantêm o foco de vizinho equivalente', async () => {
    const recurrenceTask = buildTask({
      id: 'a',
      title: 'Rotina',
      status: 'TODO',
      dueAt: '2026-10-05T10:00:00.000Z',
      seriesId: 's',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    })
    const second = buildTask({ id: 'b', title: 'Segunda', dueAt: '2026-10-06T10:00:00.000Z' })
    const harness = setupHarness(snapshot('3', [record(recurrenceTask, '3', '3'), record(second, '3', '3')]))
    const view = await mountManager()

    // Filtro por TODO: concluir remove a ocorrência atual da lista e a próxima entra nela.
    await view.get('.filters select[id$="-status"]').setValue('TODO')
    await flushPromises()

    harness.api.changeTaskStatus.mockResolvedValueOnce({
      version: 4,
      status: 'ok',
      outcome: 'APPLIED',
      revision: '4',
      contentRevision: '4',
      editRevision: '4',
      undoEpoch: 1,
    })
    await view.get('[data-task-id="a"] button[data-action="complete"]').trigger('click')
    await flushPromises()

    const generated = buildTask({ id: 'c', title: 'Rotina (próxima)', dueAt: '2026-10-07T10:00:00.000Z' })
    harness.emit({
      type: 'snapshot',
      snapshot: snapshot('4', [
        record(buildTask({ ...recurrenceTask, status: 'DONE', recurrence: undefined }), '4', '4'),
        record(second, '3', '3'),
        record(generated, '4', '4'),
      ]),
    })
    await flushPromises()

    // A antiga saiu do filtro, a gerada entrou e o foco foi para o vizinho equivalente.
    expect(view.find('[data-task-id="a"]').exists()).toBe(false)
    expect(view.text()).toContain('Rotina (próxima)')
    expect(document.activeElement).toBe(view.get('[data-task-id="b"] button[data-action="edit"]').element)
  })
})
