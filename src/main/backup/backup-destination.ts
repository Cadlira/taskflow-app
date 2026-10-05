// Proteção do destino de exportação: resolução real do pai, detecção de symlink/reparse conhecido,
// recusa de destinos internos do aplicativo (userData/sessionData/runtime, inclusive banco e
// journal) e de dispositivos/nomes reservados do Windows. Fingerprint observável do destino antes
// da substituição, sem prometer CAS contra terceiros.
import { lstat, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export interface DestinationFingerprint {
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  dev: number
  ino: number
}

export type DestinationCheck =
  | { ok: true; destination: string; existed: boolean }
  | { ok: false; code: 'DESTINATION_NOT_ALLOWED' | 'FILE_WRITE_FAILED' }

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

function normalizeCase(value: string): string {
  return value.toLowerCase()
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function samePath(left: string, right: string): boolean {
  return normalizeCase(path.resolve(left)) === normalizeCase(path.resolve(right))
}

/** Segmento final em dispositivo/nome reservado do Windows (CON, NUL, COM1, `\\.\` etc.). */
export function isReservedWindowsTarget(destination: string): boolean {
  if (destination.startsWith('\\\\') || destination.startsWith('\\/')) return true
  const base = path.basename(destination)
  return WINDOWS_RESERVED.test(base) || base === ''
}

export interface ProtectDestinationOptions {
  /** Raízes internas do aplicativo (userData, sessionData, app path) já resolvidas. */
  protectedRoots: readonly string[]
}

/**
 * Resolve o destino real e recusa: destino interno do app, dispositivo/nome reservado, pai
 * symlink/reparse conhecido e destino que seja symlink. Caminho irmão com prefixo parecido não é
 * confundido com filho (comparação por segmentos, não `startsWith`).
 */
export async function checkBackupDestination(
  destination: string,
  options: ProtectDestinationOptions,
): Promise<DestinationCheck> {
  if (typeof destination !== 'string' || destination.trim() === '') {
    return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }
  }
  const resolved = path.resolve(destination)
  if (isReservedWindowsTarget(resolved)) return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }

  // Raízes internas são resolvidas antes: destino lexicalmente dentro delas é recusado mesmo que o
  // subdiretório ainda não exista.
  const realRoots: string[] = []
  for (const root of options.protectedRoots) {
    let realRoot: string
    try {
      realRoot = await realpath(root)
    } catch {
      realRoot = path.resolve(root)
    }
    realRoots.push(realRoot)
    if (samePath(realRoot, resolved) || isInside(realRoot, resolved)) {
      return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }
    }
  }

  const parent = path.dirname(resolved)
  let realParent: string
  try {
    realParent = await realpath(parent)
  } catch {
    return { ok: false, code: 'FILE_WRITE_FAILED' }
  }
  if (!samePath(realParent, parent)) return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }

  let existed = false
  try {
    const info = await lstat(resolved)
    if (info.isSymbolicLink()) return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }
    existed = true
  } catch {
    existed = false
  }

  for (const realRoot of realRoots) {
    if (isInside(realRoot, realParent)) return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }
  }

  return { ok: true, destination: resolved, existed }
}

/** Fingerprint observável; `undefined` quando o destino não existe. */
export async function captureDestinationFingerprint(destination: string): Promise<DestinationFingerprint | undefined> {
  try {
    const info = await stat(destination)
    if (!info.isFile()) return undefined
    return {
      size: info.size,
      mtimeMs: info.mtimeMs,
      ctimeMs: info.ctimeMs,
      birthtimeMs: info.birthtimeMs,
      dev: info.dev,
      ino: info.ino,
    }
  } catch {
    return undefined
  }
}

export function sameDestinationFingerprint(
  left: DestinationFingerprint | undefined,
  right: DestinationFingerprint | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return (
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.birthtimeMs === right.birthtimeMs &&
    left.dev === right.dev &&
    left.ino === right.ino
  )
}
