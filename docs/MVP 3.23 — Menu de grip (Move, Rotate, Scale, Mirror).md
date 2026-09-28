# MVP 3.23 — Menu de grip (Move, Rotate, Scale, Mirror)

## Objetivo

Completar a edição por grips (MVP 3.22) com os **modos de grip do AutoCAD**. Com um grip ativo, a seleção inteira pode ser esticada, movida, girada, escalada ou espelhada a partir do grip, com cópias múltiplas e ponto base opcional.

## Modos

| Modo | Ponto indicado (clique ou digitado) | Valor digitado |
| --- | --- | --- |
| **Stretch** (padrão) | novo lugar do grip (como no MVP 3.22) | `x,y`, `@dx,dy`, `@d<a` |
| **Move** | destino; deslocamento = ponto − base | `x,y`, `@dx,dy`, `@d<a`, distância na direção do cursor |
| **Rotate** | o ângulo da reta base → ponto | ângulo em graus (convenção do AutoCAD: anti-horário na tela) |
| **Scale** | a distância base → ponto, na unidade de trabalho, é o fator (como no AutoCAD) | fator (> 0) |
| **Mirror** | segundo ponto do eixo (o primeiro é a base) | `x,y`, `@dx,dy`, `@d<a` |

- O ponto base é o grip. A opção **Base point** permite escolher outro. No Stretch, o grip se desloca de (ponto − base).
- Move, Rotate, Scale e Mirror valem para **todas as entidades selecionadas** em camadas visíveis e desbloqueadas, inclusive cotas (o Mirror não espelha cotas, como antes).
- O resultado mantém os ids e a ordem de desenho (`ReplaceEntitiesCommand` novo no cad-core). O undo é único e restaura exatamente as entidades originais. A seleção é mantida.
- **Copy**: cada clique ou valor cria cópias (ids novos) e o grip continua ativo ("** MOVE (multiple) **"), até Esc ou eXit.
- Preview ao vivo com a linha elástica base → cursor e snaps ativos.

## Como trocar de modo

- **Espaço** ou **Enter** (sem texto): Stretch → Move → Rotate → Scale → Mirror → Stretch.
- Linha de comando: `st`, `mo`, `ro`, `sc`, `mi` (ou os nomes completos); `b`/`base`, `c`/`copy`, `x`/`exit`.
- Teclas diretas no canvas: `M` (Move), `B` (Base point), `C` (Copy), `X` (sair), `A`/`R`/Delete (vértices, só no Stretch).
- **Menu de contexto** (botão direito com o grip ativo): Stretch, Move, Rotate, Scale, Mirror (o modo atual vem marcado), Base Point, Copy (marcado quando ativo), Add/Remove Vertex (no Stretch, quando se aplicam) e Exit. Esc ou clique fora fecham o menu e o grip continua ativo.
- Com grip ativo, digitar um número ou coordenada no canvas leva o foco à linha de comando automaticamente (ex.: `90` + Enter no Rotate).

## Arquivos

- `packages/cad-core`: `ReplaceEntitiesCommand` (substituição em lote O(n) com undo exato). Teste em `index.test.ts`.
- `packages/cad-tools`: `selection/gripOperations.ts` (modos, palavras-chave, transformação por ponto, aplicação), `SelectTool` (modos, Copy, Base point, prompts no estilo AutoCAD, `getContextMenu`); contrato `CadTool.getContextMenu` e `ToolMenuItem`. Testes: `tests/GripModes.test.ts`.
- `apps/web`: `CadContextMenu.tsx` (menu genérico da ferramenta), botão direito no `CadCanvas`, `getActiveToolContextMenu` no store, foco automático da linha de comando para valores digitados com grip ativo, estilos em `globals.css`.

## Fora de escopo (futuro)

- Opção Reference do Rotate/Scale e Undo dentro do modo.
- Vários grips quentes (Shift) e grips multifuncionais com menu ao passar o mouse.
- A ferramenta Rotate (fora dos grips) interpreta o ângulo digitado no sentido do mundo (Y para baixo); os grips usam a convenção do AutoCAD. Vale alinhar a ferramenta Rotate num próximo ajuste.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. Desenhar uma linha e um círculo, selecionar os dois, clicar (sem arrastar) na ponta da linha: `** STRETCH **`.
2. Espaço: `** MOVE **`; clicar no destino: os dois se movem. Ctrl+Z desfaz.
3. Grip quente → botão direito → Rotate → digitar `90` + Enter: gira 90° anti-horário em torno do grip.
4. Grip quente → `sc` Enter → `2` Enter: escala 2× a partir do grip.
5. Grip quente → `M` → `C` → vários cliques: cópias; Esc encerra.
6. Grip quente → botão direito → Mirror → clicar o segundo ponto do eixo: espelhado no lugar.
7. Grip quente → `mo` → `b` → clicar um novo ponto base → `@10,0`: move 10 a partir da base escolhida.
