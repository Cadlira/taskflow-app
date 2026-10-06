# Prompt de continuidade — TFA-008

Copie o bloco abaixo como pedido para o modelo que continuará o trabalho. Este arquivo registra implementação parcial e pendências; não é o relatório final de verificação nem aprovação para archive.

```text
$openspec-apply-change TFA-008 — migrar-lembretes-e-ciclo-de-vida-desktop

Continue o apply já autorizado, sem reiniciar nem sobrescrever o trabalho existente. Trabalhe somente em C:\QSI\Workspaces\taskflow-app. A extensão C:\QSI\Workspaces\taskflow-extension é estritamente somente leitura, inclusive Git/testes/builds. Leia AGENTS.md, docs/roadmap.md, a skill apply e todos os contextFiles retornados pela CLI. Artefatos desta Change foram aprovados explicitamente na conversa em 2026-10-06; o pedido de apply foi explícito. Não pedir novamente autorização dentro desse escopo. Preservar árvore e alterações preexistentes.

Esta sessão foi interrompida a pedido do usuário ao chegar perto de 10% restantes do limite para trocar de modelo. Não houve archive, alteração de README, commit, push, PR, merge, instalação Setup ou publicação. Nenhuma próxima Change foi iniciada. Não realizar essas ações automaticamente. Depois de completar apply, usar openspec-verify-change e gerar verification.md na Change; relatório precisa de aprovação humana explícita antes de archive.

Estado confirmado:
- Branch codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop; base c7dcf845ba82a74e7027e764626decf6e0bfd82c (TFA-007). Raiz e Git próprios do App, remote Cadlira/taskflow-app.
- OpenSpec 1.14.0, schema spec-driven. Execute status e instructions apply --json nesta raiz. Nenhum store separado foi selecionado. Não inicializar outro OpenSpec.
- Roadmap IN_PROGRESS/APPLY, início 2026-10-06, conclusão vazia.
- 16/60 checkboxes concluídas: 1.1, 1.2, 1.4, 1.5; 2.1–2.6; 3.1–3.6. As demais têm implementação em graus variados e ficaram desmarcadas por falta da verificação inteira exigida. Não confundir quantidade de código com task concluída. Antes de marcar cada checkbox, confira descrição/linha e depois rerode instructions apply para confirmar progresso.
- SQL2, codec4, backup versões1–4 e dependências fixadas foram conservados. Não alterar runtime, schema, formatos ou budgets para facilitar os gates. TypeScript estrito. Sem subagentes: não houve autorização para delegação.

Toolchain: os executáveis globais são inadequados. Use os runtimes já existentes, sem instalar dependências:
  $env:TEMP\tfa002-node-extract\node-v24.21.0-win-x64\node.exe
  $env:TEMP\tfa002-npm-cli\node_modules\npm\bin\npm-cli.js
O npm.cmd distribuído em npm/bin não funciona sozinho nessa extração. Foi criado wrapper local ignorado em .tmp\tfa008-toolchain\npm.cmd, chamando aqueles caminhos exatos. Confira o wrapper e use:
  $env:PATH = "$PWD\.tmp\tfa008-toolchain;$env:TEMP\tfa002-node-extract\node-v24.21.0-win-x64;$env:PATH"
  & "$env:TEMP\tfa002-node-extract\node-v24.21.0-win-x64\node.exe" "$env:TEMP\tfa002-npm-cli\node_modules\npm\bin\npm-cli.js" run validate
Executar npm CLI sem esse wrapper no PATH faz subprocessos escolherem npm11.19.0 e devEngines recusa. Wrapper não é dependência nova. Confirmar cwd/destino antes de escrever; arquivos existentes usam CRLF, normalizar ao buscar trechos multilinha. Preferir apply_patch. rg primeiro para buscas. Evitar saídas gigantes/truncadas.

Implementação atual (inspecione o diff e novos arquivos):
1. Domínio:
   src/domain/reminder-draft.ts: OFFSET/AT, presets0/15/60/1440, máximo10, IDs gerados pelo dono com três tentativas, erros por item, due/duplicidade/representabilidade/recorrência, intenção omitida versus [] versus null, precisão ISO e marker de item intacto.
   task-draft.ts integra create/edit; task-reminders.ts classifica futuro/elegível/expirado/inaplicável com graça inclusiva300000ms. Settlement de mutação é separado de recuperação e não faz replay pela graça.
2. Storage/agenda:
   processReminderOccurrence relê a tupla na unidade; só revisão global muda, edit/content/updatedAt ficam. Coordinator.runReminder afterReleased síncrono acontece após unidade/onCompleted e antes da próxima unidade, sem SQL reentrante. Falha pós-COMMIT não transforma commit em rollback nem causa retry.
   src/application/reminders: heap removível e tags únicos, projeção sem títulos/Tasks, charge64MiB, páginas128, journal/epoch/reset, três reinícios BUSY, fallback60s, delay2147483647, uma agenda/unidade em voo; até16 reservas antes do claim e deadline10s. Runtime main dirty IDs confirmados, reset em recuperação/backup inclusive no-op/empty, cancelamento do owner interno.
3. Contratos/preload:
   create v4/update v5 (TaskUpdateResult separado), status4/check3/state3/move2/backup1. Cinco wrappers desktopv1, total26, payloads exatos/códigos finitos/tag64hex/eventos1KiB/inscrição até8 documentos. Controle e produto usam DocumentSessions separados.
   DesktopClient instala listener antes do handshake, sequências deduplicadas e buffers finitos. Main DesktopIpcService conserva última ativação fria até inscrição e envia surface-active antes de locate; teste específico passou.
   Preload fences productEpoch antes/depois de IPC; hide/suspend dispensa stateClient, resume recria. Store tasks/BackupManager fences de sessão e transientes; todos os handlers de lixeira e undo agora verificam epoch. Filtros/draft/base preservados; confirmação/undo/preview não ressuscitam com resposta tardia.
4. Main/nativo:
   src/main/desktop/lifecycle.ts: hide/abrir/suspend/resume/quit/rendererGone. index.ts compõe Tray/icon/menu, powerMonitor e Windows query-session-end/session-end, readmissão e lock antes do coordinator. Falha inicial de tray mantém janela visível.
   native-identity.ts prod/dev/test AUMID/CLSID isolados, caminhos canônicos/profile instalado, ownership/metadata/futuro/COM estrangeiro/reparse guards. Windows-registry.ts usa somente PowerShell System32 preexistente, scripts fixos, WindowsHidden/shellfalse, UTF8 fatal/8KiB/deadline5s, diagnóstico sem conteúdo cru. Não executado contra registro real nesta sessão.
   startup.ts fonte única Run próprio/getLoginItemSettings/path/args/name; OFF por ausência, disabled externally respeitado; gate/readback/revalidação antes de setter, falha parcial sem compensação/replay. index reconsulta foco/60s enquanto admitido, argumento --taskflow-login hidden com tray fallback. Nenhuma configuração SQL/JSON/backup nova.
   activation.ts aceita shapes fechados de callback e relay; SHA25664 da tupla canônica; coalescimento2s/um pending; rota COM transitória10s não abre storage sem ownership. Notification bootstrap sem show, notifier com título/prazo atuais/ícone/tag sem handler click paralelo. Dev/test FAKE; prod depende identidade/suporte antes de claims elegíveis.
   build/installer.nsh metadata própria v1; cleanup próprio guardado, upgrade preserva. package.json inclui ícone runtime existente em resources/taskflow.ico. verify-package agora exige esse arquivo e hash idêntico ao build/icons/taskflow.ico, além da allowlist anterior.
5. Vue/documentos:
   TaskForm rows OFFSET/AT/presets/unidades/erros/remoção/foco; preserva AT intacto e usa confirmação de fuso existente. Offset vazio não vira0 silenciosamente. DesktopSettings área secundária com estado/opt-in/Sair e eventos. TaskManager consulta localizada fora dos filtros, prazo atual e Voltar com foco, sem trocar draft.
   docs/desktop-reminders-and-lifecycle.md novo; architecture D6 e parity-matrix atualizados com composição e evidência nativa pendente. Roadmap registra autorização/progresso/continuuidade. README intacto. Revisar textos históricos de outros documentos e comentários D8 que ainda descrevam estado anterior como corrente.

Evidências obtidas em 2026-10-06:
- npm run validate completo PASS: lint, typecheck contracts/main/preload/renderer/tests, 71 arquivos de testes, 906 aprovados +11 ignorados (917 total), build main/preload/renderer. Log .tmp/tfa008-validate-final.log. Verificar motivo dos11 skips e conservar distinção. Após esse gate houve ajuste pequeno no harness: catálogo permitido removeu 'reminder' da blacklist porque resolveReminderActivation é wrapper aprovado; comentário antigo D8 atualizado. Rodar verificação proporcional desse último ajuste.
- Testes direcionados recentes main/ipc-desktop +renderer/tasks-store:29 PASS, inclusive cold intent antes de subscribe, ack/snapshot velho após hide/resume e confirmação de lixeira não ressuscitada. Outros testes novos: domínio, índice, SQLite/processor/runtime/volume/crash, native fakes, lifecycle fakes, contratos/preload. Não comprovam Windows instalado.
- OpenSpec estrito PASS: Change; --all12/12; --archived7/7. Informativos sobre requirements longos não são falhas.
- package:win PASS, electron-builder26.17.0/Electron44.5.1 x64/NSIS sem publicação. Build/extraResources/compilação NSIS aprovados. Não foi executado Setup. Log .tmp/tfa008-package.log.
- verify:package PASS depois de adicionar verificação exata do ícone. Log .tmp/tfa008-verify-package.log. Hash Setup49b47dc77b58fe04bbd97e3f64fe385893e9936610e287aabb5fc2b9e3ffef25; exeaff7277bdd0777b42fa989cb3655eed3332f807c7c9145b34f27ab218aefee16; ASARdca9d76710de835bce84ceb194a8fe438d0f04b2a75c3b16ca8334f3127a9d27. Pacote gerado ANTES dos últimos ajustes de UI/harness/testes; regenerar antes de smoke/evidência final, registrar novos hashes.
- Volume real SQLite, fixtures UUID/10OFFSET: 10000tarefas/100000reminders, charge57.600.000B. Execução concorrente anterior: rebuild2687,4ms, SQLp9565,10ms, RSS274.370.560B. Logs têm medições mais recentes; conferir budgets D11. Isso não é M12 completo nem orçamento D10 de UI. SQLite3.53.4/DELETE/synchronous3/foreignkeys1/busytimeout100, i5-13420H.
- smoke:packaged NÃO executado nesta sessão. Harness catálogo26 foi atualizado, mas NÃO ampliado com todos os cenários TFA008 da11.2. Não marcar11.2/11.5 completas. Benchmark Electron/CPU60s/burst/heartbeat/fallback/latência e campanha nativa pendentes.

Próximos passos concretos:
1. Conferir git status/diff, artifacts e tasks. Revisar integração contra D1–D11/M01–M12, conservando bugs como pendências até corrigir/verificar; não aceitar exceções/budgets novos sem revisão material autorizada.
2. Rever fences restantes: operações que aguardam startAction/refresh/resolução; nenhuma resposta/catch/finally antiga deve alterar UI ou liberar submitting de sessão nova. locateReminder ainda merece teste de transport rejection, BUSY/reset e três tentativas com revisão diferente. A ordem ordinal deve coincidir com SQL/snapshot assembler; teste não pode selecionar alvo errado.
3. Rever vida da Tray: há teste fake de setTray(false), mas main só consulta isDestroyed inicialmente. Detecção de falha conhecida posterior/fechar sem trap pode precisar integração real. Ampliar fake/integration conforme task6.4.
4. Revisar NSIS/ownership: guard de família metadata/CLSID/alvo do atalho e cleanup, template de uninstaller não pode apagar COM/atalho estrangeiro; metadata StartMenuLink e campos futuros merecem testes próprios. Não tomar compile como prova de uninstall/upgrade.
5. Acrescentar testes Vue de intenção/precisãoAT/fuso alterado/presets/unidades/errors/teclado/limite10 (controles implementados, mas cobertura nova de formulário ainda pequena). DesktopSettings toggle/readback/falha e localização sem substituir draft/filtros/foco precisam testes específicos. Zoom200/DPI/contraste/leitor de tela precisam roteiro/evidência adequados, sem declarar prova humana inexistente.
6. Completar matriz de mutações/races em SQLite real, inclusive backup APPLIED/UNCHANGED/empty, séries/DONE/SKIP/END/undo/lixeira versus claim; ampliar harness empacotado26, duas superfícies/clock/hide/recovery/crash conforme11.2. Não é permitido acrescentar hooks ao preload normal.
7. Rodar gates finais, package:win --publish never, verify:package e smoke:packaged completo com perfil fictício. Script smoke copia pacote e usa ACE restrita previamente aprovada somente na cópia de teste; leia script/autorizações e não relaxe segurança/gates. Não usar --ci-runner para esconder D10 na máquina de referência; --skip-bench não equivale a gate completo. Não instalar dependências.
8. Preparar/medir M12 inteiro preservando limites/CPU60s/heap/RSS/latência/heartbeat. Não usar estes testes Node como substituto de Electron/instalado.
9. Campanha instalada M09/M10: foi enviada pergunta assíncrona sobre conta/ambiente/autorização, sem resposta na sessão. Não presumir autorização para executar Setup em máquina corporativa, logoff/conta padrão/segunda conta ou mudanças de registro reais. A autorização de apply permite código, mocks, build e preparação; a campanha requer ambiente pertinente. Continuar todo trabalho independente, verificar se chegou resposta antes de repetir pergunta. Pendência de autorização não é falha de aprovação automática (não houve rejeição auto-review).
10. Quando realmente encerrar apply, ler/anunciar openspec-verify-change, escrever verification.md na própria Change com aderência aos dez deltas e D1–D11/M01–M12, gates/hashes/pendências e distinguir fake/build de instalado. Atualizar roadmap para revisão cabível, entregar relatório e aguardar aprovação antes de archive/README/commit/push/PR/merge. Se provas bloqueantes faltarem, não marcar concluído nem prometer paridade.

O objetivo continua sendo apenas TFA-008 integralmente, sem antecipar captura/atalhos/IA/distribuição ou alterar a origem. Comunique progresso em português, com evidência e pendências exatas. Se o usuário também pedir pausa em10% neste novo modelo, consultar limites pelo get_usage_limits, não supor quota pelo contexto. Preserve este prompt como registro histórico e crie atualização específica se a implementação avançar.
```

