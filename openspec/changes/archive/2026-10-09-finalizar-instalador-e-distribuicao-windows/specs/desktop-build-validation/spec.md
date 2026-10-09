# Spec Delta

## MODIFIED Requirements

### Requirement: Conteúdo runtime restrito e completo

O pacote SHALL conter recursos necessários ao runtime, identidade aprovada e notices/licenças correspondentes. A inspeção completa do payload e a validação instalada SHALL comprovar recursos/arquitetura/hashes e que o SID de AppContainer recebe somente leitura/execução no diretório do app. O pacote SHALL excluir origem Git, segredos, dados reais, configuração pessoal, scaffold Chrome, dependências somente de build e capacidades de elevação/atualização não previstas.

#### Scenario: Inventário do pacote
- **WHEN** o artefato e seus manifests/assets/armazenamento são inspecionados
- **THEN** os recursos runtime necessários e notices estão presentes e correspondem à arquitetura/versões aprovadas
- **AND** não há `.git`, `.env`, dados reais, WXT, bridge genérica, updater, addon externo ou elevate helper

#### Scenario: ACL do runtime empacotado e instalado
- **WHEN** Setup instala o pacote no root per-user aprovado
- **THEN** o sandbox do Electron pode ler/executar somente binários do diretório instalado por meio da ACE aprovada
- **AND** a ACL não se propaga à Known Folder pai nem à raiz de dados

#### Scenario: Cobertura integral do payload
- **WHEN** o candidato é inspecionado antes da campanha e após a instalação autorizada
- **THEN** todo o conteúdo entregue, incluindo arquivos externos ao ASAR, resources e entradas internas/unpacked, tem classificação, tamanho/hash e origem no inventário
- **AND** bytes de exe/ASAR/recursos correspondem ao manifesto; recursos gerados pelo Setup são identificados separadamente
- **AND** entrada desconhecida, escape por symlink/reparse ou recurso ausente reprova, sem limitar inspeção a nomes sob out

#### Scenario: Notices de código incorporado
- **WHEN** bibliotecas ou recursos são incorporados ao runtime, inclusive bundles de dependências declaradas como dev
- **THEN** versões/origens/licenças e notices/copyrights exigidos pelos componentes distribuídos estão presentes e ligados ao inventário
- **AND** notices ausentes, incompletos ou divergentes reprovam; classificação de dependency não substitui revisão do payload

#### Scenario: Arquivo ou conteúdo fictício proibido
- **WHEN** uma cópia de teste contém arquivo externo inesperado, mapa/fixture indevido ou sentinela fictícia de segredo/dados/configuração sob nome aparentemente permitido
- **THEN** inspeção reprova com motivo sanitizado sem imprimir conteúdo sensível
- **AND** o relatório distingue verificação automatizada, revisão do inventário e limites da análise, sem certificar ausência universal de segredos por nomes

#### Scenario: Diagnóstico permitido não é acesso de produção
- **WHEN** código diagnóstico inventariado está presente no bundle e o app abre em prod
- **THEN** produção não admite sua ativação ou acesso a perfil/path arbitrário
- **AND** renderer/preloads conservam sandbox, isolamento, CSP e catálogo autorizado 43/14, sem bridge genérica

#### Scenario: Componente do Windows indisponível
- **WHEN** componente do SO exigido por instalação ou integração nativa está indisponível/bloqueado
- **THEN** operação afetada reporta falha ou indisponibilidade segura sem instalar runtime adicional, elevar, desativar sandbox ou contornar política
- **AND** limitações offline são registradas sem alegar sucesso da integração afetada

### Requirement: CI produz artefatos internos sem distribuir

CI Windows SHALL usar toolchain/lockfile fixados, actions por SHA, permissões mínimas e gates pertinentes. Artefatos de revisão SHALL identificar versão/arquitetura/commit/run, payload e SHA-256 finais, retenção finita e acesso efetivo do repositório, sem publicação de release, auto-update, contratação/segredo de assinatura ou execução automática de instalador. A seleção SHALL ser exata e não ambígua.

#### Scenario: Run de revisão
- **WHEN** CI executa para uma alteração do app
- **THEN** registra gates e disponibiliza Setup/inventário/manifests/relatórios de revisão com hash, sem publicar release ou executar Setup

#### Scenario: Limite de CI documentado
- **WHEN** gates/smoke passam em runner Windows administrador
- **THEN** o relatório informa que instalação em conta padrão e UAC não foram comprovados por esse run

#### Scenario: Bundle de revisão rastreável
- **WHEN** um run produz candidato válido
- **THEN** o artifact identifica versão, arquitetura e commit/run e inclui somente Setup exato, manifesto, inventário/notices/manifests e resultados sanitizados previstos
- **AND** acesso/retenção e eventuais custos seguem o repositório/plano real, sem presumir privacidade ou gratuidade por configuração npm
- **AND** logs brutos de build/configuração pessoal não são publicados como material de distribuição

