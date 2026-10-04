import type { StorageDefinition } from './product-database.js'

/** Assinatura que identifica o banco de produto do TaskFlow App. */
export const PRODUCT_SIGNATURE = 'taskflow.app/product-store'

/**
 * Versão do schema SQL do produto. É independente do codec de payload (v4) e do formato de
 * backup (v1–v4): os três números não se equivalem.
 */
export const PRODUCT_SCHEMA_VERSION = 1

export const METADATA_TABLE_SQL = `CREATE TABLE taskflow_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  signature TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  global_revision INTEGER NOT NULL CHECK (global_revision >= 0)
) STRICT`

// Tarefas e lixeira têm chaves primárias independentes: o mesmo ID pode existir nas duas
// coleções, e a restauração precisa poder responder ID_EXISTS preservando ambas.
const TASKS_TABLE_SQL = `CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0)
) STRICT, WITHOUT ROWID`

const TRASH_TABLE_SQL = `CREATE TABLE trash (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL,
  content_revision INTEGER NOT NULL CHECK (content_revision > 0),
  deleted_at TEXT NOT NULL
) STRICT, WITHOUT ROWID`

export const PRODUCT_SCHEMA_V1_DDL: readonly string[] = [METADATA_TABLE_SQL, TASKS_TABLE_SQL, TRASH_TABLE_SQL]

/**
 * Definição implantada do produto: schema SQL 1, sem migrações. Uma migração concreta só
 * entra aqui pela Change que a propuser; fixtures de teste usam definição própria.
 */
export const PRODUCT_STORAGE_DEFINITION: StorageDefinition = {
  signature: PRODUCT_SIGNATURE,
  currentVersion: PRODUCT_SCHEMA_VERSION,
  versions: [{ version: PRODUCT_SCHEMA_VERSION, ddl: PRODUCT_SCHEMA_V1_DDL }],
  migrations: [],
}
