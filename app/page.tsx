"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type InputHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  SelectionMode,
  applyNodeChanges,
  getBezierPath,
  type Edge as FlowEdge,
  type EdgeProps,
  type Connection,
  type FinalConnectionState,
  type Node as FlowNode,
  type NodeProps,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import dynamic from "next/dynamic";
import "@xyflow/react/dist/style.css";
import {
  ReferenceBoardView,
  type BoardAsset,
} from "./reference-board";
import { readLocalAssetBlob, storeLocalAssetBlob } from "./local-assets";
import {
  ApplicationContextMenu,
  type ApplicationContextMenuItem,
} from "./application-context-menu";
import { AssetPreview } from "./asset-preview";
import { ArchiveView } from "./archive-view";
import { OcrPanel } from "./ocr-panel";
import {
  connectWorkspaceDirectory,
  createWorkspaceDeliveryDirectories,
  renameWorkspaceAssetFile,
  revealLocalAsset,
  supportsWorkspaceDirectoryAccess,
  workspaceAssetLocalPath,
  workspaceDirectoryIsConnected,
  writeWorkspaceAssetFile,
} from "./workspace-files";
import {
  jsonDataTemplate,
  markdownNoteTemplate,
  mimeTypeForTextFile,
  uniqueAssetFileName,
  type TextSaveReason,
} from "./text-documents";
import { isTypingTarget, nativeFilePath, replacePathFileName } from "./studio-hotkeys";
import { hasMapLocation, hasMapPolygon, parseCoordinate, parseYear, type StudioMapGeo } from "./geo";
import type { MapPlaceDraft } from "./map-io";
import {
  GUIA_ZONE_RING,
  HISTORIC_CENTRE_RING,
  RUINS_PRECINCT_RING,
  SAMPLE_NODE_YEARS,
  SENADO_SQUARE_RING,
} from "./sample-map-inscriptions";

type Section =
  | "nodes"
  | "graph"
  | "map"
  | "assets"
  | "boards"
  | "archive"
  | "ocr"
  | "narrative"
  | "topics";

type NodeKind =
  | "Space"
  | "Person"
  | "Event"
  | "Document"
  | "Artifact"
  | "Media"
  | "Concept";

type KnowledgeNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  period: string;
  summary: string;
  tags: string[];
  source?: string;
  rights?: string;
  assetCount: number;
  assetIds?: string[];
  geo?: StudioMapGeo;
  yearFrom?: number;
  yearTo?: number;
  x: number;
  y: number;
};

type Relation = {
  id: string;
  source: string;
  target: string;
  type: string;
  evidence: string;
};

type AssetItem = BoardAsset;

type NarrativeScene = {
  id: string;
  index: string;
  title: string;
  eyebrow: string;
  description: string;
  layout: "hero" | "timeline" | "collection" | "spatial";
};

type TopicRecord = {
  id: string;
  title: string;
  description: string;
  nodeCount: number;
  assetCount: number;
};

type GraphAnnotation = {
  id: string;
  title: string;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
};

type DeliveryPackage = {
  id: string;
  name: string;
  sourceAssetId: string;
  sourceCopyAssetId: string;
  path: string;
  createdAt: string;
  physicalDirectory: boolean;
};

type WorkspaceRecord = {
  id: string;
  name: string;
  nodes: KnowledgeNode[];
  relations: Relation[];
  assets: AssetItem[];
  scenes: NarrativeScene[];
  topics: TopicRecord[];
  graphAnnotations: GraphAnnotation[];
  deliveryPackages: DeliveryPackage[];
};

type WorkspaceVersion = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  snapshot: WorkspaceRecord;
};

type KnowledgeFlowNode = FlowNode<
  {
    node: KnowledgeNode;
    assets: AssetItem[];
    onAssetDrop: (nodeId: string, assetId: string) => void;
  },
  "knowledge"
>;

type GraphAnnotationFlowNode = FlowNode<
  { annotation: GraphAnnotation },
  "graphAnnotation"
>;

type StudioFlowNode = KnowledgeFlowNode | GraphAnnotationFlowNode;

type EditableRelationEdgeData = Record<string, unknown> & {
  label: string;
  draft: string;
  editing: boolean;
  onBeginEdit: (relationId: string) => void;
  onDraftChange: (value: string) => void;
  onCommit: (relationId: string, value: string) => void;
  onCancel: () => void;
};

type EditableRelationFlowEdge = FlowEdge<
  EditableRelationEdgeData,
  "editableRelation"
>;

type GraphClipboard = {
  nodes: KnowledgeNode[];
  relations: Relation[];
};

type GraphHistoryEntry = {
  workspaceId: string;
  nodes: KnowledgeNode[];
  relations: Relation[];
  assets: AssetItem[];
  graphAnnotations: GraphAnnotation[];
  deliveryPackages: DeliveryPackage[];
};

type GraphContextMenuState = {
  x: number;
  y: number;
  nodeId: string | null;
};

type AssetContextMenuState = {
  x: number;
  y: number;
  assetId: string | null;
};

type GraphConnectionPickerState = {
  sourceNodeId: string;
  x: number;
  y: number;
  flowX: number;
  flowY: number;
};

type EntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (callback: (file: File) => void) => void;
  createReader?: () => {
    readEntries: (callback: (entries: EntryLike[]) => void) => void;
  };
};

const ASSET_PREVIEW_DEFAULT_WIDTH = 420;
const ASSET_PREVIEW_MIN_WIDTH = 300;
const ASSET_GALLERY_MIN_WIDTH = 320;
const ASSET_PANEL_DIVIDER_WIDTH = 7;

const kindMeta: Record<NodeKind, { label: string; mark: string; color: string }> = {
  Space: { label: "空间", mark: "S", color: "#315c4b" },
  Person: { label: "人物", mark: "P", color: "#7f3f2e" },
  Event: { label: "事件", mark: "E", color: "#9a641e" },
  Document: { label: "文献", mark: "D", color: "#445a78" },
  Artifact: { label: "物件", mark: "A", color: "#6c4d72" },
  Media: { label: "媒介", mark: "M", color: "#42666b" },
  Concept: { label: "概念", mark: "C", color: "#68624a" },
};

const sectionMeta: Array<{
  id: Section;
  label: string;
  shortcut: string;
  disabled?: boolean;
}> = [
  { id: "assets", label: "资源", shortcut: "1" },
  { id: "boards", label: "参考板", shortcut: "2" },
  { id: "nodes", label: "节点", shortcut: "3" },
  { id: "graph", label: "图谱", shortcut: "4" },
  { id: "map", label: "地图", shortcut: "5" },
  { id: "archive", label: "归档", shortcut: "6" },
  { id: "ocr", label: "OCR", shortcut: "7" },
];

const initialNodes: KnowledgeNode[] = [
  {
    id: "space-ruins",
    kind: "Space",
    title: "大三巴高地",
    subtitle: "历史城区 · 澳门半岛",
    period: "16世纪—至今",
    summary:
      "以圣保禄学院、天主之母教堂遗址及其周边城市空间为核心的历史文化场域。",
    tags: ["建筑遗产", "城市空间", "文化记忆"],
    assetCount: 18,
    assetIds: ["asset-1", "asset-2", "asset-6"],
    geo: {
      longitude: 113.54072,
      latitude: 22.19756,
      confidence: 0.95,
      polygon: RUINS_PRECINCT_RING,
    },
    x: 330,
    y: 190,
  },
  {
    id: "event-fire",
    kind: "Event",
    title: "1835年圣保禄学院火灾",
    subtitle: "历史事件",
    period: "1835.01.26",
    summary:
      "火灾摧毁了教堂主体建筑，仅留下今日所见的前壁、石阶及部分遗存。",
    tags: ["火灾", "建筑变迁"],
    assetCount: 6,
    assetIds: ["asset-4"],
    geo: { longitude: 113.54072, latitude: 22.19756, confidence: 0.9 },
    x: 605,
    y: 95,
  },
  {
    id: "document-macau",
    kind: "Document",
    title: "《澳门记略》",
    subtitle: "清代地方文献",
    period: "1751",
    summary:
      "清代系统记述澳门地理、建置、贸易与社会生活的重要地方文献。",
    tags: ["地方志", "历史文献"],
    assetCount: 4,
    assetIds: ["asset-3"],
    x: 70,
    y: 80,
  },
  {
    id: "person-jesuit",
    kind: "Person",
    title: "耶稣会传教士群体",
    subtitle: "历史人物群体",
    period: "16—18世纪",
    summary:
      "参与学院、教堂与跨文化知识传播活动的宗教及学术群体。",
    tags: ["耶稣会", "知识传播"],
    assetCount: 9,
    assetIds: [],
    x: 80,
    y: 310,
  },
  {
    id: "artifact-facade",
    kind: "Artifact",
    title: "天主之母教堂前壁",
    subtitle: "建筑遗存",
    period: "1602—1640",
    summary:
      "融合欧洲宗教建筑、东方装饰母题与本地工艺的石构立面。",
    tags: ["石构", "建筑装饰"],
    assetCount: 22,
    assetIds: ["asset-1", "asset-2"],
    geo: { longitude: 113.54086, latitude: 22.19738, confidence: 0.92 },
    x: 610,
    y: 330,
  },
  {
    id: "space-monte",
    kind: "Space",
    title: "大炮台",
    subtitle: "圣保禄炮台 · 俯瞰高地",
    period: "1617—至今",
    summary:
      "紧邻大三巴的早期近代化城防，也是理解高地视线、防御与城市制高点的关键场所。",
    tags: ["城防", "城市制高点"],
    assetCount: 3,
    assetIds: [],
    geo: { longitude: 113.54245, latitude: 22.19728, confidence: 0.93 },
    x: 470,
    y: 40,
  },
  {
    id: "space-senado",
    kind: "Space",
    title: "议事亭前地",
    subtitle: "市政广场 · 历史城区核心",
    period: "16世纪—至今",
    summary:
      "澳门半岛的公共礼仪与商业中心，连接大三巴石阶轴线与南部妈阁的城市生活。",
    tags: ["广场", "城市轴线"],
    assetCount: 2,
    assetIds: [],
    geo: {
      longitude: 113.53948,
      latitude: 22.19364,
      confidence: 0.94,
      polygon: SENADO_SQUARE_RING,
    },
    x: 330,
    y: 430,
  },
  {
    id: "space-stjoseph",
    kind: "Space",
    title: "圣若瑟修院圣堂",
    subtitle: "岗顶 · 耶稣会修院",
    period: "1728—至今",
    summary:
      "耶稣会在澳门的另一处知识与礼仪空间，可与圣保禄学院遗址对照阅读。",
    tags: ["修院", "巴洛克"],
    assetCount: 2,
    assetIds: [],
    geo: { longitude: 113.53858, latitude: 22.19228, confidence: 0.91 },
    x: 80,
    y: 500,
  },
  {
    id: "space-ama",
    kind: "Space",
    title: "妈阁庙",
    subtitle: "海港祠庙 · 世界遗产点",
    period: "15世纪—至今",
    summary:
      "澳门地名与航海信仰的起点之一，也是历史城区南端最重要的宗教场所。",
    tags: ["妈祖", "港口"],
    assetCount: 3,
    assetIds: [],
    geo: { longitude: 113.53118, latitude: 22.18612, confidence: 0.96 },
    x: 330,
    y: 620,
  },
  {
    id: "space-guia",
    kind: "Space",
    title: "东望洋炮台",
    subtitle: "核心区二 · 灯塔与城防",
    period: "1622—至今",
    summary:
      "半岛东侧制高点，灯塔、教堂与炮台叠合，可回看大三巴高地在城市中的位置。",
    tags: ["灯塔", "城防"],
    assetCount: 2,
    assetIds: [],
    geo: {
      longitude: 113.54972,
      latitude: 22.19661,
      confidence: 0.93,
      polygon: GUIA_ZONE_RING,
    },
    x: 820,
    y: 190,
  },
  {
    id: "event-unesco",
    kind: "Event",
    title: "2005年列入世界遗产",
    subtitle: "澳门历史城区",
    period: "2005.07.15",
    summary:
      "“澳门历史城区”列入世界遗产名录，把大三巴、议事亭前地、妈阁庙等地点连成一条可核对的遗产链条。",
    tags: ["世界遗产", "申报"],
    assetCount: 1,
    assetIds: [],
    geo: { longitude: 113.54035, latitude: 22.19415, confidence: 0.88 },
    x: 820,
    y: 430,
  },
  {
    id: "space-historic-centre",
    kind: "Space",
    title: "澳门历史城区",
    subtitle: "核心区一 · 妈阁至大炮台",
    period: "16世纪—至今",
    summary:
      "世界遗产「澳门历史城区」不是一大块行政边界。核心区一是妈阁庙到大炮台的旧城走廊，核心区二是东望洋山，两块加起来大约 16 公顷。图上的多边形是按这条走廊画的示意范围，存在节点的 geo.polygon 里。",
    tags: ["世界遗产", "历史城区"],
    assetCount: 0,
    assetIds: [],
    geo: {
      longitude: 113.536,
      latitude: 22.191,
      confidence: 0.86,
      polygon: HISTORIC_CENTRE_RING,
    },
    x: 560,
    y: 520,
  },
  {
    id: "media-ortho",
    kind: "Media",
    title: "大三巴立面正射影像",
    subtitle: "图像印记 · 测绘",
    period: "2019",
    summary: "把立面现状图像钉在前壁坐标上，作为可核对的图像印记。",
    tags: ["正射", "测绘"],
    assetCount: 1,
    assetIds: ["asset-1"],
    geo: { longitude: 113.54086, latitude: 22.19738, confidence: 0.97 },
    x: 740,
    y: 330,
  },
  {
    id: "media-print",
    kind: "Media",
    title: "1835火灾后遗址版画",
    subtitle: "图像印记 · 历史图像",
    period: "1836—19世纪",
    summary: "火灾之后的视觉记录，落在高地坐标上，用来对照今天的遗存。",
    tags: ["版画", "历史图像"],
    assetCount: 1,
    assetIds: ["asset-4"],
    geo: { longitude: 113.5406, latitude: 22.1975, confidence: 0.8 },
    x: 740,
    y: 95,
  },
];

const initialRelations: Relation[] = [
  {
    id: "rel-1",
    source: "document-macau",
    target: "space-ruins",
    type: "描述",
    evidence: "《澳门记略》卷上",
  },
  {
    id: "rel-2",
    source: "person-jesuit",
    target: "space-ruins",
    type: "营建与使用",
    evidence: "圣保禄学院相关档案",
  },
  {
    id: "rel-3",
    source: "event-fire",
    target: "space-ruins",
    type: "发生于",
    evidence: "1835年历史记录",
  },
  {
    id: "rel-4",
    source: "event-fire",
    target: "artifact-facade",
    type: "形成现状",
    evidence: "遗址修缮记录",
  },
  {
    id: "rel-5",
    source: "artifact-facade",
    target: "space-ruins",
    type: "构成",
    evidence: "遗产构成说明",
  },
  {
    id: "rel-6",
    source: "space-ruins",
    target: "space-monte",
    type: "毗邻",
    evidence: "高地城防关系",
  },
  {
    id: "rel-7",
    source: "space-ruins",
    target: "space-senado",
    type: "城市轴线",
    evidence: "大三巴街—议事亭前地",
  },
  {
    id: "rel-8",
    source: "person-jesuit",
    target: "space-stjoseph",
    type: "营建与使用",
    evidence: "圣若瑟修院档案",
  },
  {
    id: "rel-9",
    source: "space-senado",
    target: "space-stjoseph",
    type: "相邻",
    evidence: "岗顶与市政广场",
  },
  {
    id: "rel-10",
    source: "space-ama",
    target: "space-senado",
    type: "城区南北",
    evidence: "历史城区遗产构成",
  },
  {
    id: "rel-11",
    source: "space-guia",
    target: "space-ruins",
    type: "眺望",
    evidence: "东望洋—大三巴视线",
  },
  {
    id: "rel-12",
    source: "event-unesco",
    target: "space-ruins",
    type: "列入",
    evidence: "世界遗产名录：澳门历史城区",
  },
  {
    id: "rel-13",
    source: "event-unesco",
    target: "space-ama",
    type: "列入",
    evidence: "世界遗产名录：澳门历史城区",
  },
  {
    id: "rel-14",
    source: "event-unesco",
    target: "space-senado",
    type: "列入",
    evidence: "世界遗产名录：澳门历史城区",
  },
  {
    id: "rel-15",
    source: "space-historic-centre",
    target: "space-ruins",
    type: "包含",
    evidence: "澳门历史城区遗产构成",
  },
  {
    id: "rel-16",
    source: "space-historic-centre",
    target: "space-ama",
    type: "包含",
    evidence: "澳门历史城区遗产构成",
  },
  {
    id: "rel-17",
    source: "space-historic-centre",
    target: "space-senado",
    type: "包含",
    evidence: "澳门历史城区遗产构成",
  },
  {
    id: "rel-18",
    source: "media-ortho",
    target: "artifact-facade",
    type: "图像记录",
    evidence: "立面正射影像",
  },
  {
    id: "rel-19",
    source: "media-print",
    target: "event-fire",
    type: "图像记录",
    evidence: "火灾后遗址版画",
  },
];

