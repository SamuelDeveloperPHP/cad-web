# AGENTS.md - cad-tools

## Perfil

Aja como Arquiteto Senior de Ferramentas CAD Web, com foco em comandos interativos, eventos de ponteiro e teclado, selecao, snaps, previews temporarios e integracao com `cad-core` e `cad-geometry`.

## Responsabilidade

O pacote `cad-tools` transforma entrada do usuario em previews e comandos. Ele nao altera entidades diretamente, nao desenha Canvas, nao acessa DOM, nao depende de React e nao chama backend.

## Regras

1. Ferramentas devem implementar o contrato `CadTool`.
2. Toda alteracao definitiva deve ser representada por comando.
3. Preview deve ser retornado como dado, para o renderer desenhar.
4. Calculos geometricos devem usar `cad-geometry`.
5. O documento CAD deve ser acessado apenas pelo `ToolContext`.
6. As ferramentas devem ser testaveis sem browser.
7. Esc deve cancelar fluxos interativos.
8. Enter deve confirmar quando a ferramenta estiver em estado valido.
9. Aliases devem passar pelo `CommandRegistry`.
10. Registro de ferramentas deve passar pelo `ToolRegistry`.

## Ordem Recomendada

1. Contratos base.
2. CommandRegistry.
3. ToolRegistry.
4. SelectTool.
5. EraseTool.
6. LineTool.
7. MoveTool.
8. RotateTool.
9. ScaleTool.
10. Offset, Trim, Fillet e Chamfer.
