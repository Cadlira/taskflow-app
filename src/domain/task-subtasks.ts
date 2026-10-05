// Cópia revisada e ampliada de taskflow-extension@a763e7a src/domain/task-subtasks.ts.
// Mantém limite, títulos trim 1–200, um nível, IDs locais, progresso derivado, cópia desmarcada
// com IDs novos e marcação por intenção. Acrescenta a resolução de drafts id/título com erros
// posicionais finitos e a recusa de IDs desconhecidos/repetidos sem ressuscitar itens removidos.
import { createIdentityAllocator } from './identity.js'
import type { IdGenerator, Task } from './task.js'

/** Limite de subtarefas por tarefa. */
export const MAX_SUBTASKS = 20

/** Limite do título de uma subtarefa; igual ao limite do título da tarefa. */
export const SUBTASK_TITLE_LIMIT = 200

/** Passo marcável de uma tarefa; não tem status, prazo, lembretes nem subtarefas próprias. */
export interface Subtask {
  /** Identificador gerado localmente, único dentro da tarefa. */
  id: string
  title: string
  done: boolean
}

/**
 * Subtarefa enviada pelo formulário; `id` presente apenas para itens já persistidos. O rascunho
 * não carrega a marcação, de modo que salvar o formulário nunca a altera.
 */
export interface SubtaskDraft {
  id?: string | undefined
  title: string
}

export type SubtaskItemErrorCode = 'REQUIRED' | 'TOO_LONG' | 'INVALID_VALUE' | 'DUPLICATE_ID' | 'UNKNOWN_ID'

export interface SubtaskItemErrors {
  /** Índice do item na ordem enviada (0–19 válidos; excedente é recusado pela lista). */
  index: number
  title?: 'REQUIRED' | 'TOO_LONG'
  id?: 'INVALID_VALUE' | 'DUPLICATE_ID' | 'UNKNOWN_ID'
}

export interface SubtaskListErrors {
  list?: 'TOO_MANY'
  items?: SubtaskItemErrors[]
}

export type SubtaskResolution =
  | { ok: true; subtasks: Subtask[] }
  | { ok: false; kind: 'validation'; errors: SubtaskListErrors }
  | { ok: false; kind: 'identity' }

export interface SubtaskProgress {
  done: number
  total: number
}

/**
 * Resolve a lista enviada contra a lista atual da tarefa, na ordem enviada:
 *
 * - criação aceita somente título; edição aceita `id` opcional que precisa existir na lista
 *   atual (IDs desconhecidos e repetidos são recusados, item removido não ressuscita);
 * - título novo/renomeado usa trim e 1–200; título exatamente igual ao atual permanece intacto
 *   (sem limite retroativo), preservando o valor histórico aceito pelo codec;
 * - item com `id` conserva a marcação atual; item sem `id` recebe identidade nova da autoridade
 *   e começa desmarcado. IDs novos não reutilizam IDs antigos do conjunto nem duplicam na lista.
 */
