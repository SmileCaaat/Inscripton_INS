"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type InputHTMLAttributes,
} from "react";

type Section = "nodes" | "graph" | "assets" | "narrative" | "topics";
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
  assetCount: number;
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

type AssetItem = {
  id: string;
  name: string;
  path: string;
  kind: "image" | "document" | "model" | "video";
  size: string;
  references: number;
  previewUrl?: string;
};

type NarrativeScene = {
  id: string;
  index: string;
  title: string;
  eyebrow: string;
  description: string;
  layout: "hero" | "timeline" | "collection" | "spatial";
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

const kindMeta: Record<NodeKind, { label: string; mark: string; color: string }> = {
  Space: { label: "空间", mark: "S", color: "#315c4b" },
  Person: { label: "人物", mark: "P", color: "#7f3f2e" },
  Event: { label: "事件", mark: "E", color: "#9a641e" },
  Document: { label: "文献", mark: "D", color: "#445a78" },
  Artifact: { label: "物件", mark: "A", color: "#6c4d72" },
  Media: { label: "媒介", mark: "M", color: "#42666b" },
  Concept: { label: "概念", mark: "C", color: "#68624a" },
};

const sectionMeta: Array<{ id: Section; label: string; shortcut: string }> = [
  { id: "nodes", label: "节点", shortcut: "1" },
  { id: "graph", label: "图谱", shortcut: "2" },
  { id: "assets", label: "资源", shortcut: "3" },
  { id: "narrative", label: "Narrative", shortcut: "4" },
  { id: "topics", label: "专题", shortcut: "5" },
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
    x: 610,
    y: 330,
  },
];

const relations: Relation[] = [
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
];

