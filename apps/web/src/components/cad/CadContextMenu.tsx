import type { ToolMenuItem } from "@cad-web/cad-tools";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";

type CadContextMenuProps = Readonly<{
  x: number;
  y: number;
  items: ReadonlyArray<ToolMenuItem>;
  onSelect(item: ToolMenuItem): void;
  onClose(): void;
}>;

/**
 * Menu de contexto da ferramenta ativa (ex.: modos do grip: Stretch, Move, Rotate, Scale, Mirror, Base Point,
 * Copy). O componente só apresenta os itens; a escolha vira entrada de comando da ferramenta.
 * Fecha com Esc, clique fora ou rolagem.
 */
export function CadContextMenu({ x, y, items, onSelect, onClose }: CadContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      // O Esc só fecha o menu: o grip continua ativo.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("wheel", onClose, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("wheel", onClose, { capture: true });
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="cad-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <div key={item.command}>
          {item.separatorBefore === true && <div className="cad-context-menu-separator" role="separator" />}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={item.checked === true}
            className="cad-context-menu-item"
            disabled={item.disabled === true}
            onClick={() => onSelect(item)}
          >
            <span className="cad-context-menu-check">{item.checked === true && <Check size={12} />}</span>
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
