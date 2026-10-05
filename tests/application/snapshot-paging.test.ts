import { describe, expect, it } from 'vitest'
import { MalformedSnapshotError, SnapshotAssembler } from '../../src/application/state/snapshot-assembler.js'
import {
  buildSnapshotPage,
  initialSnapshotPosition,
  serializeTaskRecord,
  serializeTrashRecord,
  type SerializedRecord,
  type SnapshotRecordSource,
} from '../../src/application/state/snapshot-paging.js'
import type { StoredTask, StoredTrashItem } from '../../src/application/storage/unit-of-work.js'
import type { SnapshotCollection, SnapshotFragment, SnapshotPage, StateSnapshot } from '../../src/contracts/state.js'
import { utf8ByteLength } from '../../src/contracts/text.js'
import { buildFictitiousTask, buildFictitiousTasks, buildMinimalFictitiousTask, fictitiousText } from '../../src/main/harness/fixtures.js'

const HIGH_SURROGATE_AT_END = /[\uD800-\uDBFF]$/
const LOW_SURROGATE_AT_START = /^[\uDC00-\uDFFF]/

function source(tasks: StoredTask[], trash: StoredTrashItem[]): SnapshotRecordSource {
  const byId = <T extends { task: { id: string } }>(items: T[]): T[] =>
    [...items].sort((left, right) => (left.task.id < right.task.id ? -1 : 1))
  return {
    *records(collection: SnapshotCollection, afterId: string | undefined): Generator<SerializedRecord> {
      if (collection === 'tasks') {
        for (const stored of byId(tasks)) if (afterId === undefined || stored.task.id > afterId) yield serializeTaskRecord(stored)
      } else {
        for (const stored of byId(trash)) if (afterId === undefined || stored.task.id > afterId) yield serializeTrashRecord(stored)
      }
    },
  }
}

function fragmentBytes(fragments: SnapshotFragment[]): number {
  return utf8ByteLength(JSON.stringify(fragments))
}

/** Percorre todas as páginas como o main e o cliente fariam; devolve o snapshot e as páginas. */
function paginate(records: SnapshotRecordSource, budget: number): { snapshot: StateSnapshot; pages: SnapshotPage[] } {
  const assembler = new SnapshotAssembler()
  const pages: SnapshotPage[] = []
  let position = initialSnapshotPosition()

  for (let guard = 0; guard < 100_000; guard += 1) {
    const built = buildSnapshotPage(records, position, budget)
    position = built.position
    const page: SnapshotPage =
      built.complete === undefined
        ? { revision: '5', fragments: built.fragments, cursor: 'A'.repeat(32) }
        : { revision: '5', fragments: built.fragments, complete: built.complete }
    pages.push(page)
    const snapshot = assembler.accept(page)
    if (snapshot !== undefined) return { snapshot, pages }
  }
  throw new Error('pagination did not finish')
}

function stored(count: number, descriptionLength = 600): StoredTask[] {
  return buildFictitiousTasks(count, { descriptionLength }).map((task, index) => ({
    task,
    contentRevision: BigInt(index + 1),
    editRevision: BigInt(index + 1),
  }))
}

