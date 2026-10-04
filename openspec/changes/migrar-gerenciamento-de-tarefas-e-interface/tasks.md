# Tasks

Checklist do **apply futuro**, com todas as 41 tasks pendentes. Proposal/design, os três deltas e este checklist foram aprovados explicitamente em 2026-10-04, conforme registro no roadmap. A implementação ainda depende de novo pedido de apply; o pedido atual autoriza registrar a aprovação, commit e push do planejamento. D1–D10 e G01–G20 estão no design/roadmap. O escopo conserva dados avançados sem ações futuras, exclui Excluir/lixeira/undo e não executa Setup, distribui, instala dependências ou altera a extensão. Cada grupo entrega seus testes e documentação quando sua implementação existir; README factual somente após archive autorizado.

## 1. Aprovação, inventário e fronteiras

- [ ] 1.1 Conferir aprovação humana dos artefatos e escolhas D2–D10, branch/base e root/Git próprios; registrar início de apply no roadmap e verificar ausência de decisão material pendente antes de escrever código, preservando o diff preexistente.
- [ ] 1.2 Selecionar os arquivos/trechos/testes portáveis da origem documentada, registrar inventário/licença/hash e comparar por revisão; verificar que não entram WXT, Chrome, serviços avançados, .git, dados, segredos, node_modules ou builds, sem executar ferramenta de escrita na origem (D1/G19).
- [ ] 1.3 Adaptar as fronteiras de módulos/porta desktop e composição, sem duplicar tipos/codecs já portados; verificar testes arquiteturais positivos/negativos, lint e typecheck com núcleo independente e renderer sem autoridade (D1/G17).
- [ ] 1.4 Definir DTOs/uniões por operação, draft versus patch/null, revisão decimal e catálogo v1; verificar testes de tipos/guards com chaves extras, nulls indevidos, auditoria/avançados, ID histórico e revisão fora de representação (D2/G17/G19).
- [ ] 1.5 Documentar contratos públicos/bytes/erros e inventário de cópia em docs operacionais pertinentes; conferir exemplos contra DTOs e testes 1.2–1.4 e deixar funcionalidades ainda não implementadas identificadas como tal.

## 2. Regras básicas portáveis

- [ ] 2.1 Portar seletivamente normalização/validação dos nove campos básicos e criação, sem validar/limpar campos avançados ocultos; verificar os casos mínimos/completos, defaults, trim, limites exatos/excedidos, tags e URLs com testes revisados de task-draft (G01/G02).
- [ ] 2.2 Implementar aplicação do patch sobre a Task atual, ausência versus limpeza e preservação dos campos históricos intactos; verificar fixtures longas/Unicode, opcionais, série/subtarefas/reminders/processedFor e dueAt com precisão, sem truncamento ou novo limite de codec (G03/G19).
- [ ] 2.3 Portar as transições de status simples e auditoria; verificar DONE/completedAt, saída de DONE, reabrir TODO, mesmo status e identidade/createdAt preservados, com clock determinístico (G01/G03/G04).
- [ ] 2.4 Portar task-queries e comparadores; verificar substring/caixa/acentos/campos atuais inclusive subtarefas, filtros AND, três ordens/desempates e fronteiras now-1/now/+24h/+24h+1 com terminais/sem prazo (G05–G07).
- [ ] 2.5 Registrar regras básicas e diferenças temporárias na documentação de paridade/testes; conferir comportamento descrito com 2.1–2.4 e evitar anúncio de UI ou recursos ainda não entregues.

## 3. Casos de uso e IPC de escrita

