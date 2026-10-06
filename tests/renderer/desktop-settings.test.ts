import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopStatus } from '../../src/contracts/desktop.js'
import type { TaskFlowDesktopApi } from '../../src/contracts/desktop-api.js'
import DesktopSettings from '../../src/renderer/src/components/DesktopSettings.vue'
import { useTasksStore } from '../../src/renderer/src/stores/tasks.js'

function desktop(overrides: Partial<DesktopStatus> = {}): DesktopStatus {
  return { surfaceSequence: 1, visibility: 'VISIBLE', recovery: 'ACTIVE', reminders: 'READY', reminderCapability: 'FAKE', startup: 'OFF', ...overrides }
}

interface Harness {
  control: ((event: unknown) => void) | undefined
  status: DesktopStatus
  api: {
    getDesktopStatus: ReturnType<typeof vi.fn>
    setStartAtLogin: ReturnType<typeof vi.fn>
    requestQuit: ReturnType<typeof vi.fn>
    subscribeDesktopEvents: ReturnType<typeof vi.fn>
  }
}

function setup(status: DesktopStatus = desktop()): Harness {
  const harness: Harness = { control: undefined, status, api: {
    getDesktopStatus: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const, desktop: harness.status })),
    setStartAtLogin: vi.fn(async (request: { desired: boolean }) => ({ version: 1 as const, status: 'ok' as const, startup: request.desired ? 'ON' as const : 'OFF' as const })),
    requestQuit: vi.fn(async () => ({ version: 1 as const, status: 'ok' as const })),
    subscribeDesktopEvents: vi.fn(async (_request: unknown, control: (event: unknown) => void) => {
      harness.control = control
      return { dispose: vi.fn() }
    }),
  } }
  Object.defineProperty(window, 'taskflowDesktop', { configurable: true, value: harness.api as unknown as TaskFlowDesktopApi })
  setActivePinia(createPinia())
  return harness
}

async function mountSettings() {
  const wrapper = mount(DesktopSettings)
  await flushPromises()
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(window, 'taskflowDesktop')
})

describe('DesktopSettings: estado e opções honestas', () => {
  it('mostra textos de close/graça/crash e estado nativo consultado, com controles focáveis', async () => {
    const harness = setup(desktop({ startup: 'DISABLED_EXTERNALLY' }))
    const wrapper = await mountSettings()
    expect(wrapper.text()).toContain('Fechar mantém o TaskFlow na bandeja e os lembretes ativos')
    expect(wrapper.text()).toContain('até 5 minutos de atraso podem ser avisados')
    expect(wrapper.text()).toContain('Desfazer e prévias são descartados ao fechar')
    expect(wrapper.text()).toContain('modo de teste, sem avisos do Windows')
    expect(wrapper.text()).toContain('Desativado nas opções de inicialização do Windows')
    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', false)
    expect(harness.api.getDesktopStatus).toHaveBeenCalled()
    expect(harness.api.subscribeDesktopEvents).toHaveBeenCalledOnce()
    expect(wrapper.get('section[aria-label="Opções do aplicativo"]').attributes('aria-label')).toBe('Opções do aplicativo')
    expect(wrapper.get('input[type="checkbox"]').element.closest('label')).not.toBeNull()
    const quitButton = wrapper.findAll('button').find(button => button.text() === 'Sair')
    expect(quitButton?.attributes('type')).toBe('button')
  })

  it('opt-in envia desired booleano e readback reflete o estado do SO; falha não mantém valor falso', async () => {
    const harness = setup()
    const wrapper = await mountSettings()
    harness.api.setStartAtLogin.mockResolvedValueOnce({ version: 1, status: 'ok', startup: 'ON' })
    harness.status = desktop({ startup: 'ON' })
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await flushPromises()
    expect(harness.api.setStartAtLogin).toHaveBeenCalledExactlyOnceWith({ version: 1, desired: true })
    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', true)
    expect(wrapper.text()).toContain('Estado de inicialização consultado no Windows')

    harness.api.setStartAtLogin.mockResolvedValueOnce({ version: 1, status: 'error', code: 'NATIVE_OPERATION_FAILED' })
    harness.status = desktop({ startup: 'ON' })
    await wrapper.get('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', true)
    expect(wrapper.text()).toContain('Não foi possível confirmar a alteração')
  })

  it('UNAVAILABLE desabilita o toggle e resultados incertos pedem nova consulta', async () => {
    const harness = setup(desktop({ startup: 'UNAVAILABLE' }))
    const wrapper = await mountSettings()
    expect(wrapper.get('input[type="checkbox"]').attributes('aria-disabled')).toBe('true')
    expect(harness.api.setStartAtLogin).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Disponível na instalação de produção')
  })

  it('suspensão e ativação de controle suspendem/retomam a superfície; localizar consulta a tag', async () => {
    const harness = setup()
    const wrapper = await mountSettings()
    const store = useTasksStore()
    const resume = vi.spyOn(store, 'resumeSurface').mockResolvedValue()
    const locate = vi.spyOn(store, 'locateReminder').mockResolvedValue()
    harness.control?.({ version: 1, sequence: 2, kind: 'surface-suspended' })
    expect(store.surfaceSuspended).toBe(true)
    harness.control?.({ version: 1, sequence: 3, kind: 'surface-active' })
    await flushPromises()
    expect(resume).toHaveBeenCalled()
    harness.control?.({ version: 1, sequence: 4, kind: 'locate-reminder', tag: 'b'.repeat(64) })
    await flushPromises()
    expect(locate).toHaveBeenCalledExactlyOnceWith('b'.repeat(64))
    expect(wrapper.text()).toBeTruthy()
  })

  it('Sair pede encerramento pelo wrapper e não abre caminho nativo alternativo', async () => {
    const harness = setup()
    const wrapper = await mountSettings()
    await wrapper.findAll('button').find(button => button.text() === 'Sair')?.trigger('click')
    await flushPromises()
    expect(harness.api.requestQuit).toHaveBeenCalledExactlyOnceWith({ version: 1 })
  })
})
