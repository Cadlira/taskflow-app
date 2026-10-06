# desktop-state-ipc Specification

## Purpose
Permitir que documentos desktop autorizados leiam e acompanhem estado local coerente, com revisão, limites e ressincronização, sem receber autoridade de mutação ou acesso ao armazenamento.

## Requirements

### Requirement: Catálogo de estado mínimo e versionado

Bridge SHALL oferecer26 wrappers: estado3; diagnóstico/origem1; create4/check3, update5/status4, move2, outros contexto/trash/undo1; quatro backup1 e cinco desktop1. Schemas runtime SHALL ser exatos. Versões anteriores dos contratos alterados, SQL/path/Task/plano/callback remoto e IPC livre SHALL ser recusados.

#### Scenario: Operações disponíveis
- **WHEN** documento autorizado inspeciona preload
- **THEN** encontra26 wrappers: verifyFoundation/getStateSnapshot/subscribeState/unsubscribeState/createTask/updateTask/changeTaskStatus/setSubtaskDone/openTaskSource/clearUndoOffer/prepareTrashConfirmation/moveTaskToTrash/restoreTrashItem/deleteTrashItem/emptyTrash/prepareTrashView/undoLastTaskAction/exportBackup/prepareBackupRestore/confirmBackupRestore/cancelBackupRestore/getDesktopStatus/setStartAtLogin/requestQuit/subscribeDesktopEvents/resolveReminderActivation, sem canal livre
- **AND** versões de main/preload/renderer são coerentes no mesmo pacote, sem fallback para estado1/2, update1/2/3/4, status1/2/3, create1/2/3, move1 ou versões antigas de check

#### Scenario: Request malformado
- **WHEN** chega versão errada, objeto inválido, campo extra, cursor/ID/revisão inválido ou request acima do orçamento de sua operação
- **THEN** main recusa antes de ler dados e retorna erro fechado, sem lançar erro de implementação através do IPC
- **AND** estado/diagnóstico continuam limitados a 1 KiB UTF-8 e comandos têm orçamento próprio de 64 KiB

### Requirement: Snapshot completo pertence a uma revisão

Snapshot v3 SHALL conter tarefas/trash/revisões e undoEpoch positiva segura do processo, sem segredos ou detalhes do banco. Páginas SHALL pertencer ao par(revision,undoEpoch); alteração de qualquer parte SHALL invalidar continuação. Metadados SHALL permanecer separados de Task/backup.

#### Scenario: Páginas estáveis
- **WHEN** coleção é lida por todas as páginas sem mudança de revisão
- **THEN** cliente reúne/valida snapshot completo numa única revisão, preservando registros/campos conhecidos e revisões de conteúdo/edição exatas

#### Scenario: Commit entre páginas
- **WHEN** revisão muda depois da primeira página e antes de continuação
- **THEN** continuação retorna SNAPSHOT_STALE e cliente descarta montagem parcial, conserva último estado completo e ressincroniza

#### Scenario: Leitura não altera produto
- **WHEN** snapshot inclui lixeira antiga ou payload histórico compatível
- **THEN** não ocorre expurgo, rewrite, nova revisão ou evento de alteração por causa da leitura

#### Scenario: Época muda sem revisão SQL
- **WHEN** backup UNCHANGED ocorre entre páginas ou snapshot com revision igual retorna época maior
- **THEN** continuação recebe SNAPSHOT_STALE e metadata de época maior é adotada sem regressão de dados
- **AND** no-op não fabrica globalRevision nem é ignorado só por revision igual

### Requirement: Inscrição coordena snapshot inicial e eventos

Inscrição/snapshot e listeners de alteração/indisponibilidade/invalidação de undo SHALL iniciar sem lacuna. Wrapper SHALL registrar listeners antes do pedido e bufferizar maior revisão/época até snapshot completo. Callbacks SHALL continuar locais; uma inscrição SHALL atender dados e barreira transitória.

