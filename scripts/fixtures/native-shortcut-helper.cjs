// Outro aplicativo fictício: combinações dedicadas, sem preload ou dados do produto.
const { app, BrowserWindow, globalShortcut, clipboard } = require('electron')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
app.setPath('userData', join(process.env.TFA_NATIVE_ROOT, 'helper-data'))
const combos = ['Control+Shift+F21', 'Control+Shift+F22', 'Control+Shift+F23']
const copied = 'Captura nativa fictícia TFA009'
let window, originalContent, changedClipboard = false, quitReady = false
function emit(kind, value = {}) { process.stdout.write(`TASKFLOW_NATIVE_HELPER ${JSON.stringify({ kind, ...value })}\n`) }
async function cleanup() {
  for (const combo of ['Control+Shift+F20', ...combos]) if (globalShortcut.isRegistered(combo)) globalShortcut.unregister(combo)
  if (changedClipboard && await clipboard.readText() === copied) await clipboard.write(originalContent)
  changedClipboard = false
}
app.whenReady().then(() => {
  window = new BrowserWindow({ title: 'TFA009 — aplicativo fictício do harness', width: 420, height: 220,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>TFA009 — aplicativo fictício do harness</title><p>Teste isolado de atalhos F20–F23. Nenhum texto será enviado.</p>'))
  const handle = window.getNativeWindowHandle()
  emit('ready', { pid: process.pid, hwnd: (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString(), conflict: globalShortcut.register('Control+Shift+F20', () => {}) })
  let sequence = 0, busy = false
  const timer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      const message = JSON.parse(await readFile(join(process.env.TFA_NATIVE_ROOT, 'helper-command.json'), 'utf8'))
      if (!Number.isSafeInteger(message.sequence) || message.sequence <= sequence || !['release', 'show', 'clipboard', 'probe', 'quit'].includes(message.command)) return
      sequence = message.sequence
      const line = message.command
    if (line === 'release') { globalShortcut.unregister('Control+Shift+F20'); emit('released') }
    if (line === 'show') { window.show(); window.focus(); emit('shown') }
    if (line === 'clipboard') {
      // Snapshot nativo somente em memória; a API v44 restaura os formatos em uma escrita atômica.
      try { originalContent = await clipboard.read(); await clipboard.writeText(copied); changedClipboard = true; emit('clipboard-ready') }
      catch { emit('clipboard-unavailable', { reason: 'NATIVE_CLIPBOARD_UNAVAILABLE' }) }
    }
    if (line === 'probe') {
      const registered = combos.map(combo => globalShortcut.register(combo, () => {}))
      combos.forEach(combo => { if (globalShortcut.isRegistered(combo)) globalShortcut.unregister(combo) })
      emit('probe', { released: registered.every(Boolean) })
    }
      if (line === 'quit') { await cleanup(); quitReady = true; clearInterval(timer); app.quit() }
    } catch { /* Arquivo de controle ainda ausente/parcial; nenhuma ação. */ }
    finally { busy = false }
  }, 50)
})
app.on('before-quit', event => { if (!quitReady) { event.preventDefault(); void cleanup().finally(() => { quitReady = true; app.quit() }) } })
