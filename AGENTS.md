# AGENTS.md — TaskFlow App

## Escopo e proteção da origem

1. Este arquivo rege somente o projeto `C:\QSI\Workspaces\taskflow-app`.
2. A extensão em `C:\QSI\Workspaces\taskflow-extension` e seu repositório são fontes de consulta, estritamente somente leitura. Não editar arquivos, gerar builds, instalar dependências, executar ferramentas que escrevam, criar branches, commits, PRs ou alterar configurações nessa origem.
3. Trabalhar no Git próprio do TaskFlow App. Antes de qualquer comando de escrita, confirmar o diretório de trabalho e o destino. Não reutilizar o `.git` nem o remote da extensão.
4. Reutilização futura deve copiar apenas arquivos necessários e revisados. Nunca copiar `.git`, `.env`, credenciais, dados reais, `node_modules`, artefatos de build ou configurações pessoais.
5. O estado inicial deste projeto é **planejamento apenas**. Criar o roadmap e responder perguntas técnicas não autoriza implementação. O usuário determinou que as funcionalidades sejam tratadas em Changes separadas, em sessões futuras.

## Fonte de escopo e OpenSpec

6. Ler este arquivo e `docs/roadmap.md` integralmente antes de trabalhar. Identificar a Change selecionada, suas dependências e seus artefatos existentes.
7. O roadmap registra intenções, ordem e prompts; não equivale a proposal, design, specs ou tasks aprovadas.
8. Durante `opsx:explore`, investigar código e alternativas, apresentar decisões e dúvidas, sem implementar. Não criar antecipadamente diretórios ou artefatos de Changes futuras.
9. Explorar um item não autoriza propor, aplicar, publicar ou passar automaticamente ao próximo. Criar artefatos quando o usuário solicitar a proposta correspondente.
10. Ao final do `opsx:explore`, consolidar um prompt pronto para uso no `opsx:propose`, reunindo escopo, decisões e alternativas discutidas, dúvidas resolvidas ou em aberto, dependências e critérios observáveis. Entregar esse prompt ao usuário; ele orienta a proposta, mas não a inicia nem substitui a autorização explícita para o `propose`.
11. Antes do `propose`, registrar no roadmap status `IN_PROGRESS`, etapa `PROPOSE` e data de início; depois marcar `IN_REVIEW`/`REVIEW`. Não marcar aprovação sem evidência humana na conversa.
12. Só iniciar `apply` após aprovação explícita dos artefatos da Change selecionada. O usuário pode autorizar várias ações de uma vez; não pedir novamente dentro do escopo já autorizado.
13. Se houver mudança material de escopo ou decisão difícil de reverter que não esteja autorizada, atualizar a proposta e submetê-la à revisão antes de implementar esse ponto. Continuar trabalhos independentes já autorizados.
14. Inicializar OpenSpec somente no novo projeto. Confirmar versão, ferramentas suportadas, schema e comandos com a CLI instalada; não pressupor que comandos de diferentes versões sejam intercambiáveis.
15. `/opsx:explore` e demais comandos OPSX são invocados no chat do assistente; `openspec ...` é CLI de terminal. Usar a forma efetivamente gerada para a ferramenta escolhida. No Codex, pode ser uma skill como `$openspec-explore`.
16. IDs `TFA-NNN` são imutáveis e independentes dos IDs `TF-NNN` da extensão. Não renumerar nem reutilizar IDs. Slugs descritivos podem ser ajustados durante a exploração, antes de criar a Change.
17. Executar apenas a Change autorizada. Não implementar itens de dependências pendentes ou itens futuros como conveniência.

## Produto e arquitetura

