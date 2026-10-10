# Roteiro de homologação desktop — TFA-012

**Change:** `homologar-paridade-e-primeira-versao-desktop` · **Resultados e matriz:** [desktop-homologation-results.md](desktop-homologation-results.md) · **Candidato:** C `0.2.2` (predecessor B′ `0.2.1`/`1195277`, ver seção 7) · **Aplicado em:** 2026-10-10.

Este roteiro fixa pré-condições, passos, oráculos, camadas, limites e fixtures das jornadas H01–H16. Cada execução é registrada na matriz de resultados com status próprio (`PASS`/`FAIL`/`NOT_RUN`/`BLOCKED`/`DISPENSADO`); nenhum resultado é herdado de campanhas anteriores. A fonte das decisões é o [design da Change](../openspec/changes/homologar-paridade-e-primeira-versao-desktop/design.md) (D1–D8) e os deltas de specs.

## 1. Modos de execução (D3)

| Modo | Condição/destino | Prova e limite |
| --- | --- | --- |
| **A — automatizado** | Runtime empacotado em cópia própria; `--foundation-test`; `LOCALAPPDATA` temporário do próprio smoke em **todas** as fases (isolamento integral da task 3.2 via `scripts/smoke-environment.mjs`); raízes/PIDs próprios. | UI/preload/IPC/SQLite/arquivos reais e adapters declarados. Nunca toca o perfil prod real; sem Setup nem alegação nativa de produção. |
| **B — instalado/test** | Instalação autorizada; exe do root instalado com hash conferido; `--foundation-test`; root temporário fictício próprio (nunca o perfil `test` preexistente desconhecido). | Jornadas comuns e diálogos efetivamente observados. Registrar mocks/identidade `test`; sem PASS de toast/COM/startup. |
| **C — instalado/prod** | Apenas com execução autorizada **e** perfil canônico `prod` confirmado exclusivamente fictício antes de ler conteúdo. | Provas nativas por UI/gesto e manutenção autorizada. Não redirecionar roots/identidade, mover/copiar/limpar perfil pessoal nem habilitar harness em prod. |

Suspensão/startup/offline reais dependem de autorização compatível com a máquina; sem ela, registrar simulação/`NOT_RUN` com alcance. Nunca encerrar sessão, desligar a máquina, remover Node/npm ou alterar políticas/HKLM/Known Folder.

## 2. Fixtures fictícias e identificadores

- **Prefixo de fixture:** `TFA012-*` para dados criados por esta campanha (tarefas, séries, markers e sentinelas). Fixtures do harness já existentes mantêm seus IDs.
- **T0:** `2026-10-10T12:00:00.000Z` — referência fixa para datas relativas dos roteiros (agenda, retenção, graça). Nada depende do relógio da máquina além do necessário.
- **URLs:** somente `https://example.invalid/tfa012/...` (nunca resolvidas) e destinos locais fictícios próprios.
- **Pessoas/textos:** nomes inventados (“Pessoa Fictícia A/B”), textos Unicode/emoji dentro dos limites, títulos nos extremos 200/4.000/120/10×30.
- **Credencial de IA:** sentinela fictícia própria (nunca uma chave real); usada apenas em fixture local do probe DPAPI e no cenário `ai` (transporte fake).
- **Backups:** fixtures v1–v4 já existentes em `tests/fixtures/backups/`; nenhum arquivo do perfil pessoal é exportado, importado ou citado.
- **Volumes:** 1.000/10.000 tarefas fictícias + 100 na lixeira, geradas pelo próprio harness/bench em diretório de prova.
- **Sentinela de clipboard (só em prova humana B/C):** valor fictício conhecido (`TFA012-SENTINELA`/URL `example.invalid`), copiado explicitamente no passo; nunca ler conteúdo preexistente nem outra janela.
- **Destinos:** exclusivamente roots temporários próprios (smokeRoot e profileRoot fictícios), nunca caminhos do perfil pessoal.

## 3. Clocks, fusos, perfis e cleanup

