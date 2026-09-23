import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { arcSweepAngle, ellipsePointAtParam, normalizeEllipseSweep } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { parseSvgDocument, serializeCadDocumentToSvg } from "./index";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">${body}</svg>`;

function fullDocument(): CadDocument {
  const base = createEmptyDocument("doc_roundtrip");
  const entities: CadEntity[] = [
    { id: "l1", layerId: "walls", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, color: "#ff0000", lineType: "dashed", lineThickness: 2 },
    { id: "r1", layerId: "walls", type: "rectangle", x: 10, y: 10, width: 30, height: 20, rotation: 0.3 },
    { id: "c1", layerId: "layer_0", type: "circle", center: { x: 50, y: 50 }, radius: 12.345678901 },
    { id: "a1", layerId: "layer_0", type: "arc", center: { x: 0, y: 0 }, radius: 10, startAngle: 0.1, endAngle: 2, clockwise: true },
    { id: "a2", layerId: "layer_0", type: "arc", center: { x: 5, y: 5 }, radius: 7, startAngle: 2, endAngle: -1, clockwise: false },
    { id: "e1", layerId: "layer_0", type: "ellipse", center: { x: 80, y: 40 }, radiusX: 30, radiusY: 10, rotation: 0.7 },
    { id: "e2", layerId: "layer_0", type: "ellipse", center: { x: -20, y: 40 }, radiusX: 25, radiusY: 8, rotation: -0.4, startAngle: 0.5, endAngle: 4 },
    { id: "p1", layerId: "layer_0", type: "polyline", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 1 }], closed: true, lineType: "dotted" },
    {
      id: "d1", layerId: "dims", type: "dimension", dimensionType: "linear", dimensionStyleId: "dimstyle_custom",
      definition: { firstPoint: { x: 0, y: 0 }, secondPoint: { x: 100, y: 0 }, dimensionLinePoint: { x: 50, y: -15 }, orientation: "horizontal" },
      styleOverride: { arrowType: "open" }, textOverride: "<>*"
    },
    { id: "d2", layerId: "dims", type: "dimension", dimensionType: "radius", definition: { targetEntityId: "c1", center: { x: 50, y: 50 }, radius: 12.345678901, leaderEndPoint: { x: 70, y: 60 } } },
    { id: "d3", layerId: "dims", type: "dimension", dimensionType: "angular", definition: { vertex: { x: 0, y: 0 }, firstPoint: { x: 10, y: 0 }, secondPoint: { x: 0, y: 10 }, arcPoint: { x: 7, y: 7 } } },
    { id: "s1", layerId: "layer_0", type: "spline", closed: false, fitPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], controlPoints: [{ x: 0, y: 0 }, { x: 2.5, y: 5 }, { x: 5.8, y: 10 }, { x: 10, y: 10 }, { x: 14.2, y: 10 }, { x: 17.5, y: 5 }, { x: 20, y: 0 }], color: "#00ff00" },
    { id: "t1", layerId: "layer_0", type: "text", position: { x: 1, y: 2 }, content: "A & B <c>\n\"aspas\" 'simples'", height: 3.5, rotation: 0.2, bold: true }
  ];

  return {
    ...base,
    displayUnit: "m",
    layers: [
      { id: "layer_0", name: "Layer 0", color: "#ffffff", visible: true, locked: false, order: 0 },
      { id: "walls", name: "Paredes & Muros", color: "#ff8800", visible: true, locked: true, order: 1 },
      { id: "dims", name: "Cotas", color: "#00ffff", visible: false, locked: false, opacity: 0.5, order: 2 }
    ],
    activeLayerId: "walls",
    dimensionStyles: [
      ...base.dimensionStyles,
      { id: "dimstyle_custom", name: "Custom", textHeight: 2.5, arrowSize: 1.5, extensionOffset: 1, extensionOvershoot: 1, precision: 1, unitSuffix: " m", arrowType: "dot", scale: 100 }
    ],
    activeDimensionStyleId: "dimstyle_custom",
    entities
  };
}

