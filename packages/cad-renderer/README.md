# cad-renderer

Pacote de renderizacao 2D do CAD-WEB Engenharia SaaS.

## Objetivo

O `cad-renderer` desenha o estado recebido do `cad-core` usando matematica do `cad-geometry`. Ele nao altera entidades, comandos, documentos ou historico.

## Estrutura Inicial

```text
src/
  types.ts
  viewport.ts
  grid.ts
  canvas.ts
  entities.ts
  overlays.ts
  pipeline.ts
  index.ts
```

## Camadas de Canvas

- `base`: grid, eixos e elementos estaticos de fundo.
- `entities`: entidades CAD persistidas no documento.
- `preview`: ghost de comandos e previews temporarios.
- `interaction`: crosshair, snap markers, grips e highlights.

## Estrategia de Viewport

O viewport usa `origin` em coordenadas de mundo e `scale` em pixels por unidade de mundo. A conversao `worldToScreen` e `screenToWorld` fica isolada para garantir zoom, pan e snap matematicamente consistentes.

## Estrategia de Performance

- O renderer separa canvas base e canvas de entidades para reduzir redraws.
- O grid e calculado apenas para a area visivel.
- A arquitetura permite culling por bounding box antes de desenhar entidades.
- A camada de overlay pode ser redesenhada com alta frequencia sem invalidar o desenho base.
- Web Workers e OffscreenCanvas podem renderizar camadas estaticas no futuro.

## Preparacao para WebGL/WebGPU

O pacote define `RendererBackend` e `RendererCapabilities` para permitir backends futuros. A primeira implementacao usa Canvas 2D, mas as entradas do pipeline devem continuar sendo documento, viewport, estilo e camadas, evitando acoplamento direto com React ou ferramentas.

## Ordem Recomendada de Implementacao

1. Consolidar viewport, pan, zoom e zoom extents.
2. Implementar grid infinito adaptativo e eixos.
3. Renderizar entidades CAD basicas.
4. Separar camadas base, entidades, preview e interacao.
5. Implementar highlights, snap markers e grips.
6. Adicionar culling por bounding box.
7. Avaliar OffscreenCanvas para camadas estaticas.
8. Criar backend experimental WebGL/WebGPU.
