import { useRef } from "react";
import { worldToScreen, type Viewport } from "@cad-web/cad-renderer";
import type { Point2D } from "@cad-web/cad-geometry";
import {
  computeDynamicMetrics,
  dynamicFieldCount,
  dynamicFieldLabels,
  dynamicPlaceholders,
  type DynamicInputDraft,
  type DynamicInputMode
} from "./dynamicInput";

type DynamicInputOverlayProps = Readonly<{
  mode: DynamicInputMode;
  referencePoint: Point2D;
  cursorWorld: Point2D;
  viewport: Viewport;
  draft: DynamicInputDraft;
  activeField: 0 | 1;
}>;

// O overlay é apenas visual: as teclas são capturadas globalmente pelo CadCanvas (como no AutoCAD, o usuário
// digita direto sem clicar num campo). Aqui só exibimos os valores digitados ou os valores ao vivo do cursor.
export function DynamicInputOverlay({
  mode,
  referencePoint,
  cursorWorld,
  viewport,
  draft,
  activeField
}: DynamicInputOverlayProps) {
  const metrics = computeDynamicMetrics(referencePoint, cursorWorld);
  const placeholders = dynamicPlaceholders(mode, metrics);
  const labels = dynamicFieldLabels(mode);
  const twoFields = dynamicFieldCount(mode) === 2;

  // A posição congela assim que o usuário começa a digitar, para os campos pararem de perseguir o cursor.
  const frozenScreenRef = useRef<Point2D | null>(null);
  const isTyping = draft[0] !== "" || draft[1] !== "";
  const cursorScreen = worldToScreen(cursorWorld, viewport);

  if (!isTyping) {
    frozenScreenRef.current = cursorScreen;
  }

  const position = frozenScreenRef.current ?? cursorScreen;

  return (
    <div
      className="cad-dynamic-input"
      style={{
        left: position.x + 24,
        top: position.y + 24
      }}
    >
      <div className="cad-dynamic-input-row">
        {labels.prefix0 !== null && <span className="cad-dynamic-input-label">{labels.prefix0}</span>}
        <DynamicField value={draft[0]} placeholder={placeholders[0]} active={activeField === 0} />

        {twoFields && (
          <>
            <span className="cad-dynamic-input-separator">{labels.separator}</span>
            <DynamicField value={draft[1]} placeholder={placeholders[1]} active={activeField === 1} />
            {labels.suffix1 !== null && <span className="cad-dynamic-input-unit">{labels.suffix1}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function DynamicField({
  value,
  placeholder,
  active
}: Readonly<{ value: string; placeholder: string; active: boolean }>) {
  const isEmpty = value === "";

  return (
    <span className={`cad-dynamic-input-field ${active ? "active" : ""} ${isEmpty ? "placeholder" : ""}`}>
      {isEmpty ? placeholder : value}
      {active && <span className="cad-dynamic-input-caret" />}
    </span>
  );
}
