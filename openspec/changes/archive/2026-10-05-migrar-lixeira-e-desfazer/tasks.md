# Tasks

## 1. Política portável e liquidação pura

- [x] 1.1 Recortar regras de retenção/limite/ordem da origem para domínio independente, com clock injetado; verificar L01 por 29d/exatos30d/30d+1ms/31d/futuro/DST, empate por revisão/ID UTF-16 e 100→101.
- [x] 1.2 Implementar planejamento puro de inserção/substituição e retained:false com relógio recuado e 100 entradas futuras; verificar preservação integral de Task, descarte somente previsto e ausência de recuperação colateral nos testes L01/L02.
- [x] 1.3 Recortar settleElapsedReminders e combinar preservação de processedFor atual antes da liquidação; verificar L09 com AT/OFFSET <=now/futuros, terminal, ausência de dueAt, gatilhos extremos e claims, sem scheduler ou relaxamento D8.
- [x] 1.4 Documentar retenção decorrida, empates adaptados, capacidade/relógio e liquidação sem agendamento em documentação operacional/paridade do app; verificar correspondência com deltas e exemplos testados, sem anunciar importação de lixeira/undo por backup.

## 2. Unidades condicionais de lixeira

- [x] 2.1 Evoluir move atual para read/decide/validate/commit com purge/substituição/cap e contentRevision=editRevision=g na nova entrada; ajustar teste que exigia metadata antiga e verificar L02/L05 com homônimos tasks/trash, mesma metadata/data e SQL2/codec4 preservados.
- [x] 2.2 Evoluir restore para conferir referência/idade/ID e portadora no plano final por coleção, conservando timestamps e liquidando vencidos; verificar L03/L09, ordem NOT_IN_TRASH→ENTRY_CHANGED→ENTRY_EXPIRED→ID_EXISTS→SERIES_CONFLICT e nenhuma geração/alteração em recusa.
- [x] 2.3 Implementar preparação pura e bases internas de MOVE/PERMANENT/EMPTY, aplicação condicionada e token próprio consumido uma vez; verificar L05 por composição/identidade alterada, check/edição versus claim e tarefa independente sem falso conflito global.
- [x] 2.4 Conectar manutenção explícita de startup válido/entrada/move, preservando leituras puras e no-op sem revisão/evento; verificar L04 por falha recuperável/incerta, coleção histórica >100, retry e ausência de expurgo em restore recusado/timer.
- [x] 2.5 Cobrir concorrência de restore×restore/permanent/empty/purge e restore→delete com mesmo relógio em testes de aplicação com barreiras; verificar somente decisão aplicável confirma e todas as recusas conservam ambas as coleções/revisões em L05.
- [x] 2.6 Ampliar testes de falhas entre efeitos/coleções e COMMIT, incluindo overflow e planejamento inválido; verificar L10 por rollback/reopen integral e proibir recusa retornada depois de escrita parcial sem rollback.
- [x] 2.7 Atualizar documentação de unidades/metadados e matriz de paridade para identidade nova, perda colateral e restore condicionado; verificar que exemplos de metadata/CAS coincidem com testes e não pressupõem SQL3 ou manutenção em leitura.

## 3. Recibos, reversão e recursos no main

- [x] 3.1 Capturar fatos internos de undo da leitura atual em update/status/fechamento e move, sem Task/UndoPlan no DTO; verificar L06/L07 com before-image após checks de form aberto, referência exata da gerada e oferta somente APPLIED/retida.
- [x] 3.2 Criar registro por documento com token opaco, publicação pós-commit e orçamento lógico global64MiB de recibos/confirmações/candidatos; verificar L12 por charge determinístico, reserva/clone insuficiente antes de efeito, oito sessões e liberação completa no consumo/clear/cleanup.
- [x] 3.3 Implementar REVERT condicionado por contentRevision completa do alvo/gerada, preservação de claims, updatedAt/revisões novas e validação da portadora final; verificar L07/L08 por todos os campos/done/ordens, ABA/check/ausência e homônimos entre coleções.
- [x] 3.4 Remover gerada diretamente de tasks no mesmo commit da restauração, sem lixeira ou cálculo de próxima; verificar L08 com DONE/SKIP/END/fim natural/edição terminal/retirada de regra/reabertura, gerada editada/check/excluída/restaurada/avançada e conflito de série sem meia reversão.
- [x] 3.5 Implementar DELETE via restore condicionado e consumo próprio em sucesso/recusa/falha, sem redo/reconstrução; verificar L03/L06/L09 por vencimento sem abrir lixeira, ID/série, descartes colaterais, token repetido/alheio e storage incerto.
- [x] 3.6 Implementar protocolo de contexto monotônico/slot único, guarda de publicação e onInvalidated, incluindo candidatos ainda referenciados no orçamento; verificar L06/L12 com fila antiga, contexto novo antes/depois do commit, clear igual/menor, resposta tardia e fechamento sem expiração por minimize/foco.
- [x] 3.7 Entregar somente porta interna invalidateAfterSuccessfulBackupRestore com época que cerca candidatos antigos; verificar L09 em fixtures APPLIED/UNCHANGED/cancel/falha/resultado incerto, invalidação global e trash intacta, sem wrapper/percurso funcional de TFA-007.
- [x] 3.8 Documentar tipos/fases/charge/cleanup e contrato futuro de backup/reminders; verificar que memória temporária não é anunciada como histórico persistente, exportado ou recuperável após fechamento, e que propagação visual do backup continua atribuída à TFA-007.

