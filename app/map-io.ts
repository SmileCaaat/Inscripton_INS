import {
  geoFromPoint,
  geoFromRing,
  hasMapLocation,
  hasMapPolygon,
  isValidLngLat,
  parseYear,
  type LngLat,
  type StudioMapGeo,
} from "./geo";

export type MapPlaceDraft = {
  title: string;
  summary?: string;
  geo: StudioMapGeo;
  yearFrom?: number;
  yearTo?: number;
};

export type ParsePlacesResult = {
  places: MapPlaceDraft[];
  skipped: number;
  error?: string;
};

export const MAP_IMPORT_LIMIT = 200;

const LNG_HEADER = /^(lng|lon|long|longitude|x|经度|经)$/i;
const LAT_HEADER = /^(lat|latitude|y|纬度|纬)$/i;
const TITLE_HEADER = /^(name|title|label|地点|地名|名称|标题)$/i;
const YEAR_FROM_HEADER = /^(yearfrom|year_from|from|start|year|年|起年|始年)$/i;
const YEAR_TO_HEADER = /^(yearto|year_to|to|end|迄年|止年)$/i;

type MapExportNode = {
  id: string;
  kind: string;
  title: string;
  period: string;
  geo?: StudioMapGeo;
  yearFrom?: number;
  yearTo?: number;
};

function headerIndex(headers: string[], pattern: RegExp) {
  return headers.findIndex((header) => pattern.test(header.trim()));
}

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

function parseCsvRows(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  return lines.map(splitCsvLine);
}

function titleFromProperties(properties: Record<string, unknown> | null, fallback: string) {
  if (!properties) return fallback;
  for (const key of ["name", "title", "名称", "地名", "label"]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function yearsFromProperties(properties: Record<string, unknown> | null) {
  if (!properties) return {};
  const fromRaw = properties.yearFrom ?? properties.year ?? properties["起年"] ?? properties["年"];
  const toRaw = properties.yearTo ?? properties["迄年"] ?? fromRaw;
  return {
    yearFrom: fromRaw == null ? undefined : parseYear(String(fromRaw)),
    yearTo: toRaw == null ? undefined : parseYear(String(toRaw)),
  };
}

function pairToLngLat(value: unknown): LngLat | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  return isValidLngLat(lng, lat) ? [lng, lat] : null;
}

function ringFromCoordinates(value: unknown): LngLat[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const ring: LngLat[] = [];
  for (const point of value) {
    const pair = pairToLngLat(point);
    if (!pair) return null;
    ring.push(pair);
  }
  return ring.length >= 3 ? ring : null;
}

function placeFromGeometry(
  geometry: { type?: string; coordinates?: unknown } | null,
  properties: Record<string, unknown> | null,
  fallbackTitle: string,
): MapPlaceDraft | null {
  if (!geometry?.type) return null;
  const title = titleFromProperties(properties, fallbackTitle);
  const years = yearsFromProperties(properties);
  if (geometry.type === "Point") {
    const point = pairToLngLat(geometry.coordinates);
    if (!point) return null;
    return { title, geo: geoFromPoint(point[0], point[1]), ...years };
  }
  if (geometry.type === "Polygon") {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const ring = ringFromCoordinates(rings[0]);
    if (!ring) return null;
    return { title, geo: geoFromRing(ring), ...years };
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const first = Array.isArray(polygons[0]) ? polygons[0] : null;
    const ring = ringFromCoordinates(first?.[0]);
    if (!ring) return null;
    return { title, geo: geoFromRing(ring), ...years };
  }
  return null;
}

export function parseCsvPlaces(text: string): ParsePlacesResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return { places: [], skipped: 0, error: "CSV 需要表头和至少一行数据" };
  }
  const headers = rows[0].map((header) => header.trim());
  const lngIndex = headerIndex(headers, LNG_HEADER);
  const latIndex = headerIndex(headers, LAT_HEADER);
  if (lngIndex < 0 || latIndex < 0) {
    return { places: [], skipped: 0, error: "CSV 需要经度 / 纬度列（longitude, latitude 或 经度, 纬度）" };
  }
  const titleIndex = headerIndex(headers, TITLE_HEADER);
  const yearFromIndex = headerIndex(headers, YEAR_FROM_HEADER);
  const yearToIndex = headerIndex(headers, YEAR_TO_HEADER);
  const places: MapPlaceDraft[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    if (places.length >= MAP_IMPORT_LIMIT) {
      skipped += 1;
      continue;
    }
    const lng = Number(row[lngIndex]);
    const lat = Number(row[latIndex]);
    if (!isValidLngLat(lng, lat)) {
      skipped += 1;
      continue;
    }
    const title =
      (titleIndex >= 0 ? row[titleIndex] : "")?.trim() || `导入地点 ${places.length + 1}`;
    places.push({
      title,
      geo: geoFromPoint(lng, lat),
      yearFrom: yearFromIndex >= 0 ? parseYear(row[yearFromIndex] ?? "") : undefined,
      yearTo:
        yearToIndex >= 0
          ? parseYear(row[yearToIndex] ?? "")
          : yearFromIndex >= 0
            ? parseYear(row[yearFromIndex] ?? "")
            : undefined,
    });
  }
  return { places, skipped };
}