#### Scenario: Commit durante handshake
- **WHEN** commit ocorre antes da resposta de subscribe ou durante montagem do snapshot
- **THEN** o buffer conserva a maior revisão relevante e o cliente ressincroniza se necessário, sem substituir estado novo por resposta antiga

#### Scenario: Subscribe repetido
- **WHEN** o mesmo documento chama subscribe mais de uma vez
- **THEN** a operação é idempotente para uma inscrição corrente por documento e não multiplica eventos/listeners

#### Scenario: Backup durante handshake
- **WHEN** época é invalidada antes da resposta de subscribe ou durante reconstrução
- **THEN** buffer conserva maior época/revisão e cliente reconcilia, sem reinstalar oferta antiga
- **AND** nenhum subscriber de produto adicional é criado para backup

### Requirement: Eventos são invalidações posteriores ao commit

Alteração v3 SHALL carregar inscrição/revisão/época e exigir commit; no-op/recusa/rollback SHALL não emitir alteração. Evento transitório undo-invalidated v1 SHALL carregar inscrição/época/razão fechada de backup/recuperação, sem revisão SQL fictícia ou Task. Versões inválidas SHALL ser recusadas.

#### Scenario: Commit e no-op
- **WHEN** unidade confirma alteração e outra é no-op/rollback
- **THEN** somente alteração confirmada produz invalidação com revisão; nenhuma mensagem anuncia unidade revertida como sucesso

#### Scenario: Perda de validade dos dados
- **WHEN** erro incerto/corrupção torna produto indisponível
- **THEN** subscribers autorizados recebem indisponibilidade por código seguro e conservam último snapshot stale, sem substituição por lista vazia

#### Scenario: No-op invalida somente estado transitório
- **WHEN** restauração UNCHANGED confirma
- **THEN** evento transitório informa época maior sem evento de alteração/revisão SQL nova
- **AND** APPLIED também atualiza estado por evento normal; barreira precede próxima ação/publicação

#### Scenario: Forma e remetente do evento
- **WHEN** evento transitório tem campo extra/época inválida/razão fora de BACKUP_RESTORED ou STORAGE_RECOVERED ou inscrição alheia
- **THEN** preload recusa saída e não aplica invalidação de sessão alheia
- **AND** mensagem permitida cabe em1KiB e não contém path/payload/undoToken

### Requirement: Revisões determinam ressincronização

Cliente SHALL ignorar revisões/épocas antigas e reconciliar por snapshot diante de salto/perda/stale/reconexão. Coalescer maior revisão e maior época SHALL conservar suas ordens independentes. Mesmo SQL igual com época maior SHALL limpar ofertas; nenhuma reconciliação SHALL reproduzir mutação.

#### Scenario: Eventos fora de ordem ou duplicados
- **WHEN** chegam revisões em ordem invertida, repetidas ou com salto
- **THEN** estado não regride, a maior revisão orienta ressync e nenhum patch incompleto é aplicado

#### Scenario: Evento perdido sem salto
- **WHEN** o último evento se perde e nenhum evento posterior chega
- **THEN** reconciliação no foco ou em até 30 s enquanto inscrito obtém snapshot atualizado sem depender exclusivamente de eventos

#### Scenario: Escritas contínuas
- **WHEN** três reconstruções imediatas do snapshot falham por mudança contínua de revisão
- **THEN** o ciclo retorna `BUSY`, preserva o último snapshot completo stale e permite novo ciclo em invalidação/reconciliação/solicitação, sem loop bloqueante

#### Scenario: Última invalidação de undo perdida
- **WHEN** evento de backup UNCHANGED se perde sem commit/evento posterior
- **THEN** snapshot no foco/em até30s detecta época maior e remove oferta
- **AND** resposta elegível antiga continua cercada pela época, sem depender de timestamp

### Requirement: Tokens e listeners pertencem ao documento

