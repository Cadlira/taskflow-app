# Tasks

Checklist do **apply documental da TFA-001**, autorizado pelo usuário em 2026-10-03. Os artefatos foram aprovados na mesma data, conforme registro no [roadmap](C:/QSI/Workspaces/taskflow-app/docs/roadmap.md). Aprovação, por si só, não executa nenhuma tarefa abaixo. Referências: [proposal](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop/proposal.md) e [design](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-03-definir-arquitetura-e-paridade-desktop/design.md). Specs são dispensadas por `skip_specs: true`, pois esta Change não altera comportamento executável.

Não criar scaffold/package.json, instalar dependências, copiar código/testes, implementar adapters, migrar dados ou produzir artefatos das Changes seguintes. As verificações de produto descritas nos documentos serão executadas pelas Changes responsáveis, sem build/teste na origem.

## 1. Baseline de arquitetura

- [x] 1.1 Publicar `C:\QSI\Workspaces\taskflow-app\docs\architecture.md` com Context e D1–D4 do design, incorporando as decisões efetivamente aprovadas na conversa e preservando as condicionais; verificar AC01/AC03/AC04 pela comparação entre documento, artefatos revisados e evidência de aprovação, incluindo Vue/Electron versus Quasar e os invariantes SQLite/JSON.
- [x] 1.2 Incluir no documento as fronteiras de IA, Windows, lembretes/ciclo de vida e OpenSpec de D6–D9, com destinos e gates futuros explícitos; verificar que não há pacote/driver/appId inventado, credencial existente lida pelo renderer, promises de aviso com app encerrado ou instalação corporativa autorizada por inferência.
- [x] 1.3 Registrar no documento o inventário lógico de IPC, diagrama de responsabilidades, isolamento/CSP/remetente, revisões/conflitos e preparações por token; verificar que callbacks de repositories, File.text(), AbortSignal, planos de undo e caminhos livres não são expostos como bridge e que rede longa não bloqueia transação de dados.

## 2. Matriz de paridade rastreável

- [x] 2.1 Publicar `C:\QSI\Workspaces\taskflow-app\docs\parity-matrix.md` a partir de D5, contendo P01–P14, fontes/specs/testes, tratamento preservar/adaptar/revisar e TFA responsável; conferir o HEAD da origem em leitura e registrar qualquer diferença relevante em relação ao hash analisado sem alterar a origem; verificar AC02/AC05 e existência das referências, sem anunciar runtime disponível.
- [x] 2.2 Documentar as substituições de APIs Chrome, a captura copiada já confirmada, as exclusões do backup e as adaptações ainda pendentes; verificar explicitamente que clipboard só é lido por ação, não existe leitura de abas/fetch de título/monitoramento e backup migra tarefas v1–v4 sem prometer lixeira, credenciais ou undo.
- [x] 2.3 Registrar as divergências específicas da inspeção — comparação pós-restore sem subtarefas/recurrence/seriesId e spec de ícones com permissões antigas — com evidências e destino TFA-007/validação de identidade; verificar que nenhuma divergência é convertida em requisito de preservação do defeito nem corrigida na extensão.

## 3. Estratégia de validação

- [x] 3.1 Publicar `C:\QSI\Workspaces\taskflow-app\docs\test-strategy.md` com a tabela de níveis/destinos de D10 e inventário de testes/fixtures portáveis candidatos a cópia revisada futura; verificar AC06 distinguindo unitário, UI, adapter/IPC, integração e Windows instalado, com dados fictícios/mocks de IA e nenhuma execução na origem.
- [x] 3.2 Incluir cenários e resultados esperados para commit interrompido/recovery/schema futuro, concorrência entre janelas e prévia stale, recorrência/DST/fim de mês, undo, claims/retomada, backup v1–v4 com todos os campos, token/remetente inválido e cancelamento/troca de provider; verificar rastreabilidade ao item P/decisão D/Change correspondente e ausência de alegações de aprovação por build ou smoke isolado.
- [x] 3.3 Documentar gates existentes e futuros, sem criar scripts nesta Change: OpenSpec agora; lint/typecheck/test/build e CI após TFA-002; verificar comandos atuais com a CLI instalada e marcar os testes de aplicativo/instalador como planejados, não executados.

## 4. Integração e revisão documental

- [x] 4.1 Revisar os três documentos juntos contra AC01–AC08, corrigindo links, contradições de escopo/estado e decisões sem fonte ou responsável; verificar presença dos 14 itens, cobertura das duas alternativas e de todas as decisões D1–D10, mantendo uma distinção explícita entre confirmado, aprovado na conversa e pendente.
- [x] 4.2 Executar `openspec validate definir-arquitetura-e-paridade-desktop --type change --strict --no-interactive` e revisão do diff próprio do app; registrar evidência e limitações no relatório de conclusão, verificando ausência de scaffold/código/dados/segredos e preservação das alterações preexistentes do usuário. Não exigir npm gates ainda ausentes.
- [x] 4.3 Atualizar apenas o estado/etapa pertinentes de TFA-001 no roadmap e entregar os documentos para revisão da implementação documental; verificar IDs/dependências e datas preservados, sem `DONE` antes da integração e sem iniciar TFA-002, archive, merge ou distribuição por inferência.

Archive e integração ocorrem depois da revisão/aprovação da implementação, conforme AGENTS.md e autorização correspondente. Nessa etapa, avaliar ajuste factual do README conforme item 38, sem mudar trabalho preexistente por conveniência nem inserir status de desenvolvimento. A conclusão deste checklist não equivale a paridade funcional desktop.
