export type CadMetrics = {
  totalEntities: number;
  visibleEntities: number;
  renderedEntities: number;
  renderTimeMs: number;
  indexQueryTimeMs: number;
  fps: number;
};

type MetricListener = (metrics: CadMetrics) => void;

export class CadDiagnosticsService {
  private static instance: CadDiagnosticsService;
  private readonly listeners = new Set<MetricListener>();
  private readonly metrics: CadMetrics = {
    totalEntities: 0,
    visibleEntities: 0,
    renderedEntities: 0,
    renderTimeMs: 0,
    indexQueryTimeMs: 0,
    fps: 0
  };

  private frameCount = 0;
  private lastFpsTime = performance.now();
  private notificationTimeout: number | null = null;
  private readonly THROTTLE_MS = 500;

  static getInstance(): CadDiagnosticsService {
    if (!CadDiagnosticsService.instance) {
      CadDiagnosticsService.instance = new CadDiagnosticsService();
    }
    return CadDiagnosticsService.instance;
  }

  subscribe(listener: MetricListener): () => void {
    this.listeners.add(listener);
    listener(this.metrics);

    return () => {
      this.listeners.delete(listener);
    };
  }

  reportFrame(stats: {
    totalEntities: number;
    visibleEntities: number;
    renderedEntities: number;
    renderTimeMs: number;
    indexQueryTimeMs: number;
  }): void {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsTime;

    if (elapsed >= 1000) {
      this.metrics.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    this.metrics.totalEntities = stats.totalEntities;
    this.metrics.visibleEntities = stats.visibleEntities;
    this.metrics.renderedEntities = stats.renderedEntities;
    this.metrics.renderTimeMs = stats.renderTimeMs;
    this.metrics.indexQueryTimeMs = stats.indexQueryTimeMs;

    this.scheduleNotification();
  }

  private scheduleNotification() {
    if (this.notificationTimeout !== null || this.listeners.size === 0) {
      return;
    }

    this.notificationTimeout = window.setTimeout(() => {
      this.notificationTimeout = null;
      this.notifyListeners();
    }, this.THROTTLE_MS);
  }

  private notifyListeners() {
    const currentMetrics = { ...this.metrics };
    for (const listener of this.listeners) {
      listener(currentMetrics);
    }
  }
}

export const cadDiagnostics = CadDiagnosticsService.getInstance();

// Debug bridge for DEV mode
if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_CAD_DIAGNOSTICS === "true") {
  (window as any).__CAD_DIAGNOSTICS = cadDiagnostics;
}
