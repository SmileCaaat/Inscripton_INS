import type { LngLat } from "./geo";

export const MAP_YEAR_MIN = 1480;
export const MAP_YEAR_MAX = 2026;
export const TRIP_DURATION = 28;

export type InscriptionKind = "time" | "space" | "image" | "practice";

export type HeatMark = {
  position: LngLat;
  weight: number;
  yearFrom: number;
  yearTo: number;
};

export type PracticeTrip = {
  id: string;
  name: string;
  inscription: InscriptionKind;
  path: LngLat[];
  timestamps: number[];
  color: [number, number, number];
  yearFrom: number;
  yearTo: number;
};

const AMA: LngLat = [113.53118, 22.18612];
const SENADO: LngLat = [113.53948, 22.19364];
const ST_JOSEPH: LngLat = [113.53858, 22.19228];
const RUINS: LngLat = [113.54072, 22.19756];
const FACADE: LngLat = [113.54086, 22.19738];
const MONTE: LngLat = [113.54245, 22.19728];
const GUIA: LngLat = [113.54972, 22.19661];
const UNESCO: LngLat = [113.54035, 22.19415];

/** WGS84 闭环 [经度, 纬度]。地图用 PolygonLayer 按节点 geo.polygon 画出这些框，不是底图自带的。 */
export const HISTORIC_CENTRE_RING: LngLat[] = [
  [113.53055, 22.18555],
  [113.53135, 22.18515],
  [113.53215, 22.18575],
  [113.53305, 22.18685],
  [113.53395, 22.18795],
  [113.53485, 22.18895],
  [113.53575, 22.18985],
  [113.53685, 22.19085],
  [113.53775, 22.19175],
  [113.53845, 22.19245],
  [113.53875, 22.19315],
  [113.53885, 22.19375],
  [113.53935, 22.19445],
  [113.53975, 22.19535],
  [113.54015, 22.19635],
  [113.54025, 22.19715],
  [113.54085, 22.19785],
  [113.54185, 22.19795],
  [113.54265, 22.19775],
  [113.54285, 22.19715],
  [113.54215, 22.19665],
  [113.54125, 22.19605],
  [113.54075, 22.19515],
  [113.54055, 22.19425],
  [113.54035, 22.19345],
  [113.53985, 22.19255],
  [113.53915, 22.19165],
  [113.53815, 22.19075],
  [113.53705, 22.18985],
  [113.53595, 22.18885],
  [113.53475, 22.18775],
  [113.53345, 22.18665],
  [113.53225, 22.18595],
  [113.53115, 22.18565],
  [113.53055, 22.18555],
];

export const GUIA_ZONE_RING: LngLat[] = [
  [113.54905, 22.19605],
  [113.55035, 22.196],
  [113.5505, 22.19715],
  [113.5492, 22.1972],
  [113.54905, 22.19605],
];

export const RUINS_PRECINCT_RING: LngLat[] = [
  [113.54035, 22.19685],
  [113.54115, 22.1969],
  [113.54125, 22.19755],
  [113.54055, 22.19775],
  [113.54025, 22.19735],
  [113.54035, 22.19685],
];

export const SENADO_SQUARE_RING: LngLat[] = [
  [113.53915, 22.19335],
  [113.53985, 22.19328],
  [113.53995, 22.19385],
  [113.53925, 22.19392],
  [113.53915, 22.19335],
];

function hash(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

function cluster(
  seed: number,
  center: LngLat,
  count: number,
  spread: number,
  weight: number,
  yearFrom: number,
  yearTo: number,
): HeatMark[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = hash(seed + index * 3) * Math.PI * 2;
    const radius = spread * Math.sqrt(hash(seed + index * 11 + 1));
    return {
      position: [
        center[0] + Math.cos(angle) * radius,
        center[1] + (Math.sin(angle) * radius) / 1.15,
      ],
      weight,
      yearFrom,
      yearTo,
    };
  });
}

export const SAMPLE_HEAT_MARKS: HeatMark[] = [
  ...cluster(1, RUINS, 10, 0.00055, 1.2, 1602, 2026),
  ...cluster(2, FACADE, 4, 0.00022, 1, 1640, 2026),
  ...cluster(3, SENADO, 8, 0.00045, 1.1, 1557, 2026),
  ...cluster(4, AMA, 6, 0.0004, 1.2, 1488, 2026),
  ...cluster(5, ST_JOSEPH, 4, 0.00028, 0.8, 1728, 2026),
  ...cluster(6, GUIA, 4, 0.00028, 0.7, 1622, 2026),
  ...cluster(7, MONTE, 3, 0.00022, 0.6, 1617, 2026),
  ...cluster(8, RUINS, 6, 0.0004, 1.8, 1835, 1840),
  ...cluster(9, UNESCO, 4, 0.0005, 1.3, 2005, 2026),
];

export const SAMPLE_TRIPS: PracticeTrip[] = [
  {
    id: "trip-axis",
    name: "妈阁—议事亭—大三巴",
    inscription: "practice",
    path: [AMA, SENADO, ST_JOSEPH, RUINS],
    timestamps: [0, 8, 14, 24],
    color: [127, 63, 46],
    yearFrom: 1557,
    yearTo: 2026,
  },
  {
    id: "trip-jesuit",
    name: "修院—学院—炮台",
    inscription: "practice",
    path: [ST_JOSEPH, RUINS, MONTE],
    timestamps: [2, 12, 20],
    color: [49, 92, 75],
    yearFrom: 1728,
    yearTo: 1835,
  },
  {
    id: "trip-view",
    name: "东望洋眺望大三巴",
    inscription: "space",
    path: [GUIA, RUINS],
    timestamps: [4, 16],
    color: [68, 90, 120],
    yearFrom: 1622,
    yearTo: 2026,
  },
  {
    id: "trip-heritage",
    name: "遗产构成巡径",
    inscription: "time",
    path: [AMA, SENADO, RUINS, GUIA],
    timestamps: [0, 7, 15, 26],
    color: [154, 100, 30],
    yearFrom: 2005,
    yearTo: 2026,
  },
];

export const SAMPLE_NODE_YEARS: Record<string, { yearFrom: number; yearTo: number }> = {
  "space-ruins": { yearFrom: 1565, yearTo: 2026 },
  "event-fire": { yearFrom: 1835, yearTo: 1835 },
  "document-macau": { yearFrom: 1751, yearTo: 1751 },
  "person-jesuit": { yearFrom: 1565, yearTo: 1762 },
  "artifact-facade": { yearFrom: 1602, yearTo: 2026 },
  "space-monte": { yearFrom: 1617, yearTo: 2026 },
  "space-senado": { yearFrom: 1557, yearTo: 2026 },
  "space-stjoseph": { yearFrom: 1728, yearTo: 2026 },
  "space-ama": { yearFrom: 1488, yearTo: 2026 },
  "space-guia": { yearFrom: 1622, yearTo: 2026 },
  "event-unesco": { yearFrom: 2005, yearTo: 2026 },
  "space-historic-centre": { yearFrom: 1557, yearTo: 2026 },
  "space-ruins-precinct": { yearFrom: 1602, yearTo: 2026 },
  "media-ortho": { yearFrom: 2019, yearTo: 2026 },
  "media-print": { yearFrom: 1836, yearTo: 1900 },
};
