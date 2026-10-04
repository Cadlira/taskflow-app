// Cópia revisada e ampliada de taskflow-extension@a763e7a src/components/tasks/date-time.ts
// (MIT, mesmo autor). Mantém a conversão local com comparação das partes e a exibição pt-BR;
// acrescenta preservação do ISO intacto e detecção explícita de mudança de fuso.
const LOCAL_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Valor reconhecido como entrada impossível; o main recusa com INVALID_DATE. */
export const INVALID_DATE_INPUT = 'data-invalida'

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Converte um instante ISO para o valor de `<input type="datetime-local">` no fuso local. */
export function toLocalDateTimeInput(iso: string | undefined): string {
  if (!iso) return ''

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/**
 * Converte data e hora locais digitadas para ISO 8601 UTC. A comparação das partes recusa datas
 * impossíveis e gaps; hora repetida segue a escolha anterior do `Date` local. Vazio devolve
 * `undefined`; impossível devolve `INVALID_DATE_INPUT`.
 */
export function fromLocalDateTimeInput(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const match = LOCAL_INPUT_PATTERN.exec(trimmed)
  if (!match) return INVALID_DATE_INPUT

  const [year, month, day, hours, minutes] = match.slice(1).map(Number) as [number, number, number, number, number]
  const date = new Date(year, month - 1, day, hours, minutes)

  const matchesInput =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes

  return matchesInput ? date.toISOString() : INVALID_DATE_INPUT
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

/** Formata o instante para a mensagem de confirmação do prazo (`pt-BR`). */
export function formatInstant(iso: string): string {
  return formatDateTime(iso)
}

export interface TimeZoneReviewInput {
  /** ISO originalmente salvo, se houver. */
  originalIso: string | undefined
  /** Texto exibido no campo quando o formulário abriu. */
  capturedInput: string | undefined
  /** Texto atual do campo; vazio significa prazo removido (não precisa de revisão). */
  nextInput: string | undefined
  /** O usuário alterou o prazo nesta edição? */
  dirty: boolean
  /** Conversão atual (fuso corrente); injetável em teste. */
  convert?: (iso: string) => string
}

/**
 * Mudança de fuso com prazo alterado: o texto capturado ao abrir deixa de corresponder ao ISO
 * salvo no fuso corrente. Exige revisão explícita antes do save; sem alteração de prazo ou com o
 * prazo removido, o ISO original é conservado e nada é bloqueado.
 */
export function needsTimeZoneReview(input: TimeZoneReviewInput): boolean {
  if (!input.dirty || input.originalIso === undefined || input.capturedInput === undefined) return false
  if (input.nextInput === undefined || input.nextInput.trim() === '') return false
  const convert = input.convert ?? toLocalDateTimeInput
  return convert(input.originalIso) !== input.capturedInput
}
