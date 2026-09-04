export const BIBLIO_CORPUS_LIMIT = 500;
export const BIBLIO_GRAPH_TAG = "计量";
export const GRAPH_CARD_WIDTH = 214;
export const GRAPH_CARD_HEIGHT = 148;
export const BIBLIO_AUTHOR_WIDTH = 176;
export const BIBLIO_AUTHOR_HEIGHT = 30;
export const BIBLIO_DOC_WIDTH = 280;
export const BIBLIO_DOC_HEIGHT = 36;
export const BIBLIO_LAYOUT_GAP_X = 12;
export const BIBLIO_LAYOUT_GAP_Y = 8;
export const BIBLIO_LAYOUT_PADDING = 80;

export type BiblioSource = "openalex" | "csv" | "ris" | "bibtex";

export type BiblioRecord = {
  id: string;
  title: string;
  year?: number;
  type?: string;
  doi?: string;
  authors: string[];
  venue?: string;
  keywords: string[];
  citedBy: number;
  referencedWorks: string[];
  abstract?: string;
  language?: string;
  url?: string;
  source: BiblioSource;
  importedAt: string;
};

export type BiblioCorpus = {
  query?: string;
  fetchedAt?: string;
  openAlexCount?: number;
  records: BiblioRecord[];
};

export type BiblioStatRow = {
  label: string;
  value: number;
};

export function emptyBiblioCorpus(): BiblioCorpus {
  return { records: [] };
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeDoi(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

export function recordKey(record: BiblioRecord) {
  if (record.doi) return `doi:${normalizeDoi(record.doi)}`;
  return record.id.trim().toLowerCase();
}

export function mergeBiblioRecords(
  existing: BiblioRecord[],
  incoming: BiblioRecord[],
  limit = BIBLIO_CORPUS_LIMIT,
) {
  const byKey = new Map<string, BiblioRecord>();
  for (const record of existing) {
    byKey.set(recordKey(record), record);
  }
  let added = 0;
  let skipped = 0;
  for (const record of incoming) {
    const key = recordKey(record);
    if (byKey.has(key) || byKey.size >= limit) {
      skipped += 1;
      continue;
    }
    byKey.set(key, record);
    added += 1;
  }
  return { records: [...byKey.values()], added, skipped };
}

export const BIBLIO_TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "article", label: "期刊论文" },
  { value: "review", label: "综述" },
  { value: "book", label: "图书" },
  { value: "book-chapter", label: "图书章节" },
  { value: "proceedings-article", label: "会议论文" },
  { value: "preprint", label: "预印本" },
  { value: "dissertation", label: "学位论文" },
  { value: "report", label: "报告" },
  { value: "dataset", label: "数据集" },
] as const;

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  BIBLIO_TYPE_OPTIONS.filter((item) => item.value).map((item) => [item.value, item.label]),
);

export function biblioTypeLabel(type?: string) {
  if (!type) return "";
  return TYPE_LABELS[type] ?? type;
}

export function sourceLabel(source: BiblioSource) {
  if (source === "openalex") return "OpenAlex";
  if (source === "csv") return "CSV";
  if (source === "ris") return "RIS";
  return "BibTeX";
}

export type GraphLayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isBiblioAuthorNode(node: {
  kind?: string;
  tags?: string[];
  subtitle?: string;
}) {
  return (
    node.kind === "Author" ||
    (node.kind === "Person" &&
      (Boolean(node.tags?.includes(BIBLIO_GRAPH_TAG)) || node.subtitle === "作者"))
  );
}

export function isBiblioDocumentNode(node: { kind?: string; tags?: string[] }) {
  return node.kind === "Document" && Boolean(node.tags?.includes(BIBLIO_GRAPH_TAG));
}

export function isBiblioGraphNode(node: {
  kind?: string;
  tags?: string[];
  subtitle?: string;
}) {
  return isBiblioAuthorNode(node) || isBiblioDocumentNode(node);
}

export function migrateBiblioAuthorNode<
  T extends { kind: string; subtitle: string; tags: string[] },
>(node: T): T {
  if (!isBiblioAuthorNode(node) || node.kind === "Author") return node;
  return {
    ...node,
    kind: "Author",
    subtitle: "文献作者",
    tags: [...new Set([...node.tags.filter((tag) => tag !== "作者"), BIBLIO_GRAPH_TAG])],
  };
}

export function biblioNodeSummary(record: BiblioRecord) {
  return [record.venue, record.year].filter(Boolean).join(" · ") || "计量题录";
}

