import { ChevronLeft, ChevronRight, Layers, Settings2, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { CadStore } from "../../state/useCadStore";
import { CadDimensionStylesPanel } from "./CadDimensionStylesPanel";
import { CadLayerPanel } from "./CadLayerPanel";
import { CadPropertiesPanel } from "./CadPropertiesPanel";

type Tab = "properties" | "layers" | "dimstyles";

const tabs = [
  { id: "properties", label: "Props", title: "Propriedades", icon: SlidersHorizontal },
  { id: "layers", label: "Layers", title: "Camadas", icon: Layers },
  { id: "dimstyles", label: "Dims", title: "Estilos de cota", icon: Settings2 }
] as const;

export function CadRightPanel({ cad }: { cad: CadStore }) {
  const [activeTab, setActiveTab] = useState<Tab>("properties");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="cad-right-panel collapsed" aria-label="Painel CAD recolhido">
        <button className="cad-panel-collapse-btn" type="button" onClick={() => setCollapsed(false)} title="Expandir painel">
          <ChevronLeft size={16} />
        </button>
        {tabs.map((tab) => (
          <button
            className={`cad-right-panel-rail-btn ${activeTab === tab.id ? "active" : ""}`}
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setCollapsed(false);
            }}
            title={tab.title}
          >
            <tab.icon size={16} />
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="cad-right-panel" aria-label="Painel CAD dockado">
      <div className="cad-right-panel-header">
        <span>Inspectors</span>
        <button className="cad-panel-collapse-btn" type="button" onClick={() => setCollapsed(true)} title="Recolher painel">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="cad-right-panel-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="cad-right-panel-content">
        {activeTab === "properties" && <CadPropertiesPanel cad={cad} />}
        {activeTab === "layers" && <CadLayerPanel cad={cad} />}
        {activeTab === "dimstyles" && <CadDimensionStylesPanel cad={cad} />}
      </div>
    </aside>
  );
}