- **Clock/fuso:** relógios controlados por portas fake e testes de fuso em **subprocesso** com `TZ` fixado (padrão já usado em `tests/renderer/date-time.test.ts`/`date-time-tz.test.ts`), sem alterar o fuso do SO. Datas relativas a T0.
- **Condição de perfil:** modo A usa `--foundation-test` (perfil `test`) com `LOCALAPPDATA` fictício; modo C exige confirmação de perfil `prod` exclusivamente fictício **por metadados antes de ler conteúdo** (perfil inexistente/vazio confirmado pode receber apenas fixtures). Sem confirmação → `BLOCKED`/`NOT_RUN`, sem semear, mover, limpar ou usar hook de teste em produção.
- **Processos:** kill somente de PIDs criados pelo próprio teste, validados pela barreira/PID registrado; nunca processos pessoais ou de terceiros.
- **Destinos e limpeza:** remover somente diretórios temporários próprios (smokeRoot, cópias de teste, stages de prova); nenhum destino pessoal é tocado. A cópia de teste do smoke recebe a ACE aprovada restrita (S-1-15-2-1) só nela.
- **Falha de energia e kill:** o kill em barreira (fault-injection) encerra somente o processo de teste validado e é registrado como **simulado**, sempre distinto de queda de energia real — que não é executada nem alegada nesta campanha (AC05).
- **Evidência:** sanitizada (sem username/SID/chave/ciphertext/conteúdo de IA/paths pessoais); hashes de binários e JSON bruto ficam no stage temporário (`release/candidates/<build-id>`), não em arquivos versionados.

## 4. Candidato e predecessor

- **C `0.2.2`** (proposto, **ainda não construído**): fonte limpa com checkpoint Git local autorizado (sem push/merge), toolchain fixada (Node `24.21.0`, npm `11.21.0`, lockfile), build único `--publish never`, stage por versão/arquitetura/commit/run. O candidato só existe após a task 4.3; até então nenhum resultado desta campanha o apresenta como construído, aceito ou distribuível (D2/AC02).
- **B′ `0.2.1`/`1195277`:** predecessor completo, build-id `0.2.1-win-x64-1195277df63579aa244b0b76b8d889e112929594-pair-021-fix`, Setup SHA-256 `f10c308e59fe670d8124314faa338d1d44015326b0d01719a975b2234ac9df17`, Reader SHA-256 `6e34919d27244dd54293b4feb0d394222338a449df4f63150a9c8041188ce341`. Inspecionado por leitura (manifesto/Setup/exe/ASAR/Reader, task 2.1); o pin em `build/nsis/trusted-predecessors.nsh` reconhece exatamente essa versão/hash. A inspeção não é campanha de B′: nenhum resultado instalado é herdado dele.
- **Par de manutenção desta Change: B′→C** (pin atual). Os bytes de B′ permanecem preservados no stage (retenção local) e nenhum stage anterior é editado ou resselado.
- **Manutenção (H15):** upgrade B′→C, reparo e uninstall/reinstall somente com instalação autorizada e perfil exclusivamente fictício; a remoção do predecessor é recusada para processo próprio ativo/oculto (111), identidade estrangeira/futura (129) e procedência/desinstalador incompatível (131), sem kill e sem retry. O launcher normal de uninstaller com `exit 0` **não** é oráculo do resultado do filho (IR3) — o oráculo efetivo é o retorno do processo com `_?=`, o hash encadeado e a conferência de dados/bytes; nunca manutenção do perfil pessoal nem transição legada `0.1.0`.
- **Unsigned:** `UNSIGNED_APPROVED_FOR_CONTROLLED_PROOF`; nenhuma assinatura, updater ou publicação nesta campanha.

## 5. Jornadas H01–H16

Oráculos e limites por jornada; os testes ligados estão na coluna de maior camada automatizada. Extremos adicionais já cobertos pelos testes existentes das dependências são reutilizados, não duplicados.

### H01 — instalador e identidade no candidato
- **Rastreio:** P14; TFA-002 F01–F09, TFA-011 W01–W05; requisitos de `desktop-build-validation`/`windows-per-user-installation`.
- **Pré-condições/passos:** identificar C (manifesto/hashes), instalar/abrir no root per-user (modo B autorizado), conferir destino, binários, atalho, escopo asInvoker, inventário e recusa de destinos/argumentos impróprios; lançar segunda instância.
- **Esperado:** manifesto `asInvoker`/`uiAccess=false`, escopo por usuário, hashes instalados conferidos, segundo lançamento ativa o owner sem novo escritor; nenhuma elevação/serviço.
- **Camadas:** pacote (`tests/tools/verify-package.test.ts`, scripts `package:windows`/`verify-package`) e instalado (condicional B/C).
- **Limite:** conta realmente padrão/VM/segunda conta DISPENSADAS (decisão humana); `asInvoker`/CI não provam conta padrão.

