# Proposal

## Why

O desktop integrado até a TFA-008 ainda exige abrir o gerenciamento para criar tarefas e não oferece a captura e as entradas de teclado da extensão. A TFA-009 adapta esses fluxos ao Windows usando exclusivamente links/textos copiados por gesto explícito, preservando o trabalho aberto e a autoridade do processo proprietário.

## What Changes

- Janela compacta singleton Quick Add, independente do gerenciamento, com criação confirmada pelo contrato existente, descrição revisável e origem opcional. Abrir inicia vazio somente quando não existe rascunho; reabrir conserva preenchimento.
- Capturar conteúdo copiado por botão na superfície atual ou ação global destinada ao Quick Add. URL HTTP/HTTPS isolada preenche origem e deixa título vazio com foco no título, conforme decisão humana. Texto segue título200/descrição4000; texto com link não infere origem. Nenhuma tarefa é salva pela captura.
- Pendência única por destino, substituição anunciada somente da pendência, revisão em estado seguro, descarte explícito e entrega confirmada. TTL10min antes da apresentação; memória transitória após apresentação, incluindo fechamento para bandeja.
- Três ações globais personalizáveis: QUICK_ADD (sugestão Ctrl+Shift+K), OPEN_TASK_MANAGER (Ctrl+Shift+L) e CAPTURE_CLIPBOARD (sem combinação inicial). Abrir Quick Add não lê clipboard. Mostrar preferência e registro observado separadamente, conflitos e alternativas por botão/bandeja.
- Preferências locais versionadas próprias fora do backup, com concorrência entre clientes, recuperação de falhas e resultado incerto sem repetição automática. Não migrar SQL2/codec4 nem trocar stack/runtime/dependências.
- **BREAKING:** catálogo IPC passa de26 para35 operações finitas no gerenciamento, com facade reduzida de14 no Quick Add. Status/controle desktop passam para v2, mantendo versões dos comandos de tarefas. Roles, admissão, invalidadores e eventos passam a distinguir as duas superfícies; ocultar uma não retira a outra.
- Roteiros verificáveis de domínio, componentes, fronteiras, falhas e Windows real. Mocks/build não atestam clipboard, foco ou registro global no produto instalado.

## Capabilities

### New Capabilities

- `desktop-quick-add`: entrada compacta independente, rascunho, confirmação, preservação de contexto e teclado.
- `desktop-clipboard-capture`: classificação de conteúdo copiado, limites, entrega/pendência por destino e revisão sem sobrescrita.
- `desktop-global-shortcuts`: três ações globais, personalização, preferências duráveis e estado de registro nativo.

### Modified Capabilities

- `desktop-foundation`: catálogo por role, segurança equivalente nas duas janelas e disponibilidade das novas entradas.
- `desktop-state-ipc`: contratos fechados de captura/atalhos/navegação interna, budgets e controle por superfície.
- `desktop-task-management`: captura e Quick Add acessíveis sem destruir edição/filtros ou confundir confirmações entre documentos.
- `desktop-application-lifecycle`: ocultar/reabrir cada janela independentemente; suspensão/saída globais e recuperação pela bandeja.

## Impact

Dependências: TFA-008 arquivada/integrada e contratos das TFA-003/004; base `5dd68ff12e20babab5264966e6d3f65bff8a2862`, branch `codex/tfa-009-adaptar-quick-add-captura-e-atalhos-globais`. Afeta composição/lifecycle/main IPC, adapters Electron de clipboard/globalShortcut/preferências, contratos/preload, entrada Vue/Pinia por janela e testes. Um owner, coordenador SQL e scheduler continuam atendendo ambas.

Origem somente leitura `C:/QSI/Workspaces/taskflow-extension`, revisão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`: reutilização seletiva revisada de funções, UX e testes portáveis; sem executar ferramentas ou alterar arquivos/Git ali. Evidências e alternativas estão no design e no roadmap.

Excluídos: navegador embutido, extensão auxiliar, abas, título/favicon/rede automática, polling/histórico de clipboard, HTML/RTF/bookmark/OCR/arquivos, merge/autosave de drafts ou recuperação após Sair/crash, IA/redesign/dashboard/backend/sync, hooks livres/serviço, novas dependências, distribuição/instalação corporativa e outras Changes. Esta entrega é planejamento para revisão; não autoriza apply, commit, publicação ou archive.
