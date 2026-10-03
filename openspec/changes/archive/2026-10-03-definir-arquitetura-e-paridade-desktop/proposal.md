# Proposal

**TFA-001 — artefatos aprovados pelo usuário em 2026-10-03.** Evidência e prompt de continuação: [roadmap](C:/QSI/Workspaces/taskflow-app/docs/roadmap.md). Nesta sessão estão autorizados commit/push; o apply documental ficará para outra sessão. Condições e decisões futuras abaixo continuam válidas, sem aprovação de implementação funcional.

## Why

O TaskFlow App precisa de uma arquitetura revisável e de um contrato de paridade antes de migrar a extensão para Windows. A TFA-001 reduz o risco de reescrita desnecessária, perda de dados e adaptação incorreta de APIs Chrome, sem antecipar a fundação ou as funcionalidades das Changes seguintes.

## What Changes

- Consolidar, após revisão humana, documentação de arquitetura, matriz de paridade e estratégia de testes no projeto próprio do app. Esta Change é **somente documental**, sem scaffold, código de aplicativo ou dependências.
- Adotar como baseline documental aprovado Vue 3/Pinia existentes com Electron, mantendo a comparação com Quasar com Electron pelo reaproveitamento real e pelo custo de preservar interface, foco e teclado.
- Definir domínio/aplicação portáveis, casos de uso e persistência coordenados no main, preload mínimo e renderer isolado; documentar IPC validado, erros, concorrência e operações que não podem atravessar IPC como funções.
- Comparar SQLite transacional com JSON atômico e registrar SQLite como preferência condicionada à prova de empacotamento e à revisão específica da TFA-003.
- Rastrear os 14 conjuntos de specs da origem, suas regras verificadas, adaptações Windows, divergências conhecidas e Changes responsáveis.
- Registrar requisitos de instalação por usuário, identidade estável, dados no perfil, ciclo de vida dos lembretes, captura copiada já confirmada e IA opcional com credenciais protegidas.
- Registrar configuração mínima OpenSpec existente, critérios documentais da TFA-001 e verificações futuras de domínio, IPC, persistência e aplicativo instalado.

**Fora do escopo:** copiar código da origem; criar package.json ou scaffold; instalar dependências; implementar qualquer adapter/interface/instalador; alterar a extensão ou seu Git; criar artefatos TFA-002 a TFA-012; aplicar, arquivar, integrar ou distribuir nesta etapa de proposta. Backend obrigatório, conta, nuvem, sincronização, redesign, dashboard, navegador embutido, extensão auxiliar, monitoramento de clipboard, mesclagem de backups e auto-update remoto não integram a migração inicial.

## Capabilities

### New Capabilities

Nenhuma. Documentação e decisões de arquitetura não disponibilizam comportamento de aplicativo. A metadata declara `skip_specs: true`, conforme suporte do schema `spec-driven` da CLI 1.14.0; critérios de revisão e paridade planejada estão no design.

### Modified Capabilities

Nenhuma. `openspec/specs` do app está vazio. As specs da extensão são evidências somente para leitura; não serão alteradas nem copiadas como se já fossem capacidades desktop.

## Impact

- Projeto alvo: `C:\QSI\Workspaces\taskflow-app`; dependências da TFA-001: nenhuma. Branch: `codex/tfa-001-definir-arquitetura-e-paridade-desktop`.
- Na proposta: artefatos desta Change e status/datas/referências de TFA-001 em `docs/roadmap.md`. Alterações preexistentes em AGENTS.md, README.md e .gitignore são preservadas.
- No apply documental futuro, após aprovação explícita: `docs/architecture.md`, `docs/parity-matrix.md` e `docs/test-strategy.md`, usando o design revisado como base. Isso não autoriza implementação funcional nem a próxima Change.
- Fonte da análise: extensão no commit `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, consultada sem executar builds/testes ou modificar arquivos/Git. Se a origem mudar, registrar diferenças antes de copiar qualquer código em Changes futuras.
- Sem novos pacotes, código ou testes executáveis nesta Change. Validação aplicável: integridade documental, rastreabilidade e `openspec validate definir-arquitetura-e-paridade-desktop --type change --strict --no-interactive`.
- Aprovação da TFA-001 aceita o baseline documental e as fronteiras propostas; escolhas condicionais, dúvidas e provas delegadas no design exigem revisão nas Changes responsáveis. A criação destes artefatos não é aprovação nem início de apply.
