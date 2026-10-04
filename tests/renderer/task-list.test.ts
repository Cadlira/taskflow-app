import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '../../src/domain/task.js'
import TaskList from '../../src/renderer/src/components/tasks/TaskList.vue'
import { buildTask } from '../support/task-fixtures.js'

const NOW = new Date('2026-10-04T12:00:00.000Z')

afterEach(() => {
  document.body.innerHTML = ''
})

function mountList(tasks: Task[], busyTaskId: string | null = null) {
  return mount(TaskList, {
    props: { tasks, now: NOW, busyTaskId },
    attachTo: document.body,
  })
}

function statusSelect(wrapper: ReturnType<typeof mountList>, taskId: string) {
  const card = wrapper.get(`[data-task-id="${taskId}"]`)
  return card.get('select[data-action="status"]')
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

  it('controle ocupado conserva foco com aria-disabled e ignora novo comando', async () => {
    const wrapper = mountList([buildTask({ id: 'a', status: 'TODO' })], 'a')
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
  })

  it('recorrência presente: badge, aviso e sem mutadores; Editar continua disponível', async () => {
    const task = buildTask({ id: 'rec', recurrence: { frequency: 'DAILY', intervalDays: 1 }, seriesId: 's' })
    const wrapper = mountList([task])

    expect(wrapper.get('[data-test="recurrence-badge"]').text()).toBe('Recorrente')
    expect(wrapper.get('[data-test="recurrence-restriction"]').text()).toContain('somente leitura')
    expect(wrapper.find('button[data-action="complete"]').exists()).toBe(false)
    expect(wrapper.find('button[data-action="reopen"]').exists()).toBe(false)
    expect(wrapper.find('select[data-action="status"]').exists()).toBe(false)

    await wrapper.get('button[data-action="edit"]').trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
  })

  it('subtarefas existentes são somente leitura, com progresso e sem checkbox', async () => {
    const task = buildTask({
      id: 'sub',
      subtasks: [
        { id: 's1', title: 'Passo um', done: true },
        { id: 's2', title: 'Passo dois', done: false },
      ],
    })
    const wrapper = mountList([task])

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    const toggle = wrapper.get('button[data-action="subtasks"]')
    expect(toggle.text()).toContain('1 de 2')
    await toggle.trigger('click')
    const items = wrapper.findAll('.subtask-item')
    expect(items).toHaveLength(2)
    expect(items[0]?.text()).toContain('Feita')
    expect(items[1]?.text()).toContain('Pendente')
  })

  it('IDs hostis não quebram a busca de controle para foco nem levam foco ao body', async () => {
    const hostileId = 'a"] [data-action="edit'
    const wrapper = mountList([buildTask({ id: hostileId })])
    const exposed = wrapper.vm as unknown as { focusControl(taskId: string, action: string): boolean }

    const control = wrapper.get('button[data-action="edit"]')
    expect(exposed.focusControl(hostileId, 'edit')).toBe(true)
    expect(document.activeElement).toBe(control.element)
    expect(exposed.focusControl('inexistente', 'edit')).toBe(false)
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
