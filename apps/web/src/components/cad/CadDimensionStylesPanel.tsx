import React, { useState } from "react";
import type { CadStore } from "../../state/useCadStore";
import { CreateDimensionStyleCommand, DeleteDimensionStyleCommand, SetActiveDimensionStyleCommand, UpdateDimensionStyleCommand, type DimensionStyle } from "@cad-web/cad-core";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";

export function CadDimensionStylesPanel({ cad }: { cad: CadStore }) {
  const document = cad.document;
  const styles = document.dimensionStyles || [];
  const activeStyleId = document.activeDimensionStyleId || "dimstyle_standard";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DimensionStyle>>({});

  const handleCreate = () => {
    const newStyle: DimensionStyle = {
      id: `dimstyle_${Date.now()}`,
      name: `Style ${styles.length + 1}`,
      textHeight: 12,
      arrowSize: 6,
      extensionOffset: 2,
      extensionOvershoot: 3,
      precision: 2,
      unitSuffix: " mm",
      arrowType: "tick"
    };
    cad.executeCommand(new CreateDimensionStyleCommand(newStyle));
  };

  const handleDelete = (id: string) => {
    cad.executeCommand(new DeleteDimensionStyleCommand(id));
  };

  const handleSetActive = (id: string) => {
    cad.executeCommand(new SetActiveDimensionStyleCommand(id));
  };

  const startEdit = (style: DimensionStyle) => {
    setEditingId(style.id);
    setEditForm(style);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editingId && editForm) {
      cad.executeCommand(new UpdateDimensionStyleCommand(editingId, editForm));
      setEditingId(null);
      setEditForm({});
    }
  };

  return (
    <div style={{ padding: "16px", color: "var(--cad-text)", display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: "14px", margin: 0 }}>Dimension Styles</h3>
        <button onClick={handleCreate} style={{ background: "var(--cad-primary)", color: "#fff", border: "none", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
          <Plus size={14} /> New
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {styles.map((style) => (
          <div key={style.id} style={{ background: "var(--cad-surface)", border: activeStyleId === style.id ? "1px solid var(--cad-primary)" : "1px solid var(--cad-border)", borderRadius: "6px", padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {editingId === style.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <input 
                  value={editForm.name || ""} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  style={{ background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px 8px", borderRadius: "4px" }} 
                  placeholder="Style Name"
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <label style={{ flex: 1, fontSize: "12px" }}>Text Ht:
                    <input type="number" value={editForm.textHeight || 0} onChange={e => setEditForm({ ...editForm, textHeight: Number(e.target.value) })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} />
                  </label>
                  <label style={{ flex: 1, fontSize: "12px" }}>Arrow:
                    <input type="number" value={editForm.arrowSize || 0} onChange={e => setEditForm({ ...editForm, arrowSize: Number(e.target.value) })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <label style={{ flex: 1, fontSize: "12px" }}>Precision:
                    <input type="number" value={editForm.precision ?? 2} onChange={e => setEditForm({ ...editForm, precision: Number(e.target.value) })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} />
                  </label>
                  <label style={{ flex: 1, fontSize: "12px" }}>Arrow Type:
                    <select value={editForm.arrowType || "tick"} onChange={e => setEditForm({ ...editForm, arrowType: e.target.value as any })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }}>
                      <option value="tick">Tick</option>
                      <option value="arrow">Arrow</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <label style={{ flex: 1, fontSize: "12px" }}>Ext Offset:
                    <input type="number" value={editForm.extensionOffset ?? 2} onChange={e => setEditForm({ ...editForm, extensionOffset: Number(e.target.value) })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} />
                  </label>
                  <label style={{ flex: 1, fontSize: "12px" }}>Ext Over:
                    <input type="number" value={editForm.extensionOvershoot ?? 3} onChange={e => setEditForm({ ...editForm, extensionOvershoot: Number(e.target.value) })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} />
                  </label>
                </div>
                <label style={{ fontSize: "12px" }}>Unit Suffix:
                  <input value={editForm.unitSuffix ?? ""} onChange={e => setEditForm({ ...editForm, unitSuffix: e.target.value })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px 8px", borderRadius: "4px", marginTop: "4px" }} />
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <label style={{ flex: 1, fontSize: "12px" }}>Color:
                    <input type="text" value={editForm.color || ""} onChange={e => setEditForm({ ...editForm, color: e.target.value })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} placeholder="#ffffff" />
                  </label>
                  <label style={{ flex: 1, fontSize: "12px" }}>Line Color:
                    <input type="text" value={editForm.lineColor || ""} onChange={e => setEditForm({ ...editForm, lineColor: e.target.value })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} placeholder="#ffffff" />
                  </label>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <label style={{ flex: 1, fontSize: "12px" }}>Text Color:
                    <input type="text" value={editForm.textColor || ""} onChange={e => setEditForm({ ...editForm, textColor: e.target.value })} style={{ width: "100%", background: "#111827", border: "1px solid var(--cad-border)", color: "#fff", padding: "4px", borderRadius: "4px", marginTop: "4px" }} placeholder="#ffffff" />
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
                  <button onClick={cancelEdit} style={{ background: "transparent", color: "var(--cad-text-muted)", border: "none", cursor: "pointer" }}><X size={16} /></button>
                  <button onClick={saveEdit} style={{ background: "var(--cad-primary)", color: "#fff", border: "none", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}><Check size={16} /></button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input 
                    type="radio" 
                    name="activeStyle" 
                    checked={activeStyleId === style.id} 
                    onChange={() => handleSetActive(style.id)} 
                    style={{ cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "14px", fontWeight: activeStyleId === style.id ? 600 : 400, color: activeStyleId === style.id ? "var(--cad-primary)" : "inherit" }}>
                    {style.name}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button onClick={() => startEdit(style)} style={{ background: "transparent", border: "none", color: "var(--cad-text-muted)", cursor: "pointer", padding: "4px" }}>
                    <Edit2 size={14} />
                  </button>
                  {!style.isDefault && (
                    <button onClick={() => handleDelete(style.id)} style={{ background: "transparent", border: "none", color: "var(--cad-danger, #ef4444)", cursor: "pointer", padding: "4px" }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
