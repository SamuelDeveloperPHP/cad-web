Leia apenas:

* AGENTS.md da raiz
* apps/web/AGENTS.md
* packages/cad-tools/AGENTS.md
* packages/cad-core/AGENTS.md, se existir
* apps/web/src/components/cad/**
* apps/web/src/state/**
* packages/cad-tools/src/**
* packages/cad-core/src/**

Não leia o repositório inteiro.

Tarefa:
Criar comando de linha para limpar o desenho/canvas pelo campo Command.

Objetivo:
Permitir que o usuário limpe todas as entidades do desenho digitando comandos como:

* clear
* cls
* limpar
* limpartela
* clearall

Comportamento esperado:

1. Usuário digita `clear` na command line.
2. O sistema limpa todas as entidades do desenho.
3. A ação deve entrar no CommandHistory.
4. Ctrl+Z deve restaurar todas as entidades apagadas.
5. Ctrl+Y deve limpar novamente.
6. O botão Clear deve continuar funcionando.
7. Export JSON após limpar deve exportar documento vazio.
8. Import JSON deve continuar funcionando.
9. Snap, Select, Line, Rectangle, Circle, Move, Rotate, Scale e Erase não devem quebrar.

Implementar:

1. Registrar aliases `clear`, `cls`, `limpar`, `limpartela`, `clearall` no CommandRegistry.
2. Garantir que a command line reconheça esses comandos.
3. Usar `ClearDocumentCommand` se já existir.
4. Se `ClearDocumentCommand` não existir ou estiver incompleto, implementar/ajustar no cad-core.
5. Garantir Undo/Redo para o comando Clear.
6. Garantir que a seleção seja limpa após limpar o desenho.
7. Garantir que previews e snap marker sejam limpos após limpar o desenho.
8. Adicionar testes unitários para o comando, se houver estrutura de testes.

Regras:

* Não implementar backend.
* Não alterar import/export JSON/SVG.
* Não refatorar ferramentas sem necessidade.
* Não apagar lógica existente do botão Clear.
* Não limpar o desenho diretamente no componente React sem passar pelo CommandHistory.
* Não imprimir arquivos completos na resposta final.

Critérios de aceite:

1. npm run dev funciona.
2. npm run test funciona.
3. Digitar `clear` limpa o desenho.
4. Digitar `cls` limpa o desenho.
5. Digitar `limpar` limpa o desenho.
6. Ctrl+Z restaura as entidades apagadas.
7. Ctrl+Y limpa novamente.
8. Botão Clear continua funcionando.
9. Command line exibe mensagem de sucesso, por exemplo: “Desenho limpo.”
10. Se o desenho já estiver vazio, exibir mensagem discreta: “Nenhuma entidade para limpar.”

Ao final, responda curto:

* arquivos alterados;
* comandos adicionados;
* como testar manualmente;
* próximos passos.