---

## Atualização da retomada — 2026-10-06 (continuação após troca de modelo)

O bloco acima permanece como registro histórico. Esta seção registra o avanço da retomada
na mesma branch e diretório, sem archive/README/commit/push/PR/merge/Setup/publicação e
sem iniciar a próxima Change.

**Progresso:** 16/60 → **27/60 tasks** (`openspec instructions apply`). Marcadas após
verificação nesta sessão: **1.3; 5.1–5.5; 8.1; 8.3; 8.4; 10.1; 10.2**.

**Ajustes de implementação/verificação desta sessão:**

- Retirada completa da guarda provisória D8: removidos `ADVANCED_TASK_RESTRICTED` do
  outcome, do contrato de erros, do mapeamento IPC e do renderer; mensagens/comentários
  antigos atualizados (`task-commands.ts`, `task-labels.ts`, `TaskManager.vue`) e testes
  legados substituídos por cenários da integração corrente.
- `locateReminder` ganhou fence de transporte (rejeição vira mensagem segura) e retomada
  de BUSY com snapshot; testes novos cobrem BUSY→sucesso, revisão divergente convergindo,
  três tentativas sem alvo errado, rejeição de transporte, resposta tardia após suspensão
  e `NOT_AVAILABLE`.
- Testes novos do formulário: presets/unidades, antecedência vazia ≠ 0, AT intacto versus
  normalizado, erro por item, limite 10, foco ao adicionar/remover e revisão de fuso em
  AT editado.
