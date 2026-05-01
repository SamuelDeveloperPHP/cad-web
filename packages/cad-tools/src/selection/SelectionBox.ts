import type { Point2D } from "@cad-web/cad-geometry";

export type SelectionBox = Readonly<{
  start: Point2D;
  end: Point2D;
  mode: "window" | "crossing";
}>;

export function getSelectionBoxMode(start: Point2D, end: Point2D): SelectionBox["mode"] {
  return end.x >= start.x ? "window" : "crossing";
}
