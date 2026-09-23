import { createEmptyDocument, type CadDocument, type CadEntity } from "@cad-web/cad-core";
import { describe, expect, it } from "vitest";
import { cssFontFamily, renderDocument2D } from "./entities";

type Call = Readonly<{ method: string; args: ReadonlyArray<unknown>; font: string; textAlign: string; fillStyle: unknown }>;

// Canvas simulado: registra as chamadas de desenho e o estado de fonte/alinhamento no momento de cada uma.
function createRecordingContext(): { context: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: "", textAlign: "start", fillStyle: "#000", strokeStyle: "#000", lineWidth: 1 };
  const target: Record<string | symbol, unknown> = {
    canvas: { width: 800, height: 600 },
    measureText: (text: string) => ({ width: text.length * 5 })
  };

  const context = new Proxy(target, {
    get(obj, key) {
      if (key in obj) return obj[key];
      if (typeof key === "string" && key in state) return state[key];
      return (...args: unknown[]) => {
        calls.push({
          method: String(key),
          args,
          font: String(state.font),
          textAlign: String(state.textAlign),
          fillStyle: state.fillStyle
        });
      };
    },
    set(_obj, key, value) {
      state[String(key)] = value;
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;

  return { context, calls };
}

function documentWith(entities: ReadonlyArray<CadEntity>): CadDocument {
  return { ...createEmptyDocument("doc_render_text"), entities };
}

const viewport = { origin: { x: 0, y: 0 }, scale: 2 };

describe("text rendering", () => {
  it("draws each line with the entity font, alignment and color", () => {
    const { context, calls } = createRecordingContext();
    renderDocument2D(
      context,
      documentWith([
        {
          id: "t1",
          layerId: "layer_0",
          type: "text",
          position: { x: 10, y: 20 },
          content: "A\nB",
          height: 10,
          horizontalAlign: "center",
          bold: true,
          fontFamily: "Times New Roman",
          color: "#ff0000"
        }
      ]),
      viewport
    );

    const texts = calls.filter((call) => call.method === "fillText");
    expect(texts.map((call) => call.args[0])).toEqual(["A", "B"]);
    expect(texts[0]?.font).toBe('bold 20px "Times New Roman", sans-serif');
    expect(texts[0]?.textAlign).toBe("center");
    expect(texts[0]?.fillStyle).toBe("#ff0000");
    // A primeira linha é ancorada na posição de inserção convertida para a tela.
    expect(calls.find((call) => call.method === "translate")?.args).toEqual([20, 40]);
  });

  it("greeks tiny text into strokes instead of glyphs", () => {
    const { context, calls } = createRecordingContext();
    renderDocument2D(
      context,
      documentWith([{ id: "t1", layerId: "layer_0", type: "text", position: { x: 0, y: 0 }, content: "Pequeno", height: 1 }]),
      viewport
    );

    expect(calls.some((call) => call.method === "fillText")).toBe(false);
    expect(calls.some((call) => call.method === "lineTo")).toBe(true);
  });

  it("quotes named font families and keeps generic ones", () => {
    expect(cssFontFamily(undefined)).toBe("Arial, sans-serif");
    expect(cssFontFamily("monospace")).toBe("monospace");
    expect(cssFontFamily("Courier New")).toBe('"Courier New", sans-serif');
  });
});

describe("dimension terminators", () => {
  function renderDimension(arrowType: "arrow" | "open" | "dot" | "none") {
    const { context, calls } = createRecordingContext();
    renderDocument2D(
      context,
      documentWith([
        {
          id: "d1",
          layerId: "layer_0",
          type: "dimension",
          dimensionType: "aligned",
          styleOverride: { arrowType },
          definition: { firstPoint: { x: 0, y: 0 }, secondPoint: { x: 100, y: 0 }, dimensionLinePoint: { x: 50, y: -20 } }
        }
      ]),
      viewport
    );
    return calls;
  }

  it("fills closed arrows and strokes open arrows", () => {
    expect(renderDimension("arrow").filter((call) => call.method === "fill")).toHaveLength(2);
    const open = renderDimension("open");
    expect(open.filter((call) => call.method === "fill")).toHaveLength(0);
    // Linhas de extensão, linha de cota e as duas setas abertas.
    expect(open.filter((call) => call.method === "stroke").length).toBeGreaterThanOrEqual(4);
  });

  it("draws dots as filled circles and nothing for none", () => {
    const dot = renderDimension("dot");
    expect(dot.filter((call) => call.method === "arc")).toHaveLength(2);
    expect(dot.filter((call) => call.method === "fill")).toHaveLength(2);

    const none = renderDimension("none");
    expect(none.filter((call) => call.method === "fill")).toHaveLength(0);
    expect(none.filter((call) => call.method === "arc")).toHaveLength(0);
  });
});
