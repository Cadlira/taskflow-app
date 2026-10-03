# TaskFlow App

Aplicativo desktop **autocontido e local-first** para captura rápida e gerenciamento de tarefas pessoais e profissionais. É derivado da extensão TaskFlow para Google Chrome e tem como destino o Windows, distribuído por um instalador **por usuário** — sem exigir administrador e sem instalar serviços de sistema.

> **Estado atual:** este repositório contém documentação; ainda não há aplicativo, dependências, build ou instalador. As decisões e a matriz de paridade orientam Changes futuras, mas não significam que as funcionalidades descritas estejam disponíveis.

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

## Fundação técnica documentada

O baseline aprovado para a migração é Vue 3/Pinia existentes com Electron, preservando o núcleo de domínio e aplicação portável. Quasar com Electron permanece uma alternativa; adotá-lo exige benefício demonstrável e revisão da paridade.

- Domínio e aplicação permanecem independentes de Vue, Pinia, Electron e Node; APIs do Chrome são adaptadas por portas e adapters.
- O processo main coordenará casos de uso e operações duráveis; preload exporá uma bridge mínima e renderer permanecerá isolado.
- SQLite é a preferência condicional de persistência, sujeita à prova de empacotamento em TFA-002 e à revisão técnica em TFA-003. JSON atômico continua como alternativa se cumprir os mesmos requisitos de durabilidade e concorrência.
- Versões e ferramentas de runtime ainda não foram selecionadas. A configuração da extensão — Vue 3, Pinia, TypeScript estrito, WXT/Manifest V3, Vitest, ESLint e Prettier — é referência da origem, não uma configuração já instalada neste app.

## Estrutura do repositório

```text
docs/             arquitetura, matriz de paridade, estratégia de testes e roadmap
openspec/         configuração e histórico OpenSpec; sem specs executáveis consolidadas
AGENTS.md         regras para agentes de programação neste projeto
README.md         este arquivo
```

## Como executar

**Ainda não há aplicativo para executar:** este repositório não contém código de runtime, dependências, build ou instalador. Comandos de `dev`, `build`, `lint`, `typecheck` e `test` não estão configurados.

O planejamento e as dependências das Changes estão em [docs/roadmap.md](docs/roadmap.md). As decisões documentadas estão em [docs/architecture.md](docs/architecture.md), [docs/parity-matrix.md](docs/parity-matrix.md) e [docs/test-strategy.md](docs/test-strategy.md). A existência desses documentos não instala nem inicia o aplicativo.

Os comandos `/opsx:*` são comandos de chat do assistente; os comandos `openspec` são de terminal. Não colar os comandos de chat no PowerShell.

As versões de Node.js, npm e demais ferramentas necessárias ao runtime serão definidas antes da fundação do aplicativo. As versões usadas pela extensão não são requisitos confirmados para este repositório.

## Documentação

- [Instruções para agentes](AGENTS.md)
- [Roadmap, dependências e prompts OPSX](docs/roadmap.md)
- [Arquitetura proposta](docs/architecture.md)
- [Matriz de paridade](docs/parity-matrix.md)
- [Estratégia de testes](docs/test-strategy.md)

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).

