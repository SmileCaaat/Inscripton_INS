import type { BiblioRecord } from "./biblio-types";
import {
  keywordCooccurrence,
  networkFromCorpus,
  type VosNetworkPayload,
} from "./biblio-network";

export type ThemeQuadrant = "motor" | "niche" | "emerging" | "basic";

export type ThemePeriod = {
  label: string;
  from: number;
  to: number;
  records: BiblioRecord[];
};

export type ThemeCluster = {
  id: string;
  periodIndex: number;
  period: string;
  label: string;
  keywords: string[];
  documents: number;
  centrality: number;
  density: number;
  quadrant: ThemeQuadrant;
};

export type ThemeFlow = {
  fromId: string;
  toId: string;
  inclusion: number;
  shared: string[];
};

export type ThemeEvolution = {
  periods: ThemePeriod[];
  clusters: ThemeCluster[];
  flows: ThemeFlow[];
  networks: Array<VosNetworkPayload | null>;
  note?: string;
};

const QUADRANT_LABEL: Record<ThemeQuadrant, string> = {
  motor: "电机主题",
  niche: "利基主题",
  emerging: "新兴或衰退",
  basic: "基础主题",
};

export function themeQuadrantLabel(quadrant: ThemeQuadrant) {
  return QUADRANT_LABEL[quadrant];
}

