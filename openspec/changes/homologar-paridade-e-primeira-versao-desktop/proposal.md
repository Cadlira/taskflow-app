# Proposal

## Why

As TFA-001–011 e TFA-013 estão integradas, mas evidências de funcionalidades, pacotes e instalações pertencem a candidatos e camadas diferentes. A TFA-012 deve permitir uma conclusão rastreável sobre as jornadas do desktop no ambiente comprovado, preservando dispensas e distinguindo prontidão local de autorização de distribuição.

## What Changes

- Consolidar a matriz P01–P14 em jornadas H01–H16 com critérios das dependências, passos, oráculos de conteúdo/revisão/reabertura e resultados por camada: portátil, DOM, IPC, pacote, instalado e humano.
- Planejar regressão integrada de criação/consultas, recorrência/subtarefas, lixeira/desfazer, backup, lembretes/lifecycle, Quick Add/captura/atalhos e IA opcional mockada, incluindo concorrência, offline, retomada, corrupção, versões futuras e falhas de armazenamento. Regressão da geometria TFA-013 incluída.
- Limitar a campanha à conta atual, conforme decisão humana; não exigir VM, segunda conta ou nova prova em conta realmente padrão. Preservar as dispensas anteriores e não reabrir Q13/AI16 ou tasks arquivadas como condições de fechamento.
- Definir candidato local de fonte limpa, proposto **0.2.2**, e predecessor completo **B′ 0.2.1/1195277**, condicionado à conferência de bytes e revisão do pin existente. Não reutilizar o par TFA-011 nem o build sujo TFA-013 como candidato atual.
- Preparar fixtures isoladas e roteiro instalado nesta conta; perfil `test` comprova somente efeitos disponíveis nele. Provas nativas `prod`, manutenção, suspensão/startup/rede reais dependem de perfil exclusivamente fictício confirmado e autorização da execução; caso contrário, declarar parcela não comprovada sem simular PASS.
- Isolar também a fase inicial S1–S9 do smoke, que atualmente usa paths do LOCALAPPDATA real e lista o perfil prod. Corrigir somente o script de teste no apply aprovado, antes de executar qualquer smoke, usando roots e sentinelas fictícios próprios.
- Reconciliar a disponibilidade de IA e o orçamento D10 aprovado nas specs; planejar atualização dos guias/matriz/estratégia, conservando relatórios e falhas históricas. Aceitação exige evidências, ausência de crítico e alcance explícito; não ocorre publicação por consequência.

Não há alteração planejada de regras do domínio, SQL2/codec4/backup4, IPC43/14, identidade ou arquitetura. Defeitos funcionais encontrados serão reproduzidos e encaminhados à revisão antes de ampliar esta proposta; ela não autoriza correções genéricas nas dependências.

## Capabilities

### New Capabilities

Nenhuma. A homologação pertence à validação desktop existente; não é uma funcionalidade nova de tarefas.

### Modified Capabilities

- `desktop-build-validation`: rastreabilidade por jornadas; isolamento de fixtures; relatório de prontidão; escopo explícito de conta/dispensa e evidência nativa condicionada ao perfil e candidato.
- `desktop-task-management`: disponibilidade de IA opcional no gerenciamento integrado e evidências/budgets D10 vigentes, sem alterar os contratos funcionais aprovados.

## Impact

Apply futuro: fixtures/testes de integração e extensões estritamente de teste em `src/main/harness/product-harness.ts`, parser test-only e `scripts/smoke-packaged.mjs`; catálogo de produção permanece fechado. Roteiro e matriz de evidências operacionais em `docs/`; metadados de versão em package/lock e pin exato em `build/nsis/trusted-predecessors.nsh`, somente após revisão dos bytes do predecessor. Sem dependências novas, alteração de runtime, CI/upload ou modificação de `node_modules`.

Dependência direta TFA-011; baseline local `ef803dc80cfab4333035211c472f11743f3368b3` inclui TFA-013. Branch reutilizada `codex/tfa-012-homologar-paridade-e-primeira-versao-desktop`; decisões e fontes em [design.md](design.md) e [roadmap TFA-012](../../../docs/roadmap.md). A extensão `C:\QSI\Workspaces\taskflow-extension` e seu Git são somente leitura.

Excluídos: dados pessoais/credenciais reais, IA real/paga, extração de Chrome/monitoramento de clipboard, outras contas/VMs, energia/logoff reais, desinstalar Node/npm, políticas/HKLM/Known Folder de terceiros, redesign/Quasar/worker/virtualização/novo driver, mesclagem/reparador automático, updater/assinatura/publicação. Propose cria apenas estes artefatos para revisão; aprovação de apply, checkpoint Git limpo e efeitos da campanha não é presumida. README factual somente após archive autorizado; relatório de verify aprovado antes do archive.
