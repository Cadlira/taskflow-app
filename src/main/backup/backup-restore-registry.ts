// Preparações de restauração: cópia validada imutável no main, uma por documento, com token opaco
// próprio (24 bytes/base64url), contexto e revisão global da base, TTL monotônico de 5 minutos e
// consumo único. A reserva lógica permanece contabilizada enquanto a preparação existe e é
// liberada em consume/cancel/expiração/troca/encerramento/barreira global.
import type { Revision } from '../../application/storage/revisions.js'
import type { BackupReservation, BackupResourceLedger } from '../../application/backup/backup-resources.js'
import type { Task } from '../../domain/task.js'
import { BACKUP_PREVIEW_TTL_MS } from '../../contracts/backup.js'

const RETIRED_TOKENS_PER_DOCUMENT = 16

export interface BackupPreparation {
  readonly token: string
  readonly contextSequence: number
  readonly baseRevision: Revision
  readonly sourceFormatVersion: number
  readonly exportedAt: string
  readonly appVersion: string
  readonly fileTaskCount: number
  readonly localTaskCount: number
  readonly tasks: readonly Task[]
  readonly reservation: BackupReservation
  readonly expiresAt: number
}

export interface PublishBackupPreparationInput {
  contextSequence: number
  baseRevision: Revision
  sourceFormatVersion: number
  exportedAt: string
  appVersion: string
  fileTaskCount: number
  localTaskCount: number
  tasks: readonly Task[]
  chargeBytes: number
}

export type PublishBackupPreparationResult =
  | { status: 'ok'; preparation: BackupPreparation }
  | { status: 'resource-limit' }

export type ConsumeBackupPreparationResult =
  | { status: 'ok'; preparation: BackupPreparation }
  | { status: 'expired' }
  | { status: 'invalid' }

export type CancelBackupPreparationResult = { status: 'ok' } | { status: 'invalid' }

type RetiredReason = 'consumed' | 'expired' | 'replaced'

interface DocumentPreparations {
  sequence: number
  current?: BackupPreparation | undefined
  retired: Map<string, RetiredReason>
}

export interface BackupRestoreRegistryOptions {
  ledger: BackupResourceLedger
  /** Token opaco gerado pelo main; nunca derivado de dados do arquivo. */
  randomToken: () => string
  now?: () => number
  ttlMs?: number
}

export class BackupRestoreRegistry {
  readonly #ledger: BackupResourceLedger
  readonly #randomToken: () => string
  readonly #now: () => number
  readonly #ttlMs: number
  readonly #documents = new Map<string, DocumentPreparations>()

  constructor(options: BackupRestoreRegistryOptions) {
    this.#ledger = options.ledger
    this.#randomToken = options.randomToken
    this.#now = options.now ?? (() => Date.now())
    this.#ttlMs = options.ttlMs ?? BACKUP_PREVIEW_TTL_MS
  }

  get activePreparations(): number {
    return [...this.#documents.values()].filter((document) => document.current !== undefined).length
  }

  get usedBytes(): number {
    return this.#ledger.usedBytes
  }

  #documentFor(documentKey: string): DocumentPreparations {
    let document = this.#documents.get(documentKey)
    if (document === undefined) {
      document = { sequence: 0, retired: new Map() }
      this.#documents.set(documentKey, document)
    }
    return document
  }

