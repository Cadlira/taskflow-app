import { afterEach, describe, expect, it } from 'vitest'
import { cleanupStorage, createProductFile, expectOk, openCoordinator } from '../support/storage.js'

afterEach(cleanupStorage)

describe('conclusão serializada do coordenador (B09/B11)', () => {
  it('executa a conclusão depois do commit e antes da publicação', async () => {
    const coordinator = openCoordinator(createProductFile())
    const events: string[] = []
    coordinator.onCommitted(() => events.push('published'))

    const result = expectOk(
      await coordinator.run((unit) => unit.saveTask({ ...minimal(), id: 'a' }), {
        onCompleted: (completion) => {
          events.push(completion.committed ? 'concluded-applied' : 'concluded-noop')
          expect(completion.revision).toBeDefined()
        },
      }),
    )
    expect(result.committed).toBe(true)
    expect(events).toEqual(['concluded-applied', 'published'])
  })

  it('executa a conclusão também para no-op e recusa, sem publicar', async () => {
    const coordinator = openCoordinator(createProductFile())
    expectOk(await coordinator.run((unit) => unit.saveTask({ ...minimal(), id: 'a' })))
    const events: string[] = []
    coordinator.onCommitted(() => events.push('published'))

    const unchanged = expectOk(
      await coordinator.run((unit) => unit.saveTask({ ...minimal(), id: 'a' }), {
        onCompleted: (completion) => events.push(completion.committed ? 'applied' : 'noop'),
      }),
    )
    expect(unchanged.committed).toBe(false)

    const failed = await coordinator.run(
      (unit) => {
        void unit
        throw new Error('falha fictícia')
      },
      { onCompleted: () => events.push('failed') },
    )
    expect(failed.ok).toBe(false)
    expect(events).toEqual(['noop', 'failed'])
  })

  it('falha na conclusão bloqueia a admissão, mantém o commit e não publica', async () => {
    const coordinator = openCoordinator(createProductFile())
    const events: string[] = []
    coordinator.onCommitted(() => events.push('published'))

    const result = expectOk(
      await coordinator.run((unit) => unit.saveTask({ ...minimal(), id: 'a' }), {
        onCompleted: () => {
          throw new Error('barreira indisponível')
        },
      }),
    )
    // O commit permanece, mas a barreira não pôde ser garantida: nenhum evento foi publicado.
    expect(result.committed).toBe(true)
    expect(events).toEqual([])

    // A próxima unidade reabre e valida; o dado confirmado aparece no estado.
    const reopened = expectOk(
      await coordinator.read((reader) => reader.getTask('a')?.task.id),
      )
    expect(reopened.value).toBe('a')
  })
})

function minimal() {
  return {
    title: 'Tarefa',
    status: 'TODO' as const,
    priority: 'LOW' as const,
    reminders: [],
    subtasks: [],
    tags: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T11:00:00.000Z',
  }
}
