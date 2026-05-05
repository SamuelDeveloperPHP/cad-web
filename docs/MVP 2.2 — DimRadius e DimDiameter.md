MVP 2.2 — DimRadius e DimDiameter deve incluir também um dropdown de tipos de cota na Ribbon/Toolbar.

A ideia é não deixar vários botões soltos para cada cota. Melhor criar um grupo:

Cotas
├── Linear
├── Alinhada
├── Raio
├── Diâmetro
└── Angular futuramente

O dropdown deve permitir selecionar a ferramenta ativa de cota.

Decisão de UX

Eu recomendo assim:

Ribbon → Grupo "Cotas"
Botão principal: Cota
Dropdown:
- Linear
- Alinhada
- Raio
- Diâmetro
- Angular futuramente disabled

Quando o usuário seleciona uma opção, o sistema ativa a ferramenta correspondente:

Linear     → dimLinear
Alinhada   → dimAligned
Raio       → dimRadius
Diâmetro   → dimDiameter
Angular    → dimAngular futuramente

Também pode manter os comandos de texto:

dli, dimlinear
dal, dimaligned
dra, dimradius
ddi, dimdiameter

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

Estamos iniciando o MVP 2.2 — DimRadius e DimDiameter com dropdown de tipos de cota.

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
- DimLinear e DimAligned;
- propriedades avançadas de cota;
- display units;
- arrowType tick/arrow;
- export/import JSON/SVG para cotas lineares.

Agora precisamos implementar:
- DimRadius;
- DimDiameter;
- Dropdown de seleção dos tipos de cota na Ribbon.

Objetivo:
Implementar cotas circulares para círculos e melhorar a UX da Ribbon com um dropdown de tipos de cota.

Comandos:
- dra
- dimradius
- ddi
- dimdiameter

Ferramentas existentes que devem aparecer no dropdown:
- DimLinear
- DimAligned

Novas ferramentas a adicionar no dropdown:
- DimRadius
- DimDiameter

Futura ferramenta no dropdown:
- DimAngular, exibida como disabled ou TODO, se fizer sentido visualmente.

Implementar:

1. cad-core:
   - Expandir DimensionEntity para aceitar:
     - dimensionType: "radius"
     - dimensionType: "diameter"
   - Criar ou ajustar tipos:
     - RadiusDimensionDef
     - DiameterDimensionDef
   - Garantir validação de radius/diameter dimensions.
   - Garantir bounding box/spatial index para radius/diameter dimensions.
   - Garantir Undo/Redo via CreateEntityCommand.
   - Cotas devem ser criadas na layer ativa.
   - Se layer ativa estiver locked, impedir criação.

2. cad-geometry:
   - Expandir dimensions.ts com funções puras:
     - buildRadiusDimensionGeometry(def, style, displayUnit?)
     - buildDiameterDimensionGeometry(def, style, displayUnit?)
     - formatRadiusDimensionValue(radius, style, displayUnit?)
     - formatDiameterDimensionValue(radius, style, displayUnit?)
   - Criar função para calcular ponto na circunferência na direção do leaderEndPoint.
   - Criar leader line.
   - Criar textPosition.
   - Criar bbox visual da cota.
   - Reutilizar arrowType:
     - tick
     - arrow
   - Respeitar:
     - precision;
     - unitSuffix;
     - displayUnit;
     - textOverride.

3. DimRadius:
   - Usuário ativa DimRadius.
   - Sistema solicita selecionar um círculo.
   - Usuário clica em um circle.
   - Sistema solicita posição da cota/chamada.
   - Ao mover o mouse, aparece preview ghost.
   - Usuário clica para confirmar.
   - Cota radius é criada.
   - Texto padrão deve ser:
     - R {valor formatado}
   - Measured Value = radius.

4. DimDiameter:
   - Usuário ativa DimDiameter.
   - Sistema solicita selecionar um círculo.
   - Usuário clica em um circle.
   - Sistema solicita posição da cota/chamada.
   - Ao mover o mouse, aparece preview ghost.
   - Usuário clica para confirmar.
   - Cota diameter é criada.
   - Texto padrão deve ser:
     - Ø {valor formatado}
   - Measured Value = radius * 2.

5. cad-tools:
   - Criar packages/cad-tools/src/dimensions/DimRadiusTool.ts.
   - Criar packages/cad-tools/src/dimensions/DimDiameterTool.ts.
   - Registrar aliases:
     - dra
     - dimradius
     - ddi
     - dimdiameter
   - Integrar ao ToolRegistry.
   - Integrar ao CommandRegistry.
   - Hit test deve aceitar apenas entidades circle neste MVP.
   - Se usuário clicar em entidade não suportada, exibir mensagem discreta.
   - Gerar preview ghost ao mover o mouse depois de selecionar círculo.
   - Confirmar com CreateEntityCommand.
   - Esc cancela sem criar.
   - Cotas devem ser criadas na layer ativa.
   - Se layer ativa estiver locked, bloquear criação.

