# IPC de captura e atalhos — TFA-009

Main atribui MANAGER/QUICK_ADD ao documento e escolhe preload constante (`index.cjs`/`quick-add.cjs`), ambos CJS autocontidos sandboxed. Mesma entrada HTML local; URL/query/argv/request não seleciona role. Facades congeladas manager35/Quick Add14, com enforcement main mesmo em request forjado. Sem invoke/send/canal/path/URL/accelerator/clipboard bruto livres.

Quick Add14: getStateSnapshot, subscribeState, unsubscribeState, createTask, clearUndoOffer, getDesktopStatus, requestQuit, subscribeDesktopEvents, openTaskManager, captureClipboard, getPendingCapture, acknowledgeCapture, discardCapture, getShortcutSettings. Catálogo compartilhado: `src/contracts/surface-catalog.ts`.

| Novo wrapper | Canal v1 | Campos além de version1 |
| --- | --- | --- |
| openQuickAdd | entry:open-quick-add:v1 | nenhum; manager |
| openTaskManager | entry:open-task-manager:v1 | nenhum |
| captureClipboard | entry:capture-clipboard:v1 | nenhum; própria superfície |
| getPendingCapture | entry:get-pending-capture:v1 | nenhum; não destrutivo |
| acknowledgeCapture | entry:acknowledge-capture:v1 | UUID/sequence/disposition presented ou applied |
| discardCapture | entry:discard-capture:v1 | UUID/sequence |
| getShortcutSettings | entry:get-shortcut-settings:v1 | nenhum |
| setShortcut | entry:set-shortcut:v1 | action/combination ou null/expectedConfigRevision; manager |
| setShortcutEditing | entry:set-shortcut-editing:v1 | editing boolean; manager focado para ativar |

Requests novos<=1KiB; respostas comuns<=8KiB; getPendingCapture<=64KiB, UTF-8 JSON completo com envelope/escaping. UUIDv4 canônico e sequência positiva/revisão decimal até32dígitos. Falha de serialização/budget é RESOURCE_LIMIT sem cortar URL/campo. Schemas e erros finitos em `src/contracts/capture-shortcuts.ts`: extras, versões, protótipos/getters/símbolos e tipos inválidos são recusados antes de efeito.

GetDesktopStatus/status, subscribe/unsubscribe e eventos desktop são v2 por superfície; v1 dessas operações é recusada. Eventos<=1KiB: surface-active, surface-suspended, desktop-status-changed, locate-reminder (manager), capture-available (UUID/captureSequence/replaced), shortcuts-changed (configRevision/statusSequence). Sem draft/descrição/Task/path/raw. Referências coalescem aguardando admissão. Startup/saída/resolução permanecem v1. Tarefas/backup: state3/create4/check3/update5/status4/move2/outros1; limites anteriores64KiB/8KiB/página256KiB preservados. SQL2/codec4/backup não migram.

Guards de documento/sessão/main frame/origem/URL/role/admissão/schema precedem clipboard/inbox/preferências/registro/gravação/janela. Após await, revalidam sessão/saída antes de entregar. Controle oculto não concede produto/conteúdo. Preload invalida época/respostas de produto e recria state client ao retomar; lastConfirmed pertence ao documento. Callback/disposer são locais, nunca invoke; inscrição desktop compartilhada e até8 consumidores locais. Renderer não tem Node/fs/IPC livre.
