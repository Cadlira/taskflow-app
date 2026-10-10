# Resultados da homologação desktop — TFA-012

**Change:** `homologar-paridade-e-primeira-versao-desktop` (schema spec-driven, OpenSpec 1.14.0, raiz local) · **Branch:** `codex/tfa-012-homologar-paridade-e-primeira-versao-desktop` · **Base:** `ef803dc80cfab4333035211c472f11743f3368b3` (TFA-011/PR #11 e TFA-013/PR #12 integradas) · **Apply iniciado em:** 2026-10-10.

Este arquivo é a **matriz de resultados** da campanha de homologação. O roteiro operacional (pré-condições, passos, fixtures, modos e cleanup) está em [desktop-homologation.md](desktop-homologation.md). Nenhum resultado abaixo é herdado de campanhas anteriores: todos os subcasos começam **NOT_RUN** e só mudam de status com observação registrada conforme as regras de evidência da Change. Referências históricas (TFA-002–011, TFA-013) permanecem como fontes e limites, sem virarem PASS atual.

## 1. Protocolo, aprovação e escopo

### 1.1 Aprovação e autorizações registradas (2026-10-10)

- **Artefatos aprovados:** proposal, design (D1–D8), dois deltas de specs (7 requisitos, 37 cenários) e tasks (31) aprovados explicitamente pelo usuário na conversa de apply desta Change em 2026-10-10, antes de qualquer escrita. O roadmap registrava `IN_REVIEW/REVIEW` com artefatos não aprovados como estado anterior; este apply não presumiu aprovação.
- **Checkpoint Git local autorizado:** sim, para viabilizar o candidato de fonte limpa (task 4.2). Autorizado commit local; **não** autorizados push, PR, merge ou distribuição.
- **Efeitos de instalação B/C autorizados:** sim, para as tasks condicionais 5.1–5.6, **somente** com fixtures fictícias e perfil exclusivamente fictício confirmado, sem criar conta/VM, sem ler/manter/apagar conteúdo pessoal, sem bypass de política.
- **Sem autorização inferida:** nenhuma outra permissão (archive, README pós-archive, distribuição, publicação, próxima Change) decorre destas autorizações.

### 1.2 Escopo da conta e dispensas preservadas

- **Somente a conta atual** (decisão humana da exploração: “Não e não precisa testar. Vamos usar apenas essa conta”). Não há VM, segunda conta, criação de usuário ou nova prova em conta realmente padrão nesta campanha; essa cobertura permanece **DISPENSADA / não comprovada no candidato**.
- **Dispensas históricas preservadas sem PASS:** TFA-008 (segunda conta/Unicode por conta, logoff real simulado), TFA-009 (Q13 `FOREGROUND_UNAVAILABLE` sem artefato posterior), TFA-010 (AI16 real), TFA-011 (parcelas dispensadas de campanha instalada). Nenhuma é exigência de rerun desta Change e nenhuma vira evidência atual.
- **Correções de funcionalidade não autorizadas:** defeitos encontrados serão reproduzidos e registrados; correção genérica ou mudança material de contrato exige revisão antes do ponto afetado.

### 1.3 Modos de execução (D3) e limites

| Modo | Condição/destino | Prova e limite |
| --- | --- | --- |
| **A — automatizado** | Runtime empacotado em cópia própria; `--foundation-test`, LOCALAPPDATA temporário em todas as fases (isolamento integral da task 3.2 via `scripts/smoke-environment.mjs`), raízes/testes e PIDs próprios. | UI/preload/IPC/SQLite/arquivos reais e adapters declarados. Nenhum acesso ao perfil prod real. Sem Setup ou prova nativa de produção. |
| **B — instalado/test** | Instalação autorizada; exe do root instalado/hash conferido, `--foundation-test` e root temporário de teste próprio, sem reutilizar perfil test preexistente desconhecido. | Execução instalada de jornadas comuns e diálogos quando efetivamente observados. Registrar mocks/identidade test; sem alegação de toast/COM/startup prod. |
| **C — instalado/prod** | Somente com execução autorizada **e** perfil canônico prod confirmado exclusivamente fictício antes de ler conteúdo. | Provas nativas por UI/gesto e manutenção autorizada. Não redirecionar roots/identidade, mover/copiar/limpar perfil pessoal ou habilitar harness em prod. |

Suspensão/startup/offline reais exigem autorização compatível com esta máquina; caso ausente ou recusada, registrar simulação/`NOT_RUN` com alcance. Nunca interromper sessão, desligar a máquina, remover Node/npm ou manipular registro/políticas de terceiros. Clipboard humano somente após copiar sentinela fictícia própria.

### 1.4 Ambiente-base desta execução

| Item | Valor |
| --- | --- |
| SO | Windows 11 x64, build `10.0.26200.9550` |
| Toolchain de gates | Node `24.21.0` e npm `11.21.0` exatos (devEngines), toolchain temporária no diretório aprovado de trabalho; nenhuma dependência instalada ou alterada |
| OpenSpec | CLI 1.14.0, raiz local, schema spec-driven |
| Fonte | Branch/base acima; trabalho preexistente preservado (`docs/roadmap.md` do propose e os artefatos da Change não rastreados) |
| Perfil real | Nunca lido, semeado, alterado ou listado: a campanha usa raízes temporárias próprias e o perfil `test` do harness |

### 1.5 Regras de evidência (D7)

Cada subcaso registra: `H/P/Change/critério/requisito/cenário`, passos/pré-condições, esperado/observado, data, ambiente, versão/commit/clean/lockfile/build-id/hashes, exe realmente lançado/instalado, perfil/root tipo (sem path pessoal), mocks/adapters, camada, método, status, bloqueio/dispensa e efeito no alcance, fixture/cleanup e link de evidência. Não gravar chave/ciphertext/conteúdo de IA/username/SID em evidência. Status possíveis: **PASS** (executado), **FAIL** (observado), **NOT_RUN** (não executado), **BLOCKED** (condição recusada/ausente), **DISPENSADO** (decisão humana identificada). Camadas: portátil / DOM / IPC / pacote / instalado / humano. Métodos: real / simulado / fault-injection / relatado. Um PASS simulado comprova somente aquele método/camada.

## 2. Matriz de rastreio (P01–P14 → requisitos/cenários → H01–H16)

Todas as linhas começam **NOT_RUN**; o status por jornada é atualizado na seção 3 com evidência registrada (D7). Rastreio completo cobre os 7 requisitos e os 37 cenários dos dois deltas (BD/TM abaixo) e as verificações arquivadas como fontes, sem convertê-las em PASS atual.

### 2.1 P01–P14 → requisito vigente → Change/critério → jornada

| P | Requisitos vigentes (spec consolidada) | Change/critérios | H |
| --- | --- | --- | --- |
| P01 Gerenciamento | `desktop-task-management`: campos, edição conserva, status/no-op, pesquisa, filtros/ordenação, prazo, estados de erro/conflito, teclado, foco | TFA-004 G01–G18; delta `desktop-task-management` | H02 |
| P02 Recorrência | `desktop-task-recurrence`: regras/limites, cálculo local/DST, âncora, fechamento atômico, nova ocorrência, terminal/reabertura, portadora | TFA-005 R01–R08/V01 | H03 |
| P03 Subtarefas | `desktop-task-subtasks` (contratos S/U) preservados em testes de domínio/aplicação | TFA-005 S01–S03/U01 | H04 |
| P04 Lixeira | `desktop-task-trash`: retenção/limite, move/restore, portadora, ordem determinística | TFA-006 L01–L12 | H05 |
| P05 Desfazer | `desktop-task-undo`: (contratos L) recibo por conteúdo, token único, pré-condições, época | TFA-006 L01–L12 | H05 |
| P06 Backup | `desktop-task-backup`: formato v1–v4, validação/projeção, 20 MiB/encoding, recursos, export/preview/CAS/epoch, evidência real | TFA-007 B01–B14 | H06 |
| P07 Lembretes | `desktop-task-reminders` + `desktop-application-lifecycle`: claim/graça, mutações, agenda, notificação/ativação, close/Sair, recursos | TFA-008 M01–M12 | H09 |
| P08 Quick Add | `desktop-quick-add`: draft/contexto, form básico, ack próprio, teclado/memória transitória | TFA-009 Q01–Q03 | H10 |
| P09 Captura | `desktop-clipboard-capture`: gesto explícito, URL/texto, falhas, pendência única/TTL, privacidade | TFA-009 Q04–Q08 | H11 |
| P10 Atalhos | `desktop-global-shortcuts`: ações finitas, gramática, preferência versus registro, gates/lease, evidência global | TFA-009 Q09–Q14 | H12 |
| P11 Providers IA | `desktop-ai-providers`: seleção/base, credencial protegida, consentimento, teste sem conteúdo, nenhuma requisição automática | TFA-010 AI01–AI16 (AI16 dispensado) | H13 |
| P12 Assistência IA | `desktop-ai-task-assistance`: conteúdo restrito, prévia literal, consentimentos, saída validada, proposta revisável, req. única/cancelável | TFA-010 AI01–AI15 | H13 |
| P13 Acessibilidade | `desktop-task-management`: identidade/limites, foco/semântica, contraste/dimensões, política comunicada | TFA-004–012, G13–G15/U01/B14/Q12/TFA-013 | H14 |
| P14 Identidade/ícones | `desktop-foundation`, `windows-per-user-installation`, identidade visual do pacote | TFA-002 F01–F09; TFA-011 W01–W05; TFA-013 | H01 (+H14 ícones) |
| — Persistência (TFA-003) | `local-task-persistence`: incompatibilidade/futuro/recovery, lock/readonly/`SQLITE_FULL`, commit incerto, kill | TFA-003 P01–P12; TFA-011 W13–W15 | H07, H08 |

### 2.2 Cenários dos deltas da Change → H/P

**Delta `desktop-build-validation` (3 ADDED + 2 MODIFIED; 24 cenários):**

| ID | Requisito → cenário | H/P |
| --- | --- | --- |
| BD-01 | Homologação rastreia… → Cobertura completa da matriz | P01–P14 / H01–H16 |
| BD-02 | Homologação rastreia… → Fluxo entre funcionalidades preserva dados | P01–P06 / H02–H06, H08, H15 |
| BD-03 | Homologação rastreia… → Camadas e métodos não se substituem | todos H (camada/método separados) |
| BD-04 | Homologação rastreia… → Evidência pertence a outro candidato | C0.2.2 versus B′/histórico (todos H) |
| BD-05 | Fixtures e falhas… → Destino pessoal ou origem protegida | D3/fixtures (todos H); extensão somente leitura |
| BD-06 | Fixtures e falhas… → Banco ou configuração incompatível | H07 (SQLite/IA/atalhos) |
| BD-07 | Fixtures e falhas… → Escrita concorrente ou interrompida | H08 (PIDs próprios, sem energia) |
| BD-08 | Fixtures e falhas… → IA e evidência sanitizadas | H13 + evidências de todos H |
| BD-09 | Relatório delimita alcance… → Prontidão no ambiente comprovado | H16/gates aplicáveis (todos H) |
| BD-10 | Relatório delimita alcance… → Falha ou parcela não comprovada | H01/H15 condicionais; demais limites |
| BD-11 | Relatório delimita alcance… → Documentos e orçamento contraditórios | H16/D10 + reconciliação documental (§3/§4) |
| BD-12 | Relatório delimita alcance… → Revisão e distribuição independentes | archive/release (task 6.x, sem distribuição) |
| BD-13 | Aceitação independente… → Matriz padrão completa | H01 (F01–F09 dispensados no candidato) |
| BD-14 | Aceitação independente… → Ambiente ou execução bloqueados | H01/H15 condicionais (modos B/C) |
| BD-15 | Aceitação independente… → Proteção da origem e dos dados | extensão/fixtures (todos H) |
| BD-16 | Aceitação independente… → Campanha do produto final | W01–W15 / H01–H16 instalado |
| BD-17 | Aceitação independente… → Prova anterior ou simulada | histórico (todos H; sem PASS herdado) |
| BD-18 | Aceitação independente… → Candidato alterado depois da campanha | D2 (H01/H15; novo hash/reteste) |
| BD-19 | Aceitação independente… → Decisão de usar somente esta conta | D1/AC05 (dispersa em todos H) |
| BD-20 | Integrações nativas… → Bandeja captura e atalhos reais | P08–P10 / H09, H12 (+H11 gesto) |
| BD-21 | Integrações nativas… → Segunda instância e ativação de toast | P07/P14 / H01, H09 |
| BD-22 | Integrações nativas… → Inicialização opcional no login | H09/H15 (startup) |
| BD-23 | Integrações nativas… → Perfil test em executável instalado | H01–H06/H09 instalado test (B) |
| BD-24 | Integrações nativas… → Perfil prod ou efeito do ambiente não autorizado | H09/H15 limites (modo C condicional) |

**Delta `desktop-task-management` (2 MODIFIED; 13 cenários):**

| ID | Requisito → cenário | H/P |
| --- | --- | --- |
| TM-01 | Identidade e limites… → Recorrência subtarefas e lembretes existentes | P02/P03/P07 / H03, H04, H09 |
| TM-02 | Identidade e limites… → Recursos posteriores ausentes | P04–P12 / H05, H06, H10–H13 |
| TM-03 | Identidade e limites… → Dimensões contraste e texto | P13 / H14 |
| TM-04 | Identidade e limites… → Política da exclusão é comunicada | P04/P05 / H05 |
| TM-05 | Identidade e limites… → Backup explica substituição e exclusões | P06 / H06 |
| TM-06 | Identidade e limites… → Formulário de lembretes e foco de ativação | P07 / H09 |
| TM-07 | Identidade e limites… → Captura preserva área e criação alheia | P08/P09 / H10, H11 |
| TM-08 | Evidências distinguem… → Volume e ações reais | D10/D11 / H16 |
| TM-09 | Evidências distinguem… → Fechar e reabrir | P07 lif. / H09 (+H02 reopen) |
| TM-10 | Evidências distinguem… → Lixeira undo e reservas no pacote | P04/P05 / H05, H16 |
| TM-11 | Evidências distinguem… → Backup no produto e diálogo real | P06 / H06 |
| TM-12 | Evidências distinguem… → Entradas e IA no pacote integrado | P08–P12 / H10–H13 |
| TM-13 | Evidências distinguem… → Geometria e acessibilidade da janela atual | TFA-013/P13 / H14 |

### 2.3 H01–H16 — camada, método, esperado, status e limite (inicial)

| H | Rastreio | Camada | Método | Esperado (resumo) | Status | Limite |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | P14; F01–F09/W01–W05 | pacote + instalado | real (A; B/C condicional) | Hash/asInvoker/per-user/inventário/atalho; segunda instância e destinos recusados | NOT_RUN | conta padrão/VM/segunda conta dispensadas |
| H02 | P01; G01–G18 | portátil/DOM/IPC/pacote | real | CRUD/limites/status/pesquisa/filtros/ordenação/datas/draft | NOT_RUN | G19 histórico superado |
| H03 | P02; R01–R08/V01 | portátil + pacote | real (clock fake/TZ subproc.) | Fechamento atômico, portadora única, sem backlog, terminais/reabertura | NOT_RUN | overflow em relógio de teste |
| H04 | P03; S01–S03/U01 | portátil/DOM + pacote | real | 20 itens, ordem/progresso, save após check, conflito estrutural | NOT_RUN | — |
| H05 | P04/P05; L01–L12 | portátil/aplicação/pacote | real (kill/fault em A) | 30×24h/cap100, restore sem geração, undo atômico/refusas | NOT_RUN | energia não alegada |
| H06 | P06; B01–B14 | portátil + pacote | real (diálogo stub em A) | v1–v4 completos, CAS/epoch, recusas integrais, sem merge | NOT_RUN | diálogo nativo real em B |
| H07 | TFA-003 P04/W13–W15 | fixture/A | fault-injection | Bloqueio seguro, bytes iguais, sem reset/reparo por import | NOT_RUN | recuperação seletiva só fixture |
| H08 | P02–P06/P10; B11–B12 | aplicação/pacote | fault-injection/kill próprio | Anterior ou novo inteiro, sem replay, fila recuperável | NOT_RUN | sem energia real |
| H09 | P07; M01–M12 | portátil/aplicação/pacote + C | real/simulado (toast C) | Claim/graça 300000/300001, liquidação, close/Sair/reopen | NOT_RUN | toast/COM/startup só C |
| H10 | P08; Q01–Q03 | renderer/pacote | real | Singleton/drafts/ack+snapshot, sem clipboard/IA/backup | NOT_RUN | B/C humano condicional |
| H11 | P09; Q04–Q08 | portátil/DOM/pacote | real + sentinela humana | URL/texto, TTL/held, recusas preservam draft | NOT_RUN | clipboard humano com sentinela |
| H12 | P10; Q09–Q14 | portátil/pacote + C | real/simulado | Defaults, rebind/conflicto, registro observado e cleanup | NOT_RUN | Q13 antigo não reexecutado |
| H13 | P11/P12; AI01–AI15 | portátil/main/pacote | simulado (mocks/loopback) | Consentimento/prévia/uma req./cancel/late, sem autosave | NOT_RUN | AI16 dispensado; DPAPI fake local |
| H14 | P13/P14; G13–G15/U01/B14/Q12/TFA-013 | portátil/DOM/pacote + humano | real/simulado | Teclado/foco/contraste/zoom200; geometria TFA-013 | NOT_RUN | DPI/leitor/multimonitor só se observados |
| H15 | W06–W15/P01–P07/P10/P11 | fixture + instalado | real (B/C autorizado) | Par B′→C, retenção integral, DPAPI fictícia, IR3 | NOT_RUN | manutenção pessoal/legado 0.1.0 excluídos |
| H16 | D10/D11/M12/G20 | pacote | real (medição) | D10 1k/10k, banco p95, volume, heartbeat, offline local | NOT_RUN | offline real condicional |

**Verificação da task 1.2:** 37 cenários (24 BD + 13 TM) mapeados; 14 itens P + persistência; 16 jornadas com camada/método/esperado/status/limite; AC01 (rastreio completo sem lacuna silenciosa) referenciado; links locais criados; nenhum PASS herdado — todos `NOT_RUN`.

### 2.4 Bindings de teste e oráculos do percurso (D5/task 3.8)

| Lacuna demonstrada | Binding/veículo | Camada/método |
| --- | --- | --- |
| Percurso integrado entre funcionalidades (criar→checklist→concluir/undo→lixeira→backup→reopen) | cenário `parity` do harness (`src/main/harness/product-harness.ts`) + integração no smoke com `reopen` comparando revisão/digest | pacote; real (UI/bridge reais, diálogo stub, scheduler suspenso) |
| Fixtures do percurso com campos/série/OFFSET/checklist e expectativas literais | `src/main/harness/parity-fixtures.ts` + `tests/main/parity-fixtures.test.ts` | portátil; real (domínio + codec de backup v1–v4) |
| Parser/dispatch do cenário restrito ao test | `tests/main/product-harness-args.test.ts` (aceita `parity`; recusa `parity\|x`, `Parity`, duplicado) | portátil; real |
| Igualdade do estado inteiro entre processos após o percurso | `reopen` no smoke comparando `summary` do parity (revisão + digest) | pacote; real |
| Pin/versão do predecessor e guards 111/129/131/IR3 | `tests/tools/predecessor-pin.test.ts`, `tests/tools/installer-preflight.test.ts` | portátil/estrutural; real (leitura de arquivos) |
| Isolamento S1–S9 (LOCALAPPDATA/sentinela/filhos) | `scripts/smoke-environment.mjs` + `tests/tools/smoke-isolation.test.ts` (efeitos com processo filho real) + registros do próprio smoke | portátil + pacote; real |

Extremos de cada jornada permanecem nos testes existentes das dependências (ex.: `tests/main/reminder-processing.test.ts`, `tests/application/backup-*.test.ts`, `tests/main/storage-crash.test.ts`, `tests/tools/maintenance-fixture.test.ts`); este percurso não duplica testes unitários nem converte relato/mock em prova nativa.

## 3. Candidato e predecessor

### 3.1 B′ `0.2.1`/`1195277` — inspeção por leitura (task 2.1, 2026-10-10)

Stage inspecionado: `release/candidates/0.2.1-win-x64-1195277df63579aa244b0b76b8d889e112929594-pair-021-fix`. Nenhum Setup/instalador foi executado por esta inspeção; somente leitura de bytes/manifesto.

| Item | Valor observado | Confere com D2? |
| --- | --- | --- |
| Identidade | `0.2.1`/x64/commit `1195277df63579aa244b0b76b8d889e112929594`/run `pair-021-fix` | ✅ |
| `source.clean` | `true` (sha256 de fonte `961153b8…`) | ✅ |
| Setup SHA-256 | `f10c308e59fe670d8124314faa338d1d44015326b0d01719a975b2234ac9df17` (153.440.928 bytes) | ✅ |
| Reader/uninstaller SHA-256 | `6e34919d27244dd54293b4feb0d394222338a449df4f63150a9c8041188ce341` (138.247 bytes, `uninstaller-sha256.json` idêntico) | ✅ |
| `TaskFlowApp.exe` SHA-256 | `134ffcd29bca560bb0fafd2d14f0997c555936324170650d4230e23e08c8c689` | ✅ vs. manifesto |
| `app.asar` SHA-256 | `949fca08c5f986b1a15cc2601069fdc47a733908ebd54424441b9f55b1eb2614` | ✅ vs. manifesto |
| Manifestos de execução | Setup/exe/uninstaller `asInvoker`, `uiAccess=false` | ✅ |
| Runtime/inventário | Electron `44.5.1`, x64, `inventory.json` presente, `nsis-inspection.json` presente | ✅ |
| Assinatura | `UNSIGNED_APPROVED_FOR_CONTROLLED_PROOF` (sem publisher) | ✅ |

**Guards existentes aplicáveis:** preflight de predecessor compara versão/hash do uninstaller instalado (`TFA_PREDECESSOR_VERSION`/`TFA_PREDECESSOR_HASH`), recusa legado/estrangeiro/futuro (131/129), processo próprio ativo (111) e não encerra processos; o pin atual admitia apenas A `0.2.0`/`f4e13085…` e **não** reconhecia B′ — daí a atualização exata do pin na task 2.2. Sem fallback para preview/legado. **Resultado: compatível; nenhum BLOCKED.**

**Pin atualizado (task 2.2, 2026-10-10):** `build/nsis/trusted-predecessors.nsh` passa a `TFA_PREDECESSOR_VERSION "0.2.1"` e `TFA_PREDECESSOR_SHA256 "6e34919d…"` (exato, não vazio/genérico); `package.json`/`package-lock.json` passam a `0.2.2` somente nos campos de versão do pacote raiz (dependências/runtime/identidade inalterados — ver `git diff`). Cobertura de teste: `tests/tools/predecessor-pin.test.ts` (compatível/diverso/adulterado, versão monotônica, guards 31/32) e `tests/tools/installer-preflight.test.ts` (111/129/131, sem kill/retry, IR3).

## 4. Resultados por jornada

### 4.1 Percurso parity — verificação de desenvolvimento (2026-10-10, build de depuração)

Execução do cenário `parity` no build de depuração desta Change (pacote `--publish never` a partir de fonte ainda não commitada; **não** é o candidato C — evidência de desenvolvimento, substituída/confirmada pelo smoke do candidato em 4.4). Isolamento integral (`LOCALAPPDATA` próprio, sentinela prod fictícia), diálogo stub, scheduler suspenso, duas superfícies reais.

| Item | Resultado |
| --- | --- |
| Checks do cenário | **35/35 PASS** (`ok:true`) |
| H02/H04 conteúdo | `createContentMatchesFixture`, `saveKeepsDone`, `toggleKeepsEditRevision`, `progressOnBoth` PASS |
| H03/H05 | `closeGeneratesExactlyOne` (prazo esperado literal), `undoRevertsUnitAtomically`, `generatedChangedRefusesUndo` (`GENERATED_CHANGED`), `moveRetainedWithToken`/`restoreWithoutGeneration` PASS |
| H09 | `agedSettlementMarker` PASS (gatilho vencido liquidado por mutação com marker exato; futuro pendente) |
| H06 | `confirmApplied` (APPLIED, 4 restauradas, época+1), `importContentMatchesFile` (projeção completa vs. arquivo), `confirmUnchanged`, `epochInvalidatesOldOffer` (`UNDO_NOT_AVAILABLE`), `stalePreviewRefused` (`BACKUP_BASE_CHANGED`), eventos de época nas duas superfícies PASS |
| Reopen entre processos | `contentDigest` idêntico ao do cenário `reopen` no mesmo banco (revisão 16, 4 tarefas, 0 na lixeira) — `undoEpoch` transitório excluído da comparação |

**Limites desta evidência:** build de depuração (fonte suja); a prova oficial por camada/pacote é o smoke do candidato C (task 4.4). Extremos de H07/H08 permanecem nos testes existentes (`tests/tools/maintenance-fixture.test.ts`, `tests/main/storage-crash.test.ts`, etc.); o percurso adiciona apenas a reabertura/conteúdo entre processos.

## 5. Conclusão

*(Reservado ao relatório de verify — task 6.3.)*
