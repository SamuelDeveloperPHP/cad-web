import { createEmptyDocument, type CadDocument } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { CadIoValidationError, createSvgExportChunks, parseSvgDocument, serializeCadDocumentToSvg } from "./index";

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

  it("exports open polylines as <polyline> and closed polylines as <polygon>", () => {
    const svg = serializeCadDocumentToSvg(
      {
        ...createEmptyDocument("doc_polyline_svg"),
        entities: [
          {
            id: "pl_open",
            layerId: "layer_0",
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 5 }
            ],
            closed: false
          },
          {
            id: "pl_closed",
            layerId: "layer_0",
            type: "polyline",
            points: [
              { x: 10, y: 0 },
              { x: 15, y: 0 },
              { x: 15, y: 5 }
            ],
            closed: true
          }
        ]
      },
      { precision: 2, padding: 0 }
    );

    expect(svg).toContain('<polyline id="pl_open"');
    expect(svg).toContain('points="0,0 5,0 5,5"');
    expect(svg).toContain('<polygon id="pl_closed"');
  });

  it("imports SVG <polyline> as open polyline and <polygon> as closed polyline", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
      <polyline id="pl_a" data-layer-id="layer_0" points="0,0 5,0 5,5" />
      <polygon id="pl_b" data-layer-id="layer_0" points="10,0 15,0 15,5" />
    </svg>`;

    const document = parseSvgDocument(source);
    const polylines = document.entities.filter((entity) => entity.type === "polyline");

    expect(polylines).toHaveLength(2);

    const open = polylines.find((entity) => entity.id === "pl_a") as any;
    const closed = polylines.find((entity) => entity.id === "pl_b") as any;

    expect(open.closed).toBe(false);
    expect(open.points).toHaveLength(3);
    expect(open.points[0]).toEqual({ x: 0, y: 0 });

    expect(closed.closed).toBe(true);
    expect(closed.points).toHaveLength(3);
  });

  it("exports arc entities as SVG path arcs", () => {
    const svg = serializeCadDocumentToSvg(
      {
        ...createEmptyDocument("doc_arc_svg"),
        entities: [
          {
            id: "arc_001",
            layerId: "layer_0",
            type: "arc",
            center: { x: 0, y: 0 },
            radius: 10,
            startAngle: 0,
            endAngle: Math.PI / 2,
            clockwise: true
          }
        ]
      },
      { precision: 2, padding: 0 }
    );

    expect(svg).toContain('<path id="arc_001"');
    expect(svg).toContain('data-entity-type="arc"');
    expect(svg).toContain('A 10 10 0 0 1 0 10');
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
    layers: [{ id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }],
    activeLayerId: "layer_0",
    entities: [
          {
            id: "rect_rotated",
            layerId: "layer_0",
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

  it("imports line, rect and circle from SVG", () => {
    const document = parseSvgDocument(`
      <svg data-document-id="imported_svg">
        <line id="line_a" data-layer-id="steel" x1="0" y1="1" x2="10" y2="11" />
        <rect id="rect_a" x="2" y="3" width="4" height="5" />
        <circle id="circle_a" cx="7" cy="8" r="9" />
      </svg>
    `);

    expect(document).toEqual({
      ...createEmptyDocument("imported_svg"),
      schemaVersion: "1.0.0",
      id: "imported_svg",
      units: "mm",
      layers: [
        { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
        
      ],
      activeLayerId: "layer_0",
      entities: [
        {
          id: "line_a",
          layerId: "steel",
          type: "line",
          start: { x: 0, y: 1 },
          end: { x: 10, y: 11 }
        },
        {
          id: "rect_a",
          layerId: "layer_0",
          type: "rectangle",
          x: 2,
          y: 3,
          width: 4,
          height: 5,
          rotation: 0
        },
        {
          id: "circle_a",
          layerId: "layer_0",
          type: "circle",
          center: { x: 7, y: 8 },
          radius: 9
        }
      ]
    });
  });

  it("imports CAD-WEB rotated rectangles when rotation uses the rectangle origin", () => {
    const document = parseSvgDocument(`
      <svg>
        <rect id="rect_rotated" x="2" y="3" width="4" height="5" transform="rotate(90 2 3)" />
      </svg>
    `);

    expect(document.entities[0]).toMatchObject({
      id: "rect_rotated",
      type: "rectangle",
      rotation: Math.PI / 2
    });
  });

  it("ignores scripts, event attributes and external links while importing SVG", () => {
    const document = parseSvgDocument(`
      <svg>
        <script><line id="bad_script" x1="0" y1="0" x2="1" y2="1" /></script>
        <line id="safe_line" onclick="alert(1)" href="https://example.com" x1="1" y1="2" x2="3" y2="4" />
        <path id="unsupported" d="M0 0 L10 10" />
      </svg>
    `);

    expect(document.entities).toHaveLength(1);
    expect(document.entities[0]).toMatchObject({
      id: "safe_line",
      type: "line",
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 }
    });
  });

  it("rejects non-SVG sources", () => {
    expect(() => parseSvgDocument("<line x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\" />")).toThrow(CadIoValidationError);
  });
});

function createDocument(): CadDocument {
  return {
    ...createEmptyDocument("doc_svg"),
    schemaVersion: "1.0.0",
    id: "doc_svg",
    units: "mm",
    layers: [{ id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 }],
    activeLayerId: "layer_0",
    entities: [
      {
        id: "line_001",
        layerId: "layer_0",
        type: "line",
        start: { x: 0, y: 0 },
        end: { x: 20, y: 0 }
      },
      {
        id: "rect_001",
        layerId: "layer_0",
        type: "rectangle",
        x: 2,
        y: 2,
        width: 4,
        height: 6,
        rotation: 0
      },
      {
        id: "circle_001",
        layerId: "layer_0",
        type: "circle",
        center: { x: 10, y: 17 },
        radius: 3
      }
    ]
  };
}
