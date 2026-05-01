# cad-tools

Pacote de ferramentas interativas do CAD-WEB Engenharia SaaS.

## Objetivo

O `cad-tools` transforma eventos de ponteiro, teclado e linha de comando em previews temporarios e comandos controlados. Ele nao altera entidades diretamente, nao desenha Canvas e nao depende de React, DOM, Laravel ou banco de dados.

## Estrutura Inicial

```text
src/
  contracts/
    CadTool.ts
    ToolContext.ts
    ToolEvent.ts
    ToolResult.ts
  command-line/
    CommandAliases.ts
    CommandRegistry.ts
  registry/
    ToolRegistry.ts
  selection/
    SelectTool.ts
  draw/
    LineTool.ts
  modify/
    EraseTool.ts
  index.ts
tests/
  CommandRegistry.test.ts
  ToolRegistry.test.ts
  SelectTool.test.ts
  LineTool.test.ts
  EraseTool.test.ts
```

## Decisoes

- As ferramentas recebem `ToolContext` para acessar documento, selecao, snaps, preview e command bus.
- As ferramentas retornam `ToolResult` para padronizar preview, mensagem, cancelamento, conclusao e comando.
- `CommandRegistry` centraliza aliases de linha de comando.
- `ToolRegistry` centraliza registro e resolucao de ferramentas por id ou alias.
- `CadCommand` permanece como contrato local temporario ate o `cad-core` expor um comando oficial.

## Proxima Etapa

Integrar `SelectTool`, `EraseTool` e `LineTool` no `apps/web`, substituindo os adaptadores temporarios do MVP por ferramentas reais do pacote.