const initialAssets: AssetItem[] = [
  {
    id: "asset-1",
    name: "大三巴立面正射影像.tif",
    path: "图像档案/建筑测绘/",
    kind: "image",
    size: "182.4 MB",
    references: 3,
  },
  {
    id: "asset-2",
    name: "大三巴高地现状模型.glb",
    path: "三维模型/现状扫描/",
    kind: "model",
    size: "48.7 MB",
    references: 2,
  },
  {
    id: "asset-3",
    name: "澳门记略_乾隆刻本.pdf",
    path: "文献档案/地方志/",
    kind: "document",
    size: "26.1 MB",
    references: 1,
  },
  {
    id: "asset-4",
    name: "1835火灾后遗址版画.jpg",
    path: "图像档案/历史图像/",
    kind: "image",
    size: "8.3 MB",
    references: 4,
  },
  {
    id: "asset-5",
    name: "高地空间路径记录.mp4",
    path: "田野调查/2026-04/",
    kind: "video",
    size: "214.8 MB",
    references: 1,
  },
  {
    id: "asset-6",
    name: "高地空间研究札记",
    path: "文字块/研究札记/",
    kind: "text",
    size: "1.8 KB",
    references: 0,
  },
];

const initialScenes: NarrativeScene[] = [
  {
    id: "scene-1",
    index: "01",
    eyebrow: "序章 · 场所",
    title: "高地与城市",
    description:
      "从澳门城市肌理进入大三巴高地，理解建筑、道路与日常生活共同形成的场所。",
    layout: "hero",
  },
  {
    id: "scene-2",
    index: "02",
    eyebrow: "转折 · 事件",
    title: "1835：火与遗存",
    description:
      "一次火灾改变了建筑的物质形态，也重塑了城市记忆中的大三巴。",
    layout: "timeline",
  },
  {
    id: "scene-3",
    index: "03",
    eyebrow: "细读 · 物件",
    title: "石壁上的跨文化图像",
    description:
      "通过立面构件、符号和档案，在细节中辨认跨文化交流留下的铭印。",
    layout: "collection",
  },
  {
    id: "scene-4",
    index: "04",
    eyebrow: "重访 · 空间",
    title: "在三维空间中重访",
    description:
      "把研究节点、历史视角与三维模型重新叠合，形成可探索的数字现场。",
    layout: "spatial",
  },
];

const initialTopics: TopicRecord[] = [
  {
    id: "topic-ruins",
    title: "大三巴高地",
    description: "数字铭印研究",
    nodeCount: 52,
    assetCount: 74,
  },
  {
    id: "topic-macau",
    title: "澳门历史城区",
    description: "世界遗产语境中的城市空间与文化记忆。",
    nodeCount: 84,
    assetCount: 126,
  },
  {
    id: "topic-colonial",
    title: "殖民空间研究",
    description: "历史城市中权力、宗教与日常实践的空间关系。",
    nodeCount: 19,
    assetCount: 38,
  },
];

const blankScene: NarrativeScene = {
  id: "scene-welcome",
  index: "01",
  eyebrow: "新专题 · 场景",
  title: "未命名叙事",
  description: "在 Narrative 中组织节点、资源和三维内容。",
  layout: "hero",
};

function stampSampleNode(node: KnowledgeNode): KnowledgeNode {
  const years = SAMPLE_NODE_YEARS[node.id];
  return {
    ...node,
    tags: [...node.tags],
    assetIds: [...(node.assetIds ?? [])],
    yearFrom: node.yearFrom ?? years?.yearFrom,
    yearTo: node.yearTo ?? years?.yearTo,
  };
}

function createInitialWorkspace(): WorkspaceRecord {
  return {
    id: "workspace-ruins",
    name: "大三巴高地研究",
    nodes: initialNodes.map((node) => stampSampleNode(node)),
    relations: initialRelations.map((relation) => ({ ...relation })),
    assets: initialAssets.map((asset) => ({ ...asset })),
    scenes: initialScenes.map((scene) => ({ ...scene })),
    topics: initialTopics.map((topic) => ({ ...topic })),
    graphAnnotations: [],
    deliveryPackages: [],
  };
}

const directoryInputProps = {
  webkitdirectory: "",
  directory: "",
} as InputHTMLAttributes<HTMLInputElement>;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function assetKind(file: File): AssetItem["kind"] {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)
  ) {
    return "audio";
  }
  if (name.endsWith(".glb") || name.endsWith(".gltf") || name.endsWith(".obj") || name.endsWith(".fbx")) {
    return "model";
  }
  if (
    file.type.startsWith("text/") ||
    /\.(md|txt|json|xml|html|css|js|ts)$/i.test(name)
  ) {
    return "text";
  }
  return "document";
}

async function readEntry(entry: EntryLike, parent = ""): Promise<Array<{ file: File; path: string }>> {
  const path = parent ? `${parent}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve) => entry.file?.(resolve));
    return [{ file, path }];
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const children = await new Promise<EntryLike[]>((resolve) => reader.readEntries(resolve));
    const nested = await Promise.all(children.map((child) => readEntry(child, path)));
    return nested.flat();
  }
  return [];
}

function assetGlyph(kind: AssetItem["kind"]) {
  if (kind === "model") return "3D";
  if (kind === "document") return "DOC";
  if (kind === "video") return "▶";
  if (kind === "audio") return "♫";
  if (kind === "text") return "TXT";
  return "IMG";
}

function duplicateAssetName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} 副本`;
  return `${name.slice(0, dot)} 副本${name.slice(dot)}`;
}

function StudioLogo() {
  const logoSrc =
    typeof window !== "undefined" && window.location.protocol === "file:"
      ? "./ins-logo.png"
      : "/ins-logo.png";

  return (
    <div className="brand-lockup">
      <div className="brand-logo-frame">
        <img className="brand-logo-image" src={logoSrc} alt="INS" />
      </div>
      <div>
        <strong>Inscription</strong>
        <span>数字人文知识平台</span>
      </div>
    </div>
  );
}

