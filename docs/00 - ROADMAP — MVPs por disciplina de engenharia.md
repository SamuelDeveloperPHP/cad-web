# ROADMAP — MVPs por disciplina de engenharia

## Objetivo

Este documento organiza os próximos MVPs do CAD-WEB para atender uma empresa de engenharia que atua em mecânica, elétrica, civil, hidráulica, eletromecânica e terraplanagem, com biblioteca de blocos já existente.

Ele parte do estado atual (último MVP entregue: `MVP 3.5 — ExplodeTool`) e segue o mesmo método dos MVPs anteriores: tarefas pequenas, ordem de dependência `cad-geometry → cad-core → cad-tools → cad-renderer → cad-io → apps/web → docs`, testes unitários em cada pacote e revisão de fronteiras ao final.

Cada MVP indica o agente responsável (`.claude/agents/`). O `mvp-planner` detalha o MVP antes da implementação; o `cad-reviewer` revisa antes do merge.

## Estado atual (base comum)

| Área              | Entregue                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Entidades         | Line, Rectangle, Circle, Arc, Polyline, Dimension (linear, aligned, radius, diameter, angular) |
| Ferramentas       | Select, Line, Polyline, Rectangle, Circle, Move, Rotate, Scale, Offset, Trim, Extend, Fillet, Chamfer, Array (retangular, polar, por caminho), Explode, Erase, 5 cotas |
| Documento         | Layers (cor, visibilidade, bloqueio), estilos de cota, unidades de exibição, undo/redo, índice espacial |
| IO                | JSON nativo, export/import SVG                                                            |
| App web           | Ribbon, toolbar, linha de comando com aliases, status bar, painéis de layers, propriedades e estilos de cota, Performance Lab |
| Backend           | Não iniciado (`apps/api` contém apenas README)                                            |
| Qualidade         | 363 testes unitários (Vitest), CI no GitHub Actions (build, typecheck, testes, fronteiras) |

## Fase 1 — Completar o kernel 2D (base para todas as disciplinas)

| MVP | Nome                          | Entrega principal                                                                                   | Agentes                                     |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 3.6 | ArcTool                       | Desenho de arco por 3 pontos e por centro/início/fim; `ArcEntity` já existe                         | cad-geometry, cad-tools, web-ui             |
| 3.7 | MirrorTool                    | Espelhar entidades por eixo definido por 2 pontos, com opção de manter original                     | cad-geometry, cad-core, cad-tools, web-ui   |
| 3.8 | StretchTool                   | Esticar vértices dentro de janela de seleção                                                        | cad-geometry, cad-core, cad-tools, web-ui   |
| 3.9 | EllipseTool + EllipseEntity   | Entidade nova, render, snap, JSON e SVG                                                             | todos os pacotes                            |
| 4.0 | TextEntity + TextTool         | Texto simples com estilo (fonte, altura, rotação, alinhamento); pré-requisito para blocos com atributos | cad-core, cad-renderer, cad-io, cad-tools, web-ui |
| 4.1 | Line types e lineweights      | Tipos de linha (contínua, tracejada, traço-ponto, centro, oculta) e espessuras por layer e por entidade | cad-core, cad-renderer, cad-io, web-ui      |
| 4.2 | HatchEntity + HatchTool       | Hachura de contorno fechado com padrões (ANSI31, sólido, concreto, terra); detecção de contorno em `cad-geometry` | cad-geometry, cad-core, cad-renderer, cad-io, cad-tools, web-ui |
| 4.3 | Snaps avançados II            | Perpendicular, tangente, quadrante, interseção aparente, extensão, paralelo                         | cad-geometry, cad-tools                     |
| 4.4 | Grips e edição direta         | Arrastar vértices, centro e raio na seleção sem ativar ferramenta                                   | cad-tools, cad-renderer, web-ui             |

## Fase 2 — Blocos e biblioteca (elétrica, hidráulica, mecânica, eletromecânica)

| MVP | Nome                          | Entrega principal                                                                                   | Agentes                                     |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 5.0 | BlockDefinition + BlockReference | Definição de bloco no documento, inserção com ponto base, escala e rotação; Explode de bloco     | cad-core, cad-renderer, cad-io, cad-tools, web-ui |
| 5.1 | Atributos de bloco            | Atributos editáveis (tag, valor, visível/invisível) para símbolos elétricos e hidráulicos            | cad-core, cad-renderer, cad-tools, web-ui   |
| 5.2 | Biblioteca de blocos por disciplina | Painel de biblioteca com categorias (elétrica, hidráulica, mecânica, civil); arquivos JSON de biblioteca em `packages/cad-library` (pacote novo) | cad-io, web-ui, mvp-planner                 |
| 5.3 | Importação DXF                | Leitura de DXF ASCII (R12 e 2000+): LINE, POLYLINE/LWPOLYLINE, CIRCLE, ARC, ELLIPSE, TEXT/MTEXT, HATCH básico, INSERT, BLOCK, LAYER, LTYPE | cad-io (módulo `dxf.ts`), cad-core          |
| 5.4 | Exportação DXF                | Escrita de DXF 2000 com as mesmas entidades; garante round trip com AutoCAD                         | cad-io                                      |
| 5.5 | Migração dos blocos existentes | Script que converte a biblioteca DXF/DWG atual da empresa em bibliotecas JSON; DWG exige conversão prévia para DXF (ODA File Converter ou equivalente) | cad-io, api-laravel                         |
| 5.6 | Templates por disciplina      | Documento inicial com layers, cores, line types e estilos de cota padronizados por disciplina (normas ABNT NBR 8403, 10067, 13142) | cad-core, cad-io, web-ui                    |

## Fase 3 — Civil e terraplanagem

