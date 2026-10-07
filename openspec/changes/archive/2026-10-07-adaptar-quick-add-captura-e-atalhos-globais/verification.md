# Verificação — TFA-009

Data: **2026-10-07**. Change: `adaptar-quick-add-captura-e-atalhos-globais`, schema `spec-driven`, OpenSpec **1.14.0**. Implementação autorizada explicitamente em 2026-10-06 e retomada em 2026-10-07. Branch `codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais`; base/HEAD `5dd68ff12e20babab5264966e6d3f65bff8a2862`. Trabalho salvo e ainda sem commit.

**Resultado final para revisão: implementação e gates automáticos concluídos; validações Windows restantes dispensadas explicitamente pelo usuário em2026-10-07.** São **43 tasks executadas e duas dispensadas (7.4/7.5)**, com checkboxes de encerramento marcados DISPENSADA, sem anunciar verificação inexistente. O usuário pediu fechar a Change; este relatório final recebeu aprovação/autorização explícita na mensagem humana de2026-10-07, registrada abaixo. Integração/distribuição não autorizadas; commit/push/PR agora autorizados pelo usuário somente depois do archive.

## Scorecard

| Dimensão | Resultado |
| --- | --- |
| Completude | **43/45 tasks executadas +duas dispensadas pelo usuário**. Os 29 requisitos dos sete deltas possuem implementação identificada: 19 ADDED e 10 MODIFIED. Nenhum REMOVED/RENAMED. Tracking45/45 encerradas administrativamente (43 executadas/2 dispensadas); não alegar45 verificadas. |
| Correção | Mapeamento de implementação e evidência automática dos **29 requisitos / 75 cenários** no anexo. **Scenario Coverage parcialmente não verificada**: Q13 nativo completo, Q12 humano, instalação/conta padrão/offline e eventos reais de energia/logoff/ativação não comprovados nesta Change. Mapeamento não significa 75 execuções nativas aprovadas. |
| Coerência | D1–D11 revisados contra composição, contratos, domínio, preferências, renderer, testes e documentação. Padrões existentes preservados; sem nova dependência, alteração de SQL2/codec4/backup ou arquitetura. Comportamento instalado/humano permanece não verificado. |

Foram lidos proposal, design, sete deltas e tasks pelos paths retornados por `openspec instructions apply`. Tracking está configurado e legível. `openspec status` indica artefatos de planejamento completos, não implementação integral. Não houve skip de specs. O [mapeamento detalhado](verification-coverage.md) identifica cada requisito e cenário; [evidência persistida](verification-evidence.json) conserva métricas e resultados, sem clipboard bruto ou dados reais.

## Resultado implementado

- Quick Add singleton independente, com Vue/Pinia, formulário, foco e confirmação próprios. Campos básicos, descrição e origem revisáveis; defaults TODO/MEDIUM. Abrir não lê clipboard. Confirmação e snapshot coerente da criação rápida limpam somente seu draft; erro ou resultado incerto conserva inputs sem retry automático.
- Captura de texto por gesto explícito. Global/bandeja destina Quick Add; botão destina sua própria superfície. URL isolada HTTP/HTTPS conserva origem inteira e exige nome manual. Texto usa limites200/4000 e flags de corte. Sem aba, fetch, preview, abertura de draft ou monitoramento do clipboard.
- Leitura física única, deadline lógico5s, raw até1MiB UTF-8 após alocação e resultado mapeado até64KiB. Timeout não libera gate enquanto a Promise física estiver pendente. Falha/vazio não substitui pendência. Inbox por destino, staged com TTL monotônico600000ms, held por documento vivo e recibos limitados, sem persistência de drafts.
- Revisão revalida ID/seq/documento, epoch, geração e safe gate após awaits. Captura durante edição/save/espera/lixeira/backup permanece oferta. Voltar à lista não aplica automaticamente. Oferta também fica visível na lixeira/backup, sem trocar área ou preencher campos. Recibo perdido exige consulta e revisão explícita.
- Três ações globais finitas; defaults Ctrl+Shift+K/L e captura sem combo. Settings distinguem preferência/registro próprio, conflitos, NONE/UNAVAILABLE/UNKNOWN e reconciliação explícita. Hints somente para REGISTERED. Lease focado, suspensão, saída e limites de fila/CAS protegem efeitos.
- Preferências v1 separadas de SQL/backup, até8KiB, arquivo ausente sem escrita, futuro/corrupto preservado. TEMP exclusivo, flush/readback, previous limitada, rename/releitura, gates provisórios e compensação observada. Nenhum unregisterAll ou restauração silenciosa.
- Roles atribuídos no main; facades35/14 com nove wrappers novos v1 e desktop v2. Guardas de role/frame/origem/documento/sessão/admissão antes dos efeitos e após awaits; saída e envelopes validados. Catálogos e recursos posteriores permanecem fechados.
- Close com tray retira só a superfície alvo; a outra e a agenda única continuam. Resume aguarda reconciliação antes de admissão e ações globais; falha continua bloqueada. Sair drena e libera registros próprios. Reload/crash/Sair não recuperam draft/held.

