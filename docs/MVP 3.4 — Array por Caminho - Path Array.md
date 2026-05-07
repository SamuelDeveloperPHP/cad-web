Como já temos a base de Polyline/Path Foundation, esse MVP deve usar a PolylineEntity como caminho principal. Não recomendo criar PathEntity novo agora. Para este MVP:

Caminho suportado: PolylineEntity
Entidades copiadas: Line, Rectangle, Circle, Arc, Polyline, Dimension
Array associativo: não
Resultado: cópias reais no documento

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

Estamos iniciando o MVP 3.4 — Array por Caminho / Path Array com arquitetura production-grade.

Diretriz do projeto:
MVP incremental, mas nunca descartável.
A implementação deve nascer com arquitetura de produção, sem lógica pesada no React, sem mutação direta fora do Command Pattern, com Undo/Redo, JSON/SVG preservando dados, Spatial Index consistente e performance considerada desde o início.

Contexto:
O CAD-WEB já possui:
- interface CAD desktop;
- Line, Rectangle, Circle;
- ArcEntity;
- PolylineEntity / Path Foundation;
- Move, Rotate, Scale, Offset;
- TrimTool;
- ExtendTool;
- FilletTool;
- ChamferTool;
- MirrorTool;
- ArrayTool retangular;
- Array polar, se já existir;
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

Agora precisamos implementar o Array por Caminho.

Objetivo:
Implementar PathArrayTool para criar cópias reais de entidades selecionadas distribuídas ao longo de uma PolylineEntity, usando amostragem por comprimento real do caminho, com opção de alinhar as cópias à tangente do caminho.

Comandos:
- ap
- arraypath
- patharray
- matrizcaminho
- matrizporcaminho

Escopo deste MVP:
1. Implementar apenas Array por Caminho não associativo.
2. Usar PolylineEntity como caminho.
3. Criar cópias reais das entidades selecionadas.
4. Manter entidades originais intactas.
5. Permitir seleção antes do comando.
6. Permitir comando antes da seleção.
7. Solicitar ponto base das entidades selecionadas.
8. Solicitar seleção do caminho PolylineEntity.
9. Solicitar quantidade de cópias.
10. Perguntar se deve alinhar à tangente do caminho.
11. Mostrar preview ghost antes da confirmação.
12. Confirmar operação criando entidades reais.
13. Integrar com CommandHistory.
14. Ctrl+Z desfaz.
15. Ctrl+Y refaz.
16. Respeitar Layers, Locks, Spatial Index, JSON/SVG e Properties Panel.

Não implementar nesta etapa:
- Array associativo paramétrico.
- Edição posterior do array como entidade única.
- Array por path com Circle/Arc/Line como caminho, exceto se houver adapter seguro já existente.
- Distribuição por spacing fixo.
- Offset normal do caminho.
- Rotação manual extra por item.
- Grips de array.
- Backend.
- Multiempresa.
- Branch/commit.

Decisão importante:
Neste MVP, `count` significa quantidade de cópias criadas ao longo do caminho.
As entidades originais permanecem no local original.
Exemplo:
- count = 5
- 1 entidade selecionada
- resultado: 5 novas cópias ao longo da polyline, e a entidade original permanece.

Distribuição:
1. Para polyline aberta:
   - Se count = 1, criar uma cópia no início do caminho.
   - Se count > 1, distribuir as cópias do início ao fim do caminho, incluindo start e end.
2. Para polyline fechada:
   - Distribuir cópias ao longo do perímetro.
   - Evitar duplicar a posição inicial/final.
   - Usar amostragem por comprimento real.

Fluxo esperado:
1. Usuário seleciona entidades ou ativa Path Array sem seleção.
2. Se não houver seleção, CommandLine exibe:
   [PathArray] Select objects.
3. Usuário seleciona entidades.
4. Usuário pressiona Enter para confirmar seleção.
5. CommandLine exibe:
   [PathArray] Specify base point.
