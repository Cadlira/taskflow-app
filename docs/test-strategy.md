# Estratégia de testes e evidências — TaskFlow App

**TFA-001 · estratégia planejada · 2026-10-03**

Este documento define verificações para Changes futuras e registra o que já foi executado na fundação TFA-002 (2026-10-04). A TFA-001 só consolidou documentação e OpenSpec; a origem nunca foi executada. As regras observadas, referências por funcionalidade e destinos estão em [parity-matrix.md](parity-matrix.md). As fronteiras propostas estão em [architecture.md](architecture.md).

## D10 — Níveis de validação e destino

| Nível | Evidência a produzir quando aplicável | Destino previsto |
| --- | --- | --- |
| Unitário portátil | Regras de domínio/aplicação, limites, normalização, consultas, recorrência, subtarefas, trash/undo, codecs/migrações e cancelamento IA. Fakes e dados fictícios. Adaptar teste de fronteiras para proibir Electron/Node no núcleo. | TFA-004 a TFA-010 |
| Interface | Componentes/stores depois da adaptação de adapters; foco/draft/erro/feedback, teclado, contraste, dialogs e operações via bridge fake/contrato. Teste DOM isolado não prova integração de plataforma. | TFA-004 a TFA-010 |
| Adapter e IPC | Contrato de cada adapter; validação de entrada/remetente/frame/origem, isolamento de sessão/token, URLs, schemas, limites, CSP/bridge e erros seguros. Renderer sem acesso livre a Node/filesystem. | TFA-003 e Changes que acrescentem operação |
| Persistência e integração | Falha/interrupção, recovery, schemas, rollback, fila após erro, unidade multi-entidade, revisão/conflito entre janelas e coordenação com backup/recorrência/lembretes/undo. | TFA-003, TFA-005 a TFA-008 |
| IA controlada | Providers com mocks/fakes locais, consentimento e conteúdo exato, redirect/limites/timeout/abort/troca de provider; nenhuma chamada paga nem segredo em log/fixture. | TFA-010 |
| UI integrada em desktop | Jornadas em janelas reais, superfícies, estados de foco, captura/atalhos e navegação entre instâncias; confirma efeitos do shell apenas no binário correspondente. | TFA-002 e TFA-004 a TFA-010 |
| Windows instalado | Conta padrão; install/update/uninstall e persistência; ausência de admin, serviço e Node no destino; ABI, notificação, bandeja, atalhos, suspend/resume/restart, DPI/teclado/offline. Registrar ambiente e artefato. | TFA-002 (prova inicial), TFA-008/009/011/012 (produto completo) |

Build, typecheck ou smoke isolado do renderer não comprovam IPC seguro, instalador per-user, notificações, bandeja ou atalhos no Windows. Evidência de app empacotado deve apontar versão, sistema/arquitetura, conta/permissões e passos observados.

## Inventário de candidatos portáveis da origem