export function nodeLayoutBox(node: { x: number; y: number }): GraphLayoutBox {
  return {
    x: node.x,
    y: node.y,
    width: GRAPH_CARD_WIDTH,
    height: GRAPH_CARD_HEIGHT,
  };
}

export function boxesOverlap(a: GraphLayoutBox, b: GraphLayoutBox, pad = 0) {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  );
}

export function unionLayoutBox(boxes: GraphLayoutBox[]): GraphLayoutBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function biblioAuthorColumns(count: number) {
  if (count <= 20) return 1;
  if (count <= 56) return 2;
  return 3;
}

export function biblioDocumentColumns(count: number) {
  if (count <= 18) return 1;
  if (count <= 54) return 2;
  if (count <= 140) return 3;
  return 4;
}

function gridSize(
  count: number,
  cols: number,
  cardW: number,
  cardH: number,
  gapX: number,
  gapY: number,
) {
  if (count <= 0) {
    return { width: 0, height: 0, cols: 1, rows: 0 };
  }
  const columns = Math.max(1, cols);
  const rows = Math.ceil(count / columns);
  return {
    width: columns * cardW + (columns - 1) * gapX,
    height: rows * cardH + (rows - 1) * gapY,
    cols: columns,
    rows,
  };
}

function nudgeClear(
  block: GraphLayoutBox,
  occupied: GraphLayoutBox[],
  direction: "left" | "right",
) {
  const pad = BIBLIO_LAYOUT_PADDING;
  let next = { ...block };
  let guard = 0;
  while (occupied.some((box) => boxesOverlap(next, box, pad)) && guard < 400) {
    next = {
      ...next,
      x: next.x + (direction === "right" ? GRAPH_CARD_WIDTH : -GRAPH_CARD_WIDTH),
    };
    guard += 1;
  }
  return next;
}

