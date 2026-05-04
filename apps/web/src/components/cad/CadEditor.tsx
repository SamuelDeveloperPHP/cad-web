import { useEffect, useRef } from "react";
import { CadCanvas } from "./CadCanvas";
import { CadCommandLine } from "./CadCommandLine";
import { CadStatusBar } from "./CadStatusBar";
import { CadToolbar } from "./CadToolbar";
import { CadDiagnosticPanel } from "./CadDiagnosticPanel";
import { CadRightPanel } from "./CadRightPanel";
import { CadTopMenu } from "./CadTopMenu";
import { CadRibbon } from "./CadRibbon";
import { useCadStore } from "../../state/useCadStore";
import { downloadCadDocument, downloadSvgDocument, readCadDocumentFile, readSvgDocumentFile } from "../../services/cadJsonExport";
import { createToolKeyboardEvent } from "../../tools/toolEvents";
import { ChangeDisplayUnitCommand } from "@cad-web/cad-tools";

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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSvgClick = () => {
    svgFileInputRef.current?.click();
  };

  const activeLayerName = cad.document.layers.find(l => l.id === cad.document.activeLayerId)?.name ?? cad.document.activeLayerId;

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
          if (cad.document.entities.length > 50000) {
            if (!window.confirm("Atenção: Exportar um arquivo com mais de 50.000 entidades pode causar travamento temporário no navegador. Deseja prosseguir?")) {
              return;
            }
          }
          downloadCadDocument(cad.document);
        }}
        onExportSvg={() => {
          if (cad.document.entities.length > 50000) {
            if (!window.confirm("Atenção: Exportar um arquivo com mais de 50.000 entidades pode causar travamento temporário no navegador. Deseja prosseguir?")) {
              return;
            }
          }
          downloadSvgDocument(cad.document);
        }}
        onImport={handleImportClick}
        onImportSvg={handleImportSvgClick}
        activeLayerName={activeLayerName}
      />

      <div className="cad-editor">
        <CadToolbar
          activeTool={cad.activeTool}
          onToolChange={cad.setActiveTool}
        />
        
        <div className="cad-workspace">
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_CAD_DIAGNOSTICS === "true") && <CadDiagnosticPanel />}
          <CadCanvas cad={cad} />
        </div>

        <CadRightPanel cad={cad} />
      </div>

      <CadCommandLine 
        activeTool={cad.activeTool} 
        onSubmit={cad.runCommandLine} 
        message={cad.message} 
      />
      
      <CadStatusBar
        activeTool={cad.activeTool}
        mouseWorld={cad.mouseWorld}
        zoom={cad.viewport.scale}
        entityCount={cad.document.entities.length}
        snapSettings={cad.snapSettings}
        activeLayerName={activeLayerName}
        displayUnit={cad.document.displayUnit || cad.document.units}
        documentUnits={cad.document.units}
        onSnapSettingsChange={cad.setSnapSettings}
        onDisplayUnitChange={(unit) => cad.executeCommand(new ChangeDisplayUnitCommand(unit as any))}
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
