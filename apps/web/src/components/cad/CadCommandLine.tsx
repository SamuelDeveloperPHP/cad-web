import { Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadCommandLineProps = Readonly<{
  activeTool: ActiveCadTool;
  onSubmit(command: string): void;
  // Esc dentro da linha de comando: encerra o comando ativo.
  onEscape?(): void;
  // Quando true, a ferramenta espera texto livre (ex.: conteúdo do Text) e a linha de comando recebe o foco.
  focusRequested?: boolean;
  message?: string;
  workingUnit?: string;
}>;

const toolPrompts: Record<ActiveCadTool, string> = {
  select: "[Select] Select objects",
  line: "[Line] Specify first point",
  polyline: "[Polyline] Specify first point",
  rectangle: "[Rectangle] Specify first corner",
  circle: "[Circle] Specify center point",
  arc: "[Arc] Specify start point or ce for center",
  ellipse: "[Ellipse] Specify center point",
  ellipseArc: "[Ellipse Arc] Specify center point",
  text: "[Text] Specify insertion point",
  spline: "[Spline] Specify first point",
  move: "[Move] Select objects or specify base point",
  mirror: "[Mirror] Select objects, then specify mirror axis",
  rotate: "[Rotate] Specify pivot point",
  scale: "[Scale] Specify base point",
  stretch: "[Stretch] Specify first corner of stretch window",
  offset: "[Offset] Specify offset distance",
  trim: "[Trim] Select cutting edges or press Enter for all",
  extend: "[Extend] Select boundary edges or press Enter for all",
  fillet: "[Fillet] Specify radius",
  chamfer: "[Chamfer] Specify first distance",
  array: "[Array] Select objects",
  arrayPolar: "[ArrayPolar] Select objects",
  arrayPath: "[PathArray] Select objects",
  explode: "[Explode] Select objects",
  erase: "[Erase] Select objects or press Delete",
  pan: "[Pan] Drag to pan view",
  zoomWindow: "[Zoom Window] Drag a rectangle to zoom",
  dimLinear: "[DimLinear] Specify first extension origin",
  dimAligned: "[DimAligned] Specify first extension origin",
  dimRadius: "[DimRadius] Select circle",
  dimDiameter: "[DimDiameter] Select circle",
  dimAngular: "[DimAngular] Select first line"
};

export function CadCommandLine({ activeTool, onSubmit, onEscape, focusRequested, message, workingUnit }: CadCommandLineProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusRequested !== true) {
      return;
    }

    // O foco é adiado para depois do mousedown do clique no canvas, que o devolveria ao documento.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [focusRequested, message]);
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
        {workingUnit && <span className="cad-command-line-unit" title="Unidade de trabalho ativa">{workingUnit}</span>}
      </div>
      <div className="cad-command-line-input-shell">
        <span>{prompt}</span>
        <input
          id="cad-command"
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && onEscape !== undefined) {
              event.preventDefault();
              setValue("");
              onEscape();
              event.currentTarget.blur();
            }
          }}
          autoComplete="off"
          spellCheck={false}
          aria-label="Linha de comando CAD"
        />
      </div>
      {message && message !== prompt && <output className="cad-command-line-message">{message}</output>}
    </form>
  );
}
