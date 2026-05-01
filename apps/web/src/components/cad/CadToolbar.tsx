import type { ActiveCadTool } from "../../state/useCadStore";

type CadToolbarProps = Readonly<{
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
  onClear(): void;
  onExport(): void;
  onImport(): void;
}>;

const tools: ReadonlyArray<Readonly<{ id: ActiveCadTool; label: string }>> = [
  { id: "select", label: "Select" },
  { id: "line", label: "Line" },
  { id: "erase", label: "Erase" },
  { id: "pan", label: "Pan" }
];

export function CadToolbar(props: CadToolbarProps) {
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
      <button className="tool-button danger" type="button" onClick={props.onClear}>
        Clear
      </button>
      <button className="tool-button" type="button" onClick={props.onExport}>
        Export JSON
      </button>
      <button className="tool-button" type="button" onClick={props.onImport}>
        Import JSON
      </button>
    </aside>
  );
}
