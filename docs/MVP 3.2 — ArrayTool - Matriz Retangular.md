A ferramenta Array vai multiplicar entidades selecionadas em um padrão retangular, com linhas e colunas, semelhante ao AutoCAD.

Neste MVP eu recomendo implementar apenas:

Array Retangular

Deixar para depois:

Array Polar
Array Path
Array Associativo
Array Editável Paramétrico
MVP 3.2 — ArrayTool / Matriz Retangular
Escopo

Comandos:

ar
array
matriz



A primeira instância deve ser o objeto original. As cópias começam a partir da próxima linha/coluna.

Exemplo:

Rows: 3
Columns: 4
Spacing X: 100
Spacing Y: 50

Resultado:
1 original + 11 cópias = 12 posições totais

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

Estamos iniciando o MVP 3.2 — ArrayTool / Matriz Retangular com arquitetura production-grade.

Diretriz do projeto:
MVP incremental, mas nunca descartável.
A implementação deve nascer com arquitetura de produção, sem lógica pesada no React, sem mutação direta fora do Command Pattern, com Undo/Redo, JSON/SVG preservando dados, Spatial Index consistente e performance considerada desde o início.

Fluxo principal:

1. Selecionar entidades
2. Ativar Array
3. Informar linhas
4. Informar colunas
5. Informar espaçamento X
6. Informar espaçamento Y
7. Ver preview ghost
8. Confirmar
9. Criar cópias reais
10. Ctrl+Z desfaz
11. Ctrl+Y refaz
12. Performance Lab continua funcionando.
13. Comente os códigos na terceira pessoa.
14. Faça a merge com a main
15. Implemente branch

Contexto:
O CAD-WEB já possui:
- interface CAD desktop;
- Line, Rectangle, Circle;
- ArcEntity;
- Move, Rotate, Scale, Offset;
- TrimTool;
- ExtendTool;
- FilletTool;
- ChamferTool;
- MirrorTool;
- Layers;
- Snap;
- Undo/Redo;
- JSON/SVG;
- Spatial Index;
- Viewport Culling;
- Performance Lab;
- Properties Panel;
- Dimensions completas;
- Dimension Styles globais;
- Dimension Style Presets.

Agora precisamos implementar a ferramenta Array / Matriz Retangular.

Objetivo:
Implementar ArrayTool para criar múltiplas cópias de entidades selecionadas em uma matriz retangular com linhas, colunas e espaçamentos definidos pelo usuário.

Comandos:
- ar
- array
- matriz

Escopo deste MVP:
1. Implementar apenas Array Retangular.
2. Suportar entidades selecionadas:
   - line
   - rectangle
   - circle
   - arc
   - dimension
3. Permitir seleção antes do comando.
4. Permitir comando antes da seleção.
5. Informar:
   - número de linhas;
   - número de colunas;
   - espaçamento X entre colunas;
   - espaçamento Y entre linhas.
6. Gerar preview ghost da matriz antes da confirmação.
7. Confirmar operação criando cópias reais.
8. Integrar com CommandHistory.
9. Ctrl+Z desfaz.
10. Ctrl+Y refaz.
11. Respeitar layers, locks, JSON/SVG, Spatial Index e Properties Panel.

Não implementar nesta etapa:
- Array polar;
- Array por caminho;
- Array associativo editável;
- Grip de array;
- edição posterior do array como objeto paramétrico;
- backend;
- multiempresa;
- branch/commit.

Fluxo esperado:
1. Usuário seleciona entidades ou ativa Array sem seleção.
2. Se não houver seleção, CommandLine exibe:
   [Array] Select objects.
3. Usuário seleciona entidades.
4. Usuário pressiona Enter para confirmar seleção.
5. CommandLine exibe:
   [Array] Specify rows.
6. Usuário informa número de linhas.
7. CommandLine exibe:
   [Array] Specify columns.
8. Usuário informa número de colunas.
9. CommandLine exibe:
   [Array] Specify column spacing.
10. Usuário informa espaçamento X.
11. CommandLine exibe:
   [Array] Specify row spacing.
12. Usuário informa espaçamento Y.
13. Sistema mostra preview ghost da matriz.
14. CommandLine exibe:
   [Array] Confirm array? Yes/No <Yes>.
15. Usuário confirma com Enter/Yes.
16. Sistema cria as cópias reais.
17. Ferramenta retorna para Select ou segue o padrão atual.

Atalhos e entradas:
- rows devem ser inteiro >= 1.
- columns devem ser inteiro >= 1.
- rows * columns deve ser maior que 1 para criar cópias.
- spacingX e spacingY podem ser positivos, negativos ou zero.
- Pelo menos um dos espaçamentos deve ser diferente de zero.
- Aceitar inputs:
  - 3
  - rows=3
  - linhas=3
  - columns=4
  - colunas=4
  - spacingX=100
  - spacingY=50
  - dx=100
  - dy=50
