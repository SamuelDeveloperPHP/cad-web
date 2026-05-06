O Chamfer é o próximo passo natural depois do Fillet. A diferença é:

Fillet  → arredonda canto com arco
Chamfer → corta canto com uma linha reta inclinada

Para arquitetura production-grade, recomendo começar com:

Chamfer entre Line + Line

Sem implementar ainda:

Chamfer em rectangle como entidade única
Chamfer em polyline
Chamfer em arc
Chamfer em circle
Chamfer múltiplo automático
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

Estamos iniciando o MVP 3.0 — ChamferTool / Chanfro com arquitetura production-grade.

Diretriz do projeto:
MVP incremental, mas nunca descartável.
A implementação deve nascer com arquitetura de produção, sem lógica pesada no React, sem mutação direta fora do Command Pattern, com Undo/Redo, JSON/SVG preservando dados, Spatial Index consistente e performance considerada desde o início.

Contexto:
O CAD-WEB já possui:
- interface CAD desktop;
- Line, Rectangle, Circle;
- ArcEntity criada pelo FilletTool;
- Move, Rotate, Scale, Offset;
- TrimTool;
- ExtendTool;
- FilletTool;
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

Agora precisamos implementar a ferramenta Chamfer / Chanfro.

Objetivo:
Implementar ChamferTool para quebrar o canto entre duas linhas, criando uma linha reta inclinada entre os dois pontos de corte e ajustando as linhas originais.

Comandos:
- cha
- chamfer

Escopo deste MVP:
1. Chamfer entre duas entidades do tipo line.
2. Usuário informa distância 1 e distância 2.
3. Usuário seleciona a primeira linha perto do lado desejado.
4. Usuário seleciona a segunda linha perto do lado desejado.
5. Sistema calcula:
   - interseção matemática das linhas infinitas;
   - ramo escolhido em cada linha baseado no ponto clicado;
   - ponto de corte na primeira linha a partir da distância 1;
   - ponto de corte na segunda linha a partir da distância 2;
   - linha de chanfro entre esses dois pontos.
6. Sistema mostra preview ghost:
   - linha 1 ajustada;
   - linha 2 ajustada;
   - nova linha de chanfro.
7. Usuário confirma.
8. Sistema atualiza as duas linhas e cria uma nova LineEntity para o chanfro.
9. A operação entra no CommandHistory.
10. Ctrl+Z desfaz.
11. Ctrl+Y refaz.
12. A ferramenta continua ativa usando as mesmas distâncias, estilo AutoCAD.
13. Esc cancela a etapa atual ou encerra conforme padrão do projeto.

Importante:
Neste MVP, o chanfro deve gerar uma nova LineEntity real.
Não representar o chanfro como preview permanente nem como metadado dentro das linhas.

cad-geometry:
Criar funções puras para chamfer:

1. intersectInfiniteLines(lineA, lineB), se ainda não existir.
2. normalizeVector, dot/cross helpers, se necessário.
3. chooseLineBranchFromPickPoint.
4. pointAtDistanceFromVertex.
5. computeLineLineChamfer.

Assinatura sugerida:

computeLineLineChamfer({
  line1,
  line2,
  distance1,
  distance2,
  pickPoint1,
  pickPoint2,
  tolerance
})

Retorno sugerido:

{
  ok: true,
  line1Result,
  line2Result,
  chamferLine,
  cutPoint1,
  cutPoint2,
  vertex
}

ou:

{
  ok: false,
  reason: string
}

Regras geométricas:
1. distance1 deve ser > 0.
2. distance2 deve ser > 0.
3. Aceitar também modo de distância única, usando distance2 = distance1, se o usuário informar apenas um valor.
4. Linhas paralelas ou quase paralelas devem ser rejeitadas.
5. Linhas colineares devem ser rejeitadas.
6. O pickPoint1 e pickPoint2 definem quais ramos das linhas serão usados.
7. Calcular a interseção das linhas infinitas.
8. A partir do vertex, escolher direção de cada linha baseada no pickPoint mais próximo.
9. Calcular cutPoint1 = vertex + direction1 * distance1.
10. Calcular cutPoint2 = vertex + direction2 * distance2.
11. Ajustar line1 até cutPoint1.
12. Ajustar line2 até cutPoint2.
13. Criar chamferLine entre cutPoint1 e cutPoint2.
14. Se uma distância for grande demais para o segmento atual, pode estender a linha até o ponto de corte se coerente com o ramo escolhido.
15. Se o cálculo for impossível, retornar erro seguro.
16. Usar tolerância numérica robusta.
17. Não usar algoritmo O(n²).