- Teste novo de DesktopSettings (textos, opt-in/readback, falha sem valor falso,
  UNAVAILABLE, eventos de suspensão/atualização/localização e Sair).
- Consulta temporária no TaskManager testada com filtro ativo, rascunho aberto, foco no
  heading, status atual, zero mutação e Voltar.
- Bandeja: falha conhecida posterior passa a ser reconferida no fechamento e em
  `window-all-closed` (`tray.isDestroyed()`); teste de lifecycle para janela oculta
  recuperada e saída única.
- Instalador NSIS ganhou teste estático de ownership (guardas de AUMID/InstalledExecutable/
  CLSID/StartMenuLink, CLSID/COM/Run/StartupApproved só removidos sob conferência, sem
  HKLM).
- M12: medição movida para `npm run test:volume` (config dedicada, `validate` executa as
  duas etapas) porque rodar dentro da suíte paralela produzia p95 falso acima do
  orçamento (177,6 ms) contra 6,5–12,3 ms com carga estável. Limites do teste inalterados.
- Documentação revisada: `desktop-task-management.md`, `task-form-and-cards.md` e o novo
  guia marcam a guarda D8 como histórica e registram os números/gates atuais.

**Evidência desta sessão:** `npm run validate` PASS — lint, cinco typechecks, 71 arquivos
(921 aprovados + 11 ignorados) + `test:volume` (2 aprovados), build main/preload/renderer.
Logs: `.tmp/tfa008-validate-resume3.log` (e `-resume2/1`). OpenSpec estrito da Change
validou após a marcação; `instructions apply` confirma 27/60.

