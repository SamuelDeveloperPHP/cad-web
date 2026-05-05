Essa etapa fecha o primeiro conjunto de cotas técnicas:

DimLinear
DimAligned
DimRadius
DimDiameter
DimAngular

Para este MVP, eu recomendo começar com cota angular entre duas linhas. 
Não vamos ainda medir ângulo de arco, polilinha ou aresta de retângulo de forma automática.

Decisão técnica do MVP 2.3
Escopo aprovado
DimAngular entre duas entidades Line.

Fluxo:

1. Usuário ativa DimAngular.
2. Seleciona a primeira linha.
3. Seleciona a segunda linha.
4. Move o mouse para escolher o lado/arco da cota.
5. Preview ghost aparece.
6. Clica para confirmar.
7. Cota angular é criada.

Comandos:

dan
dimangular

Texto padrão: 45.00°

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

Estamos iniciando o MVP 2.3 — DimAngular com arquitetura production-grade.

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
- dropdown de tipos de cota na Ribbon;
- propriedades avançadas de cota;
- display units;
- arrowType tick/arrow;
- export/import JSON/SVG para cotas.

Agora precisamos implementar:
- DimAngular.

Objetivo:
Implementar cota angular entre duas entidades Line.

Comandos:
- dan
- dimangular

Escopo deste MVP:
1. Cota angular entre duas entidades do tipo line.
2. Preview ghost antes da confirmação.
3. Arco de cota entre as duas linhas.
4. Texto com valor angular em graus.
5. Suporte a textOverride.
6. Suporte a precision.
7. Suporte a color.
8. Suporte a arrowType tick/arrow.
9. Suporte a layer ativa.
10. Suporte a Undo/Redo.
11. Suporte a JSON/SVG.
12. Suporte a Properties Panel.
13. Suporte a BoundingBox e Spatial Index.
14. Integração ao dropdown de Cotas existente.

Não implementar nesta etapa:
- cota angular de arco;
- cota angular entre segmentos de rectangle;
- cota angular entre polyline;
- edição paramétrica por cota;
- constraints paramétricos.

Modelo de entidade:
Usar a entidade dimension já existente, expandindo dimensionType para:

- "angular"

Definição sugerida:

{
  dimensionType: "angular",
  definition: {
    firstLineId?: string,
    secondLineId?: string,
    vertex: Point2D,
    firstPoint: Point2D,
    secondPoint: Point2D,
    arcPoint: Point2D
  }
}

Explicação:
- firstLineId e secondLineId são opcionais para referência futura.
- vertex é o ponto de interseção real ou virtual entre as linhas.
- firstPoint define a direção da primeira linha a partir do vertex.
- secondPoint define a direção da segunda linha a partir do vertex.
- arcPoint define o lado, o raio visual e a posição aproximada da cota.

A cota deve continuar renderizando mesmo se firstLineId/secondLineId não existirem.

Fluxo da DimAngular:
1. Usuário ativa DimAngular pela Ribbon/dropdown ou command line.
2. Sistema solicita selecionar a primeira linha.
3. Usuário clica em uma entidade line.
4. Sistema solicita selecionar a segunda linha.
5. Usuário clica em outra entidade line.
6. Sistema calcula o vertex:
   - se as linhas se interceptam, usar a interseção;
   - se os segmentos não se cruzam, usar a interseção matemática das linhas infinitas;
   - se forem paralelas, bloquear e exibir mensagem discreta.
7. Sistema solicita posição do arco da cota.
8. Ao mover o mouse, aparece preview ghost da cota angular.
9. Usuário clica para confirmar.
10. Cota angular é criada definitivamente.
11. Ctrl+Z remove a cota.
12. Ctrl+Y recria a cota.
13. Esc cancela sem criar.

cad-core:
1. Expandir DimensionEntity para aceitar dimensionType "angular".
2. Criar AngularDimensionDef.
3. Garantir validação da definition angular.
4. Garantir bounding box/spatial index para angular dimensions.
5. Garantir Undo/Redo via CreateEntityCommand.
6. Cotas devem ser criadas na layer ativa.
7. Se a layer ativa estiver locked, impedir criação.
8. A cota deve preservar style, color, precision, arrowType e textOverride.

cad-geometry:
Expandir dimensions.ts com funções puras:

1. buildAngularDimensionGeometry(def, style, displayUnit?)
2. formatAngularDimensionValue(angleRadians ou angleDegrees, style)
3. intersectInfiniteLines(lineA, lineB), se ainda não existir.
4. angleBetweenVectors.
5. normalizeAngle.
6. chooseAngularSectorFromArcPoint.
7. arcToPolylinePoints ou helper para bbox do arco.
8. calcular tick/arrow points nos extremos do arco.
9. calcular textPosition no meio do arco.
10. calcular textRotation, se necessário.
11. calcular bounding box visual da cota angular.

Regras geométricas:
1. O vertex é a interseção das linhas infinitas.
2. Cada linha possui duas direções possíveis a partir do vertex.
3. O arcPoint deve definir qual setor angular será cotado.
4. Para este MVP, escolher o setor que contém a direção vertex → arcPoint.
5. O ângulo exibido deve ser o ângulo menor ou o setor escolhido pelo arcPoint, conforme a posição do mouse.
6. O texto deve ficar próximo ao ponto médio do arco.
7. O raio do arco deve ser a distância entre vertex e arcPoint.
8. Se radius visual for muito pequeno, usar raio mínimo seguro.
9. Se as linhas forem paralelas ou quase paralelas, retornar erro.
10. O valor deve ser exibido em graus:
    - exemplo: 45.00°
