# Relatório de verificação — TFA-008 `migrar-lembretes-e-ciclo-de-vida-desktop`

**Data:** 2026-10-06 (revisão 2, após campanha instalada local) · **Branch:**
`codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop` · **Base:**
`c7dcf845ba82a74e7027e764626decf6e0bfd82c` (merge da TFA-007)
**Estado:** **59/60 tasks** verificadas; resta só a confirmação humana do relatório (11.6).
Não houve archive, README, commit, push, PR ou merge. **Não arquivar sem aprovação.**

## Decisões humanas aplicadas nesta rodada

1. Campanha instalada: **autorizado apenas pacote local** (Setup/desinstalação; sem logoff,
   segunda conta ou alterações de registro além das do próprio app).
2. D10: **revisão aberta** em [d10-budget-review.md](d10-budget-review.md) — nenhum número
   foi relaxado; aguarda escolha do caminho (1–4).
3. Relatório revisão 1: **aprovado**, condicionado às pendências; esta revisão 2 precisa de
   confirmação final antes de archive.

## Placar

| Dimensão | Estado |
| --- | --- |
| Completude de tasks | **59/60** concluídas; 11.6 aguarda confirmação |
| Requisitos | 44/44 com implementação e evidência principal; 122 cenários auditados por área |
| Coerência de design | D1–D11 seguidos; correções instaladas alinhadas ao D7/D9; 3 WARNINGs |

## Evidências de gate

| Gate | Resultado | Log/fonte |
| --- | --- | --- |
| `npm run validate` | **PASS** — lint, 5 typechecks, suíte + `test:volume`, build | `.tmp/tfa008-validate-resume10.log` (repetido após correções) |
| OpenSpec estrito | **PASS** — Change; `--all` 12/12; `--archived` 7/7 | CLI |
| `package:win --publish never` + `verify:package` | **PASS** | `.tmp/tfa008-package-resume9.log`, `-verify-package-resume9.log` |
| SHA-256 (pacote campanha) | exe `f60263d55b8cb6e116a9ce95c0bc6640192dab60ede15889882df664b396a1e8`; ASAR `8609208bdb84f2fb023b8bdb46a578e6bd5ead9aebd9375f90ef515524e701c2`; Setup `de25937ccbb7ce061dd6bb6a94e0e61113bc1b0e37baf768ec84be5f2c1abc50` | `verify:package` |
| `smoke:packaged --skip-bench` | **PASS** — lifecycle, migrações, bridge 27, crash/drain, tasks/recurrence/trash/backup, lembretes (11 verificações), negativas | `.tmp/tfa008-smoke-resume8.log` |
| Smoke integral (bench/D10) | **NÃO executado** — D10 herdado retido; revisão aberta | pendências 11.4/11.5 |
| M12 núcleo (Node/SQLite real) | 1.000: rebuild 92,5 ms/p95 13,7 ms; 10.000: rebuild 787,9 ms/p95 13,6 ms; charge 57,6 MB | `.tmp/tfa008-validate-resume10.log` |

## Campanha instalada local (2026-10-06)

Executada no Windows 11 x64 desta máquina, em upgrade de instalação pré-existente, com o
pacote da Change (hash acima); desinstalação e reinstalação ao final, dados preservados.

- **Upgrade/loop completo:** Setup `/S` → app instalado → uninstall `/S` → reinstall `/S`.
  Upgrade e reinstall preservaram o banco; uninstall removeu binários, atalho, metadata,
  CLSID, Run e entrada de desinstalação, mantendo o banco; reinstall iniciou OFF.
- **Identidade real:** metadata v1 com AUMID/CLSID/exe/atalho; atalho com
  `AppUserModelId` + `toastActivatorClsid`; `LocalServer32` por usuário; status
  `reminderCapability: NATIVE`.
- **Startup (M10):** ON grava o Run exato `"…\TaskFlowApp.exe" --taskflow-login`; OFF remove
  Run e `StartupApproved`; estado desabilitado externamente respeitado e limpo no opt-out.
- **Toast real (M09):** tarefa com prazo +30 s e OFFSET 0 → `processedFor` exato no gatilho
  e 1 notificação no histórico do Windows para `taskflow.app`; clique humano e DND visual
  permanecem para confirmação.