**Pendências exatas:** 4.1–4.6 (matriz completa de mutações/races em SQLite real,
incluindo backup APPLIED/UNCHANGED/empty versus claim), 6.1–6.6 (Tray/menu reais,
reconciliação de Abrir, falha pós-crash), 7.1–7.5 e 9.1–9.5 (campanha instalada M09/M10,
inclusive toast/COM/Unicode/upgrade/uninstall/segunda conta), 8.2/8.5 (relay COM/owner
morto/timeout e documentação da rota), 10.3–10.5 (suspensão de clientes pré-hide, foco/
zoom200/DPI/leitor de tela e guia), 11.1–11.6 (composição final, harness empacotado
ampliado, campanha instalada, M12 completo, gates finais e `verification.md` com
aprovação humana antes de archive). A campanha instalada continua dependente da
autorização/ambiente já perguntados; sem resposta, não presumir.

---

## Atualização da retomada — 2026-10-06 (bloco 4.x: mutações × agenda)

**Progresso:** 27/60 → **33/60 tasks**. Marcadas: **4.1, 4.2, 4.3, 4.4, 4.5, 4.6**.

- Novo `tests/main/reminder-mutation-matrix.test.ts` (6 testes, SQLite real, serviço de
  produção com agenda/relógio falsos): mutação efetiva liquida vencidos ≤ now sem aviso e
  mantém futuros agendados; reset de backup (APPLIED/UNCHANGED) não repete claim consumido;
  coleção vazia não deixa timer curto e nova tarefa reencurta a agenda; lixeira interrompe
  o claim e restore liquida o vencido sem aviso retroativo; DONE gera cópia sem marker e o
  undo posterior não reaviva o gatilho vencido; create/update de coleção com IDs do main
  e erro por item (`UNKNOWN_ID`) sem escrita parcial.
