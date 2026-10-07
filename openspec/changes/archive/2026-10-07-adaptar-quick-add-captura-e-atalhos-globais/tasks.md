# Tasks

Artefatos aprovados explicitamente em 2026-10-06; apply retomado em 2026-10-07. Checkboxes registram somente implementação e verificações efetivamente concluídas. Referências: [design.md](design.md), sete deltas em specs e Q01–Q14. Testes usam dados fictícios e cópia revisada de funções/testes portáveis; extensão/Git estritamente somente leitura. Não trocar arquitetura, limites ou dependências no apply sem revisão material. Campanha instalada/humana e aprovação do relatório continuam separadas.

## 1. Domínio de captura e atalhos

- [x] 1.1 Introduzir tipos portáveis de draft/resultado/flags e funções de normalização/corte revisadas da origem; verificar Q02 nos limites199/200/201 e3999/4000/4001, linhas, emoji e substituto órfão com testes unitários.
- [x] 1.2 Implementar classificação token absoluto versus texto conforme D4 e origem manual segura; verificar Q01 com HTTP/HTTPS, IDNA/canonicalização, controle/userinfo/esquemas/malformado, whitespace interno, URL embutida e URL longa sem fetch/truncamento.
- [x] 1.3 Definir portas ClipboardTextReader, inbox/clock/IDs, registry e preferences sem imports Vue/Pinia/Electron; verificar typechecks e testes com adapters falsos, sem any ou emulação de browser/chrome.
- [x] 1.4 Definir enum de três ações e combo estruturada/allowlist/defaults/duplicatas conforme D7; verificar Q08 com K/L/null, remover/default, F4, Win, AltGr/Ctrl+Alt e payload extra/invalidado.
- [x] 1.5 Documentar mapeamento, cortes e diferenças da captura Chrome em documentação de captura; verificar exemplos fictícios contra Q01/Q02 e ausência de promessas de título automático/origem inferida.

## 2. Contratos, roles e bridge

- [x] 2.1 Acrescentar nove contratos v1 de D8 e schemas runtime exatos de requests/results/erros, ID/seq/revision; verificar testes de shape/extras/versões/envelope UTF-8/escaping e budgets1KiB/8KiB/64KiB.
- [x] 2.2 Atualizar status/inscrição/eventos desktop para v2 por superfície com referências de captura/atalhos; verificar rejeição de v1 alterada, event<=1KiB sem descrição e versões de tarefas/startup/saída/resolução preservadas.
- [x] 2.3 Associar roles confiáveis no main e expor facades35 manager/14 Quick Add, sem canal ou setter livre; verificar testes de catálogo/preload e recusa de operação de manager em QUICK_ADD mesmo com request forjado.
- [x] 2.4 Integrar guards de documento/sessão/role/frame/origem/URL/admissão antes de todos os novos efeitos e revalidar após awaits; verificar Q11 com sentinelas garantindo zero leitura/registro/gravação/janela em negativos.
- [x] 2.5 Integrar listeners locais/disposer, epochs e saída validada à bridge/state client sem operações ausentes da facade rápida; verificar listener único, unsubscribe/reload/crash/late response e nenhuma publicação entre documentos.
- [x] 2.6 Atualizar documentação de contratos/catálogo/budgets com lista35/14 e versões; verificar alinhamento de main/preload/renderer/testes e ausência de raw clipboard/accelerator/path/URL livre.

## 3. Preferências e registro de atalhos

