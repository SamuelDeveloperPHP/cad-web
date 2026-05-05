Esse MVP é muito importante, porque hoje cada cota pode ter propriedades próprias, mas o correto em CAD profissional é ter estilos globais reutilizáveis, como:

Padrão
Arquitetônico
Mecânico
Civil
Elétrico
ABNT
ISO
Empresa

Assim o usuário não precisa configurar textHeight, arrowType, precision, color, unitSuffix cota por cota.

Objetivo do MVP 2.4

Criar um sistema global de estilos de cota:

CadDocument
├── dimensionStyles[]
├── activeDimensionStyleId
└── dimensions usam dimensionStyleId

Cada nova cota criada deve usar o estilo ativo.

A cota ainda pode ter overrides locais, mas o estilo global será a base.

Conceito técnico recomendado
DimensionStyle global
export interface DimensionStyle {
  id: string;
  name: string;

  textHeight: number;
  arrowSize: number;
  extensionOffset: number;
  extensionOvershoot: number;

  precision: number;
  unitSuffix: string;
  arrowType: "tick" | "arrow";

  color?: string;
  textColor?: string;
  lineColor?: string;

  scale?: number;
  isDefault?: boolean;
}
DimensionEntity

A entidade dimension deve passar a ter:

dimensionStyleId?: string;
styleOverride?: Partial<DimensionStyle>;

Regra:

estilo final = DimensionStyle global + styleOverride local
Prompt para enviar ao Codex
Leia apenas:

