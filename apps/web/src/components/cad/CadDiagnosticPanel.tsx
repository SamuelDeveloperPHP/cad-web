import { useEffect, useState } from "react";
import { cadDiagnostics, type CadMetrics } from "../../diagnostics/CadDiagnosticsService";
import { generateEntities } from "../../diagnostics/dev/internal/EntityGenerator";
import { AddMultipleEntitiesCommand } from "@cad-web/cad-core";
import type { CadStore } from "../../state/useCadStore";

export function CadDiagnosticPanel({ cad }: Readonly<{ cad: CadStore }>) {
  const isEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_CAD_DIAGNOSTICS === "true";

  const [metrics, setMetrics] = useState<CadMetrics>({
    totalEntities: 0,
    visibleEntities: 0,
    renderedEntities: 0,
    renderTimeMs: 0,
    indexQueryTimeMs: 0,
    fps: 0
  });

  useEffect(() => {
    if (!isEnabled) return;

    const unsubscribe = cadDiagnostics.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });

    return unsubscribe;
  }, [isEnabled]);

  if (!isEnabled) {
    return null;
  }

  const handleGenerate = (count: number) => {
    if (count >= 50000) {
      const confirmed = window.confirm(
        `Atenção: Gerar ${count} entidades pode causar lentidão na renderização e na interface dependendo do hardware. Deseja continuar?`
      );
      if (!confirmed) return;
    }

    const newEntities = generateEntities({ count, mode: "grid" });
    const command = new AddMultipleEntitiesCommand(newEntities);
    cad.executeCommand(command);
  };

  const handleClear = () => {
    // We can dispatch 'clear' via command line
    cad.runCommandLine("clear");
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "60px",
        right: "20px",
        background: "rgba(0, 0, 0, 0.8)",
        color: "#10b981",
        padding: "1rem",
        borderRadius: "8px",
        zIndex: 9999,
        fontFamily: "monospace",
        fontSize: "12px",
        border: "1px solid #10b981",
        boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
        pointerEvents: "auto"
      }}
    >
      <h3 style={{ margin: "0 0 10px 0", borderBottom: "1px solid #10b981", paddingBottom: "4px" }}>
        INTERNAL DIAGNOSTICS
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
        <span>Total Entities: {metrics.totalEntities}</span>
        <span>Visible Entities: {metrics.visibleEntities}</span>
        <span>Rendered Entities: {metrics.renderedEntities}</span>
        <span>FPS: {metrics.fps}</span>
        <span>Render Time: {metrics.renderTimeMs.toFixed(1)} ms</span>
        <span>Index Time: {metrics.indexQueryTimeMs.toFixed(1)} ms</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        <button
          onClick={() => handleGenerate(1000)}
          style={{ background: "#1f2937", color: "white", border: "1px solid #374151", padding: "4px 8px", cursor: "pointer" }}
        >
          Gen 1k
        </button>
        <button
          onClick={() => handleGenerate(10000)}
          style={{ background: "#1f2937", color: "white", border: "1px solid #374151", padding: "4px 8px", cursor: "pointer" }}
        >
          Gen 10k
        </button>
        <button
          onClick={() => handleGenerate(50000)}
          style={{ background: "#1f2937", color: "white", border: "1px solid #374151", padding: "4px 8px", cursor: "pointer" }}
        >
          Gen 50k
        </button>
        <button
          onClick={() => handleGenerate(100000)}
          style={{ background: "#1f2937", color: "white", border: "1px solid #374151", padding: "4px 8px", cursor: "pointer" }}
        >
          Gen 100k
        </button>
        <button
          onClick={handleClear}
          style={{ background: "#7f1d1d", color: "white", border: "1px solid #991b1b", padding: "4px 8px", cursor: "pointer", marginLeft: "auto" }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
