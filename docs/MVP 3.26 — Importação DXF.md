# MVP 3.26 — Importação DXF

## Objetivo

Item 5.3 do roadmap: abrir desenhos e **bibliotecas de blocos** da empresa vindos do AutoCAD (DXF ASCII, R12 e 2000+) no CAD-WEB, com camadas, cores, blocos e as entidades 2D mais usadas. DWG não é lido (o roadmap recomenda converter para DXF com o ODA File Converter); o app avisa isso com uma mensagem clara.

## O que é importado

| DXF | CAD-WEB |
| --- | --- |
| `LINE`, `CIRCLE`, `ARC` | linha, círculo, arco (ângulos anti-horários convertidos; arco de varredura nula vira circunferência) |
| `LWPOLYLINE` e `POLYLINE` (2D, VERTEX/SEQEND) | polyline (fechada pelo flag 1). **Bulge → arcos exatos** entre trechos retos (a polyline ainda não tem arcos). Malhas e polyface são ignoradas. |
| `ELLIPSE` | elipse ou arco de elipse (eixo maior, razão e parâmetros convertidos) |
| `SPLINE` | NURBS (grau ≥ 2, racional ou não) amostrada e ajustada a uma **spline** (cadeia de Béziers); grau 1 vira polyline; só pontos de ajuste viram spline por ajuste; nós inválidos caem para polyline pelos pontos de controle (com aviso) |
| `TEXT`, `MTEXT` | texto: altura, rotação, alinhamento (esq./centro/dir., base/baixo/meio/topo), `%%d` `%%p` `%%c`, `\U+XXXX`; formatação do MTEXT (`\P`, fontes, cores, empilhados `\S`) reduzida a texto simples |
| `BLOCK` / `INSERT` | **blocos** (MVP 3.25): ponto base, aninhamento, escala X/Y, rotação, matriz de linhas × colunas e extrusão (0,0,−1). Blocos de layout (`*Model_Space`, `*Paper_Space`) são ignorados; referências a blocos inexistentes são descartadas. |
| `DIMENSION` | referência ao bloco anônimo (`*D1`...) com a geometria já posicionada (a cota não é paramétrica) |
| `SOLID`, `TRACE` | contorno fechado (a polyline não tem preenchimento) |
| `LEADER` | polyline pelos vértices (sem seta) |
| `HATCH` | **só o contorno** (caminhos de polyline e arestas de linha, arco e arco de elipse); o padrão de preenchimento não é desenhado (aviso) |
| `LAYER` | camadas: nome, cor ACI ou true color, desligada/congelada = oculta, bloqueada, tipo de linha |
| Tipos de linha | `CONTINUOUS` = sólido; `DASH*`, `HIDDEN`, `CENTER`, `PHANTOM`, `DIVIDE`, `BORDER` = tracejado; `DOT` = pontilhado; o tipo da camada vale para as entidades "por camada" |
| Cores | ACI 1–255 (tabela do AutoCAD) e cor verdadeira (420); preto e ACI 7 viram branco (fundo escuro); "por camada"/"por bloco" não definem cor própria |

Ignoradas e contadas no relatório: `POINT`, `XLINE`, `RAY`, `ATTRIB`/`ATTDEF` (atributos: MVP 5.1), `MLEADER`, `IMAGE`, `3DFACE`, sólidos 3D, etc. Entidades do **espaço papel** (67 = 1) e invisíveis (60 = 1) não entram.

## Convenções

- **Y para cima → Y para baixo**: o Y troca de sinal e os ângulos (graus anti-horários) viram radianos do mundo (`visualDegreesToWorldRadians`); a extrusão (0,0,−1) espelha o X.
- **Unidades**: `$INSUNITS` → milímetros (polegadas, pés, milhas, mm, cm, m, km, mícrons, dm, etc.); `displayUnit` do documento recebe mm, cm, m, km ou µm quando o arquivo usa essas. Sem unidade declarada: milímetros (com aviso).
- **Camada "0"**: vira `layer_0`; as entidades da camada 0 dentro dos blocos herdam a camada da inserção, como no AutoCAD. Os ids das demais camadas vêm do nome (sem acentos).
- **Codificação**: R2007+ é UTF-8; antes dela vale `$DWGCODEPAGE` (ANSI_1250/1251/1252/1253/1254/1257, DOS437/850); sem página, UTF-8 com recuo para Windows-1252.
- **Arquivo só de biblioteca** (blocos sem entidades): abre um desenho vazio com os blocos no painel Blocks, prontos para inserir.
- **Robustez**: valores inválidos descartam só a entidade; "Binary DXF" e DWG são recusados com mensagem; arquivos grandes são lidos em uma passada (200 mil linhas, 16 MB ≈ 1,2 s).

## Interface

- Botão **Imp DXF** na faixa de arquivo: escolhe o `.dxf`, importa, **enquadra o desenho** e mostra um resumo dispensável (objetos, blocos, camadas, unidade e fator para mm, tipos ignorados e avisos). Erros aparecem no mesmo painel.
- A importação substitui o desenho atual, como a importação de JSON e SVG (sem undo).

## Arquivos

- `packages/cad-io/src/dxf.ts` (leitura de grupos, seções, conversão e API `parseDxfDocument`, `parseDxfDocumentWithReport`, `decodeDxfBytes`, `DxfImportError`), `dxfColors.ts` (ACI e true color), `dxfText.ts` (códigos especiais e MTEXT), `dxfNurbs.ts` (Cox–de Boor racional). Testes: `dxf.test.ts` (23).
- `apps/web`: botão Imp DXF, `readDxfDocumentFile`, painel de resumo, `importDocument(doc, { zoomToFit })`.

## Fora de escopo (futuro)

- Exportação DXF (5.4), atributos de bloco (5.1), preenchimento de hachuras, cores por bloco, espessura de linha (lineweight), estilos de texto (fonte), cotas paramétricas, 3D, layouts/espaço papel, DWG.

## Testes

```bash
npx tsc -b
npm run test --workspaces --if-present
npm run build --workspace=apps/web
```

### Roteiro de teste manual

1. Importar um DXF do AutoCAD (R2000+) com blocos, camadas e textos: o resumo mostra o que entrou e o que foi ignorado; o desenho aparece enquadrado.
2. Conferir camadas (cores, ocultas, bloqueadas) na aba Layers e os blocos na aba Blocks (Insert insere o bloco da biblioteca).
3. Linhas tracejadas ("CENTER", "HIDDEN") aparecem tracejadas; textos com `%%c`/`%%d` mostram Ø e °.
4. Cantos arredondados de polylines (bulge) viram arcos; cotas aparecem como no original (geometria do bloco da cota).
5. Um DXF em metros: as medidas do painel (em mm ou na unidade de exibição) batem com o original.
6. Arquivo DWG ou DXF binário: o painel mostra a orientação para converter para DXF ASCII.