Inscrição/cursor/confirm/undo/restore SHALL ser opacos próprios do documento/contexto. Contexto monotônico SHALL limpar transientes e impedir resposta antiga. Cursor/preview têm TTL próprios; undo SHALL não expirar. Reload/navegação/crash/fechamento SHALL liberar tokens/buffers/listeners/jobs/reservas, inclusive mesma URL.

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

#### Scenario: Token de prévia uma vez e expiração
- **WHEN** confirm usa token próprio/alheio/consumido/expirado após5min monotônicos
- **THEN** só o próprio atual pode ser tomado uma vez; inválido/alheio não consome preparação legítima
- **AND** cancelamento próprio repetido é idempotente; novo arquivo/contexto libera preparação anterior

#### Scenario: Confirmação modal abandonada
- **WHEN** usuário abandona modal irreversível sem cancelar a prévia
- **THEN** nenhum confirm é enviado e token permanece até seu TTL/contexto
- **AND** exportação preventiva não renova token/TTL/base

### Requirement: Autorização também protege acesso e saída

Request/execução/resposta/evento SHALL verificar webContents/mainframe/documento/origem/URL/contexto atuais. Recusa SHALL anteceder storage/arquivo/token. Fronteiras de diálogo/leitura/gravação SHALL revalidar ticket; autorização antiga SHALL não liberar efeito ainda não iniciado ou saída tardia.

#### Scenario: Matriz de remetentes inválidos
- **WHEN** request vem de iframe, webContents desconhecido, frame removido, origem/URL errada, about:blank/blob, sessão antiga ou tentativa de origem dev no pacote
- **THEN** o main recusa sem consultar armazenamento e sem revelar dados/paths internos

#### Scenario: Documento invalida enquanto espera
- **WHEN** request autorizado entra na fila e o documento navega antes de executar ou receber resultado
- **THEN** há nova verificação antes de ler e antes de enviar; nenhum dado é entregue sob a autorização antiga

#### Scenario: Sessão muda durante escolha ou staging
- **WHEN** dialog/read/write aguarda e documento navega/fecha
- **THEN** antes de próximo efeito guard recusa e temporário próprio libera
- **AND** efeito já confirmado permanece e nenhuma resposta/dado vai ao novo documento

### Requirement: Transporte limitado preserva dados legítimos

Estado/diagnóstico/eventos SHALL manter1KiB e páginas256KiB UTF-8 completo. Comandos de produto SHALL manter64KiB/8KiB. Tasks/arquivo/base/preparação SHALL permanecer no proprietário sob budgets antes de efeito; DTO pequeno SHALL não truncar campo/ID/dado legítimo nem converter excesso em vazio.

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

#### Scenario: Prévia e arquivo20MiB
- **WHEN** arquivo é grande ou app.version/shape de resumo histórico excede8KiB
- **THEN** renderer recebe só resumo finito/token ou RESOURCE_LIMIT anterior à publicação, sem arquivo completo ou metadado cortado
- **AND** backup reserva128MiB lógicos próprios;undo64MiB permanece e candidatos contam até liberar

### Requirement: Erros são dados seguros discriminados

Resultados SHALL ser uniões versionadas/códigos fechados com campos/índices finitos, sem stack/SQL/path/conteúdo/título/token/log sensível. Backup SHALL distinguir falha de arquivo/token/base/verificação e confirmação NOT_APPLIED/UNKNOWN de sucesso durável VERIFIED/PENDING. Perda de resposta SHALL exigir ressync sem replay.

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
- **AND** VALIDATION_FAILED usa apenas campos/códigos e índices 0–19 pertinentes, com reminders em0–9; CONFLICT pode informar revisões atuais sem Task ou reflexão do payload

