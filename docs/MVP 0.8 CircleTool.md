
Leia o C:\wamp64\www\CAD-WEB\docs\04 - Ferramentas CAD.md, se existir.

Estamos iniciando o MVP 0.8 — CircleTool com input de raio e diâmetro.

Estado atual:

* apps/web possui editor CAD funcional com Canvas, grid, zoom, pan, toolbar, command line, export/import JSON e localStorage.
* Ferramentas já disponíveis: Select, Line, Rectangle, Erase, Move, Rotate, Scale e Pan.
* Command History / Undo / Redo já existe.
* O objetivo agora é implementar CircleTool com criação visual e entrada precisa de raio ou diâmetro.

Objetivo:
Implementar a ferramenta CircleTool no pacote packages/cad-tools e integrá-la no apps/web.

A ferramenta deve permitir criar círculos por:

1. ponto central + ponto de raio no canvas;
2. ponto central + input preciso de raio;
3. ponto central + input preciso de diâmetro.

Comandos:

* c
* circle

Fluxo visual esperado:

1. Usuário ativa Circle pela toolbar ou command line.
2. A ferramenta solicita o centro do círculo.
3. Usuário clica no canvas para definir o centro.
4. Ao mover o mouse, aparece preview ghost/fantasma do círculo.
5. O raio visual é calculado pela distância entre centro e posição atual do mouse.
6. Usuário clica no segundo ponto para confirmar o raio.
7. O círculo é criado definitivamente.
8. A criação deve entrar no CommandHistory.
9. Ctrl+Z desfaz a criação.
10. Ctrl+Y refaz a criação.

Fluxo com input preciso:

1. Usuário ativa Circle.
2. Usuário clica no ponto central.
3. Usuário pode digitar na command line:

   * `r=50`
   * `raio=50`
   * `radius=50`
   * `d=100`
   * `diametro=100`
   * `diameter=100`
   * `50`
4. Quando o usuário digitar apenas `50`, interpretar como raio.
5. Quando informar diâmetro, o sistema deve dividir por 2 para obter o raio.
6. Caso a entrada seja inválida, exibir mensagem de erro sem criar entidade.

Implementar:

1. packages/cad-tools/src/draw/CircleTool.ts
2. Testes unitários para CircleTool.
3. Registro do comando circle no CommandRegistry/ToolRegistry.
4. Integração do botão Circle na toolbar do apps/web.
5. Integração com command line usando `c` e `circle`.
6. Preview ghost durante a criação visual.
7. Suporte a input preciso de raio e diâmetro.
8. Criação definitiva da entidade circle.
9. Integração com CommandHistory/Undo/Redo.
10. Export JSON deve salvar círculos.
11. Import JSON deve restaurar círculos.
12. Renderer deve desenhar círculos.
13. Select deve conseguir selecionar círculos.
14. Erase deve conseguir apagar círculos.
15. Move deve conseguir mover círculos.
16. Rotate deve manter círculo visualmente igual, mas rotacionar seu centro caso a rotação seja em torno de outro pivô.
17. Scale deve alterar o raio proporcionalmente, se já houver suporte arquitetural.

Representação da entidade:
Preferencialmente criar uma entidade `circle` com:

```ts
{
  id: string;
  type: "circle";
  center: {
    x: number;
    y: number;
  };
  radius: number;
}
```

Caso o modelo atual ainda não suporte entidade `circle`, criar suporte mínimo com TODO claro para normalização futura.

Regras geométricas:

* O centro é definido pelo primeiro clique.
* O raio visual é a distância entre o centro e o mouse.
* O raio deve ser sempre maior que zero.
* Entradas iguais a zero ou negativas devem ser rejeitadas.
* Diâmetro deve ser convertido para raio.
* O preview deve acompanhar o mouse em tempo real.
* Esc cancela sem criar entidade.
* Enter pode acionar entrada precisa quando aplicável.
* Entrada `50` deve criar círculo com raio 50 na unidade atual do desenho.
* Entrada `d=100` deve criar círculo com raio 50.

Regras:

* Não implementar backend.
* Não implementar autenticação.
* Não implementar multiempresa.
* Não implementar Arc ainda.
* Não implementar Snap nesta etapa, exceto se já existir infraestrutura pronta.
* Não colocar lógica pesada no React.
* O React deve apenas encaminhar eventos para a ferramenta ativa.
* A ferramenta Circle deve usar cad-geometry para cálculo de distância, normalização e bounding box, se disponível.
* Se ainda não houver CreateEntityCommand definitivo no cad-core, usar o comando existente compatível com CommandHistory.
* Não quebrar Select, Line, Rectangle, Erase, Move, Rotate, Scale, Pan, Clear, Export, Import, Undo e Redo.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue ativar Circle pela toolbar.
4. Usuário consegue ativar Circle por `c` e `circle`.
5. Usuário consegue criar círculo por dois cliques.
6. Durante mouse move, aparece preview ghost/fantasma.
7. Usuário consegue criar círculo com input `50`.
8. Usuário consegue criar círculo com input `r=50`.
9. Usuário consegue criar círculo com input `d=100`.
10. Entrada inválida não cria entidade e mostra erro.
11. Ctrl+Z desfaz a criação do círculo.
12. Ctrl+Y refaz a criação.
13. Select seleciona o círculo.
14. Delete/Erase apaga o círculo.
15. Move desloca o círculo.
16. Export JSON salva o círculo.
17. Import JSON restaura o círculo.
18. Esc cancela a operação sem alterar o desenho.
19. Testes unitários cobrem criação visual, criação por raio, criação por diâmetro, cancelamento e entrada inválida.

Ao final, explique:

* arquivos criados;
* arquivos alterados;
* como CircleTool foi integrada;
* como o input de raio e diâmetro foi interpretado;
* como o preview ghost foi implementado;
* como Undo/Redo se integra à criação do círculo;
* quais partes ainda são adaptadores temporários;
* como testar manualmente;
* próximos passos recomendados.
