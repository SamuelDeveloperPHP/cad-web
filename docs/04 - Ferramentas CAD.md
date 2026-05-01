# AGENTS.md — Agente 04: Ferramentas CAD

## Perfil do agente

Aja como Arquiteto Sênior de Ferramentas CAD Web, especialista em ferramentas interativas similares ao AutoCAD, fluxo de comandos, eventos de mouse/teclado, seleção, snaps, preview ghost, grips, linha de comando e integração entre CAD Core, Kernel Geométrico e Renderer.

Este agente é responsável exclusivamente pelo pacote `cad-tools`.

## Objetivo do pacote cad-tools

O pacote `cad-tools` deve implementar as ferramentas interativas do CAD-WEB, transformando ações do usuário em comandos controlados.

As ferramentas não devem alterar entidades diretamente. Elas devem:
1. Ler o estado atual do documento CAD.
2. Receber eventos de ponteiro, teclado e linha de comando.
3. Usar o kernel geométrico para cálculos.
4. Gerar previews visuais temporários.
5. Criar comandos do `cad-core` para alterar o documento.
6. Permitir cancelamento, confirmação e desfazer/refazer.

## Ferramentas previstas

### Desenho

- Select
- Line
- Polyline
- Rectangle
- Circle
- Arc
- Text

### Modificação

- Move
- Rotate
- Scale
- Trim
- Extend
- Mirror
- Offset
- Fillet
- Chamfer
- Array
- Explode
- Erase

### Cotas e anotações

- DimLinear
- DimAligned
- DimRadius
- DimDiameter
- DimAngular
- Measure

### Sistema

- Undo
- Redo
- ZoomExtents
- Pan
- Escape/Cancel
- Enter/Confirm
- CommandLine

## Arquitetura obrigatória

O pacote deve ser organizado com separação clara entre:

- contratos de ferramentas;
- contexto da ferramenta;
- entrada do usuário;
- estado interno da ferramenta;
- preview temporário;
- geração de comandos;
- integração com snaps;
- integração com seleção;
- atalhos de teclado;
- linha de comando.

Estrutura recomendada:

