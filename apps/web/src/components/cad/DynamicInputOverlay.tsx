import { useCallback, useEffect, useRef, useState } from "react";
import { worldToScreen, type Viewport } from "@cad-web/cad-renderer";
import type { Point2D } from "@cad-web/cad-geometry";

type DynamicInputOverlayProps = Readonly<{
  referencePoint: Point2D;
  cursorWorld: Point2D;
  viewport: Viewport;
  onSubmit(input: string): void;
}>;

type ActiveField = "distance" | "angle";

export function DynamicInputOverlay({
  referencePoint,
  cursorWorld,
  viewport,
  onSubmit
}: DynamicInputOverlayProps) {
  const dx = cursorWorld.x - referencePoint.x;
  const dy = cursorWorld.y - referencePoint.y;
  const dist = Math.hypot(dx, dy);
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angleDeg < 0) {
    angleDeg += 360;
  }

  const [activeField, setActiveField] = useState<ActiveField>("distance");
  const [distanceDraft, setDistanceDraft] = useState<string>("");
  const [angleDraft, setAngleDraft] = useState<string>("");
  const [hasTypedDistance, setHasTypedDistance] = useState(false);
  const [hasTypedAngle, setHasTypedAngle] = useState(false);

  const distanceRef = useRef<HTMLInputElement>(null);
  const angleRef = useRef<HTMLInputElement>(null);

  const cursorScreen = worldToScreen(cursorWorld, viewport);

  useEffect(() => {
    if (activeField === "distance") {
      distanceRef.current?.focus();
    } else {
      angleRef.current?.focus();
    }
  }, [activeField]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        setActiveField((current) => (current === "distance" ? "angle" : "distance"));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        const finalDist = hasTypedDistance ? distanceDraft : dist.toFixed(4);
        const finalAngle = hasTypedAngle ? angleDraft : angleDeg.toFixed(4);

        const parsedDist = Number.parseFloat(finalDist);
        const parsedAngle = Number.parseFloat(finalAngle);

        if (!Number.isFinite(parsedDist) || !Number.isFinite(parsedAngle)) {
          return;
        }

        onSubmit(`@${parsedDist}<${parsedAngle}`);
        setDistanceDraft("");
        setAngleDraft("");
        setHasTypedDistance(false);
        setHasTypedAngle(false);
        setActiveField("distance");
        return;
      }

      if (event.key === "Escape") {
        setDistanceDraft("");
        setAngleDraft("");
        setHasTypedDistance(false);
        setHasTypedAngle(false);
        setActiveField("distance");
      }
    },
    [angleDeg, angleDraft, dist, distanceDraft, hasTypedAngle, hasTypedDistance, onSubmit]
  );

  const displayDist = hasTypedDistance ? distanceDraft : dist.toFixed(2);
  const displayAngle = hasTypedAngle ? angleDraft : angleDeg.toFixed(1);

  const offsetX = 24;
  const offsetY = 24;

  return (
    <div
      className="cad-dynamic-input"
      style={{
        left: cursorScreen.x + offsetX,
        top: cursorScreen.y + offsetY
      }}
    >
      <div className="cad-dynamic-input-row">
        <input
          ref={distanceRef}
          className={`cad-dynamic-input-field ${activeField === "distance" ? "active" : ""}`}
          type="text"
          inputMode="decimal"
          value={displayDist}
          onChange={(event) => {
            setDistanceDraft(event.currentTarget.value);
            setHasTypedDistance(true);
          }}
          onFocus={() => setActiveField("distance")}
          onKeyDown={handleKeyDown}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          tabIndex={-1}
        />
        <span className="cad-dynamic-input-separator">,</span>
        <input
          ref={angleRef}
          className={`cad-dynamic-input-field cad-dynamic-input-angle ${activeField === "angle" ? "active" : ""}`}
          type="text"
          inputMode="decimal"
          value={displayAngle}
          onChange={(event) => {
            setAngleDraft(event.currentTarget.value);
            setHasTypedAngle(true);
          }}
          onFocus={() => setActiveField("angle")}
          onKeyDown={handleKeyDown}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          tabIndex={-1}
        />
        <span className="cad-dynamic-input-unit">°</span>
      </div>
    </div>
  );
}