#### Scenario: Recusas da lixeira e undo
- **WHEN** contexto/token/base/entrada/idade/ID/recibo/alvo/gerada torna-se inaplicável
- **THEN** usa STALE_CONTEXT, CONFIRMATION_INVALID, CONFIRMATION_CHANGED, NOT_IN_TRASH, ENTRY_CHANGED, ENTRY_EXPIRED, ID_EXISTS, UNDO_NOT_AVAILABLE, CHANGED, REMOVED ou GENERATED_CHANGED conforme operação, reutilizando SERIES_CONFLICT/CONFLICT/NOT_FOUND pertinentes
- **AND** não revela título/payload/token/causa em logs, e recusa funcional não altera coleção/revisão/evento

#### Scenario: Arquivo exportação e prévia recusados
- **WHEN** formato/encoding/tamanho/estrutura/dados/recursos/leitura/destino/token/TTL/base falha
- **THEN** usa somente códigos do contrato de backup da operação, primeiros5issues seguros e contagem restante quando pertinente
- **AND** NEWER_FORMAT_VERSION não inicia conversão; callback/mensagem de validator livre não é saída IPC

#### Scenario: Gravação confirmada não verificada
- **WHEN** COMMIT confirma mas conferência posterior falha
- **THEN** ok APPLIED/UNCHANGED com verification:PENDING não anuncia rollback;commitState UNKNOWN só descreve incerteza
- **AND** falha pré-commit com rollback usa NOT_APPLIED;ambas as coleções ficam inteiras e token não é reconstruído

### Requirement: IPC de estado é comprovado no pacote

Validação SHALL exercitar bridge26/isolamento/negativas/sessões e uma inscrição de tasks+trash+época no pacote fictício. I/O real de backup SHALL usar serviço de produto; escolha stub SHALL ser distinta de diálogo nativo Windows. Runtime/kill/reopen/recursos SHALL não substituir prova de instalação nem resolver D10.

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
- **AND** hooks de teste não aparecem na bridge normal e scheduler de produto é exercitado e ausência de Setup/prova nativa de notificações/login e limites da evidência nativa de backup são identificados

#### Scenario: Backup no pacote em duas sessões
- **WHEN** harness usa arquivo real por escolha determinística e confirma APPLIED/UNCHANGED/base stale/epoch perdida/late ack
- **THEN** bridge/main/SQLite/I/O de produto são exercitados e sessões convergem sem ressuscitar oferta
- **AND** seleção stub não é apresentada como diálogo real; hooks permanecem fora do preload normal

### Requirement: Comandos aceitam somente intenções de tarefas autorizadas

Create4/check3 e update5/status4 SHALL conservar intenções e contexto próprio; edit CAS permanece. Drafts de reminders SHALL aceitar apenas AT/OFFSET, configuração e ID existente no update, sem autoridade de processamento. Move2/demais trash1 SHALL usar referência/token e undo1 só token próprio. Backup1 SHALL aceitar somente contexto/token conforme operação, sem path/bytes/JSON/Task/clock/opções nativas. Limpeza/omissão SHALL manter regras.

#### Scenario: Draft e patch fechados
- **WHEN** criação/edição contém somente campos autorizados e tipos corretos
- **THEN** criação normaliza e edição muda somente campos presentes, preservando demais
- **AND** null limpa só opcionais básicos, regra ou until; [] limpa tags/subtarefas/reminders; título/status/prioridade/reminders não aceitam null
- **AND** regra omite until conservando o existente; subtarefas do form contêm títulos/IDs, nunca done

#### Scenario: Campos de autoridade indevidos
- **WHEN** request inclui id em criação, createdAt/updatedAt/completedAt, anchorAt/seriesId, done em draft, processedFor em reminder, ID de reminder novo/criação ou estranho no update, filhos, path, UndoPlan ou opções do shell
- **THEN** é recusado antes de ler/modificar dados; regra/subtarefas/reminders fora dos shapes autorizados também falham

