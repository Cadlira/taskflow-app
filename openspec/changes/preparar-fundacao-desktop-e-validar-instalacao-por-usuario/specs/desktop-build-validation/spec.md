# Spec Delta

## Purpose

Tornar a fundação verificável por instalação reproduzível de dependências, gates automatizados, inspeção e execução do pacote, complementadas por prova Windows em conta padrão.

## ADDED Requirements

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

O pacote SHALL conter recursos/driver necessários ao runtime, identidade aprovada e notices/licenças correspondentes. A inspeção e a validação instalada SHALL comprovar que o SID de AppContainer recebe somente leitura/execução no diretório do app. O pacote SHALL excluir origem Git, segredos, dados reais, configuração pessoal, scaffold Chrome, dependências somente de build e capacidades de elevação/atualização não previstas.

#### Scenario: Inventário do pacote
- **WHEN** o artefato e seus manifests/assets/driver são inspecionados
- **THEN** os recursos runtime necessários e notices estão presentes e correspondem à arquitetura/versões aprovadas
- **AND** não há `.git`, `.env`, dados reais, WXT, bridge genérica, updater ou elevate helper

#### Scenario: ACL do runtime empacotado e instalado
- **WHEN** Setup instala o pacote no root per-user aprovado
- **THEN** o sandbox do Electron pode ler/executar somente binários do diretório instalado por meio da ACE aprovada
- **AND** a ACL não se propaga à Known Folder pai nem à raiz de dados

### Requirement: Smoke executa integração do pacote

O smoke SHALL iniciar o executável empacotado fora do diretório de desenvolvimento, usando perfil de teste separado e timeout, e confirmar renderer, preload, IPC autorizado e prova SQLite reais. Crash, timeout ou resultado incompleto SHALL falhar; limpeza SHALL limitar-se aos recursos de teste criados.

#### Scenario: Integração e reabertura reais
- **WHEN** o smoke inicia e reinicia o binário empacotado em cwd externo
- **THEN** a janela local/preload carregam, o diagnóstico autorizado completa write/read/rollback/reopen e o marcador persiste no perfil test
- **AND** cada processo encerra com código/resultados verificáveis sem alterar prod

#### Scenario: Preload ausente, driver inválido ou hang
- **WHEN** preload/IPC/driver falha ou o processo excede o timeout declarado
- **THEN** o smoke reprova, recolhe erro sanitizado e encerra somente os processos/recursos que criou
- **AND** abrir janela ou gerar build não basta para PASS

### Requirement: CI produz artefatos internos sem distribuir

CI Windows SHALL usar toolchain/lockfile fixados, actions por SHA, permissões mínimas e gates pertinentes. Artefatos SHALL ser disponibilizados somente para revisão, com SHA-256 e retenção finita, sem publicação de release, auto-update, contratação/segredo de assinatura ou execução automática de instalador.

#### Scenario: Run de revisão
- **WHEN** CI executa para uma alteração do app
- **THEN** registra gates e disponibiliza Setup/inventário/manifests/relatórios de revisão com hash, sem publicar release ou executar Setup

#### Scenario: Limite de CI documentado
- **WHEN** gates/smoke passam em runner Windows administrador
- **THEN** o relatório informa que instalação em conta padrão e UAC não foram comprovados por esse run

### Requirement: Aceitação independente em conta padrão

A fundação SHALL exigir evidências em ambiente Windows autorizado, conta fora de Administrators e UAC ativo: instalação offline, exe/atalho instalado, isolamento, argumentos/destinos, segunda instância/conta, upgrade e uninstall/reinstalação com retenção. Evidência SHALL usar dados fictícios e ser sanitizada.

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
