# cad-geometry

Pacote de geometria computacional 2D do CAD-WEB Engenharia SaaS.

## Objetivo

Este pacote concentra matematica pura, tipos geometricos, tolerancias numericas e operacoes reutilizaveis por ferramentas, comandos e renderizadores.

## Estrutura Inicial

```text
src/
  constants.ts
  types.ts
  vector.ts
  matrix.ts
  bounding-box.ts
  entities.ts
  distance.ts
  index.ts
```

## Responsabilidades

- Sistema de coordenadas do mundo 2D.
- Tipos `Point2D`, `Vector2D`, `Matrix2D` e `BoundingBox`.
- Entidades geometricas serializaveis em JSON.
- Operacoes vetoriais puras.
- Transformacoes por matriz afim 2D.
- Bounding boxes.
- Projecao de ponto em segmento.
- Distancia entre ponto e segmento.
- Base para snaps, intersecoes, offset, trim, fillet e chamfer.

## Tolerancia Numerica

O pacote usa `CAD_EPSILON = 1e-9` como tolerancia base para comparacoes geometricas. Operacoes sensiveis devem receber tolerancia opcional quando precisarem adaptar precisao por unidade, escala de desenho ou ferramenta.

## Ordem Recomendada de Implementacao

1. Consolidar vetores, matrizes e bounding boxes.
2. Adicionar intersecoes entre segmentos, linhas e circulos.
3. Implementar snaps endpoint, midpoint, center, intersection e nearest.
4. Implementar transformacoes de entidades: move, rotate, scale e mirror.
5. Implementar offset de linhas e circulos.
6. Implementar trim e extend.
7. Implementar fillet e chamfer.
8. Avaliar indice espacial para desenhos grandes.