- [x] 3.1 Implementar adapter de arquivo próprio version1/8KiB com três ações exatas, revision decimal e defaults missing sem gravar; verificar Q09 para futura/corrupta/ilegível/excesso/alteração externa, preservando bytes sem fallback de escrita.
- [x] 3.2 Implementar publicação temp exclusivo/flush/readback/previous/rename/releitura e retenção limitada de D9; verificar faults em cada fase e kill antes/depois da publicação, sem restauração silenciosa ou sucesso indevido.
- [x] 3.3 Implementar fila única/CAS/no-op/limites de preferência e integração de status desired/observed; verificar Q08/Q09 com dois clientes, revisão stale,8aguardando/espera2s e estado incerto global bloqueando novas escritas.
- [x] 3.4 Implementar adapter globalShortcut individual após ready/ownership e defaults condicionado ao perfil; verificar Q08 com register false/throw/isRegistered, dev/test desativado e nenhum unregisterAll ou identificação de app concorrente.
- [x] 3.5 Implementar rebind provisório/gates/persistência/liberação antiga e disable/default conforme D10; verificar barreiras/faults de registro/disco/unregister/compensação, antiga preservada quando comprovado e UNKNOWN sem replay.
- [x] 3.6 Implementar consulta/reconciliação explícita de estado incerto e lease de edição do manager focado; verificar perdido ack, blur/close/reload/crash/suspend/quit e limpeza somente de registros próprios.
- [x] 3.7 Documentar preferência versus registro, recuperação manual, retention/upgrade/downgrade/uninstall e exclusão de backup; verificar Q09 com export/import sem alterar prefs e exemplos de conflitos/UNKNOWN coerentes.

## 4. Duas superfícies e ciclo de vida

- [x] 4.1 Compor singleton Quick Add seguro e seletor/entrada local em allowlist conforme D1; verificar Q10/Q11 para root/URL/query/argv inválidos, sandbox/CSP e owner/coordenador/scheduler únicos.
- [x] 4.2 Refatorar close/admissão/controle por superfície, mantendo minimize/foco e memória local; verificar Q10 ao fechar cada uma/ambas e reabrir com nova sessão/snapshot sem retirar autoridade da outra.
- [x] 4.3 Adaptar suspend/resume/Sair/logoff para ambas e gates de clipboard/atalhos, preservando recuperação de lembretes da TFA-008; verificar dreno/late effects/quit idempotente e sem replay após reabrir.
- [x] 4.4 Acrescentar rotas finitas de botão/tray e manter segundo lançamento/COM/notificação no manager; verificar Q10 em abertura falha, janela destruída, tray inválido e fechamento da última sem processo oculto irrecuperável.
- [x] 4.5 Documentar política de fechar/reabrir, memória transitória e rotas de recuperação; verificar texto acessível em ambas, sem anunciar recuperação de draft após Sair/crash ou foco garantido.

## 5. Leitura e entrega de capturas

- [x] 5.1 Implementar adapter main de readText Promise e gate físico único/deadline5s/limite raw1MiB pós-alocação; verificar Q03 com vazio/sem texto/throw/limite/timeout/Promise pendente e BUSY sem acumular leituras.
- [x] 5.2 Implementar destinação global/tray Quick Add e local própria superfície com epochs/seq; verificar resultado tardio depois de timeout/hide/suspend/reload/destruição/quit e nenhuma substituição em falha/vazio.
- [x] 5.3 Implementar slots staged/held/recibos limitados e TTL monotônico exato600000ms antes de apresentação; verificar Q06 nas fronteiras, eventos/consultas sem renovação e held sem expiry inclusive hidden/suspend.
- [x] 5.4 Implementar get/presented/applied/discard idempotentes ligados a ID/seq/documento e eventos de referência coalescidos; verificar Q07 com ack perdido/superseded/duplicado/reordenado, slot novo protegido e consulta não destrutiva.
- [x] 5.5 Implementar reconciliação de cópia provisória/recibo e alteração de geração do form durante await; verificar Q07 em apresentação expirada, late applied conservando draft atual e perda de held em crash/reload sem retarget.
- [x] 5.6 Documentar erros, destino, TTL, substituição e perdas transitórias; verificar exemplos/fluxos contra Q03/Q06/Q07 e ausência de raw em logs/events/backups.

## 6. Quick Add e revisão no gerenciamento

