// Adaptador Electron dos diálogos de backup: vinculado à janela autorizada do ticket, com filtro
// JSON, nome padrão, `dontAddToRecent` no save e cancelamento neutro. Não grava arquivo: apenas
// devolve o caminho escolhido. A composição decide a janela a partir do ticket registrado.
import { dialog, type BrowserWindow } from 'electron'
import path from 'node:path'
import type { DocumentTicket } from '../ipc/document-sessions.js'
import type { BackupDialogBroker, BackupDialogRequest } from './backup-job.js'

export interface ElectronBackupDialogOptions {
  /** Resolve a janela autorizada do ticket; `null` recusa sem abrir diálogo. */
  windowFor: (ticket: DocumentTicket) => BrowserWindow | null
  /** Diretório usado quando o nome padrão é relativo (normalmente Documentos). */
  defaultDirectory?: () => string
}

function resolveDefaultPath(request: BackupDialogRequest, options: ElectronBackupDialogOptions): string | undefined {
  if (request.defaultPath === undefined) return undefined
  if (path.isAbsolute(request.defaultPath)) return request.defaultPath
  const directory = options.defaultDirectory?.()
  return directory === undefined ? request.defaultPath : path.join(directory, request.defaultPath)
}

export function createElectronBackupDialogBroker(options: ElectronBackupDialogOptions): BackupDialogBroker {
  return {
    async show(ticket: DocumentTicket, request: BackupDialogRequest) {
      const window = options.windowFor(ticket)
      if (window === null || window.isDestroyed()) return { canceled: true, filePaths: [] }

      const defaultPath = resolveDefaultPath(request, options)
      const filters = request.filters.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] }))

      if (request.kind === 'open') {
        const result = await dialog.showOpenDialog(window, {
          title: request.title,
          filters,
          properties: ['openFile'],
          ...(defaultPath !== undefined && { defaultPath }),
          ...(request.dontAddToRecent !== undefined && { dontAddToRecent: request.dontAddToRecent }),
        })
        return { canceled: result.canceled, filePaths: result.filePaths }
      }

      const result = await dialog.showSaveDialog(window, {
        title: request.title,
        filters,
        ...(defaultPath !== undefined && { defaultPath }),
        ...(request.dontAddToRecent !== undefined && { dontAddToRecent: request.dontAddToRecent }),
      })
      return { canceled: result.canceled, filePaths: result.filePath === undefined ? [] : [result.filePath] }
    },
  }
}
