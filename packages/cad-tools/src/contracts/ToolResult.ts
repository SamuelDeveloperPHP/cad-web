import type { CadCommand, CadEntity } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";

export type { CadCommand };

export type SelectionBoxMode = "window" | "crossing";

export type CadPreview =
  | Readonly<{
      type: "ghostEntities";
      entities: ReadonlyArray<CadEntity>;
    }>
  | Readonly<{
      type: "rubberBand";
      from: Point2D;
      to: Point2D;
    }>
  | Readonly<{
      type: "selectionBox";
      start: Point2D;
      end: Point2D;
      mode: SelectionBoxMode;
    }>
  | Readonly<{
      type: "snapMarker";
      point: Point2D;
      snapType: string;
    }>
  | Readonly<{
      type: "message";
      text: string;
    }>;

export type ToolResult =
  | Readonly<{ type: "none" }>
  | Readonly<{ type: "preview"; preview: CadPreview }>
  | Readonly<{ type: "command"; command: CadCommand }>
  | Readonly<{ type: "message"; message: string }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "complete" }>
  | Readonly<{ type: "error"; message: string }>;

export const TOOL_RESULT_NONE: ToolResult = { type: "none" };
