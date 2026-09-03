export type LngLat = [number, number];

export type StudioMapGeo = {
  longitude?: number;
  latitude?: number;
  confidence?: number;
  polygon?: LngLat[];
};

export function isValidLngLat(lng: number, lat: number) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

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

export function closeRing(ring: LngLat[]): LngLat[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

export function ringCentroid(ring: LngLat[]): LngLat {
  const points =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  if (points.length === 0) return [0, 0];
  let lng = 0;
  let lat = 0;
  for (const point of points) {
    lng += point[0];
    lat += point[1];
  }
  return [lng / points.length, lat / points.length];
}

export function boundsRing(
  west: number,
  south: number,
  east: number,
  north: number,
): LngLat[] {
  return closeRing([
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ]);
}

export function geoFromPoint(lng: number, lat: number, confidence = 1): StudioMapGeo {
  return { longitude: lng, latitude: lat, confidence };
}

export function geoFromRing(ring: LngLat[], confidence = 1): StudioMapGeo {
  const polygon = closeRing(ring);
  const [longitude, latitude] = ringCentroid(polygon);
  return { longitude, latitude, polygon, confidence };
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
