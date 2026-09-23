import { describe, expect, it } from "vitest";
import {
  addVertexAtGrip,
  getEntityGripPoints,
  gripVertexOptions,
  removeVertexAtGrip,
  supportsEntityGrips,
  updateEntityByGrip
} from "./entityGrips";
import { getRectangleCorners } from "./explode";
import { evaluateBezierChain, fitPointsToBezierChain } from "./spline";
import type { Point2D } from "./types";

describe("entity grips", () => {
  it("stretches line ends and moves the line by its midpoint", () => {
    const line = { id: "l", layerId: "layer_0", type: "line" as const, start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };

    expect(getEntityGripPoints(line).map((grip) => grip.id)).toEqual(["start", "mid", "end"]);
    expect(updateEntityByGrip(line, "end", { x: 10, y: 5 })).toEqual({ ...line, end: { x: 10, y: 5 } });
    expect(updateEntityByGrip(line, "mid", { x: 5, y: 3 })).toMatchObject({ id: "l", start: { x: 0, y: 3 }, end: { x: 10, y: 3 } });
    expect(updateEntityByGrip(line, "nope", { x: 0, y: 0 })).toBeNull();
    expect(supportsEntityGrips({ type: "dimension" })).toBe(false);
  });

  it("moves a circle by its center and resizes it by a quadrant", () => {
    const circle = { type: "circle" as const, center: { x: 0, y: 0 }, radius: 5 };

    expect(getEntityGripPoints(circle)).toHaveLength(5);
    expectPoint(getEntityGripPoints(circle)[2]!.point, { x: 0, y: 5 });
    expect(updateEntityByGrip(circle, "q1", { x: 3, y: 4 })!.radius).toBeCloseTo(5, 12);
    expect(updateEntityByGrip(circle, "q0", { x: 8, y: 0 })!.radius).toBe(8);
    expect(updateEntityByGrip(circle, "center", { x: 2, y: 2 })!.center).toEqual({ x: 2, y: 2 });
    expect(updateEntityByGrip(circle, "q0", { x: 0, y: 0 })).toBeNull();
  });

  it("rebuilds an arc through three points when an end or the midpoint moves", () => {
    // Semicírculo superior (y < 0 no mundo com Y para baixo) de raio 10.
    const arc = { type: "arc" as const, center: { x: 0, y: 0 }, radius: 10, startAngle: Math.PI, endAngle: 2 * Math.PI, clockwise: true };
    const grips = getEntityGripPoints(arc);
    const mid = grips.find((grip) => grip.id === "mid")!.point;

    expectPoint(mid, { x: 0, y: -10 });
    const flatter = updateEntityByGrip(arc, "mid", { x: 0, y: -5 })!;
    // Arco por (−10,0), (0,−5), (10,0): raio 12,5 e centro (0, 7,5).
    expect(flatter.radius).toBeCloseTo(12.5, 9);
    expectPoint(flatter.center, { x: 0, y: 7.5 });

    const stretched = updateEntityByGrip(arc, "end", { x: 0, y: 10 })!;
    const newGrips = getEntityGripPoints(stretched);
    const ends = newGrips.filter((grip) => grip.id === "start" || grip.id === "end").map((grip) => grip.point);
    expect(ends.some((point) => Math.hypot(point.x, point.y - 10) < 1e-9)).toBe(true);
    expect(ends.some((point) => Math.hypot(point.x + 10, point.y) < 1e-9)).toBe(true);
    expect(updateEntityByGrip(arc, "mid", { x: 0, y: 0 })).toBeNull();
  });

  it("resizes ellipse axes by quadrants, swapping them when the minor becomes the major", () => {
    const ellipse = { type: "ellipse" as const, center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0 };

    expect(updateEntityByGrip(ellipse, "q0", { x: 25, y: 0 })).toMatchObject({ radiusX: 25, radiusY: 10 });
    const swapped = updateEntityByGrip(ellipse, "q1", { x: 0, y: 30 })!;
    expect(swapped.radiusX).toBe(30);
    expect(swapped.radiusY).toBe(20);
    expect(swapped.rotation).toBeCloseTo(Math.PI / 2, 12);
  });

  it("edits the ends of an elliptical arc and only shows quadrants on the arc", () => {
    const arc = { type: "ellipse" as const, center: { x: 0, y: 0 }, radiusX: 20, radiusY: 10, rotation: 0, startAngle: 0, endAngle: Math.PI / 2 };
    const ids = getEntityGripPoints(arc).map((grip) => grip.id);

    expect(ids).toEqual(["center", "q0", "q1", "start", "end"]);
    const edited = updateEntityByGrip(arc, "end", { x: -20, y: 0 })!;
    expect(edited.endAngle).toBeCloseTo(Math.PI, 9);
    expect(edited.startAngle).toBe(0);
  });

  it("moves polyline vertices and whole segments by their midpoints", () => {
    const polyline = { type: "polyline" as const, closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };

    expect(getEntityGripPoints(polyline).map((grip) => grip.id)).toEqual(["v:0", "v:1", "v:2", "m:0", "m:1"]);
    expect(updateEntityByGrip(polyline, "v:1", { x: 12, y: 1 })!.points[1]).toEqual({ x: 12, y: 1 });
    expect(updateEntityByGrip(polyline, "m:1", { x: 12, y: 5 })!.points).toEqual([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }]);

    const closed = { ...polyline, closed: true };
    expect(getEntityGripPoints(closed).filter((grip) => grip.shape === "segment")).toHaveLength(3);
    expect(updateEntityByGrip(closed, "m:2", { x: 5, y: 3 })!.points).toEqual([{ x: 0, y: -2 }, { x: 10, y: 0 }, { x: 10, y: 8 }]);
  });

  it("keeps rectangles rectangular when corners and edges are dragged", () => {
    const rectangle = { type: "rectangle" as const, x: 0, y: 0, width: 10, height: 5, rotation: Math.PI / 6 };
    const corners = getRectangleCorners(rectangle);
    const target = { x: corners[2]!.x + 1, y: corners[2]!.y + 1 };
    const resized = updateEntityByGrip(rectangle, "c:2", target)!;
    const newCorners = getRectangleCorners(resized);

    // O canto oposto (0) fica fixo e a rotação se mantém.
    expectPoint(newCorners[0]!, corners[0]!);
    expect(resized.rotation).toBe(Math.PI / 6);
    // O canto arrastado fica na projeção do alvo no referencial local.
    const u = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
    expect(resized.width).toBeCloseTo(target.x * u.x + target.y * u.y, 9);

    const flat = { type: "rectangle" as const, x: 0, y: 0, width: 10, height: 5 };
    expect(updateEntityByGrip(flat, "e:3", { x: -2, y: 99 })).toMatchObject({ x: -2, y: 0, width: 12, height: 5 });
    expect(updateEntityByGrip(flat, "c:0", { x: 20, y: 8 })).toMatchObject({ x: 10, y: 5, width: 10, height: 3 });
    expect(updateEntityByGrip(flat, "e:0", { x: 3, y: 5 })).toBeNull();
  });

  it("moves text by its insertion point", () => {
    const text = { type: "text" as const, position: { x: 1, y: 1 }, content: "A", height: 2 };

    expect(getEntityGripPoints(text)).toEqual([{ id: "insert", point: { x: 1, y: 1 }, shape: "square" }]);
    expect(updateEntityByGrip(text, "insert", { x: 4, y: 5 })).toMatchObject({ position: { x: 4, y: 5 }, content: "A" });
  });
});

