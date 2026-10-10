# Proposal

## Why

A janela principal (Tarefas) abre hoje centralizada e com 780×560 por padrão, sem posição definida. O usuário trabalha com ela como painel lateral — ancorada à direita do monitor, ocupando a altura útil — e precisa reposicioná-la manualmente a cada lançamento. O comportamento desejado foi registrado e explorado na TFA-013, com decisões confirmadas em 2026-10-09 (display primário; largura ≈⅓ da área útil; somente o gerenciador; sem persistência).

## What Changes

- A janela principal (MANAGER), **na criação**, passa a calcular seus limites a partir da área útil (`workArea`) do display primário:
  - `height` = `workArea.height` e `y` = `workArea.y` (altura útil a partir do topo);
  - `width` = `round(workArea.width / 3)`, com piso no mínimo da janela (360) e teto na própria `workArea`;
  - `x` = `workArea.x + workArea.width − width` (borda direita).
- A geometria vale **apenas na abertura**: depois de aberta, valem tamanho/posição definidos pelo usuário — mover/redimensionar e fechar para bandeja/reabrir preservam (`hide()`/`show()` na mesma instância); novo lançamento do aplicativo reaplica a geometria inicial; recriação após crash do renderer conta como abertura nova.
- Sem persistência de geometria entre sessões (comportamento intencional: a janela sempre abre ancorada à direita).
- A janela permanece redimensionável e móvel; mínimos (360×420), frame, menu oculto e o restante da UI não mudam.
- O Quick Add (480×560) **não** muda de geometria.
- O gate `a11y` do smoke empacotado passa a validar as relações da geometria inicial (borda direita, topo/base da área útil, regra do terço com clamp) em vez da igualdade 780×560; o mínimo 360×420 é mantido e o zoom 200% é revalidado no novo default.
- Documentação técnica afetada atualizada (`docs/desktop-task-management.md`, evidência do cenário `a11y`).

## Capabilities

### New Capabilities

Nenhuma — o comportamento é um requisito novo dentro de uma capability existente.

### Modified Capabilities

- `desktop-application-lifecycle`: novo requisito de geometria inicial da janela principal — âncora à direita com altura útil e largura de um terço (proporcional com clamp), aplicada somente na abertura, com a sessão viva preservando a escolha do usuário e novo lançamento reaplicando a geometria inicial.

## Impact

- `src/main/index.ts` — `createSurface()` (somente o papel MANAGER; Quick Add intacto).
- Novo módulo puro de cálculo de geometria em `src/main/desktop/` (sem dependência de Electron) com testes unitários em `tests/main/`.
- `src/main/harness/product-harness.ts` — cenário `a11y` (`initialBounds`).
- `docs/desktop-task-management.md` — evidência do cenário `a11y`.
- Sem mudanças de IPC, preload, persistência, schema, dependências, instalador ou identidade.
- Verificação: testes unitários do cálculo, `npm run validate`, OpenSpec estrito, `package:win --publish never`, `verify:package` e `smoke:packaged` (cenário `a11y`).
