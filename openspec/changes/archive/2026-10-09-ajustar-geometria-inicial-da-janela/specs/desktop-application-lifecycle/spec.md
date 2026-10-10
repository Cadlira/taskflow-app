# Spec Delta

## ADDED Requirements

### Requirement: Geometria inicial da janela principal ancorada à direita

Ao criar a janela principal, o aplicativo SHALL calcular seus limites a partir da área útil (`workArea`) do display primário: altura igual à altura útil e topo no início da área útil; largura `round(workArea.width / 3)` limitada entre o mínimo da janela (360) e a própria `workArea`; borda direita coincidente com `workArea.x + workArea.width`. A janela SHALL permanecer redimensionável e móvel, com mínimos, frame e o restante da UI preservados.

#### Scenario: Abertura ancorada à direita

- **WHEN** a janela principal é criada no display primário, com taskbar em qualquer borda
- **THEN** os limites correspondem à área útil (borda direita, topo e base) e à largura de um terço com clamp
- **AND** a janela não está maximizada nem fixada: continua redimensionável e móvel

#### Scenario: Tela estreita aplica o piso

- **WHEN** a largura útil é pequena o bastante para o terço ficar abaixo do mínimo da janela
- **THEN** a largura é limitada ao mínimo (360) e nunca excede a área útil
- **AND** a janela nasce inteiramente dentro da área útil, sem coordenadas fora do display

#### Scenario: Display primário é a referência

- **WHEN** existem múltiplos displays disponíveis
- **THEN** a geometria inicial é calculada pela área útil do display primário

### Requirement: Geometria inicial vale somente na abertura

A geometria inicial SHALL ser aplicada somente na criação da janela. Enquanto a instância vive, mover e redimensionar SHALL prevalecer; fechar para bandeja e reabrir SHALL preservar tamanho/posição definidos pelo usuário, sem reaplicar a geometria inicial. Novo lançamento do aplicativo SHALL reaplicar a geometria inicial, e recriação após falha do renderer SHALL contar como abertura nova.

#### Scenario: Sessão viva preserva a escolha do usuário

- **WHEN** o usuário move/redimensiona a janela e depois a fecha para a bandeja e a reabre
- **THEN** a janela mantém os limites definidos pelo usuário
- **AND** a geometria inicial não é reaplicada

#### Scenario: Novo lançamento reaplica

- **WHEN** o aplicativo é encerrado e iniciado novamente
- **THEN** a janela principal abre com a geometria inicial
- **AND** diferenças deixadas na sessão anterior não persistem

#### Scenario: Recriação após falha do renderer

- **WHEN** a janela é recriada após falha/recriação do renderer
- **THEN** a nova janela recebe a geometria inicial, como abertura nova
