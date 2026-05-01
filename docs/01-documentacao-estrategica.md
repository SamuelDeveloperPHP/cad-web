# CAD-WEB Engenharia SaaS

## 1. Visao Geral do Produto

O CAD-WEB Engenharia SaaS e uma plataforma web comercial para desenho tecnico 2D, revisao colaborativa e gestao versionada de projetos de engenharia.

O produto deve oferecer uma experiencia semelhante a ferramentas CAD profissionais, porem com arquitetura web, modelo SaaS multiempresa, colaboracao controlada, historico auditavel e suporte a importacao/exportacao de formatos abertos.

O foco inicial e construir um CAD 2D robusto, modular e extensivel, com base tecnica preparada para evoluir gradualmente para renderizacao acelerada, processamento geometrico mais avancado, interoperabilidade com formatos do mercado e recursos colaborativos em tempo real.

## 2. Objetivo do CAD-WEB

O objetivo principal e permitir que empresas de engenharia criem, editem, versionem, revisem e compartilhem desenhos tecnicos 2D diretamente no navegador, com controle corporativo de usuarios, permissoes, branches, commits e aprovacoes.

Objetivos especificos:

- Criar um editor CAD 2D web de alta performance.
- Manter um kernel geometrico independente da interface.
- Permitir undo/redo confiavel por meio de comandos.
- Salvar desenhos em um formato JSON proprio, versionavel e auditavel.
- Exportar e importar SVG como formato aberto de intercambio visual.
- Preparar a arquitetura para futura compatibilidade com DXF, DWG e PDF.
- Suportar modelo SaaS multiempresa com isolamento de dados.
- Implementar versionamento inspirado em Git para projetos e desenhos.

## 3. Publico-Alvo

O produto e direcionado a empresas e profissionais que dependem de desenho tecnico, revisao e controle de versoes em ambiente corporativo.

Publicos prioritarios:

- Empresas de engenharia civil, mecanica, eletrica, hidraulica e estrutural.
- Escritorios de arquitetura e projetos complementares.
- Equipes de manutencao industrial e facilities.
- Empresas que precisam revisar desenhos sem instalar software CAD pesado.
- Gestores tecnicos que precisam de rastreabilidade e aprovacao formal.
- Times distribuidos que precisam colaborar sobre desenhos de engenharia.

Usuarios principais:

- Desenhistas CAD.
- Engenheiros projetistas.
- Coordenadores de projeto.
- Revisores tecnicos.
- Administradores da empresa.
- Clientes ou fornecedores com permissao controlada.

## 4. Problema que o Produto Resolve

Ferramentas CAD tradicionais sao poderosas, mas frequentemente apresentam barreiras para ambientes colaborativos modernos:

- Dependencia de software desktop instalado.
- Dificuldade de controle de versao em arquivos binarios.
- Troca manual de arquivos entre usuarios e empresas.
- Risco de sobrescrita de versoes.
- Falta de rastreabilidade clara sobre quem alterou o desenho.
- Dificuldade de revisar alteracoes antes de integra-las ao projeto principal.
- Custo operacional alto para licencas, instalacao, suporte e treinamento.
- Baixa integracao com sistemas SaaS, auditoria e permissoes corporativas.

O CAD-WEB resolve esses problemas ao centralizar desenho, versionamento, colaboracao e auditoria em uma plataforma web modular.

## 5. Proposta de Valor

A proposta de valor do CAD-WEB Engenharia SaaS e unir desenho tecnico 2D, controle de versao e colaboracao corporativa em uma unica plataforma web.

Diferenciais esperados:

- Editor CAD acessivel pelo navegador.
- Branches independentes por usuario, disciplina ou revisao.
- Commits auditaveis com historico de alteracoes.
- Merge requests para revisao tecnica antes de integrar alteracoes.
- Isolamento multiempresa adequado para SaaS B2B.
- Formato JSON proprio, legivel, serializavel e preparado para versionamento.
- Exportacao SVG para compartilhamento e interoperabilidade visual.
- Arquitetura modular que permite evolucao incremental sem reescrever o produto.
- Base preparada para processamento geometrico avancado e futura aceleracao com WebAssembly.

## 6. Stack Tecnica Recomendada

### Frontend

- React com TypeScript.
- Vite como ferramenta de build.
- Tailwind CSS para estilos utilitarios.
- shadcn/ui para componentes de interface.
- Canvas 2D como renderizador inicial.
- OffscreenCanvas e Web Workers como evolucao para performance.
- WebGL ou WebGPU futuramente para desenhos grandes e renderizacao acelerada.

### Kernel CAD