describe('paginação de snapshot', () => {
  it('uma coleção pequena cabe numa página com conclusão e contagens, preservando as duas revisões', () => {
    const tasks = stored(3).map((item, index) => (index === 1 ? { ...item, editRevision: 1n } : item))
    const trash: StoredTrashItem[] = [
      { task: buildMinimalFictitiousTask('lixo'), deletedAt: '2026-09-12T08:00:00.000Z', contentRevision: 2n, editRevision: 2n },
    ]
    const { snapshot, pages } = paginate(source(tasks, trash), 256 * 1024)

    expect(pages).toHaveLength(1)
    expect(pages[0]?.complete).toEqual({ tasks: 3, trash: 1 })
    expect(snapshot.revision).toBe('5')
    expect(snapshot.tasks).toEqual(
      tasks.map((item) => ({
        task: item.task,
        contentRevision: String(item.contentRevision),
        editRevision: String(item.editRevision),
      })),
    )
    // O par pode divergir: edição menor que conteúdo é válida e não é inventada.
    expect(snapshot.tasks[1]).toMatchObject({ contentRevision: '2', editRevision: '1' })
    expect(snapshot.trash).toEqual([
      { task: buildMinimalFictitiousTask('lixo'), deletedAt: '2026-09-12T08:00:00.000Z', contentRevision: '2', editRevision: '2' },
    ])
  })

  it('cada página respeita o orçamento e nenhuma tarefa é omitida, cortada ou duplicada', () => {
    const tasks = stored(120)
    const budget = 8 * 1024
    const { snapshot, pages } = paginate(source(tasks, []), budget)

    expect(pages.length).toBeGreaterThan(10)
    for (const page of pages) expect(fragmentBytes(page.fragments)).toBeLessThanOrEqual(budget)
    expect(snapshot.tasks.map((record) => record.task)).toEqual(tasks.map((item) => item.task))
    expect(snapshot.tasks.every((record) => record.editRevision === record.contentRevision)).toBe(true)
  })

  it('registro maior que a página é fragmentado e reunido byte a byte, com Unicode e escaping', () => {
    const big: StoredTask = {
      task: { ...buildFictitiousTask(1), description: fictitiousText(400_000, 1) },
      contentRevision: 9_007_199_254_740_993n,
      editRevision: 3n,
    }
    const budget = 256 * 1024 - 512
    const { snapshot, pages } = paginate(source([big, ...stored(4).slice(1)], []), budget)

    expect(utf8ByteLength(JSON.stringify(big.task))).toBeGreaterThan(256 * 1024)
    expect(pages.length).toBeGreaterThan(2)
    for (const page of pages) expect(fragmentBytes(page.fragments)).toBeLessThanOrEqual(budget)
    expect(pages.some((page) => page.fragments.some((fragment) => !fragment.final))).toBe(true)
    expect(snapshot.tasks[0]).toEqual({ task: big.task, contentRevision: '9007199254740993', editRevision: '3' })
    expect(snapshot.tasks).toHaveLength(4)
  })

  it('fragmentação com orçamento mínimo nunca divide um par surrogate', () => {
    const emoji: StoredTask = { task: { ...buildMinimalFictitiousTask('emoji'), title: '🚀'.repeat(200) }, contentRevision: 1n, editRevision: 1n }
    const { snapshot, pages } = paginate(source([emoji], []), 80)

    expect(pages.length).toBeGreaterThan(10)
    for (const page of pages) {
      for (const fragment of page.fragments) {
        expect(HIGH_SURROGATE_AT_END.test(fragment.data)).toBe(false)
        expect(LOW_SURROGATE_AT_START.test(fragment.data)).toBe(false)
      }
    }
    expect(snapshot.tasks[0]?.task.title).toBe('🚀'.repeat(200))
  })

  it('coleção maior que o dataset do benchmark é percorrida sem limite total', () => {
    const tasks = stored(12_000, 40)
    const { snapshot, pages } = paginate(source(tasks, []), 256 * 1024 - 512)

    expect(snapshot.tasks).toHaveLength(12_000)
    expect(pages.at(-1)?.complete).toEqual({ tasks: 12_000, trash: 0 })
  })

  it('orçamento incapaz de transportar um caractere falha explicitamente, sem truncar', () => {
    expect(() => buildSnapshotPage(source(stored(1), []), initialSnapshotPosition(), 10)).toThrowError(RangeError)
  })
})

