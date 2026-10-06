# Spec Delta

## MODIFIED Requirements

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


## ADDED Requirements

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
