# Roteiro manual de acessibilidade — TFA-005 (U01)

**Objetivo:** transformar a pendência de prova humana do relatório de verificação em evidência
executável. Não substitui a validação automatizada (DOM/teclado/contraste/zoom em testes e no
cenário `a11y` do pacote); complementa com leitor de tela, escala Windows e julgamento visual.

**Como executar:** rode `npm run dev` (ou abra `release/win-unpacked/TaskFlowApp.exe`) em um perfil
fictício, crie algumas tarefas (uma recorrente, uma com 3 subtarefas, uma cancelada recorrente) e
percorra os blocos abaixo. Anote **Passa/Falha/Observação** em cada linha e devolva o resultado
preenchido; ele será anexado ao `verification.md`.

| # | Verificação | Como fazer | Esperado | Resultado |
| --- | --- | --- | --- | --- |
| 1 | Teclado sem ponteiro | Percorrer a tela só com Tab/Shift+Tab | Foco visível em Nova tarefa, filtros, cartões e ações; nenhuma armadilha | |
| 2 | Formulário de regra | Abrir edição, focar frequência e alternar DAILY/WEEKLY/MONTHLY; digitar parâmetro e limite | Rótulos anunciados; erro do primeiro campo inválido recebe foco | |
| 3 | Subtarefas | Adicionar, renomear, mover cima/baixo e remover com Enter/Espaço; tentar 21º item | Ações alcançáveis; limite 20 explicado; ordem preservada | |
| 4 | Cancelar sem gravar | Alterar campos e acionar Cancelar (teclado) | Nenhuma alteração persiste; foco volta a Nova tarefa | |
| 5 | Seletor de status | Setas/Home/End/PageUp/PageDown, depois Enter; repetir com Escape | Navegar não grava; Enter confirma; Escape restaura o status | |
| 6 | CANCELLED recorrente | No seletor, escolher Cancelada em tarefa recorrente e confirmar com Enter/ponteiro | Diálogo SKIP/END abre com foco no primeiro botão; nada gravado antes da escolha | |
| 7 | Focusout excepcional | Em tarefa recorrente, escolher Cancelada e sair do seletor com Tab | Seleção restaurada, **sem** diálogo, sem comando e sem roubar o foco de destino | |
| 8 | Diálogo | Com o diálogo aberto: Tab/Shift+Tab e Escape; depois abrir de novo e escolher SKIP | Foco preso ao diálogo; Escape abandona sem gravar; SKIP fecha e gera uma próxima TODO | |
| 9 | Checkbox de subtarefa | Expandir cartão, alternar item com Espaço; repetir durante espera (busy) | Progresso “x de y” atualiza; busy mantém foco, `aria-disabled` e ignora duplo gesto | |
| 10 | Zoom 200% | Aumentar zoom do app até 200% e repetir 1–4 | Controles continuam alcançáveis por teclado e rolagem; nada some | |
| 11 | Janela mínima e escala | Reduzir à janela mínima (360×420) e testar escala Windows 125%/150% | Ações acessíveis; texto não elimina controles | |
| 12 | Contraste | Inspeção visual de texto e foco | Texto ≥ 4,5:1; indicador de foco ≥ 3:1 | |
| 13 | Leitor de tela (Narrator `Ctrl+Win+Enter` ou NVDA) | Percorrer cartão, formulário, diálogo e mensagens de erro/D8 | Título e descrição do diálogo, rótulos, progresso, estado do checkbox e mensagens são anunciados | |
| 14 | D8 (informativo) | Em tarefa com lembretes (perfil semeado), tentar mudar prazo/status | Mensagem acessível explica o bloqueio; retirada isolada da regra é permitida | |

**Fora deste roteiro:** notificações, bandeja, atalhos globais, IA e captura pertencem a outras
Changes; Setup e instalação corporativa exigem autorização própria.
