// Cópia revisada (recorte) de taskflow-extension@a763e7a src/domain/task-subtasks.ts.
// Somente o tipo, o limite e o progresso derivado usados para leitura; rascunhos, marcação e
// reordenação ficam na TFA-005.

/** Limite de subtarefas por tarefa. */
export const MAX_SUBTASKS = 20

/** Passo marcável de uma tarefa; não tem status, prazo, lembretes nem subtarefas próprias. */
export interface Subtask {
  /** Identificador gerado localmente, único dentro da tarefa. */
  id: string
  title: string
  done: boolean
}

export interface SubtaskProgress {
  done: number
  total: number
}

/** Progresso derivado; nunca é persistido nem altera marcações. */
export function countSubtaskProgress(subtasks: readonly Subtask[]): SubtaskProgress {
  return {
    done: subtasks.filter((subtask) => subtask.done).length,
    total: subtasks.length,
  }
}
