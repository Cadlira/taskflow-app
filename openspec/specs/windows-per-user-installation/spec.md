# windows-per-user-installation Specification

## Purpose
Permitir instalar e manter o TaskFlow no Windows exclusivamente para o usuário atual, sem administrador, preservando seus dados e recusando opções que ampliem o escopo.

## Requirements

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

O instalador SHALL aceitar somente o destino canônico aprovado no Known Folder UserProgramFiles do usuário atual, separado dos dados e coerente com o destino reconhecido pelo runtime. Overrides e destinos anteriores SHALL passar pela mesma validação antes de efeitos de instalação/remoção; destino não autorizado ou divergente SHALL causar recusa segura, sem fallback.

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

#### Scenario: Known Folder dentro do perfil diverge do runtime
- **WHEN** UserProgramFiles está dentro do perfil, mas o destino resultante diverge de LocalAppData/Programs/TaskFlowApp reconhecido pelo runtime
- **THEN** Setup recusa antes de substituir/remover binários ou alterar registro/atalhos
- **AND** conserva a instalação e os dados, informa a incompatibilidade e não escolhe outro destino

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

Upgrade manual, desinstalação padrão e reinstalação SHALL manter identidade estável e preservar a raiz de dados do produto e da prova. Uninstall SHALL remover somente binários, chaves, atalhos e entrada/aprovação de startup próprios, com ownership verificado, conservando registros estranhos. Upgrade SHALL preservar preferência/desativação externa no caminho estável. Instalação de máquina preexistente SHALL ser recusada sem migração ou elevação.

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

#### Scenario: Atualização entre versões completas compatíveis
- **WHEN** duas versões distintas aprovadas do produto completo são usadas na manutenção autorizada, com app encerrado e hashes identificados
- **THEN** o produto novo reconhece tarefas, lixeira não vencida, campos avançados, recorrências, subtarefas, IDs, revisões, codec e marcadores persistidos no mesmo perfil
- **AND** a comparação lógica controla expurgo/claim temporal e não usa só marcador da fundação nem hash do banco após uso
- **AND** atalhos personalizados e configuração de IA cifrada permanecem, sem reenviar lembretes por reset dos marcadores

#### Scenario: Retenção integral em uninstall normal e silencioso
- **WHEN** a conta autorizada desinstala normalmente ou por `/S` com o app encerrado
- **THEN** perfis/user-data/session-data, tarefas/lixeira, preferências e credencial cifrada são conservados
- **AND** somente recursos nativos próprios são removidos; valores/chaves/atalhos de terceiros são preservados
- **AND** reinstalação reconhece os dados existentes e começa sem inicialização no login, sem reativar aprovação externa

#### Scenario: Preferência de startup em upgrade
- **WHEN** startup está ativado, desativado ou desabilitado externamente e ocorre upgrade compatível
- **THEN** a escolha/desativação é conservada sem autoativação, mantendo caminho e argumento próprios

#### Scenario: Credencial fictícia retida no mesmo usuário
- **WHEN** manutenção/reinstalação preserva configuração v1 protegida pelo Windows para o mesmo usuário
- **THEN** uma prova local com credencial fictícia confirma sua utilização protegida sem rede, revelação, logs ou exportação
- **AND** configuração futura ou indecifrável permanece intacta e bloqueada pelos contratos existentes, sem plaintext ou overwrite

### Requirement: Manutenção exige encerramento seguro

Instalação, reparo, upgrade e uninstall SHALL recusar processos próprios ativos ou detecção inconclusiva antes de remover/substituir recursos, sem encerramento forçado ou elevação. A recusa SHALL orientar salvar rascunhos e usar Sair. Setup silencioso e predecessor executado de cópia verificada com _?= pelo upgrade SHALL retornar código não zero e impedir avanço após recusa. Conforme IR3 aprovada, o launcher normal do uninstaller, inclusive /S, pode retornar0 antes do filho; esse retorno SHALL NOT ser anunciado como contrato de automação. A campanha SHALL observar recusa/conclusão efetiva e preservação dos recursos, mantendo guardas, retenção e ownership sem controlador adicional.

#### Scenario: App aberto ou oculto na bandeja
- **WHEN** manutenção encontra o aplicativo visível, oculto na bandeja, com duas janelas ou operação de escrita/arquivo/IA em voo
- **THEN** recusa sem encerrar qualquer processo ou alterar instalação/dados
- **AND** informa que fechar a janela não equivale a Sair

#### Scenario: Manutenção silenciosa com app ativo
- **WHEN** Setup ou uninstall é chamado por `/S` com processo próprio ativo
- **THEN** recusa sem confirmação automática de fechamento, diálogo obrigatório ou bypass
- **AND** Setup e predecessor executado diretamente de cópia verificada propagam erro; o retorno do launcher normal do uninstall segue a limitação IR3 e não prova sucesso

#### Scenario: Detecção indisponível ou ownership incerto
- **WHEN** a consulta de processos/caminho/usuário falha, excede timeout ou não consegue provar ausência de processo próprio
- **THEN** manutenção é recusada sem kill, fallback por nome amplo, alteração de política ou solicitação de administrador

