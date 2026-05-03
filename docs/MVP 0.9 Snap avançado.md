Leia o C:\wamp64\www\CAD-WEB\docs\04 - Ferramentas CAD.md, se existir.

Estamos iniciando o MVP 0.9 — Snap avançado e completo.

Estado atual:

* apps/web possui editor CAD funcional com Canvas, grid, zoom, pan, toolbar, command line, export/import JSON e localStorage.
* Ferramentas disponíveis: Select, Line, Rectangle, Circle, Erase, Move, Rotate, Scale e Pan.
* Command History / Undo / Redo já existe.
* RectangleTool e CircleTool já foram implementados.
* Agora precisamos implementar sistema de snap para precisão CAD.

Objetivo:
Implementar um sistema de Object Snap semelhante ao AutoCAD, com suporte inicial a:

1. Endpoint
2. Midpoint
3. Center
4. Nearest

Também deve existir na interface um dropdown/select para ativar e desativar cada tipo de snap individualmente.

Comportamento esperado:

* Quando o usuário move o mouse próximo a um ponto de snap, o cursor deve “grudar” no ponto calculado.
* O renderer deve mostrar um marcador visual indicando o tipo de snap encontrado.
* As ferramentas Line, Rectangle, Circle, Move, Rotate e Scale devem usar o ponto ajustado pelo snap.
* O snap deve ser configurável pelo usuário.
* O usuário deve conseguir ativar/desativar Endpoint, Midpoint, Center e Nearest pela interface.
* As configurações de snap devem persistir em localStorage.

Implementar arquitetura:

1. Em packages/cad-geometry:

   * Criar tipos relacionados a snap:

     * SnapType
     * SnapCandidate
     * SnapResult
     * SnapSettings
   * Criar funções para localizar candidatos de snap em entidades:

     * getEndpointSnapCandidates
     * getMidpointSnapCandidates
     * getCenterSnapCandidates
     * getNearestSnapCandidate
     * findBestSnap
   * Criar cálculo de distância entre mouse e candidato.
   * Usar tolerância em pixels convertida para tolerância de mundo via viewport.
   * Suportar entidades atuais:

     * line
     * rectangle
     * circle

2. Em packages/cad-tools:

   * Criar ou ajustar SnapService.
   * Integrar SnapService ao ToolContext.
   * Fazer ferramentas usarem ponto com snap, não ponto bruto do mouse.
   * Integrar snap em:

     * LineTool
     * RectangleTool
     * CircleTool
     * MoveTool
     * RotateTool
     * ScaleTool
   * Garantir que Esc, Enter e comandos existentes continuem funcionando.

3. Em packages/cad-renderer:

   * Criar estrutura de preview para snap marker, se ainda não existir.
   * Desenhar marcador visual conforme tipo:

     * Endpoint: quadrado
     * Midpoint: triângulo
     * Center: círculo
     * Nearest: pequeno X ou losango
   * Exibir o nome do snap próximo ao cursor, se a arquitetura atual permitir.
   * O marcador não deve ser entidade real do desenho.

4. Em apps/web:

   * Criar dropdown/select de Object Snap na toolbar ou statusbar.
   * O dropdown deve permitir ativar/desativar individualmente:

     * Endpoint
     * Midpoint
     * Center
     * Nearest
   * Pode ser implementado como:

     * botão “Snap”
     * dropdown com checkboxes
     * ou select/multiselect simples, conforme estrutura atual do projeto.
   * Mostrar estado geral:

     * Snap ON
     * Snap OFF
   * Persistir configurações em localStorage.
   * Permitir ligar/desligar snap geral.
   * Integrar configurações ao ToolContext/SnapService.
   * Exibir no statusbar os snaps ativos.

Tipos esperados:

```ts
export type SnapType = "endpoint" | "midpoint" | "center" | "nearest";

export interface SnapSettings {
  enabled: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  nearest: boolean;
  tolerancePx: number;
}

export interface SnapCandidate {
  type: SnapType;
  point: Point2D;
  entityId: string;
  distancePx: number;
  priority: number;
}

export interface SnapResult {
  snapped: boolean;
  point: Point2D;
  rawPoint: Point2D;
  candidate?: SnapCandidate;
}
```

Regras de prioridade:

1. Endpoint tem prioridade maior.
2. Midpoint vem depois.
3. Center vem depois.
4. Nearest deve ser a menor prioridade, porque pode capturar muitos pontos.
5. Mesmo com prioridade, o candidato precisa estar dentro da tolerância configurada.
6. Se houver empate, escolher o candidato mais próximo em pixels.

Suporte por entidade:

Line:

* Endpoint:

  * start
  * end
* Midpoint:

  * ponto médio entre start e end
* Center:

  * aplicável
* Nearest:

  * ponto mais próximo projetado sobre o segmento

Rectangle:

* Endpoint:

  * quatro cantos
* Midpoint:

  * meio de cada lado
* Center:

  * centro geométrico do retângulo
* Nearest:

  * ponto mais próximo nas arestas

Circle:

* Endpoint:

  * não aplicável nesta fase
* Midpoint:

  * não aplicável nesta fase
* Center:

  * centro do círculo
* Nearest:

  * ponto mais próximo na circunferência

Regras geométricas:

* O snap deve trabalhar em coordenadas de mundo.
* A tolerância visual deve ser definida em pixels, por exemplo 10px ou 12px.
* Para comparar distância, converter candidato world → screen e comparar com posição screen do mouse.
* O ponto retornado para a ferramenta deve ser em coordenada de mundo.
* O snap não deve alterar o documento.
* O snap apenas altera o ponto de entrada usado pela ferramenta ativa.

Regras de interface:

* Adicionar um controle visual chamado “Snap”.
* O usuário deve conseguir:

  * ativar/desativar Snap geral;
  * ativar/desativar Endpoint;
  * ativar/desativar Midpoint;
  * ativar/desativar Center;
  * ativar/desativar Nearest.
* Exibir algo como:

  * Snap: ON
  * Endpoint, Midpoint, Center, Nearest
* Salvar configurações no localStorage.
* Restaurar configurações ao abrir a aplicação.

Regras:

* Não implementar backend.
* Não implementar autenticação.
* Não implementar multiempresa.
* Não implementar branches/commits nesta etapa.
* Não implementar DXF/DWG.
* Não implementar Offset, Trim ou Fillet ainda.
* Não colocar cálculo geométrico pesado em componente React.
* Não deixar o React calcular snap diretamente.
* O React apenas controla estado da UI e envia SnapSettings para ToolContext/SnapService.
* O cálculo do snap deve ficar em cad-geometry/cad-tools.
* O renderer apenas desenha o marcador de snap.
* Não quebrar Select, Line, Rectangle, Circle, Erase, Move, Rotate, Scale, Pan, Clear, Export, Import, Undo e Redo.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar/desativar Snap geral.
4. Usuário consegue ativar/desativar Endpoint individualmente.
5. Usuário consegue ativar/desativar Midpoint individualmente.
6. Usuário consegue ativar/desativar Center individualmente.
7. Usuário consegue ativar/desativar Nearest individualmente.
8. Configurações de snap persistem em localStorage.
9. LineTool usa Endpoint ao clicar próximo ao início/fim de uma linha.
10. LineTool usa Midpoint ao clicar próximo ao meio de uma linha.
11. CircleTool usa Center ao clicar próximo ao centro de um círculo.
12. LineTool usa Nearest ao clicar próximo ao corpo de uma linha ou circunferência.
13. RectangleTool usa cantos, meios dos lados e centro conforme snaps ativos.
14. MoveTool usa snap para ponto base e ponto destino.
15. RotateTool usa snap para ponto pivô.
16. ScaleTool usa snap para ponto base.
17. O marcador visual do snap aparece próximo ao cursor.
18. Quando um snap está desativado, ele não deve ser usado.
19. Quando Snap geral está OFF, nenhum snap deve ser aplicado.
20. Export/Import JSON continua funcionando.
21. Undo/Redo continua funcionando.
22. Testes unitários cobrem:

    * endpoint em linha;
    * midpoint em linha;
    * center em círculo;
    * center em retângulo;
    * nearest em linha;
    * priorização de candidatos;
    * snap desativado;
    * persistência/configuração se houver teste de app.

Ao final, explique:

* arquivos criados;
* arquivos alterados;
* como o SnapService foi implementado;
* como os snaps foram integrados às ferramentas;
* como o dropdown/select de snap foi implementado;
* como o marcador visual é desenhado;
* como testar manualmente;
* quais partes ainda são temporárias;
* próximos passos recomendados.
