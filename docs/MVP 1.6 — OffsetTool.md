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
- apps/web/src/components/cad/**
- apps/web/src/state/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 1.6 — OffsetTool com arquitetura production-grade.

Contexto:
O CAD-WEB já possui editor funcional com interface CAD desktop, ferramentas básicas, Layers, Snap, Undo/Redo, JSON/SVG, Spatial Index, Viewport Culling, Performance Lab e Properties Panel.

Agora vamos implementar a primeira ferramenta geométrica avançada de modificação: Offset.

Objetivo:
Implementar OffsetTool para criar geometrias paralelas ou concêntricas a partir de uma entidade existente.

Comandos:
- o
- offset

Fluxo esperado:
1. Usuário ativa Offset pela toolbar, ribbon ou command line.
2. A command line solicita a distância do offset.
3. Usuário informa distância via command line, por exemplo:
   - 10
   - 25.5
   - d=20
   - distance=20
4. Sistema valida que a distância é maior que zero.
5. Usuário seleciona uma entidade suportada.
6. Usuário move o mouse para escolher o lado do offset.
7. Sistema mostra preview ghost/fantasma da nova geometria.
8. Usuário clica para confirmar.
9. Sistema cria a nova entidade.
10. A nova entidade deve ser criada na layer ativa ou na mesma layer da entidade original, conforme regra definida abaixo.
11. A criação entra no CommandHistory.
12. Ctrl+Z desfaz o offset.
13. Ctrl+Y refaz o offset.
14. Esc cancela sem criar entidade.

Regra de layer:
- Para este MVP, a entidade criada pelo Offset deve herdar a layer da entidade original.
- Se a layer original estiver bloqueada, o Offset deve ser impedido.
- Se a layer original estiver invisível, normalmente a entidade não deve ser selecionável.
- Se a entidade não tiver layerId, usar fallback "layer_0".

Entidades suportadas no MVP:

1. Line:
   - Criar linha paralela à distância informada.
   - O lado deve ser decidido pela posição do mouse em relação à linha.
   - Usar vetor normal unitário para deslocamento.
   - Preview deve mostrar a linha paralela antes da confirmação.

2. Rectangle:
   - Criar retângulo expandido ou contraído.
   - Mouse fora do retângulo deve indicar offset externo.
   - Mouse dentro do retângulo deve indicar offset interno.
   - Offset interno não pode gerar width <= 0 ou height <= 0.
   - Se inválido, exibir erro discreto.
   - Preview deve mostrar o retângulo resultante.

3. Circle:
   - Criar círculo concêntrico.
   - Mouse fora do círculo deve aumentar o raio.
   - Mouse dentro do círculo deve diminuir o raio.
   - Offset interno não pode gerar radius <= 0.
   - Se inválido, exibir erro discreto.
   - Preview deve mostrar o círculo resultante.

Implementar em cad-geometry:
1. Funções puras de offset:
   - offsetLine(line, distance, sidePoint)
   - offsetRectangle(rectangle, distance, sidePoint)
   - offsetCircle(circle, distance, sidePoint)
2. Helpers geométricos necessários:
   - ponto mais próximo em segmento, se ainda não existir;
   - lado de ponto em relação à linha;
   - normal unitária de segmento;
   - teste ponto dentro de retângulo;
   - distância ponto-centro para círculo.
3. Testes unitários para:
   - offset de linha para um lado;
   - offset de linha para o lado oposto;
   - offset externo de retângulo;
   - offset interno válido de retângulo;
   - offset interno inválido de retângulo;
   - offset externo de círculo;
   - offset interno válido de círculo;
   - offset interno inválido de círculo.

Implementar em cad-core:
1. Usar CreateEntityCommand existente para criar a entidade resultante.
2. Se necessário, criar comando específico OffsetEntityCommand, mas preferir CreateEntityCommand se for suficiente.
3. Garantir integração com CommandHistory.
4. Garantir que spatial index seja atualizado após criação da nova entidade.

Implementar em cad-tools:
1. Criar packages/cad-tools/src/modify/OffsetTool.ts.
2. Registrar aliases:
   - o
   - offset
3. Integrar ao ToolRegistry.
4. Integrar ao CommandRegistry.
5. Usar SnapService nos pontos de entrada quando aplicável.
6. Usar entidades visíveis e não bloqueadas.
7. Gerar preview ghost sem alterar o documento real.
8. Confirmar criando comando definitivo.
9. Esc deve limpar preview e cancelar.

Implementar em cad-renderer:
1. Garantir que preview ghost suporte line, rectangle e circle.
2. Não transformar preview em entidade real.
3. Manter viewport culling funcionando.
4. Manter layer filtering funcionando.

Implementar em apps/web:
1. Adicionar botão Offset na Ribbon/Toolbar, no grupo Modificar.
2. Adicionar ícone usando lucide-react, se disponível.
3. Integrar command line com `o` e `offset`.
4. Atualizar prompt da command line:
   - [Offset] Specify offset distance
   - [Offset] Select entity to offset
   - [Offset] Specify side to offset
5. Não quebrar layout CAD desktop.
6. Não quebrar Properties Panel.
7. Não quebrar Layers Panel.
8. Não quebrar Performance Lab.

Regras:
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não implementar Trim, Fillet ou Chamfer nesta etapa.
- Não implementar offset de polyline ainda, salvo se já houver suporte robusto.
- Não alterar JSON/SVG sem necessidade, mas garantir que entidades criadas por offset sejam exportadas/importadas normalmente.
- Não quebrar Line, Rectangle, Circle, Select, Move, Rotate, Scale, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG, Performance Lab e Properties Panel.
- Não fazer mutação direta do documento fora do Command Pattern.
- Não usar algoritmo O(n²).
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Offset pelo botão.
4. Usuário consegue ativar Offset por `o`.
5. Usuário consegue ativar Offset por `offset`.
6. Usuário consegue informar distância 10.
7. Usuário consegue offsetar uma Line para um lado.
8. Usuário consegue offsetar uma Line para o lado oposto.
9. Usuário consegue offsetar um Rectangle para fora.
10. Usuário consegue offsetar um Rectangle para dentro.
11. Offset interno inválido de Rectangle é bloqueado.
12. Usuário consegue offsetar um Circle para fora.
13. Usuário consegue offsetar um Circle para dentro.
14. Offset interno inválido de Circle é bloqueado.
15. Preview ghost aparece antes da confirmação.
16. Ctrl+Z desfaz a criação do offset.
17. Ctrl+Y refaz a criação.
18. Entidade criada herda a layer da entidade original.
19. Offset é impedido em layer bloqueada.
20. Export JSON salva entidades criadas por offset.
21. Import JSON restaura entidades criadas por offset.
22. Snap continua funcionando.
23. Spatial Index continua correto após offset.
24. Properties Panel reconhece entidades criadas por offset.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- funções geométricas criadas;
- como OffsetTool foi integrada;
- como testar manualmente;
- próximos passos recomendados.