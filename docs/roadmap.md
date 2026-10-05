# Roadmap de Changes — TaskFlow App

Preparado em **2026-10-03**; atualizado em **2026-10-04**. Estado: **TFA-001 a TFA-004 integradas pelos PRs #1 a #4; TFA-004 em DONE, merge local `64fe7ad`; TFA-005 em READY_FOR_MERGE — archive em 2026-10-04 com 44/44 tasks, specs consolidadas (17 adicionados, 21 modificados, 1 renomeado), otimizações re-medidas (p95 661,6 ms; heartbeat 636,1 ms; varredura 141,7 ms) e PR #5 aberto aguardando integração**. Já existem persistência, IPC e gerenciamento com interface, agora com recorrências/subtarefas, SQL 2 e catálogo v2. A pendência D10 de desempenho permanece documentada e melhorada, com o gate retido até decisão dos números do orçamento.

## Objetivo e limites confirmados

Criar um aplicativo Windows independente da extensão, com instalador exclusivo por usuário e preservação das atividades e funcionalidades atuais. Trabalhar somente em `C:\QSI\Workspaces\taskflow-app`, com Git próprio. A origem `C:\QSI\Workspaces\taskflow-extension` e seu repositório permanecem estritamente somente leitura.

A captura será adaptada para **links e textos copiados por botão ou atalho global**, escolha confirmada pelo usuário. Não haverá extensão auxiliar ou navegador embutido. Vue existente/Pinia com Electron foi aprovado como baseline da TFA-001; Quasar com Electron permanece alternativa documentada, sem adoção nesta migração.

Este roadmap não autoriza implementar e não substitui artefatos OpenSpec aprovados. Nesta sessão são preparados apenas documentos e repositório. Changes serão criadas uma por vez, quando selecionadas para trabalho.

## Base consultada e inventário

A origem consultada usa Vue 3, Pinia, TypeScript estrito e WXT/Manifest V3, com domínio e aplicação separados dos adapters Chrome. Referência Git: `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, merge da assistência de IA em tarefas. O inventário deve ser revalidado se a origem evoluir; esse hash registra a análise, não autoriza checkout ou alterações nela.

| Comportamento atual | Tratamento planejado | Changes responsáveis |
| --- | --- | --- |
| Criar/editar tarefas; campos, tags, prioridade, prazo e pessoas; status | Preservar regras e validação | TFA-003, TFA-004 |
| Pesquisa, filtros combináveis, ordenação, atrasos e até 24h | Preservar | TFA-004 |
| Recorrências diárias, semanais e mensais; limites; pular/encerrar | Preservar | TFA-005 |
| Até 20 subtarefas, ordem manual, progresso, marcação independente | Preservar | TFA-005 |
| Lixeira de 30 dias; restaurar, excluir definitivamente e esvaziar | Preservar com persistência desktop | TFA-003, TFA-006 |
| Desfazer última exclusão/status/edição e conflitos | Preservar semântica temporária por superfície | TFA-006 |
| Backup versionado, prévia e substituição total; versões 1 a 4 | Reaproveitar formato e validação | TFA-007 |
| Até 10 lembretes absolutos/deslocamentos; tolerância de 5 minutos | Adaptar agendamento e notificações ao Windows | TFA-008 |
| Quick Add e gerenciamento aberto sem perder estado | Adaptar popup/Side Panel a superfícies desktop | TFA-004, TFA-009 |
| Captura de página e seleção via Chrome | Substituir por captura de URL/texto copiado, já aceita | TFA-009 |
| Atalhos sugeridos Ctrl+Shift+K/L e personalização | Adaptar para atalhos globais, conflitos e personalização no app | TFA-009 |
| Provedores OpenAI, Anthropic e CUSTOM; credencial/modelo; teste | Preservar com consentimento e proteção nativa | TFA-010 |
| Sugestão de subtarefas com prévia, cancelamento e revisão | Preservar | TFA-010 |
| Persistência e atualização entre superfícies | Adaptar storage Chrome a repository desktop coordenado | TFA-003 |
| Identidade visual, acessibilidade, foco, erros e feedback | Preservar e verificar no desktop | TFA-004 a TFA-012 |

O backup atual exporta **tarefas**. Lixeira, credenciais de IA e estado temporário de desfazer não fazem parte desse arquivo. O plano não promete transportar esses itens automaticamente. O usuário continuará exportando pelo recurso existente da extensão, sem mudanças nela.

Instalação por usuário é viável como característica do instalador; autorização de execução por política corporativa depende do ambiente real e precisa ser verificada. Não planejar contorno dessas restrições.

## Baseline aprovado e decisões para futuras Changes

- Vue existente/Pinia com Electron aprovado; manter núcleo portável e interfaces de serviços, sem entregar web/mobile nesta migração.
- SQLite como preferência aprovada sob as condições do design; driver, configuração, recuperação e prova de empacotamento em TFA-002/003. JSON atômico é alternativa sujeita à revisão se necessária.
- Casos de uso duráveis e coordenação no main aprovados; detalhes de IPC, revisões e transações refinados na TFA-003.
- Fechar para bandeja, saída explícita e inicialização opcional no login.
- Combinação para captura, personalização de atalhos e tratamento de conflitos.
- Proteção nativa de credenciais e comportamento quando indisponível.
- Arquitetura de Windows, distribuição e assinatura do instalador.

Não há decisão por backend, login central, sincronização, dashboard, histórico persistente, mesclagem de backups, leitura automática de abas, navegador embutido, auto-update remoto ou versão mobile. Esses itens não fazem parte da migração inicial.

## Fluxo de trabalho

1. Selecionar o primeiro item cujas dependências estejam entregues. Ler AGENTS.md e sua seção neste roadmap.
2. Executar somente a exploração. Resolver decisões com evidências, alternativas e dúvidas necessárias. Não criar código ou diretórios de Changes futuras.
3. Quando o usuário solicitar, iniciar `propose`: registrar data de início e etapa, criar apenas os artefatos daquela Change e submetê-los à revisão humana.
4. Após aprovação explícita, executar `apply` somente da Change escolhida, em branch própria. Não iniciar a próxima automaticamente.
5. Verificar artefatos, gates disponíveis, critérios de aceitação e comportamento empacotado aplicável.
6. Revisar implementação; arquivar na mesma branch após aprovação, consolidar specs e atualizar roadmap/documentação.
7. Integrar após os gates finais e revisão. Em fluxo com PR, `DONE` significa integrado à principal, não apenas código local compilado.

`/opsx:explore` é a grafia de referência de **comando de chat**, não um comando de PowerShell. Dependendo do assistente, a instalação pode expor outra grafia ou uma skill. Neste projeto o Codex dispõe de skills OpenSpec; a CLI instalada é 1.14.0 e a raiz local usa o schema `spec-driven`. Isso não exige criar todas as Changes para poder planejar.

## Identificadores, estados e datas

- IDs `TFA-NNN` são sequenciais e imutáveis, independentes da extensão. Não renumerar ou reutilizar.
- Slugs abaixo são sugestões; revisar antes de criar a Change.
- `PLANNED`: intenção registrada, com dependências pendentes. `READY_FOR_EXPLORE`: elegível para investigar.
- `EXPLORING` e `READY_FOR_PROPOSE`: investigação em curso/concluída, ainda sem autorização para implementar.
- `IN_PROGRESS` com etapa `PROPOSE`, `APPLY`, `VERIFY` ou `ARCHIVE`: trabalho correspondente em execução.
- `IN_REVIEW`/`REVIEW`: aguardando revisão. `APPROVED`/`READY_FOR_APPLY`: artefatos aprovados.
- `READY_FOR_MERGE`: archive e gates concluídos na branch. `DONE`/`ARCHIVED`: integração revisada concluída.
- Datas no formato YYYY-MM-DD. Início preenchido no primeiro propose; conclusão na integração final. Explorar não preenche artificialmente a data de início de implementação.

## Sequência planejada

| ID | Change sugerida | Estado | Etapa | Início | Conclusão | Dependências | Próxima ação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TFA-001 | `definir-arquitetura-e-paridade-desktop` | DONE | — | 2026-10-03 | 2026-10-03 | Nenhuma | Concluída e integrada pelo PR #1 |
| TFA-002 | `preparar-fundacao-desktop-e-validar-instalacao-por-usuario` | DONE | — | 2026-10-03 | 2026-10-04 | TFA-001 | Concluída e integrada pelo PR #2; merge local `c123261` conferido em 2026-10-04 |
| TFA-003 | `implementar-persistencia-local-e-fronteira-ipc` | DONE | — | 2026-10-04 | 2026-10-04 | TFA-002 | Integração do PR #3 conferida no Git local: `main` e referência local `origin/main` em `d74e02d`; dependência da TFA-004 satisfeita |
| TFA-004 | `migrar-gerenciamento-de-tarefas-e-interface` | DONE | — | 2026-10-04 | 2026-10-04 | TFA-003 | Apply 41/41, verificação aprovada e archive; PR #4 integrado, merge local `64fe7ad` conferido. D10 de 10.000 permanece como pendência pós-archive documentada |
| TFA-005 | `preservar-recorrencias-e-subtarefas` | READY_FOR_MERGE | — | 2026-10-04 | 2026-10-04 | TFA-004 | Apply 44/44, verificação aprovada e archive em 2026-10-04; specs consolidadas (17 ADDED/21 MODIFIED/1 RENAMED); otimizações re-medidas (p95 661,6 ms; heartbeat 636,1 ms; varredura 141,7 ms); commit `49eee44`, push e PR #5 abertos. D10 retido como pendência pós-archive |
| TFA-006 | `migrar-lixeira-e-desfazer` | PLANNED | — | — | — | TFA-005 | Após dependências, usar o prompt abaixo |
| TFA-007 | `migrar-backups-e-importar-dados-da-extensao` | PLANNED | — | — | — | TFA-006 | Após dependências, usar o prompt abaixo |
| TFA-008 | `migrar-lembretes-e-ciclo-de-vida-desktop` | PLANNED | — | — | — | TFA-007 | Após dependências, usar o prompt abaixo |
| TFA-009 | `adaptar-quick-add-captura-e-atalhos-globais` | PLANNED | — | — | — | TFA-008 | Após dependências, usar o prompt abaixo |
| TFA-010 | `migrar-provedores-ia-e-sugestao-de-subtarefas` | PLANNED | — | — | — | TFA-009 | Após dependências, usar o prompt abaixo |
| TFA-011 | `finalizar-instalador-e-distribuicao-windows` | PLANNED | — | — | — | TFA-010 | Após dependências, usar o prompt abaixo |
| TFA-012 | `homologar-paridade-e-primeira-versao-desktop` | PLANNED | — | — | — | TFA-011 | Após dependências, usar o prompt abaixo |

## TFA-001 — Arquitetura e inventário de paridade

**Slug sugerido:** `definir-arquitetura-e-paridade-desktop`. **Dependências:** nenhuma.

**Resultado:** Decidir a arquitetura do aplicativo e registrar quais comportamentos serão mantidos, adaptados ou exigem validação.

**Escopo previsto:** Comparar Vue 3 existente + Electron com Quasar + Electron, considerando reaproveitamento real, manutenção e custo de reescrita. Inventariar código, testes e specs atuais. Definir separação main/preload/renderer, persistência, identidade do aplicativo e estratégia de migração. Preparar OpenSpec no novo projeto quando autorizado.

**Critérios de aceitação para refinar na proposta:** Matriz de funcionalidades cobre a origem, cada diferença tem justificativa e destino no roadmap, escolhas técnicas têm alternativas e nenhuma depende de extensão auxiliar ou backend obrigatório.

**TFA-001 aprovada, verificada, arquivada e integrada em 2026-10-03:** [proposal](../openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop/proposal.md), [design](../openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop/design.md), [tasks](../openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop/tasks.md) e [relatório de verificação](../openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop/verification.md), na branch `codex/tfa-001-definir-arquitetura-e-paridade-desktop`. O usuário aprovou explicitamente o relatório e autorizou o archive, commit, push e PR em 2026-10-03. O PR #1 foi integrado à branch principal; o histórico local registra o merge commit `4c040c4`. A Change usa `skip_specs: true`, portanto não havia deltas para sincronizar. As 12 tasks foram concluídas; `openspec validate ... --type change --strict --no-interactive` passou. Foram publicados [architecture.md](architecture.md), [parity-matrix.md](parity-matrix.md) e [test-strategy.md](test-strategy.md). P01–P14, decisões D1–D10, fronteiras, riscos e AC01–AC08 estão documentados. Nenhum app, runtime, pacote ou gate de produto foi criado ou validado nesta Change. Estado: **DONE**; conclusão em 2026-10-03.

### Prompt para opsx:explore

```text
/opsx:explore TFA-001 — definir-arquitetura-e-paridade-desktop

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Compare Vue existente com Electron e Quasar com Electron a partir do código real. Leia README.md, docs/architecture.md, src/domain, src/application, src/components, src/composition e openspec/specs na origem. Levante a matriz de paridade, recursos exclusivos do Chrome, requisitos de Windows e opções de arquitetura. Electron é hipótese; Quasar é alternativa, não decisão. Proponha fronteiras de responsabilidade, tratamento de IPC, armazenamento e estratégia de testes. Identifique a configuração mínima de OpenSpec e as decisões que precisam de revisão. Não faça scaffold do aplicativo.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

### Prompt consolidado para opsx:propose

Registro do encaminhamento da exploração; **propose da TFA-001 já executado em 2026-10-03**. Não executar novamente para criar outra Change nem interpretar este registro como aprovação. Revisões dos artefatos existentes devem preservar a mesma Change.

```text
$openspec-propose TFA-001 — definir-arquitetura-e-paridade-desktop

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e o estado OpenSpec; TFA-001 não tem dependências. A origem C:\QSI\Workspaces\taskflow-extension é somente leitura, sem testes/builds/escritas ou alterações de Git. Base analisada: a763e7a0d646c664ecd4f979528bc2c3589fa8c4.

Prepare uma Change exclusivamente documental, sem scaffold, código ou dependências. Compare Vue existente + Electron com Quasar + Electron; recomende Vue/Pinia + Electron pela preservação dos componentes, CSS e teclado reais, mantendo a escolha sujeita à revisão humana. Defina domínio/aplicação portáveis, casos de uso coordenados no main, renderer isolado e preload mínimo, IPC tipado/validado por remetente e sessão, tokens e revisões, sem callbacks/repositories ou filesystem irrestrito atravessando IPC.

Compare SQLite e JSON atômico; proponha SQLite condicionado à prova/revisão TFA-002/003, com escritor único e read/decide/commit sem perda silenciosa. Cubra os 14 conjuntos de specs da origem, limites, testes portáveis, exclusividades Chrome e destinos TFA-002 a TFA-012; registre a lacuna de sameTask no backup e a divergência antiga de permissões na spec de ícones.

Preserve local-first, Windows per-user sem admin/serviços, identidade e acessibilidade, backup de tarefas v1–v4 sem lixeira/credenciais/undo, lembretes persistidos com deduplicação, captura copiada por botão/atalho sem polling/abas/fetch de título e IA opcional com prévia, consentimento, cancelamento e segredo no main. Proponha opções de lifecycle/credenciais/instalador sem antecipar implementação; deixe dúvidas com responsáveis e gates nas próprias Changes.

Conforme CLI 1.14.0/schema spec-driven, use skip_specs: true por ser documentação sem comportamento executável. Produza proposal/design/tasks para futura consolidação de docs/architecture.md, docs/parity-matrix.md e docs/test-strategy.md. Defina critérios AC01–AC08, valide OpenSpec estritamente e registre IN_REVIEW/REVIEW, sem aprovação. Não aplique, arquive, integre, distribua ou crie artefatos de Changes futuras.
```

### Prompt de apply documental usado — registro histórico

O bloco abaixo registra o prompt de apply preparado anteriormente e usado como referência nesta sessão. O apply documental foi executado em 2026-10-03 e está em revisão; não repetir como nova execução. A aprovação dos artefatos e a autorização desta sessão estão registradas acima.

```text
$openspec-apply-change definir-arquitetura-e-paridade-desktop

Execute somente o apply documental da TFA-001 em C:\QSI\Workspaces\taskflow-app. Os artefatos foram aprovados pelo usuário em 2026-10-03, conforme registro e citação humana na seção TFA-001 do roadmap; este pedido autoriza agora o apply documental, sem nova confirmação dessa aprovação. Leia AGENTS.md, docs/roadmap.md e proposal.md, design.md, tasks.md e .openspec.yaml no diretório arquivado openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop. Reutilize a branch codex/tfa-001-definir-arquitetura-e-paridade-desktop, confira seu estado e preserve trabalho preexistente. A origem C:\QSI\Workspaces\taskflow-extension e seu Git são estritamente somente leitura.

Publique apenas docs/architecture.md, docs/parity-matrix.md e docs/test-strategy.md, cumprindo as 12 tasks e AC01–AC08. Preserve a distinção entre decisões aprovadas e condicionais, a matriz P01–P14, referências, alternativas, riscos e gates futuros. Não instale dependências, crie scaffold/package.json, copie código/testes, implemente adapters/funcionalidades/instalador, migre dados ou crie artefatos TFA-002 a TFA-012.

Atualize a etapa/data pertinente no roadmap, marque tasks somente após verificar cada entrega e execute openspec validate definir-arquitetura-e-paridade-desktop --type change --strict --no-interactive. Revise links/diff e entregue evidências, limitações e documentos para revisão. Specs estão dispensadas por skip_specs: true; gates npm e testes desktop ainda não existem. Pare após o apply documental: não arquive, integre, distribua ou inicie TFA-002 sem autorização correspondente.
```

## TFA-002 — Fundação técnica e prova do instalador por usuário

**Slug sugerido:** `preparar-fundacao-desktop-e-validar-instalacao-por-usuario`. **Dependências:** TFA-001.

**Resultado:** Ter uma base mínima empacotável e comprovar cedo que a instalação por usuário atende à restrição principal.

**Escopo previsto:** Em implementação futura aprovada: setup do stack escolhido, TypeScript estrito, scripts de desenvolvimento, lint, typecheck, testes e build, CI básica e janela mínima. Prova pequena do instalador Windows em conta padrão, com identidade e pastas de dados próprias. Nenhuma migração funcional nesta etapa.

**Critérios de aceitação para refinar na proposta:** Aplicativo mínimo empacotado abre fora do ambiente de desenvolvimento; instalação e desinstalação funcionam em conta padrão sem elevação, serviços ou dependência de Node instalado no destino. Caminhos e efeitos no registro ficam documentados. Se a política corporativa bloquear execução, isso é registrado, sem tentar contorná-la.

### Prompt para opsx:explore

```text
/opsx:explore TFA-002 — preparar-fundacao-desktop-e-validar-instalacao-por-usuario

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Investigue a fundação técnica definida na TFA-001 e como provar instalação Windows por usuário antes da migração completa. Compare opções de empacotamento, NSIS/electron-builder se Electron for escolhido, caminho de instalação no perfil, requestedExecutionLevel e configuração que force per-user. Distinga one-click de instalador assistido; perMachine false isoladamente pode não eliminar a escolha de instalação para todos os usuários. Planeje um teste em conta padrão, gates e CI mínimos e a verificação do aplicativo empacotado. Não instale, não execute instaladores nem crie package.json nesta exploração.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

### Exploração concluída em 2026-10-03

Branch criada por solicitação explícita: `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`, a partir da `main` local integrada. **Somente exploração:** as recomendações abaixo não estão aprovadas para implementação. Nenhum diretório/artefato OpenSpec da TFA-002, package.json, dependência, código ou workflow foi criado; nenhum instalador foi executado. Início/conclusão de implementação continuam sem data.

**Dependência conferida:** TFA-001 integrada pelo PR #1; proposal/design/tasks/verification arquivados e docs/architecture.md, docs/parity-matrix.md e docs/test-strategy.md consultados. Baseline aprovado: Vue/Pinia com Electron, núcleo portável, main coordenador, renderer isolado e SQLite condicionado à prova. OpenSpec local 1.14.0, schema spec-driven; listas de Changes ativas e specs vazias. HEAD da extensão revalidado em leitura: `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Nenhum build/teste/escrita na origem.

#### Fundação e versões candidatas

- Recomendar electron-vite estável + electron-builder estável + NSIS completo/offline. Electron Forge/Squirrel é alternativa viável, mas muda o fluxo de empacotamento e a integração do instalador; Quasar não oferece motivo novo para rever o baseline aprovado.
- Em 2026-10-03, as fontes oficiais consultadas indicam Electron 44.5.1 estável, Node 24 LTS e electron-builder 26.17.0 estável. São candidatos de investigação, não combinação instalada/testada. Revalidar patches, suporte, engines, peerDependencies, licenças e binários no propose; registrar versões exatas e lockfile no apply aprovado. Node de build e Node embutido no Electron são runtimes distintos.
- electron-vite 5.0.0 declara Node `^20.19.0 || >=22.12.0` e Vite 5/6/7; seu master é 6.0.0-beta.5 e admite Vite 8. Recomendar avaliar a linha estável 5 + Vite 7, sem adotar beta apenas para copiar Vite 8 da extensão. Não presumir que os demais pacotes recentes da origem são compatíveis: conferir Vue/Pinia, plugin Vue, TypeScript/vue-tsc, Vitest e ESLint como conjunto.
- Configurações da origem não são scaffold desktop: tsconfig estende `.wxt/tsconfig.json`, Vitest usa WxtVitest e postinstall executa `wxt prepare`. ESLint mistura globals browser/Node; separar ambientes para impedir permissões/imports Node no renderer. Preservar os flags estritos existentes em configurações próprias de núcleo/main/preload/renderer.
- Janela mínima local com main/preload/renderer separados; preload pequeno, empacotado para funcionar com sandbox, sem bridge genérica do toolkit. Isolamento, sandbox, CSP, permissões/navegação negadas e validação do único contrato diagnóstico devem existir já na fundação. Não antecipar catálogo funcional da TFA-003. Um protocolo local limitado a assets pode ser provado aqui; sua política completa será ampliada na TFA-003.
- Nome de exibição proposto: TaskFlow App. `appId`, executableName, nome de pacote, AUMID e pasta de perfil devem ser estáveis e revisados antes do primeiro pacote; não inventar domínio/publisher. Separar perfis dev/test/prod. Lock de instância precede qualquer acesso ao banco de prova; segunda instância pode encerrar sem escrever, deixando roteamento/bandeja para TFA-008. Fechar a janela mínima encerra o shell provisório, sem prometer lifecycle final.

#### Empacotamento e exclusividade por usuário

| Alternativa | Consequência para a TFA-002 |
| --- | --- |
| NSIS one-click, `oneClick: true` + `perMachine: false` | Recomendação: evita a seleção usuário/máquina e reduz customização. No código 26.17.0, não define INSTALL_MODE_PER_ALL_USERS nem INSTALL_MODE_PER_ALL_USERS_REQUIRED. Provar o binário, não apenas a configuração. |
| NSIS assistido, `oneClick: false` + `perMachine: false` | Exibe escolha usuário/máquina. `selectPerMachineByDefault: false` escolhe default; `allowElevation: false` restringe pedido de elevação na UI, mas não remove a capacidade per-machine, inclusive se executado elevado. Insuficiente isoladamente. |
| Assistido com include e customInstallMode | Pode forçar CurrentUser via `$isForceCurrentInstall`; exige revisão do código da versão fixada e testes de argumentos, modo silencioso, update e uninstall. Macro da página não demonstra todos os caminhos; no código consultado, `/allusers` tem precedência na página. Preferir include a substituir o script inteiro; só adotar se houver necessidade de assistente. |
| Forge/Squirrel.Windows | Documentação oferece instalação sem admin. Exige tratar eventos próprios de instalação e produz Setup/nupkg/RELEASES; alternativa se NSIS falhar, com nova prova de identidade, atualização e remoção. Plugin Vite do Forge está documentado como experimental. |
| ZIP/portable | Útil para smoke do binário sem dev; não prova instalação, registro, atalhos ou desinstalação. Não é substituto do critério per-user. |
| MSI/WiX, AppX/MSIX, nsis-web | MSI acrescenta tooling/contextos de implantação; AppX/MSIX exige avaliar identidade/assinatura e política de distribuição; nsis-web baixa payload. Sem requisito que justifique estes caminhos na prova offline mínima; reavaliar somente com necessidade explícita. |

Recomendação para a futura configuração: `win.requestedExecutionLevel: asInvoker`; NSIS one-click/perMachine false, `packElevateHelper: false`, `deleteAppDataOnUninstall: false`, `runAfterFinish: false` para separar instalar de iniciar na prova, atalho de menu Iniciar por usuário e decisão explícita sobre desktop. Não incluir updater, hooks que elevem, serviços, login automático, associações/protocolos do SO ou instaladores auxiliares. `allowElevation` pertence ao modo assistido, não é a garantia do one-click.

`win.requestedExecutionLevel` configura o executável do aplicativo. O NSIS tem seu próprio `RequestExecutionLevel user` quando não há modo per-machine; inspecionar separadamente os manifestos do app, Setup e uninstaller, esperando asInvoker/uiAccess false. asInvoker herda o token de quem iniciou: não impede elevação voluntária externa nem comprova ausência de chamadas de elevação no restante do pacote.

Instalação esperada: Known Folder UserProgramFiles, normalmente `%LOCALAPPDATA%\Programs\<nome-estável>`. A versão 26.17.0 consulta InstallLocation em HKCU antes do default e aceita override `/D`; logo não é um caminho fixo garantido por perMachine false. Refinar no propose a restrição ao perfil/root autorizado: testar caminho herdado e `/D` fora dele; se o requisito for exclusividade física no perfil em todos os argumentos suportados, prever include mínimo para rejeitar override inválido, sem copiar exemplos oficiais que escrevem HKLM. Documentar a resolução real em perfis redirecionados.

Dados separados do binário: recomendar caminho explícito e estável sob `%LOCALAPPDATA%\<pasta-aprovada>`, com banco em subpasta própria e sessionData/cache separado; reduz dependência de roaming e do nome de exibição. Electron usa por default `%APPDATA%\<nome>` para userData, portanto não assumir LocalAppData sem configuração/teste. Caminho e política precisam de revisão antes do primeiro pacote. Não gravar em app.asar, diretório do exe ou perfil Chrome. Política de prova: preservar marcador/banco fictício em update e uninstall; política final de remoção fica em TFA-011.

Efeitos esperados do instalador: metadados próprios em HKCU (`Software\<GUID>` e chave de uninstall identificada pelo GUID derivado do appId), atalhos no contexto do usuário, arquivos de instalação e temporários do usuário. Não presumir chave uninstall igual ao appId. Verificar ausência de writes do produto em HKLM, Program Files, ProgramData, Start Menu/desktop públicos e criação de serviços/tarefas agendadas. Separar leitura de HKLM e efeitos normais do Windows de writes causados pelo instalador.

#### Prova de SQLite sem migrar persistência

Comparar `better-sqlite3` (dependência nativa externa, rebuild para ABI Electron e arquitetura Windows, externalização no main e localização do `.node` fora do ASAR quando necessário) com `node:sqlite` do runtime Electron fixado (sem addon externo, mas API classificada como release candidate no Node 24.21.0 consultado; suporte efetivo no binário precisa ser provado). Não selecionar driver por versão de Node instalada no computador de build. Não recomendar JSON como fallback silencioso nem criar repository/schema de tarefas agora.

No apply futuro, um spike limitado deve abrir banco fictício no perfil, criar uma tabela de prova, gravar/ler, demonstrar rollback simples e fechar/reabrir no exe empacotado e instalado. Registrar runtime/SQLite/driver/arquitetura, build/rebuild e localização dos recursos. Banco de prova separado, sem dados reais. A prova de carregamento/transação não certifica durabilidade, recovery, journal, concorrência ou migrações: estes permanecem em TFA-003. Se a combinação nativa falhar, bloquear a escolha correspondente e submeter alternativa à revisão.

#### Gates, CI mínima e critérios a refinar

CI proposta no Git próprio do app: pull_request, push da principal e execução manual; job Windows x64 com label explícito (por exemplo windows-2022), Node/npm fixados, checkout e actions fixadas por SHA, lockfile e npm ci. Executar lint, typecheck completo (tsc para main/preload/núcleo + vue-tsc para renderer), Vitest, build das três entradas, empacotamento NSIS com publicação desabilitada (`--publish never`), inspeção de conteúdo/manifestos e smoke do exe empacotado. Guardar artefato de revisão, checksums SHA-256 e evidências com retenção limitada, sem release/push automático. Exigir suíte com testes úteis, sem passWithNoTests; smoke com timeout, falha visível e encerramento de processos.

