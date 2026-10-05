# desktop-state-ipc Specification

## Purpose
Permitir que documentos desktop autorizados leiam e acompanhem estado local coerente, com revisão, limites e ressincronização, sem receber autoridade de mutação ou acesso ao armazenamento.

## Requirements

### Requirement: Catálogo de estado mínimo e versionado

Bridge SHALL oferecer estado v2, diagnóstico/origem v1, create/update/status/setSubtaskDone v3 e oito wrappers v1 de contexto/confirm/lixeira/undo, total17. Requests SHALL ter schema exato runtime; estado v1 e mutações v1/v2 SHALL ser recusados. SQL/path/Task/UndoPlan/callback remoto/IPC genérico e comandos futuros SHALL permanecer indisponíveis.

#### Scenario: Operações disponíveis
- **WHEN** documento autorizado inspeciona preload
- **THEN** encontra17 wrappers: verifyFoundation/getStateSnapshot/subscribeState/unsubscribeState/createTask/updateTask/changeTaskStatus/setSubtaskDone/openTaskSource/clearUndoOffer/prepareTrashConfirmation/moveTaskToTrash/restoreTrashItem/deleteTrashItem/emptyTrash/prepareTrashView/undoLastTaskAction, sem canal livre
- **AND** versões de main/preload/renderer são coerentes no mesmo pacote, sem fallback para estado v1 ou mutação de tarefas v1/v2

#### Scenario: Request malformado
- **WHEN** chega versão errada, objeto inválido, campo extra, cursor/ID/revisão inválido ou request acima do orçamento de sua operação
- **THEN** main recusa antes de ler dados e retorna erro fechado, sem lançar erro de implementação através do IPC
- **AND** estado/diagnóstico continuam limitados a 1 KiB UTF-8 e comandos têm orçamento próprio de 64 KiB

### Requirement: Snapshot completo pertence a uma revisão

Snapshot v2 SHALL conter tarefas/lixeira validadas e revisões públicas de conteúdo completo e edição, sem credenciais ou detalhes do banco. Páginas SHALL pertencer à mesma revisão global; alterações entre páginas SHALL invalidar continuação, sem publicar coleção incompleta/misturada como estado atual. Metadados SHALL permanecer separados de Task e de formato de backup.

#### Scenario: Páginas estáveis
- **WHEN** coleção é lida por todas as páginas sem mudança de revisão
- **THEN** cliente reúne/valida snapshot completo numa única revisão, preservando registros/campos conhecidos e revisões de conteúdo/edição exatas

#### Scenario: Commit entre páginas
- **WHEN** revisão muda depois da primeira página e antes de continuação
- **THEN** continuação retorna SNAPSHOT_STALE e cliente descarta montagem parcial, conserva último estado completo e ressincroniza

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

Eventos v2 SHALL carregar inscrição e revisão global exata, sem payload de tarefas/patches livres. Alteração SHALL ser emitida somente após commit confirmado. No-op, conflito, rollback e recusa SHALL não emitir alteração. Indisponibilidade SHALL comunicar erro seguro distinto de snapshot vazio; eventos de versão incorreta SHALL não ser aceitos como estado.

#### Scenario: Commit e no-op
- **WHEN** unidade confirma alteração e outra é no-op/rollback
- **THEN** somente alteração confirmada produz invalidação com revisão; nenhuma mensagem anuncia unidade revertida como sucesso

#### Scenario: Perda de validade dos dados
- **WHEN** erro incerto/corrupção torna produto indisponível
- **THEN** subscribers autorizados recebem indisponibilidade por código seguro e conservam último snapshot stale, sem substituição por lista vazia

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

Inscrição/cursor/confirm/undo SHALL ser opacos próprios do documento. Contexto monotônico SHALL limpar recibo/confirmação e impedir resposta antiga. Unsubscribe/clear repetidos próprios SHALL ser idempotentes quando pertinentes. Navegação/reload/crash/fechamento SHALL invalidar tokens/buffers/listeners/reservas, inclusive mesma URL; timeout de cursor SHALL não expirar undo.

