# Spec Delta

## MODIFIED Requirements

### Requirement: Catálogo de estado mínimo e versionado

Bridge SHALL oferecer35 wrappers no manager e14 no Quick Add: estado3; diagnóstico/origem1; create4/check3, update5/status4, move2, outros contexto/trash/undo1; quatro backup1; status/inscrição/eventos desktop2, startup/saída/resolução1 e nove operações novas1. Schemas runtime SHALL ser exatos. Versões anteriores dos contratos alterados, SQL/path/Task/plano/callback remoto e IPC livre SHALL ser recusados.

#### Scenario: Operações disponíveis
- **WHEN** documento autorizado inspeciona preload
- **THEN** encontra35 wrappers no manager: verifyFoundation/getStateSnapshot/subscribeState/unsubscribeState/createTask/updateTask/changeTaskStatus/setSubtaskDone/openTaskSource/clearUndoOffer/prepareTrashConfirmation/moveTaskToTrash/restoreTrashItem/deleteTrashItem/emptyTrash/prepareTrashView/undoLastTaskAction/exportBackup/prepareBackupRestore/confirmBackupRestore/cancelBackupRestore/getDesktopStatus/setStartAtLogin/requestQuit/subscribeDesktopEvents/resolveReminderActivation/openQuickAdd/openTaskManager/captureClipboard/getPendingCapture/acknowledgeCapture/discardCapture/getShortcutSettings/setShortcut/setShortcutEditing, sem canal livre
- **AND** versões de main/preload/renderer são coerentes no mesmo pacote, sem fallback para estado1/2, update1/2/3/4, status1/2/3, create1/2/3, move1, versões antigas de check ou status/inscrição/eventos desktop1

#### Scenario: Request malformado
- **WHEN** chega versão errada, objeto inválido, campo extra, cursor/ID/revisão inválido ou request acima do orçamento de sua operação
- **THEN** main recusa antes de ler dados e retorna erro fechado, sem lançar erro de implementação através do IPC
- **AND** estado/diagnóstico continuam limitados a 1 KiB UTF-8 e comandos têm orçamento próprio de 64 KiB

#### Scenario: Catálogo Quick Add
- **WHEN** documento QUICK_ADD inspeciona preload
- **THEN** encontra somente getStateSnapshot/subscribeState/unsubscribeState/createTask/clearUndoOffer/getDesktopStatus/requestQuit/subscribeDesktopEvents/openTaskManager/captureClipboard/getPendingCapture/acknowledgeCapture/discardCapture/getShortcutSettings
- **AND** main recusa operações de manager mesmo se conteúdo tentar construir request por outra via

### Requirement: Transporte limitado preserva dados legítimos

Estado/diagnóstico/eventos SHALL manter1KiB e páginas256KiB UTF-8 completo. Comandos de produto SHALL manter64KiB/8KiB. Tasks/arquivo/base/preparação SHALL permanecer no proprietário sob budgets antes de efeito; DTO pequeno SHALL não truncar campo/ID/dado legítimo nem converter excesso em vazio. Novos requests SHALL manter1KiB e results8KiB, exceto draft de captura64KiB UTF-8 JSON completo; evento de captura/atalhos SHALL manter1KiB sem conteúdo bruto.

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

#### Scenario: Draft de captura com descrição e escaping
- **WHEN** captura mapeada possui título200/descrição4000 e origem com Unicode/escaping
- **THEN** result completo respeita64KiB e evento contém só referência/seq; excesso recebe RESOURCE_LIMIT sem truncar URL ou inventar limite de codec
- **AND** há um raw em voo e no máximo dois slots de64KiB; limite raw1MiB é aplicado somente após alocação nativa

### Requirement: Eventos desktop controlam somente superfície e intenção limitada

Desktop SHALL oferecer status/inscrição/eventosv2 por superfície, startup/saída/resoluçãov1 e callbacks locais com disposer. Eventos<=1KiB SHALL ter sequência/kinds finitos, sem Task/path/clock/notifier livre; captura/atalhos SHALL levar só referências/status. Produto/efeitos de renderer SHALL não ser admitidos enquanto sua superfície oculta/suspensa; outra janela visível SHALL conservar autoridade.