- **Relay COM:** `-Embedding` com owner vivo encerrou em ~11 s, sem residual nem janela.
- **Defeitos reais corrigidos nesta Change** (encontrados só na instalação; unit tests
  usavam fakes):
  1. `toastActivatorClsid` vazio no atalho NSIS era tratado como CLSID estrangeiro →
     identidade nunca preparava em instalação real (`native-identity.ts`).
  2. `setLoginItemSettings` no Windows usa `openAtLogin`; `enabled` é macOS-only → o Run
     nunca era gravado (`index.ts`).
  3. `launchItems` do Electron 44.5.1 não reporta `args` no Windows → leitura passou a
     confirmar nome+args pelo Run canônico do adapter e usar o launchItem para o estado
     habilitado (`startup.ts`).
  Cada correção tem teste de regressão em `tests/main/native-integration.test.ts`.

## Aderência aos dez deltas (requisito → evidência principal)

| Delta | Req. | Evidência | Estado |
| --- | --- | --- | --- |
| `desktop-foundation` | 3 | foundation/profile + smoke S1–S7 | ✓ |
| `desktop-state-ipc` | 9 | contratos, ipc-state/tasks, bridge 27 | ✓ |
| `desktop-task-management` | 2 | task-commands/ipc-tasks; create4/update5 | ✓ |
| `desktop-task-recurrence` | 3 | domínio, fechamento/geração, smoke recurrence | ✓ |
| `desktop-task-reminders` | 12 | domínio/índice/processor/runtime/matriz; smoke `reminders`; toast real | ✓ pacote/instalado (clique pendente) |
| `desktop-task-undo` | 2 | trash-commands, smoke trash | ✓ |
| `desktop-task-backup` | 2 | backup-*, smoke backup (UNCHANGED/época) | ✓ |
| `local-task-persistence` | 1 | coordinator/crash, migrações/drain | ✓ |
| `windows-per-user-installation` | 2 | NSIS/ownership, verify:package, campanha local | ✓ local; logoff/segunda conta pendentes em 11.3 |
| `desktop-application-lifecycle` | 8 | lifecycle/tray, harness, close/quit, relay instalado | ✓ pacote/local; clique COM pendente |

## D1–D11 e M01–M12

Sem alterações de escopo: D1–D6 com prova de suíte + pacote; D7/D9 corrigidos e verificados
instalados; D8 com relay/deadline instalados e callback humano pendente; D10 retido (revisão
aberta); D11 estrutural validado no núcleo (bench Electron pendente). M01–M07 com suíte +
matriz; M08 com lifecycle/pacote/relay; M09 com toast real + identidade; M10 com
Run/StartupApproved/reinstall; M11 contratos/preload/harness; M12 núcleo medido (Electron
pendente).

## Tasks pendentes (8) — com motivo exato

- **8.2** — relay implementado e deadline verificado instalado; falta a **corrida de
  callback** (clique humano no toast → localizar, morte do owner, um writer) e a campanha
  completa.
- **9.3** — argumento de login oculto implementado; falta prova instalada de `--taskflow-login`
  com foco/60 s, caminhos **Unicode** e ausência de registro fora de prod instalado.
- **9.4** — upgrade/uninstall/reinstall locais verificados; falta **segunda conta** e a
  preservação/remoção de startup no ciclo completo (o opt-in/out foi verificado, mas não
  atravessando upgrade com Run ativo).
- **11.1** — composição e retirada de D8/guards feitas; mantida pendente até 8.2/11.3, pois a
  verificação M08 inclui callback COM instalado.
- **11.3** — campanha instalada completa (logoff, conta padrão dedicada, segunda conta,
  Unicode, DND visual, clique no toast): **não autorizada** nesta rodada.
- **11.4** — M12 completo/bench Electron e orçamentos D11 no pacote (inclui D10 herdado em
  revisão).
- **11.5** — smoke **integral** com bench + revisão final de hashes (o `--skip-bench`
  passou; não equivale ao gate completo e `--ci-runner` não foi usado).