#### Scenario: Cancelamento próprio e alheio
- **WHEN** o documento cancela sua inscrição duas vezes ou tenta cancelar inscrição de outra sessão
- **THEN** o cancelamento próprio repetido é seguro e o alheio é recusado sem afetar outra sessão ou acessar dados

#### Scenario: Reload da mesma URL
- **WHEN** há reload, navegação ou crash durante request/handshake/paginação
- **THEN** a sessão antiga é invalidada e respostas/eventos antigos não entregam dados ao novo documento

#### Scenario: Cursor expirado
- **WHEN** cursor permanece sem uso por 30 s ou pertence a sessão diferente/encerrada
- **THEN** não é reutilizado; o cliente recebe erro seguro e inicia snapshot novo após autorização corrente

#### Scenario: Contexto novo e token de outra superfície
- **WHEN** nova ação/área estabelece contexto, sequência menor chega tarde ou token de undo/confirm é enviado por outra sessão
- **THEN** contexto antigo não publica/autoriza oferta, sequência menor recebe STALE_CONTEXT e token alheio não atua nem invalida estado legítimo alheio
- **AND** recibo tomado é consumido uma vez e nenhuma Task/UndoPlan livre é aceita

### Requirement: Autorização também protege acesso e saída

Requests, execução enfileirada e envio de respostas/eventos SHALL verificar webContents registrado/vivo, main frame vivo, documento/sessão corrente, origem real e URL local autorizadas. Recusa SHALL anteceder acesso a dados, e autorização antiga SHALL não liberar resultado tardio.

#### Scenario: Matriz de remetentes inválidos
- **WHEN** request vem de iframe, webContents desconhecido, frame removido, origem/URL errada, about:blank/blob, sessão antiga ou tentativa de origem dev no pacote
- **THEN** o main recusa sem consultar armazenamento e sem revelar dados/paths internos

#### Scenario: Documento invalida enquanto espera
- **WHEN** request autorizado entra na fila e o documento navega antes de executar ou receber resultado
- **THEN** há nova verificação antes de ler e antes de enviar; nenhum dado é entregue sob a autorização antiga

### Requirement: Transporte limitado preserva dados legítimos

Estado/diagnóstico/eventos SHALL manter1KiB e páginas256KiB UTF-8 com envelope/escaping. Comandos novos/v3 SHALL manter64KiB/8KiB. Snapshot SHALL fragmentar registro grande integralmente; base de confirmação e recibo SHALL permanecer no main sob orçamento próprio antes do efeito. Limites SHALL não cortar campos/IDs, omitir registros ou limitar coleção ao benchmark.

#### Scenario: Unicode e registro grande
- **WHEN** registro historicamente válido ou Unicode/escaping excede tamanho de uma página
- **THEN** mensagens respeitam orçamento e reunião das partes recupera conteúdo completo/metadados sem quebrar caracteres ou publicar registro parcial

#### Scenario: Pressão de recursos
- **WHEN** recurso de leitura não pode ser alocado no orçamento da máquina
- **THEN** retorna RESOURCE_LIMIT, preserva banco/último estado completo e não apresenta truncamento/vazio como sucesso

#### Scenario: Estado transitório limitado
- **WHEN** sessões realizam leituras/subscriptions sucessivas ou harness registra mais de oito documentos
- **THEN** cada documento mantém no máximo uma inscrição/cursor ativo e excedente é recusado sem vazamento de listener/token

#### Scenario: Formulário com caracteres escapados
- **WHEN** campos básicos válidos nos limites e 20 títulos de subtarefas de 200 contêm Unicode/escaping com IDs/revisões/envelope
- **THEN** orçamento é medido em bytes UTF-8 completo e nenhum texto/ID é cortado para caber
- **AND** valor histórico intacto é omitido quando possível; comando excessivo é recusado explicitamente sem limite novo de codec e conserva draft/banco

