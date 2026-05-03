import { useEffect, useRef } from "react";
import { CadCanvas } from "./CadCanvas";
import { CadCommandLine } from "./CadCommandLine";
import { CadStatusBar } from "./CadStatusBar";
import { CadToolbar } from "./CadToolbar";
import { useCadStore } from "../../state/useCadStore";
import { downloadCadDocument, readCadDocumentFile } from "../../services/cadJsonExport";
import { createToolKeyboardEvent } from "../../tools/toolEvents";

export function CadEditor() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  return (
    <section className="cad-editor">
      <CadToolbar
        activeTool={cad.activeTool}
        canUndo={cad.canUndo}
        canRedo={cad.canRedo}
        snapSettings={cad.snapSettings}
        onToolChange={cad.setActiveTool}
        onSnapSettingsChange={cad.setSnapSettings}
        onUndo={cad.undo}
        onRedo={cad.redo}
        onClear={cad.clearDocument}
        onExport={() => downloadCadDocument(cad.document)}
        onImport={handleImportClick}
      />
      <div className="cad-workspace">
        <CadCanvas cad={cad} />
        <CadCommandLine onSubmit={cad.runCommandLine} />
      </div>
      <CadStatusBar
        activeTool={cad.activeTool}
        mouseWorld={cad.mouseWorld}
        zoom={cad.viewport.scale}
        entityCount={cad.document.entities.length}
        snapSettings={cad.snapSettings}
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
    </section>
  );
}
