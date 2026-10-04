# Relatório de verificação — TFA-003

**Change:** `implementar-persistencia-local-e-fronteira-ipc` · **Schema:** spec-driven · **OpenSpec:** 1.14.0 · **Data:** 2026-10-04
**Branch:** `codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc` (base `main` `c123261`) · **Estado:** **aprovado pelo usuário em 2026-10-04**.

**Aprovação (2026-10-04):** depois de receber este relatório, o usuário pediu nova execução do `opsx:verify` e determinou: "não tendo nenhum crítico ou warning bloqueante pode aprovar", autorizando em seguida archive, commit, push e abertura de PR. A reexecução confirmou 42/42 tasks, `npm run validate` (19 arquivos/358 testes) e validação OpenSpec estrita, sem problema crítico; os seis avisos abaixo são limites de evidência e pendências registradas, não bloqueantes. O relatório fica aprovado nessas condições.

Até a entrega deste relatório, nada havia sido arquivado, commitado, enviado ao remoto, mesclado, instalado ou distribuído. O Setup não foi executado. A extensão em `C:\QSI\Workspaces\taskflow-extension` foi consultada somente para leitura e permanece sem alterações no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. `package.json` e `package-lock.json` não foram alterados; nenhuma dependência foi instalada.

## Resumo

| Dimensão | Resultado |
| --- | --- |
| Completude | 42/42 tasks; 27/27 requisitos (24 ADDED + 3 MODIFIED) com implementação localizada; nenhum REMOVED/RENAMED |
| Correção | 27/27 requisitos mapeados; 66/66 cenários com cobertura, 6 deles com ressalva registrada como WARNING |
| Coerência | D1–D8 seguidas; nenhuma decisão contrariada; nenhum desvio material (sem worker, WAL, outro driver ou relaxamento de orçamento) |

**Avaliação final:** nenhum problema CRÍTICO. **6 WARNING** e **5 SUGESTÕES** a considerar. Nenhuma checagem foi pulada. Apta para archive, com as ressalvas abaixo; aprovação registrada acima.

## Evidências dos gates (execução final de 2026-10-04)

Ambiente: Node.js 24.21.0 e npm 11.21.0 (os fixados), Windows 11 x64, Intel Core i5-13420H, 15,7 GiB.

| Gate | Resultado |
| --- | --- |
| `npm run validate` | **PASS** — ESLint sem warnings; 5 typechecks (contracts, main, preload, renderer, tests); **19 arquivos / 358 testes**; build main, preload (`index.cjs` único) e renderer |
| `openspec validate implementar-persistencia-local-e-fronteira-ipc --type change --strict --no-interactive` | **PASS** — "Change is valid" |
| `openspec validate --all --strict --no-interactive --json` | **PASS** — 4/4 (3 specs + a Change) |
| `npm run package:win` | **PASS** — NSIS x64, `--publish never`, sem assinatura; Setup **não** executado |
| `npm run verify:package` | **PASS** — ASAR com 12 arquivos na allowlist, sem addon/updater/segredos; manifests `asInvoker/uiAccess=false` |
| `npm run smoke:packaged` | **PASS** — 10 cenários da fundação + 14 de produto, incluindo o benchmark |

Hashes do pacote verificado: `TaskFlowApp.exe` `9d5a3cf6…ace693`; `app.asar` e Setup mudam a cada build e estão na saída de `verify:package`.

Runtime medido no Electron empacotado: Electron 44.5.1, Node 24.21.0, Chromium 152.0.7977.130, **SQLite 3.53.4**, `journal_mode=delete`, `synchronous=3` (EXTRA), `foreign_keys=1`, `busy_timeout=100`, schema SQL 1, origem real do documento `taskflow://app`.

## Critérios P01–P12