Pontos de revisão: `src/application/capture/clipboard-reader.ts:12`, `memory-capture-inbox.ts:12`, `src/main/ipc/entries.ts:22`, `src/renderer/src/components/tasks/TaskForm.vue:440` e `TaskManager.vue:73`. O anexo lista as demais famílias de implementação e testes.

## Gates executados

Runtime existente: **Node24.21.0/npm11.21.0**; Electron44.5.1, Chromium152.0.7977.130, SQLite3.53.4. Nenhuma instalação de dependência ou execução de testes/builds na extensão.

| Comando | Evidência / resultado |
| --- | --- |
| `npm run validate` | Exit0 no estado final: lint sem warnings; cinco typechecks; **87 arquivos, 1.134 testes aprovados +11 skipped**; volume separado **2 testes aprovados**; build de main, dois preloads e renderer. Skipped não contam como aprovação de campanha nativa. |
| `openspec validate adaptar-quick-add-captura-e-atalhos-globais --strict --no-interactive` | Change válida. |
| `openspec validate --all --strict --no-interactive --json` | **14/14**: Change e13 specs, zero falha. INFOs herdados de texto longo não são falhas. |
| `openspec validate --archived --strict --no-interactive --json` | **8/8** Changes arquivadas válidas. |
| `npm run package:win` | Exit0: NSIS x64 gerado, sem publicação; Setup **não executado**. |
| `npm run verify:package` | Exit0:13 arquivos ASAR na allowlist, dois preloads autocontidos, sem addon/updater/credencial/elevate helper; executáveis asInvoker/uiAccess=false. |
| `npm run smoke:packaged` | **Exit0, sem --ci-runner, --skip-bench ou --entries-only**. Regressões e Q14 completos; aviso de limpeza do perfil fictício do navegador detalhado abaixo. |
| `node scripts/native-shortcuts-packaged.mjs --opt-in` | **Exit1**, `FOREGROUND_UNAVAILABLE`; tentativa no hash final, conflito real observado, campanha interrompida antes de F20. **cleanup:true**, Setup:false. Task7.4 continua aberta. |
| `git diff --check` | Exit0, sem erro de whitespace. Avisos LF/CRLF são da configuração existente. |

Hashes do pacote verificado e usado no último smoke:

| Artefato | SHA-256 |
| --- | --- |
| TaskFlowApp.exe | `8ea3521b8a5d1564aab19c9fb0cc5ad4aa8492a5b932e8d516e53b757a8fbcf4` |
| app.asar | `2b6e4798d50460b89f47abf1d1802c9bcf80cfaa3cb6cd567e8ef1adfe25c7b2` |
| Setup | `6444365d0bada92c39ea15a9b3bef6b3a37061c3dca0b1c38206ef3fd75e55c7` |

O último validate recompilou fontes idênticas às empacotadas; os hashes são dos artefatos em release. O Setup é evidência de geração/inspeção, sem prova de instalação ou execução em conta padrão.

## Evidência Q01–Q14

