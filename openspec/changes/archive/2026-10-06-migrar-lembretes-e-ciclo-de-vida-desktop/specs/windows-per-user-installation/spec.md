# Spec Delta

## MODIFIED Requirements

### Requirement: Efeitos registrados somente no usuário atual

Instalação/manutenção/integrações nativas SHALL limitar registro/atalhos ao usuário atual, incluindo AUMID/CLSID/ativação e startup opcional, sem HKLM, Program Files ou atalhos globais. Elas SHALL documentar paths/chaves/atalhos efetivos e falhar de forma segura quando o destino estiver inacessível, sem elevar ou redirecionar para root global.

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

Upgrade manual, desinstalação padrão e reinstalação SHALL manter identidade estável e preservar a raiz de dados/marcador da prova. Uninstall SHALL remover somente binários, chaves, atalhos e entrada/aprovação de startup próprios, com ownership verificado, conservando registros estranhos. Upgrade SHALL preservar preferência/desativação externa no caminho estável. Instalação de máquina preexistente SHALL ser recusada sem migração ou elevação.

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

#### Scenario: Identidade notificações e cleanup próprios
- **WHEN** instalação/primeira execução prepara atalho AUMID+CLSID/COM por usuário e uninstall remove recursos
- **THEN** target/LocalServer32/ícone/activation são provados com espaços/acentos; cleanup confere cadastro próprio e não remove outro perfil/conta ou CLSID/entrada estrangeiros
- **AND** COM usa executável próprio, sem serviço/helper/elevação; dev/test não altera cadastro prod
