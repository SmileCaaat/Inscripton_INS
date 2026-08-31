import JSZip from "jszip";

export type ExhibitionTemplateId = "collection" | "research" | "spatial";

export const exhibitionTemplates: Array<{
  id: ExhibitionTemplateId;
  code: string;
  title: string;
  description: string;
}> = [
  {
    id: "collection",
    code: "01",
    title: "典藏总览",
    description: "以资源、节点和关系为入口，适合开放浏览与项目成果总览。",
  },
  {
    id: "research",
    code: "02",
    title: "研究叙事",
    description: "突出研究问题、节点摘要和证据链，适合论文伴生站与策展叙事。",
  },
  {
    id: "spatial",
    code: "03",
    title: "空间遗产",
    description: "优先呈现空间节点、图像和三维模型，适合建筑与场所研究。",
  },
];

type ArchiveManifest = {
  format?: string;
  version?: string;
  project?: { id?: string; title?: string };
  createdAt?: string;
};

type ExhibitionProjectOptions = {
  archiveZip: JSZip;
  sourceArchiveName: string;
  sourceArchiveChecksum: string;
  template: ExhibitionTemplateId;
};

const requiredArchiveFiles = [
  "manifest.json",
  "data/nodes.json",
  "data/assets.json",
  "data/relations.json",
] as const;

function safeProjectName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "INS-Exhibition";
}

function npmProjectName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized || "ins-exhibition";
}

async function requiredText(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) throw new Error(`归档缺少 ${path}`);
  return file.async("string");
}

function packageJson(projectTitle: string) {
  return JSON.stringify(
    {
      name: npmProjectName(`${projectTitle}-exhibition`),
      version: "1.0.0",
      private: true,
      type: "module",
      engines: { node: ">=24.0.0" },
      scripts: {
        dev: "astro dev",
        build: "astro build",
        preview: "astro preview",
      },
      dependencies: {
        "@google/model-viewer": "^4.3.1",
        astro: "^7.2.9",
      },
    },
    null,
    2,
  );
}

const astroConfig = `import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  build: { format: "directory" },
});
`;

const tsconfig = `{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
`;

const archiveLibrary = `import manifest from "../data/archive/manifest.json";
import nodes from "../data/archive/nodes.json";
import assets from "../data/archive/assets.json";
import relations from "../data/archive/relations.json";

export { manifest, nodes, assets, relations };

export const folderByType: Record<string, string> = {
  text: "text",
  image: "images",
  model: "models",
  video: "videos",
  audio: "audio",
};

export function assetUrl(asset: { type?: string; archiveFilename?: string }) {
  if (!asset.archiveFilename) return "";
  const folder = folderByType[asset.type || ""] || "media";
  return "/archive/" + folder + "/" + encodeURIComponent(asset.archiveFilename);
}

export function linkedAssets(node: { assetIds?: string[] }) {
  const ids = new Set(node.assetIds || []);
  return assets.filter((asset) => ids.has(asset.id));
}

export function relatedNodes(nodeId: string) {
  return relations
    .filter((relation) => relation.source === nodeId || relation.target === nodeId)
    .map((relation) => ({
      relation,
      node: nodes.find((candidate) =>
        candidate.id === (relation.source === nodeId ? relation.target : relation.source)
      ),
    }))
    .filter((entry) => entry.node);
}
`;

const layoutAstro = `---
import "../styles/global.css";

interface Props {
  title?: string;
  description?: string;
}

const {
  title = "INS Exhibition",
  description = "A digital humanities exhibition generated from an INS Archive.",
} = Astro.props;
---

<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="description" content={description} />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/">
        <span>INS</span>
        <strong>Digital Humanities Exhibition</strong>
      </a>
      <nav aria-label="主要导航">
        <a href="/#research">研究</a>
        <a href="/#collection">资源</a>
        <a href="/#relations">关系</a>
      </nav>
    </header>
    <slot />
    <footer>
      <span>Generated from an INS Archive</span>
      <a href="/#top">返回顶部 ↑</a>
    </footer>
  </body>
</html>
`;

