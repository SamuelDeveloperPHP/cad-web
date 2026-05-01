import type { Point2D } from "@cad-web/cad-geometry";

export type ToolPointerButton = "primary" | "secondary" | "middle" | "none";

export type ToolModifierKeys = Readonly<{
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}>;

export type ToolPointerEvent = ToolModifierKeys &
  Readonly<{
    worldPoint: Point2D;
    screenPoint: Point2D;
    button: ToolPointerButton;
    pointerId: number;
  }>;

export type ToolKeyboardEvent = ToolModifierKeys &
  Readonly<{
    key: string;
    code: string;
    repeat: boolean;
  }>;

export type CommandLineInput = Readonly<{
  raw: string;
  normalized: string;
}>;
