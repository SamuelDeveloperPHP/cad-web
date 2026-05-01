Leia o C:\wamp64\www\CAD-WEB\docs\04 - Ferramentas CAD.md, se existir.

Estamos iniciando o MVP 0.5 — RotateTool com efeito ghost/fantasma.

Estado atual:

* apps/web possui editor CAD funcional com Canvas, grid, zoom, pan, toolbar, command line, export/import JSON e localStorage.
* Ferramentas disponíveis: Select, Line, Erase, Move e Pan.
* MoveTool já possui preview ghost.
* Command History / Undo / Redo já foi implementado.
* O objetivo agora é implementar e integrar a ferramenta Rotate.

Objetivo:
Implementar a ferramenta RotateTool no pacote packages/cad-tools e integrá-la no apps/web, com preview ghost/fantasma durante a rotação.

Fluxo esperado da ferramenta Rotate:

1. Usuário seleciona uma ou mais entidades.
2. Usuário ativa Rotate pela toolbar ou command line.
3. A ferramenta solicita o ponto base/pivô da rotação.
4. Usuário clica no ponto pivô.
5. A ferramenta solicita o ângulo de rotação.
6. Ao mover o mouse, as entidades selecionadas devem aparecer em preview ghost rotacionado em torno do pivô.
7. O ângulo deve ser calculado com base no vetor pivô → posição atual do mouse.
8. No segundo clique, a rotação é aplicada definitivamente.
9. A seleção deve permanecer nas entidades rotacionadas.
10. Esc cancela a operação sem alterar o desenho.
11. Ctrl+Z desfaz a rotação.
12. Ctrl+Y refaz a rotação.

Comandos:

* ro
* rotate

Implementar:

1. packages/cad-tools/src/modify/RotateTool.ts
2. Testes unitários para RotateTool
3. Registro do comando rotate no CommandRegistry/ToolRegistry
4. Integração do botão Rotate na toolbar do apps/web
5. Integração com command line usando `ro` e `rotate`
6. Preview ghost/fantasma durante a rotação
7. Aplicação definitiva da rotação no documento atual
8. Integração com CommandHistory/Undo/Redo
9. Manter export/import JSON funcionando com as novas coordenadas rotacionadas

Regras:

* Não implementar backend.
* Não implementar autenticação.
* Não implementar multiempresa.
* Não implementar Scale ainda.
* Não implementar Snap ainda, exceto se já houver infraestrutura pronta.
* Não colocar lógica pesada no React.
* O React deve apenas encaminhar eventos para a ferramenta ativa.
* A ferramenta Rotate deve usar cad-geometry para cálculo de ângulo e transformação, se disponível.
* A rotação deve ser em graus na command line/status, mas internamente pode usar radianos se o kernel estiver assim.
* Se ainda não houver RotateEntitiesCommand definitivo no cad-core, crie com arquitetura compatível ao CommandHistory.
* Não quebrar Select, Line, Erase, Move, Pan, Clear, Export, Import, Undo e Redo.

Detalhes geométricos:

* A rotação deve acontecer em torno de um ponto pivô `{ x, y }`.
* Para cada ponto da entidade, aplicar:

  * transladar ponto para a origem relativa ao pivô;
  * rotacionar pelo ângulo;
  * transladar de volta.
* Para linhas, rotacionar start e end.
* Para futuras entidades, deixar função preparada para rectangle, circle, arc e polyline.
* Círculos devem rotacionar o centro, mantendo raio.
* Entidades não suportadas devem ser ignoradas com TODO claro ou manter comportamento seguro.

Preview ghost:

* Durante o movimento do mouse após escolher o pivô, deve ser gerado preview das entidades selecionadas rotacionadas.
* O preview deve ser visualmente diferente da entidade original.
* O preview não deve alterar o documento real.
* O documento só deve ser alterado no clique de confirmação.
* O preview deve ser limpo ao finalizar ou cancelar.

Command line:

* Deve aceitar:

  * `ro`
  * `rotate`
* Se o usuário digitar um valor numérico durante o Rotate, interpretar como ângulo em graus, aplicar preview/confirmar conforme arquitetura atual permitir.
* Caso entrada numérica ainda não esteja pronta, deixar TODO e garantir rotação visual com mouse.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue desenhar uma linha.
4. Usuário consegue selecionar a linha.
5. Usuário consegue clicar em Rotate.
6. Usuário escolhe ponto pivô.
7. Ao mover o mouse, vê preview ghost da linha rotacionada.
8. Usuário clica para confirmar.
9. A linha muda de posição angular.
10. Ctrl+Z desfaz a rotação.
11. Ctrl+Y refaz a rotação.
12. Export JSON salva a geometria rotacionada.
13. Import JSON restaura a geometria rotacionada.
14. Command line aceita `ro` e `rotate`.
15. Esc cancela a operação sem alterar a entidade.
16. Testes unitários cobrem rotação básica, cancelamento e geração de comando.

Ao final, explique:

* arquivos criados;
* arquivos alterados;
* como RotateTool foi integrada;
* como o preview ghost foi implementado;
* como Undo/Redo se integra à rotação;
* quais partes ainda são adaptadores temporários;
* como testar manualmente;
* próximos passos recomendados.