- `resetForBackup(runtime)` extraído em `src/main/reminders/runtime.ts` e usado pelo
  `index.ts`; o teste cobre reset→epoch→recomposição sem replay. É o único teste do glue
  do main nesse ponto; a barreira de backup em si já era testada.
- Documentação 4.6: `task-trash-and-undo.md`, `local-persistence-and-state-ipc.md` e
  `backup-migration-guide.md` receberam notas "Atualizado na TFA-008" (scheduler composto,
  guarda retirada, sem replay pela graça, evidência instalada pendente).

**Evidência:** `npm run validate` PASS — lint, cinco typechecks, 72 arquivos
(927 aprovados + 11 ignorados) + `test:volume` (2), build. Log
`.tmp/tfa008-validate-resume5.log`. OpenSpec estrito da Change válido; `instructions apply`
confirma 33/60.

**Pendências restantes (27):** 6.1–6.6 (Tray/menu reais, Abrir/reconciliação, falha
pós-crash), 7.1–7.5, 8.2, 8.5, 9.1–9.5 (campanha instalada M09/M10 e rota COM), 10.3–10.5
(suspensão pré-hide, foco/zoom/a11y, guia), 11.1–11.6 (composição final, harness empacotado
ampliado, campanha instalada, M12 completo, gates finais e `verification.md`).

---

## Atualização da retomada — 2026-10-06 (bloco 6.x: bandeja/lifecycle)

**Progresso:** 33/60 → **38/60 tasks**. Marcadas: **6.1, 6.2, 6.3, 6.4, 6.6**. Ficou fora
deliberadamente a **6.5** (suspend/quit com unidade/backup ativo e eventos Windows
query-session-end/session-end exigem cenário que não foi montado; wiring do main segue
por inspeção).

