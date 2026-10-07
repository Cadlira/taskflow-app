# Tasks

Planejamento para revisão; nenhum item abaixo foi executado. Checkboxes marcam somente implementação e verificações efetivamente concluídas no apply autorizado. Referências: [proposal.md](proposal.md), [design.md](design.md) (D1–D10) e os três deltas em `specs/`. Testes usam dados fictícios, fakes e nenhuma chamada paga; extensão/Git estritamente somente leitura. Não trocar arquitetura, limites ou dependências sem revisão material.

## 1. Domínio portátil e contratos de IA

- [x] 1.1 Copiar por revisão o domínio de provedores (`ai-provider.ts`): união OPENAI/ANTHROPIC/CUSTOM, bases fixas, `validateApiBase` (https; http só loopback; sem userinfo/query/fragmento; caminho com barra final normalizada), `resolveApiBase`/`resolveOrigin` e `buildAiProviderConfig` com credencial intocada preservada; verificar AI02 com testes unitários de fronteiras e recusas.
- [x] 1.2 Portar o domínio de sugestão adaptado ao app: `buildSubtaskSuggestionContent` (fonte única do texto, corte de 1.000 antes da prévia, instruções fixas), parser tolerante com dedupe e `buildSubtaskSuggestionProposal` sobre `resolveSubtaskDrafts`/`MAX_SUBTASKS`/`SUBTASK_TITLE_LIMIT`; verificar AI06/AI08 com testes de limites, CRLF, Unicode e substituto órfão.
- [x] 1.3 Definir as portas/aplicação puras (`src/application/ai`): repositório, tester, suggester, autorização e serviços com uma requisição em voo, cancelamento, timeout e estados NONE/CONFIGURED/BLOCKED; verificar AI01/AI04/AI07 com fakes e typechecks sem Vue/Pinia/Electron.
- [x] 1.4 Criar `src/contracts/ai.ts` com os oito canais `:v1`, limites declarados (1/8/16 KiB), uniões de erro fechadas e parsers de request/result; verificar AI14 com schemas exatos, extras/versões recusados e medida UTF-8 completa.
- [x] 1.5 Estender o teste de fronteiras para garantir rede fora de contracts/domain/application e IA sem Vue/Pinia/Electron/`fetch`; verificar com fixtures positivas e negativas.

## 2. Credencial protegida e limites de persistência

- [x] 2.1 Implementar o store `ai.json` v1 no `userData` com envelopamento, revisão decimal e recusa integral de estrutura desconhecida ou versão futura sem sobrescrever; verificar AI03 para arquivo futuro/corrompido/ilegível preservado.
- [x] 2.2 Integrar `safeStorage` (cifra/decifra sob demanda e `isEncryptionAvailable`) com estados `PROTECTION_UNAVAILABLE` e falha de decifra bloqueando uso e preservando bytes; verificar AI03 e ausência de plaintext em qualquer caminho.
- [x] 2.3 Implementar publicação atômica no padrão de `shortcuts.json` (temp exclusivo, flush, readback, `previous`, rename, releitura) e `UNKNOWN` bloqueando setters até reconciliação; verificar faults por fase e kill antes/depois da publicação.
- [x] 2.4 Garantir credencial fora do renderer/log/backup: resumo com `hasCredential`, campo nunca preenchido, preservação ao alterar base/modelo, remoção apagando e revogando; verificar AI03/AI12 e regressão de exportação/importação sem segredo (AI15 parcial).
- [x] 2.5 Documentar formato, bloqueios, remoção e exclusão de backup no guia operacional da IA; verificar exemplos contra D3 e ausência de promessas de proteção além do escopo.

## 3. Rede: transporte, verificação, geração e adapters

- [x] 3.1 Definir transporte injetável `fetch`-shaped e wiring de produção com `net.fetch`; verificar AI05 com fake e teste que garante `redirect:'error'`, recusa de 3xx, no-store/omit/no-referrer.
- [x] 3.2 Implementar o executor de verificação (corpo nunca lido, timeout 15 s, cancelamento, motivos fechados, `MODEL_LIST` e `MINIMAL_COMPLETION` com `ping`/1 token); verificar AI05.
- [x] 3.3 Implementar o executor de geração (corpo limitado a 64 KiB, extração mínima, timeout 30 s, cancelamento, erro capturado sem log de corpo); verificar AI07/AI12.
- [x] 3.4 Implementar adapters OpenAI/CUSTOM e Anthropic (endpoints, autenticação, versão da API e header de paridade) sem streaming e com `max_tokens`; verificar AI05/AI07 com fake e vetores de extração por provedor.
- [x] 3.5 Cobrir loopback local, redirecionamento, corpo acima do limite e respostas malformadas com servidor fake local; verificar AI05/AI14 sem chamadas pagas.

## 4. Consentimento, catálogo IPC e concorrência

