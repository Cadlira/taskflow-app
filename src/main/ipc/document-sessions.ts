import { STATE_LIMITS } from '../../contracts/state.js'
import { isAuthorizedDocumentUrl } from '../protocol.js'

/** Subconjunto de `WebFrameMain` usado pela autorização. */
export interface FrameLike {
  readonly url: string
  readonly origin: string
  readonly detached?: boolean
  isDestroyed(): boolean
  send(channel: string, ...args: unknown[]): void
}

/** Subconjunto de `WebContents` usado pela autorização. */
export interface ContentsLike {
  readonly id: number
  readonly mainFrame: FrameLike
  isDestroyed(): boolean
}

export interface InvocationLike {
  readonly sender: ContentsLike
  readonly senderFrame: FrameLike | null
}

/**
 * Autorização capturada na admissão. A geração é criada pelo main e nunca vem do renderer;
 * ela é reconferida antes da execução enfileirada e antes de qualquer envio.
 */
export interface DocumentTicket {
  readonly contentsId: number
  readonly generation: number
  /** Chave opaca da sessão do documento (dona de fila, cursor e inscrição). */
  readonly key: string
}

interface RegisteredDocument {
  contents: ContentsLike
  generation: number
  /** Main frame visto na primeira autorização desta geração. */
  frame: FrameLike | undefined
}

/**
 * Registro das superfícies autorizadas e da geração do documento de cada uma. Navegação,
 * reload (inclusive da mesma URL), crash e fechamento trocam a geração: tudo o que pertencia
 * ao documento anterior deixa de ser entregue.
 */
export class DocumentSessions {
  readonly #expectedOrigin: string
  readonly #limit: number
  readonly #documents = new Map<number, RegisteredDocument>()
  readonly #listeners = new Set<(key: string) => void>()
  #nextGeneration = 1

  constructor(expectedOrigin: string, limit: number = STATE_LIMITS.documents) {
    this.#expectedOrigin = expectedOrigin
    this.#limit = limit
  }

  get size(): number {
    return this.#documents.size
  }

  /** Registra uma superfície criada pelo main. Devolve `false` acima do limite de documentos. */
  register(contents: ContentsLike): boolean {
    if (this.#documents.has(contents.id)) return true
    if (this.#documents.size >= this.#limit) return false
    this.#documents.set(contents.id, { contents, generation: this.#allocateGeneration(), frame: undefined })
    return true
  }

  /** Fechamento/destruição: a superfície deixa de existir para o IPC. */
  unregister(contentsId: number): void {
    const document = this.#documents.get(contentsId)
    if (document === undefined) return
    this.#documents.delete(contentsId)
    this.#emit(document, contentsId)
  }

  /** Início ou conclusão de navegação, reload ou crash: o documento anterior perde a sessão. */
  invalidate(contentsId: number): void {
    const document = this.#documents.get(contentsId)
    if (document === undefined) return
    const previous = { ...document }
    document.generation = this.#allocateGeneration()
    document.frame = undefined
    this.#emit(previous, contentsId)
  }

  /** Notifica a chave da sessão que deixou de ser corrente, para limpeza de cursor/inscrição/fila. */
  onInvalidated(listener: (key: string) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Admissão: `null` para qualquer remetente que não seja o documento corrente autorizado. */
  authorize(event: InvocationLike): DocumentTicket | null {
    try {
      const document = this.#documents.get(event.sender.id)
      if (document === undefined || document.contents !== event.sender) return null
      const frame = event.senderFrame
      if (frame === null || !this.#isLiveAuthorizedMainFrame(document, frame)) return null

      if (document.frame === undefined) {
        document.frame = frame
      } else if (document.frame !== frame) {
        // O documento mudou sem que um evento de navegação tenha chegado: falha fechada.
        this.invalidate(event.sender.id)
        document.frame = frame
      }

      return this.#ticket(event.sender.id, document.generation)
    } catch {
      return null
    }
  }

  /** Revalidação antes da execução enfileirada e antes de enviar resposta ou evento. */
  isCurrent(ticket: DocumentTicket): boolean {
    return this.currentFrame(ticket) !== null
  }

  /** Frame de destino para um envio, somente se a sessão do ticket ainda for a corrente. */
  currentFrame(ticket: DocumentTicket): FrameLike | null {
    try {
      const document = this.#documents.get(ticket.contentsId)
      if (document === undefined || document.generation !== ticket.generation || document.frame === undefined) {
        return null
      }
      return this.#isLiveAuthorizedMainFrame(document, document.frame) ? document.frame : null
    } catch {
      return null
    }
  }

  #isLiveAuthorizedMainFrame(document: RegisteredDocument, frame: FrameLike): boolean {
    if (document.contents.isDestroyed()) return false
    if (frame !== document.contents.mainFrame) return false
    if (frame.isDestroyed() || frame.detached === true) return false
    // Origem real do frame e URL real: origem herdada (about:blank/blob) não basta.
    return frame.origin === this.#expectedOrigin && isAuthorizedDocumentUrl(frame.url, this.#expectedOrigin)
  }

  #allocateGeneration(): number {
    const generation = this.#nextGeneration
    this.#nextGeneration += 1
    return generation
  }

  #ticket(contentsId: number, generation: number): DocumentTicket {
    return { contentsId, generation, key: `${contentsId}:${generation}` }
  }

  #emit(document: RegisteredDocument, contentsId: number): void {
    const { key } = this.#ticket(contentsId, document.generation)
    for (const listener of [...this.#listeners]) {
      try {
        listener(key)
      } catch {
        // A limpeza de um consumidor não impede a dos demais.
      }
    }
  }
}
