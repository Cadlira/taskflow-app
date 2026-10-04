// Cópia revisada (recorte) de taskflow-extension@a763e7a src/domain/task-trash.ts.
// Somente o tipo persistido; retenção, limite e ordenação de exibição ficam na TFA-006.
import type { Task } from './task.js'

/** Tarefa excluída guardada na lixeira com o instante da exclusão. */
export interface TrashItem {
  /** Instante ISO 8601 UTC da exclusão. */
  deletedAt: string
  task: Task
}