  #retire(document: DocumentPreparations, token: string, reason: RetiredReason): void {
    document.retired.set(token, reason)
    while (document.retired.size > RETIRED_TOKENS_PER_DOCUMENT) {
      const oldest = document.retired.keys().next().value
      if (oldest === undefined) break
      document.retired.delete(oldest)
    }
  }

  /** Libera a preparação corrente (se houver) e a marca como substituída/expirada/consumida. */
  #clearCurrent(document: DocumentPreparations, reason: RetiredReason): void {
    const current = document.current
    if (current === undefined) return
    this.#ledger.release(current.reservation)
    this.#retire(document, current.token, reason)
    document.current = undefined
  }

  /** Preparação corrente e ainda válida; expirada é liberada e descartada na primeira consulta. */
  #validCurrent(documentKey: string): BackupPreparation | undefined {
    const document = this.#documents.get(documentKey)
    if (document?.current === undefined) return undefined
    if (this.#now() >= document.current.expiresAt) {
      this.#clearCurrent(document, 'expired')
      return undefined
    }
    return document.current
  }

  /** Publica uma preparação nova; a anterior do mesmo documento é liberada sem acumular. */
  publish(documentKey: string, input: PublishBackupPreparationInput): PublishBackupPreparationResult {
    const document = this.#documentFor(documentKey)
    this.#clearCurrent(document, 'replaced')

    const reservation = this.#ledger.reserve(input.chargeBytes)
    if (reservation.status !== 'ok') return { status: 'resource-limit' }

    const preparation: BackupPreparation = {
      token: this.#randomToken(),
      contextSequence: input.contextSequence,
      baseRevision: input.baseRevision,
      sourceFormatVersion: input.sourceFormatVersion,
      exportedAt: input.exportedAt,
      appVersion: input.appVersion,
      fileTaskCount: input.fileTaskCount,
      localTaskCount: input.localTaskCount,
      tasks: input.tasks,
      reservation: reservation.reservation,
      expiresAt: this.#now() + this.#ttlMs,
    }
    document.sequence = input.contextSequence
    document.current = preparation
    return { status: 'ok', preparation }
  }

  /** Leitura da preparação corrente válida (para testes/diagnóstico; não consome). */
  current(documentKey: string): BackupPreparation | undefined {
    return this.#validCurrent(documentKey)
  }

  /**
   * Consome a preparação própria uma única vez, inclusive quando a confirmação falha depois. Token
   * expirado é distinguido de token inválido/alheio; nenhum caminho toca preparação de outro
   * documento.
   */
  consume(documentKey: string, token: string): ConsumeBackupPreparationResult {
    const document = this.#documents.get(documentKey)
    if (document === undefined) return { status: 'invalid' }

    const current = document.current
    if (current !== undefined && current.token === token) {
      if (this.#now() >= current.expiresAt) {
        this.#clearCurrent(document, 'expired')
        return { status: 'expired' }
      }
      this.#clearCurrent(document, 'consumed')
      return { status: 'ok', preparation: current }
    }

    const retired = document.retired.get(token)
    return retired === 'expired' ? { status: 'expired' } : { status: 'invalid' }
  }

  /**
   * Cancela a preparação própria; repetição é idempotente. Token alheio/desconhecido é inválido e
   * não afeta nenhuma outra preparação.
   */
  cancel(documentKey: string, token: string): CancelBackupPreparationResult {
    const document = this.#documents.get(documentKey)
    if (document === undefined) return { status: 'invalid' }
    if (document.current?.token === token) {
      this.#clearCurrent(document, 'replaced')
      return { status: 'ok' }
    }
    return document.retired.has(token) ? { status: 'ok' } : { status: 'invalid' }
  }

  /** Barreira global de sucesso do backup/recuperação: libera TODAS as preparações existentes. */
  invalidateAll(): void {
    for (const document of this.#documents.values()) this.#clearCurrent(document, 'replaced')
  }

  /**
   * Contexto novo no documento libera preparação obsoleta (troca de área/ação); a preparação
   * publicada no contexto corrente permanece.
   */
  releaseOutdated(documentKey: string, contextSequence: number): void {
    const document = this.#documents.get(documentKey)
    if (document?.current === undefined) return
    if (document.current.contextSequence !== contextSequence) this.#clearCurrent(document, 'replaced')
  }

  /** Sessão encerrada/navegada: libera a preparação do documento. */
  forgetDocument(documentKey: string): void {
    const document = this.#documents.get(documentKey)
    if (document === undefined) return
    this.#clearCurrent(document, 'replaced')
    this.#documents.delete(documentKey)
  }
}
