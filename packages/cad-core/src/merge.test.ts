import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  mergeDocuments,
  type CadDocument,
  type CadEntity,
  type CadLayer,
} from "./index";

function docWith(entities: CadEntity[], layers?: CadLayer[]): CadDocument {
  const base = createEmptyDocument("doc");
  return layers ? { ...base, entities, layers } : { ...base, entities };
}

function line(id: string, endX: number): CadEntity {
  return { id, layerId: "layer_0", type: "line", start: { x: 0, y: 0 }, end: { x: endX, y: 0 } };
}

describe("mergeDocuments", () => {
  it("mescla alteracoes nao conflitantes dos dois lados", () => {
    const base = docWith([line("a", 10), line("b", 20)]);
    const ours = docWith([line("a", 10), line("b", 99)]); // b alterada
    const theirs = docWith([line("a", 50), line("b", 20)]); // a alterada

    const result = mergeDocuments(base, ours, theirs);

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged).not.toBeNull();
    const byId = new Map(result.merged!.entities.map((e) => [e.id, e]));
    expect((byId.get("a") as { end: { x: number } }).end.x).toBe(50);
    expect((byId.get("b") as { end: { x: number } }).end.x).toBe(99);
  });

  it("acusa conflito quando os dois alteram a mesma entidade de formas diferentes", () => {
    const result = mergeDocuments(docWith([line("a", 10)]), docWith([line("a", 20)]), docWith([line("a", 30)]));

    expect(result.merged).toBeNull();
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe("modified-both");
  });

  it("acusa conflito quando um lado altera e o outro remove", () => {
    const result = mergeDocuments(docWith([line("a", 10)]), docWith([line("a", 20)]), docWith([]));

    expect(result.merged).toBeNull();
    expect(result.conflicts[0]?.kind).toBe("modified-deleted");
  });

  it("aplica remocao limpa (removida de um lado, inalterada no outro)", () => {
    const base = docWith([line("a", 10), line("b", 20)]);
    const ours = docWith([line("a", 10)]); // b removida
    const theirs = docWith([line("a", 10), line("b", 20)]); // inalterado

    const result = mergeDocuments(base, ours, theirs);

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged!.entities.map((e) => e.id)).toEqual(["a"]);
  });

  it("junta adicoes dos dois lados e preserva a ordem", () => {
    const result = mergeDocuments(docWith([]), docWith([line("a", 10)]), docWith([line("b", 20)]));

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged!.entities.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("une as layers para nao deixar referencias orfas", () => {
    const extraLayer: CadLayer = {
      id: "layer_x",
      name: "X",
      color: "#ff0000",
      visible: true,
      locked: false,
      order: 1,
    };
    const base = docWith([]);
    const ours = docWith([line("a", 10)]);
    const theirs = docWith(
      [{ id: "c", layerId: "layer_x", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 5 } }],
      [base.layers[0]!, extraLayer],
    );

    const result = mergeDocuments(base, ours, theirs);

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged!.layers.map((l) => l.id)).toContain("layer_x");
    expect(result.merged!.entities.map((e) => e.id)).toEqual(["a", "c"]);
  });
});