| Critério | Evidência | Nível |
| --- | --- | --- |
| P01 Fidelidade e isolamento | `product-database.test.ts` (caminhos, round-trip/reopen, mesmo ID nas duas coleções, produto × prova, perfis); `stored-task-codec.test.ts`; bridge no pacote (`roundTripAllFields`, `diagnosticKeepsProduct`, `productKeepsDiagnostic`) | Banco real em diretório temporário; pacote real |
| P02 Atomicidade | `storage-coordinator.test.ts` (saveMany, replaceAll, move/restore com falha real entre as escritas, `ID_EXISTS`, preparação inválida) | Banco real; falha do motor por gatilho temporário |
| P03 Interrupção de processo | `storage-crash.test.ts` (10 casos: 5 barreiras da unidade, 2 de claim, 3 de migração); pacote: kill em 5 barreiras | Processo real encerrado por PID validado, em Node e no Electron empacotado. **Não é prova de energia** |
| P04 Compatibilidade e integridade | `product-database.test.ts` (zero bytes, não-SQLite, SQLite estranho, sem schema, assinatura, schema/payload futuro, 11 payloads/metadados inválidos, tabela sem PK, WAL, truncamento, corrupção, journal órfão, migração commit/rollback/downgrade/sem caminho) | Arquivos reais; hash conferido antes e depois |
| P05 Falhas de escrita | Lock real (escritor e leitor externos), permissão real (somente leitura), `SQLITE_FULL` real do motor, destino que não é arquivo; `COMMIT`/`ROLLBACK`/I/O de migração por fault injection | Misto — ver "Simulações" |
| P06 Concorrência | Produtores admitidos no mesmo turno, CAS por revisão de conteúdo, tarefas distintas, ABA por recriação de ID, sem sleeps nem timestamp | Banco real, ordem de fila determinística |
| P07 Claim | Claim duplo, claim × edição de prazo/status/lembrete/remoção, marcador preservado em edição vinda de leitura stale, `updatedAt` e revisão de conteúdo conservados | Banco real; kill após claim no pacote |
| P08 Subscriptions | `state-client.test.ts` (27), `ipc-state.test.ts` (26); pacote: duas superfícies convergem, reload invalida, reinscrição | Unidade com main fictício; main real com frames fictícios; pacote real |
| P09 IPC negativo | Zero leitura antes do guard (contador de leituras), 8 remetentes inválidos × 3 operações, 12 requests malformados; pacote: `webContents` não registrado e URL errada reais | Unidade e pacote |
| P10 Ownership e encerramento | Drain/cancelamento/fechamento da conexão; pacote: segunda instância sem abrir banco, saída com 20 unidades e 4 leituras admitidas | Unidade e pacote |
| P11 Runtime empacotado | Harness `bridge`/`reopen`/`crash`/`drain`/`bench` com `LOCALAPPDATA` fictício; versões e PRAGMAs registrados | Pacote real, sem Node/npm externos, sem instalador |
| P12 Limites e regressão | Fila 64/8, espera 2 s, 1 KiB, 256 KiB, cursor 30 s, 8 documentos; benchmark; gates existentes; fronteiras de arquitetura | Unidade e pacote |

### Gate de limites (Electron empacotado)

| Medida | 1.000 + 100 | 10.000 + 100 | Alvo | Resultado |
| --- | --- | --- | --- | --- |
| Payload serializado | 2,6 MiB | 23,9 MiB | ≥ 20 MiB | PASS (conjunto maior) |
| Mutação representativa, p95 / máx. | 5,17 / 6,97 ms | 3,24 / 8,01 ms | p95 ≤ 100 ms | PASS |
| Página pela bridge, p95 / máx. | 4,88 / 4,88 ms | 4,11 / 7,29 ms | p95 ≤ 100 ms | PASS |
| Preflight completo | 28 ms | 235 ms | ≤ 5 s | PASS |
| `saveMany` inteiro num commit | 65 ms | 429 ms | medir, não dividir | Registrado |
| Drain de 32 unidades | — | 87 ms | alvo 5 s | PASS |
| Maior intervalo do heartbeat | — | 593 ms | registrar | Registrado (W5) |

Não foi necessário worker, WAL, outra configuração nem relaxamento.

## Matriz requisito → cenários → tasks → evidência

Abreviações: `PD` = `tests/main/product-database.test.ts`; `SC` = `tests/main/storage-coordinator.test.ts`; `CR` = `tests/main/storage-crash.test.ts`; `CD` = `tests/application/stored-task-codec.test.ts`; `RV` = `tests/application/revisions.test.ts`; `IS` = `tests/main/ipc-state.test.ts`; `DS` = `tests/main/document-sessions.test.ts`; `IF` = `tests/main/ipc-foundation.test.ts`; `CL` = `tests/application/state-client.test.ts`; `PG` = `tests/application/snapshot-paging.test.ts`; `CT` = `tests/contracts/state-contract.test.ts`; `BC` = `tests/preload/bridge-catalog.test.ts`; `AR` = `tests/architecture/layer-boundaries.test.ts`; `PKG` = `npm run smoke:packaged`.

### local-task-persistence (14 requisitos, 34 cenários)