cad-core:
1. Usar LineEntity existente para a linha de chanfro.
2. Criar ChamferLineLineCommand ou CompositeCommand.
3. Preferencialmente criar ChamferLineLineCommand para manter Undo/Redo claro.
4. O comando deve armazenar:
   - line1 original;
   - line2 original;
   - line1 atualizada;
   - line2 atualizada;
   - chamferLine criada;
   - ids envolvidos.
5. Undo deve restaurar exatamente as duas linhas originais e remover a linha de chanfro.
6. Redo deve reaplicar as linhas ajustadas e recriar a linha de chanfro.
7. Atualizar Spatial Index corretamente.
8. Não fazer mutação direta no documento fora do Command Pattern.

cad-tools:
1. Criar packages/cad-tools/src/modify/ChamferTool.ts.
2. Registrar aliases:
   - cha
   - chamfer
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Máquina de estados:
   - specify_distance1
   - specify_distance2
   - select_first_line
   - select_second_line
   - preview_confirm
6. Command input:
   - aceitar distância única:
     - 10
     - d=10
     - distance=10
     - distancia=10
   - aceitar duas distâncias:
     - 10,5
     - 10x5
     - d1=10 d2=5
     - distance1=10 distance2=5
     - distancia1=10 distancia2=5
   - se usuário informar apenas uma distância, usar distance1 = distance2.
   - rejeitar valores <= 0, NaN, Infinity ou entrada inválida.
7. Após informar distâncias, ferramenta solicita primeira linha.
8. Primeiro clique:
   - selecionar apenas line;
   - guardar pickPoint1;
   - guardar line1Id.
9. Segundo clique:
   - selecionar apenas line diferente;
   - guardar pickPoint2;
   - calcular chamfer;
   - exibir preview.
10. PointerMove após primeira linha pode mostrar preview preliminar se passar sobre segunda linha, se viável.
11. PointerDown na segunda linha pode confirmar diretamente se preview válido, seguindo UX atual.
12. Após confirmar:
   - executar ChamferLineLineCommand ou CompositeCommand;
   - manter ferramenta ativa;
   - manter distance1/distance2 na memória;
   - voltar para select_first_line.
13. Esc:
   - se estiver com line1 selecionada, limpar line1 e voltar para select_first_line;
   - se estiver no início, cancelar ferramenta conforme padrão do projeto.
14. Respeitar Layers:
   - não permitir chamfer se qualquer uma das linhas estiver em layer locked;
   - não selecionar linhas em layers invisíveis;
   - se layer bloqueada, mostrar mensagem discreta.
15. A LineEntity criada para o chanfro deve usar layer:
   - se as duas linhas estiverem na mesma layer, usar essa layer;
   - se estiverem em layers diferentes, usar document.activeLayerId.
16. A LineEntity criada deve herdar estilo:
   - se as linhas tiverem mesma color/lineWeight/lineType, herdar;
   - caso contrário, usar estilo padrão/ativo conforme arquitetura atual.
17. Não gerar comando durante pointer move.
18. Gerar comando apenas na confirmação.

cad-renderer:
1. Garantir que preview do Chamfer suporte:
   - linha 1 ajustada;
   - linha 2 ajustada;
   - linha de chanfro ghost.
2. Preview deve ser visualmente claro:
   - cor destacada;
   - traço temporário;
   - não alterar documento real.
3. Não exportar preview.
4. Não quebrar viewport culling.
5. Não quebrar renderização de Line, Rectangle, Circle, Arc, Dimensions, Layers, Offset, Trim, Extend e Fillet.

cad-io:
1. Nenhuma alteração estrutural esperada, pois o chanfro cria LineEntity normal.
2. Export JSON/SVG deve salvar/exportar a linha de chanfro normalmente.
3. Import JSON/SVG deve restaurar normalmente.
4. Não serializar previews.