- Novo `src/main/desktop/tray.ts` + `tests/main/desktop-tray.test.ts`: composição fake da
  bandeja (tooltip com nome próprio, menu Abrir/Sair, clique abre, destroy repassado,
  ícone vazio/falha parcial sem objeto retido). `index.ts` passou a usar
  `createDesktopTray` e `lifecycle.setTray(tray?.valid() === true)`.
- `DesktopLifecycle.windowAllClosed(trayValid)`: com tray válido não sai e não recria
  janela; sem tray encerra uma única vez. Teste novo em `desktop-lifecycle.test.ts`.
- Teste novo no TaskManager: suspensão limpa confirmação transiente e preserva filtros e
  rascunho do formulário aberto.
- Roteiro humano pendente de close/minimize/quit/energia registrado no guia
  `desktop-reminders-and-lifecycle.md` (marcado como não executado).

**Evidência:** `npm run validate` PASS — lint, cinco typechecks, 73 arquivos
(931 aprovados + 11 ignorados) + `test:volume` (2), build. Log
`.tmp/tfa008-validate-resume6.log`. OpenSpec estrito válido; `instructions apply` confirma
38/60.

**Pendências restantes (22):** 6.5; 7.1–7.5 e 9.1–9.5 (campanha instalada M09/M10);
8.2/8.5 (relay COM); 10.3–10.5 (suspensão cliente/pré-hide, a11y/zoom200/DPI/leitor de
tela, guia); 11.1–11.6 (composição final, harness empacotado ampliado, campanha
instalada, M12 completo, gates finais e `verification.md`).

---

## Atualização da retomada — 2026-10-06 (bloco 10.x + harness/lifecycle no pacote)

**Progresso:** 38/60 → **41/60 tasks**. Marcadas: **10.3, 10.4, 10.5**. 11.2 e 11.5
avançaram parcialmente, mas **não foram marcadas**.

- 10.3: teste na bridge real do preload — suspensão dispensa clientes sem IPC (comando
  rejeita, estado degrada para STORAGE_UNAVAILABLE), retomada recria sessão e suspensão
  repetida não acumula.
- 10.4: semântica/rotulagem verificada nos componentes (seção/`aria-labelledby`, label do
  toggle) e novo roteiro humano `docs/a11y-manual-checklist-tfa008.md` (zoom200/DPI/
  contraste/leitor de tela) marcado como não executado.
- 10.5: guia ganhou o limite explícito de toast bloqueado/suprimido pelo Windows;
  README permanece intocado para o archive autorizado.
- Harness/pacote: novo cenário `lifecycle` (close real oculta com tray, Sair encerra,
  variante sem tray), smoke S8 reescrito para o contrato D6 (WM_CLOSE não encerra com
  tray), cenários `tasks`/`trash`/`backup` encerram por Sair, scheduler suspenso apenas
  em cenários explícitos de harness (probes determinísticas) e migração SQL1→2 voltou a
  medir a revisão exata sob kill.
- Gates: `package:win --publish never` + `verify:package` OK no pacote atual; hashes
  exe `df42b181…`, ASAR `5ec3cdfd…`, Setup `15bb71f5…`. `smoke:packaged --skip-bench`
  **PASS** completo (39 registros PASS, incl. lifecycle, migração, bridge 27, crash/drain,
  tasks/recurrence/trash/backup/a11y e negativas). Bench de limites e UI 1.000/10.000 (D10)
  foram pulados explicitamente; smoke integral e D10 continuam pendentes (não usar
  `--ci-runner` nem declarar gate completo).

**Evidência:** `npm run validate` PASS — 73 arquivos (932 aprovados + 11 ignorados) +
`test:volume` 2, lint/typechecks/build. Logs: `.tmp/tfa008-validate-resume8.log`,
`.tmp/tfa008-package-resume5.log`, `.tmp/tfa008-verify-package-resume5.log`,
`.tmp/tfa008-smoke-resume7.log`. OpenSpec estrito da Change/--all/--archived ok.

