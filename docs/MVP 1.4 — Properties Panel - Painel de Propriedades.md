Leia apenas:

- AGENTS.md da raiz
- apps/web/AGENTS.md
- packages/cad-core/AGENTS.md, se existir
- packages/cad-tools/AGENTS.md, se existir
- packages/cad-geometry/AGENTS.md, se existir
- packages/cad-renderer/AGENTS.md, se existir
- apps/web/src/components/cad/**
- apps/web/src/state/**
- packages/cad-core/src/**
- packages/cad-geometry/src/**
- packages/cad-tools/src/**
- packages/cad-renderer/src/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 1.4 — Properties Panel / Painel de Propriedades com arquitetura production-grade.

Contexto:
O editor CAD já possui interface estilo CAD desktop, ferramentas básicas, Layers, Snap, Undo/Redo, JSON/SVG, Spatial Index, Performance Lab e painel de Layers dockado.
Agora precisamos implementar um painel de propriedades profissional para edição de entidades selecionadas.

Objetivo:
Criar um painel de propriedades no RightPanel para exibir e editar dados das entidades selecionadas.

Implementar:

1. apps/web:
   - Criar CadPropertiesPanel.tsx.
   - Integrar o painel no RightPanel ao lado/aba de Layers.
   - Se nenhuma entidade estiver selecionada, exibir mensagem: “Nenhuma entidade selecionada”.
   - Se uma entidade estiver selecionada, exibir propriedades específicas do tipo.
   - Se múltiplas entidades estiverem selecionadas, exibir painel resumido com:
     - quantidade selecionada;
     - layer comum, se houver;
     - alteração de layer em lote, se viável;
     - cor comum, se houver.

2. Propriedades para Line:
   - ID somente leitura.
   - Type somente leitura.
   - Layer editável.
   - Color editável.
   - Start X editável.
   - Start Y editável.
   - End X editável.
   - End Y editável.
   - Length calculado somente leitura.
   - Angle calculado somente leitura.

3. Propriedades para Rectangle:
   - ID somente leitura.
   - Type somente leitura.
   - Layer editável.
   - Color editável.
   - X editável.
   - Y editável.
   - Width editável.
   - Height editável.
   - Rotation editável, se a entidade suportar.
   - Area calculada somente leitura.
   - Perimeter calculado somente leitura.

4. Propriedades para Circle:
   - ID somente leitura.
   - Type somente leitura.
   - Layer editável.
   - Color editável.
   - Center X editável.
   - Center Y editável.
   - Radius editável.
   - Diameter calculado somente leitura.
   - Area calculada somente leitura.
   - Circumference calculada somente leitura.

5. cad-core:
   - Criar ou ajustar UpdateEntityCommand.
   - Criar ou ajustar MoveEntitiesToLayerCommand, se ainda não existir.
   - Garantir que alterações feitas pelo Properties Panel entrem no CommandHistory.
   - Ctrl+Z deve desfazer alterações do painel.
   - Ctrl+Y deve refazer alterações do painel.
   - Não editar entidades por mutação direta fora dos comandos.

6. cad-geometry:
   - Usar funções existentes para cálculos quando disponíveis:
     - distância;
     - ângulo;
     - área;
     - perímetro;
     - circunferência.
   - Se não existirem, criar helpers simples e testáveis.

7. cad-renderer:
   - Após alteração de propriedades, o canvas deve atualizar corretamente.
   - Spatial Index deve ser atualizado quando geometria mudar.
   - Viewport Culling deve continuar funcionando.

8. Layers:
   - O campo Layer deve listar as layers existentes.
   - Não permitir mover entidade para layer inexistente.
   - Se a layer estiver bloqueada, impedir edição da entidade e exibir aviso discreto.
   - Se a entidade estiver em layer invisível, normalmente não deve estar selecionada; manter fallback seguro.

9. UI/UX:
   - Painel deve ter aparência CAD profissional.
   - Inputs compactos.
   - Labels claros.
   - Valores numéricos com precisão controlada.
   - Não ocupar área excessiva do canvas.
   - Usar estilo compatível com o redesign CAD desktop.
   - Evitar modais desnecessários.

10. Performance:
   - Não recalcular todo o documento ao editar uma propriedade.
   - Atualizar apenas entidade alterada e índices necessários.
   - Evitar clones gigantes.
   - Não usar setState em loop.
   - Não quebrar Performance Lab.

Regras:
- Não implementar backend.
- Não implementar multiempresa.
- Não implementar branch/commit.
- Não implementar Offset/Trim/Fillet ainda.
- Não alterar import/export JSON/SVG sem necessidade.
- Não quebrar Line, Rectangle, Circle, Select, Move, Rotate, Scale, Erase, Pan, Snap, Layers, Undo/Redo, Clear, JSON/SVG e Performance Lab.
- Não fazer mutação direta do documento fora de comandos.
- Não imprimir arquivos completos na resposta final.

Critérios de aceite:
1. npm run dev funciona.
2. npm run test funciona.
3. Ao selecionar uma Line, o painel mostra propriedades da linha.
4. Editar Start X/Y ou End X/Y altera a linha no canvas.
5. Ctrl+Z desfaz a alteração da linha.
6. Ao selecionar Rectangle, o painel mostra X, Y, Width e Height.
7. Editar Width ou Height altera o retângulo.
8. Ao selecionar Circle, o painel mostra Center e Radius.
9. Editar Radius altera o círculo.
10. O campo Layer permite mover entidade para outra layer.
11. Entidade em layer bloqueada não pode ser editada.
12. Spatial Index continua funcionando após edição.
13. Snap continua funcionando após edição.
14. Export JSON salva propriedades alteradas.
15. Import JSON restaura propriedades alteradas.
16. Interface continua com visual CAD desktop.
17. Performance Lab continua funcionando.

Ao final, responda curto:
- arquivos criados;
- arquivos alterados;
- comandos criados/ajustados;
- como testar manualmente;
- próximos passos recomendados.