// Alocação de identidades do domínio: até três tentativas por identidade, sem reutilizar
// valores reservados pelo plano. O gerador concreto vem do proprietário (main); o domínio
// apenas confere colisões e desiste com segurança quando o gerador não produz valor livre.
import type { IdGenerator } from './task.js'

export const IDENTITY_ATTEMPTS = 3

export interface IdentityAllocator {
  /** Tenta até três identidades livres e registra a escolhida; falha segura sem commit. */
  allocate(generateId: IdGenerator): string | undefined
  /** Reserva uma identidade conhecida (colidiria com o plano atual). */
  reserve(id: string): void
  /** Todas as identidades já reservadas ou alocadas por este plano. */
  taken(id: string): boolean
}

/** Alocador puro por plano; `isTaken` consulta as coleções atuais (tarefas/lixeira/série). */
export function createIdentityAllocator(isTaken: (id: string) => boolean): IdentityAllocator {
  const reserved = new Set<string>()

  return {
    allocate(generateId: IdGenerator): string | undefined {
      for (let attempt = 0; attempt < IDENTITY_ATTEMPTS; attempt += 1) {
        const id = generateId()
        if (typeof id !== 'string' || id.length === 0) continue
        if (reserved.has(id) || isTaken(id)) continue
        reserved.add(id)
        return id
      }
      return undefined
    },
    reserve(id: string): void {
      reserved.add(id)
    },
    taken(id: string): boolean {
      return reserved.has(id) || isTaken(id)
    },
  }
}