6. Usuário clica no ponto base.
7. CommandLine exibe:
   [PathArray] Select polyline path.
8. Usuário clica em uma PolylineEntity.
9. CommandLine exibe:
   [PathArray] Specify item count.
10. Usuário informa quantidade.
11. CommandLine exibe:
   [PathArray] Align items to path? Yes/No <Yes>.
12. Usuário confirma alinhamento.
13. Sistema mostra preview ghost do array.
14. CommandLine exibe:
   [PathArray] Confirm array? Yes/No <Yes>.
15. Usuário confirma.
16. Sistema cria as cópias reais.
17. Ferramenta retorna para Select ou segue o padrão atual.

cad-geometry:
Criar/ajustar funções puras para path array:

1. samplePolylineByCount(polyline, count)
   - Retorna lista de samples.
   - Cada sample deve conter:
     - point: Point2D
     - tangent: Vector2D normalizado
     - distance: number
     - t: number

2. getPolylineTransformAtSample(sample, basePoint, alignToTangent)
   - Calcula transformação para mover o basePoint até sample.point.
   - Se alignToTangent = true, rotacionar entidade para alinhar eixo X local à tangente.
   - Se alignToTangent = false, apenas transladar.

3. transformEntityForPathArray(entity, transform, newId?)
   - Deve suportar:
     - line;
     - rectangle;
     - circle;
     - arc;
     - polyline;
     - dimension.
   - Deve preservar layerId, color, lineWeight, lineType, dimensionStyleId, styleOverride, textOverride e propriedades visuais seguras.
   - Deve gerar novo ID fora da função se o padrão atual for idFactory externa.

4. buildPathArrayEntities(entities, polyline, params, idFactory?)
   Params:
   - count
   - basePoint
   - alignToTangent

5. Validar:
   - count >= 1
   - path length > tolerance
   - polyline válida
   - basePoint válido

6. Criar testes unitários para:
   - samplePolylineByCount em polyline aberta;
   - samplePolylineByCount em polyline fechada;
   - distribuição com count = 1;
   - distribuição com count > 1;
   - tangente correta;
   - transform de line;
   - transform de circle;
   - transform de polyline;
   - transform de dimension;
   - rejeição de path inválido.

Regras geométricas:
1. Amostragem deve ser por comprimento real, não por índice dos vértices.
2. Para path aberto, count > 1 inclui início e fim.
3. Para path fechado, evitar duplicar início/fim.
4. Tangente deve ser normalizada.
5. Se houver segmento de comprimento zero, ignorar segmento.
6. Se o path tiver comprimento total zero, rejeitar.
7. alignToTangent = true deve rotacionar as cópias conforme a tangente local.
8. alignToTangent = false deve manter orientação original e apenas mover.
9. A rotação deve ocorrer em torno do basePoint informado.
10. Não usar algoritmo O(n²).
11. Funções devem ser puras, sem React, Canvas ou documento completo.

cad-core:
1. Criar PathArrayEntitiesCommand ou reutilizar ArrayEntitiesCommand se ele for genérico.
2. Preferencialmente criar PathArrayEntitiesCommand para Undo/Redo claro.
3. O comando deve aceitar:
   - sourceEntityIds;
   - pathEntityId;
   - createdEntities;
   - params;
4. Execute/Redo:
   - adicionar entidades criadas.
5. Undo:
   - remover entidades criadas.
6. Não alterar entidades originais.
7. Não alterar a PolylineEntity usada como caminho.
8. Entidades criadas devem receber novos IDs.
9. Não clonar:
   - id;
   - createdAt;
   - updatedAt;
   - version;
   - metadados únicos.
10. Atualizar Spatial Index em lote quando possível.
11. Evitar criar um comando por entidade.
12. Não fazer mutação direta fora do Command Pattern.
13. Para arrays grandes, evitar clones desnecessários do documento inteiro.

