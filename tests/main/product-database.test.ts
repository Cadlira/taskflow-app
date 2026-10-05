import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  statSync,
  truncateSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '../../src/domain/task.js'
import { runFoundationProof } from '../../src/main/foundation-proof.js'
import { buildFictitiousTask, buildFictitiousTasks, buildMinimalFictitiousTask } from '../../src/main/harness/fixtures.js'
import { resolveFoundationProofFile, resolveProductDatabaseFile, resolveProfilePaths } from '../../src/main/profile.js'
import {
  LOCK_WAIT_MS,
  ProductDatabase,
  classifyProductTarget,
  type StorageDefinition,
} from '../../src/main/storage/product-database.js'
import {
  PRODUCT_MIGRATION_1_TO_2,
  PRODUCT_SCHEMA_V1_DDL,
  PRODUCT_SCHEMA_V2_DDL,
  PRODUCT_SIGNATURE,
  PRODUCT_STORAGE_DEFINITION,
  PRODUCT_V1_DEFINITION,
} from '../../src/main/storage/product-schema.js'
import {
  cleanupStorage,
  createProductFile,
  createTempRoot,
  expectOk,
  openCoordinator,
  productFileIn,
} from '../support/storage.js'

afterEach(cleanupStorage)

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function listTree(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
    .sort()
}

function openReason(file: string, definition: StorageDefinition = PRODUCT_STORAGE_DEFINITION): string {
  const result = ProductDatabase.open(file, definition)
  if (result.ok) {
    result.database.close()
    return 'OPENED'
  }
  return result.reason
}

/** Cria um banco de produto fictício com tarefas e lixeira e o fecha. */
async function seedProduct(file: string, tasks: Task[] = buildFictitiousTasks(12)): Promise<bigint> {
  const coordinator = openCoordinator(file)
  expectOk(await coordinator.run((unit) => unit.saveTasks(tasks)))
  const first = tasks[0]
  if (first !== undefined) {
    expectOk(await coordinator.run((unit) => unit.moveToTrash(first.id, '2026-09-12T08:00:00.000Z')))
  }
  const revision = coordinator.confirmedRevision ?? 0n
  coordinator.shutdown()
  return revision
}

/** Semeia o mesmo perfil na origem SQL 1, para exercitar a migração real 1→2. */
async function seedProductV1(file: string, tasks: Task[] = buildFictitiousTasks(12)): Promise<bigint> {
  const coordinator = openCoordinator(file, { definition: PRODUCT_V1_DEFINITION })
  expectOk(await coordinator.run((unit) => unit.saveTasks(tasks)))
  const first = tasks[0]
  if (first !== undefined) {
    expectOk(await coordinator.run((unit) => unit.moveToTrash(first.id, '2026-09-12T08:00:00.000Z')))
  }
  const revision = coordinator.confirmedRevision ?? 0n
  coordinator.shutdown()
  return revision
}

function withRawConnection(file: string, action: (connection: DatabaseSync) => void): void {
  const connection = new DatabaseSync(file)
  try {
    action(connection)
  } finally {
    connection.close()
  }
}