| Requisito | Cenários | Tasks | Implementação | Evidência | Situação |
| --- | --- | --- | --- | --- | --- |
| Banco de produto separado e identificado | Produto e diagnóstico independentes; Perfis separados | 2.1, 2.2, 5.3 | `src/main/profile.ts`, `src/main/storage/product-schema.ts`, `product-database.ts` | PD "caminho do banco de produto" (4); PKG `diagnosticKeepsProduct`/`productKeepsDiagnostic` | Coberto |
| Fidelidade integral dos campos conhecidos | Round-trip completo; Dados avançados sem funcionalidade antecipada | 1.2, 1.4, 2.2 | `src/domain/*`, `src/application/storage/stored-task-codec.ts` | CD "fidelidade dos campos conhecidos"; PD "round-trip e reopen"; PKG `roundTripAllFields` | Coberto |
| Compatibilidade e validação de codecs | Versões históricas reconhecidas; Payload inválido | 1.2, 1.4 | `stored-task-codec.ts` (`decodeTaskPayload`, `encodeTaskPayload`) | CD (v1–v4, 21 recusas, escrita); SC "leitura e no-op não regravam payload histórico" | Coberto |
| Abertura distingue ausência de incompatibilidade | Perfil novo; Arquivo existente vazio ou estranho; Corrupção ou versão futura | 2.4 | `classifyProductTarget`, `validateExisting` | PD "preflight" (24 casos com hash preservado) | Coberto |
| Migrações e recuperação preservam origem | Migração falha ou é interrompida; Migração confirma e downgrade desconhece destino; Journal de transação interrompida | 2.5, 4.2 | `validateExisting` (executor), `StorageDefinition` | PD "migrações registradas" (7); CR migração (3) e barreiras com journal quente (2) | Coberto |
| Unidades de trabalho atômicas | SaveMany interrompido entre registros; Move e restore atômicos; Produtores compartilham decisão | 3.1, 3.2, 3.3 | `src/main/storage/coordinator.ts`, `src/application/storage/task-storage-unit.ts` | SC "unidade de trabalho coordenada", "primitives de tarefas", "falha entre remover da origem…" | Coberto |
| Colisão no restore preserva as coleções | Colisão preservada; Ausência ou preparação inválida | 3.3 | `restoreFromTrash` | SC (2 testes); PKG `restoreCollision` | Coberto |
| Revisões persistidas distinguem conteúdo e processamento | Revisão sobrevive a reopen; No-op e ABA; Limite de representação | 1.3, 3.2 | `revisions.ts`, `coordinator.ts` | RV; SC "revisão global sobrevive", "ID recriado", "acima da precisão do JS" | Coberto |
| Conflitos condicionais não perdem edição | Duas edições da mesma base; Tarefas distintas | 3.4 | `updateTaskConditionally`, `revertConditionally` | SC "edição e reversão condicionais" (5) | Coberto |
| Claim de ocorrência é condicional e interno | Claim duplicado; Edição e claim competem; Claim confirmado antes de efeito | 3.5, 4.2 | `claimReminderOccurrence`, `preserveProcessedMarkers` | SC "claim condicional" (9); CR claim (2); PKG kill após claim | Coberto |
| Falhas e efeitos externos respeitam commit | I/O ou commit falha; Fila recuperável; Resposta perdida | 3.6, 4.1 | `coordinator.ts` (`#rollback`, `#invalidate`, publicação pós-unidade) | SC "efeitos e eventos sucedem o commit" (3), "falhas de armazenamento" (7) | Coberto — ver W1 |
| Leituras são livres de mutações de manutenção | Lixeira antiga é lida | 3.3, 6.2 | Unidade de leitura sem portas de escrita | SC "leitura nunca expurga"; IS "leitura não expurga…"; PKG `readsDoNotMutate` | Coberto |
| Espera e recursos são limitados sem perda de dados | Lock e fila excedidos; Dados maiores que página ou dataset; Gate de execução síncrona | 2.3, 4.3, 7.1, 7.4 | `QUEUE_LIMITS`, `LOCK_WAIT_MS`, `snapshot-paging.ts` | SC "limites de admissão", "lock real"; PG; PKG benchmark | Coberto — ver W2, W5 |
| Evidência de durabilidade usa produto e runtime reais | Processo de teste interrompido; Produto no pacote | 4.2, 7.2, 7.3 | `src/main/harness/product-harness.ts`, `scripts/smoke-packaged.mjs` | CR (10); PKG (14 cenários de produto) | Coberto — ver W3 |