apps/web:
1. Adicionar Chamfer no grupo Modificar da Ribbon.
2. Adicionar Chamfer na toolbar lateral, se fizer sentido.
3. Usar ícone técnico via lucide-react, se disponível.
4. Atualizar command line prompts:
   - [Chamfer] Specify first distance
   - [Chamfer] Specify second distance or press Enter to use same
   - [Chamfer] Select first line
   - [Chamfer] Select second line
   - [Chamfer] Distances are invalid
   - [Chamfer] Lines are parallel or invalid
   - [Chamfer] Layer is locked
5. Atualizar StatusBar label:
   - Chamfer
6. Properties Panel não precisa de entidade nova, pois chamferLine é LineEntity normal.
7. Não quebrar layout CAD desktop.

Snap/Selection:
1. SelectTool deve conseguir selecionar a LineEntity criada pelo Chamfer.
2. SnapService deve funcionar normalmente nos endpoints da linha de chanfro.
3. Spatial Index deve incluir a linha de chanfro pelo bounding box.
4. Não quebrar snaps existentes.

Regras:
- Não implementar chamfer de rectangle, circle, arc ou polyline nesta etapa.
- Não implementar chamfer distance 0 nesta etapa.
- Não implementar múltiplos chamfers automáticos nesta etapa.
- Não implementar backend.
- Não implementar multiempresa.

- Não quebrar Line, Rectangle, Circle, Arc, Select, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab, Properties Panel, Dimensions e Dimension Styles.
- Não fazer mutação direta fora do Command Pattern.
- Não gerar comando durante PointerMove.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Chamfer por botão.
4. Usuário consegue ativar Chamfer por cha.
5. Usuário consegue ativar Chamfer por chamfer.
6. Usuário consegue informar uma distância única 10.
7. Usuário consegue informar duas distâncias 10,5.
8. Usuário consegue selecionar duas linhas que formam um canto.
9. Preview ghost aparece com linha de chanfro e linhas ajustadas.
10. Ao confirmar, as linhas são ajustadas e uma nova LineEntity de chanfro é criada.
11. Ctrl+Z restaura as linhas originais e remove a linha de chanfro.
12. Ctrl+Y reaplica o chamfer.
13. Chamfer permanece ativo com as mesmas distâncias para nova operação.
14. Linhas paralelas são rejeitadas.
15. Distâncias inválidas são rejeitadas.
16. Layer locked impede Chamfer.
17. Select consegue selecionar a linha de chanfro.
18. Properties Panel reconhece a linha de chanfro como LineEntity.
19. Spatial Index inclui a linha de chanfro.
20. Viewport Culling não esconde linha de chanfro incorretamente.
21. Export JSON salva a linha de chanfro.
22. Import JSON restaura a linha de chanfro.
23. Export SVG inclui a linha de chanfro.
24. Performance Lab continua funcionando.
25. Trim, Extend e Fillet continuam funcionando após criação de chanfros.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- comando criado;
- como ChamferTool foi integrada;
- como testar manualmente;
- próximos passos recomendados.
Teste manual após implementação
1. Desenhe duas linhas formando um L.
2. Ative Chamfer.
3. Digite distância 10.
4. Clique na primeira linha perto do canto.
5. Clique na segunda linha perto do canto.
6. Verifique preview.
7. Confirme.
8. Verifique se a linha de chanfro apareceu e as linhas foram ajustadas.
9. Ctrl+Z.
10. Ctrl+Y.

11. Teste duas distâncias:
    - 10,5
    - ou 10x5
12. Verifique se o chanfro fica assimétrico.

13. Teste duas linhas paralelas.
14. Deve rejeitar com mensagem discreta.

15. Teste distância inválida:
    - 0
    - -5
    - abc
16. Deve rejeitar.

17. Bloqueie a layer das linhas.
18. Tente Chamfer.
19. Deve impedir.

20. Selecione a linha de chanfro.
21. Verifique Properties Panel.

22. Export JSON.
23. Clear.
24. Import JSON.
25. Confirmar que o chanfro voltou.

26. Export SVG.
27. Confirmar que a linha de chanfro aparece no SVG.

