import type { SnapSettings } from "@cad-web/cad-geometry";
import {
  ChevronDown,
  Circle,
  CornerDownRight,
  CornerRightDown,
  Copy,
  Download,
  Grid3X3,
  RotateCcw,
  Route,
  Eraser,
  Eye,
  EyeOff,
  Grip,
  Layers,
  Lock,
  Magnet,
  Maximize,
  Minus,
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
  Upload,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import type { ActiveCadTool } from "../../state/useCadStore";

type CadRibbonProps = Readonly<{
  activeTool: ActiveCadTool;
  onToolChange(tool: ActiveCadTool): void;
  snapSettings: SnapSettings;
  onSnapSettingsChange(settings: SnapSettings): void;
  onClear(): void;
  onExport(): void;
  onExportSvg(): void;
  onImport(): void;
  onImportSvg(): void;
  activeLayerName: string;
  activeLayerVisible: boolean;
  activeLayerLocked: boolean;
  onCreateLayer(): void;
  onToggleActiveLayerVisibility(): void;
  onToggleActiveLayerLock(): void;
}>;

type RibbonTool = Readonly<{
  id: ActiveCadTool;
  label: string;
  icon: LucideIcon;
}>;

const drawTools: ReadonlyArray<RibbonTool> = [
  { id: "line", label: "Line", icon: Minus },
  { id: "polyline", label: "PLine", icon: Spline },
  { id: "rectangle", label: "Rect", icon: Square },
  { id: "circle", label: "Circle", icon: Circle }
];

const modifyTools: ReadonlyArray<RibbonTool> = [
  { id: "move", label: "Move", icon: Move },
  { id: "rotate", label: "Rotate", icon: RotateCw },
  { id: "scale", label: "Scale", icon: Scaling },
  { id: "offset", label: "Offset", icon: Copy },
  { id: "trim", label: "Trim", icon: Scissors },
  { id: "extend", label: "Extend", icon: MoveRight },
  { id: "fillet", label: "Fillet", icon: CornerDownRight },
  { id: "chamfer", label: "Chamfer", icon: CornerRightDown },
  { id: "array", label: "Array", icon: Grid3X3 },
  { id: "arrayPolar", label: "Polar", icon: RotateCcw },
  { id: "arrayPath", label: "Path", icon: Route },
  { id: "erase", label: "Erase", icon: Eraser }
];

const dimensionTools: ReadonlyArray<RibbonTool> = [
  { id: "dimLinear", label: "Linear", icon: Ruler },
  { id: "dimAligned", label: "Aligned", icon: Ruler },
  { id: "dimRadius", label: "Radius", icon: Circle },
  { id: "dimDiameter", label: "Diameter", icon: Circle },
  { id: "dimAngular", label: "Angular", icon: RotateCw }
];

export function CadRibbon(props: CadRibbonProps) {
  const activeDimensionTool = dimensionTools.find((tool) => tool.id === props.activeTool) ?? dimensionTools[0];

  return (
    <nav className="cad-ribbon" aria-label="Ribbon CAD">
      <RibbonGroup title="Desenhar">
        {drawTools.map((tool) => (
          <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
        ))}
      </RibbonGroup>

      <RibbonGroup title="Modificar">
        {modifyTools.map((tool) => (
          <RibbonToolButton key={tool.id} tool={tool} activeTool={props.activeTool} onToolChange={props.onToolChange} />
        ))}
      </RibbonGroup>

      <RibbonGroup title="Cotas">
        <details className="cad-ribbon-menu">
          <summary className={`cad-ribbon-btn ${activeDimensionTool?.id === props.activeTool ? "active" : ""}`}>
            <Ruler size={20} />
            <span>{activeDimensionTool?.label ?? "Linear"}</span>
            <ChevronDown size={11} />
          </summary>
          <div className="cad-ribbon-popover">
            {dimensionTools.map((tool) => (
              <button
                className={tool.id === props.activeTool ? "active" : ""}
                key={tool.id}
                type="button"
                onClick={() => props.onToolChange(tool.id)}
              >
                <tool.icon size={14} />
                {tool.label}
              </button>
            ))}
          </div>
        </details>
      </RibbonGroup>

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
            <SnapCheckbox label="Midpoint" checked={props.snapSettings.midpoint} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, midpoint: checked })} />
            <SnapCheckbox label="Center" checked={props.snapSettings.center} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, center: checked })} />
            <SnapCheckbox label="Nearest" checked={props.snapSettings.nearest} onChange={(checked) => props.onSnapSettingsChange({ ...props.snapSettings, nearest: checked })} />
          </div>
        </details>
        <button className="cad-ribbon-btn cad-ribbon-btn-disabled" type="button" title="Grid placeholder">
          <Grip size={20} />
          <span>Grid</span>
        </button>
        <button className="cad-ribbon-btn cad-ribbon-btn-disabled" type="button" title="Ortho placeholder">
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

      <RibbonGroup title="Arquivo">
        <button className="cad-ribbon-btn" type="button" onClick={props.onImport} title="Importar JSON">
          <Download size={20} />
          <span>Imp JSON</span>
        </button>
        <button className="cad-ribbon-btn" type="button" onClick={props.onExport} title="Exportar JSON">
          <Upload size={20} />
          <span>Exp JSON</span>
        </button>
        <button className="cad-ribbon-btn" type="button" onClick={props.onImportSvg} title="Importar SVG">
          <Download size={20} />
          <span>Imp SVG</span>
        </button>
        <button className="cad-ribbon-btn" type="button" onClick={props.onExportSvg} title="Exportar SVG">
          <Upload size={20} />
          <span>Exp SVG</span>
        </button>
        <button className="cad-ribbon-btn danger" type="button" onClick={props.onClear} title="Limpar desenho">
          <Trash2 size={20} />
          <span>Clear</span>
        </button>
      </RibbonGroup>
    </nav>
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

function SnapCheckbox({ checked, label, onChange }: Readonly<{ checked: boolean; label: string; onChange(checked: boolean): void }>) {
  return (
    <label className="cad-ribbon-checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}