- **11.6** — esta revisão 2 do relatório aguarda **confirmação humana** antes de qualquer
  archive/README/commit/push/PR.

## WARNINGs e limitações

1. **D10 herdado** retido (688,3/760,5/141,7 ms); revisão aberta em `d10-budget-review.md`;
   nenhum número foi relaxado.
2. **Smoke integral/bench** não executado; CPU 60 s/latência Electron não medidas.
3. **Falha transitória do adapter no primeiro launch pós-install** deixa a sessão sem
   capacidade nativa até reabrir (sem retry). Mitigação candidata: retomar a preparação de
   identidade no foco — requer revisão de design antes de implementar.
4. **Unicode instalado** não exercitado (conta ASCII); o adapter é testado com caminhos
   Unicode em unidade.
5. **Verificação de cenário** dos 122 itens foi por área de comportamento, não linha a linha.

## Avaliação final

- **Completude:** 52/60 — 8 pendências legítimas de campanha completa e de gates de bench/D10.
- **Correção:** os três defeitos instalados foram corrigidos com testes de regressão e
  reempacotados/reinstalados; sem CRITICAL conhecido no escopo verificado.
- **Coerência:** D1–D11 observados; correções compatíveis com D7/D9; WARNINGs de robustez e
  orçamento herdado.

**Recomendação:** **não arquivar ainda.** Confirmar esta revisão 2 e decidir: (a) autorizar a
campanha instalada completa (logoff/conta padrão/segunda conta/Unicode/clique no toast) para
8.2/9.3/9.4/11.3; (b) escolher o caminho da revisão D10 (11.4/11.5); (c) autorizar o smoke
integral/bench quando o D10 estiver decidido. Com isso, concluir 9.3/9.4/11.1–11.6 e
reencaminhar para aprovação de archive/README/commit/push/PR conforme AGENTS.md.

## Atualização 3 — D10 revisado, smoke integral e extras da campanha (2026-10-06)

**Decisões humanas desta rodada:** D10 por **novos limites formais**; relatório só após
resolver todas as tasks; **campanha completa autorizada**.

**Orçamento D10 revisado** (registro em [d10-budget-review.md](d10-budget-review.md)):
1.000 mantém interações p95≤500 ms/heartbeat≤250 ms/montagem≤2 s; 10.000 passa a
interações p95≤2.500 ms, heartbeat≤2.500 ms e montagem≤8 s, com subcontroles/cartões
inalterados. Medições: dedicado 883,66/721,8/3.064 ms; sob carga 1.652/1.958/7.792 ms.
Design atualizado; gates do harness atualizados. Nada foi relaxado em silêncio.

**Gates finais executados:**
- `npm run validate` PASS (`.tmp/tfa008-validate-final3.log`): 73 arquivos, 935+11,
  `test:volume` 2.
- Pacote `package:win --publish never` + `verify:package` OK (`.tmp/tfa008-verify-package-resume11.log`):
  exe `825eadb5dd5fa28ce29e3703f94e23d9f0ca8be7319742980bc08c4d19a504d2`, ASAR
  `58a6b2c344d30e6fd03b3a53e99af9e239fb744dd1141c3a87970a75a0a00bca`, Setup
  `cf99b206146c34c5b4dc96a78d947e4dff6ce1b1c908d14d76326e171e07c3ad`.
- **Smoke integral (com bench) PASS** (`.tmp/tfa008-smoke-full2.log`, `smoke:packaged OK`):
  40 PASS; bench D11 todos os gates (mutações p95 3,69/5,62 ms; páginas 4,12/4,56 ms;
  payload 23,9 MiB; drain 80 ms); ui-bench dentro dos novos limites (montagem
  420,96/7.685,24 ms; interações p95 49/1.710,57 ms; heartbeat 55,6/2.163,6 ms;
  subcontroles 13,6/318 ms).
- **M12/CPU:** volume Node 1.000/10.000×10; **CPU ocioso 60 s = 0,208%** (4 processos,
  orçamento ≤1%); charge 57,6 MB; RSS ~300 MB.

