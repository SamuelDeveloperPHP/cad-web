import { describe, expect, it } from "vitest";
import { constrainToOrtho } from "./vector";

describe("constrainToOrtho", () => {
  it("trava no eixo horizontal quando o deslocamento X domina", () => {
    expect(constrainToOrtho({ x: 0, y: 0 }, { x: 10, y: 3 })).toEqual({ x: 10, y: 0 });
  });

  it("trava no eixo vertical quando o deslocamento Y domina", () => {
    expect(constrainToOrtho({ x: 0, y: 0 }, { x: 3, y: -10 })).toEqual({ x: 0, y: -10 });
  });

  it("prefere o horizontal no empate (|dx| == |dy|)", () => {
    expect(constrainToOrtho({ x: 2, y: 2 }, { x: 7, y: 7 })).toEqual({ x: 7, y: 2 });
  });

  it("usa o ponto de referencia como origem do eixo", () => {
    expect(constrainToOrtho({ x: 5, y: 5 }, { x: 5.2, y: 20 })).toEqual({ x: 5, y: 20 });
  });
});
