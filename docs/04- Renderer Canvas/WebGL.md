Aja como Arquiteto Sênior de Renderização CAD Web, especialista em Canvas 2D, OffscreenCanvas, Web Workers, WebGL/WebGPU, viewport matemático, performance gráfica e renderização de entidades vetoriais para sistemas CAD de engenharia.

Estamos desenvolvendo um CAD-WEB comercial de alta performance para empresas de engenharia.

Este chat será dedicado exclusivamente ao **Renderer do CAD**, ou seja, à camada responsável por desenhar o projeto na tela com alta performance.

Stack base do projeto:

* React + TypeScript + Vite
* Tailwind + shadcn/ui para interface
* Canvas 2D como renderizador inicial
* OffscreenCanvas e Web Workers como evolução de performance
* WebGL/WebGPU como evolução futura
* Kernel geométrico separado em pacote próprio `cad-geometry`
* Documento CAD separado em `cad-core`
* Ferramentas interativas separadas em `cad-tools`
* Backend Laravel SaaS multiempresa
* PostgreSQL para versionamento e branches
* JSON próprio como formato nativo
* SVG para importação/exportação

Objetivo deste chat:
Definir e implementar a arquitetura do renderizador CAD 2D.

O Renderer deve cuidar de:

* Canvas principal
* Viewport
* Conversão worldToScreen e screenToWorld
* Zoom com foco no cursor
* Pan
* Zoom Extents
* Grid infinito adaptativo
* Eixos X/Y
* Crosshair infinito
* Renderização de entidades CAD
* Renderização de linhas
* Renderização de polilinhas
* Renderização de círculos
* Renderização de arcos
* Renderização de retângulos
* Renderização de textos
* Renderização de cotas
* Highlight de seleção
* Preview ghost de comandos
* Snap markers
* Grips de edição
* Camadas/layers visíveis e bloqueadas
* Renderização incremental futura
* Separação entre render estático e overlay dinâmico
* Otimização para milhares de entidades
* Preparação futura para WebGL/WebGPU

Regras arquiteturais:

1. O Renderer não pode alterar a geometria do projeto.
2. O Renderer apenas desenha o estado recebido.
3. O Renderer não deve depender diretamente do Laravel ou do banco de dados.
4. O Renderer pode depender dos tipos do `cad-core` e funções matemáticas do `cad-geometry`.
5. A lógica de ferramenta não deve ficar dentro do Renderer.
6. O Canvas deve trabalhar com devicePixelRatio para alta definição.
7. O zoom e o pan devem ser matematicamente precisos.
8. O desenho deve ser performático mesmo com muitos objetos.
9. O sistema deve separar camada base, camada de entidades, camada de preview e camada de interação.
10. O código deve permitir evolução futura de Canvas 2D para WebGL/WebGPU sem reescrever todo o CAD.

Primeira tarefa:
Crie a arquitetura inicial do pacote `cad-renderer`, contendo:

* Estrutura de pastas recomendada
* Modelo de `Viewport`
* Funções `worldToScreen` e `screenToWorld`
* Estratégia de zoom e pan
* Estratégia de grid infinito adaptativo
* Estratégia de renderização de entidades
* Separação entre canvas base, canvas overlay e canvas de interação
* Estratégia de performance para milhares de entidades
* Como preparar a arquitetura para WebGL/WebGPU no futuro
* Ordem recomendada de implementação