describe('caminho do banco de produto', () => {
  const localAppData = 'C:\\Users\\Standard\\AppData\\Local'

  it('fica em <userData>/data/taskflow.sqlite, separado da prova e da sessão, por perfil', () => {
    const files = (['dev', 'test', 'prod'] as const).map((profile) => {
      const paths = resolveProfilePaths(localAppData, profile)
      const product = resolveProductDatabaseFile(paths.userData)
      const proof = resolveFoundationProofFile(paths.userData)

      expect(product).toBe(`${localAppData}\\TaskFlowApp\\profiles\\${profile}\\user-data\\data\\taskflow.sqlite`)
      expect(proof).toBe(`${paths.userData}\\foundation-proof\\proof.sqlite`)
      expect(path.win32.dirname(product)).not.toBe(path.win32.dirname(proof))
      expect(product.startsWith(paths.sessionData)).toBe(false)
      return product
    })
    expect(new Set(files).size).toBe(3)
  })

  it('escreve somente no diretório de dados do perfil', async () => {
    const root = createTempRoot()
    await seedProduct(productFileIn(root))

    expect(listTree(root)).toEqual(['user-data/data/taskflow.sqlite'])
  })

  it('diagnóstico e produto não modificam o banco um do outro', async () => {
    const root = createTempRoot()
    const userData = path.join(root, 'user-data')
    const product = productFileIn(root)
    const proof = path.join(userData, 'foundation-proof', 'proof.sqlite')
    await seedProduct(product)
    const productBefore = sha256(product)

    expect(runFoundationProof(proof, '0.1.0', '44.5.1', '24.21.0')).toMatchObject({ status: 'verified' })
    expect(sha256(product)).toBe(productBefore)

    const proofBefore = sha256(proof)
    const coordinator = openCoordinator(product)
    expectOk(await coordinator.run((unit) => unit.saveTask(buildFictitiousTask(500))))
    coordinator.shutdown()
    expect(sha256(proof)).toBe(proofBefore)
    expect(runFoundationProof(proof, '0.1.0', '44.5.1', '24.21.0')).toMatchObject({ status: 'verified' })
  })

  it('perfis distintos não leem nem alteram os dados uns dos outros', async () => {
    const root = createTempRoot()
    const files = ['dev', 'test', 'prod'].map((profile) => path.join(root, profile, 'user-data', 'data', 'taskflow.sqlite'))
    for (const [index, file] of files.entries()) {
      await seedProduct(file, [buildFictitiousTask(index + 1, { idPrefix: `perfil-${index}` })])
    }

    for (const [index, file] of files.entries()) {
      const coordinator = openCoordinator(file)
      const read = expectOk(await coordinator.read((reader) => reader.listTrash().map((item) => item.task.id)))
      expect(read.value).toEqual([`perfil-${index}-00000${index + 1}`])
      coordinator.shutdown()
    }
  })
})

describe('criação e fidelidade', () => {
  it('perfil novo confirma schema, assinatura, metadados e revisão 0 como uma unidade', () => {
    const file = createProductFile()
    const result = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION)
    if (!result.ok) throw new Error(result.reason)

    expect(result.created).toBe(true)
    expect(result.migrated).toBe(false)
    expect(result.database.readGlobalRevision()).toBe(0n)
    expect(result.database.listRows('tasks')).toEqual([])
    expect(result.database.listRows('trash')).toEqual([])
    result.database.close()

    withRawConnection(file, (connection) => {
      expect(connection.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 })
      expect(connection.prepare('SELECT * FROM taskflow_metadata').all()).toEqual([
        expect.objectContaining({ id: 1, signature: PRODUCT_SIGNATURE, schema_version: 2, global_revision: 0 }),
      ])
      const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
      expect(tables.map((row) => row['name'])).toEqual(['taskflow_metadata', 'tasks', 'trash'])
      const columns = connection.prepare('PRAGMA table_info(tasks)').all().map((row) => row['name'])
      expect(columns).toEqual(['id', 'payload_version', 'payload_json', 'content_revision', 'edit_revision'])
    })
    expect(existsSync(`${file}-journal`)).toBe(false)
  })

  it('criação interrompida antes do commit não é tratada como perfil novo depois', () => {
    const file = createProductFile()
    const result = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION, {
      at: (point) => {
        if (point === 'create:before-commit') throw new Error('fixture: creation interrupted')
      },
    })

    expect(result.ok).toBe(false)
    expect(existsSync(file)).toBe(true)
    // O arquivo deixado pela criação interrompida é preservado e bloqueia; nada é completado.
    const before = sha256(file)
    expect(openReason(file)).toBe('INCOMPATIBLE_DATA')
    expect(sha256(file)).toBe(before)
  })

  it('round-trip e reopen conservam integralmente tarefas, lixeira e revisão', async () => {
    const file = createProductFile()
    const tasks = [...buildFictitiousTasks(9), buildMinimalFictitiousTask('minima')]
    const revision = await seedProduct(file, tasks)

    const coordinator = openCoordinator(file)
    const read = expectOk(
      await coordinator.read((reader) => ({ tasks: reader.listTasks(), trash: reader.listTrash(), base: reader.baseRevision })),
    )
    const expectedActive = tasks.slice(1).sort((left, right) => (left.id < right.id ? -1 : 1))

    expect(read.value.base).toBe(revision)
    expect(read.value.tasks.map((stored) => stored.task)).toEqual(expectedActive)
    expect(read.value.trash).toEqual([
      { task: tasks[0], deletedAt: '2026-09-12T08:00:00.000Z', contentRevision: 1n, editRevision: 1n },
    ])
    expect(read.committed).toBe(false)
    expect(coordinator.confirmedRevision).toBe(revision)
  })

  it('o mesmo ID pode existir em tarefas e na lixeira', async () => {
    const file = createProductFile()
    const task = buildFictitiousTask(1)
    const coordinator = openCoordinator(file)
    expectOk(await coordinator.run((unit) => unit.saveTask(task)))
    expectOk(await coordinator.run((unit) => unit.moveToTrash(task.id, '2026-09-12T08:00:00.000Z')))
    expectOk(await coordinator.run((unit) => unit.saveTask({ ...task, title: 'Recriada' })))

    const read = expectOk(
      await coordinator.read((reader) => ({ active: reader.getTask(task.id), trashed: reader.getTrashItem(task.id) })),
    )
    expect(read.value.active?.task.title).toBe('Recriada')
    expect(read.value.trashed?.task.title).toBe(task.title)
  })
})

