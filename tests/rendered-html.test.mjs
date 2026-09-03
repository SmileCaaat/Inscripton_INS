import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the INS Studio shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Inscription · 数字人文知识平台<\/title>/i);
  assert.match(html, /Inscription/);
  assert.match(html, /数字人文知识平台/);
  assert.match(html, /归档/);
  assert.doesNotMatch(html, />Explorer</);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /Your site is taking shape/);
});

test("starter preview is fully removed", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  assert.match(page, /ArchiveView/);
  assert.match(page, /拖入文件或整个目录/);
  assert.match(page, /创建 Node/);
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /SkeletonPreview/);
  assert.doesNotMatch(layout, /Starter Project/);
});

test("localhost HMR does not recursively forward errors before connecting", async () => {
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(viteConfig, /forwardConsole: false/);
  assert.match(viteConfig, /send was called before connect/);
});

test("core workspace interactions are wired", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(
    page,
    /id: "assets", label: "资源", shortcut: "1"[\s\S]*id: "boards", label: "参考板", shortcut: "2"[\s\S]*id: "nodes", label: "节点", shortcut: "3"[\s\S]*id: "graph", label: "图谱", shortcut: "4"[\s\S]*id: "map", label: "地图", shortcut: "5"/,
  );
  assert.match(page, /createWorkspace/);
  assert.match(page, /switchWorkspace/);
  assert.match(page, /ReactFlowCanvas/);
  assert.match(page, /zoomOnScroll/);
  assert.match(page, /deleteSelectedNodes/);
  assert.match(page, /application\/x-ins-asset/);
  assert.match(page, /createConnectedNode/);
  assert.match(page, /inscription-workspaces-v1/);
  assert.match(page, /data-node-id=/);
  assert.match(
    page,
    /id: "archive", label: "归档", shortcut: "6"/,
  );
  assert.match(page, /id: "ocr", label: "OCR", shortcut: "7"/);
  assert.doesNotMatch(page, /label: "Narrative"/);
  assert.doesNotMatch(page, /label: "专题"/);
});

test("map view places knowledge nodes on MapLibre with deck.gl", async () => {
  const [page, map, geo, io, styles, packageJson, viteConfig] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio-map.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/geo.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/map-io.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /id: "map", label: "地图"/);
  assert.match(page, /StudioMapCanvas/);
  assert.match(page, /section === "map"/);
  assert.match(page, /stampSampleNode/);
  assert.match(page, /longitude: 113\.54072/);
  assert.match(page, /latitude: 22\.19756/);
  assert.match(page, /妈阁庙/);
  assert.match(page, /议事亭前地/);
  assert.match(page, /澳门历史城区/);
  assert.match(page, /HISTORIC_CENTRE_RING/);
  assert.match(page, /yearFrom/);
  assert.match(page, /updateSelectedNodeGeo/);
  assert.match(page, /在地图中查看/);
  assert.match(page, /createMapPlaces/);
  assert.match(page, /onCreatePlaces/);
  assert.doesNotMatch(page, /from "\.\/studio-map"/);
  assert.match(geo, /export type StudioMapGeo/);
  assert.match(geo, /polygon\?:/);
  assert.match(geo, /export function hasMapPolygon/);
  assert.match(geo, /export function yearsOverlap/);
  assert.match(geo, /export function geoFromRing/);
  assert.match(map, /react-map-gl\/maplibre/);
  assert.match(map, /ins-map-heat/);
  assert.match(map, /TripsLayer/);
  assert.match(map, /PolygonLayer/);
  assert.match(map, /时间轴/);
  assert.match(map, /四种印记/);
  assert.match(map, /画点/);
  assert.match(map, /底图标签/);
  assert.match(map, /导出 GeoJSON/);
  assert.match(map, /fitBounds/);
  assert.match(io, /export function parseCsvPlaces/);
  assert.match(io, /export function parseGeoJsonPlaces/);
  assert.match(io, /FeatureCollection/);
  assert.match(styles, /\.studio-map-timeline/);
  assert.match(styles, /\.studio-map-inscriptions/);
  assert.match(styles, /\.studio-map-tools/);
  assert.match(viteConfig, /exclude: \["maplibre-gl"\]/);
  assert.match(styles, /\.studio-map-timeline/);
  assert.match(styles, /\.studio-map-inscriptions/);
  assert.match(packageJson, /"maplibre-gl"/);
  assert.match(packageJson, /"@deck.gl\/aggregation-layers"/);
  assert.match(packageJson, /"@deck.gl\/geo-layers"/);
  assert.match(packageJson, /"react-map-gl"/);
});

test("node dragging stays local to the canvas until drop", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /flowNodesRef\.current = next/);
  assert.match(page, /onNodeDragStop=\{persistFlowPositions\}/);
  assert.match(page, /position\.x, y: position\.y/);
  assert.doesNotMatch(page, /ResizeObserver loop completed/);
});

