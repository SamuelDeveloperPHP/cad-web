Escopo recomendado

Comandos:

x
explode
explodir

Entidades suportadas neste MVP:

Rectangle → 4 Lines
Polyline aberta → várias Lines
Polyline fechada → várias Lines fechando o contorno
Dimension → geometria visual básica opcional, com cautela

Eu recomendo deixar Dimension como opcional/TODO seguro neste MVP, porque explodir cota pode exigir converter texto e linhas auxiliares em entidades reais. Se ainda não existir TextEntity, melhor não explodir cota agora.

Então o escopo mais seguro é:

Rectangle → Lines
Polyline → Lines

E deixar preparado para:

Dimension → Lines + TextEntity futuramente
Block → Entities futuramente
Array associativo → Entities futuramente
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

Estamos iniciando o MVP 3.5 — ExplodeTool / Explodir com arquitetura production-grade.

Diretriz do projeto:
MVP incremental, mas nunca descartável.
A implementação deve nascer com arquitetura de produção, sem lógica pesada no React, sem mutação direta fora do Command Pattern, com Undo/Redo, JSON/SVG preservando dados, Spatial Index consistente e performance considerada desde o início.

Contexto:
O CAD-WEB já possui:
- interface CAD desktop;
- Line;
- Rectangle;
- Circle;
- ArcEntity;
- PolylineEntity / Path Foundation;
- Move, Rotate, Scale, Offset;
- TrimTool;
- ExtendTool;
- FilletTool;
- ChamferTool;
- MirrorTool;
- Array retangular/polar/path, se já implementados;
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

Agora precisamos implementar a ferramenta Explode / Explodir.

Objetivo:
Implementar ExplodeTool para quebrar entidades compostas em entidades básicas, preservando aparência visual, layer, estilo e histórico de comandos.

Comandos:
- x
- explode
- explodir

Escopo deste MVP:
1. Explodir RectangleEntity em 4 LineEntity.
2. Explodir PolylineEntity aberta em N-1 LineEntity.
3. Explodir PolylineEntity fechada em N LineEntity, conectando último ponto ao primeiro.
4. Explodir múltiplas entidades selecionadas em uma única operação.
5. Entidades não suportadas devem ser ignoradas com mensagem discreta.
6. Operação deve passar pelo CommandHistory.
7. Ctrl+Z deve restaurar entidades originais.
8. Ctrl+Y deve reaplicar explode.
9. Spatial Index deve ser atualizado corretamente.
10. JSON/SVG deve preservar o resultado como entidades normais.
11. Properties Panel deve reconhecer as novas linhas.

Não implementar nesta etapa:
- Explode de Circle.
- Explode de Arc.
- Explode de Dimension em linhas/texto.
- Explode de Block.
- Explode de Array Associativo.
- Explode de Hatch.
- Explode de Text.
- Conversão de cota em TextEntity.
- Backend.
- Multiempresa.
- Branch/commit.

Observação:
Se já existir TextEntity e a arquitetura estiver madura, Explode de Dimension pode ser deixado como TODO futuro, mas não implementar agora sem segurança.

Fluxo esperado:
1. Usuário seleciona uma ou mais entidades.
2. Usuário ativa Explode por botão ou command line.
3. Se houver seleção válida, a operação é executada.
4. Se não houver seleção, CommandLine exibe:
   [Explode] Select objects.
5. Usuário seleciona entidades.
6. Usuário pressiona Enter.
7. Sistema explode as entidades suportadas.
8. Entidades originais suportadas são removidas.
9. Entidades resultantes são criadas.
10. Entidades não suportadas permanecem inalteradas.
11. Ferramenta retorna para Select ou segue o padrão atual.

cad-geometry:
Criar funções puras para Explode:

1. explodeRectangleToLines(rectangle)
   - Retorna 4 LineEntity-like geometry ou segmentos.
   - Deve respeitar rotation se RectangleEntity tiver rotation.
   - Se rectangle não tiver rotation, usar rotation = 0.
   - Os pontos devem formar o mesmo contorno visual do retângulo.

