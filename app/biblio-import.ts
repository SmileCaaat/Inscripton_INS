import {
  nowIso,
  normalizeDoi,
  type BiblioRecord,
  type BiblioSource,
} from "./biblio-types";

export type ParseBiblioResult = {
  records: BiblioRecord[];
  skipped: number;
  error?: string;
};

const TITLE_HEADER = /^(title|ti|题名|篇名|文献题名|标题)$/i;
const YEAR_HEADER = /^(year|py|publication_year|年份|年)$/i;
const AUTHOR_HEADER = /^(author|authors|au|作者)$/i;
const DOI_HEADER = /^(doi)$/i;
const VENUE_HEADER = /^(journal|venue|source|jo|jf|期刊|来源)$/i;
const KEYWORD_HEADER = /^(keyword|keywords|kw|关键词|主题词)$/i;
const CITED_HEADER = /^(cited|citations|cited_by|被引|被引次数)$/i;
const ABSTRACT_HEADER = /^(abstract|ab|摘要)$/i;
const TYPE_HEADER = /^(type|ty|类型)$/i;

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === "," || char === "\t") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], pattern: RegExp) {
  return headers.findIndex((header) => pattern.test(header.trim()));
}

function splitAuthors(value: string) {
  return value
    .split(/\s+and\s+|;\s*|\s*\|\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitKeywords(value: string) {
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseYearValue(value: string) {
  const match = value.match(/(1[5-9]\d{2}|20\d{2}|2100)/);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

function makeRecord(
  source: BiblioSource,
  fields: {
    title?: string;
    year?: number;
    type?: string;
    doi?: string;
    authors?: string[];
    venue?: string;
    keywords?: string[];
    citedBy?: number;
    abstract?: string;
    url?: string;
  },
): BiblioRecord | null {
  const title = fields.title?.trim();
  if (!title) return null;
  const doi = fields.doi ? normalizeDoi(fields.doi) : undefined;
  return {
    id:
      doi
        ? `doi:${doi}`
        : `${source}-${title.slice(0, 48)}-${fields.year ?? "na"}`.replace(/\s+/g, "_"),
    title,
    year: fields.year,
    type: fields.type?.trim() || undefined,
    doi,
    authors: fields.authors ?? [],
    venue: fields.venue?.trim() || undefined,
    keywords: fields.keywords ?? [],
    citedBy: fields.citedBy ?? 0,
    referencedWorks: [],
    abstract: fields.abstract?.trim() || undefined,
    url: fields.url,
    source,
    importedAt: nowIso(),
  };
}

function parseCsv(text: string): ParseBiblioResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (lines.length < 2) {
    return { records: [], skipped: 0, error: "CSV 至少需要表头和一行题录。" };
  }
  const headers = splitCsvLine(lines[0]);
  const titleAt = headerIndex(headers, TITLE_HEADER);
  if (titleAt < 0) {
    return { records: [], skipped: 0, error: "CSV 缺少题名列（title / 题名）。" };
  }
  const yearAt = headerIndex(headers, YEAR_HEADER);
  const authorAt = headerIndex(headers, AUTHOR_HEADER);
  const doiAt = headerIndex(headers, DOI_HEADER);
  const venueAt = headerIndex(headers, VENUE_HEADER);
  const keywordAt = headerIndex(headers, KEYWORD_HEADER);
  const citedAt = headerIndex(headers, CITED_HEADER);
  const abstractAt = headerIndex(headers, ABSTRACT_HEADER);
  const typeAt = headerIndex(headers, TYPE_HEADER);

  const records: BiblioRecord[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const citedRaw = citedAt >= 0 ? Number.parseInt(cells[citedAt] ?? "", 10) : NaN;
    const record = makeRecord("csv", {
      title: cells[titleAt],
      year: yearAt >= 0 ? parseYearValue(cells[yearAt] ?? "") : undefined,
      type: typeAt >= 0 ? cells[typeAt] : undefined,
      doi: doiAt >= 0 ? cells[doiAt] : undefined,
      authors: authorAt >= 0 ? splitAuthors(cells[authorAt] ?? "") : [],
      venue: venueAt >= 0 ? cells[venueAt] : undefined,
      keywords: keywordAt >= 0 ? splitKeywords(cells[keywordAt] ?? "") : [],
      citedBy: Number.isFinite(citedRaw) ? citedRaw : 0,
      abstract: abstractAt >= 0 ? cells[abstractAt] : undefined,
    });
    if (record) records.push(record);
    else skipped += 1;
  }
  return { records, skipped };
}

function risTag(line: string) {
  const match = line.match(/^([A-Z0-9]{2})\s{1,2}-\s?(.*)$/);
  if (!match) return null;
  return { tag: match[1], value: match[2].trim() };
}

function parseRis(text: string): ParseBiblioResult {
  const chunks = text.replace(/^\uFEFF/, "").split(/\nER\s{1,2}-/);
  const records: BiblioRecord[] = [];
  let skipped = 0;
  for (const chunk of chunks) {
    const authors: string[] = [];
    const keywords: string[] = [];
    let title = "";
    let year: number | undefined;
    let type = "";
    let doi = "";
    let venue = "";
    let abstract = "";
    let url = "";
    for (const raw of chunk.split(/\r?\n/)) {
      const parsed = risTag(raw.trim());
      if (!parsed) continue;
      if (parsed.tag === "TY") type = parsed.value;
      if (parsed.tag === "TI" || parsed.tag === "T1") title = parsed.value || title;
      if (parsed.tag === "AU" || parsed.tag === "A1") authors.push(parsed.value);
      if (parsed.tag === "PY" || parsed.tag === "Y1") year = parseYearValue(parsed.value) ?? year;
      if (parsed.tag === "JO" || parsed.tag === "JF" || parsed.tag === "T2") {
        venue = parsed.value || venue;
      }
      if (parsed.tag === "KW") keywords.push(parsed.value);
      if (parsed.tag === "DO") doi = parsed.value;
      if (parsed.tag === "AB" || parsed.tag === "N2") abstract = parsed.value || abstract;
      if (parsed.tag === "UR") url = parsed.value;
    }
    const record = makeRecord("ris", {
      title,
      year,
      type,
      doi,
      authors,
      venue,
      keywords: keywords.slice(0, 12),
      abstract,
      url,
    });
    if (record) records.push(record);
    else if (chunk.trim()) skipped += 1;
  }
  return { records, skipped };
}

function readBibValue(text: string, start: number) {
  const trimmedStart = text.slice(start).search(/\S/);
  if (trimmedStart < 0) return { value: "", end: text.length };
  const index = start + trimmedStart;
  const opener = text[index];
  if (opener === "{") {
    let depth = 1;
    let cursor = index + 1;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === "{") depth += 1;
      else if (text[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    return { value: text.slice(index + 1, cursor - 1).trim(), end: cursor };
  }
  if (opener === '"') {
    let cursor = index + 1;
    while (cursor < text.length && text[cursor] !== '"') {
      if (text[cursor] === "\\") cursor += 1;
      cursor += 1;
    }
    return { value: text.slice(index + 1, cursor).trim(), end: cursor + 1 };
  }
  const end = text.slice(index).search(/[,\n}]/);
  const stop = end < 0 ? text.length : index + end;
  return { value: text.slice(index, stop).trim(), end: stop };
}

function parseBibtex(text: string): ParseBiblioResult {
  const records: BiblioRecord[] = [];
  let skipped = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf("@", cursor);
    if (at < 0) break;
    const brace = text.indexOf("{", at);
    if (brace < 0) break;
    const type = text.slice(at + 1, brace).trim().toLowerCase();
    if (type === "comment" || type === "string" || type === "preamble") {
      cursor = brace + 1;
      continue;
    }
    const comma = text.indexOf(",", brace);
    if (comma < 0) break;
    const fields: Record<string, string> = {};
    let index = comma + 1;
    while (index < text.length) {
      while (index < text.length && /[\s,]/.test(text[index])) index += 1;
      if (text[index] === "}") {
        index += 1;
        break;
      }
      const equals = text.indexOf("=", index);
      if (equals < 0) break;
      const name = text.slice(index, equals).trim().toLowerCase();
      const parsed = readBibValue(text, equals + 1);
      fields[name] = parsed.value.replace(/\s+/g, " ");
      index = parsed.end;
    }
    const record = makeRecord("bibtex", {
      title: fields.title,
      year: fields.year ? parseYearValue(fields.year) : undefined,
      type,
      doi: fields.doi,
      authors: fields.author ? splitAuthors(fields.author) : [],
      venue: fields.journal || fields.booktitle || fields.publisher,
      keywords: fields.keywords ? splitKeywords(fields.keywords) : [],
      abstract: fields.abstract,
      url: fields.url,
    });
    if (record) records.push(record);
    else skipped += 1;
    cursor = index;
  }
  return { records, skipped };
}

export function parseBiblioText(fileName: string, text: string): ParseBiblioResult {
  const name = fileName.toLowerCase();
  const sample = text.slice(0, 400).trim();
  if (name.endsWith(".ris") || /^TY\s{1,2}-/m.test(sample)) {
    return parseRis(text);
  }
  if (name.endsWith(".bib") || /^@\w+\s*\{/m.test(sample)) {
    return parseBibtex(text);
  }
  return parseCsv(text);
}

export async function parseBiblioFile(file: File): Promise<ParseBiblioResult> {
  const text = await file.text();
  if (!text.trim()) {
    return { records: [], skipped: 0, error: "这个文件是空的。" };
  }
  const parsed = parseBiblioText(file.name, text);
  if (!parsed.error && parsed.records.length === 0) {
    return {
      ...parsed,
      error: "没有读到题录。请确认是 CSV、RIS 或 BibTeX，并带有题名。",
    };
  }
  return parsed;
}
