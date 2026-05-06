import { Circle, Copy, CornerDownRight, CornerRightDown, Eraser, Hand, Minus, MousePointer2, Move, MoveRight, RotateCw, Scaling, Scissors, Square } from "lucide-react";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadToolbarProps = Readonly<{
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
}>;

const tools = [
  { id: "select", icon: MousePointer2, label: "Sel" },
  { id: "line", icon: Minus, label: "Line" },
  { id: "rectangle", icon: Square, label: "Rect" },
  { id: "circle", icon: Circle, label: "Circ" },
  { id: "move", icon: Move, label: "Move" },
  { id: "rotate", icon: RotateCw, label: "Rot" },
  { id: "scale", icon: Scaling, label: "Scale" },
  { id: "offset", icon: Copy, label: "Off" },
  { id: "trim", icon: Scissors, label: "Trim" },
  { id: "extend", icon: MoveRight, label: "Ext" },
  { id: "fillet", icon: CornerDownRight, label: "Fillet" },
  { id: "chamfer", icon: CornerRightDown, label: "Cham" },
  { id: "erase", icon: Eraser, label: "Erase" },
  { id: "pan", icon: Hand, label: "Pan" }
] as const;

export function CadToolbar(props: CadToolbarProps) {
  return (
    <aside className="cad-left-toolbar" aria-label="Ferramentas CAD rapidas">
      {tools.map((tool) => (
        <button
          key={tool.id}
          className={`cad-left-btn ${props.activeTool === tool.id ? "active" : ""}`}
          type="button"
          onClick={() => props.onToolChange(tool.id as ActiveCadTool)}
          title={tool.label}
        >
          <tool.icon size={18} />
          <span>{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}
