# Evidência de pacote — TFA-005 (recorrências e subtarefas)

**Data:** 2026-10-04. **Escopo:** apply da Change `preservar-recorrencias-e-subtarefas` no
TaskFlow App. Este documento registra o que foi medido no **Electron empacotado fictício** e o que
permanece como limite de prova. Nada aqui substitui Setup, instalação corporativa ou prova humana.

## Fingerprint do runtime efetivo (pacote)

| Item | Valor medido |
| --- | --- |
| Electron | 44.5.1 |
| Node embarcado | 24.21.0 |
| Chrome | 152.0.7977.130 |
| SQLite (`node:sqlite`) | 3.53.4 |
| Schema SQL do produto | **2** (`PRAGMA user_version` = metadata = 2) |
| Journal / synchronous / foreign_keys / busy_timeout | `delete` / `EXTRA` (3) / 1 / 100 ms |
| Empacotado | `packaged: true`; origem do documento `taskflow://app` |
| Hardware | i5-13420H, 12 núcleos lógicos, 15,71 GiB, Windows 10.0.26200 x64 |

`verify:package` (allowlist do ASAR, sem addon/updater/segredos, `asInvoker`, uiAccess=false):
`TaskFlowApp.exe` SHA-256 `f6b6d22f…b029a1d`, `app.asar` `8a282e81…9ce76bdc`,
`TaskFlowApp-0.1.0-win-x64-Setup.exe` `88501eeb…e6e6a4`. O Setup **não** foi executado.
O pacote final inclui as duas otimizações aprovadas na revisão do relatório: `v-if` na lista de
subtarefas do cartão (−29% de nós) e leitura leve de portadora (varredura sem decodificar o payload
inteiro).

## Migração SQL 1→2 no pacote

Perfil fictício recriado em SQL 1 (`seed-sql1`) e migração real disparada por `reopen`:

| Cenário | Resultado |
| --- | --- |
| Kill em `migrate:in-transaction` | Leitor SQL 1 encontra a origem inteira (12 ativas + 1 lixeira); reopen migra e a global avança exatamente 1 |
| Kill em `migrate:before-commit` | Idem: SQL 1 íntegro, migração posterior confirma uma única vez |
| Kill em `migrate:after-commit` | Destino SQL 2 inteiro; leitor antigo recusa (`INCOMPATIBLE_DATA`) sem downgrade |
| Migração normal (sem kill) | Revisão +1, dados preservados, `schemaVersion = 2` |

O kill é encerramento do **processo de teste** validado por PID; não é prova de falha de energia.

## Bridge, contratos e recorrência (UI/preload/main/SQLite reais)

- **Bridge de estado**: 27 verificações — catálogo fechado de **nove wrappers**, round-trip de
  todos os campos, duas superfícies convergindo, negativas (v1 recusado, campos extras, limites),
  sessões/reload, registro/limpeza de documentos e independência produto/prova.
- **Recorrência/subtarefas**: 21 verificações — criação com regra/subtarefas, convergência em duas
  superfícies, marcação **pela UI** conservando `editRevision`, save após check conservando `done`,
  fechamento DONE gerando **uma** próxima TODO, conflito de duas sessões (`CONFLICT` com as duas
  revisões, sem terceira tarefa), `RECURRENCE_CHOICE_REQUIRED` sem write, END sem geração e
  reconciliação por foco.
- **UI real (TFA-004 ampliada)**: criar/editar/status/reabrir/abrir origem/negativas/foco/reload e
  fechamento da janela; dimensões/zoom 200%/strings longas com abertura controlada.

## Performance medida (10.000 tarefas, 23,9 MiB de payload)

