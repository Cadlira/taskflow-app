# Roadmap de Changes — TaskFlow App

Preparado em **2026-10-03**; atualizado em **2026-10-07**. Estado: **TFA-001 a TFA-008 integradas/arquivadas: TFA-008 concluída em 2026-10-06 com 60/60 tasks, specs consolidadas e [relatório de verificação](../openspec/changes/archive/2026-10-06-migrar-lembretes-e-ciclo-de-vida-desktop/verification.md) aprovado; README atualizado; [PR #8](https://github.com/Cadlira/taskflow-app/pull/8) integrado à principal (DONE)**. A campanha instalada foi concluída no escopo de usuário único (waives registrados para segunda conta/Unicode por conta e logoff real simulado por `WM_QUERYENDSESSION`): identidade/AUMID/CLSID/COM, toast real com clique→localizar, startup opt-in/out com readback, upgrade/uninstall/reinstall com dados preservados e CPU ocioso 60 s 0,208%. Seis defeitos instalados foram corrigidos com regressão. D10 foi revisado formalmente por novos limites (1.000 mantém 500/250/2 s; 10.000 ≤2.500 ms de interações/heartbeat e ≤8 s de montagem), registrado em `d10-budget-review.md` na Change arquivada. Smoke integral PASS (40 verificações) e validate 935+11. No propose, origin/main foi atualizado e a branch própria TFA-008 criada sobre o merge da TFA-007 `c7dcf845ba82a74e7027e764626decf6e0bfd82c`; a exploração pré-existente foi preservada. A **TFA-009** está **READY_FOR_MERGE**, arquivada em2026-10-07 com relatório aprovado,43 tarefas executadas e2 dispensadas; integração pendente.

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
| TFA-005 | `preservar-recorrencias-e-subtarefas` | DONE | — | 2026-10-04 | 2026-10-04 | TFA-004 | Apply 44/44, verificação aprovada e archive; integração do PR #5 conferida na main e referência local origin/main em `ab3ed68` em 2026-10-04. D10 e prova humana de acessibilidade continuam pendentes |
| TFA-006 | `migrar-lixeira-e-desfazer` | DONE | — | 2026-10-04 | 2026-10-05 | TFA-005 | Apply 45/45, verification aprovado, archive e PR #6 integrado; merge `9e8a05a` conferido em 2026-10-05. D10, acessibilidade humana e before-images extremas continuam pendentes |
| TFA-007 | `migrar-backups-e-importar-dados-da-extensao` | DONE | — | 2026-10-05 | 2026-10-05 | TFA-006 | Apply 45/45, verificação aprovada, archive e README factual; PR #7 integrado em 2026-10-05, merge `c7dcf84` conferido no GitHub em 2026-10-06; referências locais ainda desatualizadas |
| TFA-008 | `migrar-lembretes-e-ciclo-de-vida-desktop` | DONE | — | 2026-10-06 | 2026-10-06 | TFA-007 | 60/60 tasks; verificação aprovada e archive em 2026-10-06; README atualizado; [PR #8](https://github.com/Cadlira/taskflow-app/pull/8) integrado à principal. Waives de usuário único e D10 revisado registrados na Change |
| TFA-009 | `adaptar-quick-add-captura-e-atalhos-globais` | READY_FOR_MERGE | ARCHIVE | 2026-10-06 | — | TFA-008 | Archive e relatório aprovado em2026-10-07;43 tasks executadas/2 dispensadas; gates finais16/16 specs e9/9 archives; integração pendente |
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

**Slug:** `preservar-recorrencias-e-subtarefas`. **Dependências:** TFA-004, arquivada e integrada pelo PR #4, merge local `64fe7ad` conferido em 2026-10-04. **Estado: DONE**; início/conclusão **2026-10-04**, apply com **44/44 tasks**, archive em **2026-10-04** e PR #5 integrado, merge local `ab3ed68` conferido na exploração da TFA-006. Branch local `codex/tfa-005-preservar-recorrencias-e-subtarefas`, criada na exploração a partir da `main` limpa. Artefatos aprovados pelo usuário em 2026-10-04; implementação, verificação aprovada, archive, README, commit, push e PR executados nos pedidos seguintes. D10 e prova humana de acessibilidade seguem como pendências documentadas.

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

### Integração conferida na exploração da TFA-006 — 2026-10-04

O histórico Git local contém o merge do PR #5 em **`ab3ed688f025064c16ce155ff5220fe62f9dbc59`**, datado de **2026-10-04 às 21:11:44 -03:00**. `main` e a referência local `origin/main` coincidem nesse commit. Estado atualizado para **DONE** e dependência da TFA-006 satisfeita. Conferência local, sem fetch/pull/merge executado nesta exploração nem nova consulta aos checks remotos; os registros anteriores de READY_FOR_MERGE descrevem a etapa anterior à integração. D10, varredura e acessibilidade humana permanecem nos limites já registrados.

## TFA-006 — Lixeira e desfazer

**Slug:** `migrar-lixeira-e-desfazer`. **Dependências:** TFA-005 integrada pelo PR #5, com contratos de persistência/IPC da TFA-003 e interface da TFA-004. **Estado: DONE**; início **2026-10-04**, conclusão **2026-10-05**. Branch `codex/tfa-006-migrar-lixeira-e-desfazer`, criada da `main` limpa em `ab3ed688f025064c16ce155ff5220fe62f9dbc59` por pedido explícito em 2026-10-04 e reutilizada no propose e no apply. Artefatos aprovados pelo usuário em 2026-10-04; apply executado com 45/45 tasks, relatório aprovado e archive em 2026-10-05, seguido de commit/push/PR por pedido explícito. O DONE inicialmente antecipado foi confirmado pela integração do PR #6 em `9e8a05a2d84874f25d9f429ecc120e81c7ec0acc`, conferida em 2026-10-05.

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

### Exploração concluída — 2026-10-04

**Autorização e entrega da exploração (registro histórico):** o usuário pediu explorar a TFA-006, criar a branch e ajustar o roadmap. Branch criada da `main`/referência local `origin/main` em **`ab3ed688f025064c16ce155ff5220fe62f9dbc59`**, merge do PR #5. Ao terminar a exploração, apenas este roadmap havia sido editado; nenhum diretório, proposal, design, spec, task, código ou teste da TFA-006 havia sido criado, nem propose/apply iniciados. Sem instalação de dependências, novo pacote/Setup, commit, push, PR, merge ou distribuição. O propose solicitado depois está registrado abaixo.

**Base consultada:** AGENTS.md e roadmap integralmente; proposal/design/tasks/verification arquivados da TFA-005; specs consolidadas pertinentes de persistência, IPC, fundação, gerenciamento e recorrências; unidades, comandos, sessões e store atuais do app. SQL **2**, codec **4**, estado/mutações **v2**, nove wrappers e main coordenador já existem. OpenSpec **1.14.0**, raiz local, schema **spec-driven**, zero Changes ativas e oito specs. A origem foi consultada somente em leitura no HEAD reconferido **`a763e7a0d646c664ecd4f979528bc2c3589fa8c4`**, worktree limpo; não executar sua suíte, builds, instalações ou comandos Git de escrita.

#### Achados e consequências para a proposta

| Referência verificada | Comportamento / consequência |
| --- | --- |
| [Política de lixeira](C:/QSI/Workspaces/taskflow-extension/src/domain/task-trash.ts:10) e [fronteiras testadas](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-trash.test.ts:35) | Retenção de **30 × 24 h**, limite de **100 itens**, ordem por deletedAt decrescente. Exatamente 30 dias permanece; antes do limite é vencido; datas futuras permanecem após ajuste de relógio. Inserção expurga vencidos, substitui mesmo ID e corta os mais antigos. Não converter para 30 dias de calendário local. |
| [Move/restore Chrome](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts:134) e [fila](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts:307) | Uma gravação contém tarefas+lixeira, mas a fila pertence à instância do repository; não prova exclusão mútua entre dois Side Panels. Desktop deve coordenar leitura, decisão, retenção e commit na mesma unidade do main. Não copiar filas por janela. |
| [Restore direto](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:215), [listagem/expurgo](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts:150) e [spec de retenção](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-trash/spec.md:35) | Restore direto, inclusive desfazer exclusão, não verifica idade; listTrash/purge fazem isso. Há lacuna entre código e proibição de restaurar vencidos. Recomendar conferir retenção em **todo restore/undo**, dentro da unidade, recusando item vencido sem restaurar nem gravar; limpeza ocorre por manutenção explícita separada. |
| [Inicialização da origem](C:/QSI/Workspaces/taskflow-extension/src/entrypoints/background.ts:45) e [primitivas desktop](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:227) | Origem limpa ao instalar/atualizar/iniciar e abrir/excluir; sem alarme periódico. Desktop já oferece move/restore/purge, mas sem política/UX; snapshots não podem expurgar. Recomendar manutenção explícita no startup, ao entrar na lixeira e no commit de exclusão. Enquanto aberta, filtrar vencidos pelo relógio de apresentação e revalidar ações, sem criar timer de escrita. |
| [Reversão da origem](C:/QSI/Workspaces/taskflow-extension/src/domain/task-undo.ts:25) e [reversão desktop](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:351) | Origem usa updatedAt; desktop tem contentRevision completa, separada de editRevision. Undo deve verificar conteúdo de anterior e gerada: edição/check invalida, claim isolado não. Igualdade de timestamp ou campos após A→B→A não autoriza desfazer. Reverter grava revisões novas e updatedAt novo. |
| [Transição e plano da origem](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:191), [resultado desktop](C:/QSI/Workspaces/taskflow-app/src/application/tasks/task-commands.ts:229) e [contrato aprovado D9](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-preservar-recorrencias-e-subtarefas/design.md) | Comandos atuais retornam só revisões; a versão anterior e a referência da gerada não estão no resultado público. TFA-006 precisa capturar esses fatos **na leitura atual da unidade**, antes da alteração, e guardar recibo interno somente após commit. Não reconstruir before-image do snapshot do renderer nem descobrir a gerada por título/série depois. |
| [Portadora atual](C:/QSI/Workspaces/taskflow-app/src/application/tasks/task-commands.ts:92) e [spec de série](C:/QSI/Workspaces/taskflow-app/openspec/specs/desktop-task-recurrence/spec.md) | Regra é única considerando tarefas **e lixeira**, qualquer status. Move conserva a regra; não gera próxima nem muda status. Restore/undo devolve regra sem gerar. Reversão remove a gerada diretamente de tasks; se ela foi editada, marcada, excluída, restaurada ou avançou a série, recusar a operação inteira. Conferir portadora no plano final, excluindo os registros movidos/removidos, sem reutilizar cegamente o helper atual. |
| [Oferta e reset](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:178), [spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-undo/spec.md:11) e [testes](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskManager.test.ts:1540) | Uma oferta por superfície, em memória, sem expiração temporal; exclusão, edição efetiva e status, inclusive DONE/SKIP/END/reabertura. Criar, check, restauração de lixeira/backup não oferecem undo. Abrir form/lixeira/backup/IA ou iniciar outra ação limpa a oferta; filtros/ordem/expansão e passagem do tempo não a encerram. O código limpa já ao iniciar a ação, inclusive ao abrir confirmação; registrar essa precisão em vez de prometer que abandono preserva a oferta. |
| [Confirmações e foco](C:/QSI/Workspaces/taskflow-extension/src/components/trash/TrashManager.vue:138) e [desfazer/foco](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:490) | Exclusão informa 30 dias; portadora avisa interrupção da série sem nova ocorrência. Definitiva/esvaziamento têm confirmação irreversível e abandono sem escrita. Busy permanece focável; sucesso/erro anunciados; após remoção foco em Restaurar do vizinho/último ou Voltar; undo em Editar ou ação principal. Snapshot externo pode remover o controle durante diálogo: prever destino seguro, IDs históricos escapados/refs e ausência de roubo de foco. |
| [Leitura da store atual](C:/QSI/Workspaces/taskflow-app/src/renderer/src/stores/tasks.ts:144) e [sessões](C:/QSI/Workspaces/taskflow-app/src/main/ipc/document-sessions.ts:73) | Snapshot já transporta lixeira, mas a store adota apenas tasks. Estender projeção do mesmo snapshot, sem uma segunda inscrição/fila ou upsert otimista. Sessão é invalidada em reload/crash/fechamento; reutilizar limpeza para recibos/tokens e revalidar admissão/execução/saída. |
| [Liquidação de vencidos](C:/QSI/Workspaces/taskflow-extension/src/domain/task-reminders.ts:177) e [preservação desktop](C:/QSI/Workspaces/taskflow-app/src/domain/task-reminders.ts:132) | Restore conserva timestamps, mas marca ocorrências efetivas <=now como processadas; revert tem updatedAt novo e mesma liquidação. Conservar processedFor atual de ocorrências inalteradas antes de liquidar. App ainda não tem settleElapsedReminders nem scheduler; propor recorte puro necessário à restauração, preservando bloqueios D8 de status/prazo/geração e deixando agendamento/notificação na TFA-008. |
| [Backup da origem](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-service.ts:216) e [replaceAll desktop](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:192) | Backup substitui somente tarefas e preserva lixeira. ID_EXISTS permanece recusa obrigatória; duplicidade de portadora deve ser recusada sem reparar dados. replaceAll conserva revisões de linhas iguais: só CAS por tarefa não invalida todos os undo após backup. Definir contrato interno de invalidação global de recibos após restauração bem-sucedida, inclusive UNCHANGED; integração funcional é TFA-007. |

**Limites que não devem ser ocultados:** desfazer uma exclusão restaura somente sua tarefa. Itens expurgados/descartados pelo limite de 100 e a versão antiga da lixeira substituída pelo mesmo ID não são recuperados pelo undo. A oferta não expira, mas pode tornar-se inaplicável por retenção/esvaziamento/concorrência. Com relógio recuado e 100 deletedAt futuros, a ordenação/corte da origem pode descartar inclusive a tarefa recém-excluída; refinar esse extremo e os empates no propose, sem alterar a regra silenciosamente. Exclusão definitiva significa remoção lógica do produto, sem prometer eliminação forense de páginas SQLite.

#### Alternativas e recomendação justificada

| Alternativa | Avaliação |
| --- | --- |
| Recibo em memória no main, um por documento, com token opaco e revisões completas | **Recomendada:** impede forjar estado anterior, aproveita sessões/CAS existentes, preserva uma ação temporária e mantém núcleo portável. Exige captura interna pré-escrita, publicação pós-commit e limpeza coordenada. |
| UndoPlan/Task anterior guardados no renderer e enviados pela bridge | Copia assinatura da origem, mas permite forjar campos/planos e base stale; viola fronteira aprovada. Rejeitar. |
| CAS por updatedAt ou editRevision | Timestamp admite mudanças no mesmo instante/ABA; editRevision ignora checks. Rejeitar para undo; usar contentRevision de todos os registros afetados. |
| Pilha persistente de ações, event sourcing ou log no SQLite | Muda retenção, privacidade e UX, exige persistência/migração de histórico; fora desta migração. |
| Nova coluna de geração da entrada de lixeira | Pode facilitar CAS independente, mas exige SQL novo sem necessidade demonstrada. Preferir avaliar tupla ID/contentRevision/deletedAt e tokens internos; provar ABA em todos os caminhos autorizados, sem tratar deletedAt isolado como identidade. |
| Esvaziar tudo que existir no instante do commit | Preserva chamada atual da origem, mas pode apagar item que chegou após a confirmação ser aberta. **Recomendar revisão se a lixeira mudou**; mecanismo e comportamento precisam ser revisados no propose. |

```text
Superficie --> intencao + revisao/token --> main: sessao + schema
                                                |
                            unidade: reler + validar + planejar
                              tarefas + lixeira + revisoes
                                                |
                                         commit unico
                                                |
                         recibo temporario main + ack pequeno
                                                |
                              invalidacao --> snapshot completo

Desfazer: token da propria sessao --> conferir anterior/gerada
                                  --> restaurar/remover juntas
```

**Concorrência recomendada:** capturar a revisão **completa** vista ao abrir a confirmação de exclusão, inclusive checks, e conferir no commit; claim pode ser conservado sem falso conflito. Restore/definitiva e undo de exclusão vinculam-se à entrada observada, não apenas ao ID: impedir que um diálogo/token antigo opere sobre uma segunda exclusão do mesmo ID. Esvaziamento deve conferir a composição/identidades da lixeira observada, não a revisão global que também muda com tarefas independentes. Preferir token de confirmação com base mantida no main; sem enviar 100 tarefas ou callback remoto. Nenhuma mudança de coleção/revisão/evento em recusa; expurgo independente tem seu próprio commit e evidência. Duas janelas disputando restore/delete/undo têm um resultado aplicável, as demais recebem ausência/conflito seguro.

**Recibos e recursos:** reservar/capturar before-image antes de escrever, guardando valores efetivamente relidos (inclusive checks ocorridos após abrir o form). Falha/rollback/no-op não produzem oferta; sucesso só registra recibo após commit e se documento/contexto da ação ainda válidos. No máximo um recibo por sessão autorizada; não impor timeout à oferta nem limite retroativo de payload histórico. Medir bytes e custo de clone; se não for possível reservar memória para uma ação que promete undo, recusar antes do commit com RESOURCE_LIMIT. Outra ação ou clear ordenado invalida a anterior; resposta tardia não pode ressuscitar oferta depois de troca de área/ação. Consumir token uma vez em sucesso/recusa/falha, como a oferta atual; sem redo, replay automático ou recriação de token após ressync.

**IPC candidato para a proposta:** operações finitas para mover, restaurar, excluir definitivamente, esvaziar, preparar entrada/manutenção da lixeira, desfazer e limpar oferta. Nomes/quantidade/versões finais devem ser definidos no design; leitura completa continua pelo snapshot v2. Preparação de confirmação pode retornar token opaco vinculado à base atual. Expurgo de startup é interno, sem predicate/clock/Task/UndoPlan do renderer. Acks pequenos, erros fechados ID_EXISTS/NOT_IN_TRASH/CHANGED/REMOVED/GENERATED_CHANGED/SERIES_CONFLICT e conflitos de confirmação/token, sem títulos/payload/stack/paths. Refinar os budgets atuais (64 KiB/8 KiB, estado/eventos1KiB/página256KiB) e versionamento aditivo versus alteração de resultado; não incrementar schema/codec por conveniência.

#### Ciclo de vida e contratos futuros

| Evento | Comportamento recomendado |
| --- | --- |
| Fechar/reload/crash da janela ou sair do processo | Descartar recibos/tokens da sessão; tarefas/lixeira confirmadas sobrevivem. Unidade ativa conclui/reverte antes de fechar conexão; pedido ainda não iniciado perde autorização. Reabrir não recupera undo. Lifecycle provisório ainda encerra o app; bandeja fica na TFA-008. |
| Minimizar/perder foco/ficar aberto sem agir | Não expirar a oferta; ressincronizar como hoje. Mudança externa não transfere a oferta para outra janela e pode causar recusa na tentativa. Não prometer validade eterna dos dados. |
| Abrir formulário/lixeira ou outra área | Limpar oferta e recibo da sessão, inclusive ao voltar; retorno de foco ao controle de origem. Preservar filtros/ordem da mesma sessão. Limpar também respostas pendentes por geração de contexto, sem implementar navegação/áreas futuras. |
| Restore de lixeira / undo de exclusão | Conferir idade/entrada/ID/portadora, mover atomicamente; preservar id/createdAt/updatedAt/completedAt/campos/regra, novas revisões de storage, liquidar vencidos sem gerar próxima. Restore da área não oferece undo. |
| Restore futuro de backup | Antes de abrir a área, oferta local já é limpa. Após restauração bem-sucedida, invalidar recibos em **todas** as sessões, mesmo se tarefas iguais resultarem em no-op; sem oferta de undo, sem transportar histórico/lixeira no arquivo. Cancelamento/falha confirmada não invalida outras sessões por um restore que não ocorreu; resultado incerto exige ressync. TFA-006 define a porta/contrato; TFA-007 implementa o percurso. |
| Integração futura de lembretes | TFA-006 pode propor somente liquidação pura indispensável ao restore/revert e preservação de claims. TFA-008 agenda/remove/reconcilia após commit; falha externa não reverte tarefa e deve ser comunicada honestamente. Sem scheduler fictício ou mensagens de lembretes agendados antes de existir. |

**Escopo recomendado:** exclusão recuperável na janela principal e área de lixeira, retenção/limite/expurgo explícito, restore/definitiva/esvaziamento, confirmações/foco/erros, undo da última edição/status/exclusão e reversões integrais de série, recibos por sessão, coordenação/CAS/IPC seguro e regressões de duas superfícies no harness. Reutilizar seletivamente regras, CSS/componentes e cenários da origem; adaptar orquestração ao main, sem transportar TaskService/Chrome inteiros. Evoluir explicitamente as proibições atuais de desktop-foundation, desktop-state-ipc, desktop-task-management, persistência e contratos de recorrência, junto das capacidades próprias propostas de lixeira/desfazer.

**Exclusões:** histórico persistente/pilha/redo, undo de criação/check/restauração/expurgo/definitiva, restauração de itens colaterais removidos pelo limite, migração da lixeira/histórico da extensão, backup/importação funcionais, scheduler/notificações/bandeja/login, captura/Quick Add/atalhos, IA, novos calendários, novas janelas de produto, redesign/dashboard, alteração de runtime/dependências, instalação/Setup/distribuição e resolução automática do D10. Duas janelas são prova do harness, não novo produto multiwindow.

**Dúvidas materiais a fechar no propose:** (1) revisão da confirmação de esvaziamento após mudança externa: pergunta opcional apresentada nesta exploração, sem resposta humana registrada; recomendação é recusar e revisar a lista, sem inferir aprovação; (2) CAS completo de exclusão e identidade/ABA de item de lixeira, com tupla existente ou metadado novo somente se necessário; (3) adotar liquidação pura de vencidos neste recorte, mantendo D8 e agendamento na TFA-008; (4) política de empates/relógio recuado e esclarecimento do limite100 na confirmação sem prometer recuperação de descartes; (5) captura/registro/consumo de recibos, contextos tardios, memória e perda de resposta; (6) schemas/versões e contrato de invalidação de backup em todas as sessões. Recomendações continuam sujeitas à revisão dos futuros artefatos; nenhuma escolha técnica/produto está aprovada por silêncio.

**Riscos e mitigação:** snapshot stale virar before-image (captura na unidade); timestamp/edit ignorar check/ABA (contentRevision); token atravessar janela ou sobreviver a reload (DocumentSessions); resposta antiga recriar oferta (contexto/ordem); restauração vencida via undo (checagem em todos os caminhos); confirmação apagar item novo (base da lixeira); restaurar regra duplicada ou reverter meia série (validação do plano final); claim ser apagado (preservar marcadores atuais + liquidar); manutenção oculta numa leitura (unidade explícita); backup igual preservar CAS/undo indevido (invalidação global explícita); clone/varredura bloquear main (medir recursos mantendo D10). Não mitigar ampliando escopo ou descartando dados silenciosamente.

#### Critérios candidatos e testes a refinar no propose

Os casos abaixo são **planejados**, sem implementação TFA-006. Testes da origem foram inspecionados, não executados: domínio task-trash/task-undo, aplicação task-service, componentes TaskManager/TrashManager, stored-trash, repository Chrome e integração trash. Cópia revisada e substituição dos mocks Chrome por banco/IPC desktop só no apply autorizado.

| ID | Resultado observável futuro |
| --- | --- |
| L01 — Retenção/limite | 29 dias, exatamente30, 30dias+1ms/31, deletedAt futuro, relógio recuado, empates e 100→101; mesmo ID substituído. 30×24h independente de DST; descartes e ausência de undo colateral explícitos. |
| L02 — Move/restore fiel | Todos os campos/status/subtarefas/regra/precisão e timestamps íntegros; move+prune+cap e restore no mesmo commit. Restore sem geração; metadados novos impedem ABA. |
| L03 — Recusas de restore | Item ausente/vencido/definitivamente removido, ID_EXISTS após fixture de backup e SERIES_CONFLICT conservam coleções/revisões. Duplicidade histórica não é reparada ou anunciada como lista vazia. |
| L04 — Manutenção explícita | Startup/entrada/exclusão limpam por comando/unidade; get/snapshot não grava. Itens que vencem com a área aberta deixam de ser acionáveis/apresentados; retry, incompatibilidade, falha de purge e cleanup sem falso vazio. |
| L05 — Confirmações/concorrência | Dois documentos: editar/check durante diálogo de exclusão; restore versus restore/delete/empty/purge; mesmo ID restaurado/excluído de novo e relógio igual; composição da lixeira muda no diálogo. Um commit aplicável, recusa sem perda ou escrita parcial; tarefa independente não invalida confirmação sem motivo. |
| L06 — Undo e ciclo de oferta | Edição/status/exclusão oferecem só após commit; create/check/restore/no-op não. Uma oferta própria, sem timer; outra ação inclusive falha, formulário/área, reload/crash/fechamento limpam. Filtro/ordem/expansão/minimizar não expiram. Token alheio/repetido/contexto antigo e resposta tardia recusados. |
| L07 — Reversão simples completa | Restaurar campos/status/completedAt/regra/ordem/done de antes da ação relida, id/createdAt preservados, updatedAt novo/revisões novas. Mudança de qualquer conteúdo, check ou ABA bloqueia; claim sozinho não; outras tarefas não geram falso conflito. |
| L08 — Reversão de série | DONE/SKIP/END, fim natural e edição terminal: anterior+remoção da gerada atômicas, sem lixeira/geração adicional. Gerada editada/marcada/removida/restaurada/avançada ou portadora concorrente bloqueia **tudo**. Foco e filtros após reaparecimento. |
| L09 — Claims/lembretes/backup | Preservar markers de ocorrência inalterada e liquidar <=now sem aviso retroativo; futuro permanece pendente sem agendamento fictício. D8 conservado. Contrato de backup: lixeira intacta, todas as ofertas invalidadas até para UNCHANGED; nenhum histórico no arquivo/SQL/log. |
| L10 — Falhas/atomicidade | Falha entre coleções, retenção/cap/restauração/reversão e COMMIT; kill de processo de teste antes/depois de commit/resposta; reopen antigo/novo inteiro. Falha recuperável não envenena fila; incerto requer ressync sem replay ou token reconstruído. Não chamar kill prova de energia. |
| L11 — UI/IPC/a11y | Header/vazio→Lixeira→Voltar, data local/ordem, confirme/abandone/Escape, busy focável/duplo gesto, anúncio/foco vizinho/último/Voltar e undo em Editar/ação principal; IDs históricos/janela mínima/zoom200. Guards/schemas/bytes/versões/token alheio nas três fases, zero acesso antes de autorizar e nenhuma Task/UndoPlan livre. |
| L12 — Recursos/runtime | Uma inscrição/snapshot de tasks+trash, converge em dois documentos; recibos limitados por sessão com orçamento de memória medido. Gates lint/typecheck/test/build/OpenSpec e produto empacotado fictício com retenção/reopen/crash/duas sessões. 1.000/10.000+100 e payloads grandes para clone/varredura/UI, D10 retido, sem virtualização/truncamento/novo Setup. |

**Verificações executadas nesta exploração:** `npm run validate` usando **Node24.21.0/npm11.21.0** já disponíveis: lint sem warnings, cinco typechecks, **39 arquivos/596 testes aprovados +11 skipped**, build main/preload/renderer. A primeira execução encadeada encontrou npm11.19.0 no PATH e foi recusada por devEngines; PATH foi ajustado só no subprocesso para o wrapper11.21.0 existente, sem instalar ou alterar engines/lockfile/configuração global. `openspec validate --all --strict --no-interactive --json`: **8/8 specs** válidas, INFO de textos longos preexistentes; `--archived`: **5/5 Changes**. Esses gates validam a **base entregue**, não L01–L12 nem lixeira/undo ainda inexistentes. `git diff --check` passou; os **27 links locais** da seção existem e as linhas estão dentro dos arquivos. Diff versionado limitado a docs/roadmap.md; origem/Git preservados e zero Changes ativas. Nenhuma nova medição D10, pacote/smoke ou instalação nesta exploração.

### Prompt consolidado para opsx:propose

**Registro histórico do prompt entregue na exploração**, utilizado no pedido posterior de propose. Naquele momento nenhum artefato da TFA-006 existia e as dúvidas acima aguardavam refinamento. O resultado do propose e o prompt atual de apply estão registrados abaixo; este prompt não autoriza implementação.

```text
$openspec-propose TFA-006 — migrar-lixeira-e-desfazer

Trabalhe somente em C:\QSI\Workspaces\taskflow-app, na branch codex/tfa-006-migrar-lixeira-e-desfazer, base main ab3ed688f025064c16ce155ff5220fe62f9dbc59 (PR #5 integrado). Leia AGENTS.md, docs/roadmap.md (exploração TFA-006, achados/dúvidas/L01–L12), artefatos arquivados da TFA-005 e specs/código pertinentes das TFA-003/004. Preserve trabalho preexistente. Extensão/Git em C:\QSI\Workspaces\taskflow-extension somente leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4; não editar/instalar/testar/buildar/alterar Git ali.

Crie apenas proposal/design/specs/tasks desta Change pela CLI instalada1.14.0/schema spec-driven, sem skip_specs documental. Registre IN_PROGRESS/PROPOSE/data antes e IN_REVIEW/REVIEW depois. Evolua coerentemente as restrições existentes de fundação/IPC/gerenciamento/persistência/recorrência e as capacidades próprias de lixeira/desfazer. Não implemente, instale, execute Setup, inicie apply/archive/commit/push/PR/merge/distribuição ou outra Change. Entregue artefatos para revisão e registre/entregue prompt de apply, sem inferir aprovação.

Preserve Vue/Pinia/Electron/TS estrito e main proprietário. Reutilização seletiva das regras/componentes/CSS/testes, sem TaskService inteiro/Chrome/scheduler fictício. Lixeira:30×24h,100 itens, deletedAt decrescente, exatamente30 dias/futuro mantidos; retenção/limite e move num commit. Restore conserva campos/timestamps, recebe novas revisões e não gera ocorrência; ID_EXISTS/ausência/série conflitante recusam sem perda. Feche lacuna da origem: verificar idade em todo restore/undo, não depender de abrir a área. Expurgo explícito em startup/entrada/exclusão, snapshots puros; apresentação filtra vencidos enquanto aberta sem timer de escrita. Defina empates/relógio recuado e informe limite100/descartes irreversíveis; undo não recupera itens colaterais nem versão da lixeira substituída pelo mesmo ID.

Recomende recibo interno em memória no main, um por sessão/documento, token opaco, sem Task/UndoPlan livre ou histórico persistido. Capture before-image real dentro da unidade e referência/revisão da gerada; reserve recursos antes de gravar, publique oferta somente após commit. Undo de edição/status usa contentRevision completa de anterior/gerada, nunca updatedAt/editRevision; checks/ABA bloqueiam, claim isolado não. Restaure todos os campos com updatedAt/revisões novos e remova gerada diretamente de tasks no mesmo commit, conferindo portadora única em tasks+trash no plano final. Gerada alterada/removida/restaurada/avançada recusa tudo. Mover portadora conserva regra/interrompe novas gerações; restore/undo não cria próxima.

Uma oferta temporária por superfície, sem prazo: só exclusão/edição/status efetivos; criação/check/restauração/no-op/definitiva/expurgo não oferecem. Outra ação inclusive falha/abertura de confirmação, formulário/área, reload/crash/fechamento limpam; filtros/ordem/expansão/minimizar não expiram. Consumo único em sucesso/recusa/falha e contexto ordenado para resposta tardia não recriar oferta. Preserve confirmações, avisos de série, busy focável, anúncio e foco de origem/vizinho/último/Voltar ou Editar/ação principal após undo.

Feche CAS de exclusão com revisão completa vista ao confirmar e identidade de entrada de lixeira contra ABA/restaurar-excluir de novo. Para esvaziamento, recomendação ainda não aprovada: se composição da lixeira mudou enquanto diálogo aguardava, recusar e revisar, sem apagar item novo; tarefa independente não deve invalidar só por globalRevision. Compare tokens/base no main com metadado de geração somente se necessário. Defina wrappers/schemas/versões/budgets e erros finitos, guards em admissão/execução/saída, acks pequenos e snapshot tasks+trash autoritativo; sem segunda inscrição/optimismo/replay. Conserve SQL2/codec4 e budgets existentes salvo necessidade explicitamente proposta.

Delimite reminders: proponha somente liquidação pura <=now exigida pelo restore/revert e preservação de processedFor atual; mantenha D8 de prazo/status/geração. Agendamento/notificação/bandeja seguem TFA-008, sem falso sucesso de alarmes. Backup funcional segue TFA-007: contrato interno invalida recibos de todas as sessões após restore bem-sucedido inclusive UNCHANGED, preservando lixeira/ID_EXISTS/portadora; não exportar histórico/lixeira/credenciais nem implementar importação agora.

Refine L01–L12 em requisitos/cenários/tasks verificáveis: retenção/limite/fidelidade, recusas/confirmações/duas sessões/ABA, ciclo de oferta/contextos, reversões simples/série/claims, backup futuro, falhas/kill/reopen, foco/a11y/IPC e memória/clone/varredura com1.000/10.000+100. Gates existentes e OpenSpec estrito; planeje produto empacotado fictício sem Setup, mantendo D10 herdado/prova humana pendentes e distinguindo baseline de testes futuros. Exclua pilha/redo/histórico persistente, novas janelas/redesign, scheduler/backup/captura/IA/distribuição e dependências novas. Pare após propose para revisão humana.
```

### Proposta entregue para revisão — 2026-10-04

**Autorização e fluxo:** o usuário invocou `$openspec-propose` com o prompt consolidado anexado. Antes da criação, registrado `IN_PROGRESS/PROPOSE`, início **2026-10-04**; após concluir os quatro artefatos transitivamente exigidos, registrado **IN_REVIEW/REVIEW**. Raiz própria confirmada pela CLI **OpenSpec1.14.0**, schema **spec-driven**, sem skip_specs. Branch existente preservada; base **`ab3ed688f025064c16ce155ff5220fe62f9dbc59`**. **Artefatos não aprovados e apply não iniciado naquele momento.** A conclusão da Change continua sem data. A aprovação posterior está registrada abaixo.

**Decisão humana registrada nesta conversa:** à pergunta sobre mudança da lixeira durante a confirmação de Esvaziar, o usuário respondeu **“Recusar a confirmação antiga e pedir revisão da lista (recomendado)”**. Essa escolha está em proposal, D4, deltas e tarefas; não equivale à aprovação dos demais artefatos. Comparar composição/identidades completas capturadas no main; tarefa/claim independente fora da lixeira não invalida por globalRevision.

**Artefatos criados:**

- [Proposal — motivação, escopo, exclusões e impacto](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/proposal.md).
- [Design — decisões D1–D11, alternativas, riscos, compatibilidade e matriz L01–L12](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/design.md).
- [Tasks — 45 tarefas em oito grupos, todas pendentes, cada uma com verificação e documentação/testes no grupo correspondente](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/tasks.md).

| Delta | Conteúdo |
| --- | --- |
| [desktop-task-trash](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/desktop-task-trash/spec.md) | Nova capacidade: retenção/limite, ações condicionais, manutenção e interface |
| [desktop-task-undo](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/desktop-task-undo/spec.md) | Nova capacidade: recibos próprios, reversões, lifecycle e recursos |
| [local-task-persistence](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/local-task-persistence/spec.md) | Cinco requisitos modificados de unidades/revisões/restore/condições/leituras |
| [desktop-state-ipc](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/desktop-state-ipc/spec.md) | Oito requisitos modificados de catálogo/contexto/tokens/budgets/erros/intenções/acks/provas |
| [desktop-foundation](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/desktop-foundation/spec.md) | Dois requisitos modificados de fronteira e encerramento |
| [desktop-task-management](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/desktop-task-management/spec.md) | Três requisitos modificados de foco/controles/evidências |
| [desktop-task-recurrence](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/specs/desktop-task-recurrence/spec.md) | Dois requisitos modificados de portadora e integração delimitada |

Total: **sete deltas, 39 requisitos (19 ADDED/20 MODIFIED), 115 cenários, 0/45 tasks concluídas**. Nomes dos requisitos e cenários anteriores foram conferidos contra as specs consolidadas; cenários anteriores preservados. Nenhuma spec principal foi alterada ou consolidada.

**Escolhas concretas propostas para revisão:**

1. Retenção30×24h e limite100 no move; ordem deletedAt/revisão decrescentes e ID UTF-16 no último empate. Relógio recuado pode descartar a própria exclusão; aviso explícito e retained:false sem Desfazer. Startup/entrada só expurgam por idade, sem cortar coleção histórica>100 por leitura.
2. Move recebe content/edit novas na entrada para impedir ABA com mesmo ID/data/payload, inclusive homônimos tasks/trash. SQL2/codec4/Task/timestamps conservados; restore/undo confere tupla exata e idade em todo caminho, recusa sem expurgo oculto e não gera próxima.
3. Recibo no main capturado na unidade, reservado antes de escrita/publicado depois de commit. Uma oferta por documento, sem timeout/pilha/redo; contentRevision completa de alvo/gerada, claims conservados, portadora verificada no plano final e remoção direta da gerada atômica.
4. Contexto monotônico estabelecido por clear antes da ação, slot único e guardas de ticket/contexto em três fases. Ações/áreas/falhas/no-op/abandonos limpam; filtros/ordem/expansão/minimize não. Fechamento/reload/crash perde oferta, não commit; resposta antiga nunca recria recibo.
5. Catálogo final17: quatro mutações de tarefas v3, estado v2, diagnóstico/origem v1 e oito operações novas v1. Request64KiB/ack8KiB, estado/eventos1KiB/página256KiB; uma projeção tasks+trash, sem segundo subscriber/optimismo/replay ou Task/UndoPlan livre.
6. Reservas lógicas globais64MiB, incluindo candidatos/confirm, com charge documentado e provas de heap/pico/liberação. Falta de reserva recusa antes de efeito sem teto retroativo de codec. Liquidação pura<=now/preservação de processedFor, mantendo D8; porta interna de sucesso de backup APPLIED/UNCHANGED invalida todas as sessões/candidatos. Percurso funcional/propagação visual de backup e scheduler permanecem TFA-007/008.

**Limites e revisão pendente:** essas escolhas técnicas/produto, versões e orçamento de memória aguardam revisão humana do conjunto; nenhum silêncio aprova. Não restaram dúvidas materiais delegadas à descoberta genérica no apply. Mudança observável exige revisão coerente antes de implementar o ponto. Mantidos D10 e prova humana herdados, sem aceitar números700/700/250, truncar/virtualizar/introduzir worker ou implementar dependências futuras. Interface confirma remoção lógica, sem promessa forense. Histórico temporário não é persistido/exportado nem recuperado após saída; backup atual transporta somente tarefas.

**Verificações desta entrega:** `npm run validate` no runtime existente **Node24.21.0/npm11.21.0** passou: lint sem warnings, cinco typechecks, **39 arquivos/596 testes aprovados +11 skipped**, build main/preload/renderer. OpenSpec estrito da Change: **1/1**, sem issues; `--all`: **9/9** (oito specs+Change), apenas INFO preexistentes de textos longos; `--archived`: **5/5**. `git diff --check` passou; **51 referências locais** da seção/artefatos existem e suas linhas indicadas são válidas; dez markdowns sem placeholders/whitespace final. Quatro artefatos DONE na CLI representam planejamento completo, não funcionalidade/aprovação. Gates validam a base atual: **nenhum teste L01–L12 novo executado, medição D10 nova, pacote/smoke/Setup ou instalação nesta etapa**. Escopo de escrita limitado a este roadmap e à Change; origem/Git reconferidos somente leitura, worktree limpo no HEAD **`a763e7a0d646c664ecd4f979528bc2c3589fa8c4`**. Sem alteração de código, dependências, README ou specs principais, commit/push/PR/merge/archive/distribuição.

### Prompt consolidado para opsx:apply

Artefatos aprovados em 2026-10-04 (registro abaixo); prompt preparado para o próximo pedido explícito de apply. A frase de aprovação dentro do bloco é um modelo para esse pedido; sua presença no roadmap não inicia implementação. Não autoriza archive, PR ou publicação por si.

```text
$openspec-apply-change TFA-006 — migrar-lixeira-e-desfazer

Somente após eu aprovar expressamente proposal/design/sete deltas/tasks desta Change e pedir apply. Trabalhe em C:\QSI\Workspaces\taskflow-app, na branch codex/tfa-006-migrar-lixeira-e-desfazer, base ab3ed688f025064c16ce155ff5220fe62f9dbc59 (PR #5). Leia AGENTS.md, docs/roadmap.md, todos os artefatos em openspec/changes/migrar-lixeira-e-desfazer e dependências TFA-003/004/005 arquivadas; preserve trabalho preexistente. Confirme raiz própria/contexto/schema pela CLI instalada. Extensão/Git em C:\QSI\Workspaces\taskflow-extension estritamente somente leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4: não editar, testar, buildar, instalar ou alterar seu Git.

Aplique somente as 45 tasks propostas para lixeira e desfazer. Preserve SQL2/codec4, Vue/Pinia/Electron/TS estrito e main proprietário. Lixeira30×24h/100, exatamente30 dias e futuro conservados, ordem deletedAt/revisão/ID conforme D2. Purge/substituição/cap/move num commit; nova identidade de entrada content/edit=g sem mudar Task/timestamps. Restore/undo confere entrada/idade/ID/portadora final em toda tentativa, conserva timestamps e não gera próxima. Snapshots puros; manutenção explícita startup/entrada/move e filtro temporal só na apresentação. Retained:false/descartes colaterais/relógio recuado exigem aviso honesto e nenhum undo desses descartes.

Preserve escolha humana: composição/identidades da lixeira mudaram durante EMPTY, recusar confirmação antiga e pedir revisão; tarefa/claim independente não invalida por globalRevision. Bases/tokens próprios no main e schemas exatos; confirmação recuperável/irreversível, abandono/Escape/recusas/foco sem efeitos parciais.

Recibos temporários por documento capturados da leitura real na unidade, reserva pré-escrita/publicação pós-commit; antes/gerada por revisão completa, checks/ABA bloqueiam e claims atuais permanecem. Revert restaura integralmente com updatedAt/revisões novas e remove gerada diretamente num commit, valida portadora final por coleção e não cria próxima. Uma oferta sem prazo/pilha/redo; ações/áreas/falha/no-op limpam, apresentação/minimize não. Contexto monotônico/slot único impede execução/resposta tardia e tokens são consumidos uma vez. Fechamento/reload/crash conserva commit e perde histórico temporário.

Implemente catálogo17 de D7: quatro mutações v3, estado v2, diagnóstico/origem v1 e oito wrappers novos v1; guards de admissão/execução/saída, 64KiB/8KiB e demais budgets preservados, acks pequenos e uma projeção inscrita tasks+trash, sem Task/UndoPlan livre, upsert/optimismo/replay. Reservas globais64MiB incluem confirm/candidatos; falta de recurso recusa antes de efeito e não corta conteúdo/codec.

Reminders somente liquidação pura<=now/preservação de markers, mantendo D8 e sem scheduler/notifier. Backup somente porta interna de invalidação global após sucesso APPLIED/UNCHANGED e época dos candidatos; integração de arquivo/UI/propagação visual fica TFA-007. Preserve componentes/CSS/identidade/teclado/busy/anúncios/foco. Exclua histórico persistente, undo de criação/check/restore/definitiva/empty/purge, backup funcional, bandeja/captura/IA/redesign/novas janelas de produto e outras Changes.

Verifique L01–L12 nas tasks e registre evidências de unidades/IPC/componentes/duas superfícies/crash/reopen/recursos; 1.000/10.000+100,≥20MiB no runtime empacotado, sem dados reais. Rode gates existentes e OpenSpec estrito; package:win --publish never, verify:package e smoke:packaged sem executar Setup. Preserve D10 atual e registre separadamente pendência herdada/regressão nova/prova humana; números700/700/250 não aprovados, sem truncamento/virtualização/worker. Não instale dependências nem altere runtime/lockfile por conveniência. Mudança material exige revisão da proposta antes de implementar o ponto; continue trabalhos independentes autorizados.

Marque tasks só com evidência. Ao concluir apply, execute openspec-verify-change e gere verification.md dentro da própria Change conforme AGENTS.md42, com aderência/gates/L01–L12 e pendências. Atualize roadmap e entregue relatório para aprovação explícita; pare antes de archive/consolidação/README pós-archive/commit/push/PR/merge/Setup/distribuição ou próxima Change sem autorização correspondente.
```

### Aprovação dos artefatos — 2026-10-04

**Evidência humana nesta conversa:** após receber os artefatos para revisão, o usuário declarou: **“Aprovo os artefatos. COmmit e faça o push dos mesmos”**. A aprovação abrange a versão entregue de proposal, design, os sete deltas (desktop-task-trash, desktop-task-undo, local-task-persistence, desktop-state-ipc, desktop-foundation, desktop-task-management e desktop-task-recurrence) e tasks da TFA-006, incluindo as seis escolhas concretas propostas, os orçamentos de recursos e a escolha humana de recusar a confirmação antiga de esvaziamento. Estado atualizado para **APPROVED/READY_FOR_APPLY**. As 45 tasks continuam pendentes; apply não iniciado.

Este pedido aprova os artefatos, seu registro no roadmap, o commit e o push dos mesmos; não solicita iniciar apply, implementar, arquivar, abrir PR ou avançar a outra Change. As observações de aprovação pendente feitas durante a elaboração descrevem aquele momento; este registro estabelece a aprovação posterior sem alterar o conteúdo técnico. Próxima ação: usar o prompt acima mediante pedido explícito de apply.

### Apply executado e verificação entregue — 2026-10-04

**Autorização e limites:** novo pedido explícito de apply com o prompt consolidado acima, na branch
`codex/tfa-006-migrar-lixeira-e-desfazer` (base `ab3ed68`). Executadas somente as **45 tasks**
aprovadas. Sem archive, consolidação de specs, README pós-archive, commit/push/PR/merge,
instalação/Setup, distribuição ou próxima Change. A extensão e seu Git permaneceram somente leitura
no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4` (worktree limpo); nenhuma dependência, runtime
ou lockfile foi alterado.

**O que foi entregue (64 arquivos modificados/novos):** política portável de retenção/limite/ordem
e liquidação pura no domínio; move/restore/definitiva/EMPTY/manutenção condicionados com identidade
`content=edit=g` sem SQL novo; `UndoRegistry` com contexto monotônico, tokens de uso único e
orçamento global de 64 MiB; fatos internos de undo em edição/status/fechamento/move; catálogo **17**
(estado v2, quatro mutações **v3**, diagnóstico/origem v1 e oito wrappers v1); IPC com guards de
admissão/execução/saída e consumos únicos; store com projeção tasks+trash e oferta; área da lixeira
com confirmações/foco; harness `trash` (30 verificações), kills `move`/`restore`/`revert` e seção
`receipts` no bench.

**Evidências reais:** `npm run validate` — lint sem warnings, cinco typechecks, **46 arquivos / 664
testes + 11 skipped**, build ok; OpenSpec estrito **9/9** em `--all` e **5/5** em `--archived`;
`package:win --publish never` e `verify:package` OK; `smoke:packaged` com **todos os cenários de
produto PASS** (bridge 27/27 com catálogo 17, `trash` 30/30, `recurrence` 21/21, `a11y` 12/12,
crash 8 barreiras e bench de limites com 23,9 MiB e mutação p95 4,8–16,3 ms). O smoke termina com
código 1 **somente** pelo gate D10 herdado de UI em 10.000 tarefas (rodada limpa: p95 688,3 ms,
heartbeat 760,5 ms, montagem 3,0 s, 10.000 cartões completos), mantido sem truncamento,
virtualização ou worker; números 700/700/250 não aprovados.

**Relatório:** [verification.md](../openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/verification.md) com
aderência aos sete deltas (39 requisitos/115 cenários), rastreabilidade L01–L12, gates, scorecard
formal e pendências (D10 herdado, prova humana de a11y com roteiro em
[a11y-manual-checklist-tfa006.md](a11y-manual-checklist-tfa006.md), campanha isolada de
before-images extremas e primeira execução do smoke ampliado na CI). Evidência do pacote em
[packaged-evidence-tfa006.md](packaged-evidence-tfa006.md). **Nenhum problema crítico; 2 warnings e
1 sugestão.**

**Estado: IN_REVIEW/REVIEW.** Próxima ação: aprovação explícita do relatório; archive,
consolidação, README pós-archive, commit/push/PR/merge e a TFA-007 dependem de autorização
correspondente.

### Verificação aprovada, archive e conclusão — 2026-10-05

**Evidência humana nesta conversa:** o usuário determinou textualmente: **“Rode o opsx-verify, não
tendo nenhum critico ou warning bloqueante, rode o archive. Finalizando ajuste o roadmap para
finalizar o TFA-006 (DONE) e commit, faça o push e abra o PR”**. O relatório
[verification.md](../openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer/verification.md)
foi reexecutado e revisado: **nenhum CRITICAL**; os 2 warnings (D10 herdado com gate retido e prova
humana de acessibilidade pendente com roteiro entregue) e a sugestão foram tratados como **não
bloqueantes** para o archive, permanecendo como pendências pós-archive documentadas. Gates finais
reexecutados antes do archive: `npm run validate` (lint, cinco typechecks, **46 arquivos / 664
testes + 11 skipped**, build) e OpenSpec estrito (Change 1/1; `--all` 9/9; `--archived` 5/5).

**Archive:** `openspec archive migrar-lixeira-e-desfazer --yes --json` moveu a Change para
`openspec/changes/archive/2026-10-05-migrar-lixeira-e-desfazer` e consolidou as specs: **19
requisitos adicionados** e **20 modificados** em `desktop-task-trash` (nova), `desktop-task-undo`
(nova), `local-task-persistence`, `desktop-state-ipc`, `desktop-foundation`,
`desktop-task-management` e `desktop-task-recurrence`. `openspec validate --all --strict`: **10/10**;
`--archived --strict`: **6/6**. README factual atualizado conforme o item 38. Estado **DONE** em
**2026-10-05**, registrado antes do merge por decisão explícita do usuário (revisar se o PR for
recusado).

**Commit, push e PR:** commit **`bed816c`** (`feat: lixeira e desfazer (TFA-006)`) na branch
`codex/tfa-006-migrar-lixeira-e-desfazer`, push para a referência remota de mesmo nome e
**[PR #6](https://github.com/Cadlira/taskflow-app/pull/6)** aberto para a `main` com o resumo de
escopo, gates, evidências e pendências. O merge é ação do usuário.

**CI — 2026-10-05:** o primeiro run do PR (commit `bed816c`) falhou nos gates por timeout de 5 s no
teste `fila limitada a 64 entradas` (64 commits reais; o runner é mais lento que a máquina local),
sem relação com a lógica da Change. Correção mínima no commit **`a5d37af`** (`ci: timeout explícito
para testes de I/O intenso no runner`), com timeout de 30 s nos testes de I/O intenso (fila de 64
entradas e os dois cenários de 100 entradas da lixeira). O run seguinte,
**[37284379612](https://github.com/Cadlira/taskflow-app/actions/runs/37284379612)**, passou em
**todos os passos** — `validate`, `package:win`, `verify:package`, `smoke:packaged --ci-runner`
(primeira execução do smoke ampliado com bridge catálogo 17, `trash` e bench na CI) — e gerou os
artefatos de revisão com retenção de 14 dias. Anotação do runner: aviso de depreciação do Node 20
nas actions fixadas, sem efeito nos gates.

**Pendências pós-archive:** D10 de UI em 10.000 tarefas (gate retido; p95 688,3 ms / heartbeat
760,5 ms na rodada limpa local; números 700/700/250 não aprovados; na CI o gate é reportado como
pendente e não bloqueia o runner), prova humana de acessibilidade (roteiro em
[a11y-manual-checklist-tfa006.md](a11y-manual-checklist-tfa006.md)) e campanha isolada de
before-images extremas. A TFA-007 permanece **PLANNED** com o prompt de explore próprio, sem início
por inferência.

**Integração conferida na exploração da TFA-007 — 2026-10-05:** o GitHub informa o PR #6 como
fechado e integrado em **2026-10-05T08:41:07Z** (05:41:07, America/Sao_Paulo), merge
**`9e8a05a2d84874f25d9f429ecc120e81c7ec0acc`**, head `af6a1650393f2ae5393d65e9e8081d9f9ac212d2`.
`git fetch origin main` confirmou essa integração em `origin/main`; a branch da TFA-007 foi criada
dessa base. Não houve merge realizado pelo agente nem atualização da branch local `main`, que
continuava em `ab3ed68`. A dependência da TFA-007 está satisfeita; os registros anteriores de PR
aberto e TFA-007 PLANNED são históricos. As pendências pós-archive acima permanecem.

## TFA-007 — Backups e migração das atividades

**Slug:** `migrar-backups-e-importar-dados-da-extensao`. **Dependências:** TFA-006 integrada pelo PR #6. **Estado: DONE**; início **2026-10-05**, conclusão **2026-10-05**. Propose solicitado explicitamente nesta data e entregue com proposal/design/sete deltas/0 de 45 tasks; artefatos aprovados pelo usuário em **2026-10-05**, com commit e push autorizados na mesma mensagem (registro abaixo). **Apply concluído em 2026-10-05 com 45/45 tasks**, gates npm/OpenSpec/pacote/smoke aprovados, `verification.md` sem críticos e **aprovado pelo pedido explícito de archive**, archive `2026-10-05-migrar-backups-e-importar-dados-da-extensao` (19 requisitos ADDED/26 MODIFIED), README factual atualizado e PR aberto para a main na sequência. O DONE foi registrado antes do merge por decisão explícita do usuário (precedente da TFA-003); a integração será conferida no merge. Branch `codex/tfa-007-migrar-backups-e-importar-dados-da-extensao`, base `9e8a05a2d84874f25d9f429ecc120e81c7ec0acc`.

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

### Exploração concluída — 2026-10-05

**Autorização e entrega:** o usuário pediu explorar a TFA-007, criar sua branch e ajustar o roadmap.
Branch **`codex/tfa-007-migrar-backups-e-importar-dados-da-extensao`** criada de `origin/main`
**`9e8a05a2d84874f25d9f429ecc120e81c7ec0acc`**, integração do PR #6, sem upstream para a `main`.
Estado **READY_FOR_PROPOSE/EXPLORE**; início/conclusão da Change permanecem sem data. Somente
este roadmap foi editado. Nenhum diretório, proposal, design, spec, task, código ou teste da
TFA-007 foi criado. Sem propose/apply, instalação, novo pacote/Setup, commit, push, PR, merge ou
distribuição. Os gates existentes foram executados no app, com runtime já instalado.

**Base consultada:** AGENTS.md e roadmap integralmente; proposal/design/tasks/verification
arquivados da TFA-006; specs consolidadas de persistência, IPC, fundação, gerenciamento,
recorrências, subtarefas e undo; codecs, unidade de substituição, coordenador, sessões e registro
de undo do app. OpenSpec **1.14.0**, raiz local, schema **spec-driven**, dez specs e zero Changes
ativas. A extensão foi consultada somente em leitura no HEAD reconferido
**`a763e7a0d646c664ecd4f979528bc2c3589fa8c4`**, worktree limpo: backup-file/service, componentes,
labels/download/composição Chrome, task-integrity, fixtures v1–v4 e testes pertinentes. Não
executar testes/builds/instalações nem alterar arquivos/Git da origem.

#### Formatos e compatibilidade observada

O envelope usa `format: "taskflow-backup"`, `formatVersion`, `exportedAt` UTC canônico,
`app.version` informativa e `tasks`. Não usar a versão do app para decidir migração. Versão
futura é recusada; JSON, estrutura, tarefas inválidas e IDs de tarefa repetidos rejeitam o arquivo
inteiro. Formato de backup **4**, codec de payload **4** e schema SQL **2** são contratos distintos.

| Arquivo original | Conversão observada | Preservação / teste necessário |
| --- | --- | --- |
| v1 | Lembretes legados passam a `OFFSET`; `processedFor = lastTriggeredFor - offsetMinutes` quando válido; depois v2→v3→v4 | Não copiar `lastTriggeredFor` como se já fosse o instante do gatilho. Valores inválidos não são descartados para aceitar o arquivo. Fixture: 4 tarefas, subtarefas vazias. |
| v2 | v2→v3 muda a versão; v3→v4 acrescenta `subtasks: []` | Preservar OFFSET/AT e marcadores, sem inventar séries/recorrência. Fixture: 3 tarefas. |
| v3 | v3→v4 acrescenta `subtasks: []` a cada tarefa | Preservar histórico com seriesId, portadora, frequência/parâmetros, anchorAt/until e lembretes; subtarefas desconhecidas de arquivos antigos não são transportadas. Fixture: 3 tarefas. |
| v4 | Validação sem migração de formato | `subtasks` é obrigatório; preservar IDs, títulos, done e ordem. Fixture: 4 tarefas / 7 subtarefas, com casos vazios, mistos e série. |

Referências: [migrações e envelope](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-file.ts:28),
[leitura integral](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-file.ts:193),
[validação](C:/QSI/Workspaces/taskflow-extension/src/domain/task-integrity.ts:84) e
[fixtures](C:/QSI/Workspaces/taskflow-extension/tests/fixtures/backups/taskflow-backup-v4.json).
O leitor retorna sempre versão normalizada **4**; a UI da origem apresenta esse valor mesmo para
v1–v3. Recomendar prévia que diferencie **versão original** e conversão para v4, sem alterar o
envelope exportado nem confundir migração de arquivo com migração SQL.

O validador é estrito para textos/limites, status/prioridade, timestamps UTC, relação DONE/completedAt,
tags, URL HTTP(S), até dez lembretes com IDs/instantes distintos e até vinte subtarefas. Recorrência
exige prazo e seriesId, parâmetros válidos e somente OFFSET; IDs de subtarefa são únicos dentro
da tarefa, podendo repetir entre tarefas. Esse contrato não deve substituir o codec persistido,
que aceita dados históricos mais amplos. Propor validação do arquivo exportado pelo próprio
leitor, sem corrigir, truncar ou omitir silenciosamente dados locais que não satisfaçam o formato.

#### Lacunas confirmadas e adaptação ao app

| Referência verificada | Achado e consequência |
| --- | --- |
| [Comparação pós-gravação](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-service.ts:102) | `sameTask` omite **seriesId, recurrence e subtasks**. Sondagens com repository sintético que remove cada campo deram `verified: true` nos três casos. Não reutilizar esse comparador. Comparar todos os campos conhecidos, presença/ausência dos opcionais e listas aninhadas completas. |
| [Validação da coleção](C:/QSI/Workspaces/taskflow-extension/src/domain/task-integrity.ts:500) e [proteção de portadora](C:/QSI/Workspaces/taskflow-app/openspec/specs/desktop-task-recurrence/spec.md:116) | A origem aceita duas tarefas distintas com mesma seriesId e regra ativa; a sonda confirmou. No app, validar unicidade de portadora no estado final **tarefas importadas + lixeira preservada**, dentro da unidade. Conflito rejeita tudo, sem apagar lixeira ou retirar regra para ajustar o arquivo. |
| [Recorrência validada](C:/QSI/Workspaces/taskflow-extension/src/domain/task-integrity.ts:384) | O validador conserva propriedades desconhecidas do objeto recurrence; sonda confirmou. Exportação deve projetar explicitamente todos os campos conhecidos, inclusive objetos aninhados. Importação não deve persistir extras nem usá-los como configuração. Os testes de credenciais atuais cobrem configurações fora de tasks, sem cobrir esse aninhamento. |
| [Tamanho e preparação](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-service.ts:14) | Importação aceita até **20 MiB**, inclusive o limite; verifica `file.size` antes da leitura. Exportação não limita bytes. No desktop, conferir bytes UTF-8 reais com leitura limitada, inclusive crescimento após stat; não usar comprimento de string nem confiar em tamanho declarado. |
| [Prévia e confirmação](C:/QSI/Workspaces/taskflow-extension/src/components/backup/BackupManager.vue:117) | Há contagens local/arquivo, data, versão, aviso para arquivo vazio, exportação preventiva e confirmação irreversível. A preparação atual não contém estado-base. [Arquitetura aprovada](C:/QSI/Workspaces/taskflow-app/docs/architecture.md:104) já exige nova prévia se o estado mudar; aplicar revisão global/CAS e token por documento no main. |
| [Substituição existente](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:235) | `replaceAllTasks` verifica revisão global, compara conteúdo completo, preserva trash e retorna UNCHANGED sem incrementar revisão. Reutilizar a unidade coordenada, acrescentando as verificações de domínio e de backup; não trocar o arquivo SQLite nem criar repository/fila por janela. |
| [Igualdade estrutural](C:/QSI/Workspaces/taskflow-app/src/application/storage/stored-task-codec.ts:349) | Há comparador completo de JSON, mas é necessário projetar o modelo permitido e comparar a coleção por ID: a ordem da lista SQL pode diferir da ordem do arquivo. Ordem de tags, reminders, weekdays e subtasks continua preservada; revisões SQL não pertencem ao backup. |
| [Invalidação de undo](C:/QSI/Workspaces/taskflow-app/src/application/undo/undo-registry.ts:254) | `invalidateAll()` já invalida por época recibos/confirmações/publicações de todas as sessões. Falta integrar o backup e a remoção visual das ofertas. **UNCHANGED também invalida**, mesmo sem evento de alteração/revisão SQL. Definir notificação limitada própria, sem simular mutação para emitir stateChanged. |
| [Restauração e lembretes](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-service.ts:211) | Origem liquida lembretes vencidos, grava, relê e reconcilia scheduler Chrome. No app, reaproveitar somente a liquidação pura `<= now` no momento da confirmação. Scheduler/notificações/bandeja são TFA-008; não anunciar alarmes funcionando nesta Change. |

**Verificação completa proposta:** id, title, description, requester, assignee, status, priority,
tags/ordem, dueAt, sourceUrl, createdAt, updatedAt, completedAt, seriesId; todos os tipos e campos
da recurrence (incluindo intervalos, weekdays/dayOfMonth quando pertinentes, anchorAt/until);
cada reminder (id/type/offsetMinutes ou at/processedFor e ordem); cada subtask (id/title/done e
ordem). Não recriar IDs, gerar ocorrências, recalcular âncoras nem resetar subtarefas ao importar.
Somente `processedFor` de gatilhos vencidos pode mudar pela liquidação explicitamente prevista,
sem modificar timestamps da tarefa ou produzir notificação retroativa.

#### Alternativas e recomendação

| Decisão | Alternativas | Recomendação e motivo |
| --- | --- | --- |
| Arquivos | Input/Blob/download no renderer; diálogos nativos e filesystem no main | **Diálogos nativos no main**, associados à janela e validados por sessão. O save dialog escolhe um caminho, não grava o JSON. Isolamento existente permanece; renderer recebe resumo/token/resultado, sem paths ou arquivo inteiro via IPC. |
| Substituição | Gravações por tarefa; trocar banco; única unidade sobre tasks | **Uma unidade coordenada sobre tasks**, com CAS e validação do estado final. Evita coleção parcial e preserva lixeira, schema e metadata locais. Mesclagem e extração do Chrome estão excluídas por instrução humana. |
| Prévia concorrente | Confirmar sobre dados que mudaram; recusar e renovar prévia | **Recusar base antiga e exigir nova prévia/confirmação**, coerente com a arquitetura aprovada; qualquer alteração da revisão global, inclusive lixeira, invalida a base. A consulta opcional desta sessão não teve nova resposta humana; não registrar recomendação como aprovação. |
| Limite de arquivo | 20 MiB simétricos; exportar maior que se consegue importar; ampliar limite desktop com orçamento demonstrado | **Propor inicialmente 20 MiB para ambos**, com erro anterior à gravação, sem corte de tarefas; submeter o impacto à revisão. A base já testou 23,9 MiB de payload persistido (não equivale a tamanho de backup); coleções legítimas podem exceder 20 MiB ao exportar. Ampliação requer número e evidência de memória/bloqueio, ainda não aprovados. Não recomendar gerar silenciosamente um backup que o app não restaura. |
| Recuperação | Rollback/reopen conforme fase; restaurar automaticamente dados anteriores; substituir SQLite corrupto | **Rollback confirmado antes de commit, ressincronização/reopen após commit ou resultado incerto**. Não repetir importação nem reverter automaticamente após mudanças posteriores. Recuperar banco inacessível por outro percurso exige escopo e proteção explícitos; não resetar SQLite para contornar o preflight. |

APIs verificadas nas declarações do Electron **44.5.1** já instalado e na documentação primária:
[Electron dialog](https://www.electronjs.org/docs/latest/api/dialog) e
[Node 24 filesystem](https://nodejs.org/docs/latest-v24.x/api/fs.html). Propor exportação de snapshot
consistente coordenado, de todas as tarefas independentemente de filtros, seguida de gravação
em arquivo temporário exclusivo no diretório escolhido, flush/close e substituição controlada.
Não abrir o destino com truncamento antes de ter o arquivo completo. Cancelamento é resultado
neutro; erro deve preservar destino anterior e tarefas, sem sucesso antes da confirmação de I/O.
Testar substituição no Windows; rename/kill de processo não são prova de durabilidade sob falta
de energia. Dialog/read/write ficam fora da transação SQL e exigem revalidação da sessão nas
fronteiras assíncronas. Evitar exportação sobre arquivos internos do perfil/banco do app.

Preparação mantém uma cópia validada no main, vinculada ao documento, à revisão global e a um
token opaco consumível uma vez. Definir expiração, uma preparação por sessão e orçamento global
de bytes/heap, liberando em cancelamento, troca, navegação e encerramento. Confirmação usa essa
cópia; não reler arquivo que pode ter sido modificado após a prévia. Propor comandos IPC finitos
de exportar/preparar/confirmar/cancelar e resumo limitado (versões/data/app/contagens/avisos,
primeiros cinco erros e contagem restante), sem transportar tasks/paths/callbacks livres.
Nomes, versões, token/acks e notificação de invalidação devem ser fechados no design; atualizar
coerentemente specs que hoje limitam o catálogo a 17 wrappers e excluem backup funcional.

**Falhas por fase:** seleção/leitura/validação/conflito/cancelamento não alteram tarefas, lixeira
ou ofertas de outras sessões. Na unidade, validar/serializar/verificar a projeção gravada antes
do COMMIT permite rollback de divergência. Após commit confirmado, invalidar undo globalmente
na mesma sequência coordenada, antes que ações seguintes/publicações antigas recuperem oferta;
UNCHANGED tem o mesmo efeito transitório. A confirmação de leitura após commit deve distinguir
gravação confirmada porém não verificada de falha com rollback; não anunciar que nada mudou se
o commit ocorreu. Resposta perdida pede ressync, sem replay. Commit incerto segue o bloqueio e
reopen do coordenador existente. Testar reler/reabrir coleção completa com todos os campos e
revisões novas coerentes, preservando timestamps históricos do arquivo.

#### Percurso de migração, escopo e exclusões

1. Na extensão inalterada, abrir seu recurso existente de backup e exportar o JSON. Conservar o
   arquivo e os dados da extensão até conferir a migração; exportação não move nem exclui tarefas.
2. No app, oferecer **Exportar tarefas atuais** antes de substituir; a ação é opcional e não
   confirma importação. Escolher o JSON, validar integralmente e exibir a prévia das contagens,
   data e versão original/conversão. Arquivo vazio avisa que removerá todas as tarefas ativas.
3. Confirmar explicitamente a substituição total, verificando novamente a base. Tarefas do app
   ausentes no arquivo serão removidas, sem enviá-las para a lixeira nem criar undo de importação.
4. Mostrar resultado confirmado e conferência; erros/avisos indicam a fase correta. Conferir
   campos, recorrências, subtarefas e marcadores no app e em exportação/reimportação de revisão.
   Manter cópia dos arquivos originais para recuperação manual consentida.

**Incluído para propor:** leitura v1–v4, exportação v4, adapters nativos, limite real de bytes,
prévia e confirmação total, CAS, validação integral/portadora, preservação e verificação completa,
tratamento de falhas por fase, invalidação interna/visual de undo, UI de backup com identidade,
teclado/foco/busy acessível e documentação operacional da migração quando implementada.

**Excluído:** mesclagem, extração do perfil/storage do Chrome, alteração da extensão, importação
de SQLite, lixeira no arquivo, credenciais/configuração de IA, desfazer temporário ou histórico
persistente, undo da importação, sincronização/nuvem, criptografia nova de backup, scheduler,
notificações/bandeja, captura/atalhos/IA, redesign, workers sem decisão aprovada, instalação
corporativa, release/publicação e outras Changes. A lixeira **já existente no app é preservada**;
coexistência de ID com tarefa importada permanece válida, e seu restore posterior pode recusar
ID_EXISTS. Uma portadora conflitante é recusada antes da importação. Nenhum segredo/configuração
é lido para formar backup; JSON continua sem criptografia e pode conter dados pessoais nas
próprias tarefas. Erros/logs não devem reproduzir conteúdo, títulos, paths ou credenciais.

#### Dúvidas materiais e riscos a fechar no propose

- **Limite:** confirmar 20 MiB simétricos ou justificar novo teto medido. Definir UTF-8/BOM,
  arquivo regular, leitura limitada durante crescimento, memória de parse/projeção/preparações,
  orçamento e descarte. O limite do arquivo não é teto retroativo do banco/codec.
- **Dados históricos:** exportação estrita pode recusar conteúdo que o codec conserva, mas o
  backup não aceita. Recomendar erro integral com campo/código seguro e preservação dos dados;
  uma conversão que altere texto/limites exige decisão explícita, sem correção silenciosa.
- **Banco inacessível:** fluxo normal respeita preflight de schema futuro/corrupção; importar
  backup com o banco já bloqueado exige projeto próprio de recuperação. Não prometer reparar
  um banco que não abre nem substituir o arquivo do perfil nesta Change.
- **Verificação e invalidação:** fechar posição da releitura em relação a COMMIT/publicação,
  resultado pós-commit não verificado, perda de resposta e evento de invalidação em UNCHANGED.
  Sem isso, pode haver falso sucesso, falso rollback ou oferta antiga visível em outra sessão.
- **Windows e recursos:** diálogos cancelados, permissão/disco cheio/arquivo ocupado e rename
  exigem testes reais no pacote; consumo de até oito preparações não pode ser ilimitado. D10,
  acessibilidade humana e before-images extremas herdadas continuam pendentes; não alterar
  seus budgets ou afirmar paridade instalada por build/smoke de renderer.

#### Critérios de aceitação/testes candidatos B01–B14

| ID | Critério observável a refinar nos artefatos |
| --- | --- |
| B01 | Fixtures v1–v4 aceitas e comparadas com resultado canônico esperado; migração de lastTriggeredFor, ausência de subtarefas legadas e versão original da prévia corretas. JSON/futuro/estrutura/inválido/IDs duplicados falham integralmente. |
| B02 | Round-trip de todos os campos listados; testes negativos alteram/removem cada campo, parâmetros de recurrence, ids/títulos/done/ordem de subtasks e markers e exigem divergência detectada. Reordenar só a coleção de tarefas não gera falso erro. |
| B03 | UTF-8 no limite e limite+1, multibyte, tamanho declarado inexato/crescimento, leitura truncada/erro/encoding inválido, arquivo vazio válido vs JSON vazio, sem leitura/mutação indevida. Exportação grande não trunca nem gera sucesso incompatível com seu limite. |
| B04 | Exportação v4 de todas as tarefas, independente de filtros, validada pelo leitor; apenas envelope/campos permitidos, sem trash/metadata/undo/configuração/credenciais nem extras aninhados. Fixtures sintéticas com sentinelas de segredo/configuração. |
| B05 | Prévia e confirmação irreversível com contagens/data/versões, aviso de zero tarefas, exportação preventiva e cancelamento; escolher novamente o mesmo arquivo funciona. Cancelar seleção/save/preview/confirm não grava nem invalida outras sessões. |
| B06 | Alteração de tasks ou trash entre prévia e confirmação produz conflito e exige nova prévia; duas sessões, token alheio/expirado/reutilizado, navegação/encerramento e mudança do arquivo após prévia não substituem estado sem consentimento válido. |
| B07 | Substituição total em uma unidade: lista nova completa ou anterior completa, inclusive arquivo vazio; remoção não vai à lixeira. IDs/timestamps/ordens preservados, revisões geradas localmente e rollback/fault injection sem coleção parcial. |
| B08 | Lixeira permanece integral; IDs entre tasks/trash podem coexistir e restore mantém ID_EXISTS. Duas portadoras importadas ou colisão com portadora na lixeira rejeitam antes do efeito, sem expurgo nem alteração de regras. |
| B09 | Commit confirmado APPLIED e UNCHANGED invalidam recibos/confirmações/candidatos e ofertas visuais de todas as sessões, sem inventar revisão SQL em no-op. Falha/rollback/cancelamento preservam as demais ofertas; publicação tardia não as recria. |
| B10 | Liquidação de OFFSET/AT vencido `<= now`, com relógio sintético; marcas futuras e timestamps da tarefa preservados. Sem ocorrência/subtarefa regenerada, notificação retroativa ou alegação de scheduler instalado. |
| B11 | Falha antes/depois de COMMIT, verificação divergente, resposta perdida, commit incerto e reopen: resultado informa fase verdadeira; ressync sem replay/rollback automático sobre alterações posteriores. Reabertura encontra coleção completa e verificável. |
| B12 | Save dialog e I/O reais Windows: destino novo/existente, cancelamento, Unicode, permissão/disco cheio/arquivo ocupado, falhas write/flush/rename e interrupção em barreiras. Destino anterior preservado antes da substituição, cleanup limitado aos temporários próprios e sucesso após gravação confirmada. |
| B13 | Bridge real do pacote com catálogo/versionamento/bytes/erros fechados e isolamento; renderer não recebe filesystem/path/JSON completo. Recursos liberados em oito sessões e parse/validação/gravação medidos no teto, sem relaxar gates herdados ou truncar dados. |
| B14 | UI por teclado/foco/anúncios/busy e migração manual com dados fictícios; lint/cinco typechecks/testes/build, OpenSpec estrito e provas adequadas no Electron empacotado. Documentação/README/matriz factual somente após implementação/etapa correspondente; roteiro humano pendente não é execução aprovada. |

**Evidências da exploração:** sondagens em memória a partir de leitura dos módulos/fixtures da
origem, executadas no diretório do app sem criar scripts ou rodar a suíte da extensão: v1/v2/v3/v4
aceitos (4/3/3/4 tarefas, sete subtarefas no v4), três falsos `verified: true`, portadora duplicada
aceita e propriedade desconhecida de recurrence conservada. Não são testes da futura TFA-007.
`npm run validate` no app, Node **24.21.0**/npm **11.21.0** já instalados: lint, cinco typechecks,
**46 arquivos / 664 testes + 11 skipped**, build aprovados. OpenSpec estrito `--all`: **10/10**;
`--archived`: **6/6**, apenas observações INFO sobre requisitos extensos. Nenhuma prova nova de
diálogos, I/O de backup, instalador ou aplicativo instalado foi executada.

### Prompt consolidado para opsx:propose

Este prompt registra a passagem para proposta; não inicia propose/apply nem aprova as recomendações.

```text
$openspec-propose TFA-007 — migrar-backups-e-importar-dados-da-extensao

Trabalhe somente em C:\QSI\Workspaces\taskflow-app, na branch codex/tfa-007-migrar-backups-e-importar-dados-da-extensao, base origin/main 9e8a05a2d84874f25d9f429ecc120e81c7ec0acc (PR #6 integrado). Leia AGENTS.md, docs/roadmap.md (exploração TFA-007, achados/dúvidas/B01–B14), artefatos arquivados da TFA-006 e specs/código pertinentes das TFA-003/004/005. Preserve trabalho preexistente. Extensão/Git C:\QSI\Workspaces\taskflow-extension somente leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4; não editar/instalar/testar/buildar/alterar Git ali.

Criar apenas proposal/design/deltas/tasks da TFA-007 no schema spec-driven/OpenSpec 1.14.0. Registrar IN_PROGRESS/PROPOSE e data de início antes, IN_REVIEW/REVIEW depois; não implementar nem aprovar automaticamente. Propor migração manual exportar na extensão inalterada → escolher JSON → validar/prévia → confirmar substituição total no app → conferir, com exportação preventiva opcional das tarefas atuais.

Preservar envelope taskflow-backup v4 e leitura v1–v4: v1 converte lastTriggeredFor para processedFor subtraindo OFFSET; v2→v3 sem inventar séries; v3→v4 acrescenta subtasks vazias. Diferenciar versão original e normalizada na prévia. Validar arquivo integralmente com os contratos estritos do backup, sem trocar o codec histórico, renumerar IDs, normalizar/truncar dados ou gerar ocorrências. Fechar tratamento seguro de dados locais exportáveis pelo codec mas recusados pelo backup. Projetar campos permitidos em todos os níveis, removendo extras inclusive em recurrence.

Propor diálogos nativos associados à janela e I/O no main; renderer sem paths/JSON completo/Node. Exportar snapshot consistente de todas as tarefas, sem filtros; salvar em temporário exclusivo, flush/close/substituição controlada, preservando destino anterior em falha e confirmando sucesso após I/O. Leitura limitada por bytes UTF-8 reais, sem confiar em stat/tamanho declarado durante crescimento. Proposta inicial: limite simétrico de 20 MiB, sem teto retroativo do banco; explicitar impacto em coleções grandes (base já mediu 23,9 MiB de payload, não de backup). Se propor ampliar, definir número e provas de memória/bloqueio e submetê-los à revisão. Definir encoding/BOM, orçamento/expiração/liberação de preparações e erros por fase.

Prévia imutável no main, uma por documento, token opaco por sessão e revisão global; confirmar somente a base apresentada, recusando mudanças de tarefas/lixeira com nova prévia/confirmação. Não reler arquivo na confirmação. Definir comandos IPC finitos/versionados, schemas/bytes/acks e resumo limitado, com validação de sessão nas fronteiras assíncronas; evoluir specs que hoje restringem catálogo17/backup ausente, sem IPC livre. Arquivo vazio requer aviso de remoção de todas as tarefas ativas.

Substituir somente tasks em uma unidade coordenada CAS, preservando lixeira/configurações e revisões locais. Validar portadora única em tarefas importadas+lixeira preservada, rejeitando conflito integralmente; coexistência normal de IDs tasks/trash mantém restore ID_EXISTS. Não enviar removidas à lixeira nem oferecer undo de importação. Comparar coleção por ID e todos os campos conhecidos/opcionais/listas, inclusive recurrence/seriesId e subtasks id/title/done/ordem: o comparador da extensão omite esses campos e não pode ser copiado. Liquidação pura de reminders vencidos <=now no commit é a única alteração prevista, mantendo timestamps e marcas futuras; scheduler/notificações/bandeja são TFA-008.

Fechar verificação da projeção dentro da unidade e releitura/reopen após commit, rollback antes de commit, gravação confirmada mas não verificada, resultado incerto e resposta perdida; ressync sem replay/reversão automática. Integrar UndoRegistry.invalidateAll() após commit confirmado e em UNCHANGED, invalidando recibos/confirmações/candidatos/ofertas visuais de todas as sessões na sequência coordenada. Definir notificação limitada para UNCHANGED sem falsa revisão/evento SQL. Cancelamento/falha com rollback não invalidam outras sessões. Banco futuro/corrupto permanece protegido pelo preflight; não prometer recuperação substituindo SQLite.

Incluir B01–B14 como cenários/tarefas observáveis: quatro fixtures por cópia revisada, round-trip completo e perdas isoladas de cada campo, fronteiras UTF-8/tamanho/recursos, concorrência/tokens, portadoras/trash, APPLIED/UNCHANGED/undo, sentinelas de segredo/extras, falhas por fase e I/O/bridge reais no pacote Windows. Preservar identidade, acessibilidade, foco/teclado/aria-disabled e feedback. Gates: lint/cinco typechecks/testes/build e OpenSpec estrito, depois provas de pacote aplicáveis com perfil fictício; smoke/build não provam diálogo/instalador. D10, prova humana de acessibilidade e before-images extremas continuam pendentes; não relaxar budgets por conveniência.

Backup transporta tarefas e metadados do envelope, sem lixeira, credenciais/configuração de IA ou desfazer temporário; JSON não criptografado pode conter dados pessoais das tarefas. Excluir mesclagem, extração do Chrome, mudanças na origem, importação SQLite, histórico persistente, scheduler/bandeja/captura/IA/redesign, instalações/releases/publicação e outras Changes. Planejar documentação operacional/paridade e README factual na etapa correspondente, sem apresentar recurso planejado como disponível. Entregar os artefatos para revisão, decisões/dúvidas remanescentes e prompt consolidado de apply registrado no roadmap; parar sem apply.
```

### Proposta entregue para revisão — 2026-10-05

**Autorização:** o usuário invocou `$openspec-propose` e anexou o prompt consolidado da TFA-007.
Isso autorizou somente proposal/design/deltas/tasks. Artefatos criados na mesma branch/base da
exploração, sem código de produto, nova instalação, alteração da origem ou execução de apply.
Estado **IN_REVIEW/REVIEW**, início **2026-10-05**, conclusão sem data; **0/45 tasks**.
Nenhuma aprovação humana dos artefatos foi registrada.

**Artefatos:** [proposal.md](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/proposal.md),
[design.md](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/design.md),
[tasks.md](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/tasks.md) e metadado
`.openspec.yaml` gerado pela CLI no schema `spec-driven`. Sete deltas, **45 requisitos /
157 cenários** (contratos futuros, sem implementação):

| Capability | Operação | Requisitos / cenários |
| --- | --- | --- |
| [desktop-task-backup](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/desktop-task-backup/spec.md) | ADDED | 18 / 39 |
| [desktop-foundation](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/desktop-foundation/spec.md) | MODIFIED | 2 / 8 |
| [desktop-state-ipc](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/desktop-state-ipc/spec.md) | MODIFIED + ADDED | 14 / 60 |
| [desktop-task-management](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/desktop-task-management/spec.md) | MODIFIED | 3 / 13 |
| [desktop-task-recurrence](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/desktop-task-recurrence/spec.md) | MODIFIED | 2 / 8 |
| [desktop-task-undo](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/desktop-task-undo/spec.md) | MODIFIED | 2 / 7 |
| [local-task-persistence](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/specs/local-task-persistence/spec.md) | MODIFIED | 4 / 22 |

**Escolhas concretas propostas para revisão:**
1. Arquivo completo **20 MiB** simétricos, UTF-8 estrito/BOM inicial opcional na entrada, saída sem
   BOM; exportação incompatível com backup ou grande recusa tudo sem alterar/truncar dados.
2. **128 MiB** de charge lógico global para backup, scanner antes de parse com profundidade
   **64** e **262144 nós**, um job nativo global, oito preparações/uma por documento. Não é
   garantia de heap nem teto do codec; reservas de undo continuam64MiB. Medições previstas.
3. Token próprio/contexto/base global, **5 minutos monotônicos** de validade e consumo único.
   Mudança em tasks/trash/claim exige nova prévia; abandonar modal mantém prévia, cancelar prévia
   libera. Exportação preventiva é subação que não renova base/TTL/consentimento.
4. Plano final importadas+trash preservada com portadora única qualquer status, sem geração,
   expurgo, renumerar IDs ou alterar datas/âncoras. Validação histórica do backup é distinta da
   edição de regra; somente liquidação de pendentes<=now é prevista.
5. Verificação completa por ID antes de COMMIT e releitura/conclusão serializada depois, antes
   da próxima unidade/publicação. Distinguir NOT_APPLIED, VERIFIED/PENDING e UNKNOWN; bloqueio/
   reopen/resync sem replay. Recuperação incerta tem barreira conservadora sem afirmar sucesso.
6. Época de undo transitória pública: estado/snapshot/eventos **v3**, update/status **v4** e move
   **v2** com época em acks elegíveis. Create/check3 e demais wrappers mantêm versões. Quatro
   backup1 completam **catálogo21**; invalidação usa a mesma inscrição, inclusive UNCHANGED,
   sem revisão SQL falsa. SQL2/codec4/backup4 permanecem.
7. Salvar por temporário exclusivo/sync/close/rename/readback no main, com destino anterior
   preservado antes da substituição. Detectar alterações observáveis do destino; documentar
   corrida residual de terceiros e energia não comprovada. Diálogo nativo real exige prova
   Windows distinta de escolha stub do harness.

Estas escolhas fecham as dúvidas materiais da exploração **como proposta**, não como preferência
humana aprovada. Alteração de comportamento/budget ou impossibilidade demonstrada nos gates
exige revisão coerente antes de implementar o ponto; não delegar decisão material ao apply.

**Validações desta entrega:** OpenSpec1.14.0 estrito da Change **1/1 sem issues**,
`--all` **11/11** (dez specs + uma Change), `--archived` **6/6**; INFO preexistentes de requisitos
extensos nas specs principais, sem erro. `openspec status` indica quatro conjuntos de artefatos
completos (planejamento), com tasks ainda **0/45**. `npm run validate` com Node24.21.0/npm11.21.0
já instalados: lint, cinco typechecks, **46 arquivos / 664 testes + 11 skipped**, build aprovados.
Revisão de cabeçalhos/cenários preservados, rastreabilidade B01–B14, links e diff sem erros.
Esses gates validam os artefatos e a base existente; não comprovam backup, diálogos nativos ou
novo recurso empacotado. Não foi gerado pacote/Setup nem alterado README/docs operacionais/specs
principais. Origem permanece somente leitura e intacta.

**Pendências:** revisão/aprovação humana dos artefatos antes de novo apply; implementação de45
tasks e evidências futuras B01–B14. D10, acessibilidade humana e campanha de before-images
extremas herdados continuam pendentes. Limites de tamanho/histórico/recursos, novo versionamento
e janela residual de gravação estão visíveis para revisão, sem marcar disponibilidade do recurso.
Após apply, verify/verification.md nesta Change; só arquivar depois da aprovação explícita do
relatório. Commit/push/PR/merge/instalação/distribuição e TFA-008 dependem da autorização pertinente.

### Prompt consolidado para opsx:apply

Usar somente após aprovação explícita dos artefatos e novo pedido de apply. O prompt abaixo não
é evidência de aprovação e não autoriza archive/merge/publicação.

```text
$openspec-apply-change TFA-007 — migrar-backups-e-importar-dados-da-extensao

Trabalhe somente em C:\QSI\Workspaces\taskflow-app, branch codex/tfa-007-migrar-backups-e-importar-dados-da-extensao, base 9e8a05a2d84874f25d9f429ecc120e81c7ec0acc (PR #6 integrado). Antes de iniciar, confira aprovação humana explícita dos artefatos registrada na conversa; este prompt não é essa evidência. Leia AGENTS.md, docs/roadmap.md (proposta TFA-007/B01–B14) e proposal/design/sete deltas/tasks de openspec/changes/migrar-backups-e-importar-dados-da-extensao, além dos contratos/dependências arquivados pertinentes. Preserve trabalho preexistente. Extensão e Git C:\QSI\Workspaces\taskflow-extension somente leitura, HEAD a763e7a0d646c664ecd4f979528bc2c3589fa8c4; não editar/instalar/testar/buildar/alterar Git ali.

Implemente exclusivamente as45 tasks aprovadas. Preservar leitura v1–v4/exportação v4, versão original da prévia e projeção integral de campos conhecidos em todos os níveis; não copiar comparador incompleto, scheduler/composição Chrome ou normalizadores de formulário para arquivo histórico. Validar export pelo próprio leitor; dado histórico não exportável recusa tudo sem truncar/normalizar. Coletor mantém só5issues seguros e contagem restante, sem conteúdo/log sensível.

Aplicar20MiB de bytes completos em import/export, UTF-8 estrito/BOM inicial opcional na entrada/saída sem BOM e leitura por handle regular max+1. Orçamento128MiB de backup com charges D2/overposição de fases, scanner depth64/nodes262144 anterior a parse, um job nativo global e até8preparações/uma por documento, sem novo limite de codec. Medir heap/RSS/pico/latência/liberação; preservar64MiB de undo e demais budgets.

Main escolhe/salva por diálogos vinculados à janela, ticket/contexto revalidados em cada fronteira, sem path/JSON/Task/Node no renderer. Exportar snapshot de todas as tarefas após save dialog; temporário exclusivo no mesmo diretório, sync/close/rename/readback, destino protegido/fingerprint e resultados SAVED/SAVED_WITH_WARNING. Não truncar/remover original antecipadamente, fazer fallback copy-delete ou repetir efeito. Documentar corrida residual/energia não comprovada e separar diálogo real Windows de escolha stub do harness.

Prévia imutável no main com token24bytes/base64url32, documento/contexto/revisão global, TTL5min monotônico e consumo único. Confirmar base exata; qualquer mudança em tasks/trash/claim exige nova prévia. Não reler arquivo na confirmação. Abandono modal mantém preview; cancelar/trocar/expirar/encerrar libera. Exportação preventiva conserva base/token/TTL, sem confirmar importação.

Substituir somente tasks por CAS global em uma unidade, preservando trash/configurações/IDs/timestamps/listas. Validar portadora única em importadas+toda trash, qualquer status; rejeitar SERIES_CONFLICT sem expurgar/retirar regra/reparar. Homônimos tasks/trash continuam permitidos e restore mantém ID_EXISTS. Sem mandar removidas à lixeira, oferecer undo de importação ou gerar ocorrências/subtasks. Somente liquidação pura de reminders pendentes<=now muda processedFor; conservar marcas futuras/timestamps e guards D8, sem scheduler.

Comparar conjunto exato por ID e todos os campos/opcionais/parâmetros/listas, inclusive seriesId/recurrence e subtask id/title/done/ordem; metadata SQL conferida separadamente. Verificar antes de COMMIT e acrescentar conclusão síncrona somente leitura/in-memory no coordenador após resultado e antes da próxima unidade/publicação, sem await/SQLwrite nela. Tratar NOT_APPLIED, VERIFIED/PENDING e UNKNOWN com rollback/contenção/reopen/resync apropriados, sem replay ou rollback falso. Banco inacessível/futuro/corrupto permanece protegido; não trocar SQLite para recuperar.

Integrar invalidateAll por epoch segura após APPLIED/UNCHANGED e barreira conservadora de recuperação incerta, sem declarar sucesso incerto ou revisão SQL falsa. Estado/snapshot/subscription/eventos v3 com undoEpoch e cursor do par revision/epoch; evento fechado undo-invalidated v1 na mesma inscrição/callback, buffer/coalescimento/ressync foco30s mesmo com SQL igual. Update/status v4 e move v2 carregam epoch em acks elegíveis;create/check3 e demais wrappers mantêm versões. Só apresentar oferta com contexto/epoch atuais e snapshot>=ack; resposta antiga não a recria. Acrescentar quatro backup1, catálogo21, schemas/erros/guardas D8/budgets64KiB/8KiB/1KiB/página256KiB/fila/lock preservados.

Preservar identidade/teclado/foco/aria-disabled/estados/feedback, prévia e confirmação irreversível/arquivo vazio/export preventiva; uma inscrição. Guia manual exportar na extensão→guardar original→selecionar/revisar/confirmar/conferir no app. Backup sem trash/credenciais/configuração IA/desfazer, JSON não criptografado com possíveis dados pessoais das tarefas; não anunciar migração desses itens ou alarmes disponíveis.

Executar testes unitários/integração/componente e provas B01–B14 no produto fictício empacotado, inclusive diálogo real separado, perdas de cada campo, tamanho/encoding/nós/memória/tokens/duas sessões/portadoras/UNCHANGED/late ack/falhas/reopen. Gates npm run validate/OpenSpec estrito, package:win --publish never/verify:package/smoke:packaged sem Setup ou publicação. D10/a11y/before-images herdados permanecem separados; não relaxar budgets, truncar, dividir commits, virtualizar ou introduzir worker por conveniência. Descoberta material exige revisar artefatos e pedir revisão antes desse ponto, continuando trabalho independente autorizado.

Atualizar documentação operacional/arquitetura/catálogo/matriz quando implementados; README factual após archive autorizado. Excluir mesclagem/extração Chrome/import SQLite/reset recuperação/histórico/criptografia nova/scheduler/bandeja/captura/IA/redesign/instalações/releases/outras Changes. Ao concluir apply, executar openspec-verify-change e criar verification.md nesta Change com aderência/45tasks/B01–B14/gates/pendências. Entregar relatório para aprovação explícita e parar sem archive/consolidação/README pós-archive/merge/publicação ou TFA-008.
```


### Aprovação dos artefatos — 2026-10-05

**Evidência humana nesta conversa:** após receber os artefatos para revisão, o usuário determinou: **“Aprove os artefatos, commit e faça o push da branch”**. A aprovação abrange a versão entregue de proposal, design, os sete deltas (desktop-task-backup, desktop-foundation, desktop-state-ipc, desktop-task-management, desktop-task-recurrence, desktop-task-undo e local-task-persistence) e tasks da TFA-007, incluindo as sete escolhas concretas propostas para revisão e os orçamentos de recursos. Estado atualizado para **APPROVED/READY_FOR_APPLY**. As 45 tasks continuam pendentes; apply não iniciado.

Este pedido aprova os artefatos, seu registro no roadmap, o commit e o push dos mesmos; não solicita iniciar apply, implementar, arquivar, abrir PR ou avançar a outra Change. As observações de aprovação pendente feitas durante a elaboração descrevem aquele momento; este registro estabelece a aprovação posterior sem alterar o conteúdo técnico. Próxima ação: usar o prompt acima mediante pedido explícito de apply.

### Apply, verificação, archive e DONE — 2026-10-05

**Apply 45/45 concluído** na branch `codex/tfa-007-migrar-backups-e-importar-dados-da-extensao`,
preservando o trabalho preexistente e mantendo a extensão e seu Git somente leitura no HEAD
`a763e7a0d646c664ecd4f979528bc2c3589fa8c4` (worktree limpo; nenhum build/teste/escrita na origem).

**Entregue no apply:** núcleo portável de backup (formato v1–v4, migrações, validação com coletor
de 5 issues, projeção explícita, comparador completo, scanner 64/262 144 nós, ledger de 128 MiB,
serialização sem BOM validada pelo leitor); adapters de arquivo no main (leitura por handle
20 MiB+1/UTF-8 estrito, diálogos nativos vinculados, job global, proteção de destino, gravação
atômica com fingerprint/readback); serviços export/prepare/confirm/cancel com prévia imutável
(token 24 bytes/base64url, TTL 5 min, consumo único) e conclusão serializada com barreira de época;
estado v3 com `undoEpoch`, evento `undo-invalidated:v1`, update/status v4, move v2, catálogo 21 e
quatro wrappers backup; área de Backup na interface com prévia, modal irreversível, Escape, busy
aria-disabled e foco; harness de produto `backup` com duas superfícies; documentação
([backup-format.md](../docs/backup-format.md), [backup-migration-guide.md](../docs/backup-migration-guide.md),
[packaged-evidence-tfa007.md](../docs/packaged-evidence-tfa007.md)) e a
[verification.md](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/verification.md)
desta Change.

**Gates executados:** `npm run validate` (lint, 5 typechecks, **834 testes + 11 skipped em 62
arquivos**, build) aprovado; OpenSpec 1.14.0 estrito com Change **1/1**, `--all` **11/11** e
`--archived` **6/6** (pré-archive); `package:win` NSIS x64 `--publish never`, `verify:package`
(ASAR de 12 arquivos na allowlist; manifestos `asInvoker/uiAccess=false`; hashes SHA-256
registrados) e `smoke:packaged -- --ci-runner` **OK com o gate D10 herdado reportado como
pendente**; cenário `backup` do pacote com **18/18 verificações** (APPLIED/UNCHANGED/base stale/
SERIES_CONFLICT/export-fail e epoch em duas superfícies, diálogos stub separados do roteiro
nativo). Medições: teto de 20 MiB com 4 762 tarefas/214 303 nós (~99 ms encode, ~46 ms scan,
~74 ms validação), `limite+1` recusado, adversariais recusados antes do parse, 8×16 MiB aceitos com
liberação a zero e restauração de 1 000/10 000 + 100 de lixeira em ~9/~71 ms; a sobreposição
parse+preparação no teto exato excede os 128 MiB para aquele formato (RESOURCE_LIMIT com dados
intactos, dentro do design aprovado).

**Verificação e archive:** o `verification.md` foi gerado com aderência, 45/45 tasks, B01–B14,
gates e pendências, apontando **nenhum issue crítico** (3 WARNING herdados e 1 SUGGESTION). Após o
pedido explícito de archive, a Change foi arquivada pela CLI 1.14.0 como
**`2026-10-05-migrar-backups-e-importar-dados-da-extensao`**, com consolidação dos sete deltas em
**19 requisitos ADDED/26 MODIFIED**; `openspec validate --all --strict` **11/11** e
`--archived --strict` **7/7** depois do archive. O README factual foi atualizado (catálogo 21,
estado v3/época, area de Backup e links de documentação) e o **DONE foi registrado em 2026-10-05
por decisão explícita do usuário antes do merge** (precedente da TFA-003), com commit/push na
mesma branch e PR aberto para a main na sequência; a integração será conferida no merge.

**Pendências separadas (não resolvidas por esta Change):** D10 de UI (p95 688,3 ms; heartbeat
760,5 ms; varredura 141,7 ms; números 700/700/250 não aprovados), acessibilidade humana,
before-images extremas, prova de energia e diálogo nativo real do Windows (roteiro humano
registrado e não executado; o stub do harness nunca é apresentado como nativo). TFA-008 e
distribuição/releases continuam dependentes de pedido próprio.

**Correção pós-archive encontrada pela CI do PR #7 (2026-10-05):** o runner usa `%TEMP%` com nome
curto 8.3 (`C:\Users\RUNNER~1\...`) e a proteção de destino comparava a forma digitada com o
`realpath` (forma longa), recusando destino legítimo com `DESTINATION_NOT_ALLOWED`/
`FILE_WRITE_FAILED` (5 testes). A canonicalização foi corrigida para comparar sempre formas
canônicas (ancestral existente mais profundo + segmentos ausentes) e detectar reparse/symlink por
`lstat` ancestral, com injeção de FS apenas para testes; teste de regressão do alias 8.3 e da
proteção de raiz canônica adicionado. `npm run validate` passou com **836 testes + 11 skipped**;
commit `91eb477` e push na mesma branch reexecutaram a CI do PR. **CI do PR #7 verde em
2026-10-05** ([run 37341894516](https://github.com/Cadlira/taskflow-app/actions/runs/37341894516)):
gates (lint/typecheck/testes/build), pacote NSIS x64 sem publicação, inspeção de conteúdo,
smoke do pacote e hashes aprovados; resta apenas a anotação informativa de depreciação do Node 20
nas próprias actions. D10 herdado e demais pendências continuam separados.

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

### Exploração concluída — 2026-10-06

**Estado:** READY_FOR_PROPOSE/EXPLORE; início e conclusão de implementação permanecem vazios. Nenhum diretório/artefato OpenSpec da TFA-008 foi criado. Somente este roadmap registra a exploração e seu encaminhamento, conforme AGENTS.md item 10. As recomendações técnicas abaixo não constituem aprovação dos futuros artefatos.

**Dependência satisfeita:** [PR #7](https://github.com/Cadlira/taskflow-app/pull/7) da TFA-007 integrado em 2026-10-05, merge `c7dcf845ba82a74e7027e764626decf6e0bfd82c`, conferido pelo conector GitHub em 2026-10-06. Checkout consultado: `codex/tfa-007-migrar-backups-e-importar-dados-da-extensao` em `69834bd`; `main`/referência local `origin/main` ainda em `9e8a05a`, sem fetch/checkout/merge nesta exploração. Consultados [proposal](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/proposal.md), [design](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/design.md), [tasks](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/tasks.md), [verification](../openspec/changes/archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/verification.md), specs consolidadas e contratos relevantes das dependências anteriores. OpenSpec instalado **1.14.0**, raiz própria, schema `spec-driven`, nenhuma Change ativa. A origem foi consultada somente para leitura em `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, worktree limpo; nenhum teste/build/escrita/configuração persistente foi executado nela.

**Decisões confirmadas pelo usuário nesta exploração:**

- Recuperação em **ambas** as situações, suspensão e reabertura: **“Entregar os pendentes com até 5 minutos de atraso em ambas as recuperações (recomendado).”** Igualdade de 300.000 ms é elegível; atraso maior deve ser liquidado sem aviso. Isso altera deliberadamente o startup da origem e a recomendação antiga de D6 em `docs/architecture.md`; revisar coerentemente no futuro propose/apply, sem editar essa documentação de produto agora.
- Fechar para bandeja: **“Preservar rascunho e filtros só em memória; recuperar ao abrir novamente (recomendado).”** Undo, prévias de backup e pedidos pendentes perdem validade no close. Não salvar o rascunho automaticamente, persistir filtros/drafts após saída/crash nem repetir comando cujo resultado ficou incerto.
- Baseline já registrado: fechar para bandeja, saída explícita e inicialização opcional no login; sem serviço Windows ou inicialização obrigatória. Default de login desligado e detalhes operacionais abaixo são recomendações a revisar no propose.

#### Evidências e implicações

| Evidência consultada | Achado | Consequência para TFA-008 |
| --- | --- | --- |
| [Regras da origem](C:/QSI/Workspaces/taskflow-extension/src/domain/task-reminders.ts:9) e [validação de drafts](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:165) | Até 10 lembretes; presets 0/15/60/1440 minutos; OFFSET inteiro seguro não negativo, AT até o prazo; prazo obrigatório; IDs/instantes efetivos distintos e representáveis. Recorrentes aceitam somente OFFSET. Novo/configuração alterada no passado é recusado; configuração existente intacta pode ser conservada. | Copiar regras/testes portáveis por revisão e migrar controles do formulário. OFFSET é duração exata em minutos, não subtração de dias civis. Preservar ISO/precisão de valores intactos e feedback por item. Não aceitar `processedFor`/IDs novos como autoridade do renderer. |
| [Planejamento](C:/QSI/Workspaces/taskflow-extension/src/domain/task-reminders.ts:154), [reconcileAll/alarme](C:/QSI/Workspaces/taskflow-extension/src/application/reminder-service.ts:69) e [background](C:/QSI/Workspaces/taskflow-extension/src/entrypoints/background.ts:58) | `planReminders` só agenda futuro ativo; `reconcileAll` liquida todo `<= now`, enquanto `handleAlarm` aceita atraso de até 5 minutos após claim. Há tolerância separada de 60 segundos para identificar horário Chrome obsoleto. | Não copiar reconcileAll como recuperação desktop: consumiria os pendentes elegíveis antes de tentar aviso. Separar recuperação com janela de 5 minutos de liquidação pura em operações do usuário. A tolerância Chrome de 60 segundos não deve autorizar timer desktop antigo após edição de prazo em menos de um minuto; revalidar a tupla exata da ocorrência e nunca avisar antes do gatilho. |
| [Claim da origem](C:/QSI/Workspaces/taskflow-extension/src/application/reminder-service.ts:95), [claim desktop](../src/application/storage/task-storage-unit.ts:565) e [preservação de markers](../src/domain/task-reminders.ts:175) | Claim persiste antes do notifier; falha de notificação consome a ocorrência. Desktop já muda somente globalRevision, conservando updatedAt/contentRevision/editRevision. Edição antiga de ocorrência inalterada conserva marker atual. | Reutilizar `processedFor` como registro durável de consumo, sem diário de entregas novo. Uma tentativa por ocorrência ainda reconhecida no estado corrente; crash depois do claim pode perder o aviso, sem retry automático. Não alegar exatamente uma entrega ou histórico ilimitado de todas as configurações anteriores. |
| [Coordenador](../src/main/storage/coordinator.ts:119) e [conclusão síncrona](../src/main/storage/coordinator.ts:301) | Uma fila/conexão decide read/validate/commit; `onCompleted` é somente leitura/in-memory, anterior a publicação/próxima unidade. Fila 64/8 por sessão, espera 2 s, callbacks SQL síncronos. | Claim, edição, status, série, lixeira, undo e importação devem compartilhar a mesma coordenação. Não introduzir escritor paralelo, await/notificação dentro de SQL ou efeito externo em `onCompleted`. Refinar barreira entre candidato confirmado e submissão ao SO, com invalidação de candidatos obsoletos e clock relido na execução. |
| [Bloqueios D8](../src/application/tasks/task-commands.ts:343), [próxima ocorrência](../src/domain/task-recurrence.ts:266), [restore/revert](../src/domain/task-reminders.ts:132) e [backup](../src/application/backup/backup-restore-plan.ts:101) | Prazo/status/fechamento com reminders ainda são recusados; helper da próxima já copia OFFSET com IDs novos sem marker. Restore/undo/importação liquidam vencidos, e backup UNCHANGED não publica commit SQL. | Integrar lembretes por completo para retirar D8: fechada+gerada e settlement no mesmo commit, reconcile externo depois. Preservar liquidação `<= now` de edição/criação/transição/restore/undo/importação, sem aviso retroativo causado por essas operações; graça é recuperação de pendentes, não replay de backup. Reconcile explícito também após backup UNCHANGED e reopen validado. |
| [Shell atual](../src/main/index.ts:56), [close](../src/main/index.ts:219) e [sessões](../src/main/ipc/document-sessions.ts:81) | AUMID `taskflow.app` e lock antes do banco existem; segunda instância apenas encerra; close atualmente sai. `invalidate` troca geração, mas autoriza novos pedidos do mesmo documento; `unregister` retira autoridade. | Lifecycle real, roteamento e bandeja ainda precisam ser implementados. Só hide/invalidate não basta: fechar deve suspender inscrição/clientes e retirar admissão da superfície oculta; reabrir registra/autoriza sessão nova, reconstitui snapshot e conserva apenas apresentação/draft. |

#### Scheduler e durabilidade recomendados

| Alternativa | Benefício e custo | Recomendação |
| --- | --- | --- |
| Um timer por reminder | Simples, mas até 100.000 candidatos em 10.000 tarefas com 10 lembretes; reconciliação e cancelamento multiplicam timers. Timers longos exigem limite do runtime. | Evitar como baseline de volume. |
| Varredura completa periódica | Recupera eventos perdidos e é simples; aumenta latência e repetidamente decodifica a coleção, agravando D10. | Somente alternativa medida, sem usar varredura total por claim/commit como atalho. |
| Índice ordenado em memória + um timer para o próximo vencimento | Projeção descartável, poucos timers e reconciliação por tarefas afetadas; exige coalescimento, versões de candidatos e reconstrução segura. | Preferida: main proprietário, relógio/agenda/notifier por portas; heap ou estrutura equivalente decidido no design. |

Recriar projeção no startup, `resume`, reopen validado e restauração de backup. Coalescer alterações confirmadas por tarefa; a invalidação pública atual só tem revisão, portanto propor sinal **interno** das tarefas afetadas/necessidade de rebuild, sem exportar payloads por evento ou causar loop claim→rebuild→claim. Não depender exclusivamente de eventos: propor recuperação periódica limitada e relógio verificado (intervalo/orçamentos medidos no propose). Fatiar preparação pura e limitar candidatos/listeners, conservando snapshots por revisão; não manter SQL aberto durante preparo ou chamada nativa. Registro inválido/banco bloqueado suspendem disparos e informam indisponibilidade, sem estado vazio/reset.

Na recuperação, classificar pelo instante atual: futuro agenda; ativo pendente com `triggerAt <= now <= triggerAt + 300000` tenta claim/aviso; atraso maior liquida; ausente/terminal/marker já correspondente não avisa. Clock deve ser relido dentro da unidade e antes da submissão, pois espera da fila pode atravessar a fronteira. Disparo de timer atrasado, resume repetido e startup competem pelo mesmo claim exato. Clock recuado não entrega futuro; clock adiantado aplica a janela real e nunca limpa markers para repetir. Mudança de fuso conserva instantes UTC; recorrência continua usando a regra civil já existente.

Timers Node maiores que **2.147.483.647 ms** (~24,8 dias) viram atraso de 1 ms; usar espera limitada/reavaliação evita loops para prazos longos. Timer é aviso para reler dados, não a fonte de verdade. [Node 24.21.0 timers](https://nodejs.org/download/release/v24.21.0/docs/api/timers.html), [powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor).

**Garantia e risco residual:** manter a política aprovada em D6 de no máximo uma tentativa, com marker confirmado antes do notifier. Candidato lê dados atuais e uma alteração anterior à submissão o invalida; após a submissão, Electron/Windows trabalham de forma assíncrona. Fechar notificações obsoletas ainda rastreadas é melhor esforço; título já exibido não pode ser desexibido retroativamente. Cinco minutos limitam a tentativa do app, não o instante visual imposto pelo Windows. Não prometer ausência absoluta de toast obsoleto após mudanças posteriores à submissão, entrega garantida, confirmação de leitura ou retry após crash/falha. Não há transação atômica SQLite+Windows. [Implementação Electron 44.5.1 de submissão](https://github.com/electron/electron/blob/v44.5.1/shell/browser/notifications/win/windows_toast_notification.cc).

#### Ciclo de vida, comunicação e login

| Ação/estado | Comportamento recomendado |
| --- | --- |
| Minimizar/perder foco | Manter processo, scheduler, draft, filtros e sessão/undo; nenhum cleanup de close. |
| Fechar X/Alt+F4 | Ocultar para bandeja depois de cleanup de sessão/IPC/undo/backup e cancelamento de pedidos não iniciados. Rascunho/filtros continuam somente em memória; commit concluído permanece e resultado perdido exige ressync, sem replay. Reabertura cria sessão/subscription atuais antes de nova ação. |
| Bandeja | ICO existente; menu acessível Abrir TaskFlow e Sair do TaskFlow; clique restaura/foca. Criar bandeja antes de ocultar; se falhar, manter janela visível com erro e saída acessível. Não depender de ícone estar fora da área de overflow do Windows. |
| Sair | Estado quitting impede close→hide, fecha novas admissões/timers/candidatos, cancela transientes, termina/rollback de unidades em curso, fecha banco, destrói bandeja e encerra processo. Sem lembretes durante saída completa. |
| Logoff/reinício do Windows | Não transformar encerramento de sessão em hide nem bloquear shutdown indefinidamente. Eventos de sessão da janela têm tratamento próprio; `powerMonitor.shutdown` é Linux/macOS, não Windows. Durabilidade depende dos commits, não de callback final garantido. |
| Segunda instância | Owner restaura/foca a superfície existente; perdedora não abre banco nem cria escritor/janela. Validar intenções/argumentos fechados, sem URL/path/shell livre ou override de perfil. Provar interação com ativação COM das notificações. |
| Login opcional | Recomendar desligado por padrão, opt-in explícito por usuário e inicialização na bandeja por argumento fechado. Lançamento manual abre janela. Se bandeja indisponível, abrir janela. Somente app instalado de produção escreve sua entrada; nada automático em dev/test/startup. |

Comunicação proposta, visível dentro do app e acessível por teclado: **“Ao fechar a janela, o TaskFlow continua na bandeja para os lembretes. Para encerrar, use Sair do TaskFlow.”** Para saída: **“Os lembretes ficam pausados até abrir o TaskFlow novamente.”** Explicar que desligamento/suspensão/notificações bloqueadas não garantem aviso; pendentes podem ser recuperados até cinco minutos **quando o app voltar**, conforme decisão humana. Aviso inicial deve usar a própria janela; não depender de outro toast que pode estar bloqueado. Sem confirmação repetitiva para fechar e sem autosave de draft.

Usar `app.setLoginItemSettings`/`getLoginItemSettings` no main para a entrada própria em HKCU, caminho do executável NSIS e argumentos constantes, sem copiar a receita de stub Squirrel. Ler configuração efetiva com mesmos path/args e distinguir `openAtLogin`, `executableWillLaunchAtLogin` e item user/enabled; respeitar desativação externa no Windows, sem reabilitar no startup ou fabricar sucesso. Resultado é solicitação/configuração verificada, não promessa de que uma política corporativa permitirá executar. Refinar armazenamento local versionado de preferências/avisos, falha parcial entre persistência e Registro, upgrade e remoção **somente** da entrada/registro próprios na desinstalação, preservando dados. Preferências não entram no backup de tarefas. [API app](https://www.electronjs.org/docs/latest/api/app/#appsetloginitemsettingssettings).

No pacote ainda não assinado, não recomendar GUID fixo de bandeja associado ao caminho sem avaliar upgrade: Electron recomenda GUID em conjunto com assinatura. Manter ícone/identidade existentes e tratar assinatura/distribuição final na TFA-011. [Tray](https://www.electronjs.org/docs/latest/api/tray).

#### Notificações Windows e foco na tarefa

Recomendar `Notification` do **main**, com título da tarefa e prazo pt-BR conforme origem, ícone local empacotado, `isSupported` e eventos `show`/`failed` tratados por códigos sanitizados. Suporte de API e chamada `show` não comprovam exibição, permissão, leitura ou ausência de Não Perturbe. Não reemitir após falha/clock/restart, não passar notifier/IPC bruto ao renderer e não adicionar dependência nativa por antecipação.

AUMID estável **`taskflow.app`** já corresponde ao appId NSIS; o template instalado de builder26.17.0 chama `WinShell::SetLnkAUMI` no atalho do Menu Iniciar. Tutorial Electron exige atalho com AUMID e ToastActivatorCLSID. O código **44.5.1** registra activator COM/HKCU e prepara/verifica atalho para aplicativo desktop não MSIX; portanto não presumir “NSIS resolve tudo” nem “é preciso outro pacote”. Provar atalho, alvo, CLSID/LocalServer32, conta padrão, clique e cleanup no instalado. Registro COM por usuário para ativação não é serviço Windows. [Tutorial](https://www.electronjs.org/docs/latest/tutorial/notifications#Windows), [activator da versão fixada](https://github.com/electron/electron/blob/v44.5.1/shell/browser/notifications/win/windows_toast_activator.cc).

`Notification.handleActivation` e `NotificationConstructorOptions.id` para Windows constam de `node_modules/electron/electron.d.ts` da versão fixada e da [API oficial](https://www.electronjs.org/docs/latest/api/notification/#notificationhandleactivationcallback-windows). A ativação central cobre cold start e Centro de Notificações após restart; também ocorre junto dos eventos de instância, portanto escolher **uma** via de navegação para não abrir/focar duas vezes. Não assumir que listener `click` de um objeto em memória sobreviva ao processo.

ID nativo é Tag: limite **64 caracteres no Windows 11** (16 antes do Creators Update). Não copiar a string `taskId:reminderId:ISO` da origem: ultrapassa o limite com UUIDs comuns e admite ambiguidades em IDs históricos. Recomendar tag hexadecimal determinística SHA-256 da tupla canônica, de 64 caracteres, com resolução/checagem contra ocorrências do estado persistido e recusa de resolução ambígua. Índice de roteamento pode ser reconstruído de markers atuais, incluindo processados; mapa só em memória de notificações emitidas não resolve cold start. Se a prova revelar necessidade de registro auxiliar durável ou `toastXml`, definir schema/encoding/cleanup no propose antes do apply, sem criar histórico ou presumir API de remoção macOS no Windows. [Limite Tag Microsoft](https://learn.microsoft.com/en-us/uwp/api/windows.ui.notifications.toastnotification.tag?view=winrt-28000).

Ativação é entrada não confiável: parse fechado/limitado, nenhum comando de tarefa/URL externa/path pode ser autorizado por ela. Owner aguarda banco e superfície autorizados, relê a tarefa atual, restaura/foca e localiza mesmo se filtros a ocultarem, sem limpar os filtros salvos. Ausente/lixeira/ocorrência alterada recebem mensagem segura; nunca recriar/restaurar/concluir tarefa pelo clique. Havendo draft, conservar e apresentar navegação pendente revisável, sem trocar formulário automaticamente. Testar clique imediato/tardio, encerrado, janela oculta, mesma instância e task alterada/excluída. Dev/test usam nomes/AUMIDs/registro próprios ou notifier fake; ativação nativa não deve substituir atalho/registro prod nem contaminar conta real.

#### Escopo, exclusões e pontos a fechar no propose

**Incluído:** regras/formulário e IPC de reminders; retirar D8 com integração real; ports/scheduler/notifier no main; consumo durável/recovery; integração com todas as mutações/recorrência/lixeira/undo/backup APPLIED e UNCHANGED; bandeja/close/quit/single instance; ativação/foco seguro; login opcional, preferências locais mínimas; comunicação e testes do produto empacotado/instalado.

**Excluído:** serviço/tarefa agendada Windows, wake do computador, agendamento externo para garantir avisos com app encerrado, login obrigatório, retry automático de aviso consumido, snooze/repetição/escalada, histórico de entregas, redesign/dashboard, Quick Add/captura/atalhos globais TFA-009, IA TFA-010, assinatura/release/auto-update TFA-011, alterações na extensão e novos formatos de backup por conveniência. Não resolver D10, acessibilidade humana ou energia pendentes como expansão automática.

**Dúvidas materiais restantes:** (1) default desligado/login na bandeja e reconciliação entre preferência e estado efetivo do Windows; (2) representação/versão/atomicidade das preferências e ownership/limpeza de HKCU/CLSID/atalho em upgrade/uninstall; (3) barreira exata claim→submissão e cancelamento de aviso obsoleto já aceito pelo SO; (4) índice de roteamento cold start/limites/candidatos e prova de COM+instância única; (5) intervalo/budget de recovery periódico, coalescimento e volumes; (6) shapes/versões de IPC para drafts/errors/preferências/lifecycle, nova inscrição após close e resultados incertos sem replay. Fechar esses pontos nos artefatos; aceitar decisões sobre recuperação/draft não aprova todas as recomendações nem inicia propose.

#### Critérios e testes a refinar

| ID | Critério observável / evidência futura |
| --- | --- |
| M01 | Form/owner aceitam 0–10 reminders, presets e tipos; 11, IDs/instantes repetidos, OFFSET fracionário/negativo/overflow, sem prazo, AT>prazo e AT recorrente recusam sem perda do draft. Configuração intacta/ISO preciso/marker atual conservados. |
| M02 | Clock fake em gatilho−1ms/igual/+299999/+300000/+300001, startup e resume; zero aviso antecipado, fronteira inclusiva, vencido liquidado, repetição de startup/resume/alarme sem segundo claim/aviso. Clock recuado/avançado, fuso/DST e timeout>24,8dias cobertos. |
| M03 | Barreiras determinísticas: claim disputa edição de título/prazo/reminder/status, remoção, restore, undo e backup; aviso usa candidato atual, marker inalterado conservado, nenhuma sobrescrita stale. Eventos/candidatos antigos não passam da fronteira de submissão. |
| M04 | SQLite real: rollback/commit incerto não autorizam aviso; interrupção antes/depois de claim, antes da submissão e após show; reopen mantém marker. Falha do notifier não repete nem desfaz tarefa. Registrar perda possível e limite de at-most-once. |
| M05 | Remover D8 com DONE/SKIP/END/adiamento/remoção de reminders: fechada+gerada atômicas, novos IDs OFFSET/sem marker herdado, cancelamento/settlement corretos e reconcile só pós-commit. Toggle independente e undo condicionado mantêm contratos. |
| M06 | Criação/edição/transição/restore/undo/importação liquidam `<=now` sem replay; backup APPLIED/UNCHANGED/empty e reopen atualizam projeção, sem timer órfão. Claim invalida preview global, mas não edição/undo por conteúdo. |
| M07 | Minimizar preserva sessão/undo; close por X/Alt+F4 conserva draft/filtros somente em memória e limpa transientes/admissão; reabrir reconcilia antes de escrever. Pedidos antigos/commit sem ack não retornam como sucesso ao documento novo nem são repetidos. |
| M08 | Tray Abrir/Sair, falha de criação, segunda instância, renderer crash, quit repetido e logoff: owner único, processo encerrado na saída, conexão fechada sem interrupção de commit, nada escondido sem caminho de recuperação. |
| M09 | Windows instalado em conta padrão: AUMID/atalho/CLSID, toast visível/identidade/ícone/prazo e click/Action Center/cold start reais; ausência/edição/filtro/draft tratados. API unsupported/failure/Não Perturbe/notificações desativadas documentadas sem falso delivery. Fake/harness/build não comprovam aceitação nativa. |
| M10 | Opt-in/out login, estado externo desativado, caminho com espaços/acentos, startup oculto/manual visível, upgrade/uninstall/segunda conta; só registro próprio por usuário, sem serviço/elevação/reabilitação automática. Ambientes fictícios/instalação autorizados no apply, nunca nesta exploração. |
| M11 | IPC fecha versões/shapes/origem/frame/sessão/tamanhos/IDs de reminder; nenhum processedFor/Task/path/URL/notifier livre. Foco/erros por item, teclado/zoom/DPI e retorno da tarefa fora dos filtros sem apagar draft. |
| M12 | Medir 1.000/10.000 tarefas e até 10 reminders cada: memória/candidatos/timers/coalescimento/latência/bloqueio/heartbeat/startup/recovery; gates existentes npm/OpenSpec/package/verify/smoke, origem intacta. Separar D10/a11y/energia herdados e provas humanas reais. |

**Validação desta exploração:** leitura de código/testes/artefatos, CLI e declarações da versão fixada; consulta a fontes primárias e integração do PR. Nenhum scheduler, toast, registro de login/COM, teste de suspensão, Setup ou gate de produto foi executado. Verificações desta entrega restringem-se ao roadmap/diff/links e ausência de Change nova.

### Prompt consolidado para opsx:propose

Prompt produzido ao final da exploração e utilizado por pedido explícito de `$openspec-propose` em **2026-10-06**. As duas escolhas de produto estavam confirmadas; a proposta completa abaixo ainda aguarda revisão e não autoriza apply.

```text
$openspec-propose TFA-008 — migrar-lembretes-e-ciclo-de-vida-desktop

Trabalhe somente em C:\QSI\Workspaces\taskflow-app. Leia AGENTS.md, docs/roadmap.md (exploração TFA-008 de 2026-10-06), dependências arquivadas e specs consolidadas. TFA-007 está integrada pelo PR #7, merge c7dcf845ba82a74e7027e764626decf6e0bfd82c, conferido via GitHub; referências locais consultadas estavam desatualizadas. Confira estado/base antes de escrever. Origem C:\QSI\Workspaces\taskflow-extension estritamente somente leitura, sem testes/builds/configurações/Git escritos. Confirme CLI/schema existentes (consulta: OpenSpec1.14.0/spec-driven). Crie apenas proposal/design/specs/tasks desta Change, registrando antes IN_PROGRESS/PROPOSE/data de início e ao concluir IN_REVIEW/REVIEW, sem aprovação inferida.

Preserve até 10 lembretes AT/OFFSET, presets0/15/60/1440, prazo obrigatório, OFFSET inteiro seguro não negativo/duração exata, AT<=prazo, IDs/instantes únicos/representáveis, somente OFFSET recorrente, ISO preciso e markers de configuração intacta. Proponha cópia revisada de regras/testes/formulário e IPC fechado de drafts; processedFor, timestamps, IDs novos e autoridade de claim pertencem ao main. Integre retirada de D8 de prazo/status/fechamento somente com scheduler real, sem remover dados ou emular Chrome.

Decisão humana confirmada: tanto resume quanto reabertura/startup entregam pendentes ativos com triggerAt<=now<=triggerAt+300000; acima disso liquidam sem aviso e futuros são agendados. Isso muda o startup antigo da origem/D6: não copiar reconcileAll que liquida toda ocorrência<=now antes da tentativa. Em criação/edição/transição/restore/undo/importação mantenha liquidação pura<=now sem aviso retroativo; graça não reproduz backup. Timers desktop revalidam tupla exata e não entregam antes do gatilho; tolerância Chrome de60s não legitima alarme antigo após edição.

Recomende scheduler no main como índice ordenado descartável com um timer, clock/agenda/notifier por portas; compare timers por reminder e varredura periódica. Proponha invalidação interna/coalescimento por tarefas afetadas, rebuild startup/resume/reopen/backup inclusive UNCHANGED e fallback periódico medido, sem loop de claims, await em SQL, escritor paralelo, scans totais por commit ou timeout>2147483647ms sem reavaliação. Todas as mutações e claims usam StorageCoordinator; processedFor persiste antes do efeito, conserva updatedAt/content/edit, avança global e não invalida undo, mas conflita com preview de backup. Feche barreira candidato→submissão fora de SQL/onCompleted, clock na execução, falhas/queue/COMMIT incerto e contenção. Mantenha no máximo uma tentativa; crash após claim pode perder aviso, sem retry automático ou exactly-once. Mudanças após submissão e exibição retardada pelo Windows têm limite explícito e remoção best effort.

Fechada+gerada/settlement são atômicos, OFFSET recebe IDs novos/sem marker; reconcile externo só depois de commit, falha não o reverte. Integre delete/restore/undo/importação APPLIED/UNCHANGED/empty e recovery validado; preservar marks atuais, portadora única e backupv1–v4/SQL2/codec4 sempre que suficientes. Alteração necessária de schema/configuração deve ter migração/downgrade/cleanup justificados nos artefatos, não ser improvisada no apply.

Baseline: fechar para bandeja, saída explícita, login opcional. Decisão humana confirmada: close preserva rascunho/filtros apenas em memória; undo/prévias/pedidos antigos perdem validade. Compare destroy e hide; recomende hide com suspensão de clientes/subscriptions e retirada da admissão (só invalidate permite reautorizar oculto), nova sessão/snapshot ao abrir e nenhum autosave/replay. Minimizar conserva sessão/undo. Defina menu Abrir/Sair, ícone existente, falha de tray mantendo janela visível, quitting sem hide, single instance com restore/foco e encerramento seguro/logoff Windows. Comunicação acessível dentro da janela distingue fechar, sair e recuperação de cinco minutos; não depende de toast para explicar comportamento.

Use Notification do main e APIs da versão fixada44.5.1; AUMID/appId taskflow.app, atalho NSIS+ToastActivatorCLSID/COM por usuário devem ser comprovados no instalado. handleActivation existe e cobre cold start; escolher rota única com eventos click para evitar navegação dupla. Recomende tag SHA-256 hexadecimal64 da tupla canônica (Windows11 suporta64; concatenação de UUIDs excede), roteamento reconstruído do estado persistido incluindo processados, parsing limitado e resolução ambígua recusada. Relê tarefa atual, restaura/foca/localiza fora dos filtros, sem mutação automática, perda de draft ou URL/path/shell livre. Feche COM+lock/coldstart/cleanup e alternativa de payload/registro auxiliar somente se necessária. Isole nomes/AUMIDs/registro dev/test para não alterar prod. show/isSupported não provam exibição; tratar failed por código seguro, sem logs de conteúdo.

Recomende iniciar com usuário desligado por padrão, opt-in explícito e startup na bandeja por argumento constante; manual abre janela. set/getLoginItemSettings só no main/prod instalado e entrada própria HKCU com path/args NSIS; respeitar desativação externa, sem reabilitar no startup. Feche fonte de verdade/preferência versionada/falhas parciais/upgrade/uninstall próprio, fora do backup. Não instalar serviços/tarefas agendadas, exigir login, acordar PC, oferecer snooze/retry/histórico, instalar dependências, redesign, Quick Add/captura/atalhos009, IA010, assinatura/releases/auto-update011 ou corrigir pendências herdadas por conveniência.

Transforme M01–M12 do roadmap em cenários/tasks verificáveis: fronteiras−1/igual/+300000/+300001, suspensão/restart/clock/fuso/timer longo; concorrência/markers/rollback/crash em cada barreira; todas as mutações/backup no-op; close/draft/transientes/quit/logoff/segunda instância; notificações/click/coldstart/DND/AUMID/CLSID e login no Windows instalado padrão com dados fictícios; IPC/foco/a11y e volumes1000/10000×10. Distinga testes puros/harness empacotado/roteiro Windows instalado; gates existentes e D10/a11y/energia herdados não são aprovação nativa. Feche dúvidas materiais antes do apply e documente limites. Valide OpenSpec com CLI suportada, registre/entregue prompt consolidado de apply no roadmap e pare para revisão. Não implemente, execute Setup, publique, arquive, faça merge ou inicie outra Change.
```

### Proposta criada para revisão — 2026-10-06

**Estado na entrega da proposta:** IN_REVIEW/REVIEW; início 2026-10-06, conclusão vazia. `$openspec-propose` solicitado explicitamente com o prompt consolidado anexado. Registrado IN_PROGRESS/PROPOSE antes do scaffold da CLI1.14.0/spec-driven; entregues todos os quatro artefatos requeridos, sem skip_specs. Nenhuma aprovação humana dos artefatos foi inferida e apply não foi iniciado.

**Base e proteção:** fetch atualizou origin/main para `c7dcf845ba82a74e7027e764626decf6e0bfd82c`, merge integrado da TFA-007; árvore de produto igual ao HEAD TFA-007 consultado. Criada branch `codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop` sobre esse merge, preservando a modificação preexistente da exploração neste roadmap. Origem permanece somente leitura. Nenhuma implementação, dependência, teste/build de produto, registro nativo, Setup, commit/push/PR/merge/archive ou Change seguinte foi executado.

**Artefatos:** [proposal](../openspec/changes/migrar-lembretes-e-ciclo-de-vida-desktop/proposal.md), [design](../openspec/changes/migrar-lembretes-e-ciclo-de-vida-desktop/design.md), [deltas de specs](../openspec/changes/migrar-lembretes-e-ciclo-de-vida-desktop/specs/) e [tasks](../openspec/changes/migrar-lembretes-e-ciclo-de-vida-desktop/tasks.md). Dez capacidades: duas novas (`desktop-task-reminders`, `desktop-application-lifecycle`) e oito modificadas (`desktop-foundation`, `desktop-state-ipc`, `desktop-task-management`, `local-task-persistence`, `desktop-task-recurrence`, `desktop-task-undo`, `desktop-task-backup`, `windows-per-user-installation`). São **44 requisitos/122 cenários**, incluindo21 requisitos modificados com todos os cenários antigos conservados. Checklist com **60 tasks**, todas abertas, em onze grupos com verificação/documentação pertinente e campanha de integração.

**Decisões propostas para revisão:** D1–D11 fecham drafts/IDs/markers, graça confirmada e settlement de mutações, índice64MiB/agenda única/correção60s/uma unidade/16 submissões, barreira síncrona afterReleased fora de SQL/onCompleted, hide com unregister e sessão nova, identidade AUMID/CLSID/atalho próprio, tagSHA25664/rota central/relay COM transitório sem storage, seleção por snapshot/ordinal sem teto para IDs, startupv1 no registro Windows como única preferência durável, login default OFF/hidden e catalogue26 (create4/update5, outros contratos conservados). Adapter restrito de registro usa Windows PowerShell já presente, script fixo/UTF-8/limites/sem bypass; não instala runtime/módulo. Não criar tabela/JSON/ledger ou subir SQL2/codec4/backupv1–v4. Garantia limitada a uma tentativa sobre pendência do estado corrente, com perda possível após claim e cancelamento posterior best effort. Semântica já confirmada pelo usuário permanece: recuperar até5min em resume/startup e draft/filtros somente em memória no close.

**Aceitação e riscos:** M01–M12 refinados em specs/tasks; decisões/rebuild/CPU/charge e números novos são propostos para revisão, não aprovados por este registro. Campanha real Windows instalado para notificações/COM/cold/race/tray/logoff/login/upgrade/uninstall/segunda conta é bloqueante quando faltar; harness/build não a substituem. D10/a11y/energia/before-images/diálogo backup herdados permanecem pendentes. Ausência/bloqueio de cadastro nativo informa indisponibilidade sem reset/contorno; mudança de arquitetura/dependency/schema ou limites exige review antes de aplicar.

**Validação de planejamento:** `openspec status` 4/4; Change estrita válida; `openspec validate --all --strict --no-interactive` **12/12**, `--archived --strict --no-interactive` **7/7**, sem falha. Mensagens INFO de requisitos consolidados antigos>500 caracteres são herdadas e não alteradas por conveniência. Diff e referências locais conferidos; essas verificações não atestam funcionamento nativo ou aprovação dos documentos.

### Prompt consolidado para opsx:apply

Prompt entregue para continuidade. **Artefatos aprovados em 2026-10-06 conforme registro abaixo; apply não executado e depende de novo pedido explícito.**

```text
$openspec-apply-change TFA-008 — migrar-lembretes-e-ciclo-de-vida-desktop

Trabalhe somente em C:\QSI\Workspaces\taskflow-app, branch codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop, base integrada TFA-007 c7dcf845ba82a74e7027e764626decf6e0bfd82c. Leia AGENTS.md, roadmap e proposal/design/dez deltas/tasks atuais em openspec/changes/migrar-lembretes-e-ciclo-de-vida-desktop; confira aprovação humana e escopo antes de implementar. Os artefatos foram aprovados explicitamente em2026-10-06, conforme registro humano abaixo; este prompt só inicia apply quando invocado em novo pedido. Preserve os arquivos preexistentes e mantenha C:\QSI\Workspaces\taskflow-extension/Git estritamente somente leitura, sem testes/builds/escritas/configuração. CLI1.14.0/schema spec-driven, 60 tasks inicialmente abertas; marque roadmap IN_PROGRESS/APPLY somente quando apply estiver autorizado.

Implemente somente artefatos aprovados D1–D11/M01–M12. Reutilize recortes revisados de regras/testes/formulário AT/OFFSET/MAX10/presets0/15/60/1440. Clock/IDs novos/claim/markers pertencem ao main; drafts fechados create4/update5, status4/check3/state3/move2/backup1 conservados, catálogo26/cinco wrappers desktop1 com guardas/budgets. Conserve precisão e configuração/markers atuais, erro por item, CAS de edição, portadora única e geração OFFSET com IDs novos/sem marker herdado.

Recupere pendentes ativos tanto em startup/reabertura como resume com trigger<=now<=trigger+300000; acima consuma sem aviso e futuros permaneçam. Não copie liquidação indiscriminada do startup Chrome/D6 antigo. Criação/edição/transição/restore/undo/importação liquidam<=now sem replay; backup nunca usa graça. Revalide tupla exata/clock na execução e antes de submissão, sem tolerância Chrome60s, aviso antecipado ou promessa exactly-once.

Use índice descartável64MiB/agenda única/fallback60s/páginas128/journal/ciclos limitados/uma unidade em voo e16 submissões pendentes, preservando fila e gates existentes. Todos os produtores compartilham StorageCoordinator. Claim durável conserva content/edit/updatedAt e avança global; callback síncrono afterReleased fora da transação/onCompleted submete sem yield/intercalação, com guardas de disponibilidade/epoch/runtime/clock. Falha/crash depois de claim pode perder aviso, sem retry; rollback/incerto não autoriza efeito. Mudança posterior tenta remoção best effort, sem retroagir Windows. Reconcile somente pós-confirmação, incluindo todas as mutações/backup APPLIED/UNCHANGED/empty/storage-recovered; falha externa não reverte commit. Manter SQL2/codec4/backupv1–v4 e autoridade do arquivo, sem ledger/JSON/tabela/dependency nova.

Fechar oculta para bandeja válida, preservando somente draft/filtros em memória; unregister retira admissão e transientes/pedidos/subscriptions antigos são descartados. Abrir reconcilia, cria sessão/snapshot novos e revalida base sem autosave/replay. Minimizar conserva sessão/undo. Tray Abrir/Sair/ícone existente, falha mantém janela visível, quit idempotente antes de close/sem hide; parar claims e fechar storage sem interromper COMMIT. Tratar suspend/resume, renderer crash, segunda instância e logoff Windows conforme design.

Notifier main Electron44.5.1, AUMIDtaskflow.app/nome/CLSID/atalho/metadata HKCU próprios; isolar dev/test e usar fakes por padrão. Adapter de registro restrito Windows PowerShell do SO/script fixo/UTF-8/limites/sem bypass, sem instalar runtime/módulo. TagSHA25664 de tupla canônica, handleActivation rota única, parsing1KiB/estado persistido incluindo processados/ambiguidade recusada, bootstrap sem show e relay COM transitório10s sem storage; não adicionar serviço/helper/socket/inbox. Resolver revision+ordinal sobre snapshot coerente, localizar fora dos filtros e conservar draft, sem mutação/URL/path/shell livre ou navegação dupla. Falhas/logs somente códigos seguros e show não prova exibição.

Startupv1 é a entrada própria Windows/fonte durável, default OFF; opt-in/out explícito em prod instalado, path/args constantes/readback/estado externo respeitado, startup hidden/manual visible. Falhas parciais e resposta perdida exigem releitura sem compensar/reabilitar/replay; upgrade conserva e uninstall remove somente cadastro próprio/ownership preservando dados. Não serviço/tarefa agendada/login obrigatório/acordar PC/snooze/histórico/Quick Add/captura/atalhos009/IA010/redesign/releases/assinatura/auto-update011, nem corrigir pendências herdadas por conveniência.

Execute verificações de cada grupo e M01–M12: fronteiras/races/rollback/crash/markers/backup no-op/close-transientes/quit/IPC/foco/a11y e volumes1000/10000×10 com orçamentos propostos aprovados. Rode npm run validate, OpenSpec estrito/--all/--archived, package:win sem publicação, verify:package e smoke:packaged fictício. M09/M10 exigem provas Windows instalado em conta padrão/autorizada de toast/COM/cold/race/DND/tray/logoff/login/Unicode/upgrade/uninstall/segunda conta; não execute Setup corporativo ou distribuição sem autorização pertinente e não marque tarefa/prova bloqueante concluída se faltar ambiente/autoridade. D10/a11y/energia/before-images/diálogo backup herdados continuam separados; mock/build não provam nativo. Se decisão/schema/dependency/ledger/limite material mudar ou orçamento falhar, revisar artefatos antes desse ponto, continuando trabalho independente autorizado.

Atualize arquitetura/paridade/guias correspondentes quando implementados, mantendo README factual para archive posterior. Ao concluir apply, execute openspec-verify-change e gere verification.md nesta Change com aderência/evidências/pendências; atualize roadmap para revisão e entregue relatório. Pare antes de archive/consolidação/README/commit/push/PR/merge/release/próxima Change até autorização pertinente; relatório exige aprovação humana explícita antes de archive.
```

### Aprovação dos artefatos — 2026-10-06

**Evidência humana nesta conversa:** após ajustar o roadmap, o usuário determinou: **“Ajustei o roadmap. Agora aprove, commit e push”**. O pedido confirma a aprovação explícita de proposal, design, dez deltas de specs e tasks da TFA-008, incluindo decisões D1–D11, critérios M01–M12 e orçamentos propostos. Estado atualizado para **APPROVED/READY_FOR_APPLY**. As **60 tasks permanecem pendentes**, sem início de apply ou conclusão da Change.

A autorização abrange o registro da aprovação, o commit e o push dos artefatos na branch `codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop`. O roadmap ajustado pelo usuário foi preservado, com alterações limitadas ao registro de aprovação e seus resumos. As referências a ausência de aprovação/commit/push na elaboração descrevem o estado histórico da entrega; este registro estabelece a aprovação posterior. Próxima ação: iniciar apply somente mediante novo pedido explícito. Nenhuma implementação, instalação, archive, PR, merge ou distribuição está autorizada por este pedido.

### Apply autorizado — 2026-10-06

Pedido explícito de `$openspec-apply-change` acompanhado do prompt consolidado TFA-008. Aprovação humana dos artefatos conferida no registro acima. Raiz/Git próprios, branch `codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop` e base integrada `c7dcf845ba82a74e7027e764626decf6e0bfd82c` confirmados; árvore inicialmente limpa. OpenSpec 1.14.0/spec-driven, estado ready, 0/60 tasks. Estado **IN_PROGRESS/APPLY**; sem archive, README, commit/push/PR/merge ou avanço de Change. A campanha instalada M09/M10 exige ambiente e autorização pertinentes; testes fictícios não a substituem.

### Continuidade do apply — 2026-10-06

16/60 tasks marcadas; implementação parcial preservada sem commit. Validate: 906 aprovados, 11 ignorados, lint/typechecks/build; OpenSpec estrito Change/--all/--archived aprovado. Package NSIS e verify:package aprovados; smoke e campanha instalada ainda pendentes. O usuário pediu um prompt de continuidade quando restassem 10% do limite; o estado técnico e os próximos passos estão em [continuacao-apply.md](../openspec/changes/migrar-lembretes-e-ciclo-de-vida-desktop/continuacao-apply.md). Não confundir suspensão por limite com conclusão/aprovação do relatório.

## TFA-009 — Quick Add, captura copiada e atalhos

### Aprovação e início do apply — 2026-10-06

O usuário invocou `$openspec-apply-change` com autorização anexada: **“Aprovo proposal.md, design.md, as sete specs delta e tasks.md da TFA-009 apresentados em2026-10-06 e autorizo implementar esta Change conforme esses artefatos.”** A aprovação abrange D1–D11/Q01–Q14; as decisões de Quick Add vazio e URL isolada com título vazio permanecem. Estado atual **IN_PROGRESS/APPLY**. Raiz Git/OpenSpec local, CLI1.14.0/spec-driven, branch `codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais` e HEAD/merge-base `5dd68ff12e20babab5264966e6d3f65bff8a2862` conferidos antes da escrita. Roadmap e artefatos de planejamento preexistentes preservados; início com 0/45 tasks. A extensão permanece somente leitura.

Ao concluir apply, executar verify e entregar relatório nesta Change para aprovação humana. Este pedido proíbe archive/consolidação/README final/commit/push/PR/merge/distribuição ou avanço automático. Campanha instalada e evidência humana dependem do ambiente/autorização correspondentes, sem herdar waivers. O usuário pediu prompt de continuidade para outro modelo quando qualquer janela da conta atingir saldo de 5% ou menos; acompanhar os limites durante o trabalho.

**Slug:** `adaptar-quick-add-captura-e-atalhos-globais`. **Dependências:** TFA-008 integrada; contratos da TFA-003 e gerenciamento da TFA-004. **Estado atual:** READY_FOR_MERGE/ARCHIVE em **2026-10-07**, sem data de integração. Artefatos aprovados em2026-10-06; relatório aprovado e Change arquivada em2026-10-07. **43 tasks executadas e duas dispensadas**,45 encerradas administrativamente. Branch `codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais`, base `5dd68ff12e20babab5264966e6d3f65bff8a2862` (PR #8). Sete deltas consolidados:19 requisitos adicionados/10 modificados,29 requisitos/75 cenários; gates finais16/16 specs e9/9 archives. Os registros de explore/propose/campanha abaixo são históricos; prevalece a aprovação final com dispensas.

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

### Exploração concluída — 2026-10-06

Somente branch e registro da exploração neste roadmap; nenhum diretório, proposal, design, delta ou tasks da TFA-009 foi criado. Nenhum código, dependência, configuração de produto, preferência de atalhos ou clipboard real foi alterado. A leitura da origem foi estritamente passiva, sem executar seus testes/builds ou escrever em seu Git. Nenhum propose/apply/commit/push/PR/merge/instalação/publicação foi iniciado.

**Contexto conferido:** OpenSpec **1.14.0**, raiz local e schema `spec-driven`, nenhuma Change ativa e 13 specs consolidadas. TFA-008 arquivada em `2026-10-06-migrar-lembretes-e-ciclo-de-vida-desktop`, tasks 60/60 e fechamento/integração registrados neste roadmap; seu verification contém revisões históricas seguidas da atualização final, que deve prevalecer na leitura. Foram consultados proposal/design/tasks/verification da dependência, deltas pertinentes e specs atuais de lifecycle, gerenciamento, fundação, estado/IPC e persistência; também os contratos/código e artefatos pertinentes das TFA-003/004. A extensão permanece na revisão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`.

#### Decisões confirmadas nesta exploração

- Captura de links/textos copiados somente por botão ou atalho específico, sem obter título/metadados pela rede, ler abas, navegador embutido, extensão auxiliar ou monitorar clipboard: restrições do pedido e da decisão de produto preexistente.
- O usuário escolheu **“Quick Add vazio + captura com atalho separado (recomendado)”**. A ação QUICK_ADD conserva Ctrl+Shift+K como sugestão; CAPTURE_CLIPBOARD é uma terceira ação independente, inicialmente sem combinação padrão. Abrir Quick Add sem draft anterior começa vazio e não lê o clipboard; reabrir draft existente deve preservá-lo (recomendação abaixo), sem interpretar “vazio” como autorização para apagar preenchimento.
- Para uma URL isolada, o usuário escolheu **“Origem preenchida e título vazio (recomendado)”**. O foco vai ao título, cuja validação obrigatória continua; nenhum título de página é inventado ou obtido automaticamente. Uma captura pendente não apaga título digitado anteriormente.

As demais escolhas abaixo são **recomendações para revisão no propose**, não aprovação dos futuros artefatos. Questões respondidas durante explore não autorizam apply.

#### Achados com referências e implicações

| Evidência | Achado verificado | Implicação para o propose |
| --- | --- | --- |
| [QuickAdd.vue da origem](C:/QSI/Workspaces/taskflow-extension/src/components/quick-add/QuickAdd.vue:23), [submit](C:/QSI/Workspaces/taskflow-extension/src/components/quick-add/QuickAdd.vue:52) e [capture](C:/QSI/Workspaces/taskflow-extension/src/components/quick-add/QuickAdd.vue:91) | Form compacto tem título/prazo/pessoas/prioridade/origem; não tem descrição. Captura preserva título preenchido, mas substitui origem sem revisão. Sucesso limpa form; erro mantém inputs. | Reutilizar UX/CSS/validação selecionados; acrescentar descrição revisável quando a captura longa a produzir e ação explícita Adicionar origem para texto. Não copiar substituição silenciosa de sourceUrl. Usar createTask existente, defaults TODO/MEDIUM e confirmação/snapshot/resultado incerto do desktop. |
| [application/page-capture.ts](C:/QSI/Workspaces/taskflow-extension/src/application/page-capture.ts:22) | ActivePageReader exige título/URL de aba; faltantes viram unavailable. buildMenuCapture depende de contexto Chrome. | Substituir por porta ClipboardTextReader e classificação URL/texto. Não emular ActivePageReader nem copiar menus/windowId/permissões Chrome. |
| [domain/page-capture.ts](C:/QSI/Workspaces/taskflow-extension/src/domain/page-capture.ts:23) e [testes](C:/QSI/Workspaces/taskflow-extension/tests/domain/page-capture.test.ts:1) | Colapsa whitespace para título; limite200; seleção longa gera descrição com trim externo e quebras internas, até4000; ellipsis recua diante de par substituto. Descrição depende do comprimento normalizado, não só do texto bruto. | Reusar funções puras revisadas e testar fronteiras UTF-16/emojis/multilinha. Informar cortes; não anunciar captura integral de texto maior que4000. Para texto normalizado<=200 conservar paridade: somente título. |
| [TTL/inbox](C:/QSI/Workspaces/taskflow-extension/src/domain/page-capture.ts:78), [adapter](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-pending-capture-inbox.ts:63) e [use-pending-capture.ts](C:/QSI/Workspaces/taskflow-extension/src/components/capture/use-pending-capture.ts:20) | Uma captura nova substitui a anterior; take consome/remove storage.session antes de guardar no componente. Composable chama browser.windows; read/remove separados não constituem consumo atômico. TTL10min vale antes de apresentar; held não expira no painel aberto. | Inbox em memória sob main com destino/ID/seq e entrega/ack de apresentação ligados ao documento. Evitar take destrutivo antes da confirmação de entrega, dois consumidores e resposta tardia; não transportar browser/windows/storage.session. |
| [TaskManager da origem](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:105), [reviewCapture](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:212) e [ações do aviso](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:561) | Idle abre criação capturada. Durante form/backup/trash/confirmação fica aviso; Revisar é oferecido depois de voltar à lista. Chamar reviewCapture fora desse gate substituiria o editor. | Conservar aviso/Descartar e revisão segura; não habilitar revisão destrutiva em editor, save/ack incerto, conflito, confirmação, backup ou localização de lembrete. Voltar à lista não aplica captura automaticamente. |
| [keyboard-shortcuts.ts](C:/QSI/Workspaces/taskflow-extension/src/application/keyboard-shortcuts.ts:1), [reader](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-shortcuts-reader.ts:21) e [manifest](C:/QSI/Workspaces/taskflow-extension/wxt.config.ts:18) | Duas ações; combinações efetivas vêm do navegador, sem usar sugestão como fallback visual. A spec da origem proíbe global; K/L são sugestões. | Adaptação deliberada: três ações globais no desktop, configuração no app, requested/registered/error separados e Sem atalho explícito. Não copiar chrome://extensions/shortcuts nem declarar que a origem já tinha hotkeys globais. |
| [main atual](../src/main/index.ts:198), [withdraw](../src/main/index.ts:206) e [DesktopLifecycle](../src/main/desktop/lifecycle.ts:1) | Lifecycle controla uma mainWindow; withdraw remove sessões de todas as BrowserWindows. Tray/segunda instância/COM usam a mesma rota principal. | Janela Quick Add própria requer lifecycle por superfície, cancelamento só do owner alvo e eventos de controle destinados ao documento correto. Suspend/Sair permanecem globais; um coordenador/banco/scheduler/owner. Não ligar ambas as janelas indiscriminadamente ao lifecycle atual. |
| [TaskForm desktop](../src/renderer/src/components/tasks/TaskForm.vue:45), [store](../src/renderer/src/stores/tasks.ts:1059), [sessões](../src/main/ipc/document-sessions.ts:81) e [opener](../src/application/tasks/source-url.ts:24) | Form recebe task, não initial-draft; store e preload têm epochs/suspensão; manager observa lastConfirmed da própria sessão. Origem salva abre só por HTTP/HTTPS sem userinfo/controles, href<=2081. | Adicionar inicialização de captura somente à criação livre; separar store/ack por janela e preservar editRevision do manager. Sem abrir draft ou alterar limite histórico de armazenamento por conveniência. Ampliar catálogo/roles coerentemente; não expor clipboard bruto, canais ou URLs livres. |
| [clipboard Electron44.5.1](https://raw.githubusercontent.com/electron/electron/v44.5.1/docs/api/clipboard.md) e electron.d.ts local:7035 | readText retorna **Promise<string>**, no main. | Leitura sob gesto, única em voo/espera finita e resultado guardado por época/sessão/intenção. Fechar/reload/quit invalida resultado tardio; não repetir leitura automaticamente. Esta exploração não leu o clipboard do usuário. |
| [globalShortcut Electron44.5.1](https://raw.githubusercontent.com/electron/electron/v44.5.1/docs/api/global-shortcut.md) e tipos locais:8626–8678 | register retorna boolean, conflito falha sem identificar aplicativo dono. isRegistered só informa registro deste processo; setSuspended existe e registro novo falha enquanto suspenso. | Registrar individualmente após ready/ownership; informar Indisponível sem atribuir culpa a um app. Não usar registerAll como confirmação por ação. Planejar captura de combinação/suspensão e restauração sem perder hotkeys; validar no Windows instalado. |

#### Mapeamento recomendado de clipboard para rascunho

| Entrada sob gesto explícito | Resultado proposto |
| --- | --- |
| URL inteira HTTP/HTTPS, com espaços apenas nas extremidades | sourceUrl editável/removível, título vazio confirmado, foco no título. Parse local; nenhuma requisição, abertura ou favicon. URL não é truncada nem extraída de um parágrafo. |
| Texto não vazio normalizado<=200 UTF-16 | Somente título normalizado; sem origem inferida. Botão Adicionar origem permite digitar/colar HTTP/HTTPS opcional, editável/removível. |
| Texto normalizado>200 | Título até200 com ellipsis; descrição original com trim externo/linhas preservadas até4000. Descrição visível e editável no Quick Add; indicar truncamento quando houver. |
| Texto com URL no meio, vários links ou www.exemplo sem esquema | Texto literal conforme limites; não inventar https, remover linhas, escolher link ou inferir origem. Associação manual é opção do usuário. |
| Clipboard vazio, só whitespace ou sem text/plain utilizável | Código/mensagem segura distinta de erro de leitura; nenhum draft/captura pendente anterior é apagado e nada é salvo. Não ler imagem/HTML/RTF/bookmark/SourceURL nem tentar OCR. |
| Token inteiro com esquema recusado ou candidato HTTP/HTTPS malformado | Feedback de URL inválida/não suportada; preservar form e captura anterior. Refinar distinção lexical para texto comum contendo dois-pontos, sem classificar frase como protocolo. |
| URL com userinfo/controles, origem opcional inválida ou conteúdo além do budget | Recusa ou erro no campo, sem reproduzir segredo na mensagem/log e sem cortar URL para fazê-la caber. Política de novos drafts deve ser explicitada; não revalidar/apagar origens históricas. |

Não há informação confiável da página original em text/plain; URL associada ao texto é explícita. Não ler metadados HTML/SourceURL para preencher origem sem uma nova decisão. A normalização de URL deve preservar query/fragmento/dados sem rewrite arbitrário e informar eventual canonicalização escolhida. URLs salvas>2081 continuam sujeitas ao opener existente; não abrir a origem durante revisão nem impor2081 como novo limite de codec.

#### Alternativas, recomendação e comportamento das superfícies

| Tema | Alternativas e recomendação justificada |
| --- | --- |
| Quick Add | **Preferir uma janela compacta singleton própria**, mantendo manager montado. Sobreposição na mesma janela economiza renderer, mas exige preservar/montar dois forms e modal/foco; navegar desmontando manager perderia draft/áreas. Segunda janela usa um pouco mais de memória e exige roles/lifecycle, já necessários à paridade de superfícies. Sem always-on-top por padrão ou segunda instância/writer. |
| Captura global | **Sempre destinar ao Quick Add singleton**; botão do manager destina à própria superfície. Roteamento pela janela externa em foco é ambíguo e não fornece origem de browser; evitar escolher tarefa/editor corrente arbitrariamente. Button/hotkey entram no mesmo caso de uso portável. |
| Reabrir/criar | QUICK_ADD só restaura/foca draft existente; estado inicial vazio apenas quando não há draft. OPEN_TASK_MANAGER restaura principal mantendo form, filtros, ordenação, scroll e área, sem reset/listagem forçada. Abrir gerenciamento pelo Quick Add conserva o draft rápido e também o manager. |
| Aplicar captura | Em criação vazia/idle, apresentar draft para revisão. Com qualquer input modificado (inclusive só prioridade/prazo/origem), manter form e oferecer captura pendente. No manager, operações em curso impedem revisão até retorno seguro. Recomendar uma pendência por destino, mais nova substitui somente a pendência com aviso; nunca o draft ativo. Sem fila/histórico ilimitados ou merge automático de campos. |
| Entrega e retenção | Main mantém pendência não apresentada por10min monotônicos desta execução; apresentação exige sessão/ack exatos e só então muda para held, sem expiração enquanto mantida nesta execução. Close/hide preserva draft/held em memória, invalida leitura/entrega em curso e autoridade; crash/reload/Sair não prometem recuperação. Refinar entrega idempotente, expiração antes de ack, corrida com nova captura e destino destruído no design. |
| Foco | Primeira abertura/tarefa rápida nova foca título; restauração conserva último campo válido. Aviso pendente por botão não rouba foco; atalho de captura mostra/restaura Quick Add e foca destino pertinente/aviso. Manager preserva último foco seguro e usa fallback se controle sumiu. Repeated keydown não zera draft nem abre várias janelas. Falha de concessão de foco Windows deve ter indicação visível ao abrir, sem prometer foco garantido ou bypass. |

Fluxo candidato:

```text
Botao / CAPTURE_CLIPBOARD --> main: gesto + destino + epoca
                                      |
                                      v
                              readText() uma vez
                                      |
                                      v
                             classificar + mapear
                                      |
                  +-------------------+-------------------+
                  v                                       v
          superficie livre                        draft/operacao ativa
          apresentar + ack                        manter captura pendente
                  |                                       |
                  +------------------+--------------------+
                                     v
                         usuario revisa / descarta
                                     |
                                     v
                       salvar explicito --> createTask
```

#### Atalhos personalizáveis e persistência candidatos

- Ações fechadas: QUICK_ADD (sugestão Ctrl+Shift+K), OPEN_TASK_MANAGER (Ctrl+Shift+L), CAPTURE_CLIPBOARD (sem padrão, confirmado). Botões/ícone/tray e configuração continuam acessíveis sem hotkey. Atalhos só funcionam com processo owner rodando; não lançar serviço/startup obrigatório para fazê-los funcionar após Sair.
- Preferir editor acessível de modificadores/tecla com allowlist e remoção explícita; evita keylogger e captura irrestrita do teclado. Definir canonicalização, duplicatas entre ações, teclas Windows/reservadas e AltGr no propose. Recomendar combinações com modificadores suficientes e excluir Ctrl+Alt/AltGr, tecla isolada e atalhos comuns de edição; não prometer detectar todas as reservas do Windows.
- Registrar após ready; manter no tray, gatear ações durante suspend/quit e edição da combinação; reavaliar registro na retomada. Profiles dev/test não devem tomar hotkeys de prod automaticamente; teste nativo isolado deve ser opt-in e não interferir com registro real. Unregister no quit e limpeza idempotente, sem polling/retries silenciosos de conflito.
- UI distingue requested, effective/registered, Sem atalho, Indisponível e estado incerto. Conflito inicial não bloqueia app; reconfiguração falhada conserva combinação anterior quando ainda confirmada, com feedback. isRegistered=false não comprova dono externo nem lista reserva de todos os apps. Restore de default é gesto explícito, não fallback após erro.
- **Recomendar arquivo de preferências pequeno e versionado próprio no userData do perfil**, fora de backup, em vez de migrar SQL2 só por três combinações. Alternativas: tabela SQLite transacional usa storage existente mas altera schema/downgrade/revisão; HKCU acrescenta adapter de registro sem necessidade de integração Windows equivalente ao startup. Fechar mecanismo no propose: writer main único, limite/shape/versão/CAS de config entre janelas, temporário exclusivo/flush/substituição/readback e arquivos incompatíveis preservados. Não alegar que rename/flush sozinho prova durabilidade Windows.
- Registro nativo e gravação de preferência não são uma transação: para editar uma ação, validar/rejeitar colisão interna, tentar combinação nova antes de liberar antiga, persistir escolha e só então liberar antiga; callback provisório deve ficar inativo. Falha de escrita remove novo registro próprio e conserva anterior quando verificável; efeito incerto exige releitura/status observado, sem sucesso/rollback/replay inventados. Desabilitar precisa de ordem explícita equivalente. Troca cruzada de duas ações requer remover primeiro ou procedimento revisado; não implementá-la ad hoc. Startup tenta a escolha persistida, sem gravar combinação substituta porque ela estava ocupada.
- Budgets a fechar: leitura nativa assíncrona com deadline (candidato5s), uma leitura global em voo sem backlog de teclas; limite bruto candidato1MiB e draft/IPC até64KiB UTF-8 incluindo JSON/escaping. O limite bruto é aferido **depois** de readText resolver: não impede alocação nativa prévia. Deadline descarta resultado tardio, sem alegar cancelar leitura do SO. Eventos de controle atuais<=1KiB devem transportar ID/seq, não texto4k; conteúdo vai por wrapper/resposta fechado com budget próprio. Medir e revisar sem truncar URL ou mudar limits de Task.

#### Escopo, exclusões, dúvidas materiais e riscos

**Escopo proposto:** Quick Add compacto singleton; captura explícita text/plain por botão/atalho próprio; rascunho revisável com descrição e origem opcionais; pending/held por destino sem sobrescrita; foco e preservação do manager; três ações globais configuráveis, estados efetivos/conflitos/preferências; portas portáveis, handlers/main/preload/IPC fechado e testes/guides/paridade pertinentes.

**Exclusões:** nenhuma captura de aba/página automaticamente, navegador embutido/auxiliar, extensão, rede/fetch/favicon, polling/clipboard history, HTML/RTF/SourceURL/OCR/arquivos, salvamento automático/merge de campos, persistência de drafts/capturas após Sair/crash, IA/redesign/dashboard/backend/sync/serviço/hook de teclado livre, troca de stack/runtime/dependências/instalador, nova versão de Task/backup, release/instalação corporativa ou TFA-010+. Não resolver pendências de acessibilidade humana/energia/backup por expansão implícita.

**Dúvidas materiais a fechar no propose:** (1) aprovar singleton separado, destino global fixo e descrição no Quick Add; (2) fechar dirty/review/held/TTL/ack, substituição de pending e foco, incluindo hide/reload/falha de abertura; (3) gramática e política de URL inválida/userinfo/controles/canonicalização e associação manual de origem; (4) allowlist/editor/defaults/registro por profile e mudanças cruzadas; (5) persistência versionada e ordens de efeitos Windows/arquivo, CAS/readback/compatibilidade/downgrade; (6) catálogo e roles por superfície, budgets/deadline/coalescimento/medidas. Título de URL e separação Quick Add/captura já foram decididos pelo usuário; não reabrir como fatos desconhecidos. Recomendações técnicas ainda passam pela revisão dos artefatos.

**Riscos principais:** withdraw global desautoriza janela errada; ack de Quick Add fecha form do manager se store compartilhado; captura assíncrona sobrescreve estado posterior; take/read/remove perde captura antes de entrega; conflito nativo/arquivo produz configuração divergente; preferências futuras corrompidas causam reset; atalho toma combinação usada pela extensão/outro app; clipboard grande aloca antes do guard; foco Windows não é garantido; texto/url pode conter dados sensíveis. Mitigar com roles/épocas/seq/ack fechado, stores por documento, CAS por config, efeitos observados, budgets e logs só códigos/métricas. Não ler clipboard real nem registrar hotkeys durante explore.

#### Critérios de aceitação e testes candidatos Q01–Q14

| ID | Caso e oráculo propostos para refinamento |
| --- | --- |
| Q01 | QUICK_ADD, OPEN_TASK_MANAGER, startup/foco/poll de estado não leem clipboard; cada gesto CAPTURE chama readText uma vez, sem rede/auto-open/save/HTML. Vazio/whitespace/imagem/erro preservam todos os inputs/pending anteriores. |
| Q02 | URL isolada HTTP/HTTPS põe origem/título vazio e exige título para salvar. Testar scheme/host/IPv6/Unicode/query/hash/trim, protocolos recusados, malformada/userinfo/controles, URL longa e texto com links/dois-pontos, sem adivinhar origem. |
| Q03 | Texto curto/200/201/4000/4001, multiline/tab/CRLF/Unicode e surrogate no corte: título normalizado, descrição só quando normalizado>200, cortes anunciados e texto tratado literalmente, nunca HTML. Origem manual opcional/removível e erro mantêm draft. |
| Q04 | Quick Add mínimo/completo/captura longa: defaults e campos revisáveis, submit único, validação main, foco no primeiro erro, ack+snapshot antes de reset. Falha/commit incerto conserva inputs, não há retry/recriação automática. Reopen confirma tarefa íntegra. |
| Q05 | Abrir Quick Add/manager repetidamente com ambos abertos/ocultos/minimizados: uma janela de cada, filtros/sort/scroll/área/draft/editRevision intactos. Criação rápida não dispara lastConfirmed/closeForm na sessão do manager; atualização de lista converge sem perder draft. |
| Q06 | Captura durante criação/edição/conflito/save/ack incerto/SKIP/END/delete/trash/backup/dialog/consulta de lembrete: nenhuma substituição ou foco indevido; aviso/Descartar e Revisar só no estado seguro. Captura nova substitui só pending com aviso, sem fila ilimitada. |
| Q07 | Inbox/entrega com relógio monotônico/barreiras: TTL10min antes de apresentar, held sem expiry na execução, ack por ID/seq/doc, evento perdido/duplicado/reordenado, captura nova durante await, hide/reload/crash/destino destruído. Não entregar ao documento errado nem consumir antes de apresentação confirmada. |
| Q08 | Customizar/remover/restaurar default e restart: canonicalização/duplicata interna/AltGr/reservadas, requested versus registered, registro false/throw, rebind falhado, conflito no próximo startup, preferências incompatíveis e CAS de dois clientes. App continua utilizável sem atalho. |
| Q09 | Falhas de preferências e registro: disco/permissão/temp/flush/substituição/readback/resultado incerto em cada fase, nenhum reset de versão futura nem perda silenciosa da configuração antiga; backup/importação não carregam ou substituem atalhos. |
| Q10 | Lifecycle de duas superfícies: fechar só Quick Add/manager retira somente sessão alvo e conserva memória; minimize/foco não invalidam; suspend/quit retiram todas, invalidam leituras e liberam registros. Tray/segunda instância/COM continuam um writer e clique de lembrete localiza no manager. |
| Q11 | IPC negativo antes de efeitos: role/frame/origem/URL/versão/extras/tipos/bytes/sessão oculta/captura ou ack alheio; não ler clipboard/registrar/salvar/abrir janela antes do guard. Saídas/events validados, renderer sem Node/fs/IPC livre; nenhum conteúdo em logs/backups. |
| Q12 | Teclado/foco acessível: Enter/Escape/Tab, busy focável, retorno de foco entre janelas, IME/AltGr/layouts, 360px/zoom200/DPI/leitor de tela. Roteiro humano Windows é evidência separada de testes Vue/snapshots. |
| Q13 | No **produto Windows empacotado/instalado autorizado**: hotkey com outro app em foco e tray/hidden, conflito real, customização/restart/liberação após Sair, clipboard fictício URL/texto/vazio e rota sem admin/serviço. Mock/build/renderer smoke não provam registro global/foco/clipboard nativo; não interferir na extensão/prod durante harness. |
| Q14 | Gates npm/OpenSpec/pacote/bridge e regressão de lembretes/COM/backup/undo. Medir duas superfícies, read grande/coalescimento/latência/heap e budgets novos; preservar D10 revisado da TFA-008 (1000:500/250ms/2s;10000:2500/2500ms/8s), sem reduzir dados ou relaxar gates em silêncio. |

**Verificação desta exploração:** Node24.21.0/npm11.21.0 preexistentes em runtime temporário da TFA-002; shell global22/10 não usado para gates. `npm run validate` passou: lint, cinco typechecks, **73 arquivos/935 testes aprovados +11 skipped**, `test:volume` **1 arquivo/2 testes**, build main/preload/renderer (log local ignorado `.tmp/tfa009-explore-validate.log`). Rebuild1000/10000×10 de lembretes72,59/601,62ms, SQLp9510,27/6,93ms; são regressão da base, não medição de clipboard/hotkeys. `openspec validate --all --strict --no-interactive --json`: **13/13 specs**; `--archived`: **8/8 Changes**, apenas INFOs preexistentes de texto longo nas specs. Não houve novo package/smoke/Setup, testes da extensão, leitura de clipboard ou registro de atalhos. Q01–Q14 continuam planejados, não executados como funcionalidade TFA-009.

### Prompt consolidado para opsx:propose

Pronto para novo pedido explícito. Este registro não cria Change, aprova artefatos ou inicia implementação.

```text
$openspec-propose TFA-009 — adaptar-quick-add-captura-e-atalhos-globais

Trabalhe somente em C:\QSI\Workspaces\taskflow-app e reutilize codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais, criada antes do explore sobre main5dd68ff12e20babab5264966e6d3f65bff8a2862 (PR#8 integrado). Confira raiz/branch/diff/base e preserve alterações preexistentes. Leia AGENTS.md, docs/roadmap.md (exploração TFA-009 de2026-10-06, decisões, dúvidas/Q01–Q14), artefatos arquivados da TFA-008 e contratos/specs/código pertinentes das TFA-003/004. Extensão C:\QSI\Workspaces\taskflow-extension/Git estritamente somente leitura, referência a763e7a0d646c664ecd4f979528bc2c3589fa8c4; sem editar/buildar/testar/instalar/alterar configurações ou Git ali.

Crie somente proposal/design/specs/tasks desta Change pela CLI/schema existentes (consulta1.14.0/spec-driven), scaffold pela CLI. Antes registre IN_PROGRESS/PROPOSE/data de início; ao entregar IN_REVIEW/REVIEW, sem aprovação inferida. Consulte QuickAdd.vue, application/page-capture.ts, keyboard-shortcuts.ts, domain/page-capture.ts, use-pending-capture.ts e testes/specs da origem. Refine alternativas e feche decisões materiais nos artefatos para revisão humana, sem implementá-las agora.

Decisões humanas confirmadas: QUICK_ADD vazio sem leitura de clipboard, captura com ação/atalho independente inicialmente sem combinação padrão; URL isolada preenche sourceUrl editável/removível e deixa título vazio para nome manual/foco no título. K/L continuam sugestões de Quick Add/gerenciamento sujeitas a registro real. Reabrir draft existente não o apaga. Captura somente links/textos copiados por gesto, sem abas/browser auxiliar/fetch/título/favicon/rede/polling. Não reabrir essas duas decisões como dúvidas.

Proponha singleton compacto Quick Add separado do manager, um owner/coordenador/storage/scheduler. Preserve filtros/sort/scroll/form/área/base/foco do manager ao abrir/reabrir; criação rápida e seus acks não fecham editor alheio. Defina lifecycle/roles/sessões/eventos por superfície, pois withdraw atual remove todas as janelas: close individual não desautoriza a outra; suspend/Sair seguem globais, bandeja/COM/segunda instância mantêm rota do manager. Memória transitória até saída/crash, sem autosave/replay. Refinar descrição revisável no Quick Add e associação de origem manual/opcional ao texto.

Mapeie text/plain com funções puras revisadas: título normalizado<=200 UTF-16, descrição com trim externo/linhas preservadas<=4000 somente quando normalizado>200; ellipsis sem surrogate órfão e aviso de corte. Texto com URL dentro continua texto, sem origem inferida. Vazio/whitespace/formato sem texto/erro preservam draft e pending anteriores. Feche gramática URL/texto, HTTP/HTTPS inteiro, userinfo/controles/malformados/canonicalização/URL longa e associação manual, sem truncar URL ou mudar limites históricos de armazenamento/abertura salva. Não ler HTML/RTF/bookmark/SourceURL/OCR/arquivos.

Electron44.5.1 local tem clipboard.readText():Promise<string>; leitura main por gesto, uma em voo/espera finita, épocas/sessão/destino/seq impedem resultado tardio/fora de ordem. Recomende destino global Quick Add e botão local à própria janela; uma pendência por destino, nova substitui só pending com aviso. Form dirty (qualquer campo), edição/confirmação/backup/conflito/ack incerto/consulta de lembrete nunca é substituído: Revisar somente no estado seguro e Descarta não salva. Feche inbox/ack idempotente/TTL10min antes da apresentação, held sem expiry na execução, perdas/races/hide/reload/crash/abertura falhada e foco; main não consome antes de entrega confirmada nem envia texto ao documento errado.

Atalhos main globalShortcut após ready/ownership: três ações fechadas, requested/registered/sem atalho/indisponível/incerto, register individual/false/throw e isRegistered só próprio processo. Personalizar/remover/restaurar defaults com teclado/allowlist/canonicalização/duplicatas/reservadas/AltGr. Conflito não bloqueia app nem identifica aplicativo dono; manter caminhos por botão/tray. Gates em suspend/quit/edição de combinação; liberar ao Sair. Dev/test não tomam hotkeys prod automaticamente e harness nativo é opt-in isolado.

Compare preferências versionadas próprias no userData (recomendadas para não migrar SQL2 por três combos), tabela SQLite e HKCU. Feche fonte de verdade, shape/versão/limite/CAS entre clientes/durabilidade/readback/futuro/corrupto/downgrade/retention, fora de backup. Windows+preferência não são transação: defina ordem de register provisório/persistir/liberar antigo, disable, compensação verificável e estado incerto/sem replay; falha não apaga combinação anterior nem sobrescreve arquivo incompatível. Mudança de schema/dependência precisa estar explícita e justificada na revisão, sem fallback no apply.

Projete wrappers finitos/versionados, schemas/erros/bytes/roles validados main/preload/renderer e remetente/frame/origem/URL/documento/sessão antes de efeitos/entrega. Só drafts mapeados/resumos/IDs/seq; sem clipboard bruto/canal/URL/path/accelerator nativo irrestritos. Evento controle1KiB não pode carregar descrição4k: usar referência e resposta com budget próprio. Refine candidatos raw1MiB (limite após alocação de readText), deadline5s, request/draft64KiB UTF-8 JSON completo, coalescimento/memória/foco; não prometer cancelamento nativo ou foco garantido.

Especifique Q01–Q14 com domínio/componentes/IPC/barreiras/faults/perfil fictício e Windows real: URL/texto/limites/Unicode/vazio, dirty/pending/seq/ack/TTL, duas superfícies/concorrência/late ack/resultado incerto, prefs conflitantes/readback/incompatíveis/rebind/quit, registro global real com outro app/tray/conflict/restart, foco/teclado/zoom200/DPI/leitor de tela. Gates existentes e OpenSpec estrito; pacote/smoke/Setup/hotkeys reais apenas no apply com ambiente/autorização correspondentes. Manter D10 revisado TFA-008 e pendências herdadas, sem dizer que build/mocks provam Windows.

Exclua browser/extension auxiliar/abas/fetch/polling/clipboard history/HTML/OCR, save automático/merge de drafts/draft persistido após Sair/crash, IA/redesign/dashboard/backend/sync/serviço/hook livre, troca de stack/runtime/dependências/instalador/releases/instalação corporativa e outras Changes. Entregue artefatos para revisão, registre/entregue prompt de apply no roadmap e pare: sem apply/verify de implementação/archive/commit/push/PR/merge/publicação ou TFA-010 automaticamente.
```

### Propose concluído para revisão — 2026-10-06

Pedido explícito `$openspec-propose` com o prompt da exploração anexado. A etapa passou por IN_PROGRESS/PROPOSE/data de início antes do scaffold. Raiz/branch/base/diff conferidos; exploração preexistente preservada. Change criada pela CLI1.14.0/schema spec-driven em `openspec/changes/adaptar-quick-add-captura-e-atalhos-globais`, na branch própria já existente. Este registro não aprova os artefatos nem autoriza implementação.

**Artefatos:** [proposal.md](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/proposal.md), [design.md](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/design.md), [tasks.md](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/tasks.md) (**0/45**) e sete deltas:

- Novos: [desktop-quick-add](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-quick-add/spec.md), [desktop-clipboard-capture](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-clipboard-capture/spec.md), [desktop-global-shortcuts](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-global-shortcuts/spec.md).
- Modificados, com blocos completos e cenários preexistentes conservados: [desktop-foundation](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-foundation/spec.md), [desktop-state-ipc](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-state-ipc/spec.md), [desktop-task-management](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-task-management/spec.md), [desktop-application-lifecycle](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/specs/desktop-application-lifecycle/spec.md).

**Decisões propostas para revisão:** D1–D11 no design fecham janela Quick Add singleton independente, lifecycle/roles por superfície sob owner/writer/scheduler únicos; descrição revisável/origem manual; gramática URL/texto; uma leitura física com timeout lógico5s/raw1MiB pós-alocação; um slot staged/held por destino com TTL10min até apresentação, ID/seq/ack/recibo e revisão segura; três ações com allowlist/CAS/registro observado; arquivo próprio version1/8KiB com publicação/readback/previous e rebind verificável/UNKNOWN. Catálogo manager35/QuickAdd14 com nove wrappers novosv1, status/controle desktopv2, requests novos1KiB/results8KiB/draft64KiB/eventos1KiB. SQL2/codec4/backupv1–v4/runtime/dependências preservados. A operação adicional setShortcutEditing fecha o gate de edição sem emular teclas ou ampliar IPC livre. Incerteza de publicação bloqueia todos os setters; incerteza somente nativa bloqueia a ação afetada. Nenhuma decisão material fica escondida para o apply; questões ambientais/copy de erro são deferráveis com limites explícitos.

**Decisões humanas conservadas:** abrir Quick Add vazio sem leitura automática e captura com ação independente inicialmente sem combo; URL isolada com origem preenchida/título vazio/foco no título. Confirmar essas escolhas no explore não equivale a aprovar os demais artefatos.

**Verificações do propose:** `openspec status` 4/4 artefatos; Change estrita válida; `--all --strict --no-interactive --json`14/14 (13 specs atuais+1 Change); `--archived`8/8, apenas INFOs preexistentes nas specs. `npm run validate` com Node24.21.0/npm11.21.0 preexistentes: lint, cinco typechecks,73 arquivos/935 aprovados+11 skipped, volume1arquivo/2testes e build main/preload/renderer aprovados. Log local ignorado `.tmp/tfa009-propose-validate.log`. `git diff --check` aprovado. São gates da base inalterada e validação do planejamento, não prova da implementação futura. Sem novo package/smoke/Setup, leitura de clipboard ou registro de hotkeys nesta etapa; Q01–Q14 e campanha humana/nativa permanecem pendentes. Nenhum código/README/configuração de produto/dependência/spec consolidada foi editado; apenas artefatos de planejamento/roadmap e outputs ignorados dos gates no projeto destino. Extensão não recebeu escrita/comandos de build/testes/configuração/Git. Sem commit/push/PR/merge/archive/propose de outra Change.

### Prompt consolidado para opsx:apply

Usar **somente depois de revisar e aprovar explicitamente** os artefatos acima. O texto abaixo é modelo para uma nova mensagem humana; sua presença no roadmap não é aprovação nem início de apply. Ajustar o pedido se houver mudanças materiais antes de autorizar.

```text
$openspec-apply-change TFA-009 — adaptar-quick-add-captura-e-atalhos-globais

Aprovo proposal.md, design.md, as sete specs delta e tasks.md da TFA-009 apresentados em2026-10-06 e autorizo implementar esta Change conforme esses artefatos.

Trabalhe somente em C:\QSI\Workspaces\taskflow-app. Reutilize codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais, base5dd68ff12e20babab5264966e6d3f65bff8a2862; confira raiz/branch/diff/base e preserve trabalho preexistente. Leia AGENTS.md e docs/roadmap.md integralmente, especialmente exploração e propose TFA-009; leia proposal/design/sete deltas/tasks reais em openspec/changes/adaptar-quick-add-captura-e-atalhos-globais, dependências arquivadas TFA-008 e contratos/specs TFA-003/004. Use CLI1.14.0/schema spec-driven/raiz resolvida. Registre estágio/datas reais de apply; 45 tasks começam não concluídas.

Extensão C:\QSI\Workspaces\taskflow-extension e seu Git estritamente somente leitura, referênciaa763e7a0d646c664ecd4f979528bc2c3589fa8c4. Reutilize apenas funções/UX/testes portáveis necessários e revisados por cópia para o app; nunca execute ferramentas de build/testes/install/escrita/Git/configuração na origem. Sem copiar .git/.env/dados/credenciais/node_modules/builds.

Implemente D1–D11 sem fallback material: duas janelas singleton manager/Quick Add, Vue/Pinia e state client por documento, role atribuído pelo main, um owner/writer/coordenador SQL/scheduler. Preserve form/base/editRevision/filtros/sort/scroll/área/foco do manager e ack próprio por janela. Quick Add compacto com campos básicos/descrição/origem revisáveis e createTaskv4 existente; defaults TODO/MEDIUM, limpar só sucesso confirmado próprio, erro/unknown conserva e não reenvia. QUICK_ADD sem draft abre vazio e não lê clipboard; reabertura conserva. URL isolada preenche origem inteira/título vazio obrigatório e foca título. Não reabrir essas decisões como dúvidas.

Close individual retira somente sessão/jobs da janela alvo e conserva draft/held em memória; minimize/foco não invalidam; suspend/resume/Sair/logoff globais seguem D3/TFA-008. Tray com abrir manager/Quick Add/capturar/Sair; COM/segunda instância/notificação continuam manager. Sem tray, manter janela visível ou saída segura da última. Reload/crash/Sair não recuperam draft/held nem repetem escrita; sessão nova ressincroniza/base revalidada sem ack herdado.

Captura somente text/plain por gesto, global/tray destino Quick Add e botão destino próprio. Gramática D4 inteira HTTP/HTTPS host/:// sem userinfo/controles, candidatos proibidos/malformados recusados, canonicalização do parser sem completar/cortar URL. Texto com URL/whitespace interno continua texto sem origem inferida; origem manual/opcional validada/removível. Título normalizado<=200UTF-16; descrição raw.trim() com linhas internas<=4000 somente se normalizado>200; ellipsis sem surrogate órfão, flags/cortes informados, substituto órfão inválido. URL>2081 inteira não altera codec e explica política existente de abrir origem salva; nenhum fetch/preview/draft opener.

readText é Promise no Electron44.5.1: uma leitura física em voo, novos gestosBUSY, deadline lógico5s invalida tardio mas não libera gate físico até Promise terminar; se travar exige restart. Raw1MiB após alocação nativa, sem logs/raw IPC. Epoch/session/role/seq antes/depois de await; vazio/whitespace/sem texto/throw/limite/timeout mantém active/pending. Dois slots main mapeados64KiB no máximo, sem history/polling.

Inbox D6: staged TTL600000ms monotônico desde captura válida, presented confirma apresentação e passa a held sem expiry na execução, applied/discard por ID/seq/documento com recibo limitado e idempotência. get/envio não consome nem renova TTL. Late/superseded ack não retira substituta. Após await revalidar ID/seq/form-generation/safe state; altered draft conserva e mantém uma oferta local, nova captura prevalece com aviso sem segunda fila. Dirty qualquer campo, edição, save/unknown/conflito/trash/backup/confirmação/localização de lembrete bloqueiam aplicação. Held durante ocupação exige Revisar mesmo ao voltar à lista; Descarta sem salvar/merge. Sem entrega de conteúdo ao oculto ou role alheio.

Atalhos: QUICK_ADD K, OPEN_TASK_MANAGER L, CAPTURE_CLIPBOARD null inicialmente; combo estruturada CTRL_SHIFT/ALT_SHIFT+A–Z/0–9/F1–F24 excetoF4, sem Win/Ctrl+Alt/AltGr/accelerator livre/duplicata. desired e observed REGISTERED/NONE/UNAVAILABLE/UNKNOWN distintos; hint só registro confirmado próprio. Register individual após ready/lock; false/throw não bloqueia app nem identifica dono externo. Gate callback em suspend/quit/lease de edição manager focado; release lease em blur/close/reload/crash/fim. Dev/test sem registro automático; harness opt-in isolado; liberar apenas registros próprios, nunca unregisterAll.

Prefs D9/D10: userData/shortcuts.json version1/8KiB/revision decimal/três ações exatas; missing defaults sem escrita, futuro/corrupto/ilegível preservado e bloqueado. CAS/fila única1ativa+8aguardando/2s/no-op; revalidar arquivo inclusive alteração externa. Temp exclusivo/flush/readback/previous/rename/releitura com retenção limitada, sem restauração silenciosa. Rebind registraB provisório gated, confirma/persisteB, ativaB/liberaA; falha anterior conservaA/compensaB verificavelmente; disable/default seguem protocolo. Publicação/readback desconhecido bloqueia todos os setters/callbacks afetados e mostraUNKNOWN; incerteza só nativa bloqueia ação. Sem replay/rollback presumido; reconciliação explícita validada sem sobrescrever incompatível. Upgrade/uninstall conservam prefs junto aos dados, fora de backup/importação e sem HKCU de hotkeys. Não migrar SQL2/codec4/backup nem trocar stack/runtime/dependências.

IPC D8: manager35/QuickAdd14 com nove wrappers novosv1 (openQuickAdd/openTaskManager/captureClipboard/getPendingCapture/acknowledgeCapture/discardCapture/getShortcutSettings/setShortcut/setShortcutEditing); status/inscrição/eventos desktopv2, tarefas/saída/startup/resolução versões atuais. Requests novos1KiB/results8KiB/draft64KiB/eventos1KiB em UTF-8 JSON completo; sem texto4k no evento, somente referências. Guard role/frame/origem/URL/documento/sessão/admissão/schema/version/extras/bytes antes de qualquer efeito e antes da entrega; facade mínima e main enforcement. Renderer sandbox/contextIsolation/CSP sem Node/fs/IPC livre; sem path/URL/clipboard bruto/canal nativo livre.

Complete testes/documentação junto a cada grupo e registre Q01–Q14 com unit/component/IPC/barreiras/faults/perfil fictício e Windows real. Gates existentes com Node24.21.0/npm11.21.0 preexistentes: npm run validate, OpenSpec Change/--all/--archived estritos, package:win/verify:package/smoke:packaged no app. Campanha/harness nativo opt-in isolado e produto instalado somente com autorização/ambiente correspondentes: outro app em foco, hidden/tray, clipboard fictício, conflito real, rebind/restart/liberação, teclado/IME/zoom200/DPI/leitor de tela. Mocks/build não provam native/Setup; se ambiente ausente registre pendência e mantenha item não concluído. Preserve D10 TFA-0081000:500/250ms/2s e10000:2500/2500ms/8s; não relaxe limites/dados nem atribua prova a waivers herdados.

Exclusões: navegador/extension auxiliar/abas/fetch/polling/history/HTML/OCR, merge/autosave/draft persistido após Sair/crash, IA/redesign/backend/sync/serviço/hook livre, novas dependências, releases/publicação/instalação corporativa e outras Changes. Mudança material exige atualizar artefatos e revisão antes desse ponto, continuando trabalho independente autorizado.

Após apply execute $openspec-verify-change e entregue verification.md na própria Change com aderência a artefatos/Q01–Q14, evidências/gates e pendências; pare para aprovação humana do relatório. Não archive/consolide specs/commit/push/PR/merge/distribua ou inicie TFA-010 automaticamente. README final/archive/integração ficam para etapa autorizada correspondente.
```

### Entrega do apply e verificação — 2026-10-07

**43/45 tasks executadas; 7.4 e 7.5 dispensadas explicitamente pelo usuário, encerradas administrativamente como DISPENSADA E ENCERRADA, sem anunciar verificação inexistente.** Quick Add independente, captura explícita revisável, pendência por destino, personalização/registro observado de atalhos, preferências próprias e IPC por role implementados. Close individual conserva a outra superfície; resume aguarda reconciliação antes de admitir ações. Documentação operacional e matriz de paridade atualizadas. Não houve alteração de SQL2/codec4/backup, novas dependências ou escrita na extensão.

**Evidência final:** `npm run validate` aprovado com lint, cinco typechecks, **1.134 testes aprovados +11 skipped**, dois testes de volume e build. OpenSpec estrito: Change válida, **16/16 --all** e **9/9 --archived** após archive. `package:win`, `verify:package` e **smoke:packaged completo, sem flags de redução**, aprovados. Setup gerado/inspecionado; instalação e abertura foram relatadas pelo operador, sem conta/hash/artefato confirmado. Q14 mediu as duas janelas, volumes 1.000/10.000, clipboard fictício de 960.000 bytes e 20 gestos em uma leitura física por rodada: latências de captura **100,80/89,72 ms**; todos os dez gates ui-bench passaram sem relaxar D10. Hashes, métricas e cobertura de 29 requisitos/75 cenários estão em [verification.md](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/verification.md), [verification-coverage.md](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/verification-coverage.md) e [verification-evidence.json](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/verification-evidence.json).

**Limites aceitos para fechamento:** Q13 pelo agente voltou a falhar antes de F20 (`FOREGROUND_UNAVAILABLE`, `runs:[]`, `cleanup:true`); a saída posteriormente enviada pelo operador confirmou a falha, sem novo artefato PASS. Instalação/abertura sem UAC foi relatada, mas não confirmada por conta/hash/evidência; leitura do perfil dedicado negada. Em seguida, o usuário disse **“Pode pular essas validações. vamos fechar essa change”**. Dispensas7.4/7.5 registradas em [closure-waivers.md](../openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/closure-waivers.md), abrangendo Q13 e campanha instalada/humana/conta padrão/offline/teclado/IME/DPI/leitor de tela/energia/logoff ainda não comprovados. Não repetir como requisito desta Change, nem anunciar PASS ou waiver herdado. Aviso de limpeza do smoke permanece no relatório; nenhum processo alheio encerrado por inferência.

**Revisão final aprovada:** o usuário autorizou **“aprove o relatório, faça o archive, commit, faça o push e crie o PR”** em2026-10-07. Archive concluído com specs consolidadas e README/documentação atualizados; commit/push/PR autorizados. READY_FOR_MERGE após gates finais, sem marcar DONE antes da integração aprovada. Q13 integral e campanha instalada/humana permanecem não comprovados e dispensados. Preparação da campanha pública permanece referência histórica; nenhuma política ou processo alheio foi alterado. Merge/distribuição e TFA-010 continuam fora da autorização.

### Publicação para revisão — 2026-10-07

**[PR #9](https://github.com/Cadlira/taskflow-app/pull/9)** aberto contra `main`, com relatório aprovado, evidências e dispensas explícitas. Implementação no commit `12f68b2`; archive/specs/README/documentação no commit `596d0e9`. Branch enviada sem force push; este registro acompanha o PR em commit de documentação. Estado **READY_FOR_MERGE**, aguardando revisão/CI e integração aprovada; sem data de conclusão ou merge. A extensão permaneceu intacta.

### Prompt de continuidade após fechamento — 2026-10-07

```text
TFA-009 — revisão e integração pendentes

Trabalhe somente em C:\QSI\Workspaces\taskflow-app, branch codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais. Leia AGENTS.md e docs/roadmap.md integralmente. Extensão C:\QSI\Workspaces\taskflow-extension estritamente somente leitura.

A Change já foi arquivada em openspec/changes/archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais. Artefatos aprovados em2026-10-06; relatório aprovado explicitamente em2026-10-07 pelo pedido “aprove o relatório, faça o archive, commit, faça o push e crie o PR”.43 tarefas executadas e2 dispensadas,45 encerradas administrativamente; nunca anunciar45 verificações. Q13 integral falhou FOREGROUND_UNAVAILABLE, cleanup:true. Instalação/abertura sem UAC foi relatada, sem confirmação de conta/hash/artefato. As validações restantes foram dispensadas pelo usuário: “Pode pular essas validações. vamos fechar essa change”. Não repetir como requisito nem declarar PASS. Consulte verification.md, verification-coverage.md, verification-evidence.json e closure-waivers.md no archive.

Sete deltas consolidados:19 requisitos adicionados/10 modificados,29 requisitos/75 cenários. Gates finais OpenSpec1.14.0/schema spec-driven:16/16 specs e9/9 archives estritamente válidos, nenhuma Change ativa. Validate:1.134 passed+11 skipped, volume2, lint/cinco typechecks/build; package/verify:package/smoke completo e Q14 aprovados. ASAR2b6e4798d50460b89f47abf1d1802c9bcf80cfaa3cb6cd567e8ef1adfe25c7b2; Setup0.1.0 hash6444365d0bada92c39ea15a9b3bef6b3a37061c3dca0b1c38206ef3fd75e55c7. README e documentação atuais. Histórico de aprovação/dispensa permanece no archive.

Commit/push/PR autorizados; conferir o registro de publicação abaixo e o Git/PR existente antes de qualquer ação, evitando duplicação. Estado READY_FOR_MERGE; DONE somente após integração aprovada. Merge/distribuição/próxima Change não autorizados. Não iniciar TFA-010 automaticamente. Gates adicionais somente se mudanças/falhas justificarem. Node24.21.0/npm11.21.0 preexistentes; evitar npx global incompatível. Quando saldo de qualquer janela da conta<=5%, atualizar prompt TXT em Downloads com estado verdadeiro.
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

As **TFA-001 a TFA-008** estão **DONE**, arquivadas e integradas pelos **PRs #1 a #8**. A **TFA-009** está **READY_FOR_MERGE/ARCHIVE**, relatório aprovado e arquivada em2026-10-07, com43 tarefas executadas e2 dispensadas. Reutilizar a branch `codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais` e o prompt de continuidade na seção TFA-009. Validate/package/verify:package/smoke completo e Q14 passaram; gates finais OpenSpec16/16 specs e9/9 archives. Q13 integral e campanha instalada/humana/conta/hash/offline/energia/logoff continuam não comprovados, dispensados por decisão humana. Não repetir como requisito ou anunciar PASS. Commit/push/PR autorizados; revisão e integração pendentes. Sem merge/distribuição automático; DONE somente após integração aprovada. TFA-010 e seguintes PLANNED; extensão somente leitura.

## Fechamento da TFA-008 — 2026-10-06

**Estado:** DONE. Apply 60/60, verificação aprovada explicitamente pelo usuário, archive em
`openspec/changes/archive/2026-10-06-migrar-lembretes-e-ciclo-de-vida-desktop/` com 23
requisitos adicionados e 21 modificados nas specs principais, README atualizado e **PR #8
integrado à branch principal**. A Change entregou lembretes nativos (agenda recuperável,
claim durável, no máximo uma tentativa por ocorrência), ciclo de vida com bandeja/Sair/
suspendência, ativação por clique/COM com localização da tarefa, inicialização opt-in e os
contratos/preload correspondentes, além do D10 revisado por novos limites formais
(`d10-budget-review.md`). Waives explícitos do usuário: uso em usuário único (sem segunda
conta/Unicode por conta) e logoff real não executado (handler provado por
`WM_QUERYENDSESSION`); roteiros humanos de acessibilidade permanecem pendentes de execução
e não são declarados como provados. Rollback técnico para binário anterior preserva dados
compatíveis; revogar startup explicitamente antes de usar binário que ignora
`--taskflow-login`.
