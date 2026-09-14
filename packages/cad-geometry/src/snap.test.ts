import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNAP_SETTINGS,
  findBestSnap,
  type SnapEntity,
  type SnapSettings,
  type SnapViewport
} from "./index";

const viewport: SnapViewport = {
  origin: { x: 0, y: 0 },
  scale: 10
};

const defaultSettings: SnapSettings = {
  ...DEFAULT_SNAP_SETTINGS,
  tolerancePx: 12
};

describe("cad-geometry object snap", () => {
  it("finds endpoint snap on a line", () => {
    const result = findBestSnap(
      { x: 0.4, y: 0.2 },
      { x: 4, y: 2 },
      [createLine()],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 0, y: 0 });
    expect(result.candidate?.type).toBe("endpoint");
  });

  it("finds midpoint snap on a line", () => {
    const result = findBestSnap(
      { x: 5, y: 0.3 },
      { x: 50, y: 3 },
      [createLine()],
      { ...defaultSettings, endpoint: false },
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 5, y: 0 });
    expect(result.candidate?.type).toBe("midpoint");
  });

  it("finds center snap on a circle", () => {
    const result = findBestSnap(
      { x: 20.2, y: 9.8 },
      { x: 202, y: 98 },
      [{ id: "circle_001", type: "circle", center: { x: 20, y: 10 }, radius: 5 }],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 20, y: 10 });
    expect(result.candidate?.type).toBe("center");
  });

  it("finds endpoint and nearest snaps on an arc", () => {
    const arc: SnapEntity = {
      id: "arc_001",
      type: "arc",
      center: { x: 0, y: 0 },
      radius: 10,
      startAngle: 0,
      endAngle: Math.PI / 2,
      clockwise: true
    };
    const endpointResult = findBestSnap(
      { x: 10.3, y: 0.2 },
      { x: 103, y: 2 },
      [arc],
      defaultSettings,
      viewport
    );
    const nearestResult = findBestSnap(
      { x: 7, y: 8 },
      { x: 70, y: 80 },
      [arc],
      { ...defaultSettings, endpoint: false, midpoint: false, center: false },
      viewport
    );

    expect(endpointResult.snapped).toBe(true);
    expect(endpointResult.candidate?.type).toBe("endpoint");
    expect(endpointResult.point).toEqual({ x: 10, y: 0 });
    expect(nearestResult.snapped).toBe(true);
    expect(nearestResult.candidate?.type).toBe("nearest");
    expect(Math.hypot(nearestResult.point.x, nearestResult.point.y)).toBeCloseTo(10);
  });

  it("finds center snap on a rectangle", () => {
    const result = findBestSnap(
      { x: 5.4, y: 2.6 },
      { x: 54, y: 26 },
      [{ id: "rect_001", type: "rectangle", x: 0, y: 0, width: 10, height: 5 }],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 5, y: 2.5 });
    expect(result.candidate?.type).toBe("center");
  });

  it("finds nearest snap on a line", () => {
    const result = findBestSnap(
      { x: 6, y: 0.6 },
      { x: 60, y: 6 },
      [createLine()],
      { ...defaultSettings, endpoint: false, midpoint: false, center: false },
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 6, y: 0 });
    expect(result.candidate?.type).toBe("nearest");
  });

  it("prioritizes endpoint over a closer nearest candidate", () => {
    const result = findBestSnap(
      { x: 0.5, y: 0.2 },
      { x: 5, y: 2 },
      [createLine()],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 0, y: 0 });
    expect(result.candidate?.type).toBe("endpoint");
  });

  it("finds center and quadrant snaps on a full ellipse", () => {
    const ellipse: SnapEntity = { id: "el_001", type: "ellipse", center: { x: 20, y: 10 }, radiusX: 30, radiusY: 10, rotation: 0 };

    const center = findBestSnap({ x: 20.05, y: 10.03 }, { x: 200.5, y: 100.3 }, [ellipse], defaultSettings, viewport);
    expect(center.candidate?.type).toBe("center");
    expect(center.point).toEqual({ x: 20, y: 10 });

    // Quadrante direito do eixo maior em (50,10).
    const quadrant = findBestSnap({ x: 50.05, y: 10.02 }, { x: 500.5, y: 100.2 }, [ellipse], defaultSettings, viewport);
    expect(quadrant.candidate?.type).toBe("quadrant");
    expect(quadrant.point.x).toBeCloseTo(50, 6);
    expect(quadrant.point.y).toBeCloseTo(10, 6);
  });

  it("finds quadrant snap on a circle", () => {
    const circle: SnapEntity = { id: "c_001", type: "circle", center: { x: 0, y: 0 }, radius: 10 };
    const result = findBestSnap({ x: 0.03, y: 10.05 }, { x: 0.3, y: 100.5 }, [circle], defaultSettings, viewport);

    expect(result.candidate?.type).toBe("quadrant");
    expect(result.point.x).toBeCloseTo(0, 6);
    expect(result.point.y).toBeCloseTo(10, 6);
  });

  it("finds endpoint and midpoint snaps on an elliptical arc", () => {
    // Arco de π/6 a π/3: extremidades e ponto médio fora dos quadrantes.
    const arc: SnapEntity = {
      id: "el_arc",
      type: "ellipse",
      center: { x: 0, y: 0 },
      radiusX: 30,
      radiusY: 10,
      rotation: 0,
      startAngle: Math.PI / 6,
      endAngle: Math.PI / 3
    };

    const startX = 30 * Math.cos(Math.PI / 6);
    const startY = 10 * Math.sin(Math.PI / 6);
    const endpoint = findBestSnap({ x: startX + 0.05, y: startY + 0.02 }, { x: (startX + 0.05) * 10, y: (startY + 0.02) * 10 }, [arc], defaultSettings, viewport);
    expect(endpoint.candidate?.type).toBe("endpoint");
    expect(endpoint.point.x).toBeCloseTo(startX, 6);
    expect(endpoint.point.y).toBeCloseTo(startY, 6);

    const midX = 30 * Math.cos(Math.PI / 4);
    const midY = 10 * Math.sin(Math.PI / 4);
    const mid = findBestSnap({ x: midX + 0.05, y: midY + 0.03 }, { x: (midX + 0.05) * 10, y: (midY + 0.03) * 10 }, [arc], defaultSettings, viewport);
    expect(mid.candidate?.type).toBe("midpoint");
    expect(mid.point.x).toBeCloseTo(midX, 6);
    expect(mid.point.y).toBeCloseTo(midY, 6);
  });

  it("does not offer a quadrant outside an arc's sweep", () => {
    // Arco 0..π/2 no primeiro quadrante: o quadrante esquerdo (-30,0) está fora da varredura.
    const arc: SnapEntity = {
      id: "el_arc2",
      type: "ellipse",
      center: { x: 0, y: 0 },
      radiusX: 30,
      radiusY: 10,
      rotation: 0,
      startAngle: 0,
      endAngle: Math.PI / 2
    };

    const result = findBestSnap(
      { x: -30.05, y: 0.02 },
      { x: -300.5, y: 0.2 },
      [arc],
      { ...defaultSettings, nearest: false },
      viewport
    );

    // Sem quadrante fora da varredura e com nearest desligado, não há snap perto de (-30,0).
    expect(result.snapped).toBe(false);
  });

  it("finds an intersection snap between two crossing lines", () => {
    const lineA: SnapEntity = { id: "la", type: "line", start: { x: -5, y: -5 }, end: { x: 5, y: 5 } };
    const lineB: SnapEntity = { id: "lb", type: "line", start: { x: -5, y: 5 }, end: { x: 5, y: -5 } };

    // As linhas se cruzam em (0,0); só endpoint/intersection/nearest disponíveis, intersection vence perto do cruzamento.
    const result = findBestSnap(
      { x: 0.05, y: 0.03 },
      { x: 0.5, y: 0.3 },
      [lineA, lineB],
      { ...defaultSettings, endpoint: false, midpoint: false },
      viewport
    );

    expect(result.candidate?.type).toBe("intersection");
    expect(result.point.x).toBeCloseTo(0, 6);
    expect(result.point.y).toBeCloseTo(0, 6);
  });

  it("finds an intersection snap between a line and an ellipse", () => {
    const line: SnapEntity = { id: "l", type: "line", start: { x: -40, y: 0 }, end: { x: 40, y: 0 } };
    const ellipse: SnapEntity = { id: "el", type: "ellipse", center: { x: 0, y: 0 }, radiusX: 30, radiusY: 10, rotation: 0 };

    // A linha horizontal cruza a elipse em (±30,0). Perto de (30,0), o snap de interseção vence o nearest.
    const result = findBestSnap(
      { x: 30.05, y: 0.03 },
      { x: 300.5, y: 0.3 },
      [line, ellipse],
      { ...defaultSettings, endpoint: false, midpoint: false, quadrant: false },
      viewport
    );

    expect(result.candidate?.type).toBe("intersection");
    expect(result.point.x).toBeCloseTo(30, 4);
    expect(result.point.y).toBeCloseTo(0, 4);
  });

  it("offers no intersection snap when the entities do not cross", () => {
    const lineA: SnapEntity = { id: "la", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const lineB: SnapEntity = { id: "lb", type: "line", start: { x: 0, y: 5 }, end: { x: 10, y: 5 } };

    const result = findBestSnap(
      { x: 5.05, y: 2.5 },
      { x: 50.5, y: 25 },
      [lineA, lineB],
      { ...defaultSettings, endpoint: false, midpoint: false, center: false, quadrant: false, nearest: false },
      viewport
    );

    expect(result.snapped).toBe(false);
  });

  it("finds a perpendicular snap to a line using the reference point", () => {
    const line: SnapEntity = { id: "l", type: "line", start: { x: -10, y: 0 }, end: { x: 10, y: 0 } };
    // Referência em (3,8); o pé da perpendicular na linha é (3,0). O cursor está perto de (3,0).
    const result = findBestSnap(
      { x: 3.05, y: 0.05 },
      { x: 30.5, y: 0.5 },
      [line],
      { ...defaultSettings, endpoint: false, midpoint: false },
      viewport,
      { x: 3, y: 8 }
    );

    expect(result.candidate?.type).toBe("perpendicular");
    expect(result.point.x).toBeCloseTo(3, 6);
    expect(result.point.y).toBeCloseTo(0, 6);
  });

  it("finds a tangent snap to a circle using the reference point", () => {
    const circle: SnapEntity = { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 };
    // A partir de (10,0), os pontos de tangência são (2.5, ±4.33). Cursor perto do ponto superior.
    const result = findBestSnap(
      { x: 2.55, y: 4.3 },
      { x: 25.5, y: 43 },
      [circle],
      { ...defaultSettings, endpoint: false, midpoint: false, quadrant: false, nearest: false },
      viewport,
      { x: 10, y: 0 }
    );

    expect(result.candidate?.type).toBe("tangent");
    expect(result.point.x).toBeCloseTo(2.5, 4);
    expect(result.point.y).toBeCloseTo(Math.sqrt(75) / 2, 4);
  });

  it("offers no perpendicular or tangent without a reference point", () => {
    const line: SnapEntity = { id: "l", type: "line", start: { x: -10, y: 0 }, end: { x: 10, y: 0 } };
    const result = findBestSnap(
      { x: 3.05, y: 0.05 },
      { x: 30.5, y: 0.5 },
      [line],
      { ...defaultSettings, endpoint: false, midpoint: false, nearest: false },
      viewport
    );

    expect(result.snapped).toBe(false);
  });

  it("does not crash when a dimension entity is among the candidates", () => {
    // A cota chega como SnapEntity via cast em runtime; não deve gerar primitiva de interseção/perp/tangente.
    const line: SnapEntity = { id: "l", type: "line", start: { x: -10, y: 0 }, end: { x: 10, y: 0 } };
    const dimension = {
      id: "d",
      type: "dimension",
      dimensionType: "linear",
      definition: { firstPoint: { x: 0, y: 0 }, secondPoint: { x: 10, y: 0 }, dimensionLinePoint: { x: 5, y: 5 }, orientation: "horizontal" }
    } as unknown as SnapEntity;

    // Com interseção, perpendicular e tangente ativos e um ponto de referência, não pode lançar.
    expect(() =>
      findBestSnap(
        { x: 3, y: 0.1 },
        { x: 30, y: 1 },
        [line, dimension],
        defaultSettings,
        viewport,
        { x: 3, y: 8 }
      )
    ).not.toThrow();
  });

  it("returns raw point when snap is disabled", () => {
    const rawPoint = { x: 0.4, y: 0.2 };
    const result = findBestSnap(
      rawPoint,
      { x: 4, y: 2 },
      [createLine()],
      { ...defaultSettings, enabled: false },
      viewport
    );

    expect(result).toEqual({
      snapped: false,
      point: rawPoint,
      rawPoint
    });
  });
});

function createLine(): SnapEntity {
  return {
    id: "line_001",
    type: "line",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 }
  };
}
