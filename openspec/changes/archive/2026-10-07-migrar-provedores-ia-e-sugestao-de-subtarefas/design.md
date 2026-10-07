# Design

## Context

Ver `proposal.md` — Why. Os requisitos observáveis estão nos deltas de `specs/`. Este documento registra as escolhas técnicas e as alternativas recusadas, partindo do estado real conferido na exploração de 2026-10-07:

- A extensão (`C:/QSI/Workspaces/taskflow-extension`, revisão `a763e7a0…`, somente leitura) já valida os protocolos em `src/domain/ai-provider.ts`, `src/domain/ai-subtask-suggestion.ts`, `src/application/ai/*` e `src/infrastructure/ai/*`, com specs `ai-providers` e `ai-task-assistance`.
- O app já decidiu em `docs/architecture.md` (D7) que rede e acesso ao segredo vivem no main, que a prévia é preparada no main e vinculada à requisição, e que indisponibilidade da proteção bloqueia uso — sem plaintext. A TFA-001 também lista o risco "janela oculta mantém IA viva" (separar vida de processo/janela/sessão).
- O IPC atual usa catálogo fechado por role, guardas antes do efeito (`src/main/ipc/entries.ts`, `src/main/ipc/document-sessions.ts`) e orçamentos declarados na spec `desktop-state-ipc` (1 KiB/8 KiB; captura 64 KiB).
- `src/main/shortcuts/file-preferences.ts` é o precedente de arquivo versionado no `userData` com publicação atômica (`temp` exclusivo, flush, readback, `previous`, rename e estado `UNKNOWN` bloqueando setters).
- A versão fixada do Electron (44.5.1) expõe `safeStorage` (`isEncryptionAvailable`, `encryptString`/`decryptString`) e `net.fetch` no main (tipos em `node_modules/electron/electron.d.ts`).
- `src/domain/task-subtasks.ts` usa `resolveSubtaskDrafts` (a origem usava `validateSubtaskDrafts`) com `MAX_SUBTASKS=20` e `SUBTASK_TITLE_LIMIT=200`.
- Restrições: nenhuma dependência nova; SQL2/codec4/backup/atalhos intocados; Quick Add sem IA; testes sem chamadas pagas; extensão e seu Git jamais escritos.

## Goals / Non-Goals

**Goals:**

- Preservar os comportamentos verificados da origem (provedores, validação de base, motivos fechados, prévia exata, limites, cancelamento, revisão da proposta) adaptando-os ao processo main e ao IPC do desktop.
- Garantir, por construção, que a credencial nunca chegue ao renderer, a logs ou a backups, e que a proteção indisponível nunca degrade para texto simples.
- Fechar a semântica de concorrência: uma requisição por documento, aborto e descarte em troca de configuração, fechamento, reload, crash e saída, com resposta tardia descartada sem entrega.
- Manter o catálogo IPC mínimo, versionado, com schemas exatos e orçamentos declarados, sem eventos novos.

**Non-Goals de desenho:**

- Não abstrair um cliente de IA genérico com histórico, ferramentas, streaming ou múltiplos turnos; uma requisição, uma resposta.
- Não introduzir store Pinia, chave SQL, migração de dados, mudança de backup ou de preferências.
- Não usar SDKs oficiais nem qualquer dependência nova; `fetch`/`net.fetch` bastam nos dois protocolos.
- Não criar segunda forma de editar subtarefas em paralelo à existente; a proposta só alimenta a lista do formulário.
- Não construir diálogo nativo de consentimento nesta Change (alternativa registrada em Aberto).

## Decisions

### D1 — Duas capabilities novas e um delta em `desktop-state-ipc`

Os comportamentos são separáveis: configuração/proteção/teste de provedor versus assistência no formulário. Seguir a divisão da origem (`ai-providers`/`ai-task-assistance`) mantém os deltas coesos; o catálogo e os orçamentos pertencem a `desktop-state-ipc`.

**Alternativas:** uma capability única "desktop-ai" (recusada: mistura configuração e uso, dificulta evolução independente); não usar specs (recusado: há comportamento observável novo).

### D2 — Rede e segredo somente no main, com transporte injetável

`src/application/ai/` define portas puras (`AiProviderConfigRepository`, `AiConnectionTester`, `AiSubtaskSuggester`, `AiAuthorization`); `src/main/ai/` implementa adapters. Dois executores deliberadamente separados:

- verificação: nunca lê o corpo da resposta de falha (provedores ecoam a chave em erros);
- geração: lê o corpo com limite defensivo de 64 KiB e extrai apenas o caminho mínimo do texto.

