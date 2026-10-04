// Cópia revisada de taskflow-extension@a763e7a src/infrastructure/storage/stored-task-collection.ts
// e stored-trash.ts (MIT, mesmo autor). Mantidos: decoders v1–v4 e invariantes da coleção.
// Removidos: chaves/envelopes do armazenamento da extensão e mensagens de UI. Acrescentados para o
// desktop: codec por item (um registro por linha do banco) e validação também na escrita.
import { isTaskPriority, isTaskStatus, type Task, type TaskReminder } from '../../domain/task.js'
import { isRecurrence, type Recurrence } from '../../domain/task-recurrence.js'
import { isReminderCollectionValid } from '../../domain/task-reminders.js'
import { MAX_SUBTASKS, type Subtask } from '../../domain/task-subtasks.js'
import { StorageFailure } from './task-storage-error.js'

/** Versão do codec de payload gravada em novas escritas. Independe do schema SQL e do backup. */
export const CURRENT_PAYLOAD_VERSION = 4

const LEGACY_PAYLOAD_VERSION = 1
const REMINDER_TYPES_PAYLOAD_VERSION = 2
const RECURRENCE_PAYLOAD_VERSION = 3
const MINUTE_MS = 60_000

type UnknownRecord = Record<string, unknown>

class IncompatibleRecordError extends Error {}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '') {
    throw new IncompatibleRecordError(key)
  }
  return value
}

function requireInstant(record: UnknownRecord, key: string): string {
  const value = requireString(record, key)
  if (Number.isNaN(Date.parse(value))) {
    throw new IncompatibleRecordError(key)
  }
  return value
}

function optionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new IncompatibleRecordError(key)
  }
  return value
}

function optionalNonEmptyString(record: UnknownRecord, key: string): string | undefined {
  const value = optionalString(record, key)

  if (value === '') {
    throw new IncompatibleRecordError(key)
  }

  return value
}

function optionalInstant(record: UnknownRecord, key: string): string | undefined {
  return record[key] === undefined ? undefined : requireInstant(record, key)
}

function optionalArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key]
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new IncompatibleRecordError(key)
  }
  return value as unknown[]
}

function decodeReminderV2(value: unknown): TaskReminder {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('reminders')
  }

  const id = requireString(value, 'id')
  const processedFor = optionalInstant(value, 'processedFor')
  const identity = processedFor === undefined ? { id } : { id, processedFor }

  if (value['type'] === 'OFFSET') {
    const offsetMinutes = value['offsetMinutes']
    if (typeof offsetMinutes !== 'number' || !Number.isSafeInteger(offsetMinutes) || offsetMinutes < 0) {
      throw new IncompatibleRecordError('offsetMinutes')
    }

    return { ...identity, type: 'OFFSET', offsetMinutes }
  }

  if (value['type'] === 'AT') {
    return { ...identity, type: 'AT', at: requireInstant(value, 'at') }
  }

  throw new IncompatibleRecordError('type')
}

/**
 * Migra um lembrete da versão 1. Qualquer inteiro não negativo aceito pelo decoder anterior é
 * preservado; `lastTriggeredFor` é convertido no instante efetivo já processado.
 */
function migrateReminderV1(value: unknown): TaskReminder {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('reminders')
  }

  const offsetMinutes = value['offsetMinutes']
  if (typeof offsetMinutes !== 'number' || !Number.isInteger(offsetMinutes) || offsetMinutes < 0) {
    throw new IncompatibleRecordError('offsetMinutes')
  }

  const id = requireString(value, 'id')
  const lastTriggeredFor = optionalInstant(value, 'lastTriggeredFor')

  if (lastTriggeredFor === undefined) {
    return { id, type: 'OFFSET', offsetMinutes }
  }

  const processedFor = new Date(Date.parse(lastTriggeredFor) - offsetMinutes * MINUTE_MS).toISOString()
  return { id, type: 'OFFSET', offsetMinutes, processedFor }
}

type ReminderDecoder = (value: unknown) => TaskReminder

type TaskDecoder = (value: unknown) => Task

/** Campos introduzidos por versões posteriores à 2; ausentes nas versões que não os conheciam. */
interface TaskDecodingFeatures {
  recurrence: boolean
  subtasks: boolean
}

