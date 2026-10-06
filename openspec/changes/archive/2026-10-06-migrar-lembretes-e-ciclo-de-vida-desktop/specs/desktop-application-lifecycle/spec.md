# Spec Delta

## Purpose

Definir como o aplicativo local permanece disponível na bandeja, suspende superfícies, encerra com segurança e inicia opcionalmente com o usuário sem serviço, elevação ou perda de autoridade sobre seus dados.

## ADDED Requirements

### Requirement: Fechar suspende sessão e preserva memória transitória

Com bandeja válida, X/Alt+F4 SHALL ocultar janela e manter lembretes no processo. Draft/filtros SHALL sobreviver somente em memória; undo/prévias/confirmações/pedidos antigos SHALL perder validade e admissão IPC SHALL ser retirada. Reabrir SHALL usar nova sessão/snapshot e revalidar base sem autosave/replay. Minimizar SHALL conservar sessão/undo.

#### Scenario: Close e reabertura
- **WHEN** janela fecha para bandeja com draft/filtros e transientes, depois Abrir é acionado
- **THEN** draft/filtros retornam com base preservada e sessão/snapshot novos; transientes e respostas antigas não retornam
- **AND** pendências são reconciliadas antes de novas escritas; dado confirmado enquanto ack se perdeu não é repetido

#### Scenario: IPC oculto e cliente atrasado
- **WHEN** renderer oculto não processou evento de suspensão e tenta ler/mutar/setter com autorização anterior ou nova
- **THEN** main recusa admissão de produto/efeito nativo sem consultar dados ou reautorizar superfície oculta
- **AND** somente eventos finitos de controle destinados ao documento vivo podem continuar, sem conceder autoridade

#### Scenario: Minimizar saída e crash
- **WHEN** janela minimiza/perde foco, processo sai ou renderer sofre crash
- **THEN** minimizar/foco conserva sessão/undo; saída/crash não prometem conservar draft/filtros e commits sobrevivem integralmente

### Requirement: Bandeja mantém caminho explícito de recuperação

Bandeja SHALL oferecer Abrir/Sair com identidade/ícone do app e restaurar/focar janela. Falha conhecida de criação/disponibilidade SHALL manter janela visível e erro acessível; close sem bandeja SHALL permitir saída segura. Aplicação SHALL não conservar processo oculto sem caminho de recuperação conhecido.

#### Scenario: Abrir e recriar superfície
- **WHEN** usuário usa Abrir com janela oculta/minimizada ou superfície destruída enquanto tray válido
- **THEN** janela atual é restaurada ou nova superfície segura é criada e estado persistido é sincronizado
- **AND** superfície recriada não inventa draft ou tokens perdidos

#### Scenario: Falha de tray
- **WHEN** tray não pode ser criado ou falha conhecida impede recuperação
- **THEN** janela permanece/volta visível com explicação e Sair; não é ocultada como sucesso
- **AND** limitação de detecção de remoção de ícone pelo shell é documentada

### Requirement: Saída explícita encerra processo com segurança

Sair SHALL ser idempotente, fechar admissão, parar agenda/ativação, invalidar transientes/jobs e fechar conexão após unidades ativas terminarem/reverterem. Close durante saída SHALL não ocultar. Logoff/shutdown Windows SHALL iniciar saída segura sem impedir encerramento do SO; crash/energia SHALL continuar falhas abruptas separadas.

#### Scenario: Sair repetido durante commit ou arquivo
- **WHEN** Sair é acionado repetidamente com unidade/arquivo ativo ou claims enfileirados
- **THEN** nenhuma tentativa nova é iniciada, unidade ativa termina/reverte sem interrupção de COMMIT e entradas não iniciadas perdem admissão
- **AND** efeito confirmado permanece; tray/janelas/conexão encerram e processo não fica residual

#### Scenario: Logoff e interrupção forçada
- **WHEN** Windows envia eventos de término de sessão ou processo é morto abruptamente
- **THEN** término tenta cleanup sem hide/veto ao SO e kill é validado por recuperação atômica, sem promessa de callback de saída ou entrega de lembrete

### Requirement: Suspensão interrompe tentativas e retomada reconcilia

Suspend SHALL impedir novas decisões/submissões e preservar dados/markers. Resume SHALL reconciliar com clock atual e graça de cinco minutos antes de novas escritas visíveis. Janela SHALL conservar draft/filtros durante suspensão; falha de recuperação SHALL ser stale/bloqueada, sem reset ou replay.

