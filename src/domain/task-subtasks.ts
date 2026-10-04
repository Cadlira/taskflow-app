// Cópia revisada (recorte) de taskflow-extension@a763e7a src/domain/task-subtasks.ts.
// Somente o tipo e o limite usados pelo codec; rascunhos, marcação e progresso ficam na TFA-005.

/** Limite de subtarefas por tarefa. */
export const MAX_SUBTASKS = 20

/** Passo marcável de uma tarefa; não tem status, prazo, lembretes nem subtarefas próprias. */
export interface Subtask {
  /** Identificador gerado localmente, único dentro da tarefa. */
  id: string
  title: string
  done: boolean
}
