import { createEmptyDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { MAX_SNAP_CANDIDATES, ObjectSnapService, nearestCandidates } from "../src/snaps/ObjectSnapService";
import { createMockToolContext, createPointerEvent } from "./testContext";

function lineAt(index: number, x: number, y: number, dx = 10, dy = 3): CadEntity {
  return { id: `l${index}`, layerId: "layer_0", type: "line", start: { x, y }, end: { x: x + dx, y: y + dy } };
}

describe("ObjectSnapService com desenho denso", () => {
  it("nearestCandidates devolve as mais próximas do ponto, da mais próxima para a mais distante", () => {
    const entities = [lineAt(0, 100, 100), lineAt(1, 0, 0), lineAt(2, 50, 50), lineAt(3, 1, 1)];

    const result = nearestCandidates(entities, { x: 0, y: 0 }, 2);

    expect(result.map((entity) => entity.id)).toEqual(["l1", "l3"]);
    expect(nearestCandidates(entities, { x: 49, y: 49 }, 3).map((entity) => entity.id)).toEqual(["l2", "l3", "l1"]);
  });

  it("não avalia as interseções de milhares de entidades dentro da tolerância", () => {
    // 3000 linhas cruzando a mesma região: sem o corte seriam ~4,5 milhões de pares de interseção por movimento.
    const entities = Array.from({ length: 3000 }, (_unused, index) => lineAt(index, (index % 60) * 0.01, (index % 47) * 0.01, 5 + (index % 7), -4 - (index % 5)));
    const document = { ...createEmptyDocument("doc_snap_dense"), entities };
    const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 0.05 } });
    const service = new ObjectSnapService({ enabled: true, tolerancePx: 12, endpoint: true, midpoint: true, intersection: true, nearest: true } as never);

    const startedAt = performance.now();
    const result = service.findSnap(createPointerEvent({ x: 0.3, y: 0.2 }), context);
    const elapsed = performance.now() - startedAt;

    expect(result).not.toBeNull();
    expect(elapsed).toBeLessThan(250);
    expect(MAX_SNAP_CANDIDATES).toBeLessThan(100);
  });

  it("mantém o snap exato quando há poucos candidatos", () => {
    const document = { ...createEmptyDocument("doc_snap_few"), entities: [lineAt(0, 0, 0, 100, 0), lineAt(1, 50, -50, 0, 100)] };
    const context = createMockToolContext({ document, viewport: { origin: { x: 0, y: 0 }, scale: 1 } });
    const service = new ObjectSnapService({ enabled: true, tolerancePx: 10, intersection: true } as never);

    const result = service.findSnap(createPointerEvent({ x: 51, y: 1 }), context);

    expect(result?.snapped).toBe(true);
    expect(result?.point).toEqual({ x: 50, y: 0 });
  });
});
