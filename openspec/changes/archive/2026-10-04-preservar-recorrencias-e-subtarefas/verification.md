# Relatório de verificação — preservar-recorrencias-e-subtarefas (TFA-005)

**Data:** 2026-10-04 · **Branch:** `codex/tfa-005-preservar-recorrencias-e-subtarefas` (base
`64fe7adc42b7eb0f4435c02970363f7d6b060e3f`, HEAD pré-apply `b550b68095609efeefe218c24b9aee6c409edc47`)
· **Método:** `openspec-verify-change` + execução real dos gates, do pacote e do smoke no Electron
empacotado fictício. Nada foi arquivado, consolidado, commitado, enviado ou instalado.

## Summary

| Dimensão | Status |
| --- | --- |
| Completeness | **44/44 tasks**; 38 requisitos (17 ADDED, 21 MODIFIED) + 1 RENAMED; 98 cenários |
| Correctness | 38/38 requisitos com implementação mapeada; 98/98 cenários cobertos por código+teste (automático); U01 humano pendente |
| Coherence | Design D1–D10 seguido; um desvio material de performance registrado (D10 herdado) |

## Escopo verificado

- 6 deltas de spec: `desktop-task-recurrence` (9 reqs ADDED), `desktop-task-subtasks` (5 ADDED),
  `desktop-task-management` (6 MODIFIED), `desktop-state-ipc` (8 MODIFIED + 1 RENAMED),
  `desktop-foundation` (1 MODIFIED), `local-task-persistence` (6 MODIFIED).
- 44 tasks em `tasks.md`, todas com evidência de código/teste/pacote.
- Artefatos aprovados (proposal/design/deltas/tasks) e design D1–D10 como contrato de verificação.

## Completeness

**Task Completion:** `openspec status` e `tasks.md` em **44/44** (100%). Nenhum arquivo de
rastreamento indisponível; os oito grupos entregaram código, testes e documentação.

**Spec Coverage (implementação localizada):**

| Capability | Requisitos | Evidência principal |
| --- | --- | --- |
| desktop-task-recurrence | 9 ADDED | `src/domain/task-recurrence.ts`, `task-draft.ts`, `src/application/tasks/task-commands.ts` |
| desktop-task-subtasks | 5 ADDED | `src/domain/task-subtasks.ts`, `task-draft.ts`, `TaskForm.vue`, `TaskCard.vue` |
| desktop-task-management | 6 MODIFIED | `TaskForm/TaskCard/TaskManager/date-time/task-labels` + comandos |
| desktop-state-ipc | 8 MODIFIED + rename | `src/contracts/{tasks,state}.ts`, `src/main/ipc/{tasks,state}.ts`, `snapshot-*`, `task-client` |
| desktop-foundation | 1 MODIFIED | `src/preload/index.ts`, `desktop-api.ts` (nove wrappers) |
| local-task-persistence | 6 MODIFIED | `product-schema.ts`, `product-database.ts`, `unit-of-work.ts`, `task-storage-unit.ts` |

## Correctness

**Requirement Implementation Mapping:** todos os requisitos ADDED/MODIFIED têm implementação no
main/domínio/renderer; o RENAMED (`Comandos aceitam somente intenções de tarefas autorizadas`)
preserva o comportamento do requisito original com o catálogo ampliado. Nenhuma divergência de
intenção foi encontrada; o parser recusa parâmetros de frequência alheia (D6) — defeito apontado na
verificação e corrigido antes da entrega (`src/contracts/tasks.ts`, `src/domain/task-draft.ts`).

**Scenario Coverage:** 98/98 cenários têm implementação e teste correspondente (unitário,
DOM ou empacotado), exceto a validação **humana** de acessibilidade (U01), que permanece como
limite de prova registrado. Rastreabilidade R01–V01 na seção final.

## Coherence

**Design Adherence:** D1 (reuso seletivo/main dono), D2 (calendário e resultado finito), D3 (âncora,
portadora única, fechamento atômico), D4 (duas revisões persistidas), D5 (subtarefas/drafts), D6
(catálogo v2 fechado), D7 (interface/precisão/cancelamento), D8 (guarda de lembretes), D9 (contratos
futuros sem undo/lixeira funcionais) e D10 (aceitação/evidência) estão refletidos no código e nos
testes. Desvio: o orçamento D10 herdado segue reprovado e piorou — ver WARNING 1.

