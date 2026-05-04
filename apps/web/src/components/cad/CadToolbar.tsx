import React from "react";
import type { ActiveCadTool } from "../../state/useCadStore";
import { MousePointer2, Minus, Square, Circle, Move, RotateCw, Scaling, Copy, Eraser, Hand } from "lucide-react";

type CadToolbarProps = Readonly<{
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
}>;

const tools = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "rectangle", icon: Square, label: "Rectangle" },
  { id: "circle", icon: Circle, label: "Circle" },
  { id: "move", icon: Move, label: "Move" },
  { id: "rotate", icon: RotateCw, label: "Rotate" },
  { id: "scale", icon: Scaling, label: "Scale" },
  { id: "offset", icon: Copy, label: "Offset" },
  { id: "erase", icon: Eraser, label: "Erase" },
  { id: "pan", icon: Hand, label: "Pan" }
] as const;

export function CadToolbar(props: CadToolbarProps) {
  return (
    <aside className="cad-left-toolbar" aria-label="Ferramentas CAD Rápidas">
      {tools.map((tool) => (
        <button
          key={tool.id}
          className={`cad-left-btn ${props.activeTool === tool.id ? "active" : ""}`}
          type="button"
          onClick={() => props.onToolChange(tool.id as ActiveCadTool)}
          title={tool.label}
        >
          <tool.icon size={20} />
        </button>
      ))}
    </aside>
  );
}
