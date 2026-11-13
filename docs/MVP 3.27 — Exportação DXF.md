# MVP 3.27 — Exportação DXF

## Status

**Proposto — aguardando aprovação para implementação.**

## Problema

O CAD-WEB já importa DXF ASCII, mas ainda não devolve o desenho editado para ferramentas como AutoCAD, DraftSight e LibreCAD. Isso impede o fluxo completo de intercâmbio com desenhos legados e bibliotecas de blocos da empresa.

O MVP fecha o ciclo `DXF → CAD-WEB → edição → DXF`, preservando a geometria 2D, as camadas e os blocos que o modelo atual representa com segurança.

## Objetivos

1. Exportar um `CadDocument` válido como DXF ASCII compatível com AutoCAD 2000 (`AC1015`).
2. Preservar geometria 2D, camadas, cores, tipos de linha simples, textos e blocos.
3. Garantir round trip automatizado: `CadDocument → DXF → parseDxfDocument → CadDocument` dentro das tolerâncias definidas.
4. Exibir avisos claros quando um recurso precisar ser simplificado ou não puder ser preservado.
5. Manter a implementação concentrada em `cad-io`, sem introduzir dependência de React no kernel ou no formato.

## Não objetivos

- **DWG:** formato proprietário; continua exigindo conversão externa para DXF.
- **DXF binário:** o MVP produz somente DXF ASCII.
- **R12 como saída:** a versão inicial usa AC1015 para suportar elipses, splines, MTEXT e blocos com melhor fidelidade.
- **3D, layouts e espaço papel:** o documento atual é 2D e não possui modelo de paper space.
- **Cotas paramétricas DXF:** nesta etapa as cotas são exportadas como aparência gráfica, sem associatividade no programa de destino.
- **Hachuras preenchidas e atributos de bloco:** dependem de MVPs próprios.
- **Lineweight físico:** `lineThickness` hoje representa espessura visual do Canvas/SVG e não milímetros de impressão; não será convertido silenciosamente em DXF lineweight.
- **Preservação de identificadores internos:** IDs do CAD-WEB não fazem parte do contrato DXF.

## Histórias de usuário

- Como projetista, quero exportar um desenho editado no CAD-WEB para DXF para continuar o trabalho em outro CAD.
- Como responsável pela biblioteca, quero preservar definições e inserções de blocos para evitar explodir símbolos reutilizáveis.
- Como desenhista, quero que unidades, coordenadas, camadas, cores e textos mantenham a aparência esperada no AutoCAD.
- Como usuário, quero receber um resumo das simplificações para saber o que deve ser conferido no arquivo exportado.
- Como desenvolvedor, quero validar o arquivo exportado com o importador DXF existente para detectar regressões automaticamente.

## Decisões técnicas

### Formato de saída

- DXF ASCII com `$ACADVER = AC1015`.
- Quebra de linha `\r\n` e término obrigatório com `EOF`.
- Seções mínimas: `HEADER`, `TABLES`, `BLOCKS`, `ENTITIES` e `OBJECTS` apenas se necessário.
- `$INSUNITS` representa a unidade de trabalho escolhida para o arquivo.
- A geometria interna continua imutável; a conversão acontece somente durante a serialização.

### Coordenadas e unidades

O mundo interno usa milímetros e eixo Y crescente para baixo. O DXF usa eixo Y crescente para cima.

- `xDxf = xMm / fatorDaUnidade`
- `yDxf = -yMm / fatorDaUnidade`
- Ângulos internos são convertidos para graus anti-horários visuais.
- O exportador usa `document.displayUnit` quando ela for uma unidade DXF suportada; caso contrário, usa `document.units` e, por segurança, recua para milímetros.
- Micrômetros (`um`) usam `$INSUNITS = 13`; centímetros, metros e quilômetros usam seus códigos DXF correspondentes.

### API pública proposta

Arquivo novo: `packages/cad-io/src/dxfExport.ts`.

```ts
export type DxfExportOptions = Readonly<{
  unit?: CadDisplayUnit | "in";
  precision?: number;
}>;

export type DxfExportReport = Readonly<{
  exportedEntities: number;
  exportedBlocks: number;
  warnings: ReadonlyArray<string>;
  simplifiedByType: Readonly<Record<string, number>>;
}>;

export type DxfExportResult = Readonly<{
  source: string;
  report: DxfExportReport;
}>;

export function serializeCadDocumentToDxf(
  document: CadDocument,
  options?: DxfExportOptions
): string;

export function serializeCadDocumentToDxfWithReport(
  document: CadDocument,
  options?: DxfExportOptions
): DxfExportResult;
```

`serializeCadDocumentToDxf` é a API simples. A versão com relatório alimenta a interface e os testes de simplificação.

## Mapeamento de entidades

