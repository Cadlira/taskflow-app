# Spec Delta

## Purpose

Permitir que documentos desktop autorizados leiam e acompanhem estado local coerente, com revisão, limites e ressincronização, sem receber autoridade de mutação ou acesso ao armazenamento.

## ADDED Requirements

### Requirement: Catálogo de estado mínimo e versionado

A bridge SHALL oferecer apenas `getStateSnapshot`, `subscribeState` e `unsubscribeState` para estado v1, com diagnóstico separado. Requests SHALL ter schema exato e validação runtime. Criar/editar/status, caminhos, SQL, callbacks remotos, repositories, Task livre, UndoPlan e IPC genérico SHALL permanecer indisponíveis.

#### Scenario: Operações disponíveis
- **WHEN** o documento autorizado inspeciona o preload
- **THEN** encontra wrappers explícitos para as três operações de estado e verifyFoundation separado, sem comando de mutação ou canal livre

#### Scenario: Request malformado
- **WHEN** chega versão errada, objeto inválido, campo extra, cursor/ID inválido ou request acima de 1 KiB UTF-8
- **THEN** o main recusa antes de ler dados e retorna erro fechado, sem lançar erro de implementação através do IPC

### Requirement: Snapshot completo pertence a uma revisão

Snapshot SHALL conter tarefas/lixeira validadas e metadados públicos de revisão, sem credenciais ou detalhes do banco. Páginas SHALL pertencer à mesma revisão global; alterações entre páginas SHALL invalidar a continuação, sem publicar coleção incompleta ou misturada como estado atual.

#### Scenario: Páginas estáveis
- **WHEN** uma coleção é lida por todas as páginas sem mudança de revisão
- **THEN** o cliente reúne e valida o snapshot completo numa única revisão, preservando todos os registros e campos conhecidos

#### Scenario: Commit entre páginas
- **WHEN** a revisão muda depois da primeira página e antes de uma continuação
- **THEN** a continuação retorna `SNAPSHOT_STALE` e o cliente descarta a montagem parcial, conserva seu último estado completo e ressincroniza

#### Scenario: Leitura não altera produto
- **WHEN** snapshot inclui lixeira antiga ou payload histórico compatível
- **THEN** não ocorre expurgo, rewrite, nova revisão ou evento de alteração por causa da leitura

### Requirement: Inscrição coordena snapshot inicial e eventos

Inscrição, revisão base e primeira página SHALL ser coordenadas sem lacuna observável. O wrapper SHALL registrar listener antes do pedido e bufferizar invalidações até concluir o snapshot. Callbacks locais SHALL permanecer locais, sem ser serializados para o main.

#### Scenario: Commit durante handshake
- **WHEN** commit ocorre antes da resposta de subscribe ou durante montagem do snapshot
- **THEN** o buffer conserva a maior revisão relevante e o cliente ressincroniza se necessário, sem substituir estado novo por resposta antiga

#### Scenario: Subscribe repetido
- **WHEN** o mesmo documento chama subscribe mais de uma vez
- **THEN** a operação é idempotente para uma inscrição corrente por documento e não multiplica eventos/listeners

### Requirement: Eventos são invalidações posteriores ao commit

Eventos SHALL ser versionados e carregar inscrição e revisão global exata, sem payload de tarefas ou patches livres. Alteração SHALL ser emitida somente após commit confirmado. No-op, conflito, rollback e recusa SHALL não emitir alteração. Indisponibilidade SHALL comunicar erro seguro distinto de snapshot vazio.

#### Scenario: Commit e no-op
- **WHEN** uma unidade confirma alteração e outra é no-op ou rollback
- **THEN** somente a alteração confirmada produz invalidação com sua revisão; nenhuma mensagem anuncia a unidade revertida como sucesso

#### Scenario: Perda de validade dos dados
- **WHEN** erro incerto ou corrupção torna o estado de produto indisponível
- **THEN** subscribers autorizados recebem indisponibilidade por código seguro e conservam último snapshot marcado stale, sem substituição por lista vazia

### Requirement: Revisões determinam ressincronização

O cliente SHALL ignorar revisões antigas/duplicadas e ressincronizar por snapshot diante de salto, ordem invertida, perda de resposta, snapshot stale ou reconexão. Invalidações SHALL poder ser coalescidas pela maior revisão, sem inferir replay de mutação ou ordem por timestamp.

#### Scenario: Eventos fora de ordem ou duplicados
- **WHEN** chegam revisões em ordem invertida, repetidas ou com salto
- **THEN** estado não regride, a maior revisão orienta ressync e nenhum patch incompleto é aplicado

#### Scenario: Evento perdido sem salto
- **WHEN** o último evento se perde e nenhum evento posterior chega
- **THEN** reconciliação no foco ou em até 30 s enquanto inscrito obtém snapshot atualizado sem depender exclusivamente de eventos

#### Scenario: Escritas contínuas
- **WHEN** três reconstruções imediatas do snapshot falham por mudança contínua de revisão
- **THEN** o ciclo retorna `BUSY`, preserva o último snapshot completo stale e permite novo ciclo em invalidação/reconciliação/solicitação, sem loop bloqueante

### Requirement: Tokens e listeners pertencem ao documento

