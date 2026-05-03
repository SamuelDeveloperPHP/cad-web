import type { SnapSettings } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadToolbarProps = Readonly<{
  activeTool: ActiveCadTool;
  canUndo: boolean;
  canRedo: boolean;
  snapSettings: SnapSettings;
  onToolChange(tool: ActiveCadTool): void;
  onSnapSettingsChange(settings: SnapSettings): void;
  onUndo(): void;
  onRedo(): void;
  onClear(): void;
  onExport(): void;
  onExportSvg(): void;
  onImport(): void;
}>;

const tools: ReadonlyArray<Readonly<{ id: ActiveCadTool; label: string }>> = [
  { id: "select", label: "Select" },
  { id: "line", label: "Line" },
  { id: "rectangle", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "move", label: "Move" },
  { id: "rotate", label: "Rotate" },
  { id: "scale", label: "Scale" },
  { id: "erase", label: "Erase" },
  { id: "pan", label: "Pan" }
];

export function CadToolbar(props: CadToolbarProps) {
  const updateSnapSetting = (key: Exclude<keyof SnapSettings, "tolerancePx">, value: boolean) => {
    props.onSnapSettingsChange({
      ...props.snapSettings,
      [key]: value
    });
  };

  return (
    <aside className="cad-toolbar" aria-label="Ferramentas CAD">
      {tools.map((tool) => (
        <button
          key={tool.id}
          className={props.activeTool === tool.id ? "tool-button active" : "tool-button"}
          type="button"
          onClick={() => props.onToolChange(tool.id)}
        >
          {tool.label}
        </button>
      ))}
      <div className="toolbar-separator" />
      <details className="snap-control">
        <summary className={props.snapSettings.enabled ? "tool-button active" : "tool-button"}>
          Snap {props.snapSettings.enabled ? "ON" : "OFF"}
        </summary>
        <label className="snap-option">
          <input
            type="checkbox"
            checked={props.snapSettings.enabled}
            onChange={(event) => updateSnapSetting("enabled", event.currentTarget.checked)}
          />
          Enabled
        </label>
        <label className="snap-option">
          <input
            type="checkbox"
            checked={props.snapSettings.endpoint}
            onChange={(event) => updateSnapSetting("endpoint", event.currentTarget.checked)}
          />
          Endpoint
        </label>
        <label className="snap-option">
          <input
            type="checkbox"
            checked={props.snapSettings.midpoint}
            onChange={(event) => updateSnapSetting("midpoint", event.currentTarget.checked)}
          />
          Midpoint
        </label>
        <label className="snap-option">
          <input
            type="checkbox"
            checked={props.snapSettings.center}
            onChange={(event) => updateSnapSetting("center", event.currentTarget.checked)}
          />
          Center
        </label>
        <label className="snap-option">
          <input
            type="checkbox"
            checked={props.snapSettings.nearest}
            onChange={(event) => updateSnapSetting("nearest", event.currentTarget.checked)}
          />
          Nearest
        </label>
      </details>
      <div className="toolbar-separator" />
      <button className="tool-button" type="button" onClick={props.onUndo} disabled={!props.canUndo}>
        Undo
      </button>
      <button className="tool-button" type="button" onClick={props.onRedo} disabled={!props.canRedo}>
        Redo
      </button>
      <div className="toolbar-separator" />
      <button className="tool-button danger" type="button" onClick={props.onClear}>
        Clear
      </button>
      <button className="tool-button" type="button" onClick={props.onExport}>
        Export JSON
      </button>
      <button className="tool-button" type="button" onClick={props.onExportSvg}>
        Export SVG
      </button>
      <button className="tool-button" type="button" onClick={props.onImport}>
        Import JSON
      </button>
    </aside>
  );
}