28. Performance Lab continua funcionando.
29. Comente os códigos na terceira pessoa.
30. Faça a merge com a main
31. Implemente branch
32. Implemente  O Chamfer é o próximo passo natural depois do Fillet. A diferença é:

Fillet  → arredonda canto com arco
Chamfer → corta canto com uma linha reta inclinada

Para arquitetura production-grade, recomendo começar com:

Chamfer entre Line + Line

Sem implementar ainda:

Chamfer em rectangle como entidade única
Chamfer em polyline
Chamfer em arc
Chamfer em circle
Chamfer múltiplo automático
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

Estamos iniciando o MVP 3.0 — ChamferTool / Chanfro com arquitetura production-grade.

Diretriz do projeto:
MVP incremental, mas nunca descartável.
A implementação deve nascer com arquitetura de produção, sem lógica pesada no React, sem mutação direta fora do Command Pattern, com Undo/Redo, JSON/SVG preservando dados, Spatial Index consistente e performance considerada desde o início.

Contexto:
O CAD-WEB já possui:
- interface CAD desktop;
- Line, Rectangle, Circle;
- ArcEntity criada pelo FilletTool;
- Move, Rotate, Scale, Offset;
- TrimTool;
- ExtendTool;
- FilletTool;
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

Agora precisamos implementar a ferramenta Chamfer / Chanfro.

Objetivo:
Implementar ChamferTool para quebrar o canto entre duas linhas, criando uma linha reta inclinada entre os dois pontos de corte e ajustando as linhas originais.

Comandos:
- cha
- chamfer

Escopo deste MVP:
1. Chamfer entre duas entidades do tipo line.
2. Usuário informa distância 1 e distância 2.
3. Usuário seleciona a primeira linha perto do lado desejado.
4. Usuário seleciona a segunda linha perto do lado desejado.
5. Sistema calcula:
   - interseção matemática das linhas infinitas;
   - ramo escolhido em cada linha baseado no ponto clicado;
   - ponto de corte na primeira linha a partir da distância 1;
   - ponto de corte na segunda linha a partir da distância 2;
   - linha de chanfro entre esses dois pontos.
6. Sistema mostra preview ghost:
   - linha 1 ajustada;
   - linha 2 ajustada;
   - nova linha de chanfro.
7. Usuário confirma.
8. Sistema atualiza as duas linhas e cria uma nova LineEntity para o chanfro.
9. A operação entra no CommandHistory.
10. Ctrl+Z desfaz.
11. Ctrl+Y refaz.
12. A ferramenta continua ativa usando as mesmas distâncias, estilo AutoCAD.
13. Esc cancela a etapa atual ou encerra conforme padrão do projeto.

Importante:
Neste MVP, o chanfro deve gerar uma nova LineEntity real.
Não representar o chanfro como preview permanente nem como metadado dentro das linhas.

cad-geometry:
Criar funções puras para chamfer:

1. intersectInfiniteLines(lineA, lineB), se ainda não existir.
2. normalizeVector, dot/cross helpers, se necessário.
3. chooseLineBranchFromPickPoint.
4. pointAtDistanceFromVertex.
5. computeLineLineChamfer.

Assinatura sugerida:

computeLineLineChamfer({
  line1,
  line2,
  distance1,
  distance2,
  pickPoint1,
  pickPoint2,
  tolerance
})

Retorno sugerido:

{
  ok: true,
  line1Result,
  line2Result,
  chamferLine,
  cutPoint1,
  cutPoint2,
  vertex
}

ou:

{
  ok: false,
  reason: string
}

Regras geométricas:
1. distance1 deve ser > 0.
2. distance2 deve ser > 0.
3. Aceitar também modo de distância única, usando distance2 = distance1, se o usuário informar apenas um valor.
4. Linhas paralelas ou quase paralelas devem ser rejeitadas.
5. Linhas colineares devem ser rejeitadas.
6. O pickPoint1 e pickPoint2 definem quais ramos das linhas serão usados.
7. Calcular a interseção das linhas infinitas.
8. A partir do vertex, escolher direção de cada linha baseada no pickPoint mais próximo.
9. Calcular cutPoint1 = vertex + direction1 * distance1.
10. Calcular cutPoint2 = vertex + direction2 * distance2.
11. Ajustar line1 até cutPoint1.
12. Ajustar line2 até cutPoint2.
13. Criar chamferLine entre cutPoint1 e cutPoint2.
14. Se uma distância for grande demais para o segmento atual, pode estender a linha até o ponto de corte se coerente com o ramo escolhido.
15. Se o cálculo for impossível, retornar erro seguro.
16. Usar tolerância numérica robusta.
17. Não usar algoritmo O(n²).

