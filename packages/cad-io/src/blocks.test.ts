import { createEmptyDocument, type BlockDefinition, type CadDocument } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { CadIoValidationError, parseCadDocument, parseSvgDocument, serializeCadDocument, serializeCadDocumentToSvg } from "./index";

const VALVE: BlockDefinition = {
  name: "valve",
  basePoint: { x: 0, y: 0 },
  entities: [
    { id: "body", layerId: "layer_0", type: "rectangle", x: -5, y: -3, width: 10, height: 6 },
    { id: "stem", layerId: "layer_0", type: "line", start: { x: 0, y: -3 }, end: { x: 0, y: -9 } }
  ]
};

function documentWithBlock(): CadDocument {
  return {
    ...createEmptyDocument("doc_blocks_io"),
    blocks: [VALVE],
    entities: [
      { id: "ref_1", layerId: "layer_0", type: "block", blockName: "valve", position: { x: 50, y: 20 }, rotation: Math.PI / 2, scaleX: 2, scaleY: 2, color: "#ff0000" },
      { id: "line_1", layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }
    ]
  };
}

describe("blocks in JSON", () => {
  it("round-trips definitions and references and omits the field when there are no blocks", () => {
    const document = documentWithBlock();

    expect(parseCadDocument(serializeCadDocument(document))).toEqual(document);
    expect(serializeCadDocument(createEmptyDocument("doc_without_blocks"))).not.toContain('"blocks"');
    expect(parseCadDocument(serializeCadDocument(createEmptyDocument("doc_without_blocks"))).blocks).toBeUndefined();
  });

  it("rejects duplicated names, invalid block entities and zero scale", () => {
    const document = documentWithBlock();

    expect(() => serializeCadDocument({ ...document, blocks: [VALVE, VALVE] })).toThrow(CadIoValidationError);
    expect(() => serializeCadDocument({ ...document, blocks: [{ ...VALVE, entities: [{ id: "x", layerId: "layer_0", type: "hatch" } as any] }] })).toThrow("$.blocks[0].entities[0].type");
    expect(() => serializeCadDocument({ ...document, entities: [{ ...document.entities[0]!, scaleX: 0 } as any] })).toThrow("Block scale must not be zero");
  });
});

describe("blocks in SVG", () => {
  it("exports a group with the expanded geometry and round-trips the reference exactly", () => {
    const document = documentWithBlock();
    const svg = serializeCadDocumentToSvg(document);

    expect(svg).toContain('data-block-name="valve"');
    // 2 entidades do bloco expandidas + a linha solta.
    expect((svg.match(/<(rect|polygon|path|polyline|line)\b/g) ?? []).length).toBeGreaterThanOrEqual(3);

    const imported = parseSvgDocument(svg);
    expect(imported.blocks).toEqual([VALVE]);
    expect(imported.entities.find((entity) => entity.id === "ref_1")).toEqual(document.entities[0]);
    // O desenho do grupo não é importado de novo como entidades soltas.
    expect(imported.entities).toHaveLength(2);
  });

  it("exports plain geometry without CAD data when embedCadData is false", () => {
    const svg = serializeCadDocumentToSvg(documentWithBlock(), { embedCadData: false });

    expect(svg).not.toContain("data-cad-entity");
    expect(svg).toContain('data-block-name="valve"');
  });
});