Os arquivos abaixo foram identificados por inspeção em `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. São candidatos a cópia **revisada** para o app quando a Change responsável autorizar. Esta lista não afirma que toda suíte é independente de navegador nem que fixtures antigas cobrem integralmente os contratos novos.

| P | Candidatos de teste/fixture | Revisão ou destino |
| --- | --- | --- |
| P01 gerenciamento | [task-draft.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-draft.test.ts), [task-queries.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-queries.test.ts), [TaskManager.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskManager.test.ts) | Rever os acoplamentos Vue/Pinia/Chrome; acrescentar contrato de conflito de edição desktop · TFA-003/004. |
| P02 recorrência | [task-recurrence.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-recurrence.test.ts), [task-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/task-service.test.ts) | Reutilizar regras puras; ampliar integração atômica, concorrência, reminder e undo · TFA-005/008. |
| P03 subtarefas | [task-subtasks.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-subtasks.test.ts), [TaskForm.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskForm.test.ts) | Adaptar UI/foco e concorrência sem perder marcações · TFA-005. |
| P04 lixeira | [task-trash.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-trash.test.ts), [trash integration](C:/QSI/Workspaces/taskflow-extension/tests/integration/trash.test.ts) | Revisar fixture e storage; provar unidade tarefa/lixeira e restore · TFA-003/006. |
| P05 undo | [task-undo.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-undo.test.ts), [TaskManager.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskManager.test.ts) | Substituir mecanismo Chrome por token main escopado por superfície; testar pré-condições · TFA-006. |
| P06 backup | [taskflow-backup-v4.json](C:/QSI/Workspaces/taskflow-extension/tests/fixtures/backups/taskflow-backup-v4.json), [backup-file.test](C:/QSI/Workspaces/taskflow-extension/tests/application/backup-file.test.ts), [backup-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/backup-service.test.ts) | Revisar API de arquivo/dialog e ampliar verificação pós-restore de todos os campos; versionar fixtures v1–v4 · TFA-007. |
| P07 lembretes | [task-reminders.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-reminders.test.ts), [reminder-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/reminder-service.test.ts) | Manter lógica pura e substituir scheduler/notifier; adicionar testes empacotados de concorrência e ciclo de vida · TFA-008. |
| P08 Quick Add | [QuickAdd.test](C:/QSI/Workspaces/taskflow-extension/tests/components/quick-add/QuickAdd.test.ts) | Adaptar viewport/janela, foco e preservação de draft · TFA-004/009. |
| P09 captura | [page-capture.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/page-capture.test.ts), [use-pending-capture.test](C:/QSI/Workspaces/taskflow-extension/tests/components/capture/use-pending-capture.test.ts) | Preservar normalização; substituir fonte Chrome por leitura pontual após ação do usuário · TFA-009. |
| P10 atalhos | [ShortcutsHint.test](C:/QSI/Workspaces/taskflow-extension/tests/components/shortcuts/ShortcutsHint.test.ts) | Substituir disponibilidade declarada Chrome por registro global efetivo e falhas/conflitos · TFA-009. |
| P11 providers | [ai-provider.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/ai-provider.test.ts), [ai-adapters.test](C:/QSI/Workspaces/taskflow-extension/tests/infrastructure/ai-adapters.test.ts) | Preservar validação portátil; fake de transporte e proteção de segredo/consentimento no main · TFA-010. |
| P12 assistência IA | [ai-subtask-suggestion-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/ai-subtask-suggestion-service.test.ts), [TaskFormAiSuggestion.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskFormAiSuggestion.test.ts) | Mockar request/cancelamento e validar revisão/seleção sem persistência automática · TFA-010. |
| P13 acessibilidade | [contrast.test](C:/QSI/Workspaces/taskflow-extension/tests/styles/contrast.test.ts), [ConfirmDialog.test](C:/QSI/Workspaces/taskflow-extension/tests/components/ConfirmDialog.test.ts), [TaskList.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskList.test.ts) | Adaptar ao shell real e complementar com teclado/leitor de tela/DPI no Windows · TFA-004 a TFA-012. |
| P14 marca | [extension-icons.test](C:/QSI/Workspaces/taskflow-extension/tests/brand/extension-icons.test.ts) | Não presumir que PNG de extensão serve ao instalador/tray; validar assets desktop próprios · TFA-002/011/012. |

Também revisar o teste de fronteiras `tests/architecture/layer-boundaries.test.ts` na origem. A regra desktop deve manter domínio/aplicação sem dependência de Electron/Node, assim como hoje as mantém sem Vue/Pinia/WXT/Chrome/infraestrutura/rede.

## Cenários e resultados esperados

| Área / rastreio | Cenário futuro | Resultado observável esperado |
| --- | --- | --- |
| Commit/recovery · D4, TFA-003 | Interromper gravação em cada etapa de commit; reiniciar depois de write incompleto; injetar falha e seguir com nova operação. | Dados continuam inteiros no estado anterior ou no novo estado confirmado; recovery não sobrescreve silenciosamente; fila volta a processar após falha. Nenhum estado metade gravado. |
| Versão/schema · D4, TFA-003 | Abrir dado corrompido, schema futuro, migração e downgrade incompatível. | Escritas bloqueadas com explicação/recuperação; migração/rollback preservam dados; nenhum reset automático. |
| Atomicidade · P02/P04/P06/P07, TFA-003/005–008 | Recorrência + próxima ocorrência, move/restore tarefa + lixeira, substituição de backup, consumo de reminder/edição concorrente. | Cada unidade comprometida inteira; scheduler falhando depois do commit informa pendência sem alegar rollback dos dados. |
| Concorrência/draft · D4, P01, TFA-003/004 | Duas janelas editam mesmo item; toggle ocorre após draft velho; resposta/revisão chega fora de ordem. | Edição completa em conflito é recusada com draft e feedback preservados; toggle usa dado mais recente; resposta atrasada não substitui snapshot com revisão mais nova. |
| Prévia stale · P06, TFA-007 | Alterar coleção entre preparar e confirmar restore. | Estado-base divergente exige nova prévia/confirmação; nunca substitui silenciosamente alterações recentes. |
| Recorrência · P02/P07, TFA-005/008 | Diário/semanal/mensal, DST/horário civil, fim do mês, limite inclusivo, saltar passado e comandos repetidos/concorrentes. | Âncora/horário preservados; retorno ao dia original quando possível; sem backlog; no máximo uma ocorrência próxima; fechar/pular mantém contrato e IDs novos. |
| Subtarefas · P03, TFA-005 | Reordenar, alternar várias em duas janelas e editar task em paralelo. | Até 20, um nível, ordem/progresso corretos; estado não muda status do pai; edições mantêm marcações existentes sem perda. |
| Undo · P05, TFA-006 | Token de outra janela/sessão, ação subsequente, ocorrência gerada já alterada, fechamento, lembrete processado. | Apenas ação elegível e token da superfície podem reverter; pré-condição stale falha sem sobregravar; evento reminder sozinho não invalida indevidamente; sem undo de criação/toggle/restore/import. |
| Claim/retomada · P07/D6, TFA-008 | Crash depois do claim e antes de notificar; suspensão/retomada; alarme antigo; saída e reabertura; notificações bloqueadas. | Claim precede chamada; no máximo uma tentativa (aviso pode se perder, sem retry automático); ocorrência válida até 5 min segue política após resume; alarme obsoleto usa tolerância própria de 1 min; nada promete aviso com app encerrado/desligado. |
| Backup v1–v4 · P06, TFA-007 | Importar cada versão com campos representativos, IDs/datas, recorrência, subtarefas, `seriesId`, lembretes; incluir arquivo vazio, grande/inválido e schema futuro. Verificar o resultado persistido campo a campo. | Migração mantém dados válidos e IDs/datas conforme contrato; formato do arquivo permanece distinto do schema desktop; validação integral precede escrita; restore é substituição total; inválido/futuro não altera estado. Excluir lixeira, segredo e undo. |
| Remetente/IPC · D3, TFA-003 | Remetente/frame/origem inválidos, payload inválido/grande, token cross-window, reply/evento fora de ordem, traversal, URL `file:`/`javascript:`. | Pedido rejeitado em runtime; canal bridge só permite catálogo declarado; sem acesso renderer a Node/fs; erro não vaza stack/caminho/segredo. |
| IA mockada · P11/P12/D7, TFA-010 | Providers OpenAI/Anthropic/CUSTOM; consentimento por origem e configuração; prévia exata; redirect, body limite, timeout, abort, fechar/trocar provider e resposta tardia. | Sem rede sem ação/consentimento; só conteúdo pré-visualizado vai ao provider; segredo fica no main; cancelamento/troca descarta resultado; draft/tarefa não salva sugestão automaticamente; nenhum segredo/conteúdo em log/backup; nenhuma chamada paga. |
| Acessibilidade/UI · P01/P08/P13, TFA-004–010 | Tabulação/leitor de tela, foco após CRUD/reorder/dialog, Escape/cancelamento, erro inicial, contraste, zoom/DPI e falha de persistência. | Equivalência de teclado/foco/feedback é observável; draft e formulário não desaparecem em falha; verificação DOM não substitui prova na janela Windows. |
| Pacote instalado · D8/P14, TFA-002/011/012 | Conta padrão limpa; install, abrir fora do dev, update, restart e uninstall/reinstalação; sem Node instalado, elevação ou serviço. Validar ABI e caminho de dados. | Instalador realmente per-user; app inicia com identidade estável, dados sobrevivem conforme política aprovada e pacote não inclui `.env`, segredos, dados reais ou testes. Limitação corporativa é registrada, nunca contornada. |

Todos os testes de IA usam mocks/fakes sem rede paga. Fixtures e logs usam valores fictícios e não incluem credenciais ou dados sensíveis.
## Gates e estado de execução

| Momento | Gate | Estado |
| --- | --- | --- |
| TFA-001 documental | `openspec list --json`, `openspec status --change "definir-arquitetura-e-paridade-desktop" --json`, instruções apply e `openspec validate definir-arquitetura-e-paridade-desktop --type change --strict --no-interactive`; revisar documentos, links e diff do app. | Validação estrita final passou em 2026-10-03 com OpenSpec 1.14.0; `skip_specs` aceito e zero deltas. Nenhum teste de runtime se aplica. |
| Fundação TFA-002 (2026-10-04) | `npm ci` com lockfile e Node/npm fixados; `npm run lint`, `typecheck` (contracts/main/preload/renderer/tests), `test` (Vitest), `build` (três entrypoints), `validate`, `package:win` (`--publish never`), `verify:package` e `smoke:packaged` (cópia de teste, perfil `test`, timeout 60 s, positivos e negativos). | **Executado:** 7 arquivos/32 testes; ASAR na allowlist sem addon/updater/segredos; manifests `asInvoker/uiAccess=false`; smoke com prova SQLite, reabertura por fingerprint, segunda instância, fechamento sem residual e negativas integradas (payload, preload, ASAR corrompido, hang, override de perfil). Comandos e hashes em [desktop-foundation-validation.md](desktop-foundation-validation.md). |
| CI da fundação | Workflow Windows PR/push com Node/npm/lockfile/actions fixados, gates, NSIS `--publish never`, inspeção e smoke; artefatos internos com SHA-256 e retenção finita, sem release. | Workflow definido; **run hospedado ainda não executado** (depende de push autorizado). O runner Windows é administrador com UAC desabilitado: sucesso nele **não** comprova conta padrão nem instalação. |
| Prova em conta padrão | Instalação/execução/manutenção F01–F09 no PC Windows 11 x64 autorizado, com dados fictícios e evidências sanitizadas. | Executada parcialmente nesta Change (argumentos/destinos/refusals pré-instalação; instalação e manutenção registradas na validação). Resultados por cenário e bloqueios (ex.: segunda conta) são registrados sem bypass. |
| Changes funcionais | Gates da TFA-002 mais provas específicas da tabela de cenários; checar build empacotado quando o contrato exigir. | Planejado conforme dependências e implementação real. |
| TFA-008/009/011/012 | Smoke e cenários no app empacotado/instalado em Windows; suspensão, notificações, bandeja, atalhos e distribuição. | Planejado, não executado. Build ou smoke apenas do renderer não substitui esses resultados. |

O smoke da CI roda em runner administrador e serve como gate de regressão, não como prova de conta padrão/UAC nem de funcionalidades futuras. As evidências executadas da fundação comprovam somente o que está descrito em [desktop-foundation-validation.md](desktop-foundation-validation.md); a validação OpenSpec verifica os artefatos da Change e não significa paridade funcional desktop.

## Critérios documentais AC01–AC08

| Critério | Evidência documental a revisar |
| --- | --- |
| AC01 | [architecture.md](architecture.md) diferencia fatos observados, baseline aprovado, proposta, condição e decisão futura; compara Vue/Electron e Quasar/Electron e mantém local-first/Windows per-user. |
| AC02 | [parity-matrix.md](parity-matrix.md) apresenta P01–P14, fontes, destino P/A/R/Change, exclusividades Chrome e divergências sem alegar runtime pronto. |
| AC03 | Arquitetura explicita domain/application, ownership do main, isolamento renderer, catálogo IPC, remetente, revisões e tokens. |
| AC04 | Arquitetura registra invariantes de durabilidade/recovery/conflito, condicionais SQLite e JSON alternativo sem implementação prematura. |
| AC05 | Matriz/arquitetura preservam backup de tarefas v1–v4 e exclusões; limites de lembretes/undo/IA e adaptações ficam explícitos. |
| AC06 | Este plano distingue teste portátil, UI, adapter/IPC, integração e Windows instalado; testes desktop continuam planejados. |
| AC07 | Links, consistência documental e validação estrita são revisados no projeto app; origem só leitura; sem cópia de código/dados/segredo/scaffold. |
| AC08 | [roadmap.md](roadmap.md) mantém IDs, dependências, datas e estado de revisão, sem `DONE`, archive ou TFA-002 por inferência. |