## 4. Contratos IPC, preload e projeção autoritativa

- [x] 4.1 Versionar create/update/status/setSubtaskDone em v3 com contexto e APPLIED/UNCHANGED, mantendo edit CAS e schemas de intenções; verificar L11 por rejeição de mutações v1/v2, guards D8 e tokens somente elegíveis, com main/preload/renderer coerentes.
- [x] 4.2 Acrescentar exatamente oito wrappers v1 descritos em D7, uniões exatas, referências e códigos fechados por operação; verificar schemas de entrada/saída e catálogo final17, estado v2 e diagnóstico/origem v1 sem RPC genérico ou autoridade livre.
- [x] 4.3 Aplicar autorização de remetente/documento/contexto em admissão/execução/saída e validar DTO antes de tocar tokens; verificar L11 com versão/campo extra/clock/Task/UndoPlan/sessionId indevidos, token alheio e sessão encerrada, sem efeito/acesso ou consumo legítimo alheio.
- [x] 4.4 Medir envelopes/Unicode/escaping e reservar ack curto antes de escrita sob 64KiB/8KiB, preservando budgets de estado/paginação/fila atuais; verificar L12 com IDs/before-images grandes e base EMPTY, sem Task no ack, truncamento ou falso erro pós-commit.
- [x] 4.5 Ampliar adoção atômica da store existente para tasks+trash usando o mesmo cliente/subscription; verificar L12 por snapshot inteiro, paginação, evento perdido, ack antigo e snapshot>=ack sem upsert/replay, regressão ou token inferido do estado.
- [x] 4.6 Conectar cliente ao clear ordenado/seq atual antes de ação dependente e à espera de snapshot antes de confirmar/ofertar; verificar L06/L11 com perda de transporte, ack confirmado e ressync falho, contexto trocado e resposta antiga sem ressuscitar/apagar oferta.
- [x] 4.7 Atualizar documentação do catálogo/versionamento/erros/budgets e testes de paridade main/preload; verificar shapes publicados contra schemas e preservar separação entre recurso planejado e comportamento implementado.

## 5. Área da lixeira e confirmações

- [x] 5.1 Recortar componentes/CSS pertinentes para acesso pelo header/vazio e área Voltar/título/data pt-BR, com estado loading/stale/blocked/erro/vazio; verificar L11 por identidade visual, navegação e conservação de filtros/ordem sem segunda inscrição.
- [x] 5.2 Apresentar exclusão recuperável e definitiva/EMPTY irreversíveis, com base preparada no main e snapshot reconciliado antes do diálogo; verificar L01/L05 por avisos30d/100/descartes/relógio/série, abandono/Escape e confirmação stale exigindo nova revisão.
- [x] 5.3 Conectar restore/permanent/empty e retained:false com feedback local sanitizado/busy focável; verificar L03/L11 por recusas diferenciadas, dupla ação ignorada, sucesso sem undo dessas ações e ausência de falsa promessa de alarmes/recuperação.
- [x] 5.4 Filtrar vencidos somente na apresentação em até60s e ao foco/retomada, com prepareTrashView explícito/retry; verificar L04 com clock injetado, sem escrita de timer e falha de purge/snapshot que não vira vazio ou duplica listeners.
- [x] 5.5 Preservar foco de origem/vizinho/novo último/Voltar e alerta de EMPTY stale, usando refs/seletores seguros; verificar L11 em testes de componente com item removido externamente, ID histórico especial, Escape/erro e controle busy ainda focável.
- [x] 5.6 Atualizar documentação operacional/paridade da lixeira e roteiro humano de teclado/zoom/DPI/leitor de tela; verificar exemplos da UI implementada e registrar como pendente toda prova humana não executada, sem substituir por mocks.