function indexAstro(template: ExhibitionTemplateId) {
  return `---
import Layout from "../layouts/Layout.astro";
import { manifest, nodes, assets, relations, assetUrl } from "../lib/archive";

const template = ${JSON.stringify(template)};
const project = manifest.project || {};
const title = project.title || "未命名研究项目";
const descriptions = {
  collection: "从数字资源进入研究对象，在节点与关系之间建立可追溯的知识路径。",
  research: "以研究问题组织材料、证据与论点，让知识结构成为可以阅读的叙事。",
  spatial: "从场所、图像与三维证据出发，观察空间遗产在不同尺度中的联系。",
};
const eyebrow = {
  collection: "DIGITAL COLLECTION",
  research: "RESEARCH NARRATIVE",
  spatial: "SPATIAL HERITAGE",
}[template];
const featuredAssets = template === "spatial"
  ? [
      ...assets.filter((asset) => asset.type === "model" || asset.type === "image"),
      ...assets.filter((asset) => asset.type !== "model" && asset.type !== "image"),
    ]
  : assets;
const heroAsset = assets.find((asset) => asset.type === "image");
const heroStyle = heroAsset
  ? "background-image: linear-gradient(90deg, rgba(26,25,22,.92), rgba(26,25,22,.22)), url('" + assetUrl(heroAsset) + "')"
  : undefined;
const visibleNodes = template === "spatial"
  ? [...nodes.filter((node) => node.kind === "Space"), ...nodes.filter((node) => node.kind !== "Space")]
  : nodes;
---

<Layout title={title + " · INS Exhibition"} description={descriptions[template]}>
  <main id="top">
    <section class="hero" style={heroStyle}>
      <div class="hero-index">INS / {manifest.version || "1.0"}</div>
      <div class="hero-copy">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <div class="rule"></div>
        <p class="lede">{descriptions[template]}</p>
        <a class="primary-link" href="#research">开始浏览 <span>↘</span></a>
      </div>
      <dl class="metrics">
        <div><dt>节点</dt><dd>{nodes.length}</dd></div>
        <div><dt>资源</dt><dd>{assets.length}</dd></div>
        <div><dt>关系</dt><dd>{relations.length}</dd></div>
      </dl>
    </section>

    <section class="section-shell" id="research">
      <header class="section-heading">
        <div><span>01 / KNOWLEDGE OBJECTS</span><h2>研究对象</h2></div>
        <p>节点是研究对象的稳定入口；摘要、标签、资源和关系共同构成它的上下文。</p>
      </header>
      <div class="node-grid">
        {visibleNodes.map((node, index) => (
          <a class="node-card" href={"/nodes/" + encodeURIComponent(node.id) + "/"}>
            <span class="card-number">{String(index + 1).padStart(2, "0")}</span>
            <small>{node.kind || "NODE"}</small>
            <h3>{node.title}</h3>
            <p>{node.summary || node.alternativeTitle || "该节点尚未填写摘要。"}</p>
            <div>{(node.tags || []).slice(0, 3).map((tag) => <i>{tag}</i>)}</div>
          </a>
        ))}
      </div>
    </section>

    <section class="section-shell collection-section" id="collection">
      <header class="section-heading inverse">
        <div><span>02 / DIGITAL EVIDENCE</span><h2>数字资源</h2></div>
        <p>归档中的文本、图像、模型、视频与音频保持各自的来源和版权信息。</p>
      </header>
      <div class="asset-grid">
        {featuredAssets.map((asset) => (
          <a class="asset-card" href={"/assets/" + encodeURIComponent(asset.id) + "/"}>
            <div class:list={["asset-media", "kind-" + asset.type]}>
              {asset.type === "image" ? <img src={assetUrl(asset)} alt="" loading="lazy" /> : <span>{asset.type}</span>}
            </div>
            <div class="asset-copy">
              <small>{asset.type}</small>
              <h3>{asset.title || asset.originalFilename}</h3>
              <p>{asset.creator || asset.source || "来源待补充"}</p>
            </div>
          </a>
        ))}
      </div>
    </section>

    <section class="section-shell" id="relations">
      <header class="section-heading">
        <div><span>03 / RELATIONSHIPS</span><h2>关系索引</h2></div>
        <p>关系不是装饰性的连线，而是研究判断及其证据的可读记录。</p>
      </header>
      <div class="relation-list">
        {relations.map((relation) => {
          const source = nodes.find((node) => node.id === relation.source);
          const target = nodes.find((node) => node.id === relation.target);
          return (
            <article>
              <a href={"/nodes/" + encodeURIComponent(relation.source) + "/"}>{source?.title || relation.source}</a>
              <strong>{relation.type || "关联"}</strong>
              <a href={"/nodes/" + encodeURIComponent(relation.target) + "/"}>{target?.title || relation.target}</a>
              {relation.evidence && <p>{relation.evidence}</p>}
            </article>
          );
        })}
      </div>
    </section>
  </main>
</Layout>
`;
}

