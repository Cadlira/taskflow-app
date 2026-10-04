import { createPinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import type { FoundationResult } from '../../src/contracts/foundation.js'
import App from '../../src/renderer/src/App.vue'

let wrapper: VueWrapper | undefined

type FoundationApi = Pick<TaskFlowDesktopApi, 'verifyFoundation'>

// O shell continua diagnóstico: a tela só usa verifyFoundation; as operações de estado
// existem na bridge, mas nenhuma UI de gerenciamento as consome nesta Change.
function mountFoundationView(foundation: FoundationApi): VueWrapper {
  const api: TaskFlowDesktopApi = {
    ...foundation,
    getStateSnapshot: vi.fn(),
    subscribeState: vi.fn(),
    unsubscribeState: vi.fn(),
  }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: api })
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [createPinia()] } })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Reflect.deleteProperty(window, 'taskflowDesktop')
})

describe('janela provisória acessível', () => {
  it('oferece botão nativo focalizável e estado anunciado', () => {
    const api: FoundationApi = { verifyFoundation: vi.fn() }
    const view = mountFoundationView(api)
    const button = view.get('button')

    expect(button.element.tagName).toBe('BUTTON')
    expect((button.element as HTMLButtonElement).type).toBe('button')
    expect((button.element as HTMLButtonElement).tabIndex).toBe(0)
    ;(button.element as HTMLButtonElement).focus()
    expect(document.activeElement).toBe(button.element)
    expect(view.get('[role="status"]').attributes('aria-live')).toBe('polite')
  })

  it('envia apenas versão 1 e apresenta o resultado sanitizado', async () => {
    const result: FoundationResult = {
      version: 1,
      status: 'verified',
      appVersion: '0.1.0',
      electronVersion: '44.5.1',
      nodeVersion: '24.21.0',
      fingerprint: 'b'.repeat(64),
    }
    const api: FoundationApi = { verifyFoundation: vi.fn().mockResolvedValue(result) }
    const view = mountFoundationView(api)

    await view.get('button').trigger('click')
    expect(api.verifyFoundation).toHaveBeenCalledExactlyOnceWith({ version: 1 })
    expect(view.get('[role="status"]').text()).toContain('Fundação verificada')
    expect(view.text()).toContain(result.fingerprint)
  })

  it('não expõe stack nem caminho em erro', async () => {
    const failure: FoundationResult = { version: 1, status: 'error', code: 'PROOF_UNAVAILABLE' }
    const api: FoundationApi = { verifyFoundation: vi.fn().mockResolvedValue(failure) }
    const view = mountFoundationView(api)

    await view.get('button').trigger('click')
    expect(view.get('[role="status"]').text()).toContain('Nenhum dado foi redefinido')
    expect(view.text()).not.toContain('PROOF_UNAVAILABLE')
    expect(view.text()).not.toContain('C:\\Users')
  })

  it('mantém BUSY enquanto a chamada está pendente e captura rejeição sem stack', async () => {
    let resolveCall: ((result: FoundationResult) => void) | undefined
    const api: FoundationApi = {
      verifyFoundation: vi.fn(() => new Promise<FoundationResult>((resolve) => {
        resolveCall = resolve
      })),
    }
    const view = mountFoundationView(api)
    const button = view.get('button')

    await button.trigger('click')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
    resolveCall?.({ version: 1, status: 'error', code: 'BUSY' })
    await vi.waitFor(() => expect(view.get('[role="status"]').text()).toContain('Nenhum dado'))
  })

  it('converte rejeição da bridge em mensagem segura', async () => {
    const api: FoundationApi = {
      verifyFoundation: vi.fn().mockRejectedValue(new Error('C:\\Users\\private\\proof.sqlite')),
    }
    const view = mountFoundationView(api)

    await view.get('button').trigger('click')
    expect(view.get('[role="status"]').text()).toContain('Não foi possível')
    expect(view.text()).not.toContain('private')
  })
})
