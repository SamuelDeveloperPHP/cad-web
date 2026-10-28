import { expandBlockReference, type BlockReferenceEntity, type CadEntity } from "@cad-web/cad-core";
import { evaluateBezierChain } from "@cad-web/cad-geometry";
import { describe, expect, it } from "vitest";
import { DxfImportError, aciToHex, decodeDxfBytes, parseDxfDocument, parseDxfDocumentWithReport, trueColorToHex } from "./index";
import { stripMtextFormatting } from "./dxfText";

type Pair = readonly [number, string | number];

// Monta o texto DXF: cada par vira duas linhas (código e valor).
function dxf(...sections: ReadonlyArray<ReadonlyArray<Pair>>): string {
  return `${sections.flat().map(([code, value]) => `${String(code).padStart(3, " ")}\n${value}`).join("\n")}\n  0\nEOF\n`;
}

const section = (name: string, ...pairs: ReadonlyArray<Pair>): ReadonlyArray<Pair> => [[0, "SECTION"], [2, name], ...pairs, [0, "ENDSEC"]];
const header = (units: number): ReadonlyArray<Pair> => section("HEADER", [9, "$INSUNITS"], [70, units]);
const entities = (...pairs: ReadonlyArray<Pair>): ReadonlyArray<Pair> => section("ENTITIES", ...pairs);

function importEntities(...pairs: ReadonlyArray<Pair>) {
  return parseDxfDocumentWithReport(dxf(header(4), entities(...pairs)));
}

const near = (value: number, expected: number, digits = 9) => expect(value).toBeCloseTo(expected, digits);

