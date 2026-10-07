# desktop-ai-providers Specification

## Purpose

Definir como o usuário configura um provedor de IA com credencial própria no desktop, como a credencial é protegida e autorizada por origem no processo main, e como a conexão é verificada sem enviar conteúdo de tarefa e sem nenhuma requisição automática.

## Requirements

### Requirement: Área de provedores opcional e sem efeito quando vazia

O manager SHALL oferecer uma área de provedores de IA; o Quick Add não SHALL oferecer configuração nem assistência. Enquanto não houver configuração salva, o sistema SHALL se comportar como antes desta capability: nenhuma requisição de rede, nenhum trabalho novo na inicialização e nenhuma alteração nos fluxos de tarefa, captura, atalhos, lembretes, backup ou lixeira.

#### Scenario: Instalação sem configuração de IA
- **WHEN** o usuário usa o app sem nenhum provedor salvo
- **THEN** nenhuma requisição de rede é realizada e nenhum fluxo existente muda

#### Scenario: Acesso e resumo da área
- **WHEN** o usuário abre a área de provedores no manager
- **THEN** o sistema apresenta o estado atual ou nenhum provedor configurado, informa que a IA é opcional e entrega somente resumo sem segredo

#### Scenario: Quick Add sem IA
- **WHEN** o usuário abre o Quick Add
- **THEN** nenhuma ação de IA ou de configuração é apresentada

### Requirement: Seleção de provedor e base da API

O sistema SHALL admitir exatamente `OPENAI`, `ANTHROPIC` e `CUSTOM`. Para os oficiais a base SHALL ser fixa, definida pelo app, sem campo editável. Para `CUSTOM` a base SHALL ser informada e SHALL usar o protocolo compatível com OpenAI, cobrindo servidores locais. O sistema SHALL manter no máximo uma configuração ativa; salvar SHALL substituir a anterior por completo, condicionado à revisão esperada.

#### Scenario: Provedor oficial sem campo de base
- **WHEN** o usuário seleciona `OPENAI` ou `ANTHROPIC`
- **THEN** o sistema não oferece campo de base e exibe a base fixa que será usada

#### Scenario: Customizado exige base
- **WHEN** o usuário tenta salvar `CUSTOM` sem base
- **THEN** a gravação é recusada com indicação do campo e a configuração anterior permanece

#### Scenario: Substituição e conflito de revisão
- **WHEN** o usuário salva outra configuração com a revisão esperada atual
- **THEN** a configuração anterior é substituída por completo
- **AND** revisão esperada antiga é recusada sem sobrescrever nada

### Requirement: Validação da base informada e origem resolvida

Para `CUSTOM`, a base SHALL ser aceita somente como URL absoluta `https`, ou `http` exclusivamente para `localhost`, `127.0.0.1` e `[::1]`, sem userinfo, query ou fragmento, com caminho permitido e barra final normalizada. Antes do primeiro envio, a origem resolvida SHALL ser apresentada em destaque.

#### Scenario: Base remota sem TLS recusada
- **WHEN** o usuário informa base `http` remota
- **THEN** o sistema recusa e explica que endereços remotos exigem `https`

#### Scenario: Loopback aceito
- **WHEN** o usuário informa `http://localhost:11434/v1`
- **THEN** a base é aceita porque o tráfego não deixa o dispositivo

#### Scenario: Credenciais, consulta e fragmento recusados
- **WHEN** a base contém userinfo, query ou fragmento
- **THEN** o sistema recusa com motivo específico sem gravar

#### Scenario: Origem apresentada antes do envio
- **WHEN** a configuração está pronta para salvar ou testar
- **THEN** a origem resolvida para onde as requisições irão é exibida

### Requirement: Credencial persistida com proteção nativa e sem plaintext

A configuração SHALL ser persistida em arquivo próprio e versionado no `userData`, com a credencial cifrada pelo mecanismo nativo do sistema e publicação atômica no padrão das preferências de atalhos. A credencial não SHALL ser cifrada com material guardado junto dela nem gravada em texto simples. Quando a proteção não estiver disponível, gravar e usar SHALL ser bloqueados; quando a decifra falhar, o arquivo SHALL ser preservado e o uso bloqueado, restando somente a remoção explícita.

#### Scenario: Gravação cifrada
- **WHEN** o usuário salva uma configuração com credencial
- **THEN** somente o arquivo de configuração é gravado, com a credencial cifrada e envelope versionado

#### Scenario: Proteção indisponível
- **WHEN** o mecanismo de proteção não está disponível
- **THEN** salvar e usar são recusados com estado bloqueado e nenhuma gravação em texto simples é feita