#### Scenario: Ack curto e base grande
- **WHEN** ação envolve before-image histórica grande ou EMPTY captura referências de entradas com IDs extensos
- **THEN** ack devolve só token/counts/revisões apropriados sem Task/reflexão de IDs; reserva insuficiente recebe RESOURCE_LIMIT antes de escrever
- **AND** budget de reservas64MiB inclui candidatos e não impõe teto novo de codec, timeout de undo ou exportação de histórico

### Requirement: Erros são dados seguros discriminados

Resultados SHALL ser uniões versionadas exatas e códigos fechados por operação, sem stack/cause/SQL/path/payload/Error remoto. Erros existentes de campos/índices SHALL permanecer finitos; ações novas SHALL distinguir contexto/token/base/entrada/idade/ID/undo/série. Perda de resposta SHALL exigir ressync sem instanceof/replay/recriação de token.

#### Scenario: Erro de produto sanitizado
- **WHEN** há incompatibilidade, corrupção, indisponibilidade, request inválido, falta de autorização, sessão encerrada, snapshot stale ou limite
- **THEN** leitura conserva códigos INCOMPATIBLE_DATA, CORRUPTED_DATA, STORAGE_UNAVAILABLE, INVALID_REQUEST, UNAUTHORIZED, SESSION_CLOSED, SNAPSHOT_STALE, RESOURCE_LIMIT ou BUSY
- **AND** validação do preload recusa saída malformada sem expor detalhes sensíveis

#### Scenario: Resultado tardio após commit
- **WHEN** commit interno confirma e resposta se perde ou sessão encerra
- **THEN** banco conserva commit, cliente ressincroniza após nova autorização e não há repetição automática de escrita

#### Scenario: Erros funcionais dos comandos
- **WHEN** comando tem campos inválidos, base antiga, tarefa/item ausente, recurso bloqueado, escolha faltante, cálculo impossível, série/identidade conflitante ou origem recusada
- **THEN** usa VALIDATION_FAILED, CONFLICT, NOT_FOUND, SUBTASK_NOT_FOUND, ADVANCED_TASK_RESTRICTED, RECURRENCE_CHOICE_REQUIRED, RECURRENCE_OUT_OF_RANGE, SERIES_CONFLICT, IDENTITY_CONFLICT, SOURCE_NOT_AVAILABLE, SOURCE_NOT_ALLOWED, SOURCE_TOO_LONG ou EXTERNAL_OPEN_FAILED conforme operação
- **AND** VALIDATION_FAILED usa apenas campos/códigos e índices 0–19 pertinentes; CONFLICT pode informar revisões atuais sem Task ou reflexão do payload

#### Scenario: Recusas da lixeira e undo
- **WHEN** contexto/token/base/entrada/idade/ID/recibo/alvo/gerada torna-se inaplicável
- **THEN** usa STALE_CONTEXT, CONFIRMATION_INVALID, CONFIRMATION_CHANGED, NOT_IN_TRASH, ENTRY_CHANGED, ENTRY_EXPIRED, ID_EXISTS, UNDO_NOT_AVAILABLE, CHANGED, REMOVED ou GENERATED_CHANGED conforme operação, reutilizando SERIES_CONFLICT/CONFLICT/NOT_FOUND pertinentes
- **AND** não revela título/payload/token/causa em logs, e recusa funcional não altera coleção/revisão/evento

### Requirement: IPC de estado é comprovado no pacote

Validação SHALL exercitar bridge real/catalog17/isolamento/negativas/sessões e uma inscrição tasks+trash na UI fictícia do pacote com ações autorizadas. Mocks/Node externo SHALL não substituir evidência; runtime/kill/reopen/resources SHALL distinguir produto, prova de instalação herdada e D10 pendente.

#### Scenario: Harness de produto e bridge
- **WHEN** teste empacotado abre duas superfícies autorizadas e provoca alterações fictícias de campos/checks/fechamento/lixeira/undo
- **THEN** ambas convergem por snapshots/eventos e guardas/limpeza funcionam no runtime real, com no máximo uma gerada e save preservando marcações atuais
- **AND** hooks de teste não aparecem na bridge normal nem substituem comandos por implementação exclusiva do harness

