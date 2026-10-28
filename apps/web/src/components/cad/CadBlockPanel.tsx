import { DeleteBlockDefinitionCommand, blockIsReferenced, type CadDocument } from "@cad-web/cad-core";
import { Component, Trash2 } from "lucide-react";
import type { CadStore } from "../../state/useCadStore";

// Quantas referências no desenho (e dentro de outros blocos) usam cada definição.
function countReferences(document: CadDocument, name: string): number {
  const countIn = (entities: CadDocument["entities"]) => entities.filter((entity) => entity.type === "block" && entity.blockName === name).length;
  return countIn(document.entities) + (document.blocks ?? []).reduce((total, block) => total + (block.name === name ? 0 : countIn(block.entities)), 0);
}

/**
 * Lista as definições de bloco do desenho: insere (ferramenta Insert já no bloco escolhido) e remove as
 * definições sem uso. A criação é feita com a ferramenta Block a partir da seleção.
 */
export function CadBlockPanel({ cad }: { cad: CadStore }) {
  const blocks = cad.document.blocks ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, overflowY: "auto" }}>
      <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
        Select objects and run <b>BLOCK</b> (B) to create a block; <b>INSERT</b> (I) places it. Blocks imported from DXF appear here.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="cad-ribbon-btn cad-ribbon-btn-secondary" onClick={() => cad.setActiveTool("block")} title="Create a block from the selection">
          <Component size={16} /> New from selection
        </button>
      </div>
      {blocks.length === 0 && <div style={{ padding: "12px 0", opacity: 0.6, fontSize: 12 }}>No blocks in this drawing.</div>}
      {blocks.map((block) => {
        const uses = countReferences(cad.document, block.name);
        const used = blockIsReferenced(cad.document, block.name);

        return (
          <div
            key={block.name}
            data-testid="block-row"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: "1px solid var(--cad-border)", borderRadius: 6 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={block.name}>{block.name}</div>
              <div style={{ fontSize: 11, opacity: 0.65 }}>{block.entities.length} objects · {uses} insert{uses === 1 ? "" : "s"}</div>
            </div>
            <button type="button" className="cad-ribbon-btn cad-ribbon-btn-secondary" onClick={() => cad.startBlockInsert(block.name)} title={`Insert ${block.name}`}>
              Insert
            </button>
            <button
              type="button"
              className="cad-ribbon-btn cad-ribbon-btn-secondary"
              disabled={used}
              onClick={() => cad.executeCommand(new DeleteBlockDefinitionCommand(block))}
              title={used ? "In use: erase or explode its references first" : `Delete ${block.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
