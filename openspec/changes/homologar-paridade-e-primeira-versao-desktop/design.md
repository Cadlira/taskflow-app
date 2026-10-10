# Design

## Context

Ver [proposal.md](proposal.md) para motivação/escopo. Base: branch `codex/tfa-012-homologar-paridade-e-primeira-versao-desktop` em `ef803dc80cfab4333035211c472f11743f3368b3`, TFA-011 e TFA-013 integradas; OpenSpec1.14.0/spec-driven. Em 2026-10-10 existem scripts validate/package/verify/smoke e fixtures/testes; package ainda é0.2.1. Esta entrega é somente proposta; nada abaixo é evidência de execução TFA-012.

Fontes determinantes:

- [Matriz P01–P14](../../../docs/parity-matrix.md), [roadmap TFA-012/H01–H16](../../../docs/roadmap.md), [estratégia](../../../docs/test-strategy.md) e specs consolidadas em `openspec/specs/`.
- [TFA-011 proposal](../archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/proposal.md), [design](../archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/design.md), [tasks](../archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/tasks.md), [verification](../archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/verification.md), [campaign-results](../archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/campaign-results.md), [dispensas](../archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/closure-waivers.md). Decisões atuais R1–R7/IR1–IR3 prevalecem sobre recomendações históricas de CI/publicação.
- [TFA-009 dispensa](../archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/closure-waivers.md), [TFA-010 AI01–AI16](../archive/2026-10-07-migrar-provedores-ia-e-sugestao-de-subtarefas/verification.md), [TFA-008 D10](../archive/2026-10-06-migrar-lembretes-e-ciclo-de-vida-desktop/d10-budget-review.md) e [TFA-013 verification](../archive/2026-10-09-ajustar-geometria-inicial-da-janela/verification.md).
- Código lido: [profile](../../../src/main/profile.ts), [composição](../../../src/main/index.ts), [harness/parser](../../../src/main/harness/product-harness.ts), [smoke](../../../scripts/smoke-packaged.mjs), [package](../../../scripts/package-windows.mjs), [proveniência](../../../scripts/build-manifest.mjs), [pin atual](../../../build/nsis/trusted-predecessors.nsh). Testes relevantes constam da tabela D4.

Produto: SQLite2/codec4, backupv1–v4, renderer isolado, um escritor e bridge43/14. Fonte principal independente de Vue/Pinia/Electron; sem backend/conta obrigatória. O perfil test é explicitamente fictício; notificações nele são FAKE e startup/identidade/relay de produção são condicionados ao perfil prod. O par limpo TFA-011 antecede a geometria TFA-013; manifesto do pacote TFA-013 usa `source.clean:false`. Achado adicional no propose: smoke define os paths de prova/prod a partir do LOCALAPPDATA real (linhas54–55), não fornece LOCALAPPDATA temporário no testEnvironment inicial (linha668) e lista prod real (linha682); portanto a fase inicial não é inteiramente isolada como os cenários seguintes. Esse ponto será corrigido somente no script de teste no apply aprovado, antes de executá-lo.

## Goals / Non-Goals

**Goals:** concluir uma matriz auditável das jornadas integradas, mantendo conteúdo/revisões/atomicidade em erros e reabertura; separar métodos/camadas; conferir novo candidato limpo e manutenção compatível; corrigir contratos documentais obsoletos; permitir revisão precisa de prontidão local e lacunas.

**Non-Goals:** ampliar domínio/IPC/identidade, resolver pendências arquivadas por conveniência, modificar a extensão, usar perfil pessoal/IA real, repetir provas dispensadas de contas/Q13/AI16, alterar SO/políticas/arquitetura ou publicar. README/merge/archive não são entregas do apply inicial. Ausência de ambiente não motiva outra conta ou um novo modo de produção de teste.

## Decisions

### D1 — Escopo de conta e contratos da proposta

Decisão humana confirmada: **“Não e não precisa testar. Vamos usar apenas essa conta”**. A campanha usa somente a conta atual. Não cria VM/usuário, não exige token fora de Administrators/UAC ativo como pré-condição da TFA-012 e não alega essa prova por asInvoker/CI. F01–F09/W01–W15 são rastreios, não listas obrigatórias de rerun; parcelas históricas dispensadas permanecem DISPENSADO, com origem e impacto.

