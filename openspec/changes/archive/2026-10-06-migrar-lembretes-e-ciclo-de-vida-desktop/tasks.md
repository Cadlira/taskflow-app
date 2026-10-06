# Tasks

## 1. Regras e drafts portáveis

- [x] 1.1 Copiar seletivamente regras/presets/drafts da origem revisada para o app, sem adapters Chrome; verificar M01 por testes de tipos,0/10/11 itens,0/15/60/1440, OFFSET seguro/duração exata, AT<=due e instantes únicos/representáveis.
- [x] 1.2 Integrar validação de configuração nova/alterada<=now, prazo/recorrência/IDs atuais e geração no main; verificar M01 por clock de execução, AT recorrente recusado, IDs ausentes/estranhos/duplicados e três tentativas limitadas sem escrita parcial.
- [x] 1.3 Preservar ISO/configuração/markers intactos e revisão de fuso em AT editado; verificar M01/M03 com segundos/milissegundos, DST/gap/repetição, omissão/[]/null e claim ocorrido depois da base de edição.
- [x] 1.4 Criar classificação pura de futura/elegível/expirada/inaplicável e distinguir recuperação de settlement de mutações; verificar M02/M06 nas quatro fronteiras−1/igual/+300000/+300001 para startup/resume/reopen e estados terminais/processados.
- [x] 1.5 Documentar regras e diferenças deliberadas de startup/settlement em guia de lembretes no app; verificar exemplos contra testes M01/M02, sem anunciar scheduler antes da composição funcional.

## 2. Processamento coordenado e fronteira externa

- [x] 2.1 Ampliar porta/unidade interna para reler Task/tupla/clock e retornar candidato fresco ou consumo sem aviso; verificar M03/M04 com SQLite real e content/edit/updatedAt conservados, global pertinente e claim duplicado no-op.
- [x] 2.2 Acrescentar conclusão externa afterReleased restrita ao main após retorno da unidade e fora de SQL/onCompleted, preservando pump por macrotask; verificar M03 por barreiras que impedem outra unidade/reentrância até solicitação do efeito.
- [x] 2.3 Aplicar guard de disponibilidade/revision/epoch/runtime/capacidade/clock imediatamente antes do submit síncrono; verificar M02/M03 por avanço/recuo depois do claim, candidato antigo, suspend/quitting e título/prazo atuais.
- [x] 2.4 Conter queue/timeout/lock/rollback/incerto e erro de conclusão/submissão sem alterar commit confirmado; verificar M04 por fault-points, nenhum efeito incerto e recuperação validada com marker confirmado ou pendente real.
- [x] 2.5 Acrescentar crash-child antes/depois de claim/COMMIT/submit e contador de tentativas fictícias; verificar M04 por reopen íntegro, no máximo uma tentativa por pendência consumida e perda possível sem retry/exactly-once.
- [x] 2.6 Documentar fronteira claim→submissão, limites posteriores do Windows e classificação de falhas; verificar texto por correspondência aos oráculos M03/M04 e ausência de promessa de rollback/entrega visual.

## 3. Agenda descartável e recuperação

- [x] 3.1 Implementar serviço/portas portáveis e índice atualizável por tarefa com uma agenda/uma unidade em voo; verificar M02/M12 por timers falsos, ausência de timer por reminder, fila massiva ou títulos como autoridade.
- [x] 3.2 Integrar dirty IDs/epoch/reset in-memory no onCompleted e coalescimento fora da unidade; verificar M03/M06 com commits sobrepostos/rollback, claim sem rebuild recursivo e nenhum scan total por commit.
- [x] 3.3 Implementar rebuild cooperativo startup/resume/reopen/storage-recovered e fallback60s, páginas128/journal de alterações/três reinícios; verificar M02/M06/M12 por reset durante montagem, churn/BUSY, índice nunca parcial e eventos perdidos.
- [x] 3.4 Limitar delay2147483647/reavaliação60s, recursos64MiB e tombstones/journal; verificar M02/M12 por relógio/fuso/timer distante, excesso RESOURCE_LIMIT sem truncar dados e recuperação posterior limitada.
- [x] 3.5 Integrar reserva anterior a claim de até16 submissões nativas, liberação por callback/deadline10s e capacidade cheia reavaliada sem loop; verificar M04/M12 por atraso/expiração, objetos liberados e nenhum retry após consumo.
- [x] 3.6 Atualizar D6 da arquitetura e guia de operação para política real da agenda quando composta; verificar exemplos M02/M06 e medição inicial1000/10000×10 mantendo orçamentos e D10 herdados separados.

