Leia apenas:

* AGENTS.md da raiz
* apps/web/AGENTS.md
* packages/cad-core/AGENTS.md, se existir
* packages/cad-tools/AGENTS.md, se existir
* packages/cad-geometry/AGENTS.md, se existir
* packages/cad-renderer/AGENTS.md, se existir
* packages/cad-io/AGENTS.md, se existir
* packages/cad-core/src/**
* packages/cad-tools/src/**
* packages/cad-geometry/src/**
* packages/cad-renderer/src/**
* packages/cad-io/src/**
* apps/web/src/components/cad/**
* apps/web/src/state/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 2.0 — Dimensions / Cotas com arquitetura production-grade.

Contexto:
O CAD-WEB já possui interface estilo CAD desktop, ferramentas básicas, Layers, Snap, Undo/Redo, JSON/SVG, Spatial Index, Viewport Culling, Performance Lab, Properties Panel e ferramentas de modificação.
Agora precisamos implementar a base de cotas técnicas profissionais.

Objetivo:
Implementar o sistema inicial de cotas, começando por:

* DimLinear
* DimAligned

As cotas devem ser entidades reais do documento CAD, renderizadas no canvas, exportáveis/importáveis via JSON/SVG, editáveis no Properties Panel e integradas com Undo/Redo.

Comandos:

* dli
* dimlinear
* dal
* dimaligned

Entidade de cota:
Criar modelo de entidade dimension. Preferencialmente usar uma estrutura extensível:

{
id: string;
type: "dimension";
dimensionType: "linear" | "aligned" | "radius" | "diameter" | "angular";
layerId: string;
style?: object;
definition: object;
textOverride?: string;
createdAt?: string;
updatedAt?: string;
}

Para este MVP, implementar apenas:

1. Linear:
   {
   dimensionType: "linear",
   definition: {
   firstPoint: Point2D,
   secondPoint: Point2D,
   dimensionLinePoint: Point2D,
   orientation: "horizontal" | "vertical" | "auto"
   }
   }

2. Aligned:
   {
   dimensionType: "aligned",
   definition: {
   firstPoint: Point2D,
   secondPoint: Point2D,
   dimensionLinePoint: Point2D
   }
   }

Regras da DimLinear:

1. Usuário ativa DimLinear pela toolbar/ribbon ou command line.
2. Sistema solicita primeiro ponto.
3. Usuário clica no primeiro ponto.
4. Sistema solicita segundo ponto.
5. Usuário clica no segundo ponto.
6. Sistema solicita posição da linha de cota.
7. Ao mover o mouse, aparece preview ghost da cota.
8. Usuário clica para confirmar.
9. Cota é criada definitivamente.
10. A cota entra no CommandHistory.
11. Ctrl+Z remove a cota.
12. Ctrl+Y recria a cota.
13. Esc cancela sem criar entidade.

Regras da DimAligned:

1. Igual à DimLinear, mas a linha da cota deve acompanhar a inclinação entre o primeiro e o segundo ponto.
2. O valor exibido deve ser a distância real entre os dois pontos.
3. A linha de cota deve ser paralela à linha medida.
4. As linhas de chamada devem sair dos pontos medidos até a linha de cota.

cad-geometry:
Implementar funções puras para:

1. distanceBetweenPoints.
2. angleBetweenPoints.
3. projectPointOnLine, se necessário.
4. perpendicularVector.
5. normalizeVector.
6. buildLinearDimensionGeometry.
7. buildAlignedDimensionGeometry.
8. formatDimensionValue.
9. Calcular:

   * extension lines;
   * dimension line;
   * text position;
   * measured value;
   * angle/text rotation quando necessário;
   * bounding box da cota.

Renderer:
O cad-renderer deve desenhar cotas com:

1. Linhas de chamada.
2. Linha de cota.
3. Marcas/setas simples nas extremidades.
4. Texto da medida.
5. Preview ghost.
6. Respeito à layer.
7. Respeito à visibilidade e lock da layer.
8. Respeito ao viewport culling.
9. Texto legível em zoom comum.
10. Não transformar preview em entidade real.

Estilo inicial de cota:
Criar estilo padrão simples:
{
textHeight: number;
arrowSize: number;
extensionOffset: number;
extensionOvershoot: number;
precision: number;
unitSuffix: string;
color?: string;
}

Valores padrão sugeridos:

* textHeight: 12
* arrowSize: 6
* extensionOffset: 2
* extensionOvershoot: 3
* precision: 2
* unitSuffix: " mm"

Se a unidade atual do documento já existir, usar a unidade atual. Se ainda não existir, usar "mm" como fallback.

cad-tools:
Implementar:

1. packages/cad-tools/src/dimensions/DimLinearTool.ts
2. packages/cad-tools/src/dimensions/DimAlignedTool.ts
3. Registrar no ToolRegistry.
4. Registrar aliases no CommandRegistry:

   * dli
   * dimlinear
   * dal
   * dimaligned
5. Usar SnapService para escolher os pontos.
6. Criar preview ghost enquanto o usuário posiciona a linha da cota.
7. Criar cota na layer ativa.
8. Se a layer ativa estiver locked, impedir criação.
9. Esc cancela.
10. Enter pode confirmar etapa atual se a arquitetura permitir.

cad-core:

1. Usar CreateEntityCommand para criar a cota.
2. Se necessário, ajustar validação de entidades para aceitar type "dimension".
3. Garantir Undo/Redo.
4. Garantir spatial index/bounding box para dimension.
5. Garantir que Properties Panel consiga ler a entidade.

cad-io:

1. Export JSON deve salvar cotas.
2. Import JSON deve restaurar cotas.
3. Export SVG deve exportar cotas como grupo <g data-entity-type="dimension"> contendo linhas e texto.
4. Import SVG de cotas pode ser deixado como warning/TODO nesta etapa, se não houver forma confiável de reconstruir uma cota editável a partir do SVG.
5. Não quebrar import/export de line, rectangle e circle.

apps/web:

1. Adicionar botões DimLinear e DimAligned na Ribbon.
2. Grupo recomendado: Anotações ou Cotas.
3. Adicionar ícones com lucide-react se disponível.
4. Atualizar command line prompts:

   * [DimLinear] Specify first extension line origin
   * [DimLinear] Specify second extension line origin
   * [DimLinear] Specify dimension line location
   * [DimAligned] Specify first extension line origin
   * [DimAligned] Specify second extension line origin
   * [DimAligned] Specify dimension line location
5. Atualizar Properties Panel para exibir entidades dimension:

   * ID
   * Type
   * Dimension Type
   * Layer
   * Text Override
   * Measured Value readonly
   * Precision
   * Unit Suffix
6. Permitir alterar layer da cota.
7. Permitir alterar textOverride se viável.
8. Não quebrar o layout CAD desktop.

Regras:

* Não implementar radius, diameter ou angular nesta etapa.
* Não implementar dimension styles completos nesta etapa.
* Não implementar backend.
* Não implementar multiempresa.
* Não implementar branch/commit.
* Não quebrar Line, Rectangle, Circle, Select, Move, Rotate, Scale, Offset, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab e Properties Panel.
* Não fazer mutação direta do documento fora do Command Pattern.
* Não usar algoritmo O(n²).
* Não imprimir arquivos completos na resposta final.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar DimLinear por botão.
4. Usuário consegue ativar DimLinear por dli/dimlinear.
5. Usuário consegue criar cota linear por três cliques.
6. Preview ghost aparece antes da confirmação.
7. O texto da medida aparece.
8. Ctrl+Z remove a cota.
9. Ctrl+Y recria a cota.
10. Usuário consegue ativar DimAligned por botão.
11. Usuário consegue ativar DimAligned por dal/dimaligned.
12. Usuário consegue criar cota alinhada por três cliques.
13. DimAligned mede a distância real inclinada.
14. Cotas respeitam layer ativa.
15. Layer invisível oculta cotas.
16. Layer bloqueada impede criação/edição.
17. Export JSON salva cotas.
18. Import JSON restaura cotas.
19. Export SVG inclui cotas como grupo com linhas e texto.
20. Properties Panel reconhece cota selecionada.
21. Snap continua funcionando para pontos da cota.
22. Spatial Index e viewport culling continuam funcionando.

Ao final, responda curto:

* arquivos criados;
* arquivos alterados;
* funções geométricas criadas;
* ferramentas de cota criadas;
* como testar manualmente;
* próximos passos recomendados.
