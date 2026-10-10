# desktop-build-validation Specification

## Purpose
Tornar a fundação verificável por instalação reproduzível de dependências, gates automatizados, inspeção e execução do pacote, complementadas por prova Windows em conta padrão.

## Requirements

### Requirement: Toolchain e dependências reproduzíveis

O projeto SHALL declarar versões exatas de Node/npm e dependências diretas, lockfile próprio e inventário de engines/peers/licenças e binários resolvidos. Instalação limpa SHALL usar o lockfile sem forçar conflitos; incompatibilidade de tooling/driver SHALL bloquear o avanço sem substituição silenciosa.

#### Scenario: Ambiente de build limpo
- **WHEN** um ambiente autorizado com Node/npm fixados instala pelo lockfile
- **THEN** resolve as dependências previstas sem force/legacy-peer-deps e registra versões/origens/licenças

#### Scenario: Matriz inviável
- **WHEN** houver conflito de peers, binário indisponível, ABI incompatível ou licença/vulnerabilidade impeditiva
- **THEN** o resultado é falha/bloqueio documentado e a matriz é submetida à revisão antes de trocar versões/driver

### Requirement: Gates bloqueiam pacote inválido

O projeto SHALL oferecer gates de lint, typecheck estrito, testes, build, empacotamento Windows e inspeção/smoke do pacote. Falha em qualquer gate SHALL interromper a conclusão e os resultados SHALL distinguir o que foi executado do que permanece pendente.

#### Scenario: Pipeline aprovado
- **WHEN** todos os gates são executados com sucesso
- **THEN** o relatório identifica comandos, versões, resultados e hash do pacote inspecionado/executado
- **AND** não declara prova de conta padrão a partir desses gates

#### Scenario: Gate reprovado
- **WHEN** typecheck, teste, build, inspeção ou smoke falha
- **THEN** o processo retorna falha e não marca a fundação validada

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

### Requirement: Smoke executa integração do pacote

O smoke SHALL iniciar o executável empacotado fora do diretório de desenvolvimento, usando perfil de teste separado e timeout, e confirmar renderer, preload, IPC autorizado e prova SQLite reais. Crash, timeout ou resultado incompleto SHALL falhar; limpeza SHALL limitar-se aos recursos de teste criados.

#### Scenario: Integração e reabertura reais
- **WHEN** o smoke inicia e reinicia o binário empacotado em cwd externo
- **THEN** a janela local/preload carregam, o diagnóstico autorizado completa write/read/rollback/reopen e o marcador persiste no perfil test
- **AND** cada processo encerra com código/resultados verificáveis sem alterar prod

#### Scenario: Preload ausente, armazenamento inválido ou hang
- **WHEN** preload/IPC/armazenamento falha ou o processo excede o timeout declarado
- **THEN** o smoke reprova, recolhe erro sanitizado e encerra somente os processos/recursos que criou
- **AND** abrir janela ou gerar build não basta para PASS

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

Campanha em conta padrão, quando autorizada, SHALL comprovar Windows, conta fora de Administrators e UAC ativo. A campanha TFA-012 SHALL usar somente a conta atual, sem exigir VM, outra conta ou nova prova de conta padrão, conforme dispensa explícita. Provas F/W/H SHALL vincular candidato e efeitos autorizados, distinguindo origem, execução e limite, com dados fictícios sanitizados.

#### Scenario: Matriz padrão completa
- **WHEN** F01–F09 são executados em conta padrão especificamente autorizada e atendem às specs
- **THEN** relatório registra build/hash/OS/arquitetura, estado da conta/UAC, resultados e limitações
- **AND** distingue instalação comprovada de funcionalidades futuras; sua existência histórica não exige repetir essa campanha na TFA-012

#### Scenario: Ambiente ou execução bloqueados
- **WHEN** faltar ambiente/autorização ou política impedir uma execução dentro do escopo selecionado
- **THEN** casos afetados ficam BLOCKED/NOT_RUN com causa e alcance registrados, sem bypass ou alegação de aceitação
- **AND** ausência de VM/segunda conta/nova prova padrão já dispensadas não é transformada em exigência da TFA-012

#### Scenario: Proteção da origem e dos dados
- **WHEN** validação recolhe logs, screenshots e snapshots ou consulta a extensão
- **THEN** usa apenas dados fictícios/evidências sanitizadas e consulta extensão sem alteração, build, teste ou instalação nela

#### Scenario: Campanha do produto final
- **WHEN** W01–W15 e H01–H16 são executados ou avaliados para fechamento
- **THEN** cada caso/subcaso possui esperado/observado, timestamp, PASS/FAIL/BLOCKED/NOT_RUN/DISPENSADO ligado a versão/commit/hash e camada/método
- **AND** ambiente registra OS/build/arquitetura, conta atual sem identificadores pessoais e roots autorizados, sem inferir conta padrão/UAC apenas por USERNAME, CI ou asInvoker
- **AND** espaços/Unicode por conta, segunda conta e eventos reais não disponíveis permanecem fora da cobertura comprovada; dispensas específicas e seus impactos são registrados