const nodePageAstro = `---
import Layout from "../../layouts/Layout.astro";
import { nodes, linkedAssets, relatedNodes, assetUrl } from "../../lib/archive";

export function getStaticPaths() {
  return nodes.map((node) => ({ params: { id: node.id }, props: { node } }));
}

const { node } = Astro.props;
const assets = linkedAssets(node);
const related = relatedNodes(node.id);
---

<Layout title={node.title + " · INS Exhibition"} description={node.summary || node.title}>
  <main class="detail-page">
    <a class="back-link" href="/">← 返回展示</a>
    <header class="detail-header">
      <div><span>{node.kind || "NODE"}</span><h1>{node.title}</h1></div>
      <p>{node.summary || "该节点尚未填写摘要。"}</p>
    </header>
    <dl class="metadata-grid">
      {node.alternativeTitle && <div><dt>别名</dt><dd>{node.alternativeTitle}</dd></div>}
      {node.period && <div><dt>年代</dt><dd>{node.period}</dd></div>}
      {node.source && <div><dt>来源</dt><dd>{node.source}</dd></div>}
      {node.rights && <div><dt>版权</dt><dd>{node.rights}</dd></div>}
    </dl>
    <section class="detail-section">
      <h2>关联资源 <span>{assets.length}</span></h2>
      <div class="asset-grid light">
        {assets.map((asset) => (
          <a class="asset-card" href={"/assets/" + encodeURIComponent(asset.id) + "/"}>
            <div class:list={["asset-media", "kind-" + asset.type]}>
              {asset.type === "image" ? <img src={assetUrl(asset)} alt="" /> : <span>{asset.type}</span>}
            </div>
            <div class="asset-copy"><small>{asset.type}</small><h3>{asset.title}</h3></div>
          </a>
        ))}
      </div>
    </section>
    <section class="detail-section">
      <h2>知识关系 <span>{related.length}</span></h2>
      <div class="related-grid">
        {related.map(({ relation, node: target }) => (
          <a href={"/nodes/" + encodeURIComponent(target.id) + "/"}>
            <small>{relation.type || "关联"}</small><strong>{target.title}</strong>
          </a>
        ))}
      </div>
    </section>
  </main>
</Layout>
`;

const assetPageAstro = `---
import Layout from "../../layouts/Layout.astro";
import { assets, nodes, assetUrl } from "../../lib/archive";

export function getStaticPaths() {
  return assets.map((asset) => ({ params: { id: asset.id }, props: { asset } }));
}

const { asset } = Astro.props;
const url = assetUrl(asset);
const linkedNodes = nodes.filter((node) => (asset.linkedNodeIds || []).includes(node.id));
---

<Layout title={(asset.title || asset.originalFilename) + " · INS Exhibition"} description={asset.description || asset.title}>
  <main class="detail-page asset-detail">
    <a class="back-link" href="/">← 返回展示</a>
    <header class="detail-header">
      <div><span>{asset.type || "ASSET"}</span><h1>{asset.title || asset.originalFilename}</h1></div>
      <p>{asset.description || "该资源尚未填写说明。"}</p>
    </header>
    <div class:list={["asset-stage", "stage-" + asset.type]}>
      {asset.type === "image" && <img src={url} alt={asset.title || ""} />}
      {asset.type === "video" && <video src={url} controls preload="metadata"></video>}
      {asset.type === "audio" && <audio src={url} controls preload="metadata"></audio>}
      {asset.type === "model" && <model-viewer src={url} camera-controls auto-rotate shadow-intensity="1" alt={asset.title}></model-viewer>}
      {asset.type === "text" && <a class="file-open" href={url}>打开或下载文献 ↗</a>}
    </div>
    <dl class="metadata-grid">
      {asset.creator && <div><dt>创建者</dt><dd>{asset.creator}</dd></div>}
      {asset.date && <div><dt>日期</dt><dd>{asset.date}</dd></div>}
      {asset.source && <div><dt>来源</dt><dd>{asset.source}</dd></div>}
      {asset.rights && <div><dt>版权</dt><dd>{asset.rights}</dd></div>}
      {asset.originalFilename && <div><dt>源文件</dt><dd>{asset.originalFilename}</dd></div>}
      {asset.checksum && <div><dt>校验值</dt><dd class="checksum">{asset.checksum}</dd></div>}
    </dl>
    <section class="detail-section">
      <h2>关联节点 <span>{linkedNodes.length}</span></h2>
      <div class="related-grid">
        {linkedNodes.map((node) => <a href={"/nodes/" + encodeURIComponent(node.id) + "/"}><small>{node.kind}</small><strong>{node.title}</strong></a>)}
      </div>
    </section>
  </main>
  <script>import "@google/model-viewer";</script>
</Layout>
`;