**Pendências restantes (19):** 6.5; 7.1–7.5 e 9.1–9.5 (campanha instalada M09/M10);
8.2/8.5 (relay COM); 11.1 (composição final com os cenários do harness); 11.2 (races/
clock/recovery/backup no-op no harness); 11.3 (campanha instalada); 11.4 (M12 completo);
11.5 (smoke integral com bench/D10 e revisão dos hashes); 11.6 (`verification.md` e
aprovação humana).

---

## Atualização da retomada — 2026-10-06 (11.2: lembretes no harness empacotado)

**Progresso:** 41/60 → **42/60 tasks**. Marcada: **11.2**.

- Novos cenários `reminders-seed` (grava ocorrências com scheduler suspenso) e `reminders`
  (processo novo com agenda ativa/notifier fake): graça inclusiva, expirada consumida,
  terminal liquidada, futura intocada, não replay/overwrite, corrida claim×mutação com CAS
  (mutação aplicada, base antiga recusada, claim posterior, título conservado) e duas
  superfícies convergindo — 11 verificações no pacote.
- `backup` já cobria UNCHANGED/no-op (`confirmUnchanged`, revisão estável, evento de época);
  `crash`/`lifecycle`/IPC26/duas superfícies completam a lista da task.
- O scheduler só fica ativo no harness para `reminders`; os demais cenários o suspendem
  (documentado no código/guias).
- Smoke `--skip-bench` PASS de ponta a ponta; pacote/verify novos: exe `3878da05…`,
  ASAR `173bfec3…`, Setup `55f4f27f…`.

**Evidência:** `npm run validate` PASS (73 arquivos, 932+11; `test:volume` 2; M12 1.000
77,7 ms/p95 13,8 ms; 10.000 588,6 ms/p95 7,2 ms), OpenSpec estrito Change/--all/--archived.
Logs: `.tmp/tfa008-validate-resume9.log`, `.tmp/tfa008-package-resume6.log`,
`.tmp/tfa008-verify-package-resume6.log`, `.tmp/tfa008-smoke-resume8.log` (REMINDERS ok:true).

**Pendências (18):** 6.5; 7.1–7.5 e 9.1–9.5 (campanha instalada M09/M10); 8.2/8.5 (relay
COM); 11.1 (composição final); 11.3 (campanha instalada); 11.4 (bench/M12 completo, inclui
D10 herdado); 11.5 (smoke integral com bench e revisão de hashes); 11.6 (`verification.md`
+ aprovação humana).

---

## Atualização final da retomada — 2026-10-06 (6.5/8.5 + verificação)

**Progresso:** 42/60 → **44/60 tasks**. Marcadas: **6.5, 8.5**. Apply encerrado no ponto de
verificação; roadmap em **IN_REVIEW/REVIEW** aguardando aprovação humana.

- 6.5: teste novo de quit/dispose cancelando claim interno ainda não iniciado sem consumir a
  ocorrência (matriz SQLite real), somado a drain de unidade ativa, backup com sessão
  encerrada, quit idempotente e ausência de hide ao sair. Eventos Windows
  (`before-quit`/`query-session-end`/`session-end`) são wiring do main coberto pela semântica
  testada de `lifecycle.quit`.
- 8.5: seção “Ativação, relay e retorno à lista” no guia, com cold start, relay transitório
  10 s sem storage, coalescimento 2 s, referência obsoleta, destaque/“Voltar à lista” e a
  distinção explícita fake/harness × callback COM instalado.
- 11.1 mantida pendente por decisão adversarial (the-fool não está disponível neste ambiente):
  a composição e a retirada de D8/guards estão feitas, mas a verificação M08 inclui prova COM
  instalada, dependente de 8.2/11.3.
- **[verification.md](verification.md)** criado na Change: placar (44/60), aderência aos dez
  deltas, D1–D11/M01–M12, evidências/hashes, WARNINGs e pendências exatas; recomendação de
  não arquivar antes das decisões humanas.

**Evidência:** `npm run validate` PASS (`.tmp/tfa008-validate-resume10.log`: 73 arquivos,
933+11, `test:volume` 2; M12 1.000 92,5 ms/p95 13,7 ms; 10.000 787,9 ms/p95 13,6 ms);
OpenSpec estrito Change/--all/--archived ok; pacote/smoke já registrados na atualização
anterior. Sem archive/README/commit/push/PR/merge/Setup/publicação.