const KnowledgeGraphNode = memo(function KnowledgeGraphNode({
  data,
  selected,
}: NodeProps<KnowledgeFlowNode>) {
  const node = data.node;
  return (
    <div
      className={`knowledge-card ${selected ? "selected" : ""}`}
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-label={`${kindMeta[node.kind].label}节点：${node.title}`}
      style={{ "--node-color": kindMeta[node.kind].color } as CSSProperties}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-ins-asset")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const assetId = event.dataTransfer.getData("application/x-ins-asset");
        if (assetId) data.onAssetDrop(node.id, assetId);
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="knowledge-handle knowledge-handle-target"
        aria-label={`连接到${node.title}`}
      />
      <div className="knowledge-card-topline">
        <span>{kindMeta[node.kind].label.toUpperCase()} NODE</span>
        <i>{data.assets.length}</i>
      </div>
      <strong>{node.title}</strong>
      <small>{node.period}</small>
      <div className="knowledge-card-tags">
        {node.tags.slice(0, 2).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="node-contained-assets">
        {data.assets.slice(0, 3).map((asset) => (
          <span key={asset.id} className={`node-asset-chip asset-${asset.kind}`}>
            <i>{assetGlyph(asset.kind)}</i>
            <b>{asset.name}</b>
          </span>
        ))}
        {data.assets.length === 0 && <span className="node-drop-hint">拖入资产</span>}
        {data.assets.length > 3 && <small>＋{data.assets.length - 3}</small>}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="knowledge-handle knowledge-handle-source"
        aria-label={`从${node.title}牵线创建或关联节点`}
      />
    </div>
  );
});

const GraphAnnotationNode = memo(function GraphAnnotationNode({
  data,
  selected,
}: NodeProps<GraphAnnotationFlowNode>) {
  return (
    <section
      className={`graph-annotation-note ${selected ? "selected" : ""}`}
      aria-label={`图谱备注：${data.annotation.title}`}
    >
      <header>
        <span>COMMENT</span>
        <strong>{data.annotation.title}</strong>
        <small>{data.annotation.nodeIds.length} 个节点</small>
      </header>
    </section>
  );
});

const EditableRelationEdge = memo(function EditableRelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  data,
}: EdgeProps<EditableRelationFlowEdge>) {
  const cancellingRef = useRef(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  if (!data) return null;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={28}
      />
      <EdgeLabelRenderer>
        <div
          className={`editable-relation-label nodrag nopan ${
            data.editing ? "editing" : ""
          }`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {data.editing ? (
            <input
              autoFocus
              aria-label="编辑关系文字"
              value={data.draft}
              style={{
                width: `${Math.max(
                  84,
                  Math.min(220, (data.draft.length + 2) * 14),
                )}px`,
              }}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => data.onDraftChange(event.currentTarget.value)}
              onBlur={(event) => {
                if (cancellingRef.current) {
                  cancellingRef.current = false;
                  return;
                }
                data.onCommit(id, event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancellingRef.current = true;
                  data.onCancel();
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              type="button"
              title="点击修改关系文字"
              aria-label={`修改关系：${data.label}`}
              onClick={(event) => {
                event.stopPropagation();
                data.onBeginEdit(id);
              }}
            >
              {data.label}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

const graphNodeTypes = {
  knowledge: KnowledgeGraphNode,
  graphAnnotation: GraphAnnotationNode,
};

const editableRelationEdgeTypes = {
  editableRelation: EditableRelationEdge,
};

function buildFlowNodes(
  nodes: KnowledgeNode[],
  annotations: GraphAnnotation[],
  assets: AssetItem[],
  selectedNodeIds: string[],
  onAssetDrop: (nodeId: string, assetId: string) => void,
  current: StudioFlowNode[] = [],
  preserveCanvasPositions = false,
): StudioFlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));

  const noteNodes: GraphAnnotationFlowNode[] = annotations.map((annotation) => {
    const previous = currentById.get(annotation.id);
    return {
      ...(previous?.type === "graphAnnotation" ? previous : {}),
      id: annotation.id,
      type: "graphAnnotation",
      position:
        preserveCanvasPositions && previous
          ? previous.position
          : { x: annotation.x, y: annotation.y },
      style: { width: annotation.width, height: annotation.height },
      zIndex: -1,
      selected: selectedNodeIds.includes(annotation.id),
      data: { annotation },
    };
  });

  const knowledgeNodes: KnowledgeFlowNode[] = nodes.map((node) => {
    const previous = currentById.get(node.id);
    return {
      ...(previous?.type === "knowledge" ? previous : {}),
      id: node.id,
      type: "knowledge",
      position:
        preserveCanvasPositions && previous
          ? previous.position
          : { x: node.x, y: node.y },
      selected: selectedNodeIds.includes(node.id),
      data: {
        node,
        assets: assets.filter((asset) => node.assetIds?.includes(asset.id)),
        onAssetDrop,
      },
    };
  });

  return [...noteNodes, ...knowledgeNodes];
}

const ReactFlowCanvas = dynamic(
  () => import("@xyflow/react").then((module) => module.ReactFlow),
  { ssr: false },
);

const StudioMapCanvas = dynamic(
  () => import("./studio-map").then((module) => module.StudioMapView),
  {
    ssr: false,
    loading: () => (
      <div className="studio-map-view">
        <div className="graph-intro">
          <div>
            <span>INS MAP</span>
            <h1>地图</h1>
          </div>
        </div>
        <div className="studio-map-canvas">
          <div className="studio-map-empty">
            <span>LOADING MAP</span>
            <h2>正在载入地图</h2>
            <p>MapLibre 底图与 deck.gl 图层会在客户端加载。</p>
          </div>
        </div>
      </div>
    ),
  },
);

function ExplorerView({
  sceneIndex,
  scenes,
  topicTitle,
  onSceneChange,
  onExit,
}: {
  sceneIndex: number;
  scenes: NarrativeScene[];
  topicTitle: string;
  onSceneChange: (index: number) => void;
  onExit: () => void;
}) {
  const scene = scenes[sceneIndex];

  return (
    <main className={`explorer-shell explorer-${scene.layout}`}>
      <header className="explorer-header">
        <StudioLogo />
        <div className="explorer-topic">
          <span>正在展示</span>
          <strong>{topicTitle}</strong>
        </div>
        <button className="explorer-exit" type="button" onClick={onExit}>
          退出展示 <kbd>Esc</kbd>
        </button>
      </header>

      <section className="explorer-stage">
        <div className="explorer-grid" aria-hidden="true" />
        <div className="explorer-copy">
          <span className="explorer-scene-number">
            {scene.index} / {String(scenes.length).padStart(2, "0")}
          </span>
          <p>{scene.eyebrow}</p>
          <h1>{scene.title}</h1>
          <div className="explorer-rule" />
          <p className="explorer-description">{scene.description}</p>
          <button
            className="explorer-primary"
            type="button"
            onClick={() =>
              onSceneChange(
                sceneIndex < scenes.length - 1 ? sceneIndex + 1 : 0,
              )
            }
          >
            {sceneIndex < scenes.length - 1 ? "进入下一场景" : "重新开始"}{" "}
            <span>→</span>
          </button>
        </div>

        <div className="explorer-visual" aria-label="专题视觉预览">
          <div className="ruins-silhouette">
            <div className="ruins-tier tier-one" />
            <div className="ruins-tier tier-two" />
            <div className="ruins-tier tier-three" />
            <div className="ruins-door" />
          </div>
          <div className="visual-note note-a">
            <span>SPACE NODE</span>
            <strong>大三巴高地</strong>
            <small>22°11′51″N · 113°32′27″E</small>
          </div>
          <div className="visual-note note-b">
            <span>TIME MARK</span>
            <strong>1835</strong>
            <small>火灾与建筑形态变迁</small>
          </div>
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
        </div>
      </section>

      <footer className="explorer-footer">
        <button
          type="button"
          aria-label="上一场景"
          disabled={sceneIndex === 0}
          onClick={() => onSceneChange(Math.max(0, sceneIndex - 1))}
        >
          ←
        </button>
        <div className="scene-progress">
          {scenes.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={index === sceneIndex ? "active" : ""}
              onClick={() => onSceneChange(index)}
              aria-label={`场景 ${item.index}：${item.title}`}
            >
              <span>{item.index}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="下一场景"
          disabled={sceneIndex === scenes.length - 1}
          onClick={() => onSceneChange(Math.min(scenes.length - 1, sceneIndex + 1))}
        >
          →
        </button>
      </footer>
    </main>
  );
}

export default function Home() {
  const [section, setSection] = useState<Section>("graph");
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>(() => [createInitialWorkspace()]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("workspace-ruins");
  const [selectedNodeId, setSelectedNodeId] = useState("space-ruins");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(["space-ruins"]);
  const [search, setSearch] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("asset-2");
  const [dragActive, setDragActive] = useState(false);
  const [activeScene, setActiveScene] = useState(0);
  const [explorer, setExplorer] = useState(false);
  const [notice, setNotice] = useState("工作区已自动保存");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"workspace" | "topic" | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [activeTopicId, setActiveTopicId] = useState("");
  const [nodeKindFilter, setNodeKindFilter] = useState<NodeKind | "all">("all");
  const [nodeSort, setNodeSort] = useState<"manual" | "title" | "kind">("manual");
  const [assetFolderFilter, setAssetFolderFilter] = useState("all");
  const [assetKindFilter, setAssetKindFilter] = useState<AssetItem["kind"] | "all">("all");
  const [assetLayout, setAssetLayout] = useState<"grid" | "list">("grid");
  const [assetPreviewWidth, setAssetPreviewWidth] = useState(
    ASSET_PREVIEW_DEFAULT_WIDTH,
  );
  const [basicInfoOpen, setBasicInfoOpen] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<WorkspaceVersion[]>([]);
  const [graphContextMenu, setGraphContextMenu] = useState<GraphContextMenuState | null>(null);
  const [assetContextMenu, setAssetContextMenu] =
    useState<AssetContextMenuState | null>(null);
  const [assetClipboardId, setAssetClipboardId] = useState<string | null>(null);
  const [connectionPicker, setConnectionPicker] = useState<GraphConnectionPickerState | null>(null);
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);
  const [relationDraft, setRelationDraft] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyAvailability, setHistoryAvailability] = useState({
    undo: false,
    redo: false,
  });
  const [hydrated, setHydrated] = useState(false);
  const [workspaceDirectorySupported, setWorkspaceDirectorySupported] =
    useState(false);
  const [workspaceDirectoryConnected, setWorkspaceDirectoryConnected] =
    useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const assetBrowserRef = useRef<HTMLDivElement>(null);
  const assetPreviewWidthRef = useRef(ASSET_PREVIEW_DEFAULT_WIDTH);
  const assetResizeFrame = useRef<number | null>(null);
  const assetResizeState = useRef<{
    pointerId: number;
    min: number;
    max: number;
  } | null>(null);
  const flowInstance = useRef<ReactFlowInstance<StudioFlowNode, FlowEdge> | null>(null);
  const historyPast = useRef<GraphHistoryEntry[]>([]);
  const historyFuture = useRef<GraphHistoryEntry[]>([]);
  const nodeDragActive = useRef(false);
  const hydratedAssetIds = useRef(new Set<string>());
  const assetsRef = useRef<AssetItem[]>([]);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const graphClipboard = useRef<GraphClipboard | null>(null);

  const refreshHistoryAvailability = () => {
    setHistoryAvailability({
      undo: historyPast.current.length > 0,
      redo: historyFuture.current.length > 0,
    });
    setHistoryVersion((version) => version + 1);
  };

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const nodes = activeWorkspace?.nodes ?? [];
  const relations = activeWorkspace?.relations ?? [];
  const assets = activeWorkspace?.assets ?? [];
  const scenes = activeWorkspace?.scenes.length ? activeWorkspace.scenes : [blankScene];
  const topics = activeWorkspace?.topics ?? [];
  const graphAnnotations = activeWorkspace?.graphAnnotations ?? [];
  const deliveryPackages = activeWorkspace?.deliveryPackages ?? [];

  const updateActiveWorkspace = (
    updater: (workspace: WorkspaceRecord) => WorkspaceRecord,
  ) => {
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === activeWorkspaceId ? updater(workspace) : workspace,
      ),
    );
  };

  const setNodes = (
    updater: KnowledgeNode[] | ((current: KnowledgeNode[]) => KnowledgeNode[]),
  ) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: typeof updater === "function" ? updater(workspace.nodes) : updater,
    }));
  };

  const setAssets = (
    updater: AssetItem[] | ((current: AssetItem[]) => AssetItem[]),
  ) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      assets: typeof updater === "function" ? updater(workspace.assets) : updater,
    }));
  };

  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ??
    (selectedNodeId ? undefined : nodes[0]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const activeTopic =
    topics.find((topic) => topic.id === activeTopicId) ?? topics[0];
  const selectedNodeAssets = selectedNode
    ? assets.filter((asset) => selectedNode.assetIds?.includes(asset.id))
    : [];

  const typeCounts = useMemo(
    () =>
      nodes.reduce(
        (counts, node) => ({ ...counts, [node.kind]: counts[node.kind] + 1 }),
        {
          Space: 0,
          Person: 0,
          Event: 0,
          Document: 0,
          Artifact: 0,
          Media: 0,
          Concept: 0,
        } as Record<NodeKind, number>,
      ),
    [nodes],
  );

  const visibleNodes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = nodes.filter(
      (node) =>
        (nodeKindFilter === "all" || node.kind === nodeKindFilter) &&
        (!keyword ||
          [node.title, node.subtitle, node.kind, ...node.tags]
            .join(" ")
            .toLowerCase()
            .includes(keyword)),
    );
    if (nodeSort === "title") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    }
    if (nodeSort === "kind") {
      return [...filtered].sort((a, b) =>
        kindMeta[a.kind].label.localeCompare(kindMeta[b.kind].label, "zh-CN"),
      );
    }
    return filtered;
  }, [nodeKindFilter, nodeSort, nodes, search]);

  const filteredAssets = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const folderMatches =
        assetFolderFilter === "all" ||
        asset.path.includes(assetFolderFilter);
      const kindMatches =
        assetKindFilter === "all" || asset.kind === assetKindFilter;
      const searchMatches =
        !keyword ||
        `${asset.name} ${asset.path} ${asset.kind}`
          .toLowerCase()
          .includes(keyword);
      return folderMatches && kindMatches && searchMatches;
    });
  }, [assetFolderFilter, assetKindFilter, assets, search]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );
  const mapNodes = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        title: node.title,
        subtitle: node.subtitle,
        period: node.period,
        color: kindMeta[node.kind].color,
        geo: node.geo,
        yearFrom: node.yearFrom,
        yearTo: node.yearTo,
      })),
    [nodes],
  );
  const mapRelations = useMemo(
    () =>
      relations.map((relation) => ({
        id: relation.id,
        source: relation.source,
        target: relation.target,
        type: relation.type,
      })),
    [relations],
  );
  const selectMapNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    setInspectorOpen(true);
  }, []);

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice("工作区已自动保存"), 2400);
  };

  useEffect(() => {
    assetsRef.current = assets;
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId, assets]);

  const createGraphSnapshot = (): GraphHistoryEntry => ({
    workspaceId: activeWorkspaceId,
    nodes: nodes.map((node) => ({
      ...node,
      tags: [...node.tags],
      assetIds: [...(node.assetIds ?? [])],
    })),
    relations: relations.map((relation) => ({ ...relation })),
    assets: assets.map((asset) => ({ ...asset })),
    graphAnnotations: graphAnnotations.map((annotation) => ({
      ...annotation,
      nodeIds: [...annotation.nodeIds],
    })),
    deliveryPackages: deliveryPackages.map((item) => ({ ...item })),
  });

  const commitGraphHistory = () => {
    historyPast.current = [...historyPast.current.slice(-39), createGraphSnapshot()];
    historyFuture.current = [];
    refreshHistoryAvailability();
  };

  const restoreGraphSnapshot = (snapshot: GraphHistoryEntry) => {
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === snapshot.workspaceId
          ? {
              ...workspace,
              nodes: snapshot.nodes.map((node) => ({
                ...node,
                tags: [...node.tags],
                assetIds: [...(node.assetIds ?? [])],
              })),
              relations: snapshot.relations.map((relation) => ({ ...relation })),
              assets: snapshot.assets.map((asset) => ({ ...asset })),
              graphAnnotations: snapshot.graphAnnotations.map((annotation) => ({
                ...annotation,
                nodeIds: [...annotation.nodeIds],
              })),
              deliveryPackages: snapshot.deliveryPackages.map((item) => ({
                ...item,
              })),
            }
          : workspace,
      ),
    );
    const nextSelected = snapshot.nodes[0]?.id ?? "";
    setSelectedNodeId(nextSelected);
    setSelectedNodeIds(nextSelected ? [nextSelected] : []);
  };

  const undoGraph = () => {
    const snapshot = historyPast.current.at(-1);
    if (!snapshot || snapshot.workspaceId !== activeWorkspaceId) return;
    historyPast.current = historyPast.current.slice(0, -1);
    historyFuture.current = [...historyFuture.current, createGraphSnapshot()];
    restoreGraphSnapshot(snapshot);
    refreshHistoryAvailability();
    flash("已撤销图谱操作");
  };

  const redoGraph = () => {
    const snapshot = historyFuture.current.at(-1);
    if (!snapshot || snapshot.workspaceId !== activeWorkspaceId) return;
    historyFuture.current = historyFuture.current.slice(0, -1);
    historyPast.current = [...historyPast.current, createGraphSnapshot()];
    restoreGraphSnapshot(snapshot);
    refreshHistoryAvailability();
    flash("已重做图谱操作");
  };

  const attachAssetToNode = (nodeId: string, assetId: string) => {
    const target = nodes.find((node) => node.id === nodeId);
    const asset = assets.find((item) => item.id === assetId);
    if (!target || !asset || target.assetIds?.includes(assetId)) return;
    commitGraphHistory();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: workspace.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              assetIds: [...(node.assetIds ?? []), assetId],
              assetCount: (node.assetIds?.length ?? 0) + 1,
            }
          : node,
      ),
      assets: workspace.assets.map((item) =>
        item.id === assetId
          ? { ...item, references: item.references + 1 }
          : item,
      ),
    }));
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    flash(`已将「${asset.name}」放入节点`);
  };

  const importFilesIntoNode = async (nodeId: string, files: File[]) => {
    if (files.length === 0) return;
    commitGraphHistory();
    const additions = files.slice(0, 20).map((file, index): AssetItem => {
      const kind = assetKind(file);
      return {
        id: `node-import-${Date.now()}-${index}`,
        name: file.name,
        path: "节点直接导入/",
        kind,
        size: formatBytes(file.size),
        mimeType: file.type || undefined,
        fileSize: file.size,
        references: 1,
        previewUrl: URL.createObjectURL(file),
        localPath: nativeFilePath(file),
      };
    });
    await Promise.all(
      additions.map((asset, index) =>
        storeLocalAssetBlob(asset.id, files[index]),
      ),
    );
    const additionIds = additions.map((asset) => asset.id);
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      assets: [...additions, ...workspace.assets],
      nodes: workspace.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              assetIds: [...(node.assetIds ?? []), ...additionIds],
              assetCount: (node.assetIds?.length ?? 0) + additionIds.length,
            }
          : node,
      ),
    }));
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    flash(`已将 ${additions.length} 个本地文件导入节点`);
  };

  const [flowNodes, setFlowNodes] = useState<StudioFlowNode[]>(() =>
    buildFlowNodes(
      visibleNodes,
      graphAnnotations,
      assets,
      selectedNodeIds,
      () => undefined,
    ),
  );
  const flowNodesRef = useRef(flowNodes);

  useEffect(() => {
    setFlowNodes((current) => {
      const next = buildFlowNodes(
        visibleNodes,
        graphAnnotations,
        assets,
        selectedNodeIds,
        attachAssetToNode,
        current,
        nodeDragActive.current,
      );
      flowNodesRef.current = next;
      return next;
    });
  }, [assets, graphAnnotations, selectedNodeIds, visibleNodes]);

  const cancelRelationEdit = useCallback(() => {
    setEditingRelationId(null);
    setRelationDraft("");
  }, []);

  const beginRelationEdit = useCallback(
    (relationId: string) => {
      const relation = relations.find((item) => item.id === relationId);
      if (!relation) return;
      setEditingRelationId(relation.id);
      setRelationDraft(relation.type);
      setGraphContextMenu(null);
      setConnectionPicker(null);
    },
    [relations],
  );

  const commitRelationLabel = useCallback(
    (relationId: string, value: string) => {
      const relation = relations.find((item) => item.id === relationId);
      if (!relation) {
        cancelRelationEdit();
        return;
      }
      const nextLabel = value.trim() || relation.type;
      if (nextLabel !== relation.type) {
        commitGraphHistory();
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          relations: workspace.relations.map((item) =>
            item.id === relationId ? { ...item, type: nextLabel } : item,
          ),
        }));
        flash(`关系已修改为「${nextLabel}」`);
      }
      cancelRelationEdit();
    },
    [cancelRelationEdit, relations],
  );

  const flowEdges = useMemo<EditableRelationFlowEdge[]>(
    () =>
      relations
        .filter(
          (relation) =>
            visibleNodeIds.has(relation.source) && visibleNodeIds.has(relation.target),
        )
        .map((relation) => ({
          id: relation.id,
          source: relation.source,
          target: relation.target,
          type: "editableRelation" as const,
          className: "knowledge-edge",
          ariaLabel: `关系：${relation.type}，点击可修改`,
          data: {
            label: relation.type,
            draft:
              editingRelationId === relation.id
                ? relationDraft
                : relation.type,
            editing: editingRelationId === relation.id,
            onBeginEdit: beginRelationEdit,
            onDraftChange: setRelationDraft,
            onCommit: commitRelationLabel,
            onCancel: cancelRelationEdit,
          },
          style: { stroke: "#87847b", strokeWidth: 1.2 },
        })),
    [
      beginRelationEdit,
      cancelRelationEdit,
      commitRelationLabel,
      editingRelationId,
      relationDraft,
      relations,
      visibleNodeIds,
    ],
  );

  const saveWorkspaceVersion = () => {
    const snapshot: WorkspaceRecord = {
      ...activeWorkspace,
      nodes: activeWorkspace.nodes.map((node) => ({
        ...node,
        tags: [...node.tags],
        assetIds: [...(node.assetIds ?? [])],
      })),
      relations: activeWorkspace.relations.map((relation) => ({ ...relation })),
      assets: activeWorkspace.assets.map(
        ({ previewUrl: _previewUrl, ...asset }) => ({ ...asset }),
      ),
      scenes: activeWorkspace.scenes.map((scene) => ({ ...scene })),
      topics: activeWorkspace.topics.map((topic) => ({ ...topic })),
      graphAnnotations: activeWorkspace.graphAnnotations.map((annotation) => ({
        ...annotation,
        nodeIds: [...annotation.nodeIds],
      })),
      deliveryPackages: activeWorkspace.deliveryPackages.map((item) => ({
        ...item,
      })),
    };
    const version: WorkspaceVersion = {
      id: `version-${crypto.randomUUID()}`,
      workspaceId: activeWorkspace.id,
      workspaceName: activeWorkspace.name,
      createdAt: new Date().toISOString(),
      snapshot,
    };
    setVersions((current) => [version, ...current].slice(0, 50));
    flash("已保存本机版本快照");
  };

  const restoreWorkspaceVersion = (version: WorkspaceVersion) => {
    hydratedAssetIds.current.clear();
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === version.workspaceId
          ? {
              ...version.snapshot,
              assets: version.snapshot.assets.map((asset) => ({ ...asset })),
              deliveryPackages: (
                version.snapshot.deliveryPackages ?? []
              ).map((item) => ({ ...item })),
            }
          : workspace,
      ),
    );
    setVersionsOpen(false);
    flash(`已恢复 ${new Date(version.createdAt).toLocaleString("zh-CN")} 的版本`);
  };

  const downloadAsset = (asset: AssetItem | undefined) => {
    if (!asset?.previewUrl) {
      flash("该资源只有示例元数据，没有可打开的本机文件");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = asset.previewUrl;
    anchor.download = asset.name;
    anchor.click();
  };

  const downloadSelectedAsset = () => downloadAsset(selectedAsset);

  const revealAsset = async (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    let result = await revealLocalAsset(activeWorkspaceId, asset);
    if (!result.ok && result.reason === "unavailable") {
      try {
        const connected = await connectWorkspaceDirectory(activeWorkspaceId);
        if (!connected) return;
        setWorkspaceDirectoryConnected(true);
        result = await revealLocalAsset(activeWorkspaceId, asset);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        flash("无法打开本机文件位置");
        return;
      }
    }
    if (result.ok) {
      flash(
        result.via === "picker"
          ? `已打开「${asset.name}」的本机位置`
          : `已在资源管理器中打开「${asset.name}」`,
      );
      return;
    }
    if (result.reason === "unsupported") {
      flash("当前浏览器不支持打开本机文件位置");
      return;
    }
    if (result.reason === "missing") {
      flash("未找到本机源文件，请确认文件仍在原位置或先连接工作区");
      return;
    }
    flash("尚未记录本机路径。请选择本机文件夹后再试");
  };

  const revealNodeLocalFile = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    const firstAssetId = node?.assetIds?.[0];
    if (!firstAssetId) {
      flash("该节点尚未关联数字资源");
      return;
    }
    void revealAsset(firstAssetId);
    setGraphContextMenu(null);
  };

  const copyAsset = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    setAssetClipboardId(assetId);
    setAssetContextMenu(null);
    flash(`已复制资源「${asset.name}」`);
  };

  const duplicateAsset = async (assetId: string) => {
    const source = assets.find((item) => item.id === assetId);
    if (!source) return;
    const id = `asset-copy-${crypto.randomUUID()}`;
    let previewUrl = source.previewUrl;
    try {
      const blob = await readLocalAssetBlob(source.id);
      if (blob) {
        await storeLocalAssetBlob(id, blob);
        await writeWorkspaceAssetFile(
          activeWorkspaceId,
          {
            name: duplicateAssetName(source.name),
            path: source.path,
          },
          blob,
        ).catch(() => false);
        previewUrl = URL.createObjectURL(blob);
      }
    } catch {
      // Metadata-only sample assets can still be duplicated.
    }
    const duplicated: AssetItem = {
      ...source,
      id,
      name: duplicateAssetName(source.name),
      references: 0,
      previewUrl,
      localPath: undefined,
    };
    try {
      const workspacePath = await workspaceAssetLocalPath(
        activeWorkspaceId,
        duplicated,
      );
      if (workspacePath) duplicated.localPath = workspacePath;
    } catch {
      // Keep metadata-only duplicates without a local path.
    }
    commitGraphHistory();
    setAssets((current) => [duplicated, ...current]);
    setSelectedAssetId(id);
    flash(`已创建「${duplicated.name}」`);
  };

  const renameAsset = async (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    const extensionIndex = asset.name.lastIndexOf(".");
    const extension =
      extensionIndex > 0 ? asset.name.slice(extensionIndex) : "";
    const currentBaseName = extension
      ? asset.name.slice(0, extensionIndex)
      : asset.name;
    const enteredName = window
      .prompt(
        extension
          ? `重命名资源（扩展名保持 ${extension}）`
          : "重命名资源",
        currentBaseName,
      )
      ?.trim();
    const normalizedBaseName =
      extension &&
      enteredName?.toLowerCase().endsWith(extension.toLowerCase())
        ? enteredName.slice(0, -extension.length)
        : enteredName;
    const nextName = normalizedBaseName
      ? `${normalizedBaseName}${extension}`
      : "";
    if (!nextName || nextName === asset.name) return;
    if (/[<>:"/\\|?*\u0000-\u001f]/.test(nextName)) {
      flash("资源名称不能包含系统保留字符");
      return;
    }
    if (
      assets.some(
        (item) =>
          item.id !== assetId &&
          item.path === asset.path &&
          item.name.toLowerCase() === nextName.toLowerCase(),
      )
    ) {
      flash("当前目录已经存在同名资源");
      return;
    }
    const physicalRename = await renameWorkspaceAssetFile(
      activeWorkspaceId,
      asset,
      nextName,
    ).catch(() => "unavailable" as const);
    if (physicalRename === "conflict") {
      flash("本机工作区当前目录已经存在同名文件");
      return;
    }
    if (
      physicalRename === "missing" &&
      workspaceDirectoryConnected
    ) {
      flash("本机工作区中未找到该资源源文件，未执行重命名");
      return;
    }
    commitGraphHistory();
    setAssets((current) =>
      current.map((item) =>
        item.id === assetId
          ? {
              ...item,
              name: nextName,
              localPath: item.localPath
                ? replacePathFileName(item.localPath, nextName)
                : item.localPath,
            }
          : item,
      ),
    );
    flash(
      physicalRename === "renamed"
        ? `已重命名源文件为「${nextName}」`
        : `已重命名本地资源为「${nextName}」`,
    );
  };

  const createDeliveryPackage = async (assetId: string) => {
    const source = assets.find((item) => item.id === assetId);
    if (!source) return;
    if (source.kind !== "model") {
      flash("目前仅模型资源可以创建交付包");
      return;
    }
    const packageName = window
      .prompt("创建交付包：请输入英文名称", "")
      ?.trim();
    if (!packageName) return;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(packageName)) {
      flash("交付包名称必须以英文字母开头，且只能包含英文、数字和下划线");
      return;
    }
    if (
      deliveryPackages.some(
        (item) => item.name.toLowerCase() === packageName.toLowerCase(),
      )
    ) {
      flash(`交付包「${packageName}」已经存在`);
      return;
    }
    const blob = await readLocalAssetBlob(source.id);
    if (!blob) {
      flash("该模型没有可复制的本地源文件");
      return;
    }
    const extensionIndex = source.name.lastIndexOf(".");
    const extension =
      extensionIndex >= 0 ? source.name.slice(extensionIndex) : "";
    const sourceCopyName = `${packageName}${extension}`;
    const sourceCopyId = `asset-delivery-${crypto.randomUUID()}`;
    const packageId = `delivery-${crypto.randomUUID()}`;
    const packagePath = `Deliveries/${packageName}/`;
    const sourceCopy: AssetItem = {
      ...source,
      id: sourceCopyId,
      name: sourceCopyName,
      path: `${packagePath}Source/`,
      references: 0,
      sourceAssetId: source.id,
      previewUrl: URL.createObjectURL(blob),
    };
    await storeLocalAssetBlob(sourceCopyId, blob);
    const physicalDirectory = await createWorkspaceDeliveryDirectories(
      activeWorkspaceId,
      packageName,
      source,
      sourceCopyName,
      blob,
    ).catch(() => false);
    commitGraphHistory();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      assets: [sourceCopy, ...workspace.assets],
      deliveryPackages: [
        {
          id: packageId,
          name: packageName,
          sourceAssetId: source.id,
          sourceCopyAssetId: sourceCopyId,
          path: packagePath,
          createdAt: new Date().toISOString(),
          physicalDirectory,
        },
        ...workspace.deliveryPackages,
      ],
    }));
    setSelectedAssetId(sourceCopyId);
    flash(
      physicalDirectory
        ? `已创建交付包「${packageName}」及本机目录`
        : `已创建交付包「${packageName}」`,
    );
  };

  const deleteAsset = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;
    if (asset.references > 0) {
      flash(`「${asset.name}」仍有 ${asset.references} 个引用，不能直接删除`);
      return;
    }
    if (!window.confirm(`确定从当前工作区删除资源「${asset.name}」？`)) {
      return;
    }
    commitGraphHistory();
    const remaining = assets.filter((item) => item.id !== assetId);
    setAssets(remaining);
    setSelectedAssetId(remaining[0]?.id ?? "");
    flash(`已删除资源「${asset.name}」`);
  };

  const createCorrectedOcrText = async (
    source: AssetItem,
    document: import("./ocr/ocr-types").OcrDocumentResult,
  ) => {
    const text = document.pages.map((page) => page.correctedText ?? page.rawText).join("\n\n");
    if (!text.trim()) return;
    const id = `ocr-text-${crypto.randomUUID()}`;
    const name = `${source.name.replace(/\.[^.]+$/, "")}-校勘文本.md`;
    const blob = new Blob([`# ${source.name}\n\n${text}`], { type: "text/markdown;charset=utf-8" });
    await storeLocalAssetBlob(id, blob);
    const asset: AssetItem = {
      id,
      name,
      path: `${source.path}OCR/`,
      kind: "text",
      size: formatBytes(blob.size),
      fileSize: blob.size,
      mimeType: blob.type,
      references: 0,
      sourceAssetId: source.id,
      previewUrl: URL.createObjectURL(blob),
      description: `由「${source.name}」OCR 识别后人工校勘生成。`,
    };
    await writeWorkspaceAssetFile(activeWorkspaceId, asset, blob).catch(() => false);
    asset.localPath = await workspaceAssetLocalPath(activeWorkspaceId, asset);
    setAssets((current) => [asset, ...current]);
    setSelectedAssetId(id);
    flash("已创建校勘文本资源；其来源关系已保留");
  };

  useEffect(() => {
    const preventBrowserContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener("contextmenu", preventBrowserContextMenu);
    return () =>
      window.removeEventListener("contextmenu", preventBrowserContextMenu);
  }, []);

  useEffect(() => {
    const onAssetKeyDown = (event: KeyboardEvent) => {
      if (explorer || dialog) return;
      if (section === "graph" || section === "boards" || section === "map") return;
      if (section === "nodes") return;
      if (isTypingTarget(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === "c" && selectedAsset) {
        event.preventDefault();
        copyAsset(selectedAsset.id);
      } else if (ctrl && key === "v" && assetClipboardId) {
        event.preventDefault();
        void duplicateAsset(assetClipboardId);
      } else if (ctrl && key === "d" && selectedAsset) {
        event.preventDefault();
        void duplicateAsset(selectedAsset.id);
      } else if (ctrl && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoGraph();
      } else if (
        (ctrl && key === "y") ||
        (ctrl && key === "z" && event.shiftKey)
      ) {
        event.preventDefault();
        redoGraph();
      } else if (key === "f2" && selectedAsset) {
        event.preventDefault();
        void renameAsset(selectedAsset.id);
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedAsset
      ) {
        event.preventDefault();
        deleteAsset(selectedAsset.id);
      }
    };
    window.addEventListener("keydown", onAssetKeyDown);
    return () => window.removeEventListener("keydown", onAssetKeyDown);
  }, [
    assetClipboardId,
    dialog,
    explorer,
    section,
    selectedAsset,
    selectedNode,
    selectedNodeIds,
  ]);

  useEffect(() => {
    if (window.innerWidth <= 900) setInspectorOpen(false);
  }, []);

  useEffect(() => {
    setWorkspaceDirectorySupported(supportsWorkspaceDirectoryAccess());
    void workspaceDirectoryIsConnected(activeWorkspaceId)
      .then(setWorkspaceDirectoryConnected)
      .catch(() => setWorkspaceDirectoryConnected(false));
  }, [activeWorkspaceId]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("inscription-workspaces-v1");
      const storedActive = window.localStorage.getItem("inscription-active-workspace-v1");
      if (stored) {
        const parsed = JSON.parse(stored) as WorkspaceRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated = parsed.map((workspace) => {
            const sampleNodeAssets = new Map(
              initialNodes.map((node) => [node.id, node.assetIds ?? []]),
            );
            const knownNodeIds = new Set(workspace.nodes.map((node) => node.id));
            const knownRelationIds = new Set(
              workspace.relations.map((relation) => relation.id),
            );
            const knownAssetIds = new Set(workspace.assets.map((asset) => asset.id));
            const mergedNodes = workspace.nodes.map((node) => {
              const sample = initialNodes.find((item) => item.id === node.id);
              const years = SAMPLE_NODE_YEARS[node.id];
              const geo =
                sample?.geo || node.geo
                  ? {
                      ...(sample?.geo ?? {}),
                      ...(node.geo ?? {}),
                      polygon:
                        workspace.id === "workspace-ruins" && sample?.geo?.polygon
                          ? sample.geo.polygon
                          : (node.geo?.polygon ?? sample?.geo?.polygon),
                    }
                  : node.geo;
              return {
                ...node,
                assetIds: [
                  ...(node.assetIds ?? sampleNodeAssets.get(node.id) ?? []),
                ],
                geo,
                yearFrom: node.yearFrom ?? sample?.yearFrom ?? years?.yearFrom,
                yearTo: node.yearTo ?? sample?.yearTo ?? years?.yearTo,
              };
            });
            return {
              ...workspace,
              graphAnnotations: workspace.graphAnnotations ?? [],
              deliveryPackages: workspace.deliveryPackages ?? [],
              nodes:
                workspace.id === "workspace-ruins"
                  ? [
                      ...mergedNodes,
                      ...initialNodes
                        .filter((node) => !knownNodeIds.has(node.id))
                        .map((node) => stampSampleNode(node)),
                    ]
                  : mergedNodes,
              relations:
                workspace.id === "workspace-ruins"
                  ? [
                      ...workspace.relations,
                      ...initialRelations.filter(
                        (relation) => !knownRelationIds.has(relation.id),
                      ),
                    ]
                  : workspace.relations,
              assets:
                workspace.id === "workspace-ruins"
                  ? [
                      ...workspace.assets,
                      ...initialAssets.filter((asset) => !knownAssetIds.has(asset.id)),
                    ]
                  : workspace.assets,
            };
          });
          setWorkspaces(migrated);
          const nextActive =
            migrated.find((workspace) => workspace.id === storedActive)?.id ?? migrated[0].id;
          setActiveWorkspaceId(nextActive);
          const firstNodeId =
            migrated.find((workspace) => workspace.id === nextActive)?.nodes[0]?.id ?? "";
          setSelectedNodeId(firstNodeId);
          setSelectedNodeIds(firstNodeId ? [firstNodeId] : []);
          setSelectedAssetId(migrated.find((workspace) => workspace.id === nextActive)?.assets[0]?.id ?? "");
        }
      }
    } catch {
      setNotice("本地数据读取失败，已使用示例工作区");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("inscription-workspace-versions-v1");
      if (stored) {
        const parsed = JSON.parse(stored) as WorkspaceVersion[];
        if (Array.isArray(parsed)) setVersions(parsed);
      }
    } catch {
      // A broken version index must not prevent the workspace from opening.
    }
  }, []);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(
      "inscription-asset-preview-width-v1",
    );
    if (!storedValue) return;
    const storedWidth = Number(storedValue);
    if (!Number.isFinite(storedWidth)) return;
    const nextWidth = Math.max(
      ASSET_PREVIEW_MIN_WIDTH,
      Math.min(900, storedWidth),
    );
    assetPreviewWidthRef.current = nextWidth;
    setAssetPreviewWidth(nextWidth);
  }, []);

  useEffect(
    () => () => {
      if (assetResizeFrame.current !== null) {
        window.cancelAnimationFrame(assetResizeFrame.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    const persisted = workspaces.map((workspace) => ({
      ...workspace,
      assets: workspace.assets.map(({ previewUrl: _previewUrl, ...asset }) => asset),
    }));
    window.localStorage.setItem("inscription-workspaces-v1", JSON.stringify(persisted));
    window.localStorage.setItem("inscription-active-workspace-v1", activeWorkspaceId);
  }, [activeWorkspaceId, hydrated, workspaces]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      "inscription-workspace-versions-v1",
      JSON.stringify(versions),
    );
  }, [hydrated, versions]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const hydrateLocalAssets = async () => {
      for (const asset of assets) {
        if (
          asset.previewUrl ||
          hydratedAssetIds.current.has(asset.id)
        ) {
          continue;
        }
        hydratedAssetIds.current.add(asset.id);
        try {
          const blob = await readLocalAssetBlob(asset.id);
          if (!blob || cancelled) continue;
          const previewUrl = URL.createObjectURL(blob);
          setAssets((current) =>
            current.map((item) =>
              item.id === asset.id ? { ...item, previewUrl } : item,
            ),
          );
        } catch {
          // Sample metadata and older imports may not have a persisted source file.
        }
      }
    };
    void hydrateLocalAssets();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, assets, hydrated]);

  useEffect(() => {
    setActiveScene(0);
    const firstNodeId = activeWorkspace?.nodes[0]?.id ?? "";
    setSelectedNodeId(firstNodeId);
    setSelectedNodeIds(firstNodeId ? [firstNodeId] : []);
    setSelectedAssetId(activeWorkspace?.assets[0]?.id ?? "");
    setGraphContextMenu(null);
    setAssetContextMenu(null);
    cancelRelationEdit();
    historyPast.current = [];
    historyFuture.current = [];
    refreshHistoryAvailability();
  }, [activeWorkspaceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (explorer) setExplorer(false);
        setDialog(null);
        setWorkspaceMenuOpen(false);
        setGraphContextMenu(null);
        setAssetContextMenu(null);
        cancelRelationEdit();
      }
      if (event.altKey) {
        const target = sectionMeta.find(
          (item) => item.shortcut === event.key && !item.disabled,
        );
        if (target) setSection(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelRelationEdit, explorer]);

  const connectCurrentWorkspaceDirectory = async () => {
    if (!supportsWorkspaceDirectoryAccess()) {
      flash("当前浏览器不支持直接连接本机工作区");
      return;
    }
    try {
      const connected = await connectWorkspaceDirectory(activeWorkspaceId);
      if (!connected) return;
      setWorkspaceDirectoryConnected(true);
      let copied = 0;
      for (const asset of assets) {
        const blob = await readLocalAssetBlob(asset.id);
        if (!blob) continue;
        if (
          await writeWorkspaceAssetFile(
            activeWorkspaceId,
            asset,
            blob,
          ).catch(() => false)
        ) {
          copied += 1;
        }
      }
      const materializedPackageIds: string[] = [];
      for (const deliveryPackage of deliveryPackages) {
        const source = assets.find(
          (asset) => asset.id === deliveryPackage.sourceAssetId,
        );
        const sourceCopy = assets.find(
          (asset) => asset.id === deliveryPackage.sourceCopyAssetId,
        );
        if (!source || !sourceCopy) continue;
        const blob = await readLocalAssetBlob(sourceCopy.id);
        if (!blob) continue;
        if (
          await createWorkspaceDeliveryDirectories(
            activeWorkspaceId,
            deliveryPackage.name,
            source,
            sourceCopy.name,
            blob,
          ).catch(() => false)
        ) {
          materializedPackageIds.push(deliveryPackage.id);
        }
      }
      if (materializedPackageIds.length > 0) {
        const packageIds = new Set(materializedPackageIds);
        updateActiveWorkspace((workspace) => ({
          ...workspace,
          deliveryPackages: workspace.deliveryPackages.map((item) =>
            packageIds.has(item.id)
              ? { ...item, physicalDirectory: true }
              : item,
          ),
        }));
      }
      flash(`本机工作区已连接，已同步 ${copied} 个资源源文件`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      flash("连接本机工作区失败");
    }
  };

  const addImportedFiles = async (
    files: Array<{ file: File; path: string }>,
  ) => {
    if (files.length === 0) return;
    const additions = files.slice(0, 80).map(({ file, path }, index): AssetItem => {
      const kind = assetKind(file);
      return {
        id: `imported-${Date.now()}-${index}`,
        name: file.name,
        path: path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/` : "新导入/",
        kind,
        size: formatBytes(file.size),
        mimeType: file.type || undefined,
        fileSize: file.size,
        references: 0,
        previewUrl: URL.createObjectURL(file),
        localPath: nativeFilePath(file),
      };
    });
    await Promise.all(
      additions.map(async (asset, index) => {
        await storeLocalAssetBlob(asset.id, files[index].file);
        const written = await writeWorkspaceAssetFile(
          activeWorkspaceId,
          asset,
          files[index].file,
        ).catch(() => false);
        if (written) {
          asset.localPath =
            (await workspaceAssetLocalPath(activeWorkspaceId, asset)) ??
            asset.localPath;
        }
      }),
    );
    setAssets((current) => [...additions, ...current]);
    setSelectedAssetId(additions[0].id);
    setSection("assets");
    flash(`已导入 ${files.length} 个资源`);
  };

  const saveTextAsset = useCallback(
    async (assetId: string, text: string, reason: TextSaveReason) => {
      const asset = assetsRef.current.find((item) => item.id === assetId);
      if (!asset) return;
      const blob = new Blob([text], {
        type: mimeTypeForTextFile(asset.name),
      });
      await storeLocalAssetBlob(assetId, blob);
      await writeWorkspaceAssetFile(
        activeWorkspaceIdRef.current,
        asset,
        blob,
      ).catch(() => false);
      if (asset.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(asset.previewUrl);
      }
      const previewUrl = URL.createObjectURL(blob);
      const workspaceId = activeWorkspaceIdRef.current;
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === workspaceId
            ? {
                ...workspace,
                assets: workspace.assets.map((item) =>
                  item.id === assetId
                    ? {
                        ...item,
                        size: formatBytes(blob.size),
                        fileSize: blob.size,
                        mimeType: blob.type,
                        previewUrl,
                      }
                    : item,
                ),
              }
            : workspace,
        ),
      );
      if (reason === "manual") {
        flash(`已保存「${asset.name}」`);
      }
    },
    [],
  );

  const createBlankTextAsset = async (kind: "md" | "json" | "txt") => {
    const presets = {
      md: {
        title: "新建 Markdown 笔记",
        defaultName: "研究笔记",
        path: "研究笔记/",
      },
      json: {
        title: "新建 JSON 数据",
        defaultName: "数据记录",
        path: "结构化数据/",
      },
      txt: {
        title: "新建文本",
        defaultName: "文本",
        path: "文本/",
      },
    } as const;
    const preset = presets[kind];
    const entered = window.prompt(preset.title, preset.defaultName)?.trim();
    if (!entered) return;
    if (/[<>:"/\\|?*\u0000-\u001f]/.test(entered)) {
      flash("资源名称不能包含系统保留字符");
      return;
    }
    const baseName = entered.replace(/\.(md|json|txt)$/i, "");
    const name = uniqueAssetFileName(
      assetsRef.current,
      preset.path,
      baseName,
      `.${kind}`,
    );
    const text =
      kind === "md"
        ? markdownNoteTemplate(baseName)
        : kind === "json"
          ? jsonDataTemplate(baseName)
          : `${baseName}\n`;
    const id = `text-${crypto.randomUUID()}`;
    const blob = new Blob([text], { type: mimeTypeForTextFile(name) });
    await storeLocalAssetBlob(id, blob);
    const asset: AssetItem = {
      id,
      name,
      path: preset.path,
      kind: "text",
      size: formatBytes(blob.size),
      fileSize: blob.size,
      mimeType: blob.type,
      references: 0,
      previewUrl: URL.createObjectURL(blob),
    };
    await writeWorkspaceAssetFile(
      activeWorkspaceIdRef.current,
      asset,
      blob,
    ).catch(() => false);
    asset.localPath =
      (await workspaceAssetLocalPath(activeWorkspaceIdRef.current, asset)) ??
      asset.localPath;
    setAssets((current) => [asset, ...current]);
    setSelectedAssetId(id);
    setSection("assets");
    flash(`已创建「${name}」`);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const items = Array.from(event.dataTransfer.items);
    const entries = items
      .map((item) => {
        const withEntry = item as DataTransferItem & {
          webkitGetAsEntry?: () => EntryLike | null;
        };
        return (
          withEntry.webkitGetAsEntry?.() as EntryLike | null | undefined
        ) ?? null;
      })
      .filter((entry): entry is EntryLike => Boolean(entry));

    if (entries.length > 0) {
      const imported = (await Promise.all(entries.map((entry) => readEntry(entry)))).flat();
      await addImportedFiles(imported);
      return;
    }

    await addImportedFiles(
      Array.from(event.dataTransfer.files).map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      })),
    );
  };

  const handleDirectoryInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    }));
    void addImportedFiles(files);
    event.target.value = "";
  };

  const getAssetPreviewWidthBounds = useCallback(() => {
    const browser = assetBrowserRef.current;
    if (!browser) {
      return {
        min: ASSET_PREVIEW_MIN_WIDTH,
        max: 900,
      };
    }
    const treeWidth =
      browser.querySelector<HTMLElement>(".asset-tree-panel")?.offsetWidth ?? 0;
    return {
      min: ASSET_PREVIEW_MIN_WIDTH,
      max: Math.max(
        ASSET_PREVIEW_MIN_WIDTH,
        browser.clientWidth -
          treeWidth -
          ASSET_GALLERY_MIN_WIDTH -
          ASSET_PANEL_DIVIDER_WIDTH,
      ),
    };
  }, []);

  const applyAssetPreviewWidth = useCallback(
    (nextWidth: number, persist = false) => {
      const { min, max } = getAssetPreviewWidthBounds();
      const width = Math.round(Math.max(min, Math.min(max, nextWidth)));
      assetPreviewWidthRef.current = width;
      assetBrowserRef.current?.style.setProperty(
        "--asset-preview-width",
        `${width}px`,
      );
      if (persist) {
        setAssetPreviewWidth(width);
        window.localStorage.setItem(
          "inscription-asset-preview-width-v1",
          String(width),
        );
      }
    },
    [getAssetPreviewWidthBounds],
  );

  const finishAssetPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resize = assetResizeState.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (assetResizeFrame.current !== null) {
        window.cancelAnimationFrame(assetResizeFrame.current);
        assetResizeFrame.current = null;
      }
      assetResizeState.current = null;
      assetBrowserRef.current?.classList.remove("is-resizing");
      applyAssetPreviewWidth(assetPreviewWidthRef.current, true);
    },
    [applyAssetPreviewWidth],
  );

  useEffect(() => {
    if (section !== "assets") return;
    let resizeFrame: number | null = window.requestAnimationFrame(() => {
      applyAssetPreviewWidth(assetPreviewWidthRef.current, true);
      resizeFrame = null;
    });
    const onWindowResize = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        applyAssetPreviewWidth(assetPreviewWidthRef.current, true);
        resizeFrame = null;
      });
    };
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [
    applyAssetPreviewWidth,
    assetPreviewWidth,
    section,
    sidebarCollapsed,
  ]);

  const createNode = () => {
    commitGraphHistory();
    const id = `node-${crypto.randomUUID()}`;
    const created: KnowledgeNode = {
      id,
      kind: "Concept",
      title: "未命名知识节点",
      subtitle: "新建节点",
      period: "待考",
      summary: "在右侧属性面板补充该节点的研究内容。",
      tags: ["待整理"],
      assetCount: 0,
      assetIds: [],
      x: 350 + (nodes.length % 3) * 95,
      y: 120 + (nodes.length % 2) * 180,
    };
    setNodes((current) => [...current, created]);
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setSection("graph");
    flash("已创建 Concept Node");
  };

  const createMapPlaces = (places: MapPlaceDraft[]) => {
    if (places.length === 0) return;
    commitGraphHistory();
    const created: KnowledgeNode[] = places.map((place, index) => {
      const polygon = hasMapPolygon(place.geo);
      return {
        id: `node-${crypto.randomUUID()}`,
        kind: "Space",
        title: place.title.trim() || (polygon ? "未命名范围" : "未命名地点"),
        subtitle: polygon ? "地图范围" : "地图点",
        period:
          place.yearFrom != null || place.yearTo != null
            ? `${place.yearFrom ?? "?"}–${place.yearTo ?? "?"}`
            : "待考",
        summary:
          place.summary ??
          (polygon ? "在地图上绘制或导入的范围。" : "在地图上标注或导入的地点。"),
        tags: ["地图"],
        assetCount: 0,
        assetIds: [],
        geo: place.geo,
        yearFrom: place.yearFrom,
        yearTo: place.yearTo,
        x: 360 + ((nodes.length + index) % 4) * 90,
        y: 140 + Math.floor((nodes.length + index) / 4) * 80,
      };
    });
    setNodes((current) => [...current, ...created]);
    const last = created[created.length - 1];
    setSelectedNodeId(last.id);
    setSelectedNodeIds([last.id]);
    setInspectorOpen(true);
    flash(
      created.length === 1
        ? `已在地图创建「${created[0].title}」`
        : `已在地图创建 ${created.length} 个空间节点`,
    );
  };

  const updateSelectedNode = (patch: Partial<KnowledgeNode>) => {
    setNodes((current) =>
      current.map((node) => (node.id === selectedNodeId ? { ...node, ...patch } : node)),
    );
  };

  const updateSelectedNodeGeo = (
    field: "longitude" | "latitude" | "confidence",
    raw: string,
  ) => {
    if (!selectedNode) return;
    const parsed = parseCoordinate(raw);
    const current = selectedNode.geo ?? {};
    if (field === "confidence") {
      if (!hasMapLocation(current) && parsed == null) return;
      updateSelectedNode({
        geo: {
          ...current,
          confidence:
            parsed == null ? undefined : Math.min(1, Math.max(0, parsed)),
        },
      });
      return;
    }
    updateSelectedNode({
      geo: {
        ...current,
        [field]: parsed,
      },
    });
  };

  const openWorkspaceDialog = () => {
    setWorkspaceMenuOpen(false);
    setWorkspaceName("");
    setDialog("workspace");
  };

  const createWorkspace = () => {
    const name = workspaceName.trim();
    if (!name) return;
    const id = `workspace-${Date.now()}`;
    const created: WorkspaceRecord = {
      id,
      name,
      nodes: [],
      relations: [],
      assets: [],
      scenes: [{ ...blankScene, id: `scene-${Date.now()}` }],
      topics: [],
      graphAnnotations: [],
      deliveryPackages: [],
    };
    setWorkspaces((current) => [...current, created]);
    setActiveWorkspaceId(id);
    setDialog(null);
    setWorkspaceName("");
    setSection("graph");
    flash(`已创建工作区「${name}」`);
  };

  const switchWorkspace = (workspace: WorkspaceRecord) => {
    setActiveWorkspaceId(workspace.id);
    setWorkspaceMenuOpen(false);
    setSection("graph");
    flash(`已切换到「${workspace.name}」`);
  };

  const openTopicDialog = () => {
    setTopicTitle("");
    setTopicDescription("");
    setDialog("topic");
  };

  const createTopic = () => {
    const title = topicTitle.trim();
    if (!title) return;
    const created: TopicRecord = {
      id: `topic-${Date.now()}`,
      title,
      description: topicDescription.trim() || "尚未填写专题说明。",
      nodeCount: nodes.length,
      assetCount: assets.length,
    };
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      topics: [...workspace.topics, created],
    }));
    setDialog(null);
    setTopicTitle("");
    setTopicDescription("");
    setSection("topics");
    flash(`已创建专题「${title}」`);
  };

  const createScene = () => {
    const nextIndex = scenes.length + 1;
    const scene: NarrativeScene = {
      ...blankScene,
      id: `scene-${crypto.randomUUID()}`,
      index: String(nextIndex).padStart(2, "0"),
      title: `未命名场景 ${nextIndex}`,
      eyebrow: "新场景",
      description: "在这里填写本场景的叙事说明。",
    };
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      scenes: [...workspace.scenes, scene],
    }));
    setActiveScene(nextIndex - 1);
    flash("已添加 Narrative 场景");
  };

  const updateActiveScene = (patch: Partial<NarrativeScene>) => {
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      scenes: workspace.scenes.map((scene, index) =>
        index === activeScene ? { ...scene, ...patch } : scene,
      ),
    }));
  };

  const removeSelectedNodeTag = (tag: string) => {
    if (!selectedNode) return;
    updateSelectedNode({
      tags: selectedNode.tags.filter((item) => item !== tag),
    });
  };

  const addSelectedNodeTag = () => {
    if (!selectedNode) return;
    const value = window.prompt("输入新标签");
    const tag = value?.trim();
    if (!tag || selectedNode.tags.includes(tag)) return;
    updateSelectedNode({ tags: [...selectedNode.tags, tag] });
  };

  const onFlowNodesChange = useCallback<OnNodesChange<StudioFlowNode>>(
    (changes) => {
      if (
        changes.some(
          (change) => change.type === "position" && change.dragging,
        )
      ) {
        nodeDragActive.current = true;
      }

      const next = applyNodeChanges<StudioFlowNode>(
        changes,
        flowNodesRef.current,
      );
      flowNodesRef.current = next;
      setFlowNodes(next);

      if (changes.some((change) => change.type === "select")) {
        const selection = next
          .filter((node) => node.selected)
          .map((node) => node.id);
        setSelectedNodeIds(selection);
        setSelectedNodeId(selection.at(-1) ?? "");
      }
    },
    [],
  );

  const persistFlowPositions = () => {
    nodeDragActive.current = false;
    const positions = new Map(
      flowNodesRef.current.map((node) => [node.id, node.position]),
    );

    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: workspace.nodes.map((node) => {
        const position = positions.get(node.id);
        if (!position || (position.x === node.x && position.y === node.y)) {
          return node;
        }
        return { ...node, x: position.x, y: position.y };
      }),
      graphAnnotations: workspace.graphAnnotations.map((annotation) => {
        const position = positions.get(annotation.id);
        if (
          !position ||
          (position.x === annotation.x && position.y === annotation.y)
        ) {
          return annotation;
        }
        return { ...annotation, x: position.x, y: position.y };
      }),
    }));
    flash("节点位置已保存");
  };

  const deleteNodesById = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    commitGraphHistory();
    updateActiveWorkspace((workspace) => {
      const removedReferenceCounts = new Map<string, number>();
      workspace.nodes
        .filter((node) => idSet.has(node.id))
        .flatMap((node) => node.assetIds ?? [])
        .forEach((assetId) =>
          removedReferenceCounts.set(
            assetId,
            (removedReferenceCounts.get(assetId) ?? 0) + 1,
          ),
        );
      return {
        ...workspace,
        nodes: workspace.nodes.filter((node) => !idSet.has(node.id)),
        assets: workspace.assets.map((asset) => ({
          ...asset,
          references: Math.max(
            0,
            asset.references - (removedReferenceCounts.get(asset.id) ?? 0),
          ),
        })),
        graphAnnotations: workspace.graphAnnotations.filter(
          (annotation) => !idSet.has(annotation.id),
        ),
        relations: workspace.relations.filter(
          (relation) => !idSet.has(relation.source) && !idSet.has(relation.target),
        ),
      };
    });
    const remaining = nodes.filter((node) => !idSet.has(node.id));
    const nextSelected = remaining[0]?.id ?? "";
    setSelectedNodeId(nextSelected);
    setSelectedNodeIds(nextSelected ? [nextSelected] : []);
    setGraphContextMenu(null);
    flash(`已删除 ${ids.length} 个节点及其关系`);
  };

  const deleteSelectedNodes = () => deleteNodesById(selectedNodeIds);

  const duplicateSelectedNodes = () => {
    const sourceNodes = nodes.filter((node) => selectedNodeIds.includes(node.id));
    if (sourceNodes.length === 0) return;
    commitGraphHistory();
    const idMap = new Map(
      sourceNodes.map((node, index) => [node.id, `${node.id}-copy-${Date.now()}-${index}`]),
    );
    const copies = sourceNodes.map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      title: `${node.title} 副本`,
      tags: [...node.tags],
      assetIds: [...(node.assetIds ?? [])],
      x: node.x + 48,
      y: node.y + 48,
    }));
    const copiedRelations = relations
      .filter(
        (relation) => idMap.has(relation.source) && idMap.has(relation.target),
      )
      .map((relation, index) => ({
        ...relation,
        id: `relation-copy-${Date.now()}-${index}`,
        source: idMap.get(relation.source)!,
        target: idMap.get(relation.target)!,
      }));
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: [...workspace.nodes, ...copies],
      relations: [...workspace.relations, ...copiedRelations],
      assets: workspace.assets.map((asset) => ({
        ...asset,
        references:
          asset.references +
          copies.filter((node) => node.assetIds?.includes(asset.id)).length,
      })),
    }));
    const copyIds = copies.map((node) => node.id);
    setSelectedNodeIds(copyIds);
    setSelectedNodeId(copyIds.at(-1) ?? "");
    setGraphContextMenu(null);
    flash(`已复制 ${copies.length} 个节点`);
  };

  const copySelectedNodes = () => {
    const sourceNodes = nodes.filter((node) => selectedNodeIds.includes(node.id));
    if (sourceNodes.length === 0) return;
    graphClipboard.current = {
      nodes: sourceNodes.map((node) => ({
        ...node,
        tags: [...node.tags],
        assetIds: [...(node.assetIds ?? [])],
      })),
      relations: relations
        .filter(
          (relation) =>
            selectedNodeIds.includes(relation.source) &&
            selectedNodeIds.includes(relation.target),
        )
        .map((relation) => ({ ...relation })),
    };
    setGraphContextMenu(null);
    flash(`已复制 ${sourceNodes.length} 个节点`);
  };

  const pasteGraphClipboard = () => {
    const clipboard = graphClipboard.current;
    if (!clipboard || clipboard.nodes.length === 0) return;
    commitGraphHistory();
    const idMap = new Map(
      clipboard.nodes.map((node, index) => [
        node.id,
        `${node.id}-paste-${Date.now()}-${index}`,
      ]),
    );
    const copies = clipboard.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      title: `${node.title} 副本`,
      tags: [...node.tags],
      assetIds: [...(node.assetIds ?? [])],
      x: node.x + 48,
      y: node.y + 48,
    }));
    const copiedRelations = clipboard.relations
      .filter(
        (relation) => idMap.has(relation.source) && idMap.has(relation.target),
      )
      .map((relation, index) => ({
        ...relation,
        id: `relation-paste-${Date.now()}-${index}`,
        source: idMap.get(relation.source)!,
        target: idMap.get(relation.target)!,
      }));
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: [...workspace.nodes, ...copies],
      relations: [...workspace.relations, ...copiedRelations],
      assets: workspace.assets.map((asset) => ({
        ...asset,
        references:
          asset.references +
          copies.filter((node) => node.assetIds?.includes(asset.id)).length,
      })),
    }));
    const copyIds = copies.map((node) => node.id);
    setSelectedNodeIds(copyIds);
    setSelectedNodeId(copyIds.at(-1) ?? "");
    setGraphContextMenu(null);
    flash(`已粘贴 ${copies.length} 个节点`);
  };

  const renameSelectedNode = () => {
    const node = nodes.find((item) => item.id === selectedNodeId);
    if (!node) return;
    const nextTitle = window.prompt("重命名节点", node.title)?.trim();
    if (!nextTitle || nextTitle === node.title) return;
    commitGraphHistory();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: workspace.nodes.map((item) =>
        item.id === node.id ? { ...item, title: nextTitle } : item,
      ),
    }));
    setGraphContextMenu(null);
    flash(`已重命名为「${nextTitle}」`);
  };

  const disconnectSelectedNodes = () => {
    if (selectedNodeIds.length === 0) return;
    const idSet = new Set(selectedNodeIds);
    commitGraphHistory();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      relations: workspace.relations.filter(
        (relation) => !idSet.has(relation.source) && !idSet.has(relation.target),
      ),
    }));
    setGraphContextMenu(null);
    flash("已断开所选节点的全部关系");
  };

  const alignSelectedGraphItems = () => {
    const selected = flowNodesRef.current.filter((node) => node.selected);
    if (selected.length < 2) {
      flash("请先选择至少两个图谱对象");
      return;
    }
    commitGraphHistory();
    const top = Math.min(...selected.map((node) => node.position.y));
    const selectedIds = new Set(selected.map((node) => node.id));
    const next = flowNodesRef.current.map((node) =>
      selectedIds.has(node.id)
        ? { ...node, position: { ...node.position, y: top } }
        : node,
    );
    flowNodesRef.current = next;
    setFlowNodes(next);

    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: workspace.nodes.map((node) =>
        selectedIds.has(node.id) ? { ...node, y: top } : node,
      ),
      graphAnnotations: workspace.graphAnnotations.map((annotation) =>
        selectedIds.has(annotation.id)
          ? { ...annotation, y: top }
          : annotation,
      ),
    }));
    flash(`已顶部对齐 ${selected.length} 个对象`);
  };

  const createGraphAnnotation = () => {
    const selected = flowNodesRef.current.filter(
      (node): node is KnowledgeFlowNode =>
        Boolean(node.selected) && node.type === "knowledge",
    );
    if (selected.length === 0) {
      flash("请先框选需要备注的节点");
      return;
    }
    commitGraphHistory();
    const left = Math.min(...selected.map((node) => node.position.x));
    const top = Math.min(...selected.map((node) => node.position.y));
    const right = Math.max(
      ...selected.map(
        (node) => node.position.x + (node.measured?.width ?? 214),
      ),
    );
    const bottom = Math.max(
      ...selected.map(
        (node) => node.position.y + (node.measured?.height ?? 142),
      ),
    );
    const annotation: GraphAnnotation = {
      id: `graph-annotation-${Date.now()}`,
      title: "研究备注",
      nodeIds: selected.map((node) => node.id),
      x: left - 32,
      y: top - 56,
      width: right - left + 64,
      height: bottom - top + 88,
    };
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      graphAnnotations: [annotation, ...workspace.graphAnnotations],
    }));
    setSelectedNodeId(annotation.id);
    setSelectedNodeIds([annotation.id]);
    flash(`已为 ${selected.length} 个节点创建备注框`);
  };

  const createConnectedNode = (kind: NodeKind) => {
    if (!connectionPicker) return;
    commitGraphHistory();
    const id = `node-${crypto.randomUUID()}`;
    const label = kindMeta[kind].label;
    const created: KnowledgeNode = {
      id,
      kind,
      title: `未命名${label}节点`,
      subtitle: "牵线创建",
      period: "待考",
      summary: `由关联节点牵线创建的${label}对象。`,
      tags: ["待整理"],
      assetCount: 0,
      assetIds: [],
      x: connectionPicker.flowX,
      y: connectionPicker.flowY,
    };
    const relation: Relation = {
      id: `relation-${crypto.randomUUID()}`,
      source: connectionPicker.sourceNodeId,
      target: id,
      type: "关联",
      evidence: "画布牵线创建",
    };
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      nodes: [...workspace.nodes, created],
      relations: [...workspace.relations, relation],
    }));
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setConnectionPicker(null);
    flash(`已创建并连接${label}节点`);
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    if (
      relations.some(
        (relation) =>
          relation.source === connection.source && relation.target === connection.target,
      )
    ) {
      return;
    }
    commitGraphHistory();
    updateActiveWorkspace((workspace) => ({
      ...workspace,
      relations: [
        ...workspace.relations,
        {
          id: `relation-${Date.now()}`,
          source: connection.source!,
          target: connection.target!,
          type: "关联",
          evidence: "画布连接",
        },
      ],
    }));
    flash("已建立节点关系");
  };

  const onConnectEnd = (
    event: MouseEvent | TouchEvent,
    state: FinalConnectionState,
  ) => {
    if (state.isValid || !state.fromNode || !flowInstance.current) return;
    const pointer =
      "clientX" in event
        ? { x: event.clientX, y: event.clientY }
        : {
            x: event.changedTouches[0]?.clientX ?? 0,
            y: event.changedTouches[0]?.clientY ?? 0,
          };
    const flowPosition = flowInstance.current.screenToFlowPosition(pointer);
    setConnectionPicker({
      sourceNodeId: state.fromNode.id,
      x: pointer.x,
      y: pointer.y,
      flowX: flowPosition.x - 90,
      flowY: flowPosition.y - 55,
    });
  };

  const onNodeContextMenu = (
    event: ReactMouseEvent,
    node: StudioFlowNode,
  ) => {
    event.preventDefault();
    if (!selectedNodeIds.includes(node.id)) {
      setSelectedNodeId(node.id);
      setSelectedNodeIds([node.id]);
    }
    setGraphContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  };

  const onPaneContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    setGraphContextMenu({ x: event.clientX, y: event.clientY, nodeId: null });
  };

  useEffect(() => {
    if (section !== "graph" && section !== "nodes") return;
    const onGraphKeyDown = (event: KeyboardEvent) => {
      if (explorer || dialog) return;
      if (isTypingTarget(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (section === "graph" && ctrl && key === "a") {
        event.preventDefault();
        const ids = visibleNodes.map((node) => node.id);
        setSelectedNodeIds(ids);
        setSelectedNodeId(ids.at(-1) ?? "");
        return;
      }
      if (ctrl && key === "c") {
        event.preventDefault();
        copySelectedNodes();
        return;
      }
      if (ctrl && key === "v") {
        event.preventDefault();
        pasteGraphClipboard();
        return;
      }
      if (ctrl && key === "d") {
        event.preventDefault();
        duplicateSelectedNodes();
        return;
      }
      if (ctrl && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoGraph();
        return;
      }
      if ((ctrl && key === "y") || (ctrl && key === "z" && event.shiftKey)) {
        event.preventDefault();
        redoGraph();
        return;
      }
      if (key === "f2") {
        event.preventDefault();
        renameSelectedNode();
        return;
      }
      if (section === "graph" && key === "q" && !ctrl) {
        event.preventDefault();
        alignSelectedGraphItems();
        return;
      }
      if (section === "graph" && key === "c" && !ctrl) {
        event.preventDefault();
        createGraphAnnotation();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedNodes();
      }
    };
    window.addEventListener("keydown", onGraphKeyDown);
    return () => window.removeEventListener("keydown", onGraphKeyDown);
  }, [section, selectedNodeIds, visibleNodes, nodes, relations, activeWorkspaceId]);

  const assetMenuTarget = assetContextMenu?.assetId
    ? assets.find((asset) => asset.id === assetContextMenu.assetId)
    : undefined;
  const assetContextMenuItems: ApplicationContextMenuItem[] = assetMenuTarget
    ? [
        {
          id: "preview",
          label: "预览资源",
          onSelect: () => setSelectedAssetId(assetMenuTarget.id),
        },
        {
          id: "attach",
          label: selectedNode
            ? `关联到「${selectedNode.title}」`
            : "关联到当前 Node",
          disabled:
            !selectedNode ||
            selectedNode.assetIds?.includes(assetMenuTarget.id),
          onSelect: () => {
            if (selectedNode) {
              attachAssetToNode(selectedNode.id, assetMenuTarget.id);
            }
          },
        },
        {
          id: "reference-board",
          label: "在参考板中使用",
          onSelect: () => {
            setSelectedAssetId(assetMenuTarget.id);
            setSection("boards");
          },
        },
        {
          id: "ocr",
          label: "OCR 文本识别",
          disabled: assetMenuTarget.kind !== "image",
          onSelect: () => {
            setSelectedAssetId(assetMenuTarget.id);
            setSection("ocr");
          },
        },
        {
          id: "delivery-package",
          label: "创建交付包",
          disabled: assetMenuTarget.kind !== "model",
          onSelect: () => void createDeliveryPackage(assetMenuTarget.id),
        },
        { id: "asset-separator-1", label: "", separator: true },
        {
          id: "copy",
          label: "复制",
          shortcut: "Ctrl+C",
          onSelect: () => copyAsset(assetMenuTarget.id),
        },
        {
          id: "paste",
          label: "粘贴副本",
          shortcut: "Ctrl+V",
          disabled: !assetClipboardId,
          onSelect: () => {
            if (assetClipboardId) void duplicateAsset(assetClipboardId);
          },
        },
        {
          id: "duplicate",
          label: "复制（原地）",
          shortcut: "Ctrl+D",
          onSelect: () => void duplicateAsset(assetMenuTarget.id),
        },
        {
          id: "rename",
          label: "重命名",
          shortcut: "F2",
          onSelect: () => renameAsset(assetMenuTarget.id),
        },
        {
          id: "download",
          label: "下载原文件",
          disabled: !assetMenuTarget.previewUrl,
          onSelect: () => downloadAsset(assetMenuTarget),
        },
        {
          id: "reveal",
          label: "浏览到本地文件",
          onSelect: () => void revealAsset(assetMenuTarget.id),
        },
        { id: "asset-separator-2", label: "", separator: true },
        {
          id: "undo",
          label: "撤销",
          shortcut: "Ctrl+Z",
          disabled: !historyAvailability.undo,
          onSelect: undoGraph,
        },
        {
          id: "redo",
          label: "重做",
          shortcut: "Ctrl+Y",
          disabled: !historyAvailability.redo,
          onSelect: redoGraph,
        },
        { id: "asset-separator-3", label: "", separator: true },
        {
          id: "delete",
          label:
            assetMenuTarget.references > 0
              ? `删除（仍有 ${assetMenuTarget.references} 个引用）`
              : "删除",
          shortcut: "Delete",
          disabled: assetMenuTarget.references > 0,
          danger: true,
          onSelect: () => deleteAsset(assetMenuTarget.id),
        },
      ]
    : [
        {
          id: "import",
          label: "导入文件或目录",
          onSelect: () => directoryInput.current?.click(),
        },
        {
          id: "new-markdown",
          label: "新建 Markdown 笔记",
          onSelect: () => void createBlankTextAsset("md"),
        },
        {
          id: "new-json",
          label: "新建 JSON 数据",
          onSelect: () => void createBlankTextAsset("json"),
        },
        {
          id: "new-text",
          label: "新建文本",
          onSelect: () => void createBlankTextAsset("txt"),
        },
        {
          id: "paste",
          label: "粘贴副本",
          shortcut: "Ctrl+V",
          disabled: !assetClipboardId,
          onSelect: () => {
            if (assetClipboardId) void duplicateAsset(assetClipboardId);
          },
        },
        {
          id: "layout",
          label: assetLayout === "grid" ? "切换为列表排列" : "切换为网格排列",
          onSelect: () =>
            setAssetLayout((layout) => (layout === "grid" ? "list" : "grid")),
        },
        { id: "asset-separator", label: "", separator: true },
        {
          id: "undo",
          label: "撤销",
          shortcut: "Ctrl+Z",
          disabled: !historyAvailability.undo,
          onSelect: undoGraph,
        },
        {
          id: "redo",
          label: "重做",
          shortcut: "Ctrl+Y",
          disabled: !historyAvailability.redo,
          onSelect: redoGraph,
        },
      ];

  if (explorer) {
    return (
      <ExplorerView
        sceneIndex={activeScene}
        scenes={scenes}
        topicTitle={`${activeTopic?.title ?? activeWorkspace.name} · ${activeTopic?.description ?? "数字专题"}`}
        onSceneChange={setActiveScene}
        onExit={() => setExplorer(false)}
      />
    );
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <StudioLogo />

        <div className="workspace-switcher">
          <span>工作区</span>
          <button
            type="button"
            aria-label="切换工作区"
            aria-expanded={workspaceMenuOpen}
            onClick={() => setWorkspaceMenuOpen((open) => !open)}
          >
            {activeWorkspace.name} <span>{workspaceMenuOpen ? "⌃" : "⌄"}</span>
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu">
              <div className="workspace-menu-title">本地工作区</div>
              {workspaces.map((workspace) => (
                <button
                  type="button"
                  key={workspace.id}
                  className={workspace.id === activeWorkspaceId ? "active" : ""}
                  onClick={() => switchWorkspace(workspace)}
                >
                  <span>{workspace.name}</span>
                  {workspace.id === activeWorkspaceId && <i>当前</i>}
                </button>
              ))}
              <button type="button" className="workspace-menu-create" onClick={openWorkspaceDialog}>
                ＋ 新建工作区
              </button>
            </div>
          )}
        </div>

        <nav className="mode-tabs" aria-label="工作模式">
          {sectionMeta.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "active" : ""}
              disabled={item.disabled}
              title={item.disabled ? `${item.label} 功能完善中` : undefined}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <span className="save-state">
            <i /> {notice}
          </span>
          <button className="button-quiet" type="button" onClick={saveWorkspaceVersion}>
            保存版本
          </button>
          <button className="button-quiet" type="button" onClick={() => setVersionsOpen(true)}>
            版本记录
          </button>
        </div>
      </header>

      <div
        className={`studio-body ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${
          inspectorOpen &&
          section !== "boards" &&
          section !== "assets" &&
          section !== "archive" &&
          section !== "ocr"
            ? ""
            : "inspector-hidden"
        }`}
      >
        <aside className="studio-sidebar">
          <div className="sidebar-heading">
            <div>
              <span>KNOWLEDGE BASE</span>
              <h2>知识节点</h2>
            </div>
            <button type="button" onClick={() => setSidebarCollapsed((value) => !value)}>
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              <button className="new-node-button" type="button" onClick={createNode}>
                <span>＋</span> 创建 Node
              </button>

              <div className="node-type-list">
                {(Object.keys(kindMeta) as NodeKind[]).map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    className={nodeKindFilter === kind ? "active" : ""}
                    onClick={() => {
                      setNodeKindFilter((current) =>
                        current === kind ? "all" : kind,
                      );
                      setSection("graph");
                    }}
                  >
                    <span
                      className="node-type-mark"
                      style={{ "--node-color": kindMeta[kind].color } as CSSProperties}
                    >
                      {kindMeta[kind].mark}
                    </span>
                    <strong>{kindMeta[kind].label}</strong>
                    <small>{typeCounts[kind]}</small>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={`sidebar-sync ${
                  workspaceDirectoryConnected ? "connected" : ""
                }`}
                disabled={!workspaceDirectorySupported}
                onClick={() => void connectCurrentWorkspaceDirectory()}
              >
                <span className="sync-icon">↻</span>
                <div>
                  <strong>
                    {workspaceDirectoryConnected
                      ? "本机工作区已连接"
                      : workspaceDirectorySupported
                        ? "连接本机工作区"
                        : "使用内部资源库"}
                  </strong>
                  <small>
                    {workspaceDirectoryConnected
                      ? "源文件与交付目录可直接写入"
                      : workspaceDirectorySupported
                        ? "启用真实文件重命名与交付目录"
                        : "资源仍保存在当前设备"}
                  </small>
                </div>
              </button>
            </>
          )}
        </aside>

        <section className="workspace-main">
          <div className="workspace-toolbar">
            <div className="breadcrumb">
              <span>{activeWorkspace.name}</span>
              <b>/</b>
              <strong>{sectionMeta.find((item) => item.id === section)?.label}</strong>
            </div>

            <label className="global-search">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索节点、标签或正文…"
              />
              <kbd>⌘ K</kbd>
            </label>

            <div className="toolbar-actions">
              <select
                aria-label="筛选节点类型"
                value={nodeKindFilter}
                onChange={(event) =>
                  setNodeKindFilter(event.target.value as NodeKind | "all")
                }
              >
                <option value="all">全部类型</option>
                {(Object.keys(kindMeta) as NodeKind[]).map((kind) => (
                  <option value={kind} key={kind}>
                    {kindMeta[kind].label}
                  </option>
                ))}
              </select>
              <select
                aria-label="节点排序"
                value={nodeSort}
                onChange={(event) =>
                  setNodeSort(event.target.value as "manual" | "title" | "kind")
                }
              >
                <option value="manual">画布顺序</option>
                <option value="title">按标题</option>
                <option value="kind">按类型</option>
              </select>
              <button
                type="button"
                className={section === "graph" ? "active" : ""}
                onClick={() => setSection("graph")}
              >
                图谱
              </button>
              <button
                type="button"
                className={section === "nodes" ? "active" : ""}
                onClick={() => setSection("nodes")}
              >
                列表
              </button>
            </div>
          </div>

          <div className="workspace-content">
            {section === "graph" && (
              <div className="graph-workspace">
                <div className="graph-intro">
                  <div>
                    <span>工作区知识图谱</span>
                    <h1>{topics[0]?.title ?? activeWorkspace.name}</h1>
                  </div>
                  <div className="graph-intro-actions">
                    <p>
                      {visibleNodes.length} 个可见节点 · {relations.length} 条关系 · 滚轮缩放
                    </p>
                    <button type="button" onClick={() => setInspectorOpen((open) => !open)}>
                      {inspectorOpen ? "隐藏属性" : "显示属性"}
                    </button>
                  </div>
                </div>

                <div className="graph-canvas">
                  <ReactFlowCanvas
                    nodes={flowNodes}
                    edges={flowEdges}
                    nodeTypes={graphNodeTypes}
                    edgeTypes={editableRelationEdgeTypes}
                    onInit={(instance) => {
                      flowInstance.current =
                        instance as unknown as ReactFlowInstance<
                          StudioFlowNode,
                          FlowEdge
                        >;
                    }}
                    onNodesChange={
                      onFlowNodesChange as OnNodesChange<FlowNode>
                    }
                    onConnect={onConnect}
                    onConnectEnd={onConnectEnd}
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes("application/x-ins-asset") ||
                        event.dataTransfer.types.includes("Files")
                      ) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }
                    }}
                    onDrop={(event) => {
                      const assetId = event.dataTransfer.getData("application/x-ins-asset");
                      const target = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest<HTMLElement>("[data-node-id]");
                      const nodeId = target?.dataset.nodeId;
                      if (!nodeId) return;
                      event.preventDefault();
                      if (assetId) {
                        attachAssetToNode(nodeId, assetId);
                        return;
                      }
                      void importFilesIntoNode(
                        nodeId,
                        Array.from(event.dataTransfer.files),
                      );
                    }}
                    onNodeClick={(event, node) => {
                      setSelectedNodeId(node.id);
                      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
                        setSelectedNodeIds([node.id]);
                      }
                      setGraphContextMenu(null);
                      setConnectionPicker(null);
                      if (node.type === "knowledge") setInspectorOpen(true);
                    }}
                    onEdgeClick={(event, edge) => {
                      event.stopPropagation();
                      beginRelationEdit(edge.id);
                    }}
                    onPaneClick={() => {
                      setSelectedNodeId("");
                      setSelectedNodeIds([]);
                      setGraphContextMenu(null);
                      setConnectionPicker(null);
                    }}
                    onNodeContextMenu={(event, node) =>
                      onNodeContextMenu(
                        event as ReactMouseEvent,
                        node as StudioFlowNode,
                      )
                    }
                    onPaneContextMenu={(event) =>
                      onPaneContextMenu(event as ReactMouseEvent)
                    }
                    onNodeDragStart={() => {
                      nodeDragActive.current = true;
                      commitGraphHistory();
                    }}
                    onNodeDragStop={persistFlowPositions}
                    fitView
                    fitViewOptions={{ padding: 0.22, maxZoom: 1.1 }}
                    minZoom={0.25}
                    maxZoom={2.5}
                    zoomOnScroll
                    zoomOnPinch
                    panOnScroll={false}
                    selectionOnDrag
                    selectionMode={SelectionMode.Partial}
                    panOnDrag={[1, 2]}
                    panActivationKeyCode="Space"
                    multiSelectionKeyCode={["Shift", "Meta", "Control"]}
                    deleteKeyCode={null}
                    nodesConnectable
                    connectionRadius={30}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background gap={18} size={1} color="#cbc7bc" />
                    <Controls
                      position="bottom-right"
                      showInteractive={false}
                      aria-label="图谱缩放与视图控制"
                    />
                    <MiniMap
                      position="bottom-left"
                      pannable
                      zoomable
                      nodeColor={(node) =>
                        node.type === "graphAnnotation"
                          ? "#c8b98e"
                          : kindMeta[
                              (node.data as KnowledgeFlowNode["data"]).node.kind
                            ].color
                      }
                      nodeStrokeColor="#171714"
                      maskColor="rgba(247, 245, 239, 0.76)"
                      ariaLabel="图谱缩略图：点击或拖动可移动视口"
                    />

                    <Panel position="top-left" className="graph-asset-dock">
                      <div className="graph-asset-dock-heading">
                        <div>
                          <span>ASSET DOCK</span>
                          <strong>拖入节点</strong>
                        </div>
                        <button type="button" onClick={() => setSection("assets")}>全部</button>
                      </div>
                      <div className="graph-asset-dock-list">
                        {assets.slice(0, 6).map((asset) => (
                          <button
                            type="button"
                            draggable
                            className="nodrag nopan"
                            key={asset.id}
                            title={`拖动「${asset.name}」到节点`}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("application/x-ins-asset", asset.id);
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => {
                              if (selectedNodeId) {
                                attachAssetToNode(selectedNodeId, asset.id);
                              } else {
                                flash("请先选择一个节点，再点击或拖入资产");
                              }
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedAssetId(asset.id);
                              setAssetContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                assetId: asset.id,
                              });
                            }}
                          >
                            <span className={`asset-${asset.kind}`}>{assetGlyph(asset.kind)}</span>
                            <small>{asset.name}</small>
                          </button>
                        ))}
                      </div>
                      <p>拖入 Node 成为内容 · 从节点右侧圆点牵线创建对象</p>
                    </Panel>

                    {selectedNodeIds.length > 0 && (
                      <Panel position="top-right" className="graph-selection-toolbar">
                        <span>{selectedNodeIds.length} 个对象</span>
                        <button type="button" onClick={alignSelectedGraphItems}>
                          Q 对齐
                        </button>
                        <button type="button" onClick={createGraphAnnotation}>
                          C 备注
                        </button>
                        <button type="button" onClick={duplicateSelectedNodes}>复制</button>
                        <button
                          type="button"
                          onClick={undoGraph}
                          data-history-version={historyVersion}
                        >
                          撤销
                        </button>
                        <button type="button" className="danger" onClick={deleteSelectedNodes}>
                          删除
                        </button>
                      </Panel>
                    )}

                    {nodes.length === 0 && (
                      <Panel position="top-center" className="graph-empty">
                        <span>EMPTY GRAPH</span>
                        <h2>这个工作区还没有节点</h2>
                        <p>创建第一个 Node，再把图片、文献、模型或视频直接拖进去。</p>
                        <button type="button" className="button-primary" onClick={createNode}>
                          ＋ 创建第一个 Node
                        </button>
                      </Panel>
                    )}
                  </ReactFlowCanvas>
                </div>
              </div>
            )}

            {section === "map" && (
              <StudioMapCanvas
                nodes={mapNodes}
                relations={mapRelations}
                selectedNodeId={selectedNodeId}
                onSelectNode={selectMapNode}
                onCreatePlaces={createMapPlaces}
                onNotice={flash}
              />
            )}

            {section === "nodes" && (
              <div className="nodes-view">
                <div className="section-hero compact">
                  <div>
                    <span>KNOWLEDGE NODES</span>
                    <h1>全部节点</h1>
                    <p>对象是知识组织的核心，文件只作为节点所引用的数字资源。</p>
                  </div>
                  <button className="button-primary" type="button" onClick={createNode}>
                    ＋ 创建 Node
                  </button>
                </div>
                <div
                  className="node-table"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setGraphContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      nodeId: null,
                    });
                  }}
                >
                  <div className="node-table-header">
                    <span>节点</span>
                    <span>类型</span>
                    <span>时间</span>
                    <span>资源</span>
                    <span>更新</span>
                  </div>
                  {visibleNodes.map((node, index) => (
                    <button
                      type="button"
                      key={node.id}
                      className={selectedNodeId === node.id ? "selected" : ""}
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        setSelectedNodeIds([node.id]);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedNodeId(node.id);
                        setSelectedNodeIds([node.id]);
                        setGraphContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          nodeId: node.id,
                        });
                      }}
                    >
                      <span className="node-table-name">
                        <i style={{ background: kindMeta[node.kind].color }}>
                          {kindMeta[node.kind].mark}
                        </i>
                        <span>
                          <strong>{node.title}</strong>
                          <small>{node.subtitle}</small>
                        </span>
                      </span>
                      <span>{kindMeta[node.kind].label}</span>
                      <span>{node.period}</span>
                      <span>{node.assetCount}</span>
                      <span>{index === 0 ? "刚刚" : `${index + 1} 天前`}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {section === "assets" && (
              <div className="assets-view">
                <div
                  ref={assetBrowserRef}
                  className="asset-browser"
                >
                  <div className="asset-tree-panel">
                    <div className="panel-heading">
                      <span>资源目录</span>
                      <button
                        type="button"
                        aria-label="导入资源目录"
                        onClick={() => directoryInput.current?.click()}
                      >
                        ＋
                      </button>
                    </div>
                    <div className="asset-tree">
                      <button
                        type="button"
                        className={`root ${assetFolderFilter === "all" ? "active" : ""}`}
                        onClick={() => setAssetFolderFilter("all")}
                      >
                        <span>▾</span> 📁 Assets <small>{assets.length}</small>
                      </button>
                      <button
                        type="button"
                        className={
                          assetFolderFilter === "Deliveries" ? "active" : ""
                        }
                        onClick={() => setAssetFolderFilter("Deliveries")}
                      >
                        <span>{deliveryPackages.length ? "▾" : "›"}</span>
                        📦 交付包
                        <small>{deliveryPackages.length}</small>
                      </button>
                      {deliveryPackages.map((item) => (
                        <button
                          type="button"
                          className={`nested ${
                            assetFolderFilter ===
                            `Deliveries/${item.name}`
                              ? "active"
                              : ""
                          }`}
                          key={item.id}
                          onClick={() =>
                            setAssetFolderFilter(
                              `Deliveries/${item.name}`,
                            )
                          }
                        >
                          <span />
                          📁 {item.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={assetFolderFilter === "图像档案" ? "active" : ""}
                        onClick={() => setAssetFolderFilter("图像档案")}
                      >
                        <span>▾</span> 📁 图像档案
                      </button>
                      <button
                        type="button"
                        className={`nested ${assetFolderFilter === "建筑测绘" ? "active" : ""}`}
                        onClick={() => setAssetFolderFilter("建筑测绘")}
                      >
                        <span /> 📁 建筑测绘
                      </button>
                      <button
                        type="button"
                        className={`nested ${assetFolderFilter === "历史图像" ? "active" : ""}`}
                        onClick={() => setAssetFolderFilter("历史图像")}
                      >
                        <span /> 📁 历史图像
                      </button>
                      <button
                        type="button"
                        className={assetFolderFilter === "文献档案" ? "active" : ""}
                        onClick={() => setAssetFolderFilter("文献档案")}
                      >
                        <span>›</span> 📁 文献档案
                      </button>
                      <button
                        type="button"
                        className={assetFolderFilter === "三维模型" ? "active" : ""}
                        onClick={() => setAssetFolderFilter("三维模型")}
                      >
                        <span>›</span> 📁 三维模型
                      </button>
                      <button
                        type="button"
                        className={assetFolderFilter === "田野调查" ? "active" : ""}
                        onClick={() => setAssetFolderFilter("田野调查")}
                      >
                        <span>›</span> 📁 田野调查
                      </button>
                    </div>
                    <div
                      className={`drop-zone ${dragActive ? "active" : ""}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                    >
                      <span>↓</span>
                      <strong>拖入文件或整个目录</strong>
                      <small>文件将复制到当前 Workspace</small>
                      <div className="drop-zone-actions">
                        <button type="button" onClick={() => directoryInput.current?.click()}>
                          选择目录
                        </button>
                        <button
                          type="button"
                          onClick={() => void createBlankTextAsset("md")}
                        >
                          新建笔记
                        </button>
                        <button
                          type="button"
                          onClick={() => void createBlankTextAsset("json")}
                        >
                          新建 JSON
                        </button>
                      </div>
                      <input
                        ref={directoryInput}
                        type="file"
                        multiple
                        hidden
                        onChange={handleDirectoryInput}
                        {...directoryInputProps}
                      />
                    </div>
                  </div>

                  <div className="asset-gallery-panel">
                    <div className="panel-heading">
                      <div>
                        <span>全部资源</span>
                        <small>{filteredAssets.length} 项</small>
                      </div>
                      <div className="panel-heading-actions">
                        <select
                          value={assetKindFilter}
                          aria-label="筛选资源类型"
                          onChange={(event) =>
                            setAssetKindFilter(
                              event.target.value as AssetItem["kind"] | "all",
                            )
                          }
                        >
                          <option value="all">全部类型</option>
                          <option value="image">图片</option>
                          <option value="document">文献</option>
                          <option value="model">三维模型</option>
                          <option value="video">视频</option>
                          <option value="audio">音频</option>
                          <option value="text">文字</option>
                        </select>
                        <button
                          type="button"
                          aria-label="切换资源排列方式"
                          onClick={() =>
                            setAssetLayout((layout) =>
                              layout === "grid" ? "list" : "grid",
                            )
                          }
                        >
                          {assetLayout === "grid" ? "☷" : "▦"}
                        </button>
                      </div>
                    </div>
                    <div
                      className={`asset-gallery ${assetLayout}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setAssetContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          assetId: null,
                        });
                      }}
                    >
                      {filteredAssets.map((asset) => (
                        <button
                          type="button"
                          key={asset.id}
                          className={selectedAssetId === asset.id ? "selected" : ""}
                          onClick={() => setSelectedAssetId(asset.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedAssetId(asset.id);
                            setAssetContextMenu({
                              x: event.clientX,
                              y: event.clientY,
                              assetId: asset.id,
                            });
                          }}
                        >
                          <div className={`asset-thumb asset-${asset.kind}`}>
                            {asset.previewUrl && asset.kind === "image" ? (
                              // Local blob URLs are intentionally rendered directly.
                              <img src={asset.previewUrl} alt="" />
                            ) : (
                              <span>{assetGlyph(asset.kind)}</span>
                            )}
                            <i>{asset.kind}</i>
                          </div>
                          <strong>{asset.name}</strong>
                          <small>{asset.size} · {asset.references} 个引用</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="asset-panel-resizer"
                    role="separator"
                    tabIndex={0}
                    aria-label="调整资源画廊与资源预览宽度"
                    aria-orientation="vertical"
                    aria-valuemin={ASSET_PREVIEW_MIN_WIDTH}
                    aria-valuemax={900}
                    aria-valuenow={assetPreviewWidth}
                    aria-valuetext={`资源预览宽度 ${assetPreviewWidth} 像素`}
                    title="左右拖动调整画廊与预览宽度"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      assetResizeState.current = {
                        pointerId: event.pointerId,
                        ...getAssetPreviewWidthBounds(),
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                      assetBrowserRef.current?.classList.add("is-resizing");
                    }}
                    onPointerMove={(event) => {
                      const resize = assetResizeState.current;
                      const browser = assetBrowserRef.current;
                      if (
                        !resize ||
                        resize.pointerId !== event.pointerId ||
                        !browser
                      ) {
                        return;
                      }
                      const nextWidth = Math.max(
                        resize.min,
                        Math.min(
                          resize.max,
                          browser.getBoundingClientRect().right - event.clientX,
                        ),
                      );
                      assetPreviewWidthRef.current = nextWidth;
                      if (assetResizeFrame.current !== null) {
                        window.cancelAnimationFrame(assetResizeFrame.current);
                      }
                      assetResizeFrame.current = window.requestAnimationFrame(
                        () => {
                          browser.style.setProperty(
                            "--asset-preview-width",
                            `${Math.round(assetPreviewWidthRef.current)}px`,
                          );
                          assetResizeFrame.current = null;
                        },
                      );
                    }}
                    onPointerUp={finishAssetPanelResize}
                    onPointerCancel={finishAssetPanelResize}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight"
                      ) {
                        return;
                      }
                      event.preventDefault();
                      applyAssetPreviewWidth(
                        assetPreviewWidthRef.current +
                          (event.key === "ArrowLeft" ? 24 : -24),
                        true,
                      );
                    }}
                  >
                    <span aria-hidden="true" />
                  </div>

                  <div
                    className="asset-preview-panel"
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!selectedAsset) return;
                      setAssetContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        assetId: selectedAsset.id,
                      });
                    }}
                  >
                    <AssetPreview
                      asset={selectedAsset}
                      onDownload={downloadSelectedAsset}
                      onSaveText={saveTextAsset}
                      action={
                        <button
                          type="button"
                          className="button-primary"
                          disabled={!selectedNode}
                          onClick={() => {
                            if (!selectedNode || !selectedAsset) return;
                            attachAssetToNode(
                              selectedNode.id,
                              selectedAsset.id,
                            );
                            setSection("graph");
                          }}
                        >
                          关联到
                          {selectedNode
                            ? `「${selectedNode.title}」`
                            : " Node"}
                        </button>
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {section === "boards" && (
              <ReferenceBoardView
                key={activeWorkspaceId}
                workspaceId={activeWorkspaceId}
                workspaceName={activeWorkspace.name}
                assets={assets}
                selectedAssetId={selectedAssetId}
                onSelectAsset={setSelectedAssetId}
                onRenameAsset={(assetId) => void renameAsset(assetId)}
                onCreateDeliveryPackage={(assetId) =>
                  void createDeliveryPackage(assetId)
                }
                onDeleteAsset={deleteAsset}
                onHydrateAsset={(assetId, previewUrl) => {
                  setAssets((current) =>
                    current.map((asset) =>
                      asset.id === assetId
                        ? { ...asset, previewUrl }
                        : asset,
                    ),
                  );
                }}
                onCreateAssets={(createdAssets) => {
                  if (createdAssets.length === 0) return;
                  setAssets((current) => [
                    ...createdAssets,
                    ...current.filter(
                      (asset) =>
                        !createdAssets.some(
                          (created) => created.id === asset.id,
                        ),
                    ),
                  ]);
                  void Promise.all(
                    createdAssets.map(async (asset) => {
                      const blob = await readLocalAssetBlob(asset.id);
                      if (!blob) return;
                      const written = await writeWorkspaceAssetFile(
                        activeWorkspaceId,
                        asset,
                        blob,
                      ).catch(() => false);
                      if (!written) return;
                      const localPath = await workspaceAssetLocalPath(
                        activeWorkspaceId,
                        asset,
                      );
                      if (!localPath) return;
                      setAssets((current) =>
                        current.map((item) =>
                          item.id === asset.id ? { ...item, localPath } : item,
                        ),
                      );
                    }),
                  );
                  setSelectedAssetId(createdAssets[0].id);
                  flash(`已自动创建 ${createdAssets.length} 个资源`);
                }}
                onChangeAssetReference={(assetId, delta) => {
                  setAssets((current) =>
                    current.map((asset) =>
                      asset.id === assetId
                        ? {
                            ...asset,
                            references: Math.max(0, asset.references + delta),
                          }
                        : asset,
                    ),
                  );
                }}
                onRevealAsset={(assetId) => void revealAsset(assetId)}
                onSaveText={saveTextAsset}
              />
            )}

            {section === "archive" && (
              <ArchiveView
                workspaceId={activeWorkspace.id}
                workspaceName={activeWorkspace.name}
                nodes={nodes}
                relations={relations}
                assets={assets}
                onUpdateAsset={(assetId, patch) =>
                  setAssets((current) =>
                    current.map((asset) =>
                      asset.id === assetId ? { ...asset, ...patch } : asset,
                    ),
                  )
                }
                onNotice={flash}
              />
            )}

            {section === "ocr" && (
              <OcrPanel
                asset={selectedAsset}
                onCreateCorrectedText={(source, document) =>
                  void createCorrectedOcrText(source as AssetItem, document)
                }
                onNotice={flash}
              />
            )}

            {section === "narrative" && (
              <div className="narrative-view">
                <div className="scene-sidebar">
                  <div className="panel-heading">
                    <span>场景</span>
                    <button type="button" onClick={createScene}>＋</button>
                  </div>
                  {scenes.map((scene, index) => (
                    <button
                      type="button"
                      key={scene.id}
                      className={activeScene === index ? "active" : ""}
                      onClick={() => setActiveScene(index)}
                    >
                      <span>{scene.index}</span>
                      <div>
                        <strong>{scene.title}</strong>
                        <small>{scene.eyebrow}</small>
                      </div>
                      <i>⠿</i>
                    </button>
                  ))}
                  <button className="add-scene" type="button" onClick={createScene}>
                    ＋ 添加场景
                  </button>
                </div>

                <div className="narrative-canvas-wrap">
                  <div className="narrative-toolbar">
                    <div>
                      <span className="narrative-tool active">选择</span>
                      <button type="button" disabled title="自由文字块编排尚未完成">文字</button>
                      <button type="button" disabled title="节点卡片编排尚未完成">节点</button>
                      <button type="button" disabled title="资源卡片编排尚未完成">资源</button>
                      <button type="button" disabled title="三维场景编排尚未完成">3D</button>
                    </div>
                    <span>场景 {scenes[activeScene].index} · 16:9</span>
                    <button type="button" onClick={() => setExplorer(true)}>▶ 预览</button>
                  </div>
                  <div className="narrative-canvas">
                    <div className="scene-frame">
                      <div className="scene-frame-grid" />
                      <div className="scene-frame-copy">
                        <input
                          aria-label="场景眉题"
                          value={scenes[activeScene].eyebrow}
                          onChange={(event) =>
                            updateActiveScene({ eyebrow: event.target.value })
                          }
                        />
                        <input
                          className="scene-title-input"
                          aria-label="场景标题"
                          value={scenes[activeScene].title}
                          onChange={(event) =>
                            updateActiveScene({ title: event.target.value })
                          }
                        />
                        <textarea
                          aria-label="场景说明"
                          value={scenes[activeScene].description}
                          onChange={(event) =>
                            updateActiveScene({ description: event.target.value })
                          }
                        />
                      </div>
                      <div className="scene-node-card">
                        <span>{selectedNode?.kind.toUpperCase() ?? "NODE"}</span>
                        <strong>{selectedNode?.title ?? "未选择节点"}</strong>
                        <small>当前工作区节点引用</small>
                      </div>
                      <div className="selection-outline">
                        <i className="handle-a" />
                        <i className="handle-b" />
                        <i className="handle-c" />
                        <i className="handle-d" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {section === "topics" && (
              <div className="topics-view">
                <div className="section-hero">
                  <div>
                    <span>CURATED RESEARCH</span>
                    <h1>专题</h1>
                    <p>专题组织和呈现已有知识节点，不创建新的数据孤岛。</p>
                  </div>
                  <button type="button" className="button-primary" onClick={openTopicDialog}>
                    ＋ 新建专题
                  </button>
                </div>
                <div className="topic-grid">
                  {topics.map((topic, index) =>
                    index === 0 ? (
                      <button
                        type="button"
                        className="topic-featured"
                        key={topic.id}
                        onClick={() => {
                          setActiveTopicId(topic.id);
                          setExplorer(true);
                        }}
                      >
                        <div className="topic-pattern">
                          <span>INSCRIPTION · {String(index + 1).padStart(2, "0")}</span>
                          <strong>{topic.title}</strong>
                          <small>{topic.description}</small>
                        </div>
                        <div className="topic-card-meta">
                          <span>{topic.nodeCount} Nodes</span>
                          <span>{scenes.length} Narratives</span>
                          <b>进入 Explorer →</b>
                        </div>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="topic-card"
                        key={topic.id}
                        onClick={() => {
                          setActiveTopicId(topic.id);
                          setExplorer(true);
                        }}
                      >
                        <span className="topic-index">{String(index + 1).padStart(2, "0")}</span>
                        <h3>{topic.title}</h3>
                        <p>{topic.description}</p>
                        <small>{topic.nodeCount} Nodes · {topic.assetCount} Assets</small>
                      </button>
                    ),
                  )}
                  {topics.length === 0 && (
                    <button type="button" className="topic-empty" onClick={openTopicDialog}>
                      <span>EMPTY COLLECTION</span>
                      <strong>创建第一个专题</strong>
                      <small>从当前工作区的节点和资源开始编排。</small>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {section !== "assets" && section !== "boards" && section !== "archive" && selectedNode && (
          <aside className="inspector-panel">
            <div className="inspector-header">
              <div>
                <span>NODE INSPECTOR</span>
                <strong>{kindMeta[selectedNode.kind].label}节点</strong>
              </div>
              <button type="button" aria-label="关闭属性面板" onClick={() => setInspectorOpen(false)}>×</button>
            </div>

            <div className="inspector-scroll">
              <div className="node-identity">
                <span
                  className="node-identity-mark"
                  style={{ background: kindMeta[selectedNode.kind].color }}
                >
                  {kindMeta[selectedNode.kind].mark}
                </span>
                <div>
                  <small>{selectedNode.kind.toUpperCase()} NODE</small>
                  <input
                    value={selectedNode.title}
                    onChange={(event) => updateSelectedNode({ title: event.target.value })}
                  />
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>基本信息</span>
                  <button
                    type="button"
                    aria-label={basicInfoOpen ? "收起基本信息" : "展开基本信息"}
                    onClick={() => setBasicInfoOpen((open) => !open)}
                  >
                    {basicInfoOpen ? "⌃" : "⌄"}
                  </button>
                </div>
                {basicInfoOpen && (
                  <>
                    <label>
                      <span>副标题</span>
                      <input
                        value={selectedNode.subtitle}
                        onChange={(event) => updateSelectedNode({ subtitle: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>时间</span>
                      <input
                        value={selectedNode.period}
                        onChange={(event) => updateSelectedNode({ period: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>起年</span>
                      <input
                        inputMode="numeric"
                        placeholder="1602"
                        value={selectedNode.yearFrom ?? ""}
                        onChange={(event) =>
                          updateSelectedNode({ yearFrom: parseYear(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      <span>迄年</span>
                      <input
                        inputMode="numeric"
                        placeholder="2026"
                        value={selectedNode.yearTo ?? ""}
                        onChange={(event) =>
                          updateSelectedNode({ yearTo: parseYear(event.target.value) })
                        }
                      />
                    </label>
                    <label>
                      <span>经度</span>
                      <input
                        inputMode="decimal"
                        placeholder="113.54072"
                        value={selectedNode.geo?.longitude ?? ""}
                        onChange={(event) =>
                          updateSelectedNodeGeo("longitude", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>纬度</span>
                      <input
                        inputMode="decimal"
                        placeholder="22.19756"
                        value={selectedNode.geo?.latitude ?? ""}
                        onChange={(event) =>
                          updateSelectedNodeGeo("latitude", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>坐标可信度 0–1</span>
                      <input
                        inputMode="decimal"
                        placeholder="0.9"
                        value={selectedNode.geo?.confidence ?? ""}
                        onChange={(event) =>
                          updateSelectedNodeGeo("confidence", event.target.value)
                        }
                      />
                    </label>
                    {(hasMapLocation(selectedNode.geo) ||
                      hasMapPolygon(selectedNode.geo)) && (
                      <button
                        type="button"
                        className="button-quiet"
                        onClick={() => setSection("map")}
                      >
                        在地图中查看
                      </button>
                    )}
                    <label>
                      <span>摘要</span>
                      <textarea
                        rows={4}
                        value={selectedNode.summary}
                        onChange={(event) => updateSelectedNode({ summary: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>来源</span>
                      <input
                        value={selectedNode.source ?? ""}
                        placeholder="文献、馆藏或调查来源"
                        onChange={(event) => updateSelectedNode({ source: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>版权</span>
                      <input
                        value={selectedNode.rights ?? ""}
                        placeholder="版权持有人或许可方式"
                        onChange={(event) => updateSelectedNode({ rights: event.target.value })}
                      />
                    </label>
                    <div className="tag-field">
                      <span>标签</span>
                      <div>
                        {selectedNode.tags.map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            onClick={() => removeSelectedNodeTag(tag)}
                          >
                            {tag} ×
                          </button>
                        ))}
                        <button type="button" onClick={addSelectedNodeTag}>＋</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>关系</span>
                  <button
                    type="button"
                    aria-label="在图谱中添加关系"
                    onClick={() => {
                      setSection("graph");
                      flash("请从当前节点右侧圆点牵线，连接或创建关联对象");
                    }}
                  >
                    ＋
                  </button>
                </div>
                <div className="relation-list">
                  {relations
                    .filter(
                      (relation) =>
                        relation.source === selectedNode.id || relation.target === selectedNode.id,
                    )
                    .map((relation) => {
                      const peerId =
                        relation.source === selectedNode.id ? relation.target : relation.source;
                      const peer = nodes.find((node) => node.id === peerId);
                      return (
                        <button
                          type="button"
                          key={relation.id}
                          onClick={() => {
                            if (!peer) return;
                            setSelectedNodeId(peer.id);
                            setSelectedNodeIds([peer.id]);
                          }}
                        >
                          <span>{relation.type}</span>
                          <strong>{peer?.title}</strong>
                          <small title={relation.evidence}>有证据</small>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>数字资源</span>
                  <button type="button" onClick={() => setSection("assets")}>管理</button>
                </div>
                <div className="mini-assets">
                  {selectedNodeAssets.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      onClick={() => {
                        setSelectedAssetId(asset.id);
                        setSection("assets");
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedAssetId(asset.id);
                        setAssetContextMenu({
                          x: event.clientX,
                          y: event.clientY,
                          assetId: asset.id,
                        });
                      }}
                    >
                      <span className={`asset-${asset.kind}`}>{assetGlyph(asset.kind)}</span>
                      <small>{asset.name}</small>
                    </button>
                  ))}
                  {selectedNodeAssets.length === 0 && (
                    <button
                      type="button"
                      className="mini-assets-empty"
                      onClick={() => setSection("graph")}
                    >
                      <span>＋</span>
                      <small>从资产坞拖入内容</small>
                    </button>
                  )}
                </div>
              </div>

              <div className="inspector-version">
                <span>最近修订</span>
                <strong>
                  {versions.find((version) => version.workspaceId === activeWorkspaceId)
                    ? new Date(
                        versions.find(
                          (version) => version.workspaceId === activeWorkspaceId,
                        )!.createdAt,
                      ).toLocaleString("zh-CN")
                    : "尚未保存版本"}
                </strong>
                <button type="button" onClick={() => setVersionsOpen(true)}>
                  查看版本记录 →
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {assetContextMenu && (
        <ApplicationContextMenu
          x={assetContextMenu.x}
          y={assetContextMenu.y}
          items={assetContextMenuItems}
          ariaLabel={
            assetMenuTarget
              ? `资源「${assetMenuTarget.name}」快捷操作`
              : "资源目录快捷操作"
          }
          onClose={() => setAssetContextMenu(null)}
        />
      )}

      {graphContextMenu && (
        <>
          <button
            type="button"
            className="graph-menu-backdrop"
            aria-label="关闭图谱菜单"
            onClick={() => setGraphContextMenu(null)}
          />
          <div
            className="graph-context-menu"
            style={{
              left: `min(${graphContextMenu.x}px, calc(100vw - 250px))`,
              top: `min(${graphContextMenu.y}px, calc(100vh - 330px))`,
            }}
          >
            {graphContextMenu.nodeId ? (
              <>
                <button type="button" onClick={() => {
                  setInspectorOpen(true);
                  setGraphContextMenu(null);
                }}>
                  <span>查看全部关联项</span>
                  <kbd>Enter</kbd>
                </button>
                <button type="button" onClick={duplicateSelectedNodes}>
                  <span>复制节点</span>
                  <kbd>Ctrl+D</kbd>
                </button>
                <button type="button" onClick={copySelectedNodes}>
                  <span>复制</span>
                  <kbd>Ctrl+C</kbd>
                </button>
                <button type="button" onClick={pasteGraphClipboard}>
                  <span>粘贴</span>
                  <kbd>Ctrl+V</kbd>
                </button>
                <button type="button" onClick={renameSelectedNode}>
                  <span>重命名</span>
                  <kbd>F2</kbd>
                </button>
                <button
                  type="button"
                  disabled={!hasMapLocation(
                    nodes.find((item) => item.id === graphContextMenu.nodeId)?.geo,
                  )}
                  onClick={() => {
                    setSection("map");
                    setGraphContextMenu(null);
                  }}
                >
                  <span>在地图中查看</span>
                </button>
                <button
                  type="button"
                  disabled={!nodes.find((item) => item.id === graphContextMenu.nodeId)?.assetIds?.length}
                  onClick={() => revealNodeLocalFile(graphContextMenu.nodeId!)}
                >
                  <span>浏览到本地文件</span>
                </button>
                <button type="button" onClick={disconnectSelectedNodes}>
                  <span>断开全部关系</span>
                </button>
                <i />
                <button type="button" className="danger" onClick={deleteSelectedNodes}>
                  <span>删除节点</span>
                  <kbd>Delete</kbd>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    pasteGraphClipboard();
                    setGraphContextMenu(null);
                  }}
                >
                  <span>粘贴节点</span>
                  <kbd>Ctrl+V</kbd>
                </button>
                <button type="button" onClick={() => {
                  flowInstance.current?.fitView({ padding: 0.22, duration: 240 });
                  setGraphContextMenu(null);
                }}>
                  <span>适应全部节点</span>
                  <kbd>F</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    undoGraph();
                    setGraphContextMenu(null);
                  }}
                >
                  <span>撤销</span>
                  <kbd>Ctrl+Z</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    redoGraph();
                    setGraphContextMenu(null);
                  }}
                >
                  <span>重做</span>
                  <kbd>Ctrl+Y</kbd>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {connectionPicker && (
        <>
          <button
            type="button"
            className="graph-menu-backdrop"
            aria-label="取消创建关联节点"
            onClick={() => setConnectionPicker(null)}
          />
          <div
            className="connection-node-picker"
            style={{
              left: `min(${connectionPicker.x}px, calc(100vw - 290px))`,
              top: `min(${connectionPicker.y}px, calc(100vh - 360px))`,
            }}
          >
            <div>
              <span>CREATE CONNECTED NODE</span>
              <strong>创建并连接</strong>
              <small>选择新对象的语义类型</small>
            </div>
            <section>
              {(Object.keys(kindMeta) as NodeKind[]).map((kind) => (
                <button type="button" key={kind} onClick={() => createConnectedNode(kind)}>
                  <i style={{ background: kindMeta[kind].color }}>
                    {kindMeta[kind].mark}
                  </i>
                  <span>{kindMeta[kind].label}</span>
                  <small>{kind}</small>
                </button>
              ))}
            </section>
          </div>
        </>
      )}

      {versionsOpen && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => setVersionsOpen(false)}
        >
          <section
            className="studio-dialog version-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="version-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-heading">
              <div>
                <span>LOCAL VERSION HISTORY</span>
                <h2 id="version-dialog-title">本机版本记录</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setVersionsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="version-list">
              {versions
                .filter((version) => version.workspaceId === activeWorkspaceId)
                .map((version) => (
                  <article key={version.id}>
                    <div>
                      <strong>
                        {new Date(version.createdAt).toLocaleString("zh-CN")}
                      </strong>
                      <small>
                        {version.snapshot.nodes.length} 个节点 ·{" "}
                        {version.snapshot.assets.length} 个资源 ·{" "}
                        {version.snapshot.scenes.length} 个场景
                      </small>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => restoreWorkspaceVersion(version)}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setVersions((current) =>
                            current.filter((item) => item.id !== version.id),
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              {!versions.some(
                (version) => version.workspaceId === activeWorkspaceId,
              ) && (
                <div className="version-empty">
                  <strong>还没有手动版本</strong>
                  <p>点击顶部“保存版本”后，会在本机保留可恢复的工作区快照。</p>
                </div>
              )}
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button-primary"
                onClick={saveWorkspaceVersion}
              >
                ＋ 保存当前版本
              </button>
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDialog(null)}>
          <section
            className="studio-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-heading">
              <div>
                <span>{dialog === "workspace" ? "LOCAL WORKSPACE" : "CURATED RESEARCH"}</span>
                <h2 id="dialog-title">
                  {dialog === "workspace" ? "新建工作区" : "新建专题"}
                </h2>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setDialog(null)}>×</button>
            </div>

            {dialog === "workspace" ? (
              <label className="dialog-field">
                <span>工作区名称</span>
                <input
                  autoFocus
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && createWorkspace()}
                  placeholder="例如：泉州海丝遗产研究"
                />
                <small>节点、关系、资源和归档元数据会保存在这个本地工作区中。</small>
              </label>
            ) : (
              <>
                <label className="dialog-field">
                  <span>专题名称</span>
                  <input
                    autoFocus
                    value={topicTitle}
                    onChange={(event) => setTopicTitle(event.target.value)}
                    placeholder="例如：港口与跨文化交流"
                  />
                </label>
                <label className="dialog-field">
                  <span>专题说明</span>
                  <textarea
                    rows={4}
                    value={topicDescription}
                    onChange={(event) => setTopicDescription(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") createTopic();
                    }}
                    placeholder="简要说明专题的研究范围和叙事方向"
                  />
                </label>
              </>
            )}

            <div className="dialog-actions">
              <button type="button" className="button-quiet" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={dialog === "workspace" ? !workspaceName.trim() : !topicTitle.trim()}
                onClick={dialog === "workspace" ? createWorkspace : createTopic}
              >
                {dialog === "workspace" ? "创建工作区" : "创建专题"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