2. explodePolylineToLines(polyline)
   - Se closed = false:
     - criar linhas entre pontos consecutivos.
   - Se closed = true:
     - criar linhas entre pontos consecutivos e do último para o primeiro.
   - Ignorar segmentos de comprimento zero dentro da tolerância.

3. explodeEntityToPrimitiveLines(entity)
   - Para este MVP:
     - rectangle → lines;
     - polyline → lines;
     - outros → unsupported.
   - Não atribuir IDs dentro da geometria se o padrão do projeto usar idFactory externa.

4. Helpers:
   - getRectangleCorners(rectangle)
   - pointsToSegments(points, closed)
   - isZeroLengthSegment
   - preserveEntityStyleForExplode

5. Criar testes unitários para:
   - rectangle sem rotação → 4 linhas;
   - rectangle com rotação, se suportado;
   - polyline aberta com 4 pontos → 3 linhas;
   - polyline fechada com 4 pontos → 4 linhas;
   - pontos duplicados não geram linha zero;
   - entidade unsupported retorna aviso seguro.

Regras geométricas:
1. As linhas resultantes devem manter a aparência visual da entidade original.
2. As linhas resultantes devem herdar:
   - layerId;
   - color;
   - lineWeight;
   - lineType;
   - propriedades visuais seguras.
3. As linhas resultantes devem receber novos IDs.
4. Não clonar:
   - id antigo;
   - createdAt;
   - updatedAt;
   - version;
   - metadados únicos.
5. Se a entidade original não tiver layerId, usar fallback "layer_0".
6. Não usar algoritmo O(n²).
7. Funções devem ser puras e testáveis.

cad-core:
1. Criar ExplodeEntitiesCommand.
2. O comando deve aceitar:
   - sourceEntityIds;
   - explodedMap ou lista de:
     - originalEntity;
     - resultEntities.
3. Execute/Redo:
   - remover entidades originais suportadas;
   - adicionar entidades resultantes.
4. Undo:
   - remover entidades resultantes;
   - restaurar entidades originais.
5. Entidades não suportadas não devem ser removidas.
6. Se nenhuma entidade suportada for encontrada, não alterar documento.
7. Atualizar Spatial Index corretamente.
8. Preferir atualização em lote quando possível.
9. Não criar um comando por entidade.
10. Não fazer mutação direta fora do Command Pattern.

cad-tools:
1. Criar packages/cad-tools/src/modify/ExplodeTool.ts.
2. Registrar aliases:
   - x
   - explode
   - explodir
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Máquina de estados:
   - selecting_objects
   - execute_explode
6. Seleção:
   - Se já houver seleção ativa, usar seleção existente.
   - Se não houver seleção, solicitar seleção.
   - Enter confirma seleção.
7. Operação:
   - Filtrar entidades suportadas:
     - rectangle;
     - polyline.
   - Ignorar entidades em layers invisíveis.
   - Se entidade estiver em layer locked, não explodir.
   - Se alguma entidade selecionada estiver locked, exibir mensagem discreta.
8. Após execução:
   - selecionar as entidades resultantes, se o padrão atual permitir.
   - limpar preview.
9. Esc cancela sem alterar.
10. Não gerar comando se nada suportado for encontrado.
11. Mostrar mensagens:
   - [Explode] Select objects
   - [Explode] Nothing to explode
   - [Explode] Some entities are not supported
   - [Explode] Layer is locked
12. Não usar React.
13. Não fazer mutação direta.
14. Gerar comando apenas na confirmação.

cad-renderer:
1. Nenhuma alteração estrutural esperada.
2. As entidades resultantes são LineEntity normais.
3. Garantir que seleção/highlight das linhas resultantes funcione.
4. Não serializar preview.
5. Não quebrar viewport culling.

cad-io:
1. Nenhuma alteração estrutural esperada.
2. Explode gera entidades normais.
3. Export JSON/SVG deve salvar/exportar o resultado normalmente.
4. Import JSON/SVG deve restaurar normalmente.
5. Não serializar qualquer metadado temporário de Explode.

