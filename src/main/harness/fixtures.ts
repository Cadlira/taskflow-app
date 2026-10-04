import type { Task, TaskPriority, TaskStatus } from '../../domain/task.js'

// Dados exclusivamente fictícios para o harness de produto e para os testes. Nenhum dado real.

const STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const BASE_MS = Date.UTC(2026, 8, 1, 10, 0, 0)
const HOUR_MS = 60 * 60 * 1000
const UNICODE_FILLER = 'Texto fictício — ação, coração, über, naïve, 日本語, العربية, 🚀✅ "aspas" \\barra\\ \n\tlinha; '

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

/** Texto Unicode determinístico com pelo menos `length` unidades de código. */
export function fictitiousText(length: number, seed = 0): string {
  let text = `#${seed} `
  while (text.length < length) text += UNICODE_FILLER
  // Não corta no meio de um par surrogate.
  const end = text.charCodeAt(length - 1) >= 0xd800 && text.charCodeAt(length - 1) <= 0xdbff ? length + 1 : length
  return text.slice(0, end).trimEnd()
}

export interface FictitiousTaskOptions {
  /** Tamanho aproximado da descrição, em unidades de código. */
  descriptionLength?: number
  idPrefix?: string
}

/**
 * Tarefa fictícia válida com todos os campos conhecidos preenchidos de forma determinística:
 * textos Unicode, lembretes AT/OFFSET (alguns já processados), série/recorrência, subtarefas
 * ordenadas, tags, URL de origem e datas.
 */
export function buildFictitiousTask(index: number, options: FictitiousTaskOptions = {}): Task {
  const status = STATUSES[index % STATUSES.length] ?? 'TODO'
  const priority = PRIORITIES[index % PRIORITIES.length] ?? 'MEDIUM'
  const createdMs = BASE_MS + index * 1000
  const dueMs = createdMs + 72 * HOUR_MS
  const recurring = index % 3 === 0
  const id = `${options.idPrefix ?? 'fict'}-${String(index).padStart(6, '0')}`

  const task: Task = {
    id,
    title: `Tarefa fictícia №${index} — açaí 🚀 日本語`,
    description: fictitiousText(options.descriptionLength ?? 1200, index),
    requester: `Solicitante Fictício ${index % 17}`,
    assignee: `Responsável Fictícia ${index % 13}`,
    status,
    priority,
    dueAt: iso(dueMs),
    reminders: [
      { id: `${id}-r1`, type: 'OFFSET', offsetMinutes: 60, processedFor: iso(dueMs - HOUR_MS) },
      { id: `${id}-r2`, type: 'OFFSET', offsetMinutes: 1440 },
    ],
    seriesId: `serie-${index % 50}`,
    subtasks: [
      { id: `${id}-s1`, title: `Primeiro passo ${index} ✔`, done: true },
      { id: `${id}-s2`, title: 'Segundo passo — revisão', done: false },
      { id: `${id}-s3`, title: 'Terceiro passo «final»', done: index % 2 === 0 },
    ],
    tags: ['fictício', `lote-${index % 7}`, 'ação', '日本'],
    sourceUrl: `https://example.invalid/tarefas/${index}?q=a%20b#secao`,
    createdAt: iso(createdMs),
    updatedAt: iso(createdMs + HOUR_MS),
  }

  if (recurring) {
    task.recurrence =
      index % 2 === 0
        ? { frequency: 'WEEKLY', weekdays: [1, 3, 5], until: iso(dueMs + 90 * 24 * HOUR_MS) }
        : { frequency: 'DAILY', intervalDays: 2, anchorAt: iso(dueMs) }
  } else {
    task.reminders.push({ id: `${id}-r3`, type: 'AT', at: iso(dueMs - 3 * HOUR_MS) })
  }

  if (status === 'DONE') task.completedAt = iso(createdMs + 2 * HOUR_MS)
  return task
}

export function buildFictitiousTasks(count: number, options: FictitiousTaskOptions = {}): Task[] {
  return Array.from({ length: count }, (_unused, index) => buildFictitiousTask(index + 1, options))
}

/** Tarefa mínima: somente campos obrigatórios, para conferir a ausência dos opcionais. */
export function buildMinimalFictitiousTask(id: string): Task {
  return {
    id,
    title: 'Mínima fictícia',
    status: 'TODO',
    priority: 'LOW',
    reminders: [],
    subtasks: [],
    tags: [],
    createdAt: iso(BASE_MS),
    updatedAt: iso(BASE_MS),
  }
}
