import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AiProviderSettings from '../../src/renderer/src/components/ai/AiProviderSettings.vue'
import type { AiProviderStatus } from '../../src/contracts/ai.js'

let wrapper: VueWrapper | undefined

interface FakeOptions {
  status?: AiProviderStatus | { status: 'error'; code: string }
  save?: unknown
  authorize?: unknown
  test?: unknown
  remove?: unknown
}

function api(options: FakeOptions = {}) {
  const status =
    options.status ??
    ({
      state: 'CONFIGURED',
      revision: '3',
      protection: 'AVAILABLE',
      summary: { provider: 'OPENAI', apiBase: 'https://api.openai.com/v1', origin: 'https://api.openai.com', model: 'gpt-4o-mini', hasCredential: true },
      credentialConsent: true,
      contentConsent: false,
    } satisfies AiProviderStatus)
  const methods = {
    getAiProviderStatus: vi.fn(async () =>
      'status' in status && status.status === 'error' ? status : { version: 1 as const, status: 'ok' as const, provider: status },
    ),
    saveAiProviderConfig: vi.fn(
      async () =>
        options.save ?? {
          version: 1,
          status: 'ok',
          provider: { state: 'CONFIGURED', revision: '4', protection: 'AVAILABLE', summary: status && 'summary' in status ? { ...status.summary, model: 'novo' } : { provider: 'OPENAI', apiBase: 'https://api.openai.com/v1', origin: 'https://api.openai.com', model: 'novo', hasCredential: true }, credentialConsent: true, contentConsent: false },
        },
    ),
    removeAiProviderConfig: vi.fn(async () => options.remove ?? { version: 1, status: 'ok', provider: { state: 'NONE', revision: '5', protection: 'AVAILABLE' } }),
    authorizeAiUse: vi.fn(async () => options.authorize ?? { version: 1, status: 'ok', scope: 'CREDENTIAL' }),
    testAiConnection: vi.fn(async () => options.test ?? { version: 1, status: 'ok' }),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: methods })
  return methods
}

async function mountSettings(options: FakeOptions = {}, flush = true): Promise<{ wrapper: VueWrapper; methods: ReturnType<typeof api> }> {
  const methods = api(options)
  wrapper = mount(AiProviderSettings, { attachTo: document.body })
  if (flush) await Promise.resolve()
  return { wrapper, methods }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  Reflect.deleteProperty(window, 'taskflowDesktop')
})

