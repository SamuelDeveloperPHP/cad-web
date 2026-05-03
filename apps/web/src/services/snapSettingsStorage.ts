import { DEFAULT_SNAP_SETTINGS, type SnapSettings } from "@cad-web/cad-geometry";

export const CAD_SNAP_SETTINGS_STORAGE_KEY = "cad-web.snapSettings";

export function loadStoredSnapSettings(): SnapSettings {
  try {
    const rawValue = localStorage.getItem(CAD_SNAP_SETTINGS_STORAGE_KEY);

    if (rawValue === null) {
      return DEFAULT_SNAP_SETTINGS;
    }

    return normalizeSnapSettings(JSON.parse(rawValue));
  } catch {
    return DEFAULT_SNAP_SETTINGS;
  }
}

export function storeSnapSettings(settings: SnapSettings): void {
  localStorage.setItem(CAD_SNAP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function normalizeSnapSettings(value: unknown): SnapSettings {
  if (!isObject(value)) {
    return DEFAULT_SNAP_SETTINGS;
  }

  const candidate = value as Partial<Record<keyof SnapSettings, unknown>>;

  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : DEFAULT_SNAP_SETTINGS.enabled,
    endpoint: typeof candidate.endpoint === "boolean" ? candidate.endpoint : DEFAULT_SNAP_SETTINGS.endpoint,
    midpoint: typeof candidate.midpoint === "boolean" ? candidate.midpoint : DEFAULT_SNAP_SETTINGS.midpoint,
    center: typeof candidate.center === "boolean" ? candidate.center : DEFAULT_SNAP_SETTINGS.center,
    nearest: typeof candidate.nearest === "boolean" ? candidate.nearest : DEFAULT_SNAP_SETTINGS.nearest,
    tolerancePx:
      typeof candidate.tolerancePx === "number" && Number.isFinite(candidate.tolerancePx)
        ? candidate.tolerancePx
        : DEFAULT_SNAP_SETTINGS.tolerancePx
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