Ambos usam `redirect:'error'` mais recusa explícita de 3xx (defesa em profundidade), `cache:'no-store'`, `credentials:'omit'`, `referrerPolicy:'no-referrer'`, timeout próprio (15 s/30 s) e um `AbortController` interno somado ao cancelamento externo.

O transporte é uma função `fetch`-shaped injetada na composição. Produção usa `net.fetch` (pilha Chromium: proxy/PAC e certificados do Windows); testes injetam fakes; `fetch` global fica como alternativa de uma linha no wiring.

**Alternativas:** `fetch` global por padrão (recusado como default por falhar TLS atrás de proxy corporativo); executor único com flag `readBody` (recusado: transforma a decisão mais sensível em booleano fácil de inverter); SDK oficial (recusado pela origem e pela disciplina de zero dependência).

### D3 — Credencial em `ai.json` versionado com `safeStorage`, publicação atômica e bloqueio sem plaintext

Arquivo `<userData>/ai.json` (≤ 8 KiB), envelope versionado:

```
{ "version": 1, "revision": "<decimal>", "provider": "OPENAI|ANTHROPIC|CUSTOM",
  "apiBase": "<somente CUSTOM>", "model": "<texto>", "credential": "<base64 do ciphertext>" }
```

- `safeStorage.encryptString`/`decryptString` somente no main e somente sob demanda (decifrar no momento da requisição; nunca cachear; nunca devolver ao renderer).
- `isEncryptionAvailable()` é conferido antes de gravar/usar. Indisponível ⇒ estado `BLOCKED: PROTECTION_UNAVAILABLE`; falha de decifra ⇒ bloqueio preservando bytes, com remoção explícita como única saída.
- Publicação no padrão de `file-preferences.ts` (temp exclusivo 0600, flush, readback, `previous`, rename, releitura); estado `UNKNOWN` bloqueia novos setters até reconciliação explícita.
- Estrutura desconhecida/versão futura é recusada integralmente sem sobrescrever.
- Campo de credencial ausente no salvar preserva a existente; campo vazio não apaga.
- Não é usada cifra com material guardado no mesmo arquivo nem texto simples; o arquivo fica fora de backup/importação por construção (backup é somente tarefas).

**Alternativas:** tabela SQLite (recusada: exigiria SQL3/migração, mistura segredo com dados e amplia snapshot/backup); Windows Credential Manager via addon (recusado: dependência nativa sem ganho sobre safeStorage); plaintext avisado (proibido por D7); somente memória (possível, mas degrada o uso diário sem necessidade).

### D4 — Consentimento de credencial e de conteúdo no main, por documento e em memória

Dois escopos independentes (`CREDENTIAL`, `CONTENT`) registrados no main, com vínculo `{origin, provider, base, configRevision}` e, no conteúdo, `requestId` da preparação. Limpeza: invalidar sessão (reload/fechar/crash), salvar/remover configuração e sair. Sem persistência — evita autorização pegajosa e espelha a decisão da origem.

Uma operação dedicada `ai:authorize:v1` registra o consentimento; teste e sugestão recusam sem consentimento vigente. O renderer nunca envia um booleano de consentimento.

**Alternativas:** booleano do renderer (recusado por D7); consentimento persistido (recusado: cria autorização permanente e mais uma chave de armazenamento); diálogo nativo `dialog.showMessageBox` (endurecimento máximo, mantido em Aberto; não é o default porque a UI do formulário já concentra prévia, acessibilidade e foco).

### D5 — Catálogo IPC de oito operações `:v1`, somente manager

| Operação (wrapper) | Canal | Request/Result |
| --- | --- | --- |
| `getAiProviderStatus` | `ai:get-status:v1` | 1 KiB / 8 KiB — resumo sem segredo |
| `saveAiProviderConfig` | `ai:save-config:v1` | 8 KiB / 8 KiB — CAS `expectedRevision` |
| `removeAiProviderConfig` | `ai:remove-config:v1` | 1 KiB / 1 KiB |
| `authorizeAiUse` | `ai:authorize:v1` | 1 KiB / 1 KiB — escopo ± `requestId` |
| `testAiConnection` | `ai:test-connection:v1` | 1 KiB / 1 KiB — probe fechado |
| `prepareAiSuggestion` | `ai:prepare-suggestion:v1` | 16 KiB / 16 KiB |
| `suggestAiSubtasks` | `ai:suggest:v1` | 1 KiB / 16 KiB |
| `cancelAiSuggestion` | `ai:cancel:v1` | 1 KiB / 1 KiB |