- Opcionalmente aceitar entrada compacta:
  - 3,4,100,50
  - rows=3 cols=4 dx=100 dy=50

cad-geometry:
Criar funções puras para array retangular:

1. buildRectangularArrayOffsets(params)
   Entrada:
   - rows
   - columns
   - spacingX
   - spacingY
   Saída:
   - lista de offsets { x, y } para cada posição da matriz, excluindo ou incluindo origem conforme parâmetro.

2. cloneEntityWithOffset(entity, offset, newId?)
   - Deve deslocar a geometria da entidade.
   - Não deve alterar a entidade original.
   - Não deve preservar ID antigo.
   - Deve preservar layerId, color, lineWeight, lineType, dimensionStyleId, styleOverride, textOverride e propriedades visuais seguras.

3. arrayEntitiesRectangular(entities, params, idFactory?)
   - Gera as cópias das entidades selecionadas.
   - Por padrão, não deve duplicar a posição original.
   - Deve gerar cópias para todas as demais posições da matriz.
   - Exemplo: rows=3, columns=4 e 2 entidades selecionadas:
     total de novas entidades = (3 * 4 - 1) * 2.

4. Suportar deslocamento de:
   - line;
   - rectangle;
   - circle;
   - arc;
   - dimension.

5. Para dimension:
   - deslocar todos os pontos da definition:
     - linear/aligned: firstPoint, secondPoint, dimensionLinePoint;
     - radius/diameter: center, leaderEndPoint;
     - angular: vertex, firstPoint, secondPoint, arcPoint.
   - preservar dimensionStyleId, styleOverride, textOverride.

6. Criar testes unitários para:
   - geração de offsets;
   - array de line;
   - array de circle;
   - array de dimension linear;
   - não reutilizar IDs;
   - preservar layerId/style;
   - validar rows/columns.

Regras geométricas:
1. O offset de cada coluna é:
   x = columnIndex * spacingX
2. O offset de cada linha é:
   y = rowIndex * spacingY
3. A célula 0,0 representa a posição original.
4. As entidades originais não devem ser clonadas na célula 0,0.
5. Apenas as demais células geram novas entidades.
6. spacingX negativo deve criar matriz para a esquerda.
7. spacingY negativo deve criar matriz para baixo, conforme sistema de coordenadas atual.
8. spacingX = 0 é permitido se spacingY != 0.
9. spacingY = 0 é permitido se spacingX != 0.
10. spacingX = 0 e spacingY = 0 deve ser rejeitado.

cad-core:
1. Criar ArrayEntitiesCommand ou CompositeCommand.
2. Preferencialmente criar ArrayEntitiesCommand para Undo/Redo claro.
3. O comando deve aceitar:
   - sourceEntityIds;
   - createdEntities;
   - arrayParams;
4. Execute/Redo:
   - adicionar entidades criadas.
5. Undo:
   - remover entidades criadas.
6. Não alterar entidades originais.
7. Entidades criadas devem receber novos IDs.
8. Não clonar:
   - id;
   - createdAt;
   - updatedAt;
   - version;
   - metadados únicos.
9. Atualizar Spatial Index em lote quando possível.
10. Evitar criar um comando por entidade.
11. Não fazer mutação direta fora do Command Pattern.
12. Para arrays grandes, evitar clones desnecessários do documento inteiro.

cad-tools:
1. Criar packages/cad-tools/src/modify/ArrayTool.ts.
2. Registrar aliases:
   - ar
   - array
   - matriz
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Máquina de estados:
   - selecting_objects
   - specify_rows
   - specify_columns
   - specify_spacing_x
   - specify_spacing_y
   - confirm_array
6. Seleção:
   - Se já houver seleção ativa, usar seleção existente.
   - Se não houver seleção, solicitar seleção.
   - Enter confirma seleção.
7. Command input:
   - interpretar rows, columns, spacingX, spacingY.
   - aceitar entrada compacta se viável.
   - rejeitar valores inválidos.
8. Preview:
   - após obter rows, columns, spacingX e spacingY, gerar preview ghost da matriz.
   - preview não deve alterar o documento real.
   - para arrays muito grandes, limitar preview para evitar travamento.
   - Exemplo: se novas entidades > 2.000, preview pode mostrar apenas bounding boxes ou amostra limitada.
9. Confirmação:
   - Enter ou yes/sim/s cria entidades.
   - no/não/n cancela.
10. Esc:
   - cancela etapa atual conforme padrão do projeto.
   - limpa preview.
11. Respeitar Layers:
   - não permitir array se alguma entidade selecionada estiver em layer locked.
   - ignorar entidades em layers invisíveis na seleção.
   - entidades criadas herdam layer da entidade original.
12. Não gerar comando durante preview.
13. Gerar comando apenas na confirmação final.
14. A ferramenta deve avisar se o array gerar muitas entidades:
   - se novas entidades > 10.000, pedir confirmação adicional.
   - se novas entidades > 50.000, mostrar aviso forte de performance.
   - não bloquear, mas avisar.