## 4. Mutações tarefas séries lixeira undo e backup

- [x] 4.1 Integrar reminders em create/update com CAS de edição/markers atuais e settlement atômico, conservando guards provisórios até composição final; verificar M01/M03/M06 por edição independente/collection/due/status e nenhum save stale.
- [x] 4.2 Integrar status/DONE/SKIP/END/adiamento/retirada de reminders com fechada+gerada e IDs OFFSET novos; verificar M05 por falha entre escritas/settlement, portadora única e cópia sem marker herdado.
- [x] 4.3 Conectar move/delete/empty/purge/restore e undo simples/série às invalidações pertinentes; verificar M03/M05/M06 por remoção de atividade, markers preservados, gerada removida condicionalmente e nenhum aviso retroativo.
- [x] 4.4 Conectar backup APPLIED/UNCHANGED/empty à barreira de reset, sem mudar codec4/SQL2/formato1–4; verificar M06 com no-op sem evento SQL, arquivo autoritativo, CAS global/claim e coleção vazia sem timer órfão.
- [x] 4.5 Verificar integração de todas as mutações versus timer/claim e falha externa pós-commit em SQLite real; verificar M03–M06 por nenhuma meia geração/sobrescrita/undo invalidado por claim ou rollback fictício.
- [x] 4.6 Atualizar documentação de recorrência/undo/backup e paridade quando integração existir; verificar precisão de settlement/futuro/at-most-once e preservação das exclusões do arquivo/configuração.

## 5. Contratos preload e admissão

- [x] 5.1 Versionar create4/update5 e reminder drafts exatos/erros por item, preservando state3/status4/check3/move2/backup1; verificar M01/M11 por shapes/versões antigas/processedFor/clock/ID novo em cliente e budgets64KiB/8KiB.
- [x] 5.2 Criar cinco wrappers desktopv1/status/setter/quit/eventos/resolução e catálogo26 sem IPC livre; verificar M11 por campos/versões/códigos finitos e inspeção da bridge no preload real.
- [x] 5.3 Implementar inscrição de controle finita com disposer, guards de contents/mainframe/origem/URL e eventos1KiB/sequência/buffer; verificar M07/M11 por handshake, duplicação, reload/crash, callbacks locais e até oito documentos.
- [x] 5.4 Integrar retirada real da admissão oculta/suspensa e fencing de respostas/pedidos com nova sessão; verificar M07/M11 com renderer que ignora suspensão, frame alheio/URL blob/about:blank e ack antigo após reabertura.
- [x] 5.5 Documentar catálogo/versionamento/shape e separação de controle versus autoridade de produto; verificar M11 por testes de contrato/main/preload e nenhuma capacidade de notifier/path/reativar sessão pelo renderer.

## 6. Janela bandeja energia e saída