function decodeSubtask(value: unknown): Subtask {
  if (!isRecord(value) || typeof value['done'] !== 'boolean') {
    throw new IncompatibleRecordError('subtasks')
  }

  return { id: requireString(value, 'id'), title: requireString(value, 'title'), done: value['done'] }
}

function decodeSubtasks(record: UnknownRecord): Subtask[] {
  const subtasks = record['subtasks']
  if (!Array.isArray(subtasks)) {
    throw new IncompatibleRecordError('subtasks')
  }

  return (subtasks as unknown[]).map(decodeSubtask)
}

function decodeRecurrence(value: unknown): Recurrence {
  if (!isRecurrence(value)) {
    throw new IncompatibleRecordError('recurrence')
  }

  return value
}

function decodeTask(value: unknown, decodeReminder: ReminderDecoder, features: TaskDecodingFeatures): Task {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('task')
  }

  const status = value['status']
  const priority = value['priority']
  if (!isTaskStatus(status) || !isTaskPriority(priority)) {
    throw new IncompatibleRecordError('status')
  }

  const tags = optionalArray(value, 'tags')
  if (!tags.every((tag): tag is string => typeof tag === 'string')) {
    throw new IncompatibleRecordError('tags')
  }

  const optional = {
    description: optionalString(value, 'description'),
    requester: optionalString(value, 'requester'),
    assignee: optionalString(value, 'assignee'),
    dueAt: optionalInstant(value, 'dueAt'),
    sourceUrl: optionalString(value, 'sourceUrl'),
    completedAt: optionalInstant(value, 'completedAt'),
    seriesId: features.recurrence ? optionalNonEmptyString(value, 'seriesId') : undefined,
    recurrence:
      features.recurrence && value['recurrence'] !== undefined ? decodeRecurrence(value['recurrence']) : undefined,
  }

  const task: Task = {
    id: requireString(value, 'id'),
    title: requireString(value, 'title'),
    status,
    priority,
    reminders: optionalArray(value, 'reminders').map(decodeReminder),
    subtasks: features.subtasks ? decodeSubtasks(value) : [],
    tags: [...tags],
    createdAt: requireInstant(value, 'createdAt'),
    updatedAt: requireInstant(value, 'updatedAt'),
  }

  for (const [key, field] of Object.entries(optional)) {
    if (field !== undefined) {
      Object.assign(task, { [key]: field })
    }
  }

  return task
}

/** Uma regra persistida exige prazo, identificador de série e nenhum lembrete de instante fixo. */
function isRecurrenceInvariantSatisfied(task: Task): boolean {
  if (task.recurrence === undefined) {
    return true
  }

  return (
    task.dueAt !== undefined &&
    task.seriesId !== undefined &&
    task.reminders.every((reminder) => reminder.type === 'OFFSET')
  )
}

/** Subtarefas persistidas respeitam o limite de itens e não repetem identificador na tarefa. */
function isSubtaskInvariantSatisfied(task: Task): boolean {
  return (
    task.subtasks.length <= MAX_SUBTASKS &&
    new Set(task.subtasks.map((subtask) => subtask.id)).size === task.subtasks.length
  )
}

function decodeRecords(values: unknown, decode: TaskDecoder): Task[] {
  if (!Array.isArray(values)) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  try {
    const tasks = (values as unknown[]).map(decode)
    const seenTaskIds = new Set<string>()

    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) {
        throw new IncompatibleRecordError('id')
      }

      seenTaskIds.add(task.id)

      if (!isReminderCollectionValid(task)) {
        throw new IncompatibleRecordError('reminders')
      }

      if (!isRecurrenceInvariantSatisfied(task)) {
        throw new IncompatibleRecordError('recurrence')
      }

      if (!isSubtaskInvariantSatisfied(task)) {
        throw new IncompatibleRecordError('subtasks')
      }
    }

    return tasks
  } catch {
    // A causa (campo/valor) não acompanha o erro: razões portáveis não carregam conteúdo.
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }
}

