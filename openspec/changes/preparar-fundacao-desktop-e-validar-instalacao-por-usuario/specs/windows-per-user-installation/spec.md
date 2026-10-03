# Spec Delta

## Purpose

Permitir instalar e manter o TaskFlow no Windows exclusivamente para o usuário atual, sem administrador, preservando seus dados e recusando opções que ampliem o escopo.

## ADDED Requirements

### Requirement: Instalação offline exclusiva por usuário

O instalador SHALL instalar somente para o usuário atual, sem oferecer todos os usuários, solicitar elevação ou depender de rede/Node/npm no destino. App, Setup e desinstalador SHALL ter execução asInvoker; o pacote SHALL excluir helpers de elevação, updater e serviços de sistema. Para executar o sandbox do Electron no Windows, o Setup SHALL conceder somente leitura/execução herdável ao SID `S-1-15-2-1` (`ALL APPLICATION PACKAGES`) na pasta canônica `TaskFlowApp`, após validar seu destino. SHALL NOT aplicar essa ACE aos pais, dados/perfis do usuário, roots globais ou outras pastas. Se a ACE não puder ser definida, a instalação SHALL falhar sem desativar sandbox nem elevar.

#### Scenario: Instalação por conta padrão
- **WHEN** uma conta fora de Administrators, com UAC ativo, inicia normalmente o Setup offline no ambiente autorizado
- **THEN** a instalação termina sem prompt de administrador ou download adicional e não oferece opção todos os usuários
- **AND** o app pode ser iniciado pelo executável e pelo atalho do usuário

#### Scenario: Artefatos sem elevação
- **WHEN** app, Setup, desinstalador e conteúdo do pacote são inspecionados
- **THEN** os três manifests indicam asInvoker e não há helper de elevação, updater ou serviço de sistema

#### Scenario: ACL mínima exigida pelo Electron sandbox
- **WHEN** Setup conclui instalação no diretório canônico validado
- **THEN** somente essa pasta e seus filhos herdam leitura/execução para `S-1-15-2-1`
- **AND** o sandbox não recebe escrita e nenhum perfil, dado, pasta pai ou destino global recebe a ACE
- **AND** falha ao configurar a ACL interrompe a instalação sem alterar modo do Electron

### Requirement: Destino efetivo limitado ao usuário

O instalador SHALL aceitar somente o destino canônico aprovado no Known Folder UserProgramFiles do usuário atual, separado dos dados. Overrides e destinos anteriores SHALL passar pela mesma validação antes de efeitos de instalação/remoção; destino não autorizado SHALL causar recusa segura.

#### Scenario: Destino padrão com caracteres não ASCII
- **WHEN** o destino canônico autorizado contém espaços ou acentos
- **THEN** a instalação usa esse destino e os atalhos apontam ao executável correto

#### Scenario: Override equivalente ao permitido
- **WHEN** `/D` aponta ao destino canônico aprovado
- **THEN** o instalador pode prosseguir sob a mesma política per-user

#### Scenario: Override fora do permitido
- **WHEN** `/D` aponta a outro destino, root global, outra conta, UNC, relativo, traversal ou escape por reparse point
- **THEN** o instalador recusa antes de extrair/remover binários ou gravar registro/atalhos

#### Scenario: InstallLocation anterior não autorizado
- **WHEN** HKCU contém destino anterior fora do root/pasta aprovados
- **THEN** o instalador recusa, não segue o registro sem validação e mantém instalação/dados existentes

#### Scenario: Known Folder redirecionado
- **WHEN** o Known Folder está fora do perfil normal e seu root não foi explicitamente aprovado
- **THEN** a operação é bloqueada para revisão, sem fallback global

### Requirement: Argumentos não ampliam o escopo

O instalador SHALL recusar `/allusers`, inclusive combinado com `/currentuser` ou `/S`. `/currentuser` e modo silencioso SHALL conservar todas as restrições per-user/destino. Argumentos conflitantes, duplicados ou malformados SHALL falhar com código não zero e sem alterar a instalação existente.

#### Scenario: Argumentos permitidos
- **WHEN** o usuário usa `/currentuser` ou `/S` com destino permitido e argumentos válidos
- **THEN** a instalação continua exclusiva por usuário e não eleva nem contorna a validação de caminho

#### Scenario: Solicitação all-users
- **WHEN** `/allusers` é fornecido isoladamente ou com `/currentuser` e/ou `/S`
- **THEN** a instalação falha de forma segura sem instalação de máquina ou elevação

#### Scenario: Entrada ambígua
- **WHEN** argumentos de modo/destino são conflitantes, duplicados ou malformados
- **THEN** o instalador retorna código não zero e não altera os binários/registro/atalhos existentes nem dados

### Requirement: Efeitos registrados somente no usuário atual

Instalação e manutenção SHALL limitar registro e atalhos ao usuário atual, sem gravar HKLM, Program Files ou atalhos globais. Elas SHALL documentar paths/chaves/atalhos efetivos e falhar de forma segura quando o destino estiver inacessível, sem elevar ou redirecionar para root global.

#### Scenario: Efeitos da instalação
- **WHEN** os efeitos do Setup são comparados antes/depois no ambiente de prova
- **THEN** somente a pasta de binários autorizada, temporários do usuário, registro HKCU e atalhos desse usuário pertencem à instalação
- **AND** não aparecem gravações globais ou serviços atribuíveis ao instalador

#### Scenario: Destino sem permissão de escrita
- **WHEN** o destino permitido está inacessível para a conta padrão
- **THEN** a operação apresenta erro/código não zero, preserva dados/instalação preexistentes e não solicita administrador ou escolhe outra pasta

#### Scenario: Outra conta instala o app
- **WHEN** uma segunda conta realiza instalação per-user
- **THEN** seus binários/registro/atalhos são próprios e a primeira instalação permanece intacta
- **AND** a ACE de AppContainer limita-se à pasta TaskFlowApp daquela conta

### Requirement: Manutenção preserva identidade e dados

Upgrade manual, desinstalação padrão e reinstalação SHALL manter identidade estável e preservar a raiz de dados/marcador da prova. Uninstall SHALL remover somente binários, chaves e atalhos próprios do usuário. Instalação de máquina preexistente SHALL ser recusada sem migração ou elevação.

#### Scenario: Atualização manual fictícia
- **WHEN** o app é fechado com segurança e a versão fictícia seguinte é instalada para o mesmo usuário
- **THEN** a versão exibida muda e o diagnóstico reabre o mesmo marcador confirmado, sem reset ou mudança de ID/root
- **AND** o fingerprint fictício registrado antes da atualização permanece igual

#### Scenario: Desinstalação e reinstalação
- **WHEN** a conta padrão desinstala e reinstala o aplicativo
- **THEN** uninstall ocorre sem elevação, remove binários/registro/atalhos próprios e mantém os dados
- **AND** a reinstalação reconhece o marcador anterior e não altera outra conta
- **AND** o fingerprint fictício registrado antes da desinstalação permanece igual

#### Scenario: Instalação all-users legada
- **WHEN** uma instalação de máquina conflitante é detectada
- **THEN** o instalador recusa com orientação segura, sem alterar HKLM ou tentar elevá-la/migrá-la
