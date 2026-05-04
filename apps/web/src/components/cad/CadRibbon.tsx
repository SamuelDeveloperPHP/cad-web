import React from "react";
import type { ActiveCadTool } from "../../state/useCadStore";
import type { SnapSettings } from "@cad-web/cad-geometry";
import { 
  Minus, Square, Circle, 
  Move, RotateCw, Scaling, Eraser,
  Magnet, Grip, Maximize, 
  Layers, Upload, Download, Trash2
} from "lucide-react";

type CadRibbonProps = Readonly<{
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
  snapSettings: SnapSettings;
  onSnapSettingsChange(settings: SnapSettings): void;
  onClear(): void;
  onExport(): void;
  onExportSvg(): void;
  onImport(): void;
  onImportSvg(): void;
  activeLayerName: string;
}>;

export function CadRibbon(props: CadRibbonProps) {
  return (
    <nav className="cad-ribbon">
      {/* Group: Desenhar */}
      <div className="cad-ribbon-group">
        <div className="cad-ribbon-tools">
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "line" ? "active" : ""}`}
            onClick={() => props.onToolChange("line")}
            title="Line"
          >
            <Minus size={24} />
            <span style={{ fontSize: '10px' }}>Line</span>
          </button>
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "rectangle" ? "active" : ""}`}
            onClick={() => props.onToolChange("rectangle")}
            title="Rectangle"
          >
            <Square size={24} />
            <span style={{ fontSize: '10px' }}>Rect</span>
          </button>
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "circle" ? "active" : ""}`}
            onClick={() => props.onToolChange("circle")}
            title="Circle"
          >
            <Circle size={24} />
            <span style={{ fontSize: '10px' }}>Circle</span>
          </button>
        </div>
        <div className="cad-ribbon-title">Desenhar</div>
      </div>

      {/* Group: Modificar */}
      <div className="cad-ribbon-group">
        <div className="cad-ribbon-tools">
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "move" ? "active" : ""}`}
            onClick={() => props.onToolChange("move")}
            title="Move"
          >
            <Move size={24} />
            <span style={{ fontSize: '10px' }}>Move</span>
          </button>
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "rotate" ? "active" : ""}`}
            onClick={() => props.onToolChange("rotate")}
            title="Rotate"
          >
            <RotateCw size={24} />
            <span style={{ fontSize: '10px' }}>Rotate</span>
          </button>
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "scale" ? "active" : ""}`}
            onClick={() => props.onToolChange("scale")}
            title="Scale"
          >
            <Scaling size={24} />
            <span style={{ fontSize: '10px' }}>Scale</span>
          </button>
          <button 
            className={`cad-ribbon-btn ${props.activeTool === "erase" ? "active" : ""}`}
            onClick={() => props.onToolChange("erase")}
            title="Erase"
          >
            <Eraser size={24} />
            <span style={{ fontSize: '10px' }}>Erase</span>
          </button>
        </div>
        <div className="cad-ribbon-title">Modificar</div>
      </div>

      {/* Group: Precisão */}
      <div className="cad-ribbon-group">
        <div className="cad-ribbon-tools" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button 
              className={`cad-ribbon-btn ${props.snapSettings.enabled ? "active" : ""}`}
              onClick={() => props.onSnapSettingsChange({ ...props.snapSettings, enabled: !props.snapSettings.enabled })}
              title="Toggle Snap"
            >
              <Magnet size={24} />
              <span style={{ fontSize: '10px' }}>Snap</span>
            </button>
            <details style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#18181b', border: '1px solid var(--cad-border)', borderRadius: '4px', padding: '8px', minWidth: '120px' }}>
              <summary style={{ fontSize: '10px', color: 'var(--cad-text-muted)', cursor: 'pointer', listStyle: 'none', textAlign: 'center', marginTop: '4px' }}>▼ Opts</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#fff' }}>
                  <input type="checkbox" checked={props.snapSettings.endpoint} onChange={(e) => props.onSnapSettingsChange({ ...props.snapSettings, endpoint: e.target.checked })} /> Endpoint
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#fff' }}>
                  <input type="checkbox" checked={props.snapSettings.midpoint} onChange={(e) => props.onSnapSettingsChange({ ...props.snapSettings, midpoint: e.target.checked })} /> Midpoint
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#fff' }}>
                  <input type="checkbox" checked={props.snapSettings.center} onChange={(e) => props.onSnapSettingsChange({ ...props.snapSettings, center: e.target.checked })} /> Center
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#fff' }}>
                  <input type="checkbox" checked={props.snapSettings.nearest} onChange={(e) => props.onSnapSettingsChange({ ...props.snapSettings, nearest: e.target.checked })} /> Nearest
                </label>
              </div>
            </details>
          </div>
          <button 
            className="cad-ribbon-btn"
            title="Grid (Placeholder)"
          >
            <Grip size={24} />
            <span style={{ fontSize: '10px' }}>Grid</span>
          </button>
          <button 
            className="cad-ribbon-btn"
            title="Ortho (Placeholder)"
          >
            <Maximize size={24} />
            <span style={{ fontSize: '10px' }}>Ortho</span>
          </button>
        </div>
        <div className="cad-ribbon-title">Precisão</div>
      </div>

      {/* Group: Camadas */}
      <div className="cad-ribbon-group">
        <div className="cad-ribbon-tools" style={{ minWidth: '150px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#18181b', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--cad-border)', width: '100%' }}>
            <Layers size={16} color="var(--cad-text-muted)" />
            <span style={{ fontSize: '12px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {props.activeLayerName}
            </span>
          </div>
        </div>
        <div className="cad-ribbon-title">Camadas</div>
      </div>

      {/* Group: Arquivo */}
      <div className="cad-ribbon-group">
        <div className="cad-ribbon-tools">
          <button className="cad-ribbon-btn" onClick={props.onImport} title="Import JSON">
            <Download size={20} />
            <span style={{ fontSize: '10px' }}>Imp JSON</span>
          </button>
          <button className="cad-ribbon-btn" onClick={props.onExport} title="Export JSON">
            <Upload size={20} />
            <span style={{ fontSize: '10px' }}>Exp JSON</span>
          </button>
          <button className="cad-ribbon-btn" onClick={props.onExportSvg} title="Export SVG">
            <Upload size={20} />
            <span style={{ fontSize: '10px' }}>Exp SVG</span>
          </button>
          <button className="cad-ribbon-btn" onClick={props.onClear} title="Clear Screen" style={{ color: '#ef4444' }}>
            <Trash2 size={20} />
            <span style={{ fontSize: '10px' }}>Clear</span>
          </button>
        </div>
        <div className="cad-ribbon-title">Arquivo</div>
      </div>
    </nav>
  );
}
