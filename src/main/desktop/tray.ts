// Composição da bandeja isolada do Electron: permite testar tooltip/menu Abrir/Sair,
// ativação por clique e o caminho de falha sem abrir processo gráfico.
export interface TrayHandle {
  setToolTip(text: string): void
  setContextMenu(menu: unknown): void
  on(event: 'click', callback: () => void): void
  isDestroyed(): boolean
  destroy(): void
}
export interface TrayMenuItem { label: string; click: () => void }
export interface DesktopTrayPorts<TImage extends { isEmpty(): boolean }> {
  name: string
  icon(): TImage
  create(image: TImage): TrayHandle
  menu(items: ReadonlyArray<TrayMenuItem>): unknown
  open(): void
  quickAdd?(): void
  capture?(): void
  quit(): void
}
export interface DesktopTray {
  valid(): boolean
  destroy(): void
}

/** Falha conhecida de criação/ícone devolve undefined e não retém objeto parcial. */
export function createDesktopTray<TImage extends { isEmpty(): boolean }>(
  ports: DesktopTrayPorts<TImage>,
): DesktopTray | undefined {
  let tray: TrayHandle | undefined
  try {
    const image = ports.icon()
    if (image.isEmpty()) throw new Error('tray-icon-unavailable')
    tray = ports.create(image)
    tray.setToolTip(ports.name)
    tray.setContextMenu(ports.menu([
      { label: 'Abrir', click: ports.open },
      ...(ports.quickAdd ? [{ label: 'Adicionar tarefa', click: ports.quickAdd }] : []),
      ...(ports.capture ? [{ label: 'Capturar texto copiado', click: ports.capture }] : []),
      { label: 'Sair', click: ports.quit },
    ]))
    tray.on('click', ports.open)
    const created = tray
    return { valid: () => !created.isDestroyed(), destroy: () => { created.destroy() } }
  } catch {
    try { tray?.destroy() } catch { /* Recuperação da janela fica com o chamador. */ }
    return undefined
  }
}
