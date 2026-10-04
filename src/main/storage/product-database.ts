import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { INITIAL_REVISION, isRevision, nextRevision, type Revision } from '../../application/storage/revisions.js'
import { decodeTaskPayload, isStoredDeletedAt } from '../../application/storage/stored-task-codec.js'
import {
  StorageFailure,
  storageFailureReasonOf,
  type StorageFailureReason,
} from '../../application/storage/task-storage-error.js'
import type { StoredCollection, StoredRow } from '../../application/storage/unit-of-work.js'
import { classifyStorageError, sqliteResultCode } from './sqlite-errors.js'

/** Espera máxima por lock do SQLite. `SQLITE_BUSY/LOCKED` não dispara retry. */
export const LOCK_WAIT_MS = 100

const SQLITE_MAGIC = Buffer.from('SQLite format 3\u0000', 'latin1')
const SQLITE_HEADER_BYTES = 100
const WAL_FORMAT_VERSION = 2
const SYNCHRONOUS_EXTRA = 3

export interface StorageSchemaVersion {
  version: number
  /** DDL que cria esta versão num banco vazio. */
  ddl: readonly string[]
}

/** Conexão restrita entregue a uma migração registrada, dentro da transação da migração. */
export interface MigrationConnection {
  exec(sql: string): void
  prepare(sql: string): StatementSync
}

export interface RegisteredMigration {
  from: number
  to: number
  apply(connection: MigrationConnection): void
}

export interface StorageDefinition {
  signature: string
  currentVersion: number
  versions: readonly StorageSchemaVersion[]
  migrations: readonly RegisteredMigration[]
}

/**
 * Pontos de barreira e fault injection identificados. Usados somente por testes e pelo
 * harness restrito do main; nunca são alcançáveis pelo preload ou pelo IPC.
 */
export type StorageFaultPoint =
  | 'create:before-commit'
  | 'migrate:in-transaction'
  | 'migrate:before-commit'
  | 'migrate:after-commit'
  | 'unit:before-begin'
  | 'unit:in-transaction'
  | 'unit:before-commit'
  | 'unit:commit'
  | 'unit:after-commit'
  | 'unit:rollback'
  | 'unit:before-publish'

export interface StorageFaults {
  /** Chamado em cada ponto; lançar simula a falha naquele ponto. */
  at?(point: StorageFaultPoint): void
  /** Chamado depois da configuração da conexão e antes da conferência dos PRAGMAs. */
  afterConfigure?(connection: DatabaseSync): void
}

export interface StorageRuntimeInfo {
  sqliteVersion: string
  schemaVersion: number
  journalMode: string
  synchronous: number
  foreignKeys: number
  busyTimeoutMs: number
}

export type OpenProductDatabaseResult =
  | { ok: true; database: ProductDatabase; created: boolean; migrated: boolean }
  | { ok: false; reason: StorageFailureReason }

type TargetClassification = { kind: 'new' } | { kind: 'existing' } | { kind: 'blocked'; reason: StorageFailureReason }

interface MasterEntry {
  type: string
  name: string
  table: string
  sql: string
}

interface RawRow {
  id: unknown
  payload_version: unknown
  payload_json: unknown
  content_revision: unknown
  deleted_at?: unknown
}

function pragmaValue(connection: DatabaseSync, pragma: string): unknown {
  const row = connection.prepare(`PRAGMA ${pragma}`).get()
  return row === undefined ? undefined : Object.values(row)[0]
}

/**
 * Classifica o destino sem abrir conexão, criar arquivo ou alterar nada. Só ausência real de
 * banco permite inicialização; arquivo existente vazio ou estranho bloqueia e é preservado.
 */