cad-core:
1. Usar LineEntity existente para a linha de chanfro.
2. Criar ChamferLineLineCommand ou CompositeCommand.
3. Preferencialmente criar ChamferLineLineCommand para manter Undo/Redo claro.
4. O comando deve armazenar:
   - line1 original;
   - line2 original;
   - line1 atualizada;
   - line2 atualizada;
   - chamferLine criada;
   - ids envolvidos.
5. Undo deve restaurar exatamente as duas linhas originais e remover a linha de chanfro.
6. Redo deve reaplicar as linhas ajustadas e recriar a linha de chanfro.
7. Atualizar Spatial Index corretamente.
8. Não fazer mutação direta no documento fora do Command Pattern.

cad-tools:
1. Criar packages/cad-tools/src/modify/ChamferTool.ts.
2. Registrar aliases:
   - cha
   - chamfer
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Máquina de estados:
   - specify_distance1
   - specify_distance2
   - select_first_line
   - select_second_line
   - preview_confirm
6. Command input:
   - aceitar distância única:
     - 10
     - d=10
     - distance=10
     - distancia=10
   - aceitar duas distâncias:
     - 10,5
     - 10x5
     - d1=10 d2=5
     - distance1=10 distance2=5
     - distancia1=10 distancia2=5
   - se usuário informar apenas uma distância, usar distance1 = distance2.
   - rejeitar valores <= 0, NaN, Infinity ou entrada inválida.
7. Após informar distâncias, ferramenta solicita primeira linha.
8. Primeiro clique:
   - selecionar apenas line;
   - guardar pickPoint1;
   - guardar line1Id.
9. Segundo clique:
   - selecionar apenas line diferente;
   - guardar pickPoint2;
   - calcular chamfer;
   - exibir preview.
10. PointerMove após primeira linha pode mostrar preview preliminar se passar sobre segunda linha, se viável.
11. PointerDown na segunda linha pode confirmar diretamente se preview válido, seguindo UX atual.
12. Após confirmar:
   - executar ChamferLineLineCommand ou CompositeCommand;
   - manter ferramenta ativa;
   - manter distance1/distance2 na memória;
   - voltar para select_first_line.
13. Esc:
   - se estiver com line1 selecionada, limpar line1 e voltar para select_first_line;
   - se estiver no início, cancelar ferramenta conforme padrão do projeto.
14. Respeitar Layers:
   - não permitir chamfer se qualquer uma das linhas estiver em layer locked;
   - não selecionar linhas em layers invisíveis;
   - se layer bloqueada, mostrar mensagem discreta.
15. A LineEntity criada para o chanfro deve usar layer:
   - se as duas linhas estiverem na mesma layer, usar essa layer;
   - se estiverem em layers diferentes, usar document.activeLayerId.
16. A LineEntity criada deve herdar estilo:
   - se as linhas tiverem mesma color/lineWeight/lineType, herdar;
   - caso contrário, usar estilo padrão/ativo conforme arquitetura atual.
17. Não gerar comando durante pointer move.
18. Gerar comando apenas na confirmação.

cad-renderer:
1. Garantir que preview do Chamfer suporte:
   - linha 1 ajustada;
   - linha 2 ajustada;
   - linha de chanfro ghost.
2. Preview deve ser visualmente claro:
   - cor destacada;
   - traço temporário;
   - não alterar documento real.
3. Não exportar preview.
4. Não quebrar viewport culling.
5. Não quebrar renderização de Line, Rectangle, Circle, Arc, Dimensions, Layers, Offset, Trim, Extend e Fillet.

cad-io:
1. Nenhuma alteração estrutural esperada, pois o chanfro cria LineEntity normal.
2. Export JSON/SVG deve salvar/exportar a linha de chanfro normalmente.
3. Import JSON/SVG deve restaurar normalmente.
4. Não serializar previews.

