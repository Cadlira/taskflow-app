# Tasks

## 1. Formato, projeção e fidelidade portáveis

- [ ] 1.1 Copiar seletivamente e revisar backup-file/task-integrity/fixtures e testes portáveis da origem para o app, sem adapters Chrome/WXT; verificar origem intacta, TypeScript estrito e fixtures v1–v4 com resultados canônicos esperados em B01.
- [ ] 1.2 Implementar cadeia v1→v2→v3→v4 e versão original separada, validando envelope/marcadores legados sem correção silenciosa; verificar B01 por lastTriggeredFor-OFFSET, migração ausente/futura/inválida e subtasks vazias legadas.
- [ ] 1.3 Implementar validação integral com coletor limitado aos primeiros cinco issues seguros/contagem restante e projetores explícitos de Task/reminder/recurrence/subtask, preservando opcionais e ordens; verificar B02/B04 com todos os campos, limites, muitos erros, IDs locais/duplicados e sentinelas desconhecidas aninhadas removidas.
- [ ] 1.4 Implementar comparador por conjuntos de IDs e conteúdo completo, sem ordem SQL/metadata no payload; verificar B02 por alteração/remoção isolada de cada campo/parâmetro/marker e subtask id/title/done/ordem, sem falso verified ou falso erro de coleção reordenada.
- [ ] 1.5 Documentar formatos, migrações, projeção e diferença codec/SQL/backup, com restrição do histórico não exportável; verificar exemplos contra testes, sem anunciar funcionalidade antes da integração correspondente.

## 2. Leitura, serialização e orçamento de recursos

- [ ] 2.1 Implementar porta/adapter de leitura por handle regular limitado a20MiB+1, UTF-8 estrito/BOM único e erros de I/O distintos; verificar B03 por multibyte/exatos20/+1/crescimento/stat inexato/pipe/diretório/UTF-16/encoding/JSON vazio-truncado.
- [ ] 2.2 Implementar scanner léxico e reserva anteriores a parse, contando chaves/containers/escalars com profundidade64/nós262144; verificar B03/B13 por limites exatos/+1, unknowns adversariais, string/escape e RESOURCE_LIMIT sem parse/clone excessivo.
- [ ] 2.3 Implementar registro de recursos de backup128MiB com charges D2 para leitura/parse/projeção/preparação/snapshot/export/candidatos e liberação em finally; verificar B13 por falha de reserva/clone, sobreposição de fases e oito sessões sem truncamento/limite de codec.
- [ ] 2.4 Implementar serialização v4 limitada antes do Buffer/string completos e validação pelo próprio leitor, independente de filtros; verificar B04 por histórico inválido/arquivo grande recusados integralmente, saída UTF-8 sem BOM e nenhuma sentinela de trash/segredo/undo/metadata.
- [ ] 2.5 Documentar20MiB/128MiB/charge versus heap/encoding/limites estruturais e impacto sobre coleção legítima grande; verificar medições unitárias de bytes/liberação e que ampliar budget exige revisão, sem alterar64MiB de undo ou lockfile.

## 3. Diálogos e salvamento nativos no main

- [ ] 3.1 Implementar portas/adapters showOpenDialog/showSaveDialog vinculados à janela, filtro JSON/nome padrão/overwrite/dontAddToRecent, um job global e cancel neutro; verificar B05/B12 por BUSY/teclado/cancel/seleção repetida e guards de sessão em cada fronteira.
- [ ] 3.2 Capturar snapshot coordenado após destino escolhido e proteger destinos internos/diretórios/devices/symlink-reparse conhecidos por resolução real; verificar B04/B12 por filtros, caminho irmão/escape/Unicode/perfil próprio protegido, sem escrever na extensão ou em perfil real.
- [ ] 3.3 Implementar temporário exclusivo no mesmo diretório, bytes completos/sync/close/rename único e cleanup somente próprio; verificar B12 com falhas write/flush/close/rename/permissão/disco cheio/arquivo ocupado, sem truncamento do original nem fallback copy-delete.
- [ ] 3.4 Implementar fingerprint pré-substituição e readback limitado pós-substituição com SAVED/SAVED_WITH_WARNING/DESTINATION_CHANGED; verificar B12 por mudança externa/falha posterior/arquivo já confirmado e ausência de segunda gravação/rollback automático.
- [ ] 3.5 Integrar cancelamento/encerramento ao job/temporários sem manter transação durante diálogo/I/O; verificar B05/B12 por navegação antes/depois de rename, fechamento e cleanup tardio seguro, sem responder ao novo documento ou prometer cancelamento de efeito concluído.
- [ ] 3.6 Documentar fases de arquivo, janela residual de terceiros, energia não comprovada e roteiro nativo Windows; verificar texto e testes de adapters, deixando evidência manual separada de escolha stub.

