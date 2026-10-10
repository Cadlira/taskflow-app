# Relatório de verificação — TFA-012 `homologar-paridade-e-primeira-versao-desktop`

**Aprovação explícita registrada na conversa (2026-10-10):** o usuário aprovou este relatório e autorizou archive, commit, push, abertura de PR e a cópia local do instalador para a pasta de Downloads indicada — "Aprove o relatório, faça o archive, commit, faça o push e abra o PR. Após isso gere um instalador e coloque na pasta C:\Users\cadli\Downloads\taskflow". A autorização não implica distribuição pública/release por inferência.

**Data:** 2026-10-10 · **Branch:** `codex/tfa-012-homologar-paridade-e-primeira-versao-desktop` · **Base:** `ef803dc80cfab4333035211c472f11743f3368b3` · **Checkpoint do candidato:** `a2dc60651093941051ff3d1088739ac91e797a68` (fonte limpa) · **Candidato:** `0.2.2-win-x64-a2dc60651093941051ff3d1088739ac91e797a68-tfa012-final` · **Schema:** spec-driven (OpenSpec 1.14.0).

**Aprovação e autorizações registradas na conversa (2026-10-10):** artefatos aprovados explicitamente antes do apply; checkpoint Git local autorizado (sem push/merge); efeitos de instalação B/C autorizados somente com fixtures e perfil exclusivamente fictício — o usuário confirmou que o perfil `prod` desta conta é exclusivamente fictício e fechou o app para a manutenção. Nenhuma outra autorização (archive, README pós-archive, distribuição, próxima Change) foi presumida.

**Escopo comprovado:** candidato C `0.2.2` limpo (Electron 44.5.1/Node 24.21.0/SQLite 3.53.4), jornadas H01–H16 por camada (portátil/DOM/IPC/pacote/instalado), com limites explícitos para parcelas humanas/nativas não observadas. Somente a conta atual; conta padrão/VM/segunda conta DISPENSADAS (decisão humana da exploração, preservada).

## 1. Placar

| Dimensão | Resultado |
| --- | --- |
| Completude | **31/31 tasks** concluídas (6.3 entregue como este relatório; 6.4 registra a revisão no roadmap) |
| Corretude | **7/7 requisitos** com implementação/evidência; **37/37 cenários** dos deltas mapeados (24 BD + 13 TM) e ligados a evidência/limite |
| Coerência | D1–D8 seguidos; nenhum desvio de decisão identificado; 2 WARNINGs e 2 SUGGESTIONs registradas (limites/endurecimentos) |

## 2. Evidências por gate (AC01–AC08)

| Critério | Evidência | Situação |
| --- | --- | --- |
| AC01 | `docs/desktop-homologation-results.md` §2.1–2.3 (P01–P14 → requisitos/cenários → H com camada/método/status/limite) e §4 | Completo; nenhuma lacuna silenciosa |
| AC02 | §3.1/3.2 (B′ inspecionado: Reader `6e34919d…`; pin exato) e §4.2 (C: `source.clean:true`, commit `a2dc606`, hashes Setup `2fc66a52…`/exe `3de93f34…`/ASAR `1d07b23b…`; `verify:package OK` duas vezes com bytes idênticos) | Completo; nenhum Setup executado na inspeção; H15 executado (não bloqueado) |
| AC03 | §4.1/4.3 (`parity` 35/35 com conteúdo/revisões/portadora/atomicidade; reopen entre processos por `contentDigest`; crash 8 barreiras; migração sob kill) e §4.4 (H15 retenção byte a byte) | Completo; nenhum crítico de dados observado |
| AC04 | §4.1–4.4 (jornadas reais preservadas; IA fake 14 verificações sem autosave; captura com sentinela; Quick Add; geometria TFA-013 exata) | Completo no escopo; subcasos humanos NOT_RUN explícitos |
| AC05 | §1.2/1.5 e §4.4 (somente conta atual; dispensas mantidas; dados fictícios; nenhuma leitura de conteúdo pessoal — `prod` confirmado fictício pelo usuário) | Completo |
| AC06 | §4.4 (cada alegação nativa ligada ao candidato instalado com hashes/perfil; toast visual/clique, DPI/leitor, diálogo nativo, rebind, zoom de layout e suspensão/offline reais NOT_RUN com limite) | Completo; IR3 com oráculo por estado efetivo |
| AC07 | §4.2 (`npm run validate` exit 0: lint + 5 typechecks + 112 arquivos/1442 testes + 11 skipped de fuso + volume 2/2 + build; OpenSpec 19/19 e 12/12) e §4.3 (smoke 46 PASS/0 FAIL/0 WARN; D10 1k 530,8 ms/52,6 ms/52 ms; 10k 2.926,5 ms/789,6 ms/1.157,1 ms; cartões exatos; BENCH gates todos true) | Completo; falhas transitórias conservadas e repetições justificadas nos mesmos bytes |
| AC08 | §4.5 (rastreio), guias atualizados (D8) e este relatório | Pendente apenas da aprovação explícita deste relatório; archive/distribuição não implicados |

