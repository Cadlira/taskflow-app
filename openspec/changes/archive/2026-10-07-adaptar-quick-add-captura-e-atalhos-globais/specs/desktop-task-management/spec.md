# Spec Delta

## MODIFIED Requirements

### Requirement: Identidade e limites temporários são visíveis com clareza

Interface SHALL preservar identidade/cores/rótulos/cartões e acessibilidade em janela mínima/zoom200/escala. Excluir/Lixeira/Desfazer/Backup SHALL ter controles autorizados; recursos posteriores SHALL não ser montados. Recorrência/subtarefas/lembretes SHALL ser editáveis sob contratos do proprietário; bandeja/saída/startup SHALL ter comunicação acessível.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, prazo/status/fechamento/geração seguem validação e liquidação atômicas, com agenda real; edição independente conserva markers e retirada de regra conserva dados pertinentes
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** Excluir/Lixeira/Desfazer/Backup estão disponíveis conforme contratos; edição/agendamento de lembretes e opções de ciclo de vida estão disponíveis; captura copiada/Quick Add/atalhos e hints efetivos estão disponíveis; não há IA
- **AND** origem salva oferece somente a ação específica de abertura, sem preview, fetch ou abertura de URL não salva

#### Scenario: Dimensões contraste e texto
- **WHEN** janela mínima/normal/maximizada, zoom 200%, escala Windows ou conteúdo longo é exercitado
- **THEN** rótulos/ações permanecem acessíveis por teclado e rolagem, texto não elimina controles e contrastes preservam texto 4,5:1 e foco 3:1

#### Scenario: Política da exclusão é comunicada
- **WHEN** usuário abre confirmação recuperável ou irreversível
- **THEN** retenção30×24h, limite100, descartes irreversíveis/relógio recuado e efeito da portadora são explicados conforme ação
- **AND** restauração não é anunciada como geração/agendamento e undo temporário não é descrito como histórico persistente

#### Scenario: Backup explica substituição e exclusões
- **WHEN** prévia apresenta counts/versões/data ou arquivo vazio
- **THEN** UI explica substituição total irreversível sem undo, preservação da trash atual e ausência de trash/credenciais/desfazer no arquivo
- **AND** exportação preventiva é opcional; JSON não criptografado e recurso indisponível não são anunciados como migração completa

#### Scenario: Formulário de lembretes e foco de ativação
- **WHEN** usuário adiciona/edita/remove AT/OFFSET ou abre tarefa pela notificação com filtros/draft em curso
- **THEN** controles/presets/limites/erros por item seguem teclado/foco da origem e localização mantém draft/filtros sem editor destrutivo
- **AND** estados indisponíveis e política de fechar/Sair/recuperar em5min são anunciados dentro da janela

#### Scenario: Captura preserva área e criação alheia
- **WHEN** captura chega durante form/conflito/trash/backup/confirmação/localização de lembrete, ou Quick Add confirma criação
- **THEN** manager conserva campos/base/filtros/scroll/área e mantém captura como oferta sem merge
- **AND** Revisar exige estado seguro e voltar à lista não aplica oferta automaticamente; ack rápido não fecha editor do manager
