Leia apenas:

* AGENTS.md da raiz
* packages/cad-io/AGENTS.md
* packages/cad-io/src/**
* apps/web/src/services/**
* apps/web/src/components/cad/**
* apps/web/src/state/**
* package.json da raiz

Não leia o repositório inteiro.

Estamos fazendo a auditoria do MVP 1.0 — cad-io JSON/SVG.

Objetivo:
Verificar se Export JSON, Import JSON, Export SVG e Import SVG foram corretamente implementados usando o pacote packages/cad-io e se estão preparados para evoluir para arquivos grandes.

Verifique:

1. Se apps/web usa exportCadJson/importCadJson do cad-io.
2. Se apps/web usa exportCadSvg/importCadSvg do cad-io.
3. Se não existe lógica duplicada de import/export JSON espalhada em React.
4. Se SVG importado passa por sanitização.
5. Se scripts, eventos inline e elementos perigosos são ignorados.
6. Se line, rectangle e circle exportam corretamente para SVG.
7. Se line, rect e circle importam corretamente de SVG.
8. Se JSON mantém schemaVersion.
9. Se import JSON valida entidades inválidas.
10. Se Export/Import preserva entidades existentes.
11. Se Undo/Redo continua funcionando após importar.
12. Se Snap continua funcionando depois de importar.
13. Se há testes cobrindo JSON e SVG.
14. Se há algum algoritmo O(n²) evidente para export/import.
15. Se existem pontos onde documentos grandes podem travar a UI.

Regras:

* Não implemente novas funcionalidades nesta tarefa.
* Não refatore tudo.
* Faça apenas correções pequenas se encontrar bug claro.
* Não imprimir arquivos completos na resposta.
* Responder de forma curta e objetiva.

Ao final, entregue:

1. Status: aprovado, aprovado com ressalvas ou reprovado.
2. Lista curta do que está OK.
3. Lista curta do que precisa corrigir.
4. Correções pequenas realizadas, se houver.
5. Próximo passo recomendado.
