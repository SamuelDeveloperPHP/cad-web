import { useCallback, useEffect, useRef, useState } from "react";
import { worldToScreen, type Viewport } from "@cad-web/cad-renderer";
import type { Point2D } from "@cad-web/cad-geometry";

// O modo determina quais campos aparecem e como a submissão é formatada para a ferramenta ativa:
// - polar: distância + ângulo (Line, Polyline, Arc, Ellipse) -> "@dist<ângulo"
// - cartesian: largura + altura (Rectangle) -> "dx,dy"
// - radius: apenas o raio (Circle) -> "raio"
export type DynamicInputMode = "polar" | "cartesian" | "radius";

type DynamicInputOverlayProps = Readonly<{
  mode: DynamicInputMode;
  referencePoint: Point2D;
  cursorWorld: Point2D;
  viewport: Viewport;
  onSubmit(input: string): void;
}>;

export function DynamicInputOverlay({
  mode,
  referencePoint,
  cursorWorld,
  viewport,
  onSubmit
}: DynamicInputOverlayProps) {
  const dx = cursorWorld.x - referencePoint.x;
  const dyWorld = cursorWorld.y - referencePoint.y;
  const dist = Math.hypot(dx, dyWorld);
  // Convenção AutoCAD: 0° = Leste, 90° = Norte (para cima), sentido anti-horário.
  // Como o eixo Y do mundo cresce para baixo na tela, o sinal do Y é invertido para medir o ângulo visual.
  let angleDeg = (Math.atan2(-dyWorld, dx) * 180) / Math.PI;
  if (angleDeg < 0) {
    angleDeg += 360;
  }

  const hasTwoFields = mode !== "radius";

  const [activeField, setActiveField] = useState<0 | 1>(0);
  const [draft0, setDraft0] = useState<string>("");
  const [draft1, setDraft1] = useState<string>("");

  const field0Ref = useRef<HTMLInputElement>(null);
  const field1Ref = useRef<HTMLInputElement>(null);
  // A posição é congelada assim que o usuário começa a digitar, para os campos pararem de perseguir o cursor.
  const frozenScreenRef = useRef<Point2D | null>(null);

  const isTyping = draft0 !== "" || draft1 !== "";
  const cursorScreen = worldToScreen(cursorWorld, viewport);

  if (!isTyping) {
    frozenScreenRef.current = cursorScreen;
  }

  const position = frozenScreenRef.current ?? cursorScreen;

  useEffect(() => {
    // O foco vai para o campo ativo assim que o overlay aparece ou o usuário troca de campo com Tab.
    if (activeField === 0) {
      field0Ref.current?.focus();
    } else {
      field1Ref.current?.focus();
    }
  }, [activeField]);

  const resetDrafts = useCallback(() => {
    setDraft0("");
    setDraft1("");
    setActiveField(0);
    frozenScreenRef.current = null;
  }, []);

  const buildSubmission = useCallback((): string | null => {
    if (mode === "radius") {
      const radius = draft0 !== "" ? Number.parseFloat(draft0) : dist;
      return Number.isFinite(radius) && radius > 0 ? `${radius}` : null;
    }

    if (mode === "cartesian") {
      const width = draft0 !== "" ? Number.parseFloat(draft0) : Math.abs(dx);
      const height = draft1 !== "" ? Number.parseFloat(draft1) : Math.abs(dyWorld);

      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
      }

      // As dimensões digitadas são positivas; o sinal segue o quadrante atual do cursor.
      const signX = dx >= 0 ? 1 : -1;
      const signY = dyWorld >= 0 ? 1 : -1;
      return `${signX * Math.abs(width)},${signY * Math.abs(height)}`;
    }

    // mode === "polar"
    const finalDist = draft0 !== "" ? Number.parseFloat(draft0) : dist;
    const finalAngle = draft1 !== "" ? Number.parseFloat(draft1) : angleDeg;

    if (!Number.isFinite(finalDist) || finalDist <= 0 || !Number.isFinite(finalAngle)) {
      return null;
    }

    // O ângulo é exibido na convenção visual do AutoCAD (Y para cima); o polar do desenho usa Y do mundo
    // (para baixo na tela), então o sinal é invertido para o ponto cair exatamente onde o cursor indica.
    return `@${finalDist}<${-finalAngle}`;
  }, [angleDeg, draft0, draft1, dist, dx, dyWorld, mode]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab" && hasTwoFields) {
        event.preventDefault();
        event.stopPropagation();
        setActiveField((current) => (current === 0 ? 1 : 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        const submission = buildSubmission();

        if (submission !== null) {
          onSubmit(submission);
        }

        resetDrafts();
        return;
      }

      if (event.key === "Escape") {
        resetDrafts();
      }
    },
    [buildSubmission, hasTwoFields, onSubmit, resetDrafts]
  );

  const labels = getFieldLabels(mode);
  const placeholder0 =
    mode === "radius" ? dist.toFixed(2) : mode === "cartesian" ? Math.abs(dx).toFixed(2) : dist.toFixed(2);
  const placeholder1 = mode === "cartesian" ? Math.abs(dyWorld).toFixed(2) : angleDeg.toFixed(1);

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
        <input
          ref={field0Ref}
          className={`cad-dynamic-input-field ${activeField === 0 ? "active" : ""}`}
          type="text"
          inputMode="decimal"
          value={draft0}
          placeholder={placeholder0}
          onChange={(event) => setDraft0(event.currentTarget.value)}
          onFocus={() => setActiveField(0)}
          onKeyDown={handleKeyDown}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          tabIndex={-1}
        />
        {labels.suffix0 !== null && <span className="cad-dynamic-input-unit">{labels.suffix0}</span>}

        {hasTwoFields && (
          <>
            <span className="cad-dynamic-input-separator">{labels.separator}</span>
            <input
              ref={field1Ref}
              className={`cad-dynamic-input-field ${activeField === 1 ? "active" : ""}`}
              type="text"
              inputMode="decimal"
              value={draft1}
              placeholder={placeholder1}
              onChange={(event) => setDraft1(event.currentTarget.value)}
              onFocus={() => setActiveField(1)}
              onKeyDown={handleKeyDown}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              tabIndex={-1}
            />
            {labels.suffix1 !== null && <span className="cad-dynamic-input-unit">{labels.suffix1}</span>}
          </>
        )}
      </div>
    </div>
  );
}

type FieldLabels = Readonly<{
  prefix0: string | null;
  suffix0: string | null;
  separator: string;
  suffix1: string | null;
}>;

function getFieldLabels(mode: DynamicInputMode): FieldLabels {
  if (mode === "radius") {
    return { prefix0: "R", suffix0: null, separator: "", suffix1: null };
  }

  if (mode === "cartesian") {
    return { prefix0: null, suffix0: null, separator: "×", suffix1: null };
  }

  // polar
  return { prefix0: null, suffix0: null, separator: "<", suffix1: "°" };
}
