import React, { useState } from "react";
import { useCadStore } from "../../state/useCadStore";
import {
  ChangeLayerColorCommand,
  CreateLayerCommand,
  DeleteLayerCommand,
  RenameLayerCommand,
  SetActiveLayerCommand,
  ToggleLayerLockCommand,
  ToggleLayerVisibilityCommand
} from "@cad-web/cad-core";
import { Eye, EyeOff, Lock, Unlock, Trash2, Plus } from "lucide-react";

import type { CadStore } from "../../state/useCadStore";

export function CadLayerPanel({ cad }: { cad: CadStore }) {
  const [newLayerName, setNewLayerName] = useState("");
  const [renameLayerId, setRenameLayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const layers = cad.document.layers;
  const activeLayerId = cad.document.activeLayerId;

  const handleCreateLayer = () => {
    if (newLayerName.trim().length === 0) return;
    cad.executeCommand(new CreateLayerCommand({
      id: `layer_${Date.now()}`,
      name: newLayerName.trim(),
      color: "#ffffff",
      visible: true,
      locked: false,
      order: cad.document.layers.length
    }));
    setNewLayerName("");
  };

  const handleRenameSubmit = (layerId: string) => {
    if (renameValue.trim().length > 0) {
      cad.executeCommand(new RenameLayerCommand(layerId, renameValue.trim()));
    }
    setRenameLayerId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid var(--cad-border)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="New Layer Name" 
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateLayer()}
            style={{ flex: 1, padding: '6px 8px', background: 'var(--cad-bg-dark)', border: '1px solid var(--cad-border)', color: '#fff', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
          />
          <button 
            onClick={handleCreateLayer} 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', background: 'var(--cad-accent)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            title="Add Layer"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '8px' }}>
        {layers.map(layer => (
          <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', background: layer.id === activeLayerId ? 'var(--cad-active-bg)' : 'transparent', border: layer.id === activeLayerId ? '1px solid var(--cad-active-border)' : '1px solid transparent', borderRadius: '4px', marginBottom: '4px' }}>
            <input 
              type="radio" 
              name="activeLayer" 
              checked={layer.id === activeLayerId}
              onChange={() => cad.executeCommand(new SetActiveLayerCommand(layer.id))}
              title="Set Active"
              style={{ margin: 0 }}
            />
            
            <input 
              type="color" 
              value={layer.color} 
              onChange={(e) => cad.executeCommand(new ChangeLayerColorCommand(layer.id, e.target.value))}
              style={{ width: '16px', height: '16px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
              title="Layer Color"
            />

            {renameLayerId === layer.id ? (
              <input 
                autoFocus
                type="text" 
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSubmit(layer.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(layer.id);
                  if (e.key === 'Escape') setRenameLayerId(null);
                }}
                style={{ flex: 1, padding: '2px 4px', background: 'var(--cad-bg-dark)', border: '1px solid var(--cad-active-border)', color: '#fff', fontSize: '12px', outline: 'none' }}
              />
            ) : (
              <span 
                style={{ flex: 1, cursor: 'pointer', fontSize: '12px', color: 'var(--cad-text)', opacity: layer.visible ? 1 : 0.5, textDecoration: layer.locked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onDoubleClick={() => {
                  setRenameLayerId(layer.id);
                  setRenameValue(layer.name);
                }}
              >
                {layer.name}
              </span>
            )}

            <button 
              onClick={() => cad.executeCommand(new ToggleLayerVisibilityCommand(layer.id, !layer.visible))}
              style={{ background: 'transparent', border: 'none', color: layer.visible ? 'var(--cad-text-muted)' : '#52525b', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
              title="Toggle Visibility"
            >
              {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>

            <button 
              onClick={() => cad.executeCommand(new ToggleLayerLockCommand(layer.id, !layer.locked))}
              style={{ background: 'transparent', border: 'none', color: layer.locked ? '#ef4444' : 'var(--cad-text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
              title="Toggle Lock"
            >
              {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>

            {layer.id !== "layer_0" && (
              <button 
                onClick={() => {
                  if (window.confirm(`Delete layer ${layer.name}? Entities will move to Layer 0.`)) {
                    cad.executeCommand(new DeleteLayerCommand(layer.id));
                  }
                }}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                title="Delete Layer"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
