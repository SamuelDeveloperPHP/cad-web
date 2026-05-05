import { Terminal } from "lucide-react";
import { useState } from "react";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadCommandLineProps = Readonly<{
  activeTool: ActiveCadTool;
  onSubmit(command: string): void;
  message?: string;
}>;

const toolPrompts: Record<ActiveCadTool, string> = {
  select: "[Select] Select objects",
  line: "[Line] Specify first point",
  rectangle: "[Rectangle] Specify first corner",
  circle: "[Circle] Specify center point",
  move: "[Move] Select objects or specify base point",
  rotate: "[Rotate] Specify pivot point",
  scale: "[Scale] Specify base point",
  offset: "[Offset] Specify offset distance",
  trim: "[Trim] Select cutting edges or press Enter for all",
  extend: "[Extend] Select boundary edges or press Enter for all",
  erase: "[Erase] Select objects or press Delete",
  pan: "[Pan] Drag to pan view",
  dimLinear: "[DimLinear] Specify first extension origin",
  dimAligned: "[DimAligned] Specify first extension origin",
  dimRadius: "[DimRadius] Select circle",
  dimDiameter: "[DimDiameter] Select circle",
  dimAngular: "[DimAngular] Select first line"
};

export function CadCommandLine({ activeTool, onSubmit, message }: CadCommandLineProps) {
  const [value, setValue] = useState("");
  const defaultPrompt = toolPrompts[activeTool] ?? "Command";
  const prompt = message?.startsWith("[") === true ? message : defaultPrompt;

  return (
    <form
      className="cad-command-line"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
        setValue("");
      }}
    >
      <div className="cad-command-line-label">
        <Terminal size={14} />
        <label htmlFor="cad-command">Command</label>
      </div>
      <div className="cad-command-line-input-shell">
        <span>{prompt}</span>
        <input
          id="cad-command"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="Linha de comando CAD"
        />
      </div>
      {message && message !== prompt && <output className="cad-command-line-message">{message}</output>}
    </form>
  );
}
