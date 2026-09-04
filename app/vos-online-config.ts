export type VosUiLang = "zh" | "en";
export type VosColorMode = "cluster" | "year" | "cites";

export const VOS_UI_LANG_KEY = "inscription-vos-ui-lang-v1";

export const VOS_TERMINOLOGY = {
  zh: {
    item: "节点",
    items: "节点",
    link: "连线",
    links: "连线",
    cluster: "聚类",
    clusters: "聚类",
    link_strength: "连线强度",
    total_link_strength: "总连线强度",
  },
  en: {
    item: "Item",
    items: "Items",
    link: "Link",
    links: "Links",
    cluster: "Cluster",
    clusters: "Clusters",
    link_strength: "Link strength",
    total_link_strength: "Total link strength",
  },
} as const;

export type VosNetworkPayload = {
  network: {
    items: Array<{
      id: number;
      label: string;
      x: number;
      y: number;
      cluster: number;
      weights: Record<string, number>;
      scores?: Record<string, number>;
    }>;
    links: Array<{ source_id: number; target_id: number; strength: number }>;
  };
  config: {
    parameters: Record<string, unknown>;
    terminology: (typeof VOS_TERMINOLOGY)["zh"] | (typeof VOS_TERMINOLOGY)["en"];
  };
  info: { title: string; description: string };
};

const WEIGHT_LABELS: Record<VosUiLang, Record<string, string>> = {
  zh: { Documents: "文献", Citations: "被引" },
  en: { Documents: "Documents", Citations: "Citations" },
};

const SCORE_LABELS: Record<VosUiLang, Record<string, string>> = {
  zh: { "Avg. pub. year": "平均发表年", "Avg. citations": "平均被引" },
  en: { "Avg. pub. year": "Avg. pub. year", "Avg. citations": "Avg. citations" },
};

export const VOS_YEAR_SCORE = "Avg. pub. year";
export const VOS_CITE_SCORE = "Avg. citations";

export const VOS_FULL_PARAMETERS = {
  simple_ui: false,
  show_info: false,
  curved_links: true,
  colored_links: true,
  dimming_effect: true,
  gradient_circles: true,
} as const;

export function loadVosUiLang(): VosUiLang {
  if (typeof window === "undefined") return "zh";
  return window.localStorage.getItem(VOS_UI_LANG_KEY) === "en" ? "en" : "zh";
}

export function saveVosUiLang(lang: VosUiLang) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOS_UI_LANG_KEY, lang);
}

function remapNumericMap(
  values: Record<string, number> | undefined,
  labels: Record<string, string>,
) {
  if (!values) return values;
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    next[labels[key] ?? key] = value;
  }
  return next;
}

export function scoreKeysOf(data: VosNetworkPayload) {
  const keys: string[] = [];
  for (const item of data.network.items) {
    const scores = "scores" in item ? item.scores : undefined;
    if (!scores) continue;
    for (const key of Object.keys(scores)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

export function vosColorIndex(data: VosNetworkPayload, mode: VosColorMode) {
  if (mode === "cluster") return 1;
  const want = mode === "year" ? VOS_YEAR_SCORE : VOS_CITE_SCORE;
  const index = scoreKeysOf(data).indexOf(want);
  return index >= 0 ? index + 2 : 1;
}

export function localizeVosNetwork(data: VosNetworkPayload, lang: VosUiLang): VosNetworkPayload {
  const weightLabels = WEIGHT_LABELS[lang];
  const scoreLabels = SCORE_LABELS[lang];
  return {
    ...data,
    network: {
      ...data.network,
      items: data.network.items.map((item) => ({
        ...item,
        weights: remapNumericMap(item.weights, weightLabels) ?? item.weights,
        ...("scores" in item && item.scores
          ? { scores: remapNumericMap(item.scores, scoreLabels) }
          : {}),
      })),
    },
    config: {
      ...data.config,
      parameters: {
        ...data.config.parameters,
        ...VOS_FULL_PARAMETERS,
        simple_ui: false,
      },
      terminology: { ...VOS_TERMINOLOGY[lang] },
    },
  };
}
