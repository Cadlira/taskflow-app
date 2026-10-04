# Tasks

Checklist futuro: todas as tarefas estão pendentes; presença destes artefatos não aprova apply. Usar os deltas `local-task-persistence`, `desktop-state-ipc` e `desktop-foundation` e D1–D8 do design. P01–P12 referem-se aos critérios da exploração TFA-003. Não instalar dependências, alterar origem, implementar TFA-004–012, executar instalador ou publicar neste recorte.

## 1. Núcleo portável e contratos de armazenamento

- [x] 1.1 Conferir aprovação explícita, branch TFA-003/base, AGENTS e artefatos atuais; registrar escopo autorizado no roadmap e verificar Git/root antes de escrita, preservando mudanças preexistentes e sem iniciar Change futura.
- [x] 1.2 Copiar por revisão somente tipos/validadores/codecs e testes portáveis necessários do HEAD documentado da origem para domínio/aplicação/storage; verificar inventário/licença/diff e ausência de adapter Chrome, IA, dados reais e serviços inteiros (P01/P04/P12).
- [x] 1.3 Implementar contratos internos de unidade de trabalho, revisões de conteúdo/global, resultados condicionais e razões de erro portáveis; verificar testes de discriminantes/precisão e typecheck sem dependência Vue/Pinia/Electron/Node no núcleo (P06/P07/P12).
- [x] 1.4 Validar codecs tanto ao ler como ao gravar; executar fixtures tarefas/lixeira v1–v4, todos os campos/opcionais/ordens/Unicode, versões futuras, IDs/metadados discordantes e invariantes negativas, sem importar backup ou gerar ações avançadas (P01/P04).
- [x] 1.5 Fortalecer testes de fronteiras incluindo `node:sqlite` e demais imports Node no núcleo/renderer e fixtures positivas/negativas do detector; verificar lint/typecheck/test e documentar a seleção portável/invariantes em arquitetura e estratégia de testes (P12).

## 2. Banco, preflight e migração

- [x] 2.1 Compor banco de produto em `<userData>/data/taskflow.sqlite`, preservando perfil/identidade/per-user e separação da prova/sessionData; verificar testes de caminhos dev/test/prod, zero escrita na origem/instalação e diagnóstico sem modificar produto (P01/P10).
- [x] 2.2 Implementar conexão proprietária `node:sqlite`, schema SQL 1, metadata/assinatura/revisão e tabelas tarefas/lixeira com PKs independentes/payload validado; verificar round-trip/reopen integral e coexistência do mesmo ID entre coleções (P01/P02).
- [x] 2.3 Configurar e conferir DELETE/EXTRA/foreign_keys, extensões desabilitadas, SQL parametrizado e lock wait 100 ms; testar divergência/falha de configuração e valores hostis como dados, sem fallback/addon/rebuild (P05/P09/P11).
- [x] 2.4 Implementar classificação antes de DDL/configuração persistente e validação estrutural/lógica; testar ausência versus zero bytes, SQLite estranho, schema/payload futuro, truncamento, corrupção, duplicidade e metadata inválida, preservando hashes/arquivos quando não há recovery normal do motor (P04).
- [x] 2.5 Implementar executor mínimo de migrações registradas e validação transacional de origem/destino; verificar rollback, commit e downgrade em fixture isolada, sem schema SQL 2 fictício de produto ou migração da prova/extensão (P04).
- [x] 2.6 Documentar paths, schema versus codec/backup, abertura bloqueada, hot journal/reopen e recuperação explícita excluída; verificar documentação contra testes 2.1–2.5 e ausência de reset/rewrite automático (P01/P04).

## 3. Coordenação, atomicidade e concorrência

