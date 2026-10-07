# Mapeamento de requisitos e cenários — TFA-009

**Dispensa final em2026-10-07:** o usuário pediu pular as validações pendentes e fechar a Change. A cobertura parcial abaixo permanece não verificada, dispensada para fechamento conforme closure-waivers.md; não repetir testes como requisito nem transformar dispensa em PASS.

Data: 2026-10-07. Anexo de `verification.md`. São 29 requisitos (19 ADDED, 10 MODIFIED) e 75 cenários, sem REMOVED/RENAMED. Mapeamento de código/testes é evidência de cobertura identificada; não equivale a 75 execuções nativas nem substitui os limites expressos no relatório. As sete entradas parciais abaixo destacam verificações humanas/SO indisponíveis. Toda a família de atalhos possui evidência automática de portas falsas e permanece sem campanha nativa completa.

## desktop-application-lifecycle

Implementação: `src/main/desktop/lifecycle.ts:1`, `src/main/index.ts:1`, `src/main/desktop/tray.ts:1`.

Testes: `tests/main/two-surface-lifecycle.test.ts`, `tests/main/desktop-lifecycle.test.ts`, `tests/main/desktop-tray.test.ts`.

Lifecycle/energia simulados, kill real e close/quit empacotados; logoff e energia do SO exigem campanha instalada.

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| MODIFIED: Fechar suspende sessão e preserva memória transitória (5) | Close e reabertura (9); IPC oculto e cliente atrasado (14); Minimizar saída e crash (19); Duas janelas independentes (23) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| MODIFIED: Bandeja mantém caminho explícito de recuperação (28) | Abrir e recriar superfície (32); Falha de tray (37); Rotas de abertura e captura (42) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| MODIFIED: Saída explícita encerra processo com segurança (47) | Sair repetido durante commit ou arquivo (51); Logoff e interrupção forçada (56) — parcial; Preferência e clipboard durante saída (60) | Parcial: evidência humana/SO indicada em verification.md. |
| MODIFIED: Suspensão interrompe tentativas e retomada reconcilia (65) | Suspensão perto do gatilho (69) — parcial; Retomada com janela oculta (74) — parcial | Parcial: evidência humana/SO indicada em verification.md. |

## desktop-clipboard-capture

Implementação: `src/domain/clipboard-capture.ts:1`, `src/application/capture/clipboard-reader.ts:1`, `src/application/capture/memory-capture-inbox.ts:1`, `src/application/capture/capture-review.ts:1`, `src/main/ipc/entries.ts:1`.

Testes: `tests/domain/clipboard-capture.test.ts`, `tests/application/clipboard-reader.test.ts`, `tests/application/memory-capture-inbox.test.ts`, `tests/application/capture-review.test.ts`, `tests/renderer/task-form.test.ts`, `tests/renderer/task-manager.test.ts`.

Portas falsas com barreiras, envelopes/TTL/gerações e clipboard fictício interno no pacote; clipboard nativo completo pendente.

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| ADDED: Captura lê somente texto por gesto explícito (9) | Abertura e captura separadas (13); Destinos definidos (17) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: URL isolada exige nome manual e origem íntegra (21) | URL válida e limite de abertura salva (25); Candidato recusado (30) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Texto conserva mapeamento e informa cortes (34) | Fronteiras e Unicode (38); Texto e associação opcional (43) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Falhas de leitura conservam estado e limitam concorrência (48) | Vazio e falha (52); Timeout não cancela API física (56); Suspensão e encerramento durante await (61) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Pendência é única por destino e não apaga draft ativo (65) | Dirty por qualquer campo (69); Ocupação termina e chega substituta (73) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Entrega confirmada protege TTL e corridas (78) | Prazo e apresentação perdida (82); Ack e eventos fora de ordem (87); Documento desaparece (92) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Conteúdo permanece privado e transporte é limitado (97) | Remetente inválido e envelope grande (101) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |

## desktop-foundation

Implementação: `src/main/index.ts:1`, `src/preload/bridge.ts:1`, `src/preload/quick-add.ts:1`, `src/contracts/surface-catalog.ts:1`.

Testes: `tests/preload/bridge-catalog.test.ts`, `tests/preload/quick-add-bridge.test.ts`, `tests/main/ipc-entries.test.ts`.

Pacote entries confirmou 35/14, sandbox real, globais Node ausentes e recusas de operações manager por Quick Add.

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| MODIFIED: Renderer sem autoridade irrestrita (5) | Conteúdo tenta usar APIs privilegiadas (9); Catálogo limitado no pacote (13); Abrir origem não amplia navegação (18); Facade restrita do Quick Add (23) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |

## desktop-global-shortcuts

Implementação: `src/domain/global-shortcuts.ts:1`, `src/application/shortcuts/shortcut-controller.ts:1`, `src/main/shortcuts/file-preferences.ts:1`, `src/main/shortcuts/electron-registry.ts:1`.

Testes: `tests/domain/global-shortcuts.test.ts`, `tests/application/shortcut-controller.test.ts`, `tests/main/shortcut-preferences.test.ts`, `tests/main/shortcut-preferences-kill.test.ts`, `tests/renderer/shortcut-settings.test.ts`.