- [ ] 3.1 Implementar criação no main por clock/UUID injetados e coordenador, verificando colisão em tarefas/lixeira e três tentativas limitadas; testar que nenhum ID existente é substituído e falha final não confirma/eventa (D3/G01/G11).
- [ ] 3.2 Implementar update/status condicionais por contentRevision dentro da unidade; verificar barreiras de duas sessões, NOT_FOUND, ABA, tarefas distintas, claim isolado, no-op e conservação dos dados avançados (G03/G04/G12/G19).
- [ ] 3.3 Aplicar guards de recorrência e de mudança efetiva de prazo/status com reminders no main; testar bypass por IPC, edição independente válida e nenhuma geração/reconciliação/scheduler/expurgo por conveniência (G19).
- [ ] 3.4 Integrar handlers dedicados, preload explícito e catálogo com guardas na admissão/execução/saída; verificar iframe/origem/frame/sessão/reload/versão/keys/protótipo inválidos com zero leitura/efeito antes da autorização e isolamento intacto (G17).
- [ ] 3.5 Aplicar 64 KiB de request/8 KiB de resposta sem alterar limites de leitura; testar JSON UTF-8/envelope/escaping máximo, valores históricos excessivos, erros fechados por campo, commit/no-op/rollback, ack curto e resposta perdida sem replay (D4/G02/G10/G11/G17).
- [ ] 3.6 Atualizar arquitetura/persistência/runbook/paridade do que 3.1–3.5 entregarem; conferir catálogo/erros/exemplos com testes e descrever limites, sem apresentar guardas como implementação dos recursos avançados.

## 4. Origem externa controlada

- [ ] 4.1 Implementar porta de opener main e caso de uso de origem salva por ID/revisão, leitura coordenada e shell fora da unidade; verificar que URL draft/arbitrária/opções/paths não cruzam a bridge e que abertura não altera tarefa/revisões (D8/G16/G17).
- [ ] 4.2 Validar string antes do parse, HTTP/HTTPS/host/credenciais e comprimento do href; testar 2081/2082 caracteres, normalização/Unicode, controles, userinfo, file/javascript/data/mailto/taskflow/UNC e URL ausente, sem cortar/regravar histórico (G16).
- [ ] 4.3 Revalidar sessão antes do efeito/saída e sanitizar rejeição do opener; testar base stale, tarefa ausente, sessão invalidada enquanto espera e falha pós-solicitação, sem retry ou alegação de rollback (G16/G17).
- [ ] 4.4 Documentar significado limitado de sucesso, erro/tamanho e posição da ação; conferir com testes usando fake e reservar a evidência de navegador Windows para a prova integrada, sem abrir sites durante a suíte.

## 5. Store e sincronização com persistência

- [ ] 5.1 Adaptar store/porta de renderer aos snapshots completos e revisões existentes, mantendo filtros/ordem/seleção transitórios; testar handshake/mount/unmount e que apenas uma subscription/listener/poller de estado existe (D5/G18).
- [ ] 5.2 Implementar loading/ready/empty/sem resultados/stale/blocked e reconciliação; testar erro inicial versus estado vazio, snapshot anterior conservado, filtros/draft intactos, Retry sem mutação/reset e bloqueio de comandos stale (G09/G10).
- [ ] 5.3 Implementar submitting/ack/await-snapshot e gate de duplicação; testar respostas/eventos fora de ordem, snapshot >= ack, no upsert antigo, save confirmado com ressync falhado e duplo click/Enter/focusout sem segundo comando (G11/G12).
- [ ] 5.4 Implementar estado de conflito/NOT_FOUND/resultado incerto sem sobrescrever inputs/base; verificar que conferência preserva draft, reload exige descarte explícito, ressync não reenvia e criação não é deduzida por título (D6/G10–G12).
- [ ] 5.5 Documentar estados, trânsito da revisão e limites de draft/filtros após saída/crash; conferir com testes 5.1–5.4, distinguindo persistência confirmada de atualização pendente e de resultado desconhecido.

## 6. Interface, datas e acessibilidade