- [x] 3.1 Implementar um coordenador/fila com portas limitadas da transação e `BEGIN IMMEDIATE` para read/decide/validate/commit; verificar testes de produtor concorrente, rollback, proibição de enqueue recursivo/transação aninhada e ausência de writer paralelo (P02/P06).
- [x] 3.2 Implementar primitives internas list/get/save/saveMany/replaceAll/delete com validação, base global quando necessária e revisão por commit; testar falha entre registros, substituição inteira, no-op, revisão persistida, precisão/overflow e recriação de ID/ABA (P01/P02/P06).
- [x] 3.3 Implementar move/restore/delete/empty/purge explícitos internos da lixeira; testar commit único entre coleções, `ID_EXISTS`, ausência, preparação inválida e rollback, conservando lixeira em list/get/snapshot sem integrar política/UX futura (P02/P04).
- [x] 3.4 Implementar edição/reversão condicionais internas com revisão de conteúdo e pré-condições; testar duas decisões da mesma base, tarefas distintas, stale/ABA e preservação dos marcadores atuais, sem serviço/UndoPlan funcional (P06/P07).
- [x] 3.5 Implementar claim condicional interno preservando `updatedAt`/revisão de conteúdo; verificar barreiras determinísticas claim duplo, claim versus edição, prazo/status/reminder alterado/remoção e apenas um processamento por ocorrência, sem scheduler/notifier (P07).
- [x] 3.6 Publicar alteração somente após commit e efeitos fictícios fora da transação; testar no-op/recusa/rollback sem evento, erro pós-commit sem reversão e ressync após resposta perdida, sem replay de escrita (P02/P03/P08).
- [x] 3.7 Documentar como futuros produtores usam a unidade e revisões, limites de save/replaceAll e processedFor/undo; verificar exemplos internos contra os testes, sem oferecer novos comandos no preload (P06/P07).

## 4. Falhas, interrupção e encerramento

- [x] 4.1 Implementar erros seguros, rollback confirmado versus resultado incerto, invalidação/reopen e continuação da fila recuperável; testar I/O/open/write/flush/commit, permissão e disco cheio por fault injection identificado ou ambiente controlado, sem falso sucesso ou logs sensíveis (P04/P05).
- [x] 4.2 Criar harness de processo exclusivamente fictício com barreiras antes/durante transação, antes/depois de COMMIT e antes de resposta/evento; encerrar só o PID validado desse harness e verificar reopen/estado integral/revisões, inclusive migração e claim confirmado (P03/P04/P07).
- [x] 4.3 Exercitar lock real com conexão de teste concorrente e espera finita; verificar rejeição segura, integridade posterior e fila disponível depois da liberação, distinguindo lock/I/O simulados de filesystem real (P05).
- [x] 4.4 Integrar ownership antes dos dois bancos, fechamento de admissão, invalidação de sessões, cancelamento de entradas não iniciadas e drain/conexão; testar segunda instância sem abertura e saída durante unidade/diagnóstico sem bandeja, residual ou saída forçada no commit (P10).
- [x] 4.5 Documentar matriz de falhas/recovery/encerramento e nível de evidência obtido; conferir que rollback/reopen/kill não são descritos como prova de energia e que fixtures/hooks não atingem perfil/processo real (P03/P05/P10).

## 5. Sessões, autorização e catálogo da fundação

- [x] 5.1 Implementar registro/geração por documento, main frame vivo, origem real/URL e revalidação antes de admissão, execução e entrega; testar webContents desconhecido, iframe, frame removido, origem/URL errada, about:blank/blob, sessão stale e dev no pacote, com spies garantindo zero leitura antes do guard (P09).
- [x] 5.2 Invalidar sessões/cursors/listeners/respostas em navegação/reload/crash/fechamento, inclusive reload da mesma URL; verificar requests em fila e resultados tardios não entregues ao novo documento e cancelamento de token alheio recusado (P08/P09/P10).
- [x] 5.3 Aplicar guards ao diagnóstico preservando seu shape/resultado/limite 1 KiB e gate BUSY independente; testar diagnóstico concorrente e separação de banco/fila, sem relaxar CSP/protocolo/sandbox/permissões (P01/P09).
- [x] 5.4 Documentar o catálogo fechado de quatro operações e atualização de ownership/autorização; verificar docs e testes contra o delta completo de desktop-foundation e manter demais requisitos/per-user intactos (P09/P10).

## 6. IPC de estado, snapshots e subscriptions

