import type { CadDocument } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { createSvgExportChunks, serializeCadDocumentToSvg } from "./index";

describe("cad-io SVG", () => {
  it("exports current CAD entities as SVG elements", () => {
    const svg = serializeCadDocumentToSvg(createDocument(), {
      precision: 2,
      padding: 0
    });

    expect(svg).toContain("<svg");
    expect(svg).toContain('data-application="CAD-WEB"');
    expect(svg).toContain('viewBox="0 0 20 20"');
    expect(svg).toContain('<line id="line_001"');
    expect(svg).toContain('x2="20"');
    expect(svg).toContain('<rect id="rect_001"');
    expect(svg).toContain('width="4"');
    expect(svg).toContain('<circle id="circle_001"');
    expect(svg).toContain('r="3"');
  });

  it("escapes SVG attributes", () => {
    const svg = serializeCadDocumentToSvg({
      ...createDocument(),
      id: "doc_&_<quote>\""
    });

    expect(svg).toContain('data-document-id="doc_&amp;_&lt;quote&gt;&quot;"');
  });

  it("emits SVG in chunks", () => {
    const chunks = [...createSvgExportChunks(createDocument())];

    expect(chunks[0]?.startsWith("<svg")).toBe(true);
    expect(chunks.at(-1)).toBe("</svg>\n");
    expect(chunks.length).toBeGreaterThan(3);
  });

  it("expands the viewBox for rotated rectangles", () => {
    const svg = serializeCadDocumentToSvg(
      {
        schemaVersion: "1.0.0",
        id: "doc_rotated",
        units: "mm",
        entities: [
          {
            id: "rect_rotated",
            layerId: "default",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            rotation: Math.PI / 4
          }
        ]
      },
      { precision: 3, padding: 0 }
    );

    expect(svg).toContain('viewBox="-7.071 0 14.142 14.142"');
  });
});

function createDocument(): CadDocument {
  return {
    schemaVersion: "1.0.0",
    id: "doc_svg",
    units: "mm",
    entities: [
      {
        id: "line_001",
        layerId: "default",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 20, y: 0 }
      },
      {
        id: "rect_001",
        layerId: "default",
        type: "rectangle",
        x: 2,
        y: 2,
        width: 4,
        height: 6,
        rotation: 0
      },
      {
        id: "circle_001",
        layerId: "default",
        type: "circle",
        center: { x: 10, y: 17 },
        radius: 3
      }
    ]
  };
}
