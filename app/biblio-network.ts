import type { BiblioRecord } from "./biblio-types";
import {
  VOS_CITE_SCORE,
  VOS_FULL_PARAMETERS,
  VOS_TERMINOLOGY,
  VOS_YEAR_SCORE,
  type VosNetworkPayload,
} from "./vos-online-config";
import { LOCAL_VOS_NETWORK } from "./vos-sample-network";

export type { VosNetworkPayload };

function itemScores(records: BiblioRecord[], matches: (record: BiblioRecord) => boolean) {
  const matched = records.filter(matches);
  const years = matched
    .map((record) => record.year)
    .filter((year): year is number => typeof year === "number" && year > 0);
  const citations = matched.reduce((sum, record) => sum + record.citedBy, 0);
  const scores: Record<string, number> = {
    [VOS_CITE_SCORE]: matched.length ? citations / matched.length : 0,
  };
  if (years.length > 0) {
    scores[VOS_YEAR_SCORE] = years.reduce((sum, year) => sum + year, 0) / years.length;
  }
  return scores;
}

function vosConfig(scale = 1.05): VosNetworkPayload["config"] {
  return {
    parameters: {
      ...VOS_FULL_PARAMETERS,
      scale,
    },
    terminology: VOS_TERMINOLOGY.zh,
  };
}

function circleLayout(index: number, total: number) {
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  return {
    x: Math.cos(angle) * 0.72,
    y: Math.sin(angle) * 0.72,
  };
}

function buildCooccurrence(nodes: string[], pairs: Map<string, number>) {
  const items = nodes.map((label, index) => {
    const position = circleLayout(index, nodes.length);
    return {
      id: index + 1,
      label,
      x: position.x,
      y: position.y,
      cluster: (index % 3) + 1,
      weights: { Documents: 1, Citations: 0 },
      scores: {} as Record<string, number>,
    };
  });
  const idByLabel = new Map(nodes.map((label, index) => [label, index + 1]));
  const links: Array<{ source_id: number; target_id: number; strength: number }> = [];
  for (const [key, strength] of pairs) {
    const [left, right] = key.split("\u0001");
    const source = idByLabel.get(left);
    const target = idByLabel.get(right);
    if (!source || !target || source === target) continue;
    links.push({ source_id: source, target_id: target, strength });
  }
  return { items, links };
}

function pairKey(left: string, right: string) {
  return left < right ? `${left}\u0001${right}` : `${right}\u0001${left}`;
}

function topLabels(counts: Map<string, { label: string; value: number }>, limit: number) {
  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function addCount(
  counts: Map<string, { label: string; value: number }>,
  label: string,
  amount = 1,
) {
  const key = label.toLowerCase();
  const current = counts.get(key);
  if (current) current.value += amount;
  else counts.set(key, { label, value: amount });
}

function keywordNetwork(records: BiblioRecord[]): VosNetworkPayload | null {
  const counts = new Map<string, { label: string; value: number }>();
  for (const record of records) {
    for (const keyword of record.keywords) addCount(counts, keyword);
  }
  const top = topLabels(counts, 36);
  if (top.length < 3) return null;
  const allowed = new Set(top.map((item) => item.label.toLowerCase()));
  const pairs = new Map<string, number>();
  for (const record of records) {
    const labels = [
      ...new Map(
        record.keywords
          .filter((keyword) => allowed.has(keyword.toLowerCase()))
          .map((keyword) => [keyword.toLowerCase(), keyword]),
      ).values(),
    ];
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const key = pairKey(labels[i], labels[j]);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  const { items, links } = buildCooccurrence(
    top.map((item) => item.label),
    pairs,
  );
  for (const item of items) {
    const count = counts.get(item.label.toLowerCase());
    item.weights.Documents = count?.value ?? 1;
    item.scores = itemScores(records, (record) =>
      record.keywords.some((keyword) => keyword.toLowerCase() === item.label.toLowerCase()),
    );
  }
  if (links.length === 0) return null;
  return {
    network: { items, links },
    config: vosConfig(),
    info: {
      title: "关键词共现（本机）",
      description: "由当前工作区题录在本机构网，没有上传到 app.vosviewer.com。",
    },
  };
}

function authorNetwork(records: BiblioRecord[]): VosNetworkPayload | null {
  const counts = new Map<string, { label: string; value: number }>();
  for (const record of records) {
    for (const author of record.authors) addCount(counts, author);
  }
  const top = topLabels(counts, 32);
  if (top.length < 3) return null;
  const allowed = new Set(top.map((item) => item.label.toLowerCase()));
  const pairs = new Map<string, number>();
  for (const record of records) {
    const labels = [
      ...new Map(
        record.authors
          .filter((author) => allowed.has(author.toLowerCase()))
          .map((author) => [author.toLowerCase(), author]),
      ).values(),
    ];
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const key = pairKey(labels[i], labels[j]);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  const { items, links } = buildCooccurrence(
    top.map((item) => item.label),
    pairs,
  );
  for (const item of items) {
    const count = counts.get(item.label.toLowerCase());
    const authored = records.filter((record) =>
      record.authors.some((author) => author.toLowerCase() === item.label.toLowerCase()),
    );
    item.weights.Documents = count?.value ?? 1;
    item.weights.Citations = authored.reduce((sum, record) => sum + record.citedBy, 0);
    item.scores = itemScores(authored, () => true);
  }
  if (links.length === 0) return null;
  return {
    network: { items, links },
    config: vosConfig(),
    info: {
      title: "作者合作（本机）",
      description: "由当前工作区题录在本机构网，没有上传到 app.vosviewer.com。",
    },
  };
}

export function networkFromCorpus(records: BiblioRecord[]): {
  data: VosNetworkPayload;
  fromCorpus: boolean;
} {
  const keyword = keywordNetwork(records);
  if (keyword) return { data: keyword, fromCorpus: true };
  const authors = authorNetwork(records);
  if (authors) return { data: authors, fromCorpus: true };
  return { data: LOCAL_VOS_NETWORK, fromCorpus: false };
}