| Caso | Implementação e evidência | Limites |
| --- | --- | --- |
| Q01 | Testes de domínio/validação manual e origem: HTTP/HTTPS, casing/IDNA, token inteiro, userinfo/controle/esquemas, whitespace/URL embutida, endereço longo e orçamento. URL isolada no pacote manteve título vazio/foco. | Nenhum fetch/título automático; clipboard nativo completo pendente. |
| Q02 | Fronteiras199/200/201 e3999/4000/4001, linhas, Unicode/emoji/substituto inválido e flags. Descrição/origem editáveis. | Dados fictícios. |
| Q03 | Portas falsas e barreiras: vazio/throw/excesso,5s, Promise pendente, BUSY e late completion. Q14 comprovou coalescimento de20 gestos em1 leitura por rodada. | Limite raw é pós-alocação; timeout não cancela API física. |
| Q04 | Componentes Quick Add, store e entries: abertura vazia sem leitura, confirmação própria/snapshot, erro/unknown, manager em edição preservado, hide/reopen singleton. | Foco do SO e produto instalado não comprovados integralmente. |
| Q05 | Cada campo básico e recorrência/subtarefa, editor vazio, save/espera/lixeira/backup, safe gate, confirmação incerta e bloqueios. Seis casos novos do manager; voltar à lista exige Revisar. | Localização/conflito/diálogos cobertos por guards e regressões; energia/ativação real continuam na campanha instalada. |
| Q06 | Inbox monotônico nas fronteiras, staged/held/TTL/substituição por destino, offer/replacement e ausência de consumo por consulta. | Held é memória da instância, não armazenamento durável. |
| Q07 | Barreiras de ack, recibos, ID/seq/documento, geração alterada, perdido/superseded, hide e dispose; listener único/limite8/disposer/versões/role/duplicatas; reload empacotado sem recuperar draft. | Não há replay automático de escrita ou promessa de sobreviver a crash. |
| Q08 | Gramática/defaults/remover/no-op/CAS/duplicatas/reservadas, register false/throw/isRegistered, desired/observed/UNKNOWN, fila e lease. | Registry falso não prova hotkey no SO. |
| Q09 | Faults de arquivo/registro/publicação/readback/compensação e **7 barreiras de kill real** em diretórios próprios. Futuro/corrupto/externo preservado; prefs fora de SQL/backup. | Não garante toda falha elétrica/filesystem; não restaura previous automaticamente. |
| Q10 | Duas superfícies, tray falho, close/reopen/quit, retomada com recuperação pendente/falha e conclusão após quit. Smoke close/quit, ownership, drain/crash e regressão de lembretes. | Suspend/logoff e COM/notificação instalados/humanos não reatestados nesta Change. |
| Q11 | Contratos/main/preload/eventos: schemas/extras/bytes/role/frame/origem/sessão/admissão e sentinelas antes dos efeitos; facades35/14, sandbox e Node ausente no pacote. | Inspeção do pacote não equivale a campanha instalada. |
| Q12 | Componentes para Enter/Escape/IME, foco/erros/busy; dimensões reais Quick Add360px/zoom200: viewport172px CSS, scrollWidth164px, rolagem vertical e7 campos. Contrastes existentes preservados. | **Tab/teclado humano, DPI Windows e leitor de tela não verificados.** |
| Q13 | Harness opt-in implementado, separado de preload/IPC e perfil prod, F20–F23, outro Electron fictício/conflito real, snapshots de clipboard só em memória, cleanup de filhos/temporários próprios. | **Campanha incompleta por recusa de foreground.** Nenhum atalho ou clipboard nativo completo declarado aprovado. |
| Q14 | Validate/OpenSpec/package/verify/smoke completos, duas janelas, leitura960.000 bytes, buffers mapeados, heap/working sets e volumes1000/10000. Todos os10 gates ui-bench passaram. | Medições pontuais, não teto/peak de heap nem prova de instalação. |

## Medições finais

Máquina: i5-13420H,12 cores lógicos,15,71GiB RAM, Windows10.0.26200 x64. Dois renderers reais com os mesmos dados confirmados. Interações/pintura medidas no manager em foco, conservando Quick Add aberto; captura pode focar a janela rápida.

| Métrica | 1.000 tarefas | 10.000 tarefas | Gate aprovado |
| --- | ---: | ---: | --- |
| Montagem manager | 376,42ms | 3.203,71ms | 2s /8s |
| Interações p95 | 78,03ms | 656,18ms | 500ms /2.500ms |
| Subtarefas p95 | 20ms | 130,2ms | 500ms |
| Heartbeat máximo | 101,3ms | 606,5ms | 250ms /2.500ms |
| Captura até oferta nova/held | 100,8ms | 89,72ms | 500ms /2.500ms |
| Raw fictício / leituras por20 gestos | 960.000 bytes /1 | 960.000 bytes /1 | <=1MiB /1 |
| Envelope pending mapeado | 4.765 bytes | 4.764 bytes | <=64KiB |
| Heap main antes/depois | 19.956.480 /18.030.888 bytes | 85.437.120 /106.759.112 bytes | Diagnóstico; sem teto adicional inventado |
| Working set renderers | 214.100 /128.172KiB | 979.488 /210.140KiB | Diagnóstico; dois renderers |

Quick Add montou em629,19ms, dentro de2s. A variação de heap inclui GC e estado compartilhado; não é alocação exclusiva nem pico da captura. Renderer com10.000 cartões tem custo relevante de DOM (343.710 elementos); os budgets D10 aprovados foram mantidos, sem virtualizar/cortar dados ou relaxar metas.