apps/web:
1. Adicionar Explode no grupo Modificar da Ribbon.
2. Adicionar Explode na toolbar lateral, se fizer sentido.
3. Usar ícone técnico via lucide-react, se disponível.
4. Atualizar command line prompts:
   - [Explode] Select objects
   - [Explode] Nothing to explode
   - [Explode] Some entities are not supported
   - [Explode] Layer is locked
5. Atualizar StatusBar label:
   - Explode
6. Não quebrar layout CAD desktop.

Snap/Selection:
1. SelectTool deve conseguir selecionar as linhas resultantes.
2. SnapService deve funcionar nos endpoints/midpoints das linhas resultantes.
3. Spatial Index deve incluir as linhas resultantes.
4. Properties Panel deve reconhecer as linhas resultantes como LineEntity.
5. Viewport Culling deve continuar correto.

Regras:
- Não implementar explode de Dimension nesta etapa.
- Não implementar explode de Circle nesta etapa.
- Não implementar explode de Arc nesta etapa.
- Não implementar explode de Block/Hatch/Text nesta etapa.
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não quebrar Line, Rectangle, Circle, Arc, Polyline, Select, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Chamfer, Mirror, Array, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab, Properties Panel, Dimensions e Dimension Styles.
- Não fazer mutação direta fora do Command Pattern.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Explode por botão.
4. Usuário consegue ativar Explode por x.
5. Usuário consegue ativar Explode por explode.
6. Usuário consegue ativar Explode por explodir.
7. Usuário consegue selecionar Rectangle e explodir em 4 Lines.
8. Usuário consegue selecionar Polyline aberta e explodir em Lines.
9. Usuário consegue selecionar Polyline fechada e explodir em Lines.
10. Entidade original suportada é removida.
11. Linhas resultantes são criadas.
12. Linhas resultantes herdam layer/style.
13. Entidades não suportadas permanecem inalteradas.
14. Layer locked impede Explode.
15. Ctrl+Z restaura Rectangle/Polyline original e remove linhas.
16. Ctrl+Y reaplica Explode.
17. Linhas resultantes são selecionáveis.
18. Snap endpoint/midpoint funciona nas linhas resultantes.
19. Properties Panel reconhece linhas resultantes.
20. Spatial Index inclui linhas resultantes.
21. Export JSON salva resultado explodido.
22. Import JSON restaura resultado explodido.
23. Export SVG inclui resultado explodido.
24. Performance Lab continua funcionando.
25. Ferramentas existentes continuam funcionando.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- comando criado;
- como ExplodeTool foi integrada;
- como testar manualmente;
- próximos passos recomendados.
Teste manual após implementação
1. Desenhe um Rectangle.
2. Selecione o Rectangle.
3. Ative Explode.
4. Confirme que virou 4 Lines.
5. Selecione uma das linhas.
6. Verifique Properties Panel.
7. Teste Snap endpoint/midpoint.
8. Ctrl+Z.
9. Confirmar que Rectangle voltou.
10. Ctrl+Y.

11. Crie uma Polyline aberta com 4 pontos.
12. Selecione.
13. Explode.
14. Confirmar que virou 3 Lines.

15. Crie uma Polyline fechada com 4 pontos.
16. Explode.
17. Confirmar que virou 4 Lines.

18. Selecione Circle e tente Explode.
19. Deve manter Circle e mostrar aviso discreto.

20. Bloqueie a layer do Rectangle.
21. Tente Explode.
22. Deve impedir.

23. Export JSON.
24. Clear.
25. Import JSON.
26. Confirmar resultado.

27. Export SVG.
28. Confirmar que as linhas aparecem no SVG.

Depois do ExplodeTool, eu recomendo seguir para:

MVP 3.6 — ArcTool / Arco

Porque você já tem ArcEntity criada pelo Fillet, mas ainda falta o usuário conseguir desenhar arcos diretamente.