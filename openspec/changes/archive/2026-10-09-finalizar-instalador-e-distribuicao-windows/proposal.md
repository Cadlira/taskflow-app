# Proposal

**IR3 aprovada em2026-10-08:** manter a entrada NSIS atual, sem controlador PowerShell novo. [Decisão e prova](silent-uninstall-review.md): o launcher normal do uninstall pode retornar0 antes do filho; seu exit code não é contrato de automação. Observar recusa/conclusão efetiva. Guardas, retenção e ownership permanecem; Setup e predecessor executado em cópia verificada com _?= continuam propagando falha. Priorizar o fluxo comum pelo Windows. Demais provas das tarefas continuam obrigatórias.

## Decisões adotadas no apply — 2026-10-08

Artefatos aprovados e implementação autorizada conforme [approval.md](approval.md).
R1: uso pessoal/controlado, sem atribuição empresarial; R2: Windows 11 x64, suporte
limitado aos resultados por hash/build; R3: par privado 0.2.0→0.2.1, sem upgrade
automático do legado inseguro. R5: perfil/cache/IA cifrada retidos integralmente,
exclusão manual separada; R6: unsigned; R7: origem local rastreável, sem upload ou
distribuição. A recomendação histórica de CI/retenção de 14 dias abaixo foi
substituída por R7; configuração de upload fica suspensa, sem nova política externa.
R4 autoriza manutenção somente na conta atual; segunda conta excluída por decisão
humana, não PASS. IR1 autoriza inicialização NSIS adaptada no projeto antes de
SetOutPath; IR2 autoriza transição manual separada do 0.1.0, com limites revisados.
As descrições de proposta abaixo preservam contexto histórico; não substituem
estas decisões nem constituem provas de execução.

## Why

O produto completo já está integrado, mas a prova da fundação não comprova sua distribuição: o template NSIS pode encerrar o app à força, a seleção de Setup admite artefatos antigos e a inspeção não cobre todo o payload/notices. A TFA-011 deve transformar essas lacunas em garantias verificáveis de instalação e manutenção por usuário, com dados preservados e evidência do pacote final.

## What Changes

- Consolidar NSIS offline one-click per-user, sem administrador, mantendo IDs, nomes técnicos, perfis, ícones, sandbox e ACL RX somente no root binário. Recusar caminhos divergentes entre Setup e main antes de substituir a instalação.
- Recusar instalação/manutenção enquanto houver processo próprio ou detecção inconclusiva, inclusive `/S`; orientar salvar rascunhos e usar **Sair**, sem encerramento forçado. Antecipar a verificação de conflitos de identidade/ownership e tratar falhas parciais explicitamente.
- Versionar o candidato e selecionar artefatos por versão/arquitetura/commit/run, com staging separado, hashes finais e inventário completo; rejeitar seleção ausente, ambígua ou incompatível. Nunca usar o 0.1.1 histórico da fundação como sucessor do produto completo.
- Inspecionar todo o payload, recursos e ASAR, incorporar notices dos componentes realmente distribuídos e testar arquivos/conteúdo fictícios proibidos. Conservar apenas diagnóstico inventariado e isolado de produção.
- Definir atualização manual, retenção integral do perfil em upgrade/uninstall/reinstall, cleanup apenas de recursos próprios e recuperação seletiva sem reset, exportação de segredo ou downgrade incompatível.
- Produzir artefatos de CI para revisão, com proveniência, evidências sanitizadas e retenção finita; preparar guia operacional e campanha W01–W15 em conta padrão autorizada. CI administrador, mocks e dispensas históricas não são prova do instalador final.

**Decisões para revisão, sem aprovação inferida:** recomenda-se uso pessoal/controlado, Windows 11 x64 nas builds efetivamente testadas, candidato 0.2.0, pacote não assinado, CI como origem candidata e retenção de artefatos por 14 dias. Público, responsável legal/CompanyName/author, alvo/build, versão/par de manutenção, ambiente autorizado de Setup/contas/UAC e política de retenção/assinatura precisam de decisão humana registrada conforme R1–R7 no design. Não se atribui identidade legal à QSI nem se promete suporte a qualquer build do Windows 11. A proposta pode ser revisada com essas dúvidas expostas; aprovação parcial só autoriza tarefas independentes expressamente aprovadas.

## Capabilities

### New Capabilities

Nenhuma. Distribuição manual e prova de artefatos cabem nas fronteiras existentes.

### Modified Capabilities

- `windows-per-user-installation`: destino coerente com o runtime; manutenção sem encerramento forçado; identidade estável/preflight; retenção dos dados do produto completo, cleanup próprio e recuperação documentada.
- `desktop-build-validation`: inventário/notices/inspeção integral; seleção/versionamento/proveniência do artefato; CI de revisão; campanha independente W01–W15 e declaração verdadeira de assinatura/limites.

## Impact

Implementação futura em `package.json`/lockfile (somente metadados aprovados), `build/installer.nsh`, scripts de empacotamento/inspeção/smoke e `.github/workflows/ci.yml`; notices, guia operacional e registros de evidência. Configuração/runtime de identidade são referência para coerência; alterações funcionais em lifecycle, IA, atalhos, schemas SQL2/codec4 e backups v1–v4 não estão autorizadas por conveniência. Não há nova dependência prevista.

Dependência direta TFA-010 arquivada/integrada, base `f91ce401c8648a8d0aa984975c72885f9c023ee6` (PR #10); TFA-002/008/009 fornecem provas e limites históricos. Branch reutilizada: `codex/tfa-011-finalizar-instalador-e-distribuicao-windows`. A extensão e seu Git continuam estritamente somente leitura.

Fora do escopo: auto-update remoto, Windows Store, Win10/ARM64/outros SOs sem nova revisão, backend/conta/sync/telemetria, serviços/tarefas agendadas, navegador/extension auxiliar, redesign, novos schemas/backups, wipe automático, chamadas reais/pagas de IA e homologação integral TFA-012. Contratar assinatura, inserir segredos, executar Setup em ambiente não autorizado, distribuir/publicar/release/merge não decorrem desta proposta nem do futuro apply. Esta entrega cria somente planejamento e para em revisão humana.
