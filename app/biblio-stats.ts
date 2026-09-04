import type { BiblioRecord, BiblioStatRow } from "./biblio-types";

const STOPWORDS = new Set(
  [
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "onto",
    "over",
    "under",
    "between",
    "among",
    "using",
    "based",
    "study",
    "analysis",
    "new",
    "case",
  ].map((word) => word.toLowerCase()),
);

function countMap(values: string[]) {
  const counts = new Map<string, { label: string; value: number }>();
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const current = counts.get(key);
    if (current) current.value += 1;
    else counts.set(key, { label, value: 1 });
  }
  return [...counts.values()].sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

export function yearlyCounts(records: BiblioRecord[]): BiblioStatRow[] {
  return countMap(
    records
      .map((record) => record.year)
      .filter((year): year is number => Number.isFinite(year))
      .map((year) => String(year)),
  ).sort((left, right) => Number(left.label) - Number(right.label));
}

export function topAuthors(records: BiblioRecord[], limit = 20): BiblioStatRow[] {
  return countMap(records.flatMap((record) => record.authors)).slice(0, limit);
}

export function coreVenues(records: BiblioRecord[], limit = 20): BiblioStatRow[] {
  return countMap(
    records.map((record) => record.venue).filter((venue): venue is string => Boolean(venue)),
  ).slice(0, limit);
}

export function highlyCited(records: BiblioRecord[], limit = 20) {
  return [...records]
    .sort((left, right) => right.citedBy - left.citedBy || (right.year ?? 0) - (left.year ?? 0))
    .slice(0, limit);
}

function titleTerms(title: string) {
  return title
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word.toLowerCase()));
}

export function termFrequency(records: BiblioRecord[], limit = 30): BiblioStatRow[] {
  const keywords = records.flatMap((record) => record.keywords);
  if (keywords.length >= 8) return countMap(keywords).slice(0, limit);
  return countMap(records.flatMap((record) => titleTerms(record.title))).slice(0, limit);
}
