# Design

## Context

Ver `proposal.md` — Why. Estado atual relevante:

- Ponto único de criação: `createSurface()` em `src/main/index.ts` cria MANAGER (780×560) e QUICK_ADD (480×560) com mínimo 360×420, sem `x`/`y`. O gerenciador é criado uma vez por execução (startup ou recriação); fechar para bandeja usa `hide()` e reabrir usa `show()` na mesma instância (`src/main/desktop/lifecycle.ts`).
- Nenhuma spec cobria geometria; o contrato novo entra em `desktop-application-lifecycle` (delta em `specs/`).
- Gate existente: o cenário `a11y` do smoke empacotado afirma `initialBounds` 780×560, `minimumSize` 360×420 e roda zoom 200% sobre esse default (`src/main/harness/product-harness.ts`); `docs/desktop-task-management.md` registra a evidência.
- Testes de main vivem em `tests/main/` (ex.: `desktop-lifecycle.test.ts`); módulos puros desse diretório não importam Electron.
- Ambiente autorizado: um display primário 1920×1080, `workArea` 1920×1032 (taskbar 48 px). Imagem-exemplo: janela ancorada à direita, altura útil, ~⅓ de largura.

## Goals / Non-Goals

**Goals:**
- Calcular e aplicar a geometria inicial da janela principal na criação, com regra proporcional e clamps, de forma testável sem Electron.
- Preservar `resizable`, mínimos (360×420), frame e UI existente; Quick Add intocado.
- Evoluir o gate `a11y` para validar as relações com a `workArea` e a regra do terço.
- Deixar explícita a semântica "vale na abertura; sessão viva preserva a escolha; novo lançamento reaplica".

**Non-Goals:**
- Persistir geometria entre lançamentos; mirar o display do cursor; multimonitor além do primário; always-on-top/pin/snap; reancorar durante a sessão; mudar o Quick Add; redesign de UI; qualquer outra funcionalidade.

## Decisions

**D1 — Display primário.** `screen.getPrimaryDisplay().workArea` na criação.
- Alternativas: display do cursor (`getDisplayNearestPoint`) — rejeitado por determinismo e por não haver multimonitor no ambiente autorizado; último display usado — exigiria persistência (fora do escopo). Evolução futura possível trocando a fonte da `workArea`.

**D2 — Largura proporcional com clamp.** `width = min(workArea.width, max(360, round(workArea.width / 3)))`.
- Alternativas: manter 780 (rejeitado pelo usuário; em 1920 destoa do exemplo), constante ~660 (não escala em outras resoluções), percentual com teto fixo (complexidade sem benefício). Em 1920 → 640; em telas de 1024 (runner de CI) → 341 → 360.

**D3 — Função pura em `src/main/desktop/window-geometry.ts`.** Assinatura conceitual `calcularBoundsIniciais(workArea, larguraMinima) → { x, y, width, height }`, sem importar Electron; `createSurface` injeta a `workArea` real e o `minWidth` já constante nas opções.
- Alternativas: cálculo inline no `createSurface` (não testável isoladamente; difícil de verificar sem empacotar), cálculo no renderer (fora de autoridade).
- Testes unitários em `tests/main/window-geometry.test.ts`: taskbar em cada borda (offsets de `x`/`y`), monitor à esquerda/acima (coordenadas negativas), clamp inferior e superior, arredondamento do terço, determinismo.

**D4 — Aplicação somente no MANAGER, na criação.** `createSurface` usa a geometria quando `role === 'MANAGER'`; QUICK_ADD mantém 480×560 e posicionamento atual. A leitura de `screen` na criação é segura: todos os caminhos de criação ocorrem após `app.whenReady()`. Recriações (`rendererGone` → `create`) recebem a geometria inicial — declarado como abertura nova.

**D5 — Sem persistência de geometria.** Sessão viva preserva o que o usuário fizer; novo lançamento reaplica.
- Alternativas: persistir bounds com validação contra displays — contradiz o objetivo "sempre abrir ancorada"; persistir só largura com posição reancorada — estado/validação sem pedido; reavaliar em Change própria se desejado.

**D6 — Gate `a11y` evolui para asserções relacionais.** Substituir a igualdade 780×560 por: borda direita = `workArea.x + workArea.width`, topo/base = área útil, largura = regra do terço computada no próprio harness (sem reutilizar a função de produção, para evitar auto-confirmação), `isResizable()` verdadeiro e `minimumSize` mantido. O zoom 200% passa a rodar no default de 640 e sua evidência é registrada; regressão real de layout recebe correção pontual (sem redesign) ou limitação registrada — sem afrouxar o gate silenciosamente.

**D7 — Documentação.** Atualizar a evidência em `docs/desktop-task-management.md`; o README permanece como está (não descreve geometria; atualização pós-archive segue o item 38 do AGENTS.md, se aplicável).

## Risks / Trade-offs

- [Zoom 200% numa janela mais estreita pode reprovar verificações de alcançabilidade] → revalidar via smoke `a11y` e registrar evidência; correção pontual de layout dentro do recorte ou limitação aprovada.
- [Runner de CI com display virtual estreito] → clamps e asserções derivadas da `workArea` real; nada hardcoded de resolução.
- [Multimonitor/DPI real não verificável nesta máquina] → testes sintéticos (offsets e coordenadas negativas); limitação registrada na verificação.
- [Viewport diferente pode afetar gates do `ui-bench` (D10)] → reexecutar `smoke:packaged` e registrar; nenhuma retirada/afrouxamento de gate sem revisão.
- [Expectativa de janela "fixa"] → semântica declarada (móvel/redimensionável; reaplica só na abertura).
- [Mudança da `workArea` durante a sessão (taskbar auto-hide, resolução)] → a geometria é um snapshot da abertura; não reancorar depois, por decisão.

## Migration Plan

Sem migração de dados. Rollback = reverter o commit (restaura 780×560 centralizado). Empacotamento e instalador não mudam. Evidências: testes unitários, `npm run validate`, OpenSpec estrito, `package:win --publish never`, `verify:package` e `smoke:packaged` (`a11y` e demais cenários afetados).
