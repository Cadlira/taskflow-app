# Proposal

## Why

O desktop integrado até a TFA-009 ainda não oferece a assistência opcional de IA da extensão: provedores BYOK, teste de conexão e sugestão de subtarefas com prévia e consentimento. A TFA-010 migra essa capability preservando os protocolos e limites verificados, movendo rede e acesso ao segredo para o processo main, com proteção nativa (safeStorage/DPAPI) e autorização por origem — sem conta, backend, sincronização ou uso automático de IA.

## What Changes

- Domínio portátil copiado por revisão: provedores `OPENAI`/`ANTHROPIC`/`CUSTOM` compatível com OpenAI (incluindo servidores locais), bases oficiais fixas, validação `https` remoto/`http` somente loopback, origem resolvida e credencial intocada preservada.
- Credencial BYOK cifrada com `safeStorage`/DPAPI em arquivo próprio versionado no `userData`, com publicação atômica no padrão de `shortcuts.json`. Indisponibilidade da proteção ou falha de decifra bloqueiam gravação/uso sem plaintext, preservam o arquivo e oferecem somente remoção. A credencial nunca chega ao renderer por leitura, log ou backup.
- Teste de conexão somente por gesto, por listagem de modelos, com alternativa explícita de envio mínimo (conteúdo literal `ping`, um token). Timeout, cancelamento, recusa de redirecionamento e motivos em conjunto fechado; nenhum conteúdo de tarefa.
- Consentimento de **credencial** e de **conteúdo** independentes, por origem e configuração, em memória no main por documento. Salvar/remover configuração e trocar origem/provedor/base exigem novo consentimento; remover revoga.
- Prévia exata preparada no main e vinculada a `requestId`, conteúdo, configuração e sessão. Edição de título/descrição recompõe e invalida a preparação anterior; descrição cortada em 1.000 caracteres antes da prévia.
- Geração única por acionamento, saída limitada a 3.000 tokens, timeout de 30 s e cancelamento; resposta tardia descartada. Troca de provedor/configuração em pedido em curso aborta e descarta; fechar, reload, crash e sair descartam; recomendação de abortar também em ocultar/suspender.
- Saída interpretada por parser tolerante e validada pelas mesmas regras da digitação de subtarefas (títulos 1–200, dedupe, vagas restantes), apresentada como proposta revisável que só acrescenta linhas não concluídas ao formulário. Nada é persistido pela IA; salvar segue `create`/`update` existente e continua oferecendo desfazer.
- **BREAKING:** catálogo IPC do manager passa de 35 para 43 wrappers com oito operações `:v1` novas; o Quick Add permanece com 14 e sem IA. O transporte de estado ganha exceção declarada de 16 KiB para prévia/resultado de sugestão, com schemas exatos, CAS por `expectedRevision` e guardas de role/sessão/bytes antes de qualquer efeito.
- Rede e segredo somente no main, com executores separados de verificação (corpo nunca lido) e geração (corpo limitado a 64 KiB), transporte injetável (`net.fetch` recomendado por integrar proxy/certificados do sistema), `redirect:'error'`, recusa de 3xx e log apenas de motivo/origem/status.

## Capabilities

### New Capabilities

- `desktop-ai-providers`: configuração BYOK, proteção da credencial no main, consentimento e autorização por origem, teste de conexão e contrato de protocolo por provedor, sem rede automática.
- `desktop-ai-task-assistance`: prévia literal preparada no main, consentimento de conteúdo, geração única cancelável, validação da saída pelas regras de subtarefa e proposta revisável que não persiste.

### Modified Capabilities

- `desktop-state-ipc`: catálogo de estado (35 para 43 wrappers no manager), orçamentos com exceção de 16 KiB para operações de IA e operações novas somente de manager com intenções finitas.

## Impact

Contratos (`src/contracts`), bridge/preload, renderer (área de provedores no manager e painel no formulário de tarefa), composição do main (novo serviço `ai`, store de credencial, transporte, consentimento), domínio/aplicação portáveis de IA e testes/harness; catálogo do preload e specs `desktop-state-ipc`/novas capacidades. Nenhuma dependência nova; SQL2/codec4/backup/atalhos permanecem intocados.

Dependência: TFA-009 arquivada e integrada; base `c2508703a2581848771f72ffafe8f010fc025cbc` (PR #9), branch `codex/tfa-010-migrar-provedores-ia-e-sugestao-de-subtarefas`. Origem somente leitura `C:/QSI/Workspaces/taskflow-extension`, revisão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`: reutilização seletiva revisada de funções e testes portáveis; sem executar ferramentas ou alterar arquivos/Git ali.

Excluídos: conta/backend/sync/telemetria, uso automático ou agendado de IA, streaming/histórico de conversa/ferramentas/SDKs, IA no Quick Add, edição de prompt pelo usuário, novas dependências, alteração de SQL2/codec4/backup/atalhos, distribuição/instalação (TFA-011), homologação (TFA-012) e outras Changes. Esta entrega é planejamento para revisão; não autoriza apply, commit, publicação ou archive.