describe('configuração efetiva da conexão', () => {
  it('usa DELETE/EXTRA/foreign_keys, lock wait de 100 ms e extensões desabilitadas', () => {
    let captured: DatabaseSync | undefined
    const result = ProductDatabase.open(createProductFile(), PRODUCT_STORAGE_DEFINITION, {
      afterConfigure: (connection) => {
        captured = connection
      },
    })
    if (!result.ok) throw new Error(result.reason)

    expect(result.database.runtime).toMatchObject({
      journalMode: 'delete',
      synchronous: 3,
      foreignKeys: 1,
      busyTimeoutMs: LOCK_WAIT_MS,
      schemaVersion: 2,
    })
    expect(LOCK_WAIT_MS).toBe(100)
    expect(result.database.runtime.sqliteVersion).toMatch(/^3\.\d+\.\d+/)
    expect(() => captured?.loadExtension('fixture-extension')).toThrow()
    result.database.close()
  })

  it.each([
    ['synchronous rebaixado', 'PRAGMA synchronous = NORMAL'],
    ['foreign_keys desligado', 'PRAGMA foreign_keys = OFF'],
    ['journal em memória', 'PRAGMA journal_mode = MEMORY'],
    ['espera de lock alterada', 'PRAGMA busy_timeout = 5000'],
  ])('configuração divergente (%s) bloqueia a abertura sem degradar nem alterar dados', async (_label, pragma) => {
    const file = createProductFile()
    await seedProduct(file)
    const before = sha256(file)

    const result = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION, {
      afterConfigure: (connection) => connection.exec(pragma),
    })

    expect(result).toEqual({ ok: false, reason: 'UNAVAILABLE' })
    expect(sha256(file)).toBe(before)
    expect(listTree(path.dirname(file))).toEqual(['taskflow.sqlite'])
    expect(openReason(file)).toBe('OPENED')
  })

  it('valores hostis são tratados como dados pelo SQL parametrizado', async () => {
    const file = createProductFile()
    const hostile: Task = {
      ...buildMinimalFictitiousTask("'; DROP TABLE tasks; --"),
      title: 'x"); DELETE FROM taskflow_metadata; --',
      tags: ["' OR 1=1 --", '%_\\'],
    }
    const coordinator = openCoordinator(file)
    expectOk(await coordinator.run((unit) => unit.saveTask(hostile)))
    expectOk(await coordinator.run((unit) => unit.moveToTrash(hostile.id, '2026-09-12T08:00:00.000Z')))
    expectOk(await coordinator.run((unit) => unit.saveTask(hostile)))

    const read = expectOk(await coordinator.read((reader) => [reader.getTask(hostile.id), reader.getTrashItem(hostile.id)]))
    expect(read.value.map((stored) => stored?.task)).toEqual([hostile, hostile])
    coordinator.shutdown()
    expect(openReason(file)).toBe('OPENED')
  })
})