Os dois deltas evoluem capabilities existentes: validação recebe três requisitos ADDED e dois MODIFIED; gerenciamento recebe dois MODIFIED, copiados integralmente com cenários preservados. Nenhum requisito de recorrência/backup/lembrete/IA/instalação funcional muda. O nome histórico “Aceitação independente em conta padrão” permanece para preservar referências, mas seu contrato explicita a campanha padrão condicional e a exceção de conta atual.

Alternativas: somente build/smoke deixa alegações nativas sem prova; reexecutar tudo em nova conta/VM contraria decisão/dispensas. Escolha: evidência por jornada/camada, com limites explícitos no ambiente atual.

### D2 — Candidato0.2.2 e predecessor B′0.2.1

Escolha proposta para aprovação: novo candidato **C0.2.2**, posterior a0.2.1, inclui a geometria integrada e todo o produto atual. Não assume1.0 nem anuncia release. Predecessor: **B′0.2.1**, commit `1195277df63579aa244b0b76b8d889e112929594`, build-id `0.2.1-win-x64-1195277df63579aa244b0b76b8d889e112929594-pair-021-fix`, Setup SHA256 `f10c308e59fe670d8124314faa338d1d44015326b0d01719a975b2234ac9df17`.

Reader SHA256 `6e34919d27244dd54293b4feb0d394222338a449df4f63150a9c8041188ce341`: arquivo local e recibo foram conferidos por leitura em 2026-10-10. Isso identifica o predecessor, sem executar seu Setup ou certificar novamente sua campanha. Pin atual admite A0.2.0/f4e13085…; portanto C não pode prometer atualizar B′ sem atualizar o pin **somente para esse Reader/version**, após verificar manifesto/Setup/exe/ASAR/Reader, origem limpa e guards111/129/131 do predecessor. Testar correspondência, predecessor diverso/alterado e app ativo em fixture; não adicionar confiança por nome/versão ou relaxar guard. Se bytes/guarda não puderem ser conferidos, H15 fica BLOCKED, sem fallback para preview/legado.

Metadados futuros: alterar apenas versão0.2.2 em package e raiz/package correspondente no lockfile, sem reinstalar/trocar dependências. Manter appId/AUMID/GUID/CLSID/startup/perfis. Stage exato por versão/arquitetura/commit/run, manifesto/inventário/notices/manifests/hashes atuais; pipeline local `--publish never`, upload suspenso. Não editar nem resselar stages anteriores.

**Fonte limpa:** preparar todas as mudanças de código/teste/metadados/documentação planejadas, executar regressão anterior ao pacote e então usar checkpoint Git local **somente se autorizado no pedido de apply**. Sem autorização, continuar tarefas independentes e registrar BLOCKED para construir candidato limpo; não falsificar clean, excluir arquivos rastreados da prova ou commitar por inferência. No checkpoint, árvore precisa estar limpa e incluir esta proposta/TFA-013. Regeneração NSIS não pode introduzir diff incidental não explicado. Empacotar/verify/smoke com mesmo stage e registrar commit/checksums resolvidos. Resultados/evidências posteriores podem alterar só tracking/documentação, sem trocar bytes do candidato; mudança de payload/configuração exige novo checkpoint/candidato e reteste afetado.

Alternativas rejeitadas: usar0.2.1 de fonte suja, renomear Setup antigo, ou0.1.1/preview como predecessor. A numeração proposta e pin são escolhas revisáveis **antes do apply**, sem implementação nesta entrega.

### D3 — Perfis e efeitos: três modos explícitos

| Modo | Condição/destino | Prova e limite |
| --- | --- | --- |
| A — automatizado | Runtime empacotado em cópia própria; `--foundation-test`, LOCALAPPDATA temporário em todas as fases após o isolamento previsto em D5, raízes/testes e PIDs próprios | UI/preload/IPC/SQLite/arquivos reais e adapters declarados. Nenhum acesso ao perfil prod real. Sem Setup ou prova nativa de produção. |
| B — instalado/test | Somente após autorização da instalação; exe do root instalado/hash conferido, `--foundation-test` e root temporário de teste identificado pelo protocolo, sem reutilizar perfil test preexistente desconhecido | Execução instalada de jornadas comuns e diálogos quando efetivamente observados. Registrar mocks/identidade test; sem alegação de toast/COM/startup prod. Atalhos globais test-only só quando opt-in existente explicitamente autorizado. |
| C — instalado/prod | Apenas se a execução for autorizada **e** o perfil canônico prod for confirmado exclusivamente fictício. Perfil inexistente/vazio confirmado por metadados pode receber só fixtures; perfil existente exige confirmação de que todo conteúdo é fictício, antes de leitura de conteúdo | Provas nativas existentes por UI/gesto e manutenção autorizada. Não redirecionar roots/identidade, mover/copiar/limpar perfil pessoal ou habilitar harness em prod. Ausência da condição → NOT_RUN/BLOCKED com alcance limitado. |