Benchmark de armazenamento separado:10.000 tarefas+100 trash, payload23,9MiB, saveMany428,94ms, mutação p952,83ms, página p954,01ms, preflight240,57ms, snapshot860,42ms e fechamento de portadora145,94ms. Volume de lembretes1000/10000×10: rebuild71,96/640,32ms e SQLp9511,88/7,19ms. PRAGMAs DELETE/EXTRA/foreign_keys/busy_timeout100ms confirmados no Electron.

## Coerência com o design e falhas corrigidas

D1/D2: facades por entry constante main/preload, runtimes por janela e defaults/form compacto preservados. D3–D6: domínio sem Electron/Vue/Pinia, leitura pontual, gates/epochs/recibos/geração e oferta não destrutiva. D7–D10: gramática finita, contratos exatos, arquivo/CAS independente, rebind provisório gated e UNKNOWN observável. D11: evidência fictícia por camada, campanha nativa/humana separada e continuidade documentada. Não foi identificada mudança material de escopo, arquitetura ou dependência.

As tentativas anteriores são falhas, não provas herdadas de sucesso: compilação/lint de fixtures corrigidos; controle por stdin do Electron GUI foi substituído por arquivos temporários finitos somente do harness; Quick Add herdava largura mínima e transbordava no zoom200, corrigido sem redesign; oferta ficou invisível nas áreas lixeira/backup, corrigida; medição de pintura fora de foco teve timeout, corrigida pelo foco da superfície medida; amostra Unicode tinha1.080.000 bytes e era corretamente recusada, ajustada para960.000. O último smoke sem flags passou no pacote identificado acima. Nenhum budget foi flexibilizado.

## Pendências por prioridade

### Não verificado — duas validações dispensadas para fechamento

1. **Task7.4 — Q13 completo não comprovado; dispensado pelo usuário.** A tentativa final registrou conflito real e `FOREGROUND_UNAVAILABLE` na fase `f20-from-other-app`; `runs:[]`, `ok:false`, `cleanup:true`. Tentativa anterior avançou até F21 e também falhou por foco. Falta comprovar ações globais/clipboard, rebind, restart, lease/suspend e liberação após Sair pela campanha inteira. O relato inicial de sucesso não foi confirmado: a saída fornecida pelo operador ainda contém a falha. Não repetir essa validação como requisito do fechamento; não substituir ausência de prova por callback simulado.
2. **Task7.5 — produto instalado e Q12 humano não comprovados integralmente; dispensados pelo usuário.** O usuário autorizou Setup/campanha na conta de testes e informou instalação/abertura sem UAC/erro. Sem `installed-evidence.json`; leitura de hashes no perfil dedicado negada. Conta/pacote correto, offline, DPI/Tab/IME/leitor de tela, energia/logoff e rotas instaladas continuam não verificados. O [roteiro instalado/humano](installed-manual-checklist.md) fica como referência; não continuar a campanha como requisito do fechamento nem herdar waiver da TFA-008.

Dispensa humana registrada em [closure-waivers.md](closure-waivers.md): **“Pode pular essas validações. vamos fechar essa change”**. Esses dois itens deixam de bloquear o fechamento por decisão do usuário, mas permanecem limites da verificação. A aprovação/autorização do relatório final foi recebida em2026-10-07.

### WARNING — limite de limpeza do smoke

O smoke encerrou seus processos TaskFlow e verificou Sair sem residual, mas o navegador externo aberto pelo cenário a11y manteve cache no perfil fictício sob `%TEMP%`. Diretórios próprios identificados: `taskflow-smoke-20316-1791359469959`, `taskflow-smoke-11724-1791360405590` e `taskflow-smoke-24380-1791360633797`. Houve tentativa de remover o primeiro após validar o path absoluto; falhou por arquivo de cache Chrome em uso. Não foram encerrados navegadores/processos alheios por inferência. Após liberar os handles desses perfis fictícios, remover somente esses diretórios absolutos conferidos; preservar o perfil real do usuário. Aviso permanece na evidência, mesmo com exit0 do último smoke.

### SUGGESTION

Nenhum ajuste opcional novo exigido nesta verificação. O working set medido pode orientar uma Change futura, sem reduzir o escopo ou alterar D10 aqui.

## Aprovação e continuidade

### Retomada da campanha com operador — 2026-10-07