- [x] 6.1 Criar componente compacto com campos/validação/defaults/descrição/origem revisáveis sem redesign; verificar Q04/Q12 em360px/zoom200, título obrigatório, prazo/fuso e URL isolada com foco no título.
- [x] 6.2 Integrar criação à confirmação/snapshot do state client próprio, sem compartilhar lastConfirmed; verificar sucesso/erro/stale/unknown/commit sem ack e manager em edição preservado, sem retry automático.
- [x] 6.3 Integrar reabertura/abrir manager/preservação de foco e draft rápido; verificar Q04 em hotkey repetida, falha de abertura, hide/resume e filtros/scroll/área/base/form do manager preservados.
- [x] 6.4 Acrescentar botão Capturar e apresentação/oferta/aviso de corte/substituição em ambas; verificar Q01/Q02/Q05/Q06 e edição/remoção de origem sem ler clipboard novamente ou abrir draft.
- [x] 6.5 Integrar inicialização de captura à criação livre do manager e safe gate completo; verificar dirty por cada campo, editor de tarefa vazia, save/conflito/trash/backup/unknown/lembrete e nenhuma sobrescrita.
- [x] 6.6 Implementar Revisar/Descartar com revalidação após handshake; verificar voltar à lista sem aplicação automática, oferta substituta anunciada, discard sem salvar e captura expirada/ack incerto conservando inputs.
- [x] 6.7 Implementar settings/hints de atalhos e editor por teclado com lease focado; verificar Q08/Q12 desired/registered/null/conflito/UNKNOWN/defaults e edição sem disparar ações globais.
- [x] 6.8 Implementar foco/Tab/Enter/Escape/IME/alertas/busy nas novas entradas; verificar testes de componentes Q12 sem envio indevido de textarea/IME, foco de erros e fechamento sem descarte.
- [x] 6.9 Atualizar guia operacional e matriz de paridade da TFA-001 para captura/Quick Add/atalhos realmente implementados; verificar diferenças declaradas, exclusões/limites e instruções reproduzíveis, sem anunciar IA ou rede.

## 7. Integração, Windows e entrega de verificação

> Fechamento solicitado em2026-10-07: o usuário dispensou as validações ainda não comprovadas das tasks7.4/7.5. Encerradas administrativamente como DISPENSADA para distinguir43 executadas de duas dispensadas; ver closure-waivers.md e relatório final. A dispensa não é PASS nem aprovação do relatório.

- [x] 7.1 Executar npm run validate com Node24.21.0/npm11.21.0 existentes e OpenSpec Change/--all/--archived estritos; registrar comandos/resultados e verificar regressões de lembretes/COM/backup/undo, sem instalar dependências ou executar origem.
- [x] 7.2 Executar package:win/verify:package/smoke:packaged no projeto e inspecionar bridge35/14/recursos locais/proteções; registrar evidência de pacote sem tratar smoke como prova de hotkey/clipboard/foco nativo.
- [x] 7.3 Medir Q14 com duas janelas, leitura fictícia grande/coalescimento/heap/latência e volumes1000/10000; verificar budgets novos e D10 revisado TFA-008, sem cortar dados ou relaxar metas silenciosamente.
- [x] 7.4 DISPENSADA E ENCERRADA por decisão explícita do usuário em2026-10-07; evidência não comprovada, não contar como teste PASS. Critério original dispensado: Executar harness Windows opt-in isolado de Q13 com outro app em foco, tray/hidden, conflito real, customize/rebind/restart/quit e dados fictícios; registrar tentativa/resultado/cleanup sem interferir em perfil prod/extensão.
- [x] 7.5 DISPENSADA E ENCERRADA por decisão explícita do usuário em2026-10-07; evidência não comprovada, não contar como teste PASS. Critério original dispensado: Executar campanha no produto instalado somente com ambiente/autorização correspondentes, incluindo offline/conta padrão/clipboard/foco e Q12 humano de teclado/zoom/DPI/leitor de tela; verificar por evidência real, preservando limitações herdadas sem inferir waiver novo. Se ausente, registrar pendência e manter este item não concluído.
- [x] 7.6 Executar openspec-verify-change após apply e criar verification.md na própria Change com aderência de tasks/deltas/Q01–Q14, gates/evidências/falhas/limitações; verificar relatório completo e parar para aprovação humana antes de archive.
- [x] 7.7 Atualizar roadmap com estado verdadeiro, datas/evidência e prompt de continuidade caso haja pendência; verificar que nenhuma task não executada foi marcada concluída e que apply não iniciou próxima Change/merge/distribuição. README final e archive permanecem para etapa autorizada após aprovação do relatório.