- [x] 4.1 Implementar o serviço de configuração com CAS `expectedRevision`, estados/bloqueios e resumo sem segredo; verificar AI03/AI14 e recusa antes de qualquer efeito.
- [x] 4.2 Implementar consentimentos CREDENTIAL/CONTENT por documento, com vínculo origem/provider/base/revisão/`requestId` e limpeza em invalidar sessão, salvar/remover e sair; verificar AI04.
- [x] 4.3 Implementar `src/main/ipc/ai.ts` com as oito operações, guardas de role/frame/documento/sessão antes do efeito, bytes e erros fechados, sem eventos; verificar AI10/AI14.
- [x] 4.4 Atualizar contratos/preload/surface-catalog (43 manager/14 Quick Add) e impedir qualquer operação de IA no Quick Add; verificar teste de catálogo e recusa de request forjado da superfície rápida.
- [x] 4.5 Implementar registro de pedido em voo por documento, cancelamento por `requestId` e descarte de resposta tardia sem entrega nem log de conteúdo; verificar AI11.
- [x] 4.6 Abortar pedidos e limpar consentimentos em salvar/remover configuração (revisão monotônica) e em fechar/reload/crash/suspender/quit; verificar AI11 com barreiras determinísticas.
- [x] 4.7 Documentar contratos, orçamentos 8/16 KiB e matriz de recusas do grupo de IA; verificar alinhamento com o delta `desktop-state-ipc`.

## 5. Prévia, sugestão e integração com o formulário

- [x] 5.1 Implementar a preparação no main (título/descrição/vagas → `requestId` + conteúdo exato + corte + origem + consentimento requerido) e a invalidação em re-preparação; verificar AI06.
- [x] 5.2 Implementar a execução da sugestão sobre o snapshot preparado (uma requisição, parse, validação, corte por vagas com `discardedByLimit`) e o cancelamento; verificar AI07/AI08.
- [x] 5.3 Integrar a aceitação à lista do formulário somente como linhas novas (sem `id`/`done`), preservando ordem e estado existentes e sem persistência; verificar AI09 com os caminhos de salvar/desfazer atuais.
- [x] 5.4 Integrar a defesa de conteúdo externo (dado, nunca instrução) ao caminho de preparação e validação; verificar AI13.
- [x] 5.5 Cobrir a troca de provedor/configuração durante pedido em curso com testes de barreira; verificar AI11.

## 6. Renderer: área de provedores e painel de sugestão

- [x] 6.1 Criar a área de provedores do manager (provedor/base/modelo, credencial com revelação, marca de credencial salva, origem, consentimento, testar com fallback, remover, estados bloqueados) com foco/ARIA; verificar AI03/AI04/AI05.
- [x] 6.2 Criar o painel do formulário (ação com motivos, prévia literal + corte + origem, consentimento, progresso/cancelar, proposta com seleção/edição/aceitar/descartar) reutilizando padrões de teclado/foco; verificar AI06/AI09.
- [x] 6.3 Garantir que o Quick Add permaneça sem IA e sem superfície de rede; verificar AI10 em componentes e catálogo.
- [x] 6.4 Mapear códigos fechados para mensagens sem segredo/corpo e validar estados de bloqueio/proteção; verificar AI12.
- [x] 6.5 Atualizar a documentação operacional de IA (uso, limites, privacidade, prova real opcional); verificar exemplos e ausência de promessa de rede automática.

## 7. Integração, pacote e entrega de verificação

- [x] 7.1 Portar por revisão os testes da origem (`ai-provider`, `ai-subtask-suggestion`, `ai-subtask-suggestion-service`, adapters, `stored-ai-config`, `backup-ai-credential`) e registrar cobertura AI01–AI16; verificar que nenhum teste usa rede paga ou segredo real.
- [x] 7.2 Executar `npm run validate` com Node24.21.0/npm11.21.0 e OpenSpec estrito Change/--all/--archived; verificar regressões de tarefas/backup/atalhos e ausência de escrita na origem.
- [x] 7.3 Executar `package:win`/`verify:package`/`smoke:packaged` e um cenário de IA com transporte fake ou loopback; verificar catálogo43/14, ausência de segredo no ASAR e limites de bridge no runtime real, sem chamadas pagas.
- [x] 7.4 Atualizar `docs/architecture.md` (D7 implementado), `docs/parity-matrix.md` (P11/P12) e guias operacionais com o estado real; verificar links/exemplos e que nada anuncia paridade além do comprovado.
- [x] 7.5 Executar `openspec-verify-change` e criar `verification.md` na própria Change com aderência a tasks/deltas/AI01–AI16, gates/evidências/pendências e registro do waive explícito caso a prova real não seja executada; verificar o relatório e parar para aprovação humana antes de archive.
- [x] 7.6 Atualizar o roadmap com estado verdadeiro, datas/evidências e prompt de continuidade quando houver pendência; verificar que nenhuma task não executada foi marcada concluída e que o apply não iniciou archive, merge ou TFA-011.