describe("SVG import — CAD-WEB round trip", () => {
  it("restores every entity type, layer, dimension style and unit exactly", () => {
    const document = fullDocument();
    const imported = parseSvgDocument(serializeCadDocumentToSvg(document));

    expect(imported.entities).toEqual(document.entities);
    expect(imported.layers).toEqual(document.layers);
    expect(imported.dimensionStyles).toEqual(document.dimensionStyles);
    expect(imported.activeLayerId).toBe("walls");
    expect(imported.activeDimensionStyleId).toBe("dimstyle_custom");
    expect(imported.displayUnit).toBe("m");
    expect(imported.id).toBe("doc_roundtrip");
  });

  it("exports splines as exact Bézier paths that re-import without the native data", () => {
    const document = fullDocument();
    const imported = parseSvgDocument(serializeCadDocumentToSvg(document, { embedCadData: false, precision: 6 }));
    const original = document.entities.find((entity) => entity.id === "s1") as any;
    const spline = imported.entities.find((entity) => entity.id === "s1") as any;

    expect(spline.type).toBe("spline");
    expect(spline.controlPoints).toEqual(original.controlPoints);
  });

  it("draws color, thickness and dash pattern in the exported SVG", () => {
    const markup = serializeCadDocumentToSvg(fullDocument());

    expect(markup).toMatch(/<line id="l1"[^>]*stroke="#ff0000"[^>]*stroke-width="2"[^>]*stroke-dasharray="8 6"/);
    expect(markup).toMatch(/<polygon id="p1"[^>]*stroke-dasharray="2 4"/);
  });

  it("ignores malformed document metadata and falls back to defaults", () => {
    const meta = JSON.stringify({ dimensionStyles: [{ id: "x", name: "X" }], layers: [{ id: 1 }], units: "furlong" }).replaceAll('"', "&quot;");
    const imported = parseSvgDocument(`<svg data-cad-document="${meta}"><line id="l" x1="0" y1="0" x2="1" y2="1" /></svg>`);

    expect(imported.entities).toHaveLength(1);
    expect(imported.dimensionStyles.map((style) => style.id)).toEqual(["dimstyle_standard"]);
    expect(imported.layers.map((layer) => layer.id)).toEqual(["layer_0"]);
    expect(imported.units).toBe("mm");
  });

  it("skips corrupted native payloads without losing the rest", () => {
    const imported = parseSvgDocument(svg(`
      <line id="bad" data-cad-entity="{not json" x1="0" y1="0" x2="1" y2="1" />
      <line id="ok" x1="0" y1="0" x2="5" y2="5" />
    `));

    expect(imported.entities.map((entity) => entity.id)).toEqual(["ok"]);
  });
});

