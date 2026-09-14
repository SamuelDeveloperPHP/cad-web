# MVP 3.15 — Performance 2 — Cache de bounding box e LOD

## Objetivo

Segundo MVP de performance, atacando dois custos O(n) por frame identificados no benchmark de 50k entidades:

1. **`entityBoundingBox` recalculado a cada acesso** — o índice espacial recomputa o envoltório por candidato no `query()` (e por entidade no `insert()`). Para cotas isso remonta toda a geometria da dimensão a cada frame.
2. **Geometria completa de cada entidade no zoom aberto** — no zoom totalmente aberto, todas as entidades ficam "visíveis" e cada uma paga a montagem completa (sobretudo as cotas: geometria + `measureText` + `fillText` + setas), mesmo ocupando menos de um pixel.

Este MVP mexe em `packages/cad-core` (cache) e `packages/cad-renderer` (LOD); não toca no backend.

## Parte 1 — Cache de `entityBoundingBox` (WeakMap)

- `entityBoundingBox` passou a **cachear o envoltório por objeto de entidade** em um `WeakMap<CadEntity, BoundingBox>`; o cálculo puro virou `computeEntityBoundingBox`.
- As entidades são **imutáveis**: mover/editar produz um novo objeto, então a entrada antiga é descartada pelo coletor e o novo objeto recalcula — sem invalidação manual.
- Beneficia diretamente o `query()`/`insert()` do índice espacial e a verificação de extensão do LOD.

Medição (50k entidades mistas, incluindo 10k cotas): calcular todos os envoltórios a frio custa ~90 ms; com o cache aquecido, ~9 ms — **~10x** por acesso repetido. Como cada frame faz uma query que chama o envoltório de cada candidato, o ganho se repete a cada frame.

## Parte 2 — LOD (nível de detalhe) no `renderDocument2D`

- Cada entidade visível tem sua **extensão em pixels** estimada a partir do envoltório (agora cacheado) e da escala do viewport.
- **Ponto (dot):** entidades com menos de **1,5 px** de extensão são desenhadas como um único `fillRect(1,1)` no centro, sem montar a geometria. É o caso do zoom aberto com muitas entidades.
- **Texto de cota:** o texto é omitido quando a altura de fonte cairia abaixo de **5 px** — ficaria ilegível e a medição/desenho é cara (`measureText`/`fillText`/máscara).
- Os limiares são conservadores: só afetam o que já seria sub-pixel/ilegível, então o zoom normal permanece visualmente idêntico.

Medição (50k): no **zoom aberto**, as 50k entidades colapsam em pontos e **nenhum** texto de cota é medido/desenhado (`measureText = 0`); no **zoom fechado**, as poucas entidades visíveis mantêm a geometria completa e o texto (`measureText > 0`).

## Arquivos

### Alterados

- `packages/cad-core/src/spatial.ts`: `entityBoundingBox` vira wrapper com cache (`WeakMap`); o cálculo original passa a `computeEntityBoundingBox`.
- `packages/cad-core/src/spatial.test.ts`: testes de identidade (cache reaproveitado) e de recálculo para novo objeto (imutabilidade).
- `packages/cad-renderer/src/entities.ts`: LOD por entidade (ponto abaixo de 1,5 px) e omissão do texto de cota abaixo de 5 px; import de `entityBoundingBox`.

## Decisões técnicas

- **Cache por objeto, não por id.** A chave é o objeto imutável da entidade; assim o cache é automaticamente correto (novo objeto = novo cálculo) e liberado pelo coletor, sem lógica de invalidação.
- **Envoltório compartilhado, somente leitura.** O envoltório cacheado é reutilizado por referência; os chamadores apenas leem (convenção de imutabilidade), evitando congelar o objeto a cada acesso.
- **LOD conservador.** Colapsar apenas o sub-pixel garante que nada visível muda de aparência; o ganho vem de não montar geometria/texto que ninguém veria.
- **Escopo do MVP.** O sweep O(n) sobre todas as entidades visíveis no zoom totalmente aberto (construção do conjunto no `query()` + uma chamada de desenho por entidade) permanece; reduzi-lo além disso é papel dos próximos MVPs (WebGL com instancing e LOD hierárquico/tiling). Este MVP elimina o custo por entidade (geometria/texto de cota) e o recálculo de envoltório.

## Testes

```bash
npx tsc -b                                   # build/typecheck dos pacotes
npm run test --workspaces --if-present       # suíte completa (Vitest)
npm run build                                # build de produção do web
```

### Roteiro de teste manual

1. Gere muitas entidades (painel de diagnóstico em DEV) e dê zoom extents: o desenho aparece como uma nuvem de pontos, fluida, sem repintar geometria de cota.
2. Aproxime o zoom: as entidades voltam a desenhar a geometria completa e o texto das cotas reaparece quando fica legível.
3. Em zoom normal, nada muda visualmente em relação a antes.

## Próximos passos (roadmap de performance)

- **Performance 3**: render em WebGL com instancing (salto para 500k+ entidades; remove o limite do Canvas 2D e o custo por chamada de desenho).
- **Performance 4**: geometria/serialização em Web Workers.
- **Performance 5**: LOD hierárquico/tiling e índice espacial incremental (evitar o sweep O(n) no zoom totalmente aberto).
