# Assistência de IA, provedores e credenciais

A assistência de IA é **opcional** e vive somente no gerenciamento: o Quick Add não oferece configuração nem sugestão, e nenhuma requisição parte sem ação direta do usuário. O aplicativo continua funcionando por completo offline; sem configuração salva, nenhuma área de IA muda os fluxos de tarefas, captura, atalhos, lembretes, backup ou lixeira.

Rede e segredo ficam exclusivamente no processo main. O renderer recebe apenas resumo sem credencial (`provider`, `apiBase`, `origin`, `model`, `hasCredential`, revisão e consentimentos vigentes) e nunca um texto de chave.

## Configuração do provedor

Três provedores: `OPENAI`, `ANTHROPIC` e `CUSTOM` compatível com OpenAI (cobre gateways e servidores locais). Nos oficiais a base é fixa (`https://api.openai.com/v1` e `https://api.anthropic.com`), sem campo editável. Em `CUSTOM` a base informada aceita `https` em qualquer host e `http` somente em `localhost`, `127.0.0.1` e `[::1]`; credenciais embutidas, cadeia de consulta e fragmento são recusados, e a barra final é normalizada. A origem de destino é exibida em destaque antes de qualquer envio.

Existe no máximo uma configuração ativa. Salvar substitui a anterior por completo e exige a revisão corrente (`expectedRevision`); revisão antiga é recusada sem sobrescrever nada (`STALE_REVISION`). O campo de credencial nunca é preenchido com o valor salvo: deixá-lo em branco preserva o ciphertext existente, e somente a remoção explícita apaga a credencial.

## Arquivo `ai.json` e proteção

A configuração é persistida em `<userData>/ai.json`, versão 1, até 8 KiB:

```
{ "version": 1, "revision": "<decimal>", "config": {
    "provider": "OPENAI|ANTHROPIC|CUSTOM", "apiBase": "<somente CUSTOM>",
    "model": "<texto>", "credential": "<base64 do ciphertext>" } }
```

A credencial é cifrada por `safeStorage`/DPAPI. A decifra é sob demanda no momento da requisição, nunca em leitura de resumo, nunca em cache e nunca em direção ao renderer. Remover grava um envelope sem configuração (`config: null`) com a revisão incrementada: a numeração não reinicia e gravações antigas continuam sendo recusadas pelo CAS. Estrutura desconhecida, versão futura ou revisão fora do formato são recusadas integralmente e o arquivo é preservado; somente a remoção explícita o substitui.

A publicação é atômica, no mesmo padrão de `shortcuts.json`: temporário exclusivo 0600 no mesmo diretório, escrita completa com flush, readback, `previous`, rename e releitura. Estado `UNKNOWN` (readback divergente, temporário órfão ou falha após a publicação) bloqueia novos setters; salvar ou remover novamente dispara a reconciliação explícita que descarta somente o temporário próprio, sem restaurar `previous`.

Estados bloqueados e o que resta ao usuário:

- `PROTECTION_UNAVAILABLE`: o mecanismo nativo não está disponível. Gravar e usar ficam bloqueados — **nunca há degradação para texto simples** — e remover continua possível.
- `CREDENTIAL_UNREADABLE`: o ciphertext não decifra neste perfil (outro usuário/máquina). O arquivo é preservado e o uso bloqueado; somente remover.
- `INCOMPATIBLE`: envelope desconhecido ou versão futura. Nada é sobrescrito; somente remover.
- `RESOURCE_LIMIT`, `UNAVAILABLE`, `STALE_REVISION` e `UNKNOWN`: limites e incertezas de leitura/gravação, sempre sem sobrescrita silenciosa.

A proteção é do DPAPI do usuário/máquina: ela não promete resistência a malware na mesma conta, a perfis móveis ou a cópia do arquivo para outro computador. Nesses casos a decifra falha, o arquivo é preservado e o uso fica bloqueado.

### Credencial fora de renderer, logs e backups

