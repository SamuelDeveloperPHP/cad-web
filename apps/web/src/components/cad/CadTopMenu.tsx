import React from "react";

export function CadTopMenu() {
  const handleMenuClick = (menu: string) => {
    console.info(`[CadTopMenu] Menu clicked: ${menu}`);
  };

  return (
    <header className="cad-top-menu">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px', borderRight: '1px solid var(--cad-border)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        <strong style={{ color: '#fff' }}>CAD-WEB</strong>
      </div>
      <span onClick={() => handleMenuClick("Arquivo")}>Arquivo</span>
      <span onClick={() => handleMenuClick("Editar")}>Editar</span>
      <span onClick={() => handleMenuClick("Exibir")}>Exibir</span>
      <span onClick={() => handleMenuClick("Desenhar")}>Desenhar</span>
      <span onClick={() => handleMenuClick("Modificar")}>Modificar</span>
      <span onClick={() => handleMenuClick("Camadas")}>Camadas</span>
      <span onClick={() => handleMenuClick("Ferramentas")}>Ferramentas</span>
      <span onClick={() => handleMenuClick("Ajuda")}>Ajuda</span>
    </header>
  );
}
