import { ChevronDown, FilePlus2, FolderOpen, Redo2, Save, Undo2 } from "lucide-react";

type CadTopMenuProps = Readonly<{
  documentName: string;
  canUndo: boolean;
  canRedo: boolean;
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
}>;

// Define as categorias do menu do aplicativo exibidas dentro do botao da marca.
const APP_MENU_ITEMS = ["Arquivo", "Editar", "Exibir", "Desenhar", "Modificar", "Camadas", "Ferramentas", "Ajuda"] as const;

export function CadTopMenu(props: CadTopMenuProps) {
  // Registra a categoria clicada enquanto os submenus ainda nao possuem acoes definidas.
  const handleMenuClick = (menu: string) => {
    console.info(`[CadTopMenu] Menu clicked: ${menu}`);
  };

  return (
    <header className="cad-top-menu">
      <div className="cad-app-menu">
        <button className="cad-app-btn" type="button" aria-label="Menu do aplicativo CAD-WEB">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <strong>CAD</strong>
          <ChevronDown size={13} />
        </button>
        <div className="cad-app-dropdown">
          {APP_MENU_ITEMS.map((item) => (
            <button key={item} type="button" onClick={() => handleMenuClick(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="cad-qat" aria-label="Acesso rapido">
        <button className="cad-qat-btn" type="button" onClick={props.onNew} title="Novo desenho">
          <FilePlus2 size={17} />
        </button>
        <button className="cad-qat-btn" type="button" onClick={props.onOpen} title="Abrir (importar JSON)">
          <FolderOpen size={17} />
        </button>
        <button className="cad-qat-btn" type="button" onClick={props.onSave} title="Salvar (exportar JSON)">
          <Save size={17} />
        </button>
        <span className="cad-qat-sep" />
        <button className="cad-qat-btn" type="button" onClick={props.onUndo} disabled={!props.canUndo} title="Desfazer">
          <Undo2 size={17} />
        </button>
        <button className="cad-qat-btn" type="button" onClick={props.onRedo} disabled={!props.canRedo} title="Refazer">
          <Redo2 size={17} />
        </button>
      </div>

      <div className="cad-top-menu-doc" title={props.documentName}>
        <span>{props.documentName}</span>
      </div>

      <div className="cad-top-menu-spacer" />
    </header>
  );
}
