import { useEffect, useState } from "react";
import { formatMeasurement, type Point2D, type SnapSettings } from "@cad-web/cad-geometry";
import type { ActiveCadTool } from "../../state/useCadStore";
import type { GuideSettings } from "../../services/guideSettingsStorage";
import { formatZoomScaleLabel, parseZoomScaleInput } from "../../services/zoomScale";
import { LENGTH_DECIMALS } from "../../services/workingUnits";

// Casas decimais na leitura de coordenadas por unidade (compartilhadas com o painel de propriedades).
const COORD_DECIMALS = LENGTH_DECIMALS;

type CadStatusBarProps = Readonly<{
  activeTool: ActiveCadTool;
  mouseWorld: Point2D;
  zoom: number;
  entityCount: number;
  snapSettings: SnapSettings;
  guideSettings: GuideSettings;
  activeLayerName: string;
  activeDimStyleName: string;
  displayUnit: string;
  documentUnits: string;
  onSnapSettingsChange(settings: SnapSettings): void;
  onToggleCursorGuides(): void;
  onToggleAxisLines(): void;
  onToggleDynamicInput(): void;
  onDisplayUnitChange(unit: string): void;
  onZoomScaleChange(scale: number): void;
  onZoomExtents(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomWindow(): void;
  onZoomPrevious(): void;
  zoomWindowActive: boolean;
}>;

const toolLabels: Record<ActiveCadTool, string> = {
  select: "Select",
  line: "Line",
  polyline: "Polyline",
  rectangle: "Rectangle",
  circle: "Circle",
  arc: "Arc",
  ellipse: "Ellipse",
  ellipseArc: "Ellipse Arc",
  text: "Text",
  move: "Move",
  mirror: "Mirror",
  rotate: "Rotate",
  scale: "Scale",
  stretch: "Stretch",
  offset: "Offset",
  trim: "Trim",
  extend: "Extend",
  fillet: "Fillet",
  chamfer: "Chamfer",
  array: "Array",
  arrayPolar: "Array Polar",
  arrayPath: "Path Array",
  explode: "Explode",
  erase: "Erase",
  pan: "Pan",
  zoomWindow: "Zoom Window",
  dimLinear: "Dim Linear",
  dimAligned: "Dim Aligned",
  dimRadius: "Dim Radius",
  dimDiameter: "Dim Diameter",
  dimAngular: "Dim Angular"
};

export function CadStatusBar({
  activeDimStyleName,
  activeLayerName,
  activeTool,
  displayUnit,
  documentUnits,
  entityCount,
  guideSettings,
  mouseWorld,
  onDisplayUnitChange,
  onSnapSettingsChange,
  onToggleAxisLines,
  onToggleCursorGuides,
  onToggleDynamicInput,
  onZoomExtents,
  onZoomIn,
  onZoomOut,
  onZoomScaleChange,
  onZoomPrevious,
  onZoomWindow,
  snapSettings,
  zoom,
  zoomWindowActive
}: CadStatusBarProps) {
  const activeModes = formatActiveSnaps(snapSettings);

  // A leitura de coordenadas converte da unidade base do documento para a unidade selecionada.
  const coordDecimals = COORD_DECIMALS[displayUnit] ?? 3;
  const formatCoord = (value: number): string =>
    `${formatMeasurement(value, documentUnits, displayUnit, coordDecimals)} ${displayUnit}`;

  return (
    <footer className="cad-statusbar">
      <div className="cad-statusbar-group">
        <StatusItem label="Tool" value={toolLabels[activeTool]} strong />
        <StatusItem label="X" value={formatCoord(mouseWorld.x)} monospace />
        <StatusItem label="Y" value={formatCoord(mouseWorld.y)} monospace />
        <ZoomControl
          zoom={zoom}
          units={documentUnits}
          zoomWindowActive={zoomWindowActive}
          onZoomScaleChange={onZoomScaleChange}
          onZoomExtents={onZoomExtents}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomWindow={onZoomWindow}
          onZoomPrevious={onZoomPrevious}
        />
      </div>

      <div className="cad-statusbar-group">
        <StatusItem label="Layer" value={activeLayerName} />
        <StatusItem label="Dim" value={activeDimStyleName} />
        <StatusItem label="Entities" value={entityCount.toLocaleString("en-US")} />
        <StatusItem label="Doc" value={documentUnits} />

        <span className="cad-statusbar-item cad-statusbar-units">
          <span>Units</span>
          <select value={displayUnit} onChange={(event) => onDisplayUnitChange(event.currentTarget.value)}>
            <option value="um">um</option>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="km">km</option>
            <option value="in">in</option>
          </select>
        </span>

        <button
          className={`cad-statusbar-btn ${snapSettings.enabled ? "active" : ""}`}
          type="button"
          onClick={() => onSnapSettingsChange({ ...snapSettings, enabled: !snapSettings.enabled })}
          title={activeModes}
        >
          SNAP
        </button>
        <button className="cad-statusbar-btn" type="button" title="Grid placeholder">
          GRID
        </button>
        <button className="cad-statusbar-btn" type="button" title="Ortho placeholder">
          ORTHO
        </button>
        <button
          className={`cad-statusbar-btn ${guideSettings.cursorGuides ? "active" : ""}`}
          type="button"
          onClick={onToggleCursorGuides}
          title="Mira tracejada que acompanha o cursor (comando: cursor)"
        >
          CURSOR
        </button>
        <button
          className={`cad-statusbar-btn ${guideSettings.axisLines ? "active" : ""}`}
          type="button"
          onClick={onToggleAxisLines}
          title="Linhas de eixo X (vermelha) e Y (verde) na origem (comando: eixo)"
        >
          EIXOS
        </button>
        <button
          className={`cad-statusbar-btn ${guideSettings.dynamicInput ? "active" : ""}`}
          type="button"
          onClick={onToggleDynamicInput}
          title="Entrada dinâmica com distância e ângulo perto do cursor (comando: dynput)"
        >
          DYN
        </button>
        <StatusItem label="Modes" value={activeModes} />
      </div>
    </footer>
  );
}

function ZoomControl({
  zoom,
  units,
  zoomWindowActive,
  onZoomScaleChange,
  onZoomExtents,
  onZoomIn,
  onZoomOut,
  onZoomWindow,
  onZoomPrevious
}: Readonly<{
  zoom: number;
  units: string;
  zoomWindowActive: boolean;
  onZoomScaleChange(scale: number): void;
  onZoomExtents(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onZoomWindow(): void;
  onZoomPrevious(): void;
}>) {
  // O rótulo é a escala de engenharia (1:N reduz, N:1 amplia) derivada do fator interno px/unidade.
  const currentLabel = formatZoomScaleLabel(zoom, units);
  const [draft, setDraft] = useState(currentLabel);

  // O campo acompanha a escala vinda do store enquanto o usuário não está digitando um novo valor.
  useEffect(() => {
    setDraft(currentLabel);
  }, [currentLabel]);

  const commit = () => {
    const nextScale = parseZoomScaleInput(draft, units);

    if (nextScale !== null) {
      onZoomScaleChange(nextScale);
    } else {
      setDraft(currentLabel);
    }
  };

  return (
    <span className="cad-statusbar-item cad-statusbar-zoom" title="Escala (digite 1:50, 2:1 e Enter)">
      <span>Escala</span>
      <button className="cad-statusbar-btn cad-statusbar-zoom-step" type="button" onClick={onZoomOut} title="Reduzir zoom">
        −
      </button>
      <input
        className="cad-statusbar-zoom-input"
        value={draft}
        inputMode="text"
        aria-label="Escala do desenho (ex.: 1:50 ou 2:1)"
        onChange={(event) => setDraft(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(currentLabel);
            event.currentTarget.blur();
          }
        }}
      />
      <button className="cad-statusbar-btn cad-statusbar-zoom-step" type="button" onClick={onZoomIn} title="Ampliar zoom">
        +
      </button>
      <button
        className="cad-statusbar-btn"
        type="button"
        onClick={onZoomExtents}
        title="Centralizar o desenho na tela (zoom extents)"
      >
        Fit
      </button>
      <button
        className={`cad-statusbar-btn ${zoomWindowActive ? "active" : ""}`}
        type="button"
        onClick={onZoomWindow}
        title="Zoom Window: arraste um retângulo para ampliar uma região"
      >
        Win
      </button>
      <button
        className="cad-statusbar-btn"
        type="button"
        onClick={onZoomPrevious}
        title="Voltar ao zoom anterior"
      >
        Prev
      </button>
    </span>
  );
}

function StatusItem({ label, monospace = false, strong = false, value }: Readonly<{ label: string; value: string; monospace?: boolean; strong?: boolean }>) {
  return (
    <span className={`cad-statusbar-item ${monospace ? "monospace" : ""} ${strong ? "strong" : ""}`} title={`${label}: ${value}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function formatActiveSnaps(settings: SnapSettings): string {
  if (!settings.enabled) {
    return "Snap off";
  }

  const activeSnaps = [
    settings.endpoint ? "Endpoint" : null,
    settings.insertion ? "Insertion" : null,
    settings.midpoint ? "Midpoint" : null,
    settings.center ? "Center" : null,
    settings.quadrant ? "Quadrant" : null,
    settings.intersection ? "Intersection" : null,
    settings.perpendicular ? "Perpendicular" : null,
    settings.tangent ? "Tangent" : null,
    settings.nearest ? "Nearest" : null
  ].filter((snap): snap is string => snap !== null);

  return activeSnaps.length > 0 ? activeSnaps.join(", ") : "Snap on";
}