describe('AiProviderSettings: configuração e proteção', () => {
  it('reabre sem preencher a credencial, marca a salva e mostra a origem', async () => {
    const { wrapper: view } = await mountSettings()

    const credential = view.get('input[name="aiCredential"]').element as HTMLInputElement
    expect(credential.value).toBe('')
    expect(credential.type).toBe('password')
    expect(view.find('[data-test="ai-credential-saved"]').exists()).toBe(true)
    expect(view.get('[data-test="ai-origin"]').text()).toContain('https://api.openai.com')
    expect(view.get('input[name="aiModel"]').element).toHaveProperty('value', 'gpt-4o-mini')
  })

  it('salva com a revisão lida e envia credencial somente quando digitada', async () => {
    const { wrapper: view, methods } = await mountSettings()

    await view.get('input[name="aiModel"]').setValue('gpt-4o')
    await view.get('input[name="aiCredential"]').setValue('sk-nova')
    const save = view.findAll('button').find((button) => button.text().includes('Salvar alterações'))
    await save?.trigger('click')

    expect(methods.saveAiProviderConfig).toHaveBeenCalledWith({
      version: 1,
      expectedRevision: '3',
      provider: 'OPENAI',
      credential: 'sk-nova',
      model: 'gpt-4o',
    })
  })

  it('CUSTOM mostra a base informada e a origem passa a ser a do gateway', async () => {
    const { wrapper: view, methods } = await mountSettings()
    await view.get('select[name="aiProvider"]').setValue('CUSTOM')
    await view.get('input[name="aiApiBase"]').setValue('https://gateway.exemplo/v1')
    await view.get('input[name="aiModel"]').setValue('m')

    const save = view.findAll('button').find((button) => button.text().includes('Salvar alterações'))
    await save?.trigger('click')

    expect(methods.saveAiProviderConfig).toHaveBeenCalledWith({
      version: 1,
      expectedRevision: '3',
      provider: 'CUSTOM',
      apiBase: 'https://gateway.exemplo/v1',
      model: 'm',
    })
  })

  it('erros de campo devolvidos pelo main aparecem junto do campo', async () => {
    const { wrapper: view } = await mountSettings({
      save: { version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { apiBase: 'Endereços remotos exigem https.', credential: 'Informe a credencial do provedor.' } },
    })
    await view.get('select[name="aiProvider"]').setValue('CUSTOM')
    await view.get('input[name="aiApiBase"]').setValue('http://remoto')
    await view.get('input[name="aiModel"]').setValue('m')
    const save = view.findAll('button').find((button) => button.text().includes('Salvar alterações'))
    await save?.trigger('click')

    expect(view.text()).toContain('Endereços remotos exigem https.')
    expect(view.text()).toContain('Informe a credencial do provedor.')
  })

  it('proteção indisponível bloqueia salvar e testar com aviso', async () => {
    await mountSettings({
      status: {
        state: 'CONFIGURED',
        revision: '3',
        protection: 'UNAVAILABLE',
        summary: { provider: 'OPENAI', apiBase: 'https://api.openai.com/v1', origin: 'https://api.openai.com', model: 'm', hasCredential: true },
        credentialConsent: false,
        contentConsent: false,
      },
    })

    expect(wrapper?.get('[data-test="ai-protection"]').text()).toContain('proteção nativa')
    const save = wrapper?.findAll('button').find((button) => button.text().includes('Salvar alterações'))
    expect(save?.attributes('aria-disabled')).toBe('true')
    const test = wrapper?.findAll('button').find((button) => button.text().includes('Testar conexão'))
    expect(test?.attributes('aria-disabled')).toBe('true')
  })

  it('estado bloqueado mostra o motivo e oferece somente remover com confirmação', async () => {
    const { wrapper: view, methods } = await mountSettings({ status: { state: 'BLOCKED', blocked: 'INCOMPATIBLE' } })

    expect(view.get('[data-test="ai-blocked"]').text()).toContain('formato incompatível')
    expect(view.find('input[name="aiCredential"]').exists()).toBe(false)
    const remove = view.findAll('button').find((button) => button.text().includes('Remover configuração'))
    await remove?.trigger('click')
    expect(methods.removeAiProviderConfig).not.toHaveBeenCalled()
    expect(view.text()).toContain('Confirmar remoção')
    const confirm = view.findAll('button').find((button) => button.text().includes('Confirmar remoção'))
    await confirm?.trigger('click')
    expect(methods.removeAiProviderConfig).toHaveBeenCalledWith({ version: 1 })
  })

  it('o teste exige consentimento explícito antes de enviar a credencial', async () => {
    await mountSettings({
      status: {
        state: 'CONFIGURED',
        revision: '3',
        protection: 'AVAILABLE',
        summary: { provider: 'OPENAI', apiBase: 'https://api.openai.com/v1', origin: 'https://api.openai.com', model: 'm', hasCredential: true },
        credentialConsent: false,
        contentConsent: false,
      },
    })
    const test = wrapper?.findAll('button').find((button) => button.text().includes('Testar conexão'))
    await test?.trigger('click')

    expect(wrapper?.get('[data-test="ai-consent"]').text()).toContain('https://api.openai.com')
    const authorize = wrapper?.findAll('button').find((button) => button.text().includes('Autorizar e continuar'))
    await authorize?.trigger('click')
    await Promise.resolve()

    // A credencial do teste não vai junto do consentimento; o teste em si fica para o próximo gesto.
    expect(wrapper?.text()).toContain('Autorização registrada')
  })

  it('listagem indisponível explica e troca o teste para o envio mínimo', async () => {
    await mountSettings({ test: { version: 1, status: 'error', code: 'FAILED', reason: 'MODEL_LIST_UNSUPPORTED', statusCode: 404 } })
    const test = wrapper?.findAll('button').find((button) => button.text().includes('Testar conexão'))
    await test?.trigger('click')
    await Promise.resolve()

    expect(wrapper?.text()).toContain('envio mínimo')
    const minimal = wrapper?.find('input[value="MINIMAL_COMPLETION"]').element as HTMLInputElement
    expect(minimal.checked).toBe(true)
  })

  it('falha com motivo fechado não mostra corpo nem credencial', async () => {
    await mountSettings({ test: { version: 1, status: 'error', code: 'FAILED', reason: 'INVALID_CREDENTIALS', statusCode: 401 } })
    const test = wrapper?.findAll('button').find((button) => button.text().includes('Testar conexão'))
    await test?.trigger('click')
    await Promise.resolve()

    expect(wrapper?.text()).toContain('credencial foi recusada')
    expect(wrapper?.text()).toContain('HTTP 401')
  })
})