A proposta escolhe protocolo conservador C condicional e fallback A/B declarados. O futuro apply não precisa descobrir uma nova estratégia: cada task condicional avalia a condição, executa apenas se atendida ou registra a razão/impacto. Isso não significa que sua parte nativa foi executada. Não se presume que a conta atual ou o perfil prod sejam fictícios.

Suspensão real, alteração de startup, manutenção/desinstalação e estado realmente offline precisam de autorização de execução compatível com esta máquina; caso ausente, usar eventos/transportes simulados já existentes e classificar. Nunca interromper sessão, desligar máquina, desinstalar Node/npm, alterar interface/política ou manipular registro estrangeiro. Clipboard humano só após copiar sentinela fictícia; não ler conteúdo preexistente para investigação. Não registrar username/SID/chave/ciphertext/descrição de IA em relatório.

### D4 — Jornadas, critérios e pontos de teste

O roteiro futuro `docs/desktop-homologation.md` e a matriz `docs/desktop-homologation-results.md` conterão pré-condições/passos/esperado por subcaso, com valores fake e T0. As descrições abaixo fixam os oráculos e os pontos já disponíveis; detalhes operacionais não inventam comando de produto. Todos os resultados começam NOT_RUN, sem PASS preenchido a partir de histórico.

| Jornada / rastreio | Oráculos obrigatórios e execução planejada | Ponto de teste existente / camada |
| --- | --- | --- |
| H01 · P14; TFA002 F01–F09/TFA011 W01–W05 | C/hash/per-user/asInvoker/inventário/atalho; segunda instância e destinos recusados. Conta padrão/VM/segunda conta dispensadas; Setup só em B/C autorizados | `tests/tools/verify-package.test.ts`, scripts package/verify; F/W nativos condicionais |
| H02 · P01; TFA004 G01–G18 | CRUD mínimo/completo e cancelamento; 200/4000/120/10×30, quatro status/completedAt/no-op; pesquisa sem sourceUrl/accent fold, AND/ordens, UTC/local/24h; draft íntegro em conflito/incerto | `task-draft*.test.ts`, `task-queries.test.ts`, `task-status.test.ts`, `tests/renderer/task-manager.test.ts`; `tasks`/bridge e B |
| H03 · P02; TFA005 R01–R08/V01 | Diário/semanal/mensal31/leap/DST/until inclusive; DONE/SKIP/END e cancelar; antiga reaberta/terminal com regra; no máximo uma próxima e uma portadora em tasks+trash; sem backlog/geração na leitura | `task-recurrence*.test.ts`, `tests/application/task-commands.test.ts`, `recurrence`; TZ de subprocesso/clock fake, sem mudar SO |
| H04 · P03; TFA005 S01–S03/U01 | Até20×200/IDs locais/ordem/done/progresso; pai independente; save após check conserva done, estrutura/ABA conflita sem trocar revisão silenciosamente | `task-subtasks.test.ts`, `task-storage-revisions.test.ts`, renderer form/list/store; `recurrence`/B |
| H05 · P04/P05; TFA006 L01–L12 | Trash exatamente30d fica,30d+1ms expira; cap100/colisão/restore sem geração; undo único por documento, anterior+gerada atômicos, check/edição da gerada impede e claim isolado não; sem undo criar/check/restore/import | `task-trash.test.ts`, `trash-commands.test.ts`, `undo-registry.test.ts`, `trash`, crash/reopen e B |
| H06 · P06; TFA007 B01–B14 | v1–v4/projeção completa/ordens/IDs/markers; diálogo/cancel/20MiB/+1/encoding/RESOURCE_LIMIT; prévia5min/CAS/export preventiva/APPLIED/UNCHANGED/tasks:[]/epoch; write anterior ou warning após rename, sem merge/trash/credenciais | `backup-comparison.test.ts`, `backup-file*.test.ts`, `backup-restore*.test.ts`, `backup-manager.test.ts`, `backup`; diálogo stub versus B real |
| H07 · TFA003 P04/TFA011 W13–W15 | Zero bytes/SQLite truncado/corrompido/estranho/SQL-codec-config futura/downgrade: erro seguro e bytes iguais, sem reset/lista vazia; recuperação seletiva apenas fixture, sem apagar auxiliares/usar import como reparador | `product-database.test.ts`, `maintenance-fixture.test.ts`, `file-ai-config.test.ts`, `shortcut-preferences.test.ts`; A/fixture |
| H08 · TFA003 P02–P06/P10/B11–B12 | Locks/readonly/SQLITE_FULL controlados e falhas entre efeitos; anterior ou novo inteiro, sem replay, incerto bloqueado/reopen, fila recuperável; kill só próprio em barreira, não energia | `storage-coordinator*.test.ts`, `storage-crash.test.ts`, backup write/completion; A/crash |
| H09 · P07; TFA008 M01–M12 | Até10 AT/OFFSET/recorrência sóOFFSET; claim antes de tentativa, grace300000 inclusive/300001 sem aviso; mutação/import liquida<=now sem graça; close/minimize/Sair/reopen, suspend/resume, aviso bloqueado/clique/filtro/draft/obsoleto | `reminder-processing.test.ts`, `reminder-mutation-matrix.test.ts`, `desktop-lifecycle.test.ts`, `reminders`/lifecycle; toast/COM/startup somente C autorizado |
| H10 · P08; TFA009 Q01–Q03 | Singleton/drafts e filtros independentes, ack+snapshot, erro/incerto conserva, abrir não lê clipboard; memória no hide, sem promessa pós-Sair; Quick Add sem IA/backup/trash | `tests/renderer/quick-add.test.ts`, `two-surface-lifecycle.test.ts`, `entries`; B/C |
| H11 · P09; TFA009 Q04–Q08 | URL isolada→sourceUrl/título manual; texto curto/longo/Unicode/cortes avisados/vazio/inválido; draft sujo/oferta/revisar/descartar sem autosave/polling; limites e deadline fake | `clipboard-capture.test.ts`, `ipc-entries.test.ts`, `entries`; B/C clipboard com sentinela |
| H12 · P10; TFA009 Q09–Q14 | K/L defaults, captura global defaultOFF, preferências/rebind/falha/conflicto/cleanup próprio; registro/foco observado separado de portas; não rerun obrigatório Q13 antigo | `global-shortcuts.test.ts`, `shortcut-preferences*.test.ts`; `entries` e roteiro C/opt-in test existente se autorizado |
| H13 · P11/P12; TFA010 AI01–AI15 | Sem config/consentimento zero envio; mocks/loopback três providers, prévia exata/corte/vagas, cancel/timeout/troca config/suspend/late; aceitar só draft e salvar explícito; fake/native protection separadas; AI16 excluído | `ai-provider*.test.ts`, `ai-suggestion-service.test.ts`, `ai-loopback.test.ts`, `ai-task-form-suggestion.test.ts`, `ai`; probe DPAPI local fictício, sem alegar pós-manutenção |
| H14 · P13/P14; G13–G15/U01/B14/Q12/TFA013 | Teclado/foco/busy/erro/modais; setas sem save, Escape e focusout CANCELLED recorrente sem diálogo; zoom200/nome/contraste/ícones; workArea primário/⅓-clamp360/direita/altura útil/resize/hide-show/novo lançamento/recriação, Quick480×560 | `window-geometry.test.ts`, `contrast.test.ts`, renderer/a11y; B/C humano disponível, DPI/reader/multimonitor não observado não é PASS |
| H15 · TFA011 W06–W15/P01–P07/P10/P11 | Par B′→C/reparo/uninstall-reinstall, campos/listas/trash/markers/preferences e credencial fictícia protegida antes/depois; startup/retenção conforme contrato; guards app ativo/oculto/duas superfícies sem kill, IR3 launcher0 não é oráculo | `maintenance-fixture.test.ts`, `windows-metadata.test.ts`, probe fixture DPAPI; B/C/instalador só se autorizado, nunca manutenção pessoal/legado0.1.0 |
| H16 · D10/D11/M12/G20/P01–P12 | Jornada principal sem backend/IA; bloqueio de transporte versus máquina offline; 1k/10k+100trash/bytes/p95/heartbeat/charge/heap/CPU; sem remover Node ou cortar registros | `ui-bench`/bench, `test:volume`, `reminder-volume.test.ts`; A e offline humano condicional |