export function classifyProductTarget(file: string): TargetClassification {
  try {
    if (!existsSync(file)) {
      // Journal sem banco é indício de criação anterior interrompida: não é perfil novo.
      return existsSync(`${file}-journal`) ? { kind: 'blocked', reason: 'INCOMPATIBLE_DATA' } : { kind: 'new' }
    }

    const info = statSync(file)
    if (!info.isFile()) return { kind: 'blocked', reason: 'UNAVAILABLE' }
    if (info.size === 0) return { kind: 'blocked', reason: 'INCOMPATIBLE_DATA' }

    const header = Buffer.alloc(SQLITE_HEADER_BYTES)
    const descriptor = openSync(file, 'r')
    let read: number
    try {
      read = readSync(descriptor, header, 0, SQLITE_HEADER_BYTES, 0)
    } finally {
      closeSync(descriptor)
    }

    const magicBytes = Math.min(read, SQLITE_MAGIC.length)
    if (!header.subarray(0, magicBytes).equals(SQLITE_MAGIC.subarray(0, magicBytes))) {
      return { kind: 'blocked', reason: 'INCOMPATIBLE_DATA' }
    }
    if (read < SQLITE_HEADER_BYTES) return { kind: 'blocked', reason: 'CORRUPTED_DATA' }
    // Banco em WAL é de outra configuração: abrir criaria auxiliares -wal/-shm.
    if (header[18] === WAL_FORMAT_VERSION || header[19] === WAL_FORMAT_VERSION) {
      return { kind: 'blocked', reason: 'INCOMPATIBLE_DATA' }
    }
    return { kind: 'existing' }
  } catch {
    return { kind: 'blocked', reason: 'UNAVAILABLE' }
  }
}

function readMaster(connection: DatabaseSync): MasterEntry[] {
  const rows = connection.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY name, type').all()
  return rows.map((row) => ({
    type: String(row['type']),
    name: String(row['name']),
    table: String(row['tbl_name']),
    sql: typeof row['sql'] === 'string' ? row['sql'] : '',
  }))
}

function expectedMaster(schema: StorageSchemaVersion): MasterEntry[] {
  const memory = new DatabaseSync(':memory:')
  try {
    for (const statement of schema.ddl) memory.exec(statement)
    return readMaster(memory)
  } finally {
    memory.close()
  }
}

function assertStructure(connection: DatabaseSync, schema: StorageSchemaVersion): void {
  const actual = readMaster(connection)
  const expected = expectedMaster(schema)
  const same =
    actual.length === expected.length &&
    actual.every((entry, index) => {
      const other = expected[index]
      return (
        other !== undefined &&
        entry.type === other.type &&
        entry.name === other.name &&
        entry.table === other.table &&
        entry.sql === other.sql
      )
    })
  if (!same) throw new StorageFailure('INCOMPATIBLE_DATA')
}

function configureConnection(connection: DatabaseSync, faults: StorageFaults | undefined): void {
  // Somente configuração do escopo da conexão; nenhum PRAGMA persistente é gravado aqui.
  connection.exec('PRAGMA synchronous = EXTRA')
  connection.exec('PRAGMA foreign_keys = ON')
  faults?.afterConfigure?.(connection)
}

function readRuntimeInfo(connection: DatabaseSync, schemaVersion: number): StorageRuntimeInfo {
  const version = connection.prepare('SELECT sqlite_version() AS version').get()
  return {
    sqliteVersion: String(version?.['version']),
    schemaVersion,
    journalMode: String(pragmaValue(connection, 'journal_mode')),
    synchronous: Number(pragmaValue(connection, 'synchronous')),
    foreignKeys: Number(pragmaValue(connection, 'foreign_keys')),
    busyTimeoutMs: Number(pragmaValue(connection, 'busy_timeout')),
  }
}

/** Configuração efetiva diferente da aprovada bloqueia a abertura; não há degradação. */
function assertEffectiveConfiguration(runtime: StorageRuntimeInfo): void {
  if (
    runtime.journalMode !== 'delete' ||
    runtime.synchronous !== SYNCHRONOUS_EXTRA ||
    runtime.foreignKeys !== 1 ||
    runtime.busyTimeoutMs !== LOCK_WAIT_MS
  ) {
    throw new StorageFailure('UNAVAILABLE')
  }
}

