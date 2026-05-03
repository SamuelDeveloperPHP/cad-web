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
O projeto CAD-WEB precisa evoluir para suportar centenas de milhares até milhões de entidades.
Hoje já existem ferramentas, renderer, snap, import/export JSON/SVG e editor web funcional.
Agora precisamos evitar operações O(n) desnecessárias em renderização, snap e seleção.

Objetivo:
Implementar a primeira base de performance com Spatial Index, viewport culling e consultas otimizadas.

Tarefa:

1. Criar uma estrutura inicial de índice espacial.
2. Pode ser grid espacial uniforme inicialmente, com arquitetura preparada para R-tree/BVH futuramente.
3. Cada entidade deve ter bounding box.
4. O índice deve permitir:

   * inserir entidade;
   * remover entidade;
   * atualizar entidade;
   * consultar entidades por bounding box;
   * consultar entidades próximas a um ponto.
5. Integrar o índice espacial ao documento/estado atual.
6. O renderer deve desenhar preferencialmente apenas entidades visíveis no viewport.
7. O SnapService deve consultar apenas entidades próximas ao cursor.
8. SelectTool deve consultar apenas entidades próximas ao clique ou janela de seleção.
9. Criar testes unitários para o índice espacial.
10. Criar benchmark simples para documentos com:

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
4. Snap continua funcionando.
5. Export/Import JSON e SVG continuam funcionando.
6. O renderer possui caminho para desenhar apenas entidades visíveis.
7. Snap não precisa percorrer todas as entidades quando houver índice disponível.
8. Select não precisa percorrer todas as entidades quando houver índice disponível.
9. Existe teste do índice espacial.
10. Existe benchmark ou teste de performance controlado.

Ao final, responda curto:

* arquivos criados;
* arquivos alterados;
* como o índice espacial funciona;
* onde ele foi integrado;
* como testar;
* próximos passos.