describe("SVG import — other programs", () => {
  it("imports <ellipse> and applies element and group transforms", () => {
    const imported = parseSvgDocument(svg(`
      <g transform="translate(100 50)">
        <ellipse id="el" cx="0" cy="0" rx="30" ry="10" transform="rotate(30)" />
        <circle id="stretched" cx="10" cy="0" r="5" transform="scale(1 2)" />
        <circle id="plain" cx="0" cy="0" r="4" transform="scale(2)" />
      </g>
    `));
    const byId = (id: string) => imported.entities.find((entity) => entity.id === id) as any;

    expect(byId("el")).toMatchObject({ type: "ellipse", center: { x: 100, y: 50 } });
    expect(byId("el").radiusX).toBeCloseTo(30);
    expect(byId("el").radiusY).toBeCloseTo(10);
    expect(byId("el").rotation).toBeCloseTo(Math.PI / 6);
    expect(byId("stretched")).toMatchObject({ type: "ellipse", center: { x: 110, y: 50 } });
    expect(byId("stretched").radiusX).toBeCloseTo(10);
    expect(byId("stretched").radiusY).toBeCloseTo(5);
    expect(byId("plain")).toMatchObject({ type: "circle", center: { x: 100, y: 50 }, radius: 8 });
  });

  it("imports straight paths as lines and polylines", () => {
    const imported = parseSvgDocument(svg(`
      <path id="seg" d="M0 0 L10 0" />
      <path id="box" d="m 0,20 h 10 v 10 h -10 z" />
      <path id="open" d="M0 50 H 10 20 V 60" />
    `));
    const byId = (id: string) => imported.entities.find((entity) => entity.id === id) as any;

    expect(byId("seg")).toMatchObject({ type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    expect(byId("box")).toMatchObject({ type: "polyline", closed: true, points: [{ x: 0, y: 20 }, { x: 10, y: 20 }, { x: 10, y: 30 }, { x: 0, y: 30 }] });
    // H com repetição implícita: H 10 20 = H 10 H 20.
    expect(byId("open").points).toEqual([{ x: 0, y: 50 }, { x: 10, y: 50 }, { x: 20, y: 50 }, { x: 20, y: 60 }]);
  });

  it("imports path arcs as native arcs with the right direction, also under a mirror transform", () => {
    const imported = parseSvgDocument(svg(`
      <path id="arc" d="M 10 0 A 10 10 0 0 1 0 10" />
      <g transform="scale(1 -1)"><path id="mirrored" d="M 10 0 A 10 10 0 0 1 0 10" /></g>
    `));
    const arc = imported.entities.find((entity) => entity.id === "arc") as any;
    const mirrored = imported.entities.find((entity) => entity.id === "mirrored") as any;
    const midAngle = (entity: any) => {
      const sweep = arcSweepAngle(entity.startAngle, entity.endAngle, entity.clockwise);
      return entity.startAngle + (entity.clockwise ? sweep : -sweep) / 2;
    };

    expect(arc).toMatchObject({ type: "arc", radius: 10 });
    expect(arcSweepAngle(arc.startAngle, arc.endAngle, arc.clockwise)).toBeCloseTo(Math.PI / 2);
    expect(Math.cos(midAngle(arc))).toBeCloseTo(Math.SQRT1_2);
    expect(Math.sin(midAngle(arc))).toBeCloseTo(Math.SQRT1_2);
    expect(Math.sin(midAngle(mirrored))).toBeCloseTo(-Math.SQRT1_2);
  });

  it("imports elliptical path arcs as elliptical arcs", () => {
    const imported = parseSvgDocument(svg(`<path id="ea" d="M 20 0 A 20 10 0 0 1 -20 0" />`));
    const ellipse = imported.entities[0] as any;
    const { start, sweep } = normalizeEllipseSweep(ellipse.startAngle, ellipse.endAngle);
    const middle = ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, start + sweep / 2);

    expect(ellipse).toMatchObject({ type: "ellipse", radiusX: 20, radiusY: 10 });
    expect(sweep).toBeCloseTo(Math.PI);
    // Sweep-flag 1 no SVG (Y para baixo) passa pelo lado de y positivo.
    expect(middle.y).toBeCloseTo(10);
  });

  it("imports Bézier curves as exact splines (C, S, Q and T)", () => {
    const imported = parseSvgDocument(svg(`<path id="curve" d="M0 0 C 0 10 10 10 10 0 S 20 -10 20 0 Q 25 5 30 0 T 40 0" />`));
    const curve = imported.entities[0] as any;

    expect(curve.type).toBe("spline");
    expect(curve.closed).toBe(false);
    // C literal, S com o controle refletido e Q elevada a cúbica (2/3 até o controle).
    expect(curve.controlPoints.slice(0, 7)).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 10, y: -10 }, { x: 20, y: -10 }, { x: 20, y: 0 }
    ]);
    expect(curve.controlPoints[7].x).toBeCloseTo(20 + (2 / 3) * 5);
    expect(curve.controlPoints[7].y).toBeCloseTo((2 / 3) * 5);
    expect(curve.controlPoints.at(-1)).toEqual({ x: 40, y: 0 });
  });

  it("closes curved subpaths and applies transforms to the control points", () => {
    const imported = parseSvgDocument(svg(`<g transform="translate(10 0) scale(2)"><path id="blob" d="M0 0 C 5 -5 10 5 10 0 L 0 5 Z" /></g>`));
    const blob = imported.entities[0] as any;

    expect(blob).toMatchObject({ type: "spline", closed: true });
    expect(blob.controlPoints[0]).toEqual({ x: 10, y: 0 });
    expect(blob.controlPoints[1]).toEqual({ x: 20, y: -10 });
    expect(blob.controlPoints.at(-1)).toEqual(blob.controlPoints[0]);
  });

  it("creates layers from Inkscape groups and skips defs and hidden content", () => {
    const imported = parseSvgDocument(svg(`
      <defs><line id="in_defs" x1="0" y1="0" x2="1" y2="1" /></defs>
      <g inkscape:groupmode="layer" id="layer_tubes" inkscape:label="Tubulação">
        <line id="tube" x1="0" y1="0" x2="10" y2="0" />
        <line id="hidden" style="display:none" x1="0" y1="0" x2="10" y2="0" />
      </g>
    `));

    expect(imported.entities.map((entity) => entity.id)).toEqual(["tube"]);
    expect(imported.entities[0]!.layerId).toBe("layer_tubes");
    expect(imported.layers).toContainEqual(expect.objectContaining({ id: "layer_tubes", name: "Tubulação" }));
  });

  it("keeps meaningful stroke colors and drops black (the canvas is dark)", () => {
    const imported = parseSvgDocument(svg(`
      <g stroke="#000000"><line id="black" x1="0" y1="0" x2="1" y2="0" /></g>
      <line id="red" stroke="#ff0000" x1="0" y1="0" x2="1" y2="0" />
      <line id="styled" style="stroke: rgb(0, 128, 255)" x1="0" y1="0" x2="1" y2="0" />
    `));
    const byId = (id: string) => imported.entities.find((entity) => entity.id === id) as any;

    expect(byId("black").color).toBeUndefined();
    expect(byId("red").color).toBe("#ff0000");
    expect(byId("styled").color).toBe("rgb(0, 128, 255)");
  });

  it("turns rotated and sheared rectangles into rectangles or closed polylines", () => {
    const imported = parseSvgDocument(svg(`
      <rect id="rot" x="0" y="0" width="10" height="5" transform="translate(5 5) rotate(90)" />
      <rect id="skew" x="0" y="0" width="10" height="5" transform="skewX(20)" />
    `));
    const byId = (id: string) => imported.entities.find((entity) => entity.id === id) as any;

    expect(byId("rot")).toMatchObject({ type: "rectangle", width: 10, height: 5 });
    expect(byId("rot").rotation).toBeCloseTo(Math.PI / 2);
    expect(byId("skew")).toMatchObject({ type: "polyline", closed: true });
  });

  it("makes duplicate ids unique", () => {
    const imported = parseSvgDocument(svg(`<line id="x" x1="0" y1="0" x2="1" y2="0" /><line id="x" x1="0" y1="1" x2="1" y2="1" />`));

    expect(imported.entities.map((entity) => entity.id)).toEqual(["x", "x_1"]);
  });
});