describe('montagem validada no cliente', () => {
  const record = JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '1', editRevision: '1' })
  const trashRecord = JSON.stringify({
    task: buildMinimalFictitiousTask('a'),
    deletedAt: '2026-09-12T08:00:00.000Z',
    contentRevision: '1',
    editRevision: '1',
  })
  const cursor = 'A'.repeat(32)

  function accept(pages: SnapshotPage[]): StateSnapshot | undefined {
    const assembler = new SnapshotAssembler()
    let result: StateSnapshot | undefined
    for (const page of pages) result = assembler.accept(page)
    return result
  }

  function single(collection: SnapshotCollection, data: string, counts: { tasks: number; trash: number }): SnapshotPage[] {
    return [{ revision: '1', fragments: [{ collection, data, final: true }], complete: counts }]
  }

  it('não publica nada antes da conclusão e devolve as duas revisões do registro', () => {
    const assembler = new SnapshotAssembler()
    expect(
      assembler.accept({ revision: '1', fragments: [{ collection: 'tasks', data: record.slice(0, 10), final: false }], cursor }),
    ).toBeUndefined()
    const snapshot = assembler.accept({
      revision: '1',
      fragments: [{ collection: 'tasks', data: record.slice(10), final: true }],
      complete: { tasks: 1, trash: 0 },
    })
    expect(snapshot).toMatchObject({ revision: '1' })
    expect(snapshot?.tasks[0]).toMatchObject({ contentRevision: '1', editRevision: '1' })
  })

  it.each<[string, SnapshotPage[]]>([
    [
      'revisões diferentes entre páginas',
      [
        { revision: '1', fragments: [], cursor },
        { revision: '2', fragments: [], complete: { tasks: 0, trash: 0 } },
      ],
    ],
    [
      'registro parcial na conclusão',
      [{ revision: '1', fragments: [{ collection: 'tasks', data: record.slice(0, 10), final: false }], complete: { tasks: 0, trash: 0 } }],
    ],
    ['contagem que não confere', single('tasks', record, { tasks: 2, trash: 0 })],
    ['JSON inválido', single('tasks', '{"task":', { tasks: 1, trash: 0 })],
    ['tarefa inválida', single('tasks', JSON.stringify({ task: { id: 'a' }, contentRevision: '1', editRevision: '1' }), { tasks: 1, trash: 0 })],
    [
      'propriedade desconhecida na tarefa',
      single(
        'tasks',
        JSON.stringify({ task: { ...buildMinimalFictitiousTask('a'), path: 'C:\\x' }, contentRevision: '1', editRevision: '1' }),
        { tasks: 1, trash: 0 },
      ),
    ],
    [
      'campo extra no registro',
      single('tasks', JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '1', editRevision: '1', sql: 'x' }), {
        tasks: 1,
        trash: 0,
      }),
    ],
    [
      'registro sem editRevision',
      single('tasks', JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '1' }), { tasks: 1, trash: 0 }),
    ],
    [
      'edição maior que o conteúdo',
      single('tasks', JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '5', editRevision: '6' }), {
        tasks: 1,
        trash: 0,
      }),
    ],
    [
      'revisão de edição zero',
      single('tasks', JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '5', editRevision: '0' }), {
        tasks: 1,
        trash: 0,
      }),
    ],
    [
      'revisão de conteúdo zero',
      single('tasks', JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '0', editRevision: '1' }), {
        tasks: 1,
        trash: 0,
      }),
    ],
    [
      'ID repetido na coleção',
      [
        {
          revision: '1',
          fragments: [
            { collection: 'tasks', data: record, final: true },
            { collection: 'tasks', data: record, final: true },
          ],
          complete: { tasks: 2, trash: 0 },
        },
      ],
    ],
    [
      'tarefas depois da lixeira',
      [
        {
          revision: '1',
          fragments: [
            { collection: 'trash', data: trashRecord, final: true },
            { collection: 'tasks', data: record, final: true },
          ],
          complete: { tasks: 1, trash: 1 },
        },
      ],
    ],
    ['lixeira sem deletedAt', single('trash', JSON.stringify({ task: buildMinimalFictitiousTask('a'), contentRevision: '1', editRevision: '1' }), { tasks: 0, trash: 1 })],
    ['lixeira sem editRevision', single('trash', JSON.stringify({ task: buildMinimalFictitiousTask('a'), deletedAt: '2026-09-12T08:00:00.000Z', contentRevision: '1' }), { tasks: 0, trash: 1 })],
    [
      'troca de coleção no meio de um registro',
      [
        {
          revision: '1',
          fragments: [
            { collection: 'tasks', data: record.slice(0, 5), final: false },
            { collection: 'trash', data: trashRecord, final: true },
          ],
          complete: { tasks: 0, trash: 1 },
        },
      ],
    ],
  ])('recusa %s', (_label, pages) => {
    expect(() => accept(pages)).toThrowError(MalformedSnapshotError)
  })

  it('o mesmo ID pode aparecer em tarefas e na lixeira, cada um com seu par de revisões', () => {
    const snapshot = accept([
      {
        revision: '3',
        fragments: [
          { collection: 'tasks', data: record, final: true },
          { collection: 'trash', data: trashRecord, final: true },
        ],
        complete: { tasks: 1, trash: 1 },
      },
    ])
    expect(snapshot?.tasks[0]).toMatchObject({ contentRevision: '1', editRevision: '1' })
    expect(snapshot?.trash[0]).toMatchObject({ contentRevision: '1', editRevision: '1' })
    expect(snapshot?.tasks[0]?.task.id).toBe('a')
    expect(snapshot?.trash[0]?.task.id).toBe('a')
  })

  it('o erro de montagem não carrega o conteúdo recebido', () => {
    expect(new MalformedSnapshotError().message).toBe('malformed snapshot')
  })
})
