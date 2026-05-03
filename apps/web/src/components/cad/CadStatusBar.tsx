import type { Point2D, SnapSettings } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadStatusBarProps = Readonly<{
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  zoom: number;
  entityCount: number;
  snapSettings: SnapSettings;
}>;

export function CadStatusBar({ activeTool, mouseWorld, zoom, entityCount, snapSettings }: CadStatusBarProps) {
  return (
    <footer className="cad-statusbar">
      <span>Tool: {activeTool}</span>
      <span>
        X: {mouseWorld.x.toFixed(3)} Y: {mouseWorld.y.toFixed(3)}
      </span>
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      <span>Entities: {entityCount}</span>
      <span>Snap: {snapSettings.enabled ? "ON" : "OFF"}</span>
      <span>{formatActiveSnaps(snapSettings)}</span>
    </footer>
  );
}

function formatActiveSnaps(settings: SnapSettings): string {
  if (!settings.enabled) {
    return "No active snaps";
  }

  const activeSnaps = [
    settings.endpoint ? "Endpoint" : null,
    settings.midpoint ? "Midpoint" : null,
    settings.center ? "Center" : null,
    settings.nearest ? "Nearest" : null
  ].filter((snap): snap is string => snap !== null);

  return activeSnaps.length > 0 ? activeSnaps.join(", ") : "No active snaps";
}
