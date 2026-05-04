Leia apenas:

* AGENTS.md da raiz
* apps/web/AGENTS.md
* packages/cad-core/AGENTS.md, se existir
* packages/cad-tools/AGENTS.md, se existir
* packages/cad-renderer/AGENTS.md, se existir
* packages/cad-io/AGENTS.md, se existir
* packages/cad-core/src/**
* packages/cad-tools/src/**
* packages/cad-renderer/src/**
* packages/cad-io/src/**
* apps/web/src/components/cad/**
* apps/web/src/state/**
* apps/web/src/services/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 1.3 — Layers / Camadas com arquitetura production-grade.

Contexto:
O editor CAD já possui ferramentas básicas, Snap, Undo/Redo, JSON/SVG, Spatial Index, Viewport Culling e diagnóstico de performance.
Agora precisamos implementar organização por camadas/layers, recurso essencial para CAD de engenharia.

Objetivo:
Implementar suporte a layers no documento CAD, ferramentas, renderer, import/export e interface web.

Implementar:

1. cad-core:

   * Criar interface CadLayer.
   * Adicionar layers ao CadDocument.
   * Adicionar activeLayerId ao CadDocument.
   * Garantir camada padrão “Layer 0”.
   * Garantir que toda entidade tenha layerId.
   * Criar comandos:

     * CreateLayerCommand;
     * RenameLayerCommand;
     * DeleteLayerCommand;
     * ToggleLayerVisibilityCommand;
     * ToggleLayerLockCommand;
     * SetActiveLayerCommand;
     * MoveEntitiesToLayerCommand, se viável nesta etapa.
   * Todos os comandos devem integrar com CommandHistory/Undo/Redo.

2. cad-tools:

   * LineTool, RectangleTool e CircleTool devem criar entidades na camada ativa.
   * SelectTool deve ignorar entidades em layers invisíveis.
   * SelectTool não deve permitir seleção de entidades em layers bloqueadas, salvo se já existir regra diferente no projeto.
   * MoveTool, RotateTool, ScaleTool e EraseTool não devem alterar entidades em layers bloqueadas.
   * SnapService deve ignorar entidades em layers invisíveis.
   * Manter comportamento existente para entidades sem layerId usando fallback para Layer 0.

3. cad-renderer:

   * Não renderizar entidades de layers invisíveis.
   * Aplicar cor da layer quando a entidade não tiver estilo próprio.
   * Aplicar opacidade da layer, se suportado sem quebrar performance.
   * Manter viewport culling funcionando.
   * Manter spatial index funcionando.
   * Evitar reconstruir índice espacial inteiro apenas por toggle de visibilidade, se possível.

4. cad-io:

   * Export JSON deve incluir layers e activeLayerId.
   * Import JSON deve restaurar layers e activeLayerId.
   * Import JSON antigo sem layers deve criar Layer 0 e atribuir entidades a ela.
   * Export SVG deve agrupar entidades por layer usando <g>.
   * Import SVG deve tentar criar layers a partir de grupos <g data-layer-name> ou <g id>.
   * SVG sem grupos deve importar tudo em Layer 0.

5. apps/web:

   * Criar CadLayerPanel.
   * Exibir lista de layers.
   * Permitir criar layer.
   * Permitir renomear layer.
   * Permitir alternar visibilidade.
   * Permitir alternar bloqueio.
   * Permitir definir layer ativa.
   * Permitir alterar cor básica da layer.
   * Exibir layer ativa na statusbar.
   * Não exibir painel de forma que atrapalhe o canvas.
   * Manter toolbar existente funcionando.

6. Performance:

   * O sistema deve continuar funcionando com muitos objetos.
   * Toggle de visibilidade deve ser leve.
   * Select, Snap e Render devem respeitar layers sem cair em algoritmo O(n²).
   * Não clonar documentos gigantes desnecessariamente.

Regras:

* Não implementar backend.
* Não implementar multiempresa.
* Não implementar branch/commit.
* Não implementar painel de propriedades completo ainda.
* Não quebrar ferramentas existentes.
* Não quebrar Snap.
* Não quebrar Undo/Redo.
* Não quebrar JSON/SVG.
* Não quebrar Spatial Index e Viewport Culling.
* Não quebrar Performance Lab.
* Não imprimir arquivos completos na resposta.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Documento novo nasce com Layer 0.
4. Entidades novas são criadas na layer ativa.
5. Usuário consegue criar nova layer.
6. Usuário consegue definir layer ativa.
7. Usuário consegue desenhar em layers diferentes.
8. Usuário consegue ocultar uma layer.
9. Entidades da layer oculta não aparecem.
10. Snap ignora layer oculta.
11. Select ignora layer oculta.
12. Usuário consegue bloquear uma layer.
13. Entidades de layer bloqueada não podem ser movidas, apagadas ou rotacionadas.
14. Undo/Redo funciona para criação, renomeação, bloqueio e visibilidade de layer.
15. Export JSON salva layers.
16. Import JSON restaura layers.
17. Export SVG agrupa por layer.
18. Import SVG mantém ou cria layers quando possível.
19. Performance Lab continua funcionando.
20. Spatial Index e viewport culling continuam funcionando.

Ao final, responda curto:

* arquivos criados;
* arquivos alterados;
* como layers foram modeladas;
* como renderer respeita visibilidade;
* como tools respeitam layer bloqueada;
* como JSON/SVG persistem layers;
* como testar manualmente;
* próximos passos recomendados.
