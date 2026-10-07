# Verificação — TFA-010

Data: **2026-10-07**. Change: `migrar-provedores-ia-e-sugestao-de-subtarefas`, schema `spec-driven`, OpenSpec **1.14.0** (raiz local, sem store). Implementação autorizada explicitamente em 2026-10-07 pela mensagem “Aprovo proposal.md, design.md, os dois deltas novos, o delta de desktop-state-ipc e tasks.md da TFA-010 apresentados em 2026-10-07 e autorizo implementar esta Change conforme esses artefatos.” Branch `codex/tfa-010-migrar-provedores-ia-e-sugestao-de-subtarefas`, base `c2508703a2581848771f72ffafe8f010fc025cbc` (merge do PR #9). Trabalho salvo na árvore de trabalho, **sem commit** — archive, consolidação de specs, push, PR, merge e TFA-011 não iniciados, conforme a autorização.

**Resultado para revisão: implementação e gates automáticos concluídos; a prova com provedor real não foi executada e fica registrada como waive explícito.** São **38/38 tasks**; a única parcela não comprovada é a chamada real a provedor (AI16), dependente de ambiente/chave autorizados.

**Aprovação humana registrada em 2026-10-07:** o usuário respondeu à entrega deste relatório com **“Aprove a validação, faça o archive, commit, faça o push e abra o PR”**, aprovando o relatório e o waive registrado e autorizando archive, commit, push e PR na mesma branch. Archive, consolidação de specs e README final foram executados nessa sequência; merge/distribuição e TFA-011 permanecem fora da autorização.

## Scorecard

| Dimensão | Resultado |
| --- | --- |
| Completude | **38/38 tasks**. Os requisitos dos três deltas têm implementação identificada: **19 ADDED** (8 em `desktop-ai-providers`, 10 em `desktop-ai-task-assistance` e 1 no delta de `desktop-state-ipc`) e **2 MODIFIED** (catálogo e transporte no delta de `desktop-state-ipc`); nenhum REMOVED/RENAMED. |
| Correção | Mapeamento de implementação e testes para os **21 requisitos ADDED/MODIFIED** (19 ADDED + 2 MODIFIED) e seus cenários no anexo AI01–AI16 abaixo. **Scenario Coverage com parcela não verificada**: chamada real a provedor, DPAPI entre perfis/máquinas e proxy corporativo não exercitados (waive/pendência registrados). |
| Coerência | D1–D10 revisados contra domínio, aplicação, main, contratos, preload, renderer, testes e documentação. Padrões existentes preservados (CAS/revisão, publicação atômica no padrão de `shortcuts.json`, contratos fechados, guardas antes do efeito); nenhuma dependência nova; SQL2/codec4/backup/atalhos intocados; Quick Add sem IA. |

Foram lidos proposal, design, os três deltas e tasks pelos paths de `openspec instructions apply`. O tracking está configurado e legível; `openspec status` indica artefatos de planejamento completos, não implementação integral. Não houve `skip_specs`. A extensão `C:\QSI\Workspaces\taskflow-extension` e seu Git permaneceram estritamente somente leitura: HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4` com árvore limpa; nenhum build/teste/instalação/escrita/configuração executados ali.

## Resultado implementado

- **Domínio portátil** (`src/domain/ai-provider.ts`, `src/domain/ai-subtask-suggestion.ts`): união OPENAI/ANTHROPIC/CUSTOM, bases oficiais fixas, `validateApiBase` (https; http só loopback; sem userinfo/query/fragmento; barra final normalizada), origem resolvida, credencial intocada preservada; fonte única do texto com instruções fixas e corte de 1.000 sem substituto órfão; parser tolerante com dedupe; proposta validada por `resolveSubtaskDrafts`/`MAX_SUBTASKS`/`SUBTASK_TITLE_LIMIT` e cortada por vagas com `discardedByLimit`. Usa `parseUrl` estrutural (`src/domain/url.ts`) e cancelamento estrutural (`ai-abort.ts`), sem DOM/Node no núcleo.
- **Aplicação pura** (`src/application/ai`): portas de repositório, tester, suggester, consentimento (`CREDENTIAL`/`CONTENT` por documento, em memória, com vínculo origem/provedor/base/revisão/`requestId`) e registro de pedidos (um em voo por documento, cancelamento por `requestId`, aborto por documento/todos); serviço de configuração com CAS `expectedRevision`, estados NONE/CONFIGURED/BLOCKED e resumo sem segredo; serviço de sugestão com prévia preparada no main, consumo do `requestId`, revisão monotônica e descarte de resposta tardia.
- **Credencial protegida** (`src/main/ai/file-ai-config.ts`, `native-protection.ts`): `ai.json` v1 no `userData` (≤ 8 KiB), ciphertext de `safeStorage`/DPAPI, decifra sob demanda, publicação atômica (temp exclusivo 0600, flush, readback, `previous`, rename, releitura) e `UNKNOWN` bloqueando setters até reconciliação; recusa integral de versão futura/corrompido/ilegível preservando bytes; remoção grava envelope sem configuração com revisão incrementada. Proteção indisponível e decifra falha bloqueiam sem plaintext; remover é a única saída.
- **Rede no main** (`ai-probe.ts`, `ai-generation.ts`, adapters, `net-transport.ts`): transporte injetável com `net.fetch` na produção; verificação nunca lê o corpo (15 s); geração lê com limite de 64 KiB (30 s); `redirect:'error'` + recusa explícita de 3xx, `cache:'no-store'`, `credentials:'omit'`, `referrerPolicy:'no-referrer'`; motivos fechados e log somente motivo/origem/status em `stderr` (sem `console`, sem corpo, sem URL completa).
- **IPC e superfícies**: oito operações `:v1` somente no manager (`src/main/ipc/ai.ts`), com admissão de role/frame/origem/documento, schema e orçamentos medidos em UTF-8 antes do efeito (1/8/16 KiB), erros/bloqueios/motivos fechados, revalidação de sessão antes de entregar, sem eventos; contratos em `src/contracts/ai.ts`, cliente estrito no preload por allowlist (`AI_CHANNEL_LIST`) e catálogo 43/14 (`surface-catalog.ts`). Quick Add permanece com 14 operações sem IA.
- **Renderer**: seção de provedores no manager (`AiProviderSettings.vue`: provedor/base/modelo, credencial `type=password` com revelação explícita, marca de credencial salva, origem, consentimento antes do teste, formas de teste, remover com confirmação, estados bloqueados) e painel no formulário (`TaskFormAiSuggestion.vue`: ação com motivos, prévia literal + corte + origem, consentimento, progresso/cancelar, proposta com seleção/edição/aceitar/descartar) integrado ao `TaskForm.vue` apenas quando não compacto; aceitar só acrescenta linhas sem `id`/`done`; salvar segue create/update + undo e nada é persistido pela IA.
- **Concorrência**: salvar/remover incrementa a revisão, aborta pedidos e limpa consentimentos; invalidar sessão descarta consentimento, prévia e pedido; suspender aborta; sair aborta tudo e limpa consentimentos; resposta tardia é descartada sem entrega e sem registro de conteúdo.
- **Documentação**: `docs/ai-assistance.md` (formato, bloqueios, remoção, exclusão de backup, contratos, orçamentos e matriz de recusas); `docs/architecture.md` (D7 implementado) e `docs/parity-matrix.md` (P11/P12 implementadas) atualizados sem anunciar paridade além do comprovado.

Pontos de revisão: `src/domain/ai-provider.ts:65`, `src/domain/ai-subtask-suggestion.ts:153`, `src/main/ai/file-ai-config.ts:434`, `src/main/ipc/ai.ts:52`, `src/renderer/src/components/ai/TaskFormAiSuggestion.vue` e `AiProviderSettings.vue`.

## Gates executados

Runtime existente: **Node 24.21.0 / npm 11.21.0** (runtime extraído na TFA-002). Electron 44.5.1, Chromium 152.0.7977.130, SQLite 3.53.4. Nenhuma instalação de dependência; nenhuma chamada paga; extensão intacta.

| Comando | Evidência / resultado |
| --- | --- |
| `npm run validate` | **Exit 0** no estado final: lint sem warnings; cinco typechecks; **100 arquivos / 1.337 testes aprovados + 11 skipped**; volume separado **2 testes aprovados**; build de main, dois preloads e renderer. |
| `openspec validate migrar-provedores-ia-e-sugestao-de-subtarefas --type change --strict --no-interactive` | Change válida. |
| `openspec validate --all --strict --no-interactive --json` | **17/17**: 1 change + 16 specs, zero falha (INFOs herdados de requisito longo não são falhas). |
| `openspec validate --archived --strict --no-interactive --json` | **9/9** Changes arquivadas válidas. |
| `npm run package:win` | Exit 0: build + ícone + NSIS x64 `--publish never`; Setup **não executado**. |
| `npm run verify:package` | Exit 0 no pacote final: 13 arquivos ASAR na allowlist; sem addon/updater/segredos; executável e Setup x64 `asInvoker/uiAccess=false`. |
| `npm run smoke:packaged` | **Exit 0, 42 PASS**, incluindo o cenário `ai` (**14 verificações**) e `roles43/14`; catálogo, negativas, migração, crash, drain, bench, UI, lembretes, backup e a11y preservados. |
| `git diff --check` | Exit 0; aviso LF/CRLF é comportamento pré-existente de configuração. |

Hashes do pacote final verificado e usado no smoke:

| Artefato | SHA-256 |
| --- | --- |
| TaskFlowApp.exe | `09c433fe3d07fcd0ff5ab1fde935065cfc43caa57ee99f8aef9f8988adbcc9d1` |
| app.asar | `ec0e44d4d125741ae071a21ad96361f97437e98bf79823bcbee71ec0d74039ab` |
| Setup | `71cf30515e9d4e9392098189c173682b3c39661427508d43762f624ad180c626` |

O Setup é evidência de geração/inspeção, sem prova de instalação ou execução em conta padrão. Logs locais ignorados em `.tmp/tfa010-*.log`.

## Aderência AI01–AI16

| Caso | Implementação e evidência | Limites |
| --- | --- | --- |
| AI01 | Sem configuração não há rede nem decifra: `tests/application/ai-provider-service.test.ts` (NONE sem decifra/rede), `tests/main/ipc-ai.test.ts` (Quick Add recusado sem tocar repositório/rede) e formulário sem seção quando não configurado. `getAiProviderStatus` só lê o arquivo. | Nenhum. |
| AI02 | União/bases fixas/loopback/userinfo/query/fragmento/barra: `tests/domain/ai-provider.test.ts`; CUSTOM e origem no renderer. | Nenhum. |
| AI03 | Gravação só por `save`, cifrada, sem plaintext; campo vazio preserva; `hasCredential`; proteção indisponível e decifra falha bloqueiam preservando bytes; remoção apaga; resumo/log/backup sem segredo: `tests/main/file-ai-config.test.ts` (15), `tests/main/file-ai-config-kill.test.ts` (7 barreiras), `tests/main/backup-ai-credential.test.ts`, `tests/renderer/ai-provider-settings.test.ts`. | DPAPI real entre perfis/máquinas não exercitado (proteção fictícia nos testes); waive. |
| AI04 | Consentimento por origem/escopo; credencial não autoriza conteúdo; re-consentir após troca/salvar; remover revoga; sem consentimento nada é enviado: testes de serviço e IPC; limpeza em invalidar/salvar/remover/sair. | Nenhum. |
| AI05 | Teste por gesto; `MODEL_LIST`; `MINIMAL_COMPLETION` explícito com `ping`/1 token; 15 s; cancelável; redirect/3xx recusados; corpo nunca lido; motivos fechados: `tests/main/ai-adapters.test.ts`, `tests/main/ai-loopback.test.ts` (servidor local, sem chamadas pagas). | Proxy corporativo real não exercitado; waive. |
| AI06 | Prévia idêntica ao transmitido; corte de 1.000 sinalizado antes; somente título/descrição/instruções; edição re-prepara e invalida: domínio, serviço, IPC e renderer (prévia literal + re-preparação). | Nenhum. |
| AI07 | Uma requisição em voo (BUSY), 3.000 tokens, sem streaming, 30 s, cancelar descarta, sem retry: serviço, adapters (corpo `stream:false`, `max_tokens`) e IPC. | Modelos de raciocínio OpenAI com `max_tokens` só em prova real; pendência documentada. |
| AI08 | Parser/dedupe; inválidos descartados; corte por vagas com aviso; sem item válido não altera o formulário: domínio e serviço. | Nenhum. |
| AI09 | Selecionar/editar/aceitar acrescenta linhas sem `done`/`id`, preservando existentes; descartar não altera; salvar usa create/update + undo; fechar sem salvar não persiste; IA não escreve: `tests/renderer/ai-task-form-suggestion.test.ts` e teste de não persistência do serviço. | Nenhum. |
| AI10 | QUICK_ADD recusa as oito operações; tokens/pedidos por documento; invalidar sessão aborta e limpa; a outra superfície não é afetada: `tests/main/ipc-ai.test.ts`, catálogo do preload, harness empacotado (`quickMainEnforcement`, `managerCatalog43`, `quickCatalog14`). | Nenhum. |
| AI11 | Troca de configuração em voo aborta e descarta; consentimentos limpos; resposta tardia sem entrega nem log; novo pedido usa a configuração nova: barreiras de serviço e IPC; salvar/remover; suspender; sessão invalidada. | Nenhum. |
| AI12 | Falhas fechadas sem corpo/chave; URL completa/cabeçalhos/body ausentes; log somente `reason`/`origin`/`status` (stderr): adapters com 401 ecoando a chave, loopback, renderer (mensagens sem segredo). | Nenhum. |
| AI13 | Conteúdo externo tratado como dado (instrução fixa de desautorização antes do texto); resposta não altera destino/configuração e só vira proposta: `tests/domain/ai-subtask-suggestion.test.ts` (AI13) e ausência de qualquer efeito além de títulos. | Nenhum. |
| AI14 | Schemas exatos, extras/versões recusados, orçamentos 1/8/16 KiB medidos em UTF-8, códigos fechados: `tests/contracts/ai-contract.test.ts`, IPC e catálogo do preload. | Nenhum. |
| AI15 | Pacote: catálogo 43/14 e Quick Add inalterado; ASAR sem segredo (verify:package); cenário `ai` do smoke com transporte/proteção fictícios (14 verificações, sem chamada paga); backup sem credencial. | Nenhum. |
| AI16 | Prova real com provedor autorizado **não executada**: sem ambiente/chave autorizados nesta sessão. Registro de **waive explícito** a confirmar pelo usuário; nenhum sucesso real é anunciado. | Waive/pendência. |

## Pendências e limitações (não marcar como comprovado)

- **AI16 — chamada real a provedor**: waive; exige ambiente e chave do usuário. É a única forma de confirmar proxy corporativo, parâmetros de modelos de raciocínio e o cabeçalho de paridade da Anthropic em produção.
- **DPAPI real entre perfis/máquinas**: os testes usam proteção fictícia determinística; o adapter `safeStorage` existe, mas a falha de decifra entre perfis não foi reproduzida com DPAPI real.
- **Proxy/PAC corporativo com `net.fetch`**: apenas fake/loopback; rede real atrás de inspeção não exercitada.
- **Revisão humana de acessibilidade** da área de provedores e do painel de sugestão (foco/ARIA) não executada; há testes de componente e padrões existentes, sem campanha humana.
- **Suspender/sair no pacote**: aborto coberto por testes de serviço/IPC e pela composição; não há cenário de harness específico para suspensão com IA em voo.
- Nenhuma dessas pendências foi convertida em sucesso; todas permanecem fora do que os gates comprovam.

## Próximo passo

Relatório entregue para **aprovação humana**. Após aprovação, a etapa autorizada seguinte é o archive na mesma branch, com consolidação dos deltas (incluindo o de `desktop-state-ipc`), atualização final do README conforme o item 38 do AGENTS.md e registro no roadmap. Archive, consolidação de specs, commit, push, PR, merge e TFA-011 permanecem **não iniciados**.
