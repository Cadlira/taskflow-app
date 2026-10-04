import type { Task } from '../../domain/task.js'
import type { Revision } from './revisions.js'
import type { StorageFailureReason } from './task-storage-error.js'

export type StoredCollection = 'tasks' | 'trash'

/** Linha persistida: metadados de armazenamento separados do conteúdo do domínio. */
export interface StoredRow {
  id: string
  payloadVersion: number
  payloadJson: string
  contentRevision: Revision
  /** Presente somente na lixeira. */
  deletedAt?: string
}

/**
 * Porta mínima que a transação entrega à unidade: linhas das duas coleções e a revisão da
 * unidade. Não expõe conexão, SQL, caminho nem a fila; é válida só durante a unidade.
 */
export interface StorageRowPort {
  /** Revisão global confirmada no início da unidade. */
  readonly baseRevision: Revision
  readRow(collection: StoredCollection, id: string): StoredRow | undefined
  listRows(collection: StoredCollection): StoredRow[]
  /** Linhas em ordem estável de identificador, a partir de `afterId` (exclusivo). */
  iterateRows(collection: StoredCollection, afterId: string | undefined): Iterable<StoredRow>
  writeRow(collection: StoredCollection, row: StoredRow): void
  deleteRow(collection: StoredCollection, id: string): void
  /**
   * Revisão desta unidade (`baseRevision + 1`), alocada no máximo uma vez. Chamar marca a
   * unidade como alteração observável; sem chamada, a unidade é no-op e nada é confirmado.
   */
  allocateRevision(): Revision
}

export interface StoredTask {
  task: Task
  contentRevision: Revision
}

export interface StoredTrashItem {
  task: Task
  deletedAt: string
  /** Revisão que o conteúdo tinha ao ser excluído; não autoriza edição após restauração. */
  contentRevision: Revision
}

export type SaveOutcome = 'CREATED' | 'UPDATED' | 'UNCHANGED'

export type ReplaceAllResult =
  | { status: 'REPLACED'; created: number; updated: number; removed: number }
  | { status: 'UNCHANGED' }
  | { status: 'CONFLICT'; currentRevision: Revision }

export type TrashRestoreResult =
  | { status: 'RESTORED'; task: Task; contentRevision: Revision }
  | { status: 'NOT_IN_TRASH' }
  | { status: 'ID_EXISTS' }

export type ConditionalUpdateResult =
  | { status: 'UPDATED'; task: Task; contentRevision: Revision }
  | { status: 'UNCHANGED'; task: Task; contentRevision: Revision }
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT'; currentRevision: Revision }

export interface RevertPreconditions {
  /** Tarefa a reverter e a revisão de conteúdo produzida pela ação que será desfeita. */
  target: { id: string; expectedContentRevision: Revision }
  /** Tarefa criada pela mesma ação, removida junto com a reversão. */
  generated?: { id: string; expectedContentRevision: Revision }
}

export type ConditionalRevertResult =
  | { status: 'REVERTED'; task: Task; contentRevision: Revision }
  | { status: 'REMOVED' }
  | { status: 'CHANGED'; currentRevision: Revision }
  | { status: 'GENERATED_CHANGED' }

/** Ocorrência de lembrete a registrar de forma condicional nos dados mais recentes. */
export interface ReminderOccurrenceClaim {
  taskId: string
  reminderId: string
  /** Instante efetivo (ISO 8601 UTC) que deve ser registrado como processado. */
  processedFor: string
}

/**
 * Leitura validada das duas coleções. Nunca expurga a lixeira, regrava payload histórico ou
 * altera revisões.
 */
export interface TaskStorageReader {
  readonly baseRevision: Revision
  listTasks(): StoredTask[]
  getTask(id: string): StoredTask | undefined
  listTrash(): StoredTrashItem[]
  getTrashItem(id: string): StoredTrashItem | undefined
  /** Percorre em ordem estável de identificador, sem materializar a coleção inteira. */
  iterateTasks(afterId: string | undefined): Iterable<StoredTask>
  iterateTrash(afterId: string | undefined): Iterable<StoredTrashItem>
}

/**
 * Primitives internas da unidade de trabalho. Todas leem, decidem, validam e gravam sobre o
 * estado atual da mesma transação. Callbacks são síncronos e sem efeitos externos. Nenhuma
 * destas operações atravessa o IPC.
 */
export interface TaskStorageUnit extends TaskStorageReader {
  /** Cria ou substitui a tarefa com o mesmo `id`; sem alteração lógica é no-op. */
  saveTask(task: Task): SaveOutcome
  /** Cria ou substitui várias tarefas no mesmo commit; qualquer falha reverte todas. */
  saveTasks(tasks: readonly Task[]): SaveOutcome[]
  /** Substitui a coleção de tarefas inteira se a revisão global ainda for a esperada. */
  replaceAllTasks(tasks: readonly Task[], expectedGlobalRevision: Revision): ReplaceAllResult
  deleteTask(id: string): boolean
  /** Move a tarefa para a lixeira no mesmo commit; `undefined` sem gravar se ela não existe. */
  moveToTrash(id: string, deletedAt: string): Task | undefined
  /** Devolve o item à coleção aplicando `prepare`; recusa `ID_EXISTS` sem alterar nada. */
  restoreFromTrash(id: string, prepare: (task: Task) => Task): TrashRestoreResult
  deleteFromTrash(id: string): boolean
  emptyTrash(): number
  /** Expurgo explícito: remove os itens que `shouldPurge` indicar. Leituras nunca expurgam. */
  purgeTrash(shouldPurge: (item: StoredTrashItem) => boolean): number
  /**
   * Edição condicional: aplica `change` sobre a tarefa atual somente se a revisão de conteúdo
   * ainda for a esperada. Marcadores `processedFor` de ocorrências inalteradas são conservados.
   */
  updateTaskConditionally(
    id: string,
    expectedContentRevision: Revision,
    change: (task: Task) => Task | undefined,
  ): ConditionalUpdateResult
  /** Reversão condicional de uma ação, verificando as revisões de conteúdo na mesma unidade. */
  revertConditionally(preconditions: RevertPreconditions, restore: (current: Task) => Task): ConditionalRevertResult
  /**
   * Registra `processedFor` somente se a mesma ocorrência ainda estiver válida e pendente.
   * Altera a revisão global, conservando `updatedAt` e a revisão de conteúdo.
   */
  claimReminderOccurrence(claim: ReminderOccurrenceClaim): boolean
}

/** Resultado de uma unidade coordenada, discriminado por dados. */
export type UnitResult<T> =
  | {
      ok: true
      value: T
      /** `true` quando houve commit de alteração observável. */
      committed: boolean
      /** Revisão global confirmada após a unidade. */
      revision: Revision
    }
  | { ok: false; reason: StorageFailureReason }
