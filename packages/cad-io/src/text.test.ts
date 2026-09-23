import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { CadIoValidationError, parseCadDocument, serializeCadDocument, serializeCadDocumentToSvg } from "./index";

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
});