export function layoutAuthorsLeftDocumentsRight(options: {
  occupied: GraphLayoutBox[];
  authorCount: number;
  documentCount: number;
}) {
  const authorGrid = gridSize(
    options.authorCount,
    biblioAuthorColumns(options.authorCount),
    BIBLIO_AUTHOR_WIDTH,
    BIBLIO_AUTHOR_HEIGHT,
    BIBLIO_LAYOUT_GAP_X,
    BIBLIO_LAYOUT_GAP_Y,
  );
  const documentGrid = gridSize(
    options.documentCount,
    biblioDocumentColumns(options.documentCount),
    BIBLIO_DOC_WIDTH,
    BIBLIO_DOC_HEIGHT,
    BIBLIO_LAYOUT_GAP_X,
    BIBLIO_LAYOUT_GAP_Y,
  );
  const occupiedUnion = unionLayoutBox(options.occupied);
  const pad = BIBLIO_LAYOUT_PADDING;

  let authorOrigin = { x: 80, y: 80 };
  let documentOrigin = {
    x: 80 + authorGrid.width + (authorGrid.width > 0 ? pad : 0),
    y: 80,
  };

  if (occupiedUnion) {
    authorOrigin = {
      x: occupiedUnion.x - pad - authorGrid.width,
      y: occupiedUnion.y,
    };
    documentOrigin = {
      x: occupiedUnion.x + occupiedUnion.width + pad,
      y: occupiedUnion.y,
    };
  }

  const authorBlock = nudgeClear(
    {
      x: authorOrigin.x,
      y: authorOrigin.y,
      width: Math.max(authorGrid.width, BIBLIO_AUTHOR_WIDTH),
      height: Math.max(authorGrid.height, BIBLIO_AUTHOR_HEIGHT),
    },
    options.occupied,
    "left",
  );
  const documentBlock = nudgeClear(
    {
      x: documentOrigin.x,
      y: documentOrigin.y,
      width: Math.max(documentGrid.width, BIBLIO_DOC_WIDTH),
      height: Math.max(documentGrid.height, BIBLIO_DOC_HEIGHT),
    },
    options.occupied,
    "right",
  );

  return {
    authorAt(index: number) {
      const cols = authorGrid.cols;
      return {
        x: authorBlock.x + (index % cols) * (BIBLIO_AUTHOR_WIDTH + BIBLIO_LAYOUT_GAP_X),
        y:
          authorBlock.y +
          Math.floor(index / cols) * (BIBLIO_AUTHOR_HEIGHT + BIBLIO_LAYOUT_GAP_Y),
      };
    },
    documentAt(index: number) {
      const cols = documentGrid.cols;
      return {
        x:
          documentBlock.x +
          (index % cols) * (BIBLIO_DOC_WIDTH + BIBLIO_LAYOUT_GAP_X),
        y:
          documentBlock.y +
          Math.floor(index / cols) * (BIBLIO_DOC_HEIGHT + BIBLIO_LAYOUT_GAP_Y),
      };
    },
  };
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

const KNOWLEDGE_ALIASES: Array<{ title: string; aliases: string[] }> = [
  { title: "大三巴", aliases: ["st. paul", "ruins of st. paul", "madre de deus"] },
  {
    title: "澳门历史城区",
    aliases: ["historic centre of macao", "historic center of macao", "historic centre of macau"],
  },
  { title: "大炮台", aliases: ["monte fort", "mount fortress", "fortaleza do monte"] },
  { title: "议事亭前地", aliases: ["senado square", "largo do senado"] },
  { title: "妈阁", aliases: ["a-ma temple", "templo de a-ma"] },
  { title: "东望洋", aliases: ["guia fortress", "guia lighthouse"] },
];

export function matchingKnowledgeIds(
  paper: { title: string; subtitle: string; tags: string[] },
  knowledge: Array<{ id: string; title: string; tags: string[] }>,
) {
  const hay = normalizeMatchText(
    `${paper.title} ${paper.subtitle} ${paper.tags.join(" ")}`,
  );
  const hits: string[] = [];
  for (const node of knowledge) {
    const labels = [node.title, ...node.tags]
      .map((item) => item.trim())
      .filter((item) => item.length >= 4);
    const aliasHit = KNOWLEDGE_ALIASES.some(
      (entry) =>
        (node.title.includes(entry.title) ||
          node.tags.some((tag) => tag.includes(entry.title))) &&
        entry.aliases.some((alias) => hay.includes(alias)),
    );
    const titleHit = labels.some((label) => hay.includes(normalizeMatchText(label)));
    if (aliasHit || titleHit) hits.push(node.id);
    if (hits.length >= 2) break;
  }
  return hits;
}

export function applyBiblioArrange<
  T extends {
    id: string;
    kind: string;
    title: string;
    subtitle: string;
    period: string;
    tags: string[];
    summary: string;
    x: number;
    y: number;
  },
>(
  nodes: T[],
  extraOccupied: GraphLayoutBox[] = [],
  relations: Array<{ source: string; target: string; type: string }> = [],
): T[] {
  const migrated = nodes.map((node) => migrateBiblioAuthorNode(node));
  const degree = new Map<string, number>();
  for (const relation of relations) {
    if (relation.type !== "著") continue;
    degree.set(relation.source, (degree.get(relation.source) ?? 0) + 1);
  }
  const authors = migrated
    .filter((node) => isBiblioAuthorNode(node))
    .sort((a, b) => {
      const delta = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
      if (delta !== 0) return delta;
      return a.title.localeCompare(b.title, "en");
    });
  const documents = migrated
    .filter((node) => isBiblioDocumentNode(node))
    .sort((a, b) => {
      const yearA = Number.parseInt(a.period, 10);
      const yearB = Number.parseInt(b.period, 10);
      const validA = Number.isFinite(yearA);
      const validB = Number.isFinite(yearB);
      if (validA && validB && yearB !== yearA) return yearB - yearA;
      if (validB !== validA) return validB ? 1 : -1;
      return a.title.localeCompare(b.title, "en");
    });
  if (authors.length === 0 && documents.length === 0) return migrated;
  const moving = new Set([...authors, ...documents].map((node) => node.id));
  const occupied = [
    ...migrated.filter((node) => !moving.has(node.id)).map(nodeLayoutBox),
    ...extraOccupied,
  ];
  const layout = layoutAuthorsLeftDocumentsRight({
    occupied,
    authorCount: authors.length,
    documentCount: documents.length,
  });
  const authorPos = new Map(
    authors.map((node, index) => [node.id, layout.authorAt(index)]),
  );
  const documentPos = new Map(
    documents.map((node, index) => [node.id, layout.documentAt(index)]),
  );
  return migrated.map((node) => {
    const pos = authorPos.get(node.id) ?? documentPos.get(node.id);
    if (!pos) return node;
    const compactSummary =
      node.summary.length > 96
        ? [node.subtitle, node.period].filter(Boolean).join(" · ") || "计量题录"
        : node.summary;
    return { ...node, ...pos, summary: compactSummary };
  });
}