const globalCss = `:root {
  --ink: #171714;
  --paper: #f3f0e7;
  --panel: #faf8f2;
  --rust: #8b3f32;
  --green: #365f50;
  --line: #c9c3b7;
  font-family: Inter, "Noto Sans SC", system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--paper); }
a { color: inherit; text-decoration: none; }
img, video { max-width: 100%; }
.site-header { height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 4vw; border-bottom: 1px solid var(--ink); background: rgba(250,248,242,.94); position: sticky; top: 0; z-index: 20; backdrop-filter: blur(12px); }
.brand { display: flex; align-items: center; gap: 14px; }
.brand span { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid var(--ink); font: 700 18px Georgia, serif; }
.brand strong { font: 600 14px Georgia, "Noto Serif SC", serif; }
nav { display: flex; gap: 28px; font-size: 12px; }
nav a:hover { color: var(--rust); }
.hero { min-height: calc(100vh - 72px); padding: 5vw; display: grid; grid-template-columns: 1fr minmax(280px, 760px); grid-template-rows: auto 1fr auto; color: white; background-color: #24231f; background-size: cover; background-position: center; }
.hero-index { grid-column: 1 / -1; font: 11px Georgia, serif; letter-spacing: .16em; }
.hero-copy { grid-column: 2; align-self: center; }
.hero-copy > p:first-child, .section-heading span, .detail-header span { font-size: 11px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #d9aa91; }
h1, h2, h3 { font-family: Georgia, "Noto Serif SC", serif; font-weight: 500; }
.hero h1 { max-width: 820px; margin: 16px 0; font-size: clamp(48px, 7vw, 106px); line-height: 1.02; }
.rule { width: 90px; height: 3px; margin: 30px 0; background: #d9aa91; }
.lede { max-width: 650px; font: 19px/1.9 Georgia, "Noto Serif SC", serif; color: rgba(255,255,255,.82); }
.primary-link { width: 190px; margin-top: 38px; padding: 17px 18px; display: flex; justify-content: space-between; border: 1px solid rgba(255,255,255,.65); font-size: 12px; }
.metrics { grid-column: 1 / -1; margin: 0; display: flex; gap: 1px; justify-self: end; background: rgba(255,255,255,.4); }
.metrics div { width: 118px; padding: 14px; background: rgba(25,24,21,.82); }
.metrics dt { font-size: 10px; color: rgba(255,255,255,.58); }
.metrics dd { margin: 5px 0 0; font: 28px Georgia, serif; }
.section-shell { padding: 90px 5vw; }
.section-heading { display: grid; grid-template-columns: 1fr minmax(280px, 520px); gap: 40px; align-items: end; padding-bottom: 35px; border-bottom: 1px solid var(--ink); }
.section-heading h2 { margin: 7px 0 0; font-size: clamp(34px, 4vw, 58px); }
.section-heading p { margin: 0; color: #6a655c; font: 15px/1.8 Georgia, "Noto Serif SC", serif; }
.node-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-left: 1px solid var(--line); }
.node-card { min-height: 300px; padding: 25px; position: relative; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); transition: background .2s, transform .2s; }
.node-card:hover { z-index: 2; background: var(--panel); transform: translateY(-4px); }
.card-number { float: right; font: 12px Georgia, serif; color: #8c867b; }
.node-card small, .asset-copy small { color: var(--rust); font-size: 9px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.node-card h3 { margin: 55px 0 12px; font-size: 25px; }
.node-card p { color: #6a655c; font: 13px/1.75 Georgia, "Noto Serif SC", serif; }
.node-card i { margin: 12px 5px 0 0; padding: 5px 7px; display: inline-block; background: #e6e2d8; font-size: 9px; font-style: normal; }
.collection-section { background: var(--ink); color: white; }
.section-heading.inverse { border-color: rgba(255,255,255,.45); }
.section-heading.inverse p { color: rgba(255,255,255,.62); }
.asset-grid { margin-top: 34px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.asset-card { min-width: 0; background: #282824; border: 1px solid #3b3934; }
.asset-media { aspect-ratio: 4/3; display: grid; place-items: center; overflow: hidden; background: #20201d; color: #d9aa91; font: 16px Georgia, serif; text-transform: uppercase; }
.asset-media img { width: 100%; height: 100%; object-fit: cover; transition: transform .35s; }
.asset-card:hover img { transform: scale(1.035); }
.asset-copy { padding: 16px; }
.asset-copy h3 { margin: 8px 0; overflow: hidden; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
.asset-copy p { margin: 0; color: rgba(255,255,255,.55); font-size: 10px; }
.asset-grid.light .asset-card { background: var(--panel); border-color: var(--line); }
.asset-grid.light .asset-copy p { color: #6a655c; }
.relation-list { border: 1px solid var(--ink); border-bottom: 0; }
.relation-list article { display: grid; grid-template-columns: 1fr 160px 1fr; align-items: center; min-height: 72px; padding: 15px 20px; border-bottom: 1px solid var(--ink); }
.relation-list strong { color: var(--rust); font-size: 11px; text-align: center; }
.relation-list a:last-of-type { text-align: right; }
.relation-list p { grid-column: 1 / -1; margin: 8px 0 0; color: #777064; font-size: 11px; }
.detail-page { max-width: 1500px; margin: auto; padding: 58px 5vw 100px; }
.back-link { display: inline-block; margin-bottom: 55px; color: var(--rust); font-size: 12px; }
.detail-header { display: grid; grid-template-columns: 1fr minmax(300px, 560px); gap: 60px; align-items: end; padding-bottom: 45px; border-bottom: 1px solid var(--ink); }
.detail-header h1 { margin: 10px 0 0; font-size: clamp(42px, 6vw, 84px); line-height: 1.05; }
.detail-header p { margin: 0; color: #68635a; font: 17px/1.8 Georgia, "Noto Serif SC", serif; }
.metadata-grid { margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); border-left: 1px solid var(--line); }
.metadata-grid div { min-width: 0; padding: 20px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.metadata-grid dt { color: #8a8479; font-size: 9px; letter-spacing: .12em; }
.metadata-grid dd { margin: 8px 0 0; overflow-wrap: anywhere; font: 13px/1.5 Georgia, "Noto Serif SC", serif; }
.checksum { font-family: ui-monospace, monospace !important; font-size: 9px !important; }
.detail-section { margin-top: 75px; }
.detail-section > h2 { padding-bottom: 15px; border-bottom: 1px solid var(--ink); font-size: 30px; }
.detail-section > h2 span { float: right; color: #8a8479; font: 15px Georgia, serif; }
.related-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-left: 1px solid var(--line); }
.related-grid a { min-height: 110px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.related-grid small { color: var(--rust); font-size: 9px; }
.related-grid strong { font: 19px Georgia, "Noto Serif SC", serif; }
.asset-stage { min-height: 58vh; display: grid; place-items: center; background: #1f211f; }
.asset-stage img, .asset-stage video, model-viewer { width: 100%; height: min(72vh, 900px); object-fit: contain; }
.asset-stage audio { width: min(760px, 80%); }
.file-open { padding: 16px 20px; border: 1px solid white; color: white; }
footer { min-height: 100px; padding: 0 4vw; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--ink); font-size: 10px; }
@media (max-width: 900px) {
  .site-header nav { display: none; }
  .hero { grid-template-columns: 1fr; padding: 8vw; }
  .hero-copy { grid-column: 1; }
  .metrics { justify-self: stretch; }
  .metrics div { flex: 1; width: auto; }
  .section-heading, .detail-header { grid-template-columns: 1fr; }
  .node-grid { grid-template-columns: 1fr 1fr; }
  .asset-grid { grid-template-columns: 1fr 1fr; }
  .relation-list article { grid-template-columns: 1fr; gap: 8px; }
  .relation-list strong, .relation-list a:last-of-type { text-align: left; }
  .metadata-grid, .related-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .brand strong { display: none; }
  .hero h1 { font-size: 46px; }
  .section-shell, .detail-page { padding-left: 22px; padding-right: 22px; }
  .node-grid, .asset-grid, .metadata-grid, .related-grid { grid-template-columns: 1fr; }
}
`;

