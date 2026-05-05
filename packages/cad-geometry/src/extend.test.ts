import { describe, expect, it } from "vitest";
import {
  buildExtendPreview,
  extendLineToPoint,
  findLineEndpointNearPoint,
  findNearestExtendCandidate,
  getExtendCandidates,
  lineCircleIntersectionsExtended,
  lineLineIntersectionInfiniteWithSegmentBoundary
} from "./extend";
import { point } from "./vector";

describe("extend geometry", () => {
  it("finds an infinite target line intersection with a segment boundary", () => {
    const result = lineLineIntersectionInfiniteWithSegmentBoundary(
      { type: "line", start: point(0, 0), end: point(10, 0) },
      { type: "line", start: point(20, -5), end: point(20, 5) }
    );

    expect(result?.point).toEqual({ x: 20, y: 0 });
    expect(result?.targetParameter).toBeCloseTo(2);
    expect(result?.boundaryParameter).toBeCloseTo(0.5);
  });

  it("finds line-circle intersections on the extended target line", () => {
    const result = lineCircleIntersectionsExtended(
      { type: "line", start: point(0, 0), end: point(10, 0) },
      { type: "circle", center: point(20, 0), radius: 2 }
    );

    expect(result.map((intersection) => intersection.targetParameter)).toEqual([1.8, 2.2]);
  });

  it("chooses the nearest end extension candidate for line boundaries", () => {
    const target = { id: "target", type: "line" as const, start: point(0, 0), end: point(10, 0) };
    const candidates = getExtendCandidates(target, [
      { id: "far", type: "line", start: point(30, -5), end: point(30, 5) },
      { id: "near", type: "line", start: point(20, -5), end: point(20, 5) }
    ], "end");

    expect(findNearestExtendCandidate(candidates)).toMatchObject({
      point: { x: 20, y: 0 },
      boundaryId: "near",
      extensionDistance: 10
    });
  });

  it("chooses the nearest start extension candidate", () => {
    const candidate = findNearestExtendCandidate(getExtendCandidates(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "left", type: "line", start: point(-5, -5), end: point(-5, 5) }],
      "start"
    ));

    expect(candidate).toMatchObject({
      point: { x: -5, y: 0 },
      extensionDistance: 5
    });
  });

  it("uses rectangle edges as extension boundaries", () => {
    const candidate = findNearestExtendCandidate(getExtendCandidates(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "rect", type: "rectangle", x: 15, y: -2, width: 4, height: 4 }],
      "end"
    ));

    expect(candidate).toMatchObject({
      point: { x: 15, y: 0 },
      boundaryType: "rectangle",
      boundaryId: "rect"
    });
  });

  it("uses the nearest circle intersection in the extension direction", () => {
    const candidate = findNearestExtendCandidate(getExtendCandidates(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "circle", type: "circle", center: point(20, 0), radius: 2 }],
      "end"
    ));

    expect(candidate).toMatchObject({
      point: { x: 18, y: 0 },
      boundaryType: "circle"
    });
  });

  it("ignores intersections inside the original target segment", () => {
    const candidates = getExtendCandidates(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "inside", type: "line", start: point(5, -5), end: point(5, 5) }],
      "end"
    );

    expect(candidates).toEqual([]);
  });

  it("detects the endpoint near the picked point", () => {
    expect(findLineEndpointNearPoint(
      { type: "line", start: point(0, 0), end: point(10, 0) },
      point(9.8, 0.2),
      1
    )).toMatchObject({
      endpoint: "end",
      point: { x: 10, y: 0 }
    });
  });

  it("extends a line and builds the preview segment", () => {
    const target = { id: "target", type: "line" as const, start: point(0, 0), end: point(10, 0) };
    const candidate = findNearestExtendCandidate(getExtendCandidates(
      target,
      [{ id: "boundary", type: "line", start: point(15, -5), end: point(15, 5) }],
      "end"
    ));

    expect(candidate).not.toBeNull();
    expect(extendLineToPoint(target, "end", candidate!.point)).toMatchObject({ end: { x: 15, y: 0 } });
    expect(buildExtendPreview(target, candidate!)).toMatchObject({
      start: { x: 10, y: 0 },
      end: { x: 15, y: 0 }
    });
  });
});