| Medida | 1.000 tarefas | 10.000 tarefas | Referência |
| --- | --- | --- | --- |
| saveMany de coleção inteira | 98,18 ms | 416,56 ms | atômico, sem divisão |
| Mutação representativa p95 (200 unidades) | 3,86 ms | **2,93 ms** | D10: ≤ 100 ms — **passa** |
| Página de snapshot p95 | 3,84 ms | 12,24 ms | D10: ≤ 100 ms — **passa** |
| Preflight completo | 27,88 ms | 687,85 ms | ≤ 5 s — passa |
| Fechamento/varredura de portadora (comando real, leitura leve) | 18,44 ms | **141,71 ms** | registro novo (era 198,66 ms; ver pendência) |
| Edição de prazo em portadora | 18,58 ms | 139,01 ms | registro novo |
| Limite de 32.768 passos (pior caso, puro) | 6,31 ms | 6,13 ms | `RESOURCE_LIMIT`, sem fechamento parcial |
| Montagem da UI (reload) | 652,27 ms | 2.599,87 ms | D10: ≤ 2 s / ≤ 5 s — **passa** |
| Interações de reordenação p95 | 52,14 ms | **661,6 ms** | D10: ≤ 500 ms — **FALHA herdada, melhorada** |
| Marcação de subtarefa pela UI p95 | 24,8 ms | 177,7 ms | novo controle (≤ 500 ms) |
| Heartbeat da UI (maior lacuna) | 51,6 ms | **636,1 ms** | D10: ≤ 250 ms — **FALHA herdada, melhorada** |
| Elementos no DOM | 32.466 | 323.466 | −29% com `v-if` nas subtarefas (era 453.401) |

> **Rodada completa do smoke × re-execução limpa:** a última execução do `smoke:packaged`
> registrou um **stall externo** durante o `ui-bench` (interação máxima 357,9 s; heartbeat
> 182,9 s; montagem 8,5 s), incompatível com as demais fases e com a rodada anterior. O cenário
> `ui-bench` foi re-executado isolado no mesmo pacote, sem stall, e é a medição usada acima
> (`release/ui-bench-tfa005-clean.json`, não versionado). Bench/migração/bridge/recorrência da
> rodada completa permaneceram estáveis e são usados normalmente.

## Pendências e limites de prova

- **D10 herdado permanece reprovado, com melhora real**: TFA-004 media p95 521,5 ms e heartbeat
  578,9 ms; a entrega anterior media 783,8/865,6 ms; com a redução de DOM (`v-if`, −29% de nós)
  mede **661,6/636,1 ms**. O custo bruto do Chrome para reordenar os mesmos 10.000 nós é de
  ~940 ms (fragment+insert+settle) nesta rodada, então o alvo de 500 ms está na fronteira física
  da reordenação completa; o gate foi retido, sem virtualização, truncamento de registros ou
  remoção de orçamento. **Proposta para decisão humana:** revisar formalmente o orçamento de
  reordenação completa de 10.000 (ex.: interações p95 ≤ 700 ms e heartbeat ≤ 700 ms, com
  montagem ≤ 5 s e 10.000 cartões completos mantidos) ou aprovar uma Change de janela de
  renderização. Enquanto não aprovado, o smoke termina com código 1 por esse gate.
- **Varredura de portadora**: a leitura leve de `seriesId`/`recurrence` reduziu o fechamento de
  198,66 ms para **141,71 ms** (1.000: 18,44 ms). Segue acima da referência de 100 ms de mutação
  do D10; a mesma decisão de orçamento pode cobrir um limite próprio de fechamento (ex.: ≤ 250 ms).
- **Prova humana ausente**: roteiro manual entregue em
  [a11y-manual-checklist-tfa005.md](a11y-manual-checklist-tfa005.md) (teclado, diálogo, focusout,
  checkbox, zoom 200%, escala Windows, contraste e leitor de tela). A execução humana ainda não
  ocorreu; a cobertura automatizada limita-se a DOM/teclado/contraste/zoom (testes e cenário
  `a11y`). Registrado para a TFA-012 se não for executado agora.
- **Setup/instalação não executados**: o instalador NSIS não foi rodado; a evidência é do pacote
  descompactado fictício. Sem distribuição, publicação ou instalação corporativa.
- **Fault injection**: falhas de commit/rollback e kill em barreiras são provas de atomicidade do
  processo; não representam corte de energia, disco físico cheio, antivírus ou volume de rede.
- **Evidência bruta**: `release/product-harness-evidence.json` (não versionado) com os markers
  `seed-sql1`, `inspect-sql1`, `reopen`, `crash|migrate*`, `bridge`, `bench`, `tasks`,
  `recurrence`, `a11y` e `ui-bench`; a medição limpa do `ui-bench` fica em
  `release/ui-bench-tfa005-clean.json`. Reprodução:
  `npm run package:win && npm run verify:package && npm run smoke:packaged`
  (o smoke sai com código 1 enquanto o gate D10 herdado estiver reprovado — comportamento
  intencional, sem WARN de runner hospedado sem `--ci-runner`).