#### Scenario: Seleção ausente ou ambígua
- **WHEN** o Setup esperado está ausente, duplicado ou diverge de versão/arquitetura/hash do manifesto
- **THEN** o job falha sem escolher primeiro glob ou enviar pacote histórico como candidato atual

### Requirement: Aceitação independente em conta padrão

A fundação e o produto completo SHALL exigir evidências em ambiente Windows autorizado, conta fora de Administrators e UAC ativo: instalação offline, exe/atalho instalado, isolamento, argumentos/destinos, segunda instância/conta, upgrade e uninstall/reinstalação com retenção. A campanha final SHALL vincular W01–W15 ao candidato exato e distinguir provas anteriores, dispensas e resultados atuais. Evidência SHALL usar dados fictícios e ser sanitizada.

#### Scenario: Matriz padrão completa
- **WHEN** F01–F09 são executados no ambiente aprovado e os resultados observáveis atendem às specs
- **THEN** o relatório registra build/hash/OS/arquitetura, estado da conta/UAC, resultados por cenário e limitações
- **AND** distingue instalação comprovada de funcionalidades futuras ainda não testadas

#### Scenario: Ambiente ou execução bloqueados
- **WHEN** faltar ambiente autorizado ou a política do SO/organização impedir execução
- **THEN** os cenários afetados ficam BLOCKED/pendentes com causa registrada, sem bypass ou alegação de aceitação

#### Scenario: Proteção da origem e dos dados
- **WHEN** a validação recolhe logs, screenshots e snapshots ou consulta a extensão
- **THEN** usa apenas dados fictícios/evidências sanitizadas e consulta a extensão sem alteração, build, teste ou instalação nela

#### Scenario: Campanha do produto final
- **WHEN** W01–W15 são executados ou avaliados para fechamento
- **THEN** cada caso/subcaso tem esperado/observado, timestamp, PASS/FAIL/BLOCKED/NOT_RUN ou dispensa humana explícita, ligado ao hash/versão/commit do candidato
- **AND** ambiente registra OS/build/arquitetura, conta padrão/token não elevado/UAC ativo e coerência dos roots, sem confiar somente em USERNAME ou variáveis herdadas
- **AND** dados fictícios e caminhos com espaços/Unicode são usados; segunda conta e eventos reais dependem de autorização do ambiente e sua ausência permanece pendente/dispensada para revisão

#### Scenario: Prova anterior ou simulada
- **WHEN** uma evidência deriva da fundação, versão antiga, mock, runner administrador ou simulação de logoff
- **THEN** sua origem e limites ficam explícitos e ela não é anunciada como execução do candidato final em conta padrão
- **AND** dispensas históricas não são reabertas nem herdadas como PASS da campanha atual

#### Scenario: Candidato alterado depois da campanha
- **WHEN** versão, payload, configuração relevante ou assinatura muda depois das verificações
- **THEN** o novo hash é registrado e verificações afetadas são refeitas antes de alegar readiness

## ADDED Requirements

### Requirement: Artefato tem identificação e proveniência verificáveis

Build local e CI SHALL selecionar exatamente o candidato aprovado, em área de saída isolada, vinculando versão/arquitetura/commit/origem/toolchain/lockfile/checksums e filenames/tamanhos/SHA-256 finais. Identidade e versão de package, runtime, binários e Setup SHALL concordar. Evidência instalada SHALL corresponder aos bytes identificados, sem promessa de Setup byte-a-byte determinístico.

#### Scenario: Construção rastreável
- **WHEN** um candidato é construído em ambiente limpo autorizado
- **THEN** manifesto registra versão, commit/estado da fonte, run/origem, toolchain/runtime/SQLite/NSIS, lockfile e checksums resolvidos, inventário/notices, assinatura, nomes relativos/tamanhos/hashes finais
- **AND** nomes externos diferenciam versão/arquitetura/commit/run sem renomear identidade técnica instalada

#### Scenario: Saída reutilizada contém versões antigas
- **WHEN** artefatos históricos coexistem fora do staging do build
- **THEN** seleção exata não os usa nem os apaga indiscriminadamente e falha se houver ambiguidade no candidato esperado
- **AND** 0.1.1 histórico da fundação não serve como sucessor do produto completo

#### Scenario: Par de manutenção do produto
- **WHEN** a campanha prepara upgrade
- **THEN** identifica duas versões completas distintas e compatíveis aprovadas, seus commits/hashes e guarda segura do predecessor
- **AND** não trata nome/versão como prova suficiente nem substitui pacote testado por outros bytes com o mesmo nome

#### Scenario: Integridade alterada
- **WHEN** Setup, exe, ASAR ou recurso esperado diverge do manifesto confiável
- **THEN** verificação falha e o pacote não é anunciado como validado/instalável

