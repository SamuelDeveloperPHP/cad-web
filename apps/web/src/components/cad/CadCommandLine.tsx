import { useState } from "react";

type CadCommandLineProps = Readonly<{
  onSubmit(command: string): void;
}>;

export function CadCommandLine({ onSubmit }: CadCommandLineProps) {
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
    </form>
  );
}
