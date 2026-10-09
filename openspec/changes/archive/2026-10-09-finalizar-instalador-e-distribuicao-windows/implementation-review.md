# Ponto de revisão durante apply — TFA-011

## IR1 — Efeito antes das guardas no template NSIS

**Estado:** APPROVED em 2026-10-08: resposta humana **“Aprovo a revisão e adaptação
NSIS proposta”**, registrada em approval.md. Afeta tasks 2.1/2.6 e W04/W03. Não há
aceite de exceção ao contrato. Investigação em 2026-10-08 por leitura da
dependência fixada app-builder-lib 26.17.0, sem escrever em node_modules ou executar
Setup. Pacote/NSIS final ainda não gerado; hipótese instalada não anunciada como PASS.

### Evidência e consequência

- `node_modules/app-builder-lib/templates/nsis/installer.nsi:52` executa
  `SetOutPath $INSTDIR`; `preInit` vem nas linhas 55–56, `customInit` em 79–80.
- `node_modules/app-builder-lib/templates/nsis/uninstaller.nsh:6` também executa
  `SetOutPath $INSTDIR` antes de checkAppRunning e customUnInit.
- [NSIS SetOutPath](https://nsis.sourceforge.io/Docs/Chapter4.html#4.9.1.10)
  cria recursivamente o caminho quando inexistente; `/D` é processado nativamente.
- Logo, pela ordem do template, o include sozinho não demonstra recusa sem efeitos
  para qualquer override inválido: uma pasta pode ser criada antes da validação.
  Trata-se de conclusão pelo código/documentação, não prova instalada executada.
- Alterar Known Folder para DONT_VERIFY elimina CREATE do nosso resolver, mas não
  corrige essa instrução anterior do template. Não marcar task 2.1 concluída.

### Encaminhamento proposto para revisão

Manter o requisito de destino/efeitos estrito e revisar D2/D3/D4 e tasks para uma
adaptação versionada da inicialização NSIS no projeto novo, com guardas sem efeitos
antes de SetOutPath tanto no installer quanto no uninstaller. Usar API `nsis.script`
ou mecanismo equivalente suportado pelo builder fixado, sem editar node_modules,
mantendo fonte de referência/versionamento e teste de divergência com o template.
Não implementar essa adaptação antes de revisar/aprovar o ponto material.

Uma revisão deve avaliar os includes de uninstall, a geração do uninstaller (o
builder trata custom script de modo diferente), logs/temp próprios, argumentos,
initMultiUser, predecessor/retorno não zero e revalidação imediatamente anterior
à remoção/extração. Preservar todas as exclusões de serviços/updater/elevação/kill.
Custos de manutenção e futura assinatura devem ser declarados; unsigned ainda
depende de R6. Não ajustar contrato para aceitar write fora do root por conveniência.

A aprovação humana desta continuação escolhe a adaptação no projeto. O template
externo continua somente leitura; não substituir uninstaller legado nem aceitar
exceção silenciosa. A configuração custom script não pré-gera nem assina uninstaller
no builder; geração via WriteUninstaller e inspeção própria são necessárias no
baseline unsigned autorizado. Assinatura futura continua sujeita a revisão específica.

## Entregas e evidência corrente

- Approval/roadmap registram aprovação humana e R1; R2–R7 ainda pendentes.
- Task 1.4 concluída: validation-protocol.md, 15 casos W e 61/61 cenários mapeados;
  checagem de cobertura e OpenSpec estrito 1/1, --all 19/19, --archived 10/10 PASS.
- Task 2.1 parcial: resolver UserProgramFiles e LocalAppData pelo SO, exigir
  equivalência com LocalAppData/Programs e usar DONT_VERIFY sem criar Known Folder.
  Guardas existentes conservadas; task permanece `[ ]` por IR1/campanha não executada.
- Regressão focada: 2 arquivos/13 testes PASS com Node24.21.0, ambiente de teste node.
  São contratos estruturais/integração simulada, não execução NSIS/Setup.
- Tentativa inicial sofreu EPERM de cache temporário no sandbox; retentativa com
  TEMP/TMP restritos ao workspace passou. A primeira tentativa de validate foi
  recusada por npm filho11.19.0; PATH local corrigido para wrapper11.21.0 sem mudar
  versões/engines/lockfile. A execução de validate no sandbox passou lint/cinco
  typechecks, mas falhou 6 testes (loopback local/junction): 1.333 PASS/11 skipped.
  Retentativa fora do sandbox aprovada pelo mecanismo automático e executada com
  Node24.21.0/npm11.21.0: **validate exit0**, lint sem warnings, cinco typechecks,
  **101 arquivos/1.339 testes PASS +11 skipped**, **2 testes de volume PASS** e build
  das três entradas PASS. Log local ignorado `.tmp/tfa011-validate-unsandboxed.log`.
  Não é prova limpa pelo lock em novo checkout, pacote NSIS ou execução instalada;
  task 6.1/6.2 continuam pendentes. O resultado anterior é mantido para rastreabilidade.

Sem Setup/par final/CI/upload, dados reais, chamada paga de IA, alteração da extensão,
archive, commit/push/PR/merge ou distribuição. Campanha instalada BLOCKED por R4.