As verificações arquivadas TFA001 AC01–AC08 (documentais), TFA002 F/G (fundação), TFA003 P01–P12, TFA004 G01–G20, TFA005 R/S/U/I/C/V, TFA006 L01–L12, TFA007 B01–B14, TFA008 M01–M12, TFA009 Q01–Q14, TFA010 AI01–AI16 e TFA011 W01–W15 são fontes. AC documental da TFA001 não prova runtime; G19 “recursos futuros ausentes” não impede funcionalidades integradas. Q13/AI16 e cobertura dispensada de conta/Unicode/energia/logoff não são obrigatoriedade de repetição.

### D5 — Integração test-only e oráculos sem espelhar implementação

**Isolar antes de executar:** a fase inicial S1–S9 do smoke também deverá usar LOCALAPPDATA próprio sob smokeRoot, recalculando testProfileProof/prodProfileRoot e passando o ambiente a todos os filhos/cópias/negativas/lifecycle. Comparação de isolamento usa somente sentinela prod fictícia sob esse root, nunca inventário do prod real. Testar o limite por efeitos observados de paths/ambiente de launch e zero leitura/escrita/listagem fora das fixtures, não por mera busca de texto no script. Registrar todos os roots como temporários no roteiro/relatório; não alterar resolução de perfil em produção.

