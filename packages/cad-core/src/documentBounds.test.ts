import { describe, expect, it } from "vitest";
import { createEmptyDocument, documentBoundingBox, type CadDocument, type CadEntity } from "./index";

function docWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_bounds"), entities };
}

describe("documentBoundingBox", () => {
  it("returns null for an empty document", () => {
    expect(documentBoundingBox(docWith([]))).toBeNull();
  });

  it("returns the bounds of a single entity", () => {
    const bounds = documentBoundingBox(
      docWith([{ id: "l1", layerId: "layer_0", type: "line", start: { x: 1, y: 2 }, end: { x: 5, y: 8 } }])
    );

    expect(bounds).toEqual({ minX: 1, minY: 2, maxX: 5, maxY: 8 });
  });

  it("unites the bounds of several entities", () => {
    const bounds = documentBoundingBox(
      docWith([
        { id: "l1", layerId: "layer_0", type: "line", start: { x: -3, y: 0 }, end: { x: 4, y: 1 } },
        { id: "c1", layerId: "layer_0", type: "circle", center: { x: 10, y: 10 }, radius: 5 }
      ])
    );

    expect(bounds).toEqual({ minX: -3, minY: 0, maxX: 15, maxY: 15 });
  });
});