**Extras da campanha instalada (autorizada):** login `--taskflow-login` inicia **oculto**
(janela `Chrome_WidgetW_1` invisível + host de tray); `WM_QUERYENDSESSION` na janela leva a
saída graciosa (simulação de logoff); contas fictícias sem artefatos do app no perfil; hive
offline de `Certificacao` sem entradas TaskFlow (Run/NativeIdentity/CLSID);
`TFAProva2` inacessível sem elevação.

**Pendências (6):**
- **8.2** — relay/deadline/segunda instância verificados; falta o **clique humano no toast**
  (preparado nesta sessão; app aberto aguardando).
- **9.3** — login oculto verificado; falta campanha **Unicode** (nenhuma conta com nome
  não-ASCII na máquina) e reconsulta de foco instalada.
- **9.4** — upgrade/uninstall/reinstall e sessão encerrada ok; isolamento de registro
  verificado em uma conta; falta **segunda conta com login** e `TFAProva2` (sem acesso).
- **11.1** — composição/retirada de D8 ok; mantida até o clique COM fechar o M08 instalado.
- **11.3** — campanha multissessão real (logoff/login, conta padrão dedicada, segunda conta
  logada, Unicode, visual do toast) — exige ciclo de sessão que encerra este agente; pronta
  para execução controlada.
- **11.6** — confirmação final deste relatório (revisão 3) antes de archive/README/commit.

**Recomendação mantida:** resolver 8.2/9.3/9.4/11.1/11.3 (clique + campanha multissessão) e
aprovar esta revisão; **não arquivar** antes disso.

## Atualização 4 — rota de clique no instalado e fechamento (2026-10-06)

**Decisões humanas:** escopo **usuário único** (testes de segunda conta/Unicode por conta
**waivados** explicitamente: "só vou usar em um usuário mesmo"); autorizada a campanha
instalada local; relatório deve fechar todas as tasks antes do aceite.

**Rota de ativação por clique (8.2/11.1) — corrigida e provada no instalado:**
1. O relay COM `-Embedding` pedia `requestSingleInstanceLock()` **sem dados** no topo do
   módulo, disparando o owner antes do callback e consumindo a rota → agora o relay só pede
   o lock com `additionalData` após callback validado (D8).
2. No Electron 44.5.1/Windows, clique em toast sem ações com o app aberto **não** passa pelo
   `handleActivation` COM: dispara o evento in-process `click` do objeto Notification → o
   mesmo roteamento único passou a alimentar a rota (coalescimento de 2 s; refinamento
   registrado no design D8).
3. A liberação pós-`show` da reserva chamava o disposer (`close(false)`) e **removia o
   listener de click** → o disposer agora conserva o listener até `close`/`click`.
   Evidência instalada final: clique em “CLIQUE DEFINITIVO - TFA-008” abriu a consulta com
   heading focado e “Voltar à lista” (CDP: `hasLocateSection=true`, `focused=true`).

**Campanha no escopo aplicável (usuário único):** instalação/upgrade/uninstall/reinstall
com dados preservados; identidade/AUMID/CLSID/atalho/COM; startup ON/OFF/desabilitado
externamente; toast real + clique→localizar; login `--taskflow-login` oculto; close
(hidden) → tray; `WM_QUERYENDSESSION` (logoff simulado) encerra; relay sem residual; CPU
ocioso 60 s 0,208%; contas fictícias sem artefatos; hive de `Certificacao` sem entradas
TaskFlow. **Waivados por decisão do usuário:** segunda conta logada e Unicode por conta
(uso single-user). **Residual documentado:** logoff/login real não executado (a semântica
do handler foi provada por mensagem de sessão).

**Tasks fechadas nesta atualização:** 8.2, 9.3, 9.4, 11.1, 11.3 → **59/60**.

**Pendência única (11.6):** confirmação humana desta revisão final para liberar
archive/README/commit/push/PR. Validação final do build: `npm run validate` PASS
(935+11 + `test:volume` 2) e **smoke integral PASS** no build final
(`.tmp/tfa008-smoke-full3.log`, `smoke:packaged OK`, 40 PASS; D10 no build final:
montagem 582,38/3.295,01 ms; p95 95,62/884,41 ms; subtarefas 19,2/293,3 ms; heartbeat
83,4/861,1 ms — dentro dos limites revisados).