describe("adding and removing vertices by grip", () => {
  it("adds and removes polyline vertices", () => {
    const polyline = { type: "polyline" as const, closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };

    const fromVertex = addVertexAtGrip(polyline, "v:0", { x: 5, y: -2 })!;
    expect(fromVertex.gripId).toBe("v:1");
    expect(fromVertex.entity.points).toEqual([{ x: 0, y: 0 }, { x: 5, y: -2 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);

    const fromSegment = addVertexAtGrip(polyline, "m:1", { x: 12, y: 5 })!;
    expect(fromSegment.entity.points[2]).toEqual({ x: 12, y: 5 });

    expect(removeVertexAtGrip(polyline, "v:1")!.points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(gripVertexOptions(polyline, "m:0")).toEqual({ canAdd: true, canRemove: false });

    const two = { ...polyline, points: polyline.points.slice(0, 2) };
    expect(removeVertexAtGrip(two, "v:0")).toBeNull();
    expect(gripVertexOptions({ ...polyline, closed: true }, "v:0").canRemove).toBe(false);
  });

  it("adds and removes spline fit points, refitting the curve", () => {
    const fitPoints = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
    const spline = { type: "spline" as const, closed: false, fitPoints, controlPoints: fitPointsToBezierChain(fitPoints, false) };

    const added = addVertexAtGrip(spline, "fit:1", { x: 15, y: 8 })!;
    expect(added.gripId).toBe("fit:2");
    expect(added.entity.fitPoints).toHaveLength(4);
    expectPoint(evaluateBezierChain(added.entity.controlPoints, 2), { x: 15, y: 8 });

    const removed = removeVertexAtGrip(spline, "fit:1")!;
    expect(removed.fitPoints).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    expect(removed.controlPoints).toHaveLength(4);

    // Sem pontos de ajuste (vértices de controle), não há inserção nem remoção.
    const { fitPoints: _fit, ...controlOnly } = spline;
    expect(gripVertexOptions(controlOnly, "cv:3")).toEqual({ canAdd: false, canRemove: false });
    expect(addVertexAtGrip(controlOnly, "cv:3", { x: 0, y: 0 })).toBeNull();
  });
});

function expectPoint(actual: Point2D, expected: Point2D, digits = 9): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}
