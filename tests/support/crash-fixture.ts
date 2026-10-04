// Fixture compartilhada entre o teste de interrupção e o processo filho.
import type { StorageDefinition } from '../../src/main/storage/product-database.js'
import { PRODUCT_SCHEMA_V1_DDL, PRODUCT_SIGNATURE } from '../../src/main/storage/product-schema.js'

export const CRASH_FIXTURE_TABLE_SQL =
  'CREATE TABLE fixture_notes (id TEXT PRIMARY KEY NOT NULL, note TEXT NOT NULL) STRICT, WITHOUT ROWID'

export const CRASH_CLAIM = { taskId: 'claim-000001', reminderId: 'claim-000001-r2' }

export function crashMigrationDefinition(): StorageDefinition {
  return {
    signature: PRODUCT_SIGNATURE,
    currentVersion: 2,
    versions: [
      { version: 1, ddl: PRODUCT_SCHEMA_V1_DDL },
      { version: 2, ddl: [...PRODUCT_SCHEMA_V1_DDL, CRASH_FIXTURE_TABLE_SQL] },
    ],
    migrations: [
      {
        from: 1,
        to: 2,
        apply: (connection) => {
          connection.exec(CRASH_FIXTURE_TABLE_SQL)
          connection.exec("INSERT INTO fixture_notes (id, note) SELECT id, 'migrada' FROM tasks")
        },
      },
    ],
  }
}
