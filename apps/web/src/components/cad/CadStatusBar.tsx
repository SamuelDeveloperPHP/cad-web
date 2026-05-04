import React from "react";
import type { Point2D, SnapSettings } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";
import { MousePointer2, Minus, Square, Circle, Move, RotateCw, Scaling, Eraser, Hand } from "lucide-react";

type CadStatusBarProps = Readonly<{
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  zoom: number;
  entityCount: number;
  snapSettings: SnapSettings;
  activeLayerName: string;
  onSnapSettingsChange(settings: SnapSettings): void;
}>;

const toolLabels: Record<ActiveCadTool, string> = {
  select: "Select",
  line: "Line",
  rectangle: "Rectangle",
  circle: "Circle",
  move: "Move",
  rotate: "Rotate",
  scale: "Scale",
  offset: "Offset",
  erase: "Erase",
  pan: "Pan"
};

export function CadStatusBar({ activeTool, mouseWorld, zoom, entityCount, snapSettings, activeLayerName, onSnapSettingsChange }: CadStatusBarProps) {
  const toggleSnap = () => {
    onSnapSettingsChange({ ...snapSettings, enabled: !snapSettings.enabled });
  };

  return (
    <footer className="cad-statusbar">
      <div className="cad-statusbar-group">
        <span className="cad-statusbar-item" style={{ minWidth: '100px' }}>
          <strong style={{ color: 'var(--cad-text)' }}>{toolLabels[activeTool]}</strong>
        </span>
        <span className="cad-statusbar-item" style={{ fontFamily: 'monospace' }}>
          X: {mouseWorld.x.toFixed(3).padStart(8, ' ')} &nbsp; Y: {mouseWorld.y.toFixed(3).padStart(8, ' ')}
        </span>
      </div>
      
      <div className="cad-statusbar-group">
        <span className="cad-statusbar-item" title="Zoom">
          Zoom: {(zoom * 100).toFixed(0)}%
        </span>
        <span className="cad-statusbar-item" title="Active Layer">
          Layer: {activeLayerName}
        </span>
        <span className="cad-statusbar-item" title="Entity Count">
          Entities: {entityCount}
        </span>

        <div style={{ width: '1px', height: '16px', background: 'var(--cad-border)' }}></div>

        <button 
          className={`cad-statusbar-btn ${snapSettings.enabled ? 'active' : ''}`}
          onClick={toggleSnap}
          title={formatActiveSnaps(snapSettings)}
        >
          SNAP
        </button>
        <button 
          className="cad-statusbar-btn"
          title="Grid Placeholder"
        >
          GRID
        </button>
        <button 
          className="cad-statusbar-btn"
          title="Ortho Placeholder"
        >
          ORTHO
        </button>
      </div>
    </footer>
  );
}

function formatActiveSnaps(settings: SnapSettings): string {
  if (!settings.enabled) {
    return "Snap disabled";
  }

  const activeSnaps = [
    settings.endpoint ? "Endpoint" : null,
    settings.midpoint ? "Midpoint" : null,
    settings.center ? "Center" : null,
    settings.nearest ? "Nearest" : null
  ].filter((snap): snap is string => snap !== null);

  return activeSnaps.length > 0 ? activeSnaps.join(", ") : "No active snaps";
}
