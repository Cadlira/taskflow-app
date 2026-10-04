import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TaskForm from '../../src/renderer/src/components/tasks/TaskForm.vue'
import { buildTask } from '../support/task-fixtures.js'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountForm(options: Parameters<typeof mount<typeof TaskForm>>[1] = {}) {
  return mount(TaskForm, { attachTo: document.body, ...options })
}

describe('TaskForm: campos básicos, erro e foco', () => {
  it('foca o título ao abrir e emite criação com os campos digitados', async () => {
    const wrapper = mountForm()
    const title = wrapper.get('input[name="title"]')
    expect(document.activeElement).toBe(title.element)

    await title.setValue('  Comprar leite  ')
    await wrapper.get('textarea[name="description"]').setValue('Integral')
    await wrapper.get('input[name="tags"]').setValue('casa, mercado, casa')
    await wrapper.get('form').trigger('submit')

    const submission = wrapper.emitted('submit')?.[0]?.[0] as { kind: string; draft: Record<string, unknown> }
    expect(submission.kind).toBe('create')
    expect(submission.draft).toMatchObject({
      title: '  Comprar leite  ',
      description: 'Integral',
      tags: ['casa', ' mercado', ' casa'],
      status: 'TODO',
      priority: 'MEDIUM',
    })
  })

  it('em edição envia patch somente com intenção alterada; prazo intacto fica ausente', async () => {
    const task = buildTask({
      id: 'a',
      title: 'Original',
      description: 'Descrição',
      dueAt: '2026-10-05T15:30:45.123Z',
      tags: ['casa'],
    })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('input[name="title"]').setValue('Editada')
    await wrapper.get('form').trigger('submit')

    const submission = wrapper.emitted('submit')?.[0]?.[0] as { kind: string; patch: Record<string, unknown> }
    expect(submission.kind).toBe('edit')
    expect(submission.patch).toEqual({ title: 'Editada' })
    expect('dueAt' in submission.patch).toBe(false)
  })

  it('null limpa opcionais e [] limpa tags quando alterados para vazio', async () => {
    const task = buildTask({ id: 'a', description: 'Descrição', tags: ['casa'], sourceUrl: 'https://example.test' })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('textarea[name="description"]').setValue('   ')
    await wrapper.get('input[name="tags"]').setValue('')
    await wrapper.get('input[name="sourceUrl"]').setValue('')
    await wrapper.get('form').trigger('submit')

    const patch = (wrapper.emitted('submit')?.[0]?.[0] as { patch: Record<string, unknown> }).patch
    expect(patch['description']).toBeNull()
    expect(patch['tags']).toEqual([])
    expect(patch['sourceUrl']).toBeNull()
  })

  it('erro por campo associa mensagem, marca aria-invalid e foca o primeiro inválido', async () => {
    const wrapper = mountForm({ props: { errors: { title: 'REQUIRED', tags: 'TOO_MANY' } } })
    expect(wrapper.get('input[name="title"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Informe um título.')
    expect(wrapper.text()).toContain('Informe no máximo 10 tags distintas')

    const exposed = wrapper.vm as unknown as { focusFirstInvalid(): boolean }
    expect(exposed.focusFirstInvalid()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('input[name="title"]').element)
  })

  it('cancelar emite sem gravar e o botão de origem salva só existe na edição com URL', async () => {
    const create = mountForm()
    expect(create.find('button[data-action="open-source"]').exists()).toBe(false)
    await create.get('button.button-secondary').trigger('click')
    expect(create.emitted('cancel')).toHaveLength(1)

    const withUrl = mountForm({ props: { task: buildTask({ id: 'a', sourceUrl: 'https://example.test/x' }) } })
    const button = withUrl.get('button[data-action="open-source"]')
    await button.trigger('click')
    expect(withUrl.emitted('open-source')).toHaveLength(1)
    expect(withUrl.text()).toContain('valor salvo')
  })

  it('recorrência presente deixa o formulário em somente leitura, sem submit', async () => {
    const task = buildTask({ id: 'rec', recurrence: { frequency: 'DAILY', intervalDays: 1 }, seriesId: 's' })
    const wrapper = mountForm({ props: { task } })

    expect(wrapper.get('[data-test="recurrence-notice"]').text()).toContain('somente leitura')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    expect(wrapper.get('input[name="title"]').attributes('readonly')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('lembretes presentes exibem o aviso de restrição de prazo/status', () => {
    const task = buildTask({ id: 'lem', reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }] })
    const wrapper = mountForm({ props: { task } })
    expect(wrapper.get('[data-test="reminders-hint"]').text()).toContain('prazo e status não podem ser alterados')
  })

  it('subtarefas existentes aparecem em leitura, sem controles de edição', () => {
    const task = buildTask({
      id: 'sub',
      subtasks: [
        { id: 's1', title: 'Passo', done: true },
        { id: 's2', title: 'Outro', done: false },
      ],
    })
    const wrapper = mountForm({ props: { task } })
    expect(wrapper.text()).toContain('somente leitura')
    expect(wrapper.findAll('.subtask-item')).toHaveLength(2)
    expect(wrapper.find('button[data-action="add-subtask"]').exists()).toBe(false)
  })

  it('bloqueia save quando o fuso mudou com prazo alterado e libera após confirmação/restauração', async () => {
    const task = buildTask({ id: 'tz', dueAt: '2026-10-05T18:30:00.000Z' })
    const wrapper = mountForm({
      props: {
        task,
        // Simula a mudança de fuso: a conversão corrente deixa de reproduzir o texto capturado.
        timeZoneConvert: () => '2026-10-05T14:30',
      },
    })

    const dueInput = wrapper.get('input[name="dueAt"]')
    await dueInput.setValue('2026-10-05T17:45')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('[data-test="time-zone-review"]').text()).toContain('mudou')

    await wrapper.get('[data-test="time-zone-review"] button').trigger('click')
    expect(wrapper.find('[data-test="time-zone-review"]').exists()).toBe(false)

    await wrapper.get('form').trigger('submit')
    const patch = (wrapper.emitted('submit')?.[0]?.[0] as { patch: Record<string, unknown> }).patch
    expect(patch['dueAt']).toBeDefined()
  })

  it('restaurar o prazo salvo descarta a alteração pendente', async () => {
    const task = buildTask({ id: 'tz', dueAt: '2026-10-05T18:30:00.000Z' })
    const wrapper = mountForm({ props: { task, timeZoneConvert: () => '2026-10-05T14:30' } })

    const dueInput = wrapper.get('input[name="dueAt"]')
    await dueInput.setValue('2026-10-05T17:45')
    await wrapper.get('form').trigger('submit')
    const buttons = wrapper.get('[data-test="time-zone-review"]').findAll('button')
    await buttons[1]?.trigger('click')

    expect((dueInput.element as HTMLInputElement).value).toBe('2026-10-05T15:30')
    await wrapper.get('form').trigger('submit')
    const patch = (wrapper.emitted('submit')?.[0]?.[0] as { patch: Record<string, unknown> }).patch
    expect('dueAt' in patch).toBe(false)
  })
})