A credencial não é devolvida por leitura, não aparece em mensagens, erros ou logs e não é incluída em backup, restauração ou importação. O backup exporta **tarefas** e nada mais: um `ai.json` no perfil não entra no arquivo, e um backup com propriedades `ai`/`credential` injetadas é ignorado pela validação — nenhuma configuração é criada a partir dele.

## Teste de conexão

O teste só ocorre por acionamento direto e exige consentimento de credencial. A forma padrão consulta a **listagem de modelos** e não envia conteúdo de tarefa. Quando o endereço não oferece listagem, a interface informa e oferece, como alternativa explícita, o **envio mínimo** com o conteúdo literal fixo `ping` e um token de resposta. O teste tem limite de 15 s, é cancelável, não segue redirecionamentos (`redirect: 'error'` mais recusa explícita de 3xx), usa `cache: 'no-store'`, `credentials: 'omit'` e `referrerPolicy: 'no-referrer'`, e **nunca lê o corpo da resposta** — é ali que provedores ecoam trechos da chave.

Toda falha é um motivo de conjunto fechado (`INVALID_CREDENTIALS`, `ENDPOINT_UNREACHABLE`, `MODEL_LIST_UNSUPPORTED`, `TIMEOUT`, `UNEXPECTED_RESPONSE`), no máximo com a origem e o código de estado. O log registra somente motivo, origem e status.

## Consentimentos

Há dois escopos independentes, registrados somente em memória no main e por documento:

- **CREDENTIAL**: autoriza o envio da credencial à origem configurada (teste de conexão).
- **CONTENT**: autoriza o envio do título e da descrição de uma preparação específica (sugestão).

O vínculo é `{origem, provedor, base, revisão da configuração}` e, no conteúdo, também o `requestId` da prévia: autorizar uma prévia não autoriza outra, e autorizar credencial não autoriza conteúdo. Trocar provedor/base, salvar ou remover configuração, recarregar, fechar, cair ou sair limpa os consentimentos; **remover revoga**. O renderer nunca envia um booleano de consentimento — a operação dedicada `authorizeAiUse` registra o escopo no main. Sem consentimento vigente, nenhuma requisição é feita.

## Sugestão de subtarefas

Com provedor configurado, o formulário do gerenciamento oferece **Sugerir subtarefas**, indisponível com motivo legível quando falta título ou quando as 20 vagas já estão ocupadas.

A **prévia é preparada no main** e devolve o `requestId`, o texto exato, a origem, o aviso de corte e a necessidade de consentimento. O conteúdo transmitido é construído por uma fonte única: instruções fixas do TaskFlow, título e descrição atuais do formulário (nunca os persistidos), com a descrição cortada em 1.000 caracteres antes da composição e sem divisão de par surrogate. Nenhum outro dado sai do dispositivo — identificadores, prazos, responsáveis, etiquetas, recorrência, status, URL de origem ou subtarefas existentes não entram. O renderer exibe exatamente o texto devolvido: editar título ou descrição re-prepara e invalida o `requestId` anterior.

A geração executa o snapshot preparado: no máximo **uma requisição por documento** (um segundo acionamento responde `BUSY`), limitada a **30 s**, com teto de saída de **3.000 tokens**, sem streaming e **sem retry**. O usuário pode cancelar; o cancelamento atinge somente o `requestId` da própria janela. Salvar ou remover configuração aborta pedidos em curso e limpa consentimentos; fechar, recarregar, cair e sair descartam prévia e resposta; ocultar/suspender também aborta. Resposta tardia é descartada sem entrega e sem registro de conteúdo.

A resposta é interpretada por um parser tolerante (marcadores e repetições removidos) e validada pelas **mesmas regras da digitação manual**: título obrigatório de até 200 caracteres, um nível, limite de 20 subtarefas. Itens inválidos são descartados sem impedir os demais; itens além das vagas são cortados com aviso (`discardedByLimit`); sem item válido, o motivo é apresentado e o formulário permanece intacto. A proposta é revisável: selecionar, editar e aceitar acrescenta **somente linhas novas** (sem `id`, sem marcação e sem persistência); descartar não altera a lista. Nada é gravado pela IA — salvar segue o `create`/`update` existente, com a oferta de desfazer.

