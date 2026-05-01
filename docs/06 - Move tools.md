Estamos iniciando o MVP 0.3 — MoveTool real.

Estado atual:

apps/web possui Canvas, grid, zoom, pan, toolbar, command line, export/import JSON e localStorage.
apps/web já integra ferramentas reais do pacote cad-tools.
SelectTool, LineTool e EraseTool já estão disponíveis.
O objetivo agora é implementar e integrar a ferramenta Move.

Tarefa:
Implementar a ferramenta MoveTool no pacote packages/cad-tools e integrá-la no apps/web.

Fluxo esperado da ferramenta Move:

Usuário seleciona uma ou mais entidades.
Usuário ativa Move pela toolbar ou command line.
A ferramenta solicita um ponto base.
O usuário clica no ponto base.
A ferramenta solicita o ponto de destino.
Durante o movimento do mouse, deve aparecer preview ghost da entidade deslocada.
No segundo clique, a entidade é movida definitivamente.
A seleção deve permanecer na entidade movida.
Esc cancela a operação sem alterar o desenho.

Comandos:

m
move

Implementar:

packages/cad-tools/src/modify/MoveTool.ts
Testes unitários para MoveTool
Registro do comando move no CommandRegistry/ToolRegistry
Integração do botão Move na toolbar do apps/web
Integração com command line usando m e move
Preview ghost durante o deslocamento
Aplicação definitiva do deslocamento no documento atual
Manter export/import JSON funcionando com a nova posição da entidade

Regras:

Não implementar backend.
Não implementar autenticação.
Não implementar multiempresa.
Não implementar Rotate ou Scale ainda.
Não colocar lógica pesada no React.
O React deve apenas encaminhar eventos para a ferramenta ativa.
A ferramenta Move deve usar cad-geometry para cálculo de vetor/deslocamento, se disponível.
Se ainda não houver CadCommand definitivo no cad-core, usar adaptador temporário com TODO claro.
Não quebrar Select, Line, Erase, Pan, Clear, Export e Import.

Critérios de aceite:

npm run dev funciona.
npm run test funciona.
Usuário consegue desenhar uma linha.
Usuário consegue selecionar a linha.
Usuário consegue clicar em Move.
Usuário escolhe ponto base.
Usuário move o mouse e vê preview ghost.
Usuário clica no destino e a linha muda de posição.
Export JSON salva a nova posição.
Import JSON restaura a nova posição.
Command line aceita m e move.
Esc cancela o Move sem alterar a entidade.

Ao final, explique:

arquivos criados;
arquivos alterados;
como a ferramenta Move foi integrada;
quais partes ainda são adaptadores temporários;
como testar manualmente;
próximos passos recomendados.