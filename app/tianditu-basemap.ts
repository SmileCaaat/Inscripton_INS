import type { StyleSpecification } from "maplibre-gl";

/** 课堂内置天地图浏览器端 tk；学生可在地图面板覆盖。 */
export const BUILTIN_TIANDITU_TK = "a123dc2d1cea332b13a46ba5e28177c3";

export const TIANDITU_TK_STORAGE_KEY = "ins.tianditu.tk";

const TIANDITU_SUBDOMAINS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** OpenFreeMap fallback when token is empty. */
export const OPENFREEMAP_STYLE =
  "https://tiles.openfreemap.org/styles/positron";

export function readStoredTiandituToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(TIANDITU_TK_STORAGE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeStoredTiandituToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    const next = token?.trim() ?? "";
    if (!next) {
      window.localStorage.removeItem(TIANDITU_TK_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TIANDITU_TK_STORAGE_KEY, next);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function resolveTiandituToken(override?: string | null): string {
  const custom = override?.trim();
  if (custom) return custom;
  const stored = readStoredTiandituToken();
  if (stored) return stored;
  return BUILTIN_TIANDITU_TK;
}

function tiandituTiles(layer: "vec_w" | "cva_w", token: string): string[] {
  return TIANDITU_SUBDOMAINS.map(
    (n) =>
      `https://t${n}.tianditu.gov.cn/DataServer?T=${layer}&x={x}&y={y}&l={z}&tk=${token}`,
  );
}

export function createTiandituStyle(token: string): StyleSpecification {
  return {
    version: 8,
    name: "Tianditu Vec",
    sources: {
      "tianditu-vec": {
        type: "raster",
        tiles: tiandituTiles("vec_w", token),
        tileSize: 256,
        maxzoom: 18,
        attribution:
          '© <a href="https://www.tianditu.gov.cn/" target="_blank" rel="noreferrer">国家地理信息公共服务平台天地图</a>',
      },
      "tianditu-cva": {
        type: "raster",
        tiles: tiandituTiles("cva_w", token),
        tileSize: 256,
        maxzoom: 18,
      },
    },
    layers: [
      {
        id: "tianditu-vec",
        type: "raster",
        source: "tianditu-vec",
        minzoom: 0,
        maxzoom: 18,
      },
      {
        id: "tianditu-cva",
        type: "raster",
        source: "tianditu-cva",
        minzoom: 0,
        maxzoom: 18,
        layout: {
          visibility: "none",
        },
      },
    ],
  };
}

export function resolveBasemapStyle(
  override?: string | null,
): string | StyleSpecification {
  const token = resolveTiandituToken(override);
  if (!token) return OPENFREEMAP_STYLE;
  return createTiandituStyle(token);
}

export type TiandituProbeResult =
  | { ok: true }
  | { ok: false; message: string };

/** Fetch one low-zoom tile to verify the tk works for browser MapLibre. */
export async function probeTiandituToken(
  token: string,
): Promise<TiandituProbeResult> {
  const tk = token.trim();
  if (!tk) {
    return { ok: false, message: "请先填写天地图浏览器端 tk。" };
  }
  const url = `https://t0.tianditu.gov.cn/DataServer?T=vec_w&x=1&y=1&l=2&tk=${encodeURIComponent(tk)}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") || !response.ok) {
      const text = await response.text();
      try {
        const payload = JSON.parse(text) as {
          msg?: string;
          resolve?: string;
          code?: number;
        };
        if (payload.code === 301013 || /服务器端/.test(payload.resolve ?? "")) {
          return {
            ok: false,
            message:
              "当前 tk 是「服务器端」类型。地图底图需要在控制台新建「浏览器端」应用，把新的 tk 填到这里。",
          };
        }
        return {
          ok: false,
          message:
            payload.resolve ||
            payload.msg ||
            `天地图拒绝了该 tk（HTTP ${response.status}）。`,
        };
      } catch {
        return {
          ok: false,
          message: `天地图瓦片请求失败（HTTP ${response.status}）。请确认 tk 为浏览器端且域名白名单允许本机。`,
        };
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        message: `天地图瓦片请求失败（HTTP ${response.status}）。`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "无法连接天地图服务，请检查网络后重试。",
    };
  }
}