| Critério candidato | Evidência observável futura |
| --- | --- |
| F01 — Fundação reproduzível | Checkout limpo do app instala dependências fixadas e passa lint/typecheck/test/build/pack no Windows; lockfile, engines/peers e licenças documentados. Sem WXT/Chrome em runtime, sem copiar scaffold/postinstall da origem. |
| F02 — Fronteiras mínimas | Renderer sem require/Node/fs/ipcRenderer genérico; preload funciona com sandbox; CSP e protocolo/assets bloqueiam traversal/navegação externa; contrato diagnóstico validado aceita apenas janela/frame/origem registrados e rejeita payload/remetente inválidos. Testes de fronteiras verificam imports, sem inventar domínio funcional. |
| F03 — Pacote autocontido | Exe empacotado fora do repo abre offline sem dev server, Node/npm, navegador ou runtime auxiliar instalado no destino; IPC mínimo funciona, nenhuma tela branca/erro de preload; fechar encerra a janela/processo provisórios. |
| F04 — Instalação padrão | VM Windows 11 x64 limpa e autorizada, UAC ativo, conta sem participação no grupo Administrators e processo não elevado; sem Node/npm/build tools. Abrir Setup normalmente, sem credencial de admin, sem UAC de elevação e sem escolha all-users. Registrar hash/versões/OS/arquitetura/token, passos e resultado. Alvo/VM ainda não confirmados pelo usuário. |
| F05 — Escopo do instalador | Manifestos app/Setup/uninstaller asInvoker/uiAccess false; destino resolvido por usuário, registro/atalhos apenas próprios; nenhum serviço/write de produto em HKLM/diretório comum. Testar também invocação por conta administradora com token normal e argumento `/allusers`, para não confundir bloqueio por falta de privilégio com exclusividade da configuração. |
| F06 — Argumentos e falhas | Definir suporte a `/S`, `/currentuser`, `/allusers` e `/D`; modos suportados continuam CurrentUser, override proibido é recusado sem write/elevação. Caminho com espaços/acentos e instalação anterior não mudam contexto. Falha de destino inacessível não deixa instalação anunciada como sucesso nem artefatos próprios incoerentes. |
| F07 — Identidade e manutenção | Duas versões fictícias com mesma identidade: instalar, abrir via atalho/exe, reiniciar, atualizar manualmente, desinstalar em Configurações e reinstalar em conta padrão. Banco/marcador preservado conforme política proposta; chave/atalho/binários removidos na desinstalação, nenhum processo residual. Segunda conta não recebe instalação/atalhos nem compartilha perfil por acidente. |
| F08 — Driver e ownership | Spike SQLite roda no pacote instalado; gravação/leitura/rollback/reabertura comprovadas. Segunda instância não abre escritor concorrente; sem repository de tarefas. Guardar evidência suficiente para seleção/revisão em TFA-003. |
| F09 — Pacote e documentação | Allowlist de artefatos finais/licenças/dependências runtime, inspecionando ASAR e extras; sem .env, segredo, dados, testes, caches, docs internos ou dev tools indevidos. Relatório distingue dev, pacote, instalado e política corporativa; bloqueio por SmartScreen/WDAC/AppLocker é registrado sem contorno e sem marcar a prova como aprovada. |

O CI hospedado Windows roda como administrador com UAC desabilitado, conforme GitHub; seus gates não substituem F04–F07 em conta padrão. Uma conta admin com token filtrado também não substitui conta padrão real. Coletar evidência sanitizada de registro/paths/manifestos e, se necessário, rastreamento de writes por infraestrutura autorizada; nenhuma screenshot/log com conteúdo sensível. Não criar VM/contas, instalar ferramentas ou executar instaladores nesta exploração.

**Escopo recomendado:** fundação mínima empacotável, contrato diagnóstico seguro, identidade/perfis, gates/CI e prova inicial de instalador/SQLite. **Exclusões:** migração de tarefas/UI, repository/IPC funcional/recovery TFA-003, notificações/bandeja/autorun TFA-008, clipboard/atalhos TFA-009, IA/segredos TFA-010, distribuição/assinatura final TFA-011, release/auto-update/instalação corporativa e homologação completa. Não anunciar paridade a partir desta prova.

**Dúvidas materiais antes do apply:** confirmar Windows 11 x64 e disponibilidade de VM autorizada; necessidade de ARM64/Windows 10; aprovar one-click ou justificar assistido; escolher appId/nome de pacote/exe/pasta e identidade sem publisher inferido; decidir o rigor da restrição de `/D`/Known Folder redirecionada; fixar matriz compatível de pacotes/driver e aceitar ou rejeitar node:sqlite release candidate; confirmar política de retenção da prova e eventual necessidade de pacote assinado para executá-la. Ausência dessas respostas não é aprovação das recomendações.

**Riscos principais:** drift entre documentação next/master e release estável; Vite 8 incompatível com electron-vite 5; preload de template com sandbox desativado/bridge ampla; addon compilado para Node errado; path herdado/override fora do perfil; mudança de appId/pasta perder continuidade; CI elevado esconder erro de privilégio; assinatura ausente ou política bloquear execução. Cada risco deve ter gate ou decisão na proposta, sem ampliar escopo por conveniência.

**Verificações desta exploração:** `git diff --check` passou; diff limitado a docs/roadmap.md, sem package.json nem diretório TFA-002. `openspec validate --archived --strict --no-interactive --json` passou para a única Change arquivada TFA-001 (gate de completude das tasks arquivadas). Este resultado não valida specs/artefatos inexistentes da TFA-002, compatibilidade de pacotes ou funcionamento Windows. Gates de produto e critérios F01–F09 são planejados, não executados.

#### Referências verificadas na exploração

