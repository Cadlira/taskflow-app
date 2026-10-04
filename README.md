# TaskFlow App

Aplicativo desktop **autocontido e local-first** para captura rápida e gerenciamento de tarefas pessoais e profissionais. É derivado da extensão TaskFlow para Google Chrome e tem como destino o Windows, distribuído por um instalador **por usuário** — sem exigir administrador e sem instalar serviços de sistema.

> **Estado atual:** a fundação técnica está implementada e verificada — shell isolado, contrato diagnóstico validado, prova de armazenamento embarcada, gates/CI e instalador NSIS exclusivo por usuário. As funcionalidades de tarefas ainda **não** foram migradas: as TFA-003 a TFA-012 cuidam dessa migração, Change por Change. Itens descritos abaixo como alvo não estão disponíveis no aplicativo.

## Propósito

Levar as atividades oferecidas hoje pela extensão TaskFlow para um aplicativo Windows nativo, sem depender do navegador, mantendo os dados no próprio computador do usuário.

A migração deve preservar os comportamentos e regras já verificados na extensão de origem:

- criação e edição de tarefas com descrição, tags, prioridade, prazo, solicitante, responsável, status e URL de origem;
- conclusão, cancelamento, reabertura, alteração de status e exclusão com confirmação;
- pesquisa sem diferenciar maiúsculas, filtros combináveis e ordenação, com sinalização de tarefas atrasadas e que vencem em até 24 horas;
- recorrências diárias, semanais e mensais, com limite opcional e opção de encerrar a série;
- até 20 subtarefas por tarefa, em ordem manual, com progresso calculado e marcação independente;
- lixeira com retenção de 30 dias, restaurar, excluir definitivamente e esvaziar;
- desfazer a última exclusão, alteração de status ou edição;
- backup manual versionado (formatos 1 a 4) com prévia e restauração por substituição total;
- até 10 lembretes por tarefa, combinando deslocamentos antes do prazo e horários absolutos, com tolerância de 5 minutos;
- Quick Add, captura por link/texto copiado e atalhos de teclado;
- provedores de IA opcionais (OpenAI, Anthropic e CUSTOM) com teste de conexão e sugestão de subtarefas revisável.

O roadmap registra o tratamento planejado e a Change responsável por cada item.

## Princípios do produto

- **Autocontido e local-first:** o funcionamento principal não depende de backend próprio, conta, autenticação central, nuvem ou rede. Integrações externas e IA são opcionais.
- **Windows por usuário:** instalação no perfil do usuário, sem elevação, serviços de sistema ou publicação automática de releases.
- **Paridade observável:** identidade visual, acessibilidade, estados de erro e comportamento de teclado devem ser preservados.
- **IA opcional:** acionada pelo usuário, conectada diretamente ao provedor escolhido, com prévia, consentimento, cancelamento, timeout e revisão; nenhuma sugestão é aplicada automaticamente.
- **Segurança:** renderer sem acesso livre a Node ou filesystem, preload mínimo, IPC tipado e validado, isolamento de contexto, sandbox, CSP e credenciais protegidas por mecanismo do sistema.

## Fundação técnica