Adicionar somente a lacuna de percurso integrado: cenário `parity` na união/parser/dispatch existentes do harness e execução no smoke, restritos a perfil test, com root fake próprio e cleanup de PIDs próprios. Nenhum wrapper de IPC, writer paralelo ou hook prod novo. O cenário usa UI/bridge43/14 e unidades de fixture já restritas; dados esperados vêm de fixture/contratos, não de serializar o retorno como expectativa.

Sequência central: criar tarefa completa com regra/OFFSET/checklist → marcar e editar com done atual → concluir e conferir transferência/IDs → desfazer a unidade e conferir ausência da gerada → concluir novamente/alterar gerada e conferir undo recusado → excluir/restaurar sem geração → preparar backup/exportar/reimportar, incluindo UNCHANGED e preview stale → conferir epoch/marks/conteúdo → sair/reabrir e comparar estado inteiro. Duas superfícies/acks/revisões demonstram convergência; chamar serviços diretamente não é anunciado como teste de gesto. Scheduling/notifier fake evita aviso real e clock/barreiras controlam gatilhos.

Reutilizar testes existentes para extremos H03/H05/H06/H07/H08/H09/H13; ampliar somente lacuna observável do percurso ou metadados/profile guard. Não duplicar testes unitários só para contar cobertura. Teste negativo necessário do novo parser/dispatch: cenário inválido, prod/dev e root alheio não executam; fixture não alcança perfil pessoal. Não executar Q13 histórico nem criar fallback de foco manual. O roteiro humano atual possui passos próprios H10–H14, sem herdar o resultado do antigo harness.

### D6 — Orçamento e execução honesta

| Gate vigente |1.000 tarefas|10.000 tarefas|
| --- | --- | --- |
| Montagem UI |<=2s|<=8s|
| Interações p95 |<=500ms|<=2500ms|
| Heartbeat máximo |<=250ms|<=2500ms|
| Subcontroles p95 |<=500ms|<=500ms|
| Cartões completos |exatos1000|exatos10000|

Banco/página/mutação representativa p95<=100ms; preflight<=5s; benchmarks com100 trash/bytes (conjunto grande>=20MiB conforme baseline), grandes commits/varredura e memória medidos separadamente sem quebrar atomicidade. Demais M12/Quick Add/captura usam gates existentes; não substituir todos por D10 de UI. Arquivo backup tem teto20MiB e recursos adicionais128MiB/64profundidade/262144nós: volume de armazenamento não implica exportação desse volume garantida. No limite, RESOURCE_LIMIT válido é resultado esperado, não autorização de truncamento.

