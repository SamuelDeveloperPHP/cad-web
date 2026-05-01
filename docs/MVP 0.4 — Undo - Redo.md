

Estamos iniciando o MVP 0.4 — Command History / Undo / Redo.

Estado atual:

* apps/web possui editor CAD funcional com Canvas, grid, zoom, pan, toolbar, command line, export/import JSON e localStorage.
* Ferramentas disponíveis: Select, Line, Erase, Move e Pan.
* O MoveTool já foi implementado e integrado.
* O projeto ainda não possui histórico robusto de comandos.

Objetivo:
Implementar uma camada inicial de histórico de comandos para permitir Undo e Redo das operações principais do CAD.

Tarefa:
Criar ou ajustar o pacote packages/cad-core para conter o modelo inicial de comandos e histórico.

Implementar:

1. Interface base CadCommand.
2. CommandHistory.
3. Método execute.
4. Método undo.
5. Método redo.
6. Pilha de comandos executados.
7. Pilha de comandos desfeitos.
8. Comando CreateEntityCommand.
9. Comando DeleteEntitiesCommand.
10. Comando MoveEntitiesCommand.
11. Comando ClearDocumentCommand.
12. Integração com apps/web.
13. Atalhos:

    * Ctrl+Z para Undo;
    * Ctrl+Y para Redo.
14. Command line:

    * u;
    * undo;
    * redo.
15. Botões opcionais na toolbar ou topbar:

    * Undo;
    * Redo.

Regras:

* Não implementar backend.
* Não implementar autenticação.
* Não implementar multiempresa.
* Não implementar branches/commits ainda.
* Não implementar Rotate ou Scale nesta etapa.
* Não colocar lógica de histórico diretamente em componente React.
* O React deve apenas chamar o serviço/controlador de comandos.
* O histórico deve ficar em cad-core ou em adaptador temporário claramente marcado com TODO se cad-core ainda não estiver pronto.
* Não quebrar Line, Select, Erase, Move, Pan, Clear, Export JSON e Import JSON.
* Manter localStorage funcionando.
* Manter testes existentes passando.

Comportamento esperado:

1. Ao desenhar uma linha, deve ser possível desfazer com Ctrl+Z.
2. Ao desfazer, a linha desaparece.
3. Ao refazer com Ctrl+Y, a linha volta.
4. Ao mover uma linha, Ctrl+Z deve retornar a linha para a posição anterior.
5. Ctrl+Y deve reaplicar o movimento.
6. Ao apagar uma linha, Ctrl+Z deve restaurar a linha.
7. Ao usar Clear, Ctrl+Z deve restaurar o desenho anterior.
8. Export JSON deve exportar o estado atual do documento.
9. Import JSON deve continuar funcionando.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Usuário consegue desenhar uma linha.
4. Usuário consegue usar Ctrl+Z para desfazer a criação.
5. Usuário consegue usar Ctrl+Y para refazer a criação.
6. Usuário consegue mover uma linha e desfazer o movimento.
7. Usuário consegue apagar uma linha e desfazer a exclusão.
8. Command line aceita `u`, `undo` e `redo`.
9. O histórico não registra movimentos intermediários do mouse, apenas comandos confirmados.
10. A arquitetura fica preparada para versionamento futuro por commits.

Ao final, explique:

* arquivos criados;
* arquivos alterados;
* como o CommandHistory foi implementado;
* quais comandos foram criados;
* como apps/web passou a executar comandos;
* como testar manualmente;
* quais pontos ainda são temporários;
* próximos passos recomendados.