**Code Pattern Consistency:** TypeScript estrito sem `any`, domínio/aplicação portáveis (sem
Vue/Electron/Node), erros por discriminante sem mensagens arbitrárias, testes em pt-BR no padrão
existente, arquivos novos com cabeçalho de origem. Sem desvios relevantes.

## Issues

### CRITICAL

Nenhum.

### WARNING

1. **D10 herdado reprovado, com melhora real (gate retido).** `ui-bench` 10.000 (re-execução limpa
   no pacote): interações p95 **661,6 ms** (histórico TFA-004 521,5 ms; medição anterior 783,8 ms)
   e heartbeat **636,1 ms** (histórico 578,9; anterior 865,6), contra ≤500 ms e ≤250 ms. A redução
   de DOM (`v-if` na lista de subtarefas, −29% de nós: 453.401 → 323.466) reduziu o p95 em 16% e o
   heartbeat em 27%; o custo bruto do Chrome para reordenar os mesmos 10.000 nós é ~940 ms nesta
   rodada, então o alvo de 500 ms está na fronteira física da reordenação completa. Montagem
   2.599,87 ms (≤5 s), 10.000 cartões completos e subtarefas p95 177,7 ms (≤500 ms) passam. O
   smoke termina com código 1 de forma intencional; nenhum gate foi removido, nenhum registro
   truncado e nenhuma virtualização foi adicionada. **Proposta aprovada em princípio pelo usuário,
   pendente de números:** revisar formalmente o orçamento de reordenação completa (ex.: p95 ≤ 700 ms
   e heartbeat ≤ 700 ms, mantendo montagem ≤5 s e cartões completos) ou aprovar Change de janela de
   renderização.
2. **Varredura de portadora melhorada, ainda acima da referência de mutação.** A leitura leve de
   `seriesId`/`recurrence` (sem decodificar o payload inteiro) reduziu o fechamento/edição de
   portadora de 198,66 ms para **141,71 ms** (10.000 tarefas, 23,9 MiB; 1.000: 18,44 ms); a
   referência de mutação do D10 é ≤100 ms e as 200 mutações representativas ficam em p95 2,93 ms.
   **Recomendação:** cobrir fechamento/varredura com um orçamento próprio (ex.: ≤250 ms) na mesma
   revisão do D10, ou aceitar o registro como está.
3. **Prova humana de acessibilidade pendente de execução.** O roteiro
   [a11y-manual-checklist-tfa005.md](../../../docs/a11y-manual-checklist-tfa005.md) foi entregue
   (teclado, diálogo SKIP/END, focusout, checkbox/busy, zoom 200%, escala Windows, contraste e
   leitor de tela). A cobertura automatizada limita-se a DOM/teclado/contraste/zoom; sem execução
   humana, permanece registrado para a TFA-012.

### SUGGESTION

1. Avaliar, em revisão de performance, um orçamento próprio para fechamento/varredura de série
   separado do p95 das mutações básicas, hoje medidos no mesmo relatório do bench.

## Evidências dos gates (execução real)

| Gate | Resultado |
| --- | --- |
| `npm run validate` | lint sem warnings; 5 typechecks; **39 arquivos / 596 testes + 11 skipped**; build main/preload/renderer ok |
| `openspec validate --all --strict --no-interactive` | **7/7** (INFO preexistente de requisito longo) |
| `openspec validate --archived --strict --no-interactive` | **4/4** |
| `npm run package:win` | pacote NSIS x64 sem Setup executado |
| `npm run verify:package` | OK — ASAR 12 arquivos na allowlist, sem addon/updater/segredos, `asInvoker`; hashes em `docs/packaged-evidence-tfa005.md` |
| `npm run smoke:packaged` | migração/kill, bridge (27), bench (gate D10 de mutação/página ok; varredura 141,71 ms), tasks, recurrence 21/21 e a11y **PASS**; **FAIL somente no D10 herdado de UI**; a rodada completa sofreu stall externo no `ui-bench` e a medição foi refeita isolada e limpa (`release/ui-bench-tfa005-clean.json`) |

Fingerprint efetivo no pacote: Electron 44.5.1, Node 24.21.0, SQLite 3.53.4, schema SQL 2,
PRAGMAs DELETE/EXTRA/foreign_keys/100 ms. Migração 1→2: kill antes/durante/depois do commit deixa
SQL 1 ou SQL 2 íntegro, leitor antigo recusa sem downgrade e a global avança uma vez.
Evidência bruta em `release/product-harness-evidence.json` (não versionado).

