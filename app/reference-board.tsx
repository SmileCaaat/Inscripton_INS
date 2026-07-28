"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import dynamic from "next/dynamic";
import { readLocalAssetBlob, storeLocalAssetBlob } from "./local-assets";
import {
  ApplicationContextMenu,
  type ApplicationContextMenuItem,
} from "./application-context-menu";

export type BoardAsset = {
  id: string;
  name: string;
  path: string;
  kind: "image" | "document" | "model" | "video" | "audio" | "text";
  size: string;
  references: number;
  previewUrl?: string;
  sourceAssetId?: string;
  cropRegion?: { x: number; y: number; w: number; h: number };
};

type AssetNodeData = {
  kind: "asset";
  assetId: string;
  asset: BoardAsset;
  onPreview: (assetId: string) => void;
};

type FrameNodeData = {
  kind: "frame";
  title: string;
  itemCount: number;
};

type BoardNode =
  | Node<AssetNodeData, "boardAsset">
  | Node<FrameNodeData, "boardFrame">;

type CropBox = { x: number; y: number; w: number; h: number };
type SplitMode = "grid" | "free";
type FreeInteraction =
  | { kind: "draw"; startX: number; startY: number }
  | { kind: "move"; index: number; offsetX: number; offsetY: number }
  | { kind: "resize"; index: number };

type BoardClipboard = {
  nodes: BoardNode[];
  edges: Edge[];
  origin: { x: number; y: number };
};

type BoardContextMenuState = {
  x: number;
  y: number;
  target: "pane" | "node" | "dock";
  flowPosition: { x: number; y: number };
  nodeId?: string;
  assetId?: string;
};

type EntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (callback: (file: File) => void) => void;
  createReader?: () => {
    readEntries: (callback: (entries: EntryLike[]) => void) => void;
  };
};

const ReactFlowCanvas = dynamic(
  () => import("@xyflow/react").then((module) => module.ReactFlow),
  { ssr: false },
);
const ModelPreview = dynamic(
  () => import("./model-preview").then((module) => module.ModelPreview),
  { ssr: false },
);
const DocumentMediaPreview = dynamic(
  () =>
    import("./document-media-preview").then(
      (module) => module.DocumentMediaPreview,
    ),
  { ssr: false },
);

const MIN_CROP = 0.02;
const MIN_DOCK_HEIGHT = 118;
const MAX_DOCK_HEIGHT = 340;

function clampDockHeight(height: number) {
  return Math.max(MIN_DOCK_HEIGHT, Math.min(MAX_DOCK_HEIGHT, height));
}

function assetGlyph(kind: BoardAsset["kind"]) {
  if (kind === "model") return "3D";
  if (kind === "document") return "DOC";
  if (kind === "video") return "▶";
  if (kind === "audio") return "♫";
  if (kind === "text") return "TXT";
  return "IMG";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileKind(file: File): BoardAsset["kind"] {
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
  if (file.type.startsWith("text/") || name.endsWith(".md") || name.endsWith(".txt")) {
    return "text";
  }
  return "document";
}

async function filesFromEntry(entry: EntryLike): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise((resolve) => entry.file?.((file) => resolve([file])));
  }
  if (!entry.isDirectory || !entry.createReader) return [];
  const reader = entry.createReader();
  const children: EntryLike[] = [];
  while (true) {
    const batch = await new Promise<EntryLike[]>((resolve) =>
      reader.readEntries(resolve),
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(filesFromEntry))).flat();
}

function makeAssetNode(
  asset: BoardAsset,
  x: number,
  y: number,
  onPreview: (assetId: string) => void,
): BoardNode {
  return {
    id: `board-item-${asset.id}-${crypto.randomUUID().slice(0, 8)}`,
    type: "boardAsset",
    position: { x, y },
    data: { kind: "asset", assetId: asset.id, asset, onPreview },
  };
}

const BoardAssetNode = memo(function BoardAssetNode({
  data,
  selected,
}: NodeProps<Node<AssetNodeData, "boardAsset">>) {
  const { asset } = data;
  return (
    <article
      className={`board-asset-card ${selected ? "selected" : ""}`}
      onDoubleClick={() => data.onPreview(asset.id)}
      aria-label={`参考板资源：${asset.name}`}
    >
      <Handle type="target" position={Position.Left} className="board-handle" />
      <div className={`board-asset-media asset-${asset.kind}`}>
        {asset.previewUrl && asset.kind === "image" ? (
          <img src={asset.previewUrl} alt={asset.name} draggable={false} />
        ) : (
          <span>{assetGlyph(asset.kind)}</span>
        )}
      </div>
      <footer>
        <span>{assetGlyph(asset.kind)}</span>
        <strong>{asset.name}</strong>
      </footer>
      <Handle type="source" position={Position.Right} className="board-handle" />
    </article>
  );
});

const BoardFrameNode = memo(function BoardFrameNode({
  data,
  selected,
}: NodeProps<Node<FrameNodeData, "boardFrame">>) {
  return (
    <section className={`board-comment-frame ${selected ? "selected" : ""}`}>
      <header>
        <span>NOTE FRAME</span>
        <strong>{data.title}</strong>
        <small>{data.itemCount} 项</small>
      </header>
    </section>
  );
});

const boardNodeTypes = {
  boardAsset: BoardAssetNode,
  boardFrame: BoardFrameNode,
};

function equalSplits(count: number) {
  if (count <= 1) return [];
  return Array.from({ length: count - 1 }, (_, index) => (index + 1) / count);
}

function cropCells(
  rows: number,
  cols: number,
  rowSplits: number[],
  colSplits: number[],
) {
  const rowBounds = [0, ...rowSplits, 1];
  const colBounds = [0, ...colSplits, 1];
  const result: Array<CropBox & { index: number }> = [];
  let index = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result.push({
        index,
        x: colBounds[col],
        y: rowBounds[row],
        w: colBounds[col + 1] - colBounds[col],
        h: rowBounds[row + 1] - rowBounds[row],
      });
      index += 1;
    }
  }
  return result;
}

function clampSplit(
  splits: number[],
  index: number,
  value: number,
) {
  const min = index === 0 ? MIN_CROP : splits[index - 1] + MIN_CROP;
  const max =
    index === splits.length - 1
      ? 1 - MIN_CROP
      : splits[index + 1] - MIN_CROP;
  const next = [...splits];
  next[index] = Math.max(min, Math.min(max, value));
  return next;
}

type ImageSplitDialogProps = {
  asset: BoardAsset;
  onClose: () => void;
  onComplete: (assets: BoardAsset[]) => void;
};

