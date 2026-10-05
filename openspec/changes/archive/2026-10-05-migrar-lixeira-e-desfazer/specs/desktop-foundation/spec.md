# Spec Delta

## MODIFIED Requirements

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem acesso livre a Node, filesystem, IPC ou sistema. A superfície SHALL expor somente os 17 wrappers versionados autorizados de diagnóstico, estado, tarefas, lixeira, contexto e undo, sem canais livres, SQL, callbacks remotos, repositories, Task/UndoPlan como comando ou paths arbitrários. Recursos posteriores SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente os 17 wrappers previstos estão expostos, com estado v2, quatro mutações de tarefas v3, diagnóstico/origem v1 e oito operações novas v1
- **AND** não há backup funcional, IA, clipboard, atalhos, notificações ou abertura de URL arbitrária; lixeira/undo usam somente intenções e tokens próprios

#### Scenario: Abrir origem não amplia navegação
- **WHEN** o usuário aciona openTaskSource por seu wrapper específico
- **THEN** a operação validada abre a origem salva pelo sistema sem fornecer shell ao renderer
- **AND** navegação externa, janelas arbitrárias, webviews e permissões não necessárias continuam bloqueadas

### Requirement: Ownership antes do armazenamento

Somente o processo proprietário do perfil SHALL abrir bancos de prova e produto. Segunda instância SHALL encerrar antes do armazenamento. Fechamento provisório SHALL fechar admissão, invalidar sessões/recibos/confirmações/reservas e tratar unidades admitidas antes de liberar conexões, sem interromper commit ativo ou recuperar undo após reabertura.

#### Scenario: Dois processos no mesmo perfil
- **WHEN** uma instância está ativa e outro processo é iniciado para o mesmo perfil
- **THEN** o segundo termina sem abrir qualquer banco ou criar outro escritor/janela
- **AND** o primeiro mantém seu estado e marcador

#### Scenario: Fechamento durante verificação
- **WHEN** a janela é fechada durante o diagnóstico
- **THEN** a transação é concluída ou revertida com segurança, a conexão é fechada e o processo termina
- **AND** não há bandeja, processo residual ou serviço mantendo a prova ativa

#### Scenario: Fechamento com produto em atividade
- **WHEN** uma unidade de produto está ativa ou há entradas admitidas na fila ao fechar/sair
- **THEN** novas entradas são recusadas, sessões/listeners/recibos/confirmações/reservas são invalidados e unidades ativas terminam ou revertem antes de fechar conexão
- **AND** entradas ainda não iniciadas podem ser canceladas com erro seguro; nenhum sucesso/evento é emitido para documento encerrado
- **AND** interrupção forçada de processo é validada separadamente como crash, sem mudar o fechamento provisório para bandeja

#### Scenario: Encerramento perde somente oferta temporária
- **WHEN** janela recarrega, sofre crash, fecha ou processo sai e depois reabre
- **THEN** dados confirmados sobrevivem integralmente e recibos antigos não retornam, mesmo na mesma URL
- **AND** minimizar/perder foco não invalida a sessão nem expira oferta