```txt
packages/cad-tools/
├── src/
│   ├── contracts/
│   │   ├── CadTool.ts
│   │   ├── ToolContext.ts
│   │   ├── ToolEvent.ts
│   │   └── ToolResult.ts
│   │
│   ├── selection/
│   │   ├── SelectTool.ts
│   │   ├── SelectionBox.ts
│   │   └── SelectionMode.ts
│   │
│   ├── draw/
│   │   ├── LineTool.ts
│   │   ├── PolylineTool.ts
│   │   ├── RectangleTool.ts
│   │   ├── CircleTool.ts
│   │   └── ArcTool.ts
│   │
│   ├── modify/
│   │   ├── MoveTool.ts
│   │   ├── RotateTool.ts
│   │   ├── ScaleTool.ts
│   │   ├── TrimTool.ts
│   │   ├── MirrorTool.ts
│   │   ├── OffsetTool.ts
│   │   ├── FilletTool.ts
│   │   ├── ChamferTool.ts
│   │   ├── ArrayTool.ts
│   │   ├── ExplodeTool.ts
│   │   └── EraseTool.ts
│   │
│   ├── dimensions/
│   │   ├── DimLinearTool.ts
│   │   ├── DimAlignedTool.ts
│   │   ├── DimRadiusTool.ts
│   │   ├── DimDiameterTool.ts
│   │   └── DimAngularTool.ts
│   │
│   ├── system/
│   │   ├── MeasureTool.ts
│   │   ├── PanTool.ts
│   │   ├── ZoomExtentsTool.ts
│   │   └── CancelTool.ts
│   │
│   ├── command-line/
│   │   ├── CommandRegistry.ts
│   │   ├── CommandParser.ts
│   │   └── CommandAliases.ts
│   │
│   ├── registry/
│   │   └── ToolRegistry.ts
│   │
│   └── index.ts
│
├── tests/
│   ├── MoveTool.test.ts
│   ├── RotateTool.test.ts
│   ├── ScaleTool.test.ts
│   └── CommandRegistry.test.ts
│
├── package.json
├── tsconfig.json
└── AGENTS.md
Regras fundamentais
Ferramentas não podem depender de React.
Ferramentas não podem acessar DOM diretamente.
Ferramentas não podem chamar API Laravel.
Ferramentas não devem persistir dados no banco.
Ferramentas não devem desenhar diretamente no Canvas.
Ferramentas podem gerar objetos de preview para o renderer desenhar.
Ferramentas devem gerar comandos do cad-core.
Ferramentas devem usar cad-geometry para cálculos matemáticos.
Ferramentas devem ser testáveis sem browser.
Ferramentas devem respeitar Esc, Enter, snaps, seleção e histórico.
Toda ferramenta deve ter estado interno previsível.
Toda ferramenta deve poder ser cancelada sem alterar o documento.
Toda alteração definitiva deve passar pelo Command Pattern.
Dependências permitidas

O pacote cad-tools pode depender de:

cad-core
cad-geometry

O pacote cad-tools não pode depender de:

React
Laravel
Canvas diretamente
DOM diretamente
banco de dados
bibliotecas visuais
Contrato base de ferramenta

Toda ferramenta deve seguir um contrato parecido com:

export interface CadTool {
  readonly id: string;
  readonly name: string;
  readonly aliases: string[];

  activate(context: ToolContext): void;
  deactivate(context: ToolContext): void;

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult;
  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult;
  onPointerUp(event: ToolPointerEvent, context: ToolContext): ToolResult;

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult;
  onCommandInput(input: string, context: ToolContext): ToolResult;
}
ToolContext esperado

O ToolContext deve fornecer acesso controlado a:

documento CAD atual;
entidades selecionadas;
viewport;
snaps ativos;
modo ortogonal;
unidade atual;
precisão atual;
funções de busca de entidade;
funções de seleção;
função para definir preview;
função para limpar preview;
função para emitir comandos;
função para mostrar mensagens na command line;
função para solicitar entrada numérica;
função para cancelar ferramenta.

Exemplo conceitual:

export interface ToolContext {
  document: CadDocument;
  selection: SelectionState;
  viewport: ViewportState;

  snapService: SnapService;
  commandBus: CommandBus;

  setPreview(preview: CadPreview | null): void;
  clearPreview(): void;

  selectEntities(ids: string[]): void;
  clearSelection(): void;

  executeCommand(command: CadCommand): void;

  showMessage(message: string): void;
  requestNumericInput(options: NumericInputRequest): void;

  cancelCurrentTool(): void;
}
ToolResult esperado

As ferramentas devem retornar um resultado padronizado:

export type ToolResult =
  | { type: "none" }
  | { type: "preview"; preview: CadPreview }
  | { type: "command"; command: CadCommand }
  | { type: "message"; message: string }
  | { type: "cancel" }
  | { type: "complete" }
  | { type: "error"; message: string };
Fluxo padrão de ferramenta

Toda ferramenta deve seguir este ciclo:

1. activate
2. aguardar seleção ou ponto inicial
3. processar eventos do usuário
4. gerar preview temporário
5. confirmar com clique ou Enter
6. gerar CadCommand
7. executar comando via commandBus
8. limpar preview
9. finalizar ou continuar ativa
Regras de seleção

As ferramentas devem aceitar dois fluxos:

Seleção antes do comando
1. Usuário seleciona entidades.
2. Usuário ativa Move, Rotate, Scale etc.
3. Ferramenta usa seleção existente.
4. Ferramenta pede ponto base ou parâmetro.
Comando antes da seleção
1. Usuário ativa Move, Rotate, Scale etc.
2. Ferramenta solicita seleção.
3. Usuário seleciona entidades.
4. Usuário confirma com Enter.
5. Ferramenta continua o fluxo.
Comandos e aliases

O pacote deve manter um registro central de comandos:

export const COMMAND_ALIASES = {
  select: ["sel", "select"],
  move: ["m", "move"],
  rotate: ["ro", "rotate"],
  scale: ["sc", "scale"],
  trim: ["tr", "trim"],
  mirror: ["mi", "mirror"],
  fillet: ["f", "fillet"],
  chamfer: ["cha", "chamfer"],
  offset: ["o", "offset"],
  array: ["ar", "array"],
  explode: ["x", "explode"],
  erase: ["e", "erase"],
  dimLinear: ["dli", "dimlinear"],
  dimRadius: ["dra", "dimradius"],
  dimDiameter: ["ddi", "dimdiameter"],
  dimAngular: ["dan", "dimangular"],
  measure: ["mea", "measure"],
  undo: ["u", "undo"],
  redo: ["redo"],
  zoomExtents: ["z", "za", "zoom", "zoomall"]
};
Ferramentas prioritárias para implementação

A ordem correta de implementação é:

Contratos base: CadTool, ToolContext, ToolEvent, ToolResult
ToolRegistry
CommandRegistry
SelectTool
EraseTool
MoveTool
RotateTool
ScaleTool
LineTool
RectangleTool
CircleTool
OffsetTool
TrimTool
FilletTool
ChamferTool
DimensionTools
Ferramenta Move

Fluxo esperado:

MOVE:
1. Verificar seleção existente.
2. Se não houver seleção, solicitar seleção de entidades.
3. Solicitar ponto base.
4. Solicitar ponto destino.
5. Durante movimento do mouse, gerar preview ghost.
6. Ao confirmar, gerar MoveEntitiesCommand.
7. Limpar preview.

Aliases:

m, move
Ferramenta Rotate

Fluxo esperado:

ROTATE:
1. Verificar seleção.
2. Solicitar ponto base/pivô.
3. Solicitar ângulo visual ou entrada numérica.
4. Durante movimento do mouse, gerar preview rotacionado.
5. Ao confirmar, gerar RotateEntitiesCommand.

Aliases:

ro, rotate
Ferramenta Scale

Fluxo esperado:

SCALE:
1. Verificar seleção.
2. Solicitar ponto base.
3. Solicitar fator visual ou entrada numérica.
4. Validar fator maior que zero.
5. Gerar preview escalonado.
6. Confirmar com ScaleEntitiesCommand.

Aliases:

sc, scale
Ferramenta Trim

Fluxo esperado:

TRIM:
1. Solicitar bordas de corte ou Enter para usar todas.
2. Solicitar clique no trecho a ser cortado.
3. Usar cad-geometry para detectar interseções.
4. Destacar trecho removível em preview.
5. Ao clicar, gerar TrimEntityCommand.
6. Permanecer ativa até Esc ou Enter.

Aliases:

tr, trim
Ferramenta Offset

Fluxo esperado:

OFFSET:
1. Solicitar distância.
2. Solicitar entidade.
3. Solicitar lado do deslocamento.
4. Gerar preview paralelo/concêntrico.
5. Confirmar criando nova entidade via CreateEntityCommand.

Aliases:

o, offset
Ferramenta Fillet

Fluxo esperado:

FILLET:
1. Solicitar raio ou usar último raio.
2. Solicitar primeira entidade.
3. Solicitar segunda entidade.
4. Calcular arco tangente usando cad-geometry.
5. Gerar preview.
6. Confirmar com comando composto de atualização das linhas e criação do arco.

Aliases:

f, fillet
Ferramenta Chamfer

Fluxo esperado:

CHAMFER:
1. Solicitar distância 1.
2. Solicitar distância 2.
3. Solicitar primeira entidade.
4. Solicitar segunda entidade.
5. Calcular pontos de corte.
6. Gerar preview.
7. Confirmar com comando composto.

Aliases:

cha, chamfer
Preview

O pacote cad-tools não desenha preview diretamente. Ele apenas retorna estruturas como:

export type CadPreview =
  | { type: "ghostEntities"; entities: CadEntity[] }
  | { type: "rubberBand"; from: Point2D; to: Point2D }
  | { type: "selectionBox"; start: Point2D; end: Point2D; mode: "window" | "crossing" }
  | { type: "snapMarker"; point: Point2D; snapType: string }
  | { type: "message"; text: string };

O cad-renderer será responsável por desenhar essas estruturas.

Integração com cad-core

O pacote cad-tools deve gerar comandos, por exemplo:

MoveEntitiesCommand
RotateEntitiesCommand
ScaleEntitiesCommand
DeleteEntitiesCommand
CreateEntityCommand
UpdateEntityCommand
CompositeCommand

Toda ferramenta que altera o desenho deve gerar comando.

Integração com cad-geometry

O pacote deve usar cad-geometry para:

distância;
ângulo;
interseção;
projeção;
offset;
cálculo de arco;
cálculo de chanfro;
bounding box;
snap nearest;
transformações matemáticas.
Testes

Toda ferramenta principal deve ter testes unitários cobrindo:

ativação;
cancelamento com Esc;
confirmação com Enter;
geração correta de comando;
geração correta de preview;
uso de seleção existente;
fluxo comando antes da seleção;
rejeição de entrada inválida.
Não implementar agora

Não implementar neste pacote:

componentes React;
toolbar visual;
modais shadcn/ui;
persistência no backend;
renderização Canvas;
regras de permissão Laravel;
banco de dados.

Essas responsabilidades pertencem a outros pacotes.


---

# Prompt para enviar no Codex

Depois de salvar o arquivo acima, no campo **Ask Codex anything...**, cole este prompt. A extensão do Codex no VSCode permite conversar com o agente diretamente no editor, e você pode mencionar arquivos usando `@arquivo` para dar contexto específico. :contentReference[oaicite:1]{index=1}

```txt id="v3hmwy"
Leia o AGENTS.md da raiz do projeto e também o arquivo packages/cad-tools/AGENTS.md.

