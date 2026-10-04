# Verificação de implementação — TFA-004

**Change:** `migrar-gerenciamento-de-tarefas-e-interface` · **Schema:** `spec-driven` (OpenSpec 1.14.0)
**Data:** 2026-10-04 · **Branch:** `codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface` (base `d74e02d`)
**Método:** verificação por leitura de código, execução dos gates do projeto e evidência do pacote real. Nenhum task foi considerado concluído sem evidência; o apply **termina em revisão** e não arquiva, consolida specs, altera README, commita, publica ou inicia outra Change.

## Summary

| Dimensão | Status |
| --- | --- |
| Completude | **41/41 tasks** concluídas (as tasks 8.2 e 8.3 são a própria verificação e o registro final); **23 requisitos** (17 ADDED + 6 MODIFIED), **56 cenários** cobertos pela evidência. |
| Correção | 17/17 requisitos ADDED/MODIFIED com implementação localizada e evidência de teste; 56/56 cenários com teste/evidência correspondente (DOM, core, IPC, store ou pacote). |
| Coerência | Decisões D1–D10 seguidas; padrões do repositório mantidos (núcleo portável, main coordenador, bridge fechada, testes separados por camada). **1 WARNING material:** orçamento D10 de 10.000 tarefas reprovado e mantido; exige decisão humana antes do archive. |

## Evidência dos gates

| Gate | Comando | Resultado |
| --- | --- | --- |
| Qualidade completa | `npm run validate` (Node 24.21.0/npm 11.21.0) | lint sem warnings, 5 typechecks, **34 arquivos / 474 testes + 1 skipped**, build main/preload/renderer. |
| OpenSpec estrito | `openspec validate migrar-gerenciamento-de-tarefas-e-interface --type change --strict --no-interactive` | válido. `openspec validate --all --strict --no-interactive`: **6/6** (INFO preexistente de texto longo em `windows-per-user-installation`). |
| Pacote | `npm run package:win` + `npm run verify:package` | NSIS x64 `--publish never`; ASAR com 12 arquivos na allowlist, sem addon/updater/segredos; `asInvoker/uiAccess=false`. SHA-256 desta build: exe `c59700e3…`, app.asar `673dbf5d…`, Setup `10ffc5ac…`. **Setup não executado.** |
| Smoke no pacote | `npm run smoke:packaged` | Fluxo TFA-002/003 íntegro (bridge 27 verificações, reopen, 5 kills, drain, bench 10.000/23,9 MiB); **`tasks` 24/24**; **`a11y` 12/12**; **`ui-bench` reprovado nos gates de 10.000** (ver WARNING). O smoke termina com exit 1 por esse gate retido. |
| Diff/escopo | `git status`, `git diff --stat`, `git diff --check` | Somente arquivos do projeto; sem `.env`, segredo, dado real, `node_modules` ou artefato; extensão `taskflow-extension` e seu Git não foram tocados (leitura no HEAD `a763e7a0…`). Nenhuma Change futura implementada. |

## Completude por requisito

### desktop-task-management (13 ADDED)

| Requisito | Evidência principal |
| --- | --- |
| Campos básicos têm validação e normalização preservadas | `src/domain/task-draft.ts` (`validateBasicDraft`/`createBasicTask`); `tests/domain/task-draft.test.ts`; UI `TaskForm.vue`. |
| Edição básica conserva valores não alterados | `planBasicPatch` + ausência/limpeza explícitas; `tests/domain/task-draft-patch.test.ts`; `tests/application/task-commands.test.ts` (histórico extenso). |
| Status simples preserva transições e no-op | `applyStatus`; `tests/domain/task-status.test.ts`; `changeTaskStatusInUnit` + testes de no-op/reopen. |
| Pesquisa preserva campos e comparação | `matchesSearch`; `tests/domain/task-queries.test.ts` (subtarefas, acentos, URL fora). |
| Filtros e ordenação são combináveis | `filterTasks`/`sortTasks`; testes de AND, três ordens/desempates; TaskFilters + testes de manager. |
| Situação do prazo usa instante e status ativo | `getDueSituation` + testes de fronteira `now-1/now/+24h/+24h+1` e terminais; relógio 60 s + foco em `stores/tasks.ts`/testes. |
| Prazo local conserva instante e exige revisão de fuso | `date-time.ts` (ISO intacto, comparação das partes, `needsTimeZoneReview`); `tests/renderer/date-time*.test.ts` (subprocesso `TZ`) e teste de formulário. |
| Carregamento vazio e erro são estados distintos | `stores/tasks.ts` (loading/ready/empty/stale/blocked/noResults); `tests/renderer/tasks-store.test.ts` e `task-manager.test.ts`. |
| Falhas e concorrência conservam preenchimento | CAS + CONFLICT/NOT_FOUND/incerto no main e no store; testes de comando, IPC e store (duplo envio, ressync, sem replay). |
| Seletor de status conserva interação por teclado | `TaskCard.vue`; `tests/renderer/task-list.test.ts` (setas/Enter/Escape/focusout/ponteiro/busy). |
| Foco e semântica acessível são preservados | `TaskManager/TaskForm/TaskList`; testes de foco inicial/primeiro erro/retorno; `tests/renderer/contrast.test.ts` (WCAG dos tokens). |
| Identidade e limites temporários são visíveis com clareza | Cartões/badges preservados; recorrência somente leitura, subtarefas somente leitura e aviso de lembretes na UI + guards no main (testes de `ADVANCED_TASK_RESTRICTED`). |
| Evidências distinguem componente e produto empacotado | Testes DOM/core/IPC/store + harness `tasks`/`a11y`/`ui-bench` no pacote; documentação [desktop-task-management.md](../docs/desktop-task-management.md). |

