import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '../../src/domain/task.js'
import TaskList from '../../src/renderer/src/components/tasks/TaskList.vue'
import { buildTask } from '../support/task-fixtures.js'

const NOW = new Date('2026-10-04T12:00:00.000Z')

afterEach(() => {
  document.body.innerHTML = ''
})

function mountList(tasks: Task[], busyTaskId: string | null = null): VueWrapper<InstanceType<typeof TaskList>> {
  return mount(TaskList, {
    props: { tasks, now: NOW, busyTaskId },
    attachTo: document.body,
  })
}

function statusSelect(wrapper: ReturnType<typeof mountList>, taskId: string) {
  const card = wrapper.get(`[data-task-id="${taskId}"]`)
  return card.get('select[data-action="status"]')
}

async function expandSubtasks(wrapper: ReturnType<typeof mountList>, taskId: string) {
  const card = wrapper.get(`[data-task-id="${taskId}"]`)
  await card.get('button[data-action="subtasks"]').trigger('click')
  return card
}

/** Expansão para IDs hostis: sem interpolar o ID em seletor. */
async function expandSubtasksFromCard(wrapper: ReturnType<typeof mountList>) {
  const card = wrapper.get('li.task-card')
  await card.get('button[data-action="subtasks"]').trigger('click')
  return card
}

describe('TaskList: seletor de status e teclado', () => {
  it('setas apenas escolhem; Enter confirma; Escape descarta; ponteiro confirma imediatamente', async () => {
    const task = buildTask({ id: 'a', status: 'TODO' })
    const wrapper = mountList([task])
    const select = statusSelect(wrapper, 'a')

    // Setas escolhem sem emitir; Enter confirma a escolha pendente.
    await select.trigger('keydown', { key: 'ArrowDown' })
    await select.setValue('DONE')
    expect(wrapper.emitted('change-status')).toBeUndefined()
    await select.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('change-status')?.[0]?.[1]).toBe('DONE')

    // Escape descarta antes de Enter.
    const second = mountList([buildTask({ id: 'b', status: 'TODO' })])
    const selectB = statusSelect(second, 'b')
    await selectB.trigger('keydown', { key: 'ArrowUp' })
    await selectB.setValue('CANCELLED')
    await selectB.trigger('keydown', { key: 'Escape' })
    await selectB.trigger('keydown', { key: 'Enter' })
    expect(second.emitted('change-status')).toBeUndefined()

    // Ponteiro (change sem navegação) confirma imediatamente.
    const third = mountList([buildTask({ id: 'c', status: 'IN_PROGRESS' })])
    const selectC = statusSelect(third, 'c')
    await selectC.setValue('DONE')
    expect(third.emitted('change-status')?.[0]?.[1]).toBe('DONE')
  })

  it('saída de foco confirma a escolha pendente preservando o foco já movido', async () => {
    const wrapper = mountList([buildTask({ id: 'a', status: 'TODO' })])
    const select = statusSelect(wrapper, 'a')
    await select.trigger('keydown', { key: 'ArrowDown' })
    await select.setValue('IN_PROGRESS')
    await select.trigger('focusout')
    const emitted = wrapper.emitted('change-status')
    expect(emitted?.[0]?.[1]).toBe('IN_PROGRESS')
    expect((emitted?.[0]?.[2] as { fromFocusout: boolean }).fromFocusout).toBe(true)
  })

  it('CANCELLED recorrente por saída de foco restaura a seleção sem diálogo nem comando', async () => {
    const task = buildTask({ id: 'rec', status: 'TODO', seriesId: 's', recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    const wrapper = mountList([task])
    const select = statusSelect(wrapper, 'rec')

    await select.trigger('keydown', { key: 'ArrowDown' })
    await select.setValue('CANCELLED')
    expect(wrapper.emitted('change-status')).toBeUndefined()

    await select.trigger('focusout')
    expect(wrapper.emitted('change-status')).toBeUndefined()
    expect((select.element as HTMLSelectElement).value).toBe('TODO')

    // Enter no mesmo seletor continua emitindo: a escolha SKIP/END é do gerente.
    await select.setValue('CANCELLED')
    await select.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('change-status')?.[0]?.[1]).toBe('CANCELLED')
  })

  it('foco perdido após confirmar por saída de foco não é roubado', async () => {
    const wrapper = mountList([buildTask({ id: 'a', status: 'TODO' })])
    const select = statusSelect(wrapper, 'a')
    const editButton = wrapper.get('button[data-action="edit"]')
    await select.trigger('keydown', { key: 'ArrowDown' })
    await select.setValue('DONE')
    ;(editButton.element as HTMLElement).focus()
    await select.trigger('focusout')
    expect(wrapper.emitted('change-status')?.[0]?.[1]).toBe('DONE')
    expect(document.activeElement).toBe(editButton.element)
  })

  it('controle ocupado conserva foco com aria-disabled e ignora novo comando', async () => {
    const task = buildTask({ id: 'a', status: 'TODO', subtasks: [{ id: 's1', title: 'Passo', done: false }] })
    const wrapper = mountList([task], 'a')
    const card = wrapper.get('[data-task-id="a"]')
    const select = card.get('select[data-action="status"]')
    expect(select.attributes('aria-disabled')).toBe('true')

    ;(select.element as HTMLSelectElement).value = 'DONE'
    await select.trigger('change')
    await select.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('change-status')).toBeUndefined()
    expect(wrapper.get('button[data-action="edit"]').attributes('aria-disabled')).toBe('true')

    await card.get('button[data-action="edit"]').trigger('click')
    expect(wrapper.emitted('edit')).toBeUndefined()

    // Checkbox ocupado: focável, aria-disabled e sem nova intenção.
    const expanded = await expandSubtasks(wrapper, 'a')
    const checkbox = expanded.get('input[type="checkbox"]')
    expect(checkbox.attributes('aria-disabled')).toBe('true')
    ;(checkbox.element as HTMLElement).focus()
    await checkbox.trigger('click')
    expect(wrapper.emitted('toggle-subtask')).toBeUndefined()
  })
})