test("graph relation labels can be edited directly from an edge", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /EditableRelationEdge/);
  assert.match(page, /EdgeLabelRenderer/);
  assert.match(page, /beginRelationEdit/);
  assert.match(page, /commitRelationLabel/);
  assert.match(page, /edgeTypes=\{editableRelationEdgeTypes\}/);
  assert.match(page, /onEdgeClick=/);
  assert.match(page, /aria-label="编辑关系文字"/);
  assert.match(page, /event\.key === "Enter"/);
  assert.match(page, /event\.key === "Escape"/);
});

test("reference board workflow is wired", async () => {
  const [page, board, localAssets, styles, assetPreview] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/asset-preview.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /label: "参考板"/);
  assert.match(page, /ReferenceBoardView/);
  assert.match(board, /application\/x-ins-reference-asset/);
  assert.match(board, /window\.addEventListener\("paste"/);
  assert.match(localAssets, /indexedDB\.open/);
  assert.match(board, /生成切片并放入参考板/);
  assert.match(board, /宫格分割/);
  assert.match(board, /自由画框/);
  assert.match(board, /key === "q"/);
  assert.match(board, /key === "c"/);
  assert.match(board, /requestAnimationFrame\(paintPendingHeight\)/);
  assert.match(board, /setPointerCapture\(pointerId\)/);
  assert.match(board, /setDockHeight\(pendingHeight\)/);
  assert.match(board, /startPreviewResize/);
  assert.match(board, /--reference-preview-width/);
  assert.match(board, /dataset\.previewResizing/);
  assert.match(board, /onRenameAsset/);
  assert.match(board, /onCreateDeliveryPackage/);
  assert.match(board, /从参考板移除/);
  assert.match(board, /REFERENCE_PREVIEW_DEFAULT_WIDTH = 420/);
  assert.match(board, /LEGACY_REFERENCE_PREVIEW_DEFAULT_WIDTH = 310/);
  assert.match(page, /<AssetPreview/);
  assert.match(board, /<AssetPreview/);
  assert.match(assetPreview, /asset-preview-stage/);
  assert.match(styles, /aspect-ratio: 4 \/ 3/);
  assert.doesNotMatch(
    board,
    /const onMove = \(moveEvent: PointerEvent\) => \{\s*setDockHeight\(/,
  );
});

test("assets support managed source files and delivery packages", async () => {
  const [page, workspaceFiles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-files.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /connectWorkspaceDirectory/);
  assert.match(page, /renameWorkspaceAssetFile/);
  assert.match(page, /createDeliveryPackage/);
  assert.match(page, /deliveryPackages/);
  assert.match(page, /Deliveries\/\$\{packageName\}/);
  assert.match(page, /ArchiveView/);
  assert.match(workspaceFiles, /showDirectoryPicker/);
  assert.match(workspaceFiles, /createWorkspaceDeliveryDirectories/);
  assert.match(workspaceFiles, /"Assets"/);
  assert.match(workspaceFiles, /"Deliveries"/);
  assert.match(workspaceFiles, /"INS_delivery\.json"/);
});

test("local file reveal and global edit shortcuts are wired", async () => {
  const [page, board, workspaceFiles, desktop, preload, main] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-files.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/desktop-bridge.ts", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);

  assert.match(page, /浏览到本地文件/);
  assert.match(page, /revealAsset/);
  assert.match(page, /copySelectedNodes/);
  assert.match(page, /pasteGraphClipboard/);
  assert.match(page, /renameSelectedNode/);
  assert.match(page, /isTypingTarget/);
  assert.match(page, /revealNodeLocalFile/);
  assert.match(page, /section === "graph" \|\| section === "boards"/);
  assert.match(page, /section === "nodes"/);
  assert.match(page, /section !== "graph" && section !== "nodes"/);
  assert.match(board, /浏览到本地文件/);
  assert.match(board, /key === "f2"/);
  assert.match(board, /onRevealAsset/);
  assert.match(workspaceFiles, /revealLocalAsset/);
  assert.match(workspaceFiles, /showOpenFilePicker/);
  assert.match(workspaceFiles, /startIn/);
  assert.match(workspaceFiles, /via: "explorer" \| "picker"/);
  assert.match(page, /已打开「\$\{asset\.name\}」的本机位置/);
  assert.doesNotMatch(
    page,
    /当前浏览器无法打开资源管理器，请使用桌面版浏览本机文件/,
  );
  assert.match(workspaceFiles, /inscription-workspace-roots-v1/);
  assert.match(desktop, /chooseDirectory/);
  assert.match(preload, /ins:reveal-in-folder/);
  assert.match(main, /shell.showItemInFolder/);
});

test("graph supports Q alignment and C comment frames", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /alignSelectedGraphItems/);
  assert.match(page, /createGraphAnnotation/);
  assert.match(page, /graphAnnotations/);
  assert.match(page, /Q 对齐/);
  assert.match(page, /C 备注/);
  assert.match(page, /<kbd>Ctrl\+C<\/kbd>/);
  assert.match(page, /<kbd>Ctrl\+V<\/kbd>/);
  assert.match(page, /<kbd>F2<\/kbd>/);
});