describe('preflight: ausência versus dados existentes', () => {
  function expectPreserved(file: string, expected: string): void {
    const before = sha256(file)
    const size = statSync(file).size
    const siblings = listTree(path.dirname(file))

    expect(openReason(file)).toBe(expected)
    expect(sha256(file)).toBe(before)
    expect(statSync(file).size).toBe(size)
    // Nenhum auxiliar criado, nenhum arquivo removido ou inicializado.
    expect(listTree(path.dirname(file))).toEqual(siblings)
  }

  function emptyFile(content: Buffer | string = ''): string {
    const file = createProductFile()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, content)
    return file
  }

  it('só a ausência real permite inicialização', () => {
    const file = createProductFile()
    expect(classifyProductTarget(file)).toEqual({ kind: 'new' })
    expect(existsSync(path.dirname(file))).toBe(false)
  })

  it('arquivo de zero bytes bloqueia e é preservado', () => {
    const file = emptyFile()
    expectPreserved(file, 'INCOMPATIBLE_DATA')
    expect(statSync(file).size).toBe(0)
  })

  it('arquivo que não é SQLite bloqueia e é preservado', () => {
    expectPreserved(emptyFile('fixture: not a database, but long enough to look like one. '.repeat(8)), 'INCOMPATIBLE_DATA')
    expectPreserved(emptyFile('x'), 'INCOMPATIBLE_DATA')
  })

  it('journal órfão sem banco é indício de criação anterior e bloqueia', () => {
    const file = createProductFile()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(`${file}-journal`, 'fixture journal')

    expect(openReason(file)).toBe('INCOMPATIBLE_DATA')
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(`${file}-journal`, 'utf8')).toBe('fixture journal')
  })

  it('SQLite de outro produto ou sem schema bloqueia sem DDL', () => {
    const other = createProductFile()
    mkdirSync(path.dirname(other), { recursive: true })
    withRawConnection(other, (connection) => {
      connection.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)')
      connection.exec("INSERT INTO notes (body) VALUES ('fixture de outro produto')")
    })
    expectPreserved(other, 'INCOMPATIBLE_DATA')

    const schemaless = createProductFile()
    mkdirSync(path.dirname(schemaless), { recursive: true })
    withRawConnection(schemaless, (connection) => connection.exec('PRAGMA user_version = 1'))
    expectPreserved(schemaless, 'INCOMPATIBLE_DATA')
    withRawConnection(schemaless, (connection) => {
      expect(connection.prepare('SELECT count(*) AS total FROM sqlite_master').get()).toMatchObject({ total: 0 })
    })
  })

  it('assinatura de outro produto com o mesmo schema bloqueia', async () => {
    const file = createProductFile()
    await seedProduct(file)
    withRawConnection(file, (connection) => {
      connection.exec("UPDATE taskflow_metadata SET signature = 'outro.produto/store'")
    })
    expectPreserved(file, 'INCOMPATIBLE_DATA')
  })

  it('schema SQL futuro bloqueia sem downgrade', async () => {
    const file = createProductFile()
    await seedProduct(file)
    withRawConnection(file, (connection) => {
      connection.exec('UPDATE taskflow_metadata SET schema_version = 3')
      connection.exec('PRAGMA user_version = 3')
    })
    expectPreserved(file, 'INCOMPATIBLE_DATA')
  })

  it('schema SQL 2 recusa o leitor 1 (downgrade) sem alterar o banco', async () => {
    const file = createProductFile()
    await seedProduct(file)
    const before = sha256(file)
    expect(openReason(file, PRODUCT_V1_DEFINITION)).toBe('INCOMPATIBLE_DATA')
    expect(sha256(file)).toBe(before)
  })

  it.each([
    ['payload de versão futura', 'UPDATE tasks SET payload_version = 5'],
    ['JSON inválido', "UPDATE tasks SET payload_json = '{\"id\":'"],
    ['ID do payload diferente da linha', "UPDATE tasks SET id = 'outro-id' WHERE id = (SELECT min(id) FROM tasks)"],
    ['enum inválido', "UPDATE tasks SET payload_json = json_set(payload_json, '$.status', 'ARCHIVED')"],
    ['data inválida', "UPDATE tasks SET payload_json = json_set(payload_json, '$.createdAt', 'ontem')"],
    ['lembrete inválido', "UPDATE tasks SET payload_json = json_set(payload_json, '$.reminders[0].type', 'WEEKLY')"],
    ['recorrência inválida', "UPDATE tasks SET payload_json = json_set(payload_json, '$.recurrence', json('{\"frequency\":\"YEARLY\"}'))"],
    ['subtarefa inválida', "UPDATE tasks SET payload_json = json_set(payload_json, '$.subtasks[0].done', 'sim')"],
    ['deletedAt inválido na lixeira', "UPDATE trash SET deleted_at = 'ontem'"],
    ['revisão de conteúdo acima da global', 'UPDATE tasks SET content_revision = 999999'],
    ['metadata e user_version discordantes', 'PRAGMA user_version = 1; UPDATE taskflow_metadata SET schema_version = 3'],
  ])('%s bloqueia sem descartar a linha', async (_label, sql) => {
    const file = createProductFile()
    await seedProduct(file)
    withRawConnection(file, (connection) => connection.exec(sql))

    expectPreserved(file, 'INCOMPATIBLE_DATA')
    withRawConnection(file, (connection) => {
      const total = connection.prepare('SELECT (SELECT count(*) FROM tasks) + (SELECT count(*) FROM trash) AS total').get()
      expect(total).toMatchObject({ total: 12 })
    })
  })

  it('metadado de edição inválido no SQL2 bloqueia sem fabricar revisão nem descartar a linha', async () => {
    for (const sql of [
      'PRAGMA ignore_check_constraints = ON; UPDATE tasks SET edit_revision = 0',
      'PRAGMA ignore_check_constraints = ON; UPDATE tasks SET edit_revision = content_revision + 1',
    ]) {
      const file = createProductFile()
      await seedProduct(file)
      withRawConnection(file, (connection) => connection.exec(sql))
      // A violação do CHECK é detectada pelo motor na abertura; além disso, a validação por
      // linha recusaria qualquer edição inválida que chegasse ao leitor.
      expectPreserved(file, 'CORRUPTED_DATA')
      withRawConnection(file, (connection) => {
        const total = connection.prepare('SELECT (SELECT count(*) FROM tasks) + (SELECT count(*) FROM trash) AS total').get()
        expect(total).toMatchObject({ total: 12 })
      })
    }
  })

  it('tabela sem chave primária (IDs duplicados) não corresponde ao schema e bloqueia', () => {
    const file = createProductFile()
    mkdirSync(path.dirname(file), { recursive: true })
    const payload = JSON.stringify(buildMinimalFictitiousTask('dup'))
    withRawConnection(file, (connection) => {
      connection.exec(PRODUCT_SCHEMA_V1_DDL[0] ?? '')
      connection.exec(
        'CREATE TABLE tasks (id TEXT NOT NULL, payload_version INTEGER NOT NULL, payload_json TEXT NOT NULL, content_revision INTEGER NOT NULL)',
      )
      connection.exec(PRODUCT_SCHEMA_V1_DDL[2] ?? '')
      connection.prepare('INSERT INTO taskflow_metadata VALUES (1, ?, 1, 2)').run(PRODUCT_SIGNATURE)
      const insert = connection.prepare('INSERT INTO tasks VALUES (?, 4, ?, ?)')
      insert.run('dup', payload, 1)
      insert.run('dup', payload, 2)
      connection.exec('PRAGMA user_version = 1')
    })

    expectPreserved(file, 'INCOMPATIBLE_DATA')
  })

  it('banco em WAL é de outra configuração: bloqueia sem criar -wal/-shm', async () => {
    const file = createProductFile()
    await seedProduct(file)
    withRawConnection(file, (connection) => connection.exec('PRAGMA journal_mode = WAL'))

    expectPreserved(file, 'INCOMPATIBLE_DATA')
    expect(listTree(path.dirname(file))).toEqual(['taskflow.sqlite'])
  })

  it('arquivo truncado é corrupção, não perfil novo', async () => {
    const header = createProductFile()
    await seedProduct(header)
    truncateSync(header, 60)
    expectPreserved(header, 'CORRUPTED_DATA')

    const body = createProductFile()
    await seedProduct(body, buildFictitiousTasks(60))
    truncateSync(body, 8192)
    expectPreserved(body, 'CORRUPTED_DATA')
  })

  it('corrupção estrutural é identificada sem reset', async () => {
    const file = createProductFile()
    await seedProduct(file, buildFictitiousTasks(60))
    const descriptor = openSync(file, 'r+')
    try {
      // Sobrescreve páginas internas com lixo, preservando o cabeçalho do arquivo.
      writeSync(descriptor, Buffer.alloc(4096 * 3, 0xff), 0, 4096 * 3, 4096)
    } finally {
      closeSync(descriptor)
    }

    expectPreserved(file, 'CORRUPTED_DATA')
  })

  it('destino que não é arquivo é indisponibilidade', () => {
    const file = createProductFile()
    mkdirSync(file, { recursive: true })

    expect(openReason(file)).toBe('UNAVAILABLE')
    expect(statSync(file).isDirectory()).toBe(true)
  })
})

