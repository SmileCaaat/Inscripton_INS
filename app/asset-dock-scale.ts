export const ASSET_DOCK_ICON_SCALE_KEY = "ins.asset-dock.icon-scale";

/** 0 = list, 100 = largest preview cards. */
export const ASSET_DOCK_ICON_SCALE_DEFAULT = 42;

export function clampAssetDockIconScale(value: number) {
  if (!Number.isFinite(value)) return ASSET_DOCK_ICON_SCALE_DEFAULT;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function readAssetDockIconScale() {
  if (typeof window === "undefined") return ASSET_DOCK_ICON_SCALE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(ASSET_DOCK_ICON_SCALE_KEY);
    if (raw == null) return ASSET_DOCK_ICON_SCALE_DEFAULT;
    return clampAssetDockIconScale(Number(raw));
  } catch {
    return ASSET_DOCK_ICON_SCALE_DEFAULT;
  }
}

export function writeAssetDockIconScale(value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ASSET_DOCK_ICON_SCALE_KEY,
      String(clampAssetDockIconScale(value)),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function assetDockIconScaleStyle(scale: number): {
  mode: "list" | "cards";
  cardWidth: number;
  thumbHeight: number;
} {
  const value = clampAssetDockIconScale(scale);
  if (value <= 12) {
    return { mode: "list", cardWidth: 0, thumbHeight: 36 };
  }
  const t = (value - 12) / 88;
  const cardWidth = Math.round(72 + t * (228 - 72));
  const thumbHeight = Math.round(40 + t * (148 - 40));
  return { mode: "cards", cardWidth, thumbHeight };
}