O corpo da resposta é limitado defensivamente a 64 KiB e nunca é registrado; o texto extraído serve apenas para compor a proposta em memória. Título e descrição são tratados como **dados, nunca como instrução**: o desfecho máximo de qualquer resposta é uma proposta de títulos sujeita à validação e à confirmação do usuário, sem alterar destino, configuração ou dados da tarefa.

## Contratos IPC

Oito operações `:v1`, somente no manager, com schemas exatos, erros/bloqueios/motivos em uniões fechadas e guardas de role/frame/documento/sessão antes de qualquer leitura de credencial ou rede:

| Operação | Canal | Request | Result |
| --- | --- | --- | --- |
| `getAiProviderStatus` | `ai:get-status:v1` | 1 KiB | 8 KiB |
| `saveAiProviderConfig` | `ai:save-config:v1` | 8 KiB | 8 KiB |
| `removeAiProviderConfig` | `ai:remove-config:v1` | 1 KiB | 8 KiB |
| `authorizeAiUse` | `ai:authorize:v1` | 1 KiB | 8 KiB |
| `testAiConnection` | `ai:test-connection:v1` | 1 KiB | 8 KiB |
| `prepareAiSuggestion` | `ai:prepare-suggestion:v1` | 16 KiB | 16 KiB |
| `suggestAiSubtasks` | `ai:suggest:v1` | 1 KiB | 16 KiB |
| `cancelAiSuggestion` | `ai:cancel:v1` | 1 KiB | 8 KiB |

Os orçamentos são medidos em bytes UTF-8 do JSON serializado **antes de qualquer efeito**; excesso recebe `RESOURCE_LIMIT` sem gravar nem executar. Não há eventos nem subscriptions de IA, e nenhum conteúdo de IA sai em evento. O catálogo do manager passa a 43 operações; o Quick Add permanece com 14 e recusa todas as operações de IA, inclusive um request forjado pela superfície rápida.

## Privacidade, limites e prova real

Fora do escopo: conta, backend, sincronização, telemetria, uso automático ou agendado de IA, streaming, histórico de conversa, ferramentas, SDKs, novas dependências e IA no Quick Add. A rede usa `net.fetch` (pilha Chromium, com proxy/PAC e certificados do sistema) atrás de um transporte injetável; testes usam fakes e um servidor loopback e **nenhuma chamada paga**.

A prova com provedor real é opcional e exige autorização explícita; sem ambiente/chave autorizados, a verificação registra o **waive** e não anuncia sucesso real. Ela é a única forma de confirmar comportamento atrás de proxy corporativo, parâmetros de modelos de raciocínio OpenAI (`max_tokens`) e o cabeçalho de paridade da Anthropic.

## Evidência

Testes cobrem domínio portátil (bases/recusas, conteúdo, parser, proposta), serviços de aplicação (CAS, consentimento, uma requisição por documento, cancelamento, descarte), arquivo versionado com proteção fictícia (roundtrip, recusas integrais, faults por fase e kill real antes/depois da publicação), adapters com fake e loopback (cabeçalhos, extração, redirect, corpo acima do limite, falhas fechadas sem corpo) e IPC (role/frame/bytes, mapeamentos, sessão invalidada). O cenário `ai` do harness empacotado exercita a configuração e a sugestão com transporte fake, sem chamada paga. O que não está comprovado por esses testes — chamada real autorizada, DPAPI entre perfis e proxy corporativo — permanece registrado como pendência/waive na verificação da Change.

**Atualização TFA-012 (2026-10-10, candidato C instalado):** uma credencial fictícia de provedor `CUSTOM` (loopback) foi criada pela UI instalada; o arquivo `ai.json` (196 B) não contém o texto simples da chave e sobreviveu byte a byte ao uninstall/reinstall, reabrindo como `CONFIGURED`/`hasCredential` com proteção `AVAILABLE` (DPAPI local, mesma conta). Chamada real a provedor, DPAPI entre contas e proxy corporativo continuam **NOT_RUN/waive**; nenhuma sugestão foi aplicada automaticamente. Detalhes em [desktop-homologation-results.md](desktop-homologation-results.md).
