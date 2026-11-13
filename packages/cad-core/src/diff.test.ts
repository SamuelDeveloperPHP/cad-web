import { describe, expect, it } from "vitest";
import { createEmptyDocument, diffDocuments, type CadDocument, type CadEntity } from "./index";

function docWith(entities: CadEntity[]): CadDocument {
  return { ...createEmptyDocument("doc"), entities };
}

function line(id: string, endX: number): CadEntity {
  return { id, layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: endX, y: 0 } };
}

describe("diffDocuments", () => {
  it("detecta entidades adicionadas, removidas e modificadas", () => {
    const previous = docWith([line("a", 10), line("b", 20)]);
    const next = docWith([line("b", 99), line("c", 30)]);

    const diff = diffDocuments(previous, next);

    expect(diff.added.map((e) => e.id)).toEqual(["c"]);
    expect(diff.removed.map((e) => e.id)).toEqual(["a"]);
    expect(diff.modified.map((m) => m.after.id)).toEqual(["b"]);
    expect(diff.modified[0]?.before.type).toBe("line");
  });

  it("documentos iguais nao acusam mudanca", () => {
    const diff = diffDocuments(docWith([line("a", 10)]), docWith([line("a", 10)]));

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it("ignora a ordem das propriedades na comparacao", () => {
    const reordered: CadEntity = {
      type: "line",
      end: { y: 0, x: 10 },
      start: { y: 0, x: 0 },
      layerId: "layer_0",
      id: "a",
    };

    const diff = diffDocuments(docWith([line("a", 10)]), docWith([reordered]));

    expect(diff.modified).toHaveLength(0);
  });
});