#### Scenario: Saída explícita concluída
- **WHEN** o usuário salva rascunhos, usa Sair e a drenagem existente termina sem processos próprios/relay residual
- **THEN** uma nova tentativa pode prosseguir pelas demais guardas de manutenção
- **AND** atalhos e ownership de armazenamento estão liberados, sem escritor concorrente

#### Scenario: Processo reabre entre fases
- **WHEN** um processo próprio é detectado na revalidação anterior à fase destrutiva
- **THEN** a operação falha sem forçar seu término ou continuar a substituição
- **AND** se houver efeitos parciais anteriores, relata essa fase sem declarar sucesso nem resetar dados

#### Scenario: Desinstalador anterior sem garantia compatível
- **WHEN** upgrade encontra predecessor cuja procedência/ownership ou guarda contra encerramento forçado não é comprovada
- **THEN** recusa antes de invocar esse desinstalador ou substituir a instalação
- **AND** informa a necessidade de transição revisada, sem sobrescrever o binário antigo, bypass ou alegação de upgrade seguro

#### Scenario: Upgrade com desinstalador seguro
- **WHEN** predecessor compatível e verificado contém a mesma política de recusa e um processo surge durante sua remoção
- **THEN** o desinstalador anterior recusa sem kill e o Setup propaga falha, sem avançar como se a remoção tivesse sucesso

### Requirement: Identidade preexistente é validada antes de substituição

O instalador SHALL verificar coerência da identidade técnica, metadata, atalhos e ativação próprios antes de remover/substituir a instalação, preservando recursos estrangeiros ou futuros. Cleanup SHALL revalidar ownership antes de remover recursos. IDs/nomes técnicos/roots SHALL permanecer estáveis em instalação, reparo, upgrade e reinstalação; identidade legal SHALL ser declarada somente após revisão humana.

#### Scenario: Identidade estável em manutenção
- **WHEN** instalação/reparo/upgrade/reinstall são concluídos
- **THEN** taskflow-app, TaskFlow App, TaskFlowApp, taskflow.app, GUID NSIS derivado, CLSID prod e entrada startup v1 conservam seus vínculos
- **AND** atalho aponta ao executável próprio com cwd/AUMID/CLSID coerentes e perfis dev/test/prod permanecem isolados

#### Scenario: Cadastro estrangeiro ou futuro
- **WHEN** preflight encontra metadata/atalho/ativação que pertence a outro destino, identidade ou versão futura desconhecida
- **THEN** recusa antes de substituir/remover binários ou cadastro e conserva bytes/valores preexistentes
- **AND** não assume autoria legal/publisher nem corrige recurso estrangeiro automaticamente

#### Scenario: Ownership muda antes do cleanup
- **WHEN** um recurso deixa de ser comprovadamente próprio antes da remoção
- **THEN** o recurso é preservado e o resultado identifica a recusa/limitação, sem apagar entrada de outro aplicativo/conta

### Requirement: Recuperação e remoção de dados são explícitas

A manutenção SHALL conservar dados originais em falha e distinguir reparo de binários de recuperação de dados. O procedimento SHALL bloquear reset/downgrade incompatível, conservar arquivos futuros/corrompidos e journals, excluir credenciais de backups e separar exclusão manual de dados de uninstall. Falha parcial SHALL ser relatada sem promessa de rollback atômico ou sucesso.

#### Scenario: Falha depois do início da instalação
- **WHEN** extração, escrita, espaço, ACL ou registro falha após efeitos do Setup
- **THEN** a operação reporta falha e fase, mantém perfis/dados fora de remoção/extração e não abre automaticamente o app nem declara sucesso
- **AND** informa que binários podem estar parciais e orienta reparo pela mesma versão íntegra compatível

#### Scenario: Reparo de binários
- **WHEN** o usuário autorizado reinstala a mesma versão íntegra compatível com app encerrado e demais guardas aprovadas
- **THEN** os recursos próprios são reparados sem reset/mudança da raiz de dados ou ativação automática de startup

#### Scenario: Banco ou configuração não reconhecidos
- **WHEN** banco corrompido/futuro ou preferências futuras/indecifráveis são encontrados na abertura após manutenção
- **THEN** os bytes originais são conservados e a operação afetada fica bloqueada conforme seu contrato
- **AND** o guia não manda apagar journals, forçar versão ou sobrescrever a configuração para obter sucesso

#### Scenario: Recuperação seletiva autorizada
- **WHEN** o procedimento é validado com cópias fictícias de banco/journals, após Sair e ausência de writer
- **THEN** conserva originais, valida compatibilidade e explicita que snapshot antigo pode regredir revisões/marcadores e reenviar avisos
- **AND** não inclui ai.json/credencial na cópia, não promete recuperação automática ou replay seguro e não confunde backup de tarefas com perfil completo

#### Scenario: Downgrade incompatível
- **WHEN** binário anterior não demonstra compatibilidade com schema/payload/preferências atuais
- **THEN** o procedimento recusa downgrade/reset, preserva dados e não restaura banco antigo sobre o atual nem reativa startup incompatível

#### Scenario: Usuário deseja apagar dados após uninstall
- **WHEN** o usuário consulta o guia de exclusão de dados retidos
- **THEN** encontra procedimento manual separado com Sair, validação do root/ownership, seleção do perfil e confirmação da perda
- **AND** uninstall não contém wipe automático ou checkbox novo; retenção não implica revogação da chave no provedor