#### Scenario: Escolha e intenção explícitas
- **WHEN** plano CANCELLED recorrente não recebe SKIP/END, escolha é extrínseca ou toggle recebe inversão sem boolean desejado
- **THEN** falta pertinente retorna RECURRENCE_CHOICE_REQUIRED e formas extrínsecas/inválidas são recusadas sem gravar
- **AND** criação terminal não exige escolha nem gera imediatamente

#### Scenario: Intenções novas e versões antigas
- **WHEN** request usa contexto atual/ref observada/token próprio ou tenta versão antiga de sua operação, Task anterior, clock, predicate ou tipo de confirmação indevido
- **THEN** somente shape/contexto versão autorizados podem prosseguir; pedidos antigos/autoridade livre são recusados antes de consulta/efeito
- **AND** preparação captura base no main e não transmite cem Tasks ou confere autoridade por sessionId informado

#### Scenario: Shapes de backup fechados
- **WHEN** request usa export/prepare com contexto, confirm/cancel com contexto+restoreToken ou acrescenta path/File/JSON/sessionId/options
- **THEN** só shape/version/contexto autorizado prossegue;extras recusam antes de acessar arquivo/base/token
- **AND** renderer não escolhe relógio/versão app/configuração/autoridade de consentimento

### Requirement: Escritas são decisões condicionais no proprietário

Proprietário SHALL decidir/validar/confirmar atual coordenado. Tarefas conservam editCAS/marks; exclusão/undo conferem conteúdo/entrada; backup usa CAS global e plano final tarefas+trash. Reserva/ack/barreira SHALL anteceder efeitos pertinentes. No-op/recusa SHALL não produzir revisão/evento SQL; ticket/contexto SHALL ser revalidados.

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
- **AND** recorrência segue seus contratos; prazo/status/fechamento com reminders seguem liquidação atômica e reconciliação funcional sem guard D8; falha externa não reverte commit

#### Scenario: Confirmação stale ou reserva insuficiente
- **WHEN** base completa/identidade/composição muda ou não há recurso para recibo prometido antes do efeito
- **THEN** operação recusa integralmente; global alheia não conflita sozinha em comandos por tarefa/lixeira;backup exige sua base global exata e nenhuma escrita confirma antes de reservar resposta/recibo
- **AND** clear posterior ao commit não o reverte, mas impede publicação/entrega da oferta antiga

#### Scenario: Backup e conclusão ordenada
- **WHEN** confirmação válida toma token e restaura enquanto outra ação aguarda
- **THEN** plano é aplicado/verificado inteiro e conclusão/barreira transitória executa antes da próxima unidade/publicação
- **AND** cancel/rollback não invalida alheias e pós-commit não vira erro de rollback

### Requirement: Confirmação de comando converge com snapshot

Acks create4/check3 e update5/status4 SHALL conservar outcome/revisões; ofertas update5/status4 e move2 SHALL carregar undoEpoch. Demais trash/undo1 e backup1 SHALL ser curtos. Oferta exige contexto/época atual e snapshot>=ack; resposta antiga SHALL não fazer upsert/replay/ressuscitar oferta.

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

#### Scenario: Ack antes ou depois da barreira
- **WHEN** ack elegível tem epoch menor/maior que conhecida ou snapshot ainda não alcançou revision
- **THEN** menor descarta oferta;maior aguarda reconciliação e igual só oferta em contexto atual com snapshot>=ack
- **AND** snapshot isolado nunca recria recibo/token e aviso de backup PENDING não anuncia nada alterado

#### Scenario: Resumo não publica tarefas
- **WHEN** backup retorna preview ou ack confirmado
- **THEN** preview guarda só metadata/token e ack solicita snapshot autoritativo completo
- **AND** UI não instala tasks a partir do arquivo nem reduz conjunto pelos filtros

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

### Requirement: Operações de backup têm contratos finitos

