import { normalize, type Point2D, type Vector2D } from "@cad-web/cad-geometry";

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

export function resolveDirectInput(
  result: DirectInputResult,
  referencePoint: Point2D,
  cursorDirection: Vector2D | null
): Point2D | null {
  switch (result.kind) {
    case "distance": {
      if (cursorDirection === null) {
        return null;
      }

      const dir = normalize(cursorDirection);

      if (dir.x === 0 && dir.y === 0) {
        return null;
      }

      return {
        x: referencePoint.x + dir.x * result.value,
        y: referencePoint.y + dir.y * result.value
      };
    }

    case "absolute":
      return result.point;

    case "relative":
      return {
        x: referencePoint.x + result.offset.x,
        y: referencePoint.y + result.offset.y
      };

    case "polar": {
      const angleRad = (result.angleDeg * Math.PI) / 180;
      return {
        x: referencePoint.x + result.distance * Math.cos(angleRad),
        y: referencePoint.y + result.distance * Math.sin(angleRad)
      };
    }

    default:
      return null;
  }
}
