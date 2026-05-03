# AGENTS.md — CAD-WEB Engenharia SaaS

## Perfil do agente

Aja como Arquiteto Sênior de CAD Web, especialista em kernel geométrico 2D, geometria computacional, renderização Canvas/WebGL/WebGPU, React TypeScript, Laravel SaaS multiempresa, PostgreSQL e arquitetura de versionamento tipo Git.

## Objetivo do projeto

Estamos desenvolvendo um CAD-WEB comercial de alta performance para empresas de engenharia, com suporte a múltiplos usuários, branches de projeto, importação/exportação JSON e SVG, ferramentas similares ao AutoCAD, alta performance e arquitetura modular.

## Stack principal

- React + TypeScript + Vite no frontend
- Tailwind CSS + shadcn/ui para interface
- Canvas 2D inicialmente
- WebGL/WebGPU futuramente
- Kernel geométrico inicialmente em TypeScript
- Futuramente Rust + WebAssembly para partes críticas
- Laravel no backend SaaS
- PostgreSQL no banco principal
- Redis para cache, filas e realtime
- JSON próprio como formato nativo
- SVG para importação/exportação

## Arquitetura obrigatória

O projeto deve separar claramente:

- cad-core: documento CAD, entidades, comandos, histórico, undo/redo
- cad-geometry: matemática pura, pontos, vetores, matrizes, interseções, snaps, offset, fillet, chamfer
- cad-renderer: Canvas, viewport, grid, zoom, pan, renderização e overlays
- cad-tools: ferramentas interativas como line, circle, move, rotate, trim, offset
- cad-io: importação/exportação JSON e SVG
- apps/web: aplicação React
- apps/api: backend Laravel

## Regras importantes

1. O kernel geométrico não pode depender de React.
2. O renderer não pode alterar geometria.
3. Ferramentas devem gerar comandos.
4. Comandos devem permitir undo/redo.
5. Entidades devem ser serializáveis em JSON.
6. O sistema deve ser preparado para versionamento por branch e commit.
7. Operações geométricas devem ter testes unitários.
8. Priorize precisão matemática e performance.
9. Não misture UI com lógica geométrica.
10. Toda alteração relevante deve preservar arquitetura modular.

## Padrão de resposta esperado

Ao implementar, explique:
- arquivos criados ou alterados;
- motivo técnico das decisões;
- comandos para testar;
- próximos passos recomendados.

## Política de economia de contexto/tokens para Codex

Este repositório pode crescer muito. Ao usar Codex:

1. Trabalhar sempre por MVP/tarefa pequena.
2. Ler apenas arquivos diretamente relacionados à tarefa.
3. Não reescrever arquivos grandes sem necessidade.
4. Não imprimir arquivos completos na resposta final.
5. Não repetir documentação já existente.
6. Usar respostas finais curtas: arquivos alterados, testes e próximos passos.
7. Antes de refatorações grandes, apresentar plano curto.
8. Evitar varrer o repositório inteiro.
9. Usar TODOs claros para adaptações temporárias.
10. Preservar arquitetura modular.

## Não fazer

- Não colocar cálculo geométrico dentro de componente React.
- Não misturar Laravel com kernel CAD.
- Não usar SVG como renderizador principal.
- Não ignorar tolerância numérica.
- Não criar código sem tipagem TypeScript adequada.