#### Scenario: Reconstrução funcional
- **WHEN** build é repetido a partir de fonte/lock/toolchain identificados
- **THEN** inventários e payload funcional são comparados e divergências de timestamp/metadados/assinatura são declaradas
- **AND** não se promete igualdade binária do Setup sem prova específica

### Requirement: Identidade visual é conservada no pacote final

O pacote SHALL conservar ícones aprovados do produto no exe, Setup, uninstaller e recursos runtime, com resolução coerente em atalhos/bandeja/notificações. Ausência ou recurso inválido SHALL reprovar a inspeção. A aceitação visual SHALL registrar temas e DPI testados, sem redesign ou alegação a partir da geração do arquivo.

#### Scenario: Ícones íntegros e legíveis
- **WHEN** recursos são inspecionados e o candidato instalado é observado nos temas claro/escuro e DPI 100/150/200%
- **THEN** mantém a identidade aprovada e apresenta ícones legíveis no exe/Setup/uninstaller/atalho/tray/toast
- **AND** o relatório separa integridade do recurso da prova visual executada

#### Scenario: Ícone ausente ou inválido
- **WHEN** um recurso esperado está ausente, corrompido ou diverge do master/derivação aprovada
- **THEN** a inspeção reprova com erro verificável, sem declarar integração visual concluída

### Requirement: Integrações nativas são provadas no candidato instalado

A campanha final SHALL verificar as integrações de tray, Quick Add/captura explícita, atalhos, segunda instância, notificações/ativação e startup no hash instalado, com dados fictícios e contratos existentes. Resultados humanos/nativos SHALL ser distintos de smoke/mock; falta de ambiente SHALL permanecer pendente. A campanha SHALL limitar-se às rotas de distribuição, sem substituir homologação integral de paridade.

#### Scenario: Bandeja captura e atalhos reais
- **WHEN** o app instalado fecha pelo X e o usuário usa tray, Quick Add, cópia explícita e atalhos com outra aplicação em foco
- **THEN** o processo continua na bandeja, ações roteiam conforme contratos e conflito/rebind/restart preservam preferências
- **AND** Sair libera atalhos/processo; não há captura contínua ou leitura automática de abas

#### Scenario: Segunda instância e ativação de toast
- **WHEN** um segundo lançamento ocorre e uma notificação real é clicada
- **THEN** há um único escritor por perfil e ativação COM/relay localiza a tarefa no owner conforme contrato
- **AND** não resta processo relay próprio após a operação/Sair

#### Scenario: Inicialização opcional no login
- **WHEN** usuário opta por ligar/desligar startup ou o Windows o desabilita externamente
- **THEN** readback confirma estado/caminho/argumento próprios sem reativação automática
- **AND** logoff/login real é provado somente no ambiente autorizado; simulação é identificada separadamente

### Requirement: Entrega manual tem guia e estado de assinatura verdadeiros

A documentação SHALL registrar público/identidade legal, alvo/builds comprovados, versão, origem/verificação do candidato, assinatura, retenção e limites aprovados. SHALL orientar instalar, abrir, Sair, atualizar, desinstalar/reinstalar e recuperar sem bypass de políticas. Entrega/publicação e contratação de assinatura SHALL exigir autorização própria; artefatos de revisão não equivalem a release.

#### Scenario: Guia operacional fiel
- **WHEN** o usuário consulta o guia do candidato
- **THEN** encontra verificação de origem/versão/arquitetura/hash, precondições offline/per-user/componentes do SO e instruções de instalação/abertura/Sair/manutenção
- **AND** encontra política de retenção/exclusão manual/backup só de tarefas/recuperação seletiva, IA opcional, limites de lembretes e incompatibilidade legada/downgrade

#### Scenario: Candidato não assinado
- **WHEN** a revisão aprova unsigned para público/ambiente controlados
- **THEN** manifesto/guia informam estado não assinado e possíveis bloqueios de Windows/empresa sem prometer confiança por hash
- **AND** não instruem contorno de política ou instalação de certificado de confiança

#### Scenario: Assinatura passa a ser exigida
- **WHEN** o público/política exige assinatura
- **THEN** essa decisão é submetida à revisão de escopo/configuração/tasks e autorização própria antes de contratação/segredos/assinatura
- **AND** aceitação exige exe/Setup/uninstaller, cadeia/publisher esperado/timestamp e hash final pós-assinatura, sem garantia de SmartScreen ou permissão corporativa

#### Scenario: Revisão não é publicação
- **WHEN** os artefatos de revisão ficam prontos
- **THEN** não ocorre Setup automático, release, auto-update ou entrega pública por inferência
- **AND** decisões materiais e cenários não comprovados continuam visíveis para revisão humana