- [NSIS estável v26](https://www.electron.build/v26/docs/nsis/), [WindowsConfiguration v26](https://www.electron.build/v26/docs/api/app-builder-lib.interface.windowsconfiguration/) e [release 26.17.0](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.17.0): opções, identidade e manifests; `/docs` sem versão já anuncia v27 não lançada.
- Código versionado 26.17.0: [defines NSIS](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/src/targets/nsis/NsisTarget.ts), [manifesto do instalador](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/templates/nsis/installer.nsi) e [pastas/contexto/override](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/templates/nsis/multiUser.nsh). [multiUserUi em master](https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/templates/nsis/multiUserUi.nsh) é evidência complementar da precedência dos argumentos; reconferir na release fixada antes de escolher assistido.
- [Microsoft: manifestos](https://learn.microsoft.com/en-us/windows/win32/sbscs/application-manifests): asInvoker herda o token; [Electron app paths](https://www.electronjs.org/docs/latest/api/app#appgetpathname): userData/sessionData e perfis próprios.
- [electron-vite 5 package.json](https://raw.githubusercontent.com/alex8088/electron-vite/v5.0.0/package.json), [releases](https://github.com/alex8088/electron-vite/releases), [sandbox/preload](https://electron-vite.org/guide/dev), [Electron segurança](https://www.electronjs.org/docs/latest/tutorial/security).
- [Electron estáveis](https://releases.electronjs.org/?channel=stable), [calendário Electron](https://releases.electronjs.org/schedule), [Node releases](https://nodejs.org/en/about/previous-releases): revalidar suporte na implementação.
- [Forge Squirrel](https://www.electronforge.io/config/makers/squirrel.windows), [Forge Vite](https://www.electronforge.io/templates/vite), [Forge WiX](https://www.electronforge.io/config/makers/wix-msi), [alvos builder](https://www.electron.build/v26/docs/targets/): alternativas, sem adoção.
- [Electron módulos nativos](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [node:sqlite Node 24.21.0](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md): comparação para spike futuro, sem seleção definitiva.
- [GitHub: privilégios de runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#administrative-privileges) e [imagens](https://github.com/actions/runner-images): CI de pacote é diferente de prova Windows em conta padrão.

### Prompt consolidado para opsx:propose

Pronto para uso mediante pedido explícito. Este registro não inicia propose/apply nem aprova as escolhas candidatas.

```text
$openspec-propose TFA-002 — preparar-fundacao-desktop-e-validar-instalacao-por-usuario

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize a branch codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario, preservando trabalho preexistente. Leia AGENTS.md, docs/roadmap.md (exploração TFA-002, critérios F01–F09 e referências), docs/architecture.md, docs/parity-matrix.md, docs/test-strategy.md e os artefatos arquivados da TFA-001, integrada pelo PR #1. Origem C:\QSI\Workspaces\taskflow-extension/Git estritamente somente leitura; HEAD analisado a763e7a0d646c664ecd4f979528bc2c3589fa8c4, sem build/teste/escrita nessa pasta.

Prepare somente proposal/design/specs/tasks da TFA-002 pela CLI instalada e schema spec-driven. Registre IN_PROGRESS/PROPOSE/data antes e IN_REVIEW/REVIEW depois, sem aprovação humana inferida. Esta Change criará comportamento executável no apply futuro: não herde skip_specs true da TFA-001 documental. Não crie scaffold/package.json/workflow, instale dependências ou execute instaladores no propose. Não inicie apply, commit/push/PR, archive ou outra Change automaticamente.

Preserve Vue/Pinia + Electron aprovado, domínio/aplicação portáveis, main coordenador e renderer sem Node/fs. Recomende electron-vite estável + electron-builder estável + NSIS completo offline one-click. Revalide versões/engines/peers/licenças/binários: candidatos da exploração são Electron 44.5.1, builder 26.17.0, Node 24 LTS de build e electron-vite 5/Vite 7; electron-vite 5 não declara Vite 8 e master 6 é beta. Não copie .wxt/tsconfig, WxtVitest, globals Node no renderer ou postinstall wxt da origem. Fixe uma matriz compatível para revisão e futuro lockfile; sem afirmar build já testado.

Projete main/preload/renderer e janela mínima local: TS estrito, sandbox/contextIsolation/webSecurity, CSP e protocolo limitado a assets, bloqueio de navegação/permissões e único contrato diagnóstico tipado/validado por frame/remetente/origem. Sem bridge genérica/toolkit permissivo nem APIs de funcionalidades futuras. Lock de instância antes do banco de prova; segunda instância encerra sem escrever. Fechar encerra shell provisório; bandeja/roteamento/login definitivo ficam na TFA-008.

Compare NSIS oneClick true/perMachine false com assistido, Squirrel/Forge, portable/ZIP, MSI e AppX/MSIX; justifique one-click pela exclusividade e menor customização. perMachine false no assistido permite escolha all-users; allowElevation false/selectPerMachineByDefault false não garantem exclusividade. Se assistido for necessário, include/customInstallMode precisa cobrir argumentos/silencioso/update/uninstall, não somente a página. Recomende win.requestedExecutionLevel asInvoker, packElevateHelper false, runAfterFinish false na prova e deleteAppDataOnUninstall false, sem updater/hooks de elevação/serviços. Exija inspeção separada de manifestos app/Setup/uninstaller asInvoker/uiAccess false e código/configuração da release fixada; não use docs next/master como contrato da stable.

Confirme alvo Windows/arquitetura e ambiente autorizado antes do apply; Windows 11 x64 é proposta, ARM64/Windows 10 não aprovados. Submeta nome/appId/pacote/exe/AUMID/pastas estáveis, sem inventar publisher. Instalação usa UserProgramFiles (normalmente LocalAppData\Programs), mas respeita registro anterior e /D: defina validação/rejeição de caminho fora do root/perfil aprovado e perfis redirecionados. Dados próprios sob LocalAppData com dev/test/prod e sessionData separados são recomendação; Electron default usa AppData roaming. Teste writes HKCU/atalhos do usuário e ausência de efeitos do produto em HKLM/Program Files/ProgramData/atalhos públicos/serviços. Registro uninstall deriva de GUID, não assumir chave igual a appId.

Delimite spike SQLite fictício: comparar better-sqlite3 (ABI/rebuild/arquitetura/externalização/ASAR) e node:sqlite do Electron escolhido (API release candidate no Node 24.21.0 consultado). Seleção exige runtime instalado: abrir/criar/gravar/ler/rollback/reabrir banco de prova separado, sem repository/schema de tarefas. Durabilidade/journal/recovery/migrações/concorrência e IPC funcional são TFA-003; JSON só mediante revisão, sem fallback silencioso.

Planeje gates lint/tsc+vue-tsc/Vitest/build das três entradas/pack NSIS --publish never, inspeção de conteúdo/manifestos e smoke do exe com timeout/erro/cleanup. CI mínima Windows x64, Node/npm/lockfile e actions fixados, PR/push principal/manual, artefato de revisão e SHA-256 sem release/auto-update. GitHub runner Windows é admin com UAC desabilitado: não comprova conta padrão.

Especifique F01–F09 e matriz de evidências: VM limpa autorizada com UAC ativo, usuário fora de Administrators, processo não elevado e sem Node/npm; instalação sem senha/admin/all-users, abrir offline via exe/atalho fora do dev, reiniciar, atualizar duas versões de prova, desinstalar/reinstalar, retenção do banco/marcador e segunda conta isolada. Incluir /allusers,/currentuser,/S,/D, path herdado/espaços/acentos, destino inacessível, manifestos, ausência de helper/serviços/writes globais, IPC inválido e driver no instalado. Evidências fictícias/sanitizadas; bloqueios SmartScreen/WDAC/AppLocker são registrados sem contorno e sem marcar sucesso. Não certificar notificações, bandeja ou atalhos globais ausentes.

Liste escolhas abertas e gates antes do apply: ambiente/arquitetura, one-click versus assistido, identidade e pastas, política de argumentos/caminhos, versões/driver e estabilidade node:sqlite, retenção e assinatura necessária para executar a prova. Exclua migração funcional, persistência/IPC TFA-003, recursos TFA-004–010, assinatura/distribuição final TFA-011, homologação/release/instalação corporativa. Valide OpenSpec com comandos suportados, entregue artefatos para revisão e registre/entregue prompt consolidado de apply no roadmap. Pare na proposta.
```

### Proposta criada — 2026-10-03

Pedido explícito de `$openspec-propose` recebido com o prompt consolidado anexado. A etapa foi registrada como `IN_PROGRESS`/`PROPOSE` antes da criação e agora está `IN_REVIEW`/`REVIEW`. Início da proposta: **2026-10-03**; conclusão da Change sem data. **Artefatos não aprovados; apply não iniciado.** A branch existente foi reutilizada.

Artefatos criados pela CLI OpenSpec 1.14.0, schema `spec-driven`, sem `skip_specs`:

- [Proposal](../openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/proposal.md): motivação, escopo/exclusões, três capacidades e impacto.
- [Design](../openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/design.md): matriz versionada, isolamento/diagnóstico, identidade/perfis, política NSIS/caminhos, SQLite, alternativas, F01–F09, riscos e gates G1–G6.
- Specs consolidadas em [desktop-foundation](../openspec/specs/desktop-foundation/spec.md), [windows-per-user-installation](../openspec/specs/windows-per-user-installation/spec.md) e [desktop-build-validation](../openspec/specs/desktop-build-validation/spec.md) (deltas arquivados em `openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/specs/`).
- [Tasks](../openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/tasks.md): **33 itens**, criados como pendentes em 2026-10-03 e concluídos/verificados em 2026-10-04; [relatório de verificação](../openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/verification.md).

Recomendação submetida à revisão: Windows 11 x64, NSIS offline one-click exclusivo per-user, appId/AUMID `taskflow.app`, executable/pasta `TaskFlowApp`, dados LocalAppData separados em dev/test/prod; better-sqlite3 12.11.1 na prova com Electron 44.5.1, builder 26.17.0, Node 24.21.0/npm 11.21.0 de build, electron-vite 5/Vite 7/TS 5.9. O design contém patches e peers completos consultados; nenhum pacote foi instalado ou compilado. Dist-tags/majors mais novos não substituem a matriz automaticamente.

**Revisão material antes do apply:** G1 ambiente/alvo e autorização de instalar; G2 one-click/args per-user; G3 identidade e raízes/Known Folders redirecionados; G4 versões/driver (node:sqlite RC só mediante revisão/aceitação explícita); G5 retenção; G6 necessidade de assinatura para execução no ambiente. Aceitar as recomendações mantém o plano; alternativa material requer revisão coerente dos artefatos. Identificadores propostos não alegam publisher/domínio de empresa.

A prova de retenção compara o fingerprint opaco de um marcador fictício aleatório inserido uma vez no banco, antes/depois de reinício/upgrade/uninstall/reinstalação. Recriar um banco e mostrar sucesso do diagnóstico não basta. CI inspeciona/executa pacote com perfil test e sem publicar/executar Setup; instalação em conta padrão com UAC é evidência separada.

**Validação da proposta:** `openspec validate preparar-fundacao-desktop-e-validar-instalacao-por-usuario --type change --strict --no-interactive` passou; status reportou os quatro grupos de artefatos completos. `git diff --check` passou. Gates de runtime/CI/instalador e F01–F09 permanecem planejados, não executados. Somente roadmap e artefatos desta Change foram escritos; sem package.json, código, dependências, workflow, instalador executado, commit/push/PR ou alterações na extensão/Git de origem.

### Aprovação humana e início do apply — 2026-10-03

O usuário aprovou explicitamente a proposal, o design, as três specs, as tasks e as recomendações atuais, respondendo: **“Aprovo tudo; informo o ambiente e assinatura”**. Esta aprovação autoriza continuar o apply da TFA-002 na branch existente; não aprova archive, commit, publicação ou Changes futuras.

- **G2–G5 aceitos:** NSIS offline one-click com guardas per-user/argumentos/destino; identidade e roots D3; matriz de versões D1 e `better-sqlite3 12.11.1`; retenção dos dados da prova em upgrade, uninstall e reinstalação.
- **G1 — aprovado em 2026-10-03:** o usuário confirmou que o ambiente é este PC, Windows 11 x64, com duas contas padrão fictícias e UAC ativo, e autorizou executar o instalador aqui. Registrar build/arquitetura e baseline sanitizado antes dos testes F01–F09.
- **G6 — aprovado em 2026-10-03:** sem assinatura comercial; usar ferramentas gratuitas. O pacote de prova será não assinado. Se uma política do Windows bloquear sua execução, registrar `BLOCKED`, sem bypass.
- **Ajuste de segurança do sandbox — aprovado em 2026-10-03 durante o apply:** o usuário aprovou leitura/execução para `S-1-15-2-1` (`ALL APPLICATION PACKAGES`) estritamente na pasta canônica instalada `TaskFlowApp`. A aprovação decorre da falha observada do Electron no diretório de build, cuja ACL não permite ao AppContainer ler o executável. Não estender aos pais, dados/perfis, roots globais ou outros diretórios; falha de configuração permanece erro, sem desabilitar sandbox.

**Ponto de retomada — pausa solicitada pelo usuário em 2026-10-03:** branch `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`; OpenSpec confirmou **4/33 tasks** (1.1, 1.3, 1.4 e 2.4). Retomar por 1.2: fechar inventário/checksums de NSIS e ferramentas, recompilação/ABI do driver e notices; o zip Electron 44.5.1 baixado pelo pacote oficial teve SHA-256 `9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db`, igual a `node_modules/electron/checksums.json`. Depois seguir tasks ainda desmarcadas na ordem. O SVG revisado foi copiado e o ICO multirresolução foi gerado, mas 4.1 permanece pendente. O primeiro launch Electron abortou por ACL ausente no diretório de build; ACL aprovada para a pasta instalada `TaskFlowApp` ainda não foi implementada. Não executar Setup, marcar 1.2/4.1, alterar ACL ou continuar qualquer gate até retomar o trabalho.

Etapa registrada como `IN_PROGRESS`/`APPLY`, início em **2026-10-03**. G1–G6 e o ambiente autorizado estão confirmados; a task 1.1 foi concluída após conferir aprovação, branch e raiz OpenSpec próprios. Restam revalidação técnica, implementação e verificações; os testes de instalação serão executados somente neste PC autorizado e sem contornar bloqueios de política.

### Retomada do apply e revisão de G4 — 2026-10-04

O usuário autorizou retomar o apply na branch `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`, preservando o checkpoint `d92c8e7` e o estado de 4/33 tasks (1.1, 1.3, 1.4 e 2.4), marcando cada task restante somente após verificar sua entrega. Ao final, executar `openspec-verify-change` e gerar `verification.md`; não arquivar, commitar, publicar ou integrar sem nova autorização.

**G4 revisado e aprovado em 2026-10-04:** o rebuild do `better-sqlite3 12.11.1` para Electron 44.5.1 exige MSVC, indisponível neste PC autorizado, e não existe prebuilt para o ABI 149 (a v12.12.0 da mesma biblioteca chega ao ABI 148 e a linha v13.x não publica prebuilds Electron). Diante disso, o usuário aceitou explicitamente usar o **`node:sqlite` embarcado no Electron 44.5.1** para a prova fictícia, com a API em release candidate (1.2) aceita de forma consciente. Verificação local no runtime: `node:sqlite` presente e com escrita/leitura funcionando no binário Electron 44.5.1. A decisão não implementa fallback automático nem instala compiladores no destino; os cenários comportamentais das specs permanecem. Design, proposal, specs, tasks e documentação serão atualizados de forma coerente antes da implementação, conforme a revisão aprovada.

**ACL do smoke — aprovado em 2026-10-04:** o smoke do pacote (`smoke:packaged`) executa o executável do pacote fora do repo, cujo diretório de build não é legível pelo sandbox neste PC. O usuário aprovou estender a ACE de leitura/execução (`S-1-15-2-1`, herdável `(OI)(CI)(RX)`) **exclusivamente ao diretório temporário de teste criado pelo próprio smoke** (cópia do pacote), sem alterar pais, dados/perfis do usuário, roots globais ou outros diretórios. O instalador continua concedendo a ACE somente ao root canônico instalado `TaskFlowApp`. Nenhum modo inseguro ou `--no-sandbox` é usado.

### Apply, verificação e archive concluídos — 2026-10-04

O apply da TFA-002 foi conduzido na branch `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`, preservando o checkpoint `d92c8e7`. Em 2026-10-04: **33/33 tasks concluídas**; nenhum bypass de política; nada arquivado, mesclado ou publicado (o push e o PR em rascunho #2 foram autorizados especificamente para validar a CI; commits `dd46aae`, `ca44322` e seguintes).

- **Task 5.4 concluída:** workflow de CI executado no PR #2 — run [37202267073](https://github.com/Cadlira/taskflow-app/actions/runs/37202267073), 12/12 passos com sucesso (gates, pacote NSIS, `verify:package`, `smoke:packaged`, hashes e artefatos de revisão com retenção de 14 dias); reexecuções verdes após os ajustes de CI. O runner administrador não substitui a conta padrão (nota da própria CI).
- **Task 6.5 concluída:** a máquina não continha contas padrão fictícias (premissa corrigida); com autorização do usuário, foi criada a conta padrão dedicada `TFAProva2` (não-administradora), na qual a prova executou com baseline limpo: instalação/diagnóstico/desinstalação/reinstalação com `exit 0`, pasta canônica própria, atalho/registro/ACL próprios, fingerprint próprio `59559d41c68a…` retido entre ciclos e desinstalação padrão **sem sobras** removendo binários/registro/atalho e mantendo os dados. A conta principal permaneceu intacta (`862191a5…`). Nota de execução: um disparo inicial da automação de teste operou com mapeamento de ambiente ambíguo e desinstalou/reinstalou a instalação da conta principal; os scripts de teste foram corrigidos com guardas de perfil explícitas e o estado final das duas contas foi reverificado — registro em [desktop-foundation-validation.md](desktop-foundation-validation.md). A credencial temporária de teste foi apagada ao final.
- **Evidências principais:** `npm run validate` (lint, typecheck em 5 projetos, 32 testes, build), `package:win` NSIS one-click per-user, `verify:package` (ASAR de 12 arquivos sem addon/updater/segredos; manifests `asInvoker/uiAccess=false` do app, Setup e desinstalador) e `smoke:packaged` (10 cenários) passaram; prova em conta padrão com F01–F09 executada no PC autorizado, incluindo matriz F06 com 15 PASS e 3 subcasos BLOCKED, upgrade fictício 0.1.0→0.1.1, uninstall com retenção de dados e reinstalação com fingerprint estável; ACL do AppContainer restrita à pasta instalada; sem HKLM/serviços/writes globais. Detalhes, hashes e limitações em [desktop-foundation-validation.md](desktop-foundation-validation.md).
- **Verificação e archive:** relatório `verification.md` final (33/33; sem issues CRÍTICOS; 3 WARNING não bloqueantes e sugestões) **aprovado pelo usuário em 2026-10-04**; archive executado na mesma branch via OpenSpec 1.14.0 em `openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/`, com consolidação das três capacidades em `openspec/specs/` (18 requisitos ADDED, 0 MODIFIED/REMOVED/RENAMED). Etapa `ARCHIVE` concluída; estado **`READY_FOR_MERGE`**.
- **Integração conferida em 2026-10-04:** o PR #2 já está integrado à `main` local e à referência local `origin/main`, no merge `c123261cb77275243930ba512d45e7453541a2de`, datado de 2026-10-04 às 10:01:34 -03:00. A TFA-002 passa a `DONE`, conclusão em **2026-10-04**, e a dependência da TFA-003 está satisfeita. Evidência: histórico Git local; consulta adicional por `gh` indisponível por HTTP 401, sem alterar autenticação. O README operacional já foi ajustado ao funcionamento atual (item 38), sem status de desenvolvimento.
- **Garantias de escopo:** nenhuma tarefa de TFA-003+ iniciada; sem merge ou release; a alteração material de G4 e a extensão da ACL do smoke ficaram registradas acima e nos artefatos.

### Prompt consolidado para opsx:apply

### Prompt consolidado para opsx:apply

Usar **somente após aprovação explícita dos artefatos e decisões G1–G6**, em novo pedido de apply. O prompt não aprova os artefatos nem autoriza instalar em ambiente ainda não identificado/aprovado.

```text
$openspec-apply-change TFA-002 — preparar-fundacao-desktop-e-validar-instalacao-por-usuario

Trabalhe em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario. Leia AGENTS.md, docs/roadmap.md, docs/architecture.md, docs/parity-matrix.md, docs/test-strategy.md, TFA-001 arquivada/integrada e proposal/design/três specs/tasks da TFA-002. Preserve trabalho preexistente. A extensão C:\QSI\Workspaces\taskflow-extension e seu Git são estritamente somente leitura; não executar build/teste/ferramenta de escrita nela, nem copiar .git/.env/dados reais/node_modules/configurações pessoais.

Confirme evidência humana de aprovação dos artefatos e G1–G6: ambiente Windows 11 x64 com duas contas padrão/UAC e autorização de instalar ali, one-click/args, identidade/paths, matriz/driver, retenção e necessidade de assinatura. O prompt não substitui decisões ainda ausentes. Registre aprovação/etapa/data no roadmap e cumpra as 33 tasks verificando cada entrega antes de marcá-la. Escolha alternativa material só após revisar coerentemente os artefatos e obter aprovação do ponto alterado; não mudar versões/driver por fallback silencioso.

Implemente somente fundação mínima Vue/Pinia + Electron e TypeScript estrito, com builds/tsconfigs main/preload/renderer separados. Matriz proposta no design: Electron 44.5.1, builder 26.17.0, Node de build 24.21.0/npm 11.21.0, electron-vite 5.0.0/Vite 7.3.6, Vue 3.5.43/Pinia 4.0.3, TS 5.9.3/vue-tsc 3.3.12 e versões compatíveis fixadas de lint/Vitest. Revalide engines/peers/licenças/binários e fixe auxiliares/lockfile sem force/legacy-peer-deps. Não transportar scaffold WXT/postinstall da origem.

Janela mínima local acessível, renderer sem Node/fs, contextIsolation/sandbox/webSecurity, protocolo limitado/CSP e origem dev autorizada só em dev. Exponha somente verifyFoundation versionado, validando schema/1 KiB, webContents/main frame/origem e BUSY, sem toolkit bridge/canais/SQL/paths livres. Negue navegação externa/janelas/webviews/permissões. Fixe identidade/AUMID e perfis userData/sessionData dev/test/prod separados da instalação/Chrome. Lock antes do banco; segunda instância do perfil termina sem escritor próprio; fechar a janela provisória encerra com segurança, sem bandeja.

Prove SQLite fictício no main com driver aprovado (preferência better-sqlite3 12.11.1), rebuild Electron/x64, externalização/ASAR/notices e execução real no pacote. Create/write/read/rollback/reopen, falha sem reset/fallback e fingerprint de marcador aleatório persistido uma vez. Não criar schema/repositories/recovery/migrações/IPC funcional de tarefas; alternativa node:sqlite exige aceitação explícita de RC e prova no Electron selecionado.

NSIS offline oneClick true/perMachine false, app asInvoker, packElevateHelper false/runAfterFinish false/deleteAppDataOnUninstall false, sem updater/serviços/publicação. Verifique separadamente manifests app/Setup/uninstaller. Instale somente no destino canônico Known Folder UserProgramFiles\TaskFlowApp aprovado; valide destino final, HKCU InstallLocation anterior, /D e guards da remoção. Recuse allusers/conflitos/malformados/root global/outro usuário/UNC/traversal/escape/redirecionamento não aprovado, sem fallback/elevação/efeitos na instalação ou dados existentes. /currentuser e /S mantêm restrições. Upgrade manual e uninstall/reinstalação conservam identidade e fingerprint/dados.

Crie/execute lint, tsc+vue-tsc, Vitest, build, package:win --publish never, verify:package e smoke:packaged real fora de dev/perfil test/timeout 60 s, com negativas e limpeza restrita. CI Windows com Node/npm/lockfile/actions SHA, permissions mínimas, gates e artefatos internos SHA-256/retensão finita, sem release ou executar Setup. Runner administrador não comprova conta padrão.

Somente no ambiente explicitamente autorizado execute F01–F09: instalação offline sem Node/admin/prompt; exe/atalho instalado; IPC/driver/ownership; argumentos/destinos/HKCU/espaços/acentos/redirecionamento/inacessibilidade; ausência de helper/serviços/writes globais; reinício/segunda instância; duas versões fictícias 0.1.0→0.1.1/uninstall/reinstalação com fingerprint igual e segunda conta isolada. Evidências fictícias/sanitizadas, PASS/FAIL/BLOCKED por cenário; bloqueio de política é pendência, sem bypass ou sucesso inventado.

Atualize documentação operacional/testes/paridade somente do que existir e execute OpenSpec estrito. Ao concluir o apply, use openspec-verify-change e gere verification.md nesta Change, com requisitos/tasks/evidências/limites; aprovação explícita do relatório precede archive. Se faltar prova padrão, não marcar Change concluída. Pare para revisão: não arquivar, commitar/push/PR/merge, publicar release, instalar em máquina corporativa ou iniciar TFA-003 sem pedido/autorização próprios. README factual será atualizado após archive autorizado conforme AGENTS.md.
```

## TFA-003 — Persistência local e fronteira IPC

**Slug:** `implementar-persistencia-local-e-fronteira-ipc`. **Dependências:** TFA-002, concluída e integrada pelo PR #2. Exploração e propose autorizados em 2026-10-04; branch `codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc` criada a partir da `main` em `c123261` e reutilizada. **Estado atual: DONE**, início e conclusão em 2026-10-04; verificada, aprovada, arquivada e integrada pelo PR #3. O DONE foi registrado antes do merge por decisão explícita do usuário; a integração foi posteriormente conferida na exploração da TFA-004, no merge `d74e02df7aa38e13fd631a6a83ab2d07b96d8e42`.

**Resultado:** Substituir armazenamento Chrome por persistência durável no perfil do usuário, com comunicação segura e coordenação entre superfícies.

**Escopo proposto:** Persistência de tarefas/lixeira e codecs, transações/revisões/erros, coordenador proprietário no main e IPC getStateSnapshot/subscribeState/unsubscribeState. Preload mínimo, sessões/remetentes/entradas/saídas validados; isolamento, protocolo/CSP e proteção de navegação existentes. Criar/editar/status e abertura externa ficam na TFA-004, conforme recorte humano registrado no pedido de propose.

**Critérios de aceitação para refinar na proposta:** Fechar/reabrir conserva dados; dados incompatíveis ou corrompidos não são sobrescritos silenciosamente; falha de escrita conserva o estado anterior; operações concorrentes entre janelas não perdem dados; renderer não expõe filesystem nem IPC irrestrito.

### Prompt para opsx:explore

```text
/opsx:explore TFA-003 — implementar-persistencia-local-e-fronteira-ipc

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia application/task-repository.ts, application/task-trash-repository.ts, infrastructure/storage e infrastructure/chrome/chrome-task-repository.ts da origem. Compare armazenamento JSON atômico com SQLite, considerando transações, recuperação, dependências e empacotamento. Investigue concorrência entre janelas e lembretes, propagação de erros tipados e subscriptions. Defina quais casos de uso rodam no main e a lista mínima de operações IPC, validação do remetente e proteção de navegação. Planeje testes de escrita interrompida, dados incompatíveis e concorrência. Não escreva adapters.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

### Exploração concluída — 2026-10-04

**Pedido e entrega da exploração (registro histórico):** exploração da TFA-003, atualização dos estados TFA-002/TFA-003 e criação da branch explicitamente solicitadas pelo usuário. Branch local `codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc`, criada a partir da `main` em `c123261cb77275243930ba512d45e7453541a2de`, merge do PR #2. Ao encerrar essa etapa, TFA-002 `DONE` e TFA-003 `READY_FOR_PROPOSE`/`EXPLORE`, sem início/conclusão de implementação. Somente este roadmap foi editado na exploração; nenhum diretório, proposal, design, spec, task ou adapter da TFA-003 havia sido criado. Sem instalação de dependências, execução de instalador, commit, push ou publicação. O propose posterior está registrado abaixo.

**Dependências e origem:** consultados os artefatos arquivados das TFA-001/002, as capacidades consolidadas pertinentes, arquitetura, paridade, estratégia de testes e código da fundação. OpenSpec 1.14.0, raiz local, schema `spec-driven`, nenhuma Change ativa e três specs. HEAD da extensão revalidado em leitura: `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Nenhum teste, build ou escrita na extensão/Git; a opção `git -c safe.directory=...` foi usada apenas no comando de leitura, sem alterar configuração. A integração do PR #2 está comprovada pelo Git local; a consulta adicional por `gh` retornou HTTP 401.

**Já confirmado nas dependências:** Vue/Pinia + Electron, núcleo portável, coordenação no main, renderer isolado, identidade/perfis e instalador per-user; preferência SQLite condicionada à prova. A revisão G4 da TFA-002 aprovou `node:sqlite` embarcado no Electron 44.5.1 (Node 24.21.0), com API RC aceita, e a prova instalada confirmou escrita/leitura/rollback/reabertura. **Ainda candidatos à revisão na TFA-003:** schema de produto, journal/synchronous, recuperação, revisões, sessões/subscriptions, limites e recorte dos comandos. A prova anterior não valida essas escolhas.

#### Achados no código e consequências

| Fonte lida | Achado | Consequência para a proposta |
| --- | --- | --- |
| [TaskRepository](C:/QSI/Workspaces/taskflow-extension/src/application/task-repository.ts:3) e [TaskTrashRepository](C:/QSI/Workspaces/taskflow-extension/src/application/task-trash-repository.ts:18) | `INCOMPATIBLE_DATA`/`UNAVAILABLE`; gravação múltipla, callbacks condicionais, claim e subscriptions. Move/restore devem operar nas duas coleções juntos. | Preservar portas internas e resultados; callbacks, classes de erro e planos não são DTOs IPC. Introduzir unidade de trabalho sem dependência de Electron/Vue no núcleo. |
| [Fila por instância](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts:50), [enqueue](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts:307) e composições `chrome-task-service`, `chrome-backup-service`, `chrome-reminder-service` | Tarefas/lixeira compartilham a fila de uma superfície; popup, gerenciamento, backup e lembretes podem ter repositories distintos. A fila se recupera de rejeição. | No desktop, uma autoridade por perfil e uma coordenação comum para todos os produtores; não copiar uma fila por janela. |
| [TaskService.update/changeStatus](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:274) e [reconcileAll](C:/QSI/Workspaces/taskflow-extension/src/application/reminder-service.ts:66) | Leitura e decisão podem ocorrer antes da escrita enfileirada. `saveMany` torna a gravação múltipla única, mas não torna a decisão anterior atual. | Envolver read/decide/commit inteiro e validar revisão esperada. Transação apenas no `save` ainda permite sobrescrever um snapshot antigo. |
| [Codec de tarefas](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/storage/stored-task-collection.ts:288), [lixeira](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/storage/stored-trash.ts) e `stored-ai-config.ts` | Tarefas v4 com migrações v1–v3; invariantes de IDs, lembretes, séries e subtarefas; lixeira usa a mesma cadeia, com `deletedAt`. O decoder descarta propriedades desconhecidas em versões reconhecidas. IA tem versão própria e credencial no objeto da origem. | Preservar todos os campos conhecidos e a validação integral, sem importar a política de credenciais. Schema SQL, versão do payload e versão de backup são distintos. Ler codecs não autoriza importação do Chrome ou backup, nem implementação das regras/UI avançadas. |
| [Claim](C:/QSI/Workspaces/taskflow-extension/src/application/reminder-service.ts:95) e [regra condicional](C:/QSI/Workspaces/taskflow-extension/src/domain/task-reminders.ts:255) | Relê ocorrência antes de marcar `processedFor`; notify sucede o claim. Processamento interno não altera `updatedAt`, usado pelo [undo](C:/QSI/Workspaces/taskflow-extension/src/domain/task-undo.ts:25). | Claim interno na mesma coordenação das edições; preservar marcadores ao editar. Separar revisão de conteúdo da revisão de armazenamento para não invalidar undo somente por reminder. Scheduler/notifier reais continuam na TFA-008. |
| [Subscriptions](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts:214) e [store.connect/load](C:/QSI/Workspaces/taskflow-extension/src/stores/task-store.ts:112) | Eventos e leitura inicial não têm revisão; uma resposta antiga pode chegar depois de um evento recente. `listTrash` também pode expurgar dados. | Handshake de snapshot/subscription, revisões monotônicas e ressincronização. Leitura IPC não deve disparar expurgo implicitamente. |
| [IPC atual](C:/QSI/Workspaces/taskflow-app/src/main/ipc/foundation.ts:27), [main](C:/QSI/Workspaces/taskflow-app/src/main/index.ts:29) e [preload](C:/QSI/Workspaces/taskflow-app/src/preload/index.ts) | Lock antes do banco; bridge diagnóstica única; schema exato/1 KiB; webContents/main frame/URL autorizados; protocolo/CSP e navegação negada. | Ampliar apenas o catálogo necessário, com sessões por documento e validação de origem real além da URL. Limpeza e autorização também se aplicam aos eventos enviados. |

Os testes da origem foram inspecionados, sem execução: `chrome-task-repository.test.ts` cobre escrita múltipla, claims repetidos/alterados, incompatibilidade, fila após erro, subscriptions, move/restore e colisão; `stored-trash.test.ts`, `task-undo.test.ts` e `reminder-service.test.ts` complementam codecs e semântica. Simulações de Chrome não comprovam crash, I/O ou concorrência no SQLite desktop.

#### JSON atômico versus SQLite

| Critério | Envelope JSON único | SQLite no runtime já aprovado |
| --- | --- | --- |
| Unidade de commit | Tarefas, lixeira e revisão precisam estar no mesmo envelope; arquivos independentes não resolvem move/restore atômicos. | Transação nas tabelas envolvidas e revisão no mesmo banco. |
| Concorrência | Exige escritor único, fila e comparação de revisão; substituição de arquivo sozinha não resolve draft antigo. | Também exige coordenação read/decide/commit; locks/transações complementam, sem corrigir um comando baseado em snapshot antigo. |
| Interrupção/recuperação | Temporário exclusivo no mesmo volume, flush, substituição, identificação da geração confirmada e tratamento de temporários/backup; falhas Windows precisam de prova. | Journal e rollback fornecidos pelo motor; política de compatibilidade, integridade e recuperação explícita continua sendo responsabilidade do app. |
| Dependências/pacote | Pode usar filesystem do runtime; não implica durabilidade pronta. Uma API Win32 adicional aumentaria integração/empacotamento. | `node:sqlite` já existe e foi provado no exe, sem addon externo, rebuild ou compilador. API RC e versão efetiva precisam continuar registradas. |
| Custo por alteração | Regrava e valida o envelope completo; crescimento aumenta trabalho e memória. | Pode atualizar registros afetados; schema, statements e transações precisam de manutenção. |

**Recomendação:** continuar com SQLite/`node:sqlite`, isolado em adapter de main no apply futuro. O motivo é combinar transações multi-entidade com o caminho de empacotamento já demonstrado, evitando construir um protocolo próprio de commit/recovery. `better-sqlite3` foi rejeitado neste ambiente na TFA-002; não reabrir rebuild/instalação de compilador por conveniência. JSON permanece alternativa material para revisão, sem fallback automático.

Para o JSON, `flush` sincroniza o arquivo, mas não demonstra sozinho a durabilidade da troca de nome. A documentação Win32 informa que `REPLACEFILE_WRITE_THROUGH` não é suportado e descreve estados distintos após falhas de substituição; não anunciar `writeFile` + `rename` como garantia de recuperação Windows sem evidências. Fontes: [Node filesystem](https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options), [Microsoft ReplaceFileW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew).

**Configuração candidata:** uma conexão proprietária, rollback journal `DELETE`, `synchronous=EXTRA`, transações curtas `BEGIN IMMEDIATE`, SQL parametrizado e espera por lock limitada. Para um escritor e sem leitores independentes, esse recorte evita a necessidade de WAL/checkpoints. `EXTRA` acrescenta sincronização do diretório após remoção do journal; persistência continua dependente do SO/filesystem/dispositivo cumprirem seus contratos. Confirmar os valores efetivos no Electron empacotado, sem inferir a partir do Node global. Fontes: [commit atômico SQLite](https://sqlite.org/atomiccommit.html), [synchronous](https://sqlite.org/pragma.html#pragma_synchronous).

**Alternativa WAL:** `WAL` + `FULL` se leitores independentes ou medições justificarem; inclui checkpoint e arquivos `-wal`/`-shm`, e não permite copiar somente o `.sqlite` em uso como recuperação confiável. `NORMAL` pode perder commits após falha de energia. A documentação registra correção do WAL-reset em 3.51.3 ou backports 3.44.6/3.50.7; antes de adotar WAL, conferir `sqlite_version()`/patches no runtime, especialmente com conexões em threads/processos distintos. Nenhuma versão SQLite do produto foi medida nesta exploração. Fonte: [SQLite WAL](https://sqlite.org/wal.html).

**Modelo candidato:** banco de produto próprio em `userData/data/taskflow.sqlite`, separado de `foundation-proof/proof.sqlite` e sessionData; tabelas de tarefas e lixeira com IDs próprios, payload JSON validado por codec, versão do payload, `deletedAt` onde aplicável e metadados de revisão/schema. Evita converter toda regra de domínio em SQL nesta etapa. Não impor unicidade de ID entre as duas tabelas: restore deve continuar recusando `ID_EXISTS`, inclusive depois da futura substituição de tarefas por backup que preserve lixeira. O schema SQL inicial pode ser v1 enquanto o payload é v4; números não significam equivalência com o backup.

**Abertura e falhas:** distinguir perfil novo de arquivo existente vazio/incompatível; verificar metadata/versão/integridade antes de DDL, migração ou alteração de configuração persistida. Migrar apenas versões explicitamente suportadas, em transação; versão futura, payload inválido ou corrupção bloqueiam mutações sem reset, descarte de registros ou mudança para JSON. Recovery normal do journal pelo motor não equivale a restaurar conteúdo corrompido. Não apagar journals manualmente. Recuperação destrutiva, escolha de arquivo e importação de backup ficam fora; oferecer erro seguro e preservação dos arquivos. Inicialização interrompida e migração falhada precisam de critérios específicos no propose.

#### Coordenação, casos de uso e IPC mínimo

```text
Renderer: drafts + snapshots + revisoes
                    |
                    v
Preload: operacoes fechadas + listeners locais
                    |
                    v
Main: remetente + sessao + validacao
                    |
                    v
Coordenador: read --> decide --> commit
                    |
                    v
SQLite: tarefas + lixeira + metadados
                    |
                    v
Evento apos commit --> superficies autorizadas
```

O main será responsável por toda mutação durável: criar/editar/status, transições de série, toggle, move/restore/expurgo, undo, substituição por backup e consumo de ocorrência, **cada qual somente na Change que a autorizar**. Renderer mantém drafts, filtros, ordenação de apresentação e feedback; main revalida entradas e executa domínio/aplicação portáveis. Relógio, geração de ID, callbacks condicionais e estado-base ficam no main. Rede, dialogs e notifier não ficam aguardando dentro de transação; falha posterior ao commit não deve ser anunciada como rollback.

Coordenador único serializa decisões e commits, não apenas o flush final. Evitar filas internas que reenfileirem a própria unidade de trabalho e travem. Revisão global durável ordena commits/snapshots; revisão de conteúdo por tarefa detecta edição concorrente sem depender de `updatedAt`. Claim altera armazenamento, preservando revisão de conteúdo. Edição futura relê a versão atual e preserva `processedFor` válido; draft antigo não é uma autorização para substituir a tarefa inteira. No-op não incrementa revisão nem emite alteração. A fila continua depois de erro recuperável; falha com integridade incerta bloqueia novas escritas até revalidar.

**Recorte recomendado, ainda não confirmado:** TFA-003 implementará no apply futuro persistência, codecs, unidades de trabalho e IPC de leitura/subscriptions. Criar/editar/status via IPC ficam na TFA-004; recorrência/toggle na TFA-005, UI/comandos de lixeira/undo na TFA-006, importação na TFA-007 e scheduler/notifier na TFA-008. Primitivas internas de storage e testes com dados fictícios nesta fundação não entregam essas funcionalidades. Uma pergunta opcional foi apresentada sobre antecipar somente criar/editar/status, sem UI; ausência de resposta não aprova essa expansão. Resolver o recorte no propose antes de fechar tasks/specs.

| Operação candidata no preload/main | Contrato mínimo da TFA-003 |
| --- | --- |
| `getStateSnapshot({version: 1})` | Snapshot consistente de tarefas/lixeira, revisões e estado de disponibilidade. Sem expurgo implícito, path, SQL ou filtros arbitrários. Serve também para ressincronização. |
| `subscribeState({version: 1})` | Inscrição escopada ao documento autorizado, com ID opaco e snapshot/revisão inicial capturados na mesma coordenação. |
| `unsubscribeState({version: 1, subscriptionId})` | Revoga somente inscrição da própria sessão; idempotente. Wrapper local do preload fornece `unsubscribe`, sem enviar funções por IPC. |
| Eventos `stateChanged` / `stateError` | Mudança com revisão e invalidação dos dados; erro por código seguro. Renderer busca snapshot e ignora revisões antigas. Sem `IpcRendererEvent`, paths ou detalhes internos para callbacks. |
| `verifyFoundation` já existente | Continua diagnóstico separado, no banco fictício; não vira API para injetar tarefas ou escolher banco. |

Registrar listener local antes do handshake, bufferizar eventos até a resposta inicial e descartar revisões anteriores/iguais; confirmação e eventos fora de ordem não substituem estado recente. Capturar inscrição e snapshot na mesma ordem do coordenador evita lacuna entre leitura e assinatura. Ressincronizar após reload/reconexão/perda de evento; subscriptions são projeções, sem log persistente de eventos nem entrega exatamente uma vez. Limitar inscrições por sessão e volume de respostas sem truncar dados silenciosamente; dimensionamento/paginação técnica, se necessária, deve ser definido no propose preservando compatibilidade com coleções legítimas e o backup de até 20 MiB.

`DatabaseSync` executa de forma síncrona: operações extensas e lock waits podem bloquear o main. Manter transações curtas e definir dataset, limite de fila/bytes e orçamento de bloqueio no propose; se o runtime não cumprir o orçamento, avaliar worker de storage interno sob ownership do main com revisão coerente, sem expor acesso ao renderer. Não há benchmark ou aprovação de worker nesta exploração. Fonte versionada: [Node 24.21.0 SQLite](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md).

#### Erros, sessões e navegação

Internamente, preservar a distinção de `TaskStorageError` entre incompatibilidade e indisponibilidade; mapear lock/I/O/disco/permissão/corrupção com classificação localizada e causa mantida apenas no main. IPC retorna união discriminada versionada, com códigos fechados como `INCOMPATIBLE_DATA`, `STORAGE_UNAVAILABLE`, `INVALID_REQUEST`, `UNAUTHORIZED`, `BUSY` e `SESSION_CLOSED`; detalhes de conflito/validação entram com os respectivos comandos futuros. UI resolve mensagens seguras por código. Não depender de `instanceof` após `invoke`, nem enviar `cause`, stack, SQL, conteúdo ou path. Rejeição do transporte após possível commit exige novo snapshot, sem repetir cegamente o comando ou afirmar que nada foi gravado. Fonte: [Electron IPC — tratamento de erros](https://www.electronjs.org/docs/latest/tutorial/ipc).

Antes de ler dados ou executar efeitos: conferir webContents registrado/vivo, main frame atual e não nulo, `senderFrame.origin`, URL local permitida, sessão/documento atual, versão, shape exato, tipos e limites. Sessão criada pelo main, invalidada em navegação/reload/crash/fechamento; ID fornecido pelo renderer não confere autoridade. Validar novamente destinatário/documento antes de respostas/eventos, retirar subscriptions e impedir que resultado tardio chegue a novo documento. `origin` existe nos tipos locais do Electron escolhido; não aceitar `about:blank`, `blob:`, URL com credenciais ou origem aparente só por prefixo. Fontes: [Electron segurança](https://www.electronjs.org/docs/latest/tutorial/security), [webFrameMain.origin](https://www.electronjs.org/docs/latest/api/web-frame-main#frameorigin-readonly).

Preservar sandbox/contextIsolation/webSecurity, renderer sem Node/fs, protocolo limitado a assets, CSP sem rede em produção, bloqueio de janelas/webviews/permissões/navegação e negação de origem dev no pacote. Abertura externa continua na TFA-004: ação explícita, URL parseada HTTP/HTTPS e validação final no main. TFA-003 não adiciona `shell.openExternal`, bridge genérica, alteração de ACL de dados ou acesso livre ao filesystem.

#### Critérios de aceitação e testes candidatos

| Critério | Teste futuro e evidência observável |
| --- | --- |
| P01 — Persistência fiel | Semear dados fictícios com todos os campos, IDs/ordem, séries/subtarefas/lembretes e lixeira; confirmar commit, fechar/reabrir e comparar integralmente. Banco de produto/prova e dev/test/prod permanecem separados. |
| P02 — Atomicidade multi-entidade | Injetar falha entre alterações de tarefas/lixeira e em `saveMany`; estado anterior inteiro antes do commit ou novo estado inteiro após commit, com revisão correspondente. Move/restore recusado por colisão/incompatibilidade não altera coleção alguma. |
| P03 — Interrupção real | Processo de teste proprietário com pontos de sincronização antes/durante transação, antes/depois de COMMIT e antes da resposta/evento; encerrar apenas esse processo e reabrir. Nenhum estado parcial; commit ocorrido sem resposta aparece no snapshot. Matar processo não prova falha de energia: fault injection de I/O e prova de filesystem/dispositivo são evidências distintas. |
| P04 — Compatibilidade/integridade | Payloads v1–v4, versão SQL/payload futura, JSON inválido, IDs repetidos, tarefa/lixeira inválida, banco truncado, arquivo existente vazio e migração interrompida. Escritas bloqueadas quando inválido; original preservado, sem inicialização/reset ou descarte silencioso; rollback de migração verificável. |
| P05 — Falhas de escrita | Disco cheio, diretório sem permissão, falha de abertura/flush/commit e conexão concorrente mantendo lock. Prazo finito, código seguro, sem evento de sucesso antes de commit. Reabrir/confirmar integridade quando resultado for incerto; falha recuperável não envenena a fila. |
| P06 — Concorrência | Duas sessões/janelas pelo mesmo coordenador; CAS de revisão, operações em tarefas distintas e read/decide/commit intercalados com barreiras determinísticas. Edição stale recusa sem sobrescrever; primitivas condicionais usam dado recente. Não depender de sleeps ou timestamp como revisão. |
| P07 — Claim como primitiva | Dois claims da mesma ocorrência resultam em uma aplicação; prazo/status/reminder alterado ou tarefa removida torna claim antigo inaplicável. Claim versus edição não perde outro campo/`processedFor`; não altera revisão de conteúdo usada pelo futuro undo. Sem notifier/scheduler Windows nesta Change. |
| P08 — Subscriptions | Commit durante handshake, resposta antiga depois de evento, vários commits, evento perdido, no-op, erro, unsubscribe/repetição, reload/crash/fechamento. Snapshot consistente e revisão crescente; ressincronização converge, listeners removidos, nenhum evento entregue ao novo documento ou superfície não autorizada. |
| P09 — IPC e isolamento | Payloads/versões/campos extras/limites inválidos; webContents desconhecido, iframe, frame removido, origem/URL incorreta, sessão antiga e tentativa de cancelar inscrição alheia. Recusa antes de acessar dados; eventos/resultados sanitizados, sem callbacks/SQL/path/IPC bruto. |
| P10 — Ownership e encerramento | Segunda instância do perfil não abre banco; fechar/sair com operação pendente recusa novas entradas, termina ou reverte unidade em curso e fecha conexão. Manter encerramento provisório sem bandeja; interrupção forçada segue P03. |
| P11 — Runtime empacotado | No apply futuro: teste do banco de produto e bridge real no Electron empacotado com perfil fictício, sem Node/npm externos; registrar versões Electron/Node/SQLite e PRAGMAs efetivos, reopen e negativas. A prova antiga de `foundation-proof` não substitui essa evidência. |
| P12 — Limites e regressão | Dataset/bytes/tempo/fila/subscriptions definidos para revisão; erro seguro sem truncar snapshot ou bloquear indefinidamente. Gates existentes lint/typecheck/test/build e inspeção/smoke pertinentes passam; núcleo continua independente de Vue/Pinia/Electron. |

P02/P06/P07 testam contratos de persistência com fixtures e operações internas, não homologam UI, recorrência, undo, importação ou notificações futuras. Escolher/copiar somente os testes portáveis necessários após autorização de apply; substituir mocks Chrome por testes desktop, sem executar a origem.

**Dúvidas materiais a fechar no propose:** recorte de criar/editar/status via IPC (recomendação de mantê-los na TFA-004); aprovação do schema/path e configuração candidata; limites de snapshot/fila/tempo e necessidade real de worker; política de arquivo existente vazio/migração falhada/recuperação sem reset. A versão SQLite embarcada e PRAGMAs precisam de evidência no runtime para fechar a seleção, especialmente se escolher WAL. Detalhes de UX de conflito/undo, restore/backup e notificações pós-claim ficam nas respectivas Changes; não preencher por inferência.

**Riscos e mitigação proposta:** decisão stale apesar de writer único (coordenador + revisão); sobrescrita de claim (leitura atual + marcadores de servidor); `DatabaseSync` bloquear main (operações/espera limitadas e gate de volume); erro de schema ser tratado como perfil novo (preflight antes de DDL); evento pós-navegação vazar dados (sessão/documento + limpeza + revalidação); confundir rollback/kill com durabilidade de energia (evidências separadas); commit sem resposta provocar duplicação (ressincronizar, sem retry cego); adotar WAL sem conferir runtime/correções (gate explícito). Mudança material de mecanismo, worker ou recorte exige revisão antes do apply.

**Escopo recomendado:** fundação de armazenamento durável de tarefas/lixeira, codecs completos, transações/unidade de trabalho, revisões, erros seguros, sessões e IPC mínimo de leitura/subscriptions; primitives internas necessárias para testar integridade/conflito/claim, com dados fictícios. **Exclusões:** gerenciamento/UI e comandos funcionais das TFA-004+, geração de recorrência, UX lixeira/undo, importação/exportação/recuperação por backup, scheduler/notifier/bandeja/login, clipboard/atalhos, IA/credenciais, release/instalação e novo instalador. Sem backend, sincronização, histórico persistente, leitura do perfil Chrome ou mudanças na origem.

**Verificações executadas nesta exploração:** `npm run validate` com o Node 24.21.0/npm 11.21.0 já disponíveis passou: lint, typecheck nos cinco projetos, 7 arquivos/32 testes e build main/preload/renderer. Sem instalar pacotes. `openspec validate --all --strict --no-interactive --json`: 3/3 specs válidas (um INFO preexistente de requisito longo em windows-per-user-installation); `openspec validate --archived --strict --no-interactive --json`: 2/2 arquivos arquivados com tasks completas. Estes gates validam a fundação existente, não a implementação inexistente da TFA-003; não foram executados seus testes de durabilidade/concorrência, pacote de produto ou instalador.

### Prompt consolidado para opsx:propose

Prompt utilizado no pedido explícito de propose de 2026-10-04. O usuário determinou persistência/transações/erros e IPC mínimo de leitura/subscriptions, mantendo criar/editar/status na TFA-004; não pediu expansão. Recomendações da exploração não equivalem à aprovação dos artefatos ou autorização de apply.

```text
$openspec-propose TFA-003 — implementar-persistencia-local-e-fronteira-ipc

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc, criada de main c123261 (PR #2 integrado em 2026-10-04). Leia AGENTS.md, docs/roadmap.md (exploração TFA-003 e P01–P12), arquitetura/paridade/testes, os artefatos arquivados das TFA-001/002 e as specs consolidadas pertinentes. A extensão/Git em C:\QSI\Workspaces\taskflow-extension é somente leitura: não editar, instalar, testar ou construir nela; HEAD analisado a763e7a0d646c664ecd4f979528bc2c3589fa8c4.

Crie apenas proposal/design/specs/tasks desta Change pela CLI OpenSpec 1.14.0/schema spec-driven; sem skip_specs documental. Registre IN_PROGRESS/PROPOSE e início antes, IN_REVIEW/REVIEW depois. Proponha capacidades de persistência local e IPC de estado; modifique os requisitos pertinentes de desktop-foundation sobre catálogo/autorização/ownership, pois a exigência atual de bridge somente diagnóstica precisa evoluir coerentemente com o novo IPC. Não altere o contrato per-user por conveniência. Não implemente, escreva adapters, instale dependências, crie funcionalidades futuras, execute instaladores ou inicie apply/archive/commit/push/PR/merge/publicação. Entregue artefatos para revisão e registre/entregue prompt de apply, sem presumir aprovação.

Preserve Vue/Pinia + Electron, núcleo portável, renderer isolado e ownership do main. Recomende SQLite com node:sqlite embarcado no Electron 44.5.1/Node 24.21.0, caminho já provado e API RC aceita na TFA-002; configuração/schema/durabilidade ainda exigem revisão nesta Change. Compare JSON de envelope único com SQLite e justifique transações e recovery; sem fallback silencioso ou retorno a addon/rebuild. Proponha banco de produto separado do foundation-proof e sessionData, tarefas/lixeira com payload validado e metadados próprios, schema SQL separado do codec v4 e backup. Preserve todos os campos conhecidos, colisão ID_EXISTS no restore e codecs v1–v4 sem antecipar importação/funcionalidades avançadas.

Avalie uma conexão proprietária, journal DELETE/synchronous EXTRA, BEGIN IMMEDIATE, SQL parametrizado, lock wait e transações limitados. WAL/FULL é alternativa se justificada, com checkpoints/arquivos auxiliares e verificação da versão SQLite/correções no runtime. Não trate prova de rollback/reopen como prova de crash/energia. Defina abertura de perfil novo versus arquivo existente vazio, incompatibilidade, corrupção, migrações/rollback e recuperação sem reset/DDL prematuro/descarte automático.

Projete coordenação de read/decide/commit para todos os produtores futuros; revisão global e de conteúdo separadas, sem timestamp como controle de concorrência. Preserve processedFor atual, claim condicional interno e semântica futura de undo; não migre TaskService inteiro ou scheduler por conveniência. Efeitos externos sucedem commit sem prolongar transação; perda de resposta exige ressincronizar, sem retry cego. DatabaseSync é síncrono: defina volumes/bytes/tempo/fila; worker interno somente se necessário e revisado.

Feche o recorte material antes de concluir os artefatos: recomendação é persistência/transações/erros e IPC getStateSnapshot/subscribeState/unsubscribeState com eventos versionados; criar/editar/status via IPC ficam na TFA-004. Antecipá-los sem UI é alternativa apenas mediante decisão humana explícita, sem expandir o gerenciamento. Sem SQL/path/callback/repository/Task livre/UndoPlan/IPC genérico expostos; diagnóstico existente continua separado. Snapshot inicial e inscrição devem ser coordenados, com buffer/revisão, limpeza, eventos após commit, no-op e ressincronização; leitura não dispara expurgo. Defina limites sem truncar dados legítimos.

Valide webContents/main frame/origem real/URL/documento/sessão e schemas/limites em runtime, inclusive ao enviar eventos/respostas tardias. Invalide sessões em navegação/reload/crash/fechamento, preserve protocolo/CSP/sandbox/permissões negadas e renderer sem Node/fs. Erros como união discriminada e códigos seguros, sem stack/cause/paths/dados; não confiar em instanceof via invoke. Abertura externa HTTP/HTTPS permanece na TFA-004.

Refine P01–P12 em requisitos/cenários/tasks verificáveis: round-trip completo; transações tarefas/lixeira/saveMany; processo de teste interrompido antes/depois de COMMIT/resposta; I/O/lock/disco cheio; versão futura/dados inválidos/corrupção/arquivo vazio/migração; concorrência determinística e claim versus edição; subscriptions fora de ordem/navegação; IPC negativo; ownership/encerramento; limites e teste real no Electron empacotado com versões/PRAGMAs registrados. Gates existentes e OpenSpec estrito; testes portáveis copiados apenas no apply futuro aprovado. Não anunciar testes de produto planejados como executados. Pare após a proposta, mantendo exclusões das TFA-004–012 e a origem intacta.
```

### Proposta entregue para revisão — 2026-10-04

**Autorização e fluxo (registro da entrega):** o usuário invocou `$openspec-propose` para a TFA-003, determinando apenas proposal/design/specs/tasks, CLI 1.14.0 e schema spec-driven, sem skip_specs. Antes de criar a Change, o roadmap foi marcado `IN_PROGRESS`/`PROPOSE`, início 2026-10-04. Ao entregar os quatro artefatos obrigatórios, passou a `IN_REVIEW`/`REVIEW`; naquele momento não havia aprovação humana dos artefatos ou autorização de apply. O pedido fecha o recorte em persistência e estado; comandos de criar/editar/status permanecem na TFA-004. A aprovação posterior está registrada abaixo.

**Artefatos criados pela sequência da CLI e seus templates:** [proposal](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/proposal.md), [design](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/design.md), [tasks](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/tasks.md) e deltas [local-task-persistence](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/specs/local-task-persistence/spec.md), [desktop-state-ipc](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/specs/desktop-state-ipc/spec.md) e [desktop-foundation](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/specs/desktop-foundation/spec.md). São 27 requisitos, 66 cenários e 42 tasks pendentes. `.openspec.yaml` foi criado pela CLI, sem skip_specs; specs consolidadas/per-user e arquivos arquivados não foram alterados.

**Decisões propostas para revisão:** SQLite node:sqlite embarcado, uma conexão/fila no main, DELETE/EXTRA, BEGIN IMMEDIATE, SQL parametrizado e lock wait 100 ms; produto `<userData>/data/taskflow.sqlite`, SQL schema 1 separado de codec v4/backup; payload validado e PKs independentes tarefas/lixeira preservando ID_EXISTS. Arquivo existente vazio/incompatível bloqueia sem reset/DDL; recovery normal do motor e migração registrada são transacionais. Revisão global e de conteúdo distintas, claim preserva processedFor/updatedAt e conteúdo. Não migrar TaskService inteiro, scheduler, undo ou backup funcional.

**Estado e limites propostos:** bridge de três operações de estado mais diagnóstico separado, snapshots paginados com revisão verificada e eventos de invalidação após commit; buffers/coalescing, ressync no foco/a cada 30 s, cleanup/reautorização por documento/sessão. Requests/eventos 1 KiB, páginas 256 KiB com fragmentação de registro, sem limite total de coleção; fila 64/8 por sessão, espera 2 s; um cursor/inscrição por documento, cursor 30 s, até oito documentos no harness. Gate de 1.000/10.000 tarefas +100 itens de lixeira e ao menos 20 MiB, p95 100 ms/preflight 5 s/drain alvo 5 s. São orçamentos para revisão e medição futura, não desempenho já comprovado. Worker/WAL ou relaxamento material exige revisão; nenhuma mudança silenciosa.

**Validações executadas nesta proposta:** `openspec status` informa 4/4 artefatos completos; validação estrita da Change sem issues; `openspec validate --all --strict --no-interactive --json` passa em 4/4 itens (3 specs existentes + Change; INFO preexistente de requisito longo per-user), e `--archived` passa em 2/2. `npm run validate` com Node 24.21.0/npm 11.21.0 já disponíveis passou: lint, cinco typechecks, 7 arquivos/32 testes e build main/preload/renderer. Links locais dos seis arquivos da proposta existem. Estes resultados validam planejamento e fundação existente; P01–P12 de produto, crash/I/O/concorrência, bridge ampliada, benchmarks e pacote de produto **não foram executados**. Sem novo empacotamento, instalador ou instalação de dependências.

**Pendências ao entregar a proposta:** revisão humana dos artefatos e das decisões/orçamentos, aprovação explícita e novo pedido de apply. A revisão/aprovação foi posteriormente concluída pelo pedido registrado abaixo; o pedido de apply continua pendente. A extensão/HEAD permanece `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, somente leitura. Sem código/adapters, funcionalidades futuras, commit/push/PR/merge/archive/publicação. O relatório verification.md será gerado somente após apply autorizado; não existe nesta proposta.

### Aprovação dos artefatos — 2026-10-04

**Evidência humana nesta conversa:** após receber os artefatos para revisão, o usuário declarou: **“Pode aprovar os artefatos”**. A aprovação abrange a versão entregue de proposal, design, os deltas local-task-persistence/desktop-state-ipc/desktop-foundation e tasks da TFA-003, incluindo decisões/orçamentos e o recorte de persistência/transações/erros e IPC de leitura/subscriptions. Estado atualizado para **APPROVED/READY_FOR_APPLY**. Criar/editar/status e abertura externa permanecem na TFA-004; as 42 tasks continuam pendentes.

Este pedido aprova os artefatos e seu registro no roadmap; não solicita iniciar apply, implementar, arquivar, commitar, publicar ou avançar a outra Change. As observações de aprovação pendente nos artefatos descrevem o momento em que foram elaborados; este registro estabelece a aprovação posterior sem alterar seu conteúdo técnico. Próxima ação: usar o prompt abaixo mediante pedido explícito de apply.

### Prompt consolidado para opsx:apply

Artefatos aprovados conforme registro acima; prompt preparado para o próximo pedido explícito de apply. A frase de aprovação dentro deste bloco é um modelo para esse pedido; sua presença no roadmap não inicia implementação. Ajustar o prompt se uma revisão posterior alterar materialmente os artefatos.

```text
$openspec-apply-change TFA-003 — implementar-persistencia-local-e-fronteira-ipc

Aprovo os artefatos revisados proposal/design, os três deltas de specs e tasks desta TFA-003 e autorizo aplicar somente o recorte de persistência/transações/erros e IPC de leitura/subscriptions descrito neles. Não autorizo comandos de criar/editar/status ou gerenciamento da TFA-004.

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc, base main c123261/PR #2 integrado em 2026-10-04. Leia AGENTS.md, docs/roadmap.md, os artefatos atuais da Change, arquitetura/paridade/testes e specs/dependências pertinentes. Confirme a aprovação explícita nesta conversa e use a CLI OpenSpec instalada 1.14.0/schema spec-driven, status e instructions apply. Preserve trabalho preexistente. A extensão e seu Git em C:\QSI\Workspaces\taskflow-extension são somente leitura, HEAD de referência a763e7a0d646c664ecd4f979528bc2c3589fa8c4: não editar, instalar, testar, construir ou alterar Git/configurações nela.

Implemente as 42 tasks aprovadas, registrando progresso e evidência real. Preserve Vue/Pinia + Electron e núcleo portável estrito. Reutilize por cópia revisada apenas tipos/validadores/codecs/testes portáveis necessários; não copie adapters Chrome, dados reais, IA ou TaskService/scheduler inteiros. Não instale dependências novas nem troque runtime/driver/lockfile por conveniência. Use node:sqlite embarcado no Electron 44.5.1/Node 24.21.0, API RC aceita na TFA-002; sem addon/rebuild/JSON fallback silencioso.

Banco de produto <userData>/data/taskflow.sqlite separado de foundation-proof/sessionData, schema SQL 1/codec v4/backup distintos, payload validado e todos os campos conhecidos, codecs v1–v4 e ID_EXISTS no restore. Uma conexão/coordenador no main para read/decide/validate/commit de todos os produtores; BEGIN IMMEDIATE, DELETE/EXTRA, foreign_keys, SQL parametrizado, lock wait 100 ms. Preflight antes de DDL: inexistente cria transacionalmente; existente vazio/estranho/incompatível/corrompido bloqueia sem reset/rewrite/descarte. Migrações registradas e recovery/reopen preservam origem; fixture de migração não vira schema fictício de produto. Revisões global e de conteúdo persistidas/monotônicas sem timestamp/precisão perdida/ABA; claim interno conserva processedFor atual, updatedAt e revisão de conteúdo, sem notifier/scheduler. Efeitos e eventos sucedem commit, sem await externo em transação; resposta perdida exige ressync, sem retry cego de mutação.

Preload expõe getStateSnapshot/subscribeState/unsubscribeState e verifyFoundation separado. Não expor Task livre, SQL/path/callback/repository/UndoPlan/canal genérico ou hook de escrita/teste na bridge normal. Snapshot paginado com mesma revisão, fragmentos completos e SNAPSHOT_STALE se revisão mudar; inscrição e primeira página coordenadas, buffer de invalidações, ressync sem regressão, três reconstruções imediatas e BUSY sob churn, reconciliação no foco/a cada 30 s. Leitura não expurga. União de erros/códigos seguros, sem stack/cause/paths/payloads ou instanceof remoto. Revalidar webContents/main frame/origem real/URL/documento/sessão na admissão, execução e envio; invalidar em navegação/reload/crash/fechamento. Preserve protocolo/CSP/sandbox/contextIsolation/permissões negadas e renderer sem Node/fs; abertura externa HTTP/HTTPS fica na TFA-004.

Respeite orçamentos aprovados: requests/eventos 1 KiB, páginas 256 KiB com Unicode/escaping e fragmentação sem truncamento/limite total da coleção; um cursor/inscrição por documento, cursor 30 s, oito documentos de teste; fila 64/8 por sessão e espera 2 s; gate 1.000/10.000 tarefas +100 itens de lixeira e >=20 MiB, p95 100 ms/preflight 5 s/drain alvo 5 s. DatabaseSync é síncrono: medir bloqueio/heartbeat/hardware, não fingir timeout capaz de interromper commit. Se gate exigir worker, WAL, outra configuração ou relaxamento material, revise artefatos e solicite revisão do ponto afetado antes de implementá-lo; continue trabalho independente autorizado.

Execute e registre P01–P12: round-trip completo; atomicidade tarefas/lixeira/saveMany; kill somente do processo de teste em barreiras antes/durante/depois de COMMIT/antes da resposta, distinguindo falha de energia; I/O/disco cheio/permissão/lock reais controlados ou fault injection identificado; codec/schema futuros, inválidos, corrupção, vazio e migração rollback; concorrência/CAS/ABA determinísticos, claim versus edição; subscriptions/ordem/perda/navegação; IPC negativo com zero leitura antes do guard; ownership/drain; limites. Harness real de produto e bridge no Electron empacotado em perfis fictícios, sem Node/npm externos; registre Electron/Node/SQLite e PRAGMAs efetivos e correções relevantes. Não usar prova foundation-proof como substituto de produto. Não instalar/executar Setup ou publicar.

Execute gates existentes npm run validate e OpenSpec estrito; package verification/smoke e testes ampliados pertinentes, com evidências/limites claros. Atualize documentação operacional/arquitetura/paridade/testes somente do que existir. Ao concluir apply, execute openspec-verify-change e gere verification.md nesta Change com aderência requisito/cenário/task/evidência e pendências. Pare em revisão e aguarde aprovação explícita do relatório; não archive, commit/push/PR/merge, instale em máquina corporativa, distribua ou inicie TFA-004–012. README factual após archive autorizado conforme AGENTS.md.
```

### Apply autorizado e iniciado — 2026-10-04

**Evidência humana nesta conversa:** o usuário invocou `/opsx:apply` com o prompt acima, declarando: **“Aprovo os artefatos revisados proposal/design, os três deltas de specs e tasks desta TFA-003 e autorizo aplicar somente o recorte de persistência/transações/erros e IPC de leitura/subscriptions descrito neles. Não autorizo comandos de criar/editar/status ou gerenciamento da TFA-004.”** Estado: **IN_PROGRESS/APPLY**, início do apply em 2026-10-04.

**Conferido antes de qualquer escrita:** diretório `C:\QSI\Workspaces\taskflow-app`, raiz Git própria, branch `codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc`, merge-base com `main` em `c123261`; alterações preexistentes preservadas (`docs/roadmap.md` modificado e diretório da Change ainda não versionado). OpenSpec 1.14.0, schema `spec-driven`, raiz local, `state: ready`, 0/42 tasks. HEAD da extensão reconferido em leitura: `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, sem alterações nela.

**Escopo autorizado:** as 42 tasks dos artefatos aprovados. **Fora do escopo:** criar/editar/status e gerenciamento (TFA-004), abertura externa de URLs, funcionalidades das TFA-005–012, instalação/execução de Setup, publicação, archive, commit/push/PR/merge. Mudança material (worker, WAL, outra configuração ou relaxamento de orçamento) exige revisão dos artefatos antes de implementar o ponto afetado.

### Apply concluído e verificação entregue — 2026-10-04

**Resultado:** 42/42 tasks concluídas, cada uma marcada somente depois da sua verificação. [Relatório de verificação](../openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/verification.md) gerado na própria Change: 27/27 requisitos e 66/66 cenários mapeados, nenhum problema crítico, 6 avisos e 5 sugestões. Estado **IN_REVIEW/REVIEW**; a aprovação do relatório não foi inferida.

**O que passou a existir:** banco de produto `<userData>/data/taskflow.sqlite` (schema SQL 1, codec v4, `node:sqlite` embarcado, `DELETE`/`EXTRA`), preflight que só inicializa na ausência real, executor de migrações registradas (nenhuma no produto), coordenador com fila e conexão únicas, primitives internas de tarefas/lixeira/edição condicional/claim, revisões global e de conteúdo, sessões por documento e as operações `getStateSnapshot`/`subscribeState`/`unsubscribeState` ao lado de `verifyFoundation`. Documentação em [local-persistence-and-state-ipc.md](local-persistence-and-state-ipc.md), com atualizações em arquitetura, paridade e estratégia de testes.

**Evidências (2026-10-04, Node 24.21.0/npm 11.21.0):** `npm run validate` com lint, cinco typechecks, 19 arquivos/358 testes e build; OpenSpec estrito da Change e de todos os itens (4/4); `package:win` sem publicar nem executar o Setup; `verify:package`; `smoke:packaged` ampliado com o harness de produto no Electron empacotado em perfil fictício — bridge com 27 verificações, segunda instância, reopen, kill do processo de teste em cinco barreiras, drain e benchmark. Runtime medido: Electron 44.5.1, Node 24.21.0, SQLite 3.53.4. Gate de limites aprovado com 10.000 tarefas/23,9 MiB (mutação p95 3,24 ms, página p95 4,11 ms, preflight 235 ms), sem worker, WAL ou relaxamento.

**Limites e pendências registrados no relatório:** falhas de COMMIT/ROLLBACK e de I/O em migração são fault injection identificado; kill de processo não é prova de energia; não houve instalação pelo Setup com dados de produto; a espera de lock configurada em 100 ms foi observada em ~170 ms; a substituição de 10.000 tarefas num commit bloqueia o main por cerca de meio segundo; o fechamento pela janela depois do cenário `bridge` do harness não encerrou o processo (o cenário S8 cobre o fechamento com o banco aberto); o smoke ampliado ainda não rodou na CI.

**Garantias de escopo:** nenhum comando de criar/editar/status, UI de tarefas ou abertura externa; nenhuma dependência, runtime ou lockfile alterado; extensão intacta no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`; sem archive, commit, push, PR, merge, instalação ou distribuição. README inalterado até o archive autorizado (AGENTS.md, itens 38 e 43).

**Próxima ação naquele momento:** revisão humana do relatório. O desfecho está registrado a seguir.

### Aprovação, archive e conclusão — 2026-10-04

**Evidência humana nesta conversa:** depois de receber o relatório, o usuário determinou: **“rode o opsx:verify e não tendo nenhum crítico ou warning bloqueante pode aprovar. Em seguida rode o archive e após isso commit, faça o push e abra o PR. Deixe o TFA-004 preparado para iniciar quando for mergeado. Já deixe o TFA-003 done, pois quando for mergeado já estará done”**.

- **Verificação reexecutada:** 42/42 tasks, `npm run validate` (lint, cinco typechecks, 19 arquivos/358 testes, build) e OpenSpec estrito aprovados; nenhum problema crítico. Os seis avisos são limites de evidência e pendências registradas, não bloqueantes; o relatório foi aprovado nessas condições e a aprovação está registrada nele.
- **Archive:** executado pela CLI OpenSpec 1.14.0 na mesma branch, em `openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/`. Specs consolidadas: `local-task-persistence` (14 requisitos adicionados), `desktop-state-ipc` (10 adicionados) e `desktop-foundation` (3 modificados). `openspec validate --all --strict` passa nas 5 specs.
- **README:** atualizado para o funcionamento atual (item 38 do AGENTS.md), sem status de desenvolvimento.
- **Integração:** commit, push e PR feitos a partir de `codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc`. O merge é ação do usuário.
- **Estado DONE antecipado:** pelo item 44 do AGENTS.md, `DONE` normalmente só é marcado após a integração na principal. Aqui ele foi registrado antes do merge por decisão explícita do usuário, para que a `main` já o contenha ao integrar o PR. Se o PR for alterado ou recusado, este estado deve ser revisto.
- **Avisos que seguem abertos** (detalhes no relatório): simulações de COMMIT/ROLLBACK/I/O de migração; espera de lock observada em ~170 ms; ausência de prova de energia e de instalação com dados de produto; reconciliação de 30 s e crash do renderer só em unidade; bloqueio de ~0,5 s ao substituir 10.000 tarefas num commit; fechamento pela janela após o cenário `bridge` do harness e primeiro run da CI com o smoke ampliado.

## TFA-004 — Gerenciamento de tarefas e interface principal

**Slug sugerido:** `migrar-gerenciamento-de-tarefas-e-interface`. **Dependências:** TFA-003.

**Resultado:** Disponibilizar gerenciamento local com o comportamento atual de tarefas, pesquisa e filtros.

**Escopo previsto:** Reutilizar por cópia revisada domínio, aplicação, componentes e store pertinentes. Criar/editar tarefas, campos e validação, tags, URL de origem, prioridade, prazo, responsáveis, status, conclusão/cancelamento/reabertura, pesquisa, filtros combináveis e ordenação. Adaptar a superfície de Side Panel para janela desktop preservando identidade e acessibilidade.

**Critérios de aceitação para refinar na proposta:** Paridade observável dos campos e ações básicas; pesquisa nos campos existentes; filtros e ordenação combináveis; prazos no fuso local; foco e navegação por teclado equivalentes; falhas de armazenamento com feedback. Casos dependentes de recorrência, lixeira e IA só entram quando suas Changes forem entregues.

### Preparação para iniciar — 2026-10-04 (registro anterior à exploração)

**Estado naquele momento: READY_FOR_EXPLORE**, condicionado ao merge do PR da TFA-003. Nenhum artefato, diretório, branch ou código da TFA-004 havia sido criado; esta nota registra o ponto de partida. A conferência e a branch solicitadas posteriormente estão registradas na exploração abaixo.

**Antes de começar:** conferir que o PR da TFA-003 está integrado na `main`; atualizar a `main` local; criar `codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface` a partir dela; confirmar `npm run validate` e `openspec validate --all --strict --no-interactive` verdes nessa base.

**O que a TFA-003 deixou pronto para esta Change** (contrato em [local-persistence-and-state-ipc.md](local-persistence-and-state-ipc.md)):

- Leitura para a interface: `getStateSnapshot`, `subscribeState` e `unsubscribeState`, com snapshot completo por revisão, `contentRevision` por tarefa e atualizações `snapshot`/`stale`. Nenhuma tela consome isso ainda.
- Escrita interna: `StorageCoordinator.run` com `saveTask`, `deleteTask`, `moveToTrash` e, principalmente, `updateTaskConditionally(id, contentRevision, change)`, que devolve `CONFLICT` para base stale e conserva `processedFor`. Os casos de uso de criar/editar/status devem decidir **dentro** da unidade, no main.
- Autorização por documento/sessão e união fechada de erros, reutilizáveis pelos novos comandos.

**O que esta Change precisa decidir e construir** (itens para a exploração, não decisões tomadas):

- Catálogo de comandos de mutação no IPC (criar, editar, mudar status, excluir) e seus schemas, incluindo `CONFLICT` e erros de validação por campo como códigos públicos; relógio e geração de ID no main.
- Cópia revisada de `task-draft` (limites e validação de formulário), `task-status`, `task-queries` e dos componentes/stores da extensão; o armazenamento hoje não aplica limites de formulário.
- UX de conflito de edição preservando o draft; estados vazio, carregando, `stale` e indisponível.
- Abertura externa de URLs HTTP/HTTPS com validação final no main.
- Exclusão: a primitive move para a lixeira sem retenção nem limite; a política e a tela da lixeira são da TFA-006 — definir o que a TFA-004 oferece sem antecipar aquela Change.
- Pontos herdados do relatório da TFA-003 a observar: primeiro run da CI com o smoke ampliado; crash do renderer e reconciliação de 30 s/foco com uma UI real inscrita; comportamento de fechamento com mais de uma superfície.

### Prompt para opsx:explore

```text
/opsx:explore TFA-004 — migrar-gerenciamento-de-tarefas-e-interface

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia TaskManager.vue, TaskForm.vue, TaskList.vue, TaskFilters.vue, stores/task-store.ts e testes de domínio, aplicação e componentes na origem. Identifique o que pode ser reutilizado sem alterar comportamentos, os acoplamentos ao Chrome e ajustes necessários para uma janela desktop. Preserve identidade visual e acessibilidade; não proponha redesign. Defina a matriz de casos básicos, estados vazios, erros, foco, URLs externas e prazos no fuso local. Delimite os recursos avançados das Changes seguintes e evite oferecer controles ainda sem implementação.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

### Exploração concluída — 2026-10-04

**Autorização e estado:** o usuário invocou `openspec-explore` para a TFA-004 e pediu expressamente criar a branch e atualizar o roadmap. Branch local **`codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface`**, criada da `main` limpa em **`d74e02df7aa38e13fd631a6a83ab2d07b96d8e42`**, merge do **PR #3**. `main` e a referência local `origin/main` coincidem nessa base. Conferência pelo histórico Git local, sem fetch/pull/merge; a consulta complementar por `gh pr view 3` retornou HTTP 401, portanto não há nova comprovação remota dos checks da CI. O commit `8fbc5b9`, integrante do merge, corrige o relógio do teste de limite de fila; isso não substitui a leitura do resultado da CI.

**Estado ao encerrar a exploração: READY_FOR_PROPOSE/EXPLORE**, com os pontos materiais abaixo registrados; não significava aprovação dos recortes recomendados. Início/conclusão da TFA-004 ainda estavam sem data. Nenhum diretório, proposal, design, spec, task ou código da TFA-004 havia sido criado; apenas este roadmap fora editado. A origem permaneceu somente leitura no HEAD **`a763e7a0d646c664ecd4f979528bc2c3589fa8c4`**, reconferido naquela sessão; não houve testes, builds, dependências ou comandos Git de escrita nela. O pedido posterior de propose está registrado abaixo.

**Dependências consultadas:** proposal/design/tasks/verification arquivados da TFA-003 e das fundações TFA-001/002, deltas consolidados de `local-task-persistence`, `desktop-state-ipc` e `desktop-foundation`, documentação de arquitetura/persistência/paridade/testes, contratos e código da fundação. OpenSpec **1.14.0**, raiz local e schema **`spec-driven`**; zero Changes ativas e cinco specs. Já existem codecs completos, snapshot validado com revisão global e `contentRevision`, subscriptions/ressincronização e coordenador no main. O shell ainda é diagnóstico, sem comandos de mutação, tela de tarefas ou abertura externa. A proposta precisa evoluir explicitamente as restrições de catálogo e shell das specs existentes; acrescentar uma spec de gerenciamento sem modificar essas restrições deixaria os artefatos contraditórios.

#### Achados e reaproveitamento por revisão

| Referência lida | Comportamento verificado | Tratamento recomendado para o futuro apply |
| --- | --- | --- |
| [TaskForm: campos e emissão](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskForm.vue:725), [validação](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:407) e [testes de campos](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskForm.test.ts:19) | Título obrigatório; descrição, solicitante, responsável, status, prioridade, prazo, tags e origem. Defaults TODO/MEDIUM; trim de textos, vazios opcionais ausentes; tags por vírgula, deduplicação por caixa preservando a primeira grafia. Limites: 200/4000/120 caracteres; 10 tags de 30. URL aceita HTTP/HTTPS; não há limite de comprimento nem rejeição de userinfo nessa regra. | Reutilizar campos, rótulos, mensagens, estilos e validação básica; revalidar tipos/shape e domínio no main. Não confiar no maxlength do DOM nem transportar Task inteiro como entrada. Separar validação de formulário da compatibilidade histórica do codec. |
| [TaskForm: recursos avançados](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskForm.vue:176) e [TaskManager](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:2) | O formulário mistura subtarefas, recorrência, lembretes e IA; o manager inclui captura, confirmação de série, undo, lixeira, backup e provedores. Ausência de serviços de IA oculta a ação, mas não remove os imports/módulos. | Reaproveitar seletivamente a superfície básica; não copiar o componente inteiro com serviços fictícios. Não montar controles/handlers/imports de funcionalidades futuras. |
| [TaskFilters](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskFilters.vue:1), [consultas](C:/QSI/Workspaces/taskflow-extension/src/domain/task-queries.ts:44) e [testes](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-queries.test.ts:45) | Pesquisa como substring, trim e caixa ignorada em título, descrição, pessoas, tags **e títulos de subtarefas**. Não pesquisa sourceUrl, não remove acentos e não tokeniza palavras. Filtros usam AND. Ordenação default DUE_DATE: prazo crescente, ausentes por último e criação mais recente no empate; PRIORITY: URGENT/HIGH/MEDIUM/LOW e criação; STATUS: TODO/IN_PROGRESS/DONE/CANCELLED, prazo e criação. Limpar filtros mantém a ordenação. | Cópia revisada das funções puras e do TaskFilters quase integral. Preservar pesquisa em subtarefas já presentes no snapshot, mesmo antes da UI da TFA-005. Não adicionar pesquisa de URLs, novas ordenações ou novos filtros. |
| [Status](C:/QSI/Workspaces/taskflow-extension/src/domain/task-status.ts:7), [TaskList](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskList.vue:176) e [testes de teclado](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskList.test.ts:283) | DONE registra completedAt; outro status limpa; mesmo status conserva timestamps e não grava. Reabrir rápido vai a TODO. Setas/Home/End/PageUp/PageDown só escolhem; Enter confirma; focusout confirma preservando foco que já se moveu; Escape descarta; ponteiro confirma imediatamente. Controles ocupados continuam focáveis com aria-disabled e handlers que ignoram repetição. | Reutilizar domínio e regras de teclado/foco; criar comando de status validado e condicionado à revisão da tarefa. Não substituir o seletor por gravação em cada seta nem por controles disabled que removem o foco. |
| [Foco e estados](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:143), [testes de foco](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskManager.test.ts:898) e [CSS base](C:/QSI/Workspaces/taskflow-extension/src/styles/base.css:1) | Hierarquia h1/h2/h3, live region, alerts, label/for, aria-invalid/describedby, foco inicial no título, primeiro erro ou alerta, retorno a Nova tarefa, controle equivalente após ação e vizinho/limpar filtros quando o cartão some. Tokens de cor, contraste e focus-visible explícitos. | Preservar CSS base e estilos dos componentes pertinentes, sem redesenhar. Ajustar apenas dimensões/overflow/wrapping necessários à janela (780×560, mínimo 360×420 hoje), zoom e escala Windows; não somar ao CSS global do shell diagnóstico de modo a conflitar. Escapar IDs em seletores ou usar refs seguras, pois o codec não exige UUIDs. |
| [Store](C:/QSI/Workspaces/taskflow-extension/src/stores/task-store.ts:66), [composição Chrome](C:/QSI/Workspaces/taskflow-extension/src/composition/chrome-task-service.ts:16) e [bootstrap Side Panel](C:/QSI/Workspaces/taskflow-extension/src/entrypoints/sidepanel/main.ts:23) | Store não usa chrome diretamente: recebe TaskService, mas esse tipo inclui scheduler/lixeira/undo; usa instanceof para erros, list+subscribe sem revisões e upsert local. Chrome está na composição, repositories, alarms, captura e atalhos. | Reutilizar getters/filtros/seleção e estado de apresentação; adaptar load/connect/mutate a uma porta desktop estreita. Fonte de verdade é snapshot versionado do preload existente; erros por discriminante, nenhum instanceof remoto. Retirar WXT e injeções Chrome; não emular browser/chrome nem criar writer no renderer. |
| [TaskService.update/status](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:274), [CAS desktop](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:244) e [contrato](C:/QSI/Workspaces/taskflow-app/src/application/storage/unit-of-work.ts:146) | O serviço da origem lê antes de salvar e mistura transições de série, scheduler e undo. O desktop já oferece read/decide/commit com revisão de conteúdo e conservação de processedFor. | Reutilizar regras e cenários básicos, **adaptando a orquestração** dentro do coordenador. Clock/IDs no main; criação não pode sobrescrever ID existente por acidente. Edição/status com CAS, ausência/conflito explícitos; nenhum await de shell/rede na transação. Não migrar TaskService inteiro ou scheduler no-op. |
| [Omissão de avançados](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:454), [updateTask](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:580) e [subtarefas omitidas](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-draft.test.ts:746) | Omitir reminders vira []; omitir recurrence remove regra; omitir subtasks preserva os itens. Remover fieldsets e enviar o draft antigo sem esses campos apagaria dados válidos. O formulário também reconverte prazo só até minutos. | DTO de campos básicos, com alteração/limpeza explícitas; main relê e conserva avançados. Não aceitar advanced fields/processedFor do renderer nem enviar listas vazias para campos ocultos. Testar dados históricos extensos e ISO com segundos/milissegundos, sem truncamento silencioso. |
| [Prazo](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/date-time.ts:13) e [casos de fronteira](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-queries.test.ts:13) | datetime-local representa fuso do sistema; conversão usa Date local e ISO UTC, apresentação pt-BR. Data impossível é rejeitada pela comparação das partes. Atrasada: ativo e dueAt < now; até 24h: intervalo inclusivo [now, now+24h], não o próximo dia do calendário. Terminais/sem prazo não recebem esses badges. Store atualiza relógio a cada 60 s. | Preservar funções/casos de fronteira; atualizar relógio também ao retomar foco/suspensão. Não fixar -03:00 nem America/Sao_Paulo no produto. Prazo não alterado deve conservar ISO original, inclusive precisão e instante em horário repetido; testar gaps/repetição e mudança de fuso com form aberto. |
| [Origem no formulário](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskForm.vue:1419) e [TaskList](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskList.vue:259) | sourceUrl é editável, mas o cartão consultado não mostra link/botão de abertura; descrição/pessoas/tags também não são expandidas no cartão. Abertura externa é adaptação desktop prevista na arquitetura, não paridade já existente nesses componentes. | Manter conteúdo atual do cartão. Propor ação mínima de abrir **origem salva**, perto do campo de URL, mediante gesto explícito; main lê origem pelo ID/revisão, valida e abre navegador padrão. Não adicionar previews, fetch, links automáticos na descrição ou navegação remota na janela. |

#### Alternativas e recomendação de arquitetura

| Alternativa | Benefício / custo | Recomendação |
| --- | --- | --- |
| Cópia revisada dos campos/componentes e consultas, com store/porta desktop e casos de uso básicos no main | Preserva comportamento/CSS/testes, aproveita persistência pronta e explicita os recortes temporários. Exige ajustar orquestração, revisões e dados ocultos. | **Preferida**; é o baseline Vue/Pinia + Electron já aprovado. |
| Copiar manager/form/store/TaskService completos e fingir scheduler/lixeira/captura/IA disponíveis | Menos diff inicial, mas oferece ações sem efeito, apaga avançados por omissão e leva acoplamentos/fila antiga ao desktop. | Rejeitar; mocks não são implementação de produto. |
| Reescrever UI ou adotar Quasar nesta Change | Adiciona migração visual e de teclado, sem benefício demonstrado para o recorte básico. | Fora do escopo; não reabrir a escolha da TFA-001. |
| Aplicar mutações no renderer ou receber Task livre | Facilita reaproveitar assinatura antiga, mas permite campos de auditoria/avançados e decisões stale fora da transação. | Rejeitar; comandos básicos fechados, autoridade no main. |

```text
Componentes Vue --> store de apresentacao --> porta desktop
                                            |
                       preload: comandos + snapshots/revisoes
                                            |
                main: sessao + schema --> casos de uso portaveis
                                            |
                        coordenador: ler --> decidir --> commit
                                            |
                             SQLite --> invalidacao --> snapshot

Origem salva + gesto --> main: validar URL --> navegador padrao
```

Catálogo candidato: **createTask, updateTask, changeTaskStatus, openTaskSource**; nomes/versão/schema finais no propose. Editar/status usam revisão de conteúdo obtida quando o usuário abriu/acionou a tarefa; mudança em outra tarefa ou claim isolado não gera falso conflito. Sucesso inclui ID e revisões suficientes para aguardar snapshot >= revisão confirmada; resposta tardia não faz upsert sobre snapshot mais novo. Erros fechados incluem validação por campo/código, NOT_FOUND, CONFLICT, indisponibilidade, limites e sessão inválida, traduzidos em pt-BR sem payload/stack/path.

**Conflito recomendado:** manter integralmente o draft e a revisão-base; atualizar o estado da lista sem sobrescrever os inputs. Mostrar mensagem focável e oferecer recarregar a versão atual com descarte **explícito** do draft, ou continuar revisando/copiar o preenchimento para reaplicar após nova decisão. Não fazer merge automático ou simplesmente trocar a revisão e reenviar o draft. O texto final e eventual confirmação do descarte serão refinados no propose. Resultado perdido após possível commit conserva draft, sinaliza resultado incerto e exige ressync/revisão antes de nova escrita; comparação de título não comprova se uma criação aconteceu. Sem retry automático, duplicação por duplo envio ou falso anúncio de rollback.

O limite de **1 KiB** das operações de leitura/diagnóstico não cabe nos campos do formulário (descrição aceita 4000 caracteres). Propose deve definir orçamento **separado** de mutação, contando UTF-8/envelope/escaping, e saída curta com estado completo pelo snapshot paginado existente. Um candidato a medir é 64 KiB para os campos básicos usuais, sem tratar isso como decisão aprovada ou limite histórico do banco. sourceUrl e IDs históricos não têm limite equivalente na origem: definir recusa segura quando exceder transporte e preservação de valores não alterados, sem cortar ou impor novo limite de codec. Manter budgets de leitura, fila e sessões da TFA-003. Validar remetente na admissão, execução e entrega também nos comandos novos.

**URLs externas:** parse no main, somente HTTP/HTTPS, host válido, sem userinfo/controles/protocolos file/javascript/data/mailto/taskflow/UNC; não usar workingDirectory ou opções arbitrárias vindas do renderer. Preservar a URL armazenada mesmo quando sua abertura for recusada. A API documenta **2081 caracteres no Windows**: URL maior deve receber erro de abertura, não ser truncada ou regravada. Falha do navegador não altera a tarefa. A ação não prova que um site foi carregado ou é seguro; não é necessário oferecer confirmação adicional para toda URL normal. Gesto na UI, validação final e isolamento seguem [segurança Electron](https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-shellopenexternal-with-untrusted-content) e [shell.openExternal](https://www.electronjs.org/docs/latest/api/shell#shellopenexternalurl-options). Conferir também tipos/API do Electron fixado no propose/apply, sem mudar runtime nesta exploração.

**Fuso:** a recomendação preserva a interpretação local da origem para entrada nova; horas repetidas usam a escolha anterior de Date, e gaps são recusados pela checagem das partes. Conservar o ISO original quando o campo não for alterado evita deslocamento de instante/precisão. Com fuso do SO mudado durante a edição, não reinterpretar silenciosamente o draft: detectar e pedir revisão do prazo ou conservar a interpretação capturada ao abrir, decisão a fechar no propose. Referência: [Date e transições de offset](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_components_and_time_zones). São adaptações a refinar, não correções já implementadas.

#### Escopo, exclusões e decisões ainda materiais

**Escopo recomendado:** janela principal de tarefas locais; criar/editar campos básicos e status, concluir/cancelar/reabrir tarefas simples, pesquisa/filtros/ordenação e feedback acessível; comandos de mutação seguros e origem salva aberta no navegador padrão; sincronização da UI com persistência entregue. Manter o diagnóstico já existente acessível em posição secundária, sem misturá-lo à jornada normal de tarefas ou adicionar informações técnicas aos formulários. Não criar segunda janela de produto agora.

| Recurso avançado | Limite temporário da TFA-004 / Change responsável |
| --- | --- |
| Recorrência e subtarefas | Criar/alterar regra, gerar/pular/encerrar ocorrência, adicionar/reordenar/marcar subtarefa ficam na TFA-005. Conservar dados e busca de títulos existentes. Proposta conservadora: recorrência presente torna a tarefa somente leitura até TFA-005, para não tratar conclusão de série como tarefa simples. Subtarefas existentes podem ser texto somente leitura enquanto campos básicos são editados com preservação integral. |
| Exclusão, lixeira e undo | **Recomenda-se adiar Excluir para TFA-006**, junto com recuperação, retenção/expurgo e desfazer; não expor delete definitivo nem anunciar restauração ausente. Alternativa: antecipar exclusão recuperável, o que exige decidir política/recuperação e revisar a divisão da TFA-006. Consulta opcional apresentada ao usuário nesta exploração; sem resposta registrada, a recomendação continua candidata e não autoriza a alternativa. |
| Backups/migração | TFA-007; não mostrar Backup/Restaurar no header ou vazio, nem ler perfil Chrome/importar automaticamente. Nenhum dado real migrado. |
| Lembretes e lifecycle | TFA-008; não oferecer lembretes, notificações, bandeja/login ou mensagens de agendamento. Conservar reminders/processedFor em edits independentes. Proposta conservadora para fixtures/dados avançados já presentes: bloquear alteração de prazo/status com reminders até sua integração, pois a origem liquida/reconcilia ocorrências nessas ações. Fechar encerra o app provisório como hoje. |
| Quick Add, captura e atalhos | TFA-009; não montar capture notice, reader de comandos Chrome, captura copiada ou hints de Ctrl+Shift+K/L ainda não registrados no desktop. |
| IA | TFA-010; sem provedores, sugestões, permissões/rede ou credenciais nesta Change. |
| Distribuição e homologação | TFA-011/012; sem Setup executado, release, assinatura, instalação corporativa, auto-update, dashboard/redesign, conta/backend/nuvem ou outros sistemas. |

**Pontos materiais para fechar antes de concluir o propose:** (1) confirmar o recorte de exclusão, mantendo TFA-006 se nenhuma expansão for solicitada; (2) aceitar/refinar tratamento somente leitura de tarefas com recorrência e os bloqueios de prazo/status com reminders, sem trazer ações avançadas por conveniência; (3) fechar DTO de edição e orçamento de bytes/valores históricos; (4) confirmar posição e escopo da ação mínima de abrir origem salva, com recusa de userinfo e tamanho sem alterar a validação de armazenamento herdada; (5) definir UX de conflito/descarte e resultado incerto; (6) escolher comportamento diante de mudança de fuso com draft aberto e conservar precisão de prazo não editado. Não falta decisão de stack/driver/instalador, já entregue nas dependências. Resolver fatos pelo código e decisões de produto pela revisão humana, sem tomar silêncio como aprovação.

**Riscos e mitigação:** copiar serviço inteiro amplia escopo (seleção revisada); fieldset oculto apaga dados (DTO básico + leitura atual); upsert tardio regride lista (revisões + snapshot); writer único não evita draft stale (CAS); resposta perdida duplica criação (sem replay + estado incerto); CSS/seletores quebram teclado em janelas pequenas/IDs históricos (refs/escaping e matriz de foco/zoom); reconversão minuto/fuso altera prazo (ISO original e testes de transição); limite 1 KiB corta draft (budget de mutação distinto); URL abre protocolo privilegiado (operação fechada + validação main); coleção de 10.000 cartões prejudica renderer apesar de SQLite rápido (medir UI, não inferir desempenho do banco nem introduzir virtualização sem necessidade/revisão).

#### Matriz candidata de aceitação/testes a refinar no propose

Os casos abaixo são **planejados**, não executados contra uma UI desktop de tarefas inexistente. Reaproveitar os cenários portáveis por cópia revisada no apply autorizado; substituir dependências Chrome por portas de teste desktop. Não há teste dedicado TaskFilters na origem consultada: seus cenários estão no TaskManager e em task-queries.

| ID | Caso | Resultado observável / evidência futura |
| --- | --- | --- |
| G01 | Criar mínimo e completo, inclusive DONE/CANCELLED | Defaults, normalização, IDs/clock main, auditoria/completedAt e opcionais iguais à origem; um commit por envio, reopen conserva dados. `task-draft`, `task-service`, `TaskForm` básicos. |
| G02 | Campos inválidos e limites exatos/excedidos | Título em branco, 200/4000/120, 10×30 tags, enums, data e HTTP/HTTPS; erro por campo sem commit, draft intacto e primeiro inválido focado. Unicode/escaping e bypass de maxlength via IPC. |
| G03 | Editar, limpar opcionais e cancelar | Identidade/createdAt conservados; updatedAt da edição; limpeza explícita só de campos básicos; Cancelar não grava e retorna a Nova tarefa. Avançados e valores históricos não alterados sobrevivem. |
| G04 | Status simples por formulário/ações/seletor | Quatro status, DONE registra completedAt, demais limpam, mesmo status não grava; reabrir rápido TODO; independentemente de subtarefas existentes. CAS e dados preservados. |
| G05 | Pesquisa | Todos os campos realmente pesquisados, inclusive títulos de subtarefas; substring/trim/caixa; termos acentuados seguem a origem; sourceUrl não passa a ser pesquisável. |
| G06 | Combinação e ordem | Pesquisa/status/prioridade/prazo em AND; três comparadores/desempates, sem prazo por último; limpar mantém sortKey; contagem N de total fiel ao snapshot. |
| G07 | Prazo em fronteira | Ativo: now-1ms atrasado, now e +24h próximos, +24h+1ms fora; terminais/sem prazo sem badge. Relógio de 60 s e retomada de foco atualizam classificação. |
| G08 | Entrada/exibição local | UTC↔fuso local, vazio, impossível, leap day, mudança de dia; pt-BR sem hardcode -03:00; segundos/milisegundos e instante não editado preservados; gap/repetição DST e troca de fuso definidos/testados. Testes em processos/fusos controlados, sem mudar o fuso global do PC. |
| G09 | Vazio real e sem resultados | Antes de snapshot completo: carregando; vazio real: Criar primeira tarefa; sem correspondência: Limpar filtros. Erro/stale/corrupção nunca vira vazio. Sem botões futuros. |
| G10 | Falha inicial/transitória e banco bloqueado | Retry focado/sem duplicação; indisponibilidade/corrupção/incompatibilidade por mensagem segura e sem reset; com snapshot anterior, stale visível e escritas bloqueadas até estado válido. Draft e filtros mantidos. |
| G11 | Sucesso/falha de escrita e resultado incerto | Só anunciar save após commit; falha conserva formulário/lista; duplo click/Enter não duplica; commit sem resposta exige ressync e não reenvio automático; resposta antiga não sobrepõe snapshot novo. |
| G12 | Duas sessões e conflito | Uma edição/status ganha, base stale recebe CONFLICT; draft preservado e descarte explícito; tarefa inexistente não é recriada; tarefas distintas/claim isolado não conflitam falsamente; eventos/resultado fora de ordem convergem. |
| G13 | Foco e teclado do seletor | Setas navegam, Enter/focusout confirmam, Escape abandona; ponteiro imediato; busy focável sem novo comando; focusout não rouba foco. Testes herdados TaskList e TaskManager. |
| G14 | Foco depois de ação/erro/form | Controle equivalente no cartão; se oculto por filtro, Editar do vizinho/último ou Limpar filtros; erro retorna ao controle; título inicial/primeiro erro/alerta e Nova tarefa ao fechar form; nenhum foco no body por sumiço de controle. |
| G15 | Semântica visual/acessibilidade | Rótulos/for únicos, h1/h2/h3, nome da tarefa nas ações, role status/alert, aria-invalid/describedby, focus-visible e texto dos badges; janela mínima/normal/maximizada, zoom 200%, escala Windows e strings longas sem perda de ações. Verificação manual no Electron, além de componentes. |
| G16 | Origem externa | Ação explícita de origem salva; HTTP/HTTPS no navegador padrão; inválida/userinfo/controles/protocolos negados, URL >2081 recusada sem corte, origem alterada/ausente e falha do shell sem mutação. Main sender/frame/sessão revalidado; janela local não navega. |
| G17 | IPC negativo e contratos | Enums/tipos/keys/protótipos/versões/bytes inválidos, revisão malformada, campos de auditoria/avançados, sessão/frame/origem inválidos; zero leitura/efeito antes do guard; erros/saídas sanitizados. Catálogo novo fechado e isolamento preservado no pacote. |
| G18 | Ciclo de inscrição e reconciliação | Handshake/subscribe idempotente, foco/30 s/evento perdido, churn/BUSY, reload/crash controlado e unmount; não acumular timers/listeners nem apagar draft na atualização externa. Provar UI inscrita no pacote para a pendência W4 da TFA-003. |
| G19 | Limites de escopo e dados avançados | Nenhum controle/comando futuro no DOM/bridge; edição básica não apaga série/subtarefas/reminders/processedFor; bloqueios escolhidos são testados no main, não só ocultos. Exclusão segue a decisão de recorte. |
| G20 | Volume e runtime real | 1.000/10.000 tarefas fictícias: medir montar/filtrar/ordenar e foco durante atualizações; sem truncamento/paginação visual silenciosa. Pacote real: criar/editar/status/reopen/offline e shell externo controlado; fechamento com escrita admitida conserva a base. Build não certifica instalador/notificações/bandeja/atalhos. |

**Estratégia:** copiar/revisar `task-draft.test.ts`, `task-status.test.ts`, `task-queries.test.ts` e casos básicos de `task-service.test.ts`; adaptar `TaskForm.test.ts`, `TaskList.test.ts`, `TaskManager.test.ts`, `date-time.test.ts` e `task-store.test.ts`. Fixtures/fakes da origem só entram após remover scheduler/lixeira/backup/IA/Chrome desnecessários. Complementar com testes desktop de mutação/CAS/erros, store versionado e integração real de renderer+preload+main, reaproveitando o harness restrito existente. G16 automatizado usa opener falso para não lançar sites durante a suíte; prova Windows real deve usar URL fictícia controlada e evidência do mecanismo, sem dados privados. Definir orçamento observável de UI no propose após escolher a prova, sem alegar cumprimento agora.

**Verificações desta exploração:** `npm run validate` passou usando os runtimes locais já existentes da TFA-002, **Node 24.21.0/npm 11.21.0**: lint sem warnings, cinco typechecks, **19 arquivos/358 testes**, build main/preload/renderer. O PATH inicial (22.22.2/10.9.7) e o npm 11.19.0 junto do Node extraído foram recusados por devEngines; não foram instalados pacotes nem alterados engines, PATH global ou lockfile. `openspec validate --all --strict --no-interactive --json`: **5/5 specs** (INFO preexistente sobre requisito longo per-user); `--archived`: **3/3 Changes**. Esses gates verificam a **base existente**, não G01–G20/TFA-004. `git diff --check` passou; os **28 links locais** da seção TFA-004 existem e suas linhas referenciadas estão dentro dos arquivos. Apenas `docs/roadmap.md` tem alteração versionada. Sem novo pacote, smoke, Setup, testes na extensão, commit, push, PR, merge ou publicação.

### Prompt consolidado para opsx:propose

Pronto para uso em novo pedido explícito. As recomendações e dúvidas desta exploração não equivalem a artefatos aprovados; o prompt não inicia propose/apply por estar salvo no roadmap.

```text
$openspec-propose TFA-004 — migrar-gerenciamento-de-tarefas-e-interface

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface, criada da main d74e02df7aa38e13fd631a6a83ab2d07b96d8e42 (PR #3 integrado). Leia AGENTS.md, docs/roadmap.md (exploração TFA-004, decisões materiais e G01–G20), arquitetura/paridade/testes/persistência, os artefatos arquivados das dependências e specs consolidadas pertinentes. Preserve trabalho preexistente. C:\QSI\Workspaces\taskflow-extension/Git é somente leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4; não editar, instalar, testar, construir ou alterar seu Git/configuração.

Crie somente proposal/design/specs/tasks desta Change pela CLI OpenSpec instalada 1.14.0/schema spec-driven, sem skip_specs documental. Registre IN_PROGRESS/PROPOSE e data de início antes e IN_REVIEW/REVIEW depois. Evolua coerentemente as specs desktop-foundation e desktop-state-ipc, que hoje limitam o shell ao diagnóstico e proíbem mutações/abertura externa, preservando seus contratos de leitura/isolamento. Não implemente, instale dependências, execute Setup ou inicie apply/archive/commit/push/PR/merge/distribuição/outra Change. Entregue os artefatos para revisão e registre/entregue o prompt consolidado de apply, sem aprovação inferida.

Preserve Vue/Pinia + Electron, TypeScript estrito, núcleo portável, renderer isolado e persistência da TFA-003. Recomende cópia revisada dos campos básicos, TaskFilters, apresentação/teclado de TaskList/TaskManager, CSS base/rótulos e consultas; adapte store a porta desktop e snapshots/revisões existentes. Não copie bootstrap/composição Chrome, TaskService inteiro, scheduler fictício, WXT ou recursos avançados ocultos mas importados. Gerenciamento principal numa janela, diagnóstico atual secundário acessível, sem redesign/dashboard/novas colunas de produto ou segunda janela.

Escopo: criar/editar título, descrição, solicitante, responsável, status, prioridade, prazo, tags e URL de origem; concluir/cancelar/reabrir tarefas simples; pesquisa, filtros AND, três ordenações e foco/erros. Preserve defaults TODO/MEDIUM, trim/opcionais, limites 200/4000/120 e 10 tags de 30, tags deduplicadas; pesquisa substring/caixa em título/descrição/pessoas/tags/subtarefas, sem remover acentos nem incluir URL; prazos ativos <now e [now,now+24h], terminais/sem prazo sem badge; desempates e limpar filtros mantendo ordem. Preserve completedAt e no-op de status.

Projete comandos versionados fechados createTask/updateTask/changeTaskStatus/openTaskSource (nomes finais a refinar), schema exato/bytes e erros por campo/códigos públicos. Clock/IDs e read/decide/validate/commit no main; criação nunca substitui ID existente. Editar/status usam contentRevision, sem timestamp/global como CAS. Preserve avanços e processedFor do estado relido: omitir reminders/recurrence no updateTask da origem apaga dados, então DTO básico não pode virar Task completo/listas vazias. Impedir envio de auditoria/avançados pelo renderer. Sucesso e snapshot >= revisão confirmada não podem regredir por upsert tardio; resultado incerto exige ressync, sem retry/duplicação automática. Defina UX de CONFLICT/NOT_FOUND que preserve draft, comparação/revisão e descarte explícito, sem merge ou troca silenciosa da revisão-base.

Resolva os pontos materiais registrados antes de concluir a proposta. Recomendação atual: Excluir/lixeira/undo só na TFA-006; antecipar exclusão recuperável requer decisão humana e revisão do recorte, nunca delete definitivo. Recorrência/subtarefas funcionais TFA-005, reminders/lifecycle TFA-008; preservar dados e pesquisa existentes, propor somente leitura para recorrentes e bloquear prazo/status com reminders até integração, permitindo edits independentes que conservem os avançados. Confirmar/refinar essas diferenças temporárias sem importar serviços futuros. Sem botões de Backup/Restaurar (007), captura/Quick Add/atalhos/hints (009) ou IA (010).

Defina orçamento de mutação separado do 1 KiB de leitura/diagnóstico, cobrindo UTF-8/envelope/escaping e campos máximos; candidato 64 KiB exige revisão. Histórico/sourceUrl/IDs não podem ser truncados nem receber novos limites de codec por conveniência; manter valores não editados e recusar excesso de transporte explicitamente. Preserve budgets de leitura, paginação, fila, sessões, guardas de main frame/origem/documento e autorização na admissão/execução/saída; sem Node/fs/IPC genérico no renderer e sem enfraquecer CSP/navegação.

Prazo: datetime-local/fuso do SO e pt-BR, ISO UTC, sem hardcode -03:00; manter precisão/ISO original quando não alterado, gaps/repetição e revisão se fuso mudar com form aberto. Clock de apresentação 60 s e retomada. URLs: ação mínima de abrir origem salva junto do campo, após gesto explícito; main lê por ID/revisão, valida HTTP/HTTPS/host e recusa userinfo/controles/esquemas privilegiados e >2081 caracteres para abertura Windows, sem regravar dados. Shell fora da transação, erros seguros; não abrir URL não salva, buscar títulos/previews ou navegar remotamente no app.

Refine G01–G20 em requisitos/cenários/tasks: paridade básica/campos/normalização/validação; pesquisa/filtros/ordem; prazos e fusos/precisão; vazio versus sem resultados versus erro/stale; draft/foco/teclado/live regions/aria; duplo envio, erro/pós-commit, CAS e respostas fora de ordem; avançados conservados e controles futuros ausentes; IPC negativo/sessões/bytes e abertura externa; UI real inscrita, foco/30 s/reload/crash controlado/listeners e fechamento; responsividade com 1.000/10.000 tarefas. Portáveis só copiados no apply futuro; adaptar fakes/composição e testes Chrome. Gates npm run validate e OpenSpec estrito no projeto novo; planejar pacote real sem executar Setup, distinguindo mocks/renderer/pacote/instalação. Relatório verification.md somente depois do apply, aprovado antes de archive. Pare após propose e revisão dos artefatos.
```

### Proposta criada — 2026-10-04

**Pedido explícito de propose:** o usuário invocou `openspec-propose` com o prompt completo da TFA-004 anexado. O roadmap foi marcado **IN_PROGRESS/PROPOSE**, início **2026-10-04**, antes de `openspec new change migrar-gerenciamento-de-tarefas-e-interface`. Branch existente reutilizada, base `d74e02d`. **Estado na entrega da proposta: IN_REVIEW/REVIEW**, conclusão da Change sem data, artefatos ainda não aprovados e apply não iniciado. A aprovação posterior está registrada abaixo.

CLI **1.14.0**, raiz local e schema **spec-driven**, `.openspec.yaml` criado pela CLI, sem `skip_specs`. Quatro grupos de artefatos completos:

- [Proposal](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/proposal.md): problema, comportamento básico pretendido, exclusões, nova capacidade e duas capacidades modificadas.
- [Design](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/design.md): D1–D10, reutilização/alternativas, DTO de patch, coordenação/CAS, recortes avançados, budgets/erros, estados/conflitos, precisão/fuso, opener, acessibilidade e evidências.
- Deltas (arquivados): [desktop-task-management](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/specs/desktop-task-management/spec.md), [desktop-state-ipc](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/specs/desktop-state-ipc/spec.md) e [desktop-foundation](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/specs/desktop-foundation/spec.md). **17 requisitos ADDED, 6 MODIFIED, 56 cenários**, consolidados nas specs principais no archive de 2026-10-04.
- [Tasks](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/tasks.md): **41 itens concluídos** em oito grupos, com verificação e documentação junto da implementação correspondente.

#### Decisões concretas submetidas à revisão

| Tema | Plano proposto / diferença temporária |
| --- | --- |
| Stack e reaproveitamento | Vue/Pinia/Electron existentes; cópia revisada das regras/componentes/CSS/testes básicos, porta desktop e snapshot autoritativo; sem TaskService inteiro ou serviços fictícios. |
| Edição e histórico | Patch dos nove campos básicos: ausente conserva, null limpa opcionais, [] limpa tags. Validar novos/alterados e conservar histórico intacto/avançados/processedFor; nenhum novo limite do codec. |
| Escritas | Clock/IDs no main, colisão protegida em tarefas/lixeira com até três tentativas; contentRevision para CAS dentro da unidade; no-op/status igual sem commit/evento; nenhum Task livre/auditoria/avançado vindo do renderer. |
| Exclusão e avançados | Excluir/lixeira/undo TFA-006. Recurrence presente somente leitura até TFA-005; seriesId isolado não bloqueia ocorrência sem regra. Subtarefas existentes somente leitura/pesquisa. Com reminders, bloquear mudança efetiva de prazo/status, permitindo edições independentes que conservam dados, até TFA-008. |
| Transporte | Comandos 64 KiB de request e 8 KiB de resposta UTF-8 JSON completo; leitura/diagnóstico/eventos continuam 1 KiB, páginas 256 KiB, budgets de fila/sessão intactos. Ack sem Task/ID histórico refletido; falha explícita sem truncar. |
| Conflito/incerteza | Preservar draft/base, conferir versão atual em leitura e confirmar descarte antes de reload; sem rebase/merge/retry automático. Conferir lista após resultado incerto, sem inferir criação por título. |
| Prazo/fuso | Prazo intacto ausente do patch conserva ISO/precisão; novos/alterados locais, pt-BR, gap recusado/hora repetida conforme origem. Mudança de fuso com prazo alterado bloqueia save até revisão/confirmar novo fuso ou restaurar prazo salvo. |
| Origem externa | Abrir origem **salva** junto ao campo por ID/revisão; main valida HTTP/HTTPS/host/ausência de credenciais/controles e href <=2081; shell fora da transação. URL histórica armazenada não é cortada/regravada se não puder abrir. |
| Superfície | Uma janela principal, diagnóstico secundário acessível, CSS/teclado/foco preservados, sem controles futuros. Draft/filtros são transitórios e não se promete recuperação após saída/crash. |
| Alvos de UI | 1.000/10.000 tarefas fictícias: primeira lista utilizável <=2 s/5 s; p95 filtro/ordem <=500 ms em 20 interações após aquecimento; atraso máximo de heartbeat <=250 ms. Alvos propostos ainda não medidos; falha exige revisão, sem truncamento/worker/virtualização automática. |

Essas decisões fecharam a proposta entregue para revisão; a aprovação posterior está registrada abaixo. Escolher alternativa material exige atualizar artefatos e obter revisão antes do ponto de implementação. Origem somente leitura, HEAD reconferido `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, sem build/teste/escrita/Git alterado nela.

**Validação da proposta e base:** `openspec validate migrar-gerenciamento-de-tarefas-e-interface --type change --strict --no-interactive --json` passou sem issues; `validate --all --strict --no-interactive --json` **6/6** (cinco specs + esta Change), apenas INFO preexistente de texto longo em windows-per-user-installation. Status CLI: proposal/specs/design/tasks completos — presença de arquivos, não implementação/aprovação. `npm run validate`, com Node **24.21.0/npm 11.21.0** locais já existentes, passou: lint, cinco typechecks, **19 arquivos/358 testes**, build main/preload/renderer. Isso verifica somente a base; G01–G20 e as 41 tasks permanecem futuros. `git diff --check` passou; **13 links locais novos** (sete nos artefatos e seis nesta entrega do roadmap), whitespace dos arquivos novos e conservação dos nomes dos cenários originais em MODIFIED foram conferidos. Sem instalação de dependências, alteração de código/lockfile/spec principal/README, novo pacote ou Setup executado, verification.md antecipado, commit/push/PR/merge/archive ou distribuição.

### Aprovação dos artefatos — 2026-10-04

**Evidência humana:** o usuário solicitou expressamente na conversa: **“Aprove os artefatos, commit e faça o push”**. Aprovação registrada para proposal, design, os três deltas e tasks da TFA-004, incluindo decisões D1–D10, recortes temporários, contratos, matriz G01–G20 e alvos de desempenho. Estado **APPROVED/READY_FOR_APPLY**; as **41 tasks permanecem pendentes** e não há data de conclusão ou início de implementação.

O mesmo pedido autoriza commit e push destes artefatos e do roadmap na branch **`codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface`**, no Git próprio do app e remote `origin` (`https://github.com/Cadlira/taskflow-app.git`). O registro de aprovação não altera requisitos nem executa apply. Próxima etapa depende de novo pedido de apply; archive, PR, merge, instalação e distribuição seguem suas autorizações próprias. A validação relatada na entrega do propose continua evidência da base e dos artefatos, sem comprovar a implementação planejada.

### Prompt consolidado para opsx:apply

A aprovação humana explícita de proposal/design/três deltas/tasks e suas decisões foi registrada acima em **2026-10-04**. Usar este prompt em **novo pedido de apply**; estar salvo no roadmap não inicia a implementação.

```text
$openspec-apply-change TFA-004 — migrar-gerenciamento-de-tarefas-e-interface

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface, baseada na main d74e02df7aa38e13fd631a6a83ab2d07b96d8e42 (TFA-003/PR #3 integrados). Leia AGENTS.md, docs/roadmap.md, proposal.md, design.md, os três deltas e tasks.md em openspec/changes/migrar-gerenciamento-de-tarefas-e-interface, arquitetura/paridade/testes/persistência e dependências arquivadas. Preserve mudanças preexistentes. C:\QSI\Workspaces\taskflow-extension e seu Git são somente leitura no HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4: não editar, testar, construir, instalar, commitar ou alterar configurações ali.

Confirme evidência humana de aprovação dos artefatos e D1–D10/recortes/orçamentos; o prompt não substitui aprovação ausente. Registre aprovação e IN_PROGRESS/APPLY/data no roadmap. Execute somente as 41 tasks, com testes/documentação próprios de cada grupo e marcação após evidência. Use CLI OpenSpec instalada 1.14.0/schema spec-driven. Alternativa material exige revisão coerente antes de implementar o ponto, continuando trabalho independente autorizado.

Preserve stack/runtime/lockfile/schema/codec da fundação, TS estrito e núcleo portável. Copie seletivamente regras/campos/componentes/CSS/testes básicos da origem; sem duplicar tipos/codecs existentes, transportar WXT/Chrome, TaskService inteiro, serviços fictícios ou recursos avançados ocultos mas importados. Uma janela principal de tarefas com diagnóstico secundário acessível, identidade/teclado/foco intactos, sem redesign/Quasar/dashboard/novas colunas ou segunda janela de produto.

Entregue campos básicos/defaults/normalização/limites, status/completedAt/no-op, pesquisa substring/caixa nos campos atuais inclusive subtarefas (sem URL/accent-fold), filtros AND, três ordens/desempates e limpar mantendo sortKey. Prazos ativos <now ou [now,now+24h], sem badges em terminais/sem prazo; clock de apresentação 60 s+foco/resume. Preserve erros/alertas/aria/labels/live regions, foco do formulário/ações e seletor pending/Enter/focusout/Escape, busy focável sem duplicar comando.

Implemente catálogo v1 fechado createTask/updateTask/changeTaskStatus/openTaskSource além das quatro operações existentes. Draft de criação básico; patch de edição com ausente=conservar, null=limpar opcionais e []=limpar tags. Main gera IDs/clock e lê/decide/valida/commita no coordenador; colisão de UUID nunca sobrescreve tarefas/lixeira. CAS por contentRevision, não timestamp/global; existência/restrições verificadas na unidade. Preserve histórico intacto, avançados e processedFor atuais, validando limites apenas nos básicos novos/alterados; não reutilize updateTask completo da origem que limpa reminders/recurrence omitidos. Não aceite auditoria/Task livre/advanced fields do renderer.

Aplique no main e UI os recortes revisados: Excluir/lixeira/undo apenas TFA-006; recurrence presente sem mutação até TFA-005, subtarefas existentes somente leitura/pesquisa; com reminders, bloquear mudança efetiva de prazo/status até TFA-008 e permitir edição independente preservando dados. Não montar controles/handlers/hints de recorrência/subtarefas editáveis, backups/importação, lembretes/notificações/bandeja/login, Quick Add/captura/atalhos ou IA. Nenhuma ação avançada ou manutenção por leitura.

Comandos: 64 KiB request e 8 KiB resposta UTF-8 JSON/envelope/escaping; leitura/diagnóstico/eventos 1 KiB, páginas 256 KiB e budgets de fila/sessão existentes intactos. Ack curto com revisões e novo ID só na criação; estado completo vem do snapshot. Validar schema/keys/protótipos/versões/bytes/saídas e remetente/main frame/origem real/documento/sessão na admissão, execução e saída. Renderer sem Node/fs/IPC genérico; CSP/navegação/permissões permanecem restritas. Erros por códigos/fields finitos, sem paths/stack/cause/payload/URL ou dados sensíveis em logs.

Store inscrito no cliente de estado existente, sem novo writer/upsert tardio/poller duplicado. Ack confirmado e snapshot >= revision encerram sincronização sem regredir estado. Preserve draft/base em CONFLICT/NOT_FOUND/erro: conferir versão atual em leitura, manter preenchimento e confirmar descarte antes de reload; sem rebase/merge/retry automático. Resultado incerto exige conferir lista por ressync e nova decisão explícita; título igual não prova criação. Depois de ack com ressync falhado, informar salvo/atualização pendente, sem anúncio de rollback/reenvio.

Prazo intacto ausente do patch conserva ISO/segundos/milissegundos/instante repetido; novos/alterados interpretam fuso local e pt-BR, sem hardcode -03:00. Datas impossíveis/gaps recusados, hora repetida nova segue origem. Mudança de fuso com prazo alterado preserva texto e bloqueia save até revisão/confirmar contexto novo ou restaurar prazo salvo; testes TZ/porta sem mudar fuso global.

Abrir origem salva junto ao campo por gesto/ID/revisão, sem draft URL livre. Main lê/valida HTTP/HTTPS/host/ausência de userinfo e controles, href <=2081 no Windows, sessão vigente antes do efeito. Shell fora da transação, sem opções/paths do renderer; erro seguro sem alterar/truncar URL histórica, retry ou navegação remota no app. Opener fake na suíte e prova Windows controlada separada.

Cubra G01–G20 e as tasks com testes portáveis revisados, adapters/IPC/CAS/store/UI e pacote real inscrito; duas superfícies só no harness fictício. Prove foco/30 s/evento perdido/reload/crash/cleanup e fechamento/drain/reopen, documentando draft transitório. Meça UI 1.000/10.000 contra D10: montagem <=2 s/5 s; p95 consultas <=500 ms em 20 interações após aquecimento; heartbeat <=250 ms. Registre hardware/runtime/bytes/máximo/foco. Falha exige revisão, sem truncamento, worker/virtualização automática ou retirada de gate.

Execute npm run validate, OpenSpec estrito, pacote --publish never/verify:package/smoke:packaged pertinentes e prova manual de acessibilidade/opener no pacote local autorizado, sem executar Setup. Diferencie DOM/mocks/renderer/pacote/instalação e não declare pendências herdadas resolvidas sem evidência. Atualize docs operacionais/arquitetura/paridade/testes somente do que existir.

Ao concluir apply execute openspec-verify-change e gere verification.md dentro desta Change, com requisitos/cenários/tasks/evidências/gates/pendências. Entregue implementação e relatório e pare em revisão; aguarde aprovação explícita antes do archive. Não archive, consolide specs, altere README antecipadamente, commit/push/PR/merge, instale em máquina corporativa, distribua/publique ou inicie TFA-005–012 por inferência.
```

### Início do apply — 2026-10-04

**Autorização:** o usuário invocou `openspec-apply-change` para a TFA-004 com o prompt consolidado acima. A aprovação humana dos artefatos e decisões D1–D10/recortes/orçamentos está registrada na seção **Aprovação dos artefatos — 2026-10-04** (evidência: “Aprove os artefatos, commit e faça o push”). O prompt de apply não substitui aprovação ausente e não reabre decisões materiais; alternativa material durante o apply exige revisão coerente antes do ponto afetado, continuando o trabalho independente já autorizado.

**Estado:** **IN_PROGRESS/APPLY**, início **2026-10-04**, branch `codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface` (base `d74e02df7aa38e13fd631a6a83ab2d07b96d8e42`, merge do PR #3), com as **41 tasks** em execução. Escopo executado exatamente como aprovado: sem Excluir/lixeira/undo (TFA-006), sem mutação de recorrência (TFA-005), subtarefas somente leitura, sem mudança efetiva de prazo/status com lembretes (TFA-008), sem backups, lembretes/notificações/bandeja, Quick Add/captura/atalhos ou IA; sem segunda janela de produto, Setup, distribuição, archive, commit/push/PR/merge ou próximas Changes por inferência. A origem `C:\QSI\Workspaces\taskflow-extension` permanece somente leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`.

**Encerramento do apply:** após as 41 tasks, executar `openspec-verify-change` e gerar `verification.md` dentro desta Change, entregando implementação e relatório para revisão explícita; archive, consolidação de specs e README factual continuam dependendo de autorização própria.

### Apply executado — 2026-10-04

**Estado:** **IN_REVIEW/REVIEW**, início do apply **2026-10-04**, **41/41 tasks** concluídas com evidência. O apply terminou sem archive, sem consolidação de specs, sem README antecipado, sem commit/push/PR/merge, sem instalação/distribuição e sem iniciar TFA-005–012. A origem `C:\QSI\Workspaces\taskflow-extension` permaneceu somente leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4` (apenas leitura de arquivos/hashes; nenhum teste, build ou escrita).

**O que foi entregue:**
- Núcleo portável: `src/domain/task-draft.ts` (nove campos, patch, histórico intacto), `task-status.ts`, `task-queries.ts` (com chaves pré-calculadas), `url.ts`; `src/contracts/tasks.ts` + `record.ts` (catálogo v1, 64 KiB/8 KiB, erros finitos); `src/application/tasks/*` (casos de uso na unidade, cliente do preload, validação da origem).
- Main/preload: quatro comandos (`createTask`, `updateTask`, `changeTaskStatus`, `openTaskSource`), CAS por `contentRevision`, colisão de UUID com três tentativas, guards de recorrência/lembretes, opener fora da transação, catálogo fechado de oito operações no preload.
- Renderer: janela principal de tarefas com diagnóstico secundário recolhível; formulário básico, lista com cartões persistentes, filtros/ordenação, seletor de status com teclado, estados de conflito/ausente/incerto com ressync, fuso com revisão explícita; store versionada com ack→snapshot.
- Testes: 34 arquivos/474 testes + 1 skipped; nos testes: contrato dos comandos, domínio, datas sob `TZ`, comandos/CAS no banco real, IPC com sessões falsas, store, componentes (teclado/foco/aria), contraste WCAG e arquitetura.
- Harness do pacote: `tasks` 24/24 (UI real, duas superfícies, negativas, foco, reload sem duplicação, crash controlado, fechamento da janela com exit 0), `a11y` 12/12 (dimensões/zoom/foco/string longa e abertura controlada pelo shell real), `ui-bench` com 1.000/10.000.

**Gates:** `npm run validate` verde; OpenSpec estrito 6/6; `package:win` (`--publish never`), `verify:package` (ASAR na allowlist, `asInvoker/uiAccess=false`) e `smoke:packaged` executados no pacote; Setup não executado. **Smoke termina reprovado por um gate retido:** o orçamento D10 de 10.000 tarefas falhou em p95 (521 ms > 500 ms) e heartbeat (579 ms > 250 ms), com montagem 2,19 s (≤5 s) e 10.000 cartões sem truncamento; a revisão concreta aplicada reduziu o p95 de ~4,5 s para ~0,52 s, e o custo bruto do Chrome para mover os mesmos 10.000 nós é de ~165–340 ms. Nada foi truncado, virtualizado ou removido do gate. **Decisão necessária:** revisar formalmente o orçamento de reordenação completa de 10.000 ou aprovar uma Change de janela de renderização antes do archive.

**Relatório:** [verification.md](../openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/verification.md) com requisito/cenário/task/evidência, gates, WARNING/SUGGESTION e limitações (leitor de tela/DPI humano, Setup/instalação, CI remota e espera real de 30 s não executados). W4 (UI real inscrita) e W6 (fechamento com mais de uma superfície) da TFA-003 foram exercitados no harness; W1/W2/W3/W5 continuam limitações documentadas.

### Verificação aprovada e archive — 2026-10-04

**Evidência humana:** o usuário determinou textualmente: **“Rode o opsx-verify, passando sem nenhum crítico ou warning bloqueante aprove e rode o archive. Após isso, ajuste o roadmap deixando a TFA-004 como DONE e a TFA-005 ready e pode commitar e fazer o push. Finalize criando o PR.”** O relatório `verification.md` foi revisado; não há CRITICAL, e o usuário tratou o WARNING 1 (orçamento D10 de 10.000 ainda reprovado no smoke, com o gate retido) como **não bloqueante para o archive**, permanecendo como pendência pós-archive documentada — revisar formalmente o orçamento de reordenação completa ou aprovar uma Change de janela de renderização —, sem truncamento, virtualização automática ou remoção do gate. O WARNING 2 (prova humana de acessibilidade) e as SUGGESTIONs ficam registrados para a TFA-012.

**Archive:** `openspec archive migrar-gerenciamento-de-tarefas-e-interface --yes --json` moveu a Change para `openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface` e consolidou as specs: **17 requisitos adicionados** e **6 modificados** em `desktop-task-management` (nova), `desktop-state-ipc` e `desktop-foundation`. `openspec validate --all --strict --no-interactive`: **6/6**; `openspec validate --archived --strict --no-interactive`: **4/4**. Estado **DONE** em **2026-10-04**; commit, push e PR desta branch seguem o pedido explícito do usuário, com a TFA-005 marcada **READY_FOR_EXPLORE**.

## TFA-005 — Recorrências e subtarefas

**Slug:** `preservar-recorrencias-e-subtarefas`. **Dependências:** TFA-004, arquivada e integrada pelo PR #4, merge local `64fe7ad` conferido em 2026-10-04. **Estado: READY_FOR_MERGE**; início **2026-10-04**, apply concluído em **2026-10-04** com **44/44 tasks**, archive em **2026-10-04** e PR #5 aberto. Branch local `codex/tfa-005-preservar-recorrencias-e-subtarefas`, criada na exploração a partir da `main` limpa. Artefatos aprovados pelo usuário em 2026-10-04; implementação, verificação aprovada, archive, README, commit, push e PR executados nos pedidos seguintes.

**Resultado:** Manter regras avançadas de tarefas e sua integridade sobre a persistência desktop.

**Escopo previsto:** Regras diárias, semanais e mensais, intervalos, limites, próxima ocorrência, pular/encerrar série e reabrir. Até 20 subtarefas, ordem manual, progresso e marcação independente do status da tarefa. Preservar identificadores, datas e invariantes dos modelos atuais.

**Critérios de aceitação para refinar na proposta:** Concluir/pular gera no máximo uma próxima ocorrência; cancelamento apresenta escolha de série; datas-limite e fim de mês são tratados como na origem; subtarefas não alteram automaticamente o status da tarefa; atualização concorrente não perde alterações. Testes portáveis relevantes são reaproveitados.

### Prompt para opsx:explore

```text
/opsx:explore TFA-005 — preservar-recorrencias-e-subtarefas

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia domain/task-recurrence.ts, task-subtasks.ts, task-status.ts, application/task-service.ts e os testes correspondentes. Explore como preservar as regras existentes no desktop, sem redesenhá-las. Examine fim de mês, horário local, limites de recorrência, geração duplicada, pular versus encerrar, reabertura, ids de subtarefas e concorrência. Delimite integração com lembretes e desfazer para as Changes próprias, estabelecendo contratos e cenários de regressão. Não amplie as regras com novos tipos de recorrência.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

### Exploração concluída — 2026-10-04

**Autorização e limites:** o usuário invocou `openspec-explore` para TFA-005 e pediu criar a branch e ajustar o roadmap. Branch criada da `main` em **`64fe7adc42b7eb0f4435c02970363f7d6b060e3f`**, merge do PR #4, igual à referência local `origin/main`; conferência pelo histórico local, sem consulta nova aos checks remotos. Somente este roadmap foi editado. Nenhum diretório ou artefato OpenSpec da TFA-005, código, teste novo ou dependência foi criado; propose/apply não iniciados. Sem commit, push, PR, merge, Setup ou distribuição nesta exploração.

**Dependências e base:** lidos AGENTS.md e roadmap integralmente, proposal/design/tasks/verification e deltas arquivados da TFA-004, contratos relevantes da TFA-003, specs consolidadas de gerenciamento/persistência/IPC e código correspondente. A TFA-004 entrega 41/41 tasks, quatro comandos básicos e UI inscrita; a TFA-003 entrega unidade síncrona no main, `saveTasks`, CAS, claim, reversão condicional interna e revisões duráveis. OpenSpec **1.14.0**, raiz local, schema **spec-driven**, zero Changes ativas e seis specs. Origem revalidada em leitura no HEAD **`a763e7a0d646c664ecd4f979528bc2c3589fa8c4`**; nenhum teste/build/escrita ou alteração de Git/configuração na extensão. Os arquivos de recorrência/subtarefas do app são recortes de tipos/validação/progresso, não a implementação completa da origem.

**Decisão humana confirmada nesta exploração:** à pergunta sobre salvar o formulário após mudanças somente em marcações, o usuário escolheu **“Preservar o save após marcações (recomendado; exige refinar o contrato de revisões).”** Isso confirma o comportamento pretendido e a necessidade de refinar o contrato no propose; não aprova um mecanismo específico, migração SQL, novos artefatos ou implementação. As demais recomendações abaixo continuam sujeitas à revisão dos artefatos futuros.

#### Regras observadas e achados com referências

| Referência | Comportamento real / consequência |
| --- | --- |
| [Regra e limites](C:/QSI/Workspaces/taskflow-extension/src/domain/task-recurrence.ts:14), [validação do draft](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:312) | DAILY: inteiro 1–365; WEEKLY: 1–7 dias distintos, 0=domingo a 6=sábado; MONTHLY: inteiro 1–31. Prazo obrigatório, limite opcional e lembretes absolutos incompatíveis. O formulário compara `until` ao **dueAt informado**, enquanto a spec fala em instante agendado; o validador estrutural isolado não verifica essa relação. Não confundir validação de edição com compatibilidade histórica do codec. |
| [Avanço civil](C:/QSI/Workspaces/taskflow-extension/src/domain/task-recurrence.ts:130), [cálculo](C:/QSI/Workspaces/taskflow-extension/src/domain/task-recurrence.ts:162) e [testes](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-recurrence.test.ts:81) | A base é `anchorAt ?? dueAt`, nunca o horário de conclusão. Avança ao menos um passo, inclusive ao concluir antes do prazo, até encontrar instante **estritamente maior que now**. Perdidas não viram tarefas. Próxima exatamente em `until` é aceita; posterior não gera. Mensal 31: jan→fev 28/29→mar 31, sem fixar o ajuste em 28/29. Não existe quantidade máxima de ocorrências nem frequência anual. |
| [Testes DST](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-recurrence.test.ts:220) | Usa fuso local corrente e Date, com segundos/milissegundos. Às 9h, avanço DST pode durar 23h/25h. Hora inexistente é ajustada pelo runtime; hora repetida escolhe a ocorrência anterior. Diferenciar **geração automática**, que ajusta gap, de **entrada manual**, que o helper desktop recusa. |
| [Preservação de âncora](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:538), [testes de adiamento](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-draft.test.ts:644) | Adiar somente esta ocorrência conserva a programação anterior em `anchorAt`; voltar ao instante original remove a âncora. Remover regra conserva `seriesId`. O código também conserva a âncora ao alterar **regra e prazo juntos**, sem comparar igualdade de regras: não introduzir reset automático da âncora por interpretação do rótulo “editar série”. |
| [Transição](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:164), [teste atômico](C:/QSI/Workspaces/taskflow-extension/tests/application/task-service.test.ts:723) | Concluir ou SKIP retira regra da fechada e transfere para nova TODO na mesma gravação. A fechada conserva série/itens; nova recebe IDs próprios, campos editáveis, auditoria nova e nenhum completedAt. END por cancelamento fecha CANCELLED sem próxima; remover regra no formulário mantém o status. Abandonar confirmação não grava. Não há geração por relógio, startup ou leitura. |
| [Construção da próxima](C:/QSI/Workspaces/taskflow-extension/src/domain/task-recurrence.ts:222) e [reset](C:/QSI/Workspaces/taskflow-extension/src/domain/task-subtasks.ts:143) | Próxima conserva `seriesId`/`until`, não transporta âncora antiga; copia subtarefas em ordem e com títulos iguais, todas desmarcadas e com novos IDs. Copia somente reminders OFFSET, com IDs novos e sem marcador antigo; a posterior liquidação de vencidos pertence ao serviço de lembretes. |
| [Reabertura](C:/QSI/Workspaces/taskflow-extension/tests/application/task-service.test.ts:842), [status](C:/QSI/Workspaces/taskflow-extension/src/domain/task-status.ts:7) | Reabrir a antiga limpa completedAt e mantém série/itens, sem devolver regra, gerar outra tarefa ou alterar a próxima. Uma série pode ter várias tarefas ativas reabertas, mas apenas uma **portadora da regra**. Mesmo status no serviço é no-op. Não impor “uma tarefa TODO por série”. |
| [Criação](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:556), [create do serviço](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:262) | Criar diretamente DONE/CANCELLED com regra é aceito: create persiste e não passa pela transição, portanto não gera próxima nesse momento. Um update posterior passa pela transição. É uma particularidade verificável, sem teste dedicado suficiente de serviço: preservar por padrão e explicitar cenário na proposta; proibir ou gerar imediatamente seria mudança de regra. |
| [Drafts de subtarefas](C:/QSI/Workspaces/taskflow-extension/src/domain/task-subtasks.ts:40), [reconstrução](C:/QSI/Workspaces/taskflow-extension/src/domain/task-subtasks.ts:90) e [testes](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-subtasks.test.ts:73) | Até 20 itens, título trim 1–200; IDs distintos **dentro da tarefa**. Form envia id/título, nunca done. Ausente conserva lista; [] remove todos; reordenar/renomear conserva identidade e marcação relida. O helper aceita ID desconhecido como desmarcado: não usá-lo para ressuscitar item removido após abertura do formulário; conflito estrutural precisa ser verificado antes. IDs de criação devem ser gerados no main. |
| [Toggle](C:/QSI/Workspaces/taskflow-extension/src/domain/task-subtasks.ts:109), [serviço](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:310) e [teste concorrente](C:/QSI/Workspaces/taskflow-extension/tests/application/task-service.test.ts:416) | Intenção explícita `done: boolean` aplicada sobre estado recente, sem substituir Task inteira. Pode marcar em qualquer status, muda somente item/updatedAt; não muda status, completedAt, prazo ou reminders e não reconcilia alarmes. Mesmo valor é no-op; item/tarefa ausente não é recriado. Progresso é derivado. |
| [Identidade da série na spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-recurrence/spec.md:56), [codec desktop](C:/QSI/Workspaces/taskflow-app/src/application/storage/stored-task-codec.ts:213) e [saveTasks](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:144) | A spec exige uma portadora por série; codecs verificam invariantes por tarefa, sem unicidade da portadora entre registros. `saveTask/saveTasks` podem substituir ID existente. Serializar save sozinho não basta: conferir base/portadora/identidades antes de escrever, no mesmo read/decide/commit. Não anunciar que essas primitivas já deduplicam a geração. |
| [CAS básico](C:/QSI/Workspaces/taskflow-app/src/application/tasks/task-commands.ts:95), [CAS/undo internos](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:244) e [save com marcações recentes na origem](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-draft.test.ts:807) | Hoje qualquer toggle salvo mudaria `contentRevision`, fazendo o formulário aberto conflitar. A preferência humana exige distinguir mudança de marcação de alteração estrutural. **Não** ocultar toggle como claim: toggle é conteúdo de usuário e deve invalidar o futuro undo. |

**Sondagens sem arquivos ou testes na origem:** funções de domínio foram lidas/transpiladas e avaliadas **somente em memória**, pelo Node de build do app, com dados fictícios e `TZ` do subprocesso, sem mudar o fuso do PC. Confirmado: (a) em America/New_York, série diária 02:30 de 07/03/2026 gera 03:30 em 08/03 e continua 03:30 em 09/03 — a hora ajustada passa a ser a base; (b) âncora no limite superior representável de Date produz `RangeError` ao avançar, apesar da validação estrutural aceitar a data; (c) alterar dias semanais e prazo juntos conserva a âncora antiga; (d) criação DONE aceita regra. São evidências do código atual em memória, não testes desktop implementados ou homologação no Electron. A sequência DST adicional e overflow não estão cobertos pelos testes da origem lidos.

#### Alternativas e recomendação

| Alternativa | Benefício / custo e encaminhamento |
| --- | --- |
| Copiar regras/testes portáveis por revisão e adaptar a orquestração dentro da unidade desktop | **Recomendada:** preserva semântica/CSS/teclado, aproveita SQLite/snapshot existentes e torna fechamento+geração atômicos. Copiar só trechos pertinentes; nenhuma emulação Chrome ou scheduler fictício. |
| Transportar TaskService completo e seus repositories/scheduler/undo | Não recomendado: leitura anterior ao save continua stale, mistura Changes futuras e cria falsa disponibilidade. |
| Motor externo de recorrência/calendário, tipos novos, fuso por série ou rewrite visual | Fora do escopo: muda DST/âncora/fim de mês e aumenta migração sem benefício para preservar as regras existentes. |
| CAS completo em todo save após toggle | Simples e seguro contra sobrescrita, mas altera a paridade escolhida. **Alternativa rejeitada pela preferência humana**; não reapresentar como default no apply. |
| Revisão de edição estrutural monotônica, além de revisão global e de conteúdo completo | **Recomendação para o propose:** toggle aumenta global/conteúdo e updatedAt; campos básicos, regra ou id/título/ordem dos itens também aumentam revisão de edição. Save compara edição e reconstrói done atual; undo usa conteúdo completo. Evita merge arbitrário e conflito apenas por marcação. Exige especificar metadados, bootstrap/migração/ABA, snapshots/acks e gates; eventual schema SQL 2 só após proposta/revisão, sem alterar payload/backup por necessidade de metadado. |
| Token de edição opaco, base mantida no main e classificação de mudanças durante sua validade | Alternativa sem novo metadado persistido, mas exige rastrear todas as mutações, validade por documento, expiração/reload/backup e ABA; comparar apenas hash dos campos ou timestamps não basta. Medir custo/complexidade antes de preferir ao modelo de revisões. Não enviar Task/base livre nem UndoPlan pela bridge. |

```text
Form/card --> intencao tipada --> main: sessao + validacao
                                      |
                                      v
                         unidade: reler + verificar base/serie
                                      |
                          fechar antiga + criar proxima
                                      |
                                      v
                           um commit + uma revisao global
                                      |
                                      v
                           invalidacao --> snapshot completo
```

**Contratos candidatos, ainda sem schemas aprovados:** estender criação/patch/status somente com regra de recorrência, drafts ordenados de subtarefas e escolha SKIP/END; `recurrence` ausente conserva, null remove; `subtasks` ausente conserva, [] limpa. Main calcula âncora/série/IDs/tempo e não aceita esses campos de autoridade, auditoria ou done no formulário. Marcação usa wrapper dedicado `setSubtaskDone(taskId, subtaskId, done, precondicoes)` sobre estado atual; precondições de identidade/revisão, especialmente ABA, devem ser refinadas no design. Regra e edits estruturais permanecem condicionais; não trocar revisão-base silenciosamente após conflito real. Encerrar sem cancelar pode usar patch null, sem adicionar comando redundante por conveniência. Definir versionamento e erros fechados de regra/campo/item/escolha/conflito/ausência/recurso na proposta; catálogo finito, sem RPC genérico.

**Geração e deduplicação:** conferir revisão e portadora atual, calcular sobre estado relido, proteger IDs novos de tarefa contra tarefas/lixeira e IDs de série contra séries conhecidas, garantir IDs locais de itens/reminders sem colisão e fechar+gerar na mesma unidade. Duas conclusões/SKIP da mesma base: um commit aplicável e outro conflito/no-op definido, nunca duas próximas. Duplo gesto é barrado na UI; resposta perdida exige snapshot/revisão, sem replay automático. A restrição é uma portadora na coleção de tarefas, independentemente de seu status, não exclusividade de seriesId nem de status TODO. Detectar portadoras duplicadas preexistentes sem reset/rewrite; tratamento seguro e UX ficam pendentes de design, sem reparação/importação automática.

**Fuso e recursos:** manter fuso local do SO no **main** para cálculo, sem fixar -03:00, salvar timezone por série ou converter dias em 24h. Preservar ISO/precisão de dueAt/until intactos; adaptar a revisão de fuso do formulário entregue pela TFA-004 também para limite alterado. A origem não fornece âncora civil permanente para restaurar 02:30 depois de um gap: não “corrigir” esse drift sem revisão. O laço de avanço não tem orçamento de iterações e só verifica until depois do avanço; datas históricas muito antigas e overflow podem bloquear/falhar no main. Refinar recusa tipada sem commit e cálculo limitado/equivalente, distinguindo limite natural de série de falha de representabilidade/recurso. Não encerrar silenciosamente uma série por timeout ou RangeError; worker ou otimização que mude resultados exige revisão.

**UI e teclado:** reutilizar controles de regra/limite, encerrar no formulário, editor de itens e confirmação de série seletivamente. Mover cima/baixo, rótulos posicionais, primeiro erro, expansão por superfície não persistida, checkbox focável/busy/rollback e foco após atualização devem conservar a origem. CANCELLED recorrente por Enter/ponteiro abre escolha; **focusout restaura o status sem aplicar nem abrir diálogo**, exceção explícita à regra básica da TFA-004. CANCELLED simples mantém confirmação do seletor por Enter/ponteiro/focusout, sem diálogo de série. Após fechar com geração, aplicar destino de foco da tarefa acionada/vizinho conforme filtros; não deslocar automaticamente para a nova tarefa. Progresso/pesquisa devem refletir itens persistidos.

#### Integrações delimitadas e exclusões

| Destino | Contrato/regressão a preservar, sem antecipar a funcionalidade |
| --- | --- |
| TFA-006 — lixeira/desfazer | Reversão futura restaura a anterior e remove a gerada **juntas**, somente se revisões completas de ambas continuam válidas; editar/toggle da gerada impede reversão inteira. Claim isolado não invalida undo. Reversão usa referências internas e before-image do main, nunca Task/UndoPlan do renderer. Memória por superfície, sem histórico persistente. Documentar como a transição oferece os fatos necessários, sem implementar token/armazenamento/UI de undo agora. Excluir portadora encerra atividade, mas lixeira retém regra; restore/undo devolve regra sem gerar no momento da restauração, condicionados à unicidade da portadora. |
| TFA-008 — lembretes | Regra exige prazo e só OFFSET; transição futura copia offsets com IDs novos/sem marcadores antigos, liquida vencidos e reconcilia fechada+nova **após commit**. Falha do scheduler não desfaz commit; claim relê ocorrência atual. Toggle não reconcilia. **Recorte recomendado nesta TFA-005:** manter bloqueio de mudança efetiva de prazo/status de tarefa com reminders e de geração dependente deles até TFA-008; permitir edits independentes/toggle e avaliar edição da regra sem efeitos de reminder. Não introduzir scheduler no-op, remover reminders nem anunciar agendamento. Copiar/remodelar a política de vencidos funcional fica para TFA-008; definir regressões contratuais agora. |
| TFA-007 / TFA-010 | Backup v4 de tarefas preserva série/âncora/itens/ordem; novos metadados de revisão são de storage, não de backup. Importação/substituição e migração real ficam na TFA-007, com revisão da política de séries duplicadas. IA só na TFA-010, usando o mesmo contrato de drafts id/título e revisão humana, sem sugestões/rede nesta Change. |

**Escopo recomendado:** regras e ações existentes de recorrência sem lembretes funcionais, subtarefas completas na janela principal, casos de uso portáveis no main, transação/CAS refinado para a preferência humana, UI/IPC seguro e regressões de calendário/IDs/concorrência. **Exclusões:** novos tipos/contagem de recorrência, retrogeração de perdidas, motor de calendário, timezone por série, redesign/dashboard, status/prazo/reminders próprios de subtarefa, subtarefas aninhadas, lixeira/desfazer/backup funcionais, scheduler/notificações/bandeja/login, captura/atalhos/Quick Add, IA/segredos/rede, novas janelas de produto, release/instalador/distribuição e reparação automática de dados. Não resolver o D10 herdado por virtualização, mudança de gate ou outra Change implícita.

**Dúvidas materiais para fechar no propose:** (1) escolher e especificar o mecanismo de concorrência que atenda à preferência confirmada, incluindo migração/bootstrap/downgrade e ABA se acrescentar metadados; (2) aprovar o recorte conservador de reminders e mensagens, sem fingir paridade completa antes da TFA-008; (3) explicitar paridade de anchorAt ao alterar regra+prazo, until comparado a dueAt, criação terminal e drift após gap, separando bugs/correções de comportamento existente; (4) definir recusa segura para overflow/avanço muito antigo e portadoras duplicadas preexistentes; (5) fechar schemas/versionamento/erros/budgets e preservação de histórico nos novos campos. Stack/driver/instalador não precisam ser reabertos. Nenhuma dúvida exige implementar agora; recomendações não são aprovação.

**Riscos principais:** duas portadoras por leitura stale (unidade única + pré-condições); ID novo substituir tarefa (colisão antes de save); formulário reintroduzir item removido ou marcação antiga (base estrutural + done relido); revisão parcial enfraquecer undo (conteúdo completo separado); omissão apagar advanced fields (patch explícito); série mudar fase/hora por “simplificação” (fixtures de âncora/DST); laço bloquear main/overflow virar encerramento falso (budget/erro atômico); mudança de schema interrompida (migração transacional testada); copiar manager completo expor futuras ações (cópia seletiva); controles busy perderem foco (aria-disabled e regressões). Preservar a pendência de performance e medir o incremento de UI, sem alegar smoke verde anterior.

#### Critérios candidatos e testes a refinar no propose

Os cenários abaixo são **planejados**, não implementados. Portáveis serão copiados por revisão somente no apply autorizado; testes/adapters Chrome serão substituídos por testes desktop no app.

| ID | Resultado observável futuro |
| --- | --- |
| R01 — Validação | Limites 1/365 e 0/366/fracionário; dias vazios/repetidos/0–6; mensal 1/31 versus 0/32; regra sem prazo, até exatamente dueAt e limite anterior/inválido; absoluto incompatível. Erros de campo/item focados; zero commit em recusa. |
| R02 — Calendário | Jan31→fev28/29→mar31; virada de ano, leap day, semanal domingo e vários dias, fase diária >1; conclusão antecipada avança um passo; atrasada pula perdidas; now exatamente candidato pula; until exatamente candidato aceita, posterior termina sem próxima. |
| R03 — Fuso | TZ controlados UTC/America/Sao_Paulo/America/New_York, 23h/25h, segundos/ms, gap/repetição e sequência após gap com resultado da origem. Main e form usam interpretação coerente; troca de fuso com draft de prazo/limite exige revisão; sem mudar TZ do PC. |
| R04 — Editar ocorrência/série | Adiar preserva âncora, voltar limpa; regra+prazo juntos seguem comportamento explicitado; alterar regra não reescreve antigas; encerrar sem cancelar remove só regra/conserva série/status; omissão conserva avançados/precisão. |
| R05 — Fechar/gerar | DONE e SKIP geram uma TODO com mesmos campos/série/limite, sem completedAt/âncora antiga; itens em ordem/IDs novos/desmarcados. END, limite atingido e tarefa sem regra não geram. Form e cartão iguais; criação terminal explicitamente coberta; nenhuma geração ao abrir/ler/esperar. |
| R06 — Escolha/reabertura | Cancelar portadora sem SKIP/END recusa; abandonar diálogo não grava; focusout CANCELLED recorrente restaura, Enter/ponteiro abre escolha; reabrir antiga mantém série/itens e deixa próxima intacta; concluir de novo não duplica. |
| R07 — Atomicidade/IDs | Falha entre fechada/gerada e antes do commit preserva ambas/revisões; kill em perfil de teste antes/depois de COMMIT/resposta encontra anterior/novo inteiro. Colisões tarefa/lixeira/série/IDs locais não sobrescrevem; retries limitados de ID, nunca replay de mutação. |
| R08 — Concorrência de série | Duas sessões fechando/SKIP/END/editando mesma base, inclusive relógio igual e resposta perdida: no máximo uma próxima/portadora. Base stale não grava; no-op não muda timestamp/revisão/evento. Portadora duplicada preexistente não é apagada/reparada silenciosamente. |
| S01 — Drafts/identidade | Vazio/20/21, títulos 200/201 e trim, IDs vazios/repetidos; adicionar/renomear/remover/mover preserva ordem e marcação por ID; novos desmarcados/main IDs. Cancelar form não grava; omitted versus [] distintos; ID removido não é recriado por save stale. |
| S02 — Toggle independente | Em quatro status, muda apenas done/updatedAt/revisões pertinentes; último item não conclui, status não muda marcas. Mesmo valor no-op; tarefa/item ausente não altera demais; toggle versus edit/claim preserva estado recente e processedFor; falha mantém banco/checkbox/foco. |
| S03 — Preferência humana/CAS | Form aberto + toggles externos ainda salva seus campos com done recente; título/regra/ordem/IDs alterados externamente conflitam e preservam draft. Toggle aumenta revisão completa e invalida futuro undo, sem elevar revisão de edição; claim não altera nenhuma revisão de usuário. Testar ABA/recriação, reopen e migração se adotada. |
| U01 — UI/a11y | Expansão inicia recolhida, sobrevive a snapshot na mesma superfície e não persiste; nomes/aria/progresso/search, Espaço, busy focável/duplo gesto, primeiro erro e mover até extremos; foco da ação/vizinho/dialog abort; janela mínima/zoom200/strings/IDs históricos. |
| I01 — IPC/estado | Novos fields/schemas/versões e 64 KiB/8 KiB (candidatos a conservar) com composição máxima 20×200+campos básicos, Unicode/escaping/IDs históricos; sem Task/seriesId/anchor/auditoria/done indevido. Guards antes de acesso, sessões/reload, ack→snapshot, dois registros visíveis juntos, incerto sem replay; leitura 1 KiB/páginas256 KiB preservadas. |
| C01 — Contratos futuros | Especificar testes TFA-006 de undo inteiro/gerada editada ou marcada/claim/no history e TFA-008 de offsets/settlement/reconcile pós-commit/claims concorrentes/falha scheduler. Nesta TFA-005 comprovar bloqueios de reminders e ausência de serviços/controles futuros, sem anunciar esses cenários funcionais como entregues. |
| V01 — Recursos/runtime | Overflow e âncora antiga têm resultado seguro/limitado, sem fechamento parcial. Gates lint/typecheck/test/build/OpenSpec; pacote fictício com criar/editar/regra/fechar/SKIP/END/reabrir/toggle/reopen/duas sessões e negatives reais. Medir regressão de 1.000/10.000 mantendo D10 herdado; build não certifica Setup/notificações/bandeja/atalhos. |

**Verificação desta exploração:** `npm run validate` com **Node 24.21.0/npm 11.21.0** já disponíveis passou: lint, cinco typechecks, **34 arquivos/475 testes aprovados + 1 skipped**, build main/preload/renderer. Sem instalar pacotes ou alterar lockfile/runtime. `openspec validate --all --strict --no-interactive --json`: **6/6 specs** válidas (INFO preexistente de texto longo per-user); `--archived`: **4/4 Changes** com tasks completas. Esses gates validam a **base entregue**, não a TFA-005 ou seus critérios futuros. As sondagens foram em memória e não executaram a suíte da extensão. Nenhum novo empacotamento, smoke, Setup ou teste Windows desta Change; D10 da TFA-004 permanece reprovado na evidência histórica, sem nova medição nesta exploração.

### Prompt consolidado para opsx:propose

Pronto para uso em **novo pedido explícito**. A preferência de concorrência acima está confirmada; mecanismos e demais recomendações precisam ser propostos/revisados. Salvar este prompt não inicia propose/apply.

```text
$openspec-propose TFA-005 — preservar-recorrencias-e-subtarefas

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-005-preservar-recorrencias-e-subtarefas, criada da main 64fe7adc42b7eb0f4435c02970363f7d6b060e3f (PR #4 integrado). Leia AGENTS.md, docs/roadmap.md (exploração TFA-005, achados, dúvidas e R01–V01), os artefatos arquivados das dependências TFA-004/003 e specs/código pertinentes. Extensão/Git em C:\QSI\Workspaces\taskflow-extension estritamente somente leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4: sem editar, instalar, testar, construir ou alterar Git ali. Preserve trabalho preexistente.

Crie apenas proposal/design/specs/tasks desta Change via CLI instalada 1.14.0/schema spec-driven, sem skip_specs documental; registre IN_PROGRESS/PROPOSE/data antes e IN_REVIEW/REVIEW depois. Evolua coerentemente desktop-task-management, desktop-state-ipc e desktop-foundation, que hoje vedam essas ações; local-task-persistence também se o contrato de revisões/migração mudar. Não implemente, instale, execute Setup, inicie apply/archive/commit/push/PR/merge/distribuição ou Changes futuras. Entregue artefatos para revisão e registre/entregue prompt de apply, sem inferir aprovação.

Preserve Vue/Pinia/Electron, núcleo portável estrito, main proprietário e UI/teclado existentes. Proponha cópia revisada de cálculo/validação/transições/subtarefas e testes; adapte orquestração ao read/decide/commit desktop, sem TaskService completo, Chrome ou scheduler fictício. Somente DAILY 1–365, WEEKLY dias distintos 0–6, MONTHLY 1–31, prazo e until opcional; sem tipos/contagem/calendário novos. Base anchorAt??dueAt, avanço civil local ao menos uma vez até >now, mensal último dia sem ajuste permanente, até until inclusivo, perdidas puladas e uma próxima somente ao fechar. Conservar segundos/ms/ISO intactos, adiamento/retorno da âncora, seriesId e reabertura sem regra/nova geração. Explicite comportamento real de regra+prazo juntos, until comparado a dueAt, criação terminal com regra sem geração imediata e drift 02:30→03:30 após gap; qualquer correção material exige revisão, não simplificação silenciosa.

Fechada e gerada no mesmo commit; DONE/SKIP transferem regra, END cancelando não gera, remover regra conserva status. Nova TODO copia campos/série/limite, itens ordenados com IDs novos/desmarcados, sem completedAt/âncora antiga. Confira CAS/portadora/IDs dentro da unidade, nunca apenas no save; proteção contra colisão tarefa/lixeira/série/IDs locais e duplicação por duas sessões/replay. Uma portadora por série permite antigas reabertas ativas. Defina recusa preservando dados em portadoras duplicadas/overflow/avanço excessivo; sem reset/reparação/encerramento silencioso.

Subtarefas: até 20, título trim 1–200, profundidade única, IDs locais, ordem manual/controles de teclado, progresso derivado, toggle em qualquer status sem alterar tarefa/reminders. Form envia id/título, conserva done atual; ausente conserva e [] limpa. Preferência humana CONFIRMADA: save após mudanças apenas em marcações deve funcionar preservando done recente; alterações estruturais devem conflitar. Recomende revisão de edição monotônica separada da revisão completa de conteúdo (toggle invalida undo; claim não), compare token de edição no main e feche mecanismo/ABA/snapshot/ack/bootstrap/migração/downgrade no design. Eventual schema SQL novo exige proposta explícita; não alterar payload/backup por metadado de storage. Não esconder toggle como processamento interno nem fazer merge/rebase geral.

Defina catálogo/DTOs/versionamento finitos para criação/patch/status/regra/SKIP-END e setSubtaskDone por intenção; main calcula IDs/âncora/série/clock, sem Task/auditoria/UndoPlan livres. Preserve budgets existentes ou justifique revisão com medição 20×200+campos básicos/Unicode/escaping/IDs históricos, sem truncar. Guards/sessões em admissão/execução/saída, ack pós-commit e snapshot autoritativo; incerto exige ressync sem replay. Preserve confirmação, focusout CANCELLED recorrente que restaura sem abrir/aplicar, expansão transitória, busy focável, erros posicionais e foco.

Delimite TFA-006: reversão futura anterior+remoção da gerada atômicas por revisões completas; gerada editada/marcada bloqueia, claim não; lixeira conserva regra e restore não gera. Apenas contratos/cenários, sem undo/token/histórico/UI implementados. Delimite TFA-008: OFFSET com novos IDs, settlement de vencidos e reconcile depois de commit/claim condicional; falha externa não desfaz commit. Recomende manter bloqueio de prazo/status/geração dependente de reminders até integração real, permitindo edits independentes/toggle; feche recorte/mensagens na revisão, sem serviço no-op ou remoção de dados. Backup/importação/IA/captura/lifecycle/distribuição ficam nas Changes próprias.

Refine R01–V01 em requisitos/cenários/tasks: limites/calendário/leap year/DST/gap/repetição/fuso/precisão; âncora/terminal/reabertura; atomicidade/colisão/duas sessões/ABA/commit sem resposta; drafts/toggles/CAS escolhido; UI/foco/IPC/bytes/snapshots; migração se necessária; limites seguros/runtime empacotado fictício. Gates existentes e OpenSpec estrito; preserve D10 herdado como pendência, sem virtualização ou remoção automática do gate. Diferencie base validada de testes futuros e pacote de instalação. Pare na proposta para revisão; apply só com autorização e artefatos aprovados.
```

### Proposta entregue para revisão — 2026-10-04

**Autorização:** novo pedido explícito de `$openspec-propose` com o prompt consolidado anexado. Registrado IN_PROGRESS/PROPOSE/início 2026-10-04 antes da criação; entrega em IN_REVIEW/REVIEW. Reutilizada a branch da exploração sem alterar sua base ou o diff preexistente. CLI OpenSpec **1.14.0**, raiz local e schema **spec-driven**, sem skip_specs; status **4/4 artefatos completos** significa planejamento existente, não aprovação nem implementação.

**Artefatos:** [proposal.md](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/proposal.md), [design.md](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/design.md), [tasks.md](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/tasks.md), `.openspec.yaml` gerado pela CLI e seis deltas:

- Novos: [desktop-task-recurrence](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/specs/desktop-task-recurrence/spec.md) e [desktop-task-subtasks](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/specs/desktop-task-subtasks/spec.md).
- Modificados: [desktop-task-management](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/specs/desktop-task-management/spec.md), [desktop-state-ipc](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/specs/desktop-state-ipc/spec.md), [desktop-foundation](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/specs/desktop-foundation/spec.md) e [local-task-persistence](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/specs/local-task-persistence/spec.md). Incluída renomeação do requisito de intenção básica para intenções autorizadas.

**Cobertura proposta:** **38 requisitos** (17 ADDED/21 MODIFIED), **98 cenários**, **44 tasks pendentes** em oito grupos. Todas as tasks definem verificação; testes/documentação acompanham cada grupo. Todos os nomes de cenários originais dos requisitos MODIFIED foram mantidos. R01–V01 estão rastreados no design e nas tasks; nenhum cenário futuro está anunciado como já aprovado/passando.

**Decisões concretas propostas, ainda não aprovadas:**

- Duas revisões persistidas: `contentRevision` completa inclui done; `editRevision` monotônica de edição muda para campos/status/regra/IDs-títulos-ordem e conserva para checks. Form/status/toggle usam CAS de edição; form recompõe done atual. Claim conserva ambas; no-op não grava. ABA de campo/tarefa/item continua protegido por revisão monotônica, sem hash/token transitório ou terceiro metadado.
- **SQL 2 com migração transacional 1→2:** edit inicia igual a content, payloads/IDs/deletedAt permanecem integrais, global incrementa uma vez pela migração, como executor existente. Codec4 e backup não mudam. Perfil novo nasce em SQL2; antigo leitor bloqueia downgrade preservando banco.
- **IPC de estado/mutação v2** em pacote único, nove wrappers; diagnóstico/openTaskSource permanecem v1. DTOs finitos, guards nas três fases, ack após commit e snapshot completo autoritativo; versões antigas de estado/mutação recusadas sem alias.
- Preservados calendário/âncora/precisão e comportamentos reais observados: regra+prazo mantém antiga âncora; until compara dueAt; criar terminal com regra não gera imediatamente; gap do cálculo pode deslocar 02:30 para 03:30 e continuar ali. DONE/SKIP transferem regra atomicamente; END não gera; antigas reabertas sem regra não duplicam série.
- Uma portadora com regra por série em tasks/trash, qualquer status; IDs gerados conferidos na unidade, até três tentativas. Duplicidade histórica recusa decisão afetada, sem alterar leitura/marks/edição independente. Cálculo limita **32.768 passos** e recusa overflow/excesso preservando dados, sem encerrar silenciosamente.
- Guarda temporária D8: lembretes bloqueiam mudança efetiva de prazo/status ou fechamento/geração; permitem independentes/checks, regra em não terminal sem efeitos e retirada isolada conservando status/prazo. AT impede adicionar regra. Contratos TFA-006/008 têm fixtures/primitivas internas, sem undo/token/histórico/lixeira/scheduler/notificação funcional.

**Medição de orçamento nesta proposta:** serialização fictícia em memória, com 20×200 títulos de subtarefas, básicos nos limites, controle escapado seis bytes/caractere, tags distintas, URL2081, UUIDs36 e revisão decimal máxima: create **55.047 bytes**, update **56.020 bytes**, abaixo de **65.536**. Conservados budgets de resposta8KiB, estado/evento1KiB e página256KiB. Isso não é execução de parsers/UI/runtime nem limite máximo para IDs históricos; dados maiores têm recusa segura sem corte. Unicode suplementar e demais extremos serão testes no apply.

**Validação realizada nesta entrega:** Change estrita válida sem issues; `openspec validate --all --strict --no-interactive --json` **7/7** (6 specs e esta Change), com INFO preexistente em windows-per-user-installation; `--archived` **4/4**. Revisão de deltas confirmou nomes existentes e nenhum cenário original perdido; links locais dos artefatos válidos. `npm run validate` com Node24.21.0/npm11.21.0: lint, cinco typechecks, **34 arquivos / 475 testes passando + 1 skipped**, build main/preload/renderer. Esses gates verificam a base existente: código/testes funcionais TFA-005 não foram implementados. Diff/check e escopo conferidos no app; nenhum pacote/Setup foi executado nesta proposta. O D10 histórico de 10.000 continua reprovado/retido, sem nova medição ou virtualização.

**Pendente:** revisão humana explícita de proposal/design/specs/tasks, incluindo compatibilidade SQL/IPC, limite seguro e guarda de lembretes; depois novo pedido de apply. Nenhuma implementação, nova dependência, relatório de verify, archive, commit/push/PR/merge/distribuição ou Change futura foi criada. A origem/Git foram somente consultados, com HEAD reconferido `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Não foram modificadas specs principais, README ou documentação operacional para anunciar recursos planejados.

### Aprovação dos artefatos — 2026-10-04

**Evidência humana nesta conversa:** após receber os artefatos para revisão, o usuário declarou: **“Eu aprovo os artefatos. atualize o roadmap, commit e faça o push”**. A aprovação abrange a versão entregue de proposal, design, os seis deltas (`desktop-task-recurrence`, `desktop-task-subtasks`, `desktop-task-management`, `desktop-state-ipc`, `desktop-foundation` e `local-task-persistence`) e tasks da TFA-005, incluindo as decisões de SQL 2/`editRevision` com migração transacional 1→2, IPC de estado/mutação v2, limite de cálculo de 32.768 passos, guarda temporária D8 de lembretes e o orçamento de mutação medido. Estado atualizado para **APPROVED/READY_FOR_APPLY**; as **44 tasks permanecem pendentes** e não há início de implementação nem data de conclusão.

O mesmo pedido autoriza atualizar o roadmap, commitar e dar push destes artefatos na branch **`codex/tfa-005-preservar-recorrencias-e-subtarefas`**, no Git próprio do app e remote `origin` (`https://github.com/Cadlira/taskflow-app.git`); é a autorização correspondente do item 45 do AGENTS.md para estas ações. O registro de aprovação não altera requisitos nem executa apply; archive, PR, merge, instalação e distribuição seguem suas autorizações próprias. As observações de aprovação pendente no registro de entrega descrevem o momento em que foram elaboradas; este registro estabelece a aprovação posterior sem alterar o conteúdo técnico dos artefatos. A validação relatada na entrega do propose continua evidência da base e dos artefatos, sem comprovar a implementação planejada.

### Prompt consolidado para opsx:apply

A aprovação humana explícita de proposal/design/seis deltas/tasks e suas decisões foi registrada acima em **2026-10-04**. Usar este prompt em **novo pedido de apply**; estar salvo no roadmap não inicia a implementação.

```text
$openspec-apply-change TFA-005 — preservar-recorrencias-e-subtarefas

Use somente após aprovação humana explícita de proposal/design/seis deltas/tasks desta Change. Trabalhe em C:\QSI\Workspaces\taskflow-app, na codex/tfa-005-preservar-recorrencias-e-subtarefas (base 64fe7adc42b7eb0f4435c02970363f7d6b060e3f). Leia AGENTS.md, docs/roadmap.md, todos os artefatos em openspec/changes/preservar-recorrencias-e-subtarefas e dependências arquivadas TFA-004/003. Preserve o diff preexistente. Extensão e Git em C:\QSI\Workspaces\taskflow-extension apenas leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4; nunca editar/instalar/testar/buildar/alterar Git ali.

Implemente somente as 44 tasks aprovadas, marcando com evidência. Preserve Vue/Pinia/Electron, núcleo estrito portável e main read/decide/commit; copie apenas regras/testes revisados, sem TaskService inteiro/Chrome/scheduler no-op. Mantenha DAILY1–365, WEEKLY únicos0–6, MONTHLY1–31, due obrigatório/until inclusivo contra dueAt, anchorAt??dueAt, calendário local/fase/perdidas puladas, precisão intacta, criação terminal sem geração imediata, regra+prazo com antiga âncora e drift de gap. Limite cálculo a32.768 passos, recuse overflow/excesso sem mudar regra/status/dados.

Fechar DONE/SKIP e gerar próxima TODO na mesma unidade; END não gera; retirar regra conserva status/série; reabrir histórica não recupera regra. Confira portadora única em tasks/trash, CAS e IDs na unidade/plano final, três tentativas por identidade, sem upsert colidente/reparação automática. Próxima copia campos/série/until e renova IDs de subtarefas/OFFSET sem done/processedFor/completedAt/âncora antiga.

Implemente SQL2/editRevision e migração1→2 conforme design: edit=content, payloads intactos, global+1 da migração, bootstrap/reopen/migração atomicamente validados e downgrade recusado. Codec4/backup intactos. Edit/status/toggle usam expectedEditRevision; checks mudam contentRevision/updatedAt conservando edit, claim conserva ambas. Form envia IDs/títulos e recompõe done atual, tolera apenas marcações concorrentes; estrutura/campos/ABA conflitam sem rebase geral. Até20 itens, títulos trim1–200, IDs locais válidos, ordem manual/progresso derivado, toggle por boolean nos quatro status, omit conserva/[] limpa/histórico intacto.

Entregue nove wrappers fechados; estado/eventos e quatro mutações v2, verifyFoundation/openTaskSource v1. Parsers/erros finitos e guards de sessão em admissão/execução/saída; budgets64KiB/8KiB/1KiB/256KiB, sem cortar dados/IDs. Ack pós-commit com global/content/edit e snapshot autoritativo; incerto exige ressync/nova decisão sem replay. Preserve diálogo SKIP/END/abandono, focusout CANCELLED recorrente restaurando sem diálogo/comando, expansão transitória, teclado/busy/foco/erros e revisão de fuso de prazo/limite.

Mantenha guarda D8: com lembretes recuse mudança efetiva de prazo/status ou fechamento/geração; permita independentes/checks/regra sem fechamento e retirada isolada, preservando dados/marcadores. Só contratos/fixtures das primitivas existentes para TFA-006/008: reversão futura por conteúdo completo de anterior/gerada, check/edição da gerada bloqueia e claim não; trash conserva regra/restore não gera; OFFSET novos IDs/settlement/reconcile pós-commit/claim. Não entregar undo/token/histórico/UI/lixeira funcional/notifier/scheduler/backup/import/IA/captura/lifecycle/distribuição ou novas recorrências.

Verifique R01–V01 e cada grupo de tasks com seus testes/documentação, gates existentes e OpenSpec1.14 estrito. Exercite produto/bridge/migração/kill/convergência no Electron empacotado fictício sem Setup/dados reais; meça32.768 passos/varredura/UI com1.000/10.000, Unicode/escaping/IDs históricos. Preserve D10 herdado e reporte falhas sem retirar gate/truncar/virtualizar/instalar worker ou afirmar smoke verde. Mudança material requer revisar artefatos antes de implementar o ponto; continue trabalho independente autorizado.

Ao terminar apply, execute openspec-verify e crie verification.md nesta Change com evidências reais, pendências e rastreabilidade. Atualize roadmap IN_REVIEW/REVIEW e entregue para aprovação explícita antes de archive. Não iniciar archive/commit/push/PR/merge/Setup/distribuição ou outra Change sem pedido correspondente; README final fica para archive autorizado.
```

### Apply e verificação — 2026-10-04

**Autorização e limites:** novo pedido explícito de apply com o prompt acima. Executadas somente as
**44 tasks aprovadas**, na branch `codex/tfa-005-preservar-recorrencias-e-subtarefas`, preservando o
diff preexistente (apenas `tasks.md` e artefatos da Change) e sem tocar a origem
(`C:\QSI\Workspaces\taskflow-extension`, HEAD `a763e7a0…`, worktree limpo). Sem novas dependências,
Setup, distribuição, commit/push/PR/merge, archive, README antecipado ou próxima Change.

**Implementação (64 arquivos; +7.440/−1.495):** domínio portável de recorrência/subtarefas com
limite de 32.768 passos; SQL 2 com `edit_revision` e migração real 1→2; comandos coordenados
(criação/edição/status/toggle, fechamento DONE/SKIP/END, portadora única, guarda D8, identidades com
três tentativas); contratos/preload/main v2 com nove wrappers e `setSubtaskDone`; store/formulário/
cartões com diálogo SKIP/END, focusout excepcional, revisão de fuso de prazo/limite e progresso
derivado; harness empacotado com cenários `seed-sql1`, `inspect-sql1`, `crash|migrate*`,
`recurrence` e medições novas. Documentação: domínio, persistência/migração, catálogo v2,
operacional, paridade, formulário/cartões e evidência de pacote.

**Evidências reais:** `npm run validate` — lint sem warnings, 5 typechecks, **39 arquivos / 596
testes + 11 skipped**, build ok; `openspec validate --all --strict` **7/7** e `--archived` **4/4**
(INFO preexistente); `package:win` + `verify:package` OK; `smoke:packaged` com todas as fases novas
**PASS** (migração/kill antes-durante-depois do commit, bridge 27 verificações, bench com gate
D10 de mutação/página aprovado, UI de tarefas, `recurrence` 21/21 e `a11y`). O smoke termina com
código 1 **somente** pelo gate D10 herdado de 10.000 tarefas: após as duas otimizações aprovadas na
revisão (`v-if` nas subtarefas, −29% de nós; leitura leve de portadora), as interações p95 caíram
de 783,8 para **661,6 ms**, o heartbeat de 865,6 para **636,1 ms** e a varredura de portadora de
198,66 para **141,71 ms**; o alvo de 500/250 ms segue retido, sem virtualização ou truncamento. A
rodada completa sofreu stall externo no `ui-bench` e a medição foi refeita isolada e limpa.
Detalhes em [verification.md](../openspec/changes/archive/2026-10-04-preservar-recorrencias-e-subtarefas/verification.md)
e [packaged-evidence-tfa005.md](packaged-evidence-tfa005.md); roteiro humano em
[a11y-manual-checklist-tfa005.md](a11y-manual-checklist-tfa005.md).

**Pendências para revisão humana:** decidir os números do orçamento de reordenação completa de
10.000 (proposta: p95 ≤ 700 ms e heartbeat ≤ 700 ms, mantendo montagem ≤ 5 s e cartões completos)
e do fechamento/varredura (proposta: ≤ 250 ms), ou aprovar Change de janela de renderização;
executar o roteiro manual de acessibilidade. Setup, instalação corporativa, distribuição e
notificações/bandeja/atalhos não foram exercitados.

### Archive — 2026-10-04

**Evidência humana:** o usuário determinou textualmente: **“Rode o opsx-verify e não ocorrendo
nenhum critico ou warning bloqueante, rode o archive. Depois atualize o roadmap, commit, faça o
push e gere o PR”**. Antes disso, aprovou as duas otimizações de performance e o roteiro manual de
acessibilidade. O relatório `verification.md` não tem CRITICAL; os três WARNING foram tratados como
**não bloqueantes** pela decisão do usuário: D10 herdado com números melhorados e proposta de
orçamento registrada (gate retido, sem virtualização/truncamento), varredura com orçamento próprio
proposto e prova humana com roteiro entregue para execução.

**Archive:** `openspec archive preservar-recorrencias-e-subtarefas --yes --json` moveu a Change para
`openspec/changes/archive/2026-10-04-preservar-recorrencias-e-subtarefas` e consolidou as specs:
**17 requisitos adicionados**, **21 modificados** e **1 renomeado** em `desktop-task-recurrence`
(nova), `desktop-task-subtasks` (nova), `desktop-task-management`, `desktop-state-ipc`,
`desktop-foundation` e `local-task-persistence`. `openspec validate --all --strict --no-interactive`:
**8/8**; `--archived --strict`: **5/5**. README factual, datas e links atualizados neste archive;
commit **`49eee44`**, push para `origin/codex/tfa-005-preservar-recorrencias-e-subtarefas` e
**PR #5** abertos pelo pedido explícito do usuário
([Cadlira/taskflow-app#5](https://github.com/Cadlira/taskflow-app/pull/5)). Estado
**READY_FOR_MERGE** em **2026-10-04**; a **TFA-006** permanece PLANNED com seu prompt de explore
próprio.

**Prompt consolidado para o archive (não inicia nada por si):**

```text
$openspec-archive-change TFA-005 — preservar-recorrencias-e-subtarefas

Somente após aprovação explícita do relatório de verificação desta Change pelo usuário. Trabalhe em C:\QSI\Workspaces\taskflow-app, na branch codex/tfa-005-preservar-recorrencias-e-subtarefas. Leia AGENTS.md, docs/roadmap.md, os artefatos da Change e verification.md. Extensão/Git em C:\QSI\Workspaces\taskflow-extension estritamente somente leitura (HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4): nunca editar/instalar/testar/buildar/alterar Git ali.

Arquive a Change na mesma branch somente com o relatório aprovado: consolide as specs, atualize roadmap (DONE), README conforme o item 38 do AGENTS.md, datas e documentação final; rode openspec validate --all --strict e --archived, e os gates finais. Não altere o gate D10, não virtualize nem trunque dados; registre a pendência como decisão pós-archive. Commit/push/PR/merge e qualquer próxima Change (TFA-006) somente com pedido correspondente; sem Setup, instalação corporativa ou distribuição.
```

## TFA-006 — Lixeira e desfazer

**Slug sugerido:** `migrar-lixeira-e-desfazer`. **Dependências:** TFA-005.

**Resultado:** Conservar exclusão recuperável e desfazer seguro de ações recentes.

**Escopo previsto:** Mover para lixeira com retenção de 30 dias, restauração, exclusão definitiva/esvaziamento com confirmação e expurgo. Desfazer a última exclusão, edição ou mudança de status, incluindo alterações de séries. Manter semântica temporária por superfície e recusar reversão quando os dados mudaram depois.

**Critérios de aceitação para refinar na proposta:** Exclusão e restauração são consistentes entre coleção e lixeira; retenção é respeitada; desfazer não sobrescreve edição concorrente nem desfaz alteração de ocorrência gerada que já mudou; confirmações e foco permanecem acessíveis.

### Prompt para opsx:explore

```text
/opsx:explore TFA-006 — migrar-lixeira-e-desfazer

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia domain/task-trash.ts, task-undo.ts, application/trash-service.ts, TaskManager.vue, TrashManager.vue e testes de lixeira/desfazer na origem. Investigue operações atômicas entre tarefas e lixeira, concorrência de duas janelas, desfazer por superfície e reversões de séries. Preserve retenção de 30 dias, confirmações e recusas existentes. Defina comportamento ao fechar janela, trocar área e restaurar um backup. Diferencie histórico temporário de eventual histórico persistente, que não faz parte desta migração.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## TFA-007 — Backups e migração das atividades

**Slug sugerido:** `migrar-backups-e-importar-dados-da-extensao`. **Dependências:** TFA-006.

**Resultado:** Permitir que o usuário leve suas tarefas existentes ao desktop por backup, com compatibilidade e validação.

**Escopo previsto:** Importar backups TaskFlow v1 a v4; exportar arquivo versionado; prévia, validação, limite de tamanho, confirmação de substituição total e verificação após gravação. Escolher arquivo e salvar no desktop. Documentar migração manual e política para versões futuras, sem ler automaticamente perfil do Chrome.

**Critérios de aceitação para refinar na proposta:** Fixtures antigas são aceitas e migradas corretamente; campos, ids, recorrências, subtarefas e lembretes são preservados; arquivo inválido/futuro falha sem alterar dados; restauração não altera credenciais; JSON exportado não contém credenciais. Backup atual transporta tarefas, não lixeira ou desfazer temporário.

### Prompt para opsx:explore

```text
/opsx:explore TFA-007 — migrar-backups-e-importar-dados-da-extensao

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia application/backup, componentes de backup, domain/task-integrity.ts e tests/fixtures/backups da origem. Avalie compatibilidade dos formatos 1 a 4, escolha/salvamento de arquivos, prévia de substituição total, validação de tamanho, recuperação de falhas e verificação de todos os campos restaurados, inclusive subtarefas. Planeje o percurso exportar na extensão e importar no app sem alterar a origem. Explicite que o backup existente não inclui lixeira, credenciais nem desfazer. Não proponha mesclagem ou extração direta do perfil do Chrome nesta Change.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## TFA-008 — Lembretes, notificações e ciclo de vida

**Slug sugerido:** `migrar-lembretes-e-ciclo-de-vida-desktop`. **Dependências:** TFA-007.

**Resultado:** Entregar lembretes nativos com semântica definida ao minimizar, fechar, suspender e reiniciar.

**Escopo previsto:** Agendamento a partir dos dados persistidos; lembretes absolutos/deslocamentos e restrições de séries; deduplicação, tolerância de atraso de cinco minutos, atualização/cancelamento e reconciliação após backup. Instância única, bandeja, abrir tarefa pela notificação e saída explícita. Avaliar inicialização no login como preferência opcional por usuário.

**Critérios de aceitação para refinar na proposta:** Notificações não duplicam nem se referem a tarefa excluída/alterada; fechar janela tem comportamento claro; sair encerra o processo; suspensão/reinício respeita política de atraso; recursos são verificados no binário empacotado. Não prometer avisos com app encerrado, computador desligado ou notificações bloqueadas.

### Prompt para opsx:explore

```text
/opsx:explore TFA-008 — migrar-lembretes-e-ciclo-de-vida-desktop

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia domain/task-reminders.ts, application/reminder-service.ts, reminder-scheduler.ts e entrypoints/background.ts da origem. Explore scheduler desktop, recuperação após suspensão/reinício, registro durável de ocorrências e serialização com alterações de tarefas. Preserve limites e tolerância de cinco minutos. Compare manter app na bandeja ao fechar com saída completa e defina como comunicar isso. Investigue notificações no Windows empacotado, AUMID, foco na tarefa e preferência de iniciar com o usuário. Não introduza serviço do Windows nem inicialização obrigatória.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## TFA-009 — Quick Add, captura copiada e atalhos

**Slug sugerido:** `adaptar-quick-add-captura-e-atalhos-globais`. **Dependências:** TFA-008.

**Resultado:** Manter entrada rápida e substituir captura Chrome por links/textos copiados, conforme decisão do usuário.

**Escopo previsto:** Quick Add em janela/superfície apropriada, botão de captura e atalho global; rascunho revisável sem salvar automaticamente. Atalhos para criar e abrir gerenciamento, apresentação das combinações efetivas, personalização e conflitos. Preservar formulário/filtros abertos; ler clipboard apenas sob ação explícita.

**Critérios de aceitação para refinar na proposta:** URL copiada preenche origem editável/removível; texto copiado vira título/descrição seguindo limites; conteúdo vazio ou inválido recebe feedback; nenhum polling do clipboard; atalho em conflito não quebra app; captura durante edição aguarda revisão sem sobrescrever formulário. Sem leitura da aba atual ou menu dentro do Chrome.

### Prompt para opsx:explore

```text
/opsx:explore TFA-009 — adaptar-quick-add-captura-e-atalhos-globais

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia QuickAdd.vue, application/page-capture.ts, keyboard-shortcuts.ts, domain/page-capture.ts e use-pending-capture.ts da origem. A escolha confirmada é capturar links e textos copiados por botão ou atalho global. Explore mapeamento de URL/texto para rascunho, título quando só existe URL, associação opcional de origem ao texto, captura pendente durante edição e clipboard vazio. Não faça requisição para obter título de página automaticamente. Planeje atalhos globais personalizáveis, conflitos, foco e Quick Add sem apagar estado do gerenciamento. Não inclua navegador embutido nem extensão auxiliar.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## TFA-010 — Provedores de IA e sugestão de subtarefas

**Slug sugerido:** `migrar-provedores-ia-e-sugestao-de-subtarefas`. **Dependências:** TFA-009.

**Resultado:** Preservar IA opcional com proteção adequada de credenciais no Windows e revisão das sugestões.

**Escopo previsto:** OpenAI, Anthropic e CUSTOM compatível com OpenAI, incluindo servidores locais; BYOK, base/modelo, teste de conexão e probe mínimo explícito. Consentimento por origem, prévia exata do conteúdo enviado, geração cancelável com timeout, validação/seleção das sugestões antes da aplicação. Adaptar permissões Chrome para autorização do app.

**Critérios de aceitação para refinar na proposta:** Sem configuração ou ação não há rede; credencial não chega ao renderer por leitura, log ou backup; origem não autorizada não recebe requisição; remoção revoga autorização; cancelamento e fechamento descartam resultado; falha mantém tarefa. Provedores locais e segurança de redirects são cobertos sem chamadas reais pagas nos testes.

### Prompt para opsx:explore

```text
/opsx:explore TFA-010 — migrar-provedores-ia-e-sugestao-de-subtarefas

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Leia domain/ai-provider.ts, ai-subtask-suggestion.ts, application/ai, infrastructure/ai, componentes de IA e seus testes. Explore reutilização dos protocolos existentes com rede e credenciais no main, IPC mínimo, safeStorage/DPAPI, indisponibilidade da proteção e consentimento por origem. Preserve OpenAI, Anthropic e CUSTOM, HTTPS remoto/HTTP local, bloqueio de redirects, modelos, testes de conexão, prévia exata, timeout, cancelamento e revisão das sugestões. Analise isolamento entre janelas e mudanças de provedor durante pedido em curso. Não crie conta TaskFlow, backend, sincronização ou uso automático de IA.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## TFA-011 — Instalador definitivo e distribuição Windows

**Slug sugerido:** `finalizar-instalador-e-distribuicao-windows`. **Dependências:** TFA-010.

**Resultado:** Gerar o instalador do produto completo, reproduzível e sempre por usuário.

**Escopo previsto:** Finalizar nome, appId estável, ícones, atalhos, empacotamento e pipeline de artefatos. Instalação/atualização/desinstalação em conta padrão, preservação de dados e procedimentos de recuperação. Avaliar assinatura e arquitetura de Windows; publicar artefatos somente quando autorizado. Atualização inicial pode ser manual via instalador.

**Critérios de aceitação para refinar na proposta:** Instalador instala no perfil e não exige elevação; aplicativo funciona offline sem Node/npm; atualização mantém dados e identidade; desinstalação tem política explícita de retenção; pacote não carrega .env, testes, dados ou segredos. Assinatura e limitações corporativas são informadas sem prometer aceitação pelo Windows ou pela empresa.

### Prompt para opsx:explore

```text
/opsx:explore TFA-011 — finalizar-instalador-e-distribuicao-windows

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Revise a prova da TFA-002 e o produto completo. Explore configuração definitiva do instalador per-user, identidade estável, atalhos/bandeja/notificações, ícones e dependências empacotadas. Planeje atualização por instalação da nova versão, retenção de dados, desinstalação e recuperação. Compare distribuição manual e artefatos de CI; avalie assinatura, custo e disponibilidade sem contratar serviço ou publicar automaticamente. Defina testes em conta padrão e pacote limpo. Auto-update remoto, Windows Store e suporte a outros sistemas operacionais ficam fora do escopo inicial.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## TFA-012 — Homologação de paridade e primeira versão

**Slug sugerido:** `homologar-paridade-e-primeira-versao-desktop`. **Dependências:** TFA-011.

**Resultado:** Verificar a migração completa e entregar uma versão utilizável com documentação fiel.

**Escopo previsto:** Conferir a matriz da TFA-001 no aplicativo empacotado e instalado por usuário; executar jornada com dados fictícios e backup representativo autorizado; validar rede opcional/offline, erros, acessibilidade, atualização e recuperação. Guia de instalação, migração, backup, lembretes, captura e limitações. Corrigir problemas do escopo aprovado ou registrá-los em Changes próprias.

**Critérios de aceitação para refinar na proposta:** Cada funcionalidade tem evidência de paridade ou adaptação explicitamente aceita; nenhuma pendência crítica de dados; gates e testes de instalador/uso passam; documentação corresponde ao estado real; usuário revisa a versão antes da distribuição. Original segue intacto.

### Prompt para opsx:explore

```text
/opsx:explore TFA-012 — homologar-paridade-e-primeira-versao-desktop

Trabalhe em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md e os artefatos existentes das dependências desta Change. Consulte C:\QSI\Workspaces\taskflow-extension apenas para leitura; nunca altere essa pasta ou seu Git.

Use a matriz da TFA-001 e os critérios das TFA-002 a TFA-011 para planejar homologação da versão empacotada. Defina jornadas reais de criação, recorrência, subtarefas, lixeira/desfazer, importação/exportação, lembretes, Quick Add, captura copiada, atalhos e IA opcional. Inclua conta padrão, offline, suspensão, atualização, dados corrompidos e falhas de armazenamento. Use dados fictícios e mocks; dados pessoais exigem autorização específica. Liste evidências, diferenças aceitas e critérios para release. Não declare paridade somente por build nem distribua a versão durante explore.

Entregue achados com referências, alternativas e recomendação justificada, escopo e exclusões, dúvidas materiais, riscos e critérios de aceitação/testes a refinar no propose. Pare após a exploração: não implemente, não instale dependências, não crie artefatos da Change e não inicie propose/apply sem pedido explícito.
```

## Como continuar em outra sessão

A **TFA-001** está integrada pelo PR #1; a **TFA-002**, pelo PR #2 (`c123261`); a **TFA-003**, pelo PR #3 (`d74e02d`). A **TFA-004** concluiu apply (**41/41**), verificação aprovada e archive em 2026-10-04, e está integrada pelo **PR #4**, merge **`64fe7adc42b7eb0f4435c02970363f7d6b060e3f`**, conferido na `main` e referência local `origin/main` na exploração. **Pendência pós-archive documentada:** D10 de 10.000 segue reprovado, com melhora após as otimizações da TFA-005 (interações p95 661,6 ms > 500 ms; heartbeat 636,1 ms > 250 ms; histórico 521,5/578,9), gate retido, sem virtualização ou truncamento; a decisão dos números do orçamento (proposta p95/heartbeat ≤ 700 ms e fechamento ≤ 250 ms) ou uma Change de janela de renderização fica registrada para revisão própria. Prova humana de acessibilidade tem roteiro entregue e execução pendente (TFA-012 se não ocorrer agora). A **TFA-005** está **READY_FOR_MERGE**, arquivada em **2026-10-04** com **44/44 tasks**, verificação aprovada pelo usuário e specs consolidadas; branch **`codex/tfa-005-preservar-recorrencias-e-subtarefas`**, commit **`49eee44`**, push feito e **PR #5** aberto aguardando integração. A prova instalada continua limitada à fundação; Setup, instalação corporativa, distribuição e promoção da versão exigem autorização correspondente.

Ao retomar, conferir a branch, o status do roadmap, as tasks e o diff do app. Preservar a origem e seu Git somente para leitura. Aprovação dos documentos não significa implementação, release ou paridade funcional desktop.

## Referências técnicas de consulta

- Origem local: README.md, docs/architecture.md, openspec/specs, src e tests da extensão, apenas leitura.
- [OpenSpec: Explore](https://github.com/Fission-AI/OpenSpec/blob/main/docs/explore.md): investigação e esclarecimento antes de código.
- [OpenSpec: Getting Started](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md): preparação e fluxo de comandos.
- [Electron: segurança](https://www.electronjs.org/docs/latest/tutorial/security): isolamento, IPC e superfícies de navegação.
- [electron-builder: NSIS](https://www.electron.build/docs/nsis/): modos de instalação e opções de empacotamento.
- [Quasar: configuração Electron](https://quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron/): alternativa técnica da primeira exploração.

Revalidar versões e opções na implementação; referências não significam escolha definitiva nem configuração já aplicada.