### desktop-state-ipc (10 requisitos, 23 cenários)

| Requisito | Cenários | Tasks | Implementação | Evidência | Situação |
| --- | --- | --- | --- | --- | --- |
| Catálogo de estado mínimo e versionado | Operações disponíveis; Request malformado | 6.1, 6.6 | `src/preload/index.ts`, `src/contracts/state.ts` | BC (6); CT; IS "requests malformados…"; PKG `catalogClosed`, `invalidRequestsRefused` | Coberto |
| Snapshot completo pertence a uma revisão | Páginas estáveis; Commit entre páginas; Leitura não altera produto | 6.2 | `src/main/ipc/state.ts`, `snapshot-paging.ts`, `snapshot-assembler.ts` | IS "snapshot paginado" ; CL "commit entre páginas"; PG | Coberto |
| Inscrição coordena snapshot inicial e eventos | Commit durante handshake; Subscribe repetido | 6.3 | `StateIpcService.#page`, `state-client.ts` | IS "mesmo turno coordenado", "idempotente"; CL (3); PKG `subscribeIdempotent` | Coberto |
| Eventos são invalidações posteriores ao commit | Commit e no-op; Perda de validade dos dados | 6.4 | `#queueInvalidation`, `#announceUnavailable` | IS (5); CL "indisponibilidade…" | Coberto |
| Revisões determinam ressincronização | Eventos fora de ordem ou duplicados; Evento perdido sem salto; Escritas contínuas | 6.5 | `state-client.ts` | CL (7) | Coberto — ver W4 |
| Tokens e listeners pertencem ao documento | Cancelamento próprio e alheio; Reload da mesma URL; Cursor expirado | 5.2, 6.6 | `document-sessions.ts`, `state.ts` | IS "tokens e listeners" (7), "cursor desconhecido…"; PKG `foreignUnsubscribeRefused`, `reloadInvalidatesSession` | Coberto — ver W6 |
| Autorização também protege acesso e saída | Matriz de remetentes inválidos; Documento invalida enquanto espera | 5.1, 5.2 | `DocumentSessions.authorize/isCurrent/currentFrame` | DS (24); IS "zero leitura antes do guard", "navega enquanto espera", "resultado tardio"; PKG `unknownContentsRefused`, `wrongUrlRefused` | Coberto |
| Transporte limitado preserva dados legítimos | Unicode e registro grande; Pressão de recursos; Estado transitório limitado | 6.2, 7.1 | `snapshot-paging.ts`, `text.ts`, `state.ts` | PG; IS "acima de 256 KiB", "RESOURCE_LIMIT", "oito documentos"; PKG `recordAbovePage`, `documentLimit` | Coberto (`RESOURCE_LIMIT` por simulação) |
| Erros são dados seguros discriminados | Erro de produto sanitizado; Resultado tardio após commit | 6.1, 3.6 | `stateErrorCodeFor`, `stateFailure`, validadores | CT; IS "código seguro", "razões internas…"; CL "saída malformada" | Coberto |
| IPC de estado é comprovado no pacote | Harness de produto e bridge | 7.2 | `product-harness.ts` | PKG `bridge` (27 verificações) | Coberto |

### desktop-foundation (3 requisitos MODIFIED, 9 cenários)

| Requisito | Cenários | Tasks | Implementação | Evidência | Situação |
| --- | --- | --- | --- | --- | --- |
| Renderer sem autoridade irrestrita | Conteúdo tenta usar APIs privilegiadas; Catálogo limitado no pacote | 5.4, 6.6 | `src/preload/index.ts`, `webPreferences` inalteradas | AR (8); BC; PKG `catalogClosed` (globais `undefined`) | Coberto |
| Autorização e validação diagnóstica | Requisição autorizada; Remetente ou payload recusado; Diagnósticos concorrentes; Documento muda durante diagnóstico | 5.3 | `handleFoundationInvocation` | IF (10); PKG prova + probes negativos | Coberto |
| Ownership antes do armazenamento | Dois processos no mesmo perfil; Fechamento durante verificação; Fechamento com produto em atividade | 4.4 | `src/main/index.ts` (`requestSingleInstanceLock`, `shutdownStorage`) | SC "encerramento e drain"; PKG segunda instância, S8, `drain` | Coberto — ver W6 |

## Aderência ao design

