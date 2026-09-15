import type { Point2D } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";

// O modo determina quais campos aparecem e como a submissão é formatada para a ferramenta ativa:
// - polar: distância + ângulo (Line, Polyline, Arc, Ellipse) -> "@dist<ângulo"
// - cartesian: largura + altura (Rectangle) -> "dx,dy"
// - radius: apenas o raio (Circle) -> "raio"
export type DynamicInputMode = "polar" | "cartesian" | "radius";

export type DynamicInputDraft = readonly [string, string];

export type DynamicMetrics = Readonly<{
  dx: number;
  dyWorld: number;
  dist: number;
  angleDeg: number;
}>;

export function dynamicInputModeForTool(tool: ActiveCadTool): DynamicInputMode {
  if (tool === "circle") {
    return "radius";
  }

  if (tool === "rectangle") {
    return "cartesian";
  }

  return "polar";
}

export function dynamicFieldCount(mode: DynamicInputMode): 1 | 2 {
  return mode === "radius" ? 1 : 2;
}

// A função mede a distância, o ângulo (convenção AutoCAD: 0° = Leste, 90° = Norte/cima, anti-horário)
// e os deltas do ponto de referência até o cursor. O sinal do Y é invertido porque o eixo Y do mundo
// cresce para baixo na tela.
export function computeDynamicMetrics(referencePoint: Point2D, cursorWorld: Point2D): DynamicMetrics {
  const dx = cursorWorld.x - referencePoint.x;
  const dyWorld = cursorWorld.y - referencePoint.y;
  const dist = Math.hypot(dx, dyWorld);
  let angleDeg = (Math.atan2(-dyWorld, dx) * 180) / Math.PI;

  if (angleDeg < 0) {
    angleDeg += 360;
  }

  return { dx, dyWorld, dist, angleDeg };
}

// A função monta o texto de comando que a ferramenta ativa entende, usando os valores digitados quando
// presentes e os valores ao vivo (posição atual do cursor) como padrão.
export function buildDynamicSubmission(
  mode: DynamicInputMode,
  draft: DynamicInputDraft,
  metrics: DynamicMetrics
): string | null {
  if (mode === "radius") {
    const radius = draft[0] !== "" ? Number.parseFloat(draft[0]) : metrics.dist;
    return Number.isFinite(radius) && radius > 0 ? `${radius}` : null;
  }

  if (mode === "cartesian") {
    const width = draft[0] !== "" ? Number.parseFloat(draft[0]) : Math.abs(metrics.dx);
    const height = draft[1] !== "" ? Number.parseFloat(draft[1]) : Math.abs(metrics.dyWorld);

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }

    // As dimensões digitadas são positivas; o sinal segue o quadrante atual do cursor.
    const signX = metrics.dx >= 0 ? 1 : -1;
    const signY = metrics.dyWorld >= 0 ? 1 : -1;
    return `${signX * Math.abs(width)},${signY * Math.abs(height)}`;
  }

  // mode === "polar"
  const finalDist = draft[0] !== "" ? Number.parseFloat(draft[0]) : metrics.dist;
  const finalAngle = draft[1] !== "" ? Number.parseFloat(draft[1]) : metrics.angleDeg;

  if (!Number.isFinite(finalDist) || finalDist <= 0 || !Number.isFinite(finalAngle)) {
    return null;
  }

  // O ângulo é digitado na convenção visual do AutoCAD (Y para cima); o polar do desenho usa Y do mundo
  // (para baixo na tela), então o sinal é invertido para o ponto cair exatamente onde o cursor indica.
  return `@${finalDist}<${-finalAngle}`;
}

// A função devolve os valores ao vivo formatados para exibição como placeholder de cada campo.
export function dynamicPlaceholders(mode: DynamicInputMode, metrics: DynamicMetrics): readonly [string, string] {
  if (mode === "radius") {
    return [metrics.dist.toFixed(2), ""];
  }

  if (mode === "cartesian") {
    return [Math.abs(metrics.dx).toFixed(2), Math.abs(metrics.dyWorld).toFixed(2)];
  }

  return [metrics.dist.toFixed(2), metrics.angleDeg.toFixed(1)];
}

export type DynamicFieldLabels = Readonly<{
  prefix0: string | null;
  separator: string;
  suffix1: string | null;
}>;

export function dynamicFieldLabels(mode: DynamicInputMode): DynamicFieldLabels {
  if (mode === "radius") {
    return { prefix0: "R", separator: "", suffix1: null };
  }

  if (mode === "cartesian") {
    return { prefix0: null, separator: "×", suffix1: null };
  }

  return { prefix0: null, separator: "<", suffix1: "°" };
}
