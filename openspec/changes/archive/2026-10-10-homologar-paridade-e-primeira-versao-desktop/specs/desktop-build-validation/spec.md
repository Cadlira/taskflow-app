# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