- TypeScript inicialmente.
- Pacotes independentes da interface e do backend.
- Testes unitarios para geometria, comandos e serializacao.
- Rust com WebAssembly futuramente para operacoes criticas de geometria computacional.

### Backend

- Laravel para API SaaS.
- PostgreSQL como banco de dados principal.
- Redis para cache, filas, locks e eventos em tempo real.
- Laravel Queues para processamento assincrono.
- Laravel Echo, WebSockets ou alternativa equivalente para colaboracao futura.

### Infraestrutura

- Docker para ambientes padronizados.
- Nginx como proxy reverso em producao.
- Ubuntu Server como base recomendada.
- Storage compativel com S3 para arquivos exportados e anexos.
- Observabilidade com logs estruturados, metricas e rastreamento de erros.

### Formatos

- JSON proprio como formato nativo do documento CAD.
- SVG para importacao/exportacao visual 2D.
- DXF, DWG e PDF como evolucoes futuras.

## 7. Arquitetura Macro

A arquitetura deve ser organizada em monorepo, separando pacotes de dominio CAD, aplicacao web e backend SaaS.

Estrutura conceitual:

```text
cad-web/
  packages/
    cad-core/
    cad-geometry/
    cad-renderer/
    cad-tools/
    cad-io/
  apps/
    web/
    api/
  docs/
```

Fluxo arquitetural principal:

```text
Usuario
  -> apps/web
  -> cad-tools
  -> cad-core commands
  -> cad-core document
  -> cad-renderer
  -> apps/api
  -> PostgreSQL / Redis / Storage
```

Principios obrigatorios:

- O kernel geometrico nao depende de React.
- O renderer nao altera geometria.
- Ferramentas interativas geram comandos.
- Comandos alteram o documento CAD.
- Entidades CAD sao serializaveis em JSON.
- O backend persiste projetos, desenhos, branches, commits, merge requests e auditoria.
- A UI apenas orquestra interacao, estado visual e comunicacao com a API.

## 8. Separacao dos Modulos

### cad-core

Responsavel pelo modelo central do documento CAD.

Inclui:

- Documento CAD.
- Entidades como linha, circulo, arco, polyline, texto e cotas.
- Layers, estilos, unidades e metadados.
- Sistema de comandos.
- Historico de undo/redo.
- Identificadores estaveis de entidades.
- Serializacao e desserializacao do documento.
- Estruturas preparadas para diff, commit e merge.

Nao deve conter:

- Componentes React.
- Codigo de Canvas.
- Chamadas HTTP.
- Codigo Laravel.

### cad-geometry

Responsavel por matematica pura e geometria computacional.

Inclui:

- Pontos, vetores e matrizes.
- Operacoes com tolerancia numerica.
- Distancias, projeções, angulos e transformacoes.
- Intersecoes entre linhas, circulos, arcos e polylines.
- Snaps geometricos.
- Offset, fillet e chamfer.
- Bounding boxes e estruturas auxiliares.

Nao deve conter:

- UI.
- Persistencia.
- Renderizacao.
- Estado de ferramenta.

### cad-renderer

Responsavel por desenhar o documento e overlays no Canvas.

Inclui:

- Renderizacao Canvas 2D.
- Viewport, zoom, pan e transformacao mundo-tela.
- Grid, eixos, selecao e highlights.
- Previews temporarios de ferramenta.
- Estrategias futuras para OffscreenCanvas, WebGL ou WebGPU.

Nao deve alterar:

- Entidades.
- Documento CAD.
- Historico.
- Comandos.

### cad-tools

Responsavel pelas ferramentas interativas do CAD.

Inclui:

- Line, circle, polyline, move, copy, rotate, trim, offset, fillet e chamfer.
- Maquinas de estado das ferramentas.
- Interpretacao de eventos de ponteiro, teclado e entrada numerica.
- Integracao com snaps.
- Geracao de comandos para o cad-core.

Regra principal:

- Ferramentas nao devem modificar o documento diretamente. Toda alteracao deve virar comando.

### cad-io

Responsavel por importacao e exportacao.

Inclui:

- Exportacao e importacao JSON nativo.
- Exportacao SVG.
- Importacao SVG controlada.
- Validacao de schema.
- Conversao entre entidades CAD e formatos externos.
- Base futura para DXF, DWG e PDF.

### apps/web

Aplicacao React do usuario final.

Inclui:

- Interface do editor CAD.
- Autenticacao no frontend.
- Painel de projetos, desenhos, branches e merge requests.
- Toolbars, palettes, inspetor de propriedades e linha de comando.
- Integracao com API Laravel.
- Gerenciamento de estado visual e sessao.