describe('TaskList: recorrência e cartão', () => {
  it('recorrência presente mostra resumo com limite e mantém os mutadores de status', async () => {
    const task = buildTask({
      id: 'rec',
      seriesId: 's',
      recurrence: { frequency: 'WEEKLY', weekdays: [1, 3], until: '2026-12-31T02:30:00.000Z' },
    })
    const wrapper = mountList([task])

    expect(wrapper.get('[data-test="recurrence-badge"]').text()).toBe('Recorrente')
    const summary = wrapper.get('[data-test="recurrence-summary"]').text()
    expect(summary).toContain('Semanalmente: seg, qua')
    expect(summary).toContain('limite')
    expect(wrapper.find('button[data-action="complete"]').exists()).toBe(true)
    expect(wrapper.find('button[data-action="cancel"]').exists()).toBe(true)
    expect(wrapper.find('select[data-action="status"]').exists()).toBe(true)

    await wrapper.get('button[data-action="edit"]').trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('checkbox de subtarefa expressa a intenção inversa em qualquer status sem marcar o DOM', async () => {
    const statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
    const tasks = statuses.map((status, index) =>
      buildTask({
        id: `t${index}`,
        status,
        subtasks: [{ id: `s${index}`, title: `Passo ${index}`, done: false }],
      }),
    )
    const wrapper = mountList(tasks)

    for (const [index] of statuses.entries()) {
      const card = await expandSubtasks(wrapper, `t${index}`)
      const checkbox = card.get('input[type="checkbox"]')
      expect((checkbox.element as HTMLInputElement).checked).toBe(false)
      await checkbox.trigger('click')
      // Sem confirmação no snapshot, o DOM não inventa marcação.
      expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    }

    const emissions = wrapper.emitted('toggle-subtask')
    expect(emissions).toHaveLength(4)
    expect(emissions?.map((entry) => [entry[1], entry[2]])).toEqual([
      ['s0', true],
      ['s1', true],
      ['s2', true],
      ['s3', true],
    ])
  })

  it('desmarcar intenção envia done false; expansão é transitória e não emite comando', async () => {
    const task = buildTask({
      id: 'sub',
      subtasks: [
        { id: 's1', title: 'Feito', done: true },
        { id: 's2', title: 'Pendente', done: false },
      ],
    })
    const wrapper = mountList([task])
    const toggle = wrapper.get('button[data-action="subtasks"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    const checkbox = wrapper.get('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    await checkbox.trigger('click')
    expect(wrapper.emitted('toggle-subtask')?.[0]?.[2]).toBe(false)

    // Expansão não emite nenhum comando nem persiste preferência.
    expect(wrapper.emitted('edit')).toBeUndefined()
    expect(wrapper.emitted('change-status')).toBeUndefined()

    const remounted = mountList([task])
    expect(remounted.get('button[data-action="subtasks"]').attributes('aria-expanded')).toBe('false')
  })

  it('progresso vem do snapshot e concluir/reabrir não limpa checks', async () => {
    const task = buildTask({
      id: 'sub',
      status: 'TODO',
      subtasks: [
        { id: 's1', title: 'Um', done: true },
        { id: 's2', title: 'Dois', done: false },
      ],
    })
    const wrapper = mountList([task])
    expect(wrapper.get('[data-test="subtask-progress"]').text()).toBe('1 de 2')

    // Nova prop com status terminal e as mesmas marcações: contador e checks permanecem.
    const typed = wrapper as unknown as { setProps(props: Record<string, unknown>): Promise<void> }
    await typed.setProps({ tasks: [buildTask({ ...task, status: 'DONE' })] })
    expect(wrapper.get('[data-test="subtask-progress"]').text()).toBe('1 de 2')
    const expanded = await expandSubtasks(wrapper, 'sub')
    const boxes = expanded.findAll('input[type="checkbox"]')
    expect((boxes[0]?.element as HTMLInputElement).checked).toBe(true)
    expect((boxes[1]?.element as HTMLInputElement).checked).toBe(false)
  })

  it('IDs hostis não quebram a busca de controle para foco nem levam foco ao body', async () => {
    const hostileId = 'a"] [data-action="edit'
    const hostileSubtaskId = 's"] [data-action="move'
    const wrapper = mountList([buildTask({ id: hostileId, subtasks: [{ id: hostileSubtaskId, title: 'Passo', done: false }] })])
    const exposed = wrapper.vm as unknown as {
      focusControl(taskId: string, action: string): boolean
      focusSubtask(taskId: string, subtaskId: string): boolean
    }

    const control = wrapper.get('button[data-action="edit"]')
    expect(exposed.focusControl(hostileId, 'edit')).toBe(true)
    expect(document.activeElement).toBe(control.element)
    expect(exposed.focusControl('inexistente', 'edit')).toBe(false)

    const card = await expandSubtasksFromCard(wrapper)
    const checkbox = card.get('input[type="checkbox"]')
    expect(exposed.focusSubtask(hostileId, hostileSubtaskId)).toBe(true)
    expect(document.activeElement).toBe(checkbox.element)
    expect(exposed.focusSubtask(hostileId, 'ausente')).toBe(false)
  })

  it('mostra badge de prazo apenas para tarefa ativa com prazo', () => {
    const wrapper = mountList([
      buildTask({ id: 'atrasada', dueAt: '2026-10-04T11:00:00.000Z' }),
      buildTask({ id: 'concluida', status: 'DONE', dueAt: '2026-10-04T11:00:00.000Z' }),
      buildTask({ id: 'sem-prazo', dueAt: undefined }),
    ])
    const badges = wrapper.findAll('[data-test="due-situation"]')
    expect(badges).toHaveLength(1)
    expect(badges[0]?.text()).toBe('Atrasada')
  })
})