#### Scenario: Shapes e versões desktop
- **WHEN** getDesktopStatus/setStartAtLogin/requestQuit/subscribeDesktopEvents/resolveReminderActivation recebe request/evento com versão/shape/remetente/tamanho inválido
- **THEN** operação é recusada antes de efeito; setter só aceita desired boolean e resolução só tag opaca limitada
- **AND** callbacks/disposer são locais, uma inscrição por documento; requests/acks mantêm64KiB/8KiB e erros são seguros

#### Scenario: Controle sobre documento oculto
- **WHEN** close retira sessão de produto mas documento local vivo mantém listener de controle
- **THEN** somente suspensão/ativação/status e locate-reminder destinados ao manager podem chegar pela guarda específica; produto/setter continua sem autoridade
- **AND** reload/crash remove listener e evento antigo não reativa sessão ou transientes

#### Scenario: Eventos de duas superfícies
- **WHEN** uma janela fecha ou capture-available/shortcuts-changed é publicado
- **THEN** controle suspende somente owner alvo; conteúdo aguarda admissão e referências coalescem sem conceder leitura ao oculto
- **AND** statusv2 identifica role/visibilidade da própria superfície; localizar lembrete não retargeta para Quick Add

### Requirement: Reabertura cria sessão sem resposta herdada

Close para bandeja SHALL retirar somente a admissão da superfície alvo e invalidar cursores/tokens/jobs/requests de produto. Abrir SHALL reconciliar e criar nova sessão/inscrição/snapshot antes de escritas, conservando draft/filtros apenas em memória. Ack antigo SHALL não ser entregue, repetido ou reconstruído como oferta na sessão nova.

#### Scenario: Cliente ignora suspensão e resposta chega tarde
- **WHEN** renderer oculto tenta autorizar novamente ou ack da sessão encerrada chega depois de Abrir
- **THEN** oculto continua recusado e ack antigo não publica dados/oferta na nova sessão
- **AND** ressync conserva commits, aponta conflito de base quando pertinente e não reenvia escrita

#### Scenario: Reabertura com captura apresentada
- **WHEN** mesma instância viva reabre com heldCapture local
- **THEN** preserva cópia transitória e consulta estado/recibo somente por sessão nova; request/ack antigo não altera novo slot
- **AND** recibo limitado reconcilia captura sem replay de escrita ou oferta de undo; reload/crash não recupera held perdido

## ADDED Requirements

### Requirement: Novas operações aceitam somente intenções finitas por role

Nove operações novas SHALL usar v1 e schemas exatos, sem raw clipboard, destino/path/URL/accelerator livre. Guards de role/frame/documento/sessão/origem/URL SHALL preceder efeitos e entrega. Ack/discard SHALL aceitar só ID/seq e disposição fechada; setter SHALL aceitar ação/combo|null/CAS e edição boolean somente de manager autorizado.

#### Scenario: Payload fechado de captura e navegação interna
- **WHEN** openQuickAdd/openTaskManager/captureClipboard/getPendingCapture é solicitado
- **THEN** não aceita destino, URL, path ou conteúdo livre; destino/role são definidos pelo proprietário e autorização é revalidada antes de efeito/resposta
- **AND** capture por sessão inválida não lê clipboard nem devolve conteúdo

#### Scenario: Setter e reconhecimento sem autoridade adicional
- **WHEN** acknowledgeCapture/discardCapture/setShortcut/setShortcutEditing recebe ID/seq/ação/combo/revisão/disposição inválida, campo extra ou role proibido
- **THEN** recusa antes de consumir captura, alterar registro ou gravar preferências; presented/applied são as únicas disposições de ack
- **AND** getShortcutSettings retorna só revisão/preferência/status finitos, sem path/configuração arbitrária ou leitura de clipboard

#### Scenario: Orçamento completo e saídas verificadas
- **WHEN** qualquer request novo excede1KiB ou result excede8KiB, exceto getPendingCapture64KiB
- **THEN** retorna erro seguro de limite, sem cortar dados; schemas/bytes de saída e eventos também são validados antes de entrega