#### Scenario: Suspensão perto do gatilho
- **WHEN** PC suspende antes/durante pendência e retoma dentro ou fora da graça
- **THEN** não há nova submissão suspensa e retomada entrega somente pendente elegível ou consome expirada sem aviso
- **AND** marker confirmado antes da suspensão impede outra tentativa mesmo que aviso tenha sido perdido

### Requirement: Instância única separa ativação de ownership

Somente owner SHALL abrir storage/scheduler/janela de produto. Segundo lançamento manual SHALL restaurar/focar owner e sair. Ativação COM concorrente SHALL poder usar relay transitório limitado a10s, sem banco/janela/writer, encaminhando apenas referência validada ao owner. Payload externo SHALL não autorizar mutação/URL/path.

#### Scenario: Manual e COM disputam
- **WHEN** segundo lançamento manual ou COM ocorre com owner ativo/partindo
- **THEN** manual sai após pedido de foco e COM encaminha no máximo referência finita sem segundo writer ou navegação duplicada
- **AND** timeout encerra relay; se owner morreu, somente aquisição de lock autoriza compor produto

#### Scenario: Payload e perfil alheios
- **WHEN** additionalData/argv/cwd contém campo extra, versão/tamanho inválido, URL/path/comando ou perfil dev/test
- **THEN** nada é executado como autoridade de tarefa ou cadastro prod e remetente não abre outro writer

### Requirement: Iniciar com usuário é opt-in e estado observado

Inicialização com usuário SHALL ser desligada por padrão, modificável por gesto explícito em prod instalado e representada por entrada própria versionada do Windows, fora do backup. Estado observado SHALL distinguir ligado/desligado/desativado externamente/indisponível/incerto. Startup SHALL não reabilitar preferência ou aprovação externa automaticamente.

#### Scenario: Primeira execução opt-in e opt-out
- **WHEN** app abre pela primeira vez, usuário liga/desliga iniciar com usuário ou inicia manualmente
- **THEN** default não registra startup, gesto altera somente entrada própria e lançamento manual abre janela
- **AND** lançamento pelo argumento constante de login inicia na bandeja apenas se tray válido; falha conserva janela visível

#### Scenario: Desativação externa
- **WHEN** Windows Settings/Task Manager desativa a entrada própria ou existe outra entrada com mesmo executável e args distintos
- **THEN** UI mostra estado da entrada própria, não infere habilitação por outra e não a reabilita ao abrir/retomar
- **AND** novo gesto explícito de habilitar pode alterar a aprovação da entrada própria

### Requirement: Falha e manutenção de startup preservam ownership

Setter SHALL verificar estado depois do efeito e representar falha parcial/perda de resposta sem falso rollback ou replay. Upgrade SHALL preservar escolha/desativação no caminho estável. Uninstall SHALL remover apenas entrada/aprovação/identidade nativa próprias conservando dados; cadastro estranho/futuro SHALL não ser sobrescrito ou apagado.

#### Scenario: Registro parcial ou resultado perdido
- **WHEN** Run/StartupApproved falha parcialmente, leitura não confirma ou sessão encerra depois do efeito
- **THEN** resultado observado/UNKNOWN é comunicado após releitura autorizada, sem gravar cópia divergente, compensação automática ou sucesso presumido

#### Scenario: Upgrade uninstall e reinstalação
- **WHEN** versão seguinte atualiza, usuário desinstala/reinstala ou outra conta instala
- **THEN** upgrade preserva preferência, uninstall remove só recursos próprios e reinstalação começa sem startup; segunda conta permanece independente
- **AND** dados/markers sobrevivem, sem serviço/tarefa agendada/HKLM/elevação

### Requirement: Política de ciclo de vida é comunicada na janela

Janela SHALL explicar fechar para bandeja, Sair, memória transitória, descarte de undo/prévia e recuperação de cinco minutos em texto acessível. SHALL não prometer avisos com processo encerrado/PC desligado/SO bloqueando. Preferência e erros SHALL ser operáveis por teclado e não depender de toast para compreender comportamento.

#### Scenario: Política e acesso por teclado
- **WHEN** usuário consulta opções/ciclo de vida ou encontra falha de tray/notificação/startup
- **THEN** rótulos/status/avisos anunciam comportamento verdadeiro, controles têm foco visível e configuração desligada não é obrigatória
- **AND** zoom200/DPI/leitor de tela são verificados separadamente de snapshots de componentes
