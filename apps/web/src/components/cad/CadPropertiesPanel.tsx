import React, { useState, useEffect } from "react";
import { ReplaceEntityCommand, UpdateEntityCommand, UpdateEntitiesBatchCommand, resolveDimensionStyle, type ArcEntity, type CadEntity, type EllipseEntity, type SplineEntity, type TextEntity } from "@cad-web/cad-core";
import { lineLength, rectangleArea, rectanglePerimeter, circleArea, circleCircumference, formatMeasurement, buildAngularDimensionGeometry, getPolylineLength, DIMENSION_ARROW_TYPES, arcAnglesFromVisual, arcVisualAngles, ellipseArcVisualAngles, ellipseArcParamsFromVisual, ellipseArcLength, normalizeEllipseAxes, bezierChainLength, fitPointsToBezierChain, visualDegreesToWorldRadians, worldRadiansToVisualDegrees, type DimensionArrowType } from "@cad-web/cad-geometry";
import { workingLengthFormat } from "../../services/workingUnits";

// Rótulos dos terminadores de cota exibidos no seletor de setas.
const ARROW_TYPE_LABELS: Record<DimensionArrowType, string> = {
  tick: "Architectural Tick",
  arrow: "Filled Arrow",
  open: "Open Arrow",
  dot: "Dot",
  none: "None"
};

// Fontes oferecidas no seletor; o texto aceita qualquer família, mas estas cobrem os usos comuns.
const TEXT_FONT_OPTIONS: ReadonlyArray<Readonly<{ value: string; label: string }>> = [
  { value: "", label: "Arial (padrão)" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Verdana", label: "Verdana" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Courier New", label: "Courier New" },
  { value: "monospace", label: "Monospace" },
  { value: "serif", label: "Serif" }
];

// Ângulo visual (anti-horário, 0° = Leste) de um segmento no mundo com Y para baixo.
function visualSegmentAngle(start: { x: number; y: number }, end: { x: number; y: number }): number {
  return worldRadiansToVisualDegrees(Math.atan2(end.y - start.y, end.x - start.x));
}

const selectStyle = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  background: disabled ? 'transparent' : 'var(--cad-bg-dark)',
  color: 'var(--cad-text)',
  border: disabled ? 'none' : '1px solid var(--cad-border)',
  fontSize: '11px',
  padding: '2px'
});

// Área de texto de várias linhas que confirma no blur ou com Ctrl+Enter (Enter sozinho quebra a linha).
function PropertyTextArea({ value, readOnly, onChange }: { value: string, readOnly?: boolean, onChange: (val: string) => void }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const commit = () => {
    // O texto não pode ficar vazio (o formato exige conteúdo); nesse caso o valor anterior volta.
    if (localValue.trim() === "") {
      setLocalValue(value);
      return;
    }
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <textarea
      value={localValue}
      readOnly={readOnly}
      rows={Math.min(6, Math.max(2, localValue.split("\n").length))}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          setLocalValue(value);
        }
      }}
      style={{
        width: '100%',
        padding: '4px',
        background: readOnly ? 'transparent' : 'var(--cad-bg-dark)',
        border: readOnly ? 'none' : '1px solid var(--cad-border)',
        color: 'var(--cad-text)',
        fontSize: '11px',
        outline: 'none',
        borderRadius: '2px',
        resize: 'vertical',
        fontFamily: 'inherit'
      }}
    />
  );
}

function PropertyRow({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--cad-border)' }}>
      <span style={{ fontSize: '11px', color: 'var(--cad-text-muted)' }}>{label}</span>
      <div style={{ width: '60%' }}>{children}</div>
    </div>
  );
}

function PropertyInput({ value, readOnly, onChange, type = "text" }: { value: string | number, readOnly?: boolean, onChange?: (val: string) => void, type?: string }) {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleBlur = () => {
    if (localValue !== String(value) && onChange) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setLocalValue(String(value));
    }
  };

  return (
    <input
      type={type}
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      style={{
        width: '100%',
        padding: '4px',
        background: readOnly ? 'transparent' : 'var(--cad-bg-dark)',
        border: readOnly ? 'none' : '1px solid var(--cad-border)',
        color: readOnly ? 'var(--cad-text-muted)' : 'var(--cad-text)',
        fontSize: '11px',
        outline: 'none',
        borderRadius: '2px',
        textAlign: type === "number" ? "right" : "left"
      }}
    />
  );
}

import type { CadStore } from "../../state/useCadStore";