function readme(projectTitle: string, templateTitle: string, sourceArchiveName: string) {
  return `# ${projectTitle} · INS Exhibition

This Astro project was generated from \`${sourceArchiveName}\` using the “${templateTitle}” template.

## Start locally

1. Install Node.js 24 or newer.
2. Run \`Start-Localhost.ps1\` on Windows, or run \`npm install\` and \`npm run dev\`.
3. Open the local address printed in the terminal.

## Build a release

Run \`Build-Release.ps1\`, or run \`npm run build\`. The static site is written to \`dist/\`.

## Data provenance

- Structured archive data: \`src/data/archive/\`
- Packaged media: \`public/archive/\`
- Source record and checksum: \`exhibition.json\`

The source archive is not modified. Regenerate the project when the archive changes.
`;
}

const startScript = `$Host.UI.RawUI.WindowTitle = "INS Exhibition - Localhost"
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
  npm install
}
npm run dev
Read-Host "Press Enter to close"
`;

const buildScript = `$Host.UI.RawUI.WindowTitle = "INS Exhibition - Build Release"
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
  npm install
}
npm run build
Write-Host "Release created in dist/" -ForegroundColor Green
Read-Host "Press Enter to close"
`;

export async function createExhibitionProject({
  archiveZip,
  sourceArchiveName,
  sourceArchiveChecksum,
  template,
}: ExhibitionProjectOptions) {
  const archiveTexts = await Promise.all(
    requiredArchiveFiles.map((path) => requiredText(archiveZip, path)),
  );
  const manifest = JSON.parse(archiveTexts[0]) as ArchiveManifest;
  if (manifest.format !== "INS Archive") {
    throw new Error("所选文件不是有效的 INS Archive");
  }
  const archiveCollections = archiveTexts.slice(1).map((text) => JSON.parse(text));
  if (archiveCollections.some((collection) => !Array.isArray(collection))) {
    throw new Error("归档中的节点、资源或关系数据格式无效");
  }

  const projectTitle = manifest.project?.title?.trim() || "INS Exhibition";
  const templateMeta = exhibitionTemplates.find((item) => item.id === template)!;
  const project = new JSZip();

  project.file("package.json", packageJson(projectTitle));
  project.file("astro.config.mjs", astroConfig);
  project.file("tsconfig.json", tsconfig);
  project.file("README.md", readme(projectTitle, templateMeta.title, sourceArchiveName));
  project.file("Start-Localhost.ps1", startScript);
  project.file("Build-Release.ps1", buildScript);
  project.file("src/data/archive/manifest.json", archiveTexts[0]);
  project.file("src/data/archive/nodes.json", archiveTexts[1]);
  project.file("src/data/archive/assets.json", archiveTexts[2]);
  project.file("src/data/archive/relations.json", archiveTexts[3]);
  project.file("src/lib/archive.ts", archiveLibrary);
  project.file("src/layouts/Layout.astro", layoutAstro);
  project.file("src/pages/index.astro", indexAstro(template));
  project.file("src/pages/nodes/[id].astro", nodePageAstro);
  project.file("src/pages/assets/[id].astro", assetPageAstro);
  project.file("src/styles/global.css", globalCss);
  project.file(
    "exhibition.json",
    JSON.stringify(
      {
        format: "INS Exhibition Project",
        version: "1.0",
        template,
        templateTitle: templateMeta.title,
        sourceArchive: sourceArchiveName,
        sourceArchiveChecksum: `sha256:${sourceArchiveChecksum}`,
        sourceProject: manifest.project,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const copyTasks: Promise<void>[] = [];
  archiveZip.forEach((path, entry) => {
    if (entry.dir) return;
    if (/^(text|images|models|videos|audio)\//.test(path)) {
      copyTasks.push(
        entry.async("uint8array").then((content) => {
          project.file(`public/archive/${path}`, content);
        }),
      );
      return;
    }
    if (["archive-report.json", "checksums.sha256", "README.txt"].includes(path)) {
      copyTasks.push(
        entry.async("uint8array").then((content) => {
          project.file(`archive-source/${path}`, content);
        }),
      );
    }
  });
  await Promise.all(copyTasks);

  return {
    blob: await project.generateAsync({ type: "blob", compression: "DEFLATE" }),
    filename: `${safeProjectName(projectTitle)}-Exhibition.zip`,
    projectTitle,
  };
}