- **Stack:** Vue 3 + Pinia com Electron, builds separados de main/preload/renderer via `electron-vite`, TypeScript estrito em todos os projetos. Domínio e aplicação futuros permanecem proibidos de importar Vue/Pinia/Electron/Node/rede.
- **Isolamento:** `contextIsolation`, `sandbox` e `webSecurity` ativos; renderer servido apenas por assets locais (`taskflow://app`) com CSP restritiva; navegação externa, janelas, webviews e permissões negadas por padrão.
- **Contrato diagnóstico:** única operação exposta `verifyFoundation({ version: 1 })`, validada no main por schema, versão, limite de 1 KiB, webContents, main frame e origem exata, com códigos fechados e erros sanitizados.
- **Perfis e ownership:** identidade `taskflow.app`/`TaskFlowApp.exe`; dados em `%LOCALAPPDATA%\TaskFlowApp\profiles\<dev|test|prod>\{user-data,session-data}`; instância única por perfil antes de abrir o armazenamento.
- **Armazenamento da prova:** `node:sqlite` embarcado no Electron fixado (decisão revisada e aprovada), com marcador fictício, transação com rollback, reabertura e fingerprint. A persistência definitiva de tarefas será decidida na TFA-003.
- **Instalador:** NSIS offline one-click **exclusivo por usuário** (`asInvoker`, sem elevate helper, updater ou serviços), com validação de argumentos/destino e ACE de leitura do AppContainer restrita ao diretório instalado. O desinstalador preserva os dados do usuário.
- **Matriz fixada:** Node 24.21.0 e npm 11.21.0 (build), Electron 44.5.1, electron-builder 26.17.0, electron-vite 5.0.0/Vite 7.3.6, Vue 3.5.43/Pinia 4.0.3, TypeScript 5.9.3/vue-tsc 3.3.12, ESLint 9.39.5, Vitest 4.1.11. Versões exatas no `package-lock.json`.

## Diferenças em relação à extensão

A adaptação de captura já está confirmada: em vez de ler a aba ativa do Chrome, o aplicativo usará **links e textos copiados**, acionados por botão ou atalho global, sem navegador embutido, extensão auxiliar ou monitoramento contínuo da área de transferência. As demais diferenças previstas:

- persistência durável no perfil do usuário, resistente a fechamento, atualização e falhas de escrita (TFA-003);
- lembretes e notificações nativos do Windows, com ciclo de vida definido ao minimizar, fechar, suspender e reiniciar (TFA-008);
- atalhos globais personalizáveis, com tratamento explícito de conflitos (TFA-009).

O backup atual da extensão exporta **tarefas**. Lixeira, credenciais de IA e estado temporário de desfazer não fazem parte desse arquivo e não são transportados automaticamente por ele.

## Estrutura do repositório

```text
src/                  main, preload, renderer e contratos tipados
tests/                testes unitários, de contrato e de fronteiras
scripts/              geração de ícone, inspeção do pacote e smoke empacotado
build/                recursos do instalador (ícone e include NSIS)
assets/               master SVG da marca
docs/                 arquitetura, paridade, estratégia de testes, validação e roadmap
openspec/             configuração, specs consolidadas e histórico de Changes
package.json          scripts, matriz de versões e configuração do empacotador
tsconfig*.json        projetos TypeScript separados (contratos/main/preload/renderer/testes)
electron.vite.config.ts · eslint.config.mjs · vitest.config.ts
AGENTS.md · README.md · LICENSE
release/              artefatos gerados pelo empacotamento (não versionado)
```

## Como executar

Requisitos de desenvolvimento: **Node.js 24.21.0** e **npm 11.21.0** (fixados em `package.json` e `.nvmrc`). O aplicativo instalado não requer Node/npm.

```powershell
npm ci                  # instala exatamente o lockfile
npm run dev             # desenvolvimento (main/preload/renderer)
npm run lint            # ESLint sem warnings
npm run typecheck       # tsc (contratos/main/preload/testes) + vue-tsc (renderer)
npm run test            # Vitest
npm run build           # build das três entradas
npm run validate        # lint + typecheck + testes + build
npm run package:win     # instalador NSIS x64 (--publish never)
npm run verify:package  # inventário/manifests/hashes do pacote
npm run smoke:packaged  # executa o exe empacotado em cópia de teste
```

O detalhamento de versões, hashes, limitações e das provas executadas (incluindo a instalação por usuário) está em [Validação da fundação](docs/desktop-foundation-validation.md). Os comandos `/opsx:*` são comandos de chat do assistente; os comandos `openspec` são de terminal.

## Documentação

- [Instruções para agentes](AGENTS.md)
- [Roadmap, dependências e prompts OPSX](docs/roadmap.md)
- [Arquitetura](docs/architecture.md)
- [Matriz de paridade](docs/parity-matrix.md)
- [Estratégia de testes](docs/test-strategy.md)
- [Validação da fundação desktop](docs/desktop-foundation-validation.md)

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
