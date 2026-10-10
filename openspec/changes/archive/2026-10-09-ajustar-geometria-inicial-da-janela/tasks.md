# Tasks

## 1. Cálculo puro da geometria

- [x] 1.1 Criar `src/main/desktop/window-geometry.ts` com a função pura de cálculo dos bounds iniciais (`workArea` + largura mínima → `{ x, y, width, height }`), sem importar Electron; verificação: `npm run typecheck:main` passa com o módulo novo.
- [x] 1.2 Criar testes unitários em `tests/main/window-geometry.test.ts` cobrindo taskbar em cada borda (offsets de `x`/`y` da `workArea`), display à esquerda/acima (coordenadas negativas), clamp inferior (terço < 360), clamp superior (terço > largura útil), arredondamento e determinismo; verificação: os testes novos passam em `npm run test`.

## 2. Aplicação na janela principal

- [x] 2.1 Em `createSurface` (`src/main/index.ts`), calcular e aplicar os bounds iniciais quando `role === 'MANAGER'` usando `screen.getPrimaryDisplay().workArea` e o `minWidth` das opções; Quick Add (480×560), `resizable`, mínimos, frame e demais opções permanecem inalterados; verificação: `npm run typecheck` e inspeção do diff mostram mudança restrita ao caminho MANAGER.
- [x] 2.2 Conferir o comportamento em execução de desenvolvimento no display 1920×1032: janela nasce em `x=1280`, `y=0`, `640×1032`; mover/redimensionar e fechar para bandeja/reabrir preservam os limites do usuário; reiniciar reaplica a geometria inicial; Quick Add mantém 480×560; verificação: checklist manual registrado com os valores observados.

## 3. Gate `a11y` e documentação

- [x] 3.1 Atualizar o check `initialBounds` do cenário `a11y` (`src/main/harness/product-harness.ts`) para asserções relacionais com a `workArea` do display da janela (borda direita, topo/base) e a regra do terço com clamp computada no próprio harness, mais `isResizable()`; manter `minimumSize` 360×420; verificação: `npm run typecheck` passa e a inspeção mostra a igualdade 780×560 removida.
- [x] 3.2 Revalidar o zoom 200% no novo default (640) executando o cenário `a11y` no pacote; registrar a evidência; regressão real de layout recebe correção pontual (sem redesign) ou limitação registrada — o gate não é afrouxado silenciosamente; verificação: saída do smoke com os checks do `a11y` e o registro da decisão.
- [x] 3.3 Atualizar `docs/desktop-task-management.md` (evidência do cenário `a11y`: geometria inicial nova no lugar de 780×560) e conferir que nenhuma outra doc afirma a geometria antiga; verificação: varredura por "780×560" sem menções obsoletas e doc revisada.

## 4. Verificação de integração

- [x] 4.1 Executar `npm run validate` (lint, cinco typechecks, testes, volume e build) na branch e registrar o resultado; verificação: comando completo verde.
- [x] 4.2 Executar `package:win --publish never`, `verify:package` e `smoke:packaged` no pacote e registrar as saídas dos cenários afetados (`a11y`, `ui-bench`, `tasks`), sem retirar ou afrouxar gate; verificação: evidências anexadas ao `verification.md`.
- [x] 4.3 Executar validação OpenSpec estrita da Change (`--type change`) e do conjunto (`--all`) e registrar; verificação: ambas passam sem issues novos.
- [x] 4.4 Executar o `opsx:verify` e gerar `verification.md` na Change com requisito/cenário/task/evidência, limitações (multimonitor/DPI reais não verificados nesta máquina) e pendências; verificação: relatório presente, coerente e submetido à aprovação antes do archive.
