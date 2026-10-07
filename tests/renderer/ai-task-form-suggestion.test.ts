import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskForm from '../../src/renderer/src/components/tasks/TaskForm.vue'

let wrapper: VueWrapper | undefined

const configured = {
  version: 1 as const,
  status: 'ok' as const,
  provider: {
    state: 'CONFIGURED' as const,
    revision: '3',
    protection: 'AVAILABLE' as const,
    summary: { provider: 'OPENAI' as const, apiBase: 'https://api.openai.com/v1', origin: 'https://api.openai.com', model: 'm', hasCredential: true },
    credentialConsent: true,
    contentConsent: false,
  },
}

const CONTENT = 'Instruções fixas\n\nTítulo: Preparar a demo\n\nDescrição:\nRoteiro'

function api(overrides: Record<string, unknown> = {}) {
  const methods = {
    getAiProviderStatus: vi.fn(async () => configured),
    prepareAiSuggestion: vi.fn(async () => ({
      version: 1,
      status: 'ok',
      prepared: { requestId: 'A'.repeat(32), content: CONTENT, descriptionTruncated: true, origin: 'https://api.openai.com', consentRequired: true },
    })),
    authorizeAiUse: vi.fn(async () => ({ version: 1, status: 'ok', scope: 'CONTENT' })),
    suggestAiSubtasks: vi.fn(async () => ({
      version: 1,
      status: 'ok',
      proposal: { drafts: [{ title: 'Primeira' }, { title: 'Segunda' }], discardedByLimit: true },
    })),
    cancelAiSuggestion: vi.fn(async () => ({ version: 1, status: 'ok' })),
    ...overrides,
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: methods })
  return methods
}

async function mountForm(options: { compact?: boolean; title?: string } = {}): Promise<{ view: VueWrapper; methods: ReturnType<typeof api> }> {
  const methods = api()
  wrapper = mount(TaskForm, { attachTo: document.body, props: { compact: options.compact ?? false } })
  await Promise.resolve()
  await Promise.resolve()
  if (options.title !== undefined) await wrapper.get('input[name="title"]').setValue(options.title)
  return { view: wrapper, methods }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  Reflect.deleteProperty(window, 'taskflowDesktop')
})

