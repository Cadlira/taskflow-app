# Spec Delta

## MODIFIED Requirements

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem Node/filesystem/IPC livre. A superfície SHALL expor somente26 wrappers autorizados de diagnóstico/estado/tarefas/lixeira/contexto/undo/backup/desktop, com versões próprias, sem SQL/callbacks remotos/repositories/Task ou paths como comando. Recursos posteriores SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente26 wrappers estão expostos: estado3, create4/check3, update5/status4, move2, diagnóstico/origem/contexto e demais trash/undo1, quatro backup1 e cinco desktop1
- **AND** backup usa apenas escolha nativa/resumo/token no proprietário; IA/clipboard/atalhos/URL arbitrária e API livre de notificações permanecem ausentes; lixeira/undo usam intenções próprias

#### Scenario: Abrir origem não amplia navegação
- **WHEN** o usuário aciona openTaskSource por seu wrapper específico
- **THEN** a operação validada abre a origem salva pelo sistema sem fornecer shell ao renderer
- **AND** navegação externa, janelas arbitrárias, webviews e permissões não necessárias continuam bloqueadas


### Requirement: Identidade e perfis independentes

O aplicativo SHALL manter identidade estável e dados próprios no perfil do usuário, separados da instalação e da extensão. Dados e sessão de dev, test e prod SHALL usar diretórios distintos; o lançamento normal instalado SHALL usar prod e ignorar overrides de desenvolvimento.

#### Scenario: Perfis não se contaminam
- **WHEN** o app é executado em desenvolvimento, smoke empacotado restrito e lançamento instalado normal
- **THEN** cada modo usa seu perfil declarado e não lê ou altera os marcadores dos demais
- **AND** não escreve dados/cache no diretório do executável nem no perfil Chrome

#### Scenario: Segunda conta Windows
- **WHEN** outra conta executa sua própria instalação
- **THEN** ela usa dados/sessão próprios e não altera a primeira conta



#### Scenario: Identidades nativas não contaminam produção
- **WHEN** dev/test usa notificações fictícias ou campanha nativa explicitamente isolada
- **THEN** AUMID/nome/atalho/CLSID/registro são separados de prod e startup setter é indisponível fora da instalação de produção
- **AND** nenhum cadastro de produção é modificado por smoke ou modo dev

### Requirement: Ownership antes do armazenamento

Somente o proprietário do perfil SHALL abrir bancos/arquivos de produto. Segunda instância SHALL não abrir armazenamento; manual encerra e relay de ativação é limitado sem writer. Close com bandeja SHALL retirar admissão da sessão e manter owner; Sair SHALL encerrar. Ambos SHALL invalidar transientes e tratar unidades ativas sem interromper commit ou recuperar tokens.

#### Scenario: Dois processos no mesmo perfil
- **WHEN** uma instância está ativa e outro processo é iniciado para o mesmo perfil
- **THEN** o segundo manual termina sem abrir qualquer banco ou criar outro escritor/janela, solicitando restore/foco do owner
- **AND** o primeiro mantém seu estado e marcador

#### Scenario: Fechamento durante verificação
- **WHEN** a janela é fechada durante o diagnóstico
- **THEN** a transação é concluída ou revertida com segurança; close com bandeja retira sessão e oculta janela, Sair fecha conexão/processo
- **AND** o diagnóstico não amplia autoridade oculta nem cria serviço; falha de bandeja conserva janela visível

#### Scenario: Fechamento com produto em atividade
- **WHEN** uma unidade de produto está ativa ou há entradas admitidas na fila ao fechar/sair
- **THEN** novas entradas da sessão encerrada são recusadas, seus transientes são invalidados e unidades ativas terminam/revertem; close conserva conexão do owner e Sair fecha-a
- **AND** entradas ainda não iniciadas podem ser canceladas com erro seguro; nenhum sucesso/evento é emitido para documento encerrado
- **AND** interrupção forçada de processo é validada separadamente como crash, sem confundir crash com close para bandeja ou prometer persistir draft/filtros após crash

#### Scenario: Encerramento perde somente oferta temporária
- **WHEN** janela recarrega, sofre crash, fecha ou processo sai e depois reabre
- **THEN** dados confirmados sobrevivem integralmente e recibos antigos não retornam, mesmo na mesma URL
- **AND** minimizar/perder foco não invalida a sessão nem expira oferta

#### Scenario: Fechamento durante arquivo ou prévia
- **WHEN** documento fecha com diálogo/I/O/prévia de backup ou unidade ativa
- **THEN** preparações e jobs não iniciados perdem autorização; temporários próprios liberam e unidade ativa termina/reverte com segurança
- **AND** arquivo/commit já confirmado permanece e nada é enviado ao documento novo; nenhum perfil real é usado como teste
