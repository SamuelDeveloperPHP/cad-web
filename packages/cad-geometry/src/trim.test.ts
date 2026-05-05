import { describe, expect, it } from "vitest";
import {
  getLineCutParameters,
  lineCircleIntersections,
  lineLineIntersection,
  rectangleEdgesAsLines,
  splitLineByParameters,
  trimLineByClick
} from "./trim";
import { point } from "./vector";

describe("trim geometry", () => {
  it("finds a line-line intersection with target and cutting parameters", () => {
    const result = lineLineIntersection(
      { type: "line", start: point(0, 0), end: point(10, 0) },
      { type: "line", start: point(5, -5), end: point(5, 5) }
    );

    expect(result?.point).toEqual({ x: 5, y: 0 });
    expect(result?.targetParameter).toBeCloseTo(0.5);
    expect(result?.cuttingParameter).toBeCloseTo(0.5);
  });

  it("finds two line-circle intersections on a target segment", () => {
    const result = lineCircleIntersections(
      { type: "line", start: point(0, 0), end: point(10, 0) },
      { type: "circle", center: point(5, 0), radius: 2 }
    );

    expect(result.map((intersection) => intersection.targetParameter)).toEqual([0.3, 0.7]);
  });

  it("converts rectangles to four cutting edges", () => {
    const result = rectangleEdgesAsLines({ id: "rect_001", type: "rectangle", x: 0, y: 0, width: 10, height: 5 });

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ id: "rect_001_edge_0", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
  });

  it("splits a line by sorted unique cut parameters", () => {
    const result = splitLineByParameters(
      { type: "line", start: point(0, 0), end: point(10, 0) },
      [0.7, 0.3, 0.3]
    );

    expect(result.map((segment) => [segment.fromParameter, segment.toParameter])).toEqual([
      [0, 0.3],
      [0.3, 0.7],
      [0.7, 1]
    ]);
  });

  it("trims the picked side of a line with a single cutting line", () => {
    const result = trimLineByClick(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "cut", type: "line", start: point(4, -5), end: point(4, 5) }],
      point(2, 0),
      0.5
    );

    expect(result.removedSegment).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 4, y: 0 } });
    expect(result.resultLines).toHaveLength(1);
    expect(result.resultLines[0]).toMatchObject({ start: { x: 4, y: 0 }, end: { x: 10, y: 0 } });
  });

  it("trims the middle segment cut by rectangle edges", () => {
    const result = trimLineByClick(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "rect", type: "rectangle", x: 3, y: -1, width: 4, height: 2 }],
      point(5, 0),
      0.5
    );

    expect(result.cutParameters).toEqual([0.3, 0.7]);
    expect(result.resultLines).toHaveLength(2);
  });

  it("trims the middle segment cut by a circle", () => {
    const result = trimLineByClick(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "circle", type: "circle", center: point(5, 0), radius: 2 }],
      point(5, 0),
      0.5
    );

    expect(result.cutParameters).toEqual([0.3, 0.7]);
    expect(result.removedSegment).toMatchObject({ start: { x: 3, y: 0 }, end: { x: 7, y: 0 } });
  });

  it("returns a warning when no cutting parameter reaches the line", () => {
    const result = trimLineByClick(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "cut", type: "line", start: point(20, -5), end: point(20, 5) }],
      point(2, 0),
      0.5
    );

    expect(result.removedSegment).toBeNull();
    expect(result.warnings).toContain("No valid cutting edge found.");
  });

  it("deduplicates repeated parameters from overlapping rectangle corners", () => {
    const result = getLineCutParameters(
      { id: "target", type: "line", start: point(0, 0), end: point(10, 0) },
      [{ id: "rect", type: "rectangle", x: 5, y: 0, width: 2, height: 2 }]
    );

    expect(result).toEqual([0.5, 0.7]);
  });
});
