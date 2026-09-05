"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Map as MapLibreMap, useControl, type MapRef } from "react-map-gl/maplibre";
import type { Map as MapLibreGLMap } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import type { Layer } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  boundsRing,
  geoFromPoint,
  geoFromRing,
  hasMapLocation,
  hasMapPolygon,
  isValidLngLat,
  parseCoordinate,
  yearsOverlap,
  type LngLat,
  type StudioMapGeo,
} from "./geo";
import {
  nodesToFeatureCollection,
  parseMapFile,
  type MapPlaceDraft,
} from "./map-io";
import {
  MAP_YEAR_MAX,
  MAP_YEAR_MIN,
  SAMPLE_HEAT_MARKS,
  SAMPLE_TRIPS,
  TRIP_DURATION,
  type InscriptionKind,
} from "./sample-map-inscriptions";

export type StudioMapNode = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  period: string;
  color: string;
  geo?: StudioMapGeo;
  yearFrom?: number;
  yearTo?: number;
};

export type StudioMapRelation = {
  id: string;
  source: string;
  target: string;
  type: string;
};

type LocatedNode = StudioMapNode & {
  geo: { longitude: number; latitude: number; confidence?: number };
};

type PolygonNode = StudioMapNode & {
  geo: StudioMapGeo & { polygon: [number, number][] };
};

type MapArc = {
  id: string;
  type: string;
  source: LocatedNode;
  target: LocatedNode;
};

type HeatMarkLike = {
  position: [number, number];
  weight: number;
};

type PracticeTripLike = {
  path: [number, number][];
  timestamps: number[];
  color: [number, number, number];
};

type DrawMode = "select" | "point" | "box" | "polygon";
type NodeLabelMode = "none" | "selected" | "all";

type LayerToggles = {
  points: boolean;
  polygons: boolean;
  arcs: boolean;
  heat: boolean;
  trips: boolean;
};

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const MAP_PIXEL_RATIO =
  typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);

function setBasemapLabels(map: MapLibreGLMap, visible: boolean) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type === "symbol") {
      map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
    }
    if (layer.type === "fill-extrusion") {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

const INSCRIPTION_META: Array<{
  id: InscriptionKind;
  label: string;
  hint: string;
}> = [
  { id: "time", label: "时间", hint: "事件与年代" },
  { id: "space", label: "空间", hint: "地点与范围" },
  { id: "image", label: "图像", hint: "遗存与影像" },
  { id: "practice", label: "实践", hint: "热力与轨迹" },
];

const DRAW_MODES: Array<{ id: DrawMode; label: string }> = [
  { id: "select", label: "选择" },
  { id: "point", label: "画点" },
  { id: "box", label: "画框" },
  { id: "polygon", label: "画面" },
];

function pointInRing(lng: number, lat: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function ringArea(ring: [number, number][]) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area);
}

function makeTripsLayer(trips: PracticeTripLike[], currentTime: number) {
  return new TripsLayer<PracticeTripLike>({
    id: "ins-map-trips",
    data: trips,
    getPath: (trip) => trip.path,
    getTimestamps: (trip) => trip.timestamps,
    getColor: (trip) => trip.color,
    currentTime,
    trailLength: 12,
    widthMinPixels: 4,
    capRounded: true,
    jointRounded: true,
  });
}