| Decisão | Verificação | Resultado |
| --- | --- | --- |
| D1 SQLite embarcado, DELETE/EXTRA, `BEGIN IMMEDIATE`, lock 100 ms | `product-database.ts`; PRAGMAs lidos de volta e conferidos no pacote; 4 divergências falham fechado | Seguida |
| D2 Caminho, schema 1, codec 4, PKs independentes, payload por item | `product-schema.ts`; PD | Seguida |
| D3 Preflight antes de DDL, migração registrada, recovery do motor | `classifyProductTarget`, executor; PD/CR | Seguida |
| D4 Uma fila/conexão, revisões global e de conteúdo, claim | `coordinator.ts`, `task-storage-unit.ts`; SC | Seguida |
| D5 Catálogo de estado, snapshot paginado, eventos de invalidação, ressync | `state.ts` (contrato e main), `state-client.ts` | Seguida |
| D6 Documento/geração, origem real, erros fechados | `document-sessions.ts`, `protocol.ts` | Seguida |
| D7 Orçamentos, medição síncrona, encerramento | `QUEUE_LIMITS`, `STATE_LIMITS`, benchmark | Seguida |
| D8 Evidência e rastreabilidade | Este relatório e `docs/local-persistence-and-state-ipc.md` | Seguida |

Detalhes de implementação deixados em aberto pelo design e resolvidos sem alterar contrato: a paginação fica entre preload e main e os wrappers públicos devolvem o snapshot já reunido; revisões usam `bigint`; a publicação do evento ocorre depois de a unidade terminar, para o listener poder enfileirar leitura; falhas de ambiente (`READONLY`, `IOERR`, `CANTOPEN`, `PERM`) com rollback confirmado também forçam reopen validado.

## Problemas

### CRÍTICO

Nenhum.

### WARNING

- **W1 — Falhas de `COMMIT`, de `ROLLBACK` e de I/O em migração são simuladas.** São fault injection identificado (erro com a forma do `node:sqlite` em `unit:commit`, `unit:rollback` e `migrate:before-commit`). Disco cheio é erro real do motor provocado por `max_page_count`, não volume físico cheio; permissão é atributo somente leitura. Não há falha real de dispositivo. *Recomendação:* aceitar como nível de evidência desta Change ou autorizar uma prova em volume controlado (por exemplo, VHD pequeno) numa Change futura.
- **W2 — Espera de lock observada acima de 100 ms.** `busy_timeout` efetivo é 100 (conferido no pacote), mas a recusa foi observada em ~170 ms num teste local porque o motor dorme em passos; o teste automatizado (`SC` "lock real") aceita até 1,5 s para não ser instável. A espera é finita e sem retry. *Recomendação:* aceitar a leitura "espera configurada de 100 ms" do cenário "Lock e fila excedidos" ou pedir ajuste do texto da spec no archive.
- **W3 — Kill de processo não é prova de falha de energia; não houve instalação com dados de produto.** As provas de interrupção encerram um processo com o sistema operacional vivo. O Setup não foi executado, portanto upgrade/uninstall/reinstalação com o banco de produto e a conta padrão dedicada não foram exercitados (a TFA-002 cobriu isso só para a fundação). *Recomendação:* registrar como pendência da TFA-011/012 ou autorizar uma prova instalada específica.
- **W4 — Reconciliação de 30 s/foco e crash do renderer só verificados em unidade.** O intervalo e o foco são exercitados com relógio e foco fictícios (`CL`); o `render-process-gone` está ligado em `src/main/index.ts` mas não foi provocado em runtime real (reload e fechamento foram, no pacote). *Recomendação:* acrescentar ao harness um crash forçado da superfície de teste quando a TFA-004 trouxer uma UI inscrita.
- **W5 — Bloqueio do main no pior caso de `saveMany`.** Substituir 10.000 tarefas num commit bloqueia o event loop por ~0,43–0,6 s neste hardware (heartbeat máximo 593 ms). O design manda medir esse caso sem dividir o commit e o aplica o alvo de 100 ms às páginas e mutações representativas, que ficaram abaixo de 10 ms. Além disso, o conjunto de 1.000 tarefas tem 2,6 MiB: interpretei o piso de 20 MiB como exigência do conjunto de 10.000. *Recomendação:* confirmar essa leitura; reavaliar o bloqueio na TFA-007, quando a importação usar essa operação.
- **W6 — Fechamento pela janela depois do cenário `bridge` e CI não executada.** Depois que o harness cria e destrói superfícies de teste, o pedido de fechamento do sistema (`taskkill` sem `/F`) não encerrou o processo; a saída normal desse cenário passou a ser pedida ao próprio harness (`app.quit()` real, com before-quit e drain). O fechamento pela janela é verificado no cenário S8 com o banco de produto aberto e passa. A causa no harness não foi isolada. Separadamente, o smoke ampliado (com benchmark e limites de tempo dependentes de hardware) ainda não rodou no runner da CI, pois nada foi enviado ao remoto. *Recomendação:* investigar o fechamento com múltiplas superfícies antes da TFA-008/009 (primeiras a ter mais de uma janela) e observar o primeiro run da CI; se o runner for mais lento que os alvos, usar `--skip-bench` na CI mantendo o gate local.