cad-tools:
1. Criar packages/cad-tools/src/modify/PathArrayTool.ts.
2. Registrar aliases:
   - ap
   - arraypath
   - patharray
   - matrizcaminho
   - matrizporcaminho
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Máquina de estados:
   - selecting_objects
   - specify_base_point
   - select_path
   - specify_count
   - confirm_align
   - confirm_array
6. Seleção:
   - Se já houver seleção ativa, usar seleção existente.
   - Se não houver seleção, solicitar seleção.
   - Enter confirma seleção.
   - Se a seleção incluir a polyline que será usada como path, ela não deve ser copiada por acidente. A ferramenta deve avisar ou remover path da lista de sources após seleção do path.
7. Base point:
   - Usar SnapService se snap estiver ativo.
   - Base point define o ponto que será posicionado sobre cada sample do caminho.
8. Path:
   - Aceitar apenas PolylineEntity neste MVP.
   - Se usuário clicar em line/circle/rectangle/arc/dimension, mostrar:
     [PathArray] Select a polyline path.
9. Count:
   - Aceitar:
     - 5
     - count=5
     - quantidade=5
   - Rejeitar count < 1, NaN, Infinity ou não inteiro.
10. Align:
   - Aceitar:
     - Enter = Yes
     - y/yes/sim/s = Yes
     - n/no/nao/não = No
11. Preview:
   - Após count e align, gerar preview ghost.
   - Preview não deve alterar documento real.
   - Para arrays grandes, limitar preview:
     - se novas entidades > 2.000, desenhar preview reduzido ou bounding boxes.
   - Mostrar aviso:
     [PathArray] Preview reduced for performance.
12. Confirmação:
   - Enter ou yes/sim/s cria entidades.
   - no/não/n cancela.
13. Esc:
   - cancela etapa atual conforme padrão do projeto.
   - limpa preview.
14. Respeitar Layers:
   - não permitir array se alguma entidade source estiver em layer locked.
   - path pode estar em layer locked, pois será usado apenas como referência e não será alterado.
   - ignorar entidades em layers invisíveis na seleção.
   - entidades criadas herdam layer da entidade original.
15. Não gerar comando durante preview.
16. Gerar comando apenas na confirmação final.
17. Aviso de volume:
   - se novas entidades > 10.000, pedir confirmação adicional.
   - se novas entidades > 50.000, mostrar aviso forte de performance.
   - não bloquear, mas avisar.

cad-renderer:
1. Garantir preview ghost de Path Array.
2. Preview deve ser visualmente claro e temporário.
3. Para preview grande, suportar modo leve:
   - limitar entidades desenhadas;
   - ou desenhar bounding boxes;
   - ou mostrar preview reduzido.
4. Não exportar preview.
5. Não quebrar viewport culling.
6. Não quebrar renderização de Line, Rectangle, Circle, Arc, Polyline, Dimensions, Layers, Offset, Trim, Extend, Fillet, Chamfer, Mirror e Array.

cad-io:
1. Nenhuma alteração estrutural esperada.
2. Entidades do Path Array são entidades normais.
3. Export JSON/SVG deve salvar/exportar normalmente.
4. Import JSON/SVG deve restaurar normalmente.
5. Não serializar previews.
6. Não criar entidade especial array associativa neste MVP.

apps/web:
1. Adicionar Path Array no grupo Modificar da Ribbon.
2. Se já existir dropdown de Array, adicionar:
   - Rectangular
   - Polar
   - Path
3. Caso não exista dropdown, criar ou adicionar botão Path Array sem quebrar UI.
4. Adicionar Path Array na toolbar lateral, se fizer sentido.
5. Usar ícone técnico via lucide-react, se disponível.
6. Atualizar command line prompts:
   - [PathArray] Select objects
   - [PathArray] Specify base point
   - [PathArray] Select polyline path
   - [PathArray] Specify item count
   - [PathArray] Align items to path? Yes/No <Yes>
   - [PathArray] Confirm array? Yes/No <Yes>
   - [PathArray] Select a polyline path
   - [PathArray] Invalid count
   - [PathArray] Layer is locked
   - [PathArray] Large array may affect performance
