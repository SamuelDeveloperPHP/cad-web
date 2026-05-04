import React, { useState } from "react";
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
  move: "[Move] Specify base point",
  rotate: "[Rotate] Specify pivot point",
  scale: "[Scale] Specify base point",
  erase: "[Erase] Select objects or press Delete",
  pan: "[Pan] Drag to pan view"
};

export function CadCommandLine({ activeTool, onSubmit, message }: CadCommandLineProps) {
  const [value, setValue] = useState("");

  const prompt = toolPrompts[activeTool] || "Command";

  return (
    <form
      className="cad-command-line"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
        setValue("");
      }}
    >
      <label htmlFor="cad-command" style={{ minWidth: '80px' }}>Command:</label>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', background: '#111315', padding: '0 8px', borderRadius: '2px', border: '1px solid var(--cad-border)' }}>
        <span style={{ color: 'var(--cad-accent)', marginRight: '8px', fontSize: '12px' }}>{prompt}</span>
        <input
          id="cad-command"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          autoComplete="off"
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', outline: 'none', height: '28px', fontSize: '13px' }}
        />
      </div>
      {message && (
        <span style={{ marginLeft: "1rem", color: "var(--cad-accent)" }}>
          {message}
        </span>
      )}
    </form>
  );
}
