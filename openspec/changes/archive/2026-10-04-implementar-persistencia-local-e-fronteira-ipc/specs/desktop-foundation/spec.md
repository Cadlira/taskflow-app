# Spec Delta

## MODIFIED Requirements

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem acesso livre a Node, filesystem, IPC ou sistema. A superfície SHALL expor somente verifyFoundation e as operações versionadas getStateSnapshot, subscribeState e unsubscribeState, sem canais, SQL, comandos, callbacks remotos, repositories ou caminhos arbitrários. Operações funcionais futuras SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente verifyFoundation e as três operações de leitura/subscriptions previstas estão expostas
- **AND** não há criar/editar/status, lixeira/undo funcionais, IA, clipboard, abertura externa ou outros recursos futuros

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

### Requirement: Ownership antes do armazenamento

Somente o processo proprietário do perfil SHALL abrir bancos de prova e produto. Uma segunda instância do mesmo perfil SHALL encerrar antes de abrir banco ou iniciar diagnóstico/estado; fechar a janela provisória SHALL fechar admissão, invalidar sessões, tratar unidades admitidas e liberar conexões antes de encerrar, sem forçar saída durante commit ativo.

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
- **THEN** novas entradas são recusadas, sessões/listeners são invalidados e unidades ativas terminam ou revertem antes de fechar conexão
- **AND** entradas ainda não iniciadas podem ser canceladas com erro seguro; nenhum sucesso/evento é emitido para documento encerrado
- **AND** interrupção forçada de processo é validada separadamente como crash, sem mudar o fechamento provisório para bandeja