18. O produto é autocontido e local-first: gerenciamento principal sem backend obrigatório, conta, autenticação central, nuvem ou rede.
19. A meta de distribuição é Windows com instalador por usuário, sem exigir administrador e sem instalar serviços de sistema. Não confundir isso com permissão de execução concedida pela empresa.
20. Electron é a hipótese inicial. Avaliar Vue existente com Electron versus Quasar com Electron na primeira Change. Quasar não está decidido e não deve provocar reescrita sem benefício demonstrável.
21. Preservar funcionalidades e regras verificadas da extensão: campos, validações, status, pesquisa, filtros, ordenação, recorrências, subtarefas, lixeira, desfazer, backups, lembretes, captura, atalhos e assistência de IA.
22. A adaptação de captura **confirmada pelo usuário** usa links e textos copiados, com botão e atalho global. Não adicionar navegador embutido, leitura automática de abas, extensão auxiliar ou monitoramento contínuo da área de transferência.
23. Preservar identidade visual, acessibilidade, estados de erro e comportamento de teclado. Redesign, dashboard e funcionalidades novas exigem Changes próprias.
24. TypeScript estrito; não usar `any` sem justificativa localizada e teste. Manter domínio e aplicação independentes de Vue, Pinia e Electron.
25. Adaptar APIs do Chrome por portas e adapters; não espalhar emulação de `browser`/`chrome` pelos componentes.
26. Renderer sem acesso livre a Node ou filesystem. Projetar preload mínimo, IPC tipado e validado, isolamento de contexto, sandbox, CSP, validação do remetente e abertura controlada de URLs externas.
27. Persistência durável deve sobreviver a fechamento, atualização e falhas de escrita. Evitar sobrescrever dados incompatíveis, gravações parciais e perda por concorrência entre janelas.
28. Lembretes usam estado persistido como fonte de verdade, com prevenção de duplicidade e definição explícita do comportamento ao fechar janela, sair, suspender e reiniciar.
29. IA é opcional, acionada pelo usuário e conectada diretamente ao provedor escolhido. Preservar prévia, consentimento, cancelamento, timeout e revisão das sugestões. Nunca aplicar sugestão automaticamente.
30. Proteger credenciais no perfil do usuário com mecanismo apropriado do sistema, avaliado na Change de IA. Não transportar a política de armazenamento em texto simples do Chrome como decisão automática para desktop.
31. Nunca incluir credenciais, dados reais, conteúdo enviado à IA ou informações sensíveis em logs, repositório, screenshots e backups.

## Validação e documentação

32. Reaproveitar testes portáveis da origem por cópia revisada; substituir testes de adapters Chrome por testes desktop. Não executar testes ou builds no diretório da extensão.
33. Cada Change deve definir critérios observáveis e verificações adequadas. Após a fundação técnica, manter gates para lint, typecheck, testes e build no projeto novo.
34. Testar especialmente persistência, concorrência, versões de backup, recorrência, desfazer, lembretes, cancelamento de IA, IPC e comportamento do aplicativo empacotado.
35. Executar os gates existentes e a validação OpenSpec suportada pela versão instalada. Não inventar sucesso nem exigir comandos ainda ausentes no estado de planejamento.
36. Smoke test do renderer ou build bem-sucedido não comprovam funcionamento do instalador, IPC, notificações, bandeja ou atalhos no Windows.
37. Documentar limitações e diferenças da migração. Backup atual transporta tarefas; lixeira, credenciais e desfazer temporário não devem ser anunciados como migrados por esse arquivo.
38. Atualizar README, documentação operacional e matriz de paridade quando a implementação correspondente existir. Não descrever funcionalidade planejada como disponível.

## Git, revisão e conclusão

39. Usar branches `codex/<id>-<slug>` para Changes, salvo preferência explícita do usuário. Não fazer force push, reescrever histórico ou modificar a origem.
40. Commits pequenos e coerentes, sem misturar Changes. Preservar trabalho preexistente do usuário.
41. Revisar contra os artefatos aprovados e registrar evidências de testes e verificações manuais. Abrir PR quando houver remote e fluxo de revisão configurados.
42. Depois da aprovação da implementação, arquivar a Change na mesma branch, consolidar specs e incluir no commit a atualização do roadmap, datas e documentação final.
43. Em fluxo com PR, marcar `READY_FOR_MERGE` após archive e gates finais; `DONE` só após integração aprovada na branch principal. Sem PR, usar a integração revisada equivalente e registrar essa decisão.
44. Não passar à próxima Change, fazer merge, instalar em máquina corporativa, distribuir releases ou configurar publicação automática sem a autorização correspondente. Preparar resultado concreto e verificável antes de pedir aprovação necessária.
45. Informar exatamente o que foi criado, o que foi validado e o que permanece pendente. No estado inicial, os únicos artefatos entregues são de planejamento.

