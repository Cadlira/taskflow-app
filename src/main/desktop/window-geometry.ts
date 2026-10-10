/**
 * Cálculo puro da geometria inicial da janela principal (TFA-013). Sem dependência de
 * Electron: `createSurface` injeta a `workArea` do display primário e a largura mínima
 * das opções da janela. A regra vale somente na abertura; a sessão viva preserva o que
 * o usuário definir (mover/redimensionar) e a persistência fica fora do escopo (D5).
 */

/** Área útil (`workArea`) de um display — subconjunto estrutural do tipo do Electron. */
export interface WorkArea {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface WindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Limites iniciais do gerenciador: altura útil inteira a partir do topo da área útil,
 * largura de um terço arredondado com piso na largura mínima e teto na própria área
 * útil, ancorada na borda direita (`x = workArea.x + workArea.width - width`).
 */
export function calcularBoundsIniciais(workArea: WorkArea, larguraMinima: number): WindowBounds {
  const width = Math.min(workArea.width, Math.max(larguraMinima, Math.round(workArea.width / 3)))
  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height,
  }
}