Executar smoke completo local sem `--skip-bench`, `--entries-only` ou `--ci-runner` como prova de prontidão. Rodada reprovada é conservada; repetir somente com razão concreta/carga controlada, mesmos bytes/flags/budgets, incluindo falhas no relatório. Não escolher apenas melhores tempos ou converter FAIL em WARN. Sem gate novo de energia nem obrigação de remover ferramentas desta conta.

### D7 — Formato de evidências e critérios AC01–AC08

Matriz Markdown pode linkar JSON bruto sanitizado emitido pelo harness em stage/temporário ignorado. Não exige novo serviço, banco ou dashboard. Campo mínimo por subcaso: `H/P/Change/criterion/requirement/scenario`, passos/pré-condições/esperado/observado, data, OS/build/arquitetura/hardware, versão/commit/clean/lockfile/build-id/hashes, exe realmente lançado/instalado, perfil/root tipo sem path pessoal, mocks/adapters, camada, método, status, bloqueio/dispensa e efeito no alcance, fixture/cleanup e link de evidência. Não gravar chave/ciphertext/conteúdo de IA/username/SID. Guardar hashes de binários; hash de segredo não é evidência pública necessária.

Status: PASS executado; FAIL observado; NOT_RUN não executado; BLOCKED condição recusada; DISPENSADO decisão humana identificada. Método: real/simulado/fault-injection/relatado; camada: portátil/DOM/IPC/pacote/instalado/humano. Um PASS simulado comprova só aquele método/camada. Relato sem passos/hash não se converte em artefato PASS. Dispensa de conta já confirmada não precisa ser perguntada de novo.

| Critério novo TFA012 | Condição de aceite | Rastreio |
| --- | --- | --- |
| AC01 | P01–P14/H01–H16 completos com requisitos/critério/camada/status/limite; nenhuma lacuna silenciosa | spec build “Homologação rastreia…”; tasks1/4/5 |
| AC02 | C0.2.2 limpo/versões coerentes/bytes e seleção exatos; B′ aprovado/pin exato ou bloqueio declarado de H15 | proveniência existente; D2/tasks2/4 |
| AC03 | Conteúdo/revisões/portadora/atomicidade/reopen/conflitos/erros/incompatível preservados; sem crítico de dados | fixtures + H03–H09/H15; tasks3/4 |
| AC04 | Jornadas funcionais existentes preservadas, IA mockada optional e sem autosave, entrada explícita/sem coleta indevida | H02–H14; tasks3–5 |
| AC05 | Conta atual, exclusões/dispensas preservadas; dados somente fictícios, nenhum perfil pessoal/provedor pago | spec “Fixtures…”/“Aceitação…”; D1/D3 |
| AC06 | Cada alegação nativa tem prova do candidato/perfil correspondente ou limita alcance; H15 sem pin/ambiente não vira PASS | spec “Integrações nativas…”; tasks5 |
| AC07 | Gates atuais/volume/D10 passes no candidato; skipped/falhas/repetições explícitos, sem afrouxamento | spec management “Evidências…”; D6/tasks4 |
| AC08 | Guias/matriz verdadeiros, deltas coerentes, verification para revisão com crítico/lacuna e conclusão limitada; aprovação antes archive, distribuição separada | spec “Relatório…”; D8/tasks6 |

Conclusões possíveis: **NAO_APTO** se gate/critico falha; **COBERTURA_LIMITADA_PARA_REVISAO** se falta prova/aceite de parcela que afeta o alcance; **APTO_PARA_USO_LOCAL_NO_ESCOPO_COMPROVADO** somente após gates aplicáveis, evidência adequada e diferenças revisadas, sem crítico. Nenhuma delas autoriza distribuição. NOT_RUN/BLOCKED não são checkboxes de execução concluída; tasks de avaliação condicional podem fechar somente com resultado/razão registrados, sem dizer que o teste foi executado. A aprovação do relatório pode aceitar limites explicitamente; aprovação de archive antigo não os aceita universalmente no novo candidato.

### D8 — Documentação vigente e histórico