- AGENTS.md da raiz
- apps/web/AGENTS.md
- packages/cad-core/AGENTS.md, se existir
- packages/cad-tools/AGENTS.md, se existir
- packages/cad-geometry/AGENTS.md, se existir
- packages/cad-renderer/AGENTS.md, se existir
- packages/cad-io/AGENTS.md, se existir
- packages/cad-core/src/**
- packages/cad-tools/src/**
- packages/cad-geometry/src/**
- packages/cad-renderer/src/**
- packages/cad-io/src/**
- apps/web/src/components/cad/**
- apps/web/src/state/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 2.4 — Dimension Styles Globais com arquitetura production-grade.

Contexto:
O CAD-WEB já possui:
- interface CAD desktop;
- Line, Rectangle, Circle;
- Move, Rotate, Scale, Offset;
- Layers;
- Snap;
- Undo/Redo;
- JSON/SVG;
- Spatial Index;
- Viewport Culling;
- Performance Lab;
- Properties Panel;
- DimLinear;
- DimAligned;
- DimRadius;
- DimDiameter;
- DimAngular;
- Dropdown de tipos de cota;
- Propriedades avançadas de cota;
- Display Units;
- arrowType tick/arrow.

Agora precisamos implementar estilos globais de cota, para que o usuário possa criar e reutilizar padrões de dimensionamento.

Objetivo:
Implementar Dimension Styles globais no documento CAD.

O sistema deve permitir:
1. Criar estilos globais de cota.
2. Definir estilo ativo.
3. Criar novas cotas usando o estilo ativo.
4. Editar propriedades do estilo global.
5. Aplicar mudança global em todas as cotas vinculadas ao estilo.
6. Permitir override local opcional em uma cota específica.
7. Persistir estilos no JSON.
8. Exportar SVG usando o estilo resolvido.
9. Manter Undo/Redo para alterações de estilo.

Não implementar nesta etapa:
- edição paramétrica por cota;
- constraints;
- conversão física de unidades;
- templates empresariais;
- backend;
- multiempresa.

cad-core:
1. Criar interface DimensionStyle:

{
  id: string;
  name: string;
  textHeight: number;
  arrowSize: number;
  extensionOffset: number;
  extensionOvershoot: number;
  precision: number;
  unitSuffix: string;
  arrowType: "tick" | "arrow";
  color?: string;
  textColor?: string;
  lineColor?: string;
  scale?: number;
  isDefault?: boolean;
}

2. Adicionar ao CadDocument:
   - dimensionStyles: DimensionStyle[]
   - activeDimensionStyleId: string

3. Documento novo deve nascer com um estilo padrão:
   - id: "dimstyle_standard"
   - name: "Standard"
   - textHeight: 12
   - arrowSize: 6
   - extensionOffset: 2
   - extensionOvershoot: 3
   - precision: 2
   - unitSuffix: " mm"
   - arrowType: "tick"
   - color: opcional
   - isDefault: true

4. Atualizar DimensionEntity:
   - dimensionStyleId?: string
   - styleOverride?: Partial<DimensionStyle>

5. Criar helper:
   - resolveDimensionStyle(document, dimensionEntity)
   - Deve retornar DimensionStyle final = estilo global + styleOverride local.
   - Se dimensionStyleId não existir, usar "dimstyle_standard".
   - Se o documento antigo não possuir dimensionStyles, criar fallback.

6. Criar comandos:
   - CreateDimensionStyleCommand
   - UpdateDimensionStyleCommand
   - DeleteDimensionStyleCommand
   - SetActiveDimensionStyleCommand
   - AssignDimensionStyleCommand
   - UpdateDimensionStyleOverrideCommand, se necessário

7. Regras de comandos:
   - Não permitir excluir o estilo padrão se ele estiver marcado como isDefault.
   - Se um estilo usado por cotas for excluído, migrar essas cotas para o estilo padrão ou impedir exclusão com mensagem.
   - Alterações devem entrar no CommandHistory.
   - Ctrl+Z e Ctrl+Y devem funcionar.

cad-tools:
1. DimLinearTool, DimAlignedTool, DimRadiusTool, DimDiameterTool e DimAngularTool devem criar cotas usando document.activeDimensionStyleId.
2. A cota criada deve receber:
   - dimensionStyleId: document.activeDimensionStyleId
3. Não duplicar todo o estilo dentro da entidade.
4. Permitir styleOverride apenas quando o usuário editar propriedade específica da cota no Properties Panel.
5. Não quebrar ferramentas existentes.

cad-geometry:
1. Atualizar funções de build de cotas para receber o estilo resolvido.
2. Não usar diretamente entity.style antigo se agora houver style global.
3. As funções devem continuar puras.
4. Garantir que:
   - precision;
   - unitSuffix;
   - textHeight;
   - arrowSize;
   - extensionOffset;
   - extensionOvershoot;
   - arrowType;
   - color
   funcionem a partir do estilo resolvido.
5. Não quebrar display units.

cad-renderer:
1. Antes de renderizar uma cota, resolver seu DimensionStyle final.
2. Renderizar usando:
   - estilo global;
   - overrides locais quando existirem.
3. Se uma cota antiga tiver apenas style local, usar como styleOverride/fallback.
4. Respeitar:
   - color;
   - textColor;
   - lineColor;
   - arrowType;
   - textHeight;
   - arrowSize;
   - precision;
   - unitSuffix.
5. Não quebrar DimLinear, DimAligned, DimRadius, DimDiameter e DimAngular.
6. Não quebrar viewport culling.

cad-io:
1. Export JSON deve salvar:
   - dimensionStyles
   - activeDimensionStyleId
   - dimensionStyleId nas cotas
   - styleOverride nas cotas, se existir
2. Import JSON deve restaurar estilos.
3. Import JSON antigo sem dimensionStyles deve criar "dimstyle_standard".
4. Import JSON antigo com cotas contendo style local deve converter ou preservar como styleOverride.
5. Export SVG deve usar o estilo resolvido.
6. Import SVG de cotas editáveis pode continuar como warning/TODO.
7. Não quebrar JSON/SVG de entidades existentes.

apps/web:
1. Criar painel ou seção de Dimension Styles.
2. Pode ficar no RightPanel como nova aba:
   - Layers
   - Properties
   - Dim Styles
3. Criar componente:
   - CadDimensionStylesPanel.tsx

4. O painel deve permitir:
   - listar estilos;
   - criar novo estilo;
   - renomear estilo;
   - definir estilo ativo;
   - editar textHeight;
   - editar arrowSize;
   - editar extensionOffset;
   - editar extensionOvershoot;
   - editar precision;
   - editar unitSuffix;
   - editar arrowType;
   - editar color;
   - editar textColor, se suportado;
   - editar lineColor, se suportado;
   - excluir estilo, respeitando regras.

5. CadRibbon ou StatusBar:
   - Exibir estilo de cota ativo.
   - Permitir selecionar estilo ativo rapidamente, se viável.

6. CadPropertiesPanel:
   - Para uma cota selecionada, exibir:
     - Dimension Style dropdown;
     - botão ou indicador de override local;
     - propriedades locais editáveis como overrides.
   - Ao alterar cor, arrowType, precision etc. diretamente na cota, criar styleOverride.
   - Oferecer ação “Limpar overrides” se viável.
   - Measured Value continua read-only.
   - Text Override continua editável separado do style.

7. UI/UX:
   - Manter visual CAD desktop.
   - Não lotar demais a tela.
   - Usar inputs compactos.
   - Não usar modais grandes se não precisar.
   - Dim Styles deve parecer painel técnico profissional.

Regras:
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não implementar constraints.
- Não implementar edição paramétrica por cota.
- Não implementar conversão física de unidades.
- Não quebrar DimLinear, DimAligned, DimRadius, DimDiameter, DimAngular, Line, Rectangle, Circle, Select, Move, Rotate, Scale, Offset, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab e Properties Panel.
- Não fazer mutação direta fora do Command Pattern.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Documento novo nasce com dimensionStyles e activeDimensionStyleId.
4. Existe estilo Standard padrão.
5. Usuário consegue criar novo estilo de cota.
6. Usuário consegue definir estilo ativo.
7. Nova DimLinear usa o estilo ativo.
8. Nova DimRadius usa o estilo ativo.
9. Nova DimAngular usa o estilo ativo.
10. Alterar textHeight no estilo altera visualmente todas as cotas vinculadas.
11. Alterar arrowType no estilo altera visualmente todas as cotas vinculadas.
12. Alterar precision no estilo altera os textos das cotas vinculadas.
13. Uma cota pode receber styleOverride local.
14. Limpar override faz a cota voltar a seguir o estilo global.
15. Ctrl+Z desfaz alteração de estilo.
16. Ctrl+Y refaz alteração de estilo.
17. Export JSON salva dimensionStyles.
18. Import JSON restaura dimensionStyles.
19. Export SVG usa estilo resolvido.
20. Arquivo JSON antigo sem styles continua abrindo com fallback.
21. Properties Panel mostra Dimension Style da cota.
22. RightPanel possui aba Dim Styles ou área equivalente.
23. Performance Lab continua funcionando.
24. Viewport Culling continua funcionando.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- comandos criados;
- como os estilos globais foram modelados;
- como testar manualmente;
- próximos passos recomendados.
Teste manual depois da implementação
1. Abrir editor.
2. Ir em Dim Styles.
3. Confirmar que existe Standard.
4. Criar estilo "Arquitetônico".
5. Alterar arrowType para tick.
6. Alterar precision para 1.
7. Definir "Arquitetônico" como ativo.
8. Criar DimLinear.
9. Criar DimRadius.
10. Confirmar que ambas usam o estilo ativo.

11. Editar o estilo Arquitetônico:
    - textHeight
    - arrowSize
    - precision
12. Confirmar que as cotas já criadas mudam automaticamente.

13. Selecionar uma cota.
14. No Properties, mudar arrowType só dela.
15. Confirmar que foi criado override local.
16. Limpar override.
17. Confirmar que voltou ao estilo global.

18. Ctrl+Z e Ctrl+Y em alterações de estilo.
19. Export JSON.
20. Clear.
21. Import JSON.
22. Confirmar estilos e cotas preservados.
23. Export SVG.
24. Conferir visual das cotas.