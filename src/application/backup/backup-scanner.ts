// Scanner léxico executado ANTES de `JSON.parse`: conta chaves, containers e valores escalares,
// limita profundidade e nós e reserva o charge de parse. Um arquivo válido mas adversarial recebe
// `RESOURCE_LIMIT` antes de materializar objetos; sintaxe/escape inválidos permanecem
// `INVALID_JSON`. Não valida o domínio nem substitui o JSON.parse.
export const BACKUP_SCAN_LIMITS = {
  /** Profundidade máxima de aninhamento de containers. */
  maxDepth: 64,
  /** Máximo de nós contados: cada chave, container e valor escalar conta um. */
  maxNodes: 262_144,
} as const

export type BackupScanResult =
  | { ok: true; nodes: number }
  | { ok: false; reason: 'RESOURCE_LIMIT' | 'INVALID_JSON' }

interface ScanState {
  position: number
  nodes: number
  depth: number
  exceeded: boolean
}

const HEX = /^[0-9a-fA-F]$/
const DIGIT = /^[0-9]$/

function skipWhitespace(text: string, state: ScanState): void {
  while (state.position < text.length) {
    const code = text.charCodeAt(state.position)
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) state.position += 1
    else break
  }
}

function countNode(state: ScanState, limits: { maxDepth: number; maxNodes: number }): boolean {
  state.nodes += 1
  if (state.nodes > limits.maxNodes) state.exceeded = true
  return !state.exceeded
}

/** Consome uma string JSON; devolve `false` em aspas não fechadas, escape ou controle inválidos. */
function scanString(text: string, state: ScanState): boolean {
  if (text.charCodeAt(state.position) !== 0x22) return false
  state.position += 1

  while (state.position < text.length) {
    const code = text.charCodeAt(state.position)
    if (code === 0x22) {
      state.position += 1
      return true
    }
    if (code === 0x5c) {
      state.position += 1
      if (state.position >= text.length) return false
      const escape = text[state.position]
      if (escape === 'u') {
        for (let offset = 1; offset <= 4; offset += 1) {
          const hex = text[state.position + offset]
          if (hex === undefined || !HEX.test(hex)) return false
        }
        state.position += 5
        continue
      }
      if (escape !== undefined && '"\\/bfnrt'.includes(escape)) {
        state.position += 1
        continue
      }
      return false
    }
    if (code < 0x20) return false
    state.position += 1
  }

  return false
}

/** Consome um número JSON estrito; gramática suficiente para avançar e contar corretamente. */
function scanNumber(text: string, state: ScanState): boolean {
  const start = state.position
  if (text[state.position] === '-') state.position += 1
  if (state.position >= text.length || !DIGIT.test(text[state.position] as string)) return false
  if (text[state.position] === '0') {
    state.position += 1
  } else {
    while (state.position < text.length && DIGIT.test(text[state.position] as string)) state.position += 1
  }
  if (text[state.position] === '.') {
    state.position += 1
    if (state.position >= text.length || !DIGIT.test(text[state.position] as string)) return false
    while (state.position < text.length && DIGIT.test(text[state.position] as string)) state.position += 1
  }
  if (text[state.position] === 'e' || text[state.position] === 'E') {
    state.position += 1
    if (text[state.position] === '+' || text[state.position] === '-') state.position += 1
    if (state.position >= text.length || !DIGIT.test(text[state.position] as string)) return false
    while (state.position < text.length && DIGIT.test(text[state.position] as string)) state.position += 1
  }
  return state.position > start
}

function scanLiteral(text: string, state: ScanState, literal: string): boolean {
  if (!text.startsWith(literal, state.position)) return false
  state.position += literal.length
  return true
}

function scanValue(text: string, state: ScanState, limits: { maxDepth: number; maxNodes: number }): boolean {
  if (!countNode(state, limits)) return false
  skipWhitespace(text, state)

  const char = text[state.position]
  if (char === '{') {
    state.position += 1
    state.depth += 1
    if (state.depth > limits.maxDepth) {
      state.exceeded = true
      return false
    }
    skipWhitespace(text, state)
    if (text[state.position] === '}') {
      state.position += 1
      state.depth -= 1
      return true
    }
    for (;;) {
      skipWhitespace(text, state)
      if (!countNode(state, limits)) return false
      if (!scanString(text, state)) return false
      skipWhitespace(text, state)
      if (text[state.position] !== ':') return false
      state.position += 1
      if (!scanValue(text, state, limits)) return false
      skipWhitespace(text, state)
      const separator = text[state.position]
      if (separator === ',') {
        state.position += 1
        continue
      }
      if (separator === '}') {
        state.position += 1
        state.depth -= 1
        return true
      }
      return false
    }
  }

  if (char === '[') {
    state.position += 1
    state.depth += 1
    if (state.depth > limits.maxDepth) {
      state.exceeded = true
      return false
    }
    skipWhitespace(text, state)
    if (text[state.position] === ']') {
      state.position += 1
      state.depth -= 1
      return true
    }
    for (;;) {
      if (!scanValue(text, state, limits)) return false
      skipWhitespace(text, state)
      const separator = text[state.position]
      if (separator === ',') {
        state.position += 1
        continue
      }
      if (separator === ']') {
        state.position += 1
        state.depth -= 1
        return true
      }
      return false
    }
  }

  if (char === '"') return scanString(text, state)
  if (char === 't') return scanLiteral(text, state, 'true')
  if (char === 'f') return scanLiteral(text, state, 'false')
  if (char === 'n') return scanLiteral(text, state, 'null')
  return scanNumber(text, state)
}

/**
 * Varre o texto completo e devolve a contagem de nós ou a recusa. `RESOURCE_LIMIT` tem precedência
 * sobre a sintaxe (o excesso é a causa segura), sem parse nem clone.
 */
export function scanBackupJson(
  text: string,
  limits: { maxDepth: number; maxNodes: number } = BACKUP_SCAN_LIMITS,
): BackupScanResult {
  const state: ScanState = { position: 0, nodes: 0, depth: 0, exceeded: false }
  skipWhitespace(text, state)
  if (state.position >= text.length) return { ok: false, reason: 'INVALID_JSON' }

  if (!scanValue(text, state, limits)) {
    return state.exceeded ? { ok: false, reason: 'RESOURCE_LIMIT' } : { ok: false, reason: 'INVALID_JSON' }
  }
  skipWhitespace(text, state)
  if (state.position !== text.length) return { ok: false, reason: 'INVALID_JSON' }

  return { ok: true, nodes: state.nodes }
}