apps/web:
1. Adicionar Chamfer no grupo Modificar da Ribbon.
2. Adicionar Chamfer na toolbar lateral, se fizer sentido.
3. Usar ícone técnico via lucide-react, se disponível.
4. Atualizar command line prompts:
   - [Chamfer] Specify first distance
   - [Chamfer] Specify second distance or press Enter to use same
   - [Chamfer] Select first line
   - [Chamfer] Select second line
   - [Chamfer] Distances are invalid
   - [Chamfer] Lines are parallel or invalid
   - [Chamfer] Layer is locked
5. Atualizar StatusBar label:
   - Chamfer
6. Properties Panel não precisa de entidade nova, pois chamferLine é LineEntity normal.
7. Não quebrar layout CAD desktop.

Snap/Selection:
1. SelectTool deve conseguir selecionar a LineEntity criada pelo Chamfer.
2. SnapService deve funcionar normalmente nos endpoints da linha de chanfro.
3. Spatial Index deve incluir a linha de chanfro pelo bounding box.
4. Não quebrar snaps existentes.

Regras:
- Não implementar chamfer de rectangle, circle, arc ou polyline nesta etapa.
- Não implementar chamfer distance 0 nesta etapa.
- Não implementar múltiplos chamfers automáticos nesta etapa.
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não quebrar Line, Rectangle, Circle, Arc, Select, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab, Properties Panel, Dimensions e Dimension Styles.
- Não fazer mutação direta fora do Command Pattern.
- Não gerar comando durante PointerMove.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Chamfer por botão.
4. Usuário consegue ativar Chamfer por cha.
5. Usuário consegue ativar Chamfer por chamfer.
6. Usuário consegue informar uma distância única 10.
7. Usuário consegue informar duas distâncias 10,5.
8. Usuário consegue selecionar duas linhas que formam um canto.
9. Preview ghost aparece com linha de chanfro e linhas ajustadas.
10. Ao confirmar, as linhas são ajustadas e uma nova LineEntity de chanfro é criada.
11. Ctrl+Z restaura as linhas originais e remove a linha de chanfro.
12. Ctrl+Y reaplica o chamfer.
13. Chamfer permanece ativo com as mesmas distâncias para nova operação.
14. Linhas paralelas são rejeitadas.
15. Distâncias inválidas são rejeitadas.
16. Layer locked impede Chamfer.
17. Select consegue selecionar a linha de chanfro.
18. Properties Panel reconhece a linha de chanfro como LineEntity.
19. Spatial Index inclui a linha de chanfro.
20. Viewport Culling não esconde linha de chanfro incorretamente.
21. Export JSON salva a linha de chanfro.
22. Import JSON restaura a linha de chanfro.
23. Export SVG inclui a linha de chanfro.
24. Performance Lab continua funcionando.
25. Trim, Extend e Fillet continuam funcionando após criação de chanfros.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- comando criado;
- como ChamferTool foi integrada;
- como testar manualmente;
- próximos passos recomendados.
Teste manual após implementação
1. Desenhe duas linhas formando um L.
2. Ative Chamfer.
3. Digite distância 10.
4. Clique na primeira linha perto do canto.
5. Clique na segunda linha perto do canto.
6. Verifique preview.
7. Confirme.
8. Verifique se a linha de chanfro apareceu e as linhas foram ajustadas.
9. Ctrl+Z.
10. Ctrl+Y.

11. Teste duas distâncias:
    - 10,5
    - ou 10x5
12. Verifique se o chanfro fica assimétrico.

13. Teste duas linhas paralelas.
14. Deve rejeitar com mensagem discreta.

15. Teste distância inválida:
    - 0
    - -5
    - abc
16. Deve rejeitar.

17. Bloqueie a layer das linhas.
18. Tente Chamfer.
19. Deve impedir.

20. Selecione a linha de chanfro.
21. Verifique Properties Panel.

22. Export JSON.
23. Clear.
24. Import JSON.
25. Confirmar que o chanfro voltou.

26. Export SVG.
27. Confirmar que a linha de chanfro aparece no SVG.
28. faça os commits
29. comente os códigos na terceira pessoa.
30. Implemente branch
31. faça a merge com a main
