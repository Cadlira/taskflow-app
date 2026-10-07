import { open, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import {
  ANTHROPIC_API_BASE,
  isAiProvider,
  OPENAI_API_BASE,
  validateApiBase,
  type AiProvider,
  type AiProviderConfig,
} from '../../domain/ai-provider.js'
import { isAiRevision } from '../../contracts/ai.js'
import { asPlainRecord } from '../../contracts/record.js'
import {
  AiConfigStorageError,
  type AiProviderConfigRepository,
  type AiProviderConfigSaveInput,
  type AiStoredConfigSummary,
  type AiStoredState,
} from '../../application/ai/ai-provider-config-repository.js'
import type { AiNativeProtection } from './native-protection.js'

/** Limite do arquivo versionado da configuração de IA. Segredos não crescem além disso. */
export const AI_CONFIG_FILE_BYTES = 8 * 1024

export type AiConfigFaultPoint =
  | 'read:before'
  | 'encrypt:before'
  | 'decrypt:before'
  | 'temp:open'
  | 'temp:write'
  | 'temp:flush'
  | 'temp:readback'
  | 'previous:write'
  | 'previous:readback'
  | 'publication:before'
  | 'publication:after'
  | 'publication:readback'
  | 'cleanup:before'

export interface AiConfigFaults {
  at?(point: AiConfigFaultPoint): void | Promise<void>
}

interface StoredConfig {
  provider: AiProvider
  apiBase?: string | undefined
  model: string
  /** Ciphertext em base64; nunca texto claro. */
  credential: string
}

interface StoredEnvelope {
  revision: string
  config: StoredConfig | null
}

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function incompatible(cause?: unknown): AiConfigStorageError {
  return new AiConfigStorageError(
    'INCOMPATIBLE_DATA',
    'A configuração de IA salva está em um formato incompatível. Nada foi alterado para preservá-la.',
    { cause },
  )
}

function unavailable(cause?: unknown): AiConfigStorageError {
  return new AiConfigStorageError('UNAVAILABLE', 'A configuração de IA não pôde ser gravada.', { cause })
}

/**
 * Decodifica o envelope versionado. Estrutura desconhecida, versão futura ou revisão fora do
 * formato são recusadas integralmente: nenhum caminho sobrescreve dados incompatíveis.
 */
function decodeEnvelope(text: string): StoredEnvelope {
  let value: unknown

  try {
    value = JSON.parse(text) as unknown
  } catch (cause) {
    throw incompatible(cause)
  }

  const record = asPlainRecord(value)

  if (record === null) {
    throw incompatible()
  }

  const keys = Object.getOwnPropertyNames(record)

  if (!keys.every((key) => key === 'version' || key === 'revision' || key === 'config') || !('version' in record) || !('revision' in record) || !('config' in record)) {
    throw incompatible()
  }

  if (record['version'] !== 1 || !isAiRevision(record['revision'])) {
    throw incompatible()
  }

  const raw = record['config']

  if (raw === null) {
    return { revision: record['revision'], config: null }
  }

  const config = asPlainRecord(raw)

  if (config === null) {
    throw incompatible()
  }

  const configKeys = Object.getOwnPropertyNames(config)

  if (
    !configKeys.every((key) => key === 'provider' || key === 'apiBase' || key === 'model' || key === 'credential') ||
    !('provider' in config) ||
    !('model' in config) ||
    !('credential' in config)
  ) {
    throw incompatible()
  }

  const provider = config['provider']

  if (!isAiProvider(provider)) {
    throw incompatible()
  }

  if (typeof config['model'] !== 'string' || config['model'].trim() === '') {
    throw incompatible()
  }

  if (typeof config['credential'] !== 'string' || config['credential'] === '') {
    throw incompatible()
  }

  if (provider !== 'CUSTOM') {
    // Base gravada em provedor oficial denuncia estrutura de outra origem: nada é sobrescrito.
    if (config['apiBase'] !== undefined) {
      throw incompatible()
    }

    return { revision: record['revision'], config: { provider, model: config['model'], credential: config['credential'] } }
  }

  if (typeof config['apiBase'] !== 'string') {
    throw incompatible()
  }

  const validated = validateApiBase(config['apiBase'])

  if (!validated.ok) {
    throw incompatible()
  }

  return {
    revision: record['revision'],
    config: { provider: 'CUSTOM', apiBase: validated.base, model: config['model'], credential: config['credential'] },
  }
}

function summarize(config: StoredConfig): AiStoredConfigSummary {
  return {
    provider: config.provider,
    apiBase:
      config.provider === 'CUSTOM'
        ? (config.apiBase as string)
        : config.provider === 'OPENAI'
          ? OPENAI_API_BASE
          : ANTHROPIC_API_BASE,
    model: config.model,
    hasCredential: true,
  }
}

/** Igualdade dos estados crus do arquivo, incluindo ausente e acima do limite. */
function sameRaw(left: Buffer | 'OVERSIZED' | undefined, right: Buffer | 'OVERSIZED' | undefined): boolean {
  if (left === undefined || right === undefined || left === 'OVERSIZED' || right === 'OVERSIZED') {
    return left === right
  }

  return left.equals(right)
}

/** Revisão declarada mesmo em arquivo estruturalmente inválido, para remoção monotônica. */
function looseRevision(text: string): string | undefined {
  try {
    const value = JSON.parse(text) as unknown
    const record = asPlainRecord(value)
    const revision = record?.['revision']
    return isAiRevision(revision) ? revision : undefined
  } catch {
    return undefined
  }
}

/**
 * Arquivo `<userData>/ai.json`, versão 1, com a credencial cifrada pelo mecanismo nativo e
 * publicação atômica no padrão das preferências de atalhos (temp exclusivo, flush, readback,
 * `previous`, rename e releitura). Estado `UNKNOWN` bloqueia novos setters até a reconciliação
 * explícita; estrutura desconhecida é preservada e só a remoção explícita a substitui.
 */
export class FileAiProviderConfig implements AiProviderConfigRepository {
  readonly file: string
  readonly temporary: string
  readonly previous: string
  #uncertain = false
  #active = false

  constructor(
    userData: string,
    readonly protection: AiNativeProtection,
    readonly faults: AiConfigFaults = {},
  ) {
    this.file = path.join(userData, 'ai.json')
    this.temporary = path.join(userData, 'ai.json.temporary')
    this.previous = path.join(userData, 'ai.json.previous')
  }

  get uncertain(): boolean {
    return this.#uncertain
  }

  protectionAvailable(): boolean {
    return this.protection.available()
  }

  /** Bytes crus do arquivo, com limite defensivo; `undefined` quando não existe. */
  async #readBytes(file: string): Promise<Buffer | 'OVERSIZED' | undefined> {
    let handle: FileHandle | undefined

    try {
      handle = await open(file, 'r')
      const stat = await handle.stat()

      if (!stat.isFile() || stat.size > AI_CONFIG_FILE_BYTES) {
        return 'OVERSIZED'
      }

      const buffer = Buffer.alloc(AI_CONFIG_FILE_BYTES + 1)
      let count = 0

      for (;;) {
        const read = await handle.read(buffer, count, buffer.length - count, count)
        if (read.bytesRead === 0) break
        count += read.bytesRead
        if (count > AI_CONFIG_FILE_BYTES) return 'OVERSIZED'
      }

      return Buffer.from(buffer.subarray(0, count))
    } catch (error) {
      if (handle === undefined && missing(error)) return undefined
      throw error
    } finally {
      await handle?.close()
    }
  }

  async #decodeFile(file: string): Promise<StoredEnvelope | undefined> {
    const bytes = await this.#readBytes(file)

    if (bytes === undefined) {
      return undefined
    }

    if (bytes === 'OVERSIZED') {
      throw new AiConfigStorageError('RESOURCE_LIMIT', 'O arquivo de configuração de IA excede o limite.')
    }

    const text = bytes.toString('utf8')

    if (!Buffer.from(text, 'utf8').equals(bytes)) {
      throw incompatible()
    }

    return decodeEnvelope(text)
  }

  /** Estado corrente sem decifrar a credencial. */
  async read(): Promise<AiStoredState> {
    if (this.#uncertain) {
      throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA está incerta.')
    }

    await this.faults.at?.('read:before')
    const envelope = await this.#decodeFile(this.file)

    if (envelope === undefined) {
      return { revision: '0' }
    }

    if (envelope.config === null) {
      return { revision: envelope.revision }
    }

    return { revision: envelope.revision, summary: summarize(envelope.config) }
  }

  /** Decifra sob demanda, para uma única requisição; nunca devolve a credencial por leitura. */
  async openCredential(): Promise<{ config: AiProviderConfig; revision: string } | undefined> {
    if (this.#uncertain) {
      throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA está incerta.')
    }

    const envelope = await this.#decodeFile(this.file)

    if (envelope === undefined || envelope.config === null) {
      return undefined
    }

    if (!this.protection.available()) {
      throw new AiConfigStorageError(
        'PROTECTION_UNAVAILABLE',
        'A proteção nativa da credencial não está disponível. Salvar e usar ficam bloqueados.',
      )
    }

    await this.faults.at?.('decrypt:before')
    let credential: string

    try {
      credential = this.protection.decrypt(Buffer.from(envelope.config.credential, 'base64'))
    } catch (cause) {
      throw new AiConfigStorageError(
        'CREDENTIAL_UNREADABLE',
        'A credencial salva não pode ser decifrada neste perfil. O arquivo foi preservado; resta removê-la.',
        { cause },
      )
    }

    const config: AiProviderConfig =
      envelope.config.provider === 'CUSTOM'
        ? { provider: 'CUSTOM', apiBase: envelope.config.apiBase as string, credential, model: envelope.config.model }
        : { provider: envelope.config.provider, credential, model: envelope.config.model }

    return { config, revision: envelope.revision }
  }

  async #write(handle: FileHandle, bytes: Buffer): Promise<void> {
    let offset = 0

    while (offset < bytes.length) {
      const written = await handle.write(bytes, offset, bytes.length - offset)
      if (written.bytesWritten <= 0) throw unavailable()
      offset += written.bytesWritten
    }
  }

  /**
   * Publicação atômica de bytes já validados. Qualquer falha depois da tentativa de rename, ou a
   * presença de um temporário órfão, marca o estado como incerto e bloqueia novos setters.
   */
  async #publish(bytes: Buffer): Promise<void> {
    const original = await this.#readBytes(this.file)
    let ownTemporary = false
    let attemptedPublication = false
    let handle: FileHandle | undefined

    try {
      await this.faults.at?.('temp:open')
      // Um único temporário; órfão anterior é preservado e bloqueia, nunca é sobrescrito.
      handle = await open(this.temporary, 'wx', 0o600)
      ownTemporary = true
      await this.faults.at?.('temp:write')
      await this.#write(handle, bytes)
      await this.faults.at?.('temp:flush')
      await handle.sync()
      await handle.close()
      handle = undefined
      await this.faults.at?.('temp:readback')
      const temporary = await this.#readBytes(this.temporary)

      if (temporary === undefined || temporary === 'OVERSIZED' || !temporary.equals(bytes)) throw unavailable()

      if (original !== undefined && original !== 'OVERSIZED') {
        await this.faults.at?.('previous:write')
        handle = await open(this.previous, 'w', 0o600)
        await this.#write(handle, original)
        await handle.sync()
        await handle.close()
        handle = undefined
        await this.faults.at?.('previous:readback')
        const previous = await this.#readBytes(this.previous)

        if (previous === undefined || previous === 'OVERSIZED' || !previous.equals(original)) throw unavailable()
      }

      await this.faults.at?.('publication:before')
      const rechecked = await this.#readBytes(this.file)

      if (!sameRaw(original, rechecked)) {
        throw new AiConfigStorageError('STALE_REVISION', 'A configuração de IA mudou durante a gravação.')
      }

      attemptedPublication = true
      await rename(this.temporary, this.file)
      ownTemporary = false
      await this.faults.at?.('publication:after')
      await this.faults.at?.('publication:readback')
      const confirmed = await this.#readBytes(this.file)

      if (confirmed === undefined || confirmed === 'OVERSIZED' || !confirmed.equals(bytes)) {
        throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA ficou incerta.')
      }
    } catch (error) {
      if (attemptedPublication || (!ownTemporary && typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')) {
        this.#uncertain = true
        throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA ficou incerta.', { cause: error })
      }

      throw error instanceof AiConfigStorageError ? error : unavailable(error)
    } finally {
      try {
        await handle?.close()
      } catch {
        this.#uncertain = true
      }

      if (ownTemporary && !this.#uncertain) {
        try {
          await this.faults.at?.('cleanup:before')
          await unlink(this.temporary)
        } catch {
          this.#uncertain = true
        }
      }
    }
  }

  /** Substitui a configuração por completo sob CAS; credencial ausente preserva o ciphertext. */
  async save(input: AiProviderConfigSaveInput): Promise<AiStoredState> {
    if (this.#uncertain) {
      throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA está incerta.')
    }

    if (this.#active) {
      throw unavailable()
    }

    if (!this.protection.available()) {
      throw new AiConfigStorageError(
        'PROTECTION_UNAVAILABLE',
        'A proteção nativa da credencial não está disponível. Salvar e usar ficam bloqueados.',
      )
    }

    this.#active = true

    try {
      await this.faults.at?.('read:before')
      const envelope = await this.#decodeFile(this.file)
      const currentRevision = envelope?.revision ?? '0'

      if (currentRevision !== input.expectedRevision) {
        throw new AiConfigStorageError('STALE_REVISION', 'A revisão esperada não é a corrente. Nada foi gravado.')
      }

      let stored: StoredConfig

      if (input.provider === 'CUSTOM') {
        const validated = validateApiBase(input.apiBase ?? '')

        if (!validated.ok) throw unavailable()

        stored = { provider: 'CUSTOM', apiBase: validated.base, model: input.model, credential: '' }
      } else {
        stored = { provider: input.provider, model: input.model, credential: '' }
      }

      if (input.credential !== undefined) {
        await this.faults.at?.('encrypt:before')
        let ciphertext: Buffer

        try {
          ciphertext = this.protection.encrypt(input.credential)
        } catch (cause) {
          throw new AiConfigStorageError(
            'PROTECTION_UNAVAILABLE',
            'A proteção nativa da credencial não está disponível. Salvar e usar ficam bloqueados.',
            { cause },
          )
        }

        stored = { ...stored, credential: ciphertext.toString('base64') }
      } else {
        const preserved = envelope?.config?.credential

        if (preserved === undefined || preserved === '') {
          throw unavailable()
        }

        stored = { ...stored, credential: preserved }
      }

      const revision = (BigInt(currentRevision) + 1n).toString()
      const bytes = Buffer.from(JSON.stringify({ version: 1, revision, config: stored }), 'utf8')

      if (bytes.length > AI_CONFIG_FILE_BYTES) {
        throw new AiConfigStorageError('RESOURCE_LIMIT', 'A configuração de IA excede o limite do arquivo.')
      }

      await this.#publish(bytes)

      return { revision, summary: summarize(stored) }
    } finally {
      this.#active = false
    }
  }

  /**
   * Remove a configuração e o ciphertext, inclusive em arquivo incompatível ou indecifrável.
   * Grava um envelope sem configuração com a revisão incrementada: a ausência de arquivo não
   * reinicia a numeração, preservando o CAS de gravações antigas.
   */
  async remove(): Promise<{ revision: string }> {
    if (this.#uncertain) {
      throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA está incerta.')
    }

    if (this.#active) {
      throw unavailable()
    }

    this.#active = true

    try {
      const bytes = await this.#readBytes(this.file)

      if (bytes === undefined) {
        return { revision: '0' }
      }

      const known = bytes === 'OVERSIZED' ? undefined : looseRevision(bytes.toString('utf8'))
      const revision = (BigInt(known ?? '0') + 1n).toString()
      const next = Buffer.from(JSON.stringify({ version: 1, revision, config: null }), 'utf8')
      await this.#publish(next)
      return { revision }
    } finally {
      this.#active = false
    }
  }

  /** Gesture explícito: descarta somente o temporário próprio e libera novos setters. */
  async reconcile(): Promise<void> {
    if (this.#active) {
      throw new AiConfigStorageError('UNKNOWN', 'A publicação da configuração de IA está incerta.')
    }

    try {
      await unlink(this.temporary)
    } catch (error) {
      if (!missing(error)) {
        throw new AiConfigStorageError('UNKNOWN', 'O temporário da configuração de IA não pôde ser descartado.', { cause: error })
      }
    }

    this.#uncertain = false
  }

  /** Revisão corrente sem decifrar; usada para descartar resposta de configuração trocada. */
  async currentRevision(): Promise<string> {
    const envelope = await this.#decodeFile(this.file)
    return envelope?.revision ?? '0'
  }
}
