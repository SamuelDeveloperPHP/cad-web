Esse MVP é estratégico porque prepara a base para:

Array por caminho
Explode
Offset de polyline
Trim/Extend em polyline
Fillet/Chamfer em polyline
Grips globais
Snap em vértices
Path sampling

A decisão correta para este MVP é começar com Polyline composta por segmentos retos, sem arcos internos ainda.

MVP 3.3 — PolylineTool / Path Foundation
Escopo inicial

Implementar:

Polyline aberta
Polyline fechada
Criação por cliques
Preview do próximo segmento
Enter para finalizar
C para fechar
U para desfazer último vértice
Esc para cancelar
Snap nos vértices/segmentos
Renderização
JSON/SVG
Properties Panel
Spatial Index
Path utilities para futuro Array por Caminho

Não implementar ainda:

polyline com bulge/arcos
edição por grips
offset de polyline
trim/extend de polyline
fillet/chamfer de polyline
array por caminho
path associativo
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

Estamos iniciando o MVP 3.3 — PolylineTool / Path Foundation com arquitetura production-grade.

Diretriz do projeto:
MVP incremental, mas nunca descartável.
A implementação deve nascer com arquitetura de produção, sem lógica pesada no React, sem mutação direta fora do Command Pattern, com Undo/Redo, JSON/SVG preservando dados, Spatial Index consistente e performance considerada desde o início.

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
- ArrayTool retangular/polar, se já existir;
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

Agora precisamos implementar uma base sólida para Polyline e Path, preparando o futuro Array por Caminho.

Objetivo:
Implementar PolylineEntity e PolylineTool como base de caminhos vetoriais, mantendo arquitetura compatível com futuras ferramentas: Array por Caminho, Explode, Offset de Polyline, Trim/Extend em Polyline, Fillet/Chamfer em Polyline e Grips.

Comandos:
- pl
- polyline
- polilinha

Escopo deste MVP:
1. Criar entidade polyline composta por segmentos retos.
2. Suportar polyline aberta.
3. Suportar polyline fechada.
4. Criar polyline por cliques sucessivos.
5. Mostrar preview/rubber band do próximo segmento.
6. Enter finaliza a polyline aberta.
7. C ou close fecha a polyline.
8. U ou undo remove o último vértice durante criação.
9. Esc cancela a criação sem alterar o documento.
10. Integrar com CommandHistory.
11. Integrar com JSON/SVG.
12. Integrar com renderer.
13. Integrar com Properties Panel.
14. Integrar com Spatial Index.
15. Criar utilities de path para futuro Array por Caminho.

cad-core:
1. Criar ou expandir CadEntity para incluir PolylineEntity.

Modelo sugerido:

{
  id: string;
  type: "polyline";
  layerId: string;
  points: ReadonlyArray<Point2D>;
  closed: boolean;
  color?: string;
  lineWeight?: number;
  lineType?: string;
}

2. Regras:
   - points deve ter pelo menos 2 pontos para polyline aberta.
   - points deve ter pelo menos 3 pontos para polyline fechada.
   - closed define se o último ponto conecta ao primeiro.
   - Não duplicar o primeiro ponto no final da lista; usar closed: true.
   - Entidade deve suportar layerId, color, lineWeight, lineType.
   - Se layerId ausente em documento antigo, usar fallback "layer_0".

3. Garantir PolylineEntity em:
   - CadEntity union;
   - CreateEntityCommand;
   - UpdateEntityCommand;
   - DeleteEntitiesCommand;
   - Move/Rotate/Scale/Mirror/Array, se essas ferramentas usam transformEntity genérico;
   - CommandHistory;
   - Spatial Index;
   - BoundingBox.

4. Criar validação básica para PolylineEntity.
5. Criar bounding box para PolylineEntity.
6. Criar helper para normalizar/remover pontos duplicados consecutivos dentro de tolerância.
7. Não fazer mutação direta fora do Command Pattern.

cad-geometry:
Criar um módulo de base para polyline/path.

Sugestão:
packages/cad-geometry/src/polyline.ts
ou
packages/cad-geometry/src/path.ts

Implementar funções puras:

1. isValidPolyline(points, closed)
2. normalizePolylinePoints(points, tolerance)
3. polylineToSegments(polyline)
4. getPolylineBoundingBox(polyline)
5. getPolylineLength(polyline)
6. getPolylineSegmentLengths(polyline)
7. getPointAtPolylineDistance(polyline, distance)
8. getPointAtPolylineT(polyline, t)
9. getTangentAtPolylineDistance(polyline, distance)
10. getTangentAtPolylineT(polyline, t)
11. getNearestPointOnPolyline(polyline, point)
12. getPolylineMidpoints(polyline)
13. getPolylineVertices(polyline)
14. transformPolylinePoints(points, transform)
15. offsetPolylinePoints ainda NÃO implementar; deixar TODO se necessário.

Regras de path foundation:
- t deve variar de 0 a 1 ao longo do comprimento total.
- Para polyline fechada, considerar o segmento final do último ponto até o primeiro.
- Para path sampling, usar comprimento real dos segmentos, não índice dos pontos.
- tangent deve ser normalizada.
- Se path tiver comprimento zero, retornar erro seguro.
- Funções devem ser puras, sem React, Canvas ou documento.
- Criar testes unitários para:
  - length de polyline aberta;
  - length de polyline fechada;
  - pointAtT;
  - tangentAtT;
  - nearest point;
  - bounding box;
  - duplicate point normalization.

cad-renderer:
1. Renderizar entity.type === "polyline".
2. Desenhar sequência de segmentos.
3. Se closed = true, conectar último ponto ao primeiro.
4. Respeitar:
   - layer visibility;
   - color;
   - lineWeight;
   - lineType;
   - selection highlight;
   - viewport culling;
   - preview ghost.
5. Polyline selecionada deve ter highlight claro.
6. Não quebrar renderização de Line, Rectangle, Circle, Arc e Dimensions.
7. Preview da PolylineTool deve mostrar:
   - segmentos já definidos;
   - rubber band do último ponto até o mouse.
8. Preview não deve ser exportado.

cad-tools:
1. Criar packages/cad-tools/src/draw/PolylineTool.ts.
2. Registrar aliases:
   - pl
   - polyline
   - polilinha
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Máquina de estados:
   - waiting_first_point
   - drawing_polyline
6. Fluxo:
   - primeiro clique define primeiro ponto;
   - cada novo clique adiciona vértice;
   - PointerMove gera preview do próximo segmento;
   - Enter finaliza como aberta se houver pelo menos 2 pontos;
   - C ou close fecha a polyline se houver pelo menos 3 pontos;
   - U ou undo remove último vértice durante criação;
   - Esc cancela sem criar.
7. Usar SnapService para cada ponto.
8. Criar entidade na layer ativa.
9. Se layer ativa estiver locked, impedir criação.
10. Finalizar com CreateEntityCommand.
11. Não criar comando a cada ponto.
12. Apenas um comando deve ser criado ao finalizar a polyline.
13. Se usuário cancelar, nenhum comando deve ser criado.
14. Mostrar mensagens discretas:
   - [Polyline] Specify first point
   - [Polyline] Specify next point or Enter to finish
   - [Polyline] Press C to close
   - [Polyline] Not enough points
   - [Polyline] Layer is locked

Seleção e Snap:
1. SelectTool deve conseguir selecionar PolylineEntity.
2. Hit testing deve considerar distância ponto-segmento em todos os segmentos.
3. SnapService deve suportar PolylineEntity:
   - endpoint: vértices;
   - midpoint: meio de cada segmento;
   - nearest: ponto mais próximo nos segmentos;
   - center: opcional, pode não aplicar neste MVP.
4. Spatial Index deve incluir PolylineEntity pelo bounding box.
5. Viewport Culling deve funcionar.

Transformações:
1. MoveTool deve mover PolylineEntity.
2. RotateTool deve rotacionar PolylineEntity.
3. ScaleTool deve escalar PolylineEntity.
4. MirrorTool deve espelhar PolylineEntity.
5. ArrayTool deve clonar PolylineEntity com offset.
6. Se algum transformador genérico existir, adicionar suporte.
7. Não quebrar ferramentas existentes.

cad-io:
1. Export JSON deve salvar PolylineEntity.
2. Import JSON deve restaurar PolylineEntity.
3. Export SVG deve exportar PolylineEntity como:
   - <polyline> se closed = false;
   - <polygon> ou <path> se closed = true.
4. Preferir <polyline> e <polygon> para MVP.
5. Import SVG:
   - importar <polyline> como PolylineEntity closed=false;
   - importar <polygon> como PolylineEntity closed=true;
   - path complexo pode continuar como TODO/warning.
6. Não quebrar import/export de entidades existentes.
7. Não serializar preview.

