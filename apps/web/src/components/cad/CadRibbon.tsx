import type { SnapSettings } from "@cad-web/cad-geometry";
import {
  ChartSpline,
  ChevronDown,
  Circle,
  Ellipse,
  Rainbow,
  CornerDownRight,
  Expand,
  CornerRightDown,
  Copy,
  FlipHorizontal2,
  Frame,
  Hand,
  Download,
  Grid3X3,
  RotateCcw,
  Route,
  Bomb,
  Box,
  Component,
  Eraser,
  Eye,
  EyeOff,
  Grip,
  Layers,
  Lock,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  Move,
  Spline,
  MoveRight,
  Plus,
  RotateCw,
  Ruler,
  Scaling,
  Scissors,
  Square,
  Trash2,
  Unlock,
  Type,
  Upload,
  Waves,
  type LucideIcon
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadRibbonProps = Readonly<{
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
  snapSettings: SnapSettings;
  onSnapSettingsChange(settings: SnapSettings): void;
  onClear(): void;
  onExport(): void;
  onExportSvg(): void;
  onExportDxf(): void;
  onImport(): void;
  onImportSvg(): void;
  onImportDxf(): void;
  activeLayerName: string;
  activeLayerVisible: boolean;
  activeLayerLocked: boolean;
  onCreateLayer(): void;
  onToggleActiveLayerVisibility(): void;
  onToggleActiveLayerLock(): void;
  orthoMode: boolean;
  gridVisible: boolean;
  onToggleOrtho(): void;
  onToggleGrid(): void;
}>;

type RibbonTool = Readonly<{
  id: ActiveCadTool;
  label: string;
  icon: LucideIcon;
}>;

type RibbonAction = Readonly<{
  label: string;
  icon: LucideIcon;
  onSelect(): void;
  title?: string;
}>;

type RibbonTabId = "inicio" | "anotar" | "inserir" | "precisao" | "arquivo";

const ribbonTabs: ReadonlyArray<Readonly<{ id: RibbonTabId; label: string }>> = [
  { id: "inicio", label: "Início" },
  { id: "anotar", label: "Anotar" },
  { id: "inserir", label: "Inserir" },
  { id: "precisao", label: "Precisão" },
  { id: "arquivo", label: "Arquivo" }
];

const selectTool: RibbonTool = { id: "select", label: "Select", icon: MousePointer2 };

// Navegacao da viewport (ja implementadas no canvas/store; aqui so expostas no menu).
const navTools: ReadonlyArray<RibbonTool> = [
  { id: "pan", label: "Pan", icon: Hand },
  { id: "zoomWindow", label: "Zoom", icon: Frame }
];

// Primitivas de desenho mais usadas, sempre visiveis.
const drawPrimaryTools: ReadonlyArray<RibbonTool> = [
  { id: "line", label: "Line", icon: Minus },
  { id: "polyline", label: "PLine", icon: Spline },
  { id: "rectangle", label: "Rect", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "arc", label: "Arc", icon: Rainbow }
];

// Curvas menos frequentes, agrupadas num menu suspenso.
const curveTools: ReadonlyArray<RibbonTool> = [
  { id: "ellipse", label: "Ellipse", icon: Ellipse },
  { id: "ellipseArc", label: "Ell Arc", icon: ChartSpline },
  { id: "spline", label: "Spline", icon: Waves }
];

// Transformacoes que atuam sobre a selecao.
const transformTools: ReadonlyArray<RibbonTool> = [
  { id: "move", label: "Move", icon: Move },
  { id: "rotate", label: "Rotate", icon: RotateCw },
  { id: "scale", label: "Scale", icon: Scaling },
  { id: "mirror", label: "Mirror", icon: FlipHorizontal2 },
  { id: "stretch", label: "Stretch", icon: Expand }
];

// Edicoes construtivas de geometria.
const modifyTools: ReadonlyArray<RibbonTool> = [
  { id: "trim", label: "Trim", icon: Scissors },
  { id: "extend", label: "Extend", icon: MoveRight },
  { id: "offset", label: "Offset", icon: Copy },
  { id: "fillet", label: "Fillet", icon: CornerDownRight },
  { id: "chamfer", label: "Chamfer", icon: CornerRightDown }
];

// Familia de matrizes (array), agrupada num menu suspenso.
const arrayTools: ReadonlyArray<RibbonTool> = [
  { id: "array", label: "Retangular", icon: Grid3X3 },
  { id: "arrayPolar", label: "Polar", icon: RotateCcw },
  { id: "arrayPath", label: "Caminho", icon: Route }
];

// Edicoes que decompoem ou removem entidades.
const modifyExtraTools: ReadonlyArray<RibbonTool> = [
  { id: "explode", label: "Explode", icon: Bomb },
  { id: "erase", label: "Erase", icon: Eraser }
];

const textTool: RibbonTool = { id: "text", label: "Text", icon: Type };

const blockTools: ReadonlyArray<RibbonTool> = [
  { id: "block", label: "Block", icon: Box },
  { id: "insert", label: "Insert", icon: Component }
];

const dimensionTools: ReadonlyArray<RibbonTool> = [
  { id: "dimLinear", label: "Linear", icon: Ruler },
  { id: "dimAligned", label: "Alinhada", icon: Ruler },
  { id: "dimRadius", label: "Raio", icon: Circle },
  { id: "dimDiameter", label: "Diâmetro", icon: Circle },
  { id: "dimAngular", label: "Angular", icon: RotateCw }
];

export function CadRibbon(props: CadRibbonProps) {
  const [activeTab, setActiveTab] = useState<RibbonTabId>("inicio");

  const importActions: ReadonlyArray<RibbonAction> = [
    { label: "JSON", icon: Download, onSelect: props.onImport, title: "Importar JSON" },
    { label: "SVG", icon: Download, onSelect: props.onImportSvg, title: "Importar SVG" },
    { label: "DXF", icon: Download, onSelect: props.onImportDxf, title: "Importar DXF (ASCII, R12 e 2000+)" }
  ];
  const exportActions: ReadonlyArray<RibbonAction> = [
    { label: "JSON", icon: Upload, onSelect: props.onExport, title: "Exportar JSON" },
    { label: "SVG", icon: Upload, onSelect: props.onExportSvg, title: "Exportar SVG" },
    { label: "DXF", icon: Upload, onSelect: props.onExportDxf, title: "Exportar DXF (ASCII R12)" }
  ];

  return (
    <div className="cad-ribbon-shell">
      <div className="cad-ribbon-tabs" role="tablist" aria-label="Abas de ferramentas">
        {ribbonTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`cad-ribbon-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <nav className="cad-ribbon" aria-label="Ferramentas CAD">
        {activeTab === "inicio" && (
          <>
            <RibbonGroup title="Selecionar">
              <RibbonToolButton tool={selectTool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
            </RibbonGroup>

            <RibbonGroup title="Navegar">
              {navTools.map((tool) => (
                <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
              ))}
            </RibbonGroup>

            <RibbonGroup title="Desenhar">
              {drawPrimaryTools.map((tool) => (
                <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
              ))}
              <RibbonToolMenu tools={curveTools} fallbackLabel="Curvas" fallbackIcon={Ellipse} activeTool={props.activeTool} onToolChange={props.onToolChange} />
            </RibbonGroup>

            <RibbonGroup title="Transformar">
              {transformTools.map((tool) => (
                <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
              ))}
            </RibbonGroup>

            <RibbonGroup title="Modificar">
              {modifyTools.map((tool) => (
                <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
              ))}
              <RibbonToolMenu tools={arrayTools} fallbackLabel="Array" fallbackIcon={Grid3X3} activeTool={props.activeTool} onToolChange={props.onToolChange} />
              {modifyExtraTools.map((tool) => (
                <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
              ))}
            </RibbonGroup>
          </>
        )}

        {activeTab === "anotar" && (
          <RibbonGroup title="Anotar">
            <RibbonToolButton tool={textTool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
            <RibbonToolMenu tools={dimensionTools} fallbackLabel="Cotas" fallbackIcon={Ruler} activeTool={props.activeTool} onToolChange={props.onToolChange} />
          </RibbonGroup>
        )}

        {activeTab === "inserir" && (
          <RibbonGroup title="Blocos">
            {blockTools.map((tool) => (
              <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
            ))}
          </RibbonGroup>
        )}

        {activeTab === "precisao" && (
          <>
            <RibbonGroup title="Precisao">
              <button
                className={`cad-ribbon-btn ${props.snapSettings.enabled ? "active" : ""}`}
                type="button"
                onClick={() => props.onSnapSettingsChange({ ...props.snapSettings, enabled: !props.snapSettings.enabled })}
                title="Alternar snap"
              >
                <Magnet size={20} />
                <span>Snap</span>
              </button>
              <details className="cad-ribbon-menu">
                <summary className="cad-ribbon-btn cad-ribbon-btn-secondary">
                  <ChevronDown size={16} />
                  <span>Modes</span>
                </summary>
                <div className="cad-ribbon-popover cad-snap-popover">
                  <SnapCheckbox label="Endpoint" checked={props.snapSettings.endpoint} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, endpoint: checked })} />
                  <SnapCheckbox label="Insertion" checked={props.snapSettings.insertion} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, insertion: checked })} />
                  <SnapCheckbox label="Midpoint" checked={props.snapSettings.midpoint} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, midpoint: checked })} />
                  <SnapCheckbox label="Center" checked={props.snapSettings.center} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, center: checked })} />
                  <SnapCheckbox label="Quadrant" checked={props.snapSettings.quadrant} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, quadrant: checked })} />
                  <SnapCheckbox label="Intersection" checked={props.snapSettings.intersection} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, intersection: checked })} />
                  <SnapCheckbox label="Perpendicular" checked={props.snapSettings.perpendicular} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, perpendicular: checked })} />
                  <SnapCheckbox label="Tangent" checked={props.snapSettings.tangent} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, tangent: checked })} />
                  <SnapCheckbox label="Nearest" checked={props.snapSettings.nearest} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, nearest: checked })} />
                </div>
              </details>
              <button
                className={`cad-ribbon-btn ${props.gridVisible ? "active" : ""}`}
                type="button"
                onClick={props.onToggleGrid}
                title="Mostrar/ocultar o grid de referência"
              >
                <Grip size={20} />
                <span>Grid</span>
              </button>
              <button
                className={`cad-ribbon-btn ${props.orthoMode ? "active" : ""}`}
                type="button"
                onClick={props.onToggleOrtho}
                title="Ortho: trava o traçado em horizontal/vertical"
              >
                <Maximize size={20} />
                <span>Ortho</span>
              </button>
            </RibbonGroup>

            <RibbonGroup title="Camadas" wide>
              <div className="cad-ribbon-layer">
                <Layers size={16} />
                <span title={props.activeLayerName}>{props.activeLayerName}</span>
              </div>
              <button className="cad-ribbon-icon-btn" type="button" onClick={props.onCreateLayer} title="Criar layer">
                <Plus size={16} />
              </button>
              <button className={`cad-ribbon-icon-btn ${props.activeLayerVisible ? "active" : ""}`} type="button" onClick={props.onToggleActiveLayerVisibility} title="Visibilidade da layer ativa">
                {props.activeLayerVisible ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button className={`cad-ribbon-icon-btn ${props.activeLayerLocked ? "active danger" : ""}`} type="button" onClick={props.onToggleActiveLayerLock} title="Bloqueio da layer ativa">
                {props.activeLayerLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
            </RibbonGroup>
          </>
        )}

        {activeTab === "arquivo" && (
          <RibbonGroup title="Arquivo">
            <RibbonActionMenu label="Importar" icon={Download} actions={importActions} />
            <RibbonActionMenu label="Exportar" icon={Upload} actions={exportActions} />
            <button className="cad-ribbon-btn danger" type="button" onClick={props.onClear} title="Limpar desenho">
              <Trash2 size={20} />
              <span>Clear</span>
            </button>
          </RibbonGroup>
        )}
      </nav>
    </div>
  );
}

function RibbonGroup({ children, title, wide = false }: Readonly<{ children: ReactNode; title: string; wide?: boolean }>) {
  return (
    <section className={`cad-ribbon-group ${wide ? "wide" : ""}`} aria-label={title}>
      <div className="cad-ribbon-tools">{children}</div>
      <div className="cad-ribbon-title">{title}</div>
    </section>
  );
}

function RibbonToolButton({ tool, activeTool, onToolChange }: Readonly<{ tool: RibbonTool; activeTool: ActiveCadTool; onToolChange(tool: ActiveCadTool): void }>) {
  return (
    <button
      className={`cad-ribbon-btn ${activeTool === tool.id ? "active" : ""}`}
      type="button"
      onClick={() => onToolChange(tool.id)}
      title={tool.label}
    >
      <tool.icon size={20} />
      <span>{tool.label}</span>
    </button>
  );
}

// Menu suspenso para uma familia de ferramentas: o botao reflete o membro ativo
// (como no AutoCAD) e, sem nenhum ativo, mostra um rotulo/icone de fallback.
function RibbonToolMenu({
  tools,
  fallbackLabel,
  fallbackIcon: FallbackIcon,
  activeTool,
  onToolChange
}: Readonly<{
  tools: ReadonlyArray<RibbonTool>;
  fallbackLabel: string;
  fallbackIcon: LucideIcon;
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
}>) {
  const activeInFamily = tools.find((tool) => tool.id === activeTool);
  const SummaryIcon = activeInFamily?.icon ?? FallbackIcon;
  return (
    <details className="cad-ribbon-menu">
      <summary className={`cad-ribbon-btn ${activeInFamily ? "active" : ""}`} title={fallbackLabel}>
        <SummaryIcon size={20} />
        <span>{activeInFamily?.label ?? fallbackLabel}</span>
        <ChevronDown size={11} />
      </summary>
      <div className="cad-ribbon-popover">
        {tools.map((tool) => (
          <button
            className={tool.id === activeTool ? "active" : ""}
            key={tool.id}
            type="button"
            onClick={(event) => {
              onToolChange(tool.id);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <tool.icon size={14} />
            {tool.label}
          </button>
        ))}
      </div>
    </details>
  );
}

// Menu suspenso para acoes (importar/exportar): rotulo fixo, sem estado ativo.
function RibbonActionMenu({ label, icon: Icon, actions }: Readonly<{ label: string; icon: LucideIcon; actions: ReadonlyArray<RibbonAction> }>) {
  return (
    <details className="cad-ribbon-menu">
      <summary className="cad-ribbon-btn" title={label}>
        <Icon size={20} />
        <span>{label}</span>
        <ChevronDown size={11} />
      </summary>
      <div className="cad-ribbon-popover">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            title={action.title ?? action.label}
            onClick={(event) => {
              action.onSelect();
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <action.icon size={14} />
            {action.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function SnapCheckbox({ checked, label, onChange }: Readonly<{ checked: boolean; label: string; onChange(checked: boolean): void }>) {
  return (
    <label className="cad-ribbon-checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}
