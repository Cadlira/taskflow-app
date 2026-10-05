// Proteção do destino de exportação: resolução real do pai, detecção de symlink/reparse conhecido,
// recusa de destinos internos do aplicativo (userData/sessionData/runtime, inclusive banco e
// journal) e de dispositivos/nomes reservados do Windows. Fingerprint observável do destino antes
// da substituição, sem prometer CAS contra terceiros.
//
// Canonicalização tolera aliases legítimos de caminho (nomes curtos 8.3 do Windows, caixa): o que
// reprova é ser, de fato, um reparse/symlink conhecido ou cair dentro de raiz protegida — a
// comparação é sempre entre formas canônicas, nunca entre a forma digitada e a real.
import type { Stats } from 'node:fs'
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

export interface ProtectDestinationFs {
  realpath: (value: string) => Promise<string>
  lstat: (value: string) => Promise<Stats>
}

export interface ProtectDestinationOptions {
  /** Raízes internas do aplicativo (userData, sessionData, app path) já resolvidas. */
  protectedRoots: readonly string[]
  /** Injeção usada somente por testes para simular aliases 8.3/short names; produção usa `node:fs`. */
  fs?: ProtectDestinationFs
}

/**
 * Forma canônica de um caminho que pode não existir: canonicaliza o ancestral existente mais
 * profundo e reanexa os segmentos ausentes. Devolve `undefined` quando nem a raiz resolve.
 */
async function canonicalPathOf(
  resolved: string,
  realpathFn: (value: string) => Promise<string>,
): Promise<string | undefined> {
  let current = resolved
  const suffix: string[] = []
  for (;;) {
    try {
      const real = await realpathFn(current)
      return suffix.length === 0 ? real : path.join(real, ...suffix.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return undefined
      suffix.push(path.basename(current))
      current = parent
    }
  }
}

/**
 * Percorre os ancestrais existentes do destino procurando reparse/symlink conhecido (junctions do
 * Windows aparecem como symlink em `lstat`). `undefined` significa indeterminado (erro que não é
 * ENOENT) — o chamador recusa conservadoramente.
 */
async function hasReparseAncestor(
  resolved: string,
  lstatFn: (value: string) => Promise<Stats>,
): Promise<boolean | undefined> {
  let current = path.dirname(resolved)
  for (;;) {
    let info: Stats
    try {
      info = await lstatFn(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const parent = path.dirname(current)
        if (parent === current) return false
        current = parent
        continue
      }
      return undefined
    }
    if (info.isSymbolicLink()) return true
    const parent = path.dirname(current)
    if (parent === current) return false
    current = parent
  }
}

/**
 * Resolve o destino real e recusa: destino interno do app, dispositivo/nome reservado, ancestral
 * symlink/reparse conhecido e destino que seja symlink. Aliases legítimos de caminho (8.3/caixa)
 * são canonicalizados e aceitos; caminho irmão com prefixo parecido não é confundido com filho
 * (comparação por segmentos, não `startsWith`).
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

  const fsOps: ProtectDestinationFs = options.fs ?? { realpath, lstat }
  const canonical = await canonicalPathOf(resolved, fsOps.realpath)
  if (canonical === undefined) return { ok: false, code: 'FILE_WRITE_FAILED' }

  // Raízes internas: comparação canônica, cobrindo destino ainda inexistente dentro delas.
  for (const root of options.protectedRoots) {
    let realRoot: string
    try {
      realRoot = await fsOps.realpath(root)
    } catch {
      realRoot = path.resolve(root)
    }
    if (samePath(realRoot, canonical) || isInside(realRoot, canonical)) {
      return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }
    }
  }

  // Reparse/symlink em qualquer ancestral existente (indeterminado também recusa).
  const reparse = await hasReparseAncestor(resolved, fsOps.lstat)
  if (reparse !== false) return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }

  let existed = false
  try {
    const info = await fsOps.lstat(resolved)
    if (info.isSymbolicLink()) return { ok: false, code: 'DESTINATION_NOT_ALLOWED' }
    existed = true
  } catch {
    existed = false
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