Inscrição e continuação SHALL ser opacas e vinculadas ao documento/sessão que as criou. Unsubscribe SHALL ser idempotente no próprio documento. Navegação/reload/crash/fechamento SHALL invalidar tokens, buffers, listeners e entregas pendentes, inclusive quando a URL do novo documento é igual.

#### Scenario: Cancelamento próprio e alheio
- **WHEN** o documento cancela sua inscrição duas vezes ou tenta cancelar inscrição de outra sessão
- **THEN** o cancelamento próprio repetido é seguro e o alheio é recusado sem afetar outra sessão ou acessar dados

#### Scenario: Reload da mesma URL
- **WHEN** há reload, navegação ou crash durante request/handshake/paginação
- **THEN** a sessão antiga é invalidada e respostas/eventos antigos não entregam dados ao novo documento

#### Scenario: Cursor expirado
- **WHEN** cursor permanece sem uso por 30 s ou pertence a sessão diferente/encerrada
- **THEN** não é reutilizado; o cliente recebe erro seguro e inicia snapshot novo após autorização corrente

### Requirement: Autorização também protege acesso e saída

Requests, execução enfileirada e envio de respostas/eventos SHALL verificar webContents registrado/vivo, main frame vivo, documento/sessão corrente, origem real e URL local autorizadas. Recusa SHALL anteceder acesso a dados, e autorização antiga SHALL não liberar resultado tardio.

#### Scenario: Matriz de remetentes inválidos
- **WHEN** request vem de iframe, webContents desconhecido, frame removido, origem/URL errada, about:blank/blob, sessão antiga ou tentativa de origem dev no pacote
- **THEN** o main recusa sem consultar armazenamento e sem revelar dados/paths internos

#### Scenario: Documento invalida enquanto espera
- **WHEN** request autorizado entra na fila e o documento navega antes de executar ou receber resultado
- **THEN** há nova verificação antes de ler e antes de enviar; nenhum dado é entregue sob a autorização antiga

### Requirement: Transporte limitado preserva dados legítimos

Requests e eventos SHALL respeitar 1 KiB UTF-8; páginas SHALL respeitar 256 KiB incluindo envelope/escaping. Um registro maior SHALL ser fragmentado e validado integralmente antes da publicação. Limites SHALL não cortar campos, omitir registros ou limitar quantidade total persistida aos volumes do benchmark.

#### Scenario: Unicode e registro grande
- **WHEN** um registro historicamente válido ou Unicode/escaping excede o tamanho de uma página
- **THEN** cada mensagem respeita o orçamento e a reunião das partes recupera o conteúdo completo sem quebrar caracteres ou publicar registro parcial

#### Scenario: Pressão de recursos
- **WHEN** recurso de leitura não pode ser alocado dentro do orçamento da máquina
- **THEN** retorna `RESOURCE_LIMIT`, preserva banco/último estado completo e não apresenta truncamento ou vazio como sucesso

#### Scenario: Estado transitório limitado
- **WHEN** sessões realizam leituras/subscriptions sucessivas ou o harness registra mais de oito documentos
- **THEN** cada documento mantém no máximo uma inscrição e um cursor ativo e excedente de admissão é recusado sem vazamento de listener/token

### Requirement: Erros são dados seguros discriminados

Resultados SHALL ser uniões versionadas de sucesso/erro validadas por discriminante, com códigos fechados. Falhas SHALL não transportar stack, cause, SQL, paths, payloads ou protótipos de Error. Transporte invalidado SHALL exigir ressync antes de nova decisão, sem confiar em instanceof remoto.

#### Scenario: Erro de produto sanitizado
- **WHEN** há incompatibilidade, corrupção, indisponibilidade, request inválido, falta de autorização, sessão encerrada, snapshot stale ou limite
- **THEN** retorna somente envelope/código previsto: `INCOMPATIBLE_DATA`, `CORRUPTED_DATA`, `STORAGE_UNAVAILABLE`, `INVALID_REQUEST`, `UNAUTHORIZED`, `SESSION_CLOSED`, `SNAPSHOT_STALE`, `RESOURCE_LIMIT` ou `BUSY`
- **AND** a validação do preload recusa saída malformada sem expor detalhes sensíveis

#### Scenario: Resultado tardio após commit
- **WHEN** commit interno confirma e a resposta se perde ou sessão encerra
- **THEN** o banco conserva o commit, o cliente ressincroniza após nova autorização e nenhuma repetição automática de escrita é feita

### Requirement: IPC de estado é comprovado no pacote

A validação SHALL exercitar bridge real no Electron empacotado com dados/perfis fictícios, incluindo catálogo, isolamento, negativas, sessões e ressincronização. Mocks e Node externo SHALL não substituir essa evidência nem anunciar funcionalidades futuras como disponíveis.

#### Scenario: Harness de produto e bridge
- **WHEN** o teste empacotado abre duas superfícies de teste autorizadas e provoca commits internos fictícios
- **THEN** ambas convergem por snapshots/eventos, guardas negativas e limpeza de documentos funcionam no runtime real
- **AND** hooks de teste não aparecem na bridge/catálogo normal de produção nem implementam gerenciamento de tarefas
