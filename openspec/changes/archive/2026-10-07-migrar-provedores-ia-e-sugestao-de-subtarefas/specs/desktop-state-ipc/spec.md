# Spec Delta

## MODIFIED Requirements

### Requirement: Catálogo de estado mínimo e versionado

Bridge SHALL oferecer43 wrappers no manager e14 no Quick Add: estado3; diagnóstico/origem1; create4/check3, update5/status4, move2, outros contexto/trash/undo1; quatro backup1; status/inscrição/eventos desktop2, startup/saída/resolução1, nove operações de captura/atalhos1 e oito operações de IA1. Schemas runtime SHALL ser exatos. Versões anteriores dos contratos alterados, SQL/path/Task/plano/callback remoto, credencial de IA e IPC livre SHALL ser recusados.

#### Scenario: Operações disponíveis
- **WHEN** documento autorizado inspeciona preload
- **THEN** encontra43 wrappers no manager: verifyFoundation/getStateSnapshot/subscribeState/unsubscribeState/createTask/updateTask/changeTaskStatus/setSubtaskDone/openTaskSource/clearUndoOffer/prepareTrashConfirmation/moveTaskToTrash/restoreTrashItem/deleteTrashItem/emptyTrash/prepareTrashView/undoLastTaskAction/exportBackup/prepareBackupRestore/confirmBackupRestore/cancelBackupRestore/getDesktopStatus/setStartAtLogin/requestQuit/subscribeDesktopEvents/resolveReminderActivation/openQuickAdd/openTaskManager/captureClipboard/getPendingCapture/acknowledgeCapture/discardCapture/getShortcutSettings/setShortcut/setShortcutEditing/getAiProviderStatus/saveAiProviderConfig/removeAiProviderConfig/authorizeAiUse/testAiConnection/prepareAiSuggestion/suggestAiSubtasks/cancelAiSuggestion, sem canal livre
- **AND** versões de main/preload/renderer são coerentes no mesmo pacote, sem fallback para estado1/2, update1/2/3/4, status1/2/3, create1/2/3, move1, versões antigas de check ou status/inscrição/eventos desktop1

#### Scenario: Request malformado
- **WHEN** chega versão errada, objeto inválido, campo extra, cursor/ID/revisão inválido ou request acima do orçamento de sua operação
- **THEN** main recusa antes de ler dados e retorna erro fechado, sem lançar erro de implementação através do IPC
- **AND** estado/diagnóstico continuam limitados a 1 KiB UTF-8 e comandos têm orçamento próprio de 64 KiB

#### Scenario: Catálogo Quick Add
- **WHEN** documento QUICK_ADD inspeciona preload
- **THEN** encontra somente getStateSnapshot/subscribeState/unsubscribeState/createTask/clearUndoOffer/getDesktopStatus/requestQuit/subscribeDesktopEvents/openTaskManager/captureClipboard/getPendingCapture/acknowledgeCapture/discardCapture/getShortcutSettings
- **AND** main recusa operações de manager, inclusive todas as operações de IA, mesmo se conteúdo tentar construir request por outra via

### Requirement: Transporte limitado preserva dados legítimos

Estado/diagnóstico/eventos SHALL manter1KiB e páginas256KiB UTF-8 completo. Comandos de produto SHALL manter64KiB/8KiB. Tasks/arquivo/base/preparação SHALL permanecer no proprietário sob budgets antes de efeito; DTO pequeno SHALL não truncar campo/ID/dado legítimo nem converter excesso em vazio. Novos requests SHALL manter1KiB e results8KiB, exceto draft de captura64KiB UTF-8 JSON completo; evento de captura/atalhos SHALL manter1KiB sem conteúdo bruto. Operações de IA SHALL manter requests1KiB e results8KiB, exceto configuração8KiB e preparar/sugerir16KiB UTF-8 completo; nenhum conteúdo de IA SHALL sair em evento.

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

#### Scenario: Prévia de IA nos limites
- **WHEN** preparação de sugestão contém título200 e descrição1000 com Unicode/escaping e a resposta devolve até20 títulos de200
- **THEN** request/result completos respeitam16KiB UTF-8 medidos antes de qualquer efeito e nenhum texto é cortado para caber
- **AND** configuração com base e modelo extensos respeita8KiB; excesso recebe RESOURCE_LIMIT sem gravar/executar e sem conteúdo de IA em evento

## ADDED Requirements

### Requirement: Operações de IA aceitam somente intenções finitas de manager

Oito operações `:v1` de IA SHALL usar schemas exatos e role de manager: status, salvar, remover, autorizar, testar conexão, preparar sugestão, sugerir e cancelar. Requests SHALL aceitar somente os campos autorizados de cada operação, sem canal, caminho, URL completa, credencial de leitura ou referência livre; CAS SHALL vincular alterações de configuração à revisão esperada. Guardas de role/frame/documento/sessão/origem/URL/admissão SHALL preceder qualquer acesso à credencial, à rede ou a dados, e consentimento/autorização SHALL pertencer ao documento que executa.

#### Scenario: Payload fechado de configuração
- **WHEN** salvar/remover/autorizar recebe provedor/base/credencial/modelo/revisão/disposição fora do shape, campo extra ou credencial em leitura
- **THEN** a operação é recusada antes de gravar, contatar a rede ou alterar consentimento
- **AND** respostas devolvem somente resumo sem segredo, sem permitir reconstruir a credencial

#### Scenario: Intenções de sugestão e cancelamento
- **WHEN** preparar recebe título/descrição/vagas válidos e sugerir/cancelar recebe somente `requestId` da própria sessão
- **THEN** a preparação devolve conteúdo exato/`requestId`/origem e a geração ou cancelamento atua somente sobre pedido do próprio documento
- **AND** `requestId` alheio, antigo ou consumido é recusado sem afetar pedidos de outra sessão

#### Scenario: Role e orçamentos de IA
- **WHEN** documento QUICK_ADD tenta qualquer operação de IA ou request excede o orçamento da operação
- **THEN** a recusa ocorre antes de ler credencial, arquivo ou rede, com erro seguro de autorização ou limite
- **AND** nenhum evento de IA é publicado e a superfície rápida permanece sem configuração ou assistência
