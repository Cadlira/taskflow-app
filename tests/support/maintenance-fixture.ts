import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { buildFictitiousTasks } from '../../src/main/harness/fixtures.js'
import { FileShortcutPreferences } from '../../src/main/shortcuts/file-preferences.js'
import { ProductDatabase } from '../../src/main/storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION } from '../../src/main/storage/product-schema.js'
import { StorageCoordinator } from '../../src/main/storage/coordinator.js'

/** Somente fixtures: não aceita IPC, não inicia agenda e não lê ai.json. */
function owner(file: string): StorageCoordinator {
  const coordinator = new StorageCoordinator({ open: () => ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION) })
  coordinator.start()
  if (coordinator.availability.state !== 'ready') throw new Error('MAINTENANCE_FIXTURE_STORAGE_BLOCKED')
  return coordinator
}
export async function seedMaintenanceFixture(userData: string): Promise<void> {
  const file = path.join(userData, 'data/taskflow.sqlite')
  if (existsSync(file) || existsSync(path.join(userData, 'shortcuts.json'))) throw new Error('MAINTENANCE_FIXTURE_ALREADY_PRESENT')
  const coordinator = owner(file)
  try {
    const tasks = buildFictitiousTasks(12)
    if (!(await coordinator.run(unit => unit.saveTasks(tasks))).ok ||
        !(await coordinator.run(unit => unit.moveToTrash(tasks[0]!.id, '2026-10-08T12:00:00.000Z'))).ok) throw new Error('MAINTENANCE_FIXTURE_SEED_FAILED')
  } finally { coordinator.shutdown() }
  const shortcuts = new FileShortcutPreferences(userData)
  const previous = await shortcuts.read()
  if (!previous.ok || !previous.missing) throw new Error('MAINTENANCE_FIXTURE_PREFERENCES_ALREADY_PRESENT')
  const next = { version: 1 as const, revision: '1', actions: {
    QUICK_ADD: { modifiers: 'CTRL_SHIFT' as const, key: 'F21' as const },
    OPEN_TASK_MANAGER: { modifiers: 'CTRL_SHIFT' as const, key: 'F22' as const },
    CAPTURE_CLIPBOARD: { modifiers: 'CTRL_SHIFT' as const, key: 'F23' as const },
  } }
  if (!(await shortcuts.publish(previous.preferences, next)).ok) throw new Error('MAINTENANCE_FIXTURE_PREFERENCES_FAILED')
}
/** Oráculo lógico privado: DTOs/revisões/ordem/markers + codec/schema + preferências. */
export async function maintenanceLogicalSnapshot(userData: string): Promise<string> {
  const file = path.join(userData, 'data/taskflow.sqlite')
  const coordinator = owner(file)
  let data
  try {
    const read = await coordinator.read(reader => ({ revision: reader.baseRevision,
      tasks: reader.listTasks().sort((a, b) => a.task.id.localeCompare(b.task.id)),
      trash: reader.listTrash().sort((a, b) => a.task.id.localeCompare(b.task.id)),
    }))
    if (!read.ok) throw new Error('MAINTENANCE_FIXTURE_READ_FAILED')
    data = read.value
  } finally { coordinator.shutdown() }
  const connection = new DatabaseSync(file, { readOnly: true })
  let codecs, schema
  try {
    schema = connection.prepare('SELECT schema_version FROM taskflow_metadata').get()?.['schema_version']
    codecs = connection.prepare('SELECT DISTINCT payload_version FROM tasks UNION SELECT DISTINCT payload_version FROM trash ORDER BY payload_version').all().map(row => row['payload_version'])
  } finally { connection.close() }
  const preferences = await new FileShortcutPreferences(userData).read()
  if (!preferences.ok) throw new Error('MAINTENANCE_FIXTURE_PREFERENCES_BLOCKED')
  return JSON.stringify({ data, schema, codecs, preferences: preferences.preferences }, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)
}