## 4. Preparação e substituição condicionada

- [ ] 4.1 Implementar preparação imutável com base global/counts atuais, token24bytes/base64url por documento/contexto, TTL5min monotônico e uma por sessão; verificar B05/B06 por troca/cancel/expiry/cleanup, metadado DTO excessivo e arquivo alterado após prévia sem releitura na confirmação.
- [ ] 4.2 Implementar consumo único de confirm e cancel próprio idempotente, separando abandono modal de cancelamento da prévia e subação de exportação preventiva; verificar B05/B06 com tokens alheios/antigos/repetidos, TTL não renovado e nenhuma preparação legítima alheia consumida.
- [ ] 4.3 Construir plano final com tasks importadas+trash preservada, portadora única por coleção e liquidação pura<=now; verificar B08/B10 por duas portadoras/trash terminal-vencida/duplicidade histórica, IDs homônimos, markers futuros/processados e timestamps/âncoras/subtasks intactos, sem geração/scheduler.
- [ ] 4.4 Integrar replaceAllTasks por CAS global numa unidade e comparação completa antes de COMMIT; verificar B06/B07/B02 por alterações de tasks/trash/claim, tasks:[], APPLIED/UNCHANGED, metadata local e rollback entre remover/inserir/alterar/verificar.
- [ ] 4.5 Acrescentar conclusão síncrona somente leitura/in-memory no coordenador antes da publicação/próxima unidade, com releitura do estado confirmado; verificar B09/B11 por barreiras de outro produtor, no-op, mismatch pré-commit e falha pós-commit sem falso rollback.
- [ ] 4.6 Implementar resultados VERIFIED/PENDING/NOT_APPLIED/UNKNOWN, contenção e reopen validado sem replay/token reconstruído; verificar B11 por fault-points/overflow/commit incerto/resposta perdida, preflight de schema/corrupção e nenhuma troca/reset de SQLite.
- [ ] 4.7 Documentar fluxo de decisão/fases/metadata/portadora/falhas e ausência de undo da importação; verificar correspondência com B06–B11 e schemas, conservando políticas de lixeira e guardas D8.

## 5. Época, contratos IPC e clientes

- [ ] 5.1 Integrar invalidateAll e guarda/reserva de época positiva segura ao sucesso APPLIED/UNCHANGED na conclusão serializada, incluindo candidaturas/confirm/preparações antigas; verificar B09 por publicação tardia/overflow e cancel/rollback alheios preservados.
- [ ] 5.2 Evoluir estado/snapshot/páginas/subscription/eventos para v3 com undoEpoch e cursor do par revision/epoch; verificar B09/B13 por rejeição de estado1/2, epoch entre páginas e snapshot de SQL igual adotando época maior.
- [ ] 5.3 Acrescentar evento undo-invalidated v1 fechado na mesma inscrição/callback e buffer/coalescimento/reconciliação independentes de revision/epoch; verificar B09 por handshake/perda último evento/reconciliação foco30s/reload/duplicação sem listener adicional ou revisão SQL falsa.
- [ ] 5.4 Versionar update/status v4 e move v2 com época em acks, mantendo create/check3 e demais wrappers atuais; verificar B09/B13 por versão antiga recusada, token elegível capturado na época correta e ack velho incapaz de recriar/apagar oferta nova.
- [ ] 5.5 Acrescentar exatamente quatro wrappers backup1 e schemas finitos de requests/resumos/acks/erros/issues/commitState, total21; verificar B13 por64KiB/8KiB/1KiB/páginas256KiB/escaping/metadata excessiva, sem paths/JSON/Task/opções/callback remoto.
- [ ] 5.6 Conectar guards de ticket/contexto/remetente nas fases de diálogo/I/O/fila/saída e cliente aguardando snapshot/época apropriados; verificar B06/B13 por payload extra/iframe/sessão antiga/token alheio/navegação e ressync sem upsert/replay.
- [ ] 5.7 Atualizar documentação do catálogo/versões/erros/epoch e contratos de offers; verificar paridade main/preload/renderer e testes de saída runtime, sem misturar pacotes ou incrementar SQL/codec por conveniência.

