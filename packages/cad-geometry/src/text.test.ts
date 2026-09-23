import { describe, expect, it } from "vitest";
import {
  TEXT_ASCENT_RATIO,
  TEXT_CHAR_WIDTH_RATIO,
  TEXT_DESCENT_RATIO,
  TEXT_LINE_SPACING_RATIO,
  distancePointToText,
  estimateTextLineWidth,
  splitTextLines,
  textBoundingBox,
  textLayout,
  textLineAdvance
} from "./text";

describe("text geometry", () => {
  it("splits content on \\n and \\r\\n", () => {
    expect(splitTextLines("A\nB\r\nC")).toEqual(["A", "B", "C"]);
    expect(splitTextLines("")).toEqual([""]);
  });

  it("estimates line width by code points", () => {
    expect(estimateTextLineWidth("ABCD", 10)).toBeCloseTo(4 * TEXT_CHAR_WIDTH_RATIO * 10);
    // Caracteres acentuados/emoji contam como um code point cada.
    expect(estimateTextLineWidth("çã", 10)).toBeCloseTo(2 * TEXT_CHAR_WIDTH_RATIO * 10);
  });

  it("anchors a left/baseline single line at the insertion point (Y grows downward)", () => {
    const box = textBoundingBox({ position: { x: 10, y: 20 }, content: "ABCD", height: 10 });
    const width = 4 * TEXT_CHAR_WIDTH_RATIO * 10;

    expect(box.minX).toBeCloseTo(10);
    expect(box.maxX).toBeCloseTo(10 + width);
    // "Cima" do texto é -Y: o ascendente fica acima (Y menor) e o descendente abaixo (Y maior).
    expect(box.minY).toBeCloseTo(20 - TEXT_ASCENT_RATIO * 10);
    expect(box.maxY).toBeCloseTo(20 + TEXT_DESCENT_RATIO * 10);
  });

  it("centers horizontally and vertically with center/middle alignment", () => {
    const box = textBoundingBox({
      position: { x: 0, y: 0 },
      content: "AB",
      height: 10,
      horizontalAlign: "center",
      verticalAlign: "middle"
    });

    expect((box.minX + box.maxX) / 2).toBeCloseTo(0);
    expect((box.minY + box.maxY) / 2).toBeCloseTo(0);
  });

  it("places the top of the first line at the point with top alignment", () => {
    const box = textBoundingBox({ position: { x: 0, y: 0 }, content: "AB", height: 10, verticalAlign: "top" });

    expect(box.minY).toBeCloseTo(0);
    expect(box.maxY).toBeCloseTo(10 * (TEXT_ASCENT_RATIO + TEXT_DESCENT_RATIO));
  });

  it("places the bottom of the last line at the point with bottom/right alignment", () => {
    const box = textBoundingBox({
      position: { x: 0, y: 0 },
      content: "AB\nCD",
      height: 10,
      horizontalAlign: "right",
      verticalAlign: "bottom"
    });

    expect(box.maxX).toBeCloseTo(0);
    expect(box.maxY).toBeCloseTo(0);
  });

  it("stacks multiple lines downward on screen", () => {
    const layout = textLayout({ position: { x: 0, y: 0 }, content: "L1\nL2\nL3", height: 10 });

    expect(layout.lines).toHaveLength(3);
    expect(layout.lines[0]?.origin).toEqual({ x: 0, y: 0 });
    expect(layout.lines[1]?.origin.y).toBeCloseTo(TEXT_LINE_SPACING_RATIO * 10);
    expect(layout.lines[2]?.origin.y).toBeCloseTo(2 * TEXT_LINE_SPACING_RATIO * 10);
  });

  it("rotates the layout around the insertion point", () => {
    // Rotação de -90° no mundo (Y para baixo) = texto subindo na tela.
    const layout = textLayout({ position: { x: 5, y: 5 }, content: "AB", height: 10, rotation: -Math.PI / 2 });

    expect(layout.direction.x).toBeCloseTo(0);
    expect(layout.direction.y).toBeCloseTo(-1);
    // O "cima" do texto aponta para -X; o descendente fica em +X.
    expect(layout.corners[1].x).toBeCloseTo(5 + TEXT_DESCENT_RATIO * 10);
    expect(layout.corners[1].y).toBeCloseTo(5 - 2 * TEXT_CHAR_WIDTH_RATIO * 10);
  });

  it("advances to the next line below the current one", () => {
    const advance = textLineAdvance(10, 0);

    expect(advance.x).toBeCloseTo(0);
    expect(advance.y).toBeCloseTo(TEXT_LINE_SPACING_RATIO * 10);
  });

  it("returns zero distance inside the text box and the gap outside", () => {
    const text = { position: { x: 0, y: 0 }, content: "ABCD", height: 10 };

    expect(distancePointToText({ x: 5, y: -3 }, text)).toBe(0);
    expect(distancePointToText({ x: -4, y: -3 }, text)).toBeCloseTo(4);
    expect(distancePointToText({ x: 5, y: 2 + 3 }, text)).toBeCloseTo(3);
  });

  it("measures distance in the rotated frame", () => {
    const text = { position: { x: 0, y: 0 }, content: "ABCD", height: 10, rotation: Math.PI / 2 };

    // Com rotação de 90° a leitura segue +Y do mundo; um ponto em (3, 5) cai dentro das letras.
    expect(distancePointToText({ x: 3, y: 5 }, text)).toBe(0);
    expect(distancePointToText({ x: 3, y: -4 }, text)).toBeCloseTo(4);
  });
});
