import React, { useState, useEffect } from "react";
import { UpdateEntityCommand, UpdateEntitiesBatchCommand, resolveDimensionStyle, type CadEntity } from "@cad-web/cad-core";
import { lineLength, lineAngle, rectangleArea, rectanglePerimeter, circleArea, circleCircumference, formatMeasurement, buildAngularDimensionGeometry } from "@cad-web/cad-geometry";

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

      <PropertyRow label="Line Type">
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
      </PropertyRow>

      <PropertyRow label="Thickness">
        <PropertyInput 
          type="number" 
          value={(entity as any).lineThickness ?? 1} 
          readOnly={isLocked} 
          onChange={val => handleUpdateSingle(entity.id, { lineThickness: parseNumber(val, 1) } as any)} 
        />
      </PropertyRow>

      {entity.type === "line" && (
        <>
          <PropertyRow label="Start X"><PropertyInput value={(entity as any).start.x.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { start: { ...(entity as any).start, x: parseNumber(val, (entity as any).start.x) } } as any)} /></PropertyRow>
          <PropertyRow label="Start Y"><PropertyInput value={(entity as any).start.y.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { start: { ...(entity as any).start, y: parseNumber(val, (entity as any).start.y) } } as any)} /></PropertyRow>
          <PropertyRow label="End X"><PropertyInput value={(entity as any).end.x.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { end: { ...(entity as any).end, x: parseNumber(val, (entity as any).end.x) } } as any)} /></PropertyRow>
          <PropertyRow label="End Y"><PropertyInput value={(entity as any).end.y.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { end: { ...(entity as any).end, y: parseNumber(val, (entity as any).end.y) } } as any)} /></PropertyRow>
          <PropertyRow label="Length"><PropertyInput value={lineLength((entity as any).start, (entity as any).end).toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Angle"><PropertyInput value={lineAngle((entity as any).start, (entity as any).end).toFixed(2) + "°"} readOnly /></PropertyRow>
        </>
      )}

      {entity.type === "rectangle" && (
        <>
          <PropertyRow label="X"><PropertyInput value={(entity as any).x.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { x: parseNumber(val, (entity as any).x) } as any)} /></PropertyRow>
          <PropertyRow label="Y"><PropertyInput value={(entity as any).y.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { y: parseNumber(val, (entity as any).y) } as any)} /></PropertyRow>
          <PropertyRow label="Width"><PropertyInput value={(entity as any).width.toFixed(3)} readOnly={isLocked} type="number" onChange={val => { const w = parseNumber(val, (entity as any).width); if (w !== 0) handleUpdateSingle(entity.id, { width: w } as any); }} /></PropertyRow>
          <PropertyRow label="Height"><PropertyInput value={(entity as any).height.toFixed(3)} readOnly={isLocked} type="number" onChange={val => { const h = parseNumber(val, (entity as any).height); if (h !== 0) handleUpdateSingle(entity.id, { height: h } as any); }} /></PropertyRow>
          {(entity as any).rotation !== undefined && <PropertyRow label="Rotation"><PropertyInput value={((entity as any).rotation * (180 / Math.PI)).toFixed(2)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { rotation: parseNumber(val, 0) * (Math.PI / 180) } as any)} /></PropertyRow>}
          <PropertyRow label="Area"><PropertyInput value={rectangleArea((entity as any).width, (entity as any).height).toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Perimeter"><PropertyInput value={rectanglePerimeter((entity as any).width, (entity as any).height).toFixed(3)} readOnly /></PropertyRow>
        </>
      )}

      {entity.type === "circle" && (
        <>
          <PropertyRow label="Center X"><PropertyInput value={(entity as any).center.x.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { center: { ...(entity as any).center, x: parseNumber(val, (entity as any).center.x) } } as any)} /></PropertyRow>
          <PropertyRow label="Center Y"><PropertyInput value={(entity as any).center.y.toFixed(3)} readOnly={isLocked} type="number" onChange={val => handleUpdateSingle(entity.id, { center: { ...(entity as any).center, y: parseNumber(val, (entity as any).center.y) } } as any)} /></PropertyRow>
          <PropertyRow label="Radius"><PropertyInput value={(entity as any).radius.toFixed(3)} readOnly={isLocked} type="number" onChange={val => { const r = parseNumber(val, (entity as any).radius); if (r > 0) handleUpdateSingle(entity.id, { radius: r } as any); }} /></PropertyRow>
          <PropertyRow label="Diameter"><PropertyInput value={((entity as any).radius * 2).toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Area"><PropertyInput value={circleArea((entity as any).radius).toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Circumference"><PropertyInput value={circleCircumference((entity as any).radius).toFixed(3)} readOnly /></PropertyRow>
        </>
      )}

      {entity.type === "arc" && (
        <>
          <PropertyRow label="Center X"><PropertyInput value={(entity as any).center.x.toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Center Y"><PropertyInput value={(entity as any).center.y.toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Radius"><PropertyInput value={(entity as any).radius.toFixed(3)} readOnly /></PropertyRow>
          <PropertyRow label="Start Angle"><PropertyInput value={(((entity as any).startAngle * 180) / Math.PI).toFixed(2) + "Â°"} readOnly /></PropertyRow>
          <PropertyRow label="End Angle"><PropertyInput value={(((entity as any).endAngle * 180) / Math.PI).toFixed(2) + "Â°"} readOnly /></PropertyRow>
          <PropertyRow label="Clockwise"><PropertyInput value={(entity as any).clockwise ? "Yes" : "No"} readOnly /></PropertyRow>
        </>
      )}

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
              <option value="tick">Architectural Tick</option>
              <option value="arrow">Filled Arrow</option>
            </select>
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
