// Normalização/corte revisados de taskflow-extension@a763e7a/src/domain/page-capture.ts (MIT).
// Classificação e origem manual desktop seguem D4 da TFA-009; nenhuma leitura/rede aqui.
import { TASK_LIMITS } from './task-draft.js'
import { parseUrl } from './url.js'

export interface CaptureFlags {
  titleTruncated: boolean
  descriptionTruncated: boolean
  sourceOpeningLimited: boolean
}
export interface CapturedDraft {
  kind: 'URL' | 'TEXT'
  title: string
  description?: string
  sourceUrl?: string
  flags: CaptureFlags
}
export type CaptureMapping =
  | { ok: true; draft: CapturedDraft }
  | { ok: false; code: 'EMPTY' | 'UNSUPPORTED' | 'INVALID_TEXT' }

export function normalizeCaptureText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Rejeita substitutos literais órfãos antes de normalizar, parsear ou publicar. */
export function isWellFormedCaptureText(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

/** Limites do produto em unidades UTF-16, incluindo ellipsis; nunca divide emoji. */
export function truncateCaptureText(text: string, limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('INVALID_CAPTURE_LIMIT')
  if (text.length <= limit) return text
  let cut = limit - 1
  const before = text.charCodeAt(cut - 1)
  const after = text.charCodeAt(cut)
  if (cut > 0 && before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) cut -= 1
  return `${text.slice(0, cut)}…`
}

const ABSOLUTE_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
function hasControls(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** Origem nova é sempre um token HTTP(S) absoluto completo, sem userinfo nem controles. */
export function validateCaptureSource(raw: string): { ok: true; href: string } | { ok: false; code: 'UNSUPPORTED' | 'INVALID_TEXT' } {
  if (!isWellFormedCaptureText(raw)) return { ok: false, code: 'INVALID_TEXT' }
  const value = raw.trim()
  if (hasControls(raw) || /\s/.test(value) || !/^https?:\/\//i.test(value)) return { ok: false, code: 'UNSUPPORTED' }
  // O parser remove userinfo vazio; recusá-lo também na autoridade literal.
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0]
  if (!authority || authority.includes('@') || authority.includes('\\')) return { ok: false, code: 'UNSUPPORTED' }
  const parsed = parseUrl(value)
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    return { ok: false, code: 'UNSUPPORTED' }
  }
  return { ok: true, href: parsed.href }
}

export function mapClipboardText(raw: string): CaptureMapping {
  if (!isWellFormedCaptureText(raw)) return { ok: false, code: 'INVALID_TEXT' }
  const value = raw.trim()
  if (!value) return { ok: false, code: 'EMPTY' }
  if (ABSOLUTE_SCHEME.test(value) && !/\s/.test(value)) {
    const source = validateCaptureSource(raw)
    if (!source.ok) return source
    return { ok: true, draft: { kind: 'URL', title: '', sourceUrl: source.href,
      flags: { titleTruncated: false, descriptionTruncated: false, sourceOpeningLimited: source.href.length > 2081 } } }
  }
  const normalized = normalizeCaptureText(raw)
  const long = normalized.length > TASK_LIMITS.title
  return { ok: true, draft: {
    kind: 'TEXT', title: truncateCaptureText(normalized, TASK_LIMITS.title),
    ...(long ? { description: truncateCaptureText(value, TASK_LIMITS.description) } : {}),
    flags: { titleTruncated: long, descriptionTruncated: long && value.length > TASK_LIMITS.description, sourceOpeningLimited: false },
  } }
}
