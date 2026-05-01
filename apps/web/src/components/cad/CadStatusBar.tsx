import type { Point2D } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadStatusBarProps = Readonly<{
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  zoom: number;
  entityCount: number;
}>;

export function CadStatusBar({ activeTool, mouseWorld, zoom, entityCount }: CadStatusBarProps) {
  return (
    <footer className="cad-statusbar">
      <span>Tool: {activeTool}</span>
      <span>
        X: {mouseWorld.x.toFixed(3)} Y: {mouseWorld.y.toFixed(3)}
      </span>
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      <span>Entities: {entityCount}</span>
    </footer>
  );
}
