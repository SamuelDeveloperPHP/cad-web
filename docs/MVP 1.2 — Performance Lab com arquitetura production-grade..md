Leia apenas:

* AGENTS.md da raiz
* apps/web/AGENTS.md
* packages/cad-core/AGENTS.md, se existir
* packages/cad-geometry/AGENTS.md, se existir
* packages/cad-renderer/AGENTS.md, se existir
* apps/web/src/components/cad/**
* apps/web/src/state/**
* packages/cad-core/src/**
* packages/cad-geometry/src/**
* packages/cad-renderer/src/**

Não leia o repositório inteiro.

Estamos iniciando o MVP 1.2 — Performance Lab com arquitetura production-grade.

Importante:
Esta etapa não será publicada para clientes agora, mas deve ser implementada com padrão de performance de produção, evitando retrabalho arquitetural futuro.

Contexto:
O MVP 1.1 — BoundingBox + Spatial Index + Viewport Culling já foi concluído.
Agora precisamos criar ferramentas internas de diagnóstico e stress test para validar o CAD com 1.000, 10.000, 50.000 e 100.000 entidades, com arquitetura preparada para centenas de milhares e futuramente milhões de entidades.

Objetivo:
Criar uma infraestrutura interna de diagnóstico de performance, com baixo overhead, isolada do código final de produto e preparada para evolução futura com Web Worker/OffscreenCanvas.

Implementar:

1. AddMultipleEntitiesCommand no cad-core:

   * Deve adicionar milhares de entidades em um único comando.
   * Não deve criar um comando por entidade.
   * Deve permitir undo removendo entidades pelos IDs.
   * Deve permitir redo adicionando novamente.
   * Deve evitar clonar o documento inteiro desnecessariamente.
   * Deve atualizar o spatial index de forma eficiente, se a arquitetura atual permitir.

2. Gerador de entidades:

   * Criar gerador isolado em pasta diagnostics/dev/internal.
   * Gerar linhas, retângulos e círculos.
   * Suportar distribuição em grid.
   * Suportar distribuição aleatória controlada.
   * Suportar geração de:

     * 1.000 entidades;
     * 10.000 entidades;
     * 50.000 entidades;
     * 100.000 entidades.
   * Preparar API para geração em lotes/chunks, mesmo que a primeira versão execute de forma simples.

3. Serviço de diagnóstico:

   * Criar CadDiagnosticsService ou equivalente.
   * Coletar métricas com baixo overhead.
   * Não depender de React state por frame.
   * Não usar window global como dependência principal.
   * Opcionalmente expor window.__CAD_DIAGNOSTICS apenas em modo dev/debug, tipado em TypeScript.

4. Métricas:

   * total de entidades;
   * entidades visíveis no viewport;
   * porcentagem visível;
   * tempo da última renderização;
   * tempo de consulta do spatial index;
   * tempo aproximado de snap, se disponível;
   * FPS aproximado;
   * zoom atual;
   * contagem de entidades renderizadas.

5. Renderer:

   * renderDocument2D deve retornar ou registrar métricas de renderização.
   * Deve contabilizar visibleEntities.
   * Deve usar viewport culling existente.
   * Não deve percorrer mais entidades do que o necessário quando o spatial index estiver disponível.

6. Apps/web:

   * Criar CadDiagnosticPanel.
   * O painel deve ser ativado somente por:

     * import.meta.env.DEV
     * ou VITE_ENABLE_CAD_DIAGNOSTICS=true
   * Não exibir painel em produção por padrão.
   * O painel deve atualizar métricas com throttle ou intervalo controlado, por exemplo 250ms ou 500ms.
   * Não usar setState a cada frame.
   * Adicionar botões:

     * Gerar 1k;
     * Gerar 10k;
     * Gerar 50k;
     * Gerar 100k;
     * Limpar teste.
   * Geração de 50k e 100k deve pedir confirmação.
   * O painel deve ser visualmente marcado como INTERNAL / DIAGNOSTICS.

7. Export JSON:

   * Se entidades > 50.000, exibir confirmação antes de exportar.
   * Não quebrar Export/Import JSON/SVG existentes.
   * Não alterar cad-io sem necessidade.

Regras de arquitetura:

* Performance de produção desde já.
* Diagnóstico isolado do produto final.
* Não colocar lógica experimental espalhada em componentes React.
* Não usar setState por frame.
* Não depender de window.__CAD_DIAGNOSTICS para lógica principal.
* Não implementar backend.
* Não implementar Web Worker ainda, mas preparar contratos para evolução futura.
* Não implementar WebGL/WebGPU ainda.
* Não quebrar ferramentas existentes.
* Não quebrar Snap.
* Não quebrar Undo/Redo.
* Não quebrar JSON/SVG.
* Evitar algoritmo O(n²).
* Evitar clones gigantes.
* Evitar re-renderizações desnecessárias do React.
* Não imprimir arquivos completos na resposta.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Ferramentas existentes continuam funcionando.
4. Snap continua funcionando.
5. Undo/Redo continua funcionando.
6. JSON/SVG continuam funcionando.
7. Painel de diagnóstico aparece somente em ambiente dev ou com flag.
8. Painel mostra total de entidades.
9. Painel mostra entidades visíveis.
10. Painel mostra FPS aproximado.
11. Painel mostra tempo de render.
12. Gerar 1k entidades funciona.
13. Gerar 10k entidades funciona.
14. Gerar 50k entidades pede confirmação.
15. Gerar 100k entidades pede confirmação.
16. Pan/Zoom continuam usáveis após geração.
17. Renderer usa viewport culling.
18. Spatial index continua funcional após geração em massa.
19. Export JSON grande exibe confirmação.
20. Código fica preparado para futura migração parcial para Web Worker/OffscreenCanvas.

Ao final, responda curto:

* arquivos criados;
* arquivos alterados;
* como o diagnóstico foi isolado;
* como as métricas são coletadas sem travar React;
* como gerar entidades de teste;
* como testar manualmente;
* próximos passos recomendados.