7. Atualizar StatusBar label:
   - Path Array
8. Não quebrar layout CAD desktop.

Snap/Selection:
1. SelectTool deve conseguir selecionar entidades criadas pelo Path Array.
2. SnapService deve funcionar nas entidades criadas.
3. Spatial Index deve incluir entidades criadas.
4. Viewport Culling deve continuar correto.
5. Properties Panel deve reconhecer entidades criadas.

Regras:
- Não implementar Array Associativo nesta etapa.
- Não implementar Path Array editável como entidade única.
- Não implementar Array Path com Line/Circle/Arc como path nesta etapa.
- Não implementar spacing fixo nesta etapa.
- Não implementar offset normal nesta etapa.
- Não implementar grips de array nesta etapa.
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não quebrar Line, Rectangle, Circle, Arc, Polyline, Select, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Chamfer, Mirror, Array retangular/polar, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab, Properties Panel, Dimensions e Dimension Styles.
- Não fazer mutação direta fora do Command Pattern.
- Não gerar comando durante preview.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Path Array por botão.
4. Usuário consegue ativar Path Array por ap.
5. Usuário consegue ativar Path Array por arraypath.
6. Usuário consegue ativar Path Array por patharray.
7. Usuário consegue selecionar uma entidade source.
8. Usuário consegue informar basePoint.
9. Usuário consegue selecionar uma PolylineEntity como path.
10. Usuário consegue informar count = 5.
11. Usuário consegue escolher alignToTangent = Yes.
12. Preview ghost aparece antes da confirmação.
13. Confirmar cria 5 cópias ao longo da polyline.
14. Entidade original permanece.
15. Ctrl+Z remove as cópias criadas.
16. Ctrl+Y recria as cópias.
17. alignToTangent = No mantém orientação original.
18. alignToTangent = Yes alinha à tangente do path.
19. Path aberto distribui cópias do início ao fim.
20. Path fechado distribui sem duplicar início/fim.
21. Path inválido é rejeitado.
22. Count inválido é rejeitado.
23. Source em layer locked impede operação.
24. Path em layer locked pode ser usado como referência.
25. Entidades criadas herdam layer/style das sources.
26. Entidades criadas são selecionáveis.
27. Snap funciona nas entidades criadas.
28. Properties Panel reconhece entidades criadas.
29. Spatial Index inclui entidades criadas.
30. Export JSON salva entidades criadas.
31. Import JSON restaura entidades criadas.
32. Export SVG inclui entidades criadas.
33. Performance Lab continua funcionando.
34. Ferramentas existentes continuam funcionando.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- comando criado;
- como PathArrayTool foi integrada;
- como o preview grande foi tratado;
- como testar manualmente;
- próximos passos recomendados.
Teste manual após implementação
1. Crie uma Polyline aberta com 4 pontos.
2. Crie um Circle pequeno que será a entidade source.
3. Selecione o Circle.
4. Ative Path Array.
5. Informe basePoint no centro do Circle.
6. Selecione a Polyline como path.
7. Informe count = 5.
8. Escolha alignToTangent = Yes.
9. Verifique o preview.
10. Confirme.
11. Deve criar 5 cópias ao longo da Polyline.
12. Ctrl+Z.
13. Ctrl+Y.

14. Repita com alignToTangent = No.
15. Verifique que a orientação não muda.

16. Crie uma Polyline fechada.
17. Faça Path Array com count = 8.
18. Verifique que não duplica início/fim.

19. Teste source em layer locked.
20. Deve impedir.

21. Teste path em layer locked.
22. Deve permitir usar como referência.

23. Export JSON.
24. Clear.
25. Import JSON.
26. Confirmar cópias restauradas.

27. Export SVG.
28. Confirmar visual no SVG.