| MVP | Nome                          | Entrega principal                                                                                   | Agentes                                     |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 6.0 | SplineEntity                  | Curvas suaves (Catmull-Rom ou B-spline) para curvas de nível e traçados                              | cad-geometry, cad-core, cad-renderer, cad-io, cad-tools |
| 6.1 | Coordenadas e georreferência  | Sistema de coordenadas do desenho (UTM, elevação), exibição de coordenadas na status bar, importação de pontos CSV/TXT (N, E, Z) | cad-core, cad-io, web-ui                    |
| 6.2 | Curvas de nível               | Geração de curvas a partir de nuvem de pontos por triangulação (TIN) em `cad-geometry`; render com rótulo de cota | cad-geometry, cad-core, cad-renderer        |
| 6.3 | Perfis e seções               | Perfil longitudinal e seções transversais a partir de alinhamento (polyline) sobre a TIN            | cad-geometry, cad-tools, web-ui             |
| 6.4 | Volumes de corte e aterro     | Cálculo de volume entre superfícies (método das seções e prismoidal); relatório exportável           | cad-geometry, cad-io, web-ui                |
| 6.5 | Cotas de nível e inclinação   | Cota de elevação, declividade em porcentagem e tabela de coordenadas                                | cad-geometry, cad-core, cad-tools           |

## Fase 4 — Plotagem e entrega

| MVP | Nome                          | Entrega principal                                                                                   | Agentes                                     |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 7.0 | Layouts e viewports           | Espaço de papel com formatos ABNT (A0 a A4), viewports com escala fixa (1:50, 1:100, 1:500...)      | cad-core, cad-renderer, web-ui              |
| 7.1 | Carimbo e legenda             | Bloco de carimbo com atributos (projeto, disciplina, revisão, responsável técnico, CREA/CAU)        | cad-core, web-ui                            |
| 7.2 | Exportação PDF                | PDF vetorial com escala real, espessuras e tipos de linha; múltiplas folhas                          | cad-io, cad-renderer                        |
| 7.3 | Impressão e plot styles       | Tabela de penas (cor → espessura) e impressão pelo navegador                                        | cad-renderer, web-ui                        |

## Fase 5 — SaaS, colaboração e homologação

| MVP | Nome                          | Entrega principal                                                                                   | Agentes                                     |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 8.0 | Backend Laravel base          | Estrutura Laravel, PostgreSQL, Redis, Docker; autenticação (Sanctum), empresas (tenants), usuários e papéis | api-laravel                                 |
| 8.1 | Projetos e desenhos           | CRUD de projetos e desenhos por empresa; upload/download do JSON nativo; isolamento por tenant testado | api-laravel                                 |
| 8.2 | Branches e commits            | Branch por usuário/disciplina/revisão, commit com snapshot JSON imutável, histórico e diff de entidades | api-laravel, cad-io (diff em `cad-core`)   |
| 8.3 | Merge requests e aprovação    | Fluxo de revisão técnica: abrir, comentar, aprovar, mesclar; auditoria completa                     | api-laravel, web-ui                         |
| 8.4 | Integração do app com a API   | Login, abrir/salvar desenho remoto, seletor de branch, commit pela UI; `localStorage` vira cache     | web-ui, api-laravel                         |
| 8.5 | Permissões por disciplina     | Papéis (desenhista, projetista, coordenador, revisor, admin, cliente) e permissões por projeto e layer | api-laravel, web-ui                         |
| 8.6 | Testes end-to-end             | Playwright cobrindo fluxos críticos: desenhar, cotar, salvar, reabrir, exportar, commit e merge      | web-ui, cad-reviewer                        |
| 8.7 | Observabilidade e backup      | Logs estruturados, métricas, rastreamento de erros, backup automático do PostgreSQL e do storage     | api-laravel                                 |
| 8.8 | Homologação                   | Ambiente de homologação em Docker/Nginx; roteiro de aceite por disciplina com desenhos reais da empresa | api-laravel, web-ui, mvp-planner            |
| 9.0 | Colaboração em tempo real     | Presença, cursores e bloqueio de entidades por usuário via WebSockets                                 | api-laravel, web-ui                         |

## Critérios de saída de cada fase

- Fase 1: todos os desenhos 2D típicos das disciplinas podem ser feitos sem recorrer a outro CAD.
- Fase 2: a biblioteca de blocos da empresa está importada e os desenhos legados abrem por DXF.
- Fase 3: um projeto de terraplanagem gera curvas de nível, seções e volumes verificados contra software de referência.
- Fase 4: uma prancha ABNT sai em PDF com escala conferida por régua.
- Fase 5: usuários reais das seis disciplinas concluem o roteiro de aceite sem bloqueios.

## Riscos e decisões pendentes

1. **DWG**: formato proprietário. A recomendação é converter DWG para DXF na entrada (ODA File Converter, gratuito para uso interno) e tratar DXF como formato de intercâmbio oficial. Suporte nativo a DWG fica fora do roadmap.
2. **Performance com hachuras e blocos**: exige cache de geometria expandida por bloco e culling por bounding box; medir no Performance Lab a cada MVP das fases 2 e 3.
3. **Schema JSON**: entidades novas (Text, Hatch, Block, Spline, Ellipse) exigem incremento da versão do schema e migração; nunca quebrar arquivos salvos.
4. **Rust + WebAssembly**: só considerar após a Fase 3, se TIN e volumes ficarem lentos em TypeScript.
5. **Normas**: templates e carimbos devem ser validados pelo responsável técnico de cada disciplina antes de virarem padrão.

## Próximo passo

Executar `MVP 3.6 — ArcTool`. Comando sugerido para o Claude Code:

```
use o agente mvp-planner para detalhar o MVP 3.6 ArcTool seguindo o roadmap em docs/00 - ROADMAP
```