Nao deve conter:

- Calculo geometrico direto.
- Regras centrais de documento CAD.
- Logica de versionamento persistente.

### apps/api

Backend Laravel SaaS.

Inclui:

- Autenticacao e autorizacao.
- Empresas, usuarios, permissoes e papeis.
- Projetos, desenhos, branches, commits e merge requests.
- Auditoria.
- Persistencia em PostgreSQL.
- Cache, filas e locks com Redis.
- Exportacoes e importacoes processadas em background.
- APIs REST ou JSON:API.

Nao deve conter:

- Kernel geometrico de frontend.
- Componentes React.
- Renderizacao Canvas.

## 9. Modelo Multiempresa

O produto deve operar como SaaS B2B multiempresa, com isolamento logico forte entre tenants.

Entidades principais:

- Empresa.
- Usuario.
- Papel.
- Permissao.
- Projeto.
- Desenho.
- Branch.
- Commit.
- Merge request.
- Comentario.
- Auditoria.

Modelo recomendado:

- Cada empresa possui seus proprios projetos, usuarios, desenhos e configuracoes.
- Todo registro sensivel deve conter `tenant_id` ou equivalente.
- Consultas da API devem sempre ser filtradas pelo tenant autenticado.
- Permissoes devem ser baseadas em papeis e escopos.
- Administradores da empresa gerenciam usuarios e acessos internos.
- Usuarios externos podem ter acesso limitado a projetos especificos.

Papeis iniciais sugeridos:

- Owner da empresa.
- Administrador.
- Coordenador de projeto.
- Editor CAD.
- Revisor.
- Visualizador.

## 10. Modelo de Branches, Commits e Merge Requests

O versionamento deve ser inspirado em Git, mas adaptado ao dominio CAD.

### Branches

Uma branch representa uma linha independente de evolucao de um desenho ou projeto.

Exemplos:

- `main`
- `revisao-estrutura`
- `hidraulica-pavimento-2`
- `usuario/ajustes-cotas`

Regras iniciais:

- Todo desenho deve possuir uma branch principal.
- Usuarios podem criar branches para trabalhar sem alterar a versao aprovada.
- Branches devem apontar para um commit base.
- A branch deve armazenar a referencia para o ultimo commit.

### Commits

Um commit representa um conjunto atomico de alteracoes no documento CAD.

Conteudo recomendado:

- Identificador do commit.
- Autor.
- Data.
- Mensagem.
- Branch.
- Commit pai.
- Snapshot completo ou delta estruturado.
- Metadados de auditoria.

Estrategia inicial:

- Usar snapshots JSON completos para simplificar a implementacao.
- Evoluir para deltas estruturados quando o modelo de documento estiver estavel.

### Merge Requests

Uma merge request representa a proposta de integrar alteracoes de uma branch em outra.

Fluxo recomendado:

1. Usuario cria branch a partir da `main`.
2. Usuario edita o desenho e gera commits.
3. Usuario abre merge request.
4. Revisor compara alteracoes.
5. Revisor aprova, solicita ajustes ou rejeita.
6. Sistema integra as alteracoes na branch destino.
7. Auditoria registra a decisao.

### Merge CAD

O merge CAD deve ser tratado com cautela porque conflitos geometricos podem nao ser puramente textuais.

Estrategia inicial:

- Comparacao por entidades com identificadores estaveis.
- Detectar entidades adicionadas, removidas e modificadas.
- Marcar conflitos quando a mesma entidade for alterada em duas branches.
- Resolver conflitos inicialmente por escolha manual.
- Evoluir para merge visual assistido.

## 11. Importacao e Exportacao JSON e SVG

### JSON Nativo

O JSON nativo e o formato principal do CAD-WEB.

Caracteristicas:

- Deve representar documento, entidades, layers, estilos, unidades e metadados.
- Deve ser versionado por schema.
- Deve ser validavel.
- Deve preservar IDs estaveis de entidades.
- Deve ser adequado para snapshots, commits e auditoria.

Exemplo conceitual:

```json
{
  "schemaVersion": "1.0.0",
  "documentId": "doc_001",
  "units": "mm",
  "layers": [],
  "entities": [],
  "metadata": {}
}
```

### SVG

O SVG deve ser usado como formato de importacao/exportacao, nao como renderizador principal.

Usos recomendados:

- Exportar desenho para visualizacao em sistemas externos.
- Gerar previews.
- Compartilhar versoes simplificadas.
- Importar geometria 2D simples.

Limitacoes:

- SVG nao representa todos os conceitos CAD com precisao semantica.
- Importacao SVG deve ser validada e limitada no inicio.
- Texto, unidades, transforms e paths complexos exigem tratamento cuidadoso.