apps/web:
1. Adicionar Polyline no grupo Desenhar da Ribbon.
2. Adicionar Polyline na toolbar lateral, se fizer sentido.
3. Usar ícone técnico via lucide-react, se disponível.
4. Atualizar command line prompts:
   - [Polyline] Specify first point
   - [Polyline] Specify next point or Enter to finish
   - [Polyline] Press C to close, U to undo last point
   - [Polyline] Not enough points
   - [Polyline] Layer is locked
5. Atualizar StatusBar label:
   - Polyline
6. Atualizar Properties Panel para PolylineEntity:
   - ID;
   - Type: Polyline;
   - Layer;
   - Color;
   - Closed;
   - Vertex count;
   - Length readonly;
   - Area readonly se closed, opcional;
   - Points list inicialmente read-only ou edição simples se seguro.
7. Edição dos pontos no Properties pode ficar read-only neste MVP, exceto Layer, Color e Closed se for seguro.
8. Não quebrar layout CAD desktop.

Performance:
1. Polyline pode ter muitos pontos.
2. Hit testing deve usar Spatial Index primeiro quando disponível.
3. Não percorrer todas as polylines do documento sem necessidade.
4. Bounding box deve ser barato e cacheável se a arquitetura já tiver cache.
5. Não criar muitos objetos temporários durante render loop.
6. Não quebrar Performance Lab.

Regras:
- Não implementar Polyline com arcos/bulge neste MVP.
- Não implementar grips de polyline neste MVP.
- Não implementar offset de polyline neste MVP.
- Não implementar trim/extend de polyline neste MVP.
- Não implementar fillet/chamfer de polyline neste MVP.
- Não implementar array por caminho neste MVP.
- Não implementar path associativo neste MVP.
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não quebrar Line, Rectangle, Circle, Arc, Select, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Chamfer, Mirror, Array, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab, Properties Panel, Dimensions e Dimension Styles.
- Não fazer mutação direta fora do Command Pattern.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Polyline por botão.
4. Usuário consegue ativar Polyline por pl.
5. Usuário consegue ativar Polyline por polyline.
6. Usuário consegue ativar Polyline por polilinha.
7. Usuário consegue criar polyline aberta com 3 pontos e finalizar com Enter.
8. Usuário consegue criar polyline fechada com C.
9. U remove o último ponto durante criação.
10. Esc cancela sem criar entidade.
11. Preview rubber band aparece durante criação.
12. Polyline é criada na layer ativa.
13. Layer locked impede criação.
14. Select consegue selecionar PolylineEntity.
15. Snap endpoint funciona nos vértices.
16. Snap midpoint funciona nos segmentos.
17. Snap nearest funciona nos segmentos.
18. Move funciona com PolylineEntity.
19. Rotate funciona com PolylineEntity.
20. Scale funciona com PolylineEntity.
21. Mirror funciona com PolylineEntity.
22. Array funciona com PolylineEntity.
23. Properties Panel reconhece PolylineEntity.
24. Spatial Index inclui PolylineEntity.
25. Viewport Culling funciona.
26. Export JSON salva PolylineEntity.
27. Import JSON restaura PolylineEntity.
28. Export SVG inclui polyline/polygon.
29. Import SVG lê polyline/polygon.
30. Performance Lab continua funcionando.
31. Ferramentas existentes continuam funcionando.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- entidade Polyline criada;
- ferramenta PolylineTool criada;
- como Path Foundation foi preparada;
- como testar manualmente;
- próximos passos recomendados.
Teste manual após implementação
1. Ative Polyline pela Ribbon.
2. Clique em 3 ou 4 pontos.
3. Pressione Enter.
4. Confirme que uma polyline aberta foi criada.
5. Selecione a polyline.
6. Verifique o Properties Panel.

7. Ative Polyline novamente.
8. Clique em 4 pontos.
9. Pressione C.
10. Confirme que uma polyline fechada foi criada.

11. Durante criação, pressione U.
12. Confirme que o último ponto foi removido.
13. Durante criação, pressione Esc.
14. Confirme que nada foi criado.

15. Teste Snap endpoint nos vértices.
16. Teste Snap midpoint nos segmentos.
17. Teste Snap nearest nos segmentos.

18. Teste Move, Rotate, Scale.
19. Teste Mirror.
20. Teste Array.

21. Export JSON.
22. Clear.
23. Import JSON.
24. Confirmar polylines restauradas.

25. Export SVG.
26. Confirmar polyline/polygon no SVG.

27. Import SVG contendo polyline/polygon.
28. Confirmar que entra como PolylineEntity.