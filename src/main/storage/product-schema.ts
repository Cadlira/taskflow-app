import type { MigrationConnection, StorageDefinition } from './product-database.js'

/** Assinatura que identifica o banco de produto do TaskFlow App. */
export const PRODUCT_SIGNATURE = 'taskflow.app/product-store'

/**
 * Versão do schema SQL do produto. É independente do codec de payload (v4) e do formato de
 * backup (v1–v4): os três números não se equivalem. A versão 2 acrescenta a revisão de edição
 * às linhas de tarefas/lixeira; payloads, IDs, ordem e codec permanecem intactos.
 */
export const PRODUCT_SCHEMA_VERSION = 2

export const METADATA_TABLE_SQL = `CREATE TABLE taskflow_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  signature TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  global_revision INTEGER NOT NULL CHECK (global_revision >= 0)
) STRICT`

// Tarefas e lixeira têm chaves primárias independentes: o mesmo ID pode existir nas duas
// coleções, e a restauração precisa poder responder ID_EXISTS preservando ambas.
const TASKS_TABLE_V1_SQL = `CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0)
) STRICT, WITHOUT ROWID`

const TRASH_TABLE_V1_SQL = `CREATE TABLE trash (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  deleted_at TEXT NOT NULL
) STRICT, WITHOUT ROWID`

// Schema 2: a revisão de edição é monotônica por linha e nunca supera a de conteúdo. O CHECK
// também protege leituras futuras contra metadado inválido gravado por engano.
export const TASKS_TABLE_SQL = `CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  edit_revision INTEGER NOT NULL CHECK (edit_revision > 0 AND edit_revision <= content_revision)
) STRICT, WITHOUT ROWID`

export const TRASH_TABLE_SQL = `CREATE TABLE trash (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  edit_revision INTEGER NOT NULL CHECK (edit_revision > 0 AND edit_revision <= content_revision),
  deleted_at TEXT NOT NULL
) STRICT, WITHOUT ROWID`

export const PRODUCT_SCHEMA_V1_DDL: readonly string[] = [METADATA_TABLE_SQL, TASKS_TABLE_V1_SQL, TRASH_TABLE_V1_SQL]

export const PRODUCT_SCHEMA_V2_DDL: readonly string[] = [METADATA_TABLE_SQL, TASKS_TABLE_SQL, TRASH_TABLE_SQL]

/**
 * Migração 1→2: reconstrói `tasks` e `trash` com a coluna `edit_revision`, copiando cada linha
 * byte a byte (`payload_json`, IDs, `deleted_at` e `content_revision` intactos) e preenchendo
 * `edit_revision = content_revision`. Nenhum payload é reescrito ou reinterpretado aqui; a
 * revisão global e a metadata avançam uma única vez no executor da migração.
 */
export function PRODUCT_MIGRATION_1_TO_2(connection: MigrationConnection): void {
  connection.exec('ALTER TABLE tasks RENAME TO tasks_v1_migrating')
  connection.exec(TASKS_TABLE_SQL)
  connection.exec(
    `INSERT INTO tasks (id, payload_version, payload_json, content_revision, edit_revision)
     SELECT id, payload_version, payload_json, content_revision, content_revision FROM tasks_v1_migrating`,
  )
  connection.exec('DROP TABLE tasks_v1_migrating')

  connection.exec('ALTER TABLE trash RENAME TO trash_v1_migrating')
  connection.exec(TRASH_TABLE_SQL)
  connection.exec(
    `INSERT INTO trash (id, payload_version, payload_json, content_revision, edit_revision, deleted_at)
     SELECT id, payload_version, payload_json, content_revision, content_revision, deleted_at FROM trash_v1_migrating`,
  )
  connection.exec('DROP TABLE trash_v1_migrating')
}

/**
 * Definição somente da versão 1: usada por testes e pela prova de leitor antigo (recusa do
 * schema 2 sem downgrade). Não é implantada em nenhum perfil de produto.
 */
export const PRODUCT_V1_DEFINITION: StorageDefinition = {
  signature: PRODUCT_SIGNATURE,
  currentVersion: 1,
  versions: [{ version: 1, ddl: PRODUCT_SCHEMA_V1_DDL }],
  migrations: [],
}

/**
 * Definição implantada do produto: schema SQL 2 com a migração transacional 1→2 registrada.
 * Perfil novo nasce diretamente em SQL2; leitor antigo recusa o schema 2 sem downgrade.
 */
export const PRODUCT_STORAGE_DEFINITION: StorageDefinition = {
  signature: PRODUCT_SIGNATURE,
  currentVersion: PRODUCT_SCHEMA_VERSION,
  versions: [
    { version: 1, ddl: PRODUCT_SCHEMA_V1_DDL },
    { version: 2, ddl: PRODUCT_SCHEMA_V2_DDL },
  ],
  migrations: [{ from: 1, to: 2, apply: PRODUCT_MIGRATION_1_TO_2 }],
}
