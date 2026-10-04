/**
 * Acesso restrito ao construtor `URL` padrão, disponível no Electron, no Node e no browser.
 * A declaração estrutural evita depender dos tipos de DOM ou de Node no núcleo portável e
 * expõe somente os campos que o produto usa.
 */
export interface ParsedUrl {
  protocol: string
  hostname: string
  username: string
  password: string
  href: string
}

declare const URL: { new (input: string): ParsedUrl }

export function parseUrl(value: string): ParsedUrl | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}