6. cad-renderer:
   - Renderizar dimensionType === "radius".
   - Renderizar dimensionType === "diameter".
   - Usar buildRadiusDimensionGeometry/buildDiameterDimensionGeometry.
   - Desenhar:
     - leader line;
     - line de raio/diâmetro;
     - tick ou arrow conforme style.arrowType;
     - texto;
     - prefixo R ou Ø;
     - color/style da cota;
     - whiteout sutil já existente, sem ficar agressivo.
   - Respeitar layer visibility.
   - Respeitar viewport culling.
   - Renderizar preview ghost.
   - Garantir bounding box correto para não sumir indevidamente no culling.

7. cad-io:
   - Export JSON deve salvar radius/diameter dimensions.
   - Import JSON deve restaurar radius/diameter dimensions.
   - Export SVG deve exportar radius/diameter dimensions como:
     <g data-entity-type="dimension" data-dimension-type="radius">
     <g data-entity-type="dimension" data-dimension-type="diameter">
   - SVG deve conter linhas e texto legíveis.
   - Import SVG de cotas editáveis pode permanecer como warning/TODO.
   - Não quebrar line, rectangle, circle, linear/aligned dimensions.

8. apps/web — Dropdown de Cotas:
   - No CadRibbon, criar ou ajustar o grupo “Cotas” ou “Anotações”.
   - Implementar dropdown para selecionar o tipo de cota.
   - O dropdown deve conter:
     - Linear
     - Alinhada
     - Raio
     - Diâmetro
     - Angular futuramente, opcional disabled
   - Ao selecionar:
     - Linear ativa dimLinear.
     - Alinhada ativa dimAligned.
     - Raio ativa dimRadius.
     - Diâmetro ativa dimDiameter.
   - O botão principal do grupo pode mostrar o último tipo de cota usado.
   - O dropdown deve usar visual compatível com o tema CAD desktop.
   - Usar ícones técnicos com lucide-react, se disponível.
   - Não quebrar os botões/atalhos existentes.

9. apps/web — Command line e StatusBar:
   - Atualizar prompts:
     - [DimRadius] Select circle
     - [DimRadius] Specify dimension location
     - [DimDiameter] Select circle
     - [DimDiameter] Specify dimension location
   - Atualizar StatusBar labels:
     - DimRadius
     - DimDiameter
   - Comandos devem funcionar:
     - dra
     - dimradius
     - ddi
     - dimdiameter

10. apps/web — Properties Panel:
   - Atualizar para dimensionType:
     - radius
     - diameter
   - Exibir:
     - ID
     - Type
     - Dimension Type
     - Layer
     - Text Override
     - Measured Value read-only
     - Precision
     - Unit Suffix
     - Arrow Type
     - Color
   - Measured Value continua read-only.
   - Text Override continua editável.
   - Não implementar edição paramétrica.

Regras:
- Não implementar DimAngular nesta etapa.
- Não implementar edição paramétrica por cota.
- Não implementar conversão física de unidade.
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não quebrar DimLinear, DimAligned, Line, Rectangle, Circle, Select, Move, Rotate, Scale, Offset, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab e Properties Panel.
- Não fazer mutação direta fora do Command Pattern.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. O grupo de Cotas na Ribbon possui dropdown.
4. Dropdown lista Linear, Alinhada, Raio e Diâmetro.
5. Selecionar Linear ativa DimLinear.
6. Selecionar Alinhada ativa DimAligned.
7. Selecionar Raio ativa DimRadius.
8. Selecionar Diâmetro ativa DimDiameter.
9. Usuário consegue criar Circle.
10. Usuário consegue criar DimRadius por botão/dropdown.
11. Usuário consegue criar DimRadius por dra/dimradius.
12. Texto aparece com prefixo R.
13. Usuário consegue criar DimDiameter por botão/dropdown.
14. Usuário consegue criar DimDiameter por ddi/dimdiameter.
15. Texto aparece com prefixo Ø.
16. Preview ghost aparece antes da confirmação.
17. Ctrl+Z remove a cota.
18. Ctrl+Y recria a cota.
19. Layer invisível oculta cotas.
20. Layer bloqueada impede criação.
21. Properties Panel reconhece radius/diameter dimensions.
22. Export JSON salva as cotas.
23. Import JSON restaura as cotas.
24. Export SVG inclui as cotas legíveis.
25. BoundingBox evita culling incorreto.
26. Spatial Index continua funcionando.
27. Display unit, precision, arrowType, color e textOverride funcionam no texto/render da cota.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- ferramentas criadas;
- como o dropdown de cotas foi implementado;
- como testar manualmente;
- próximos passos recomendados.