function toStoredRow(raw: RawRow, collection: StoredCollection): StoredRow {
  const { id, payload_version: payloadVersion, payload_json: payloadJson, content_revision: contentRevision } = raw
  if (
    typeof id !== 'string' ||
    typeof payloadVersion !== 'bigint' ||
    payloadVersion > BigInt(Number.MAX_SAFE_INTEGER) ||
    typeof payloadJson !== 'string' ||
    typeof contentRevision !== 'bigint'
  ) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  const row: StoredRow = { id, payloadVersion: Number(payloadVersion), payloadJson, contentRevision }
  if (collection === 'trash') {
    if (typeof raw.deleted_at !== 'string') throw new StorageFailure('INCOMPATIBLE_DATA')
    row.deletedAt = raw.deleted_at
  }
  return row
}

/**
 * Conexão proprietária do banco de produto (`node:sqlite` embarcado). Uma por processo
 * dono do perfil; somente o coordenador a usa. Todo SQL é fixo e parametrizado.
 */
export class ProductDatabase {
  readonly runtime: StorageRuntimeInfo
  readonly #connection: DatabaseSync
  readonly #statements = new Map<string, StatementSync>()
  #closed = false

  private constructor(connection: DatabaseSync, runtime: StorageRuntimeInfo) {
    this.#connection = connection
    this.runtime = runtime
  }

  /**
   * Abre o banco de produto. Classifica o destino antes de qualquer DDL: inexistente cria
   * schema/metadata/revisão 0 numa transação; existente passa por integridade, estrutura,
   * assinatura e validação de todos os payloads. Nenhuma falha reseta, regrava ou descarta.
   */
  static open(file: string, definition: StorageDefinition, faults?: StorageFaults): OpenProductDatabaseResult {
    const target = classifyProductTarget(file)
    if (target.kind === 'blocked') return { ok: false, reason: target.reason }

    let connection: DatabaseSync | undefined
    try {
      if (target.kind === 'new') mkdirSync(path.dirname(file), { recursive: true })
      connection = new DatabaseSync(file, {
        timeout: LOCK_WAIT_MS,
        allowExtension: false,
        enableForeignKeyConstraints: true,
        enableDoubleQuotedStringLiterals: false,
      })
      configureConnection(connection, faults)

      let migrated = false
      if (target.kind === 'new') {
        createSchema(connection, definition, faults)
      } else {
        migrated = validateExisting(connection, definition, faults)
      }

      const runtime = readRuntimeInfo(connection, definition.currentVersion)
      assertEffectiveConfiguration(runtime)
      return { ok: true, database: new ProductDatabase(connection, runtime), created: target.kind === 'new', migrated }
    } catch (error) {
      try {
        if (connection?.isTransaction === true) connection.exec('ROLLBACK')
      } catch {
        // O fechamento abaixo libera a conexão; o motor reverte o journal no próximo acesso.
      }
      try {
        connection?.close()
      } catch {
        // Falha de fechamento não muda o resultado: a abertura já foi recusada.
      }
      return { ok: false, reason: classifyStorageError(error) }
    }
  }

  get inTransaction(): boolean {
    return this.#connection.isTransaction
  }

  get closed(): boolean {
    return this.#closed
  }

  beginImmediate(): void {
    this.#connection.exec('BEGIN IMMEDIATE')
  }

  beginRead(): void {
    this.#connection.exec('BEGIN')
  }

  commit(): void {
    this.#connection.exec('COMMIT')
  }

  rollback(): void {
    this.#connection.exec('ROLLBACK')
  }

  readGlobalRevision(): Revision {
    const row = this.#statement('SELECT global_revision FROM taskflow_metadata WHERE id = 1').get()
    const revision = row?.['global_revision']
    if (!isRevision(revision)) throw new StorageFailure('INCOMPATIBLE_DATA')
    return revision
  }

  writeGlobalRevision(revision: Revision): void {
    this.#statement('UPDATE taskflow_metadata SET global_revision = ? WHERE id = 1').run(revision)
  }