**Pendências (16), todas registradas no relatório:** 7.1–7.5 e 9.1–9.5 e 11.3 (campanha
instalada M09/M10 — sem resposta sobre autorização/ambiente), 8.2 (relay COM), 11.1
(composição final com M08 COM), 11.4 (M12 completo/bench), 11.5 (smoke integral com D10) e
11.6 (aprovação humana do relatório).

---

## Atualização — 2026-10-06 (campanha instalada local + relatório revisão 2)

**Progresso:** 44/60 → **52/60 tasks**. Marcadas: **7.1, 7.2, 7.3, 7.4, 7.5, 9.1, 9.2, 9.5**.
Decisões humanas aplicadas: campanha **somente pacote local** (Setup/uninstall, sem logoff/
segunda conta); **revisão do orçamento D10 aberta** (`d10-budget-review.md`, sem relaxar
números); relatório revisão 1 aprovado e revisão 2 submetida.

- Campanha local executada em upgrade de instalação existente: upgrade/uninstall/reinstall
  preservam dados; uninstall remove só recursos próprios; reinstall inicia OFF; identidade
  (AUMID/CLSID/atalho/`LocalServer32`) e `reminderCapability NATIVE`; startup ON/OFF com
  readback de Run/StartupApproved, desabilitado externamente respeitado; toast real no
  histórico do Windows com marker exato; relay `-Embedding` sai em ~11 s sem residual.
- **Três defeitos reais corrigidos** (só apareciam instalados; cobertos por regressão):
  1) `toastActivatorClsid` vazio no atalho NSIS era recusado como estrangeiro;
  2) `setLoginItemSettings` no Windows usa `openAtLogin` (`enabled` é macOS-only);
  3) `launchItems` do Electron 44.5.1 não reporta `args` — Run canônico confere nome+args.
- Evidência: `npm run validate` PASS (`.tmp/tfa008-validate-final2.log`: 935 aprovados + 11
  ignorados; `test:volume` 2), OpenSpec estrito Change/--all/--archived; pacote da campanha
  `f60263d5…`/`8609208b…`/`de25937c…` com `verify:package` OK; smoke `--skip-bench` PASS
  (`.tmp/tfa008-smoke-resume8.log`).

**Pendências (8):** 8.2 (corrida de callback COM), 9.3 (login oculto/Unicode instalado), 9.4
(segunda conta/upgrade com Run ativo), 11.1 (composição final com M08 COM), 11.3 (campanha
completa), 11.4/11.5 (bench/M12/D10 — revisão aberta) e 11.6 (confirmação da revisão 2 do
relatório antes de archive/README/commit).

---

## Atualização final — 2026-10-06 (rota de clique instalada, 59/60)

**Progresso:** 54/60 → **59/60**. Marcadas: **8.2, 9.3, 9.4, 11.1, 11.3**. Resta **11.6**
(confirmação do relatório revisão 4).

- **Três correções na rota de clique/ativação**, encontradas só no instalado:
  1) relay `-Embedding` pedia lock sem dados antes do callback → agora só com `additionalData`;
  2) Electron 44.5.1/Windows não chama o handler COM em clique de toast sem ações com o app
     aberto (evento in-process `click`) → a mesma rota única passou a consumi-lo (coalescimento
     2 s; refinamento D8 no design);
  3) liberação pós-`show` removia o listener de click → disposer conserva até `close`/`click`.
- **Prova instalada:** clique em “CLIQUE DEFINITIVO - TFA-008” → consulta aberta com heading
  focado e “Voltar à lista” (CDP).
- **Escopo de usuário único aceito pelo usuário**: segunda conta e Unicode por conta waivados;
  logoff real não executado (handler provado por `WM_QUERYENDSESSION`).
- Pacote final `e55ac378…`/`331b4ed3…`/`d2e5193c…` (verify:package OK); validate 935+11;
  smoke integral final em `.tmp/tfa008-smoke-full3.log`.

**Única pendência:** 11.6 — aprovação do relatório revisão 4 para archive/README/commit/push/PR
conforme AGENTS.md, sem iniciar a próxima Change.

**Fechamento:** smoke integral do build final PASS (`.tmp/tfa008-smoke-full3.log`, 40 PASS; D10 dentro dos limites revisados). 59/60; aguarda 11.6.
