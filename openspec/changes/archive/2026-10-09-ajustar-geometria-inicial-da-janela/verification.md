# Verificação — ajustar-geometria-inicial-da-janela (TFA-013)

**Data:** 2026-10-09
**Branch:** `codex/tfa-013-ajustar-geometria-inicial-da-janela` (base `main` em `a700496`, PR #11/TFA-011 integrado)
**Schema:** spec-driven (OpenSpec 1.14.0, raiz local)
**Status:** apply concluído (11/11 tasks) — relatório **aprovado explicitamente pelo usuário em 2026-10-09**; archive, commit, push e PR autorizados no mesmo pedido (merge/distribuição não autorizados).

## 1. Aderência aos requisitos e cenários

### Requisito: Geometria inicial da janela principal ancorada à direita (ADDED)

Implementação: `src/main/desktop/window-geometry.ts` (`calcularBoundsIniciais`: largura `round(workArea.width / 3)`
com piso no mínimo e teto na área útil; `x` na borda direita; `y`/`height` da área útil) e
`src/main/index.ts` (`createSurface`, somente `role === 'MANAGER'`, `screen.getPrimaryDisplay().workArea`,
`minWidth` das opções; Quick Add preserva 480×560 e o posicionamento atual).

| Cenário | Cobertura | Evidência |
| --- | --- | --- |
| Abertura ancorada à direita | Testes unitários + gate empacotado + checklist dev | `tests/main/window-geometry.test.ts` (13 testes: âncora/borda direita, topo/base, terço com clamp, arredondamento, determinismo); cenário `a11y` no pacote **13/13** com `initialBounds` relacional à `workArea`, `resizable` e `minimumSize` 360×420 — bounds observados `1280,0,640×1032` sobre `workArea` 1920×1032; checklist dev (item 1). |
| Tela estreita aplica o piso | Testes unitários (sintéticos) | `tests/main/window-geometry.test.ts`: terço < 360 → 360; workArea de 600 → x=240 dentro da área útil; workArea 300 → teto na própria área útil. **Limitação:** display estreito real não exercitado no pacote nesta máquina (sem tal display); o clamp é coberto pela função pura. |
| Display primário é a referência | Implementação + testes sintéticos | `screen.getPrimaryDisplay()` em `createSurface`; testes com offsets de taskbar em cada borda e coordenadas negativas (display à esquerda/acima). **Limitação:** multimonitor real não verificável nesta máquina (um display). |

### Requisito: Geometria inicial vale somente na abertura (ADDED)

Implementação: geometria aplicada apenas em `createSurface` (criação). `hide()`/`show()` na instância viva
(`src/main/desktop/lifecycle.ts`) preservam os limites; novo lançamento e recriação (`rendererGone` → `create`)
passam por `createSurface` e reaplicam a geometria.

| Cenário | Cobertura | Evidência |
| --- | --- | --- |
| Sessão viva preserva a escolha do usuário | Checklist dev + testes existentes de lifecycle | Execução dev: mover/redimensionar para `(300,150) 900×700` aceito; fechar para bandeja oculta com processo vivo; reabrir pela segunda instância (`second-instance` → `lifecycle.open()`) preservou `(300,150,900×700)`. `tests/main/desktop-lifecycle.test.ts` e `tests/main/two-surface-lifecycle.test.ts` cobrem hide/show sem recriação. |
| Novo lançamento reaplica | Checklist dev | Encerrar e abrir de novo em dev: janela nasceu novamente em `1280,0,640×1032`; diferenças da sessão anterior não persistiram (sem persistência de geometria — D5). |
| Recriação após falha do renderer | Construção + teste existente de recriação | `rendererGone` → `open` → `ports.create` → `createSurface` reaplica a geometria por construção; `desktop-lifecycle.test.ts` cobre a recriação de superfície única. **Limitação:** os bounds após crash do renderer não são assertados no cenário empacotado (não há cenário de crash de renderer com leitura de bounds no smoke). |

## 2. Tasks (11/11)

| Task | Verificação executada | Evidência |
| --- | --- | --- |
| 1.1 módulo puro | `npm run typecheck:main` | exit 0 com o módulo novo. |
| 1.2 testes unitários | `vitest run tests/main/window-geometry.test.ts` | 13/13 testes passando. |
| 2.1 aplicação no MANAGER | `npm run typecheck` (cinco projetos) + inspeção do diff | exit 0; diff restrito ao caminho MANAGER (`screen.getPrimaryDisplay().workArea`, `minWidth` extraído como constante); Quick Add intacto. |
| 2.2 checklist dev | Execução dev (`npm run dev`) com observação Win32 e bridge real via CDP | Checklist com valores observados: abertura `1280,0,640×1032`; mover/redimensionar `(300,150,900×700)`; fechar→bandeja oculta com processo vivo; reabrir preserva; reiniciar reaplica; Quick Add `(720,236,480×560)` (480×560). |
| 3.1 gate `a11y` relacional | `npm run typecheck` + inspeção | igualdade `780×560` removida; asserções com a `workArea` do display da janela (borda direita, topo/base), regra do terço com clamp recalculada no harness, `isResizable()`; `minimumSize` 360×420 mantido; sem menções a 780 no harness. |
| 3.2 zoom 200% no default 640 | Cenário `a11y` no pacote | `zoom200CancelReachable` **true** com o default de 640; nenhuma regressão de layout — correção pontual não foi necessária; gate não afrouxado. |
| 3.3 documentação | `docs/desktop-task-management.md` + varredura | evidência `a11y` atualizada (13/13, geometria derivada da `workArea`, observado 1280,0,640×1032, mínimo mantido, zoom 200% no default 640); varredura por "780×560" sem menções obsoletas fora de registros históricos (roadmap de exploração/proposta e artefatos da própria Change). |
| 4.1 `npm run validate` | Execução completa | lint, cinco typechecks, **109 arquivos/1425 testes + 11 skipped**, volume 2/2 (M12: rebuild 93,49/878,21 ms; SQL p95 27,05/15,58 ms), build main/preload/renderer. |
| 4.2 pacote + smoke | `package:win`, `verify:package`, `smoke:packaged` | build-id `0.2.1-win-x64-a7004968ac3b167855eb1304e39abcd607ebc254-local-1791589871634`; `verify:package OK` (ASAR 13 arquivos na allowlist, `asInvoker/uiAccess=false`; SHA-256 do exe/asar/Setup registrados); `smoke:packaged OK` com **42 PASS / 0 FAIL** — `a11y` 13/13, `ui-bench` todos os gates true, `tasks`/demais cenários aprovados. |
| 4.3 OpenSpec estrito | CLI | Change `--type change --strict`: 1/1; `--all --strict`: 19/19 (18 specs + Change), sem issues novos. |
| 4.4 verificação | Este relatório | `verification.md` presente na Change, submetido à aprovação antes do archive. |

## 3. Aderência ao design (D1–D7)

| Decisão | Situação |
| --- | --- |
| D1 display primário | Seguida — `screen.getPrimaryDisplay().workArea` na criação. |
| D2 largura com clamp | Seguida — `min(workArea.width, max(360, round(workArea.width / 3)))`; harness recomputa a regra de forma independente (sem auto-confirmação). |
| D3 função pura + testes | Seguida — `src/main/desktop/window-geometry.ts` sem importar Electron; testes em `tests/main/`. |
| D4 somente MANAGER, na criação | Seguida — Quick Add mantém 480×560 (checklist dev e cenário `entries` do pacote sem regressão); `resizable`/mínimos/frame inalterados. |
| D5 sem persistência | Seguida — nenhum estado novo; reiniciar reaplica (observado). |
| D6 gate `a11y` relacional + zoom revalidado | Seguida — asserções relacionais, `isResizable()`, mínimo mantido; zoom 200% aprovado no default 640; gate não retirado nem afrouxado. |
| D7 documentação | Seguida — evidência do `a11y` atualizada; README não descreve geometria (permanece como está; revisão pós-archive conforme AGENTS.md item 38). |

## 4. Evidências dos gates

- **Unitário:** `tests/main/window-geometry.test.ts` — 13/13 (log local `.tmp/tfa013-*`).
- **Dev (checklist 2.2):** valores observados registrados na seção 2; auxiliares em `.tmp/` (ignorado): `tfa013-window.ps1`, `tfa013-cdp.mjs`, `tfa013-task-2-2-checklist.md`.
- **`npm run validate`:** log `.tmp/tfa013-validate2.log` — verde completo.
- **Pacote:** log `.tmp/tfa013-package3.log` (build-id) e `.tmp/tfa013-verify-package.log` (`verify:package OK`).
- **Smoke:** `.tmp/tfa013-smoke2.log` — `smoke:packaged OK` (42 PASS); evidência detalhada do harness em `release/candidates/<build-id>/product-harness-evidence.json` (não versionado): `a11y` 13/13 com `bounds 1280,0,640×1032`, `workArea 1920×1032`, `expectedWidth 640`; `ui-bench` 1.000: montagem 308,64 ms, p95 44,25 ms, heartbeat 43,9 ms; 10.000: montagem 2.677,87 ms, p95 521,49 ms, heartbeat 527,8 ms.
- **OpenSpec:** Change estrita 1/1; `--all` estrito 19/19.

### Transientes de carga (registro honesto)

A **primeira** execução do smoke (`.tmp/tfa013-smoke.log`) terminou com 41 PASS / 1 FAIL: `heartbeatWithinBudget`
no `ui-bench` de 1.000 (408,8 ms vs ≤250 ms) sob carga da máquina (Eclipse/Java/Chrome ativos; o volume M12
também oscilou no mesmo período e passou depois). Reexecuções focadas do `ui-bench` no pacote mostraram
heartbeat **43,5–65,9 ms** (aprovado) com outliers aleatórios de carga em outros gates (Quick Add >2 s uma vez;
montagem de 1.000 em 8,8 s outra vez), confirmando ruído ambiental. A reexecução completa em máquina ociosa
passou com todos os gates verdes (42 PASS). Nenhum gate foi retirado ou afrouxado.

## 5. Limitações

- **Multimonitor real e escala DPI não verificados nesta máquina** (um display 1920×1080, `workArea` 1920×1032, escala 100%); cobertos apenas por testes sintéticos (offsets de taskbar em cada borda e coordenadas negativas) e pelo registro de risco do design. A fonte (`workArea`) é um snapshot da abertura.
- **Display estreito no pacote:** o piso de 360 não foi exercitado em execução real empacotada (sem display estreito aqui); coberto pela função pura e previsto para o runner de CI.
- **Evidência `a11y` roteirizada** no exe empacotado; não substitui leitor de tela, escala DPI ou inspeção humana, e não certifica instalação.
- **Recriação pós-crash do renderer** recebe a geometria por construção e pela cobertura existente de recriação; os bounds não são assertados nesse caminho no pacote.
- **Checklist dev do Quick Add** usou o bridge público real do renderer via CDP porque atalhos globais não registram no perfil dev (`PROFILE_DISABLED`, por design).
- **`prepare-nsis.mjs` regenera `build/nsis/*` com CRLF** neste checkout (codificação dos `.ps1` em UTF-16LE); a regeneração incidental foi revertida para o HEAD e não integra esta Change.

## 6. Pendências

1. **Aprovação explícita deste relatório** — obtida em 2026-10-09 ("Pode aprovar o relatório. Rode o archive, commit, faça o push e abra o PR").
2. Archive — executado em 2026-10-09 na mesma branch, com specs consolidadas em `openspec/specs/desktop-application-lifecycle/spec.md` (2 requisitos ADDED) e atualização de README/roadmap.
3. Commit/push/PR — autorizados pelo usuário no mesmo pedido; merge e distribuição **não** autorizados.

## 7. Avaliação final

Nenhum issue crítico. Sem divergências de requisito/design; cenários cobertos por testes, checklist dev e gates
do pacote. Relatório aprovado explicitamente pelo usuário em 2026-10-09; archive autorizado na sequência.