## 6. Área de backup e migração manual

- [ ] 6.1 Recortar componentes/CSS/labels úteis da origem e criar área Backup com acesso header/vazio/Voltar/export/seleção, usando uma inscrição atual; verificar B14 por identidade/estados/loading/stale/blocked e ausência de redesign/serviços futuros.
- [ ] 6.2 Apresentar resumo de versões original/normalizada/data/counts/app, substituição total irreversível e aviso de tasks:[], com exportação preventiva opcional; verificar B05/B14 por filtros, preview conservada na exportação e base/TTL não renovados.
- [ ] 6.3 Integrar confirm/cancel/modal/Escape/busy aria-disabled com foco em título/seletor/origem/alerta/Voltar/ação principal; verificar B05/B14 por teclado/dupla ação/controle removido/zoom200/janela mínima e ausência de foco no body.
- [ ] 6.4 Remover ofertas/confirm antigas por epoch e mostrar resultados por fase sem perder filtros/draft de outras áreas; verificar B09/B11/B14 por UNCHANGED/ack atrasado/PENDING/UNKNOWN/confirmação stale e nenhuma promessa de alarmes agendados.
- [ ] 6.5 Criar guia operacional exportar na extensão→guardar original→backup preventivo→selecionar/revisar/confirmar/conferir no app e atualizar matriz de paridade; verificar percurso com fixtures e exclusões trash/credenciais/undo, sem extração/mesclagem/SQLite.
- [ ] 6.6 Atualizar roteiro humano de teclado/diálogos/zoom/DPI/leitor de tela com evidência executada ou pendente por cenário; verificar que documentação de feature corresponde à implementação e que README factual aguarda archive autorizado.

## 7. Produto fictício empacotado e falhas reais

- [ ] 7.1 Ampliar harness de produto para bridge21, arquivo real/serviços/I/O/SQLite reais e duas superfícies com APPLIED/UNCHANGED/base stale/late ack/epoch perdida; verificar B06/B09/B13 sem hooks no preload normal ou implementação exclusiva do harness.
- [ ] 7.2 Ampliar fault-points/crash-child em perfis exclusivos nas barreiras de staging/substituição/transação/COMMIT/conclusão/resposta; verificar B07/B11/B12 por antigo/novo completo, metadata/bytes/readback/reopen e cleanup seguro sem processos/dados reais.
- [ ] 7.3 Executar roteiro de diálogos nativos reais no pacote Windows por teclado/cancel/overwrite/destino Unicode, separado da escolha stub; verificar B05/B12/B14 com evidências sanitizadas e registrar pendência/bloqueio se não executado, sem chamar mock de PASS.
- [ ] 7.4 Medir teto20MiB/estruturas adversariais/128MiB/ciclos de oito sessões e datasets1000/10000+trash, incluindo duração integral e bloqueio de backup; verificar B03/B13/B14 por charge/heap/RSS/pico/latência/heartbeat/liberação, conservando gates herdados e exigindo revisão de falha material nova.
- [ ] 7.5 Registrar evidências operacionais do produto, runtime/hash/PRAGMAs/fases/diferenças da migração e regressões/limitações; verificar B01–B14 rastreáveis e separar D10/a11y/before-images/energia não provados da aceitação nova.

## 8. Gates integrados e verificação para revisão

- [ ] 8.1 Executar npm run validate no runtime fixado e OpenSpec estrito da Change/--all/--archived, corrigindo somente escopo aprovado; verificar saídas/contagens e origem intacta, sem instalar dependências ou escrever código fora do app.
- [ ] 8.2 Executar package:win --publish never, verify:package e smoke:packaged com perfil fictício após implementação; verificar pacote/bridge/I/O/reopen/cleanup e preservar distinção entre mock/diálogo nativo/instalador, sem executar Setup ou publicar release.
- [ ] 8.3 Executar openspec-verify-change e gerar verification.md nesta Change com aderência proposal/design/sete deltas/tasks, B01–B14, gates e pendências; verificar existência/evidências e não declarar aprovação humana ou arquivar.
- [ ] 8.4 Atualizar roadmap para revisão do relatório e entregar resultado concreto/evidências; verificar que archive/consolidação/README/commit/push/PR/merge/Change seguinte/distribuição aguardam autorização correspondente e parar para aprovação do relatório.

