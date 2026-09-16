import { describe, expect, it } from "vitest";
import { parseDirectInput, resolveDirectInput } from "../src/draw/directInput";

describe("parseDirectInput", () => {
  it("parses a simple positive number as distance", () => {
    expect(parseDirectInput("10")).toEqual({ kind: "distance", value: 10 });
    expect(parseDirectInput("3.5")).toEqual({ kind: "distance", value: 3.5 });
    expect(parseDirectInput("  7  ")).toEqual({ kind: "distance", value: 7 });
  });

  it("parses absolute coordinates with comma", () => {
    expect(parseDirectInput("10,20")).toEqual({ kind: "absolute", point: { x: 10, y: 20 } });
    expect(parseDirectInput("-5,3.5")).toEqual({ kind: "absolute", point: { x: -5, y: 3.5 } });
    expect(parseDirectInput("0,0")).toEqual({ kind: "absolute", point: { x: 0, y: 0 } });
  });

  it("parses absolute coordinates with semicolon", () => {
    expect(parseDirectInput("10;20")).toEqual({ kind: "absolute", point: { x: 10, y: 20 } });
  });

  it("parses relative coordinates", () => {
    expect(parseDirectInput("@10,20")).toEqual({ kind: "relative", offset: { x: 10, y: 20 } });
    expect(parseDirectInput("@-5,3")).toEqual({ kind: "relative", offset: { x: -5, y: 3 } });
  });

  it("parses polar input", () => {
    expect(parseDirectInput("@10<45")).toEqual({ kind: "polar", distance: 10, angleDeg: 45 });
    expect(parseDirectInput("@5<90")).toEqual({ kind: "polar", distance: 5, angleDeg: 90 });
    expect(parseDirectInput("@3.5<-30")).toEqual({ kind: "polar", distance: 3.5, angleDeg: -30 });
  });

  it("returns empty for blank input", () => {
    expect(parseDirectInput("")).toEqual({ kind: "empty" });
    expect(parseDirectInput("   ")).toEqual({ kind: "empty" });
  });

  it("returns invalid for non-numeric input", () => {
    expect(parseDirectInput("abc")).toEqual({ kind: "invalid" });
    expect(parseDirectInput("@abc")).toEqual({ kind: "invalid" });
  });

  it("returns invalid for zero or negative distance", () => {
    expect(parseDirectInput("0")).toEqual({ kind: "invalid" });
    expect(parseDirectInput("-5")).toEqual({ kind: "invalid" });
  });

  it("returns invalid for polar with zero distance", () => {
    expect(parseDirectInput("@0<45")).toEqual({ kind: "invalid" });
  });
});

describe("resolveDirectInput", () => {
  const origin = { x: 0, y: 0 };
  const ref = { x: 10, y: 0 };

  it("resolves distance in cursor direction", () => {
    const result = resolveDirectInput(
      { kind: "distance", value: 5 },
      origin,
      { x: 1, y: 0 }
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(5);
    expect(result!.y).toBeCloseTo(0);
  });

  it("resolves distance in diagonal direction", () => {
    const result = resolveDirectInput(
      { kind: "distance", value: 10 },
      origin,
      { x: 1, y: 1 }
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(10 / Math.SQRT2);
    expect(result!.y).toBeCloseTo(10 / Math.SQRT2);
  });

  it("returns null for distance without cursor direction", () => {
    const result = resolveDirectInput(
      { kind: "distance", value: 5 },
      origin,
      null
    );
    expect(result).toBeNull();
  });

  it("resolves absolute point directly", () => {
    const result = resolveDirectInput(
      { kind: "absolute", point: { x: 15, y: 25 } },
      ref,
      { x: 1, y: 0 }
    );
    expect(result).toEqual({ x: 15, y: 25 });
  });

  it("resolves relative offset from reference", () => {
    const result = resolveDirectInput(
      { kind: "relative", offset: { x: 5, y: -3 } },
      ref,
      null
    );
    expect(result).toEqual({ x: 15, y: -3 });
  });

  it("resolves polar from reference", () => {
    const result = resolveDirectInput(
      { kind: "polar", distance: 10, angleDeg: 90 },
      origin,
      null
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(0);
    expect(result!.y).toBeCloseTo(10);
  });

  it("resolves polar at 0 degrees", () => {
    const result = resolveDirectInput(
      { kind: "polar", distance: 5, angleDeg: 0 },
      ref,
      null
    );
    expect(result).not.toBeNull();
    expect(result!.x).toBeCloseTo(15);
    expect(result!.y).toBeCloseTo(0);
  });

  it("returns null for empty and invalid kinds", () => {
    expect(resolveDirectInput({ kind: "empty" }, origin, null)).toBeNull();
    expect(resolveDirectInput({ kind: "invalid" }, origin, null)).toBeNull();
  });

  describe("unitScale (unidade de trabalho)", () => {
    it("escala a distância pela unitScale", () => {
      const result = resolveDirectInput({ kind: "distance", value: 5 }, origin, { x: 1, y: 0 }, 1000);
      expect(result!.x).toBeCloseTo(5000);
      expect(result!.y).toBeCloseTo(0);
    });

    it("escala coordenadas absolutas pela unitScale", () => {
      const result = resolveDirectInput({ kind: "absolute", point: { x: 10, y: 20 } }, origin, null, 1000);
      expect(result).toEqual({ x: 10000, y: 20000 });
    });

    it("escala offset relativo pela unitScale", () => {
      const result = resolveDirectInput({ kind: "relative", offset: { x: 2, y: 1 } }, origin, null, 25.4);
      expect(result!.x).toBeCloseTo(50.8);
      expect(result!.y).toBeCloseTo(25.4);
    });

    it("escala a distância polar mas preserva o ângulo", () => {
      const result = resolveDirectInput({ kind: "polar", distance: 10, angleDeg: 90 }, origin, null, 1000);
      expect(result!.x).toBeCloseTo(0);
      expect(result!.y).toBeCloseTo(10000);
    });
  });
});