## 12. Roadmap por Fases

### Fase 0 - Fundacao Estrategica

- Criar documentacao mestre do produto.
- Definir arquitetura macro.
- Definir estrutura de monorepo.
- Definir padroes de codigo, testes e modulos.
- Criar backlog tecnico inicial.

### Fase 1 - MVP CAD Local

- Criar `cad-geometry` com pontos, vetores, tolerancia e intersecoes basicas.
- Criar `cad-core` com documento, entidades e comandos.
- Criar undo/redo.
- Criar `cad-renderer` Canvas 2D.
- Criar ferramentas line, circle, select, move e delete.
- Criar exportacao/importacao JSON local.
- Criar testes unitarios para geometria e comandos.

### Fase 2 - Aplicacao Web Usavel

- Criar `apps/web` com layout de editor CAD.
- Implementar toolbar, viewport, painel de layers e propriedades.
- Implementar snaps basicos.
- Implementar linha de comando simplificada.
- Implementar persistencia local ou mock API.
- Melhorar performance de renderizacao.

### Fase 3 - Backend SaaS

- Criar `apps/api` em Laravel.
- Implementar empresas, usuarios, papeis e permissoes.
- Implementar projetos e desenhos.
- Persistir documentos JSON no PostgreSQL.
- Criar autenticacao e autorizacao.
- Implementar auditoria basica.

### Fase 4 - Versionamento

- Implementar branches.
- Implementar commits por snapshot JSON.
- Implementar historico por desenho.
- Implementar comparacao entre commits.
- Implementar merge requests.
- Implementar revisao e aprovacao.

### Fase 5 - Interoperabilidade

- Exportar SVG.
- Importar SVG simples.
- Criar previews de desenhos.
- Planejar suporte DXF.
- Avaliar bibliotecas e limites legais/tecnicos para DWG.

### Fase 6 - Performance e Colaboracao

- Introduzir Web Workers.
- Avaliar OffscreenCanvas.
- Otimizar renderizacao de grandes desenhos.
- Criar indices espaciais para selecao e snaps.
- Implementar locks ou presenca colaborativa.
- Avaliar sincronizacao realtime controlada.

### Fase 7 - Geometria Avancada

- Implementar trim, extend, offset, fillet e chamfer robustos.
- Melhorar tolerancias geometricas.
- Adicionar testes extensivos de casos degenerados.
- Avaliar Rust + WebAssembly para rotinas criticas.

## 13. Riscos Tecnicos Principais

### Precisao Geometrica

Risco: operacoes como intersecoes, offset, trim e fillet podem gerar resultados inconsistentes em casos degenerados.

Mitigacao:

- Definir tolerancia numerica centralizada.
- Criar testes unitarios e testes de regressao.
- Evitar comparacoes diretas de ponto flutuante.
- Documentar limites geometricos suportados.

### Performance em Desenhos Grandes

Risco: Canvas 2D pode degradar com milhares de entidades.

Mitigacao:

- Implementar culling por viewport.
- Usar estruturas espaciais.
- Separar renderizacao estatica e overlays.
- Evoluir para OffscreenCanvas, Web Workers e WebGL/WebGPU.

### Merge de Desenhos CAD

Risco: conflitos geometricos sao mais complexos que conflitos textuais.

Mitigacao:

- Usar IDs estaveis por entidade.
- Iniciar com snapshot completo e diff simples.
- Criar visualizador de diferencas.
- Priorizar resolucao manual em conflitos.

### Acoplamento Indevido entre UI e Kernel

Risco: componentes React podem acumular logica de geometria e comandos.

Mitigacao:

- Manter pacotes separados.
- Criar testes nos pacotes CAD.
- Bloquear dependencias de React em `cad-core` e `cad-geometry`.
- Revisar arquitetura antes de adicionar ferramentas novas.

### Importacao SVG Ambigua

Risco: SVG possui semantica grafica, nao CAD, e pode conter transforms e paths complexos.

Mitigacao:

- Suportar inicialmente apenas subconjunto conhecido.
- Validar entradas.
- Registrar avisos de importacao.
- Preservar dados originais quando necessario.

### Evolucao Prematura para WebAssembly

Risco: introduzir Rust/WASM cedo demais pode aumentar complexidade sem retorno imediato.

Mitigacao:

- Comecar em TypeScript.
- Medir gargalos reais.
- Migrar apenas rotinas criticas e bem testadas.

## 14. Decisoes Arquiteturais Iniciais

### Decisao 1 - JSON proprio como formato nativo

