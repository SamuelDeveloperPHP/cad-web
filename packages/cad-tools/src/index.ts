import type { LineEntity } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";

export type ToolId = "select" | "line" | "circle" | "move" | "rotate" | "trim" | "offset";

export type ToolCommandDraft =
  | Readonly<{
      type: "add-line";
      entity: LineEntity;
    }>;

export type PointerInput = Readonly<{
  point: Point2D;
  shiftKey: boolean;
  ctrlKey: boolean;
}>;
