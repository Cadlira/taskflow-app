import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import type { FoundationResult } from '../../src/contracts/foundation.js'
import App from '../../src/renderer/src/App.vue'

let wrapper: VueWrapper | undefined

type FoundationApi = Pick<TaskFlowDesktopApi, 'verifyFoundation'>

// A janela tem o gerenciamento de tarefas em primeiro plano e o diagnóstico da fundação em área
// secundária recolhível. A inscrição de estado falha nos testes de diagnóstico: o gerenciamento
// fica em estado bloqueado explícito, sem lista vazia, e nenhum comando de tarefa é usado.
function mountApp(foundation: FoundationApi): VueWrapper {
  const api: TaskFlowDesktopApi = {
    ...foundation,
    getStateSnapshot: vi.fn(),
    subscribeState: vi.fn().mockResolvedValue({ version: 1, status: 'error', code: 'STORAGE_UNAVAILABLE' }),
    unsubscribeState: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    changeTaskStatus: vi.fn(),
    openTaskSource: vi.fn(),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api })
  setActivePinia(createPinia())
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [createPinia()] } })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Reflect.deleteProperty(window, 'taskflowDesktop')
})

describe('janela principal com diagnóstico secundário', () => {
  it('prioriza Tarefas e mantém o diagnóstico em details acessível por teclado', async () => {
    const api: FoundationApi = { verifyFoundation: vi.fn() }
    const view = mountApp(api)

    expect(view.get('h1').text()).toBe('Tarefas')
    const details = view.get('details.diagnostic-section')
    expect(details.find('summary').text()).toContain('Diagnóstico da fundação')
    expect(details.attributes('open')).toBeUndefined()

    const button = details.get('button')
    expect(button.element.tagName).toBe('BUTTON')
    ;(button.element as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(button.element)
    await vi.waitFor(() => expect(view.text()).toContain('armazenamento local está indisponível'))
  })

  it('envia apenas versão 1 ao diagnóstico e apresenta o resultado sanitizado', async () => {
    const result: FoundationResult = {
      version: 1,
      status: 'verified',
      appVersion: '0.1.0',
      electronVersion: '44.5.1',
      nodeVersion: '24.21.0',
      fingerprint: 'b'.repeat(64),
    }
    const api: FoundationApi = { verifyFoundation: vi.fn().mockResolvedValue(result) }
    const view = mountApp(api)

    await view.get('.diagnostic-section button').trigger('click')
    expect(api.verifyFoundation).toHaveBeenCalledExactlyOnceWith({ version: 1 })
    expect(view.get('.diagnostic-section [role="status"]').text()).toContain('Fundação verificada')
    expect(view.get('.diagnostic-section').text()).toContain(result.fingerprint)
  })

  it('não expõe stack nem caminho em erro do diagnóstico', async () => {
    const failure: FoundationResult = { version: 1, status: 'error', code: 'PROOF_UNAVAILABLE' }
    const api: FoundationApi = { verifyFoundation: vi.fn().mockResolvedValue(failure) }
    const view = mountApp(api)

    await view.get('.diagnostic-section button').trigger('click')
    expect(view.get('.diagnostic-section [role="status"]').text()).toContain('Nenhum dado foi redefinido')
    expect(view.text()).not.toContain('PROOF_UNAVAILABLE')
    expect(view.text()).not.toContain('C:\\Users')
  })

  it('mantém o controle ocupado sem perder foco', async () => {
    let resolveCall: ((result: FoundationResult) => void) | undefined
    const api: FoundationApi = {
      verifyFoundation: vi.fn(
        () =>
          new Promise<FoundationResult>((resolve) => {
            resolveCall = resolve
          }),
      ),
    }
    const view = mountApp(api)
    const button = view.get('.diagnostic-section button')

    await button.trigger('click')
    expect(button.attributes('aria-disabled')).toBe('true')
    resolveCall?.({ version: 1, status: 'error', code: 'BUSY' })
    await vi.waitFor(() =>
      expect(view.get('.diagnostic-section [role="status"]').text()).toContain('Nenhum dado'),
    )
  })

  it('converte rejeição da bridge em mensagem segura', async () => {
    const rejected: FoundationApi = {
      verifyFoundation: vi.fn().mockRejectedValue(new Error('C:\\Users\\private\\proof.sqlite')),
    }
    const view = mountApp(rejected)
    await view.get('.diagnostic-section button').trigger('click')
    expect(view.get('.diagnostic-section [role="status"]').text()).toContain('Não foi possível')
    expect(view.text()).not.toContain('private')
  })
})
