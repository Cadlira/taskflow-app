import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TaskForm from '../../src/renderer/src/components/tasks/TaskForm.vue'
import { toLocalDateTimeInput } from '../../src/renderer/src/components/tasks/date-time.js'
import { buildTask } from '../support/task-fixtures.js'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountForm(options: Parameters<typeof mount<typeof TaskForm>>[1] = {}) {
  return mount(TaskForm, { attachTo: document.body, ...options })
}

type Submission = { kind: string; draft?: Record<string, unknown>; patch?: Record<string, unknown> }

function submissionOf(wrapper: ReturnType<typeof mountForm>): Submission {
  return wrapper.emitted('submit')?.[0]?.[0] as Submission
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

    const submission = submissionOf(wrapper)
    expect(submission.kind).toBe('create')
    expect(submission.draft).toMatchObject({
      title: '  Comprar leite  ',
      description: 'Integral',
      tags: ['casa', ' mercado', ' casa'],
      status: 'TODO',
      priority: 'MEDIUM',
    })
    expect('recurrence' in (submission.draft ?? {})).toBe(false)
    expect('subtasks' in (submission.draft ?? {})).toBe(false)
  })

  it('em edição envia patch somente com intenção alterada; prazo, regra e lista intactos ficam ausentes', async () => {
    const task = buildTask({
      id: 'a',
      title: 'Original',
      description: 'Descrição',
      dueAt: '2026-10-05T15:30:45.123Z',
      tags: ['casa'],
      seriesId: 's',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      subtasks: [{ id: 's1', title: 'Passo', done: true }],
    })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('input[name="title"]').setValue('Editada')
    await wrapper.get('form').trigger('submit')

    const submission = submissionOf(wrapper)
    expect(submission.kind).toBe('edit')
    expect(submission.patch).toEqual({ title: 'Editada' })
    expect('dueAt' in (submission.patch ?? {})).toBe(false)
    expect('recurrence' in (submission.patch ?? {})).toBe(false)
    expect('subtasks' in (submission.patch ?? {})).toBe(false)
  })

  it('null limpa opcionais e [] limpa tags quando alterados para vazio', async () => {
    const task = buildTask({ id: 'a', description: 'Descrição', tags: ['casa'], sourceUrl: 'https://example.test' })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('textarea[name="description"]').setValue('   ')
    await wrapper.get('input[name="tags"]').setValue('')
    await wrapper.get('input[name="sourceUrl"]').setValue('')
    await wrapper.get('form').trigger('submit')

    const patch = submissionOf(wrapper).patch ?? {}
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
    const cancelButton = create.findAll('button').find((button) => button.text() === 'Cancelar')
    await cancelButton?.trigger('click')
    expect(create.emitted('cancel')).toHaveLength(1)
    expect(create.emitted('submit')).toBeUndefined()

    const withUrl = mountForm({ props: { task: buildTask({ id: 'a', sourceUrl: 'https://example.test/x' }) } })
    const button = withUrl.get('button[data-action="open-source"]')
    await button.trigger('click')
    expect(withUrl.emitted('open-source')).toHaveLength(1)
    expect(withUrl.text()).toContain('valor salvo')
  })

  it('lembretes presentes exibem o motivo D8 para prazo/status e geração', () => {
    const task = buildTask({ id: 'lem', reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }] })
    const wrapper = mountForm({ props: { task } })
    expect(wrapper.get('[data-test="reminders-hint"]').text()).toContain(
      'Alterar prazo ou status e gerar outra ocorrência depende da integração de lembretes.',
    )
  })

  it('erro de índice em subtarefa marca a linha, mostra a mensagem e foca o primeiro inválido', async () => {
    const task = buildTask({
      id: 'sub',
      subtasks: [
        { id: 's1', title: 'Primeiro', done: false },
        { id: 's2', title: 'Segundo', done: false },
      ],
    })
    const wrapper = mountForm({
      props: { task, errors: { subtasks: { items: [{ index: 1, title: 'TOO_LONG' }] } } },
    })

    const inputs = wrapper.findAll('.subtask-title-input')
    expect(inputs).toHaveLength(2)
    expect(inputs[1]?.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('O título da subtarefa excede 200 caracteres.')

    const exposed = wrapper.vm as unknown as { focusFirstInvalid(): boolean }
    expect(exposed.focusFirstInvalid()).toBe(true)
    expect(document.activeElement).toBe(inputs[1]?.element)
  })

  it('erro de até associa mensagem e foco ao limite da série', async () => {
    const task = buildTask({ id: 'rec', seriesId: 's', recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    const wrapper = mountForm({ props: { task, errors: { recurrence: { until: 'UNTIL_BEFORE_DUE' } } } })

    const until = wrapper.get('input[name="recurrenceUntil"]')
    expect(until.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('O limite não pode ser anterior ao prazo.')

    const exposed = wrapper.vm as unknown as { focusFirstInvalid(): boolean }
    expect(exposed.focusFirstInvalid()).toBe(true)
    expect(document.activeElement).toBe(until.element)
  })
})

describe('TaskForm: recorrência', () => {
  it('criação envia regra com parâmetro exato e sem limite vazio', async () => {
    const wrapper = mountForm()

    await wrapper.get('select[name="recurrenceFrequency"]').setValue('DAILY')
    await wrapper.get('input[name="recurrenceIntervalDays"]').setValue('3')
    await wrapper.get('form').trigger('submit')

    expect(submissionOf(wrapper).draft?.['recurrence']).toEqual({ frequency: 'DAILY', intervalDays: 3 })
  })

  it('criação semanal envia dias distintos em ordem numérica', async () => {
    const wrapper = mountForm()

    await wrapper.get('select[name="recurrenceFrequency"]').setValue('WEEKLY')
    const boxes = wrapper.findAll('input[name="recurrenceWeekdays"]')
    await boxes[4]?.setValue(true)
    await boxes[1]?.setValue(true)
    await wrapper.get('form').trigger('submit')

    expect(submissionOf(wrapper).draft?.['recurrence']).toEqual({ frequency: 'WEEKLY', weekdays: [1, 4] })
  })

  it('edição não envia regra intacta, mas envia parâmetro alterado com o limite conservado por omissão', async () => {
    const task = buildTask({
      id: 'rec',
      seriesId: 's',
      recurrence: { frequency: 'WEEKLY', weekdays: [1, 3], until: '2026-12-31T02:30:00.000Z' },
    })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('select[name="recurrenceFrequency"]').setValue('DAILY')
    await wrapper.get('input[name="recurrenceIntervalDays"]').setValue('2')
    await wrapper.get('form').trigger('submit')

    const rule = submissionOf(wrapper).patch?.['recurrence'] as Record<string, unknown>
    expect(rule).toEqual({ frequency: 'DAILY', intervalDays: 2 })
    expect('until' in rule).toBe(false)
  })

  it('retirada explícita envia recurrence null preservando o status e avisa que encerra gerações', async () => {
    const task = buildTask({ id: 'rec', status: 'IN_PROGRESS', seriesId: 's', recurrence: { frequency: 'DAILY', intervalDays: 1 } })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('button[data-action="remove-recurrence"]').trigger('click')
    expect(wrapper.get('[data-test="recurrence-removal"]').text()).toContain(
      'Remover a recorrência mantém o status, o prazo e os lembretes desta tarefa.',
    )
    await wrapper.get('form').trigger('submit')

    const patch = submissionOf(wrapper).patch ?? {}
    expect(patch['recurrence']).toBeNull()
    expect('status' in patch).toBe(false)
  })

  it('limpar o limite existente envia until null e desfazer a retirada mantém a regra', async () => {
    const task = buildTask({
      id: 'rec',
      seriesId: 's',
      recurrence: { frequency: 'DAILY', intervalDays: 2, until: '2026-12-31T02:30:00.000Z' },
    })
    const wrapper = mountForm({ props: { task } })

    await wrapper.get('input[name="recurrenceUntil"]').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(submissionOf(wrapper).patch?.['recurrence']).toEqual({ frequency: 'DAILY', intervalDays: 2, until: null })

    const other = mountForm({ props: { task } })
    await other.get('button[data-action="remove-recurrence"]').trigger('click')
    await other.get('button[data-action="undo-remove-recurrence"]').trigger('click')
    await other.get('form').trigger('submit')
    expect('recurrence' in (submissionOf(other).patch ?? {})).toBe(false)
  })
})

describe('TaskForm: lista de subtarefas', () => {
  it('edição envia id/título na ordem, sem done, e omite a lista intacta', async () => {
    const task = buildTask({
      id: 'sub',
      subtasks: [
        { id: 's1', title: 'Primeiro', done: true },
        { id: 's2', title: 'Segundo', done: false },
      ],
    })
    const wrapper = mountForm({ props: { task } })

    const inputs = wrapper.findAll('.subtask-title-input')
    await inputs[1]?.setValue('Segundo revisado')
    await wrapper.get('form').trigger('submit')

    const list = submissionOf(wrapper).patch?.['subtasks'] as Array<Record<string, unknown>>
    expect(list).toEqual([
      { id: 's1', title: 'Primeiro' },
      { id: 's2', title: 'Segundo revisado' },
    ])
    expect(list.every((item) => !('done' in item))).toBe(true)

    const intact = mountForm({ props: { task } })
    await intact.get('form').trigger('submit')
    expect('subtasks' in (submissionOf(intact).patch ?? {})).toBe(false)
  })

  it('criação envia somente títulos; lista pode ser esvaziada na edição', async () => {
    const create = mountForm()
    await create.get('button[data-action="add-subtask"]').trigger('click')
    await create.get('button[data-action="add-subtask"]').trigger('click')
    const inputs = create.findAll('.subtask-title-input')
    await inputs[0]?.setValue('Passo A')
    await inputs[1]?.setValue('Passo B')
    await create.get('form').trigger('submit')
    expect(submissionOf(create).draft?.['subtasks']).toEqual([{ title: 'Passo A' }, { title: 'Passo B' }])

    const task = buildTask({ id: 'sub', subtasks: [{ id: 's1', title: 'Único', done: false }] })
    const edit = mountForm({ props: { task } })
    await edit.get('button[data-action="remove-subtask"]').trigger('click')
    await edit.get('form').trigger('submit')
    expect(submissionOf(edit).patch?.['subtasks']).toEqual([])
  })

  it('mover por teclado altera a ordem enviada e os limites desabilitam as extremidades', async () => {
    const task = buildTask({
      id: 'sub',
      subtasks: [
        { id: 's1', title: 'Um', done: false },
        { id: 's2', title: 'Dois', done: false },
        { id: 's3', title: 'Três', done: false },
      ],
    })
    const wrapper = mountForm({ props: { task } })

    const rows = wrapper.findAll('[data-subtask-row]')
    const moveDown = rows[0]?.get('button[data-action="move-down"]')
    const moveUp = rows[0]?.get('button[data-action="move-up"]')
    expect(moveDown?.element.tagName).toBe('BUTTON')
    expect(moveUp?.attributes('aria-disabled')).toBe('true')
    expect(rows[2]?.get('button[data-action="move-down"]').attributes('aria-disabled')).toBe('true')

    const moveElement = moveDown?.element as HTMLButtonElement | undefined
    moveElement?.focus()
    expect(document.activeElement).toBe(moveDown?.element)
    await moveDown?.trigger('click')

    await wrapper.get('form').trigger('submit')
    const list = submissionOf(wrapper).patch?.['subtasks'] as Array<Record<string, unknown>>
    expect(list.map((item) => item['id'])).toEqual(['s2', 's1', 's3'])

    // Mover para cima usa o mesmo controle de teclado da linha movida.
    const newRows = wrapper.findAll('[data-subtask-row]')
    await newRows[2]?.get('button[data-action="move-up"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    const second = wrapper.emitted('submit')?.[1]?.[0] as Submission
    const reordered = second.patch?.['subtasks'] as Array<Record<string, unknown>>
    expect(reordered.map((item) => item['id'])).toEqual(['s2', 's3', 's1'])
  })

  it('limite de 20 fica visível e bloqueia a adição excedente', async () => {
    const wrapper = mountForm()
    for (let index = 0; index < 20; index += 1) {
      await wrapper.get('button[data-action="add-subtask"]').trigger('click')
    }
    expect(wrapper.get('[data-test="subtask-limit"]').text()).toContain('20 de 20')
    expect(wrapper.get('button[data-action="add-subtask"]').attributes('aria-disabled')).toBe('true')

    await wrapper.get('button[data-action="add-subtask"]').trigger('click')
    expect(wrapper.findAll('.subtask-title-input')).toHaveLength(20)
  })

  it('título limita 200 no controle e a mensagem do servidor informa o excesso', async () => {
    const task = buildTask({ id: 'sub', subtasks: [{ id: 's1', title: 'Passo', done: false }] })
    const wrapper = mountForm({ props: { task } })
    expect(wrapper.get('.subtask-title-input').attributes('maxlength')).toBe('200')

    const tooLong = mountForm({
      props: { task, errors: { subtasks: { items: [{ index: 0, title: 'TOO_LONG' }] } } },
    })
    expect(tooLong.text()).toContain('excede 200 caracteres')
  })
})

describe('TaskForm: revisão de fuso e cancelamento', () => {
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
    const patch = submissionOf(wrapper).patch ?? {}
    expect(patch['dueAt']).toBeDefined()
  })

  it('bloqueia save quando o fuso mudou com o limite da série alterado', async () => {
    const untilIso = '2026-11-30T18:30:00.000Z'
    const task = buildTask({ id: 'rec', seriesId: 's', recurrence: { frequency: 'DAILY', intervalDays: 1, until: untilIso } })
    const wrapper = mountForm({
      props: {
        task,
        timeZoneConvert: () => '2026-11-30T14:30',
      },
    })

    await wrapper.get('input[name="recurrenceUntil"]').setValue('2026-11-30T17:45')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    const review = wrapper.get('[data-test="time-zone-review"]')
    expect(review.text()).toContain('mudou')
    expect(review.text()).toContain('Limite salvo:')

    await review.findAll('button')[0]?.trigger('click')
    await wrapper.get('form').trigger('submit')

    const rule = submissionOf(wrapper).patch?.['recurrence'] as Record<string, unknown>
    expect(rule['until']).toBeDefined()
    expect(rule['until']).not.toBe(untilIso)
  })

  it('restaurar os valores salvos descarta a alteração pendente de prazo', async () => {
    const savedIso = '2026-10-05T18:30:00.000Z'
    const task = buildTask({ id: 'tz', dueAt: savedIso })
    const wrapper = mountForm({ props: { task, timeZoneConvert: () => '2026-10-05T14:30' } })

    const dueInput = wrapper.get('input[name="dueAt"]')
    await dueInput.setValue('2026-10-05T17:45')
    await wrapper.get('form').trigger('submit')
    const buttons = wrapper.get('[data-test="time-zone-review"]').findAll('button')
    await buttons[1]?.trigger('click')

    // O texto restaurado é o do fuso corrente do processo (independente de o runner estar em UTC).
    expect((dueInput.element as HTMLInputElement).value).toBe(toLocalDateTimeInput(savedIso))
    await wrapper.get('form').trigger('submit')
    const patch = submissionOf(wrapper).patch ?? {}
    expect('dueAt' in patch).toBe(false)
  })
})
