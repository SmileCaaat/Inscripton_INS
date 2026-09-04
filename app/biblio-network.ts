import type { BiblioRecord } from "./biblio-types";
import { normalizeDoi } from "./biblio-types";
import {
  VOS_CITE_SCORE,
  VOS_FULL_PARAMETERS,
  VOS_TERMINOLOGY,
  VOS_YEAR_SCORE,
  type VosNetworkPayload,
} from "./vos-online-config";
import { LOCAL_VOS_NETWORK } from "./vos-sample-network";

export type { VosNetworkPayload };

export const VOS_NETWORK_KINDS = [
  { id: "keywords", label: "关键词共现" },
  { id: "authors", label: "作者合作" },
  { id: "coupling", label: "文献耦合" },
  { id: "cocitation", label: "共被引" },
  { id: "citation", label: "引文网" },
  { id: "theme", label: "主题切片" },
] as const;

export type VosNetworkKind = (typeof VOS_NETWORK_KINDS)[number]["id"];

const NODE_LIMIT = 40;
const PAIR_SEP = "\u0001";

export function workKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const openalex = trimmed.match(/W\d{3,}/i);
  if (openalex) return `oa:${openalex[0].toUpperCase()}`;
  const doiMatch = trimmed.match(/10\.\d{4,9}\/\S+/i);
  if (doiMatch) {
    return `doi:${normalizeDoi(doiMatch[0].replace(/[.,;)]+$/, ""))}`;
  }
  return `raw:${trimmed.toLowerCase().replace(/\s+/g, " ").slice(0, 160)}`;
}

export function recordKeys(record: BiblioRecord) {
  const keys = [workKey(record.id), record.url ? workKey(record.url) : "", record.doi ? `doi:${normalizeDoi(record.doi)}` : ""].filter(
    Boolean,
  );
  return [...new Set(keys)];
}