### desktop-state-ipc (4 MODIFIED + 4 ADDED)

| Requisito | Evidência principal |
| --- | --- |
| Catálogo de estado mínimo e versionado (MODIFIED) | `src/contracts/tasks.ts` + `desktop-api.ts`; catálogo de oito operações verificado no preload (`tests/preload/bridge-catalog.test.ts`) e no pacote (`tasks.catalogEightClosed`). |
| Transporte limitado preserva dados legítimos (MODIFIED) | 64 KiB/8 KiB em `TASK_COMMAND_LIMITS` + testes de contrato (escaping/limites); 1 KiB/256 KiB da TFA-003 inalterados; teste de snapshot de 388k elementos sem truncamento. |
| Erros são dados seguros discriminados (MODIFIED) | Uniões fechadas por operação em `contracts/tasks.ts`; testes de resposta/erro e negativas no IPC/pacote; nenhum stack/path/SQL/payload. |
| IPC de estado é comprovado no pacote (MODIFIED) | `tasks` no pacote: UI real inscrita, duas superfícies, reload, crash controlado, foco, cleanup; `bridge` da TFA-003 mantido. |
| Comandos aceitam somente intenção básica (ADDED) | Parsers exatos de draft/patch/status/origem; `tests/contracts/task-command-contract.test.ts`; recusa de auditoria/avançados/path/opções. |
| Escritas são decisões condicionais no proprietário (ADDED) | `task-commands.ts` + `ipc/tasks.ts`; testes de colisão de ID, CAS, ABA, claim isolado, no-op e guards avançados. |
| Confirmação de comando converge com snapshot (ADDED) | Ack curto com revisões; store aguarda snapshot ≥ ack; testes de resposta antiga, ressync falhado e incerto com ressync obrigatório. |
| Origem salva abre somente por operação controlada (ADDED) | `source-url.ts` + leitura por ID/revisão e opener fora da transação; `tests/application/source-url.test.ts`, `tests/main/ipc-tasks.test.ts` e `a11y.windowsOpenerAccepted`. |

### desktop-foundation (2 MODIFIED)

| Requisito | Evidência principal |
| --- | --- |
| Shell local autocontido e acessível (MODIFIED) | `App.vue` com gerenciamento principal e diagnóstico secundário; `foundation-view.test.ts`; `a11y` no pacote (janela, foco, zoom 200%, string longa). |
| Renderer sem autoridade irrestrita (MODIFIED) | Oito operações congeladas; guardas de documento/frame/origem/sessão no main; negativas no IPC e no pacote; `tests/architecture` proíbe armazenamento/opener no renderer. |

### Cenários (56/56)

Os 29 cenários de `desktop-task-management`, os 21 de `desktop-state-ipc` e os 6 de `desktop-foundation` têm teste automatizado ou evidência de pacote correspondente. Destaques de cobertura: criação mínima/completa/DONE; limites exatos/excedidos; cancelar; histórico e precisão; transições/no-op; pesquisa e AND; ordens/desempates; fronteiras de prazo; fuso/gap/repetição; vazio/erro/stale; conflito/ausente/incerto; teclado/foco/aria; recorrência/subtarefas/lembretes; catálogo fechado/negativas/bytes; consolidação com snapshot; origem válida/recusada/sessão encerrada; janela offline, diagnóstico separado e catálogo limitado no pacote.

## G01–G20

