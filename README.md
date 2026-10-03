# TaskFlow App

Projeto separado para planejar a migração da extensão TaskFlow para um aplicativo Windows com instalador por usuário.

**Estado em 2026-10-03: planejamento apenas.** Não existe aplicativo implementado, build ou instalador neste repositório. A sessão inicial prepara documentação e Git; a implementação será conduzida por Changes aprovadas, em sessões futuras.

- [Instruções para agentes](AGENTS.md)
- [Roadmap, dependências e prompts OPSX](docs/roadmap.md)

## Decisões confirmadas

- Novo projeto em `C:\QSI\Workspaces\taskflow-app`, com repositório independente.
- Extensão original em `C:\QSI\Workspaces\taskflow-extension` estritamente somente leitura.
- Instalador Windows apenas para o usuário, sem necessidade de administrador.
- Preservação das funcionalidades existentes com adaptações explícitas de plataforma.
- Captura de links e textos copiados por botão ou atalho global.
- Planejar e revisar cada Change antes de implementar.

## Próxima ação

Selecionar `TFA-001` no roadmap e usar seu prompt de exploração.

OpenSpec ainda não foi instalado ou inicializado neste novo projeto. Ao preparar a primeira exploração, confirmar a versão e inicializar somente aqui as integrações do assistente escolhido, quando autorizado. Os prompts também podem ser usados como instruções de investigação em chat antes dessa configuração.

Os comandos `/opsx:explore` são comandos de chat. A ferramenta pode expô-los com outra grafia ou como skill; usar a forma gerada pela instalação. Não colar esses comandos no PowerShell.

Não instalar dependências, copiar código da extensão, gerar Changes futuras ou iniciar `apply` automaticamente a partir deste README.

