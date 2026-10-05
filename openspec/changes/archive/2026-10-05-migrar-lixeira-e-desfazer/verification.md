# Relatório de verificação — TFA-006 (migrar-lixeira-e-desfazer)

**Change:** `migrar-lixeira-e-desfazer` — branch `codex/tfa-006-migrar-lixeira-e-desfazer`,
base `ab3ed688f025064c16ce155ff5220fe62f9dbc59` (PR #5). **Estado: entregue para revisão**
(apply executado; archive/commit/push/PR/merge/distribuição aguardam autorização).

Este relatório registra a aderência entre a implementação e os artefatos aprovados
(proposal/design/sete deltas/tasks), os gates executados, a rastreabilidade L01–L12 e as
pendências. **Não declara aprovação humana nem autoriza archive.**

## 1. Aderência aos artefatos

### 1.1 Deltas (39 requisitos, 115 cenários)

| Delta | Tipo | Requisitos | Cenários | Cobertura principal |
| --- | --- | ---: | ---: | --- |
| `desktop-task-trash` | ADDED | 8 | 21 | Política 30×24h/100, ordem `deletedAt`/revisão/ID UTF-16, identidade de entrada, confirmações MOVE/PERMANENT/EMPTY, restore condicionado, manutenção explícita e área acessível. |
| `desktop-task-undo` | ADDED | 11 | 22 | Uma oferta por documento, recibo capturado na unidade, token de uso único, reversão simples/série, restore condicionado, liquidação pura, encerramento/backup e orçamento. |
| `local-task-persistence` | MODIFIED | 5 | 19 | Unidades atômicas, colisão no restore, revisões (identidade nova no move), conflitos condicionais e leituras puras. |
| `desktop-state-ipc` | MODIFIED | 8 | 30 | Catálogo 17, tokens/contexto por documento, budgets, erros fechados, intenções autorizadas, decisões condicionais, ack+snapshot. |
| `desktop-foundation` | MODIFIED | 2 | 7 | Renderer sem autoridade (17 wrappers), ownership/encerramento com recibos invalidados. |
| `desktop-task-management` | MODIFIED | 3 | 10 | Foco/semântica, identidade/limites temporários, evidências por volume/ações reais. |
| `desktop-task-recurrence` | MODIFIED | 2 | 6 | Portadora única no plano final do restore/revert; contratos de lembretes/undo separados. |

Os nomes de requisitos/cenários anteriores foram preservados nos MODIFIED; nenhuma spec principal
foi consolidada nesta etapa (archive pendente).

### 1.2 Decisões D1–D11 e escolhas humanas

- D2/D3 (retenção, limite, ordem, identidade `content=g` sem SQL novo): implementadas em
  `src/domain/task-trash.ts` e `moveToTrashConditionally`; testes de fronteira e de substituição.
- D4 (confirmações, restore, manutenção; **escolha humana de recusar EMPTY stale**): base capturada
  no main, comparação de composição/identidades e recusa `CONFIRMATION_CHANGED`.
- D5 (recibo na unidade, reversão integral): fatos internos em update/status/fechamento e move;
  REVERT valida alvo/gerada, portadora final e liquidamento puro.
- D6 (oferta por documento e contexto monotônico): `UndoRegistry` + guards de admissão/execução/
  saída; clear ordenado; token consumido uma vez.
- D7 (IPC/schemas/versões/acks/erros): catálogo 17, mutações v3, oito wrappers v1, 64 KiB/8 KiB,
  1 KiB/256 KiB preservados, códigos fechados.
- D8 (integrações delimitadas): liquidação pura `<= now` e porta
  `invalidateAfterSuccessfulBackupRestore` com época; sem scheduler/notifier/backup funcional.
- D9 (memória/encerramento/desempenho): orçamento 64 MiB com charge determinístico, liberação no
  consumo/clear/cleanup, oito documentos; D10 preservado sem alteração de gate.
- D10 (interface/foco): área da lixeira, confirmações, oferta sem roubo de foco e destinos de foco
  (vizinho/último/Voltar/Editar); roteiro humano entregue e pendente de execução.
- D11 (rastreabilidade): tabela L01–L12 abaixo.

## 2. Rastreabilidade L01–L12

| ID | Evidência (arquivo · verificação) |
| --- | --- |
| L01 | `tests/domain/task-trash.test.ts` (29d/30d/30d+1ms/31d/futuro/DST, empates, 100→101, relógio recuado, retained:false); `tests/application/trash-commands.test.ts` (cap/substituição/vencidos no mesmo commit); `tests/main/ipc-trash.test.ts` (composição EMPTY). |
| L02 | `trash-commands.test.ts` (payload/timestamps íntegros, identidade `g`, restore sem geração, prune+cap+move num commit). |
| L03 | `trash-commands.test.ts` (ordem NOT_IN_TRASH→ENTRY_CHANGED→ENTRY_EXPIRED→ID_EXISTS→SERIES_CONFLICT; recusa sem expurgo); `ipc-trash.test.ts` (códigos exatos). |
| L04 | `trash-commands.test.ts` (manutenção explícita, no-op sem revisão, leitura pura, coleção >100 não truncada); `ipc-trash.test.ts` (purgedCount, retry); UI (`trash-manager.test.ts`, estados). |
| L05 | `trash-commands.test.ts` (restore×restore, restore→delete com mesmo relógio, identidade nova); `ipc-trash.test.ts` (edição durante diálogo → CONFIRMATION_CHANGED; EMPTY stale; tarefa independente não invalida); `trash-manager.test.ts` (confirmação/Escape). |
| L06 | `undo-registry.test.ts` (contexto monotônico, oferta única, tokens de uso único, publicação tardia bloqueada); `trash-manager.test.ts` (oferta só após snapshot; Desfazer; recusa); harness `trash` (uiDeleteOffersUndo, undoConsumedOnce). |
| L07 | `trash-commands.test.ts` (before-image relida com done/ordens, updatedAt/revisões novas, claim preservado, check/ABA bloqueia); `task-storage-revisions.test.ts` (revert com conteúdo completo). |
| L08 | `trash-commands.test.ts` (gerada removida direto de tasks, DONE/SKIP/END/fim natural, gerada editada → GENERATED_CHANGED, portadora no plano final). |
| L09 | `tests/domain/task-reminders.test.ts` (AT/OFFSET <=now/futuros/terminal/sem prazo/gatilho extremo; preservação de marcadores); `trash-commands.test.ts` (restore/revert liquidam e preservam claim); `undo-registry.test.ts` (época/backup APPLIED/UNCHANGED). |
| L10 | `trash-commands.test.ts` (falha entre efeitos reverte inteiro; fila segue); `storage-crash.test.ts` (kill save/claim); smoke `crash|…|move/restore/revert` (rollback/reopen inteiro, sem chamar kill de prova de energia). |
| L11 | `trash-command-contract.test.ts` + `task-command-contract.test.ts` (shapes/versões/budgets/negativas); `ipc-tasks.test.ts`/`ipc-trash.test.ts` (guards, tokens alheios, sessão encerrada, zero acesso antes do guard); `bridge-catalog.test.ts` (17 wrappers); `trash-manager.test.ts` (foco/busy/Escape/anúncios). |
| L12 | `undo-registry.test.ts` (64 MiB, charge determinístico, oito sessões, liberação); `bench` empacotado (1.000/10.000 + 100 trash, 23,9 MiB, mutação p95 4,8 ms, página 6,39 ms, preflight 238 ms, saveMany 403 ms) e seção `receipts` (charge/heap/pico/liberação em 8×25 ciclos); D10 retido e registrado à parte. |

## 3. Tasks

**45/45 concluídas com evidência.** A task 7.3 passou a ter medição no pacote (seção `receipts` do
`bench`: charge/pico/liberação em 8×25 ciclos) após a instrumentação; o detalhe de heap real está
registrado em §5.4.

## 4. Gates executados

| Gate | Resultado |
| --- | --- |
| `npm run lint` | 0 erros / 0 warnings. |
| `npm run typecheck` | 5 projetos (contracts, main, preload, renderer, tests) sem erros. |
| `npm test` | **46 arquivos / 664 testes + 11 skipped**, todos passando. |
| `npm run build` | main/preload/renderer OK. |
| OpenSpec 1.14.0 | Change estrita válida; `validate --all --strict` 9/9 (INFO preexistente de texto longo); `--archived` 5/5. |
| `package:win --publish never` | NSIS one-click per-user gerado sem publicar e sem executar Setup. |
| `verify:package` | ASAR na allowlist (12 arquivos), `asInvoker/uiAccess=false`; SHA-256 registrados. |
| `smoke:packaged` | Todos os cenários de produto PASS; termina reprovado **somente** pelo gate D10 herdado (ver §5.1). |

### 4.1 Smoke empacotado — destaques

- `bridge` 27/27 (catálogo 17, round-trip, duas superfícies, negativas, sessões).
- `trash` **30/30**: prepare/move com `retained`/`undoToken`, identidade da entrada, convergência
  entre duas superfícies, UI de excluir/Desfazer, confirmação stale, token alheio/repetido,
  contexto antigo, EMPTY stale/exato, esvaziamento por UI com foco em Voltar.
- `crash` inclui `unit:before-commit|move`, `unit:after-commit|restore` e
  `unit:before-commit|revert` com estado anterior/novo inteiro.
- `bench` (limites): 10.000 tarefas + 100 trash, 23,9 MiB; mutação p95 4,8–16,3 ms; página p95
  6,4–13,7 ms; preflight 238–867 ms; saveMany 403–1.403 ms.
- **Recibos (L12)**: charge 551.456 bytes (~0,53 MiB) por before-image de ~200 KB; pico 551.456
  bytes com 8 documentos; usado após 25 ciclos × 8 documentos = 0; liberação `true`.
- `recurrence` 21/21 e `a11y` 12/12 permanecem verdes com o catálogo v3/contexto.
- Detalhes e comandos em [packaged-evidence-tfa006.md](../../../docs/packaged-evidence-tfa006.md).

## 5. Pendências e limites (registrados separadamente)

### 5.1 D10 herdado (gate retido, sem alteração)

O smoke termina com código 1 pelo orçamento D10 de UI em 10.000 tarefas. **Pendência herdada** das
TFA-004/005 (histórico 661,6 ms p95 / 636,1 ms heartbeat / 141,7 ms varredura). Medições novas
nesta entrega:

| Rodada | Montagem 1k/10k | p95 consultas 1k/10k | Subtarefas p95 1k/10k | Heartbeat 1k/10k |
| --- | --- | --- | --- | --- |
| Limpa | 412/3.025 ms | 87,5/**688,3** ms | 21,5/137,9 ms | 348,8/**760,5** ms |
| Sob contenção (outra carga na máquina) | 286/8.821 ms | 91,8/**1.553** ms | 19,3/500,3 ms | 438/**1.996** ms |

Os números alternativos 700/700/250 **não** estão aprovados; nenhum gate foi alterado e não houve
truncamento, virtualização ou worker. A rodada sob contenção é ruído de ambiente e está registrada
como tal, sem ser usada como regressão do produto.

### 5.2 Prova humana de acessibilidade

Roteiro entregue em [a11y-manual-checklist-tfa006.md](../../../docs/a11y-manual-checklist-tfa006.md)
e **não executado** (leitor de tela, DPI/escala). Componentes e harness cobrem foco/teclado/busy,
mas não substituem a prova humana.

### 5.3 Primeira execução do smoke ampliado na CI

O smoke (agora com `trash`) ainda não foi executado no runner hospedado; o runner é administrador
com UAC desabilitado e não substitui a conta padrão.

### 5.4 Recursos de recibos (7.3)

O orçamento lógico de 64 MiB, o charge determinístico, a recusa antes do efeito e a liberação em
oito sessões estão cobertos por `undo-registry.test.ts` e pela seção `receipts` do `bench`
empacotado: charge de 551.456 bytes para before-image de ~200 KB, pico de 551.456 bytes com 8
documentos, zero retido após 25 ciclos × 8 documentos e liberação completa. O registro mantém o
before-image por referência (não há clone persistente); o charge conservador é a métrica de
orçamento e o `heapDeltaBytes` mede o retido após a liberação. Não foi feita uma campanha isolada
com before-images históricas extremas além desse volume; permanece como limitação declarada, sem
limitar codec nem truncar dados.

### 5.5 Limites de evidência

- Kill de processo de teste **não** é prova de falha de energia (permanece fault injection
  identificado).
- Simulações de COMMIT/ROLLBACK continuam como na TFA-003; nenhuma prova de dispositivo/energia
  nova.
- A extensão permaneceu somente leitura em `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`; nenhum
  teste/build/escrita/Git nela.
- Nenhuma dependência, runtime ou lockfile alterado; Setup não executado; nada publicado.

## 6. Verificação formal (opsx-verify)

### Summary

| Dimensão | Status |
| --- | --- |
| Completeness | 45/45 tasks; 39 requisitos (19 ADDED + 20 MODIFIED) presentes nos sete deltas. |
| Correctness | 39/39 requisitos com implementação mapeada; cenários cobertos por testes de domínio/unidade/IPC/UI/pacote, exceto a prova humana de a11y (declarada). |
| Coherence | Design D1–D11 seguido; sem contradições materiais; 1 sugestão de padrão registrada. |

### Issues

1. **CRITICAL:** nenhum.
2. **WARNING:**
   - **Prova humana de acessibilidade pendente** — o cenário de leitor de tela/DPI de
     `desktop-task-management` não foi executado; roteiro entregue. Recomendação: executar
     [a11y-manual-checklist-tfa006.md](../../../docs/a11y-manual-checklist-tfa006.md) antes da
     homologação final (TFA-012).
   - **D10 herdado retido** — o gate de UI de 10.000 permanece reprovado (688,3 ms p95 / 760,5 ms
     heartbeat na rodada limpa), como nas TFA-004/005; números alternativos não aprovados.
     Recomendação: manter a decisão pendente do orçamento ou aprovar Change de janela de
     renderização; sem truncamento/virtualização/worker.
3. **SUGGESTION:**
   - **Primitivas cruas de lixeira** — `moveToTrash`, `restoreFromTrash`, `deleteFromTrash` e
     `emptyTrash` continuam existindo para fixtures/testes com a semântica antiga (revisões
     conservadas). Recomendação: em Change futura, marcá-las como somente-fixture ou removê-las
     quando nenhum teste precisar delas, evitando uso acidental no produto (o produto usa apenas as
     variantes `*Conditionally`).

### Final Assessment

Nenhum problema crítico nos checks executados. 2 warnings e 1 sugestão registrados. A prova humana
de acessibilidade segue não verificada (declarada em §5.2) e o D10 permanece como pendência
herdada; portanto o relatório **não declara archive pronto** e aguarda aprovação explícita.

## 7. Declaração

A implementação cobre os artefatos aprovados e os critérios L01–L12, com as pendências acima
(5.1–5.5) registradas sem sucesso inventado. **Este relatório aguarda aprovação explícita**; o
archive, a consolidação de specs, o README pós-archive, commit/push/PR/merge, instalação,
distribuição e a próxima Change dependem de autorização correspondente.