describe("DXF basics", () => {
  it("imports lines, circles and arcs with Y flipped and angles converted", () => {
    const { document, report } = importEntities(
      [0, "LINE"], [8, "0"], [10, 1], [20, 2], [30, 0], [11, 4], [21, 6], [31, 0],
      [0, "CIRCLE"], [8, "0"], [10, 5], [20, 5], [40, 3],
      // Arco de 0° a 90° (anti-horário, Y para cima): fica acima e à direita do centro.
      [0, "ARC"], [8, "0"], [10, 0], [20, 0], [40, 10], [50, 0], [51, 90]
    );

    expect(report.entities).toBe(3);
    expect(document.entities[0]).toMatchObject({ type: "line", start: { x: 1, y: -2 }, end: { x: 4, y: -6 } });
    expect(document.entities[1]).toMatchObject({ type: "circle", center: { x: 5, y: -5 }, radius: 3 });
    const arc = document.entities[2] as any;
    expect(arc).toMatchObject({ type: "arc", clockwise: true, radius: 10 });
    // O ponto médio (45°) do arco: x > 0 e y < 0 no documento (acima na tela).
    const mid = (arc.startAngle + arc.endAngle) / 2;
    near(Math.cos(mid), Math.SQRT1_2);
    near(Math.sin(mid), -Math.SQRT1_2);
  });

  it("converts the units declared in $INSUNITS to millimeters and sets the display unit", () => {
    const meters = parseDxfDocumentWithReport(dxf(header(6), entities([0, "LINE"], [8, "0"], [10, 1], [20, 0], [11, 3], [21, 0])));
    expect(meters.document.entities[0]).toMatchObject({ start: { x: 1000, y: 0 }, end: { x: 3000, y: 0 } });
    expect(meters.document.displayUnit).toBe("m");
    expect(meters.report).toMatchObject({ sourceUnit: "meters", scaleToMillimeters: 1000 });

    const inches = parseDxfDocument(dxf(header(1), entities([0, "CIRCLE"], [8, "0"], [10, 0], [20, 0], [40, 2])));
    expect((inches.entities[0] as any).radius).toBeCloseTo(50.8, 9);

    const unspecified = parseDxfDocumentWithReport(dxf(entities([0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 1], [21, 0])));
    expect(unspecified.report.scaleToMillimeters).toBe(1);
    expect(unspecified.report.warnings.join(" ")).toContain("does not declare its units");
  });

  it("maps layers (name, ACI/true color, frozen, locked, linetype) and applies entity colors", () => {
    const { document } = parseDxfDocumentWithReport(dxf(
      header(4),
      section("TABLES",
        [0, "TABLE"], [2, "LAYER"],
        [0, "LAYER"], [2, "0"], [70, 0], [62, 7], [6, "Continuous"],
        [0, "LAYER"], [2, "Tubulação"], [70, 4], [62, 3], [6, "DASHED"],
        [0, "LAYER"], [2, "Ocultos"], [70, 1], [62, 1], [6, "Continuous"],
        [0, "LAYER"], [2, "Off"], [70, 0], [62, -5], [6, "Continuous"],
        [0, "ENDTAB"]
      ),
      entities(
        [0, "LINE"], [8, "Tubulação"], [10, 0], [20, 0], [11, 1], [21, 0],
        [0, "LINE"], [8, "Tubulação"], [62, 1], [10, 0], [20, 0], [11, 1], [21, 0],
        [0, "LINE"], [8, "0"], [420, 0x00aaff], [10, 0], [20, 0], [11, 1], [21, 0],
        [0, "LINE"], [8, "Novo"], [10, 0], [20, 0], [11, 1], [21, 0]
      )
    ));

    expect(document.layers.map((layer) => [layer.id, layer.name, layer.color, layer.visible, layer.locked])).toEqual([
      ["layer_0", "0", "#ffffff", true, false],
      ["layer_tubulacao", "Tubulação", "#00ff00", true, true],
      ["layer_ocultos", "Ocultos", "#ff0000", false, false],
      ["layer_off", "Off", "#0000ff", false, false],
      ["layer_novo", "Novo", "#ffffff", true, false]
    ]);
    expect(document.activeLayerId).toBe("layer_0");
    // O tipo de linha da camada vale para as entidades POR CAMADA; a cor própria vale sobre a da camada.
    expect(document.entities[0]).toMatchObject({ layerId: "layer_tubulacao", lineType: "dashed" });
    expect((document.entities[0] as any).color).toBeUndefined();
    expect(document.entities[1]).toMatchObject({ color: "#ff0000" });
    expect(document.entities[2]).toMatchObject({ color: "#00aaff" });
  });

  it("skips paper space, invisible and unsupported entities and reports them", () => {
    const { document, report } = importEntities(
      [0, "LINE"], [8, "0"], [67, 1], [10, 0], [20, 0], [11, 1], [21, 0],
      [0, "LINE"], [8, "0"], [60, 1], [10, 0], [20, 0], [11, 1], [21, 0],
      [0, "POINT"], [8, "0"], [10, 0], [20, 0],
      [0, "XLINE"], [8, "0"], [10, 0], [20, 0], [11, 1], [21, 0],
      [0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 5], [21, 0]
    );

    expect(document.entities).toHaveLength(1);
    expect(report.skipped).toEqual({ "paper space entities": 1, "invisible entities": 1, POINT: 1, XLINE: 1 });
  });
});