  readRow(collection: StoredCollection, id: string): StoredRow | undefined {
    const raw = this.#statement(
      collection === 'tasks'
        ? 'SELECT id, payload_version, payload_json, content_revision FROM tasks WHERE id = ?'
        : 'SELECT id, payload_version, payload_json, content_revision, deleted_at FROM trash WHERE id = ?',
    ).get(id)
    return raw === undefined ? undefined : toStoredRow(raw as unknown as RawRow, collection)
  }

  /** Linhas em ordem estável de identificador, a partir de `afterId` (exclusivo). */
  *iterateRows(collection: StoredCollection, afterId: string | undefined): Generator<StoredRow> {
    const statement =
      afterId === undefined
        ? this.#statement(
            collection === 'tasks'
              ? 'SELECT id, payload_version, payload_json, content_revision FROM tasks ORDER BY id'
              : 'SELECT id, payload_version, payload_json, content_revision, deleted_at FROM trash ORDER BY id',
          )
        : this.#statement(
            collection === 'tasks'
              ? 'SELECT id, payload_version, payload_json, content_revision FROM tasks WHERE id > ? ORDER BY id'
              : 'SELECT id, payload_version, payload_json, content_revision, deleted_at FROM trash WHERE id > ? ORDER BY id',
          )
    const rows = afterId === undefined ? statement.iterate() : statement.iterate(afterId)
    for (const raw of rows) yield toStoredRow(raw as unknown as RawRow, collection)
  }

  listRows(collection: StoredCollection): StoredRow[] {
    return [...this.iterateRows(collection, undefined)]
  }

  writeRow(collection: StoredCollection, row: StoredRow): void {
    if (collection === 'tasks') {
      this.#statement(
        `INSERT INTO tasks (id, payload_version, payload_json, content_revision) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET payload_version = excluded.payload_version,
           payload_json = excluded.payload_json, content_revision = excluded.content_revision`,
      ).run(row.id, row.payloadVersion, row.payloadJson, row.contentRevision)
      return
    }

    if (row.deletedAt === undefined) throw new StorageFailure('INVALID_DATA')
    this.#statement(
      `INSERT INTO trash (id, payload_version, payload_json, content_revision, deleted_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET payload_version = excluded.payload_version,
         payload_json = excluded.payload_json, content_revision = excluded.content_revision,
         deleted_at = excluded.deleted_at`,
    ).run(row.id, row.payloadVersion, row.payloadJson, row.contentRevision, row.deletedAt)
  }

  deleteRow(collection: StoredCollection, id: string): void {
    this.#statement(collection === 'tasks' ? 'DELETE FROM tasks WHERE id = ?' : 'DELETE FROM trash WHERE id = ?').run(id)
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#statements.clear()
    this.#connection.close()
  }

  #statement(sql: string): StatementSync {
    let statement = this.#statements.get(sql)
    if (statement === undefined) {
      statement = this.#connection.prepare(sql)
      statement.setReadBigInts(true)
      this.#statements.set(sql, statement)
    }
    return statement
  }
}

function readMetadata(
  connection: DatabaseSync,
  expected: { signature: string; schemaVersion: number },
): { globalRevision: Revision; schemaVersion: number } {
  const statement = connection.prepare('SELECT id, signature, schema_version, global_revision FROM taskflow_metadata')
  statement.setReadBigInts(true)
  const rows = statement.all()
  const row = rows[0]
  if (rows.length !== 1 || row === undefined) throw new StorageFailure('INCOMPATIBLE_DATA')

  const { id, signature, schema_version: schemaVersion, global_revision: globalRevision } = row
  if (
    id !== 1n ||
    typeof signature !== 'string' ||
    typeof schemaVersion !== 'bigint' ||
    schemaVersion > BigInt(Number.MAX_SAFE_INTEGER) ||
    !isRevision(globalRevision)
  ) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  if (signature !== expected.signature || Number(schemaVersion) !== expected.schemaVersion) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  return { globalRevision, schemaVersion: Number(schemaVersion) }
}

/** Valida todas as linhas: nenhuma inválida é omitida para produzir sucesso aparente. */
function validateRows(connection: DatabaseSync, globalRevision: Revision): void {
  for (const collection of ['tasks', 'trash'] as const) {
    const statement = connection.prepare(
      collection === 'tasks'
        ? 'SELECT id, payload_version, payload_json, content_revision FROM tasks'
        : 'SELECT id, payload_version, payload_json, content_revision, deleted_at FROM trash',
    )
    statement.setReadBigInts(true)
    for (const raw of statement.iterate()) {
      const row = toStoredRow(raw as unknown as RawRow, collection)
      if (row.contentRevision < 1n || row.contentRevision > globalRevision) {
        throw new StorageFailure('INCOMPATIBLE_DATA')
      }
      if (collection === 'trash' && !isStoredDeletedAt(row.deletedAt)) {
        throw new StorageFailure('INCOMPATIBLE_DATA')
      }
      decodeTaskPayload(row.payloadVersion, row.payloadJson, row.id)
    }
  }
}

