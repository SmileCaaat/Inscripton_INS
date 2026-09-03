"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap, useControl, type MapRef } from "react-map-gl/maplibre";
import type { Map as MapLibreGLMap } from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import type { Layer } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  hasMapLocation,
  hasMapPolygon,
  yearsOverlap,
  type StudioMapGeo,
} from "./geo";
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

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const MAP_PIXEL_RATIO =
  typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);

function quietBasemap(map: MapLibreGLMap) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type === "symbol" || layer.type === "fill-extrusion") {
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

export const StudioMapView = memo(function StudioMapView({
  nodes,
  relations,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: StudioMapNode[];
  relations: StudioMapRelation[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const skipInitialFly = useRef(true);
  const [yearFrom, setYearFrom] = useState(MAP_YEAR_MIN);
  const [yearTo, setYearTo] = useState(MAP_YEAR_MAX);
  const [tripsPlaying, setTripsPlaying] = useState(true);
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
    const next: MapArc[] = [];
    for (const relation of relations) {
      const source = locatedById.get(relation.source);
      const target = locatedById.get(relation.target);
      if (!source || !target || samePlace(source.geo, target.geo)) continue;
      next.push({ id: relation.id, type: relation.type, source, target });
    }
    return next;
  }, [locatedById, relations]);
  const heatMarks = useMemo(
    () =>
      inscriptions.practice
        ? SAMPLE_HEAT_MARKS.filter((mark) => inRange(mark.yearFrom, mark.yearTo))
        : [],
    [inRange, inscriptions.practice],
  );
  const trips = useMemo(
    () =>
      SAMPLE_TRIPS.filter(
        (trip) => inscriptions[trip.inscription] && inRange(trip.yearFrom, trip.yearTo),
      ),
    [inRange, inscriptions],
  );
  const selected =
    locatedById.get(selectedNodeId) ??
    polygonNodes.find((node) => node.id === selectedNodeId);

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
      if (lngLat && inscriptions.space) {
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
    [inscriptions.space, located, onSelectNode, polygonNodes, selectedNodeId],
  );

  useEffect(() => {
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
  }, [selected, selectedNodeId]);

  const staticLayers = useMemo(
    () =>
      [
        inscriptions.space
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
        inscriptions.practice
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
        new PathLayer<PracticeTripLike>({
          id: "ins-map-trip-paths",
          data: trips,
          getPath: (trip) => trip.path,
          getColor: (trip) => [...trip.color, 70],
          getWidth: 2.2,
          widthUnits: "pixels",
        }),
        new ArcLayer<MapArc>({
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
        }),
        new ScatterplotLayer<LocatedNode>({
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
        }),
        new TextLayer<LocatedNode>({
          id: "ins-map-labels",
          data: scatterNodes.filter((node) => node.id === selectedNodeId),
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
      heatMarks,
      inscriptions.practice,
      inscriptions.space,
      scatterNodes,
      polygonNodes,
      selectedNodeId,
      trips,
    ],
  );

  const hasMapContent = located.length > 0 || polygonNodes.length > 0;
  const listNodes = [...polygonNodes, ...scatterNodes];

  return (
    <div className="studio-map-view">
      <div className="graph-intro">
        <div>
          <span>INS MAP</span>
          <h1>四种印记</h1>
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
        </div>
      </div>
      <div className="studio-map-canvas">
        {hasMapContent && (
          <aside className="studio-map-places">
            <span>INSCRIPTION</span>
            <p>
              框来自节点的经纬度闭环。底图关掉了路名注记，避免澳门这种密标注把拖图拖卡。轨迹默认在走，可在时间轴暂停。
            </p>
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
              {listNodes.map((node) => (
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
              ))}
            </div>
          </aside>
        )}
        {!hasMapContent ? (
          <div className="studio-map-empty">
            <span>NO COORDINATES</span>
            <h2>这个时间窗里没有印记</h2>
            <p>
              放宽时间轴，或打开时间 / 空间 / 图像 / 实践图层。节点需要经纬度或多边形才会落图。
            </p>
          </div>
        ) : (
          <MapLibreMap
            ref={mapRef}
            reuseMaps
            attributionControl={{ compact: true }}
            keyboard={false}
            dragRotate={false}
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
              quietBasemap(event.target);
              event.target.on("style.load", () => quietBasemap(event.target));
              fitLocated(0);
            }}
            onClick={(event) => selectNearestNode(event.point, event.lngLat)}
          >
            <DeckOverlay
              staticLayers={staticLayers}
              trips={trips}
              playing={tripsPlaying}
            />
          </MapLibreMap>
        )}
        {hasMapContent && (
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
        )}
      </div>
    </div>
  );
});
