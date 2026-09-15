// O módulo persiste as preferências de guias visuais (mira do cursor e linhas de eixo) no localStorage.
export type GuideSettings = Readonly<{
  cursorGuides: boolean;
  axisLines: boolean;
  dynamicInput: boolean;
}>;

export const DEFAULT_GUIDE_SETTINGS: GuideSettings = {
  cursorGuides: true,
  axisLines: true,
  dynamicInput: true
};

export const CAD_GUIDE_SETTINGS_STORAGE_KEY = "cad-web.guideSettings";

export function loadStoredGuideSettings(): GuideSettings {
  try {
    const rawValue = localStorage.getItem(CAD_GUIDE_SETTINGS_STORAGE_KEY);

    if (rawValue === null) {
      return DEFAULT_GUIDE_SETTINGS;
    }

    return normalizeGuideSettings(JSON.parse(rawValue));
  } catch {
    return DEFAULT_GUIDE_SETTINGS;
  }
}

export function storeGuideSettings(settings: GuideSettings): void {
  try {
    localStorage.setItem(CAD_GUIDE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A gravação das preferências é melhor esforço.
  }
}

function normalizeGuideSettings(value: unknown): GuideSettings {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_GUIDE_SETTINGS;
  }

  const candidate = value as Partial<Record<keyof GuideSettings, unknown>>;

  return {
    cursorGuides:
      typeof candidate.cursorGuides === "boolean" ? candidate.cursorGuides : DEFAULT_GUIDE_SETTINGS.cursorGuides,
    axisLines: typeof candidate.axisLines === "boolean" ? candidate.axisLines : DEFAULT_GUIDE_SETTINGS.axisLines,
    dynamicInput: typeof candidate.dynamicInput === "boolean" ? candidate.dynamicInput : DEFAULT_GUIDE_SETTINGS.dynamicInput
  };
}
