import type { Matrix2D, Point2D } from "./types";

export const IDENTITY_MATRIX: Matrix2D = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0
};

export function translationMatrix(dx: number, dy: number): Matrix2D {
  return {
    ...IDENTITY_MATRIX,
    e: dx,
    f: dy
  };
}

export function scaleMatrix(scaleX: number, scaleY = scaleX, origin: Point2D = { x: 0, y: 0 }): Matrix2D {
  return multiplyMatrices(
    translationMatrix(origin.x, origin.y),
    multiplyMatrices(
      {
        a: scaleX,
        b: 0,
        c: 0,
        d: scaleY,
        e: 0,
        f: 0
      },
      translationMatrix(-origin.x, -origin.y)
    )
  );
}

export function rotationMatrix(angleRadians: number, origin: Point2D = { x: 0, y: 0 }): Matrix2D {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  return multiplyMatrices(
    translationMatrix(origin.x, origin.y),
    multiplyMatrices(
      {
        a: cos,
        b: sin,
        c: -sin,
        d: cos,
        e: 0,
        f: 0
      },
      translationMatrix(-origin.x, -origin.y)
    )
  );
}

export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f
  };
}

export function transformPoint(point: Point2D, matrix: Matrix2D): Point2D {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f
  };
}

/**
 * A função constrói a matriz de reflexão em torno da reta que passa por p1 e p2.
 * A reflexão inverte a orientação, então retângulos e arcos precisam de tratamento próprio
 * ao serem espelhados; para pontos, basta aplicar a matriz com transformPoint.
 * Quando p1 e p2 quase coincidem a reta é indefinida e a função devolve a identidade.
 */
export function reflectionMatrix(p1: Point2D, p2: Point2D, epsilon = 1e-9): Matrix2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= epsilon * epsilon) {
    return IDENTITY_MATRIX;
  }

  // Os coeficientes usam a direção unitária ao quadrado para refletir em torno da reta pela origem.
  const ux = dx / Math.sqrt(lengthSquared);
  const uy = dy / Math.sqrt(lengthSquared);
  const a = ux * ux - uy * uy;
  const b = 2 * ux * uy;
  const linear: Matrix2D = { a, b, c: b, d: -a, e: 0, f: 0 };

  // O deslocamento garante que a reta passe por p1 em vez da origem: X' = R (X - p1) + p1.
  return {
    ...linear,
    e: p1.x - (linear.a * p1.x + linear.c * p1.y),
    f: p1.y - (linear.b * p1.x + linear.d * p1.y)
  };
}
