// Um job nativo global para diálogo/leitura/exportação de backup e o contrato de diálogo do main.
// Concorrência (inclusive a mesma sessão) recebe BUSY; confirmações de importação NÃO seguram esta
// trava (são enfileiradas no coordenador existente). Nenhuma fila adicional é criada.
import type { DocumentTicket } from '../ipc/document-sessions.js'

export interface BackupDialogFilter {
  name: string
  extensions: readonly string[]
}

export interface BackupDialogRequest {
  kind: 'open' | 'save'
  title: string
  defaultPath?: string
  filters: readonly BackupDialogFilter[]
  /** Não adicionar a "Recentes" do Windows (aceito pelo save nativo). */
  dontAddToRecent?: boolean
}

export interface BackupDialogAnswer {
  canceled: boolean
  filePaths: string[]
}

/** Porta de diálogo vinculada ao ticket: a composição resolve a janela autorizada. */
export interface BackupDialogBroker {
  show(ticket: DocumentTicket, request: BackupDialogRequest): Promise<BackupDialogAnswer>
}

export class BackupJobGate {
  #active = false

  get active(): boolean {
    return this.#active
  }

  tryAcquire(): boolean {
    if (this.#active) return false
    this.#active = true
    return true
  }

  release(): void {
    this.#active = false
  }
}

export function canceledAnswer(): BackupDialogAnswer {
  return { canceled: true, filePaths: [] }
}