Backup v1 SHALL oferecer exportBackup/prepareBackupRestore com contextSequence e confirmBackupRestore/cancelBackupRestore com contextSequence+restoreToken. Resultado SHALL ser cancelled/ok/error fechado; preview e ack SHALL ficar em8KiB. Nenhum path, conteúdo, opções, sessão ou relógio do renderer SHALL autorizar arquivo/substituição.

#### Scenario: Resumo completo
- **WHEN** prepare retorna ok
- **THEN** contém restoreToken/baseRevision/sourceFormatVersion/formatVersion4/exportedAt/appVersion/fileTaskCount/localTaskCount/expiresInMs300000, sem Task/path
- **AND** fields/versões/tipos/counts/tokens são validados no preload e main

#### Scenario: Resultado de exportar e confirmar
- **WHEN** export confirma ou confirm completa/recusa
- **THEN** export retorna SAVED/SAVED_WITH_WARNING com taskCount/revision; confirm ok retorna outcome APPLIED/UNCHANGED,revision,restoredCount,verification VERIFIED/PENDING,undoEpoch
- **AND** confirm error distingue commitState NOT_APPLIED/UNKNOWN;cancels próprios são neutros/idempotentes sem consumir token alheio

### Requirement: Eventos desktop controlam somente superfície e intenção limitada

Desktopv1 SHALL oferecer status, startup boolean, saída, inscrição de callbacks locais com disposer e resolução por tag64hex. Eventos<=1KiB SHALL ter sequência monotônica/kinds finitos e até uma intenção pendente, sem Task/path/clock/notifier livre. Produto e efeitos nativos SHALL não ser admitidos enquanto superfície oculta/suspensa.

#### Scenario: Shapes e versões desktop
- **WHEN** getDesktopStatus/setStartAtLogin/requestQuit/subscribeDesktopEvents/resolveReminderActivation recebe request/evento com versão/shape/remetente/tamanho inválido
- **THEN** operação é recusada antes de efeito; setter só aceita desired boolean e resolução só tag opaca limitada
- **AND** callbacks/disposer são locais, uma inscrição por documento; requests/acks mantêm64KiB/8KiB e erros são seguros

#### Scenario: Controle sobre documento oculto
- **WHEN** close retira sessão de produto mas documento local vivo mantém listener de controle
- **THEN** somente suspensão/ativação/status/locate-reminder finitos podem chegar pela guarda específica; produto/setter continua sem autoridade
- **AND** reload/crash remove listener e evento antigo não reativa sessão ou transientes

### Requirement: Ativação resolve seleção sobre snapshot coerente

Resolução SHALL retornar somente ausência ou revisão global/ordinal da tarefa na ordem canônica do snapshot antes de filtros. Cliente SHALL selecionar somente sobre snapshot da mesma revisão, sem truncar IDs históricos. Churn após três tentativas SHALL retornar BUSY/stale, sem selecionar tarefa incorreta.

#### Scenario: ID longo e mudança concorrente
- **WHEN** alvo válido tem ID histórico maior que evento curto ou coleção muda entre resolução e snapshot
- **THEN** referência curta/ordinal conserva identidade sem refletir ID no evento; seleção aguarda revisão coerente
- **AND** alvo ausente/ambíguo não produz mutação ou seleção arbitrária

### Requirement: Reabertura cria sessão sem resposta herdada

Close para bandeja SHALL retirar admissão e invalidar cursores/tokens/jobs/requests de produto. Abrir SHALL reconciliar e criar nova sessão/inscrição/snapshot antes de escritas, conservando draft/filtros apenas em memória. Ack antigo SHALL não ser entregue, repetido ou reconstruído como oferta na sessão nova.

#### Scenario: Cliente ignora suspensão e resposta chega tarde
- **WHEN** renderer oculto tenta autorizar novamente ou ack da sessão encerrada chega depois de Abrir
- **THEN** oculto continua recusado e ack antigo não publica dados/oferta na nova sessão
- **AND** ressync conserva commits, aponta conflito de base quando pertinente e não reenvia escrita
