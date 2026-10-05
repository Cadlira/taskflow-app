# Roteiro humano — acessibilidade da lixeira e do desfazer (TFA-006)

**Estado: pendente de execução.** Os testes de componente e o harness empacotado cobrem foco,
teclado, busy e estados, mas não substituem leitor de tela, DPI real e escala do Windows.

Executar no pacote local autorizado (sem Setup), com dados fictícios:

1. **Acesso e navegação.** Abrir a janela, confirmar h1 "Tarefas"; por teclado, alcançar
   "Lixeira" no cabeçalho (e "Abrir lixeira" no estado vazio); entrar e voltar com "Voltar".
   Verificar ordem de tabulação e que o foco não cai no body.
2. **Excluir com confirmação.** Em um cartão, acionar "Excluir"; conferir anúncio da confirmação,
   o texto de 30 dias/limite 100/descartes irreversíveis e o aviso de interrupção da portadora em
   tarefa recorrente. Confirmar com Enter e abandonar com Escape em execuções distintas.
3. **Oferta de desfazer.** Após excluir, conferir a oferta "Desfazer" na listagem (sem roubo de
   foco); acionar por teclado e verificar anúncio de sucesso e foco em "Editar" do alvo visível
   (ou ação principal quando oculto por filtro). Repetir o desfazer e conferir a recusa.
4. **Lixeira.** Entrar na área, verificar título, data local pt-BR, "Restaurar" e "Excluir
   definitivamente" por teclado; restaurar o primeiro/último/único item e conferir o foco
   (vizinho/novo último/Voltar). Esvaziar com confirmação irreversível e conferir foco em Voltar.
5. **Busy e dupla ação.** Durante as ações, pressionar Enter/clique repetidamente; confirmar que
   o controle permanece focável e nenhum comando duplica.
6. **Dimensões e zoom.** Janela mínima (360×420), normal, maximizada e zoom 200%; conferir
   rótulos, botões, diálogos e oferta acessíveis por teclado e rolagem, sem sumiço de ações.
7. **Contraste.** Texto 4,5:1 e foco 3:1 nos estados da lixeira e da oferta (há teste automatizado
   de contraste; confirmar visualmente).
8. **Leitor de tela.** Narrar: abertura da confirmação (alertdialog), anúncio de sucesso/recusa,
   oferta de desfazer como status, erros como alert e mudanças de foco descritas acima.
9. **Escala do Windows.** Repetir 3–5 com escala 125%/150% e verificar que a oferta e os diálogos
   permanecem visíveis e operáveis.

Registrar o resultado por item (PASS/FAIL/BLOCKED) com data e ambiente. Bloqueios de política são
registrados sem contorno e sem marcar sucesso.