export function yearSlices(records: BiblioRecord[]): ThemePeriod[] {
  const dated = records
    .filter((record) => typeof record.year === "number" && record.year > 0)
    .sort((left, right) => (left.year ?? 0) - (right.year ?? 0) || left.title.localeCompare(right.title));
  if (dated.length === 0) return [];
  const min = dated[0].year as number;
  const max = dated[dated.length - 1].year as number;
  const span = max - min;
  const parts = span < 4 ? 1 : dated.length < 18 ? 2 : 3;
  const starts = [0];
  for (let index = 1; index < parts; index += 1) {
    let cut = Math.floor((dated.length * index) / parts);
    while (
      cut < dated.length &&
      cut > starts[starts.length - 1] &&
      dated[cut].year === dated[cut - 1].year
    ) {
      cut += 1;
    }
    if (cut > starts[starts.length - 1] && cut < dated.length) starts.push(cut);
  }
  starts.push(dated.length);
  const periods = starts.slice(0, -1).map((start, index) => {
    const slice = dated.slice(start, starts[index + 1]);
    const from = slice[0].year as number;
    const to = slice[slice.length - 1].year as number;
    return {
      label: from === to ? `${from}` : `${from}–${to}`,
      from,
      to,
      records: slice,
    };
  });
  while (periods.length > 2 && periods[periods.length - 1].records.length < 12) {
    const last = periods.pop();
    const prev = periods[periods.length - 1];
    if (!last || !prev) break;
    const merged = [...prev.records, ...last.records];
    periods[periods.length - 1] = {
      ...prev,
      to: last.to,
      label: prev.from === last.to ? `${prev.from}` : `${prev.from}–${last.to}`,
      records: merged,
    };
  }
  return periods;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clustersForPeriod(period: ThemePeriod, periodIndex: number): {
  clusters: ThemeCluster[];
  network: VosNetworkPayload | null;
} {
  const built = networkFromCorpus(period.records, "theme");
  const network = built.fromCorpus ? built.data : null;
  if (!network) return { clusters: [], network: null };
  const { top, pairs } = keywordCooccurrence(period.records);
  const keywordSet = new Map(top.map((item) => [item.label, item.value]));
  const byCluster = new Map<number, string[]>();
  for (const item of network.network.items) {
    const list = byCluster.get(item.cluster) ?? [];
    list.push(item.label);
    byCluster.set(item.cluster, list);
  }
  const internal = new Map<number, number>();
  const external = new Map<number, number>();
  const clusterOf = new Map(network.network.items.map((item) => [item.label, item.cluster]));
  for (const [key, strength] of pairs) {
    const [left, right] = key.split("\u0001");
    const leftCluster = clusterOf.get(left);
    const rightCluster = clusterOf.get(right);
    if (leftCluster == null || rightCluster == null) continue;
    if (leftCluster === rightCluster) {
      internal.set(leftCluster, (internal.get(leftCluster) ?? 0) + strength);
    } else {
      external.set(leftCluster, (external.get(leftCluster) ?? 0) + strength);
      external.set(rightCluster, (external.get(rightCluster) ?? 0) + strength);
    }
  }
  const raw: ThemeCluster[] = [...byCluster.entries()].map(([cluster, keywords]) => {
    const size = keywords.length;
    const centrality = external.get(cluster) ?? 0;
    const density = size > 0 ? (internal.get(cluster) ?? 0) / size : 0;
    const ranked = [...keywords].sort(
      (left, right) => (keywordSet.get(right) ?? 0) - (keywordSet.get(left) ?? 0) || left.localeCompare(right),
    );
    const documents = period.records.filter((record) =>
      record.keywords.some((keyword) => keywords.some((item) => item.toLowerCase() === keyword.toLowerCase())),
    ).length;
    return {
      id: `p${periodIndex}-c${cluster}`,
      periodIndex,
      period: period.label,
      label: ranked.slice(0, 2).join(" · ") || `聚类 ${cluster}`,
      keywords: ranked,
      documents,
      centrality,
      density,
      quadrant: "emerging",
    };
  });
  const centralities = raw.map((item) => item.centrality);
  const densities = raw.map((item) => item.density);
  const midC = median(centralities);
  const midD = median(densities);
  const clusters = raw.map((item) => {
    const highC = item.centrality >= midC;
    const highD = item.density >= midD;
    const quadrant: ThemeQuadrant = highC && highD ? "motor" : !highC && highD ? "niche" : highC && !highD ? "basic" : "emerging";
    return { ...item, quadrant };
  });
  return { clusters, network };
}

export function inclusionIndex(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  let shared = 0;
  for (const item of left) {
    if (rightSet.has(item.toLowerCase())) shared += 1;
  }
  return shared / Math.min(left.length, right.length);
}

export function thematicEvolution(records: BiblioRecord[]): ThemeEvolution {
  const periods = yearSlices(records);
  if (periods.length === 0) {
    return { periods: [], clusters: [], flows: [], networks: [], note: "没有带年份的题录，还不能做主题演化。" };
  }
  const clusters: ThemeCluster[] = [];
  const networks: Array<VosNetworkPayload | null> = [];
  periods.forEach((period, index) => {
    const built = clustersForPeriod(period, index);
    clusters.push(...built.clusters);
    networks.push(
      built.network
        ? {
            ...built.network,
            info: {
              title: `主题切片 ${period.label}（本机）`,
              description: `该时段 ${period.records.length} 篇的关键词共现聚类，用于主题地图。`,
            },
          }
        : null,
    );
  });
  const flows: ThemeFlow[] = [];
  for (let index = 0; index < periods.length - 1; index += 1) {
    const fromClusters = clusters.filter((item) => item.periodIndex === index);
    const toClusters = clusters.filter((item) => item.periodIndex === index + 1);
    for (const from of fromClusters) {
      for (const to of toClusters) {
        const inclusion = inclusionIndex(from.keywords, to.keywords);
        if (inclusion < 0.2) continue;
        const rightSet = new Set(to.keywords.map((item) => item.toLowerCase()));
        const shared = from.keywords.filter((item) => rightSet.has(item.toLowerCase()));
        flows.push({ fromId: from.id, toId: to.id, inclusion, shared });
      }
    }
  }
  return {
    periods,
    clusters,
    flows,
    networks,
    note:
      periods.length < 2
        ? "年份跨度还不够切出两个时段。先看这一期的主题切片；检索或导入跨年题录后即可看演化。"
        : clusters.length === 0
          ? "各时段的关键词还不够聚类。请确认题录带有关键词或 OpenAlex concepts。"
          : undefined,
  };
}

export function themeNetworkAt(evolution: ThemeEvolution, periodIndex: number) {
  return evolution.networks[periodIndex] ?? null;
}