const scenes: NarrativeScene[] = [
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

const typeCounts: Record<NodeKind, number> = {
  Space: 12,
  Person: 27,
  Event: 18,
  Document: 46,
  Artifact: 31,
  Media: 64,
  Concept: 15,
};

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
  if (name.endsWith(".glb") || name.endsWith(".gltf") || name.endsWith(".obj") || name.endsWith(".fbx")) {
    return "model";
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
  return "IMG";
}

function StudioLogo() {
  return (
    <div className="brand-lockup">
      <div className="brand-logo-frame">
        <img className="brand-logo-image" src="/ins-logo.png" alt="INS" />
      </div>
      <div>
        <strong>Inscription</strong>
        <span>数字人文知识平台</span>
      </div>
    </div>
  );
}

function ExplorerView({
  sceneIndex,
  onSceneChange,
  onExit,
}: {
  sceneIndex: number;
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
          <strong>大三巴高地 · 数字铭印研究</strong>
        </div>
        <button className="explorer-exit" type="button" onClick={onExit}>
          退出展示 <kbd>Esc</kbd>
        </button>
      </header>

      <section className="explorer-stage">
        <div className="explorer-grid" aria-hidden="true" />
        <div className="explorer-copy">
          <span className="explorer-scene-number">{scene.index} / 04</span>
          <p>{scene.eyebrow}</p>
          <h1>{scene.title}</h1>
          <div className="explorer-rule" />
          <p className="explorer-description">{scene.description}</p>
          <button className="explorer-primary" type="button">
            开始探索 <span>→</span>
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
  const [nodes, setNodes] = useState<KnowledgeNode[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState("space-ruins");
  const [search, setSearch] = useState("");
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [selectedAssetId, setSelectedAssetId] = useState("asset-2");
  const [dragActive, setDragActive] = useState(false);
  const [activeScene, setActiveScene] = useState(0);
  const [explorer, setExplorer] = useState(false);
  const [notice, setNotice] = useState("工作区已自动保存");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directoryInput = useRef<HTMLInputElement>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];

  const visibleNodes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return nodes;
    return nodes.filter((node) =>
      [node.title, node.subtitle, node.kind, ...node.tags].join(" ").toLowerCase().includes(keyword),
    );
  }, [nodes, search]);

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice("工作区已自动保存"), 2400);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && explorer) setExplorer(false);
      if (event.altKey) {
        const target = sectionMeta.find((item) => item.shortcut === event.key);
        if (target) setSection(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [explorer]);

  const addImportedFiles = (files: Array<{ file: File; path: string }>) => {
    if (files.length === 0) return;
    const additions = files.slice(0, 80).map(({ file, path }, index): AssetItem => {
      const kind = assetKind(file);
      return {
        id: `imported-${Date.now()}-${index}`,
        name: file.name,
        path: path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/` : "新导入/",
        kind,
        size: formatBytes(file.size),
        references: 0,
        previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
      };
    });
    setAssets((current) => [...additions, ...current]);
    setSelectedAssetId(additions[0].id);
    setSection("assets");
    flash(`已导入 ${files.length} 个资源`);
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
        return withEntry.webkitGetAsEntry?.() ?? null;
      })
      .filter((entry): entry is EntryLike => Boolean(entry));

    if (entries.length > 0) {
      const imported = (await Promise.all(entries.map((entry) => readEntry(entry)))).flat();
      addImportedFiles(imported);
      return;
    }

    addImportedFiles(
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
    addImportedFiles(files);
    event.target.value = "";
  };

  const createNode = () => {
    const id = `node-${Date.now()}`;
    const created: KnowledgeNode = {
      id,
      kind: "Concept",
      title: "未命名知识节点",
      subtitle: "新建节点",
      period: "待考",
      summary: "在右侧属性面板补充该节点的研究内容。",
      tags: ["待整理"],
      assetCount: 0,
      x: 350 + (nodes.length % 3) * 95,
      y: 120 + (nodes.length % 2) * 180,
    };
    setNodes((current) => [...current, created]);
    setSelectedNodeId(id);
    setSection("graph");
    flash("已创建 Concept Node");
  };

  const updateSelectedNode = (patch: Partial<KnowledgeNode>) => {
    setNodes((current) =>
      current.map((node) => (node.id === selectedNodeId ? { ...node, ...patch } : node)),
    );
  };

  if (explorer) {
    return (
      <ExplorerView
        sceneIndex={activeScene}
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
          <button type="button">
            大三巴高地研究 <span>⌄</span>
          </button>
        </div>

        <nav className="mode-tabs" aria-label="工作模式">
          {sectionMeta.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "active" : ""}
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
          <button className="button-quiet" type="button" onClick={() => flash("版本快照已保存")}>
            保存版本
          </button>
          <button className="button-primary" type="button" onClick={() => setExplorer(true)}>
            <span>▶</span> Explorer
          </button>
        </div>
      </header>

      <div className={`studio-body ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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
                  <button type="button" key={kind}>
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

              <div className="sidebar-section">
                <div className="sidebar-section-title">
                  <span>专题</span>
                  <button type="button">＋</button>
                </div>
                <button className="topic-link active" type="button">
                  <span className="topic-dot rust" />
                  大三巴高地
                  <small>52</small>
                </button>
                <button className="topic-link" type="button">
                  <span className="topic-dot green" />
                  澳门历史城区
                  <small>84</small>
                </button>
                <button className="topic-link" type="button">
                  <span className="topic-dot blue" />
                  殖民空间研究
                  <small>19</small>
                </button>
              </div>

              <div className="sidebar-sync">
                <span className="sync-icon">↻</span>
                <div>
                  <strong>云盘同步正常</strong>
                  <small>刚刚检测到外部更新</small>
                </div>
              </div>
            </>
          )}
        </aside>

        <section className="workspace-main">
          <div className="workspace-toolbar">
            <div className="breadcrumb">
              <span>大三巴高地研究</span>
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
              <button type="button">筛选</button>
              <button type="button">排序</button>
              <button type="button" className="active">
                图谱
              </button>
              <button type="button">列表</button>
            </div>
          </div>

          <div className="workspace-content">
            {section === "graph" && (
              <div className="graph-workspace">
                <div className="graph-intro">
                  <div>
                    <span>专题知识图谱</span>
                    <h1>大三巴高地</h1>
                  </div>
                  <p>
                    {visibleNodes.length} 个可见节点 · {relations.length} 条关系
                  </p>
                </div>

                <div className="graph-canvas">
                  <div className="canvas-grid" />

                  {relations.map((relation) => {
                    const source = nodes.find((node) => node.id === relation.source);
                    const target = nodes.find((node) => node.id === relation.target);
                    if (!source || !target) return null;
                    if (!visibleNodes.includes(source) || !visibleNodes.includes(target)) return null;
                    const sourceX = source.x + 94;
                    const sourceY = source.y + 52;
                    const targetX = target.x + 94;
                    const targetY = target.y + 52;
                    const deltaX = targetX - sourceX;
                    const deltaY = targetY - sourceY;
                    const width = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
                    return (
                      <div key={relation.id}>
                        <div
                          className="graph-edge"
                          style={{
                            left: sourceX,
                            top: sourceY,
                            width,
                            transform: `rotate(${angle}deg)`,
                          }}
                        />
                        <span
                          className="edge-label"
                          style={{
                            left: sourceX + deltaX / 2,
                            top: sourceY + deltaY / 2,
                          }}
                        >
                          {relation.type}
                        </span>
                      </div>
                    );
                  })}

                  {visibleNodes.map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      className={`knowledge-card ${selectedNodeId === node.id ? "selected" : ""}`}
                      style={{
                        left: node.x,
                        top: node.y,
                        "--node-color": kindMeta[node.kind].color,
                      } as CSSProperties}
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      <div className="knowledge-card-topline">
                        <span>{kindMeta[node.kind].label.toUpperCase()} NODE</span>
                        <i>{node.assetCount}</i>
                      </div>
                      <strong>{node.title}</strong>
                      <small>{node.period}</small>
                      <div className="knowledge-card-tags">
                        {node.tags.slice(0, 2).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </button>
                  ))}

                  <div className="canvas-controls">
                    <button type="button">＋</button>
                    <button type="button">−</button>
                    <button type="button">⌂</button>
                    <span>82%</span>
                  </div>
                </div>
              </div>
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
                <div className="node-table">
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
                      onClick={() => setSelectedNodeId(node.id)}
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
                <div className="asset-browser">
                  <div className="asset-tree-panel">
                    <div className="panel-heading">
                      <span>资源目录</span>
                      <button type="button">＋</button>
                    </div>
                    <div className="asset-tree">
                      <button type="button" className="root active">
                        <span>▾</span> 📁 Assets <small>{assets.length}</small>
                      </button>
                      <button type="button">
                        <span>▾</span> 📁 图像档案
                      </button>
                      <button type="button" className="nested">
                        <span /> 📁 建筑测绘
                      </button>
                      <button type="button" className="nested">
                        <span /> 📁 历史图像
                      </button>
                      <button type="button">
                        <span>›</span> 📁 文献档案
                      </button>
                      <button type="button">
                        <span>›</span> 📁 三维模型
                      </button>
                      <button type="button">
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
                      <button type="button" onClick={() => directoryInput.current?.click()}>
                        选择目录
                      </button>
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
                        <small>{assets.length} 项</small>
                      </div>
                      <div className="panel-heading-actions">
                        <button type="button">类型 ▾</button>
                        <button type="button">▦</button>
                      </div>
                    </div>
                    <div className="asset-gallery">
                      {assets.map((asset) => (
                        <button
                          type="button"
                          key={asset.id}
                          className={selectedAssetId === asset.id ? "selected" : ""}
                          onClick={() => setSelectedAssetId(asset.id)}
                        >
                          <div className={`asset-thumb asset-${asset.kind}`}>
                            {asset.previewUrl ? (
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

                  <div className="asset-preview-panel">
                    <div className="panel-heading">
                      <span>资源预览</span>
                      <button type="button">•••</button>
                    </div>
                    {selectedAsset && (
                      <div className="asset-preview">
                        <div className={`asset-preview-stage asset-${selectedAsset.kind}`}>
                          {selectedAsset.previewUrl ? (
                            <img src={selectedAsset.previewUrl} alt={selectedAsset.name} />
                          ) : selectedAsset.kind === "model" ? (
                            <div className="model-stage">
                              <div className="model-object">
                                <span />
                                <span />
                                <span />
                              </div>
                              <div className="model-axis">X · Y · Z</div>
                            </div>
                          ) : (
                            <span>{assetGlyph(selectedAsset.kind)}</span>
                          )}
                        </div>
                        <div className="asset-preview-meta">
                          <span>{selectedAsset.kind.toUpperCase()}</span>
                          <h3>{selectedAsset.name}</h3>
                          <p>{selectedAsset.path}</p>
                          <dl>
                            <div>
                              <dt>文件大小</dt>
                              <dd>{selectedAsset.size}</dd>
                            </div>
                            <div>
                              <dt>节点引用</dt>
                              <dd>{selectedAsset.references}</dd>
                            </div>
                            <div>
                              <dt>状态</dt>
                              <dd>本机可用</dd>
                            </div>
                          </dl>
                          <button type="button" className="button-primary">
                            关联到 Node
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {section === "narrative" && (
              <div className="narrative-view">
                <div className="scene-sidebar">
                  <div className="panel-heading">
                    <span>场景</span>
                    <button type="button">＋</button>
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
                  <button className="add-scene" type="button">
                    ＋ 添加场景
                  </button>
                </div>

                <div className="narrative-canvas-wrap">
                  <div className="narrative-toolbar">
                    <div>
                      <button type="button" className="active">选择</button>
                      <button type="button">文字</button>
                      <button type="button">节点</button>
                      <button type="button">资源</button>
                      <button type="button">3D</button>
                    </div>
                    <span>场景 {scenes[activeScene].index} · 16:9</span>
                    <button type="button" onClick={() => setExplorer(true)}>▶ 预览</button>
                  </div>
                  <div className="narrative-canvas">
                    <div className="scene-frame">
                      <div className="scene-frame-grid" />
                      <div className="scene-frame-copy">
                        <span>{scenes[activeScene].eyebrow}</span>
                        <h2>{scenes[activeScene].title}</h2>
                        <p>{scenes[activeScene].description}</p>
                      </div>
                      <div className="scene-node-card">
                        <span>SPACE NODE</span>
                        <strong>大三巴高地</strong>
                        <small>点击进入节点</small>
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
                  <button type="button" className="button-primary">＋ 新建专题</button>
                </div>
                <div className="topic-grid">
                  <button type="button" className="topic-featured" onClick={() => setExplorer(true)}>
                    <div className="topic-pattern">
                      <span>INSCRIPTION · 01</span>
                      <strong>大三巴高地</strong>
                      <small>数字铭印研究</small>
                    </div>
                    <div className="topic-card-meta">
                      <span>52 Nodes</span>
                      <span>4 Narratives</span>
                      <b>进入 Explorer →</b>
                    </div>
                  </button>
                  <button type="button" className="topic-card">
                    <span className="topic-index">02</span>
                    <h3>澳门历史城区</h3>
                    <p>世界遗产语境中的城市空间与文化记忆。</p>
                    <small>84 Nodes · 126 Assets</small>
                  </button>
                  <button type="button" className="topic-card">
                    <span className="topic-index">03</span>
                    <h3>殖民空间研究</h3>
                    <p>历史城市中权力、宗教与日常实践的空间关系。</p>
                    <small>19 Nodes · 38 Assets</small>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {section !== "assets" && (
          <aside className="inspector-panel">
            <div className="inspector-header">
              <div>
                <span>NODE INSPECTOR</span>
                <strong>{kindMeta[selectedNode.kind].label}节点</strong>
              </div>
              <button type="button">•••</button>
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
                  <button type="button">⌃</button>
                </div>
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
                  <span>摘要</span>
                  <textarea
                    rows={4}
                    value={selectedNode.summary}
                    onChange={(event) => updateSelectedNode({ summary: event.target.value })}
                  />
                </label>
                <div className="tag-field">
                  <span>标签</span>
                  <div>
                    {selectedNode.tags.map((tag) => (
                      <button type="button" key={tag}>{tag} ×</button>
                    ))}
                    <button type="button">＋</button>
                  </div>
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section-title">
                  <span>关系</span>
                  <button type="button">＋</button>
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
                          onClick={() => peer && setSelectedNodeId(peer.id)}
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
                  {initialAssets.slice(0, 3).map((asset) => (
                    <button type="button" key={asset.id} onClick={() => {
                      setSelectedAssetId(asset.id);
                      setSection("assets");
                    }}>
                      <span className={`asset-${asset.kind}`}>{assetGlyph(asset.kind)}</span>
                      <small>{asset.name}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="inspector-version">
                <span>最近修订</span>
                <strong>今天 17:42 · JamLew</strong>
                <button type="button" onClick={() => flash("已打开 12 条历史修订")}>
                  查看 12 条历史修订 →
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