#### Scenario: Prova anterior ou simulada
- **WHEN** evidência deriva da fundação, versão antiga, mock, runner administrador ou simulação de logoff
- **THEN** origem/limites são explícitos e ela não é anunciada como execução atual em conta padrão
- **AND** dispensas históricas não são reabertas nem herdadas como PASS atual

#### Scenario: Candidato alterado depois da campanha
- **WHEN** versão, payload, configuração relevante ou assinatura muda depois das verificações
- **THEN** novo hash é registrado e verificações afetadas são refeitas antes de alegar prontidão

#### Scenario: Decisão de usar somente esta conta
- **WHEN** campanha aplica a decisão humana da TFA-012 de usar apenas a conta atual
- **THEN** não cria usuário/VM, não exige prova fora de Administrators/segunda conta e registra essas parcelas DISPENSADAS e não comprovadas no candidato
- **AND** isso não dispensa automaticamente gates funcionais atuais nem autoriza dados pessoais, efeitos no ambiente ou publicação

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

A campanha SHALL vincular provas de tray, entradas, atalhos, segunda instância, notificação/ativação e startup aos bytes instalados, perfil e efeitos autorizados. Provas humanas/nativas SHALL distinguir smoke/mock e perfil sem capacidade nativa. Falta de prova SHALL limitar a alegação e conservar pendência/dispensa explícita, sem reexigir campanhas históricas; roteiros de distribuição não substituem homologação de paridade.

#### Scenario: Bandeja captura e atalhos reais
- **WHEN** app instalado fecha pelo X e usuário usa tray, Quick Add, cópia explícita e atalhos com outra aplicação em foco
- **THEN** processo continua na bandeja, ações seguem contratos e conflito/rebind/restart preservam preferências
- **AND** Sair libera atalhos/processo; não há captura contínua ou leitura automática de abas

#### Scenario: Segunda instância e ativação de toast
- **WHEN** segundo lançamento ocorre e notificação real é clicada em perfil instalado com capacidade nativa autorizada
- **THEN** há único escritor por perfil e ativação localiza a tarefa no owner pelas rotas existentes
- **AND** não resta relay próprio após operação/Sair; toast falso ou chamada aceita sem clique não comprova exibição/ativação do Windows

#### Scenario: Inicialização opcional no login
- **WHEN** usuário autorizado liga/desliga startup ou Windows o desabilita externamente
- **THEN** readback confirma estado/caminho/argumento próprios sem reativação automática
- **AND** logoff/login real somente é alegado quando executado; simulação permanece distinta e nova campanha real não é exigida na TFA-012

#### Scenario: Perfil test em executável instalado
- **WHEN** exe instalado executa jornada em perfil test ou com adapters fictícios
- **THEN** relatório declara bytes/caminho instalado, perfil e mocks, comprovando somente UI/IPC/SQLite/arquivos/efeitos realmente exercitados
- **AND** notificação fictícia, ausência de identidade/COM/startup prod ou atalhos opt-in de harness não viram PASS nativo de produção

#### Scenario: Perfil prod ou efeito do ambiente não autorizado
- **WHEN** perfil exclusivamente fictício ou autorização de operação nativa/manutenção/suspensão/rede/startup não é confirmada
- **THEN** parcela permanece BLOCKED/NOT_RUN com limitação e nenhum conteúdo pessoal é lido/semeado/mantido/apagado
- **AND** não adiciona canal/hook de teste em produção, altera identidade/roots ou cria outra conta para contornar o limite

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

### Requirement: Homologação rastreia jornadas de paridade integradas

A homologação SHALL ligar cada item P01–P14 a requisitos/cenários vigentes, critérios das dependências, jornadas H01–H16 e evidências do candidato. Resultado SHALL informar esperado/observado, passos, ambiente, perfil, bytes e camada/método de prova. Ausência, falha, dispensa e relato SHALL permanecer distintos de PASS executado.

#### Scenario: Cobertura completa da matriz
- **WHEN** a campanha prepara ou conclui sua matriz
- **THEN** todos P01–P14 e H01–H16 possuem rastreio, resultado e limite por subcaso, incluindo campos/consultas, série/checklist, lixeira/undo, backup, lembretes, entradas, IA, acessibilidade e identidade
- **AND** referências G/R/S/U/I/C/V/L/B/M/Q/AI/F/W incluem a Change de origem para evitar colisão entre IDs e distinguem critérios históricos superados

#### Scenario: Fluxo entre funcionalidades preserva dados
- **WHEN** uma jornada cria série com subtarefas/OFFSET, conclui/desfaz, exclui/restaura, exporta/importa e reabre o estado confirmado
- **THEN** oráculos conferem todos os campos conhecidos, IDs/ordens/markers, unicidade da portadora, tarefas/trash e revisões, sem geração duplicada ou perda silenciosa
- **AND** conflito, alteração da gerada ou base de backup antiga recusam a unidade inteira; importação APPLIED/UNCHANGED invalida transientes de todas as superfícies

