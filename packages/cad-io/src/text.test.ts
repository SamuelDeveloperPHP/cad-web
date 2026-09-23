import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { CadIoValidationError, parseCadDocument, parseSvgDocument, serializeCadDocument, serializeCadDocumentToSvg } from "./index";

function documentWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_text_io"), entities };
}

const fullText: CadEntity = {
  id: "text_1",
  layerId: "layer_0",
  type: "text",
  position: { x: 10, y: 20 },
  content: "Planta <baixa>\nEscala 1:50",
  height: 2.5,
  rotation: -Math.PI / 6,
  horizontalAlign: "center",
  verticalAlign: "middle",
  fontFamily: "Times New Roman",
  bold: true,
  italic: false,
  color: "#ff0000"
};

describe("cad-io text", () => {
  it("round trips a text entity through the native JSON", () => {
    const document = documentWith([fullText]);

    expect(parseCadDocument(serializeCadDocument(document))).toEqual(document);
  });

  it("rejects invalid text fields", () => {
    const invalid = (patch: Record<string, unknown>) =>
      () => parseCadDocument(serializeCadDocument(documentWith([{ ...fullText, ...patch } as CadEntity])));

    expect(invalid({ height: 0 })).toThrow(CadIoValidationError);
    expect(invalid({ content: "" })).toThrow(CadIoValidationError);
    expect(invalid({ horizontalAlign: "justify" })).toThrow(CadIoValidationError);
    expect(invalid({ verticalAlign: "center" })).toThrow(CadIoValidationError);
    expect(invalid({ bold: "yes" })).toThrow(CadIoValidationError);
  });

  it("exports text to SVG with one escaped <text> per line", () => {
    const svg = serializeCadDocumentToSvg(documentWith([fullText]));

    expect(svg).toContain('data-entity-type="text"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain("Planta &lt;baixa&gt;");
    expect(svg).toContain("Escala 1:50");
    expect(svg.match(/<text /g)).toHaveLength(2);
    // −30° no mundo (Y para baixo) = texto subindo 30° na tela.
    expect(svg).toContain('transform="rotate(-30 ');
  });

  it("exports the new dimension terminators to SVG", () => {
    const dimension = (arrowType: "open" | "dot" | "none"): CadEntity => ({
      id: `dim_${arrowType}`,
      layerId: "layer_0",
      type: "dimension",
      dimensionType: "aligned",
      styleOverride: { arrowType },
      definition: { firstPoint: { x: 0, y: 0 }, secondPoint: { x: 100, y: 0 }, dimensionLinePoint: { x: 50, y: -20 } }
    });

    const openSvg = serializeCadDocumentToSvg(documentWith([dimension("open")]));
    const dotSvg = serializeCadDocumentToSvg(documentWith([dimension("dot")]));
    const noneSvg = serializeCadDocumentToSvg(documentWith([dimension("none")]));

    expect(openSvg.match(/<polyline /g)).toHaveLength(2);
    expect(dotSvg.match(/<circle /g)).toHaveLength(2);
    expect(noneSvg).not.toMatch(/<polygon |<polyline |<circle /);
  });

  it("round trips CAD-WEB text through SVG export and import", () => {
    const texts: ReadonlyArray<CadEntity> = [
      fullText,
      {
        id: "text_2",
        layerId: "layer_0",
        type: "text",
        position: { x: -5, y: 7 },
        content: "Linha  com  espaços\n\nDepois do vazio",
        height: 4,
        verticalAlign: "top",
        horizontalAlign: "right",
        italic: true
      },
      { id: "text_3", layerId: "layer_0", type: "text", position: { x: 1, y: 2 }, content: "Simples", height: 3 }
    ];
    const imported = parseSvgDocument(serializeCadDocumentToSvg(documentWith(texts), { precision: 6 }));
    const importedTexts = imported.entities.filter((entity) => entity.type === "text");

    expect(importedTexts).toHaveLength(3);
    for (const original of texts) {
      const match = importedTexts.find((entity) => entity.id === original.id) as any;
      const source = original as any;
      expect(match).toBeDefined();
      expect(match.content).toBe(source.content);
      expect(match.height).toBeCloseTo(source.height);
      expect(match.position.x).toBeCloseTo(source.position.x, 5);
      expect(match.position.y).toBeCloseTo(source.position.y, 5);
      expect(match.rotation ?? 0).toBeCloseTo(source.rotation ?? 0, 5);
      expect(match.horizontalAlign).toBe(source.horizontalAlign);
      expect(match.verticalAlign).toBe(source.verticalAlign);
      expect(match.fontFamily).toBe(source.fontFamily);
      expect(match.bold).toBe(source.bold === true ? true : undefined);
      expect(match.italic).toBe(source.italic === true ? true : undefined);
      expect(match.color).toBe(source.color);
      expect(match.layerId).toBe("layer_0");
    }
  });

  it("imports plain <text> elements from other SVG editors", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <text id="t_attr" x="10" y="20" font-size="5" text-anchor="middle" font-weight="700" fill="#00ff00">Olá &amp; &#8364;</text>
      <text id="t_style" x="0" y="0" style="font-size:8px;font-family:Verdana;font-style:italic;dominant-baseline:central" transform="rotate(-90)">Vertical</text>
      <text id="t_translate" x="1" y="1" font-size="2" transform="translate(4, 5)">  muitos    espaços  </text>
      <text id="t_tspan" x="0" y="50" font-size="3"><tspan x="0" y="50">Primeira</tspan><tspan x="0" dy="4">Segunda</tspan></text>
      <text x="0" y="0" font-size="3">   </text>
    </svg>`;
    const document = parseSvgDocument(svg);
    const byId = (id: string) => document.entities.find((entity) => entity.id === id) as any;

    expect(document.entities.filter((entity) => entity.type === "text")).toHaveLength(4);
    expect(byId("t_attr")).toMatchObject({
      position: { x: 10, y: 20 },
      content: "Olá & €",
      height: 5,
      horizontalAlign: "center",
      bold: true,
      color: "#00ff00"
    });
    expect(byId("t_style")).toMatchObject({ height: 8, fontFamily: "Verdana", italic: true, verticalAlign: "middle" });
    expect(byId("t_style").rotation).toBeCloseTo(-Math.PI / 2);
    expect(byId("t_translate")).toMatchObject({ position: { x: 5, y: 6 }, content: "muitos espaços" });
    expect(byId("t_tspan").content).toBe("Primeira\nSegunda");
  });

  it("assigns imported text to the enclosing layer group", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g data-layer-id="notes" data-layer-name="Notas"><text x="0" y="0" font-size="2">Na camada</text></g>
    </svg>`;
    const document = parseSvgDocument(svg);

    expect(document.entities[0]).toMatchObject({ type: "text", layerId: "notes", content: "Na camada" });
  });

  it("ignores text inside removed script blocks", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script><text x="0" y="0">mal</text></script><text x="0" y="0" font-size="2">bom</text></svg>`;
    const texts = parseSvgDocument(svg).entities;

    expect(texts).toHaveLength(1);
    expect((texts[0] as any).content).toBe("bom");
  });
});