### H02 — gerenciamento (criar, editar, status, pesquisa, filtros, datas)
- **Rastreio:** P01; TFA-004 G01–G18; `desktop-task-management`.
- **Passos:** criar tarefa mínima e completa; editar/cancelar; concluir/cancelar/reabrir; limites 200/4.000/120/10×30; quatro status e `completedAt`/no-op; pesquisa por título/descrição/pessoas/tags/subtarefas, combinar filtros e três ordenações; fechar/reabrir.
- **Esperado:** normalização/trim, defaults, limites aplicados na alteração, `completedAt` correto, busca sem `sourceUrl`/sem remoção de acentos, ordem determinística, datas UTC/local e fronteira 24h; draft íntegro em conflito/incerto.
- **Camadas:** portátil/DOM (`task-draft*.test.ts`, `task-queries.test.ts`, `task-status.test.ts`, `tests/renderer/task-manager.test.ts`), pacote (`tasks`, `parity`).
- **Limite:** G19 histórico é superado pelas funcionalidades integradas.

### H03 — recorrência
- **Rastreio:** P02; TFA-005 R01–R08/V01.
- **Passos:** diária/semanal/mensal dia 31/leap/DST/`until` inclusivo; concluir antes/depois do prazo; SKIP/END/cancelar diálogo; reabrir antiga; criar terminal com regra; duas ações da mesma base.
- **Esperado:** fechada + no máximo uma nova TODO num commit; uma portadora entre tarefas/lixeira; sem backlog/geração na leitura; próxima com IDs novos e campos preservados; TZ de subprocesso/clock fake (sem mudar o SO).
- **Camadas:** portátil (`task-recurrence*.test.ts`, `tests/application/task-commands.test.ts`), pacote (`recurrence`, `parity`).
- **Limite:** overflow/32.768 passos em relógio/fuso de subprocesso.

### H04 — subtarefas
- **Rastreio:** P03; TFA-005 S01–S03/U01.
- **Passos:** checklist até 20 itens: incluir, ordenar, renomear, marcar; formulário aberto durante marcação/alteração estrutural; pai terminal.
- **Esperado:** ordem/IDs/progresso corretos; toggle não altera status do pai; save após check conserva `done` atual, conflito estrutural/ABA não sobrescreve draft; item 21/título 201 rejeitados sem gravação.
- **Camadas:** portátil (`task-subtasks.test.ts`, `task-storage-revisions.test.ts`), renderer (form/list/store), pacote (`recurrence`, `parity`).

### H05 — lixeira e desfazer
- **Rastreio:** P04/P05; TFA-006 L01–L12.
- **Passos:** excluir/restaurar/esvaziar/cancelar; desfazer edição/status/exclusão e fechamento de série; gerada alterada; outra janela; fechar/reabrir.
- **Esperado:** 30×24h inclusivos e cap 100 (100→101, colisão/portadora em fixture); restore sem geração; undo único por documento, anterior+gerada atômicos, sem undo de criar/check/restore/import; claim isolado não bloqueia; alteração/check bloqueia.
- **Camadas:** portátil/aplicação (`task-trash.test.ts`, `trash-commands.test.ts`, `undo-registry.test.ts`), pacote (`trash`, `parity`, `crash`).

### H06 — backup
- **Rastreio:** P06; TFA-007 B01–B14.
- **Passos:** exportar com filtros ativos por diálogo (stub em A, real em B), cancelar; selecionar v1–v4; prévia; export preventiva; substituir/UNCHANGED/`tasks:[]`; mudar base entre prévia e confirmar; reabrir.
- **Esperado:** conjuntos por ID e todos os campos/listas/ordens/markers iguais após reopen; TTL 5min, CAS e invalidação global; inválido/futuro/UTF-8/tamanho/recursos recusados integralmente (RESOURCE_LIMIT válido no teto 20 MiB); destino anterior conservado antes do rename; `SAVED_WITH_WARNING` após efeito quando cabível; sem merge/lixeira/credenciais.
- **Camadas:** portátil (`backup-*.test.ts`), pacote (`backup`, `parity`); diálogo real separado (B).
- **Limite:** 20 MiB pode recusar por `RESOURCE_LIMIT` conforme estrutura; banco corrompido/futuro bloqueia sem reset.

