# Spec Delta

## MODIFIED Requirements

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem Node/filesystem/IPC livre. A superfície SHALL expor somente21 wrappers autorizados de diagnóstico/estado/tarefas/lixeira/contexto/undo/backup, com versões próprias, sem SQL/callbacks remotos/repositories/Task ou paths como comando. Recursos posteriores SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente21 wrappers estão expostos: estado3, create/check3, update/status4, move2, diagnóstico/origem/contexto e demais trash/undo1, quatro backup1
- **AND** backup usa apenas escolha nativa/resumo/token no proprietário; IA/clipboard/atalhos/notificações/URL arbitrária permanecem ausentes; lixeira/undo usam intenções próprias

#### Scenario: Abrir origem não amplia navegação
- **WHEN** o usuário aciona openTaskSource por seu wrapper específico
- **THEN** a operação validada abre a origem salva pelo sistema sem fornecer shell ao renderer
- **AND** navegação externa, janelas arbitrárias, webviews e permissões não necessárias continuam bloqueadas

### Requirement: Ownership antes do armazenamento

Somente o proprietário do perfil SHALL abrir bancos/arquivos de produto. Segunda instância SHALL encerrar antes do armazenamento. Fechamento SHALL fechar admissão, invalidar sessões/preparações/jobs/recibos e tratar unidades ativas com segurança, sem interromper commit ou recuperar tokens após reabrir.

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

#### Scenario: Fechamento durante arquivo ou prévia
- **WHEN** documento fecha com diálogo/I/O/prévia de backup ou unidade ativa
- **THEN** preparações e jobs não iniciados perdem autorização; temporários próprios liberam e unidade ativa termina/reverte com segurança
- **AND** arquivo/commit já confirmado permanece e nada é enviado ao documento novo; nenhum perfil real é usado como teste