- [ ] 6.1 Adaptar TaskManager/form/list/filters e estilos revisados à janela principal com diagnóstico secundário acessível; verificar DOM/CSS e testes básicos, sem imports/fieldsets/handlers/hints futuros ou redesign (D1/D9/G19).
- [ ] 6.2 Conectar criação/edição/cancelamento e campos/erros ao store/patch, com históricos intactos; verificar validação/primeiro erro, limpar opcionais, cancelar sem write, nome das ações e foco inicial/retorno (G01–G03/G14/G15).
- [ ] 6.3 Preservar seletor e ações rápidas de status; testar setas/Home/End/PageUp/PageDown sem write, Enter/focusout/ponteiro, Escape e busy aria-disabled, recuperação de controle/vizinho/limpar filtros e erro, inclusive IDs hostis (G04/G13/G14).
- [ ] 6.4 Implementar conferência somente leitura de versão atual, manter preenchimento, confirmação de descarte e conferência de lista para resultado incerto; verificar foco/alerta/teclado e nenhuma troca silenciosa de base, clipboard próprio ou reenvio automático (D6/G11/G12/G15).
- [ ] 6.5 Adaptar helper local, preservação de ISO intacto, formatter e revisão explícita de mudança de fuso; testar vazio/calendário/leap day/gap/repetição/segundos/milissegundos em subprocessos TZ e porta fictícia, sem alterar fuso do PC (D7/G08).
- [ ] 6.6 Conectar filtros/contagens/relógio 60 s+foco/resume, avançados somente leitura e Abrir origem salva junto ao campo; testar G05–G09/G16/G19, guardas acessíveis e abertura do valor salvo quando o input difere.
- [ ] 6.7 Verificar contraste/texto 4,5:1/foco 3:1, labels/aria/live regions e layout mínimo/normal/zoom/strings longas; atualizar documentação de uso/paridade/testes com resultados de componentes e limitações que aguardam prova Electron real (G15).

## 7. Integração real, volume e evidências

- [ ] 7.1 Ampliar harness/smoke somente em perfis e superfícies fictícios para exercer UI de tarefas real, preload/main/DB e oito operações; verificar isolamento e negativas no pacote, sem canais/hooks exclusivos na bridge normal nem segunda janela de produto (G16–G18/G20).
- [ ] 7.2 Exercitar no pacote duas sessões, ack tardio/commit sem resposta, perda de evento, foco/30 s, reload/crash controlado/unmount e cleanup; verificar convergência/dados confirmados/draft transitório e registrar fechamento da janela principal e de todas as superfícies do harness (G11/G12/G18/G20; W4/W6).
- [ ] 7.3 Medir montar/filtrar/ordenar/heartbeat/foco com 1.000/10.000 tarefas fictícias contra D10 (2 s/5 s, p95 500 ms, heartbeat 250 ms); registrar hardware/runtime/bytes/amostras/DOM e reprovar sem truncar ou remover gate se orçamento falhar (G20).
- [ ] 7.4 Executar prova manual no pacote local autorizado de teclado/foco, dimensões/zoom 200%/escala Windows e abertura de URL controlada sem dados privados; registrar evidência separada de DOM/opener fake e não executar Setup (G13–G16/G20).
- [ ] 7.5 Rodar build/pacote --publish never, verify:package e smoke:packaged pertinentes; adaptar inventário/harness apenas se necessário e conferir contratos/payloads/isolamento do pacote com os testes, sem instalador executado, release ou dependência nova.
- [ ] 7.6 Consolidar evidências de integração/volume e comandos em docs operacionais/paridade/testes, com G01–G20 e limites da TFA-003 preservados; verificar que build/smoke não certificam instalação, notificações, bandeja, atalhos ou CI não consultada.

## 8. Revisão final do apply

- [ ] 8.1 Executar npm run validate e OpenSpec estrito, revisar diff/links/escopo e cobertura dos três deltas/G01–G20; verificar dados fictícios, nenhum segredo, origem/Git intocados e nenhuma Change futura implementada.
- [ ] 8.2 Executar openspec-verify-change e gerar verification.md nesta Change com requisito/cenário/task/evidência, gates, pendências e limites; verificar que performance/integração não confirmadas permanecem identificadas e entregar para aprovação explícita antes do archive.
- [ ] 8.3 Atualizar roadmap com etapa/data/resultados reais e entregar implementação/relatório para revisão; verificar que não houve archive, README de funcionalidade futura, commit/push/PR/merge, instalação ou distribuição por inferência e parar na revisão do relatório.