| Grupo | Resultado |
| --- | --- |
| G01–G04 (campos, criação, edição, status) | Coberto por testes de domínio, aplicação, IPC, store e UI; `tasks` no pacote cria/edita/conclui/reabre pela interface. |
| G05–G07 (pesquisa, filtros, ordem, prazos) | Coberto por `task-queries` e UI; relógio 60 s/foco testado; classificação correta em testes. |
| G08 (fusos/precisão) | Subprocesso `TZ` (gap/repetição), comparação das partes, ISO intacto e revisão de fuso no formulário. |
| G09–G11 (estados, falhas, sucesso/incerto) | Store + manager; ressync obrigatório após incerto; somente ack confirma; `tasks` exercita reload com resposta perdida sem duplicação. |
| G12 (duas sessões/conflito) | CAS determinístico nos testes; duas superfícies convergem no pacote; `CONFLICT` preserva draft. |
| G13–G15 (teclado/foco/acessibilidade) | Testes de componente + contraste; `a11y` no pacote (dimensões, zoom, foco, nomes). Limite: leitor de tela/DPI humano não executados. |
| G16 (origem externa) | Validação 2081/2082, protocolos/credenciais, sessão antes do efeito; opener falso nos testes e shell real aceito no pacote com URL fictícia. |
| G17 (IPC negativo) | Contrato/protótipo/chaves/bytes; zero leitura antes do guard; negativas no pacote; isolamento preservado. |
| G18 (inscrição/reconciliação) | Store com uma inscrição/relógio; foco/30 s, evento perdido e reload cobertos; `tasks` no pacote com foco e crash controlado (fecha W4 parcialmente). |
| G19 (avançados/limites de escopo) | Guards no main testados; DOM sem controles futuros; históricos/processedFor conservados. |
| G20 (volume/pacote) | 1.000/10.000 medidos; montagem 0,38 s/2,19 s e 10.000 cartões completos; **p95/heartbeat de 10.000 reprovados** (ver WARNING). |

## Issues

### WARNING (corrigir/revisar antes do archive)

1. **Orçamento D10 de 10.000 tarefas reprovado e mantido.** Medição no pacote (mesmo PC, Core i5-13420H): montagem **2.191 ms** (≤5 s ✓), **10.000 cartões** no DOM (sem truncamento ✓), p95 de 20 reordenações **521,5 ms** (alvo 500 ms ✗) e heartbeat **578,9 ms** (alvo 250 ms ✗); em 1.000 tudo passa (381 ms/41 ms/48 ms). A revisão concreta já aplicada (cartões como componentes persistentes, store raso, comparadores com chaves pré-calculadas, `content-visibility`, remoção de camada de `li`) reduziu o p95 de ~4,5 s para ~0,52 s; o custo bruto do Chrome para reordenar os mesmos 10.000 nós é de ~165–340 ms sem framework, então o alvo de 500 ms está no limite da base física desta máquina. Nada foi truncado, virtualizado, movido para worker nem removido do gate; o smoke termina reprovado. **Recomendação:** decisão humana explícita (a) revisar formalmente o orçamento de reordenação completa de 10.000 no design/roadmap, ou (b) aprovar uma Change/design de janela de renderização antes do archive. Sem essa decisão, o archive não deve ocorrer.
2. **Prova humana de acessibilidade não executada.** Dimensões, zoom 200% e foco foram verificados por script no pacote; leitor de tela, escala DPI do Windows e percurso humano com teclado permanecem limitação declarada (task 7.4). **Recomendação:** agendar a inspeção manual autorizada ou registrá-la como pendência aceita na TFA-012.

### SUGGESTION

1. **Cobertura de crash do renderer no pacote é de um caso controlado** (`forcefullyCrashRenderer` + nova superfície), não de todas as janelas de tempo possíveis; ampliar em TFA-012 se desejado.
2. **CI não consultada nesta sessão** (nada foi enviado ao remoto): o primeiro run do smoke ampliado deve ser conferido quando o push for autorizado.

## Limitações não verificadas

- **Setup/instalação, notificações, bandeja, atalhos globais e conta padrão:** fora do escopo desta Change; não certificados por build/smoke (a prova instalada continua a da TFA-002).
- **CI remota, corte de energia, disco físico cheio, antivírus/política corporativa e volume de rede:** não executados (herdados da TFA-003).
- **30 s de reconciliação:** verificado por teste de cliente/store e por foco no pacote; a espera real de 30 s não foi aguardada no smoke.
- **Abertura externa:** o smoke do pacote usa o shell real com URL fictícia (`example.invalid`) e registra apenas a aceitação da solicitação; não verifica carregamento da página.

## Assessment

Foram executadas todas as verificações aplicáveis; não há CRITICAL de completude/correção (41/41 tasks e 23/23 requisitos com evidência). Há **2 WARNING** e **2 SUGGESTION**. **Não declarar pronto para archive enquanto o WARNING 1 não tiver decisão humana explícita**; o relatório é entregue para revisão, e o archive, a consolidação de specs e qualquer commit/push/PR dependem de autorização própria.

**Aprovação humana e arquivo (2026-10-04):** o usuário revisou este relatório e determinou textualmente: “Rode o opsx-verify, passando sem nenhum crítico ou warning bloqueante aprove e rode o archive. Após isso, ajuste o roadmap deixando a TFA-004 como DONE e a TFA-005 ready e pode commitar e fazer o push. Finalize criando o PR”. Não há CRITICAL; o WARNING 1 (orçamento D10 de 10.000, com o gate retido no smoke) foi tratado pela decisão humana como **não bloqueante para o archive**, permanecendo como pendência pós-archive documentada — revisar formalmente o orçamento de reordenação completa ou aprovar uma Change de janela de renderização —, sem truncamento, virtualização automática ou remoção do gate. O WARNING 2 (prova humana de acessibilidade) e as SUGGESTIONs permanecem registrados para a TFA-012. O archive foi executado em 2026-10-04 na mesma branch por autorização explícita.
