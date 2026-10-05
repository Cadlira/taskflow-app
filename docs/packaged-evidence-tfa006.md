# Evidência do pacote — TFA-006 (lixeira e desfazer)

Registro das execuções do `smoke:packaged` no pacote local (perfil fictício, sem executar Setup,
sem publicar, sem dados reais). Runtime: Electron 44.5.1, Node 24.21.0, SQLite 3.53.4,
Windows 11 x64, 12 núcleos lógicos, 15,71 GiB.

## Comandos

```
npm run package:win            # NSIS one-click per-user, --publish never, sem Setup
npm run verify:package         # ASAR na allowlist, asInvoker/uiAccess=false, SHA-256
npm run smoke:packaged         # cenários de produto no exe empacotado
```

## Resultado dos cenários

| Cenário | Resultado |
| --- | --- |
| `bridge` | 27/27 — catálogo **17** wrappers, round-trip de todos os campos, duas superfícies, negativas (v1/v2 recusados), sessões e isolamento. |
| `trash` | **30/30** — prepare/move com `retained`/`undoToken`, identidade da entrada, convergência entre duas superfícies, UI de excluir/Desfazer, confirmação stale, token alheio/repetido, contexto antigo (`STALE_CONTEXT`), EMPTY stale/exato, esvaziamento por UI com foco em Voltar. |
| `recurrence` | 21/21 — regressão das TFA-004/005 com mutações v3 + contexto. |
| `a11y` | 12/12 — dimensões/zoom/foco/strings longas e abertura controlada (opener real). |
| `crash` | 8 barreiras PASS, incluindo `unit:before-commit\|move`, `unit:after-commit\|restore` e `unit:before-commit\|revert` com estado anterior/novo inteiro e digest do estado preparado. |
| `bench` | 9 gates PASS: 1.000/10.000 + 100 trash, 23,9 MiB, mutação p95 4,8–16,3 ms, página 6,4–13,7 ms, preflight 238–867 ms, saveMany 403–1.403 ms, recibos liberados. |
| `ui-bench` | Gate D10 **retido/reprovado** (pendência herdada; ver abaixo). |

## Recursos de recibos (L12)

Seção `receipts` do `bench`, no runtime empacotado, com before-image fictícia de ~200 KB:

| Métrica | Valor |
| --- | --- |
| Charge por recibo | 551.456 bytes (~0,53 MiB) |
| Pico usado (8 documentos, uma oferta cada) | 551.456 bytes |
| Usado após 25 ciclos × 8 documentos | 0 |
| Delta de heap retido (após GC/liberação) | ≈ 0 (ruído negativo de medição) |
| Liberação (ofertas/reservas/confirmações) | `true` |

O charge é o orçamento lógico conservador (`2 × bytes do before-image + 4096`); não há clone
persistente — o registro mantém a referência do before-image. A recusa por falta de recurso
acontece antes de qualquer escrita (testes de unidade).

## D10 herdado (gate retido, sem alteração)

| Rodada | Montagem 1k/10k | p95 1k/10k | Subtarefas p95 | Heartbeat 1k/10k |
| --- | --- | --- | --- | --- |
| Limpa (referência) | 412/3.025 ms | 87,5/**688,3** ms | 21,5/137,9 ms | 348,8/**760,5** ms |
| Rerun sob contenção | 426/9.221 ms | 114,2/**1.406** ms | 19,9/447,6 ms | 116,5/**1.799** ms |

Histórico TFA-005: p95 661,6 ms, heartbeat 636,1 ms, varredura 141,7 ms. Os números alternativos
700/700/250 **não** foram aprovados; nenhum truncamento, virtualização ou worker foi introduzido.
As rodadas sob contenção são ruído de ambiente (outra carga na mesma máquina) e estão registradas
como tal.

## Limites

- O kill de processo de teste não é prova de falha de energia.
- A prova humana de acessibilidade (leitor de tela/DPI) não foi executada; roteiro em
  [a11y-manual-checklist-tfa006.md](a11y-manual-checklist-tfa006.md).
- Setup não executado; instalação corporativa, bandeja, notificações e atalhos não são
  certificados por este pacote.
