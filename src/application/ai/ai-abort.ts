/**
 * Cancelamento mínimo do núcleo portável: a declaração estrutural evita depender dos tipos de DOM
 * ou de Node (o typecheck de contratos não carrega nenhuma das duas libs). O sinal real do runtime
 * satisfaz este contrato, e o controlador interno implementa somente o que o produto usa.
 */
export interface AiAbortSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void): void
  removeEventListener(type: 'abort', listener: () => void): void
}

export interface AiAbortController {
  readonly signal: AiAbortSignal
  abort(): void
}

/** Controlador observável do núcleo: um disparo, listeners executados uma única vez. */
export function createAiAbortController(): AiAbortController {
  let aborted = false
  const listeners = new Set<() => void>()
  const signal: AiAbortSignal = {
    get aborted() {
      return aborted
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener)
    },
  }

  return {
    signal,
    abort: () => {
      if (aborted) {
        return
      }

      aborted = true

      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          // Um listener com falha não impede o disparo dos demais.
        }
      }

      listeners.clear()
    },
  }
}