export function CadPropertiesPanel({ cad }: { cad: CadStore }) {
  const selectedIds = cad.selectedEntityIds;
  const entities = cad.document.entities.filter(e => selectedIds.includes(e.id));
  const layers = cad.document.layers;

  if (entities.length === 0) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--cad-text-muted)', fontSize: '12px' }}>
        Nenhuma entidade selecionada
      </div>
    );
  }

  const handleUpdateSingle = (id: string, patch: Partial<CadEntity>) => {
    cad.executeCommand(new UpdateEntityCommand(id, patch));
  };

  const handleUpdateMultiple = (ids: string[], patch: Partial<CadEntity>) => {
    cad.executeCommand(new UpdateEntitiesBatchCommand(ids, patch));
  };

  const parseNumber = (val: string, fallback: number) => {
    const num = parseFloat(val);
    if (isNaN(num) || !isFinite(num)) return fallback;
    return num;
  };

  // O painel agrupa edicoes quando ha selecao multipla.
  if (entities.length > 1) {
    const first = entities[0]!;
    const sameLayer = entities.every(e => e.layerId === first.layerId) ? first.layerId : "";
    const sameColor = entities.every(e => (e as any).color === (first as any).color) ? (first as any).color : "";

    return (
      <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '8px', background: '#18181b', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid var(--cad-border)' }}>
          Múltiplas ({entities.length})
        </div>
        
        <PropertyRow label="Layer">
          <select 
            value={sameLayer}
            onChange={e => {
              if (e.target.value) {
                const ids = entities.filter(ent => {
                  const layer = cad.document.layers.find(l => l.id === ent.layerId);
                  return !layer?.locked;
                }).map(ent => ent.id);
                if (ids.length > 0) handleUpdateMultiple(ids, { layerId: e.target.value });
              }
            }}
            style={{ width: '100%', background: 'var(--cad-bg-dark)', color: 'var(--cad-text)', border: '1px solid var(--cad-border)', fontSize: '11px', padding: '2px' }}
          >
            <option value="" disabled>*Várias*</option>
            {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </PropertyRow>

        <PropertyRow label="Color">
          <input 
            type="color" 
            value={sameColor || "#ffffff"}
            onChange={e => {
              const ids = entities.filter(ent => {
                const layer = cad.document.layers.find(l => l.id === ent.layerId);
                return !layer?.locked;
              }).map(ent => ent.id);
              if (ids.length > 0) handleUpdateMultiple(ids, { color: e.target.value } as any);
            }}
            style={{ width: '100%', height: '20px', padding: 0, border: 'none', background: 'transparent' }}
          />
        </PropertyRow>

        <PropertyRow label="Line Type">
          <select 
            value={entities.every(e => (e as any).lineType === (first as any).lineType) ? ((first as any).lineType || "solid") : ""}
            onChange={e => {
              const ids = entities.filter(ent => {
                const layer = cad.document.layers.find(l => l.id === ent.layerId);
                return !layer?.locked;
              }).map(ent => ent.id);
              if (ids.length > 0) handleUpdateMultiple(ids, { lineType: e.target.value } as any);
            }}
            style={{ width: '100%', background: 'var(--cad-bg-dark)', color: 'var(--cad-text)', border: '1px solid var(--cad-border)', fontSize: '11px', padding: '2px' }}
          >
            <option value="" disabled>*Várias*</option>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </PropertyRow>

        <PropertyRow label="Thickness">
          <PropertyInput 
            type="number" 
            value={entities.every(e => (e as any).lineThickness === (first as any).lineThickness) ? ((first as any).lineThickness || 1) : ""} 
            onChange={val => {
              const ids = entities.filter(ent => {
                const layer = cad.document.layers.find(l => l.id === ent.layerId);
                return !layer?.locked;
              }).map(ent => ent.id);
              if (ids.length > 0) {
                const num = parseNumber(val, 1);
                handleUpdateMultiple(ids, { lineThickness: num } as any);
              }
            }} 
          />
        </PropertyRow>
      </div>
    );
  }

  // O painel exibe propriedades detalhadas quando ha uma unica entidade selecionada.
  const entity = entities[0]!;
  const layer = cad.document.layers.find(l => l.id === entity.layerId);
  const isLocked = layer?.locked ?? false;
  // Comprimentos são exibidos e digitados na unidade de trabalho; o documento continua na base.
  const len = workingLengthFormat(cad.document);
  const unitLabel = (label: string) => `${label} (${len.unit})`;
  const isText = entity.type === "text";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', opacity: isLocked ? 0.7 : 1 }}>
      <div style={{ padding: '8px', background: '#18181b', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid var(--cad-border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ textTransform: 'capitalize' }}>{entity.type}</span>
        {isLocked && <span style={{ color: '#ef4444', fontSize: '10px' }}>Bloqueada</span>}
      </div>

      <PropertyRow label="ID"><PropertyInput value={entity.id} readOnly /></PropertyRow>
      <PropertyRow label="Type"><PropertyInput value={entity.type} readOnly /></PropertyRow>

      <PropertyRow label="Layer">
        <select 
          value={entity.layerId}
          disabled={isLocked}
          onChange={e => handleUpdateSingle(entity.id, { layerId: e.target.value })}
          style={{ width: '100%', background: isLocked ? 'transparent' : 'var(--cad-bg-dark)', color: 'var(--cad-text)', border: isLocked ? 'none' : '1px solid var(--cad-border)', fontSize: '11px', padding: '2px' }}
        >
          {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </PropertyRow>

      <PropertyRow label="Color">
        <input 
          type="color" 
          value={(entity as any).color || layer?.color || "#ffffff"}
          disabled={isLocked}
          onChange={e => handleUpdateSingle(entity.id, { color: e.target.value } as any)}
          style={{ width: '100%', height: '20px', padding: 0, border: 'none', background: 'transparent' }}
        />
      </PropertyRow>

      {!isText && <PropertyRow label="Line Type">
        <select 
          value={(entity as any).lineType || "solid"}
          disabled={isLocked}
          onChange={e => handleUpdateSingle(entity.id, { lineType: e.target.value } as any)}
          style={{ width: '100%', background: isLocked ? 'transparent' : 'var(--cad-bg-dark)', color: 'var(--cad-text)', border: isLocked ? 'none' : '1px solid var(--cad-border)', fontSize: '11px', padding: '2px' }}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </PropertyRow>}

      {!isText && <PropertyRow label="Thickness">
        <PropertyInput 
          type="number" 
          value={(entity as any).lineThickness ?? 1} 
          readOnly={isLocked} 
          onChange={val => handleUpdateSingle(entity.id, { lineThickness: parseNumber(val, 1) } as any)} 
        />
      </PropertyRow>}

      {entity.type === "line" && (
        <>
          <PropertyRow label={unitLabel("Start X")}><PropertyInput value={len.format((entity as any).start.x)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { start: { ...(entity as any).start, x: len.parse(val, (entity as any).start.x) } } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("Start Y")}><PropertyInput value={len.format((entity as any).start.y)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { start: { ...(entity as any).start, y: len.parse(val, (entity as any).start.y) } } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("End X")}><PropertyInput value={len.format((entity as any).end.x)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { end: { ...(entity as any).end, x: len.parse(val, (entity as any).end.x) } } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("End Y")}><PropertyInput value={len.format((entity as any).end.y)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { end: { ...(entity as any).end, y: len.parse(val, (entity as any).end.y) } } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("Length")}><PropertyInput value={len.format(lineLength((entity as any).start, (entity as any).end))} readOnly /></PropertyRow>
          <PropertyRow label="Angle"><PropertyInput value={visualSegmentAngle((entity as any).start, (entity as any).end).toFixed(2) + "°"} readOnly /></PropertyRow>
        </>
      )}

      {entity.type === "rectangle" && (
        <>
          <PropertyRow label={unitLabel("X")}><PropertyInput value={len.format((entity as any).x)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { x: len.parse(val, (entity as any).x) } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("Y")}><PropertyInput value={len.format((entity as any).y)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { y: len.parse(val, (entity as any).y) } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("Width")}><PropertyInput value={len.format((entity as any).width)} readOnly={isLocked} type="number" onChange={val => { const w = len.parse(val, (entity as any).width); if (w !== 0) handleUpdateSingle(entity.id, { width: w } as any); }} /></PropertyRow>
          <PropertyRow label={unitLabel("Height")}><PropertyInput value={len.format((entity as any).height)} readOnly={isLocked} type="number" onChange={val => { const h = len.parse(val, (entity as any).height); if (h !== 0) handleUpdateSingle(entity.id, { height: h } as any); }} /></PropertyRow>
          {(entity as any).rotation !== undefined && <PropertyRow label="Rotation"><PropertyInput value={worldRadiansToVisualDegrees((entity as any).rotation).toFixed(2)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { rotation: visualDegreesToWorldRadians(parseNumber(val, 0)) } as any)} /></PropertyRow>}
          <PropertyRow label={`Area (${len.unit}²)`}><PropertyInput value={len.formatArea(rectangleArea((entity as any).width, (entity as any).height))} readOnly /></PropertyRow>
          <PropertyRow label={unitLabel("Perimeter")}><PropertyInput value={len.format(rectanglePerimeter((entity as any).width, (entity as any).height))} readOnly /></PropertyRow>
        </>
      )}

      {entity.type === "circle" && (
        <>
          <PropertyRow label={unitLabel("Center X")}><PropertyInput value={len.format((entity as any).center.x)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { center: { ...(entity as any).center, x: len.parse(val, (entity as any).center.x) } } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("Center Y")}><PropertyInput value={len.format((entity as any).center.y)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { center: { ...(entity as any).center, y: len.parse(val, (entity as any).center.y) } } as any)} /></PropertyRow>
          <PropertyRow label={unitLabel("Radius")}><PropertyInput value={len.format((entity as any).radius)} readOnly={isLocked} type="number" onChange={val => { const r = len.parse(val, (entity as any).radius); if (r > 0) handleUpdateSingle(entity.id, { radius: r } as any); }} /></PropertyRow>
          <PropertyRow label={unitLabel("Diameter")}><PropertyInput value={len.format((entity as any).radius * 2)} readOnly /></PropertyRow>
          <PropertyRow label={`Area (${len.unit}²)`}><PropertyInput value={len.formatArea(circleArea((entity as any).radius))} readOnly /></PropertyRow>
          <PropertyRow label={unitLabel("Circumference")}><PropertyInput value={len.format(circleCircumference((entity as any).radius))} readOnly /></PropertyRow>
        </>
      )}

      {entity.type === "polyline" && (
        <>
          <PropertyRow label="Closed">
            <select
              value={(entity as any).closed ? "true" : "false"}
              disabled={isLocked}
              style={{ width: '100%', background: isLocked ? 'transparent' : 'var(--cad-bg-dark)', color: 'var(--cad-text)', border: isLocked ? 'none' : '1px solid var(--cad-border)', fontSize: '11px', padding: '2px' }}
              onChange={e => handleUpdateSingle(entity.id, { closed: e.target.value === "true" } as any)}
            >
              <option value="false">Open</option>
              <option value="true">Closed</option>
            </select>
          </PropertyRow>
          <PropertyRow label="Vertex Count"><PropertyInput value={String((entity as any).points.length)} readOnly /></PropertyRow>
          <PropertyRow label={unitLabel("Length")}>
            <PropertyInput
              value={len.format(getPolylineLength({
                points: (entity as any).points,
                closed: (entity as any).closed
              }))}
              readOnly
            />
          </PropertyRow>
        </>
      )}

      {entity.type === "arc" && (() => {
        const arc = entity as ArcEntity;
        // Ângulos na convenção do AutoCAD: 0° = Leste, anti-horário, sempre do início ao fim no sentido anti-horário.
        const angles = arcVisualAngles(arc);
        const updateAngles = (visualStart: number, visualEnd: number) =>
          handleUpdateSingle(arc.id, arcAnglesFromVisual(arc.clockwise, visualStart, visualEnd) as any);
        return (
          <>
            <PropertyRow label={unitLabel("Center X")}><PropertyInput value={len.format(arc.center.x)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(arc.id, { center: { ...arc.center, x: len.parse(val, arc.center.x) } } as any)} /></PropertyRow>
            <PropertyRow label={unitLabel("Center Y")}><PropertyInput value={len.format(arc.center.y)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(arc.id, { center: { ...arc.center, y: len.parse(val, arc.center.y) } } as any)} /></PropertyRow>
            <PropertyRow label={unitLabel("Radius")}><PropertyInput value={len.format(arc.radius)} readOnly={isLocked} type="number" onChange={val => { const r = len.parse(val, arc.radius); if (r > 0) handleUpdateSingle(arc.id, { radius: r } as any); }} /></PropertyRow>
            <PropertyRow label="Start Angle (°)"><PropertyInput value={angles.start.toFixed(2)} readOnly={isLocked} type="number" onChange={val => updateAngles(parseNumber(val, angles.start), angles.end)} /></PropertyRow>
            <PropertyRow label="End Angle (°)"><PropertyInput value={angles.end.toFixed(2)} readOnly={isLocked} type="number" onChange={val => updateAngles(angles.start, parseNumber(val, angles.end))} /></PropertyRow>
            <PropertyRow label="Total Angle (°)"><PropertyInput value={angles.sweep.toFixed(2)} readOnly /></PropertyRow>
            <PropertyRow label={unitLabel("Arc Length")}><PropertyInput value={len.format(arc.radius * (angles.sweep * Math.PI) / 180)} readOnly /></PropertyRow>
          </>
        );
      })()}

      {entity.type === "ellipse" && (() => {
        const ellipse = normalizeEllipseAxes(entity as EllipseEntity);
        const isArc = ellipse.startAngle !== undefined && ellipse.endAngle !== undefined;
        const arcAngles = isArc
          ? ellipseArcVisualAngles({ radiusX: ellipse.radiusX, radiusY: ellipse.radiusY, startAngle: ellipse.startAngle!, endAngle: ellipse.endAngle! })
          : null;
        // Toda edição grava a geometria normalizada (eixo maior no X local), como o AutoCAD mantém a elipse.
        const update = (patch: Partial<EllipseEntity>) => {
          const next = normalizeEllipseAxes({ ...ellipse, ...patch });
          handleUpdateSingle(ellipse.id, {
            center: next.center,
            radiusX: next.radiusX,
            radiusY: next.radiusY,
            rotation: next.rotation,
            ...(next.startAngle !== undefined && next.endAngle !== undefined ? { startAngle: next.startAngle, endAngle: next.endAngle } : {})
          } as any);
        };
        const updateArcAngles = (visualStart: number, visualEnd: number) =>
          update(ellipseArcParamsFromVisual(ellipse.radiusX, ellipse.radiusY, visualStart, visualEnd));
        const length = ellipseArcLength({ ...ellipse, type: "ellipse" });
        return (
          <>
            <PropertyRow label="Kind"><PropertyInput value={isArc ? "Elliptical arc" : "Ellipse"} readOnly /></PropertyRow>
            <PropertyRow label={unitLabel("Center X")}><PropertyInput value={len.format(ellipse.center.x)} readOnly={isLocked} type="number" onChange={val => update({ center: { ...ellipse.center, x: len.parse(val, ellipse.center.x) } })} /></PropertyRow>
            <PropertyRow label={unitLabel("Center Y")}><PropertyInput value={len.format(ellipse.center.y)} readOnly={isLocked} type="number" onChange={val => update({ center: { ...ellipse.center, y: len.parse(val, ellipse.center.y) } })} /></PropertyRow>
            {/* Raio maior ao longo da rotação; se o novo maior ficar menor que o menor, os eixos trocam de papel. */}
            <PropertyRow label={unitLabel("Major Radius")}><PropertyInput value={len.format(ellipse.radiusX)} readOnly={isLocked} type="number" onChange={val => { const r = len.parse(val, ellipse.radiusX); if (r > 0) update({ radiusX: r }); }} /></PropertyRow>
            <PropertyRow label={unitLabel("Minor Radius")}><PropertyInput value={len.format(ellipse.radiusY)} readOnly={isLocked} type="number" onChange={val => { const r = len.parse(val, ellipse.radiusY); if (r > 0) update({ radiusY: r }); }} /></PropertyRow>
            <PropertyRow label="Radius Ratio"><PropertyInput value={(ellipse.radiusY / ellipse.radiusX).toFixed(4)} readOnly={isLocked} type="number" onChange={val => { const ratio = parseNumber(val, -1); if (ratio > 0 && ratio <= 1) update({ radiusY: ellipse.radiusX * ratio }); }} /></PropertyRow>
            <PropertyRow label="Rotation (°)"><PropertyInput value={worldRadiansToVisualDegrees(ellipse.rotation).toFixed(2)} readOnly={isLocked} type="number" onChange={val => update({ rotation: visualDegreesToWorldRadians(parseNumber(val, worldRadiansToVisualDegrees(ellipse.rotation))) })} /></PropertyRow>
            {arcAngles !== null && (
              <>
                {/* Ângulos reais medidos a partir do eixo maior, anti-horários, como no AutoCAD. */}
                <PropertyRow label="Start Angle (°)"><PropertyInput value={arcAngles.start.toFixed(2)} readOnly={isLocked} type="number" onChange={val => updateArcAngles(parseNumber(val, arcAngles.start), arcAngles.end)} /></PropertyRow>
                <PropertyRow label="End Angle (°)"><PropertyInput value={arcAngles.end.toFixed(2)} readOnly={isLocked} type="number" onChange={val => updateArcAngles(arcAngles.start, parseNumber(val, arcAngles.end))} /></PropertyRow>
                <PropertyRow label="Total Angle (°)"><PropertyInput value={arcAngles.sweep.toFixed(2)} readOnly /></PropertyRow>
                <PropertyRow label={unitLabel("Arc Length")}><PropertyInput value={len.format(length)} readOnly /></PropertyRow>
              </>
            )}
            {arcAngles === null && (
              <>
                <PropertyRow label={unitLabel("Perimeter")}><PropertyInput value={len.format(length)} readOnly /></PropertyRow>
                <PropertyRow label={`Area (${len.unit}²)`}><PropertyInput value={len.formatArea(Math.PI * ellipse.radiusX * ellipse.radiusY)} readOnly /></PropertyRow>
              </>
            )}
          </>
        );
      })()}

      {entity.type === "spline" && (() => {
        const spline = entity as SplineEntity;
        const canRefit = spline.fitPoints !== undefined && spline.fitPoints.length >= (spline.closed ? 2 : 3);
        return (
          <>
            <PropertyRow label="Method">
              {/* Como no AutoCAD, a spline por pontos de ajuste pode virar por vértices de controle (grips nas alças); o inverso não existe. */}
              <select
                value={spline.fitPoints !== undefined ? "fit" : "cv"}
                disabled={isLocked || spline.fitPoints === undefined}
                style={selectStyle(isLocked || spline.fitPoints === undefined)}
                onChange={e => {
                  if (e.target.value !== "cv") return;
                  const { fitPoints: _fitPoints, ...controlOnly } = spline;
                  cad.executeCommand(new ReplaceEntityCommand(spline, [controlOnly], "Converts a spline to control vertices."));
                }}
              >
                <option value="fit">Fit points</option>
                <option value="cv">Control vertices</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Degree"><PropertyInput value="3" readOnly /></PropertyRow>
            <PropertyRow label="Closed">
              {/* Fechar/abrir recalcula a curva pelos pontos de ajuste; sem eles (spline importada/aparada) é só leitura. */}
              <select
                value={spline.closed ? "true" : "false"}
                disabled={isLocked || !canRefit}
                style={selectStyle(isLocked || !canRefit)}
                onChange={e => {
                  const closed = e.target.value === "true";
                  handleUpdateSingle(spline.id, { closed, controlPoints: fitPointsToBezierChain(spline.fitPoints!, closed) } as any);
                }}
              >
                <option value="false">Open</option>
                <option value="true">Closed</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Fit Points"><PropertyInput value={String(spline.fitPoints?.length ?? 0)} readOnly /></PropertyRow>
            <PropertyRow label="Control Points"><PropertyInput value={String(spline.controlPoints.length)} readOnly /></PropertyRow>
            <PropertyRow label={unitLabel("Length")}><PropertyInput value={len.format(bezierChainLength(spline.controlPoints))} readOnly /></PropertyRow>
            {!spline.closed && (
              <>
                <PropertyRow label={unitLabel("Start X")}><PropertyInput value={len.format(spline.controlPoints[0]!.x)} readOnly /></PropertyRow>
                <PropertyRow label={unitLabel("Start Y")}><PropertyInput value={len.format(spline.controlPoints[0]!.y)} readOnly /></PropertyRow>
                <PropertyRow label={unitLabel("End X")}><PropertyInput value={len.format(spline.controlPoints.at(-1)!.x)} readOnly /></PropertyRow>
                <PropertyRow label={unitLabel("End Y")}><PropertyInput value={len.format(spline.controlPoints.at(-1)!.y)} readOnly /></PropertyRow>
              </>
            )}
          </>
        );
      })()}

      {entity.type === "text" && (() => {
        const text = entity as TextEntity;
        return (
          <>
            <PropertyRow label="Contents">
              <PropertyTextArea value={text.content} readOnly={isLocked} onChange={val => handleUpdateSingle(text.id, { content: val } as any)} />
            </PropertyRow>
            <PropertyRow label={unitLabel("Height")}>
              <PropertyInput value={len.format(text.height)} readOnly={isLocked} type="number" onChange={val => { const h = len.parse(val, text.height); if (h > 0) handleUpdateSingle(text.id, { height: h } as any); }} />
            </PropertyRow>
            <PropertyRow label="Rotation (°)">
              <PropertyInput value={worldRadiansToVisualDegrees(text.rotation ?? 0).toFixed(2)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(text.id, { rotation: visualDegreesToWorldRadians(parseNumber(val, 0)) } as any)} />
            </PropertyRow>
            <PropertyRow label={unitLabel("Position X")}>
              <PropertyInput value={len.format(text.position.x)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(text.id, { position: { ...text.position, x: len.parse(val, text.position.x) } } as any)} />
            </PropertyRow>
            <PropertyRow label={unitLabel("Position Y")}>
              <PropertyInput value={len.format(text.position.y)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(text.id, { position: { ...text.position, y: len.parse(val, text.position.y) } } as any)} />
            </PropertyRow>
            <PropertyRow label="Justify">
              <select value={text.horizontalAlign ?? "left"} disabled={isLocked} style={selectStyle(isLocked)} onChange={e => handleUpdateSingle(text.id, { horizontalAlign: e.target.value } as any)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Vertical">
              <select value={text.verticalAlign ?? "baseline"} disabled={isLocked} style={selectStyle(isLocked)} onChange={e => handleUpdateSingle(text.id, { verticalAlign: e.target.value } as any)}>
                <option value="baseline">Baseline</option>
                <option value="bottom">Bottom</option>
                <option value="middle">Middle</option>
                <option value="top">Top</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Font">
              <select value={text.fontFamily ?? ""} disabled={isLocked} style={selectStyle(isLocked)} onChange={e => handleUpdateSingle(text.id, { fontFamily: e.target.value === "" ? undefined : e.target.value } as any)}>
                {TEXT_FONT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                {text.fontFamily !== undefined && !TEXT_FONT_OPTIONS.some(option => option.value === text.fontFamily) && <option value={text.fontFamily}>{text.fontFamily}</option>}
              </select>
            </PropertyRow>
            <PropertyRow label="Style">
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                <label><input type="checkbox" checked={text.bold === true} disabled={isLocked} onChange={e => handleUpdateSingle(text.id, { bold: e.target.checked ? true : undefined } as any)} /> Bold</label>
                <label><input type="checkbox" checked={text.italic === true} disabled={isLocked} onChange={e => handleUpdateSingle(text.id, { italic: e.target.checked ? true : undefined } as any)} /> Italic</label>
              </div>
            </PropertyRow>
          </>
        );
      })()}

      {entity.type === "dimension" && (
        <>
          <PropertyRow label="Dimension Type"><PropertyInput value={(entity as any).dimensionType} readOnly /></PropertyRow>
          <PropertyRow label="Style">
            <select
              value={(entity as any).dimensionStyleId || "dimstyle_standard"}
              disabled={isLocked}
              style={{ width: '100%', background: isLocked ? 'transparent' : 'var(--cad-bg-dark)', color: 'var(--cad-text)', border: isLocked ? 'none' : '1px solid var(--cad-border)', fontSize: '11px', padding: '2px' }}
              onChange={e => handleUpdateSingle(entity.id, { dimensionStyleId: e.target.value } as any)}
            >
              {(cad.document.dimensionStyles || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </PropertyRow>
          <PropertyRow label="Text Override">
            <PropertyInput 
              value={(entity as any).textOverride || ""} 
              readOnly={isLocked} 
              onChange={val => handleUpdateSingle(entity.id, { textOverride: val } as any)} 
            />
          </PropertyRow>
          <PropertyRow label="Measured Value">
            <PropertyInput 
              value={
                (() => {
                  const def = (entity as any).definition;
                  const resolvedStyle = resolveDimensionStyle(cad.document, entity as any);
                  let val = 0;
                  if ((entity as any).dimensionType === "radius") {
                    val = def.radius;
                  } else if ((entity as any).dimensionType === "diameter") {
                    val = def.radius * 2;
                  } else if ((entity as any).dimensionType === "linear" && def.orientation === "horizontal") {
                    val = Math.abs(def.secondPoint.x - def.firstPoint.x);
                  } else if ((entity as any).dimensionType === "linear" && def.orientation === "vertical") {
                    val = Math.abs(def.secondPoint.y - def.firstPoint.y);
                  } else if ((entity as any).dimensionType === "angular") {
                    const geom = buildAngularDimensionGeometry(def, resolvedStyle);
                    return geom.formattedText;
                  } else {
                    val = lineLength(def.firstPoint, def.secondPoint);
                  }
                  return formatMeasurement(val, cad.document.units, cad.document.displayUnit || cad.document.units, resolvedStyle.precision);
                })()
              } 
              readOnly 
            />
          </PropertyRow>
          <div style={{ padding: '8px', background: '#18181b', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid var(--cad-border)', borderTop: '1px solid var(--cad-border)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Style Overrides</span>
            {Object.keys((entity as any).styleOverride || {}).length > 0 && (
              <button onClick={() => handleUpdateSingle(entity.id, { styleOverride: {} } as any)} style={{ background: 'transparent', border: 'none', color: 'var(--cad-primary)', cursor: 'pointer', fontSize: '10px' }}>Clear</button>
            )}
          </div>
          <PropertyRow label="Precision">
            <PropertyInput 
              type="number"
              value={(entity as any).styleOverride?.precision ?? resolveDimensionStyle(cad.document, entity as any).precision} 
              readOnly={isLocked}
              onChange={val => handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, precision: parseNumber(val, 2) } } as any)} 
            />
          </PropertyRow>
          <PropertyRow label="Unit Suffix">
            <PropertyInput 
              value={(entity as any).styleOverride?.unitSuffix ?? resolveDimensionStyle(cad.document, entity as any).unitSuffix} 
              readOnly={isLocked}
              onChange={val => handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, unitSuffix: val } } as any)} 
            />
          </PropertyRow>
          <PropertyRow label="Arrow Type">
            <select
              value={(entity as any).styleOverride?.arrowType ?? resolveDimensionStyle(cad.document, entity as any).arrowType}
              disabled={isLocked}
              className="w-full bg-cad-bg dark:bg-[#1A1D20] text-cad-text text-sm rounded border border-cad-border px-2 py-1 focus:outline-none focus:border-cad-primary transition-colors"
              onChange={e => handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, arrowType: e.target.value } } as any)}
            >
              {DIMENSION_ARROW_TYPES.map(type => <option key={type} value={type}>{ARROW_TYPE_LABELS[type]}</option>)}
            </select>
          </PropertyRow>
          <PropertyRow label={unitLabel("Arrow Size")}>
            <PropertyInput
              type="number"
              value={len.format((entity as any).styleOverride?.arrowSize ?? resolveDimensionStyle(cad.document, entity as any).arrowSize)}
              readOnly={isLocked}
              onChange={val => { const size = len.parse(val, -1); if (size > 0) handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, arrowSize: size } } as any); }}
            />
          </PropertyRow>
          <PropertyRow label={unitLabel("Text Height")}>
            <PropertyInput
              type="number"
              value={len.format((entity as any).styleOverride?.textHeight ?? resolveDimensionStyle(cad.document, entity as any).textHeight)}
              readOnly={isLocked}
              onChange={val => { const height = len.parse(val, -1); if (height > 0) handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, textHeight: height } } as any); }}
            />
          </PropertyRow>
          <PropertyRow label="Color">
            <input
              type="color"
              value={(entity as any).styleOverride?.color ?? resolveDimensionStyle(cad.document, entity as any).color ?? "#ffffff"}
              disabled={isLocked}
              onChange={e => handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, color: e.target.value } } as any)}
              style={{ width: '100%', height: '20px', padding: 0, border: 'none', background: 'transparent' }}
            />
          </PropertyRow>
          <PropertyRow label="Text Color">
            <input
              type="color"
              value={(entity as any).styleOverride?.textColor ?? resolveDimensionStyle(cad.document, entity as any).textColor ?? resolveDimensionStyle(cad.document, entity as any).color ?? "#ffffff"}
              disabled={isLocked}
              onChange={e => handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, textColor: e.target.value } } as any)}
              style={{ width: '100%', height: '20px', padding: 0, border: 'none', background: 'transparent' }}
            />
          </PropertyRow>
          <PropertyRow label="Line Color">
            <input
              type="color"
              value={(entity as any).styleOverride?.lineColor ?? resolveDimensionStyle(cad.document, entity as any).lineColor ?? resolveDimensionStyle(cad.document, entity as any).color ?? "#ffffff"}
              disabled={isLocked}
              onChange={e => handleUpdateSingle(entity.id, { styleOverride: { ...(entity as any).styleOverride, lineColor: e.target.value } } as any)}
              style={{ width: '100%', height: '20px', padding: 0, border: 'none', background: 'transparent' }}
            />
          </PropertyRow>
        </>
      )}
    </div>
  );
}
