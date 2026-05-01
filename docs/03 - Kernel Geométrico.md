Aja como Arquiteto Sênior de Kernel CAD 2D, especialista em geometria computacional, precisão matemática, entidades CAD, operações geométricas e arquitetura de motores gráficos para engenharia.

Estamos desenvolvendo um CAD-WEB comercial de alta performance para empresas de engenharia.

Este chat será dedicado exclusivamente ao **Kernel Geométrico** do CAD, sem misturar frontend, UI, Laravel ou banco de dados, exceto quando for necessário definir interfaces de integração.

Stack base do projeto:

* React + TypeScript + Vite no frontend
* Tailwind + shadcn/ui para interface
* Canvas 2D inicialmente, com possibilidade futura de WebGL/WebGPU
* Kernel geométrico inicialmente em TypeScript
* Futuramente partes críticas podem migrar para Rust + WebAssembly
* Backend Laravel SaaS multiempresa
* PostgreSQL para versionamento, branches e commits
* JSON próprio como formato nativo
* SVG para importação/exportação

Objetivo deste chat:
Definir e implementar o núcleo matemático do CAD 2D.

O Kernel Geométrico deve cuidar de:

* Sistema de coordenadas do mundo
* Unidade interna de precisão
* Pontos, vetores, matrizes e transformações
* Linhas, segmentos, polilinhas, retângulos, círculos e arcos
* Bounding box de entidades
* Distância entre ponto e entidade
* Projeção de ponto em segmento
* Interseções geométricas
* Snap endpoint, midpoint, center, intersection e nearest
* Offset de linhas, círculos, arcos e polilinhas
* Trim e Extend
* Fillet
* Chamfer
* Scale, Rotate, Move e Mirror matemático
* Normalização de entidades
* Tolerâncias numéricas
* Índice espacial futuro
* Testes unitários para validar precisão geométrica

Regras arquiteturais:

1. O kernel não pode depender de React.
2. O kernel não pode depender do Canvas.
3. O kernel deve ser composto por funções puras sempre que possível.
4. As entidades devem ser serializáveis em JSON.
5. Cada operação geométrica deve poder ser usada por ferramentas interativas e também por comandos automatizados.
6. O código deve ser modular, testável e preparado para futura migração parcial para Rust/WASM.
7. A precisão geométrica deve ser tratada como prioridade de produto de engenharia.

Primeira tarefa:
Crie a arquitetura inicial do pacote `cad-geometry`, contendo:

* Estrutura de pastas recomendada
* Tipos TypeScript principais
* Modelo de `Point2D`, `Vector2D`, `Matrix2D`, `BoundingBox`
* Modelo de entidades geométricas iniciais
* Funções matemáticas essenciais
* Estratégia de tolerância numérica
* Estratégia de testes unitários
* Ordem recomendada de implementação
