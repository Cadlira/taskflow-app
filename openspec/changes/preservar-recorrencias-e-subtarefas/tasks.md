# Tasks

Estas tasks descrevem implementação futura. Todas permanecem pendentes; executar somente após aprovação explícita dos artefatos e novo pedido de apply. Referência: design D1–D10 e seis deltas; critérios R01–V01. Cada grupo entrega seus testes e documentação junto ao comportamento correspondente.

## 1. Domínio de recorrência e subtarefas

- [ ] 1.1 Copiar/revisar seletivamente cálculo e validação das três frequências para o domínio do app, preservando limites/prazo/until/AT; verificar R01 com testes portáveis de fronteiras e sem imports Chrome/Vue/Electron.
- [ ] 1.2 Preservar calendário civil, fase semanal, fim de mês/leap year e escolha >now/until inclusivo; verificar R02/R03 em UTC/São Paulo/New York, inclusive 23/25 h, drift de gap, repetição e precisão.
- [ ] 1.3 Implementar resultado finito e limite de 32.768 passos, validando representabilidade/avanço antes de ISO; verificar overflow/limite/último passo válido e que erro não vira fim natural (V01).
- [ ] 1.4 Estender planejamento de patches com regra omitida/null/until omitido-null-string e âncora preservada, sem revalidar histórico intacto; verificar R04 e regra+prazo juntos com testes de draft.
- [ ] 1.5 Reaproveitar validação/build/toggle/reset de subtarefas por recorte revisado, fechando IDs removidos/duplicados, títulos históricos intactos e omit/[]; verificar S01/S02 com 0/20/21 e 0/200/201, ordem/marks e no-op.
- [ ] 1.6 Construir próxima pura com campos/série/until e IDs renovados de subtarefas/OFFSET sem processedFor/completedAt/âncora antiga; verificar R05/C01 com fixtures completas e gerador colidente.
- [ ] 1.7 Documentar calendário/âncora/gap/limites e separação das operações em documentação de domínio do app; verificar referências ao HEAD de origem e que nenhuma regra/tipo/serviço futuro foi anunciado.

## 2. Metadados e migração de persistência

- [ ] 2.1 Introduzir editRevision nas portas/linhas/outcomes e schema SQL2 de tasks/trash, mantendo codec4 e PKs independentes; verificar round-trip, metadata 1<=edit<=content<=global e ausência de revision em Task/backup.
- [ ] 2.2 Registrar migração concreta 1→2 com leitor/preflight específico por versão, edit=content e global+1, sem payload rewrite; verificar comparação byte a byte de linhas/IDs/deletedAt, bootstrap SQL2 e reopen idempotente.
- [ ] 2.3 Adaptar todas as primitivas existentes, classificando save/replace/revert/restauração como edição e claim como processamento, e reservar marcação tipada para content-only; verificar testes da tabela D4, noop/rollback, ABA tarefa/item e bigint além de precisão JS/limite persistível.
- [ ] 2.4 Acrescentar condição de editRevision para edição/status/toggle conservando condição completa de reversão interna; verificar save depois de checks, estrutura A→B→A, ausência/recriação/restauração e claim conservando markers (S03/C01).
- [ ] 2.5 Validar falha/kill de migração antes/durante/depois de commit e recusa de leitor SQL1 após SQL2 em perfis fictícios; verificar origem/destino inteiros, global coerente e nenhum reset/journal removido.
- [ ] 2.6 Atualizar documentação de persistência/migração/rollback de binário e independência de versões; verificar comandos/caminhos contra o app e explicitar que prova/extensão/backups não migram.

## 3. Comandos coordenados e integridade da série

- [ ] 3.1 Estender criação com regra/subtarefas usando main clock e identidades, conservando criação terminal sem geração; verificar R01/R05 e colisões em tarefa/lixeira/série/listas com três tentativas e falha sem substituição.
- [ ] 3.2 Implementar planejamento/commit de update/status, retirada da regra, DONE/SKIP/END e fim natural na unidade atual; verificar antiga+gerada/revisões/cópia/âncora com R04–R06 e falha entre writes.
- [ ] 3.3 Verificar portadora única no plano final considerando tasks/trash, sem bloquear antigas reabertas ou leitura histórica; verificar SERIES_CONFLICT em duplicidade e edição independente/toggle sem reparação (R08).
- [ ] 3.4 Implementar setSubtaskDone por intenção com editRevision atual, sem inversão stale nem geração; verificar quatro status, item ausente, no-op, dois itens/mesmo item e markers atuais (S02/S03).
- [ ] 3.5 Aplicar guarda de lembretes D8 ao plano efetivo, permitindo independentes/retirada isolada e recusando prazo/status/fechamento-geração; verificar matriz TODO/terminal/AT/OFFSET/null combinado e preservação integral sem scheduler no-op.
- [ ] 3.6 Acrescentar barreiras/fault injection a fechamento concorrente/IDs/cálculo e commit sem resposta; verificar R07/R08 em duas unidades/sessões, rollback inteiro e ressync sem replay por timestamp.
- [ ] 3.7 Fixar testes de contrato das primitivas existentes para reversão anterior/gerada por conteúdo e move/restore sem geração, preservando metadata/claim; verificar C01 sem criar token/serviço/IPC/UI de TFA-006/008.
- [ ] 3.8 Documentar comandos, guarda de lembretes/portadora e fronteiras futuras na arquitetura/paridade; verificar que capacidades só implementadas deste grupo são descritas como disponíveis.

## 4. Contratos e fronteira IPC

