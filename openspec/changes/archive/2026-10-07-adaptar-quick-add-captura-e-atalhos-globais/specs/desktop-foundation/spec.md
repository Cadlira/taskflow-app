# Spec Delta

## MODIFIED Requirements

### Requirement: Renderer sem autoridade irrestrita

O renderer SHALL executar isolado, sem Node/filesystem/IPC livre. A superfície SHALL expor somente35 wrappers autorizados no gerenciamento e14 no Quick Add, de diagnóstico/estado/tarefas/lixeira/contexto/undo/backup/desktop/captura/atalhos/navegação interna, com versões próprias, sem SQL/callbacks remotos/repositories/Task ou paths como comando. Recursos posteriores SHALL permanecer indisponíveis.

#### Scenario: Conteúdo tenta usar APIs privilegiadas
- **WHEN** código no renderer tenta acessar require, filesystem, IPC bruto ou enviar um comando/caminho livre pela bridge
- **THEN** essas capacidades não estão disponíveis e não ocorre acesso privilegiado

#### Scenario: Catálogo limitado no pacote
- **WHEN** a bridge do aplicativo empacotado é inspecionada
- **THEN** somente35 wrappers estão expostos no manager e14 no Quick Add: estado3, create4/check3, update5/status4, move2, diagnóstico/origem/contexto e demais trash/undo1, quatro backup1, desktop com status/inscrição/eventos2 e setters/saída/resolução1, nove wrappers novos1
- **AND** backup usa apenas escolha nativa/resumo/token no proprietário; clipboard só oferece captura por gesto e atalhos só ações/combos fechadas; IA/URL arbitrária e API livre de notificações permanecem ausentes; lixeira/undo usam intenções próprias

#### Scenario: Abrir origem não amplia navegação
- **WHEN** o usuário aciona openTaskSource por seu wrapper específico
- **THEN** a operação validada abre a origem salva pelo sistema sem fornecer shell ao renderer
- **AND** navegação externa, janelas arbitrárias, webviews e permissões não necessárias continuam bloqueadas

#### Scenario: Facade restrita do Quick Add
- **WHEN** bridge da janela rápida é inspecionada ou renderer tenta simular role manager
- **THEN** somente suas14 operações são expostas/autorizadas; role é atribuído pelo proprietário e não aceita claim do renderer
- **AND** Node/filesystem/IPC livre e setters/edição/trash/backup/diagnóstico do manager não se tornam acessíveis