## 6. Oferta temporária, ações e ciclo de janela

- [x] 6.1 Conectar oferta de edição/status/exclusão retida somente após ack/snapshot/contexto válidos e ação Desfazer ao token próprio; verificar L06/L07 por anúncio/foco, uma oferta sem timeout e ausência de pilha/redo/undo de criação/check/restore/no-op/definitiva/empty/purge.
- [x] 6.2 Limpar oferta ao iniciar nova ação ou abrir/abandonar form/confirm/área, preservando apresentação e fechamento automático do save como mesma ação; verificar L06 por falha/no-op/abandono, filtros/ordem/expansão, diagnóstico secundário e save que pode ofertar na lista.
- [x] 6.3 Tratar recusa/erro/transport incerto de undo e perda de resposta sem replay/token reconstruído; verificar L10/L11 por consumo único, mensagem honesta de commit/ressync e foco Editar do alvo ou ação principal quando oculto/vazio.
- [x] 6.4 Integrar cleanup no lifecycle existente sem bandeja, incluindo reload/crash/fechamento durante fila/unidade ativa; verificar L06/L10 que reopen conserva commits mas perde ofertas/confirmações, enquanto minimize/foco/espera não as expiram.
- [x] 6.5 Documentar desfazer temporário por superfície, recusas concorrentes e perda intencional ao encerrar, com roteiro humano; verificar texto contra comportamento e deixar integração visual de restore de backup para TFA-007.

## 7. Integração e recursos no produto fictício empacotado

- [x] 7.1 Ampliar harness test-only existente para bridge real catálogo17, duas superfícies autorizadas e comandos reais de trash/undo; verificar L05/L06/L08/L11 convergência/foco/isolamento/contextos/tokens e ausência de hooks na bridge normal, sem novas janelas de produto.
- [x] 7.2 Ampliar fault-points/crash-child em perfis exclusivos para kill antes/depois do COMMIT e antes da resposta, move/restore/undo de série; verificar L10 por reopen anterior/novo inteiro, revisões, PRAGMAs/runtime efetivos e nenhuma inferência de rollback ou energia por kill.
- [x] 7.3 Medir datasets1000/10000+100trash/≥20MiB, before-image/base grandes, varredura e oito sessões em ciclos longos; verificar L12 registrando hardware/runtime/bytes/charge/heap/pico/clones/latência/heartbeat e liberação, sem truncamento/virtualização/worker ou alteração do gate D10.
- [x] 7.4 Registrar evidência operacional/paridade dos testes empacotados, riscos de regressão e acessibilidade executada/pendente; verificar rastreabilidade L01–L12 e separar 661,6/636,1/141,7ms herdados dos resultados novos, sem aprovação implícita dos números700/700/250.

## 8. Gates finais e verificação para revisão

- [x] 8.1 Executar npm run validate no runtime fixado e openspec validate --all --strict/--archived, corrigindo somente o escopo aprovado; verificar saídas/contagens finais e registrar evidências, sem testes/builds/escritas na extensão ou instalação de dependências não autorizada.
- [x] 8.2 Executar package:win --publish never, verify:package e smoke:packaged após implementação, sem executar Setup; verificar aplicativo offline/bridge/persistência/cleanup do produto fictício e registrar que isso não comprova instalação corporativa/notificações/bandeja/atalhos.
- [x] 8.3 Executar openspec-verify-change e gerar verification.md dentro desta Change com aderência proposal/design/sete deltas/tasks, L01–L12, gates e pendências humanas/D10; verificar existência e evidências do relatório sem declarar aprovação ou arquivar.
- [x] 8.4 Atualizar roadmap com estado de revisão do relatório e prompt da etapa autorizável seguinte, entregando diff/evidências ao usuário; verificar que README factual/archive/consolidação/commit/push/PR/merge/Change seguinte/distribuição aguardam autorização correspondente e parar para aprovação do relatório.