### H07 — dados incompatíveis
- **Rastreio:** TFA-003 P04; TFA-011 W13–W15.
- **Passos:** abrir cópias fictícias com zero bytes, JSON inválido, SQLite truncado/corrompido/estranho, SQL/codec/configuração futura e downgrade.
- **Esperado:** bloqueio seguro com erro, bytes anteriores preservados, sem lista vazia/reset/DDL de conveniência; recuperação seletiva só em fixture controlada; nunca importar sobre banco bloqueado nem apagar auxiliares para contornar.
- **Camadas:** fixture/portátil (`product-database.test.ts`, `maintenance-fixture.test.ts`, `file-ai-config.test.ts`, `shortcut-preferences.test.ts`), pacote (`parity`/reopen).

### H08 — escrita concorrente ou interrompida
- **Rastreio:** TFA-003 P02–P06/P10, B11/B12.
- **Passos:** lock real, readonly, `SQLITE_FULL` em fixture, falha entre writes de tarefa/série/lixeira/backup, COMMIT/ROLLBACK incertos e perda de resposta.
- **Esperado:** anterior ou novo estado inteiro com revisão correta; falha confirmada não anuncia sucesso; fila recupera após causa transitória; incerto bloqueia até reopen, sem replay/rollback falso; kill só de PID de teste com fault injection identificado, sem encher disco físico nem alegar energia.
- **Camadas:** aplicação/integração (`storage-coordinator*.test.ts`, `storage-crash.test.ts`), pacote (`crash`, `drain`, `parity`).

### H09 — lembretes e ciclo de vida
- **Rastreio:** P07; TFA-008 M01–M12.
- **Passos:** AT/OFFSET até 10; fechar para bandeja/minimizar/Sair/reabrir; startup/retomada antes/exatamente/após a graça; toast/clique com filtros/draft e alvo removido; suspender/retomar.
- **Esperado:** graça inclusiva 300.000 ms e 300.001 ms sem aviso; claim persistido antes de no máximo uma tentativa, sem duplicidade; import/edição liquida `<= now` sem graça; fechar mantém owner; Sair impede agendamento; notificação bloqueada não anula commit.
- **Camadas:** portátil/aplicação (`reminder-processing.test.ts`, `reminder-mutation-matrix.test.ts`, `desktop-lifecycle.test.ts`), pacote (`reminders`, `lifecycle`, `parity`); toast/clique/COM reais somente em C autorizado.
- **Limite:** evento de powerMonitor simulado não é suspensão real; toast/COM/startup exigem perfil prod instalado.

### H10 — Quick Add
- **Rastreio:** P08; TFA-009 Q01–Q03.
- **Passos:** abrir singleton com draft/filtros no manager; criar com validação; alternar/minimizar/ocultar/reabrir; falhar save.
- **Esperado:** drafts independentes; sucesso só após ack+snapshot; falha/incerto preserva preenchimento; abertura não lê clipboard; sem IA/backup/lixeira no Quick Add; sem promessa de draft após Sair/crash.
- **Camadas:** renderer/pacote (`tests/renderer/quick-add.test.ts`, `two-surface-lifecycle.test.ts`, `entries`); B/C humano condicional.

### H11 — captura copiada
- **Rastreio:** P09; TFA-009 Q04–Q08.
- **Passos:** copiar sentinela fictícia (URL HTTP(S); texto curto/longo/Unicode; vazio/protocolo inválido); botão/atalho explícito; draft sujo e capturas repetidas; revisar/descartar.
- **Esperado:** URL isolada vira `sourceUrl` com título manual; texto normalizado com cortes avisados; recusa preserva draft; oferta com TTL 10min antes da apresentação e revalidação; nada salvo automaticamente; zero polling/leitura automática.
- **Camadas:** portátil/DOM (`clipboard-capture.test.ts`), pacote (`entries`, `parity`); clipboard humano com sentinela (B/C).