Apply atualiza `docs/parity-matrix.md`, `docs/test-strategy.md` e guias existentes `windows-installation-and-maintenance.md`, `backup-migration-guide.md`, `quick-add-and-shortcuts.md`, `ai-assistance.md`, `desktop-task-management.md` e documentação de lembretes pertinente somente onde seu texto contradiz função/candidato/prova atuais. Adicionar roteiro/matriz atuais citados em D4, com assinatura unsigned, backup só tasks, retenção do perfil, recuperação seletiva, close/Sair e alcance de IA/nativos.

Não editar relatórios/dispensas arquivados para “corrigir” resultados. A seção Aplicação histórica D10 que cita1500 é apontada como inconsistência documental no guia atual, com tabela2500 aprovada e código vigente; a spec de gerenciamento deixa de afirmar “não há IA” e D10 antigo retido. Não rebaixar matriz de arquitetura original como se nunca houvesse planejamento nem remover seu contexto. README acompanha funcionamento real apenas após archive autorizado, AGENTS38/43; roadmap guarda etapas/datas/prompts.

## Risks / Trade-offs

- [Hash/waiver antigo anunciado como paridade] → candidato limpo, matriz por camada e histórico separado.
- [Perfil test mascara falha de toast/COM/startup] → D3 C condicional; fallback A/B com conclusão limitada.
- [Falha entre série/undo/backup/claim perde dado] → oráculo externo de todos os campos/revisões, unidades atômicas, CAS e reopen sem replay.
- [Benchmark/backup/DPAPI ou fase inicial do smoke invade perfil pessoal] → isolamento integral do script antes de executá-lo, roots/PIDs próprios e nenhuma leitura de conteúdo antes da condição fictícia; BLOCKED em dúvida.
- [Pin de B′ passa a confiar em outro uninstaller] → versão/hash exatos conferidos, guards existentes/negativas preservadas, sem fallback; manutenção separada da execução test.
- [Fonte suja por tracking ou NSIS regenerado] → checkpoint autorizado, comparar source-before/manifesto e parar candidato inválido, sem mascarar clean.
- [Carga da estação produz resultados oscilantes] → D6 conserva todas rodadas; uma repetição justificada não elimina a falha anterior.
- [Unsigned/política do SO impede uso] → falha explícita e alcance revisado, sem bypass/certificado novo.
- [Checkbox de avaliação vira prova executada] → status por subcaso e texto do relatório explicitam caminho executado, omitido ou dispensado.

## Migration Plan

1. Após aprovação explícita/apply, preparar protocolo/matriz, fixtures/parser/harness test-only e versão/pin propostos; usar dependências existentes. Qualquer alteração funcional de contrato exige nova revisão antes do ponto afetado.
2. Executar regressão pré-pacote em destinos fictícios; reconciliar documentação operacional sem inventar resultados. Obter autorização de checkpoint local caso ainda não exista e construir C limpo, sem push/upload.
3. Inspecionar e executar stage exato; coletar integração/reopen/erro/budget. Não execute Setup no propose, smoke ou CI automaticamente.
4. Avaliar modos B/C, autorização e perfil; executar somente provas autorizadas, registrar parcelas restantes. Conferir retenção lógica/bytes/DPAPI só quando fixture/perfil permitido, sem substituir dados pessoais. Predecessor B′ não é reinstalado/downgradado por conveniência se estado atual impedir o par.
5. Falha de instalação: preservar logs sanitizados e estado, reparar binários com candidato compatível íntegro conforme guia; nenhum rollback de dados/downgrade/limpeza automática. Backup transporta tasks, não reconstitui trash/credenciais/undo.
6. Gerar verification.md na Change via verify futuro, AC01–AC08/requisitos/cenários/tasks/bytes/resultados/limites; apresentar para aprovação. Archive/README/commit final/push/PR/merge/distribuição aguardam autorização correspondente, sem avanços automáticos.

## Open Questions

Somente fatos de execução que não mudam a abordagem: build/OS e disponibilidade de gestos humanos/DPI/leitor de tela na conta atual; estado instalado e confirmação de perfil fictício sem ler conteúdo pessoal; autorização dos efeitos B/C e do checkpoint no pedido futuro. D3 já define o resultado quando ausentes. Não são pedidos de nova conta, reabertura de Q13/AI16 ou licença para mudar arquitetura. C0.2.2/B′ e políticas de cobertura acima são escolhas propostas para aprovação; mudança dessas escolhas exige revisão antes do apply.
