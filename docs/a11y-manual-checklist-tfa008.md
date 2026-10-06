# Roteiro humano — acessibilidade de lembretes, opções e ciclo de vida (TFA-008)

**Estado: pendente de execução.** Os testes de componente (foco, teclado, erro por item,
contraste de tokens, suspensão preservando rascunho) e o harness não substituem leitor de
tela, DPI real, zoom e escala do Windows.

Executar no pacote local autorizado (sem Setup), com dados fictícios:

1. **Formulário de lembretes.** Criar/editar uma tarefa com prazo; adicionar lembretes por
   teclado (select de tipo, antecedência/unidade, presets, AT), conferir foco no seletor da
   nova linha, remover com foco na linha vizinha e o limite de 10 desabilitado visível.
2. **Erro por item.** Provocar erro de lembrete (ex.: AT depois do prazo/instante repetido)
   e conferir anúncio, `aria-invalid`/`aria-describedby` e foco no primeiro inválido.
3. **Fuso.** Simular mudança de fuso com prazo/AT alterado; conferir o painel de revisão,
   o texto “salvo × novo” e o foco; confirmar e restaurar em execuções distintas.
4. **Opções do aplicativo.** Na área secundária, percorrer por teclado os avisos de close/
   graça/crash, o estado de lembretes e o checkbox “Iniciar com o usuário”; conferir estados
   OFF/ON/DISABLED_EXTERNALLY/UNAVAILABLE/UNKNOWN, busy e mensagens como status.
5. **Consulta de lembrete.** Com filtro ativo e rascunho aberto, acionar a localização;
   conferir o heading focado, o cartão de consulta fora dos filtros, “Voltar à lista” e que
   o rascunho/filtros permanecem.
6. **Close/minimize/quit.** X/Alt+F4 oculta com tray válido; reabrir por **Abrir** conserva
   rascunho/filtros; minimizar conserva sessão; **Sair** encerra sem reter processo.
7. **Dimensões e zoom.** Janela mínima (360×420), normal, maximizada e zoom 200%; conferir
   rótulos, botões, diálogos, destaque temporário e erros acessíveis por teclado/rolagem.
8. **Contraste.** Confirmar visualmente 4,5:1/3:1 no formulário, opções e destaque (há teste
   automatizado dos tokens; o destaque usa superfície neutra com borda).
9. **Leitor de tela.** Narrar: rótulos/erros dos lembretes, painel de revisão de fuso, estado
   de lembrete/inicialização, anúncio da consulta localizada e da indisponibilidade.
10. **Escala do Windows.** Repetir 1–6 com escala 125%/150% e conferir visibilidade/operabilidade.

Registrar o resultado por item (PASS/FAIL/BLOCKED) com data e ambiente. Bloqueios de política
são registrados sem contorno e sem marcar sucesso.
