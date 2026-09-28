import { mirrorEntity, moveEntity, rotateEntity, scaleEntity, type CadEntity } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";

/**
 * Modos do grip ativo, como no AutoCAD: Stretch (padrão) → Move → Rotate → Scale → Mirror, alternados com
 * Espaço/Enter, pelas palavras-chave da linha de comando ou pelo menu de contexto. O ponto base é o grip
 * (ou o escolhido com a opção Base point). Funções puras: a ferramenta só gera o comando com o resultado.
 */

export type GripOperation = "stretch" | "move" | "rotate" | "scale" | "mirror";

export const GRIP_OPERATIONS: ReadonlyArray<GripOperation> = ["stretch", "move", "rotate", "scale", "mirror"];

export type GripTransform =
  | Readonly<{ kind: "move"; displacement: Point2D }>
  | Readonly<{ kind: "rotate"; angle: number }>
  | Readonly<{ kind: "scale"; factor: number }>
  | Readonly<{ kind: "mirror"; axisEnd: Point2D }>;

const OPERATION_KEYWORDS: Readonly<Record<string, GripOperation>> = {
  st: "stretch",
  stretch: "stretch",
  mo: "move",
  move: "move",
  ro: "rotate",
  rotate: "rotate",
  sc: "scale",
  scale: "scale",
  mi: "mirror",
  mirror: "mirror"
};

export function nextGripOperation(operation: GripOperation): GripOperation {
  return GRIP_OPERATIONS[(GRIP_OPERATIONS.indexOf(operation) + 1) % GRIP_OPERATIONS.length]!;
}

export function parseGripOperation(command: string): GripOperation | null {
  return OPERATION_KEYWORDS[command.trim().toLowerCase()] ?? null;
}

export function gripOperationLabel(operation: GripOperation): string {
  return operation.charAt(0).toUpperCase() + operation.slice(1);
}

/**
 * Transformação definida pelo ponto indicado a partir do ponto base: deslocamento (Move), ângulo da reta
 * base → ponto (Rotate), distância na unidade de trabalho como fator (Scale, como no AutoCAD) ou segundo
 * ponto do eixo (Mirror). null quando o ponto coincide com a base (sem transformação definida).
 */
export function gripTransformFromPoint(operation: Exclude<GripOperation, "stretch">, base: Point2D, point: Point2D, unitScale = 1): GripTransform | null {
  const dx = point.x - base.x;
  const dy = point.y - base.y;
  const length = Math.hypot(dx, dy);

  if (operation === "move") return { kind: "move", displacement: { x: dx, y: dy } };
  if (length <= 1e-12) return null;
  if (operation === "rotate") return { kind: "rotate", angle: Math.atan2(dy, dx) };
  if (operation === "scale") return { kind: "scale", factor: length / (unitScale > 0 ? unitScale : 1) };
  return { kind: "mirror", axisEnd: { x: point.x, y: point.y } };
}

/**
 * Aplica a transformação às entidades (os ids são preservados). Entidades que o Mirror não suporta
 * (cotas) ficam de fora do resultado.
 */
export function applyGripTransform(entities: ReadonlyArray<CadEntity>, base: Point2D, transform: GripTransform): ReadonlyArray<CadEntity> {
  switch (transform.kind) {
    case "move":
      return entities.map((entity) => moveEntity(entity, transform.displacement));
    case "rotate":
      return entities.map((entity) => rotateEntity(entity, base, transform.angle));
    case "scale":
      return transform.factor > 0 && Number.isFinite(transform.factor) ? entities.map((entity) => scaleEntity(entity, base, transform.factor)) : [];
    case "mirror":
      return entities.map((entity) => mirrorEntity(entity, base, transform.axisEnd)).filter((entity): entity is CadEntity => entity !== null);
  }
}
