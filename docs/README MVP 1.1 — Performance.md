# Relatório de Implementação: MVP 1.1 — Performance para Grandes Desenhos

## 📌 Visão Geral
Este documento descreve a arquitetura e as soluções de performance integradas ao projeto **CAD-WEB** durante o **MVP 1.1**. O objetivo principal desta etapa foi garantir que o motor CAD seja capaz de renderizar, selecionar e calcular snaps em desenhos contendo até **500.000 entidades** sem que a interface sofra lentidão brusca ou bloqueio do *Event Loop* do navegador.

Para isso, substituímos as buscas exaustivas *O(N)* em tempo real (como varrer toda a lista de entidades a cada movimento do mouse para achar um Snap) por um modelo hierárquico otimizado, baseado em **Uniform Grid Spatial Index** (Índice Espacial de Grade).

---

## 🛠️ O que foi construído?

### 1. Índice Espacial Base (`cad-core/src/spatial.ts`)
Criou-se a base algorítmica `GridSpatialIndex`. 
* **Funcionamento:** O espaço lógico do CAD é dividido em "células" (ex: quadrantes de 100x100 unidades). Ao inserir uma entidade, calculamos seu `BoundingBox` (caixa delimitadora exata contendo seus extremos X e Y) e registramos a entidade nas células que ela intercepta.
* **Consulta Rápida:** Ao realizar operações na tela, ao invés de buscar nas 100.000 entidades, perguntamos apenas: *"quais entidades estão cadastradas nas células cobertas por esta pequena área?"*, recebendo apenas algumas dezenas de candidatos.

### 2. Cache Inteligente e Seguro para Memória (WeakMap)
Para não prejudicar a funcionalidade fantástica de **Undo/Redo** (que mantém as referências aos históricos de documento intocadas em uma pilha rápida de ponteiros na memória), o índice não é reprocessado de forma manual mutável. 

Utilizamos a instância nativa do JavaScript `WeakMap<ReadonlyArray<CadEntity>, GridSpatialIndex>`:
* **Construção Lazy (Sob Demanda):** O índice espacial de um documento de 100.000 entidades é gerado em poucos milissegundos apenas na primeira vez em que esse exato estado do documento for renderizado ou clicado.
* **Garbage Collection Segura:** Se o usuário der "Undo" ou deletar o documento, o JavaScript coleta automaticamente o cache pesado do índice, pois `WeakMap` não previne a deleção se as `entities` originais forem descartadas. 

### 3. Otimização do Rendering (Viewport Culling)
No módulo `cad-renderer`, a função `renderDocument2D` deixou de enviar os dados de todos os polígonos e linhas para a tela de uma só vez. 
* O renderer agora calcula os limites X e Y visíveis na tela do usuário baseando-se no nível de zoom e pan atual (`viewport`).
* Ele aciona o `SpatialIndex` e recupera apenas as primitivas gráficas que **intersectam a tela do usuário**. Um desenho com 100.000 parafusos longe do zoom só enviará 0 para o loop do Canvas WebAPI renderizar.

### 4. Snaps e Seleção Instantâneos (`cad-tools`)
* **ObjectSnapService**: Ao passar o mouse pela tela, o sistema não varre todas as geometrias do mundo procurando por pontos finais, médios ou centrais. Ele projeta uma "caixinha" ao redor do cursor usando a tolerância definida do Snap, questiona o SpatialIndex, e repassa apenas essa quantidade muito pequena de entidades para o algoritmo pesado matemático de snaps.
* **Hit Testing (Seleção):** A ferramenta `SelectTool` adota exatamente a mesma estratégia, transformando cliques de `O(N)` para cálculos de distância de `O(1)`.

---

## 🚀 Impacto Validado

Para atestar o sucesso da implementação, a etapa foi selada com um Benchmark estrito via Vitest em `spatial.test.ts`.

| Métrica | Cenário Base | Tempo Alcançado | 
|---------|---------------|-----------------|
| Inserção | Construção de `GridSpatialIndex` para 100.000 linhas puras com dimensões aleatórias. | **< 100 ms** |
| Busca | Retorno O(1) de entidades visíveis em recorte localizado da tela. | **< 5 ms** |
*Obs: Esses tempos são alcançados pelo motor V8 limpo sem Workers. Em máquinas de entrada na web, eles refletirão de forma proporcional.*

## 🛣️ Próximos Passos
O **MVP 1.1** focado em performance entregou a via rápida essencial para o Editor web escalar em robustez comercial. Em momentos muito mais complexos ou se migramos para Modelagem 3D, a arquitetura agora pode receber o upgrade polimórfico de uma *Bounding Volume Hierarchy (BVH)* mantendo as assinaturas e testes idênticos aos construídos hoje.
