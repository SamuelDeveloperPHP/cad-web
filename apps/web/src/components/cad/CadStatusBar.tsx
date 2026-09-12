import { useEffect, useState } from "react";
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
  onZoomPercentChange(percent: number): void;
  onZoomExtents(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomWindow(): void;
  onZoomPrevious(): void;
  zoomWindowActive: boolean;
}>;

const toolLabels: Record<ActiveCadTool, string> = {
  select: "Select",
  line: "Line",
  polyline: "Polyline",
  rectangle: "Rectangle",
  circle: "Circle",
  arc: "Arc",
  move: "Move",
  mirror: "Mirror",
  rotate: "Rotate",
  scale: "Scale",
  offset: "Offset",
  trim: "Trim",
  extend: "Extend",
  fillet: "Fillet",
  chamfer: "Chamfer",
  array: "Array",
  arrayPolar: "Array Polar",
  arrayPath: "Path Array",
  explode: "Explode",
  erase: "Erase",
  pan: "Pan",
  zoomWindow: "Zoom Window",
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
  onZoomExtents,
  onZoomIn,
  onZoomOut,
  onZoomPercentChange,
  onZoomPrevious,
  onZoomWindow,
  snapSettings,
  zoom,
  zoomWindowActive
}: CadStatusBarProps) {
  const activeModes = formatActiveSnaps(snapSettings);

  return (
    <footer className="cad-statusbar">
      <div className="cad-statusbar-group">
        <StatusItem label="Tool" value={toolLabels[activeTool]} strong />
        <StatusItem label="X" value={mouseWorld.x.toFixed(3)} monospace />
        <StatusItem label="Y" value={mouseWorld.y.toFixed(3)} monospace />
        <ZoomControl
          zoom={zoom}
          zoomWindowActive={zoomWindowActive}
          onZoomPercentChange={onZoomPercentChange}
          onZoomExtents={onZoomExtents}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomWindow={onZoomWindow}
          onZoomPrevious={onZoomPrevious}
        />
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

function ZoomControl({
  zoom,
  zoomWindowActive,
  onZoomPercentChange,
  onZoomExtents,
  onZoomIn,
  onZoomOut,
  onZoomWindow,
  onZoomPrevious
}: Readonly<{
  zoom: number;
  zoomWindowActive: boolean;
  onZoomPercentChange(percent: number): void;
  onZoomExtents(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomWindow(): void;
  onZoomPrevious(): void;
}>) {
  const currentPercent = (zoom * 100).toFixed(0);
  const [draft, setDraft] = useState(currentPercent);

  // O campo acompanha o zoom vindo do store enquanto o usuário não está digitando um novo valor.
  useEffect(() => {
    setDraft(currentPercent);
  }, [currentPercent]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(",", "."));

    if (Number.isFinite(parsed) && parsed > 0) {
      onZoomPercentChange(parsed);
    } else {
      setDraft(currentPercent);
    }
  };

  return (
    <span className="cad-statusbar-item cad-statusbar-zoom" title="Zoom (digite a porcentagem e Enter)">
      <span>Zoom</span>
      <button className="cad-statusbar-btn cad-statusbar-zoom-step" type="button" onClick={onZoomOut} title="Reduzir zoom">
        −
      </button>
      <input
        className="cad-statusbar-zoom-input"
        value={draft}
        inputMode="decimal"
        aria-label="Zoom em porcentagem"
        onChange={(event) => setDraft(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(currentPercent);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="cad-statusbar-zoom-suffix">%</span>
      <button className="cad-statusbar-btn cad-statusbar-zoom-step" type="button" onClick={onZoomIn} title="Ampliar zoom">
        +
      </button>
      <button
        className="cad-statusbar-btn"
        type="button"
        onClick={onZoomExtents}
        title="Centralizar o desenho na tela (zoom extents)"
      >
        Fit
      </button>
      <button
        className={`cad-statusbar-btn ${zoomWindowActive ? "active" : ""}`}
        type="button"
        onClick={onZoomWindow}
        title="Zoom Window: arraste um retângulo para ampliar uma região"
      >
        Win
      </button>
      <button
        className="cad-statusbar-btn"
        type="button"
        onClick={onZoomPrevious}
        title="Voltar ao zoom anterior"
      >
        Prev
      </button>
    </span>
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