| CAD-WEB | DXF AC1015 | Regra |
| --- | --- | --- |
| `line` | `LINE` | Coordenadas convertidas para a unidade e Y invertido. |
| `rectangle` | `LWPOLYLINE` | Quatro vértices, fechada; a rotação é aplicada antes da escrita. |
| `circle` | `CIRCLE` | Centro e raio. |
| `arc` | `ARC` | Inverte Y e converte início/fim para graus anti-horários. |
| `ellipse` completa | `ELLIPSE` | Centro, vetor do semi-eixo maior, razão e parâmetros 0–2π. |
| arco de `ellipse` | `ELLIPSE` | Parâmetros convertidos preservando os extremos e a varredura visual. |
| `polyline` | `LWPOLYLINE` | Vértices 2D e flag de fechamento. |
| `spline` | `SPLINE` | Cadeia cúbica de Béziers convertida em spline grau 3 com nós clampeados; pontos de ajuste são opcionais. |
| `text` de uma linha | `TEXT` | Conteúdo, posição, altura, rotação e alinhamento. |
| `text` multilinha | `MTEXT` | `\n` vira `\P`; formatação básica de fonte é preservada quando representável. |
| `block` | `INSERT` | Nome, posição, rotação e escalas X/Y; referências aninhadas permanecem referências. |
| definição de bloco | `BLOCK`/`ENDBLK` | Ponto base e entidades da definição. |
| `dimension` | primitivas + texto | Aparência gerada pelo kernel de cotas e escrita em bloco anônimo; entra no relatório como simplificada. |

## Camadas, cores e tipos de linha

- Cada `CadLayer` gera uma entrada `LAYER`.
- Layer invisível usa cor ACI negativa; layer bloqueada usa flag compatível.
- A cor da entidade sobrescreve a cor da layer quando `entity.color` existe.
- Cores hexadecimais são aproximadas para a cor ACI 1–255 mais próxima, mantendo compatibilidade AC1015.
- São criados `CONTINUOUS`, `DASHED` e `DOTTED` na tabela `LTYPE`.
- `solid`, `dashed` e `dotted` são escritos por entidade porque o modelo atual não armazena tipo de linha na layer.
- `lineThickness` gera aviso no relatório e não é exportado como lineweight físico neste MVP.

## Blocos

- Cada `BlockDefinition` é escrita uma vez na seção `BLOCKS`.
- O ponto base é preservado sem deslocar permanentemente a geometria do documento.
- Inserções preservam escala X/Y independente, escala negativa e rotação.
- Blocos aninhados continuam como `INSERT`.
- Ciclos ou referências inexistentes não quebram a exportação: são ignorados e registrados no relatório.
- Nomes reservados ou inválidos são sanitizados de forma determinística e o mesmo mapa é usado por todas as referências.

## Interface web

- Adicionar `downloadDxfDocument(document)` em `apps/web/src/services/cadJsonExport.ts`.
- Adicionar “Exportar DXF” ao menu superior de exportação, que permanece visível em telas estreitas.
- Adicionar “Exp DXF” ao grupo Arquivo da Ribbon.
- O arquivo sugerido é `cad-web-drawing.dxf`.
- Após a geração, mostrar resumo dispensável com entidades, blocos e simplificações.
- A exportação não altera o documento, o histórico ou a seleção.

## Arquitetura por pacote

### `cad-geometry`

- Reutilizar conversores de ângulo e transformações existentes.
- Nenhuma dependência de DXF é introduzida no pacote.

### `cad-core`

- Reutilizar entidades, definições de bloco e geometria visual de cotas.
- Não alterar o schema JSON neste MVP.

### `cad-io`

- Implementar toda a escrita DXF em `dxfExport.ts`.
- Exportar a API pelo `index.ts`.
- Manter funções pequenas para pares DXF, HEADER/TABLES/BLOCKS/ENTITIES e cada tipo de entidade.

### `cad-renderer`

- Sem alterações esperadas.

### `cad-tools`

- Sem alterações esperadas.

### `apps/web`

- Integrar download, menu superior, Ribbon e resumo do relatório.
- Nenhuma regra geométrica deve ser implementada nos componentes React.

## Requisitos P0

- [ ] O exportador gera DXF ASCII AC1015 válido e terminado por `EOF`.
- [ ] Line, Rectangle, Circle, Arc, Ellipse, Polyline, Spline e Text completam round trip dentro da tolerância.
- [ ] Layers, cores e tipos de linha simples são preservados dentro das limitações documentadas.
- [ ] Definições e inserções de blocos, inclusive aninhadas e espelhadas, completam round trip.
- [ ] Coordenadas, ângulos e unidades voltam ao mesmo valor interno após reimportação.
- [ ] Cotas mantêm aparência visual e são reportadas como não paramétricas.
- [ ] Recursos simplificados ou ignorados aparecem no relatório.
- [ ] A interface permite exportar DXF pelo menu superior e pela Ribbon.
- [ ] A exportação não modifica o `CadDocument` recebido.
- [ ] Typecheck, build e todos os testes existentes permanecem verdes.