function DeckOverlay({
  staticLayers,
  trips,
  playing,
}: {
  staticLayers: Layer[];
  trips: PracticeTripLike[];
  playing: boolean;
}) {
  const overlay = useControl<MapboxOverlay>(
    () =>
      new MapboxOverlay({
        interleaved: false,
        useDevicePixels: MAP_PIXEL_RATIO,
      }),
  );
  const tripTimeRef = useRef(0);
  const staticLayersRef = useRef(staticLayers);
  const tripsRef = useRef(trips);
  staticLayersRef.current = staticLayers;
  tripsRef.current = trips;

  const applyLayers = useCallback(() => {
    const tripLayer =
      tripsRef.current.length > 0
        ? makeTripsLayer(tripsRef.current, tripTimeRef.current)
        : null;
    overlay.setProps({
      layers: tripLayer
        ? [...staticLayersRef.current, tripLayer]
        : staticLayersRef.current,
    });
  }, [overlay]);

  useEffect(() => {
    applyLayers();
  }, [applyLayers, playing, staticLayers, trips]);

  useEffect(() => {
    if (!playing || trips.length === 0) return;
    let frame = 0;
    let last = performance.now();
    let lastApply = 0;
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      tripTimeRef.current = (tripTimeRef.current + delta * 3.2) % TRIP_DURATION;
      if (now - lastApply >= 33) {
        lastApply = now;
        applyLayers();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [applyLayers, playing, trips.length]);

  return null;
}

function hexToRgb(color: string): [number, number, number] {
  const hex = color.replace("#", "");
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function samePlace(
  a: { longitude: number; latitude: number },
  b: { longitude: number; latitude: number },
) {
  return (
    Math.abs(a.longitude - b.longitude) < 0.00015 &&
    Math.abs(a.latitude - b.latitude) < 0.00015
  );
}

function inscriptionOf(kind: string): InscriptionKind {
  if (kind === "Event") return "time";
  if (kind === "Space" || kind === "Concept") return "space";
  if (kind === "Artifact" || kind === "Media" || kind === "Document") return "image";
  return "practice";
}

function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: "application/geo+json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function nextNodeLabelMode(mode: NodeLabelMode): NodeLabelMode {
  if (mode === "none") return "selected";
  if (mode === "selected") return "all";
  return "none";
}

function nodeLabelCaption(mode: NodeLabelMode) {
  if (mode === "all") return "节点标签 · 全部";
  if (mode === "selected") return "节点标签 · 选中";
  return "节点标签 · 关";
}

export const StudioMapView = memo(function StudioMapView({
  nodes,
  relations,
  selectedNodeId,
  onSelectNode,
  onCreatePlaces,
  onNotice,
}: {
  nodes: StudioMapNode[];
  relations: StudioMapRelation[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  onCreatePlaces: (places: MapPlaceDraft[]) => void;
  onNotice?: (message: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipInitialFly = useRef(true);
  const basemapLabelsRef = useRef(false);
  const [yearFrom, setYearFrom] = useState(MAP_YEAR_MIN);
  const [yearTo, setYearTo] = useState(MAP_YEAR_MAX);
  const [tripsPlaying, setTripsPlaying] = useState(true);
  const [basemapLabels, setBasemapLabelsVisible] = useState(false);
  basemapLabelsRef.current = basemapLabels;
  const [nodeLabels, setNodeLabels] = useState<NodeLabelMode>("all");
  const [drawMode, setDrawMode] = useState<DrawMode>("select");
  const [boxStart, setBoxStart] = useState<LngLat | null>(null);
  const [boxCurrent, setBoxCurrent] = useState<LngLat | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<LngLat[]>([]);
  const [boundsForm, setBoundsForm] = useState({
    west: "113.53",
    south: "22.18",
    east: "113.55",
    north: "22.20",
  });
  const [layers, setLayers] = useState<LayerToggles>({
    points: true,
    polygons: true,
    arcs: true,
    heat: true,
    trips: true,
  });
  const [inscriptions, setInscriptions] = useState<Record<InscriptionKind, boolean>>({
    time: true,
    space: true,
    image: true,
    practice: true,
  });

  const inRange = useCallback(
    (start?: number, end?: number) => yearsOverlap(start, end, yearFrom, yearTo),
    [yearFrom, yearTo],
  );

  const timedNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          inscriptions[inscriptionOf(node.kind)] &&
          inRange(node.yearFrom, node.yearTo),
      ),
    [inRange, inscriptions, nodes],
  );
  const located = useMemo(
    () =>
      timedNodes.filter((node): node is LocatedNode => hasMapLocation(node.geo)),
    [timedNodes],
  );
  const scatterNodes = useMemo(
    () => located.filter((node) => !hasMapPolygon(node.geo)),
    [located],
  );
  const polygonNodes = useMemo(
    () => timedNodes.filter((node): node is PolygonNode => hasMapPolygon(node.geo)),
    [timedNodes],
  );
  const locatedById = useMemo(
    () => new Map(located.map((node) => [node.id, node])),
    [located],
  );
  const arcs = useMemo(() => {
    if (!layers.arcs) return [];
    const next: MapArc[] = [];
    for (const relation of relations) {
      const source = locatedById.get(relation.source);
      const target = locatedById.get(relation.target);
      if (!source || !target || samePlace(source.geo, target.geo)) continue;
      next.push({ id: relation.id, type: relation.type, source, target });
    }
    return next;
  }, [layers.arcs, locatedById, relations]);
  const heatMarks = useMemo(
    () =>
      inscriptions.practice && layers.heat
        ? SAMPLE_HEAT_MARKS.filter((mark) => inRange(mark.yearFrom, mark.yearTo))
        : [],
    [inRange, inscriptions.practice, layers.heat],
  );
  const trips = useMemo(
    () =>
      inscriptions.practice && layers.trips
        ? SAMPLE_TRIPS.filter(
            (trip) => inscriptions[trip.inscription] && inRange(trip.yearFrom, trip.yearTo),
          )
        : [],
    [inRange, inscriptions, layers.trips],
  );
  const selected =
    locatedById.get(selectedNodeId) ??
    polygonNodes.find((node) => node.id === selectedNodeId);
  const labelNodes = useMemo(() => {
    if (nodeLabels === "none") return [];
    const source = located;
    if (nodeLabels === "selected") {
      return source.filter((node) => node.id === selectedNodeId);
    }
    return source;
  }, [located, nodeLabels, selectedNodeId]);
  const draftRing = useMemo(() => {
    if (drawMode === "box" && boxStart && boxCurrent) {
      return boundsRing(boxStart[0], boxStart[1], boxCurrent[0], boxCurrent[1]);
    }
    if (drawMode === "polygon" && polygonDraft.length >= 2) {
      return polygonDraft;
    }
    return [];
  }, [boxCurrent, boxStart, drawMode, polygonDraft]);

  const applyBasemapLabels = useCallback(
    (map: MapLibreGLMap) => setBasemapLabels(map, basemapLabels),
    [basemapLabels],
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map?.isStyleLoaded()) applyBasemapLabels(map);
  }, [applyBasemapLabels]);

  const resetDraft = useCallback(() => {
    setBoxStart(null);
    setBoxCurrent(null);
    setPolygonDraft([]);
  }, []);

  const changeDrawMode = useCallback(
    (mode: DrawMode) => {
      setDrawMode(mode);
      resetDraft();
    },
    [resetDraft],
  );

  const createPlaces = useCallback(
    (places: MapPlaceDraft[]) => {
      if (places.length === 0) return;
      onCreatePlaces(places);
    },
    [onCreatePlaces],
  );

  const finishBox = useCallback(
    (start: LngLat, end: LngLat) => {
      if (Math.abs(start[0] - end[0]) < 1e-6 && Math.abs(start[1] - end[1]) < 1e-6) {
        onNotice?.("画框需要两个不同的角点");
        return;
      }
      createPlaces([
        {
          title: "地图范围",
          geo: geoFromRing(boundsRing(start[0], start[1], end[0], end[1])),
        },
      ]);
      resetDraft();
    },
    [createPlaces, onNotice, resetDraft],
  );

  const finishPolygon = useCallback(() => {
    if (polygonDraft.length < 3) {
      onNotice?.("画面至少需要三个顶点");
      return;
    }
    createPlaces([{ title: "地图范围", geo: geoFromRing(polygonDraft) }]);
    resetDraft();
  }, [createPlaces, onNotice, polygonDraft, resetDraft]);

  const fitLocated = useCallback(
    (duration = 700) => {
      const map = mapRef.current;
      const lngs = [
        ...located.map((node) => node.geo.longitude),
        ...polygonNodes.flatMap((node) => node.geo.polygon.map((point) => point[0])),
      ];
      const lats = [
        ...located.map((node) => node.geo.latitude),
        ...polygonNodes.flatMap((node) => node.geo.polygon.map((point) => point[1])),
      ];
      if (!map || lngs.length === 0) return;
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        {
          padding: { top: 56, right: 48, bottom: 108, left: 248 },
          duration,
          maxZoom: 15.2,
        },
      );
    },
    [located, polygonNodes],
  );

  const selectNearestNode = useCallback(
    (point: { x: number; y: number }, lngLat?: { lng: number; lat: number }) => {
      if (lngLat && inscriptions.space && layers.polygons) {
        const hit = polygonNodes
          .filter((node) => pointInRing(lngLat.lng, lngLat.lat, node.geo.polygon))
          .sort((a, b) => ringArea(a.geo.polygon) - ringArea(b.geo.polygon))[0];
        if (hit) {
          onSelectNode(hit.id);
          return;
        }
      }
      const map = mapRef.current?.getMap();
      if (!map) return;
      let best: LocatedNode | undefined;
      let bestDistance = 20;
      for (const node of located) {
        const projected = map.project([node.geo.longitude, node.geo.latitude]);
        const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
        if (distance < bestDistance - 0.5) {
          best = node;
          bestDistance = distance;
          continue;
        }
        if (
          best &&
          Math.abs(distance - bestDistance) < 0.5 &&
          node.id !== selectedNodeId &&
          best.id === selectedNodeId
        ) {
          best = node;
        }
      }
      if (best) onSelectNode(best.id);
    },
    [
      inscriptions.space,
      layers.polygons,
      located,
      onSelectNode,
      polygonNodes,
      selectedNodeId,
    ],
  );

  const handleMapClick = useCallback(
    (point: { x: number; y: number }, lngLat: { lng: number; lat: number }) => {
      const at: LngLat = [lngLat.lng, lngLat.lat];
      if (drawMode === "point") {
        createPlaces([{ title: "地图点", geo: geoFromPoint(at[0], at[1]) }]);
        return;
      }
      if (drawMode === "box") {
        if (!boxStart) {
          setBoxStart(at);
          setBoxCurrent(at);
          return;
        }
        finishBox(boxStart, at);
        return;
      }
      if (drawMode === "polygon") {
        const first = polygonDraft[0];
        if (
          first &&
          polygonDraft.length >= 3 &&
          Math.abs(first[0] - at[0]) < 0.00025 &&
          Math.abs(first[1] - at[1]) < 0.00025
        ) {
          finishPolygon();
          return;
        }
        setPolygonDraft((current) => [...current, at]);
        return;
      }
      selectNearestNode(point, lngLat);
    },
    [
      boxStart,
      createPlaces,
      drawMode,
      finishBox,
      finishPolygon,
      polygonDraft,
      selectNearestNode,
    ],
  );

  useEffect(() => {
    if (drawMode !== "select") return;
    if (!selected || !hasMapLocation(selected.geo)) return;
    if (skipInitialFly.current) {
      skipInitialFly.current = false;
      return;
    }
    mapRef.current?.flyTo({
      center: [selected.geo.longitude, selected.geo.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 700,
    });
  }, [drawMode, selected, selectedNodeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (drawMode !== "select") changeDrawMode("select");
        return;
      }
      if (event.key === "Enter" && drawMode === "polygon") {
        event.preventDefault();
        finishPolygon();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeDrawMode, drawMode, finishPolygon]);

  const staticLayers = useMemo(
    () =>
      [
        inscriptions.space && layers.polygons
          ? new PolygonLayer<PolygonNode>({
              id: "ins-map-polygons",
              data: polygonNodes,
              pickable: false,
              stroked: true,
              filled: true,
              extruded: false,
              getPolygon: (node) => node.geo.polygon,
              getFillColor: (node) => [
                ...hexToRgb(node.color),
                node.id === selectedNodeId ? 72 : 38,
              ],
              getLineColor: (node) => [
                ...hexToRgb(node.color),
                node.id === selectedNodeId ? 255 : 210,
              ],
              getLineWidth: (node) => (node.id === selectedNodeId ? 3 : 1.6),
              lineWidthUnits: "pixels",
            })
          : null,
        draftRing.length > 0
          ? new PolygonLayer<{ ring: LngLat[] }>({
              id: "ins-map-draft",
              data: [{ ring: draftRing }],
              pickable: false,
              stroked: true,
              filled: true,
              getPolygon: (item) => item.ring,
              getFillColor: [49, 92, 75, 40],
              getLineColor: [49, 92, 75, 230],
              getLineWidth: 2,
              lineWidthUnits: "pixels",
            })
          : null,
        inscriptions.practice && layers.heat
          ? new ScatterplotLayer<HeatMarkLike>({
              id: "ins-map-heat",
              data: heatMarks,
              pickable: false,
              stroked: false,
              filled: true,
              radiusUnits: "pixels",
              getPosition: (mark) => mark.position,
              getRadius: (mark) => 14 + mark.weight * 6,
              getFillColor: (mark) => [
                196,
                112,
                48,
                Math.min(96, 32 + Math.round(mark.weight * 28)),
              ],
            })
          : null,
        layers.trips
          ? new PathLayer<PracticeTripLike>({
              id: "ins-map-trip-paths",
              data: trips,
              getPath: (trip) => trip.path,
              getColor: (trip) => [...trip.color, 70],
              getWidth: 2.2,
              widthUnits: "pixels",
            })
          : null,
        layers.arcs
          ? new ArcLayer<MapArc>({
              id: "ins-map-arcs",
              data: arcs,
              getSourcePosition: (item) => [
                item.source.geo.longitude,
                item.source.geo.latitude,
              ],
              getTargetPosition: (item) => [
                item.target.geo.longitude,
                item.target.geo.latitude,
              ],
              getSourceColor: (item) => hexToRgb(item.source.color),
              getTargetColor: (item) => hexToRgb(item.target.color),
              getWidth: 2.2,
              pickable: false,
            })
          : null,
        layers.points
          ? new ScatterplotLayer<LocatedNode>({
              id: "ins-map-points",
              data: scatterNodes,
              pickable: false,
              stroked: true,
              filled: true,
              radiusUnits: "pixels",
              lineWidthUnits: "pixels",
              getPosition: (node) => [node.geo.longitude, node.geo.latitude],
              getFillColor: (node) => [
                ...hexToRgb(node.color),
                node.id === selectedNodeId ? 255 : 210,
              ],
              getLineColor: (node) =>
                node.id === selectedNodeId ? [36, 32, 28, 255] : [255, 255, 255, 220],
              getRadius: (node) => (node.id === selectedNodeId ? 11 : 8),
              getLineWidth: (node) => (node.id === selectedNodeId ? 2.4 : 1.2),
            })
          : null,
        polygonDraft.length > 0
          ? new ScatterplotLayer<{ position: LngLat }>({
              id: "ins-map-draft-vertices",
              data: polygonDraft.map((position) => ({ position })),
              pickable: false,
              radiusUnits: "pixels",
              getPosition: (item) => item.position,
              getRadius: 5,
              getFillColor: [49, 92, 75, 240],
            })
          : null,
        new TextLayer<LocatedNode>({
          id: "ins-map-labels",
          data: labelNodes,
          getPosition: (node) => [node.geo.longitude, node.geo.latitude],
          getText: (node) => node.title,
          getSize: 12,
          getColor: [36, 32, 28, 230],
          getPixelOffset: (node) => {
            if (node.kind === "Event") return [0, -34];
            if (node.kind === "Artifact" || node.kind === "Media") return [18, -8];
            return [0, -18];
          },
          outlineWidth: 4,
          outlineColor: [247, 245, 239, 220],
          fontFamily: '"IBM Plex Sans", "Noto Sans SC", sans-serif',
        }),
      ].filter(Boolean) as Layer[],
    [
      arcs,
      draftRing,
      heatMarks,
      inscriptions.practice,
      inscriptions.space,
      labelNodes,
      layers.arcs,
      layers.heat,
      layers.points,
      layers.polygons,
      layers.trips,
      polygonDraft,
      polygonNodes,
      scatterNodes,
      selectedNodeId,
      trips,
    ],
  );

  const hasMapContent = located.length > 0 || polygonNodes.length > 0;
  const listNodes = [...polygonNodes, ...scatterNodes];

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    const result = parseMapFile(file.name, text);
    if (result.error) {
      onNotice?.(result.error);
      return;
    }
    if (result.places.length === 0) {
      onNotice?.("文件里没有可用的点或面");
      return;
    }
    createPlaces(result.places);
    if (result.skipped > 0) {
      onNotice?.(`已导入 ${result.places.length} 处，跳过 ${result.skipped} 条`);
    }
  };

  const exportGeoJson = () => {
    const collection = nodesToFeatureCollection(nodes);
    if (collection.features.length === 0) {
      onNotice?.("当前没有可导出的坐标");
      return;
    }
    downloadText("ins-map.geojson", `${JSON.stringify(collection, null, 2)}\n`);
    onNotice?.(`已导出 ${collection.features.length} 个要素`);
  };

  const createBoundsBox = () => {
    const west = parseCoordinate(boundsForm.west);
    const south = parseCoordinate(boundsForm.south);
    const east = parseCoordinate(boundsForm.east);
    const north = parseCoordinate(boundsForm.north);
    if (
      west == null ||
      south == null ||
      east == null ||
      north == null ||
      !isValidLngLat(west, south) ||
      !isValidLngLat(east, north) ||
      west === east ||
      south === north
    ) {
      onNotice?.("请输入有效的西 / 南 / 东 / 北坐标");
      return;
    }
    createPlaces([
      {
        title: "坐标范围",
        geo: geoFromRing(boundsRing(west, south, east, north)),
      },
    ]);
  };

  const toggleLayer = (key: keyof LayerToggles) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="studio-map-view">
      <div className="graph-intro">
        <div>
          <span>INS MAP</span>
          <h1>地图</h1>
        </div>
        <div className="graph-intro-actions">
          <p>
            {scatterNodes.length} 个点 · {polygonNodes.length} 个范围 · {heatMarks.length} 处热力 ·{" "}
            {trips.length} 条轨迹
          </p>
          {hasMapContent && (
            <button type="button" onClick={() => fitLocated()}>
              看全图
            </button>
          )}
          <button type="button" onClick={exportGeoJson}>
            导出 GeoJSON
          </button>
        </div>
      </div>
      <div className={`studio-map-canvas${drawMode === "select" ? "" : " drawing"}`}>
        <aside className="studio-map-places">
          <span>INSCRIPTION</span>
          <p>
            {drawMode === "select"
              ? "点选打开检查器。画点 / 画框 / 画面会写成空间节点，导入 CSV 或 GeoJSON 同样进工作区。"
              : drawMode === "point"
                ? "在地图上点一下，就会创建一个空间节点。"
                : drawMode === "box"
                  ? "点两个角画出矩形。Esc 取消。"
                  : "逐次点击顶点，回车或点闭合完成。Esc 取消。"}
          </p>
          <div className="studio-map-tools">
            {DRAW_MODES.map((item) => (
              <button
                type="button"
                key={item.id}
                className={drawMode === item.id ? "active" : ""}
                onClick={() => changeDrawMode(item.id)}
              >
                {item.label}
              </button>
            ))}
            {drawMode === "polygon" && (
              <button type="button" onClick={finishPolygon}>
                完成面
              </button>
            )}
          </div>
          <div className="studio-map-bounds">
            <span>坐标画框</span>
            <div className="studio-map-bounds-grid">
              <label>
                西
                <input
                  value={boundsForm.west}
                  onChange={(event) =>
                    setBoundsForm((current) => ({ ...current, west: event.target.value }))
                  }
                />
              </label>
              <label>
                南
                <input
                  value={boundsForm.south}
                  onChange={(event) =>
                    setBoundsForm((current) => ({ ...current, south: event.target.value }))
                  }
                />
              </label>
              <label>
                东
                <input
                  value={boundsForm.east}
                  onChange={(event) =>
                    setBoundsForm((current) => ({ ...current, east: event.target.value }))
                  }
                />
              </label>
              <label>
                北
                <input
                  value={boundsForm.north}
                  onChange={(event) =>
                    setBoundsForm((current) => ({ ...current, north: event.target.value }))
                  }
                />
              </label>
            </div>
            <button type="button" onClick={createBoundsBox}>
              按坐标画框
            </button>
          </div>
          <div className="studio-map-file-row">
            <button type="button" onClick={() => fileRef.current?.click()}>
              导入 CSV / GeoJSON
            </button>
            <input
              ref={fileRef}
              className="studio-map-file"
              type="file"
              accept=".csv,.tsv,.geojson,.json,text/csv,application/geo+json,application/json"
              onChange={importFile}
            />
          </div>
          <strong>图层</strong>
          <div className="studio-map-layers">
            <button
              type="button"
              className={basemapLabels ? "active" : ""}
              onClick={() => setBasemapLabelsVisible((value) => !value)}
            >
              底图标签
            </button>
            <button
              type="button"
              className={nodeLabels === "none" ? "" : "active"}
              onClick={() => setNodeLabels((mode) => nextNodeLabelMode(mode))}
            >
              {nodeLabelCaption(nodeLabels)}
            </button>
            <button
              type="button"
              className={layers.points ? "active" : ""}
              onClick={() => toggleLayer("points")}
            >
              点
            </button>
            <button
              type="button"
              className={layers.polygons ? "active" : ""}
              onClick={() => toggleLayer("polygons")}
            >
              范围
            </button>
            <button
              type="button"
              className={layers.arcs ? "active" : ""}
              onClick={() => toggleLayer("arcs")}
            >
              关系
            </button>
            <button
              type="button"
              className={layers.heat ? "active" : ""}
              onClick={() => toggleLayer("heat")}
            >
              热力
            </button>
            <button
              type="button"
              className={layers.trips ? "active" : ""}
              onClick={() => toggleLayer("trips")}
            >
              轨迹
            </button>
          </div>
          <strong>四种印记</strong>
          <div className="studio-map-inscriptions">
            {INSCRIPTION_META.map((item) => (
              <button
                type="button"
                key={item.id}
                className={inscriptions[item.id] ? "active" : ""}
                onClick={() =>
                  setInscriptions((current) => ({
                    ...current,
                    [item.id]: !current[item.id],
                  }))
                }
              >
                <b>{item.label}</b>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
          <strong>当前可见</strong>
          <div className="studio-map-place-list">
            {listNodes.length === 0 ? (
              <p className="studio-map-place-empty">这个时间窗里还没有落图的节点，可以直接画或导入。</p>
            ) : (
              listNodes.map((node) => (
                <button
                  type="button"
                  key={node.id}
                  className={node.id === selectedNodeId ? "active" : ""}
                  onClick={() => onSelectNode(node.id)}
                >
                  <i style={{ background: node.color }} />
                  <span>
                    <b>{node.title}</b>
                    <small>
                      {hasMapPolygon(node.geo)
                        ? node.id === "space-historic-centre"
                          ? "核心区一示意"
                          : node.id === "space-guia"
                            ? "核心区二示意"
                            : "多边形范围"
                        : `${node.kind} · ${node.period}`}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
        <MapLibreMap
          ref={mapRef}
          reuseMaps
          attributionControl={{ compact: true }}
          keyboard={false}
          dragRotate={false}
          dragPan={drawMode === "select"}
          doubleClickZoom={drawMode === "select"}
          pitchWithRotate={false}
          touchPitch={false}
          renderWorldCopies={false}
          fadeDuration={0}
          refreshExpiredTiles={false}
          pixelRatio={MAP_PIXEL_RATIO}
          canvasContextAttributes={{
            antialias: false,
            powerPreference: "high-performance",
            desynchronized: true,
          }}
          localIdeographFontFamily='"Microsoft YaHei", "Noto Sans SC", sans-serif'
          initialViewState={{
            longitude: 113.536,
            latitude: 22.191,
            zoom: 14.1,
            pitch: 0,
          }}
          mapStyle={BASEMAP_STYLE}
          style={{ width: "100%", height: "100%" }}
          onLoad={(event) => {
            const map = event.target;
            setBasemapLabels(map, basemapLabelsRef.current);
            map.on("style.load", () => setBasemapLabels(map, basemapLabelsRef.current));
            if (hasMapContent) fitLocated(0);
          }}
          onMouseMove={(event) => {
            if (drawMode === "box" && boxStart) {
              setBoxCurrent([event.lngLat.lng, event.lngLat.lat]);
            }
          }}
          onClick={(event) => handleMapClick(event.point, event.lngLat)}
        >
          <DeckOverlay
            staticLayers={staticLayers}
            trips={trips}
            playing={tripsPlaying && layers.trips}
          />
        </MapLibreMap>
        <div className="studio-map-timeline">
          <div className="studio-map-timeline-labels">
            <span>时间轴</span>
            <strong>
              {yearFrom} — {yearTo}
            </strong>
            <button
              type="button"
              onClick={() => setTripsPlaying((playing) => !playing)}
              disabled={trips.length === 0}
            >
              {tripsPlaying ? "暂停轨迹" : "播放轨迹"}
            </button>
          </div>
          <div className="studio-map-timeline-sliders">
            <label>
              起
              <input
                type="range"
                min={MAP_YEAR_MIN}
                max={MAP_YEAR_MAX}
                value={yearFrom}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setYearFrom(next);
                  if (next > yearTo) setYearTo(next);
                }}
              />
            </label>
            <label>
              迄
              <input
                type="range"
                min={MAP_YEAR_MIN}
                max={MAP_YEAR_MAX}
                value={yearTo}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setYearTo(next);
                  if (next < yearFrom) setYearFrom(next);
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
});