describe("DXF polylines and curves", () => {
  it("imports LWPOLYLINE without bulge as a single polyline and honors the closed flag", () => {
    const { document } = importEntities(
      [0, "LWPOLYLINE"], [8, "0"], [90, 3], [70, 1], [10, 0], [20, 0], [10, 10], [20, 0], [10, 10], [20, 5]
    );

    expect(document.entities).toEqual([expect.objectContaining({ type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -5 }] })]);
  });

  it("turns bulges into exact arcs between straight runs", () => {
    const { document } = importEntities(
      [0, "LWPOLYLINE"], [8, "0"], [90, 3], [70, 0],
      [10, 0], [20, 0],
      [10, 10], [20, 0], [42, 1],
      [10, 10], [20, 4]
    );

    const [first, arc, last] = document.entities as any[];
    // Bulge 1 = semicírculo entre (10,0) e... os dois primeiros vértices: (0,0) reto até (10,0); depois arco até (10,4).
    expect(first).toMatchObject({ type: "polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });
    expect(arc).toMatchObject({ type: "arc", clockwise: true });
    near(arc.radius, 2);
    expect(last).toBeUndefined();
    // Semicírculo CCW de (10,0) a (10,4): centro (10,2), bulgando para a direita (x > 10).
    const mid = (arc.startAngle + arc.endAngle) / 2 + (Math.abs(arc.endAngle - arc.startAngle) > Math.PI ? Math.PI : 0);
    const point = { x: 10 + 2 * Math.cos(mid), y: -2 + 2 * Math.sin(mid) };
    expect(point.x).toBeGreaterThan(11.9);
    near(point.y, -2);
  });

  it("imports a closed bulged LWPOLYLINE with the closing segment", () => {
    const { document } = importEntities(
      [0, "LWPOLYLINE"], [8, "0"], [90, 2], [70, 1],
      [10, 0], [20, 0], [42, 1],
      [10, 2], [20, 0], [42, 1]
    );

    // Dois semicírculos formam uma circunferência de raio 1.
    expect(document.entities.map((entity) => entity.type)).toEqual(["arc", "arc"]);
    expect(document.entities.every((entity) => Math.abs((entity as any).radius - 1) < 1e-9)).toBe(true);
  });

  it("reads old-style POLYLINE with VERTEX and SEQEND, ignoring meshes", () => {
    const { document, report } = importEntities(
      [0, "POLYLINE"], [8, "0"], [66, 1], [70, 1],
      [0, "VERTEX"], [8, "0"], [10, 0], [20, 0],
      [0, "VERTEX"], [8, "0"], [10, 4], [20, 0],
      [0, "VERTEX"], [8, "0"], [10, 4], [20, 3],
      [0, "SEQEND"], [8, "0"],
      [0, "POLYLINE"], [8, "0"], [66, 1], [70, 64],
      [0, "VERTEX"], [8, "0"], [10, 0], [20, 0],
      [0, "SEQEND"], [8, "0"]
    );

    expect(document.entities).toHaveLength(1);
    expect(document.entities[0]).toMatchObject({ type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: -3 }] });
    expect(report.skipped["POLYLINE (mesh)"]).toBe(1);
  });

  it("imports ellipses and elliptical arcs with the axis and parameters in the document frame", () => {
    const { document } = importEntities(
      [0, "ELLIPSE"], [8, "0"], [10, 10], [20, 5], [11, 4], [21, 0], [40, 0.5], [41, 0], [42, 6.283185307179586],
      [0, "ELLIPSE"], [8, "0"], [10, 0], [20, 0], [11, 0], [21, 6], [40, 0.5], [41, 0], [42, Math.PI / 2]
    );

    expect(document.entities[0]).toMatchObject({ type: "ellipse", center: { x: 10, y: -5 }, radiusX: 4, radiusY: 2, rotation: 0 });
    expect((document.entities[0] as any).startAngle).toBeUndefined();
    const arc = document.entities[1] as any;
    near(arc.radiusX, 6);
    near(arc.radiusY, 3);
    // Eixo maior para cima (+Y do DXF) = rotação −90° no documento; parâmetros trocam de sinal e ordem.
    near(arc.rotation, -Math.PI / 2);
    near(arc.startAngle, -Math.PI / 2);
    near(arc.endAngle, 0);
  });

  it("fits a cubic B-spline to Béziers that match the curve, and falls back for invalid knots", () => {
    const { document, report } = importEntities(
      [0, "SPLINE"], [8, "0"], [70, 8], [71, 3], [72, 8], [73, 4], [74, 0],
      [40, 0], [40, 0], [40, 0], [40, 0], [40, 1], [40, 1], [40, 1], [40, 1],
      [10, 0], [20, 0], [10, 10], [20, 20], [10, 20], [20, 20], [10, 30], [20, 0],
      [0, "SPLINE"], [8, "0"], [70, 8], [71, 3], [72, 2], [73, 4], [74, 0],
      [40, 0], [40, 1],
      [10, 0], [20, 0], [10, 1], [20, 1], [10, 2], [20, 1], [10, 3], [20, 0]
    );

    const spline = document.entities[0] as any;
    expect(spline.type).toBe("spline");
    const middle = evaluateBezierChain(spline.controlPoints, (spline.controlPoints.length - 1) / 3 / 2);
    // Bézier cúbica: P(0,5) = (P0 + 3·P1 + 3·P2 + P3) / 8 → (15, 15) no DXF = (15, −15) no documento.
    expect(middle.x).toBeCloseTo(15, 1);
    expect(middle.y).toBeCloseTo(-15, 1);
    expect(document.entities[1]).toMatchObject({ type: "polyline" });
    expect(report.warnings.join(" ")).toContain("Invalid SPLINE knots");
  });

  it("uses fit points when a SPLINE has no control points", () => {
    const { document } = importEntities(
      [0, "SPLINE"], [8, "0"], [70, 0], [71, 3], [72, 0], [73, 0], [74, 3],
      [11, 0], [21, 0], [11, 5], [21, 5], [11, 10], [21, 0]
    );

    expect(document.entities[0]).toMatchObject({ type: "spline", fitPoints: [{ x: 0, y: 0 }, { x: 5, y: -5 }, { x: 10, y: 0 }] });
  });
});

