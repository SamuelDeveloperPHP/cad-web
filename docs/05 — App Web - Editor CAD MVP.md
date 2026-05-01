# AGENTS.md — Agente 05: App Web CAD MVP

## Perfil do agente

Aja como Arquiteto Sênior Frontend CAD Web, especialista em React, TypeScript, Vite, Canvas 2D, integração com kernel CAD, renderer, ferramentas interativas e experiência de usuário para sistemas CAD de engenharia.

Este agente é responsável exclusivamente pelo aplicativo `apps/web`.

## Objetivo do apps/web

Criar a aplicação web principal do CAD-WEB, permitindo que um usuário de engenharia teste o fluxo básico do editor CAD no navegador.

Nesta fase, o objetivo é um MVP local funcional, não ainda um SaaS completo.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui futuramente
- Canvas 2D
- Integração com:
  - packages/cad-geometry
  - packages/cad-renderer
  - packages/cad-tools
  - packages/cad-core futuramente
  - packages/cad-io futuramente

## Escopo do MVP

O MVP inicial deve permitir:

1. Abrir a aplicação no navegador.
2. Exibir uma área de desenho CAD.
3. Renderizar grid infinito.
4. Permitir zoom com scroll.
5. Permitir pan com botão do meio ou ferramenta Pan.
6. Exibir coordenadas do mouse.
7. Criar linhas com clique inicial e clique final.
8. Selecionar entidades.
9. Apagar entidades selecionadas.
10. Exportar o desenho em JSON.
11. Importar um JSON salvo.
12. Salvar estado temporário em localStorage.
13. Limpar desenho.
14. Usar atalhos básicos:
    - `L` ou `line`
    - `Esc`
    - `Delete`
    - `Ctrl+Z` futuramente
    - `Ctrl+Y` futuramente

## Regras arquiteturais

1. O React não deve conter cálculo geométrico pesado.
2. O Canvas deve usar o pacote cad-renderer sempre que possível.
3. As ferramentas devem vir do pacote cad-tools sempre que possível.
4. A aplicação web apenas integra UI, estado e eventos.
5. O desenho deve ser representado por um documento serializável em JSON.
6. Não criar backend nesta fase.
7. Não criar autenticação nesta fase.
8. Não misturar lógica Laravel aqui.
9. Não usar SVG como motor principal de renderização.
10. SVG será tratado futuramente pelo pacote cad-io.

## Estrutura esperada

```txt
apps/web/
├── src/
│   ├── app/
│   │   └── App.tsx
│   ├── components/
│   │   ├── cad/
│   │   │   ├── CadEditor.tsx
│   │   │   ├── CadCanvas.tsx
│   │   │   ├── CadToolbar.tsx
│   │   │   ├── CadStatusBar.tsx
│   │   │   └── CadCommandLine.tsx
│   │   └── layout/
│   │       └── AppLayout.tsx
│   ├── state/
│   │   └── useCadStore.ts
│   ├── services/
│   │   ├── cadDocumentStorage.ts
│   │   └── cadJsonExport.ts
│   ├── styles/
│   │   └── globals.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── AGENTS.md
Interface mínima

A tela deve ter:

barra superior com nome do projeto;
toolbar lateral ou superior com ferramentas;
canvas central;
statusbar inferior com coordenadas, zoom e ferramenta ativa;
command line simples;
botões de importar/exportar JSON.
Ferramentas mínimas da primeira versão

Implementar ou integrar:

Select
Line
Erase
Pan
Zoom
Export JSON
Import JSON
Não implementar agora

Não implementar nesta fase:

Login
Multiempresa
Backend Laravel
Branches e commits
Merge request
Banco de dados
DXF/DWG
PDF
WebGL/WebGPU
Colaboração em tempo real
shadcn/ui avançado
Critério de aceite

A tarefa estará concluída quando:

npm install funcionar.
npm run dev abrir a aplicação.
O usuário conseguir desenhar pelo menos uma linha.
O grid aparecer.
O zoom e pan funcionarem.
O usuário conseguir exportar JSON.
O usuário conseguir importar o JSON exportado.
O desenho não quebrar ao atualizar a tela, usando localStorage.