## Requisitos P1

- Escrita incremental por chunks para reduzir picos de memória em desenhos grandes.
- Opção de escolher explicitamente milímetros, centímetros, metros ou polegadas na exportação.
- Nome do arquivo derivado do nome do documento.
- Métrica de tempo e tamanho no relatório de exportação.

## Futuro P2

- DXF R12 como formato de saída reduzido.
- True color em versões DXF mais recentes.
- Cotas DXF paramétricas.
- `HATCH`, `ATTDEF`/`ATTRIB`, lineweights físicos e estilos de texto completos.
- Layouts, viewports e espaço papel.
- Exportação em Web Worker para desenhos muito grandes.

## Critérios de aceite

1. **Geometria básica**
   - Dado um documento com todas as entidades P0,
   - quando ele é exportado e reimportado,
   - então tipos, pontos, medidas e varreduras coincidem dentro de `1e-6 mm` para primitivas e da tolerância própria da spline.

2. **Sistema de coordenadas**
   - Dada uma linha de `(0, 0)` a `(10, -20)` no mundo interno,
   - quando o DXF é gerado,
   - então suas coordenadas visuais são `(0, 0)` a `(10, 20)` na unidade escolhida.

3. **Bloco espelhado e rotacionado**
   - Dada uma referência com rotação e escala negativa,
   - quando exportada e reimportada,
   - então a geometria expandida antes e depois é equivalente.

4. **Documento em metros**
   - Dado um desenho cuja exportação usa metros,
   - quando o arquivo é reimportado,
   - então `$INSUNITS` é reconhecido e as medidas internas retornam em milímetros sem perda relevante.

5. **Falha segura**
   - Dada uma referência de bloco inválida ou uma entidade não representável,
   - quando a exportação é solicitada,
   - então o restante do arquivo permanece válido e o relatório informa o problema.

6. **Interface**
   - Dado um desenho aberto,
   - quando o usuário escolhe “Exportar DXF”,
   - então o navegador baixa um `.dxf` e mostra o resumo sem alterar o histórico.

## Plano de testes

Arquivo novo: `packages/cad-io/src/dxfExport.test.ts`.

- Estrutura mínima: HEADER, TABLES, BLOCKS, ENTITIES e EOF.
- Conversão de Y e ângulos para line, arc e ellipse.
- `$INSUNITS` para mm, cm, m, km, µm e polegadas.
- Round trip de cada entidade P0.
- Texto simples, multilinha, alinhamento e caracteres Unicode suportados.
- Cores de layer, override por entidade e aproximação ACI.
- Tipos de linha solid/dashed/dotted.
- Bloco simples, aninhado, rotacionado, escalado e espelhado.
- Nomes de bloco duplicados após sanitização.
- Documento vazio.
- Documento de biblioteca, com blocos e sem entidades no model space.
- Entidade inválida ou referência inexistente com warning.
- Imutabilidade do documento de entrada.
- Teste de volume com pelo menos 100 mil linhas, sem meta rígida no CI; registrar duração localmente.

## Comandos de validação

```bash
npm run typecheck
npm run test --workspaces --if-present
npm run build --workspace @cad-web/web
```

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Inversão incorreta de arcos/elipses | Testes de quadrantes, extremos e varreduras cruzando 0°. |
| Perda de cor em AC1015 | Aproximação ACI determinística e teste da distância de cor. |
| Nomes DXF inválidos ou colidentes | Sanitização centralizada com mapa estável e sufixo incremental. |
| Spline alterada no round trip | Exportar a cadeia Bézier como spline cúbica exata e comparar amostras. |
| Blocos recursivos | Detectar ciclos e limitar profundidade, seguindo as regras do `cad-core`. |
| Arquivo grande consumir muita memória | Limitar o P0 à string; planejar chunks/Web Worker no P1. |
| Confusão entre espessura visual e lineweight | Não converter silenciosamente; reportar a limitação. |

## Questões não bloqueantes

- O nome do arquivo deve futuramente acompanhar um nome persistido no documento; hoje o documento não possui esse campo.
- A escolha manual da unidade pode entrar no P1 após validar o fluxo padrão com usuários.
- Lineweight físico exige definir unidade e semântica próprias no modelo antes de exportar o grupo 370.

## Sequência de implementação

1. Criar writer de pares DXF e seções mínimas em `cad-io`.
2. Implementar unidades, coordenadas, tabelas, layers, cores e linetypes.
3. Implementar entidades geométricas e testes de round trip.
4. Implementar textos, blocos e cotas simplificadas.
5. Adicionar relatório de exportação e casos de falha segura.
6. Integrar download, menu superior e Ribbon no app web.
7. Executar typecheck, testes, build e roteiro manual em AutoCAD/LibreCAD.

## Próximo passo após aprovação

Implementar primeiro o núcleo P0 em `packages/cad-io`, sem alterações de interface até o round trip automatizado estar verde.
