# Spec Delta

## Purpose

Oferecer criação rápida revisável em superfície independente, conservando o contexto do gerenciamento e usando confirmação segura do proprietário local.

## ADDED Requirements

### Requirement: Entrada rápida preserva rascunho e contexto

Quick Add SHALL ser singleton independente do gerenciamento, com rascunho local em memória. Abrir sem draft SHALL iniciar vazio sem ler clipboard; reabrir SHALL conservar campos/foco. Abrir Quick Add ou gerenciamento SHALL não apagar filtros, ordenação, scroll, área, base ou editor da outra superfície.

#### Scenario: Primeira abertura e reabertura
- **WHEN** QUICK_ADD é acionado sem draft e depois com preenchimento existente
- **THEN** primeira abertura mostra form vazio com prioridade MEDIUM; reabertura conserva preenchimento e restaura foco editável
- **AND** nenhuma abertura lê clipboard ou cria tarefa

#### Scenario: Gerenciamento em edição
- **WHEN** Quick Add abre/cria tarefa enquanto manager edita outra com filtros e área selecionada
- **THEN** manager conserva seu editor/base/contexto e recebe somente atualização coerente dos dados
- **AND** ack da criação rápida não fecha nem limpa editor alheio

### Requirement: Form compacto permite revisão dos campos básicos

Quick Add SHALL oferecer título, descrição, prazo local, solicitante, responsável, prioridade e origem opcional sob validações atuais. Descrição/origem capturadas SHALL ser visíveis/editáveis/removíveis. Criação SHALL usar status TODO e não salvar automaticamente por captura.

#### Scenario: Captura longa revisável
- **WHEN** captura gera descrição ou usuário associa origem manualmente
- **THEN** campos correspondentes são revelados e podem ser revisados antes de enviar
- **AND** título obrigatório, fuso/prazo e demais limites continuam validados

#### Scenario: Origem isolada
- **WHEN** URL isolada é aplicada à criação vazia
- **THEN** origem completa é preenchida, título continua vazio e recebe foco
- **AND** enviar sem nome acusa título obrigatório; não há fetch, preview ou abertura do draft

### Requirement: Confirmação de criação pertence à própria sessão

Quick Add SHALL limpar apenas seu draft após confirmação e estado coerente da própria criação. Erro, conflito, suspensão, base stale ou resultado incerto SHALL conservar inputs e não repetir escrita. Abrir manager SHALL conservar draft rápido mesmo quando abertura falhar.

#### Scenario: Sucesso e falha
- **WHEN** criação confirma com snapshot coerente ou falha validada
- **THEN** sucesso limpa somente form rápido e foca título; falha conserva valores e foca campo inválido ou alerta
- **AND** renderer não infere sucesso de evento de outra janela

#### Scenario: Commit com resposta perdida
- **WHEN** criação confirma no proprietário mas ack se perde durante ocultação/reload
- **THEN** reabertura ressincroniza sem reenvio ou nova tarefa automática
- **AND** estado desconhecido é explicado e preenchimento sobrevivente é conservado para decisão humana

### Requirement: Teclado e memória transitória são explícitos

Quick Add SHALL permitir Tab/Enter/Escape com foco visível, mensagens acessíveis e rolagem em largura360px/zoom200. Escape e close SHALL seguir política de bandeja sem descartar draft. Interface SHALL explicar que Sair/crash perde drafts e não prometer foco garantido pelo SO.

#### Scenario: Digitação e campos multilinha
- **WHEN** usuário navega por teclado, digita descrição ou usa composição IME
- **THEN** controles/erros têm foco e semântica apropriados, textarea/IME não envia pelo Enter indevido e ocupado é anunciado

#### Scenario: Fechar e retomar
- **WHEN** Quick Add fecha para bandeja e reabre na mesma execução
- **THEN** memória retorna com sessão nova, sem autosave/replay; Sair/crash não anuncia recuperação de draft
- **AND** foco negado pelo Windows mantém caminho por botão/bandeja