- [x] 6.1 Implementar contratos v1 e schemas exatos de getStateSnapshot/subscribeState/unsubscribeState, páginas/eventos/resultados e revisões decimais; verificar chaves extras, tipos/protótipos, versões/cursors/IDs/bytes e saída malformada, sem instanceof remoto ou stack/cause/path/dados em erros (P09/P12).
- [x] 6.2 Implementar paginação ordenada vinculada à sessão/revisão, cursors opacos/TTL, fragmentação de registro e conclusão validada; testar Unicode/escaping/registro acima de 256 KiB, coleção maior que benchmark, commit entre páginas e nenhum snapshot parcial/misto publicado (P01/P08/P12).
- [x] 6.3 Implementar inscrição idempotente com primeira página/revisão base coordenadas e listener prévio/buffer de maior revisão; verificar commit durante handshake, resposta antiga depois de evento, múltiplos commits e apenas um listener por documento (P08).
- [x] 6.4 Implementar invalidações pós-commit e erro de indisponibilidade seguro; verificar no-op/rollback sem alteração, ordem invertida/duplicados/salto e guard de envio, sem expor patches/payloads ou tratar erro como vazio (P08/P09).
- [x] 6.5 Implementar ressync de páginas/eventos com no máximo três reconstruções imediatas, reconciliação ao foco/a cada 30 s e serialização de montagens por documento; testar perda do último evento, churn/BUSY, erro/reconexão/resposta perdida e preservação do último snapshot completo stale (P08/P12).
- [x] 6.6 Implementar unsubscribe próprio idempotente e wrappers explícitos/frozen no preload, mantendo callbacks locais; testar limpeza/expiração/sessão alheia e catálogo sem mutações, SQL/path/repository/Task livre/UndoPlan/raw IPC ou abertura externa (P08/P09).
- [x] 6.7 Documentar contrato, budgets, ciclo de montagem/ressync/limpeza e limitações no material de arquitetura/testes; conferir exemplos de request/erro contra schemas e shell sem gerenciamento anunciado (P08/P09/P12).

## 7. Limites e prova no Electron empacotado

- [x] 7.1 Aplicar fila 64/8 por sessão, espera 2 s, uma inscrição/cursor por documento, oito documentos registrados de teste, cursor 30 s, requests/eventos 1 KiB e páginas 256 KiB; verificar excedentes antes de efeito, limpeza e RESOURCE_LIMIT sem truncamento/perda (P05/P08/P12).
- [x] 7.2 Acrescentar harness restrito de produto/bridge ao fluxo de pacote existente, sem writer/test IPC no preload normal; verificar round-trip/reopen, duas superfícies de teste, negativas/origem real, subscriptions, ownership e isolamento no Electron empacotado sem executar instalador ou depender de Node/npm externos (P01/P09/P10/P11).
- [x] 7.3 Registrar Electron/Node/sqlite_version e PRAGMAs efetivos do produto no pacote e conferir configuração/versão/correções relevantes; testar falha fechada e documentar ausência de fallback/WAL/addon, distinguindo nova evidência da prova foundation-proof (P11).
- [x] 7.4 Medir 1.000/10.000 tarefas +100 itens de lixeira e pelo menos 20 MiB com campos completos/Unicode, páginas e saveMany integral; registrar hardware, bytes, p95/maior bloqueio, preflight e heartbeat, verificando alvos 100 ms/5 s e drain 5 s; falha material exige revisão antes de worker ou relaxamento (P12).
- [x] 7.5 Registrar comandos/harness reproduzíveis e evidências de pacote/limites em documentação de testes/validação, marcando simulações e pendências; verificar ausência de dados reais, instalação/publicação e afirmações de testes não executados (P03/P05/P11/P12).

## 8. Integração e verificação para revisão

- [x] 8.1 Executar gates existentes `npm run validate` com engines fixadas e OpenSpec estrito; verificar lint, cinco typechecks, testes/build, fronteiras e diff, sem modificar dependências/lockfile por conveniência (P12).
- [x] 8.2 Executar package verification/smoke e integração P01–P12 pertinentes com produto implementado, somente perfis fictícios; registrar resultados concretos e limitações, sem usar smoke do diagnóstico como substituto dos testes de produto (P11/P12).
- [x] 8.3 Revisar aderência aos três deltas e exclusões, atualizar documentação da implementação/roadmap e executar openspec-verify-change após apply; entregar verification.md na própria Change com matriz requisito/cenário/task/evidência e pendências, mantendo IN_REVIEW e aguardando aprovação explícita do relatório, sem archive/commit/push/PR/merge/distribuição.