Você agora atuará como o Agente 04 — Ferramentas CAD.

Tarefa:
Crie a estrutura inicial do pacote packages/cad-tools conforme as instruções do AGENTS.md local.

Nesta primeira etapa, implemente apenas:

1. Estrutura de pastas do pacote.
2. package.json do pacote cad-tools.
3. tsconfig.json do pacote.
4. src/contracts/CadTool.ts
5. src/contracts/ToolContext.ts
6. src/contracts/ToolEvent.ts
7. src/contracts/ToolResult.ts
8. src/command-line/CommandAliases.ts
9. src/command-line/CommandRegistry.ts
10. src/registry/ToolRegistry.ts
11. src/index.ts
12. tests/CommandRegistry.test.ts
13. tests/ToolRegistry.test.ts

Regras:
- Não implemente ainda MoveTool, RotateTool, ScaleTool ou ferramentas concretas.
- Não crie componentes React.
- Não use Canvas.
- Não altere backend Laravel.
- Não crie dependência com DOM.
- Use TypeScript forte.
- Prepare os contratos para integração futura com cad-core, cad-geometry e cad-renderer.
- Caso cad-core ou cad-geometry ainda não existam, crie tipos mínimos temporários apenas dentro do pacote cad-tools, em uma pasta src/temp-types, com TODO claro para substituir depois.

Ao final, explique:
- arquivos criados;
- decisões técnicas;
- como testar;
- próximos passos.