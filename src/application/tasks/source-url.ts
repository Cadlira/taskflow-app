import { parseUrl } from '../../domain/url.js'

/** Limite documentado do Windows para a URL serializada entregue ao shell. */
export const WINDOWS_URL_CHAR_LIMIT = 2081

/** Controles ASCII recusados antes de qualquer parse. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export type SourceUrlValidation =
  | { ok: true; href: string }
  | { ok: false; code: 'SOURCE_NOT_ALLOWED' | 'SOURCE_TOO_LONG' }

/**
 * Validação final do main para a origem **salva**: string antes do parse, somente HTTP/HTTPS com
 * host, sem credenciais nem controles, e href serializado até o limite Windows. Nunca trunca,
 * regrava ou devolve a string não validada; a URL histórica permanece intacta no banco.
 */
export function validateSourceUrlForOpen(raw: string): SourceUrlValidation {
  if (hasControlCharacter(raw)) return { ok: false, code: 'SOURCE_NOT_ALLOWED' }

  const url = parseUrl(raw)
  if (url === undefined) return { ok: false, code: 'SOURCE_NOT_ALLOWED' }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, code: 'SOURCE_NOT_ALLOWED' }
  if (url.hostname.length === 0) return { ok: false, code: 'SOURCE_NOT_ALLOWED' }
  if (url.username.length > 0 || url.password.length > 0) return { ok: false, code: 'SOURCE_NOT_ALLOWED' }

  if (url.href.length > WINDOWS_URL_CHAR_LIMIT) return { ok: false, code: 'SOURCE_TOO_LONG' }
  return { ok: true, href: url.href }
}
