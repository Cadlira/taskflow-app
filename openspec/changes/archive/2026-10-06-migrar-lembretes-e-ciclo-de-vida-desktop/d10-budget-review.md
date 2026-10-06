# Revisão do orçamento D10 (UI 1.000/10.000) — decisão registrada

**Aberta em:** 2026-10-06, a pedido humano explícito.
**Branches/versão:** TFA-008, pacote `f60263d5…` (bench), `de25937c…` (Setup da campanha).
**Decisão humana:** **novos limites formais** (caminho 2), com medição em equipamento de
referência e revisão material — sem otimização nesta Change.

## Medição de referência (2026-10-06, i5-13420H, Windows 11 x64, Electron 44.5.1)

`ui-bench` no pacote (perfil fictício, dados fictícios):

| Métrica | 1.000 | 10.000 | Gate anterior | Situação |
| --- | --- | --- | --- | --- |
| Montagem | 510,25 ms | 3.064,53 ms | ≤2 s / ≤5 s | PASS mantido |
| Interações p95 | 95,54 ms | 883,66 ms | ≤500 ms | **FAIL** → revisto |
| Subcontroles p95 | 37,2 ms | 282,6 ms | ≤500 ms | PASS mantido |
| Heartbeat máximo | 87,8 ms | 721,8 ms | ≤250 ms | **FAIL** → revisto |
| Cartões completos | 1.000 | 10.000 | exato | PASS mantido |

Contexto: 343.481 elementos no DOM em 10.000; movimentos testados com 9.999 cartões;
sem virtualização nesta Change. `bench` D11/M12 empacotado: PASS em todos os gates
(mutações p95 5,5/5,07 ms; páginas p95 9,09/5,74 ms; payload 23,9 MiB; drain 106,8 ms).

## Novos limites formais (aprovados pelo decisor)

| Orçamento | 1.000 | 10.000 | Justificativa |
| --- | --- | --- | --- |
| Interações p95 | ≤500 ms | **≤2.500 ms** | dedicado 883,66 ms; pior caso sob carga (smoke integral) 1.652,06 ms |
| Heartbeat máximo | ≤250 ms | **≤2.500 ms** | dedicado 721,8 ms; pior caso 1.957,9 ms |
| Montagem | ≤2 s | **≤8 s** | dedicado 3,06 s; pior caso 7,79 s (Defender/carga da estação) |
| Subcontroles p95 | ≤500 ms | ≤500 ms | medido 282,6–399,8 ms — mantido |
| Cartões | exato 1.000 | exato 10.000 | mantido |

**Aviso registrado:** em 10.000 tarefas sem virtualização, a interface pode levar de ~0,9 s a
~2 s por p95 de interação/heartbeat e até ~8 s para montar sob carga da estação; a paridade
de latência do volume pequeno não se estende ao volume grande. Otimização/virtualização fica
como candidata a Change futura, sem bloquear esta revisão.

## Aplicação

- Gates do harness atualizados (`product-harness.ts`, cenário `ui-bench`):
  `interactionsP95WithinBudget` e `heartbeatWithinBudget` com 500/1.500 por dataset.
- Design da TFA-008 atualizado na nota de D10/D11 apontando para este documento.
- Relatório/verification registra os novos limites e a medição; nenhum número antigo foi
  “relaxado silenciosamente”: a mudança é explícita, datada e justificada.

## Rastreio

- Evidência bruta: `%TEMP%\tfa008-campaign\bench-out.log` (markers `BENCH`/`UIBENCH`).
- Próximos passos cobertos por esta decisão: 11.4 (bench/M12 no pacote) e 11.5 (smoke
  integral com bench) deixam de ser bloqueados pelo D10 herdado, mantendo os gates novos.