#### Scenario: UI inscrita perde evento ou documento
- **WHEN** há evento perdido, foco, reconciliação30s, reload ou crash controlado com UI inscrita
- **THEN** interface recupera snapshot completo sem regressão e sessão anterior não entrega respostas/eventos
- **AND** listeners/timers não se acumulam, commits sobrevivem a reopen e draft perdido num crash é transitório

#### Scenario: Ações novas e oferta própria
- **WHEN** duas superfícies disputam restore/empty/undo e há reload/clear/resposta atrasada
- **THEN** snapshots convergem por uma inscrição por documento, somente decisão aplicável confirma e oferta nunca é transferida/ressuscitada
- **AND** hooks de teste não aparecem na bridge normal e ausência de Setup/scheduler/backup funcional é identificada

### Requirement: Comandos aceitam somente intenções de tarefas autorizadas

Create/update/status/check v3 SHALL conservar intenções existentes e exigir contexto estabelecido próprio; edit CAS continua estrutural. Lixeira SHALL aceitar referências/confirm tokens e undo só token próprio. Omissão/limpeza SHALL conservar regras existentes; Task/before-image/auditoria/clock/plano/callback do renderer SHALL ser recusados.

#### Scenario: Draft e patch fechados
- **WHEN** criação/edição contém somente campos autorizados e tipos corretos
- **THEN** criação normaliza e edição muda somente campos presentes, preservando demais
- **AND** null limpa só opcionais básicos, regra ou until; [] limpa tags/subtarefas; título/status/prioridade não aceitam null
- **AND** regra omite until conservando o existente; subtarefas do form contêm títulos/IDs, nunca done

#### Scenario: Campos de autoridade indevidos
- **WHEN** request inclui id em criação, createdAt/updatedAt/completedAt, anchorAt/seriesId, done em draft, reminders/processedFor, filhos, path, UndoPlan ou opções do shell
- **THEN** é recusado antes de ler/modificar dados; regra/subtarefas fora dos shapes autorizados também falham

#### Scenario: Escolha e intenção explícitas
- **WHEN** plano CANCELLED recorrente não recebe SKIP/END, escolha é extrínseca ou toggle recebe inversão sem boolean desejado
- **THEN** falta pertinente retorna RECURRENCE_CHOICE_REQUIRED e formas extrínsecas/inválidas são recusadas sem gravar
- **AND** criação terminal não exige escolha nem gera imediatamente

#### Scenario: Intenções novas e versões antigas
- **WHEN** request usa contexto atual/ref observada/token próprio ou tenta mutação v2, Task anterior, clock, predicate ou tipo de confirmação indevido
- **THEN** somente shape/contexto versão autorizados podem prosseguir; pedidos antigos/autoridade livre são recusados antes de consulta/efeito
- **AND** preparação captura base no main e não transmite cem Tasks ou confere autoridade por sessionId informado

### Requirement: Escritas são decisões condicionais no proprietário

Main SHALL gerar IDs/clock e decidir/validar/confirmar estado atual coordenado. Edição/status/check SHALL conservar edit CAS/marks atuais; exclusão e undo SHALL conferir conteúdo completo/entrada e plano final. Reserva de recibo/ack SHALL anteceder escrita; recusa/no-op SHALL não produzir revisão/evento. Contexto/ticket SHALL ser revalidados nas três fases.

#### Scenario: Criação colide
- **WHEN** gerador fornece ID existente em tarefas/lixeira ou identidade local/série conflitante
- **THEN** nenhum item é substituído; outra identidade pode ser gerada com tentativas limitadas e falha final segura

#### Scenario: Mesma base concorre
- **WHEN** duas sessões editam estrutura/campos ou mudam status da mesma tarefa/editRevision
- **THEN** primeira alteração aplicável confirma e outra recebe CONFLICT sem perda de dados ou segunda geração
- **AND** tarefa ausente retorna NOT_FOUND e nunca é recriada por edição

