// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ProductDatabase } from '../../src/main/storage/product-database.js'
import { PRODUCT_V1_DEFINITION, PRODUCT_STORAGE_DEFINITION } from '../../src/main/storage/product-schema.js'
import { FileShortcutPreferences } from '../../src/main/shortcuts/file-preferences.js'
import { createTempRoot, cleanupStorage, openCoordinator, expectOk } from '../support/storage.js'
import { maintenanceLogicalSnapshot, seedMaintenanceFixture } from '../support/maintenance-fixture.js'

afterEach(cleanupStorage)
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')
describe('oráculos privados de manutenção e recuperação seletiva — W09/W10/W13/W15', () => {
  it('compara campos/revisões/codec/markers/preferências e detecta regressão de snapshot', async () => {
    const root = createTempRoot('tfa011-maintenance-')
    const original = path.join(root, 'original'), recovery = path.join(root, 'recovery')
    mkdirSync(original)
    mkdirSync(path.join(recovery, 'data'), { recursive: true })
    await seedMaintenanceFixture(original)
    const baseline = await maintenanceLogicalSnapshot(original)
    const db = path.join(original, 'data/taskflow.sqlite')
    const copied = path.join(recovery, 'data/taskflow.sqlite')
    writeFileSync(path.join(original, 'ai.json'), 'TFA011_EXCLUDED_FICTITIOUS_FILE')
    const before = hash(db)
    // Writer fechado. Lista seletiva explícita: nunca copia perfil ou ai.json.
    for (const suffix of ['', '-journal', '-wal', '-shm']) if (existsSync(db + suffix)) copyFileSync(db + suffix, copied + suffix)
    copyFileSync(path.join(original, 'shortcuts.json'), path.join(recovery, 'shortcuts.json'))
    expect(await maintenanceLogicalSnapshot(recovery)).toBe(baseline)
    expect(existsSync(path.join(recovery, 'ai.json'))).toBe(false)
    expect(hash(db)).toBe(before)
    const decoded = JSON.parse(baseline) as { data: { tasks: unknown[]; trash: unknown[] }; schema: number; codecs: number[] }
    expect(decoded).toMatchObject({ schema: 2, codecs: [4] })
    expect(decoded.data.tasks).toHaveLength(11)
    expect(decoded.data.trash).toHaveLength(1)
    const writer = openCoordinator(db)
    const task = expectOk(await writer.read(reader => reader.listTasks()[0]!.task)).value
    const updated = { ...task, reminders: task.reminders.map((reminder, index) => index === 1 ? { ...reminder, processedFor: '2026-09-03T10:00:02.000Z' } : reminder) }
    expectOk(await writer.run(unit => unit.saveTasks([updated])))
    writer.shutdown()
    const newer = await maintenanceLogicalSnapshot(original)
    expect(newer).not.toBe(baseline)
    const currentMarker = JSON.parse(newer) as { data: { tasks: Array<{ task: { id: string; reminders: Array<{ processedFor?: string }> } }> } }
    expect(currentMarker.data.tasks.find(item => item.task.id === task.id)?.task.reminders[1]?.processedFor).toBe('2026-09-03T10:00:02.000Z')
    expect(await maintenanceLogicalSnapshot(recovery)).toBe(baseline)
    const preferences = new FileShortcutPreferences(original)
    const read = await preferences.read()
    expect(read.ok).toBe(true)
    if (!read.ok) throw new Error('PREFERENCES_BLOCKED')
    expect((await preferences.publish(read.preferences, { ...read.preferences, revision: '2', actions: { ...read.preferences.actions, CAPTURE_CLIPBOARD: null } })).ok).toBe(true)
    expect(await maintenanceLogicalSnapshot(original)).not.toBe(newer)
    const beforeDowngrade = hash(copied)
    const oldReader = ProductDatabase.open(copied, PRODUCT_V1_DEFINITION)
    expect(oldReader.ok).toBe(false)
    if (oldReader.ok) { oldReader.database.close(); throw new Error('DOWNGRADE_NOT_REFUSED') }
    expect(oldReader.reason).toBe('INCOMPATIBLE_DATA')
    expect(hash(copied)).toBe(beforeDowngrade)
    expect(readFileSync(path.join(original, 'ai.json'), 'utf8')).toBe('TFA011_EXCLUDED_FICTITIOUS_FILE')
  })
  it('conserva journal órfão nas cópias e bloqueia sem criar banco ou apagar auxiliar', () => {
    const root = createTempRoot('tfa011-orphan-')
    const original = path.join(root, 'original.sqlite'), copied = path.join(root, 'copied.sqlite')
    writeFileSync(original + '-journal', 'TFA011_ORPHAN_JOURNAL_FIXTURE')
    copyFileSync(original + '-journal', copied + '-journal')
    const baseline = hash(copied + '-journal')
    const opened = ProductDatabase.open(copied, PRODUCT_STORAGE_DEFINITION)
    expect(opened.ok).toBe(false)
    if (opened.ok) { opened.database.close(); throw new Error('ORPHAN_NOT_REFUSED') }
    expect(hash(copied + '-journal')).toBe(baseline)
    expect(hash(original + '-journal')).toBe(baseline)
    expect(existsSync(copied)).toBe(false)
  })
})