export function parseGeoJsonPlaces(text: string): ParsePlacesResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { places: [], skipped: 0, error: "GeoJSON 不是合法 JSON" };
  }
  const document = parsed as {
    type?: string;
    features?: unknown[];
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
  };
  const features: Array<{
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
  }> = [];
  if (document.type === "FeatureCollection" && Array.isArray(document.features)) {
    for (const feature of document.features) {
      if (feature && typeof feature === "object") {
        features.push(feature as (typeof features)[number]);
      }
    }
  } else if (document.type === "Feature") {
    features.push(document);
  } else if (document.type === "Point" || document.type === "Polygon" || document.type === "MultiPolygon") {
    features.push({ geometry: document, properties: {} });
  } else {
    return { places: [], skipped: 0, error: "需要 GeoJSON Feature 或 FeatureCollection" };
  }
  const places: MapPlaceDraft[] = [];
  let skipped = 0;
  features.forEach((feature, index) => {
    if (places.length >= MAP_IMPORT_LIMIT) {
      skipped += 1;
      return;
    }
    const place = placeFromGeometry(
      feature.geometry ?? null,
      feature.properties ?? null,
      `导入范围 ${index + 1}`,
    );
    if (place) places.push(place);
    else skipped += 1;
  });
  return { places, skipped };
}

export function parseMapFile(fileName: string, text: string): ParsePlacesResult {
  const name = fileName.toLowerCase();
  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    return parseGeoJsonPlaces(text);
  }
  return parseCsvPlaces(text);
}

export function nodesToFeatureCollection(nodes: MapExportNode[]) {
  const features: Array<{
    type: "Feature";
    id: string;
    properties: Record<string, string | number | null>;
    geometry:
      | { type: "Point"; coordinates: number[] }
      | { type: "Polygon"; coordinates: LngLat[][] };
  }> = [];
  for (const node of nodes) {
    if (hasMapPolygon(node.geo)) {
      features.push({
        type: "Feature",
        id: node.id,
        properties: {
          id: node.id,
          title: node.title,
          kind: node.kind,
          period: node.period,
          yearFrom: node.yearFrom ?? null,
          yearTo: node.yearTo ?? null,
        },
        geometry: {
          type: "Polygon",
          coordinates: [node.geo.polygon],
        },
      });
      continue;
    }
    if (hasMapLocation(node.geo)) {
      features.push({
        type: "Feature",
        id: node.id,
        properties: {
          id: node.id,
          title: node.title,
          kind: node.kind,
          period: node.period,
          yearFrom: node.yearFrom ?? null,
          yearTo: node.yearTo ?? null,
          confidence: node.geo.confidence ?? null,
        },
        geometry: {
          type: "Point",
          coordinates: [node.geo.longitude, node.geo.latitude],
        },
      });
    }
  }
  return {
    type: "FeatureCollection" as const,
    features,
  };
}
