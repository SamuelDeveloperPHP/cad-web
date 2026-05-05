import { CreateLayerCommand, ToggleLayerLockCommand, ToggleLayerVisibilityCommand } from "@cad-web/cad-core";
import { ChangeDisplayUnitCommand } from "@cad-web/cad-tools";
import { useEffect, useRef } from "react";
import { useCadStore } from "../../state/useCadStore";
import { downloadCadDocument, downloadSvgDocument, readCadDocumentFile, readSvgDocumentFile } from "../../services/cadJsonExport";
import { createToolKeyboardEvent } from "../../tools/toolEvents";
import { CadCanvas } from "./CadCanvas";
import { CadCommandLine } from "./CadCommandLine";
import { CadDiagnosticPanel } from "./CadDiagnosticPanel";
import { CadRibbon } from "./CadRibbon";
import { CadRightPanel } from "./CadRightPanel";
import { CadStatusBar } from "./CadStatusBar";
import { CadToolbar } from "./CadToolbar";
import { CadTopMenu } from "./CadTopMenu";

type DisplayUnitInput = ConstructorParameters<typeof ChangeDisplayUnitCommand>[0];

export function CadEditor() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const svgFileInputRef = useRef<HTMLInputElement | null>(null);
  const cad = useCadStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }

      cad.dispatchKeyDown(createToolKeyboardEvent(event));
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cad]);

  const activeLayer = cad.document.layers.find((layer) => layer.id === cad.document.activeLayerId);
  const activeLayerName = activeLayer?.name ?? cad.document.activeLayerId;
  const activeDimStyleId = cad.document.activeDimensionStyleId || "dimstyle_standard";
  const activeDimStyleName = cad.document.dimensionStyles?.find((style) => style.id === activeDimStyleId)?.name || "Standard";

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSvgClick = () => {
    svgFileInputRef.current?.click();
  };

  const handleCreateLayer = () => {
    const name = window.prompt("Nome da nova layer", `Layer ${cad.document.layers.length + 1}`)?.trim();

    if (!name) {
      return;
    }

    cad.executeCommand(new CreateLayerCommand({
      id: `layer_${Date.now()}`,
      name,
      color: "#ffffff",
      visible: true,
      locked: false,
      order: cad.document.layers.length
    }));
  };

  const confirmLargeExport = () => (
    cad.document.entities.length <= 50000 ||
    window.confirm("Atencao: exportar mais de 50.000 entidades pode causar travamento temporario no navegador. Deseja prosseguir?")
  );

  return (
    <section className="app-shell">
      <CadTopMenu />

      <CadRibbon
        activeTool={cad.activeTool}
        onToolChange={cad.setActiveTool}
        snapSettings={cad.snapSettings}
        onSnapSettingsChange={cad.setSnapSettings}
        onClear={cad.clearDocument}
        onExport={() => {
          if (confirmLargeExport()) {
            downloadCadDocument(cad.document);
          }
        }}
        onExportSvg={() => {
          if (confirmLargeExport()) {
            downloadSvgDocument(cad.document);
          }
        }}
        onImport={handleImportClick}
        onImportSvg={handleImportSvgClick}
        activeLayerName={activeLayerName}
        activeLayerVisible={activeLayer?.visible ?? true}
        activeLayerLocked={activeLayer?.locked ?? false}
        onCreateLayer={handleCreateLayer}
        onToggleActiveLayerVisibility={() => {
          if (activeLayer) {
            cad.executeCommand(new ToggleLayerVisibilityCommand(activeLayer.id, !activeLayer.visible));
          }
        }}
        onToggleActiveLayerLock={() => {
          if (activeLayer) {
            cad.executeCommand(new ToggleLayerLockCommand(activeLayer.id, !activeLayer.locked));
          }
        }}
      />

      <div className="cad-editor">
        <CadToolbar activeTool={cad.activeTool} onToolChange={cad.setActiveTool} />

        <div className="cad-workspace">
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_CAD_DIAGNOSTICS === "true") && <CadDiagnosticPanel cad={cad} />}
          <CadCanvas cad={cad} />
        </div>

        <CadRightPanel cad={cad} />
      </div>

      <CadCommandLine activeTool={cad.activeTool} onSubmit={cad.runCommandLine} message={cad.message} />

      <CadStatusBar
        activeTool={cad.activeTool}
        mouseWorld={cad.mouseWorld}
        zoom={cad.viewport.scale}
        entityCount={cad.document.entities.length}
        snapSettings={cad.snapSettings}
        activeLayerName={activeLayerName}
        activeDimStyleName={activeDimStyleName}
        displayUnit={cad.document.displayUnit || cad.document.units}
        documentUnits={cad.document.units}
        onSnapSettingsChange={cad.setSnapSettings}
        onDisplayUnitChange={(unit) => cad.executeCommand(new ChangeDisplayUnitCommand(unit as DisplayUnitInput))}
      />

      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";

          if (file === undefined) {
            return;
          }

          void readCadDocumentFile(file).then(cad.importDocument);
        }}
      />
      <input
        ref={svgFileInputRef}
        className="hidden-input"
        type="file"
        accept="image/svg+xml,.svg"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";

          if (file === undefined) {
            return;
          }

          void readSvgDocumentFile(file).then(cad.importDocument);
        }}
      />
    </section>
  );
}
