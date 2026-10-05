# Spec Delta

## MODIFIED Requirements

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem acesso livre a Node, filesystem, IPC ou sistema. A superfície SHALL expor somente verifyFoundation, getStateSnapshot, subscribeState, unsubscribeState, createTask, updateTask, changeTaskStatus, setSubtaskDone e openTaskSource versionados, sem canais, SQL, callbacks remotos, repositories, Task livre como comando ou caminhos arbitrários. Operações funcionais futuras SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente as nove operações versionadas previstas estão expostas, com estado e mutações de tarefas v2 e diagnóstico/abertura da origem v1
- **AND** não há excluir/lixeira/undo funcionais, IA, clipboard, atalhos, notificações ou abertura de URL arbitrária

#### Scenario: Abrir origem não amplia navegação
- **WHEN** o usuário aciona openTaskSource por seu wrapper específico
- **THEN** a operação validada abre a origem salva pelo sistema sem fornecer shell ao renderer
- **AND** navegação externa, janelas arbitrárias, webviews e permissões não necessárias continuam bloqueadas
