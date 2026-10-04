import { utf8ByteLength } from './text.js'

/** Registro simples com propriedades enumeráveis de dados: rejeita arrays, protótipos e símbolos. */
export type PlainRecord = Record<string, unknown>

/**
 * Objeto simples com propriedades enumeráveis de dados: rejeita array, protótipo estranho,
 * símbolo, propriedade não enumerável ou acessor; não restringe chaves.
 */
export function asPlainRecord(value: unknown): PlainRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  try {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return null
    if (Object.getOwnPropertySymbols(value).length > 0) return null
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return null
    }
    return value as PlainRecord
  } catch {
    return null
  }
}

/**
 * Objeto simples com exatamente as chaves permitidas (as obrigatórias e, no máximo, as opcionais).
 * Rejeita array, protótipo estranho, símbolo, propriedade não enumerável ou acessor.
 */
export function asExactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): PlainRecord | null {
  const record = asPlainRecord(value)
  if (record === null) return null
  const keys = Object.getOwnPropertyNames(record)
  if (!required.every((key) => keys.includes(key))) return null
  if (!keys.every((key) => required.includes(key) || optional.includes(key))) return null
  return record
}

/** Bytes UTF-8 do JSON serializado, ou `null` quando o valor não serializa. */
export function serializedBytes(value: unknown): number | null {
  try {
    const json: unknown = JSON.stringify(value)
    return typeof json === 'string' ? utf8ByteLength(json) : null
  } catch {
    return null
  }
}
