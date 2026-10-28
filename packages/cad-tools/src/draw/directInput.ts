import { normalize, visualDegreesToWorldRadians, type Point2D, type Vector2D } from "@cad-web/cad-geometry";

export type DirectInputResult =
  | { kind: "distance"; value: number }
  | { kind: "absolute"; point: Point2D }
  | { kind: "relative"; offset: Vector2D }
  | { kind: "polar"; distance: number; angleDeg: number }
  | { kind: "invalid" }
  | { kind: "empty" };

export function parseDirectInput(input: string): DirectInputResult {
  const text = input.trim();

  if (text.length === 0) {
    return { kind: "empty" };
  }

  if (text.startsWith("@")) {
    const rest = text.slice(1);
    return parseRelativeOrPolar(rest);
  }

  const coordMatch = text.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*[,;\s]\s*([+-]?\d*\.?\d+(?:e[+-]?\d+)?)$/i);

  if (coordMatch?.[1] !== undefined && coordMatch[2] !== undefined) {
    const x = Number(coordMatch[1]);
    const y = Number(coordMatch[2]);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { kind: "absolute", point: { x, y } };
    }

    return { kind: "invalid" };
  }

  const num = Number(text);

  if (Number.isFinite(num) && num > 0) {
    return { kind: "distance", value: num };
  }

  return { kind: "invalid" };
}

function parseRelativeOrPolar(text: string): DirectInputResult {
  const polarMatch = text.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*<\s*([+-]?\d*\.?\d+(?:e[+-]?\d+)?)$/i);

  if (polarMatch?.[1] !== undefined && polarMatch[2] !== undefined) {
    const dist = Number(polarMatch[1]);
    const angle = Number(polarMatch[2]);

    if (Number.isFinite(dist) && dist > 0 && Number.isFinite(angle)) {
      return { kind: "polar", distance: dist, angleDeg: angle };
    }

    return { kind: "invalid" };
  }

  const coordMatch = text.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*[,;\s]\s*([+-]?\d*\.?\d+(?:e[+-]?\d+)?)$/i);

  if (coordMatch?.[1] !== undefined && coordMatch[2] !== undefined) {
    const dx = Number(coordMatch[1]);
    const dy = Number(coordMatch[2]);

    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      return { kind: "relative", offset: { x: dx, y: dy } };
    }

    return { kind: "invalid" };
  }

  return { kind: "invalid" };
}

/**
 * Convenção de coordenadas digitadas, a do AutoCAD: X para a direita e Y para CIMA na tela. O desenho é
 * guardado com Y para baixo (referencial do Canvas, sem migração dos arquivos), então todo Y digitado
 * troca de sinal ao entrar no documento (e o Y mostrado ao usuário troca de novo ao sair: status e painel).
 * Os valores estão na unidade de trabalho; unitScale os converte para a unidade base (mm).
 */
export function userPointToWorld(point: Point2D, unitScale = 1): Point2D {
  return { x: point.x * unitScale, y: point.y === 0 ? 0 : -point.y * unitScale };
}

// Deslocamento digitado (dx, dy com Y para cima) no referencial do mundo.
export function userOffsetToWorld(offset: Vector2D, unitScale = 1): Vector2D {
  return userPointToWorld(offset, unitScale);
}

export function resolveDirectInput(
  result: DirectInputResult,
  referencePoint: Point2D,
  cursorDirection: Vector2D | null,
  unitScale = 1
): Point2D | null {
  // Os valores digitados estão na unidade de trabalho; unitScale os converte para a unidade base (mm).
  // O ângulo (polar) nunca é escalado — só comprimentos e coordenadas.
  switch (result.kind) {
    case "distance": {
      if (cursorDirection === null) {
        return null;
      }

      const dir = normalize(cursorDirection);

      if (dir.x === 0 && dir.y === 0) {
        return null;
      }

      const distance = result.value * unitScale;

      return {
        x: referencePoint.x + dir.x * distance,
        y: referencePoint.y + dir.y * distance
      };
    }

    case "absolute":
      return userPointToWorld(result.point, unitScale);

    case "relative": {
      const offset = userOffsetToWorld(result.offset, unitScale);
      return { x: referencePoint.x + offset.x, y: referencePoint.y + offset.y };
    }

    case "polar": {
      // O ângulo digitado segue a convenção do AutoCAD (graus, anti-horário na tela, 0° = Leste);
      // o Y do mundo cresce para baixo, então o ângulo é convertido para o referencial do mundo.
      const angleRad = visualDegreesToWorldRadians(result.angleDeg);
      const distance = result.distance * unitScale;
      return {
        x: referencePoint.x + distance * Math.cos(angleRad),
        y: referencePoint.y + distance * Math.sin(angleRad)
      };
    }

    default:
      return null;
  }
}