- [x] 6.1 Implementar lifecycle no main com Tray/ícone/tooltip/Abrir/Sair e flags de visibility/power/quitting; verificar M08 por fake Tray e menu, recuperação da janela e nenhuma saída no window-all-closed com tray válido.
- [x] 6.2 Implementar close/hide com unregister, cleanup dos clientes/transientes/jobs e preservação Vue em memória; verificar M07 por X/Alt+F4, draft/filtros/base intactos, undo/preview/pedidos antigos inválidos e minimize sem cleanup.
- [x] 6.3 Implementar Abrir com reconciliação/nova sessão/snapshot e bloqueio de escrita até estado válido, sem trocar base/replay; verificar M07 por stale/conflito, commit sem ack e uma inscrição atual.
- [x] 6.4 Implementar falha conhecida de tray e renderer crash/destruição com janela visível ou recriação segura; verificar M08 por caminho de recuperação/Sair e ausência de promessa de draft recuperado após crash.
- [x] 6.5 Implementar suspend/resume e saída idempotente/before-quit/query-session-end/session-end Windows, cancelando claims internos ainda não iniciados; verificar M02/M08 por unidade/backup ativo, quit repetido, ausência de hide ao sair e fechamento íntegro da conexão.
- [x] 6.6 Documentar ciclo de vida/limites de logoff/energia e atualizar roteiro humano de close/minimize/quit; verificar M07/M08 por testes de integração e texto que não confunde desligar PC com aviso garantido.

## 7. Identidade instalada e notifier Windows

- [x] 7.1 Preparar AUMIDs/names/CLSIDs isolados e recurso runtime do ícone existente, notifier fake padrão em dev/test; verificar M09/M11 por pacote/guard de produção e nenhum registro/atalho prod criado em testes comuns.
- [x] 7.2 Acrescentar metadata NSIS própria v1, adapter de registro restrito com Windows PowerShell preexistente/UTF-8/deadline e validação/atualização de shortcut AUMID+CLSID antes do presenter; verificar M09/M10 por readback/falhas/ownership/Unicode/encoding/excesso/política bloqueada e nenhum script/path livre ou runtime/módulo instalado.
- [x] 7.3 Implementar tag SHA25664 da tupla canônica e notifier main com título/prazo atuais, reserva/callbacks/códigos seguros; verificar M03/M04/M09 por IDs longos/Unicode/delimitadores, unsupported/failed/show e nenhuma reflexão em logs.
- [x] 7.4 Integrar bootstrap Notification sem show e cleanup de recursos próprios no uninstall/upgrade, mantendo dados/identidade/startup; verificar M09/M10 por testes de script/ownership/CLSID estrangeiro e ausência de helper/serviço/dependency nova.
- [x] 7.5 Documentar cadastro efetivo/primeiro launch/cleanup e roteiro instalado de toast/AUMID/CLSID/DND/ícone/prazo; verificar que mock/show/build não são evidência de exibição nativa e preparar fixtures fictícias para M09.

## 8. Ativação e localização segura

- [x] 8.1 Implementar handler central único e parsing limitado/índice reconstruído de tags incluindo processados; verificar M09/M11 por click+callback sem navegação dupla, marker corrente, removidos/alterados/ambiguidade e payloads malformados.
- [x] 8.2 Implementar owner/manual/cold COM e relay transitório10s sem storage, forwarding fechado pelo lock e coalescimento2s; verificar M08/M09 por barreiras, morte do owner, segunda instância, timeout e um writer.
- [x] 8.3 Implementar resolve por revision/ordinal e confirmar ordem canônica SQL/paginação/assembler antes de consumo; verificar M09/M11 por IDs históricos extensos, mudança entre leitura/snapshot e BUSY após três tentativas sem selecionar alvo incorreto.
- [x] 8.4 Implementar destaque temporário fora dos filtros e consulta do alvo sem substituir draft, com foco e Voltar; verificar M09/M11 por filtro/draft aberto/alvo sumido/status atual e zero mutação/URL/path.
- [x] 8.5 Documentar cold activation/relay/limites de referência obsoleta e retorno à lista; verificar roteiro M08/M09 e distinção entre rota fake/harness/callback COM instalado.

## 9. Inicialização opcional com o usuário