**Origem preservada:** extensão em `C:\QSI\Workspaces\taskflow-extension` somente leitura, HEAD
`a763e7a0d646c664ecd4f979528bc2c3589fa8c4` e worktree limpo; nenhum arquivo, build, teste ou
alteração de Git foi feito lá. Nenhuma dependência nova; nenhum dado real.

## Rastreabilidade R01–V01

| Critério | Evidência |
| --- | --- |
| R01 | `tests/domain/task-recurrence.test.ts`, `task-draft-advanced.test.ts`, `tests/contracts/task-command-contract.test.ts`, `tests/application/task-commands.test.ts` |
| R02 | `tests/domain/task-recurrence.test.ts` + `task-recurrence-tz.test.ts` (fim de mês, leap, fase, now/until, perdas) |
| R03 | `task-recurrence-tz.test.ts` (UTC/São Paulo/Nova York, 23/25 h, gap, repetição), `tests/renderer/date-time*.test.ts` |
| R04 | `tests/domain/task-draft-advanced.test.ts` (adiar/retornar, regra+prazo, omitir/null), `tests/renderer/task-form.test.ts` |
| R05 | `tests/domain/task-recurrence.test.ts` (próxima pura), `tests/application/task-commands.test.ts` (DONE/SKIP/END/fim natural/cópia), harness `recurrence` |
| R06 | `tests/application/task-commands.test.ts` (escolha/END), `tests/renderer/task-manager.test.ts`, `task-list.test.ts` (diálogo/focusout), harness `recurrence` |
| R07 | `tests/main/storage-crash.test.ts` (kill), `tests/application/task-commands.test.ts` (falha entre writes), `tests/main/storage-coordinator.test.ts` (commit sem resposta/UNCERTAIN), smoke barreiras |
| R08 | `tests/application/task-commands.test.ts` (duas sessões/portadora duplicada), `tests/main/storage-coordinator.test.ts`, harness `recurrence` (`staleConflicts`/`noThirdTask`) |
| S01 | `tests/domain/task-subtasks.test.ts`, `task-draft-advanced.test.ts`, `tests/renderer/task-form.test.ts` |
| S02 | `tests/domain/task-subtasks.test.ts`, `tests/application/task-commands.test.ts`, `tests/renderer/task-list.test.ts`, harness `recurrence` |
| S03 | `tests/application/task-commands.test.ts`, `tests/application/task-storage-revisions.test.ts`, `tests/renderer/tasks-store.test.ts` |
| U01 | `tests/renderer/*` (DOM/teclado/foco/contraste), smoke `a11y` (zoom 200%, strings, foco); **prova humana pendente** |
| I01 | `tests/contracts/*`, `tests/main/ipc-*`, `tests/application/state-client.test.ts`, `snapshot-paging.test.ts`, `tests/preload/bridge-catalog.test.ts`, harness `bridge`/`recurrence` |
| C01 | `tests/application/task-storage-revisions.test.ts` (reversão por conteúdo/claim), `tests/application/task-commands.test.ts` (D8); nenhum undo/lixeira/notificação entregue |
| V01 | `tests/domain/task-recurrence.test.ts` (32.768/overflow), smoke (migração/kill/bench/ui-bench), gates acima |

## Pendências e limites

- **Aprovação explícita** deste relatório é pré-requisito do archive; o README final, a consolidação
  de specs e o commit/PR só ocorrem após essa aprovação.
- D10 herdado (WARNING 1) e custo da varredura (WARNING 2) exigem decisão humana; prova humana de
  acessibilidade (WARNING 3) permanece para a TFA-012.
- Setup, instalação corporativa, distribuição, notificações, bandeja e atalhos **não** foram
  exercitados; nenhuma afirmação de “smoke verde” é feita enquanto o gate D10 estiver reprovado.
- Archive, consolidação de specs, README antecipado, commit/push/PR/merge e próxima Change não
  foram executados.

## Final Assessment

Nenhum crítico. 3 warnings **não bloqueantes por decisão humana registrada** (D10 herdado com
proposta de orçamento; varredura com orçamento próprio proposto; prova humana com roteiro entregue
e execução pendente) e 1 sugestão. As duas otimizações aprovadas na revisão (v-if e leitura leve)
foram implementadas e re-medidas. Pronto para **archive** conforme a autorização explícita do
usuário; archive/commit/push/PR executados somente no pedido correspondente.
