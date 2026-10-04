# Spec Delta

## MODIFIED Requirements

### Requirement: Shell local autocontido e acessível

O aplicativo SHALL abrir uma janela principal de gerenciamento local de tarefas, com identidade e versão, sem backend, conta ou rede obrigatória. A ação explícita de verificar a fundação SHALL continuar acessível em área secundária. Gerenciamento e diagnóstico SHALL apresentar estados em execução, sucesso ou erro seguro, acessíveis por teclado.

#### Scenario: Execução instalada offline
- **WHEN** o usuário inicia o aplicativo instalado sem rede, servidor de desenvolvimento ou Node/npm externo
- **THEN** a janela carrega seus recursos locais, identifica a versão e permite gerenciar tarefas locais e executar o diagnóstico por teclado
- **AND** nenhum recurso funcional futuro é anunciado como disponível

#### Scenario: Diagnóstico falha
- **WHEN** uma etapa da verificação falha
- **THEN** a janela apresenta falha por código/mensagem segura, sem stack, caminho pessoal ou conteúdo do banco
- **AND** não apresenta sucesso parcial como conclusão da prova

#### Scenario: Diagnóstico permanece separado
- **WHEN** o usuário abre ou executa o diagnóstico a partir da janela de tarefas
- **THEN** seus dados/formulário não são enviados à prova nem redefinidos
- **AND** o resultado técnico fica na área diagnóstica, sem ocupar os campos ou mensagens normais de tarefas

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem acesso livre a Node, filesystem, IPC ou sistema. A superfície SHALL expor somente verifyFoundation, getStateSnapshot, subscribeState, unsubscribeState, createTask, updateTask, changeTaskStatus e openTaskSource versionados, sem canais, SQL, callbacks remotos, repositories, Task livre como comando ou caminhos arbitrários. Operações funcionais futuras SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente as oito operações versionadas previstas estão expostas
- **AND** não há excluir/lixeira/undo funcionais, ações de recorrência/subtarefas, IA, clipboard, atalhos, notificações ou abertura de URL arbitrária

#### Scenario: Abrir origem não amplia navegação
- **WHEN** o usuário aciona openTaskSource por seu wrapper específico
- **THEN** a operação validada abre a origem salva pelo sistema sem fornecer shell ao renderer
- **AND** navegação externa, janelas arbitrárias, webviews e permissões não necessárias continuam bloqueadas