O usuário informou sessão local desbloqueada e autorizou repetir Q13, executar Setup nesta máquina na conta de testes, conduzir testes humanos com dados fictícios e parar após relatório atualizado, sem archive/commit/push/PR. Repetição pelo agente: exit1, mesmo ASAR, `FOREGROUND_UNAVAILABLE` antes de F20, conflito real observado, `runs:[]`, `cleanup:true`. O operador informou posteriormente `ok:true`; o arquivo disponível continuou sendo a tentativa falha de 05:50. **Resultado relatado pelo operador aguarda confirmação pela saída completa/artefato; 7.4 ainda aberta.** Nenhum sucesso foi inferido desse desencontro.

O Setup correto é `release/TaskFlowApp-0.1.0-win-x64-Setup.exe`, hash6444365d… conforme tabela; o 0.1.1 existente é histórico, hash09f0a02e…, e não foi selecionado. Foi preparada cópia conferida em `C:\Users\Public\Downloads\TaskFlow-TFA009-20261007` com roteiro e `installed-tfa009-validation.ps1`. O helper recusa SID diferente da TFAProva2, conta administradora/elevada, ambiente de perfil incoerente e aplicativo já aberto antes de instalar; confere hashes, registro e atalho próprios depois. Parser PowerShell aprovado; teste na conta atual recusou `WRONG_TEST_ACCOUNT` antes de qualquer Setup. No sandbox, execução de .ps1 foi bloqueada pela política; a tentativa fora dele chegou ao guard esperado. Nenhuma política foi alterada. A execução real na conta dedicada e os testes humanos continuam aguardando o operador.

Preparação não equivale a instalação ou aprovação. A autorização recebida cobre esta campanha; a aprovação do relatório e demais ações continuam separadas. Os gates de aplicação anteriores permanecem válidos: somente helper de validação e documentação foram adicionados nesta retomada.

### Decisão final do usuário — dispensar validações e fechar

Após os passos acima, o usuário disse **“Pode pular essas validações. vamos fechar essa change”**. Campanha adicional interrompida. A saída fornecida confirmou Q13 falho/guard de conta; a instalação/abertura sem UAC foi apenas relatada e não teve conta/hash/artefato confirmado. Nenhuma dessas validações foi marcada PASS. O modo de foco manual esboçado nesta retomada foi retirado antes de execução, preservando o harness anterior; lint adicional aprovado. Não houve mudança de produto/pacote.

**43 tarefas executadas, duas não verificadas e dispensadas; um warning de limpeza.** Tracking encerra7.4/7.5 como DISPENSADA, sem evidência de execução, e Scenario Coverage permanece parcialmente não verificada (Q12/Q13/produto instalado/energia/logoff/ativação). Não foi identificada implementação ausente nos29 requisitos. A dispensa permite o fechamento solicitado com esses limites, após aprovação explícita deste relatório atualizado. Não declarar verificação integral ou produto instalado aprovado.

O relatório final recebeu aprovação/autorização explícita do usuário em2026-10-07, conforme mensagem registrada abaixo. Archive e consolidação concluídos; commit/push/PR autorizados. Merge/distribuição/próxima Change permanecem fora da autorização. Não marcar DONE antes da integração aprovada.

## Aprovação humana e fechamento autorizado — 2026-10-07

Mensagem recebida após apresentação do relatório final: **“aprove o relatório, faça o archive, commit, faça o push e crie o PR”**. Aprovação/autorização explícita registrada para cumprir AGENTS.md42; dispensa7.4/7.5 permanece e não significa PASS. Consolidar19 requisitos adicionados e10 modificados (29/75 cenários); a classificação anterior18/11 foi corrigida na conferência de archive, sem mudança de comportamento ou escopo. Archive, commit, push e PR autorizados; merge/distribuição/próxima Change não autorizados.

## Archive e gates finais — 2026-10-07

Sete deltas consolidados (19 ADDED/10 MODIFIED;29 requisitos/75 cenários),16/16 specs estritamente válidas. CLI copiou16 arquivos para o archive, mas o sandbox bloqueou cleanup da origem; recuperação por PowerShell comparou SHA-256 de todos os16 arquivos/metadados antes de remover somente a origem duplicada, dentro do workspace. Nenhuma Change ativa restante. O primeiro gate de archive rejeitou os dois checkboxes abertos; tracking foi ajustado para **DISPENSADA E ENCERRADA** por decisão humana já aprovada. Resultado administrativo45/45 não é45 verificações: continuam43 executadas e2 dispensadas, Scenario Coverage parcial. Gates finais reexecutados após esse registro; evidências históricas não foram apagadas. Gates finais: `openspec validate --all --strict --no-interactive --json` **16/16 specs PASS**; `openspec validate --archived --strict --no-interactive --json` **9/9 archives PASS**, ambos exit0. `git diff --check` exit0.
