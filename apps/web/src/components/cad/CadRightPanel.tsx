import React, { useState } from "react";
import { CadLayerPanel } from "./CadLayerPanel";
import { CadPropertiesPanel } from "./CadPropertiesPanel";
import { Layers, SlidersHorizontal } from "lucide-react";
import type { CadStore } from "../../state/useCadStore";

type Tab = "properties" | "layers";

export function CadRightPanel({ cad }: { cad: CadStore }) {
  const [activeTab, setActiveTab] = useState<Tab>("properties");

  return (
    <aside className="cad-right-panel" style={{ width: '300px', display: 'flex', flexDirection: 'column', background: '#27272a', borderLeft: '1px solid var(--cad-border)' }}>
      {/* Tabs Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cad-border)', background: '#18181b' }}>
        <button
          onClick={() => setActiveTab("properties")}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 0',
            background: activeTab === "properties" ? '#27272a' : 'transparent',
            border: 'none',
            borderBottom: activeTab === "properties" ? '2px solid var(--cad-active-border)' : '2px solid transparent',
            color: activeTab === "properties" ? '#fff' : 'var(--cad-text-muted)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: activeTab === "properties" ? 600 : 400
          }}
        >
          <SlidersHorizontal size={14} /> Properties
        </button>
        <button
          onClick={() => setActiveTab("layers")}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 0',
            background: activeTab === "layers" ? '#27272a' : 'transparent',
            border: 'none',
            borderBottom: activeTab === "layers" ? '2px solid var(--cad-active-border)' : '2px solid transparent',
            color: activeTab === "layers" ? '#fff' : 'var(--cad-text-muted)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: activeTab === "layers" ? 600 : 400
          }}
        >
          <Layers size={14} /> Layers
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === "properties" && <CadPropertiesPanel cad={cad} />}
        {activeTab === "layers" && <CadLayerPanel cad={cad} />}
      </div>
    </aside>
  );
}
