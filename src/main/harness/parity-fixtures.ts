import type { CreateTaskDraft } from '../../domain/task-draft.js'
import type { Task } from '../../domain/task.js'

// Fixtures do percurso integrado `parity` (TFA-012) — dados 100% fictícios e determinísticos
// em relação a `nowMs`. Os valores esperados são literais calculados aqui (aritmética
// independente), nunca cópias das respostas do aplicativo; a validação portátil vive em
// tests/main/parity-fixtures.test.ts e reutiliza os backups v1–v4 existentes.

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

export interface ParityPlan {
  nowMs: number
  full: CreateTaskDraft
  plain: CreateTaskDraft
  expected: {
    fullTitle: string
    fullDescription: string
    fullRequester: string
    fullAssignee: string
    fullDueAt: string
    fullNextDueAt: string
    fullReminderOffsetMinutes: number
    fullReminderTriggerAt: string
    fullSubtaskTitles: readonly string[]
    fullTags: readonly string[]
    fullSourceUrl: string
    plainTitle: string
    agedTitle: string
    agedDueAt: string
    agedTriggerAt: string
    agedFutureTriggerAt: string
  }
}

/**
 * Plano do percurso central: tarefa completa com série diária, OFFSET, checklist e origem;
 * tarefa simples para lixeira; e o esperado literal de cada campo/ordem/marker.
 */
export function buildParityPlan(nowMs: number): ParityPlan {
  const dueMs = nowMs + 3 * DAY_MS
  const reminderOffsetMinutes = 1440
  const triggerMs = dueMs - reminderOffsetMinutes * MINUTE_MS
  const expectedNextDueMs = dueMs + DAY_MS
  const fullTitle = 'TFA012-PARIDADE — Central com série 🚀'
  const plainTitle = 'TFA012-PARIDADE — Simples para lixeira'

  return {
    nowMs,
    full: {
      title: fullTitle,
      description: 'Descrição fictícia da jornada central — ação, coração, 日本語, 🚀✅',
      requester: 'Pessoa Fictícia A',
      assignee: 'Pessoa Fictícia B',
      priority: 'HIGH',
      dueAt: iso(dueMs),
      sourceUrl: 'https://example.invalid/tfa012/central?q=1#secao',
      tags: ['tfa012', 'paridade', 'ação'],
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      subtasks: [
        { title: 'Checklist A — preparar' },
        { title: 'Checklist B — revisar' },
        { title: 'Checklist C — concluir' },
      ],
      reminders: [{ type: 'OFFSET', offsetMinutes: reminderOffsetMinutes }],
    },
    plain: {
      title: plainTitle,
      description: 'Fixtura simples para mover/restaurar sem geração.',
      priority: 'LOW',
      tags: ['tfa012', 'lixeira'],
    },
    expected: {
      fullTitle,
      fullDescription: 'Descrição fictícia da jornada central — ação, coração, 日本語, 🚀✅',
      fullRequester: 'Pessoa Fictícia A',
      fullAssignee: 'Pessoa Fictícia B',
      fullDueAt: iso(dueMs),
      fullNextDueAt: iso(expectedNextDueMs),
      fullReminderOffsetMinutes: reminderOffsetMinutes,
      fullReminderTriggerAt: iso(triggerMs),
      fullSubtaskTitles: ['Checklist A — preparar', 'Checklist B — revisar', 'Checklist C — concluir'],
      fullTags: ['tfa012', 'paridade', 'ação'],
      fullSourceUrl: 'https://example.invalid/tfa012/central?q=1#secao',
      plainTitle,
      agedTitle: 'TFA012-PARIDADE — Lembrete vencido 🕑',
      agedDueAt: iso(nowMs + HOUR_MS),
      agedTriggerAt: iso(nowMs + HOUR_MS - 90 * MINUTE_MS),
      agedFutureTriggerAt: iso(nowMs + HOUR_MS - 30 * MINUTE_MS),
    },
  }
}

/**
 * Tarefa "envelhecida" para o oráculo de liquidação (H09): um gatilho pendente <= agora
 * (deve receber marker numa mutação, sem graça) e outro futuro (deve permanecer pendente).
 * É semeada por unidade do proprietário — o armazenamento não aplica limites de formulário a
 * dado histórico, exatamente como um estado real anterior à mutação.
 */
export function buildAgedParityTask(nowMs: number): Task {
  const dueMs = nowMs + HOUR_MS
  return {
    id: 'tfa012-parity-aged',
    title: 'TFA012-PARIDADE — Lembrete vencido 🕑',
    description: 'Fixtura fictícia com gatilho vencido para liquidação por mutação.',
    requester: 'Pessoa Fictícia C',
    status: 'TODO',
    priority: 'MEDIUM',
    dueAt: iso(dueMs),
    reminders: [
      { id: 'tfa012-parity-aged-r1', type: 'OFFSET', offsetMinutes: 90 },
      { id: 'tfa012-parity-aged-r2', type: 'OFFSET', offsetMinutes: 30 },
    ],
    subtasks: [],
    tags: ['tfa012'],
    sourceUrl: 'https://example.invalid/tfa012/aged',
    createdAt: iso(nowMs - 2 * DAY_MS),
    updatedAt: iso(nowMs - 2 * DAY_MS),
  }
}