function ImageSplitDialog({
  asset,
  onClose,
  onComplete,
}: ImageSplitDialogProps) {
  const [mode, setMode] = useState<SplitMode>("grid");
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [rowSplits, setRowSplits] = useState(() => equalSplits(2));
  const [colSplits, setColSplits] = useState(() => equalSplits(3));
  const [selectedCells, setSelectedCells] = useState(
    () => new Set([1, 2, 3, 4, 5, 6]),
  );
  const [boxes, setBoxes] = useState<CropBox[]>([]);
  const [draftBox, setDraftBox] = useState<CropBox | null>(null);
  const [activeBox, setActiveBox] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<FreeInteraction | null>(null);

  const cells = useMemo(
    () => cropCells(rows, cols, rowSplits, colSplits),
    [colSplits, cols, rowSplits, rows],
  );

  const applyGrid = (nextRows: number, nextCols: number) => {
    const safeRows = Math.max(1, Math.min(12, nextRows));
    const safeCols = Math.max(1, Math.min(12, nextCols));
    setRows(safeRows);
    setCols(safeCols);
    setRowSplits(equalSplits(safeRows));
    setColSplits(equalSplits(safeCols));
    setSelectedCells(
      new Set(
        Array.from(
          { length: safeRows * safeCols },
          (_, index) => index + 1,
        ),
      ),
    );
  };

  const pointFromEvent = (
    event: PointerEvent | ReactPointerEvent,
  ) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const beginFreeInteraction = (
    interaction: FreeInteraction,
    event: ReactPointerEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!overlayRef.current) return;
    interactionRef.current = interaction;

    const onMove = (moveEvent: PointerEvent) => {
      const active = interactionRef.current;
      if (!active) return;
      const point = pointFromEvent(moveEvent);
      if (active.kind === "draw") {
        setDraftBox({
          x: Math.min(active.startX, point.x),
          y: Math.min(active.startY, point.y),
          w: Math.abs(point.x - active.startX),
          h: Math.abs(point.y - active.startY),
        });
        return;
      }
      if (active.kind === "move") {
        setBoxes((current) =>
          current.map((box, index) =>
            index === active.index
              ? {
                  ...box,
                  x: Math.max(
                    0,
                    Math.min(1 - box.w, point.x - active.offsetX),
                  ),
                  y: Math.max(
                    0,
                    Math.min(1 - box.h, point.y - active.offsetY),
                  ),
                }
              : box,
          ),
        );
        return;
      }
      setBoxes((current) =>
        current.map((box, index) =>
          index === active.index
            ? {
                ...box,
                w: Math.max(
                  MIN_CROP,
                  Math.min(1 - box.x, point.x - box.x),
                ),
                h: Math.max(
                  MIN_CROP,
                  Math.min(1 - box.y, point.y - box.y),
                ),
              }
            : box,
        ),
      );
    };

    const onUp = () => {
      const active = interactionRef.current;
      interactionRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (active?.kind === "draw") {
        setDraftBox((draft) => {
          if (draft && draft.w >= MIN_CROP && draft.h >= MIN_CROP) {
            setBoxes((current) => {
              setActiveBox(current.length);
              return [...current, draft];
            });
          }
          return null;
        });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startSplitDrag = (
    axis: "row" | "col",
    index: number,
    event: ReactPointerEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const onMove = (moveEvent: PointerEvent) => {
      if (axis === "col") {
        const value = (moveEvent.clientX - rect.left) / rect.width;
        setColSplits((current) => clampSplit(current, index, value));
      } else {
        const value = (moveEvent.clientY - rect.top) / rect.height;
        setRowSplits((current) => clampSplit(current, index, value));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        mode === "free" &&
        activeBox !== null &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        setBoxes((current) =>
          current.filter((_, index) => index !== activeBox),
        );
        setActiveBox(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeBox, mode]);

  const generateSlices = async () => {
    if (!asset.previewUrl) return;
    const regions =
      mode === "grid"
        ? cells.filter((cell) => selectedCells.has(cell.index))
        : boxes.map((box, index) => ({ ...box, index: index + 1 }));
    if (regions.length === 0) {
      setError("请至少选择一个切片区域");
      return;
    }

    setExporting(true);
    setError("");
    try {
      const blob = await fetch(asset.previewUrl).then((response) =>
        response.blob(),
      );
      const bitmap = await createImageBitmap(blob);
      const baseName = asset.name.replace(/\.[^.]+$/, "");
      const additions: BoardAsset[] = [];

      for (const region of regions) {
        const sourceX = Math.round(region.x * bitmap.width);
        const sourceY = Math.round(region.y * bitmap.height);
        const sourceWidth = Math.max(1, Math.round(region.w * bitmap.width));
        const sourceHeight = Math.max(1, Math.round(region.h * bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(sourceWidth, bitmap.width - sourceX);
        canvas.height = Math.min(sourceHeight, bitmap.height - sourceY);
        const context = canvas.getContext("2d");
        if (!context) continue;
        context.drawImage(
          bitmap,
          sourceX,
          sourceY,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const outputBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) =>
              result ? resolve(result) : reject(new Error("切片生成失败")),
            "image/png",
          ),
        );
        const assetId = `asset-slice-${Date.now()}-${region.index}`;
        await storeLocalAssetBlob(assetId, outputBlob);
        additions.push({
          id: assetId,
          name: `${baseName}_区域${String(region.index).padStart(2, "0")}.png`,
          path: `${asset.path}${baseName}_切片/`,
          kind: "image",
          size: formatBytes(outputBlob.size),
          references: 1,
          previewUrl: URL.createObjectURL(outputBlob),
          sourceAssetId: asset.id,
          cropRegion: {
            x: region.x,
            y: region.y,
            w: region.w,
            h: region.h,
          },
        });
      }

      bitmap.close();
      onComplete(additions);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "切片生成失败");
    } finally {
      setExporting(false);
    }
  };

  const exportCount =
    mode === "grid" ? selectedCells.size : boxes.length;

  return (
    <div className="board-split-backdrop" onMouseDown={onClose}>
      <section
        className="board-split-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`切图：${asset.name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>IMAGE SPLIT</span>
            <h2>图片切图</h2>
            <small>{asset.name}</small>
          </div>
          <button type="button" aria-label="关闭切图" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="board-split-body">
          <div className="board-split-stage">
            <div className="board-split-image">
              <img src={asset.previewUrl} alt={asset.name} draggable={false} />
              {mode === "grid" ? (
                <div className="board-split-overlay" ref={overlayRef}>
                  {cells.map((cell) => (
                    <button
                      type="button"
                      key={cell.index}
                      className={
                        selectedCells.has(cell.index)
                          ? "split-cell selected"
                          : "split-cell"
                      }
                      style={{
                        left: `${cell.x * 100}%`,
                        top: `${cell.y * 100}%`,
                        width: `${cell.w * 100}%`,
                        height: `${cell.h * 100}%`,
                      }}
                      onClick={() =>
                        setSelectedCells((current) => {
                          const next = new Set(current);
                          if (next.has(cell.index)) next.delete(cell.index);
                          else next.add(cell.index);
                          return next;
                        })
                      }
                    >
                      {cell.index}
                    </button>
                  ))}
                  {colSplits.map((value, index) => (
                    <span
                      key={`col-${index}`}
                      className="split-line vertical"
                      style={{ left: `${value * 100}%` }}
                      onPointerDown={(event) =>
                        startSplitDrag("col", index, event)
                      }
                    />
                  ))}
                  {rowSplits.map((value, index) => (
                    <span
                      key={`row-${index}`}
                      className="split-line horizontal"
                      style={{ top: `${value * 100}%` }}
                      onPointerDown={(event) =>
                        startSplitDrag("row", index, event)
                      }
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="board-split-overlay free"
                  ref={overlayRef}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const point = pointFromEvent(event);
                    setActiveBox(null);
                    beginFreeInteraction(
                      { kind: "draw", startX: point.x, startY: point.y },
                      event,
                    );
                  }}
                >
                  {boxes.map((box, index) => (
                    <div
                      key={`crop-${index}`}
                      className={
                        activeBox === index
                          ? "free-crop-box active"
                          : "free-crop-box"
                      }
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                      }}
                      onPointerDown={(event) => {
                        const point = pointFromEvent(event);
                        setActiveBox(index);
                        beginFreeInteraction(
                          {
                            kind: "move",
                            index,
                            offsetX: point.x - box.x,
                            offsetY: point.y - box.y,
                          },
                          event,
                        );
                      }}
                    >
                      <b>{index + 1}</b>
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setBoxes((current) =>
                            current.filter(
                              (_, boxIndex) => boxIndex !== index,
                            ),
                          );
                          setActiveBox(null);
                        }}
                      >
                        ×
                      </button>
                      <i
                        onPointerDown={(event) => {
                          setActiveBox(index);
                          beginFreeInteraction(
                            { kind: "resize", index },
                            event,
                          );
                        }}
                      />
                    </div>
                  ))}
                  {draftBox && (
                    <div
                      className="free-crop-box draft"
                      style={{
                        left: `${draftBox.x * 100}%`,
                        top: `${draftBox.y * 100}%`,
                        width: `${draftBox.w * 100}%`,
                        height: `${draftBox.h * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="board-split-sidebar">
            <div className="split-tabs">
              <button
                type="button"
                className={mode === "grid" ? "active" : ""}
                onClick={() => setMode("grid")}
              >
                宫格分割
              </button>
              <button
                type="button"
                className={mode === "free" ? "active" : ""}
                onClick={() => setMode("free")}
              >
                自由画框
              </button>
            </div>

            {mode === "grid" ? (
              <>
                <p>拖动虚线调整位置，点击格子决定是否生成。</p>
                <label>
                  平均分割
                  <span>
                    {[
                      [2, 2, "4张"],
                      [2, 3, "6张"],
                      [3, 3, "9张"],
                    ].map(([presetRows, presetCols, label]) => (
                      <button
                        type="button"
                        key={label}
                        onClick={() =>
                          applyGrid(
                            Number(presetRows),
                            Number(presetCols),
                          )
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                </label>
                <div className="split-number-fields">
                  <label>
                    行
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={rows}
                      onChange={(event) =>
                        applyGrid(Number(event.target.value), cols)
                      }
                    />
                  </label>
                  <label>
                    列
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={cols}
                      onChange={(event) =>
                        applyGrid(rows, Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="split-select-all"
                  onClick={() =>
                    setSelectedCells(
                      selectedCells.size === cells.length
                        ? new Set()
                        : new Set(cells.map((cell) => cell.index)),
                    )
                  }
                >
                  {selectedCells.size === cells.length ? "全不选" : "全选"}
                </button>
              </>
            ) : (
              <>
                <p>
                  在图上拖动画框；框体可移动，右下角可缩放，Delete可删除。
                </p>
                <button
                  type="button"
                  className="split-select-all"
                  disabled={boxes.length === 0}
                  onClick={() => {
                    setBoxes([]);
                    setActiveBox(null);
                  }}
                >
                  清空全部
                </button>
              </>
            )}

            <div className="split-result-summary">
              <span>将生成</span>
              <strong>{exportCount}</strong>
              <small>个PNG切片资源</small>
            </div>
            {error && <p className="split-error">{error}</p>}
            <button
              type="button"
              className="button-primary split-generate"
              disabled={exporting || exportCount === 0}
              onClick={() => void generateSlices()}
            >
              {exporting ? "生成中…" : "生成切片并放入参考板"}
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

type ReferenceBoardViewProps = {
  workspaceId: string;
  workspaceName: string;
  assets: BoardAsset[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onCreateAssets: (assets: BoardAsset[]) => void;
  onHydrateAsset: (assetId: string, previewUrl: string) => void;
  onChangeAssetReference: (assetId: string, delta: number) => void;
};

export function ReferenceBoardView({
  workspaceId,
  workspaceName,
  assets,
  selectedAssetId,
  onSelectAsset,
  onCreateAssets,
  onHydrateAsset,
  onChangeAssetReference,
}: ReferenceBoardViewProps) {
  const storageKey = `inscription-reference-board-v1-${workspaceId}`;
  const [boardTitle, setBoardTitle] = useState(`${workspaceName} · 参考板`);
  const [nodes, setNodes] = useState<BoardNode[]>(() =>
    assets.slice(0, 4).map((asset, index) =>
      makeAssetNode(
        asset,
        100 + (index % 2) * 300,
        90 + Math.floor(index / 2) * 230,
        onSelectAsset,
      ),
    ),
  );
  const [edges, setEdges] = useState<Edge[]>([]);
  const [dockHeight, setDockHeight] = useState(190);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [assetFilter, setAssetFilter] = useState<"board" | "all">("board");
  const [assetSourceFilter, setAssetSourceFilter] = useState<
    "all" | "board-import" | "clipboard" | "slices"
  >("all");
  const [previewTab, setPreviewTab] = useState<"preview" | "info">("preview");
  const [splitAsset, setSplitAsset] = useState<BoardAsset | null>(null);
  const [boardContextMenu, setBoardContextMenu] =
    useState<BoardContextMenuState | null>(null);
  const [boardClipboard, setBoardClipboard] =
    useState<BoardClipboard | null>(null);
  const flowRef = useRef<ReactFlowInstance<BoardNode, Edge> | null>(null);
  const nodesRef = useRef(nodes);
  const pastePointRef = useRef({ x: 340, y: 180 });
  const boardViewRef = useRef<HTMLDivElement>(null);
  const internalBoardPasteRef = useRef(false);

  const boardAssetIds = useMemo(
    () =>
      new Set(
        nodes
          .filter(
            (node): node is Node<AssetNodeData, "boardAsset"> =>
              node.type === "boardAsset",
          )
          .map((node) => node.data.assetId),
      ),
    [nodes],
  );

  const visibleAssets = assets.filter((asset) => {
    const boardMatches =
      assetFilter === "all" || boardAssetIds.has(asset.id);
    const sourceMatches =
      assetSourceFilter === "all" ||
      (assetSourceFilter === "board-import" &&
        asset.path.includes("参考板导入")) ||
      (assetSourceFilter === "clipboard" && asset.path.includes("剪贴板")) ||
      (assetSourceFilter === "slices" &&
        (asset.path.includes("_切片") || Boolean(asset.sourceAssetId)));
    return boardMatches && sourceMatches;
  });

  const activeBoardNode = nodes.find((node) => node.selected);
  const activeAssetId =
    activeBoardNode?.type === "boardAsset"
      ? activeBoardNode.data.assetId
      : selectedAssetId;
  const activeAsset =
    assets.find((asset) => asset.id === activeAssetId) ?? assets[0];

  const syncAssetData = useCallback(
    (current: BoardNode[]) =>
      current.map((node) => {
        if (node.type !== "boardAsset") return node;
        const asset =
          assets.find((item) => item.id === node.data.assetId) ??
          node.data.asset;
        return {
          ...node,
          data: { ...node.data, asset, onPreview: onSelectAsset },
        };
      }),
    [assets, onSelectAsset],
  );

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      for (const asset of assets) {
        if (asset.previewUrl) {
          continue;
        }
        try {
          const blob = await readLocalAssetBlob(asset.id);
          if (!blob || cancelled) continue;
          onHydrateAsset(asset.id, URL.createObjectURL(blob));
        } catch {
          // Older resources may not have a locally persisted blob.
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [assets]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        title?: string;
        nodes?: BoardNode[];
        edges?: Edge[];
        dockHeight?: number;
      };
      if (parsed.title) setBoardTitle(parsed.title);
      if (Array.isArray(parsed.nodes)) {
        const restored = syncAssetData(parsed.nodes);
        nodesRef.current = restored;
        setNodes(restored);
      }
      if (Array.isArray(parsed.edges)) setEdges(parsed.edges);
      if (parsed.dockHeight) setDockHeight(parsed.dockHeight);
    } catch {
      // A malformed local draft should not prevent opening the board.
    }
  }, [storageKey]);

  useEffect(() => {
    setNodes((current) => {
      const next = syncAssetData(current);
      nodesRef.current = next;
      return next;
    });
  }, [syncAssetData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const serializableNodes = nodes.map((node) =>
        node.type === "boardAsset"
          ? {
              ...node,
              data: {
                ...node.data,
                asset: {
                  ...node.data.asset,
                  previewUrl: undefined,
                },
                onPreview: undefined,
              },
            }
          : node,
      );
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          title: boardTitle,
          nodes: serializableNodes,
          edges,
          dockHeight,
        }),
      );
    }, 180);
    return () => window.clearTimeout(timer);
  }, [boardTitle, dockHeight, edges, nodes, storageKey]);

  const addAssetsAt = useCallback(
    (newAssets: BoardAsset[], x: number, y: number) => {
      if (newAssets.length === 0) return;
      onCreateAssets(newAssets);
      setNodes((current) => {
        const additions = newAssets.map((asset, index) =>
          makeAssetNode(
            asset,
            x + (index % 4) * 238,
            y + Math.floor(index / 4) * 190,
            onSelectAsset,
          ),
        );
        const next = [...current, ...additions];
        nodesRef.current = next;
        return next;
      });
      onSelectAsset(newAssets[0].id);
    },
    [onCreateAssets, onSelectAsset],
  );

  const importFiles = useCallback(
    async (
      files: File[],
      position: { x: number; y: number },
      source = "参考板导入",
    ) => {
      const imported = files.slice(0, 60).map((file, index): BoardAsset => {
        const kind = fileKind(file);
        return {
          id: `asset-board-${Date.now()}-${index}`,
          name: file.name || `剪贴板图片_${index + 1}.png`,
          path: `${source}/${boardTitle}/`,
          kind,
          size: formatBytes(file.size),
          references: 1,
          previewUrl:
            URL.createObjectURL(file),
        };
      });
      await Promise.all(
        imported.map((asset, index) =>
          storeLocalAssetBlob(asset.id, files[index]),
        ),
      );
      addAssetsAt(imported, position.x, position.y);
    },
    [addAssetsAt, boardTitle],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (internalBoardPasteRef.current) {
        internalBoardPasteRef.current = false;
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const imageFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (imageFiles.length === 0) return;
      event.preventDefault();
      void importFiles(imageFiles, pastePointRef.current, "剪贴板");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importFiles]);

  const alignSelectionTop = useCallback(() => {
    const selected = nodesRef.current.filter(
      (node) => node.selected && node.type === "boardAsset",
    );
    if (selected.length < 2) return;
    const top = Math.min(...selected.map((node) => node.position.y));
    setNodes((current) => {
      const next = current.map((node) =>
        node.selected && node.type === "boardAsset"
          ? { ...node, position: { ...node.position, y: top } }
          : node,
      );
      nodesRef.current = next;
      return next;
    });
  }, []);

  const createCommentFrame = useCallback(() => {
    const selected = nodesRef.current.filter(
      (node) => node.selected && node.type === "boardAsset",
    );
    if (selected.length === 0) return;
    const left = Math.min(...selected.map((node) => node.position.x));
    const top = Math.min(...selected.map((node) => node.position.y));
    const right = Math.max(
      ...selected.map(
        (node) =>
          node.position.x +
          (node.measured?.width ?? Number(node.style?.width) ?? 218),
      ),
    );
    const bottom = Math.max(
      ...selected.map(
        (node) =>
          node.position.y +
          (node.measured?.height ?? Number(node.style?.height) ?? 166),
      ),
    );
    const frame: BoardNode = {
      id: `board-frame-${Date.now()}`,
      type: "boardFrame",
      position: { x: left - 34, y: top - 58 },
      style: { width: right - left + 68, height: bottom - top + 92 },
      zIndex: -1,
      selectable: true,
      data: {
        kind: "frame",
        title: "研究备注",
        itemCount: selected.length,
      },
    };
    setNodes((current) => {
      const next = [frame, ...current.map((node) => ({ ...node, selected: false }))];
      nodesRef.current = next;
      return next;
    });
  }, []);

  const selectAllBoardNodes = () => {
    setNodes((current) => {
      const next = current.map((node) => ({ ...node, selected: true }));
      nodesRef.current = next;
      return next;
    });
  };

  const makeBoardClipboard = (primaryNodeId?: string) => {
    let selected = nodesRef.current.filter((node) => node.selected);
    if (
      primaryNodeId &&
      !selected.some((node) => node.id === primaryNodeId)
    ) {
      const primary = nodesRef.current.find(
        (node) => node.id === primaryNodeId,
      );
      selected = primary ? [primary] : [];
    }
    if (selected.length === 0) return null;
    const selectedIds = new Set(selected.map((node) => node.id));
    const origin = {
      x: Math.min(...selected.map((node) => node.position.x)),
      y: Math.min(...selected.map((node) => node.position.y)),
    };
    return {
      nodes: selected.map(
        (node) =>
          ({
            ...node,
            position: { ...node.position },
            selected: false,
            data:
              node.type === "boardAsset"
                ? {
                    ...node.data,
                    asset: { ...node.data.asset },
                    onPreview: onSelectAsset,
                  }
                : { ...node.data },
          }) as BoardNode,
      ),
      edges: edges
        .filter(
          (edge) =>
            selectedIds.has(edge.source) && selectedIds.has(edge.target),
        )
        .map((edge) => ({ ...edge, selected: false })),
      origin,
    } satisfies BoardClipboard;
  };

  const copyBoardSelection = (primaryNodeId?: string) => {
    const clipboard = makeBoardClipboard(primaryNodeId);
    if (clipboard) setBoardClipboard(clipboard);
    return clipboard;
  };

  const removeBoardNodes = (nodeIds: Set<string>) => {
    if (nodeIds.size === 0) {
      setEdges((current) => current.filter((edge) => !edge.selected));
      return;
    }
    nodesRef.current
      .filter(
        (node): node is Node<AssetNodeData, "boardAsset"> =>
          nodeIds.has(node.id) && node.type === "boardAsset",
      )
      .forEach((node) => onChangeAssetReference(node.data.assetId, -1));
    setNodes((current) => {
      const next = current.filter((node) => !nodeIds.has(node.id));
      nodesRef.current = next;
      return next;
    });
    setEdges((current) =>
      current.filter(
        (edge) =>
          !edge.selected &&
          !nodeIds.has(edge.source) &&
          !nodeIds.has(edge.target),
      ),
    );
  };

  const deleteBoardSelection = (primaryNodeId?: string) => {
    const selectedIds = new Set(
      nodesRef.current
        .filter(
          (node) =>
            node.selected ||
            (primaryNodeId !== undefined && node.id === primaryNodeId),
        )
        .map((node) => node.id),
    );
    removeBoardNodes(selectedIds);
  };

  const pasteBoardClipboard = (
    clipboard = boardClipboard,
    position = pastePointRef.current,
  ) => {
    if (!clipboard) return;
    const idMap = new Map<string, string>();
    const pastedNodes = clipboard.nodes.map((node) => {
      const id = `board-paste-${crypto.randomUUID()}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        position: {
          x: position.x + node.position.x - clipboard.origin.x,
          y: position.y + node.position.y - clipboard.origin.y,
        },
        selected: true,
        measured: undefined,
        data:
          node.type === "boardAsset"
            ? {
                ...node.data,
                asset: { ...node.data.asset },
                onPreview: onSelectAsset,
              }
            : { ...node.data },
      } as BoardNode;
    });
    pastedNodes
      .filter(
        (node): node is Node<AssetNodeData, "boardAsset"> =>
          node.type === "boardAsset",
      )
      .forEach((node) => onChangeAssetReference(node.data.assetId, 1));
    setNodes((current) => {
      const next = [
        ...current.map((node) => ({ ...node, selected: false })),
        ...pastedNodes,
      ];
      nodesRef.current = next;
      return next;
    });
    setEdges((current) => [
      ...current.map((edge) => ({ ...edge, selected: false })),
      ...clipboard.edges.flatMap((edge) => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        return source && target
          ? [
              {
                ...edge,
                id: `board-edge-${crypto.randomUUID()}`,
                source,
                target,
                selected: false,
              },
            ]
          : [];
      }),
    ]);
  };

  const cutBoardSelection = (primaryNodeId?: string) => {
    const clipboard = copyBoardSelection(primaryNodeId);
    if (!clipboard) return;
    removeBoardNodes(new Set(clipboard.nodes.map((node) => node.id)));
  };

  const duplicateBoardSelection = (primaryNodeId?: string) => {
    const clipboard = makeBoardClipboard(primaryNodeId);
    if (!clipboard) return;
    setBoardClipboard(clipboard);
    pasteBoardClipboard(clipboard, {
      x: clipboard.origin.x + 32,
      y: clipboard.origin.y + 32,
    });
  };

  const disconnectBoardSelection = (primaryNodeId?: string) => {
    const nodeIds = new Set(
      nodesRef.current
        .filter(
          (node) =>
            node.selected ||
            (primaryNodeId !== undefined && node.id === primaryNodeId),
        )
        .map((node) => node.id),
    );
    setEdges((current) =>
      current.filter(
        (edge) =>
          !nodeIds.has(edge.source) && !nodeIds.has(edge.target),
      ),
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === "a") {
        event.preventDefault();
        selectAllBoardNodes();
      } else if (ctrl && key === "c") {
        event.preventDefault();
        copyBoardSelection();
      } else if (ctrl && key === "x") {
        event.preventDefault();
        cutBoardSelection();
      } else if (ctrl && key === "v" && boardClipboard) {
        event.preventDefault();
        internalBoardPasteRef.current = true;
        window.setTimeout(() => {
          internalBoardPasteRef.current = false;
        }, 0);
        pasteBoardClipboard();
      } else if (ctrl && key === "d") {
        event.preventDefault();
        duplicateBoardSelection();
      } else if (key === "q") {
        event.preventDefault();
        alignSelectionTop();
      } else if (key === "c" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        createCommentFrame();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteBoardSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alignSelectionTop, createCommentFrame, onChangeAssetReference]);

  const addExistingAsset = (
    asset: BoardAsset,
    position = { x: 180, y: 140 },
  ) => {
    setNodes((current) => {
      const next = [
        ...current,
        makeAssetNode(asset, position.x, position.y, onSelectAsset),
      ];
      nodesRef.current = next;
      return next;
    });
    onChangeAssetReference(asset.id, 1);
    onSelectAsset(asset.id);
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    const position =
      flowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? { x: 180, y: 140 };
    const assetId = event.dataTransfer.getData(
      "application/x-ins-reference-asset",
    );
    if (assetId) {
      const asset = assets.find((item) => item.id === assetId);
      if (asset) addExistingAsset(asset, position);
      return;
    }
    const entries = Array.from(event.dataTransfer.items)
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
      const files = (await Promise.all(entries.map(filesFromEntry))).flat();
      await importFiles(files, position);
      return;
    }
    await importFiles(Array.from(event.dataTransfer.files), position);
  };

  const openBoardNodeContextMenu = (
    event: ReactMouseEvent,
    node: BoardNode,
  ) => {
    event.preventDefault();
    const flowPosition =
      flowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? pastePointRef.current;
    pastePointRef.current = flowPosition;
    if (!node.selected) {
      setNodes((current) => {
        const next = current.map((item) => ({
          ...item,
          selected: item.id === node.id,
        }));
        nodesRef.current = next;
        return next;
      });
    }
    if (node.type === "boardAsset") {
      onSelectAsset(node.data.assetId);
    }
    setBoardContextMenu({
      x: event.clientX,
      y: event.clientY,
      target: "node",
      nodeId: node.id,
      assetId: node.type === "boardAsset" ? node.data.assetId : undefined,
      flowPosition,
    });
  };

  const openBoardPaneContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    const flowPosition =
      flowRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) ?? pastePointRef.current;
    pastePointRef.current = flowPosition;
    setBoardContextMenu({
      x: event.clientX,
      y: event.clientY,
      target: "pane",
      flowPosition,
    });
  };

  const openDockAssetContextMenu = (
    event: ReactMouseEvent,
    asset: BoardAsset,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectAsset(asset.id);
    setBoardContextMenu({
      x: event.clientX,
      y: event.clientY,
      target: "dock",
      assetId: asset.id,
      flowPosition: pastePointRef.current,
    });
  };

  const downloadBoardAsset = (asset: BoardAsset | undefined) => {
    if (!asset?.previewUrl) return;
    const anchor = document.createElement("a");
    anchor.href = asset.previewUrl;
    anchor.download = asset.name;
    anchor.click();
  };

  const downloadActiveAsset = () => downloadBoardAsset(activeAsset);

  const handleSlices = (slices: BoardAsset[]) => {
    const sourceNode = nodesRef.current.find(
      (node) =>
        node.type === "boardAsset" &&
        node.data.assetId === splitAsset?.id,
    );
    const x = (sourceNode?.position.x ?? 160) + 290;
    const y = sourceNode?.position.y ?? 120;
    onCreateAssets(slices);
    const sliceNodes = slices.map((asset, index) =>
      makeAssetNode(
        asset,
        x + (index % 4) * 238,
        y + Math.floor(index / 4) * 190,
        onSelectAsset,
      ),
    );
    setNodes((current) => {
      const next = [...current, ...sliceNodes];
      nodesRef.current = next;
      return next;
    });
    if (sourceNode) {
      setEdges((current) => [
        ...current,
        ...sliceNodes.map((node, index) => ({
          id: `crop-edge-${Date.now()}-${index}`,
          source: sourceNode.id,
          target: node.id,
          label: "裁切自",
          style: { stroke: "#a23b2a", strokeWidth: 1.4 },
          labelStyle: { fill: "#7f3024", fontSize: 9, fontWeight: 700 },
        })),
      ]);
    }
    if (slices[0]) onSelectAsset(slices[0].id);
  };

  const startDockResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    if (dockCollapsed || event.button !== 0) return;

    const resizeHandle = event.currentTarget;
    const boardView = boardViewRef.current;
    if (!boardView) return;

    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = dockHeight;
    let pendingHeight = startHeight;
    let animationFrame: number | null = null;
    let finished = false;

    resizeHandle.setPointerCapture(pointerId);
    boardView.dataset.dockResizing = "true";

    const paintPendingHeight = () => {
      animationFrame = null;
      boardView.style.setProperty(
        "--asset-dock-height",
        `${pendingHeight}px`,
      );
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      pendingHeight = clampDockHeight(
        startHeight + startY - moveEvent.clientY,
      );
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(paintPendingHeight);
      }
    };

    const finishResize = (finishEvent?: PointerEvent) => {
      if (
        finished ||
        (finishEvent && finishEvent.pointerId !== pointerId)
      ) {
        return;
      }
      finished = true;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      paintPendingHeight();
      setDockHeight(pendingHeight);
      delete boardView.dataset.dockResizing;
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", finishResize);
      resizeHandle.removeEventListener("pointercancel", finishResize);
      resizeHandle.removeEventListener("lostpointercapture", finishResize);
      if (resizeHandle.hasPointerCapture(pointerId)) {
        resizeHandle.releasePointerCapture(pointerId);
      }
    };

    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", finishResize);
    resizeHandle.addEventListener("pointercancel", finishResize);
    resizeHandle.addEventListener("lostpointercapture", finishResize);
  };

  const contextNode = boardContextMenu?.nodeId
    ? nodes.find((node) => node.id === boardContextMenu.nodeId)
    : undefined;
  const contextAsset = boardContextMenu?.assetId
    ? assets.find((asset) => asset.id === boardContextMenu.assetId)
    : undefined;
  const contextNodeIds = new Set(
    nodes
      .filter(
        (node) =>
          node.selected ||
          (boardContextMenu?.nodeId !== undefined &&
            node.id === boardContextMenu.nodeId),
      )
      .map((node) => node.id),
  );
  const selectedAssetNodeCount = nodes.filter(
    (node) =>
      contextNodeIds.has(node.id) && node.type === "boardAsset",
  ).length;
  const contextHasConnections = edges.some(
    (edge) =>
      contextNodeIds.has(edge.source) || contextNodeIds.has(edge.target),
  );
  const boardContextMenuItems: ApplicationContextMenuItem[] =
    boardContextMenu?.target === "dock" && contextAsset
      ? [
          {
            id: "dock-preview",
            label: "预览资源",
            onSelect: () => onSelectAsset(contextAsset.id),
          },
          {
            id: "dock-add",
            label: "添加到参考板",
            onSelect: () =>
              addExistingAsset(
                contextAsset,
                boardContextMenu.flowPosition,
              ),
          },
          {
            id: "dock-download",
            label: "下载原文件",
            disabled: !contextAsset.previewUrl,
            onSelect: () => downloadBoardAsset(contextAsset),
          },
          {
            id: "dock-split",
            label: "图片切图",
            disabled:
              contextAsset.kind !== "image" || !contextAsset.previewUrl,
            onSelect: () => setSplitAsset(contextAsset),
          },
        ]
      : [
          ...(contextNode
            ? [
                {
                  id: "preview",
                  label:
                    contextNode.type === "boardAsset"
                      ? "预览资源"
                      : "选择备注框",
                  disabled: contextNode.type !== "boardAsset",
                  onSelect: () => {
                    if (contextNode.type === "boardAsset") {
                      onSelectAsset(contextNode.data.assetId);
                    }
                  },
                },
                {
                  id: "disconnect",
                  label: "断开当前项",
                  disabled: !contextHasConnections,
                  onSelect: () =>
                    disconnectBoardSelection(contextNode.id),
                },
                ...(contextAsset
                  ? [
                      {
                        id: "download",
                        label: "下载原文件",
                        disabled: !contextAsset.previewUrl,
                        onSelect: () => downloadBoardAsset(contextAsset),
                      },
                      {
                        id: "split",
                        label: "图片切图",
                        disabled:
                          contextAsset.kind !== "image" ||
                          !contextAsset.previewUrl,
                        onSelect: () => setSplitAsset(contextAsset),
                      },
                    ]
                  : []),
                {
                  id: "node-separator",
                  label: "",
                  separator: true,
                },
              ]
            : []),
          {
            id: "cut",
            label: "剪切",
            shortcut: "Ctrl+X",
            disabled: contextNodeIds.size === 0,
            onSelect: () =>
              cutBoardSelection(boardContextMenu?.nodeId),
          },
          {
            id: "copy",
            label: "复制",
            shortcut: "Ctrl+C",
            disabled: contextNodeIds.size === 0,
            onSelect: () =>
              copyBoardSelection(boardContextMenu?.nodeId),
          },
          {
            id: "paste",
            label: "粘贴",
            shortcut: "Ctrl+V",
            disabled: !boardClipboard,
            onSelect: () =>
              pasteBoardClipboard(
                boardClipboard,
                boardContextMenu?.flowPosition,
              ),
          },
          {
            id: "duplicate",
            label: "复制（原地）",
            shortcut: "Ctrl+D",
            disabled: contextNodeIds.size === 0,
            onSelect: () =>
              duplicateBoardSelection(boardContextMenu?.nodeId),
          },
          {
            id: "edit-separator",
            label: "",
            separator: true,
          },
          {
            id: "delete",
            label: "删除",
            shortcut: "Delete",
            disabled: contextNodeIds.size === 0,
            danger: true,
            onSelect: () =>
              deleteBoardSelection(boardContextMenu?.nodeId),
          },
          {
            id: "selection-separator",
            label: "",
            separator: true,
          },
          {
            id: "select-all",
            label: "全选",
            shortcut: "Ctrl+A",
            disabled: nodes.length === 0,
            onSelect: selectAllBoardNodes,
          },
          {
            id: "comment",
            label: "添加备注（包围选区）",
            shortcut: "C",
            disabled: selectedAssetNodeCount === 0,
            onSelect: createCommentFrame,
          },
          {
            id: "align",
            label: "自动对齐 / 排版",
            shortcut: "Q",
            disabled: selectedAssetNodeCount < 2,
            onSelect: alignSelectionTop,
          },
        ];

  return (
    <div
      ref={boardViewRef}
      className="reference-board-view"
      style={
        {
          "--asset-dock-height": dockCollapsed
            ? "36px"
            : `${dockHeight}px`,
        } as CSSProperties
      }
    >
      <div className="reference-board-main">
        <section className="reference-board-canvas">
          <div className="reference-board-toolbar">
            <div>
              <span>REFERENCE BOARD</span>
              <input
                value={boardTitle}
                onChange={(event) => setBoardTitle(event.target.value)}
                aria-label="参考板名称"
              />
            </div>
            <div>
              <button type="button" onClick={alignSelectionTop}>
                Q 顶部对齐
              </button>
              <button type="button" onClick={createCommentFrame}>
                C 备注框
              </button>
              <button
                type="button"
                onClick={() =>
                  flowRef.current?.fitView({ padding: 0.18, duration: 220 })
                }
              >
                适应画布
              </button>
            </div>
          </div>

          <div className="reference-flow-wrap">
            <ReactFlowCanvas
              nodes={nodes}
              edges={edges}
              nodeTypes={boardNodeTypes}
              onInit={(instance) => {
                flowRef.current =
                  instance as unknown as ReactFlowInstance<BoardNode, Edge>;
              }}
              onNodesChange={(changes) => {
                const next = applyNodeChanges<BoardNode>(
                  changes as Parameters<
                    typeof applyNodeChanges<BoardNode>
                  >[0],
                  nodesRef.current,
                );
                nodesRef.current = next;
                setNodes(next);
              }}
              onEdgesChange={(changes) =>
                setEdges((current) => applyEdgeChanges(changes, current))
              }
              onConnect={(connection: Connection) =>
                setEdges((current) =>
                  addEdge(
                    {
                      ...connection,
                      id: `board-edge-${Date.now()}`,
                      label: "关联",
                    },
                    current,
                  ),
                )
              }
              onPaneMouseMove={(event) => {
                pastePointRef.current =
                  flowRef.current?.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                  }) ?? pastePointRef.current;
              }}
              onNodeDoubleClick={(_event, node) => {
                if (node.type === "boardAsset") {
                  onSelectAsset(
                    (node as Node<AssetNodeData, "boardAsset">).data
                      .assetId,
                  );
                }
              }}
              onNodeContextMenu={(event, node) =>
                openBoardNodeContextMenu(
                  event as ReactMouseEvent,
                  node as BoardNode,
                )
              }
              onPaneContextMenu={(event) =>
                openBoardPaneContextMenu(event as ReactMouseEvent)
              }
              onPaneClick={() => setBoardContextMenu(null)}
              onDragOver={(event) => {
                if (
                  event.dataTransfer.types.includes("Files") ||
                  event.dataTransfer.types.includes(
                    "application/x-ins-reference-asset",
                  )
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={onDrop}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
              minZoom={0.2}
              maxZoom={2.4}
              zoomOnScroll
              zoomOnPinch
              panOnScroll={false}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              panOnDrag={[1, 2]}
              panActivationKeyCode="Space"
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} color="#cec9bd" />
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap
                position="bottom-left"
                pannable
                zoomable
                nodeColor={(node) =>
                  node.type === "boardFrame" ? "#d7c8a7" : "#846f55"
                }
                maskColor="rgba(245, 242, 234, 0.72)"
              />
              {nodes.length === 0 && (
                <Panel position="top-center" className="reference-board-empty">
                  <span>EMPTY REFERENCE BOARD</span>
                  <strong>拖入文件、目录，或直接粘贴图片</strong>
                  <small>资源会自动登记到下方资源目录</small>
                </Panel>
              )}
            </ReactFlowCanvas>
          </div>
        </section>

        <aside className="reference-preview-panel">
          <header>
            <div>
              <span>ASSET PREVIEW</span>
              <strong>资源预览</strong>
            </div>
            <button
              type="button"
              aria-label="下载当前资源"
              disabled={!activeAsset?.previewUrl}
              onClick={downloadActiveAsset}
            >
              ↓
            </button>
          </header>
          {activeAsset ? (
            <div className="reference-preview-content">
              <div className={`reference-preview-stage asset-${activeAsset.kind}`}>
                {previewTab === "info" ? (
                  <div className="reference-info-card">
                    <span>{activeAsset.kind.toUpperCase()}</span>
                    <strong>{activeAsset.name}</strong>
                    <p>{activeAsset.path}</p>
                    <small>{activeAsset.size} · {activeAsset.references} 个引用</small>
                  </div>
                ) : activeAsset.previewUrl && activeAsset.kind === "image" ? (
                  <img src={activeAsset.previewUrl} alt={activeAsset.name} />
                ) : activeAsset.previewUrl && activeAsset.kind === "video" ? (
                  <video src={activeAsset.previewUrl} controls />
                ) : activeAsset.previewUrl && activeAsset.kind === "model" ? (
                  <ModelPreview
                    url={activeAsset.previewUrl}
                    fileName={activeAsset.name}
                  />
                ) : activeAsset.previewUrl &&
                  (activeAsset.kind === "document" ||
                    activeAsset.kind === "audio" ||
                    activeAsset.kind === "text") ? (
                  <DocumentMediaPreview
                    url={activeAsset.previewUrl}
                    fileName={activeAsset.name}
                  />
                ) : (
                  <span>{assetGlyph(activeAsset.kind)}</span>
                )}
              </div>
              <div className="reference-preview-tabs">
                <button
                  type="button"
                  className={previewTab === "preview" ? "active" : ""}
                  onClick={() => setPreviewTab("preview")}
                >
                  预览
                </button>
                <button
                  type="button"
                  className={previewTab === "info" ? "active" : ""}
                  onClick={() => setPreviewTab("info")}
                >
                  信息
                </button>
              </div>
              <div className="reference-preview-meta">
                <span>{activeAsset.kind.toUpperCase()}</span>
                <h3>{activeAsset.name}</h3>
                <p>{activeAsset.path}</p>
                {activeAsset.sourceAssetId && (
                  <small>由资源 {activeAsset.sourceAssetId} 裁切生成</small>
                )}
                <dl>
                  <div>
                    <dt>大小</dt>
                    <dd>{activeAsset.size}</dd>
                  </div>
                  <div>
                    <dt>引用</dt>
                    <dd>{activeAsset.references}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="button-primary"
                  disabled={
                    activeAsset.kind !== "image" || !activeAsset.previewUrl
                  }
                  onClick={() => setSplitAsset(activeAsset)}
                >
                  ✂ 图片切图
                </button>
              </div>
            </div>
          ) : (
            <div className="reference-preview-empty">
              <span>◎</span>
              <strong>选择一个资源进行预览</strong>
            </div>
          )}
        </aside>
      </div>

      <section className="reference-asset-dock">
        <button
          type="button"
          className="reference-dock-resizer"
          aria-label="调整资源目录高度"
          onPointerDown={startDockResize}
        />
        <header>
          <div>
            <span>RESOURCE DIRECTORY</span>
            <strong>资源目录</strong>
          </div>
          <nav>
            <button
              type="button"
              className={assetFilter === "board" ? "active" : ""}
              onClick={() => setAssetFilter("board")}
            >
              当前参考板
            </button>
            <button
              type="button"
              className={assetFilter === "all" ? "active" : ""}
              onClick={() => setAssetFilter("all")}
            >
              全部资源
            </button>
          </nav>
          <button
            type="button"
            className="dock-collapse"
            onClick={() => setDockCollapsed((current) => !current)}
          >
            {dockCollapsed ? "展开" : "收起"}
          </button>
        </header>
        {!dockCollapsed && (
          <div className="reference-dock-body">
            <aside>
              <button
                type="button"
                className={assetSourceFilter === "all" ? "active" : ""}
                onClick={() => setAssetSourceFilter("all")}
              >
                ▾ 📁 Assets <small>{assets.length}</small>
              </button>
              <button
                type="button"
                className={assetSourceFilter === "board-import" ? "active" : ""}
                onClick={() => setAssetSourceFilter("board-import")}
              >
                　📁 参考板导入
              </button>
              <button
                type="button"
                className={assetSourceFilter === "clipboard" ? "active" : ""}
                onClick={() => setAssetSourceFilter("clipboard")}
              >
                　📁 剪贴板
              </button>
              <button
                type="button"
                className={assetSourceFilter === "slices" ? "active" : ""}
                onClick={() => setAssetSourceFilter("slices")}
              >
                　📁 图片切片
              </button>
            </aside>
            <div className="reference-dock-assets">
              {visibleAssets.map((asset) => (
                <button
                  type="button"
                  draggable
                  key={asset.id}
                  className={asset.id === activeAssetId ? "selected" : ""}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/x-ins-reference-asset",
                      asset.id,
                    );
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onSelectAsset(asset.id)}
                  onDoubleClick={() => addExistingAsset(asset)}
                  onContextMenu={(event) =>
                    openDockAssetContextMenu(event, asset)
                  }
                >
                  <div className={`asset-${asset.kind}`}>
                    {asset.previewUrl && asset.kind === "image" ? (
                      <img src={asset.previewUrl} alt="" draggable={false} />
                    ) : (
                      <span>{assetGlyph(asset.kind)}</span>
                    )}
                  </div>
                  <strong>{asset.name}</strong>
                  <small>{asset.path}</small>
                </button>
              ))}
              {visibleAssets.length === 0 && (
                <div className="reference-dock-empty">
                  将文件拖入中央画布，或切换到“全部资源”
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {boardContextMenu && (
        <ApplicationContextMenu
          x={boardContextMenu.x}
          y={boardContextMenu.y}
          items={boardContextMenuItems}
          ariaLabel={
            boardContextMenu.target === "dock"
              ? `资源「${contextAsset?.name ?? ""}」快捷操作`
              : boardContextMenu.target === "node"
                ? "参考板对象快捷操作"
                : "参考板画布快捷操作"
          }
          onClose={() => setBoardContextMenu(null)}
        />
      )}

      {splitAsset && splitAsset.previewUrl && (
        <ImageSplitDialog
          asset={splitAsset}
          onClose={() => setSplitAsset(null)}
          onComplete={handleSlices}
        />
      )}
    </div>
  );
}
