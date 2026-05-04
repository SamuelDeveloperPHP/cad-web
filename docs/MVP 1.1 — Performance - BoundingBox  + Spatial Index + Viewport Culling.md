Leia apenas:

* AGENTS.md da raiz
* packages/cad-geometry/AGENTS.md, se existir
* packages/cad-renderer/AGENTS.md, se existir
* packages/cad-tools/AGENTS.md, se existir
* packages/cad-core/AGENTS.md, se existir
* packages/cad-geometry/src/**
* packages/cad-renderer/src/**
* packages/cad-tools/src/**
* packages/cad-core/src/**
* apps/web/src/components/cad/**
* apps/web/src/state/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 1.1 — Performance para grandes desenhos.

Contexto:
O CAD-WEB precisa suportar progressivamente centenas de milhares até milhões de entidades.
Hoje já temos ferramentas básicas, snap, undo/redo, import/export JSON/SVG e editor web funcional.
Agora precisamos reduzir varreduras desnecessárias em renderização, snap e seleção.

Objetivo:
Implementar a primeira base de performance com BoundingBox padronizado, Spatial Index inicial e Viewport Culling.

Tarefa:

1. Criar ou consolidar cálculo de BoundingBox para entidades:

   * line
   * rectangle
   * circle
2. Criar uma estrutura inicial de índice espacial.
3. Usar grid espacial uniforme inicialmente.
4. Deixar arquitetura preparada para R-tree/BVH futuramente.
5. O índice deve permitir:

   * inserir entidade;
   * remover entidade;
   * atualizar entidade;
   * consultar entidades por bounding box;
   * consultar entidades próximas a um ponto.
6. Integrar o índice espacial ao estado/documento atual.
7. O renderer deve desenhar preferencialmente apenas entidades visíveis no viewport.
8. O SnapService deve consultar apenas entidades próximas ao cursor quando índice estiver disponível.
9. SelectTool deve consultar apenas entidades próximas ao clique ou janela de seleção quando índice estiver disponível.
10. Criar testes unitários para BoundingBox e índice espacial.
11. Criar benchmark simples/controlado para documentos com:

    * 10 mil entidades;
    * 100 mil entidades;
    * 500 mil entidades simuladas, se viável sem travar testes normais.

Regras:

* Não implementar backend.
* Não implementar Web Worker ainda.
* Não implementar WebGL/WebGPU ainda.
* Não trocar toda a arquitetura.
* Não quebrar ferramentas existentes.
* Não quebrar import/export JSON/SVG.
* Não quebrar Undo/Redo.
* Não quebrar Snap.
* Evitar algoritmo O(n²).
* Evitar clonar arrays gigantes.
* Não imprimir arquivos completos na resposta.

Critérios de aceite:

1. npm run test funciona.
2. npm run dev funciona.
3. Line, Rectangle, Circle, Move, Rotate, Scale, Erase continuam funcionando.
4. Clear, Undo e Redo continuam funcionando.
5. Snap continua funcionando.
6. Export/Import JSON e SVG continuam funcionando.
7. O renderer possui caminho para desenhar apenas entidades visíveis.
8. Snap não precisa percorrer todas as entidades quando houver índice disponível.
9. Select não precisa percorrer todas as entidades quando houver índice disponível.
10. Existe teste do índice espacial.
11. Existe benchmark ou teste de performance controlado.

Ao final, responda curto:

* arquivos criados;
* arquivos alterados;
* como o índice espacial funciona;
* onde ele foi integrado;
* como testar;
* próximos passos.