- [ ] 4.1 Definir parsers/DTOs v2 exatos para quatro mutações, estado/eventos e novos campos/erros posicionais, preservando v1 de diagnóstico/origem; verificar contrato positivo/negativo e v1 antigo recusado sem leitura.
- [ ] 4.2 Ampliar preload/main para nove wrappers e manter guards em admissão/execução/saída; verificar remetente/frame/origem/documento/sessão inválidos, reload mesmo URL e isolamento sem API privilegiada.
- [ ] 4.3 Transportar edit/content em snapshot fragmentado e ack pós-commit sem Task/UndoPlan/reflexão de IDs; verificar handshake/paginação/conflito/revisões/response-old e antiga+gerada no estado completo (I01).
- [ ] 4.4 Verificar budgets 64KiB/8KiB/1KiB/256KiB com 20×200, básicos completos, Unicode/escaping/envelope/IDs históricos e respostas de erro; confirmar medidas D6, recusa do excesso sem truncar dados/draft ou relaxar codec.
- [ ] 4.5 Documentar catálogo/versionamento/erros/bytes e migração simultânea dos três processos; verificar concordância com tipos runtime e ausência de alias permissivo/canais de teste na produção.

## 5. Store e formulário

- [ ] 5.1 Adaptar store à revisão de edição/v2 e ação de marcação, conservando base/draft/filtros no stale/conflito/incerto; verificar ack+snapshot, checks externos preservados, sem rebase silencioso/replay e cleanup de inscrição/timers.
- [ ] 5.2 Adaptar formulário à regra/limite e lista ordenada, enviar só mudanças id/título sem done e oferecer retirada explícita de regra; verificar R01/R04/S01/S03 com histórico intacto/limpeza/IDs desconhecidos/erros por índice.
- [ ] 5.3 Estender conversão/revisão de fuso ao until conservando ISO intacto; verificar segundos/ms, gap de entrada versus cálculo, repetição e revisão de fuso de prazo/limite (R03/U01).
- [ ] 5.4 Verificar interação acessível de adicionar/remover/mover e foco do formulário, limite20 e lista histórica; testes DOM devem cobrir teclado, primeiro inválido, cancelar e draft preservado sem status automático.
- [ ] 5.5 Atualizar documentação de formulário/concorrência e matriz de paridade deste fluxo; verificar que save após checks está explicado e futuras funcionalidades permanecem pendentes.

## 6. Cartões e cancelamento recorrente

- [ ] 6.1 Habilitar resumo de regra/progresso, expansão transitória e checkbox por intenção em qualquer status; verificar testes de cartão/busy focável/erro/noop/foco equivalente e progresso vindo do snapshot (S02/U01).
- [ ] 6.2 Integrar diálogo SKIP/END para Enter/ponteiro/save e abandono sem write, preservando base da edição durante espera; verificar R06 e CONFLICT posterior à abertura sem troca silenciosa.
- [ ] 6.3 Preservar exceção de focusout CANCELLED recorrente, restaurando seleção sem diálogo/comando ou roubo de foco; verificar setas/Home/End/PageUp/PageDown/Enter/Escape/status simples e foco já movido.
- [ ] 6.4 Aplicar mensagens/restrições D8 e política de foco com cartão desaparecendo/gerada entrando em filtros; verificar DOM/a11y, janela mínima/zoom200%, contraste e IDs históricos sem seletor inseguro.
- [ ] 6.5 Atualizar documentação operacional de recorrência/subtarefas/guarda de lembretes e limitações transitórias; verificar sem redesign/novas colunas e sem anunciar undo/lixeira/notificação.

## 7. Produto empacotado e medição

- [ ] 7.1 Estender harness restrito existente para recorrer e marcar por UI/preload/main/SQLite reais em duas superfícies fictícias; verificar R05/R08/S03/I01, offline/reopen, evento perdido/30s/reload/crash e catálogo de nove wrappers de produção.
- [ ] 7.2 Exercitar migração SQL1→2, fechamento e interrupção em barreiras antes/durante/após COMMIT/antes de resposta no Electron empacotado fictício; verificar estado antigo/novo inteiro, sem processar dados reais nem chamar kill prova de energia.
- [ ] 7.3 Medir 32.768 passos/varredura de séries e novos controles com 1.000/10.000 tarefas e payloads grandes; registrar bytes/hardware/runtime/main p95/UI p95/heartbeat mantendo orçamentos e gate D10, sem truncamento/virtualização/worker silencioso.
- [ ] 7.4 Documentar resultados de pacote/contratos/performance e limitações de prova humana/Setup; verificar fingerprint efetivo Electron/Node/SQLite/PRAGMAs e separar D10 herdado de regressão nova, sem afirmar smoke verde se gate falhar.

## 8. Integração e revisão

- [ ] 8.1 Executar npm run validate com runtime do projeto e OpenSpec estrito da Change/specs; verificar lint/typechecks/testes/build e registrar contagens/resultados reais sem tratar baseline como cobertura nova.
- [ ] 8.2 Executar package:win, verify:package e smoke:packaged pertinentes sem executar Setup/distribuir; verificar evidências dos grupos anteriores integradas, negative guards e gates preservados com falhas materiais explicitadas.
- [ ] 8.3 Conferir diff/escopo e matriz R01–V01 com refs de código/teste/pacote; verificar nenhuma escrita na origem/Git, serviço futuro, dependência nova ou alteração material não revisada.
- [ ] 8.4 Executar openspec-verify após apply e produzir verification.md nesta Change com completude/correção/coerência, evidências e pendências; atualizar roadmap IN_REVIEW/REVIEW e prompt de continuação, entregar relatório para aprovação explícita sem archive/merge ou nova Change automática.