describe("DXF text", () => {
  it("decodes TEXT special codes, rotation and alignment", () => {
    const { document } = importEntities(
      [0, "TEXT"], [8, "0"], [10, 0], [20, 0], [40, 2.5], [1, "45%%d %%p0,5 %%c20 \\U+00E9"], [50, 90], [72, 1], [73, 2], [11, 10], [21, 10]
    );

    expect(document.entities[0]).toMatchObject({
      type: "text",
      content: "45° ±0,5 Ø20 é",
      position: { x: 10, y: -10 },
      height: 2.5,
      horizontalAlign: "center",
      verticalAlign: "middle"
    });
    near((document.entities[0] as any).rotation, -Math.PI / 2);
  });

  it("strips MTEXT formatting, joins chunks and maps the attachment point", () => {
    expect(stripMtextFormatting("{\\fArial|b0|i0;Hello} \\C1;red\\Pnext \\S1/2; \\U+00B0")).toBe("Hello red\nnext 1/2 °");

    const { document } = importEntities(
      [0, "MTEXT"], [8, "0"], [10, 0], [20, 0], [40, 3], [71, 5], [3, "{\\fArial;Linha 1}\\P"], [1, "Linha 2"]
    );

    expect(document.entities[0]).toMatchObject({ type: "text", content: "Linha 1\nLinha 2", horizontalAlign: "center", verticalAlign: "middle" });
  });
});