## 3. Corretude por requisito (deltas)

| Requisito (delta) | Implementação/evidência principal |
| --- | --- |
| Homologação rastreia jornadas… (ADDED) | Matriz §2; `parity` 35/35; camadas/métodos separados; histórico não herdado (BD-01–BD-04) |
| Fixtures e falhas preservam perfis/dados (ADDED) | Isolamento do smoke (S1–S9 + sentinela), fixtures portáveis, H07/H08 em testes + `crash`/migração (BD-05–BD-08) |
| Relatório delimita alcance/publicação (ADDED) | Este relatório + §4.5; distribuição separada (BD-09–BD-12) |
| Aceitação independente em conta padrão (MODIFIED) | Conta atual; dispensas preservadas; candidato/H15 vinculados (BD-13–BD-19) |
| Integrações nativas no candidato instalado (MODIFIED) | Instalado C: startup readback, marker real, close/Sair, Quick Add/captura, manutenção B′→C; parcelas humanas NOT_RUN (BD-20–BD-24) |
| Identidade e limites visíveis (MODIFIED) | UI instalada preserva identidade/estados; IA integrada opcional; exclusões de backup comunicadas (TM-01–TM-07) |
| Evidências distinguem componente e produto (MODIFIED) | Smoke/BENCH/UI-BENCH + `verify:package` + provas instaladas por camada (TM-08–TM-13) |

## 4. Coerência (D1–D8)

- **D1 (conta/contratos):** somente conta atual; nenhuma VM/segunda conta; dispensas mantidas.
- **D2 (C/B′):** pin exato B′ `0.2.1`; C `0.2.2` de fonte limpa; nenhum stage editado; mudanças pós-checkpoint somente documentais/ferramenta de teste.
- **D3 (modos):** A (isolado), B/C no instalado com perfil fictício confirmado; nenhuma parcela nativa inferida de mock.
- **D4/D5 (jornadas/test-only):** H01–H16 rastreados; `parity` sem canal/hook de produção; extremos nos testes existentes.
- **D6 (execução honesta):** falhas conservadas (sentinela do smoke; uninstaller transitório) e repetições justificadas; D10 medido sem ocultação.
- **D7 (evidência):** status por camada/método; nenhuma prova de `test` marcada como `prod`; conclusão limitada abaixo.
- **D8 (documentação):** guias/matriz/estratégia reconciliados com dados observados; relatórios/archives históricos intactos; README não tocado.

**Consistência de padrões:** os novos artefatos seguem os padrões existentes (vitest + harness + scripts mjs; docs pt-BR com acentos; nenhum `any` novo). Sem desvios relevantes.

## 5. Issues

### CRITICAL
Nenhuma.

### WARNING
1. **Parcelas nativas não observadas (afetam o alcance declarado):** exibição/clique visual de toast, diálogo nativo de backup, rebind/conflito de atalhos instalado, zoom de layout 200% (sem acesso a `webContents.setZoomFactor` na janela instalada), DPI/leitor de tela/multimonitor e suspensão/offline reais permanecem NOT_RUN. Recomendação: aceitar explicitamente o limite na revisão (ou agendar verificação humana complementar) — nenhuma parcela foi marcada como nativa sem observação.
2. **Uninstaller transitório conservado:** a primeira chamada `/S` retornou 0 sem efeito; a repetição idêntica removeu corretamente (IR3). Recomendação: manter o oráculo por estado efetivo em qualquer automação futura; não tratar `exit 0` do launcher como resultado.

### SUGGESTION
1. **Determinismo de regeneração NSIS entre checkouts:** os `*-command.nsh` dependem do EOL dos `.ps1` no working copy (autocrlf). Recomendação: Change futura pode fixar `text eol=lf` para esses arquivos (ou normalizar no `prepare-nsis`) para reprodução independente do checkout.
2. **`--skip-bench` e a sentinela final:** o check final da sentinela roda no `main()` (sempre), mas o bloco de UI-BENCH tem retorno antecipado com `--skip-bench`; considerar mover registros finais para um `finally` único em endurecimento futuro.

## 6. Conclusão

**COBERTURA_LIMITADA_PARA_REVISAO** — nenhum crítico; gates aplicáveis passam (validate, OpenSpec, verify:package, smoke integral 46 PASS, D10/D11/M12 dentro dos limites, provas instaladas B/C com retenção byte a byte e IR3). O alcance declarado é o **uso local nesta conta, no candidato C `0.2.2`, no escopo comprovado**, com as parcelas nativas/humanas explicitamente NOT_RUN acima. Este relatório **não** autoriza archive, merge ou distribuição: a aprovação explícita do relatório precede o archive, e publicação/release exigem autorização própria.
