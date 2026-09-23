# MVP 3.20 — Spline, trim de polylines e SVG avançado

## Objetivo

Fechar as lacunas apontadas no MVP 3.19: entidade **spline** (e offset suave da elipse), **aparar retângulos e polylines por trecho** e, na importação SVG, **`<use>`**, **estilos CSS por classe** e **unidades físicas do `viewBox`**.

## Spline

### Representação

- `SplineEntity`: `controlPoints` (cadeia de Béziers cúbicas `[P0, C1, C2, P1, …]`, 3n + 1 pontos — uma B-spline cúbica com nós de multiplicidade 3, ou seja, uma NURBS não racional), `closed` e `fitPoints` opcionais.
- É a geometria exata: Canvas (`bezierCurveTo`) e SVG (`C`) desenham Béziers nativamente; mover, girar, escalar e espelhar é só transformar os pontos.
- **Por pontos de ajuste** (padrão do SPLINE do AutoCAD): a curva é C2 e passa por todos os pontos (parametrização por corda; natural nas pontas quando aberta, periódica quando fechada). Splines importadas, aparadas ou geradas por offset ficam só com os pontos de controle, como no AutoCAD.

### Ferramenta (`spline`, `spl`)

Clique ou digite os pontos (x,y, @dx,dy, @d<a, distância, na unidade de trabalho). Enter conclui; `c` fecha; `u` desfaz o último ponto (as opções não ativam Circle/Undo). Preview ao vivo.

### Suporte nas demais funções

| Função | Comportamento |
| --- | --- |
| Seleção, janela/cruzamento | Distância exata à curva; envoltório exato (raízes da derivada). |
| Snaps | Endpoint (aberta), Midpoint (metade do comprimento), Nearest, Intersection (refinada na curva por bisseção), Perpendicular/Tangent (sobre a polyline de alta precisão). |
| Move, Copy/Array, Rotate, Scale, Mirror | Transformação dos pontos (exata). |
| Stretch | Com pontos de ajuste: move os que estão na janela e recalcula a curva; sem eles: move os pontos de controle. |
| Trim | Aparada nas interseções (exatas); a fechada precisa de dois cortes e vira aberta. Também serve de aresta de corte e de limite. |
| Offset | Paralela como nova spline (ajuste Hermite, erro ≈ 1e-6 do tamanho). |
| Path Array | Serve de caminho. |
| Painel | Método, grau, aberta/fechada (recalcula pelos pontos de ajuste), nº de pontos, comprimento, pontas. |
| JSON / SVG | Validação (3n + 1 pontos); exporta `<path d="M … C … [Z]">` exato; importa curvas de `<path>` como spline. |
| Extend, Fillet, Explode | Não suportados nesta fase (mensagem clara); o Explode segue o AutoCAD. |

### Offset da elipse

Passa a gerar **spline** (em vez de polyline densa), com erro menor que 1e-5 do maior raio e poucos segmentos — suave e leve, como o AutoCAD.

## Trim de retângulos e polylines

- O caminho é parametrizado pelo comprimento; os cortes são as interseções com as arestas de corte (qualquer geometria, inclusive splines).
- **Retângulo e polyline fechada**: com dois cortes, o trecho clicado sai e sobra uma **polyline aberta** (o retângulo vira polyline).
- **Polyline aberta**: o trecho entre cortes que contém o clique sai; sobram até duas polylines.
- Estilo, camada e id (no primeiro pedaço) são preservados; um único undo.
- **Extend** agora estende as pontas de polylines abertas (primeiro/último segmento).

## Importação SVG

