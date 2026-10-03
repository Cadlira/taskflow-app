# TaskFlow App

Aplicativo desktop **autocontido e local-first** para captura rápida e gerenciamento de tarefas pessoais e profissionais. É derivado da extensão TaskFlow para Google Chrome e tem como destino o Windows, distribuído por um instalador **por usuário** — sem exigir administrador e sem instalar serviços de sistema.

> **Status: planejamento.** Este repositório contém apenas documentação e planejamento. Ainda não há aplicativo, dependências, build ou instalador. A implementação será conduzida por Changes OpenSpec aprovadas, uma por vez, em sessões futuras.

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

Esses itens descrevem o alvo da migração com base na extensão atual, **não** funcionalidades disponíveis neste repositório. O roadmap registra o tratamento planejado e a Change responsável por cada um.

## Princípios do produto

- **Autocontido e local-first:** o funcionamento principal não depende de backend próprio, conta, autenticação central, nuvem ou rede. Integrações externas e IA são opcionais.
- **Windows por usuário:** instalação no perfil do usuário, sem elevação, serviços de sistema ou publicação automática de releases.
- **Paridade observável:** identidade visual, acessibilidade, estados de erro e comportamento de teclado devem ser preservados.
- **IA opcional:** acionada pelo usuário, conectada diretamente ao provedor escolhido, com prévia, consentimento, cancelamento, timeout e revisão; nenhuma sugestão é aplicada automaticamente.
- **Segurança:** renderer sem acesso livre a Node ou filesystem, preload mínimo, IPC tipado e validado, isolamento de contexto, sandbox, CSP e credenciais protegidas por mecanismo do sistema.

## Diferenças planejadas em relação à extensão

- A captura deixa de ler a aba ativa do Chrome e passa a usar **links e textos copiados**, acionada por botão ou atalho global. Não há navegador embutido, extensão auxiliar nem monitoramento contínuo da área de transferência.
- A persistência deixa de usar `chrome.storage.local` e passa a ser durável no perfil do usuário, resistente a fechamento, atualização e falhas de escrita.
- Lembretes e notificações passam a usar recursos nativos do Windows, com ciclo de vida definido ao minimizar, fechar, suspender e reiniciar.
- Atalhos passam a ser globais e personalizáveis, com tratamento explícito de conflitos.

O backup atual da extensão exporta **tarefas**. Lixeira, credenciais de IA e estado temporário de desfazer não fazem parte desse arquivo e não são transportados automaticamente por ele.

## Fundação técnica (a definir)

Nenhuma decisão de stack está tomada. A primeira Change (`TFA-001`) deve comparar as alternativas com base no código real da extensão:

- **Electron** é a hipótese inicial; **Vue 3 existente + Electron** (menor reescrita) e **Quasar + Electron** são alternativas em avaliação.
- Domínio e aplicação permanecem independentes de Vue, Pinia e Electron; as APIs do Chrome são adaptadas por portas e adapters.
- Persistência: JSON com gravação atômica ou SQLite serão avaliados (`TFA-003`).
- Referência da origem: Vue 3, Pinia, TypeScript estrito, WXT/Manifest V3, Vitest, ESLint e Prettier.

## Estrutura do repositório

```text
docs/roadmap.md   roadmap das Changes, dependências, estados e prompts
openspec/         configuração e artefatos OpenSpec (specs e changes)
AGENTS.md         regras para agentes de programação neste projeto
README.md         este arquivo
```

## Como executar

**Ainda não há o que executar:** este repositório não contém código de aplicativo, dependências, build ou instalador. Os comandos de `dev`, `build`, `lint`, `typecheck` e `test` só existirão após a Change `TFA-002`.

O trabalho segue o fluxo OpenSpec, uma Change por vez:

1. Ler [AGENTS.md](AGENTS.md) e [docs/roadmap.md](docs/roadmap.md).
2. Selecionar a Change elegível — `TFA-001` é a primeira, sem dependências.
3. Explorar (`/opsx:explore` ou a skill `openspec-explore`), sem implementar.
4. Propor e revisar os artefatos da Change.
5. Aplicar somente após aprovação explícita (`opsx:apply` ou skill correspondente).
6. Verificar, arquivar e integrar.

Os comandos `/opsx:*` são comandos de chat do assistente; os comandos `openspec` são de terminal. Não colar os comandos de chat no PowerShell.

Requisitos para o desenvolvimento futuro: Node.js e npm em versões compatíveis com o stack escolhido (a extensão de origem usa Node.js 22.12 ou superior e npm 10 ou superior).

## Documentação

- [Instruções para agentes](AGENTS.md)
- [Roadmap, dependências e prompts OPSX](docs/roadmap.md)

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).

