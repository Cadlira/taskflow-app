# Spec Delta

## Purpose

Oferecer três entradas globais personalizáveis com preferência durável, registro observado e alternativas acessíveis quando Windows ou conflitos impedirem o atalho.

## ADDED Requirements

### Requirement: Ações globais são finitas e independentes

Ações SHALL ser QUICK_ADD, OPEN_TASK_MANAGER e CAPTURE_CLIPBOARD. Sugestões iniciais SHALL ser Ctrl+Shift+K, Ctrl+Shift+L e sem atalho respectivamente. Registro SHALL exigir proprietário pronto; QUICK_ADD SHALL abrir sem capturar, CAPTURE_CLIPBOARD SHALL usar Quick Add. Botões/bandeja SHALL continuar disponíveis sem atalhos.

#### Scenario: Primeira execução e conflito
- **WHEN** usuário inicia app sem preferências ou Windows recusa K/L
- **THEN** ações têm defaults desejados K/L/null; conflito não bloqueia app e captura não ganha combinação implícita
- **AND** hint não apresenta sugestão recusada como ativa

### Requirement: Combinações personalizadas têm gramática fechada

Personalização SHALL permitir alterar/remover/restaurar default individual. Combo SHALL usar CTRL_SHIFT ou ALT_SHIFT e A–Z/0–9/F1–F24 exceto F4, com representação canônica e shape exato. Duplicatas internas, Win, Ctrl+Alt/AltGr e entradas fora da lista SHALL ser recusadas antes de efeitos. Editor SHALL ser operável por teclado.

#### Scenario: Customização e validação
- **WHEN** usuário escolhe combo válida, null, default ou entrada duplicada/proibida
- **THEN** válida segue fluxo verificável; proibida/duplicada conserva configuração anterior sem registrar ou gravar
- **AND** default em conflito não substitui configuração anterior como sucesso

### Requirement: Preferência e registro observado são distintos

UI SHALL mostrar desired e observed REGISTERED/NONE/UNAVAILABLE/UNKNOWN com razão segura. Somente registro próprio confirmado SHALL aparecer ativo. Falha/conflito SHALL não identificar app concorrente nem inventar rollback; indisponibilidade SHALL conservar caminho por botão e preferência compatível.

#### Scenario: Registro false ou throw
- **WHEN** Windows recusa registro, API lança falha ou verificação própria é inconclusiva
- **THEN** observed reflete CONFLICT/NATIVE_FAILURE/UNKNOWN e hint não inventa combinação ativa
- **AND** consulta própria não é apresentada como descoberta do dono externo

### Requirement: Preferências duráveis são versionadas e condicionais

Preferência SHALL ser local/versionada fora do backup e alterada por CAS. Missing SHALL usar defaults sem gravar; futura/corrupta/ilegível SHALL ser preservada e bloquear escrita/registro novo. Upgrade SHALL conservar escolha; downgrade SHALL não sobrescrever versão futura. Importar tarefas SHALL não alterar atalhos.

#### Scenario: Dois clientes e versão incompatível
- **WHEN** dois clientes alteram mesma revisão ou arquivo é futuro/corrupto
- **THEN** revisão stale recusa sem last-write-wins; incompatível informa indisponível e não é substituído por defaults

#### Scenario: Restart e retenção
- **WHEN** usuário confirma preferência e reinicia/atualiza/reinstala mantendo userData
- **THEN** preferência compatível retorna e registro é observado novamente, podendo estar em conflito; backup de tarefas não a transporta
- **AND** temporário/previous não se torna configuração ativa por recuperação silenciosa

### Requirement: Rebind e falha não fingem transação nativa

Troca SHALL validar/registrar provisoriamente nova combo antes de publicar preferência e liberar antiga somente após confirmação. Falha anterior comprovada SHALL conservar antiga e compensar provisória verificavelmente. Publicação/readback/cleanup incerto SHALL fechar callbacks da ação e mostrar UNKNOWN, sem replay ou rollback presumido.

#### Scenario: Registro novo falha
- **WHEN** rebind não registra nova combinação
- **THEN** antiga permanece ativa e preferência não muda

#### Scenario: Arquivo ou compensação falha
- **WHEN** write/flush/rename/readback/unregister falha em fase intermediária
- **THEN** estado confirmado ou UNKNOWN distingue desired/observed, conserva arquivos completos anteriores e não anuncia restauração sem prova
- **AND** ação incerta exige releitura/reconciliação explícita, sem repetição automática por timeout

#### Scenario: Desativar e perder resposta
- **WHEN** desativação ou restauração de default confirma parcialmente e resposta se perde
- **THEN** nova consulta observa revisão/registro sem reenviar setter; ausência de certeza bloqueia callbacks daquela ação

### Requirement: Gates e saída respeitam sessão e perfil

Callbacks SHALL ser impedidos durante suspensão/saída/edição ativa de combinação; lease de edição SHALL pertencer ao manager focado e terminar em blur/close/reload/crash. Fechar para bandeja SHALL manter atalhos do owner. Sair SHALL liberar registros próprios. Dev/test SHALL não registrar automaticamente e harness nativo SHALL ser opt-in isolado.

#### Scenario: Hidden versus suspend
- **WHEN** ambas janelas ficam ocultas ou PC suspende
- **THEN** hidden com tray permite atalho de recuperação; suspend bloqueia tentativas até reconciliação em resume

#### Scenario: Editor e encerramento
- **WHEN** combinação é editada e depois perde foco/sessão, ou Sair é solicitado
- **THEN** edição não dispara ações e lease não fica preso; Sair invalida callbacks e libera somente registros próprios

### Requirement: Evidência global exige Windows real

Validação SHALL distinguir testes puros/mocks/build de clipboard/foco/registro nativos. Produto Windows SHALL ser exercitado com outro app em foco, tray, conflito real, rebind/restart/liberação após Sair e teclado/zoom/DPI/leitor de tela. Ambiente ausente SHALL ser pendência explícita, sem aprovação inventada.

#### Scenario: Campanha isolada
- **WHEN** campanha usa dados/perfil fictícios e combinações dedicadas com app empacotado
- **THEN** evidência registra comportamento real e cleanup, sem alterar hotkeys do produto em uso ou origem extensão
- **AND** instalação corporativa/distribuição depende da autorização correspondente
