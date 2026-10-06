import { asExactRecord, serializedBytes } from '../../contracts/record.js'
import { isReminderTag } from '../../contracts/desktop.js'

/** Callback COM e relay aceitam só a referência fechada, nunca argv/cwd/URL. */
export function parseNativeActivation(value: unknown): string | undefined {
  if ((serializedBytes(value) ?? Infinity) > 1024) return undefined
  const record = asExactRecord(value, ['type', 'arguments'], ['userInputs'])
  if (record === null || record['type'] !== 'click' || typeof record['arguments'] !== 'string') return undefined
  if ('userInputs' in record && (asExactRecord(record['userInputs'], []) === null)) return undefined
  const parts = record['arguments'].split('&')
  if (parts.length !== 2 || !parts.includes('type=click')) return undefined
  const tag = parts.find(part => part.startsWith('tag='))?.slice(4)
  return isReminderTag(tag) ? tag : undefined
}
export function parseActivationRelay(value: unknown): string | undefined {
  if ((serializedBytes(value) ?? Infinity) > 1024) return undefined
  const record = asExactRecord(value, ['version', 'kind', 'tag'])
  return record?.['version'] === 1 && record['kind'] === 'reminder-activation' && isReminderTag(record['tag']) ? record['tag'] : undefined
}
export class ReminderActivationRoute {
  #lastTag: string | undefined
  #lastTime = -Infinity
  #pending: string | undefined
  constructor(readonly now: () => number, readonly open: () => void, readonly locate: (tag: string) => void) {}
  accept(tag: string): boolean {
    if (!isReminderTag(tag)) return false
    const now = this.now()
    if (this.#lastTag === tag && now - this.#lastTime < 2000 && now >= this.#lastTime) return false
    this.#lastTag = tag; this.#lastTime = now; this.#pending = tag
    this.open(); return true
  }
  ready(): void {
    if (this.#pending === undefined) return
    const tag = this.#pending; this.#pending = undefined; this.locate(tag)
  }
}
