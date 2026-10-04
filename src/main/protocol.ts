import { realpath, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export interface ParsedAssetRequest {
  assetPath: string
  origin: string
}

export function parseAppAssetRequest(urlText: string, method: string): ParsedAssetRequest | null {
  if (method !== 'GET') return null

  try {
    const rawUrl = /^taskflow:\/\/app(\/[^?#]*)?(?:[?#].*)?$/i.exec(urlText)
    if (!rawUrl) return null
    const rawPath = decodeURIComponent(rawUrl[1] ?? '/')
    if (rawPath.includes('\\') || rawPath.includes('\0') || rawPath.includes(':')) return null
    if (rawPath.split('/').some((segment) => segment === '.' || segment === '..')) return null

    const url = new URL(urlText)
    if (url.protocol !== 'taskflow:' || url.hostname !== 'app' || url.port || url.username || url.password) {
      return null
    }
    if (url.search || url.hash) return null

    const decoded = decodeURIComponent(url.pathname)
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.includes(':')) return null
    const segments = decoded.split('/').filter(Boolean)
    if (segments.some((segment) => segment === '.' || segment === '..')) return null

    const assetPath = segments.length === 0 ? 'index.html' : segments.join('/')
    if (!CONTENT_TYPES[path.posix.extname(assetPath).toLowerCase()]) return null
    return { assetPath, origin: 'taskflow://app' }
  } catch {
    return null
  }
}

export function isTrustedRendererUrl(urlText: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(urlText)
    const origin = `${url.protocol}//${url.host}`
    return origin === expectedOrigin && !url.username && !url.password
  } catch {
    return false
  }
}

/**
 * URL real de um documento autorizado: origem local exata e a rota do shell, sem query nem
 * fragmento. `about:blank`, `blob:` e URLs apenas parecidas não passam.
 */
export function isAuthorizedDocumentUrl(urlText: string, expectedOrigin: string): boolean {
  if (!isTrustedRendererUrl(urlText, expectedOrigin)) return false
  try {
    const url = new URL(urlText)
    return (url.pathname === '/' || url.pathname === '/index.html') && url.search === '' && url.hash === ''
  } catch {
    return false
  }
}

export async function readPackagedAsset(rendererRoot: string, assetPath: string): Promise<Response | null> {
  try {
    const root = await realpath(rendererRoot)
    const candidate = path.resolve(root, ...assetPath.split('/'))
    const relativeCandidate = path.relative(root, candidate)
    if (relativeCandidate === '..' || relativeCandidate.startsWith(`..${path.sep}`) || path.isAbsolute(relativeCandidate)) {
      return null
    }

    const actualPath = await realpath(candidate)
    const relativeActual = path.relative(root, actualPath)
    if (relativeActual === '..' || relativeActual.startsWith(`..${path.sep}`) || path.isAbsolute(relativeActual)) {
      return null
    }

    const fileInfo = await stat(actualPath)
    if (!fileInfo.isFile()) return null

    const contentType = CONTENT_TYPES[path.extname(actualPath).toLowerCase()]
    if (!contentType) return null
    const content = await readFile(actualPath)
    return new Response(content, {
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self'",
          "img-src 'self'",
          "font-src 'self'",
          "connect-src 'none'",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-src 'none'",
          "form-action 'none'",
        ].join('; '),
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    })
  } catch {
    return null
  }
}