- [x] 9.1 Implementar preferência startupv1 no registro próprio como única fonte durável, getLoginItemSettings por path/args e launchItem próprio; verificar M10 por ausência default/OFF, scope/name/args, entrada alheia/futura e nenhuma config JSON/SQL/backup criada.
- [x] 9.2 Implementar setter opt-in/out em prod instalado com gate/revalidação/readback e falhas parciais; verificar M10/M11 por desired boolean, Run/StartupApproved, UNKNOWN/resultado perdido e nenhum replay/compensação automática.
- [x] 9.3 Implementar argumento constante de login hidden com fallback tray e manual visible, respeitando desativação externa e reconsulta sem escrita; verificar M07/M10 por startup/foco/60s, caminhos Unicode e ausência de registro fora de prod instalado.
- [x] 9.4 Integrar upgrade/uninstall/reinstalar à preservação/remoção própria de startup/aprovação; verificar M10 por scripts/adapters/ownership, OFF após uninstall e registros/segunda conta não afetados.
- [x] 9.5 Documentar opt-in/out, estado externo, limites e rollback para binário antigo; verificar exemplos M10 e preparar roteiro de conta padrão/upgrade/uninstall sem declarar execução ainda não realizada.

## 10. Formulário comunicação e acessibilidade

- [x] 10.1 Migrar controles/presets/unidades/adição/remoção de reminders ao formulário Vue com patches de intenção; verificar M01/M11 por teclado, erro por item, precisão de AT intacto e limite10 sem redesign.
- [x] 10.2 Integrar estado seguro de reminders/startup e opções de fechar/Sair/login em área secundária; verificar M07/M10/M11 por texto verdadeiro, toggle desligado/busy/erro/readback e controles focáveis.
- [x] 10.3 Suspender clientes/subscriptions/polls ao hide/power e retomar sem replay/reset de drafts/filtros; verificar M07 por eventos atrasados/nova sessão/conflicting draft e nenhuma oferta/preview ressuscitada.
- [x] 10.4 Verificar foco/semântica/zoom200/DPI/contrastes no formulário/opções/destaque e recuperação de erro; verificar M11 por testes de componentes e roteiro humano distinguindo execução comprovada de pendência de leitor de tela.
- [x] 10.5 Atualizar guia de operação/paridade somente para recursos compostos, incluindo aviso de memória transitória/graça/crash/Windows bloqueado; verificar M01/M07/M09/M10 e conservar README factual para archive autorizado.

## 11. Composição gates integrados e revisão

- [x] 11.1 Compor serviços reais/guards de runtime e retirar D8 somente após integração completa de mutações/agenda/notifier/lifecycle; verificar M01–M08 por comandos/preload/main/SQLite reais e todos os guards provisórios pertinentes removidos sem relaxar validações.
- [x] 11.2 Ampliar harness empacotado com IPC26, duas superfícies, reminder races/clock/recovery/backup no-op/close/quit/crash; verificar M02–M08/M11 com perfis fictícios, hooks fora do preload normal e nenhuma escrita na origem.
- [x] 11.3 Executar campanha Windows instalada em conta padrão/autorizada com toast/COM/cold/race/tray/logoff/login/Unicode/upgrade/uninstall/segunda conta; verificar M08–M11 por evidências sanitizadas reais, sem Setup corporativo/distribuição não autorizados e sem marcar task concluída quando prova bloqueante falta.
- [x] 11.4 Medir1000/10000×10, burst/fallback/CPU/charge/heap/RSS/latência/heartbeat/rebuild e limites estruturais; verificar M12/orçamentos D11 e registrar falhas sem relaxar D10/a11y/energia herdados ou truncar dataset.
- [x] 11.5 Executar npm run validate e OpenSpec estrito da Change/--all/--archived, package:win --publish never, verify:package e smoke:packaged; verificar logs/contagens/runtime/hash, corrigindo somente escopo autorizado e sem instalar dependências/publicar.
- [x] 11.6 Executar openspec-verify-change e gerar verification.md com aderência aos dez deltas/D1–D11/M01–M12/gates/pendências; verificar relatório e roadmap em revisão, entregar evidências e parar para aprovação explícita antes de archive/README/commit/push/PR/merge ou próxima Change.
