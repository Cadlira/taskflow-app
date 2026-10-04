# Proposal

## Why

O baseline aprovado na TFA-001 ainda não tem runtime nem evidência de que possa ser instalado no Windows por uma conta padrão. Provar essa restrição e o caminho de empacotamento de SQLite antes da migração evita construir funcionalidades sobre uma fundação inviável.

## What Changes

**TFA-002 — proposta para revisão; nenhuma implementação autorizada por estes arquivos.** Dependência: TFA-001, arquivada e integrada pelo PR #1. Branch existente: `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`.

- Criar, no apply futuro aprovado, uma janela mínima Vue/Pinia + Electron, TypeScript estrito, builds separados de main/preload/renderer e apenas uma operação diagnóstica IPC validada. Renderer isolado, CSP, assets locais limitados, navegação/permissões bloqueadas e ownership de perfil por instância única precedem o acesso ao banco.
- Definir identidade estável, instalação e dados separados e perfis dev/test/prod. Propor Windows 11 x64 e NSIS offline one-click exclusivamente per-user; impedir escolhas/argumentos que habilitem escopo de máquina ou destinos não autorizados. Conceder leitura/execução do Windows AppContainer somente à pasta canônica instalada do app, requisito observado para iniciar o Electron sandbox, sem ACL na raiz de dados ou em diretórios globais. Inspecionar manifests do app, Setup e desinstalador e verificar ausência de helper de elevação, updater e serviços.
- Provar SQLite no main com dados fictícios: criar, gravar, ler, rollback e reabrir. **Decisão revisada e aprovada em 2026-10-04 (revisão de G4):** usar o `node:sqlite` embarcado no Electron 44.5.1, com a API release candidate (1.2) aceita explicitamente, após o `better-sqlite3 12.11.1` não ter prebuilt para o ABI 149 e o PC de build autorizado não dispor de MSVC; a prova permanece comportamental no runtime fixado. Não definir armazenamento de tarefas nesta Change.
- Estabelecer gates de lint, typecheck, testes, build, inspeção do pacote e smoke do executável; CI Windows com versões fixadas, lockfile e artefatos internos de revisão, sem publicação. Executar separadamente a prova manual em conta padrão autorizada: instalação, execução offline fora do desenvolvimento, segunda instância, manutenção e isolamento entre usuários.
- Registrar evidências sanitizadas, limitações, comandos operacionais e atualização factual da documentação após existir a implementação. Pontos materiais do design precisam de decisão humana antes do apply: ambiente, identidade/caminhos, instalador, matriz de versões/driver, retenção e necessidade de assinatura para a prova.

**Exclusões:** migração funcional, schema/repositories/recovery e IPC de casos de uso TFA-003; tarefas, recorrência, subtarefas, lixeira, undo, backup, lembretes, bandeja, captura/atalhos e IA TFA-004–010; assinatura/distribuição definitiva TFA-011 e homologação/release TFA-012. Sem Quasar, backend, navegador embutido, auto-update, serviços ou instalação corporativa. A proposta não executa instaladores, instala dependências nem cria package.json, código ou workflow.

## Capabilities

### New Capabilities

- `desktop-foundation`: shell local isolado, contrato diagnóstico, identidade/perfis, ownership de instância e prova transacional fictícia no main.
- `windows-per-user-installation`: instalação exclusivamente no perfil, controle de destinos/argumentos, manifests, efeitos por usuário e manutenção preservando dados.
- `desktop-build-validation`: toolchain reproduzível, gates/CI mínimos, inspeção/smoke do pacote e evidência independente em conta padrão.

### Modified Capabilities

Nenhuma. O inventário `openspec list --specs --json` está vazio. TFA-001 foi documental com `skip_specs: true`; esta Change funcional terá três deltas, sem essa dispensa.

## Impact

Nesta etapa: somente artefatos desta Change e registro da proposta/prompt de apply no roadmap. No apply aprovado: scaffold e lockfile próprios do app, configs de build/lint/test/NSIS, shell, prova SQLite, testes, CI e documentação operacional. Licenças, peers, binários e ABI precisam passar pelos gates do design; metadados consultados não equivalem a instalação ou execução validada.

**Decisão de implementação aprovada durante o apply em 2026-10-03:** o instalador poderá conceder somente leitura/execução ao SID do Windows AppContainer (`S-1-15-2-1`), com herança limitada ao diretório canônico de binários `TaskFlowApp`, após validar identidade e destino. Dados/perfis, roots globais e outros usuários não recebem essa ACE. A recusa ou falha de ACL deve interromper a instalação com código não zero.

Fontes locais: [arquitetura](../../../docs/architecture.md), [paridade](../../../docs/parity-matrix.md), [testes](../../../docs/test-strategy.md), [exploração e F01–F09](../../../docs/roadmap.md). Extensão consultada somente para leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`; não copiar WXT/postinstall, Git, configurações pessoais ou dados reais. Comandos, decisões, alternativas, riscos e critérios detalhados constam no design e nas specs.