#### Scenario: Decifra falha
- **WHEN** a credencial não pode ser decifrada no perfil atual
- **THEN** o sistema bloqueia o uso, preserva o arquivo e oferece somente a remoção

#### Scenario: Reabertura não expõe a credencial
- **WHEN** a área é reaberta com configuração salva
- **THEN** o campo de credencial não contém o valor armazenado e existe marca irreconstruível de credencial salva
- **AND** alterar somente base/modelo preserva a credencial intocada

### Requirement: Credencial fora de renderer, logs e backups

A credencial e a configuração de provedor não SHALL chegar ao renderer por leitura, não SHALL aparecer em mensagens, erros ou logs, e não SHALL ser incluída em backup, restauração ou importação. Falhas SHALL ser apresentadas como motivos de conjunto fechado, com no máximo origem e código de estado, jamais URL completa, cabeçalhos ou corpo do provedor.

#### Scenario: Exportação com credencial configurada
- **WHEN** o usuário exporta backup com provedor configurado
- **THEN** o arquivo não contém credencial, modelo, base nem nome do arquivo de configuração

#### Scenario: Restauração preserva a configuração
- **WHEN** um backup válido é restaurado
- **THEN** as tarefas são substituídas e a configuração de provedor permanece exatamente como estava
- **AND** arquivo sem configuração de IA não cria nenhuma

#### Scenario: Erro com corpo contendo a chave
- **WHEN** o provedor responde 401 com corpo que ecoa trecho da credencial
- **THEN** o sistema apresenta motivo de credencial inválida sem transportar nem registrar o corpo

### Requirement: Consentimento e autorização de credencial por origem

O envio da credencial SHALL exigir consentimento explícito do usuário, vinculado a origem, provedor, base e revisão da configuração, registrado no main por documento e somente em memória. Trocar provedor ou base e salvar/remover a configuração SHALL exigir novo consentimento; remover SHALL revogar. Sem consentimento vigente, nenhuma requisição SHALL ser feita.

#### Scenario: Aviso antes do primeiro teste
- **WHEN** o usuário aciona o teste pela primeira vez para a origem configurada
- **THEN** o sistema informa que a credencial será enviada àquela origem e só prossegue após ação explícita

#### Scenario: Troca de origem reexige
- **WHEN** o provedor ou a base passa a apontar para outra origem e o teste é acionado
- **THEN** o aviso é reapresentado antes do envio

#### Scenario: Remoção revoga
- **WHEN** o usuário remove a configuração
- **THEN** credencial e consentimentos da origem são apagados e nenhum acesso permanece

### Requirement: Teste de conexão sem conteúdo de tarefa

O teste SHALL ser executado somente por acionamento direto do usuário, consultando a listagem de modelos sem enviar conteúdo de tarefa. Quando a listagem não estiver disponível, o sistema SHALL informar e oferecer, como alternativa explícita, um envio mínimo com conteúdo literal fixo e um token de resposta. O teste SHALL ter limite de tempo e SHALL ser cancelável; redirecionamentos não SHALL ser seguidos e resposta 3xx observada SHALL ser recusada.

#### Scenario: Sucesso
- **WHEN** a configuração é válida e o usuário aciona o teste
- **THEN** a listagem é consultada sem conteúdo de tarefa e o sucesso é informado

#### Scenario: Listagem indisponível
- **WHEN** o teste obtém recurso inexistente na listagem
- **THEN** o sistema informa a ausência e oferece o envio mínimo explícito

#### Scenario: Tempo esgotado e cancelamento
- **WHEN** a origem não responde ou o usuário cancela
- **THEN** a requisição é abortada, o motivo é informado e a configuração permanece inalterada

#### Scenario: Redirecionamento recusado
- **WHEN** a origem responde com redirecionamento
- **THEN** o sistema não segue e informa resposta inesperada

### Requirement: Nenhuma requisição de IA automática e contrato por provedor

O sistema não SHALL contatar provedor fora de acionamento direto do usuário — nem na inicialização, na abertura de áreas, na leitura de estado ou por agendamento. `OPENAI` e `CUSTOM` SHALL autenticar por portador no protocolo compatível com OpenAI; `ANTHROPIC` SHALL usar cabeçalho de chave próprio e versão da API. Nenhuma requisição SHALL partir do renderer.

#### Scenario: Inicialização e leitura não contatam provedor
- **WHEN** o app inicia, a área de provedores abre ou o estado é lido com configuração e consentimento vigentes
- **THEN** nenhuma requisição ao provedor é realizada

#### Scenario: Autenticação por provedor
- **WHEN** o sistema emite requisição de teste
- **THEN** `OPENAI`/`CUSTOM` autenticam por portador e `ANTHROPIC` por chave própria com versão da API
- **AND** nenhuma requisição parte do renderer sandboxed