### SUGESTÃO

- **S1 — Harness no bundle de produção.** `src/main/harness/` vai no `app.asar`. Só executa com perfil `test` (exatamente um `--foundation-test`) e `--product-harness=…`, grava apenas dados fictícios no perfil `test` e não adiciona canal ao preload — o mesmo padrão do smoke da TFA-002. Avaliar excluí-lo do build de distribuição na TFA-011.
- **S2 — O smoke da fundação agora cria o banco de produto (vazio) no perfil `test` real.** Os cenários S1–S9 usam `%LOCALAPPDATA%\TaskFlowApp\profiles\test`, como na TFA-002; como o app abre o banco de produto na partida, um `taskflow.sqlite` vazio passa a existir ali. Os cenários de produto usam `LOCALAPPDATA` temporário. Considerar mover também os cenários S1–S9 para a pasta temporária.
- **S3 — Ordem autorização × validação no diagnóstico.** Remetente não autorizado com payload inválido agora recebe `UNAUTHORIZED` (antes `INVALID_REQUEST`), alinhado ao estado. Os dois continuam recusados antes de qualquer efeito e o shape não mudou.
- **S4 — Modo de desenvolvimento não exercitado.** `npm run dev` (origem loopback) não foi iniciado nesta sessão; a origem dev é coberta por testes de unidade e a recusa de origem dev no pacote, também.
- **S5 — Arquivo de zero bytes após criação interrompida bloqueia a abertura.** É a decisão aprovada (D3) e está testada; fica o registro de que a recuperação desse caso depende de uma Change futura de reparo explícito.

## Garantias de escopo

- **Não implementado, por decisão do recorte:** comandos de criar/editar/status, UI de tarefas, abertura externa de URLs, geração de recorrência, política de retenção da lixeira, undo funcional, backup/importação, scheduler/notificações, bandeja, captura, atalhos e IA.
- **Sem mudança material:** nenhum worker, WAL, driver, dependência, runtime ou lockfile alterado; nenhum orçamento relaxado.
- **Dados:** somente fictícios; perfis temporários nos testes e no harness de produto; nenhum dado real, credencial ou conteúdo sensível em logs, repositório ou evidências.
- **README:** não atualizado; conforme AGENTS.md (itens 38 e 43) ele é ajustado ao arquivar, depois da aprovação deste relatório.

## Arquivos da implementação

- **Núcleo portável:** `src/domain/{task,task-recurrence,task-reminders,task-subtasks,task-trash}.ts`; `src/application/storage/{task-storage-error,revisions,stored-task-codec,unit-of-work,task-storage-unit}.ts`; `src/application/state/{snapshot-paging,snapshot-assembler,state-client}.ts`; `src/contracts/{state,text,desktop-api}.ts`.
- **Main:** `src/main/storage/{sqlite-errors,product-schema,product-database,coordinator}.ts`; `src/main/ipc/{document-sessions,state}.ts`; `src/main/harness/{fixtures,product-harness}.ts`; alterados `index.ts`, `ipc/foundation.ts`, `profile.ts`, `protocol.ts`.
- **Preload e contratos alterados:** `src/preload/index.ts`, `src/contracts/foundation.ts`, `src/renderer/src/env.d.ts` (somente o tipo da bridge).
- **Testes:** 11 arquivos de teste novos em `tests/application`, `tests/contracts`, `tests/main` e `tests/preload`, mais 4 de suporte em `tests/support`; 4 existentes adaptados.
- **Automação e configuração:** `scripts/smoke-packaged.mjs` ampliado; `tsconfig.{contracts,main,preload,tests}.json` passam a incluir `src/domain` e `src/application`.
- **Documentação:** novo `docs/local-persistence-and-state-ipc.md`; atualizados `docs/architecture.md`, `docs/test-strategy.md`, `docs/parity-matrix.md` e `docs/roadmap.md`.