describe('TaskForm: assistência de IA no formulário do manager', () => {
  it('sem provedor configurado, nenhum elemento é apresentado e nenhuma prévia é preparada', async () => {
    const methods = api({ getAiProviderStatus: vi.fn(async () => ({ version: 1, status: 'ok', provider: { state: 'NONE', revision: '0', protection: 'AVAILABLE' } })) })
    wrapper = mount(TaskForm, { attachTo: document.body })
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.find('.ai-suggestion').exists()).toBe(false)
    expect(methods.prepareAiSuggestion).not.toHaveBeenCalled()
  })

  it('Quick Add (compact) não recebe nenhum elemento nem chamada de IA', async () => {
    const methods = api()
    wrapper = mount(TaskForm, { attachTo: document.body, props: { compact: true } })
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.find('.ai-suggestion').exists()).toBe(false)
    expect(methods.getAiProviderStatus).not.toHaveBeenCalled()
    expect(methods.prepareAiSuggestion).not.toHaveBeenCalled()
  })

  it('título vazio deixa a ação indisponível com motivo e sem preparar', async () => {
    const { view, methods } = await mountForm()

    expect(view.get('[data-test="ai-disabled-reason"]').text()).toContain('Informe o título')
    expect(view.get('[data-action="ai-suggest"]').attributes('aria-disabled')).toBe('true')
    await view.get('[data-action="ai-suggest"]').trigger('click')
    expect(methods.prepareAiSuggestion).not.toHaveBeenCalled()
  })

  it('prévia literal, origem, corte e consentimento antes do envio', async () => {
    const { view, methods } = await mountForm({ title: 'Preparar a demo' })
    await view.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()

    expect(methods.prepareAiSuggestion).toHaveBeenCalledWith({
      version: 1,
      title: 'Preparar a demo',
      description: '',
      existingSubtaskCount: 0,
    })
    expect(view.get('[data-test="ai-preview"]').text()).toBe(CONTENT)
    expect(view.text()).toContain('https://api.openai.com')
    expect(view.find('[data-test="ai-truncated"]').exists()).toBe(true)
    expect(view.find('[data-test="ai-consent-hint"]').exists()).toBe(true)
  })

  it('envio autoriza o conteúdo do requestId e devolve a proposta revisável', async () => {
    const { view, methods } = await mountForm({ title: 'Preparar a demo' })
    await view.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()
    await view.get('[data-action="ai-send"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(methods.authorizeAiUse).toHaveBeenCalledWith({ version: 1, scope: 'CONTENT', requestId: 'A'.repeat(32) })
    expect(methods.suggestAiSubtasks).toHaveBeenCalledWith({ version: 1, requestId: 'A'.repeat(32) })
    const items = view.findAll('.ai-proposal-item input[type="text"]')
    expect(items.map((input) => (input.element as HTMLInputElement).value)).toEqual(['Primeira', 'Segunda'])
    expect(view.find('[data-test="ai-discarded"]').exists()).toBe(true)
  })

  it('aceitar acrescenta somente linhas novas, sem id e sem done, preservando o existente', async () => {
    const { view } = await mountForm({ title: 'Preparar a demo' })
    // Uma subtarefa manual preexistente permanece na ordem e no estado.
    await view.get('[data-action="add-subtask"]').trigger('click')
    await view.findAll('[data-subtask-row] input.subtask-title-input')[0]?.setValue('Existente')
    await view.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()
    await view.get('[data-action="ai-send"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    // Desmarca o segundo item e edita o primeiro antes de aceitar.
    const checkboxes = view.findAll('.ai-proposal-item input[type="checkbox"]')
    await checkboxes[1]?.setValue(false)
    const titles = view.findAll('.ai-proposal-item input[type="text"]')
    await titles[0]?.setValue('Primeira editada')
    await view.get('[data-action="ai-accept"]').trigger('click')
    await Promise.resolve()

    const rows = view.findAll('[data-subtask-row] input.subtask-title-input')
    expect(rows.map((input) => (input.element as HTMLInputElement).value)).toEqual(['Existente', 'Primeira editada'])
    expect(view.find('.ai-suggestion .ai-proposal').exists()).toBe(false)

    await view.get('form').trigger('submit')
    const submission = view.emitted('submit')?.[0]?.[0] as { draft: { subtasks?: { title: string; id?: string; done?: boolean }[] } }
    expect(submission.draft.subtasks).toEqual([{ title: 'Existente' }, { title: 'Primeira editada' }])
  })

  it('editar título depois da prévia invalida o requestId e exige nova preparação', async () => {
    const { view, methods } = await mountForm({ title: 'Preparar a demo' })
    await view.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()
    expect(view.find('[data-test="ai-preview"]').exists()).toBe(true)

    await view.get('input[name="title"]').setValue('Outro título')
    await Promise.resolve()

    expect(view.find('[data-test="ai-preview"]').exists()).toBe(false)
    expect(view.get('[data-test="ai-message"]').text()).toContain('prepare novamente')
    expect(methods.suggestAiSubtasks).not.toHaveBeenCalled()
  })

  it('descartar a proposta deixa a lista exatamente como estava', async () => {
    const { view } = await mountForm({ title: 'Preparar a demo' })
    await view.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()
    await view.get('[data-action="ai-send"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    await view.get('[data-action="ai-discard"]').trigger('click')

    expect(view.findAll('[data-subtask-row]')).toHaveLength(0)
    expect(view.find('.ai-suggestion .ai-proposal').exists()).toBe(false)
  })

  it('cancelar durante a geração invalida o pedido no main sem alterar o formulário', async () => {
    let release: (value: unknown) => void = () => undefined
    const methods = api({
      suggestAiSubtasks: vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      ),
    })
    wrapper = mount(TaskForm, { attachTo: document.body })
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.get('input[name="title"]').setValue('Preparar a demo')
    await wrapper.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()
    await wrapper.get('[data-action="ai-send"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.find('[data-action="ai-cancel"]').exists()).toBe(true)
    await wrapper.get('[data-action="ai-cancel"]').trigger('click')
    expect(methods.cancelAiSuggestion).toHaveBeenCalledWith({ version: 1, requestId: 'A'.repeat(32) })
    release({ version: 1, status: 'error', code: 'CANCELLED' })
    await Promise.resolve()
    expect(wrapper.findAll('[data-subtask-row]')).toHaveLength(0)
  })

  it('falha fechada do provedor aparece como mensagem e não altera a lista', async () => {
    api({
      suggestAiSubtasks: vi.fn(async () => ({ version: 1, status: 'error', code: 'FAILED', reason: 'INVALID_CREDENTIALS', statusCode: 401 })),
    })
    wrapper = mount(TaskForm, { attachTo: document.body })
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.get('input[name="title"]').setValue('Preparar a demo')
    await wrapper.get('[data-action="ai-suggest"]').trigger('click')
    await Promise.resolve()
    await wrapper.get('[data-action="ai-send"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.get('[data-test="ai-message"]').text()).toContain('credencial foi recusada')
    expect(wrapper.get('[data-test="ai-message"]').text()).toContain('HTTP 401')
    expect(wrapper.findAll('[data-subtask-row]')).toHaveLength(0)
  })

  it('limite de subtarefas já atingido mantém a ação indisponível sem preparar', async () => {
    api()
    wrapper = mount(TaskForm, { attachTo: document.body })
    await Promise.resolve()
    await Promise.resolve()
    await wrapper.get('input[name="title"]').setValue('Preparar a demo')
    for (let index = 0; index < 20; index += 1) {
      await wrapper.get('[data-action="add-subtask"]').trigger('click')
      await Promise.resolve()
    }
    const reason = wrapper.get('[data-test="ai-disabled-reason"]').text()
    expect(reason).toContain('máximo de subtarefas')
  })
})