describe('migrações registradas (fixture isolada)', () => {
  const FIXTURE_TABLE_SQL = 'CREATE TABLE fixture_notes (id TEXT PRIMARY KEY NOT NULL, note TEXT NOT NULL) STRICT, WITHOUT ROWID'

  function fixtureDefinition(apply: StorageDefinition['migrations'][number]['apply']): StorageDefinition {
    return {
      signature: PRODUCT_SIGNATURE,
      currentVersion: 2,
      versions: [
        { version: 1, ddl: PRODUCT_SCHEMA_V1_DDL },
        { version: 2, ddl: [...PRODUCT_SCHEMA_V2_DDL, FIXTURE_TABLE_SQL] },
      ],
      migrations: [{ from: 1, to: 2, apply }],
    }
  }

  const migrate: StorageDefinition['migrations'][number]['apply'] = (connection) => {
    PRODUCT_MIGRATION_1_TO_2(connection)
    connection.exec(FIXTURE_TABLE_SQL)
    connection.exec("INSERT INTO fixture_notes (id, note) SELECT id, 'migrada' FROM tasks")
  }

  function snapshotOf(file: string): unknown {
    let state: unknown
    withRawConnection(file, (connection) => {
      state = {
        userVersion: connection.prepare('PRAGMA user_version').get(),
        metadata: connection.prepare('SELECT * FROM taskflow_metadata').all(),
        tasks: connection.prepare('SELECT id, payload_version, payload_json, content_revision FROM tasks ORDER BY id').all(),
        trash: connection.prepare('SELECT id, payload_version, payload_json, content_revision, deleted_at FROM trash ORDER BY id').all(),
        tables: connection.prepare("SELECT name FROM sqlite_master ORDER BY name").all(),
      }
    })
    return state
  }

  it('o produto implantado é schema SQL 2 com a migração real 1→2 registrada', () => {
    expect(PRODUCT_STORAGE_DEFINITION.currentVersion).toBe(2)
    expect(PRODUCT_STORAGE_DEFINITION.versions.map((schema) => schema.version)).toEqual([1, 2])
    expect(PRODUCT_STORAGE_DEFINITION.migrations).toHaveLength(1)
    expect(PRODUCT_STORAGE_DEFINITION.migrations[0]).toMatchObject({ from: 1, to: 2 })
    expect(PRODUCT_V1_DEFINITION.migrations).toEqual([])
  })

  it('migração suportada confirma dados, schema e metadados juntos', async () => {
    const file = createProductFile()
    const revision = await seedProductV1(file)

    const result = ProductDatabase.open(file, fixtureDefinition(migrate))
    if (!result.ok) throw new Error(result.reason)
    expect(result.migrated).toBe(true)
    expect(result.database.runtime.schemaVersion).toBe(2)
    expect(result.database.readGlobalRevision()).toBe(revision + 1n)
    expect(result.database.listRows('tasks')).toHaveLength(11)
    result.database.close()

    withRawConnection(file, (connection) => {
      expect(connection.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 2 })
      expect(connection.prepare('SELECT count(*) AS total FROM fixture_notes').get()).toMatchObject({ total: 11 })
    })
  })

  it('falha entre alterações reverte tudo e preserva a origem', async () => {
    const file = createProductFile()
    await seedProductV1(file)
    const before = snapshotOf(file)

    const failing = fixtureDefinition((connection) => {
      migrate(connection)
      connection.exec('DELETE FROM tasks')
      throw new Error('fixture: migration failed midway')
    })

    expect(openReason(file, failing)).toBe('INCOMPATIBLE_DATA')
    expect(snapshotOf(file)).toEqual(before)
    expect(openReason(file, PRODUCT_V1_DEFINITION)).toBe('OPENED')
  })

  it('destino inválido após a migração não é confirmado', async () => {
    const file = createProductFile()
    await seedProductV1(file)
    const before = snapshotOf(file)

    // A migração "esquece" a tabela exigida pela versão de destino.
    expect(openReason(file, fixtureDefinition(() => undefined))).toBe('INCOMPATIBLE_DATA')
    expect(snapshotOf(file)).toEqual(before)
  })

  it('falha de I/O identificada antes do commit preserva a origem como indisponibilidade', async () => {
    const file = createProductFile()
    await seedProductV1(file)
    const before = snapshotOf(file)

    const result = ProductDatabase.open(file, fixtureDefinition(migrate), {
      at: (point) => {
        if (point === 'migrate:before-commit') {
          // Fault injection identificado: erro com a forma dos erros do node:sqlite (SQLITE_IOERR).
          throw Object.assign(new Error('fixture: disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 })
        }
      },
    })

    expect(result).toEqual({ ok: false, reason: 'UNAVAILABLE' })
    expect(snapshotOf(file)).toEqual(before)
  })

  it('leitor antigo recusa o schema migrado, sem downgrade ou exclusão', async () => {
    const file = createProductFile()
    await seedProductV1(file)
    expect(openReason(file, fixtureDefinition(migrate))).toBe('OPENED')
    const hash = sha256(file)

    expect(openReason(file, PRODUCT_V1_DEFINITION)).toBe('INCOMPATIBLE_DATA')
    expect(sha256(file)).toBe(hash)
  })

  it('sem caminho de migração registrado, a versão antiga não é adivinhada', async () => {
    const file = createProductFile()
    await seedProductV1(file)
    const before = snapshotOf(file)
    const gap: StorageDefinition = {
      ...fixtureDefinition(migrate),
      currentVersion: 3,
      versions: [
        { version: 1, ddl: PRODUCT_SCHEMA_V1_DDL },
        { version: 3, ddl: [...PRODUCT_SCHEMA_V2_DDL, FIXTURE_TABLE_SQL] },
      ],
      migrations: [{ from: 2, to: 3, apply: migrate }],
    }

    expect(openReason(file, gap)).toBe('INCOMPATIBLE_DATA')
    expect(snapshotOf(file)).toEqual(before)
  })
})

describe('migração real 1→2 do produto', () => {
  interface DataRow {
    id: string
    payload_version: number
    payload_json: string
    content_revision: number
    edit_revision?: number
    deleted_at?: string
  }

  function dataRows(file: string): { tasks: DataRow[]; trash: DataRow[] } {
    let state: { tasks: DataRow[]; trash: DataRow[] } = { tasks: [], trash: [] }
    withRawConnection(file, (connection) => {
      state = {
        tasks: connection
          .prepare('SELECT id, payload_version, payload_json, content_revision FROM tasks ORDER BY id')
          .all() as unknown as DataRow[],
        trash: connection
          .prepare('SELECT id, payload_version, payload_json, content_revision, deleted_at FROM trash ORDER BY id')
          .all() as unknown as DataRow[],
      }
    })
    return state
  }

  it('migra sem reescrever payload/IDs/deletedAt, preenche edit=content e avança a global uma vez', async () => {
    const file = createProductFile()
    const revision = await seedProductV1(file)
    const before = dataRows(file)

    const result = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION)
    if (!result.ok) throw new Error(result.reason)
    expect(result.migrated).toBe(true)
    expect(result.database.readGlobalRevision()).toBe(revision + 1n)
    for (const row of result.database.listRows('tasks')) {
      expect(row.editRevision).toBe(row.contentRevision)
    }
    result.database.close()

    // Comparação byte a byte das colunas existentes na origem.
    let after: { tasks: DataRow[]; trash: DataRow[] } = { tasks: [], trash: [] }
    withRawConnection(file, (connection) => {
      after = {
        tasks: connection
          .prepare('SELECT id, payload_version, payload_json, content_revision, edit_revision FROM tasks ORDER BY id')
          .all() as unknown as DataRow[],
        trash: connection
          .prepare('SELECT id, payload_version, payload_json, content_revision, edit_revision, deleted_at FROM trash ORDER BY id')
          .all() as unknown as DataRow[],
      }
    })
    expect(after.tasks.map(({ id, payload_version, payload_json, content_revision }) => ({ id, payload_version, payload_json, content_revision }))).toEqual(before.tasks)
    expect(after.tasks.every((row) => row.edit_revision === row.content_revision)).toBe(true)
    expect(
      after.trash.map(({ id, payload_version, payload_json, content_revision, deleted_at }) => ({ id, payload_version, payload_json, content_revision, deleted_at })),
    ).toEqual(before.trash)
    expect(after.trash.every((row) => row.edit_revision === row.content_revision)).toBe(true)

    // Reopen não repete a migração nem altera revisões.
    const reopened = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION)
    if (!reopened.ok) throw new Error(reopened.reason)
    expect(reopened.migrated).toBe(false)
    expect(reopened.database.readGlobalRevision()).toBe(revision + 1n)
    reopened.database.close()
  })

  it('perfil novo nasce em SQL2 sem itens/defaults artificiais e repetir bootstrap não migra', () => {
    const file = createProductFile()
    const created = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION)
    if (!created.ok) throw new Error(created.reason)
    expect(created.created).toBe(true)
    expect(created.migrated).toBe(false)
    expect(created.database.listRows('tasks')).toEqual([])
    expect(created.database.listRows('trash')).toEqual([])
    created.database.close()

    const again = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION)
    if (!again.ok) throw new Error(again.reason)
    expect([again.created, again.migrated]).toEqual([false, false])
    expect(again.database.readGlobalRevision()).toBe(0n)
    again.database.close()
  })
})