Regras: schemas runtime exatos; guardas de role/frame/documento/sessão antes de qualquer leitura de credencial/rede; respostas validadas por bytes; erros em união fechada; sem eventos/subscriptions de IA; QUICK_ADD recusa todas as operações. O delta de `desktop-state-ipc` atualiza catálogo (35→43/14) e transporte (exceção de 8 KiB/16 KiB medida em UTF-8 antes de efeito).

**Alternativas:** evento de progresso (recusado: a UI sinaliza andamento localmente; não vale mais um canal); generic RPC (recusado pelo padrão do projeto); consentimento embutido como campo booleano (recusado em D4).

### D6 — Prévia preparada no main; geração executa o snapshot

`prepareAiSuggestion{title, description, existingSubtaskCount}` monta o conteúdo com a mesma função pura de domínio (instruções fixas, corte de 1.000 antes da composição, normalização de quebras), valida orçamento e estado, e devolve `{requestId, content, descriptionTruncated, origin, consentRequired}`. O renderer exibe exatamente `content` — a igualdade entre visto e transmitido vira propriedade da construção.

Alterar título/descrição re-prepara e invalida o `requestId` anterior (a UI marca recomposição e exige nova confirmação). `suggestAiSubtasks{requestId}` executa o snapshot armazenado; a resposta é interpretada pelo parser tolerante e validada com os limites de `task-subtasks.ts`, cortada pelas vagas restantes (`existingSubtaskCount` validado 0–20) com `discardedByLimit`. A proposta devolve apenas títulos; aceitar acrescenta linhas ao formulário pelo formato `SubtaskDraft` sem `id` e sem `done`. Nada é persistido; salvar segue `create`/`update` e o desfazer existente.

**Alternativas:** renderer monta a string e envia opaca (recusado: D7 exige preparação no main e vínculo com a requisição); main revalida a string recebida (impossível sem duplicar a montagem); JSON estruturado na resposta (recusado pela origem: quebraria CUSTOM/gateways).

### D7 — Concorrência: uma requisição por documento, revisão monotônica e descarte de resposta tardia

- Um registro por documento (`ticket.key`) com no máximo um pedido em voo; segundo acionamento responde `BUSY`.
- `configRevision` monotônica no store. Salvar/remover configuração: incrementa a revisão, **aborta todos** os pedidos e limpa consentimentos.
- Fechar/reload/crash: `sessions.onInvalidated` aborta o pedido do documento, descarta `requestId` e consentimentos.
- Suspender/ocultar: recomendação de abortar (a entrega pós-epoch do preload seria rejeitada; abortar evita custo). Sair/logoff: aborto global na parada do serviço.
- Resposta tardia: antes de entregar, revalidar sessão corrente **e** revisão capturada; divergência ⇒ descarte silencioso (sem entrega, sem log de conteúdo). Cancelamento do usuário prevalece sobre resposta que chegou.
- `cancelAiSuggestion{requestId}` só atinge pedido do próprio documento.

**Alternativas:** permitir vários pedidos (recusado: custo em dinheiro e ambiguidade de UI); entrega mesmo com config trocada (recusado pela spec e por D7).

### D8 — Limites, protocolos e constantes preservados

| Constante | Valor | Origem |
| --- | --- | --- |
| Timeout de teste | 15 s | origem (`ai-connection-tester`) |
| Timeout de geração | 30 s | origem (`ai-subtask-suggester`) |
| Corte da descrição | 1.000 caracteres | origem |
| Teto de saída | 3.000 tokens | origem |
| Corpo de geração | 64 KiB | origem (`ai-generation`) |
| Títulos | 1–200, até 20 vagas | `task-subtasks.ts` |

Detalhes de protocolo: `OPENAI` base `https://api.openai.com/v1`, `Authorization: Bearer`; `CUSTOM` mesmo protocolo com base validada; `ANTHROPIC` base `https://api.anthropic.com`, `x-api-key` + `anthropic-version: 2023-06-01` (+`anthropic-dangerous-direct-browser-access`, inócuo no main sem `Origin`, mantido por paridade); `stream:false`; `max_tokens` mantido (compatível com gateways; modelos de raciocínio OpenAI que o recusem caem em `UNEXPECTED_RESPONSE`, documentado).

**Alternativas:** `max_completion_tokens` por provedor (adiado; muda matriz de testes sem necessidade demonstrada); remover o header da Anthropic (adiado; reavaliar com prova real).