test("local assets use a real Three.js model preview", async () => {
  const [assetPreview, viewer, localAssets, packageJson] = await Promise.all([
    readFile(new URL("../app/asset-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/model-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(assetPreview, /ModelPreview/);
  assert.match(viewer, /GLTFLoader/);
  assert.match(viewer, /FBXLoader/);
  assert.match(viewer, /OBJLoader/);
  assert.match(viewer, /OrbitControls/);
  assert.match(viewer, /AnimationMixer/);
  assert.match(localAssets, /storeLocalAssetBlob/);
  assert.match(packageJson, /"three"/);
});

test("documents, spreadsheets, ebooks, and audio use real local preview engines", async () => {
  const [viewer, assetPreview, packageJson] = await Promise.all([
    readFile(new URL("../app/document-media-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/asset-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(viewer, /pdfjs-dist/);
  assert.match(viewer, /mammoth/);
  assert.match(viewer, /xlsx/);
  assert.match(viewer, /epubjs/);
  assert.match(viewer, /wavesurfer\.js/);
  assert.match(viewer, /PdfPreview/);
  assert.match(viewer, /SpreadsheetPreview/);
  assert.match(viewer, /AudioPreview/);
  assert.match(viewer, /TextDocumentEditor/);
  assert.match(assetPreview, /DocumentMediaPreview/);
  assert.match(packageJson, /"pdfjs-dist"/);
  assert.match(packageJson, /"wavesurfer\.js"/);
});

test("text assets can be created and edited as notes or structured data", async () => {
  const [page, editor, helpers, board, preview] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/text-document-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/text-documents.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/asset-preview.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /createBlankTextAsset\("md"\)/);
  assert.match(page, /createBlankTextAsset\("json"\)/);
  assert.match(page, /createBlankTextAsset\("txt"\)/);
  assert.match(page, /saveTextAsset/);
  assert.match(page, /onSaveText=\{saveTextAsset\}/);
  assert.match(page, /新建 Markdown 笔记/);
  assert.match(helpers, /markdownNoteTemplate/);
  assert.match(helpers, /jsonDataTemplate/);
  assert.match(helpers, /renderMarkdownToHtml/);
  assert.match(helpers, /parseJsonDocument/);
  assert.match(helpers, /EDITABLE_TEXT_EXTENSIONS/);
  assert.match(editor, /aria-label=\{`\$\{role\}编辑器`\}/);
  assert.match(editor, /persist\("auto", draft\)/);
  assert.match(editor, /persist\("manual"/);
  assert.match(editor, /格式化/);
  assert.match(editor, /JsonTree/);
  assert.match(board, /onSaveText/);
  assert.match(board, /\/\\\.\(md\|txt\|json\|xml\|html\|css\|js\|ts\)\$\/i/);
  assert.match(preview, /isEditableTextFile/);
  assert.match(preview, /可编辑本机文本/);
});

test("OCR keeps local raw geometry separate from human-corrected text", async () => {
  const [page, panel, service, storage, types, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ocr-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ocr/ocr-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ocr/ocr-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/ocr/ocr-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /OCR 文本识别/);
  assert.match(page, /<OcrPanel/);
  assert.match(panel, /人工校勘文本/);
  assert.match(panel, /保存为校勘文本资源/);
  assert.match(panel, /导出 Markdown/);
  assert.match(service, /worker: true/);
  assert.match(service, /numThreads: 2/);
  assert.match(service, /PP-OCRv5/);
  assert.match(service, /textDetectionModelAsset/);
  assert.match(service, /textRecognitionModelAsset/);
  assert.match(service, /createLocalWasmPaths/);
  assert.match(service, /wasmPaths: wasmPaths/);
  assert.match(service, /URL\.createObjectURL/);
  assert.match(service, /\/ocr-models\//);
  assert.match(service, /\/ocr-runtime\//);
  assert.doesNotMatch(service, /https:\/\//);
  await access(new URL("../public/ocr-models/PP-OCRv5_mobile_det_onnx_infer.tar", import.meta.url));
  await access(new URL("../public/ocr-models/PP-OCRv5_mobile_rec_onnx_infer.tar", import.meta.url));
  await access(new URL("../public/ocr-runtime/ort-wasm-simd-threaded.jsep.mjs", import.meta.url));
  await access(new URL("../public/ocr-runtime/ort-wasm-simd-threaded.jsep.wasm", import.meta.url));
  assert.match(storage, /indexedDB\.open/);
  assert.match(types, /rawText/);
  assert.match(types, /correctedText/);
  assert.match(types, /polygon/);
  assert.match(packageJson, /"@paddleocr\/paddleocr-js"/);
});

test("INS Archive exports five resource kinds with validation and checksums", async () => {
  const [page, archive, board, packageJson, archiveSpec] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/archive-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/INS归档格式v1.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /label: "归档"/);
  assert.match(page, /<ArchiveView/);
  assert.match(archive, /Text · Image · Model · Video · Audio/);
  assert.match(archive, /audio: \{ code: "A", folder: "audio" \}/);
  assert.match(archive, /checksums\.sha256/);
  assert.match(archive, /SHA-256/);
  assert.match(archive, /generateAsync/);
  assert.match(archive, /本地源文件不可用/);
  assert.match(board, /duration\?: number/);
  assert.match(board, /sampleRate\?: number/);
  assert.match(packageJson, /"jszip"/);
  assert.match(archiveSpec, /Text \/ Image \/ Model \/ Video \/ Audio/);
});

test("INS Archive creates Astro exhibitions from current or existing archives", async () => {
  const [archive, exhibition, styles, workflow] = await Promise.all([
    readFile(new URL("../app/archive-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exhibition-project.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../docs/INS-Astro展示工作流.md", import.meta.url), "utf8"),
  ]);

  assert.match(archive, /基于当前归档创建/);
  assert.match(archive, /选择已有 \.insarchive/);
  assert.match(archive, /JSZip\.loadAsync\(file\)/);
  assert.match(archive, /createExhibitionProject/);
  assert.match(exhibition, /"collection" \| "research" \| "spatial"/);
  assert.match(exhibition, /astro: "\^7\.2\.9"/);
  assert.match(exhibition, /@google\/model-viewer/);
  assert.match(exhibition, /src\/pages\/nodes\/\[id\]\.astro/);
  assert.match(exhibition, /src\/pages\/assets\/\[id\]\.astro/);
  assert.match(exhibition, /sourceArchiveChecksum/);
  assert.match(exhibition, /Start-Localhost\.ps1/);
  assert.match(exhibition, /Build-Release\.ps1/);
  assert.match(styles, /\.archive-template-grid/);
  assert.match(workflow, /INS 工作区 → 归档检查 → \.insarchive → Astro 展示项目/);
});

test("resource gallery and preview use a flush resizable split layout", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /section !== "assets"/);
  assert.match(page, /className="asset-panel-resizer"/);
  assert.match(page, /role="separator"/);
  assert.match(page, /setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /inscription-asset-preview-width-v1/);
  assert.match(styles, /--asset-preview-width/);
  assert.match(styles, /\.asset-browser\.is-resizing/);
});

test("resources and reference boards use application context menus", async () => {
  const [page, board, contextMenu] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/application-context-menu.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /window\.addEventListener\("contextmenu"/);
  assert.match(page, /setAssetContextMenu/);
  assert.match(page, /复制（原地）/);
  assert.match(page, /在参考板中使用/);
  assert.match(board, /onNodeContextMenu/);
  assert.match(board, /onPaneContextMenu/);
  assert.match(board, /openDockAssetContextMenu/);
  assert.match(board, /copyBoardSelection/);
  assert.match(board, /pasteBoardClipboard/);
  assert.match(board, /disconnectBoardSelection/);
  assert.match(contextMenu, /createPortal/);
  assert.match(contextMenu, /role="menu"/);
});

test("Electron desktop packaging is wired for an offline Windows build", async () => {
  const [packageJson, desktopPackage, mainProcess, renderer, page, startScript, buildScript] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../electron/package.json", import.meta.url), "utf8"),
      readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
      readFile(
        new URL("../electron/renderer/main.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../Start-INS.cmd", import.meta.url), "utf8"),
      readFile(new URL("../Build-INS-Electron.cmd", import.meta.url), "utf8"),
    ]);

  assert.match(packageJson, /"desktop:dist"/);
  assert.match(packageJson, /electron-builder/);
  assert.match(desktopPackage, /"target": "portable"/);
  assert.match(desktopPackage, /ins-logo\.png/);
  assert.match(mainProcess, /contextIsolation: true/);
  assert.match(mainProcess, /nodeIntegration: false/);
  assert.match(mainProcess, /process\.resourcesPath/);
  assert.match(mainProcess, /loadFile/);
  assert.match(renderer, /<Home \/>/);
  assert.match(page, /window\.location\.protocol === "file:"/);
  assert.match(page, /\.\/ins-logo\.png/);
  assert.match(startScript, /scripts\\start-localhost\.cmd/);
  assert.match(buildScript, /scripts\\build-release\.cmd/);
});
