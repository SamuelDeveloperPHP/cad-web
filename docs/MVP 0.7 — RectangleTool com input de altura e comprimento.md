
Leia o C:\wamp64\www\CAD-WEB\docs\04 - Ferramentas CAD.md, se existir.

Estamos iniciando o MVP 0.7 — RectangleTool com input de altura e comprimento.

Estado atual:

* apps/web possui editor CAD funcional com Canvas, grid, zoom, pan, toolbar, command line, export/import JSON e localStorage.
* Ferramentas já disponíveis: Select, Line, Erase, Move, Rotate, Scale e Pan.
* Command History / Undo / Redo já existe.
* O objetivo agora é implementar RectangleTool com criação visual e entrada precisa de medidas.

Objetivo:
Implementar a ferramenta RectangleTool no pacote packages/cad-tools e integrá-la no apps/web.

A ferramenta deve permitir criar retângulos por:

1. dois pontos no canvas;
2. ponto inicial + comprimento + altura por input preciso.

Comandos:

* rec
* rect
* rectangle

Fluxo visual esperado:

1. Usuário ativa Rectangle pela toolbar ou command line.
2. A ferramenta solicita o primeiro canto do retângulo.
3. Usuário clica no canvas.
4. Ao mover o mouse, aparece preview ghost/fantasma do retângulo.
5. Usuário clica no canto oposto.
6. O retângulo é criado definitivamente.
7. A criação deve entrar no CommandHistory.
8. Ctrl+Z desfaz a criação.
9. Ctrl+Y refaz a criação.

Fluxo com input preciso:

1. Usuário ativa Rectangle.
2. Usuário clica no primeiro canto do retângulo.
3. Usuário pode pressionar Enter ou digitar na command line uma medida no formato:

   * `100,50`
   * `100x50`
   * `w=100 h=50`
   * `width=100 height=50`
   * `comprimento=100 altura=50`
4. O sistema interpreta:

   * comprimento/largura no eixo X;
   * altura no eixo Y.
5. O retângulo é criado a partir do ponto inicial com as medidas informadas.
6. O preview deve ser atualizado antes da confirmação se a arquitetura permitir.
7. Caso a entrada seja inválida, exibir mensagem de erro sem criar entidade.

Implementar:

1. packages/cad-tools/src/draw/RectangleTool.ts
2. Testes unitários para RectangleTool.
3. Registro do comando rectangle no CommandRegistry/ToolRegistry.
4. Integração do botão Rectangle na toolbar do apps/web.
5. Integração com command line usando `rec`, `rect` e `rectangle`.
6. Preview ghost durante a criação visual.
7. Suporte a input preciso de comprimento e altura.
8. Criação definitiva da entidade retângulo.
9. Integração com CommandHistory/Undo/Redo.
10. Export JSON deve salvar retângulos.
11. Import JSON deve restaurar retângulos.
12. Renderer deve desenhar retângulos.
13. Select deve conseguir selecionar retângulos.
14. Erase deve conseguir apagar retângulos.
15. Move deve conseguir mover retângulos.
16. Rotate e Scale devem ser preparados para retângulo, se já houver suporte arquitetural.

Representação da entidade:
Preferencialmente criar uma entidade `rectangle` com:

```ts
{
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}
```

Caso o modelo atual ainda não suporte entidade `rectangle`, criar o retângulo como polyline fechada ou quatro linhas, deixando TODO claro para normalização futura.

Regras geométricas:

* O primeiro ponto é o canto inicial.
* O segundo ponto define o canto oposto.
* Width pode ser positivo ou negativo conforme direção do mouse, mas a entidade deve ser normalizada se o padrão do projeto exigir.
* Height pode ser positivo ou negativo conforme direção do mouse, mas a entidade deve ser normalizada se o padrão do projeto exigir.
* O preview deve acompanhar o mouse em tempo real.
* Esc cancela sem criar entidade.
* Enter deve acionar entrada precisa quando aplicável.
* Entrada `100,50` deve criar retângulo com comprimento 100 e altura 50 na unidade atual do desenho.

Regras:

* Não implementar backend.
* Não implementar autenticação.
* Não implementar multiempresa.
* Não implementar Circle ainda.
* Não implementar Snap nesta etapa, exceto se já existir infraestrutura pronta.
* Não colocar lógica pesada no React.
* O React deve apenas encaminhar eventos para a ferramenta ativa.
* A ferramenta Rectangle deve usar cad-geometry para criação, normalização e bounding box, se disponível.
* Se ainda não houver CreateEntityCommand definitivo no cad-core, usar o comando existente compatível com CommandHistory.
* Não quebrar Select, Line, Erase, Move, Rotate, Scale, Pan, Clear, Export, Import, Undo e Redo.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Rectangle pela toolbar.
4. Usuário consegue ativar Rectangle por `rec`, `rect` e `rectangle`.
5. Usuário consegue criar retângulo por dois cliques.
6. Durante o mouse move, aparece preview ghost/fantasma.
7. Usuário consegue criar retângulo com input `100,50`.
8. Usuário consegue criar retângulo com input `100x50`.
9. Entrada inválida não cria entidade e mostra erro.
10. Ctrl+Z desfaz a criação do retângulo.
11. Ctrl+Y refaz a criação.
12. Select seleciona o retângulo.
13. Delete/Erase apaga o retângulo.
14. Move desloca o retângulo.
15. Export JSON salva o retângulo.
16. Import JSON restaura o retângulo.
17. Esc cancela a operação sem alterar o desenho.
18. Testes unitários cobrem criação visual, criação por input, cancelamento e entrada inválida.

Ao final, explique:

* arquivos criados;
* arquivos alterados;
* como RectangleTool foi integrada;
* como o input de comprimento e altura foi interpretado;
* como o preview ghost foi implementado;
* como Undo/Redo se integra à criação do retângulo;
* quais partes ainda são adaptadores temporários;
* como testar manualmente;
* próximos passos recomendados.