#### Scenario: Camadas e métodos não se substituem
- **WHEN** resultado vem de domínio/DOM/IPC, pacote, instalado, gesto humano, mock, injeção, simulação ou relato
- **THEN** registra separadamente camada e método, com PASS/FAIL/NOT_RUN/BLOCKED/DISPENSADO e vínculo ao candidato quando executado
- **AND** build, smoke, schema válido, kill ou relato genérico não comprovam instalação, energia, diálogo, foco externo ou integração Windows que não foram observados

#### Scenario: Evidência pertence a outro candidato
- **WHEN** relatório usa prova da fundação, par anterior ou build com fonte suja
- **THEN** conserva-a como referência histórica e não a contabiliza como execução do novo candidato de fonte limpa
- **AND** mudança de bytes/configuração relevante invalida a conclusão afetada e exige nova prova para a alegação correspondente

### Requirement: Fixtures e falhas de homologação preservam perfis e dados

A campanha SHALL usar somente conteúdo/URLs/credenciais fictícios e destinos de prova identificados, com autorização compatível com os efeitos. Recusa, corrupção, versão futura e falha incerta SHALL preservar dados e exigir reconciliação apropriada, sem reset/replay. Evidências SHALL excluir dados pessoais, segredos e conteúdo enviado à IA.

#### Scenario: Destino pessoal ou origem protegida
- **WHEN** uma operação de prova não demonstra que seu destino é fixture própria autorizada ou que o perfil é exclusivamente fictício
- **THEN** não inicia leitura de conteúdo, semeadura, manutenção, kill ou limpeza naquele destino e registra BLOCKED/NOT_RUN para a parcela
- **AND** extensão e seu Git permanecem somente leitura, sem testes/builds/instalação/escrita nela; clipboard humano começa com valor fictício copiado explicitamente

#### Scenario: Banco ou configuração incompatível
- **WHEN** fixture contém arquivo existente vazio, corrupção, versão futura ou formato estranho
- **THEN** abertura/operação bloqueia de forma segura, bytes anteriores permanecem preservados e erro não é apresentado como coleção vazia
- **AND** reparo de binários não é reparo de dados; importação normal ou exclusão de banco/auxiliares não contorna o bloqueio

#### Scenario: Escrita concorrente ou interrompida
- **WHEN** lock, readonly, SQLITE_FULL controlado, falha entre writes, COMMIT/ROLLBACK incerto ou resposta perdida é exercitado em fixture
- **THEN** reopen encontra anterior ou novo estado inteiro, commit confirmado não vira rollback anunciado e resultado incerto bloqueia até reconciliação sem replay
- **AND** falha/injeção/kill têm método e fase registrados; processo encerrado pertence ao teste, sem encher disco físico ou alegar prova de energia

#### Scenario: IA e evidência sanitizadas
- **WHEN** campanha cobre provedores/sugestões e recolhe arquivos, logs ou imagens
- **THEN** usa mocks ou loopback sem provedor pago, distingue proteção fictícia de proteção nativa e registra somente resultado seguro
- **AND** não exporta credencial/ciphertext/conteúdo de IA ou dados pessoais; ausência de IA/rede não impede tarefas locais e nenhuma sugestão salva automaticamente

### Requirement: Relatório de prontidão delimita alcance e publicação

A conclusão SHALL separar cobertura limitada, prontidão local no escopo comprovado e autorização de distribuição. SHALL exigir rastreio completo, gates aplicáveis, diferenças explícitas e ausência de crítico de dados/segurança/envio indevido. Relatório de verify SHALL ser revisto e aprovado explicitamente antes de archive; revisão não autoriza release.

#### Scenario: Prontidão no ambiente comprovado
- **WHEN** gates do candidato limpo passam, jornadas aplicáveis possuem evidência adequada e diferenças estão revisadas sem crítico aberto
- **THEN** relatório identifica precisamente o alcance comprovado e as lacunas, com guias/matriz coerentes com esses resultados
- **AND** não estende suporte a outra conta/Windows, alegação nativa não executada ou provedor real; não chama somente build de paridade

#### Scenario: Falha ou parcela não comprovada
- **WHEN** há gate reprovado, crítico ou subcaso BLOCKED/NOT_RUN/dispensado
- **THEN** registra impacto; gate reprovado/crítico impede prontidão, e falta de prova limita a alegação correspondente
- **AND** dispensa antiga não vira PASS nem obriga rerun histórico; eventual aceite da limitação atual fica explícito na revisão, sem apagar falhas

#### Scenario: Documentos e orçamento contraditórios
- **WHEN** texto operacional anuncia IA ausente, orçamento antigo como vigente ou campanha planejada como execução
- **THEN** documentação atual é reconciliada com contratos/resultados vigentes e data/candidato são preservados nas evidências históricas
- **AND** números de D10 não são relaxados, desempenho do banco não substitui UI e nova função não é anunciada por inferência

#### Scenario: Revisão e distribuição independentes
- **WHEN** proposta, candidato, relatório ou archive ficam prontos
- **THEN** não ocorre apply, instalação corporativa, merge, upload ou distribuição por inferência de prontidão
- **AND** relatório precisa de aprovação explícita antes do archive; README factual segue o archive autorizado e publicação requer autorização própria