### H12 — atalhos globais
- **Rastreio:** P10; TFA-009 Q09–Q14.
- **Passos:** Ctrl+Shift+K/L; captura global desabilitada por padrão; personalizar/desativar; ocupar combinação por helper de teste próprio; sair/reabrir.
- **Esperado:** estado pedido/registrado distintos; conflito/falha mantém caminhos por botão e preferência íntegra; registro/foco globais observados **nesta conta**; cleanup só de helper/combinações do teste; Q13 antigo não é requisito de rerun.
- **Camadas:** portátil (`global-shortcuts.test.ts`, `shortcut-preferences*.test.ts`), pacote (`entries`), C/opt-in condicional.

### H13 — IA opcional
- **Rastreio:** P11/P12; TFA-010 AI01–AI15 (AI16 dispensado).
- **Passos:** usar produto sem IA/offline; mocks/loopback de OpenAI/Anthropic/CUSTOM; credencial fictícia; consentimentos separados; prévia; sugerir/editar/aceitar/descartar/cancelar/timeout/trocar config/suspender.
- **Esperado:** sem envio sem gesto/consentimento; texto exatamente previsto; uma requisição; resposta tardia descartada; nenhuma aplicação/salvamento automático; segredo protegido só no main; indisponibilidade/futuro/corrupção bloqueiam sem plaintext.
- **Camadas:** portátil/main (`ai-provider*.test.ts`, `ai-suggestion-service.test.ts`, `ai-loopback.test.ts`, `ai-task-form-suggestion.test.ts`), pacote (`ai`); probe DPAPI local fictício separado de fake e de pós-manutenção.

### H14 — acessibilidade, teclado e geometria
- **Rastreio:** P13/P14; G13–G15/U01/B14/Q12; TFA-013.
- **Passos:** teclado/foco/busy/erro/modais; setas sem save; Escape e focusout de CANCELLED recorrente sem diálogo; zoom 200%/nome/contraste/ícones; janela inicial (workArea primário, borda direita, ⅓ com clamp 360, altura útil), mover/redimensionar, hide/show, Sair/novo lançamento, recriação.
- **Esperado:** valores/ações observados; sessão viva conserva escolha, novo lançamento reaplica; Quick Add 480×560 intacto; DPI/leitor de tela/multimonitor somente quando observados (sintético não é prova humana).
- **Camadas:** portátil/renderer (`window-geometry.test.ts`, `contrast.test.ts`, a11y do smoke), B/C humano disponível.

### H15 — manutenção e paridade de dados
- **Rastreio:** TFA-011 W06–W15, P01–P07/P10/P11.
- **Passos:** par B′→C: upgrade/reparo/uninstall-reinstall com perfil fictício; conferir bytes e todos os campos/listas/markers/trash/preferences antes/depois/reopen; startup e retenção; credencial fictícia protegida.
- **Esperado:** retenção integral; startup OFF após reinstalar; opt-in/desativação externa preservados; guards de app ativo/oculto/duas superfícies sem kill; DPAPI local versus instalada distinguida; IR3 não é oráculo; estado impeditivo fica `BLOCKED`; nunca manutenção pessoal nem legado `0.1.0`.
- **Camadas:** fixture/main (`maintenance-fixture.test.ts`, `windows-metadata.test.ts`, probe DPAPI), instalado B/C autorizado.

### H16 — orçamento, volume e offline
- **Rastreio:** D10/D11, M12/G20, P01–P12.
- **Passos:** jornada principal sem backend/IA; offline simulado por transporte bloqueado (máquina realmente offline apenas se autorizada); medir 1.000/10.000 tarefas fictícias + 100 trash, bytes, memória, filas e heartbeat.
- **Esperado:** UI 1k montagem ≤2s/interações p95 ≤500ms/heartbeat ≤250ms; 10k ≤8s/≤2.500ms/≤2.500ms; subcontroles ≤500ms e cartões exatos; banco p95 página/mutação representativa ≤100ms/preflight ≤5s; grandes commits/varredura medidos separadamente; sem truncamento/relaxamento; falhas e repetições conservadas nos mesmos bytes/carga.
- **Camadas:** pacote (`ui-bench`, `bench`, `test:volume`, `reminder-volume.test.ts`); offline humano condicional.

## 6. Regressão de interação (percurso parity) e oráculos de teste

