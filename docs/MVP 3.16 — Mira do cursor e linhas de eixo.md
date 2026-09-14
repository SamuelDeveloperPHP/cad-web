# MVP 3.16 — Mira do cursor e linhas de eixo

## Objetivo

Guias visuais de desenho, a pedido do usuário de teste (referência: projeto antigo):

1. **Mira do cursor** — linhas tracejadas amarelas de 1px, na vertical e na horizontal, que acompanham o ponteiro do mouse cobrindo toda a área de desenho.
2. **Linhas de eixo** — uma linha **verde** marcando o eixo Y (mundo x=0) e uma linha **vermelha** marcando o eixo X (mundo y=0), ambas passando pela origem.
3. **Ligar/desligar** — botões no rodapé (`CURSOR` e `EIXOS`) e comandos na linha de comando, com a preferência persistida.

Feature só de `apps/web` (integração/UI) e `packages/cad-renderer` (desenho no overlay); não toca no kernel de geometria nem no backend.

## Comportamento

- As duas guias são desenhadas na **camada de overlay**, ao fundo (sob seleção, preview e marcador de snap), então acompanham o mouse sem repintar o documento (camada base).
- A mira segue o `mouseWorld` convertido para tela; por isso o overlay passou a reagir também ao movimento do mouse e às preferências de guias.
- As linhas de eixo só são traçadas quando a origem cruza a faixa visível (evita desenhar fora da tela).
- As preferências ficam salvas em `localStorage` (`cad-web.guideSettings`), ligadas por padrão.

## Controles

- **Rodapé:** botões `CURSOR` (mira) e `EIXOS` (eixos), realçados quando ativos.
- **Linha de comando:** `cursor` / `crosshair` / `mira` / `guides` / `guias` alternam a mira; `axis` / `axes` / `eixo` / `eixos` alternam os eixos.

## Arquivos

### Novos

- `apps/web/src/services/guideSettingsStorage.ts`: tipo `GuideSettings` (`cursorGuides`, `axisLines`), padrão e persistência em localStorage (padrão do `snapSettingsStorage`).

### Alterados

- `packages/cad-renderer/src/overlays.ts`: `renderCursorGuides2D` (mira tracejada amarela) e `renderAxisLines2D` (eixo Y verde em x=0, eixo X vermelho em y=0).
- `apps/web/src/state/useCadStore.ts`: estado `guideSettings`, `setGuideSettings`/`toggleCursorGuides`/`toggleAxisLines`, persistência e aliases de comando.
- `apps/web/src/components/cad/CadCanvas.tsx`: desenho das guias no overlay; overlay reage a `mouseWorld` e `guideSettings`.
- `apps/web/src/components/cad/CadStatusBar.tsx`: botões `CURSOR` e `EIXOS`.
- `apps/web/src/components/cad/CadEditor.tsx`: liga as props ao store.

## Decisões técnicas

- **Guias no overlay.** Reaproveita a separação base/overlay do MVP 3.14: a mira acompanha o cursor repintando só o overlay (barato), sem tocar no documento.
- **Cores.** Amarelo (`#eab308`) para a mira tracejada; verde (`#22c55e`) no eixo Y e vermelho (`#ef4444`) no eixo X, seguindo a referência e a convenção de cor por eixo.
- **Preferência persistida e desacoplada.** As guias são só visuais (não são entidades, não entram no documento nem no undo/redo), então vivem em `localStorage`, como as configurações de snap.
- **Comando + botão.** Como as demais ações do app, cada guia tem atalho textual e botão no rodapé.

## Testes

```bash
npx tsc -b                                   # build/typecheck dos pacotes
cd apps/web && npx tsc --noEmit              # typecheck do app web
npm run build                                # build de produção do web
npm run test --workspaces --if-present       # suíte completa (Vitest)
```

### Roteiro de teste manual

1. Mova o mouse na área de desenho: a mira tracejada amarela acompanha o ponteiro.
2. Confirme o eixo Y (verde) e o eixo X (vermelho) cruzando na origem (0,0).
3. Clique em `CURSOR` no rodapé (ou digite `cursor`): a mira some/volta. Idem `EIXOS` / `eixo`.
4. Recarregue a página: o estado ligado/desligado das guias é mantido.