function schemaFor(definition: StorageDefinition, version: number): StorageSchemaVersion {
  const schema = definition.versions.find((candidate) => candidate.version === version)
  if (schema === undefined || !Number.isSafeInteger(schema.version) || schema.version < 1) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
  return schema
}

function validateVersion(connection: DatabaseSync, definition: StorageDefinition, version: number): Revision {
  assertStructure(connection, schemaFor(definition, version))
  const metadata = readMetadata(connection, { signature: definition.signature, schemaVersion: version })
  validateRows(connection, metadata.globalRevision)
  return metadata.globalRevision
}

function createSchema(connection: DatabaseSync, definition: StorageDefinition, faults: StorageFaults | undefined): void {
  const schema = schemaFor(definition, definition.currentVersion)
  connection.exec('BEGIN IMMEDIATE')
  for (const statement of schema.ddl) connection.exec(statement)
  connection
    .prepare('INSERT INTO taskflow_metadata (id, signature, schema_version, global_revision) VALUES (1, ?, ?, ?)')
    .run(definition.signature, definition.currentVersion, INITIAL_REVISION)
  // `user_version` é redundância conferida contra a metadata; o valor é uma constante interna.
  connection.exec(`PRAGMA user_version = ${schema.version}`)
  validateVersion(connection, definition, definition.currentVersion)
  faults?.at?.('create:before-commit')
  connection.exec('COMMIT')
}

/** Devolve `true` quando uma migração registrada foi confirmada. */
function validateExisting(
  connection: DatabaseSync,
  definition: StorageDefinition,
  faults: StorageFaults | undefined,
): boolean {
  // A primeira consulta deixa o motor recuperar um hot journal, se houver; a aplicação não
  // apaga nem interpreta auxiliares por conta própria.
  const quickCheck = connection.prepare('PRAGMA quick_check').all()
  if (quickCheck.length !== 1 || quickCheck[0]?.['quick_check'] !== 'ok') {
    throw new StorageFailure('CORRUPTED_DATA')
  }

  const userVersion = Number(pragmaValue(connection, 'user_version'))
  if (!Number.isSafeInteger(userVersion) || userVersion < 1 || userVersion > definition.currentVersion) {
    // Zero é SQLite sem schema de produto; maior que o atual é versão futura (sem downgrade).
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  const baseRevision = validateVersion(connection, definition, userVersion)
  if (userVersion === definition.currentVersion) return false

  const steps: RegisteredMigration[] = []
  for (let version = userVersion; version < definition.currentVersion; ) {
    const step = definition.migrations.find((migration) => migration.from === version && migration.to > version)
    if (step === undefined) throw new StorageFailure('INCOMPATIBLE_DATA')
    steps.push(step)
    version = step.to
  }

  connection.exec('BEGIN IMMEDIATE')
  try {
    for (const step of steps) {
      step.apply(connection)
      faults?.at?.('migrate:in-transaction')
    }
    connection
      .prepare('UPDATE taskflow_metadata SET schema_version = ?, global_revision = ? WHERE id = 1')
      .run(definition.currentVersion, nextRevision(baseRevision))
    connection.exec(`PRAGMA user_version = ${definition.currentVersion}`)
    validateVersion(connection, definition, definition.currentVersion)
    faults?.at?.('migrate:before-commit')
    connection.exec('COMMIT')
  } catch (error) {
    if (connection.isTransaction) connection.exec('ROLLBACK')
    // Falha de I/O do motor é indisponibilidade; qualquer outra é dado que não pôde migrar.
    if (sqliteResultCode(error) !== undefined) throw error
    throw new StorageFailure(storageFailureReasonOf(error) ?? 'INCOMPATIBLE_DATA')
  }
  faults?.at?.('migrate:after-commit')
  return true
}