- **`<use>`**: instancia elementos (inclusive de `<defs>`) com `x`/`y` e `transform`; `<symbol>` com `viewBox` é ajustado a `width`/`height`. Referências circulares (inclusive a um ancestral), profundidade acima de 8 e mais de 100 mil instâncias são bloqueadas. Só referências internas (`#id`) são lidas.
- **CSS de `<style>`**: seletores `tag`, `.classe`, `#id`, `tag.classe`, `*` e listas com vírgula; precedência do SVG (style inline > regra CSS por especificidade/ordem > atributo). Afeta cor, fonte, alinhamento e `display:none`. Seletores com combinadores/pseudo-classes são ignorados.
- **Unidades físicas**: `<svg width="210mm" viewBox="0 0 2100 …">` → 0,1 mm por unidade. Unidades: mm, cm, q, in, pt, pc, px (px = 25,4/96 mm). Sem `viewBox`, a unidade é o px. Sem unidade no width/height, 1 unidade = 1 mm (como antes). A origem do arquivo é mantida.
- **Curvas de `<path>`** (C/S/Q/T) viram **spline exata** (Q/T elevadas a cúbica sem erro); trechos retos no meio da curva entram como Béziers retas.

## Correção

- `distancePointToEllipse` / `nearestPointOnEllipse`: na elipse fechada, o refinamento agora atravessa o parâmetro 0/2π. Antes, pontos perto do vértice do eixo maior (lado de parâmetro negativo) podiam ter distância errada (até ~2% do raio), afetando seleção e snap Nearest.

## Arquivos

- `packages/cad-geometry`: `spline.ts` (cadeia de Béziers, ajuste C2, medidas, interseções, sub-trechos, achatamento, offset/ajuste Hermite, caches), `pathTrim.ts` (trim de caminhos e `trimIntervals`), `offset.ts` (`offsetEllipseToBezierChain`), `snap.ts` (spline), `ellipse.ts` (correção). Testes: `spline.test.ts`, `pathTrim.test.ts`.
- `packages/cad-core`: `SplineEntity`; move/rotate/scale/mirror/stretch; array; envoltório. Testes: `spline.test.ts`.
- `packages/cad-tools`: `draw/SplineTool.ts`; Trim (retângulo, polyline, spline), Extend (polyline aberta), Offset (spline; elipse → spline), Path Array (spline), Explode (mensagem); `claimsCommandInput` na Polyline (`c`/`u`). Testes: `SplineTool.test.ts`, `CurveTrimExtend.test.ts`.
- `packages/cad-renderer`: desenho da spline com `bezierCurveTo`.
- `packages/cad-io`: validação JSON, exportação SVG da spline, importação com `<use>`, CSS, unidades e curvas como spline. Testes em `svgImport.test.ts` e `json.test.ts`.
- `apps/web`: botão Spline, registro, prompts, painel da spline.

## Fora de escopo (futuro)

- Extend e Fillet com spline; edição dos pontos de ajuste por grips; NURBS racionais (pesos) e grau diferente de 3 (útil para DXF).
- CSS com combinadores e seletores de atributo; `<use>` de arquivos externos (bloqueado por segurança).

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. `spline` → clicar 4 pontos → Enter: curva suave passando pelos pontos. Repetir com 3 pontos e `c`: fechada (o `c` não abre o Circle).
2. Linha cruzando a spline → `trim` → Enter → clicar num lado: sobra o outro lado, exatamente na linha.
3. `offset` → `1` → clicar na spline → clicar de um lado: spline paralela.
4. Retângulo cruzado por uma linha → `trim` → clicar num lado: vira polyline aberta; Ctrl+Z restaura o retângulo.
5. Polyline aberta cortada por duas linhas → `trim` no meio: sobram duas polylines. `extend` numa ponta de polyline aberta.
6. `offset` numa elipse: resultado é spline (painel mostra "Control vertices").
7. Importar um SVG com `width="100mm" viewBox="0 0 1000 500"`, `<style>` com classes, `<symbol>` + `<use>` e `<path>` com curvas: medidas em mm, cores das classes, símbolos instanciados e curvas como spline.
8. Exportar e reimportar o SVG: splines idênticas.