describe("DXF blocks", () => {
  const blockSection = section("BLOCKS",
    [0, "BLOCK"], [8, "0"], [2, "VALVE"], [70, 0], [10, 1], [20, 1], [30, 0],
    [0, "LINE"], [8, "0"], [10, 1], [20, 1], [11, 3], [21, 1],
    [0, "CIRCLE"], [8, "PIPES"], [10, 2], [20, 2], [40, 1],
    [0, "ENDBLK"], [8, "0"],
    [0, "BLOCK"], [8, "0"], [2, "*Paper_Space"], [70, 0], [10, 0], [20, 0],
    [0, "ENDBLK"], [8, "0"],
    [0, "BLOCK"], [8, "0"], [2, "NESTED"], [70, 0], [10, 0], [20, 0],
    [0, "INSERT"], [8, "0"], [2, "VALVE"], [10, 5], [20, 0],
    [0, "ENDBLK"], [8, "0"]
  );

  function importWith(...pairs: ReadonlyArray<Pair>) {
    return parseDxfDocumentWithReport(dxf(header(4), blockSection, entities(...pairs)));
  }

  it("imports block definitions (base point, layers, nesting) and ignores layout blocks", () => {
    const { document, report } = importWith();

    expect(document.blocks?.map((block) => block.name)).toEqual(["VALVE", "NESTED"]);
    expect(document.blocks![0]).toMatchObject({ basePoint: { x: 1, y: -1 } });
    expect(document.blocks![0]!.entities.map((entity) => entity.type)).toEqual(["line", "circle"]);
    expect(document.blocks![0]!.entities[1]!.layerId).toBe("layer_pipes");
    expect(document.blocks![1]!.entities[0]).toMatchObject({ type: "block", blockName: "VALVE" });
    expect(report.blocks).toBe(2);
  });

  it("places INSERT with scale and rotation like AutoCAD (Y up, counterclockwise)", () => {
    const { document } = importWith([0, "INSERT"], [8, "0"], [2, "VALVE"], [10, 10], [20, 10], [41, 2], [42, 2], [50, 90]);
    const reference = document.entities[0] as BlockReferenceEntity;
    const expanded = expandBlockReference(document.blocks, reference);
    const line = expanded[0] as any;

    // Base (1,1) → (10,10); o ponto (3,1) fica 2·(2,0) = (4,0) do ponto base, girado 90° → (0,4): (10,14) no DXF.
    near(line.start.x, 10);
    near(line.start.y, -10);
    near(line.end.x, 10);
    near(line.end.y, -14);
  });

  it("expands INSERT arrays with the spacing in the rotated frame", () => {
    const { document } = importWith([0, "INSERT"], [8, "0"], [2, "VALVE"], [10, 0], [20, 0], [70, 2], [71, 2], [44, 10], [45, 20], [50, 90]);
    const positions = (document.entities as BlockReferenceEntity[]).map((entity) => entity.position);

    expect(positions).toHaveLength(4);
    expect(new Set(document.entities.map((entity) => entity.id)).size).toBe(4);
    // Coluna +X gira para +Y do DXF (−Y no documento); linha +Y gira para −X.
    near(positions[1]!.x, 0);
    near(positions[1]!.y, -10);
    near(positions[2]!.x, -20);
    near(positions[2]!.y, 0);
  });

  it("handles the mirrored OCS (extrusion 0,0,−1) and drops references to undefined blocks", () => {
    const { document, report } = importWith(
      [0, "INSERT"], [8, "0"], [2, "VALVE"], [10, 10], [20, 0], [210, 0], [220, 0], [230, -1],
      [0, "INSERT"], [8, "0"], [2, "NOPE"], [10, 0], [20, 0]
    );
    const reference = document.entities[0] as BlockReferenceEntity;
    const line = expandBlockReference(document.blocks, reference)[0] as any;

    expect(document.entities).toHaveLength(1);
    // OCS espelhado: x → −x. O ponto base (1,1) cai em (−10, 0 + ...) e a linha continua para a esquerda.
    near(line.start.x, -10);
    expect(line.end.x).toBeLessThan(line.start.x);
    expect(report.skipped["INSERT (block not defined)"]).toBe(1);
  });

  it("turns a DIMENSION into a reference to its anonymous block", () => {
    const { document } = parseDxfDocumentWithReport(dxf(
      header(4),
      section("BLOCKS",
        [0, "BLOCK"], [8, "0"], [2, "*D1"], [70, 1], [10, 0], [20, 0],
        [0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 5], [21, 0],
        [0, "ENDBLK"], [8, "0"]
      ),
      entities([0, "DIMENSION"], [8, "Cotas"], [2, "*D1"], [70, 0])
    ));

    expect(document.entities[0]).toMatchObject({ type: "block", blockName: "*D1", layerId: "layer_cotas", position: { x: 0, y: 0 } });
  });
});