describe("SVG import — <use>, CSS classes and physical units", () => {
  it("instantiates <use> of elements in <defs> with offset and transform", () => {
    const imported = parseSvgDocument(svg(`
      <defs><line id="tick" x1="0" y1="0" x2="10" y2="0" /></defs>
      <use href="#tick" x="5" y="5" />
      <use xlink:href="#tick" transform="rotate(90)" />
    `));
    const lines = imported.entities.filter((entity) => entity.type === "line") as any[];

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ start: { x: 5, y: 5 }, end: { x: 15, y: 5 } });
    expect(lines[1].end.x).toBeCloseTo(0);
    expect(lines[1].end.y).toBeCloseTo(10);
    expect(new Set(lines.map((line) => line.id)).size).toBe(2);
  });

  it("instantiates <symbol> mapping its viewBox to the use size", () => {
    const imported = parseSvgDocument(svg(`
      <symbol id="valve" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></symbol>
      <use href="#valve" x="100" y="0" width="20" height="20" />
    `));

    expect(imported.entities[0]).toMatchObject({ type: "circle", center: { x: 110, y: 10 }, radius: 10 });
  });

  it("blocks circular references", () => {
    const imported = parseSvgDocument(svg(`<g id="loop"><line x1="0" y1="0" x2="1" y2="0" /><use href="#loop" x="5" /></g>`));

    expect(imported.entities).toHaveLength(1);
  });

  it("applies CSS class, id and tag rules with SVG precedence", () => {
    const imported = parseSvgDocument(svg(`
      <style><![CDATA[
        .pipe { stroke: #00aaff; }
        line.warn { stroke: #ff0000; }
        #special { stroke: #00ff00 }
        .hidden { display: none }
        text { font-size: 7px; font-weight: bold }
        g > line { stroke: #123456 }
      ]]></style>
      <line id="a" class="pipe" x1="0" y1="0" x2="1" y2="0" />
      <line id="b" class="pipe warn" x1="0" y1="1" x2="1" y2="1" />
      <line id="special" class="pipe warn" x1="0" y1="2" x2="1" y2="2" />
      <line id="inline" class="pipe" style="stroke:#ffff00" x1="0" y1="3" x2="1" y2="3" />
      <line id="hidden" class="hidden" x1="0" y1="4" x2="1" y2="4" />
      <text id="t" x="0" y="10">Nota</text>
    `));
    const byId = (id: string) => imported.entities.find((entity) => entity.id === id) as any;

    expect(byId("a").color).toBe("#00aaff");
    expect(byId("b").color).toBe("#ff0000");
    expect(byId("special").color).toBe("#00ff00");
    expect(byId("inline").color).toBe("#ffff00");
    expect(byId("hidden")).toBeUndefined();
    expect(byId("t")).toMatchObject({ height: 7, bold: true });
  });

  it("scales coordinates to millimeters from width/height units and the viewBox", () => {
    const inMillimeters = parseSvgDocument(`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 2100 2970"><line id="l" x1="0" y1="0" x2="1000" y2="0" /></svg>`);
    const inInches = parseSvgDocument(`<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 200 100"><circle id="c" cx="100" cy="50" r="10" /></svg>`);
    const unitless = parseSvgDocument(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><line id="l" x1="0" y1="0" x2="10" y2="0" /></svg>`);
    const pixelsNoViewBox = parseSvgDocument(`<svg xmlns="http://www.w3.org/2000/svg" width="96px" height="96px"><line id="l" x1="0" y1="0" x2="96" y2="0" /></svg>`);

    expect((inMillimeters.entities[0] as any).end.x).toBeCloseTo(100);
    expect(inInches.entities[0]).toMatchObject({ type: "circle" });
    expect((inInches.entities[0] as any).radius).toBeCloseTo(2.54);
    expect((unitless.entities[0] as any).end.x).toBe(10);
    expect((pixelsNoViewBox.entities[0] as any).end.x).toBeCloseTo(25.4);
  });
});