export function pairKey(left: string, right: string) {
  return left < right ? `${left}${PAIR_SEP}${right}` : `${right}${PAIR_SEP}${left}`;
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

export function clusterFromLinks(nodeCount: number, links: Array<{ source_id: number; target_id: number; strength: number }>) {
  const labels = Array.from({ length: nodeCount }, (_, index) => index);
  const adj: Array<Array<{ other: number; weight: number }>> = Array.from({ length: nodeCount }, () => []);
  for (const link of links) {
    const source = link.source_id - 1;
    const target = link.target_id - 1;
    if (source < 0 || target < 0 || source >= nodeCount || target >= nodeCount || source === target) continue;
    adj[source].push({ other: target, weight: link.strength });
    adj[target].push({ other: source, weight: link.strength });
  }
  for (let round = 0; round < 10; round += 1) {
    let changed = false;
    const order = round % 2 === 0 ? labels.map((_, index) => index) : labels.map((_, index) => nodeCount - 1 - index);
    for (const index of order) {
      const votes = new Map<number, number>();
      for (const edge of adj[index]) {
        votes.set(labels[edge.other], (votes.get(labels[edge.other]) ?? 0) + edge.weight);
      }
      let best = labels[index];
      let bestWeight = -1;
      for (const [label, weight] of votes) {
        if (weight > bestWeight || (weight === bestWeight && label < best)) {
          bestWeight = weight;
          best = label;
        }
      }
      if (best !== labels[index]) {
        labels[index] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const mapped = new Map<number, number>();
  let next = 1;
  return labels.map((label) => {
    const existing = mapped.get(label);
    if (existing) return existing;
    mapped.set(label, next);
    next += 1;
    return mapped.get(label) ?? 1;
  });
}

function itemScoresForRecords(matched: BiblioRecord[]) {
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

function payloadFromPairs(
  nodes: Array<{
    label: string;
    documents: number;
    citations: number;
    scores: Record<string, number>;
  }>,
  pairs: Map<string, number>,
  title: string,
  description: string,
): VosNetworkPayload | null {
  if (nodes.length < 3 || pairs.size === 0) return null;
  const items = nodes.map((node, index) => {
    const position = circleLayout(index, nodes.length);
    return {
      id: index + 1,
      label: node.label,
      x: position.x,
      y: position.y,
      cluster: 1,
      weights: { Documents: node.documents, Citations: node.citations },
      scores: node.scores,
    };
  });
  const idByLabel = new Map(nodes.map((node, index) => [node.label, index + 1]));
  const links: Array<{ source_id: number; target_id: number; strength: number }> = [];
  for (const [key, strength] of pairs) {
    const [left, right] = key.split(PAIR_SEP);
    const source = idByLabel.get(left);
    const target = idByLabel.get(right);
    if (!source || !target || source === target) continue;
    links.push({ source_id: source, target_id: target, strength });
  }
  if (links.length === 0) return null;
  const clusters = clusterFromLinks(items.length, links);
  for (let index = 0; index < items.length; index += 1) items[index].cluster = clusters[index];
  return {
    network: { items, links },
    config: vosConfig(),
    info: { title, description },
  };
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

function topLabels(counts: Map<string, { label: string; value: number }>, limit: number) {
  return [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function uniqueRecordLabels(values: string[]) {
  return [
    ...new Map(
      values.filter(Boolean).map((value) => [value.toLowerCase(), value]),
    ).values(),
  ];
}

export function keywordCooccurrence(records: BiblioRecord[], limit = NODE_LIMIT) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const record of records) {
    for (const keyword of record.keywords) addCount(counts, keyword);
  }
  const top = topLabels(counts, limit);
  const allowed = new Set(top.map((item) => item.label.toLowerCase()));
  const pairs = new Map<string, number>();
  for (const record of records) {
    const labels = uniqueRecordLabels(
      record.keywords.filter((keyword) => allowed.has(keyword.toLowerCase())),
    );
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const key = pairKey(labels[i], labels[j]);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  return { counts, top, pairs };
}

function keywordNetwork(records: BiblioRecord[]): VosNetworkPayload | null {
  const { top, pairs } = keywordCooccurrence(records);
  if (top.length < 3) return null;
  return payloadFromPairs(
    top.map((item) => ({
      label: item.label,
      documents: item.value,
      citations: 0,
      scores: itemScoresForRecords(
        records.filter((record) =>
          record.keywords.some((keyword) => keyword.toLowerCase() === item.label.toLowerCase()),
        ),
      ),
    })),
    pairs,
    "关键词共现（本机）",
    "由当前工作区题录在本机构网，没有上传到 app.vosviewer.com。",
  );
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
    const labels = uniqueRecordLabels(
      record.authors.filter((author) => allowed.has(author.toLowerCase())),
    );
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) {
        const key = pairKey(labels[i], labels[j]);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  return payloadFromPairs(
    top.map((item) => {
      const authored = records.filter((record) =>
        record.authors.some((author) => author.toLowerCase() === item.label.toLowerCase()),
      );
      return {
        label: item.label,
        documents: item.value,
        citations: authored.reduce((sum, record) => sum + record.citedBy, 0),
        scores: itemScoresForRecords(authored),
      };
    }),
    pairs,
    "作者合作（本机）",
    "由当前工作区题录在本机构网，没有上传到 app.vosviewer.com。",
  );
}

function truncateLabel(value: string, max = 68) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function uniqueLabels(entries: Array<{ id: string; title: string }>) {
  const used = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const entry of entries) {
    const base = truncateLabel(entry.title);
    const key = base.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    labels.set(entry.id, count === 0 ? base : truncateLabel(`${base} · ${count + 1}`));
  }
  return labels;
}

function indexRecords(records: BiblioRecord[]) {
  const byKey = new Map<string, BiblioRecord>();
  for (const record of records) {
    for (const key of recordKeys(record)) {
      if (!byKey.has(key)) byKey.set(key, record);
    }
  }
  return byKey;
}

function recordRefKeys(record: BiblioRecord) {
  return [...new Set(record.referencedWorks.map(workKey).filter(Boolean))];
}

export function couplingNetwork(records: BiblioRecord[]): VosNetworkPayload | null {
  const candidates = records
    .map((record) => ({ record, refs: new Set(recordRefKeys(record)) }))
    .filter((item) => item.refs.size >= 1)
    .sort(
      (left, right) =>
        right.record.citedBy - left.record.citedBy ||
        right.refs.size - left.refs.size ||
        left.record.title.localeCompare(right.record.title),
    )
    .slice(0, NODE_LIMIT);
  if (candidates.length < 3) return null;
  const pairs = new Map<string, number>();
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      let shared = 0;
      const smaller = candidates[i].refs.size <= candidates[j].refs.size ? candidates[i] : candidates[j];
      const larger = smaller === candidates[i] ? candidates[j] : candidates[i];
      for (const ref of smaller.refs) {
        if (larger.refs.has(ref)) shared += 1;
      }
      if (shared > 0) pairs.set(pairKey(candidates[i].record.id, candidates[j].record.id), shared);
    }
  }
  const used = new Set<string>();
  for (const key of pairs.keys()) {
    const [left, right] = key.split(PAIR_SEP);
    used.add(left);
    used.add(right);
  }
  const nodes = candidates.filter((item) => used.has(item.record.id));
  const labelOf = uniqueLabels(nodes.map((item) => ({ id: item.record.id, title: item.record.title })));
  const namedPairs = new Map<string, number>();
  for (const [key, strength] of pairs) {
    const [left, right] = key.split(PAIR_SEP);
    const leftLabel = labelOf.get(left);
    const rightLabel = labelOf.get(right);
    if (!leftLabel || !rightLabel) continue;
    namedPairs.set(pairKey(leftLabel, rightLabel), strength);
  }
  return payloadFromPairs(
    nodes.map((item) => ({
      label: labelOf.get(item.record.id) ?? item.record.title,
      documents: 1,
      citations: item.record.citedBy,
      scores: itemScoresForRecords([item.record]),
    })),
    namedPairs,
    "文献耦合（本机）",
    "两篇文献的参考文献重叠越多，连线越强。数据不出主机。",
  );
}

export function cocitationNetwork(records: BiblioRecord[]): VosNetworkPayload | null {
  const byKey = indexRecords(records);
  const counts = new Map<string, { key: string; value: number; label: string }>();
  for (const record of records) {
    for (const key of new Set(recordRefKeys(record))) {
      const cited = byKey.get(key);
      const label = cited ? truncateLabel(cited.title) : key.replace(/^oa:/, "").replace(/^doi:/, "").replace(/^raw:/, "");
      const current = counts.get(key);
      if (current) current.value += 1;
      else counts.set(key, { key, value: 1, label });
    }
  }
  const top = [...counts.values()]
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, NODE_LIMIT);
  if (top.length < 3) return null;
  const allowed = new Set(top.map((item) => item.key));
  const labelOf = new Map(top.map((item) => [item.key, item.label]));
  const pairs = new Map<string, number>();
  for (const record of records) {
    const refs = [...new Set(recordRefKeys(record).filter((key) => allowed.has(key)))];
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        const left = labelOf.get(refs[i]);
        const right = labelOf.get(refs[j]);
        if (!left || !right || left === right) continue;
        const key = pairKey(left, right);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  return payloadFromPairs(
    top.map((item) => {
      const cited = byKey.get(item.key);
      return {
        label: item.label,
        documents: item.value,
        citations: cited?.citedBy ?? item.value,
        scores: cited ? itemScoresForRecords([cited]) : { [VOS_CITE_SCORE]: item.value },
      };
    }),
    pairs,
    "共被引（本机）",
    "两篇文献同时出现在第三篇的参考文献里则连线。优先显示工作区里能对上题名的文献。",
  );
}

export function citationNetwork(records: BiblioRecord[]): VosNetworkPayload | null {
  const byKey = indexRecords(records);
  const pairs = new Map<string, number>();
  const used = new Set<string>();
  for (const record of records) {
    for (const ref of recordRefKeys(record)) {
      const target = byKey.get(ref);
      if (!target || target.id === record.id) continue;
      const key = pairKey(record.id, target.id);
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      used.add(record.id);
      used.add(target.id);
    }
  }
  const nodes = records
    .filter((record) => used.has(record.id))
    .sort((left, right) => right.citedBy - left.citedBy || left.title.localeCompare(right.title))
    .slice(0, NODE_LIMIT);
  const allowed = new Set(nodes.map((record) => record.id));
  const labelOf = uniqueLabels(nodes.map((record) => ({ id: record.id, title: record.title })));
  const namedPairs = new Map<string, number>();
  for (const [key, strength] of pairs) {
    const [left, right] = key.split(PAIR_SEP);
    if (!allowed.has(left) || !allowed.has(right)) continue;
    const leftLabel = labelOf.get(left);
    const rightLabel = labelOf.get(right);
    if (!leftLabel || !rightLabel) continue;
    namedPairs.set(pairKey(leftLabel, rightLabel), strength);
  }
  return payloadFromPairs(
    nodes.map((record) => ({
      label: labelOf.get(record.id) ?? record.title,
      documents: 1,
      citations: record.citedBy,
      scores: itemScoresForRecords([record]),
    })),
    namedPairs,
    "引文网（本机）",
    "工作区内部谁引用了谁。VOSviewer 按无向连线显示，强度为引用次数。",
  );
}

export type NetworkBuildResult = {
  data: VosNetworkPayload;
  fromCorpus: boolean;
  kind: VosNetworkKind;
  missing?: string;
};

const MISSING: Record<VosNetworkKind, string> = {
  keywords: "当前题录的关键词还不够画共现网。",
  authors: "当前题录的作者还不够画合作网。",
  coupling: "当前题录没有足够的参考文献重叠，无法画耦合网。OpenAlex 检索一般带参考文献；CSV/RIS 需要参考文献列或 CR 字段。",
  cocitation: "当前题录的参考文献还不够画共被引网。",
  citation: "工作区内部还没有互相引用的文献，无法画引文网。",
  theme: "当前时段的关键词还不够画主题切片。",
};

export function networkFromCorpus(
  records: BiblioRecord[],
  kind: VosNetworkKind = "keywords",
): NetworkBuildResult {
  const builders: Record<VosNetworkKind, (input: BiblioRecord[]) => VosNetworkPayload | null> = {
    keywords: keywordNetwork,
    authors: authorNetwork,
    coupling: couplingNetwork,
    cocitation: cocitationNetwork,
    citation: citationNetwork,
    theme: keywordNetwork,
  };
  const built = builders[kind](records);
  if (built) return { data: built, fromCorpus: true, kind };
  if (kind === "keywords" || kind === "authors" || kind === "theme") {
    const fallback = kind === "authors" ? authorNetwork(records) ?? keywordNetwork(records) : keywordNetwork(records);
    if (fallback) return { data: fallback, fromCorpus: true, kind };
  }
  return {
    data: LOCAL_VOS_NETWORK,
    fromCorpus: false,
    kind,
    missing: records.length === 0 ? undefined : MISSING[kind],
  };
}