describe("DXF hatches, solids and leaders", () => {
  it("imports hatch boundaries and solid outlines, with a warning about the missing fill", () => {
    const { document, report } = importEntities(
      [0, "HATCH"], [8, "0"], [91, 2],
      [92, 7], [72, 0], [73, 1], [93, 3], [10, 0], [20, 0], [10, 4], [20, 0], [10, 4], [20, 4],
      [92, 1], [93, 2],
      [72, 1], [10, 10], [20, 0], [11, 12], [21, 0],
      [72, 2], [10, 20], [20, 0], [40, 2], [50, 0], [51, 180], [73, 1],
      [0, "SOLID"], [8, "0"], [10, 0], [20, 0], [11, 2], [21, 0], [12, 0], [22, 2], [13, 2], [23, 2],
      [0, "LEADER"], [8, "0"], [76, 3], [10, 0], [20, 0], [10, 5], [20, 5], [10, 9], [20, 5]
    );

    expect(document.entities.map((entity) => entity.type)).toEqual(["polyline", "line", "arc", "polyline", "polyline"]);
    expect((document.entities[0] as any).closed).toBe(true);
    expect(report.warnings.join(" ")).toContain("HATCH imported as outline only");
    // SOLID: ordem dos cantos 1,2,4,3 → quadrilátero simples.
    expect((document.entities[3] as any).points).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -2 }, { x: 0, y: -2 }]);
  });
});

describe("DXF colors and decoding", () => {
  it("follows the AutoCAD index table and keeps black out of the dark canvas", () => {
    expect(aciToHex(1)).toBe("#ff0000");
    expect(aciToHex(7)).toBe("#ffffff");
    expect(aciToHex(10)).toBe("#ff0000");
    expect(aciToHex(11)).toBe("#ff7f7f");
    expect(aciToHex(12)).toBe("#a50000");
    expect(aciToHex(20)).toBe("#ff3f00");
    expect(aciToHex(30)).toBe("#ff7f00");
    expect(aciToHex(250)).toBe("#333333");
    expect(aciToHex(0)).toBeNull();
    expect(aciToHex(256)).toBeNull();
    expect(trueColorToHex(0x112233)).toBe("#112233");
    expect(trueColorToHex(0)).toBe("#ffffff");
  });

  it("rejects binary DXF, DWG and non-DXF text with clear messages", () => {
    expect(() => parseDxfDocument("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(DxfImportError);
    expect(() => parseDxfDocument("hello world")).toThrow("group code expected");
    expect(() => parseDxfDocument("  0\nEOF\n")).toThrow("no SECTION found");
    expect(() => decodeDxfBytes(new TextEncoder().encode("AC1027\u0000\u0000"))).toThrow("DWG files are not supported");
  });

  it("decodes ANSI_1252 files and UTF-8 files", () => {
    const legacy = "  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  9\n$DWGCODEPAGE\n  3\nANSI_1252\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n  0\nTEXT\n  8\n0\n 10\n0\n 20\n0\n 40\n2\n  1\nCoração\n  0\nENDSEC\n  0\nEOF\n";
    const latin1 = Uint8Array.from(Array.from(legacy, (char) => char.charCodeAt(0) & 0xff));

    expect(decodeDxfBytes(latin1)).toContain("Coração");
    expect((parseDxfDocument(latin1).entities[0] as any).content).toBe("Coração");

    const modern = new TextEncoder().encode(legacy.replace("AC1015", "AC1032").replace("ANSI_1252", "UTF8"));
    expect(decodeDxfBytes(modern)).toContain("Coração");
  });

  it("returns an empty drawing (with the default layer) for a library file that only has blocks", () => {
    const { document } = parseDxfDocumentWithReport(dxf(
      header(4),
      section("BLOCKS", [0, "BLOCK"], [8, "0"], [2, "B"], [70, 0], [10, 0], [20, 0], [0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 1], [21, 0], [0, "ENDBLK"], [8, "0"]),
      section("ENTITIES")
    ));

    expect(document.entities).toEqual([]);
    expect(document.blocks).toHaveLength(1);
    expect(document.layers[0]!.id).toBe("layer_0");
  });
});

// Garante que o tipo de entidade do teste acima continue importável sem warnings de "unused".
const _typeCheck: CadEntity | null = null;
void _typeCheck;