export function resolveSubtaskDrafts(
  drafts: readonly SubtaskDraft[],
  current: readonly Subtask[],
  generateId: IdGenerator,
  mode: 'create' | 'edit',
): SubtaskResolution {
  const listError = drafts.length > MAX_SUBTASKS ? 'TOO_MANY' : undefined
  const itemErrors: SubtaskItemErrors[] = []
  const seenDraftIds = new Set<string>()
  const currentById = new Map(current.map((subtask) => [subtask.id, subtask]))

  const pushError = (index: number, error: Omit<SubtaskItemErrors, 'index'>): void => {
    const existing = itemErrors.find((candidate) => candidate.index === index)
    if (existing !== undefined) Object.assign(existing, error)
    else itemErrors.push({ index, ...error })
  }

  const resolved: Array<{ draft: SubtaskDraft; title: string; previous: Subtask | undefined }> = []

  drafts.forEach((draft, index) => {
    let previous: Subtask | undefined
    let idError: SubtaskItemErrors['id']

    if (draft.id !== undefined) {
      if (mode === 'create') {
        idError = 'INVALID_VALUE'
      } else if (typeof draft.id !== 'string' || draft.id.trim() === '') {
        idError = 'INVALID_VALUE'
      } else if (seenDraftIds.has(draft.id)) {
        idError = 'DUPLICATE_ID'
      } else {
        previous = currentById.get(draft.id)
        if (previous === undefined) idError = 'UNKNOWN_ID'
      }
    }

    if (draft.id !== undefined && idError === undefined && typeof draft.id === 'string') {
      seenDraftIds.add(draft.id)
    }

    let title: string | undefined
    let titleError: SubtaskItemErrors['title']

    if (previous !== undefined && draft.title === previous.title) {
      // Título intacto: conserva o valor histórico sem revalidação retroativa.
      title = previous.title
    } else {
      const trimmed = typeof draft.title === 'string' ? draft.title.trim() : ''
      if (!trimmed) titleError = 'REQUIRED'
      else if (trimmed.length > SUBTASK_TITLE_LIMIT) titleError = 'TOO_LONG'
      else title = trimmed
    }

    if (idError !== undefined || titleError !== undefined) {
      pushError(index, { ...(idError !== undefined && { id: idError }), ...(titleError !== undefined && { title: titleError }) })
      return
    }

    resolved.push({ draft, title: title as string, previous })
  })

  if (listError !== undefined || itemErrors.length > 0) {
    return {
      ok: false,
      kind: 'validation',
      errors: { ...(listError !== undefined && { list: listError }), ...(itemErrors.length > 0 && { items: itemErrors }) },
    }
  }

  const identity = createIdentityAllocator(() => false)
  for (const subtask of current) identity.reserve(subtask.id)

  const subtasks: Subtask[] = []

  for (const item of resolved) {
    if (item.draft.id !== undefined && typeof item.draft.id === 'string') {
      subtasks.push({ id: item.draft.id, title: item.title, done: item.previous?.done ?? false })
      continue
    }

    const id = identity.allocate(generateId)
    if (id === undefined) return { ok: false, kind: 'identity' }
    subtasks.push({ id, title: item.title, done: false })
  }

  return { ok: true, subtasks }
}

/** Igualdade de lista por identidade, título e marcação, na ordem. */
export function isSameSubtaskList(left: readonly Subtask[], right: readonly Subtask[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (subtask, index) =>
        subtask.id === right[index]?.id &&
        subtask.title === right[index]?.title &&
        subtask.done === right[index]?.done,
    )
  )
}

/**
 * Altera somente a marcação da subtarefa. Devolve a mesma instância quando o valor já é o pedido
 * e `undefined` quando a subtarefa não existe. Status, conclusão, prazo e lembretes não mudam.
 */
export function setSubtaskDone(task: Task, subtaskId: string, done: boolean, now: Date): Task | undefined {
  const target = task.subtasks.find((subtask) => subtask.id === subtaskId)

  if (target === undefined) {
    return undefined
  }

  if (target.done === done) {
    return task
  }

  return {
    ...task,
    subtasks: task.subtasks.map((subtask) => (subtask.id === subtaskId ? { ...subtask, done } : subtask)),
    updatedAt: now.toISOString(),
  }
}

/** Progresso derivado; nunca é persistido. */
export function countSubtaskProgress(subtasks: readonly Subtask[]): SubtaskProgress {
  return {
    done: subtasks.filter((subtask) => subtask.done).length,
    total: subtasks.length,
  }
}

/**
 * Cópia desmarcada, na mesma ordem e com novos identificadores que não reutilizam os antigos,
 * para uma nova ocorrência. Devolve `undefined` quando o gerador não produz identidade livre.
 */
export function resetSubtasks(
  subtasks: readonly Subtask[],
  generateId: IdGenerator,
  isIdTaken: (id: string) => boolean = () => false,
): Subtask[] | undefined {
  const identity = createIdentityAllocator(isIdTaken)
  for (const subtask of subtasks) identity.reserve(subtask.id)

  const reset: Subtask[] = []

  for (const subtask of subtasks) {
    const id = identity.allocate(generateId)
    if (id === undefined) return undefined
    reset.push({ id, title: subtask.title, done: false })
  }

  return reset
}
