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
  assert.match(html, /Explorer/);
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
  assert.match(page, /function ExplorerView/);
  assert.match(page, /拖入文件或整个目录/);
  assert.match(page, /创建 Node/);
  assert.match(layout, /lang="zh-CN"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page, /SkeletonPreview/);
  assert.doesNotMatch(layout, /Starter Project/);
});

test("core workspace interactions are wired", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /createWorkspace/);
  assert.match(page, /switchWorkspace/);
  assert.match(page, /ReactFlowCanvas/);
  assert.match(page, /zoomOnScroll/);
  assert.match(page, /deleteSelectedNodes/);
  assert.match(page, /application\/x-ins-asset/);
  assert.match(page, /createConnectedNode/);
  assert.match(page, /createTopic/);
  assert.match(page, /inscription-workspaces-v1/);
  assert.match(page, /data-node-id=/);
  assert.match(
    page,
    /id: "narrative", label: "Narrative", shortcut: "5", disabled: true/,
  );
  assert.match(
    page,
    /id: "topics", label: "专题", shortcut: "6", disabled: true/,
  );
  assert.match(page, /disabled=\{item\.disabled\}/);
});

test("node dragging stays local to the canvas until drop", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /flowNodesRef\.current = next/);
  assert.match(page, /onNodeDragStop=\{persistFlowPositions\}/);
  assert.match(page, /position\.x, y: position\.y/);
  assert.doesNotMatch(page, /ResizeObserver loop completed/);
});

test("reference board workflow is wired", async () => {
  const [page, board, localAssets] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-assets.ts", import.meta.url), "utf8"),
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
  assert.doesNotMatch(
    board,
    /const onMove = \(moveEvent: PointerEvent\) => \{\s*setDockHeight\(/,
  );
});

test("graph supports Q alignment and C comment frames", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /alignSelectedGraphItems/);
  assert.match(page, /createGraphAnnotation/);
  assert.match(page, /graphAnnotations/);
  assert.match(page, /Q 对齐/);
  assert.match(page, /C 备注/);
});

test("local assets use a real Three.js model preview", async () => {
  const [page, viewer, localAssets, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/model-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ModelPreview/);
  assert.match(viewer, /GLTFLoader/);
  assert.match(viewer, /FBXLoader/);
  assert.match(viewer, /OBJLoader/);
  assert.match(viewer, /OrbitControls/);
  assert.match(viewer, /AnimationMixer/);
  assert.match(localAssets, /storeLocalAssetBlob/);
  assert.match(packageJson, /"three"/);
});

test("documents, spreadsheets, ebooks, and audio use real local preview engines", async () => {
  const [viewer, page, board, packageJson] = await Promise.all([
    readFile(new URL("../app/document-media-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/reference-board.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /DocumentMediaPreview/);
  assert.match(board, /DocumentMediaPreview/);
  assert.match(packageJson, /"pdfjs-dist"/);
  assert.match(packageJson, /"wavesurfer\.js"/);
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
