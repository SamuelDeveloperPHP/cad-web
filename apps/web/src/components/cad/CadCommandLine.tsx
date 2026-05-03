import { useState } from "react";

type CadCommandLineProps = Readonly<{
  onSubmit(command: string): void;
  message?: string;
}>;

export function CadCommandLine({ onSubmit, message }: CadCommandLineProps) {
  const [value, setValue] = useState("");

  return (
    <form
      className="cad-command-line"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
        setValue("");
      }}
    >
      <label htmlFor="cad-command">Command</label>
      <input
        id="cad-command"
        value={value}
        placeholder="line, select, move, erase, pan, clear, undo, redo..."
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      {message && (
        <span className="command-message" style={{ marginLeft: "1rem", color: "var(--cad-color-accent, #10b981)" }}>
          {message}
        </span>
      )}
    </form>
  );
}