### D9 — UI no manager e no formulário; Quick Add intocado

- Área de provedores como seção de configuração do manager (no padrão de `DesktopSettings.vue`): provedor, base (somente CUSTOM), modelo, credencial `type=password` com revelação explícita, marca de credencial salva, aviso de origem, consentimento, testar com fallback mínimo, remover com confirmação, estados bloqueados.
- Painel no `TaskForm.vue` do manager: ação de sugerir com motivos de indisponibilidade, prévia literal + origem + aviso de corte, aviso de consentimento, progresso/cancelar, proposta com seleção/edição e aceitar/descartar; foco e ARIA conforme os padrões já usados.
- Quick Add não ganha nenhum elemento, operação ou CSP de rede; o teste de catálogo garante isso.

**Alternativas:** modal próprio (adiado: mais superfície sem ganho); IA no Quick Add (fora de escopo por decisão de produto e pelo catálogo).

### D10 — Testes e evidências

Porta de cópia revisada dos candidatos P11/P12 (`ai-provider.test`, `ai-adapters.test`, `ai-subtask-suggestion-service.test`, `TaskFormAiSuggestion.test`, `stored-ai-config.test`, `backup-ai-credential.test`), adaptando `validateSubtaskDrafts` → `resolveSubtaskDrafts` e `chrome.permissions` → consentimento no main. Fakes de transporte e de `safeStorage`; servidor local opcional em loopback para redirect/limites; nenhuma chamada paga. AI01–AI16 (roadmap e tasks) cobrem domínio, contratos, IPC (role/sessão/bytes), UI, troca de provider em voo, exclusão de backup e catálogo no pacote. A prova real com provedor fica opcional e autorizada, com waive explícito se não houver ambiente.

**Alternativas:** chamadas reais em CI (recusado: custo e segredo); confiar em mocks para provar Windows (recusado: mantém-se a distinção de níveis do `test-strategy`).

## Risks / Trade-offs

- **Proxy/inspeção corporativa quebrar HTTPS no main** → `net.fetch` na pilha Chromium; transporte injetável permite trocar sem tocar domínio; validar em rede real quando autorizado.
- **Blob DPAPI de outro usuário/máquina (perfil móvel)** → falha de decifra bloqueia e preserva o arquivo; só remoção explícita; documentar que a proteção não cobre malware da mesma conta.
- **Consentimento forjável por renderer comprometido** → registro no main limita envios acidentais e mantém a decisão vinculada; endurecimento com diálogo nativo permanece em Aberto; a credencial nunca chega ao renderer.
- **Prévia assíncrona obsoleta** → renderer exibe o texto devolvido pelo main e invalida `requestId` a cada re-preparação; sugestão com token antigo é recusada.
- **Vazamento pelo corpo do provedor** → executores separados, corpo de geração limitado, erro capturado descartado, log mínimo e teste com corpo contendo trecho da chave.
- **Custo em dinheiro** → requisição única, teto de saída, sem retry, cancelamento e aborto em ocultar/suspender.
- **`max_tokens` recusado por modelos de raciocínio OpenAI** → documentado; mudança de parâmetro exige nova decisão/testes.
- **Contagens/orçamentos de spec divergirem do código** → deltas de `desktop-state-ipc` fecham 43/14 e 8/16 KiB; teste de catálogo e orçamentos falham cedo.
- **Efeito colateral no fluxo existente** → sem configuração não há UI, operação, requisição nem escrita; backup/importação e undo permanecem nos caminhos atuais.

## Migration Plan

Não há migração de dados: a ausência de `ai.json` significa "nenhum provedor configurado" e nenhuma instalação existente precisa de conversão. A capability é aditiva e inerte sem configuração. Reversão: remover operações/UI e o serviço; um `ai.json` órfão é inofensivo e pode ser removido pelo próprio app. Gates: lint, cinco typechecks, Vitest/volume, build, `validate`, OpenSpec estrito, `package:win`/`verify:package`/`smoke:packaged` no apply, com harness de IA sem rede paga.

## Open Questions

- Rótulo/textos exatos da área de provedores e do painel de sugestão (ajuste de interface; não muda specs nem tarefas).
- Endurecer o consentimento com diálogo nativo do main (decisão posterior com evidência de necessidade; o default registrado no design é o consentimento em memória no main).
- Reavaliar `max_completion_tokens` por provedor e o header da Anthropic apenas com prova real autorizada; nenhuma mudança entra sem revisão.