function taskDecoderFor(payloadVersion: unknown): TaskDecoder {
  if (payloadVersion === LEGACY_PAYLOAD_VERSION) {
    return (task) => decodeTask(task, migrateReminderV1, { recurrence: false, subtasks: false })
  }

  if (payloadVersion === REMINDER_TYPES_PAYLOAD_VERSION) {
    return (task) => decodeTask(task, decodeReminderV2, { recurrence: false, subtasks: false })
  }

  if (payloadVersion === RECURRENCE_PAYLOAD_VERSION) {
    return (task) => decodeTask(task, decodeReminderV2, { recurrence: true, subtasks: false })
  }

  if (payloadVersion === CURRENT_PAYLOAD_VERSION) {
    return (task) => decodeTask(task, decodeReminderV2, { recurrence: true, subtasks: true })
  }

  throw new StorageFailure('INCOMPATIBLE_DATA')
}

export function isKnownPayloadVersion(payloadVersion: unknown): payloadVersion is 1 | 2 | 3 | 4 {
  return (
    payloadVersion === LEGACY_PAYLOAD_VERSION ||
    payloadVersion === REMINDER_TYPES_PAYLOAD_VERSION ||
    payloadVersion === RECURRENCE_PAYLOAD_VERSION ||
    payloadVersion === CURRENT_PAYLOAD_VERSION
  )
}

/**
 * Decodifica registros de tarefa gravados na versão de payload informada, com as mesmas
 * migrações e invariantes da coleção, inclusive identificadores únicos. Qualquer problema gera
 * `INCOMPATIBLE_DATA`; nenhum registro é omitido para produzir sucesso aparente.
 */
export function decodeStoredTaskRecords(payloadVersion: unknown, values: unknown): Task[] {
  return decodeRecords(values, taskDecoderFor(payloadVersion))
}

/** Instante de exclusão aceito pelo codec da lixeira da origem. */
export function isStoredDeletedAt(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** Igualdade lógica de valores JSON; a ordem das chaves de objeto não importa, a de listas sim. */
export function isSameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => isSameJsonValue(item, (right as unknown[])[index]))
  }

  const leftRecord = left as UnknownRecord
  const rightRecord = right as UnknownRecord
  const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined)
  const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && isSameJsonValue(leftRecord[key], rightRecord[key]),
  )
}

/**
 * Decodifica o payload de uma linha: JSON de um único item na versão indicada, sem envelope
 * de coleção. O identificador do payload precisa coincidir com o metadado da linha.
 */
export function decodeTaskPayload(payloadVersion: unknown, payloadJson: unknown, expectedId: unknown): Task {
  if (typeof payloadJson !== 'string' || typeof expectedId !== 'string' || expectedId === '') {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payloadJson)
  } catch {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  const task = decodeStoredTaskRecords(payloadVersion, [parsed])[0]
  if (task === undefined || task.id !== expectedId) {
    throw new StorageFailure('INCOMPATIBLE_DATA')
  }

  return task
}

export interface EncodedTaskPayload {
  payloadVersion: typeof CURRENT_PAYLOAD_VERSION
  payloadJson: string
  /** Modelo validado e normalizado que foi serializado. */
  task: Task
}

/**
 * Valida e codifica uma tarefa na versão atual. O valor passa pelo mesmo decoder da leitura
 * (envelopar não é validação) e a serialização é conferida por releitura antes de sair.
 */
export function encodeTaskPayload(value: unknown): EncodedTaskPayload {
  let task: Task | undefined
  let payloadJson: string

  try {
    task = decodeStoredTaskRecords(CURRENT_PAYLOAD_VERSION, [value])[0]
    if (task === undefined) throw new StorageFailure('INVALID_DATA')
    payloadJson = JSON.stringify(task)
    if (!isSameJsonValue(JSON.parse(payloadJson), task)) throw new StorageFailure('INVALID_DATA')
  } catch {
    throw new StorageFailure('INVALID_DATA')
  }

  return { payloadVersion: CURRENT_PAYLOAD_VERSION, payloadJson, task }
}

/** Valida uma coleção inteira para escrita, recusando identificadores repetidos. */
export function encodeTaskPayloads(values: readonly unknown[]): EncodedTaskPayload[] {
  const encoded = values.map(encodeTaskPayload)
  if (new Set(encoded.map((item) => item.task.id)).size !== encoded.length) {
    throw new StorageFailure('INVALID_DATA')
  }
  return encoded
}