- **Cenário test-only `parity`** (novo, restrito ao perfil `test` e a root fake próprio): percurso integrado H02→H06/H09 pela UI/bridge reais, sem wrapper de IPC, writer paralelo ou hook de produção. União/parser/dispatch do harness aceitam somente o valor exato; cenário inválido, prod/dev ou root alheio não executam (tests/main/product-harness-args.test.ts + guards; perfil prod/dev recusado por `selectFoundationProfile`).
- **Sequência central executada pelo cenário:** criar tarefa completa com regra/OFFSET/checklist → marcar pela UI e salvar com `done` atual → concluir e conferir transferência/IDs/prazo esperado → desfazer a unidade e conferir ausência da gerada → concluir novamente/alterar gerada e conferir undo recusado (`GENERATED_CHANGED`) → excluir/restaurar sem geração → liquidar lembrete vencido por mutação (marker exato, futuro pendente) → preparar/exportar/reimportar APPLIED/UNCHANGED/prévia stale → conferir época invalidando oferta viva (UNDO_NOT_AVAILABLE) em duas superfícies → sair (Sair) e reabrir.
- **Oráculos externos:** conteúdo por campo/ID/ordem/marker/revisão (não só contagem/título), projeção completa pós-import contra o arquivo exportado, portadora única, atomicidade, CAS/epoch, claim/settlement sem aviso retroativo; dados esperados vêm dos literais de `src/main/harness/parity-fixtures.ts` e das fixtures/contratos, nunca de serializar o retorno como expectativa.
- **Reopen/cleanup do parity:** o cenário encerra por Sair e emite `summary` (revisão/tarefas/lixeira/digest do snapshot); o smoke executa o cenário `reopen` logo depois e compara revisão + digest entre processos. O cenário destrói a segunda superfície, restaura sessões/documentos e usa diretório de trabalho temporário próprio removido no `finally`; PIDs são encerrados só pelo runner.
- **Diálogos/notificações:** a escolha de arquivo é stub identificado (`dialog: 'stub'`), nunca apresentado como diálogo nativo; o scheduler fica suspenso no cenário (sem notificação retroativa real); notifier fake/notificação nativa permanecem no cenário `reminders` e na prova humana B/C.
- **Bindings por lacuna (D5):** extremos de H03/H05/H06/H07/H08/H09/H13 permanecem nos testes existentes (lista na seção 5 e na matriz); só a lacuna do percurso integrado é ampliada. Testes novos ligados a lacunas: `tests/tools/predecessor-pin.test.ts` (pin/versão), `tests/tools/smoke-isolation.test.ts` (efeitos de isolamento S1–S9), `tests/main/parity-fixtures.test.ts` (validade/expectativas das fixtures, reutilizando backups v1–v4) e `tests/main/product-harness-args.test.ts` (parser/dispatch do cenário).

## 7. Comandos, gate e evidência

- **Gates locais:** `npm run validate` (lint, cinco typechecks, testes, volume, build) com a toolchain fixada; OpenSpec estrito da Change; `git diff --check`.
- **Candidato:** `npm run package:win` (run único, `--publish never`) e `npm run verify:package` no stage exato; conferir manifesto/source-before/inventário/notices/manifests/hashes (task 4.3).
- **Smoke:** `npm run smoke:packaged` integral no mesmo stage, **sem** `--skip-bench`/`--entries-only`/`--ci-runner` como prova de prontidão; falhas conservadas e repetições justificadas nos mesmos bytes. No **runner hospedado**, o workflow usa `--ci-runner`: os orçamentos de tempo sensíveis à carga da máquina compartilhada (D10 de 10.000 e os gates de tempo do banco — mutação/página p95, preflight/drain) são medidos e reportados como **pendentes**, sem bloquear; os gates estruturais continuam reprovando e a **máquina de referência** mantém todos os gates rígidos.
- **Evidência bruta:** `release/candidates/<build-id>/` (manifesto, inventário, `product-harness-evidence.json`, hashes) e o arquivo de resultados da campanha; retenção local, sem segredo/dado pessoal, sem upload.
- **Registro:** matriz em [desktop-homologation-results.md](desktop-homologation-results.md) com status e vínculo a commit/stage/perfil/mocks/cleanup; conclusão final no `verification.md` da Change (task 6.3).