Registry falso, faults e kill de arquivos reais cobrem protocolo; ação global completa pelo SO não comprovada (Q13 bloqueado por foco).

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| ADDED: Ações globais são finitas e independentes (9) | Primeira execução e conflito (13) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Combinações personalizadas têm gramática fechada (18) | Customização e validação (22) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Preferência e registro observado são distintos (27) | Registro false ou throw (31) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Preferências duráveis são versionadas e condicionais (36) | Dois clientes e versão incompatível (40); Restart e retenção (44) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Rebind e falha não fingem transação nativa (49) | Registro novo falha (53); Arquivo ou compensação falha (57); Desativar e perder resposta (62) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Gates e saída respeitam sessão e perfil (66) | Hidden versus suspend (70); Editor e encerramento (74) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Evidência global exige Windows real (78) | Campanha isolada (82) — parcial | Parcial: evidência humana/SO indicada em verification.md. |

## desktop-quick-add

Implementação: `src/renderer/src/components/capture/QuickAdd.vue:1`, `src/renderer/src/components/tasks/TaskForm.vue:1`, `src/renderer/src/stores/tasks.ts:1`.

Testes: `tests/renderer/quick-add.test.ts`, `tests/renderer/task-form.test.ts`, `tests/renderer/tasks-store.test.ts`.

Componentes, confirmação por sessão e entries empacotado; 360px/zoom200 medido. Teclado/DPI/leitor de tela humano pendentes.

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| ADDED: Entrada rápida preserva rascunho e contexto (9) | Primeira abertura e reabertura (13); Gerenciamento em edição (18) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Form compacto permite revisão dos campos básicos (23) | Captura longa revisável (27); Origem isolada (32) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Confirmação de criação pertence à própria sessão (37) | Sucesso e falha (41); Commit com resposta perdida (46) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Teclado e memória transitória são explícitos (51) | Digitação e campos multilinha (55) — parcial; Fechar e retomar (59) | Parcial: evidência humana/SO indicada em verification.md. |

## desktop-state-ipc

Implementação: `src/contracts/capture-shortcuts.ts:1`, `src/contracts/desktop.ts:1`, `src/application/reminders/desktop-client.ts:1`, `src/main/ipc/entries.ts:1`, `src/main/ipc/desktop.ts:1`, `src/main/ipc/document-sessions.ts:1`.

Testes: `tests/contracts/capture-shortcuts.test.ts`, `tests/contracts/reminder-desktop-contract.test.ts`, `tests/main/ipc-entries.test.ts`, `tests/main/ipc-desktop.test.ts`, `tests/main/document-sessions.test.ts`.

Schemas/envelopes/roles/eventos/listeners e guards antes dos efeitos; regressões bridge/backup/crash/drain no smoke.

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| MODIFIED: Catálogo de estado mínimo e versionado (5) | Operações disponíveis (9); Request malformado (14); Catálogo Quick Add (19) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| MODIFIED: Transporte limitado preserva dados legítimos (24) | Unicode e registro grande (28); Pressão de recursos (32); Estado transitório limitado (36); Formulário com caracteres escapados (40); Ack curto e base grande (45); Prévia e arquivo20MiB (50); Draft de captura com descrição e escaping (55) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| MODIFIED: Eventos desktop controlam somente superfície e intenção limitada (60) | Shapes e versões desktop (64); Controle sobre documento oculto (69); Eventos de duas superfícies (74) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| MODIFIED: Reabertura cria sessão sem resposta herdada (79) | Cliente ignora suspensão e resposta chega tarde (83); Reabertura com captura apresentada (88) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |
| ADDED: Novas operações aceitam somente intenções finitas por role (95) | Payload fechado de captura e navegação interna (99); Setter e reconhecimento sem autoridade adicional (104); Orçamento completo e saídas verificadas (109) | Cobertura automática identificada na família; limites nativos/humanos gerais continuam aplicáveis. |

## desktop-task-management

Implementação: `src/renderer/src/components/tasks/TaskManager.vue:1`, `src/renderer/src/components/tasks/TaskForm.vue:1`, `src/renderer/src/components/capture/CapturePanel.vue:1`.

Testes: `tests/renderer/task-manager.test.ts`, `tests/renderer/task-form.test.ts`, `tests/renderer/quick-add.test.ts`.

Regressões de tarefas/recorrência/lixeira/backup/lembretes/a11y e Q14 empacotadas; escala/leitor de tela/ativação instalada não reatestados.

| Requisito delta / linha | Cenários mapeados / linha | Limite de verificação |
| --- | --- | --- |
| MODIFIED: Identidade e limites temporários são visíveis com clareza (5) | Recorrência subtarefas e lembretes existentes (9); Recursos posteriores ausentes (15); Dimensões contraste e texto (20) — parcial; Política da exclusão é comunicada (24); Backup explica substituição e exclusões (29); Formulário de lembretes e foco de ativação (34) — parcial; Captura preserva área e criação alheia (39) | Parcial: evidência humana/SO indicada em verification.md. |