cad-renderer:
1. Garantir preview ghost de array.
2. Preview deve ser visualmente claro e temporário.
3. Para preview grande, suportar modo leve:
   - limitar entidades desenhadas;
   - ou desenhar bounding boxes;
   - ou mostrar aviso de preview reduzido.
4. Não exportar preview.
5. Não quebrar viewport culling.
6. Não quebrar renderização de Line, Rectangle, Circle, Arc, Dimensions, Layers, Offset, Trim, Extend, Fillet, Chamfer e Mirror.

cad-io:
1. Nenhuma alteração estrutural esperada.
2. Entidades do array são entidades normais.
3. Export JSON/SVG deve salvar/exportar normalmente.
4. Import JSON/SVG deve restaurar normalmente.
5. Não serializar previews.
6. Não criar entidade especial array associativa neste MVP.

apps/web:
1. Adicionar Array no grupo Modificar da Ribbon.
2. Adicionar Array na toolbar lateral, se fizer sentido.
3. Usar ícone técnico via lucide-react, se disponível.
4. Atualizar command line prompts:
   - [Array] Select objects
   - [Array] Specify rows
   - [Array] Specify columns
   - [Array] Specify column spacing
   - [Array] Specify row spacing
   - [Array] Confirm array? Yes/No <Yes>
   - [Array] Invalid array parameters
   - [Array] Layer is locked
   - [Array] Large array may affect performance
5. Atualizar StatusBar label:
   - Array
6. Não quebrar layout CAD desktop.

Snap/Selection:
1. SelectTool deve conseguir selecionar entidades criadas pelo Array.
2. SnapService deve funcionar nas entidades criadas.
3. Spatial Index deve incluir entidades criadas.
4. Viewport Culling deve continuar correto.
5. Properties Panel deve reconhecer entidades criadas.

Regras:
- Não implementar Array Polar nesta etapa.
- Não implementar Array Path nesta etapa.
- Não implementar Array associativo nesta etapa.
- Não implementar grips de array nesta etapa.
- Não implementar backend.
- Não implementar multiempresa.
- Não quebrar Line, Rectangle, Circle, Arc, Select, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Chamfer, Mirror, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab, Properties Panel, Dimensions e Dimension Styles.
- Não fazer mutação direta fora do Command Pattern.
- Não gerar comando durante preview.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Array por botão.
4. Usuário consegue ativar Array por ar.
5. Usuário consegue ativar Array por array.
6. Usuário consegue ativar Array por matriz.
7. Usuário consegue selecionar uma Line e criar array 3x4.
8. Array 3x4 com 1 entidade cria 11 novas entidades.
9. Entidade original permanece.
10. Preview ghost aparece antes da confirmação.
11. Ctrl+Z remove as entidades criadas.
12. Ctrl+Y recria as entidades.
13. Array funciona com Line.
14. Array funciona com Circle.
15. Array funciona com Rectangle.
16. Array funciona com Arc.
17. Array funciona com DimensionEntity.
18. Entidades criadas herdam layer/style.
19. Layer locked impede Array.
20. Parâmetros inválidos são rejeitados.
21. Array grande exibe aviso.
22. Entidades criadas são selecionáveis.
23. Snap funciona nas entidades criadas.
24. Properties Panel reconhece entidades criadas.
25. Spatial Index inclui entidades criadas.
26. Export JSON salva entidades criadas.
27. Import JSON restaura entidades criadas.
28. Export SVG inclui entidades criadas.
29. Performance Lab continua funcionando.
30. Ferramentas Trim, Extend, Fillet, Chamfer e Mirror continuam funcionando.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- comando criado;
- como ArrayTool foi integrada;
- como o preview grande foi tratado;
- como testar manualmente;
- próximos passos recomendados.
Teste manual após implementação
1. Desenhe uma linha.
2. Selecione a linha.
3. Ative Array.
4. Informe rows = 3.
5. Informe columns = 4.
6. Informe spacingX = 100.
7. Informe spacingY = 50.
8. Verifique preview.
9. Confirme.
10. Deve criar 11 cópias e manter a original.
11. Ctrl+Z.
12. Ctrl+Y.

13. Repita com Circle.
14. Repita com Rectangle.
15. Repita com uma Arc criada pelo Fillet.
16. Repita com uma cota.

17. Teste spacingX negativo.
18. Teste spacingY negativo.
19. Teste spacingX = 0 e spacingY = 50.
20. Teste spacingX = 0 e spacingY = 0, deve rejeitar.

21. Teste array grande, por exemplo 100x100.
22. Deve mostrar aviso de performance.

23. Export JSON.
24. Clear.
25. Import JSON.
26. Confirmar array restaurado.

27. Export SVG.
28. Confirmar visual no SVG.

