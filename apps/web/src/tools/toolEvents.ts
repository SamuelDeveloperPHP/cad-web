import type { ToolKeyboardEvent, ToolPointerButton, ToolPointerEvent } from "@cad-web/cad-tools";
import type { Point2D } from "@cad-web/cad-geometry";

export type PointerButtonNumber = 0 | 1 | 2 | number;

export function createToolPointerEvent(input: {
  worldPoint: Point2D;
  screenPoint: Point2D;
  button: PointerButtonNumber;
  pointerId: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): ToolPointerEvent {
  return {
    worldPoint: input.worldPoint,
    screenPoint: input.screenPoint,
    button: mapPointerButton(input.button),
    pointerId: input.pointerId,
    shiftKey: input.shiftKey,
    ctrlKey: input.ctrlKey,
    altKey: input.altKey,
    metaKey: input.metaKey
  };
}

export function createToolKeyboardEvent(event: KeyboardEvent): ToolKeyboardEvent {
  return {
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey
  };
}

function mapPointerButton(button: PointerButtonNumber): ToolPointerButton {
  if (button === 0) {
    return "primary";
  }

  if (button === 1) {
    return "middle";
  }

  if (button === 2) {
    return "secondary";
  }

  return "none";
}
