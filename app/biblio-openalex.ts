import {
  BIBLIO_CORPUS_LIMIT,
  nowIso,
  normalizeDoi,
  type BiblioRecord,
} from "./biblio-types";

export const OPENALEX_KEY_STORAGE = "inscription-openalex-key-v1";
export const OPENALEX_MAILTO_STORAGE = "inscription-openalex-mailto-v1";
export const OPENALEX_KEY_URL = "https://openalex.org/settings/api";
export const OPENALEX_WORKS_URL = "https://api.openalex.org/works";

const SELECT_FIELDS = [
  "id",
  "doi",
  "display_name",
  "publication_year",
  "type",
  "cited_by_count",
  "authorships",
  "primary_location",
  "keywords",
  "concepts",
  "referenced_works",
  "abstract_inverted_index",
  "language",
].join(",");

export type OpenAlexSearchQuery = {
  search: string;
  yearFrom?: string;
  yearTo?: string;
  type?: string;
  minCited?: string;
  apiKey?: string;
  mailto?: string;
  maxRecords?: number;
};

export type OpenAlexSearchResult = {
  records: BiblioRecord[];
  total: number;
};

type OpenAlexAuthorship = {
  author?: { display_name?: string };
};

type OpenAlexKeyword = {
  display_name?: string;
  score?: number;
};

type OpenAlexWork = {
  id?: string;
  doi?: string;
  display_name?: string;
  publication_year?: number;
  type?: string;
  cited_by_count?: number;
  authorships?: OpenAlexAuthorship[];
  primary_location?: { source?: { display_name?: string } };
  keywords?: OpenAlexKeyword[];
  concepts?: OpenAlexKeyword[];
  referenced_works?: string[];
  abstract_inverted_index?: Record<string, number[]>;
  language?: string;
};

type OpenAlexResponse = {
  meta?: { count?: number; next_cursor?: string | null };
  results?: OpenAlexWork[];
  error?: string;
  message?: string;
};

const PAGE_SIZE = 100;

export function reconstructAbstract(index?: Record<string, number[]> | null) {
  if (!index) return "";
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0) {
        slots[position] = word;
      }
    }
  }
  return slots.filter(Boolean).join(" ").trim();
}

function cleanText(value?: string) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
}

function uniqueNames(values: Array<string | undefined>) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = cleanText(value);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function workToRecord(work: OpenAlexWork): BiblioRecord | null {
  const title = cleanText(work.display_name);
  if (!title) return null;
  const doi = work.doi ? normalizeDoi(work.doi) : undefined;
  const keywords = uniqueNames([
    ...(work.keywords ?? []).map((item) => item.display_name),
    ...(work.concepts ?? [])
      .filter((item) => (item.score ?? 0) >= 0.45)
      .map((item) => item.display_name),
  ]).slice(0, 12);
  return {
    id: work.id?.trim() || `openalex-${crypto.randomUUID()}`,
    title,
    year: work.publication_year,
    type: work.type,
    doi,
    authors: uniqueNames((work.authorships ?? []).map((item) => item.author?.display_name)),
    venue: cleanText(work.primary_location?.source?.display_name) || undefined,
    keywords,
    citedBy: work.cited_by_count ?? 0,
    referencedWorks: (work.referenced_works ?? []).filter(Boolean),
    abstract: reconstructAbstract(work.abstract_inverted_index) || undefined,
    language: work.language,
    url: work.id,
    source: "openalex",
    importedAt: nowIso(),
  };
}

function buildFilter(query: OpenAlexSearchQuery) {
  const filters: string[] = [];
  const yearFrom = Number.parseInt(query.yearFrom ?? "", 10);
  const yearTo = Number.parseInt(query.yearTo ?? "", 10);
  if (Number.isFinite(yearFrom) && Number.isFinite(yearTo)) {
    const start = Math.min(yearFrom, yearTo);
    const end = Math.max(yearFrom, yearTo);
    filters.push(`publication_year:${start}-${end}`);
  } else if (Number.isFinite(yearFrom)) {
    filters.push(`from_publication_date:${yearFrom}-01-01`);
  } else if (Number.isFinite(yearTo)) {
    filters.push(`to_publication_date:${yearTo}-12-31`);
  }
  if (query.type) filters.push(`type:${query.type}`);
  const minCited = Number.parseInt(query.minCited ?? "", 10);
  if (Number.isFinite(minCited) && minCited > 0) {
    filters.push(`cited_by_count:>${minCited - 1}`);
  }
  return filters.join(",");
}

async function fetchOpenAlexPage(
  url: URL,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<OpenAlexResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("连不上 OpenAlex。检索需要上网；已缓存的题录仍可离线查看。");
  }

  let payload: OpenAlexResponse = {};
  try {
    payload = (await response.json()) as OpenAlexResponse;
  } catch {
    payload = {};
  }

  if (response.status === 429) {
    throw new Error("OpenAlex 限流了。填写本机 Key 后额度大约高 10 倍，或稍后再试。");
  }
  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || `OpenAlex 返回 ${response.status}，请检查检索条件或 Key。`,
    );
  }
  return payload;
}

export async function searchOpenAlex(
  query: OpenAlexSearchQuery,
  signal?: AbortSignal,
): Promise<OpenAlexSearchResult> {
  const search = query.search.trim();
  if (!search) {
    throw new Error("请先填写检索词。题名与摘要保持原文，界面只用简体中文。");
  }

  const apiKey = query.apiKey?.trim();
  const mailto = query.mailto?.trim();
  const filter = buildFilter(query);
  const maxRecords = Math.min(
    Math.max(query.maxRecords ?? BIBLIO_CORPUS_LIMIT, PAGE_SIZE),
    BIBLIO_CORPUS_LIMIT,
  );
  const records: BiblioRecord[] = [];
  let total = 0;
  let page = 1;
  const maxPages = Math.ceil(maxRecords / PAGE_SIZE);

  while (page <= maxPages && records.length < maxRecords) {
    const url = new URL(OPENALEX_WORKS_URL);
    url.searchParams.set("search", search);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("select", SELECT_FIELDS);
    if (filter) url.searchParams.set("filter", filter);
    if (apiKey) url.searchParams.set("api_key", apiKey);
    if (mailto) url.searchParams.set("mailto", mailto);

    const payload = await fetchOpenAlexPage(url, apiKey, signal);
    total = payload.meta?.count ?? total;
    const batch = (payload.results ?? [])
      .map(workToRecord)
      .filter((record): record is BiblioRecord => record !== null);
    if (batch.length === 0) break;
    records.push(...batch);
    if (records.length >= total || batch.length < PAGE_SIZE) break;
    page += 1;
  }

  return {
    records: records.slice(0, maxRecords),
    total,
  };
}

export function loadOpenAlexKey() {
  try {
    return window.localStorage.getItem(OPENALEX_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveOpenAlexKey(value: string) {
  try {
    if (value.trim()) {
      window.localStorage.setItem(OPENALEX_KEY_STORAGE, value.trim());
    } else {
      window.localStorage.removeItem(OPENALEX_KEY_STORAGE);
    }
  } catch {
    // Key stays in memory for this session if storage is blocked.
  }
}

export function loadOpenAlexMailto() {
  try {
    return window.localStorage.getItem(OPENALEX_MAILTO_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveOpenAlexMailto(value: string) {
  try {
    if (value.trim()) {
      window.localStorage.setItem(OPENALEX_MAILTO_STORAGE, value.trim());
    } else {
      window.localStorage.removeItem(OPENALEX_MAILTO_STORAGE);
    }
  } catch {
    // Mailto stays in memory for this session if storage is blocked.
  }
}