11. Precision vem do DimensionStyle.
12. Display unit não deve afetar ângulo.
13. unitSuffix padrão para angular deve ser "°".

Renderer:
1. Renderizar dimensionType === "angular".
2. Usar buildAngularDimensionGeometry.
3. Desenhar:
   - arco da cota;
   - linhas auxiliares curtas, se necessário;
   - ticks ou arrows conforme style.arrowType;
   - texto do ângulo;
   - whiteout sutil já existente, sem ficar agressivo.
4. Respeitar:
   - layer visibility;
   - layer lock;
   - viewport culling;
   - style.color;
   - textOverride;
   - precision;
   - arrowType.
5. Renderizar preview ghost.
6. Garantir bounding box correto para não sumir no culling.

cad-tools:
1. Criar packages/cad-tools/src/dimensions/DimAngularTool.ts.
2. Registrar aliases:
   - dan
   - dimangular
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Hit test deve aceitar apenas entidades line neste MVP.
6. Se usuário clicar em rectangle/circle/dimension, exibir mensagem discreta:
   - "DimAngular aceita apenas linhas neste MVP."
7. Fluxo:
   - select_first_line;
   - select_second_line;
   - specify_arc_location.
8. Gerar preview ghost ao mover o mouse após selecionar as duas linhas.
9. Confirmar com CreateEntityCommand.
10. Esc cancela sem criar.
11. Cota deve ser criada na layer ativa.
12. Se layer ativa estiver locked, bloquear criação.
13. Se as linhas forem paralelas, bloquear criação com mensagem discreta.

cad-io:
1. Export JSON deve salvar angular dimensions.
2. Import JSON deve restaurar angular dimensions.
3. Export SVG deve exportar angular dimensions como:
   <g data-entity-type="dimension" data-dimension-type="angular">
4. O SVG deve conter arco aproximado por path ou polyline, ticks/arrows e texto legível.
5. Import SVG de cotas editáveis pode permanecer como warning/TODO.
6. Não quebrar line, rectangle, circle, linear/aligned/radius/diameter dimensions.

apps/web:
1. Atualizar dropdown de Cotas na Ribbon.
2. Adicionar opção:
   - Angular
3. Se antes Angular estava disabled/TODO, agora habilitar.
4. Selecionar Angular ativa:
   - dimAngular
5. Atualizar command line prompts:
   - [DimAngular] Select first line
   - [DimAngular] Select second line
   - [DimAngular] Specify dimension arc location
6. Atualizar StatusBar labels:
   - DimAngular
7. Atualizar Properties Panel para dimensionType:
   - angular
8. Properties Panel deve exibir:
   - ID
   - Type
   - Dimension Type
   - Layer
   - Text Override
   - Measured Value readonly
   - Precision
   - Unit Suffix
   - Arrow Type
   - Color
9. Measured Value continua read-only.
10. Text Override continua editável.
11. Não implementar edição paramétrica.

Regras:
- Não implementar cota angular de arco nesta etapa.
- Não implementar cota angular de rectangle/polyline nesta etapa.
- Não implementar edição paramétrica por cota.
- Não implementar conversão física de unidade.
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não quebrar DimLinear, DimAligned, DimRadius, DimDiameter, Line, Rectangle, Circle, Select, Move, Rotate, Scale, Offset, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab e Properties Panel.
- Não fazer mutação direta fora do Command Pattern.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. O dropdown de Cotas possui Angular habilitado.
4. Selecionar Angular ativa dimAngular.
5. Usuário consegue ativar DimAngular por dan.
6. Usuário consegue ativar DimAngular por dimangular.
7. Usuário consegue selecionar duas linhas.
8. Ao mover o mouse, aparece preview ghost do arco angular.
9. Usuário consegue posicionar a cota angular.
10. Texto aparece em graus com símbolo °.
11. Linhas paralelas são rejeitadas com mensagem discreta.
12. Clicar em circle/rectangle com DimAngular mostra mensagem discreta.
13. Ctrl+Z remove a cota angular.
14. Ctrl+Y recria a cota angular.
15. Layer invisível oculta cota angular.
16. Layer bloqueada impede criação.
17. Properties Panel reconhece angular dimension.
18. Export JSON salva cota angular.
19. Import JSON restaura cota angular.
20. Export SVG inclui cota angular legível.
21. BoundingBox evita culling incorreto.
22. Spatial Index continua funcionando.
23. Precision e textOverride funcionam no texto angular.
24. Display unit não altera o valor angular.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- ferramenta criada;
- como o dropdown foi atualizado;
- como testar manualmente;
- próximos passos recomendados.

O usuário irá testar a implementação
1. Desenhe duas linhas formando um L.
2. Abra o dropdown de Cotas.
3. Selecione Angular.
4. Clique na primeira linha.
5. Clique na segunda linha.
6. Mova o mouse para posicionar o arco.
7. Confirme a cota.
8. Verifique texto 90.00°.

9. Desenhe duas linhas inclinadas.
10. Crie uma cota angular.
11. Confirme se o valor parece coerente.

12. Teste duas linhas paralelas.
13. O sistema deve rejeitar com mensagem discreta.

14. Selecione a cota angular.
15. Altere precision, color, arrowType e textOverride.
16. Verifique renderização.

17. Export JSON.
18. Clear.
19. Import JSON.
20. Export SVG.