O documento CAD deve ser salvo em JSON proprio porque isso facilita serializacao, validacao, auditoria, commits, diffs e evolucao incremental do schema.

### Decisao 2 - Canvas 2D como renderizador inicial

Canvas 2D permite entregar o MVP mais rapidamente com boa compatibilidade. A arquitetura deve, entretanto, manter `cad-renderer` isolado para futura troca ou complemento com WebGL/WebGPU.

### Decisao 3 - Kernel geometrico independente de React

O kernel precisa ser testavel, reutilizavel e preparado para migracoes futuras. Por isso, `cad-core` e `cad-geometry` nao devem depender de React, DOM ou Canvas.

### Decisao 4 - Ferramentas geram comandos

Ferramentas interativas devem transformar eventos do usuario em comandos. Isso torna undo/redo, historico, auditoria e versionamento mais previsiveis.

### Decisao 5 - Backend Laravel separado do kernel CAD

Laravel deve cuidar do SaaS, autenticacao, permissoes, persistencia e auditoria. O kernel CAD deve permanecer no frontend/pacotes compartilhaveis, sem depender do backend.

### Decisao 6 - Versionamento inicialmente por snapshots

Snapshots JSON completos reduzem risco no inicio. Deltas e merges estruturados devem ser implementados depois que o modelo de entidades estiver mais estavel.

### Decisao 7 - SVG como intercambio, nao como motor grafico

SVG e adequado para exportacao, importacao limitada e previews, mas nao deve ser o renderizador principal do editor CAD por questoes de performance e controle fino.

## 15. Proximos Passos para Implementacao no VSCode com Codex

### Passo 1 - Criar estrutura inicial do monorepo

Prompt sugerido:

```text
Crie a estrutura inicial do monorepo CAD-WEB com packages/cad-core, packages/cad-geometry, packages/cad-renderer, packages/cad-tools, packages/cad-io, apps/web e apps/api. Configure TypeScript nos pacotes CAD e prepare scripts basicos de build e test sem misturar React com o kernel.
```

### Passo 2 - Implementar cad-geometry minimo

Prompt sugerido:

```text
Implemente o pacote packages/cad-geometry com tipos Point2D, Vector2D, tolerancia numerica centralizada, funcoes de distancia, igualdade aproximada, operacoes vetoriais e testes unitarios.
```

### Passo 3 - Implementar cad-core minimo

Prompt sugerido:

```text
Implemente o pacote packages/cad-core com documento CAD, entidade LineEntity, sistema de comandos, AddEntityCommand, RemoveEntityCommand, CommandHistory e suporte a undo/redo com testes unitarios.
```

### Passo 4 - Implementar renderer Canvas

Prompt sugerido:

```text
Implemente packages/cad-renderer com viewport, transformacao mundo-tela, renderizacao Canvas 2D de linhas e grid. O renderer nao deve alterar o documento CAD.
```

### Passo 5 - Implementar primeira ferramenta interativa

Prompt sugerido:

```text
Implemente packages/cad-tools com uma ferramenta LineTool baseada em maquina de estados. A ferramenta deve receber eventos de entrada, usar cad-geometry para pontos e gerar comandos do cad-core, sem modificar o documento diretamente.
```

### Passo 6 - Criar app web inicial

Prompt sugerido:

```text
Crie apps/web com React, TypeScript, Vite, Tailwind CSS e shadcn/ui. Monte uma tela de editor CAD com canvas central, toolbar lateral, painel de propriedades e integracao inicial com cad-core, cad-renderer e cad-tools.
```

### Passo 7 - Criar API SaaS inicial

Prompt sugerido:

```text
Crie apps/api em Laravel com entidades iniciais de empresa, usuario, projeto e desenho. Prepare migracoes, modelos, policies e endpoints basicos para listar e salvar documentos CAD em JSON.
```

### Passo 8 - Definir testes obrigatorios

Prompt sugerido:

```text
Configure testes unitarios para cad-geometry e cad-core. Garanta cobertura inicial para tolerancia numerica, comandos, undo/redo e serializacao JSON.
```

## Conclusao

O CAD-WEB Engenharia SaaS deve ser construido como uma plataforma CAD web modular, comercial e preparada para crescimento tecnico. A prioridade inicial nao e copiar todas as funcionalidades de um CAD desktop, mas estabelecer uma fundacao correta: kernel independente, comandos auditaveis, renderizacao isolada, documento serializavel, SaaS multiempresa e versionamento por branches e commits.

Com essa base, o produto podera evoluir de forma segura para ferramentas geometricas avancadas, colaboracao, interoperabilidade com formatos do mercado e alta performance em desenhos complexos.
