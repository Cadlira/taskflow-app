# desktop-foundation Specification

## Purpose
Disponibilizar um shell desktop local com diagnóstico limitado que demonstre isolamento, ownership do perfil e viabilidade transacional do armazenamento antes de migrar funcionalidades.

## Requirements

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

### Requirement: Autorização e validação diagnóstica

O main SHALL autorizar o diagnóstico somente de webContents registrado/vivo, main frame vivo e documento/sessão corrente, com origem real e URL local exatas autorizadas e requisição versionada válida de até 1 KiB. Requisição não autorizada ou inválida SHALL ser recusada antes de qualquer efeito; execução diagnóstica concorrente SHALL retornar estado ocupado. A autorização SHALL ser revalidada antes da execução enfileirada e de respostas tardias.

#### Scenario: Requisição autorizada
- **WHEN** o main frame registrado na origem e documento/sessão autorizados envia uma requisição válida
- **THEN** o diagnóstico retorna resultado fechado e versionado da prova, sem dados sensíveis

#### Scenario: Remetente ou payload recusado
- **WHEN** a requisição vem de iframe, webContents desconhecido, frame navegado/removido, origem real ou URL diferente, sessão antiga, versão inválida, campos extras ou payload acima do limite
- **THEN** o main recusa a operação antes de acessar a prova persistida
- **AND** o resultado não revela stack, paths ou dados internos

#### Scenario: Diagnósticos concorrentes
- **WHEN** uma verificação está em andamento e chega outra requisição válida
- **THEN** a segunda recebe estado ocupado e não inicia outra transação
- **AND** esse gate diagnóstico não é usado para rejeitar indiscriminadamente a fila válida de estado de produto

#### Scenario: Documento muda durante diagnóstico
- **WHEN** há navegação/reload, crash ou fechamento depois da autorização, inclusive reload da mesma URL
- **THEN** a sessão anterior é invalidada e a prova não envia resposta sensível ao novo documento
- **AND** origem herdada ou URL semelhante não substitui a validação do main frame/documento/origem real

### Requirement: Recursos locais e navegação restrita

O aplicativo SHALL limitar recursos de produção aos assets empacotados e aplicar CSP restritiva, sem origem de desenvolvimento, scripts inline ou eval. Navegação externa, novas janelas, webviews e permissões não necessárias SHALL ser bloqueadas.

#### Scenario: Escape do resolvedor de recursos
- **WHEN** uma requisição tenta traversal, caminho absoluto, outro host ou escape por componente de filesystem
- **THEN** ela é recusada e nenhum arquivo fora dos assets autorizados é servido

#### Scenario: Tentativa de ampliar superfície
- **WHEN** o renderer tenta navegar para conteúdo externo, abrir janela/webview, pedir permissão ou executar script proibido pela CSP
- **THEN** a tentativa é bloqueada sem conceder autoridade adicional

#### Scenario: Pacote iniciado com configuração dev no ambiente
- **WHEN** variáveis de desenvolvimento existem ao iniciar o pacote normal
- **THEN** o aplicativo continua carregando apenas conteúdo local autorizado e não habilita origem remota ou devtools

### Requirement: Identidade e perfis independentes

O aplicativo SHALL manter identidade estável e dados próprios no perfil do usuário, separados da instalação e da extensão. Dados e sessão de dev, test e prod SHALL usar diretórios distintos; o lançamento normal instalado SHALL usar prod e ignorar overrides de desenvolvimento.

#### Scenario: Perfis não se contaminam
- **WHEN** o app é executado em desenvolvimento, smoke empacotado restrito e lançamento instalado normal
- **THEN** cada modo usa seu perfil declarado e não lê ou altera os marcadores dos demais
- **AND** não escreve dados/cache no diretório do executável nem no perfil Chrome

#### Scenario: Segunda conta Windows
- **WHEN** outra conta executa sua própria instalação
- **THEN** ela usa dados/sessão próprios e não altera a primeira conta

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

### Requirement: Prova transacional fictícia no runtime instalado

O diagnóstico SHALL criar, gravar e ler exclusivamente dados fictícios no banco da prova, verificar rollback e reabrir a conexão preservando o marcador confirmado. Ele SHALL executar no processo proprietário e falhar explicitamente se o armazenamento embarcado não funcionar, sem reset ou fallback silencioso.

#### Scenario: Ciclo transacional completo
- **WHEN** o usuário executa a prova no aplicativo instalado
- **THEN** criação/write/read, alteração revertida e reopen preservando o valor anterior são confirmados no runtime empacotado
- **AND** nova execução continua reconhecendo o marcador confirmado
- **AND** o diagnóstico fornece fingerprint opaco do marcador fictício para comprovar retenção, sem recriar/reescrever sua identidade em cada execução

#### Scenario: Falha de armazenamento ou abertura
- **WHEN** o armazenamento embarcado está indisponível ou o banco não pode ser aberto
- **THEN** o diagnóstico retorna falha, sem substituir o mecanismo ou apagar o banco
- **AND** libera recursos e permite nova tentativa depois de corrigida a causa

#### Scenario: Rollback induzido
- **WHEN** a transação de diagnóstico introduz alteração fictícia e sua falha prevista é induzida
- **THEN** leitura e reabertura confirmam somente o valor anterior, sem commit parcial
