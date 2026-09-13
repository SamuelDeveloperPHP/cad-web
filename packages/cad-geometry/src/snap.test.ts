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
