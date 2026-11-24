import type { ArcEntity, CadDocument, CadEntity, Point2D } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { parseDxfDocument, serializeCadDocumentToDxf } from "./index";

const EMPTY_DXF = "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n";

function roundTrip(entities: ReadonlyArray<CadEntity>): CadDocument {
  const base = parseDxfDocument(EMPTY_DXF);
  const doc: CadDocument = { ...base, entities };
  return parseDxfDocument(serializeCadDocumentToDxf(doc));
}

function near(point: Point2D, x: number, y: number, digits = 6): void {
  expect(point.x).toBeCloseTo(x, digits);
  expect(point.y).toBeCloseTo(y, digits);
}

// Amostra pontos ao longo do arco na mesma convencao do renderer
// (context.arc(cx,cy,r,start,end,!clockwise)): anticlockwise=false => angulo crescente.
function arcPoints(arc: ArcEntity, n: number): ReadonlyArray<Point2D> {
  const increasing = arc.clockwise;
  let sweep = arc.endAngle - arc.startAngle;
  if (increasing) {
    while (sweep <= 0) sweep += Math.PI * 2;
  } else {
    while (sweep >= 0) sweep -= Math.PI * 2;
  }
  const points: Point2D[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = arc.startAngle + sweep * (i / n);
    points.push({ x: arc.center.x + arc.radius * Math.cos(a), y: arc.center.y + arc.radius * Math.sin(a) });
  }
  return points;
}

function sortPoints(points: ReadonlyArray<Point2D>): ReadonlyArray<Point2D> {
  return [...points].sort((a, b) => a.x - b.x || a.y - b.y);
}

describe("serializeCadDocumentToDxf (round-trip)", () => {
  it("preserva linha, circulo e texto com Y invertido", () => {
    const doc = roundTrip([
      { id: "l1", layerId: "0", type: "line", start: { x: 1, y: 2 }, end: { x: 4, y: 6 } },
      { id: "c1", layerId: "0", type: "circle", center: { x: 5, y: -3 }, radius: 3 },
      { id: "t1", layerId: "0", type: "text", position: { x: 2, y: 7 }, content: "ABC", height: 2.5 }
    ]);

    const line = doc.entities.find((e) => e.type === "line");
    expect(line).toBeDefined();
    if (line?.type === "line") {
      near(line.start, 1, 2);
      near(line.end, 4, 6);
    }

    const circle = doc.entities.find((e) => e.type === "circle");
    expect(circle).toBeDefined();
    if (circle?.type === "circle") {
      near(circle.center, 5, -3);
      expect(circle.radius).toBeCloseTo(3, 6);
    }

    const text = doc.entities.find((e) => e.type === "text");
    expect(text).toBeDefined();
    if (text?.type === "text") {
      expect(text.content).toBe("ABC");
      near(text.position, 2, 7, 4);
      expect(text.height).toBeCloseTo(2.5, 6);
    }
  });

  it("preserva a geometria do arco (horario e anti-horario)", () => {
    for (const clockwise of [false, true]) {
      const original: ArcEntity = {
        id: "a1",
        layerId: "0",
        type: "arc",
        center: { x: 2, y: -1 },
        radius: 5,
        startAngle: 0.3,
        endAngle: 1.9,
        clockwise
      };
      const doc = roundTrip([original]);
      const arc = doc.entities.find((e) => e.type === "arc");
      expect(arc).toBeDefined();
      if (arc?.type === "arc") {
        expect(arc.center.x).toBeCloseTo(2, 6);
        expect(arc.center.y).toBeCloseTo(-1, 6);
        expect(arc.radius).toBeCloseTo(5, 6);
        // Os conjuntos de pontos amostrados devem coincidir (independe da direcao/parametrizacao).
        const a = sortPoints(arcPoints(original, 16));
        const b = sortPoints(arcPoints(arc, 16));
        expect(b.length).toBe(a.length);
        for (let i = 0; i < a.length; i += 1) {
          near(b[i]!, a[i]!.x, a[i]!.y, 5);
        }
      }
    }
  });

  it("exporta retangulo e polyline como POLYLINE fechada/aberta", () => {
    const doc = roundTrip([
      { id: "r1", layerId: "0", type: "rectangle", x: 0, y: 0, width: 10, height: 4 },
      { id: "p1", layerId: "0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 6, y: -2 }], closed: false }
    ]);

    const polylines = doc.entities.filter((e) => e.type === "polyline");
    expect(polylines.length).toBe(2);

    const open = polylines.find((e) => e.type === "polyline" && !e.closed);
    expect(open).toBeDefined();
    if (open?.type === "polyline") {
      expect(open.points.length).toBe(3);
      near(open.points[0]!, 0, 0);
      near(open.points[2]!, 6, -2);
    }

    const closed = polylines.find((e) => e.type === "polyline" && e.closed);
    expect(closed).toBeDefined();
    if (closed?.type === "polyline") {
      expect(closed.points.length).toBe(4);
      const xs = sortPoints(closed.points);
      near(xs[0]!, 0, 0);
      near(xs[3]!, 10, 4);
    }
  });
});
