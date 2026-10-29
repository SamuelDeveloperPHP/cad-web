import { configureCanvasForDevicePixelRatio, type RenderStats, type ScreenSize, type Viewport } from "@cad-web/cad-renderer";

/**
 * Trabalho de desenho que avança por fatias de tempo (por exemplo DocumentRenderJob). O contrato é mínimo para
 * a camada não depender do renderer concreto.
 */
export type StepJob = Readonly<{
  step: (budgetMs: number) => boolean;
  cancel: () => void;
  stats: RenderStats;
}>;

// Cria o trabalho de desenho sobre o buffer de trás (já limpo); null significa "camada vazia".
export type LayerJobFactory = (context: CanvasRenderingContext2D, screenSize: ScreenSize) => StepJob | null;

// Tempo máximo de desenho por quadro: deixa folga no quadro de 16 ms para eventos de ponteiro e teclado.
const DEFAULT_FRAME_BUDGET_MS = 9;
// Fora desta faixa de escala o bitmap antigo seria uma imagem inútil e é escondido até o novo ficar pronto.
const MAX_PROXY_SCALE = 24;

/**
 * Camada de canvas com buffer duplo e desenho progressivo. O desenho novo é feito em um canvas fora da tela,
 * em fatias de tempo, e só é copiado para o canvas visível quando termina: a tela nunca mostra um quadro pela metade.
 * Enquanto o desenho novo não termina (pan e zoom em desenhos grandes), o bitmap antigo é reposicionado por uma
 * transformação CSS (translate + scale) para acompanhar o viewport atual, o que mantém a interação fluida na
 * GPU; um pedido novo cancela o desenho em andamento, então só o estado final é desenhado em alta qualidade.
 */
export class ProgressiveLayer {
  private readonly back = document.createElement("canvas");
  private job: StepJob | null = null;
  private jobViewport: Viewport | null = null;
  private pending: Readonly<{ viewport: Viewport; factory: LayerJobFactory }> | null = null;
  // Viewport com que o bitmap atualmente visível foi desenhado.
  private shownViewport: Viewport | null = null;
  private frame: number | null = null;
  private screenSize: ScreenSize = { width: 1, height: 1 };

  constructor(
    private readonly visible: HTMLCanvasElement,
    private readonly onComplete?: (stats: RenderStats) => void,
    private readonly frameBudgetMs: number = DEFAULT_FRAME_BUDGET_MS
  ) {
    this.visible.style.transformOrigin = "0 0";
  }

  // Redimensiona o canvas visível e o buffer de trás (zera os bitmaps); o chamador pede um novo desenho em seguida.
  resize(screenSize: ScreenSize): void {
    this.screenSize = screenSize;
    configureCanvasForDevicePixelRatio(this.visible, screenSize);
    configureCanvasForDevicePixelRatio(this.back, screenSize);
    this.shownViewport = null;
    this.visible.style.transform = "";
    this.visible.style.visibility = "";
  }

  /**
   * Pede um desenho novo para o viewport dado, cancelando o que estiver em andamento. A transformação CSS que
   * aproxima o bitmap atual do novo viewport é aplicada na hora, antes do próximo quadro.
   */
  request(viewport: Viewport, factory: LayerJobFactory): void {
    this.cancelJob();
    this.pending = { viewport, factory };
    this.applyProxy(viewport);
    this.schedule();
  }

  // Interrompe tudo (desmontagem do componente).
  dispose(): void {
    this.cancelJob();
    this.pending = null;

    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  private cancelJob(): void {
    if (this.job !== null) {
      this.job.cancel();
      this.job = null;
      this.jobViewport = null;
    }
  }

  private schedule(): void {
    if (this.frame !== null) {
      return;
    }

    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.run();
    });
  }

  private run(): void {
    if (this.pending !== null) {
      const { viewport, factory } = this.pending;
      this.pending = null;
      const backContext = this.back.getContext("2d");

      if (backContext === null) {
        return;
      }

      // O buffer de trás é limpo em pixels do dispositivo (transformação identidade) antes de cada desenho.
      backContext.save();
      backContext.setTransform(1, 0, 0, 1, 0, 0);
      backContext.clearRect(0, 0, this.back.width, this.back.height);
      backContext.restore();

      this.job = factory(backContext, this.screenSize);
      this.jobViewport = viewport;

      if (this.job === null) {
        this.commit(viewport, null);
        return;
      }
    }

    if (this.job === null) {
      return;
    }

    if (this.job.step(this.frameBudgetMs)) {
      const stats = this.job.stats;
      const viewport = this.jobViewport;
      this.job = null;
      this.jobViewport = null;

      if (viewport !== null) {
        this.commit(viewport, stats);
      }
    } else {
      this.schedule();
    }
  }

  // Copia o buffer de trás para o canvas visível de uma só vez e zera o proxy CSS.
  private commit(viewport: Viewport, stats: RenderStats | null): void {
    const context = this.visible.getContext("2d");

    if (context === null) {
      return;
    }

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.visible.width, this.visible.height);

    if (stats !== null) {
      context.drawImage(this.back, 0, 0);
    }

    context.restore();
    this.shownViewport = viewport;
    this.visible.style.transform = "";
    this.visible.style.visibility = "";

    if (stats !== null) {
      this.onComplete?.(stats);
    }
  }

  // Posiciona o bitmap visível (desenhado em shownViewport) como ele ficaria no viewport pedido.
  private applyProxy(viewport: Viewport): void {
    const shown = this.shownViewport;

    if (shown === null) {
      return;
    }

    const k = viewport.scale / shown.scale;
    const tx = (shown.origin.x - viewport.origin.x) * viewport.scale;
    const ty = (shown.origin.y - viewport.origin.y) * viewport.scale;

    if (k > MAX_PROXY_SCALE || k < 1 / MAX_PROXY_SCALE) {
      this.visible.style.visibility = "hidden";
      return;
    }

    this.visible.style.visibility = "";
    this.visible.style.transform = Math.abs(k - 1) < 1e-9 && Math.abs(tx) < 1e-6 && Math.abs(ty) < 1e-6 ? "" : `translate(${tx}px, ${ty}px) scale(${k})`;
  }
}
