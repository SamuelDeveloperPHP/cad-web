import type { Point2D, SnapSettings } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadStatusBarProps = Readonly<{
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  zoom: number;
  entityCount: number;
  snapSettings: SnapSettings;
  activeLayerName: string;
  activeDimStyleName: string;
  displayUnit: string;
  documentUnits: string;
  onSnapSettingsChange(settings: SnapSettings): void;
  onDisplayUnitChange(unit: string): void;
}>;

const toolLabels: Record<ActiveCadTool, string> = {
  select: "Select",
  line: "Line",
  polyline: "Polyline",
  rectangle: "Rectangle",
  circle: "Circle",
  move: "Move",
  rotate: "Rotate",
  scale: "Scale",
  offset: "Offset",
  trim: "Trim",
  extend: "Extend",
  fillet: "Fillet",
  chamfer: "Chamfer",
  array: "Array",
  arrayPolar: "Array Polar",
  erase: "Erase",
  pan: "Pan",
  dimLinear: "Dim Linear",
  dimAligned: "Dim Aligned",
  dimRadius: "Dim Radius",
  dimDiameter: "Dim Diameter",
  dimAngular: "Dim Angular"
};

export function CadStatusBar({
  activeDimStyleName,
  activeLayerName,
  activeTool,
  displayUnit,
  documentUnits,
  entityCount,
  mouseWorld,
  onDisplayUnitChange,
  onSnapSettingsChange,
  snapSettings,
  zoom
}: CadStatusBarProps) {
  const activeModes = formatActiveSnaps(snapSettings);

  return (
    <footer className="cad-statusbar">
      <div className="cad-statusbar-group">
        <StatusItem label="Tool" value={toolLabels[activeTool]} strong />
        <StatusItem label="X" value={mouseWorld.x.toFixed(3)} monospace />
        <StatusItem label="Y" value={mouseWorld.y.toFixed(3)} monospace />
        <StatusItem label="Zoom" value={`${(zoom * 100).toFixed(0)}%`} />
      </div>

      <div className="cad-statusbar-group">
        <StatusItem label="Layer" value={activeLayerName} />
        <StatusItem label="Dim" value={activeDimStyleName} />
        <StatusItem label="Entities" value={entityCount.toLocaleString("en-US")} />
        <StatusItem label="Doc" value={documentUnits} />

        <span className="cad-statusbar-item cad-statusbar-units">
          <span>Units</span>
          <select value={displayUnit} onChange={(event) => onDisplayUnitChange(event.currentTarget.value)}>
            <option value="um">um</option>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="km">km</option>
            <option value="in">in</option>
          </select>
        </span>

        <button
          className={`cad-statusbar-btn ${snapSettings.enabled ? "active" : ""}`}
          type="button"
          onClick={() => onSnapSettingsChange({ ...snapSettings, enabled: !snapSettings.enabled })}
          title={activeModes}
        >
          SNAP
        </button>
        <button className="cad-statusbar-btn" type="button" title="Grid placeholder">
          GRID
        </button>
        <button className="cad-statusbar-btn" type="button" title="Ortho placeholder">
          ORTHO
        </button>
        <StatusItem label="Modes" value={activeModes} />
      </div>
    </footer>
  );
}

function StatusItem({ label, monospace = false, strong = false, value }: Readonly<{ label: string; value: string; monospace?: boolean; strong?: boolean }>) {
  return (
    <span className={`cad-statusbar-item ${monospace ? "monospace" : ""} ${strong ? "strong" : ""}`} title={`${label}: ${value}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function formatActiveSnaps(settings: SnapSettings): string {
  if (!settings.enabled) {
    return "Snap off";
  }

  const activeSnaps = [
    settings.endpoint ? "Endpoint" : null,
    settings.midpoint ? "Midpoint" : null,
    settings.center ? "Center" : null,
    settings.nearest ? "Nearest" : null
  ].filter((snap): snap is string => snap !== null);

  return activeSnaps.length > 0 ? activeSnaps.join(", ") : "Snap on";
}