#### Scenario: Conteúdo independente e avançados
- **WHEN** outra tarefa muda, há claim/check isolado ou são editados campos independentes de tarefa com recorrência/lembretes/subtarefas
- **THEN** global/claim/check apenas não conflitam com revisão de edição e campos/marks atuais são conservados
- **AND** recorrência segue seus contratos; com lembretes, mudança efetiva de prazo/status e fechamento/geração são recusados até integração funcional

#### Scenario: Confirmação stale ou reserva insuficiente
- **WHEN** base completa/identidade/composição muda ou não há recurso para recibo prometido antes do efeito
- **THEN** operação recusa integralmente; global alheia não conflita sozinha e nenhuma escrita confirma antes de reservar resposta/recibo
- **AND** clear posterior ao commit não o reverte, mas impede publicação/entrega da oferta antiga

### Requirement: Confirmação de comando converge com snapshot

Ack de tarefas v3 SHALL informar APPLIED/UNCHANGED e global/content/edit exatas; create inclui ID novo e update/status somente APPLIED pode incluir undoToken. Acks v1 de lixeira/undo SHALL ser curtos após commit. Estado completo SHALL vir da mesma projeção tasks+trash e snapshot>=ack; resultado antigo SHALL não fazer upsert/replay ou recriar oferta.

#### Scenario: Resposta chega depois de snapshot novo
- **WHEN** resposta confirmada antiga chega após snapshot mais recente
- **THEN** lista conserva snapshot recente e resposta não reinstala conteúdo antigo nem perde done atual

#### Scenario: Commit sem resposta
- **WHEN** há possível commit e falha de transporte antes da confirmação
- **THEN** cliente preserva draft, sinaliza incerto e exige ressync/revisão explícita antes de nova escrita
- **AND** não reenvia criação/status/edição/toggle automaticamente nem infere confirmação por título

#### Scenario: Fechada e próxima no snapshot
- **WHEN** ack confirma fechamento com geração
- **THEN** snapshot autoritativo mostra anterior e próxima na mesma revisão ou uma posterior válida, sem publicação otimista de meia geração

#### Scenario: Oferta aguarda confirmação atual
- **WHEN** ack com undoToken confirma edição/status/move ou há novo contexto antes de snapshot>=revision
- **THEN** somente contexto atual com snapshot válido apresenta oferta, sem roubar foco; resposta antiga não apaga/substitui nova oferta
- **AND** no-op/check/create/restore/definitiva/empty/purge não oferecem e snapshots não contêm recibos/tokens

### Requirement: Origem salva abre somente por operação controlada

openTaskSource SHALL ler origem salva da tarefa/revisão autorizada, após ação explícita, e validar HTTP/HTTPS com host, sem credenciais ou controles. A URL serializada destinada ao sistema SHALL ter até 2081 caracteres no Windows. Abertura SHALL ocorrer fora da transação, com revalidação da sessão antes do efeito, sem alterar tarefa ou permitir navegação remota no app.

#### Scenario: Origem válida salva
- **WHEN** o usuário aciona abrir origem salva com ID/revisão atual e URL HTTP/HTTPS admissível
- **THEN** a operação solicita abertura no navegador padrão, sem opções ou URL enviadas livremente pelo renderer
- **AND** sucesso significa que o sistema aceitou a solicitação, não que a página foi carregada

#### Scenario: Origem recusada ou alterada
- **WHEN** não há origem, a revisão mudou, ou a URL contém controles, userinfo, protocolo proibido, host inválido ou excede 2081 caracteres após serialização
- **THEN** o comando retorna o código previsto sem chamar o opener e sem truncar/regravar a origem
- **AND** file/javascript/data/mailto/taskflow e caminhos UNC não são aceitos

#### Scenario: Falha externa ou sessão encerrada
- **WHEN** o sistema rejeita a abertura ou o documento invalida antes do efeito
- **THEN** a tarefa/draft permanecem intactos e não há nova tentativa automática
- **AND** falha externa é sanitizada, efeito já solicitado não é anunciado como reversível e resposta antiga não é entregue ao novo documento
