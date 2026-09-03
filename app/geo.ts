export type LngLat = [number, number];

export type StudioMapGeo = {
  longitude?: number;
  latitude?: number;
  confidence?: number;
  polygon?: LngLat[];
};

export function hasMapLocation(
  geo: StudioMapGeo | undefined,
): geo is { longitude: number; latitude: number; confidence?: number } {
  return (
    geo != null &&
    Number.isFinite(geo.longitude) &&
    Number.isFinite(geo.latitude)
  );
}

export function hasMapPolygon(
  geo: StudioMapGeo | undefined,
): geo is StudioMapGeo & { polygon: LngLat[] } {
  return geo?.polygon != null && geo.polygon.length >= 4;
}

export function parseCoordinate(value: string) {
  const next = Number.parseFloat(value.trim());
  return Number.isFinite(next) ? next : undefined;
}

export function parseYear(value: string) {
  const next = Number.parseInt(value.trim(), 10);
  return Number.isFinite(next) ? next : undefined;
}

export function yearsOverlap(
  yearFrom: number | undefined,
  yearTo: number | undefined,
  rangeFrom: number,
  rangeTo: number,
) {
  const start = yearFrom ?? Number.NEGATIVE_INFINITY;
  const end = yearTo ?? Number.POSITIVE_INFINITY;
  return start <= rangeTo && end >= rangeFrom;
}
