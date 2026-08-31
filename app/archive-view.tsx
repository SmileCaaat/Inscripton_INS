"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import JSZip from "jszip";
import type { BoardAsset } from "./reference-board";
import { readLocalAssetBlob } from "./local-assets";
import {
  createExhibitionProject,
  exhibitionTemplates,
  type ExhibitionTemplateId,
} from "./exhibition-project";

type ArchiveNode = {
  id: string;
  kind: string;
  title: string;
  subtitle?: string;
  period?: string;
  summary?: string;
  tags: string[];
  source?: string;
  rights?: string;
  assetIds?: string[];
};

type ArchiveRelation = {
  id: string;
  source: string;
  target: string;
  type: string;
  evidence?: string;
};

type ArchiveIssue = {
  id: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
};

type ArchiveViewProps = {
  workspaceId: string;
  workspaceName: string;
  nodes: ArchiveNode[];
  relations: ArchiveRelation[];
  assets: BoardAsset[];
  onUpdateAsset: (assetId: string, patch: Partial<BoardAsset>) => void;
  onNotice: (message: string) => void;
};

const archiveKindMeta = {
  text: { code: "T", folder: "text" },
  image: { code: "I", folder: "images" },
  model: { code: "M", folder: "models" },
  video: { code: "V", folder: "videos" },
  audio: { code: "A", folder: "audio" },
} as const;

type ArchiveKind = keyof typeof archiveKindMeta;

function archiveKind(asset: BoardAsset): ArchiveKind {
  return asset.kind === "document" ? "text" : asset.kind;
}

function extensionOf(name: string) {
  const match = name.match(/(\.[a-z0-9]{1,12})$/i);
  return match?.[1].toLowerCase() ?? "";
}

function safeName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "INS-Archive";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function archiveFilename(asset: BoardAsset, index: number) {
  const kind = archiveKind(asset);
  const code = archiveKindMeta[kind].code;
  return `INS-${code}${String(index + 1).padStart(4, "0")}${extensionOf(asset.name)}`;
}

function duplicateIds(values: Array<{ id: string }>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach(({ id }) => (seen.has(id) ? duplicates.add(id) : seen.add(id)));
  return [...duplicates];
}

function buildIssues(
  nodes: ArchiveNode[],
  relations: ArchiveRelation[],
  assets: BoardAsset[],
  availableIds: Set<string>,
  scanComplete: boolean,
) {
  const issues: ArchiveIssue[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const assetIds = new Set(assets.map((asset) => asset.id));
  const relatedNodeIds = new Set(
    relations.flatMap((relation) => [relation.source, relation.target]),
  );

  duplicateIds([...nodes, ...relations, ...assets]).forEach((id) =>
    issues.push({
      id: `duplicate-${id}`,
      severity: "error",
      title: "标识符重复",
      detail: `“${id}”被多个对象使用。`,
    }),
  );

  nodes.forEach((node) => {
    if (!node.title.trim()) {
      issues.push({
        id: `node-title-${node.id}`,
        severity: "error",
        title: "节点缺少标题",
        detail: node.id,
      });
    }
    if (!node.summary?.trim()) {
      issues.push({
        id: `node-summary-${node.id}`,
        severity: "warning",
        title: "节点缺少摘要",
        detail: node.title || node.id,
      });
    }
    if (!relatedNodeIds.has(node.id)) {
      issues.push({
        id: `node-isolated-${node.id}`,
        severity: "warning",
        title: "孤立节点",
        detail: node.title || node.id,
      });
    }
    (node.assetIds ?? []).forEach((assetId) => {
      if (!assetIds.has(assetId)) {
        issues.push({
          id: `node-asset-${node.id}-${assetId}`,
          severity: "error",
          title: "节点引用了不存在的资源",
          detail: `${node.title || node.id} → ${assetId}`,
        });
      }
    });
  });

  relations.forEach((relation) => {
    if (!nodeIds.has(relation.source) || !nodeIds.has(relation.target)) {
      issues.push({
        id: `relation-endpoint-${relation.id}`,
        severity: "error",
        title: "关系端点不存在",
        detail: `${relation.source} → ${relation.target}`,
      });
    }
    if (!relation.type.trim()) {
      issues.push({
        id: `relation-type-${relation.id}`,
        severity: "warning",
        title: "关系缺少类型",
        detail: relation.id,
      });
    }
  });

  assets.forEach((asset) => {
    if (scanComplete && !availableIds.has(asset.id)) {
      issues.push({
        id: `asset-file-${asset.id}`,
        severity: "error",
        title: "本地源文件不可用",
        detail: asset.name,
      });
    }
    if (!asset.source?.trim()) {
      issues.push({
        id: `asset-source-${asset.id}`,
        severity: "warning",
        title: "资源缺少来源",
        detail: asset.name,
      });
    }
    if (!asset.rights?.trim()) {
      issues.push({
        id: `asset-rights-${asset.id}`,
        severity: "warning",
        title: "资源缺少版权信息",
        detail: asset.name,
      });
    }
    if (asset.references === 0) {
      issues.push({
        id: `asset-isolated-${asset.id}`,
        severity: "warning",
        title: "孤立资源",
        detail: asset.name,
      });
    }
    if (asset.kind === "model" && [".gltf", ".fbx", ".obj"].includes(extensionOf(asset.name))) {
      issues.push({
        id: `asset-model-dependencies-${asset.id}`,
        severity: "warning",
        title: "模型可能依赖外部文件",
        detail: `${asset.name}：建议转为 GLB，或在后续版本登记纹理与几何文件组。`,
      });
    }
  });
  return issues;
}

export function ArchiveView({
  workspaceId,
  workspaceName,
  nodes,
  relations,
  assets,
  onUpdateAsset,
  onNotice,
}: ArchiveViewProps) {
  const [assetBlobs, setAssetBlobs] = useState<Map<string, Blob>>(new Map());
  const [scanComplete, setScanComplete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exhibitionExporting, setExhibitionExporting] = useState(false);
  const [exhibitionTemplate, setExhibitionTemplate] =
    useState<ExhibitionTemplateId>("collection");
  const archiveInputRef = useRef<HTMLInputElement>(null);

  const scanFiles = useCallback(async () => {
    setScanComplete(false);
    const entries = await Promise.all(
      assets.map(async (asset) => [asset.id, await readLocalAssetBlob(asset.id)] as const),
    );
    setAssetBlobs(
      new Map(entries.filter((entry): entry is readonly [string, Blob] => Boolean(entry[1]))),
    );
    setScanComplete(true);
  }, [assets]);

  useEffect(() => {
    void scanFiles();
  }, [scanFiles]);

  const issues = useMemo(
    () => buildIssues(nodes, relations, assets, new Set(assetBlobs.keys()), scanComplete),
    [assetBlobs, assets, nodes, relations, scanComplete],
  );
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const totalChecks = Math.max(1, nodes.length * 3 + assets.length * 4 + relations.length * 2);
  const completeness = Math.max(
    0,
    Math.round(((totalChecks - errors.length - warnings.length * 0.5) / totalChecks) * 100),
  );

  const baseData = () => ({
    manifest: {
      format: "INS Archive",
      version: "1.0",
      project: { id: workspaceId, title: workspaceName },
      createdAt: new Date().toISOString(),
      statistics: {
        nodes: nodes.length,
        assets: assets.length,
        relations: relations.length,
      },
    },
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title,
      alternativeTitle: node.subtitle || undefined,
      period: node.period || undefined,
      summary: node.summary || undefined,
      tags: node.tags,
      source: node.source || undefined,
      rights: node.rights || undefined,
      assetIds: node.assetIds ?? [],
    })),
    relations: relations.map((relation) => ({ ...relation })),
  });

  const exportMetadata = () => {
    const data = {
      ...baseData(),
      assets: assets.map((asset, index) => ({
        id: asset.id,
        type: archiveKind(asset),
        title: asset.name,
        description: asset.description,
        creator: asset.creator,
        date: asset.date,
        source: asset.source,
        rights: asset.rights,
        originalFilename: asset.name,
        archiveFilename: archiveFilename(asset, index),
        linkedNodeIds: nodes
          .filter((node) => node.assetIds?.includes(asset.id))
          .map((node) => node.id),
      })),
      report: { completeness, errors, warnings },
    };
    triggerDownload(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `${safeName(workspaceName)}.ins.json`,
    );
    onNotice("已导出 INS JSON 数据");
  };

  const buildArchiveZip = async () => {
    const zip = new JSZip();
    const data = baseData();
    const checksums: string[] = [];
    const archiveAssets = [];

    for (const [index, asset] of assets.entries()) {
      const blob = assetBlobs.get(asset.id);
      if (!blob) continue;
      const kind = archiveKind(asset);
      const filename = archiveFilename(asset, index);
      const relativePath = `${archiveKindMeta[kind].folder}/${filename}`;
      const checksum = await sha256(blob);
      checksums.push(`${checksum}  ${relativePath}`);
      zip.file(relativePath, blob);
      archiveAssets.push({
        id: asset.id,
        type: kind,
        title: asset.name,
        description: asset.description,
        creator: asset.creator,
        date: asset.date,
        source: asset.source,
        rights: asset.rights,
        originalFilename: asset.name,
        archiveFilename: filename,
        mimeType: asset.mimeType || blob.type || undefined,
        fileSize: blob.size,
        checksum: `sha256:${checksum}`,
        linkedNodeIds: nodes
          .filter((node) => node.assetIds?.includes(asset.id))
          .map((node) => node.id),
        metadata: {
          duration: asset.duration,
          sampleRate: asset.sampleRate,
          channels: asset.channels,
        },
      });
    }

    zip.file("manifest.json", JSON.stringify(data.manifest, null, 2));
    zip.file("data/nodes.json", JSON.stringify(data.nodes, null, 2));
    zip.file("data/assets.json", JSON.stringify(archiveAssets, null, 2));
    zip.file("data/relations.json", JSON.stringify(data.relations, null, 2));
    zip.file(
      "archive-report.json",
      JSON.stringify({ completeness, errors, warnings }, null, 2),
    );
    zip.file("checksums.sha256", `${checksums.join("\n")}\n`);
    zip.file(
      "README.txt",
      "INS Archive 1.0\n\nOpen data/manifest files as UTF-8 JSON. Verify packaged files with checksums.sha256 before ingest.\n",
    );
    return zip;
  };

  const exportArchive = async () => {
    if (errors.length || exporting || !scanComplete) return;
    setExporting(true);
    try {
      const zip = await buildArchiveZip();
      const output = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      triggerDownload(output, `${safeName(workspaceName)}.insarchive`);
      onNotice("归档包已生成");
    } finally {
      setExporting(false);
    }
  };

  const downloadExhibitionProject = async (
    archiveZip: JSZip,
    sourceArchiveName: string,
    sourceArchiveBlob: Blob,
  ) => {
    const project = await createExhibitionProject({
      archiveZip,
      sourceArchiveName,
      sourceArchiveChecksum: await sha256(sourceArchiveBlob),
      template: exhibitionTemplate,
    });
    triggerDownload(project.blob, project.filename);
    onNotice(`已创建「${project.projectTitle}」Astro 展示项目`);
  };

  const exportCurrentExhibition = async () => {
    if (errors.length || exhibitionExporting || !scanComplete) return;
    setExhibitionExporting(true);
    try {
      const archiveZip = await buildArchiveZip();
      const archiveBlob = await archiveZip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
      });
      await downloadExhibitionProject(
        archiveZip,
        `${safeName(workspaceName)}.insarchive`,
        archiveBlob,
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "展示项目生成失败");
    } finally {
      setExhibitionExporting(false);
    }
  };

  const importArchiveForExhibition = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || exhibitionExporting) return;
    setExhibitionExporting(true);
    try {
      const archiveZip = await JSZip.loadAsync(file);
      await downloadExhibitionProject(archiveZip, file.name, file);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "无法读取所选归档");
    } finally {
      setExhibitionExporting(false);
    }
  };

  return (
    <div className="archive-view">
      <div className="archive-hero">
        <div>
          <span>INS ARCHIVE · FORMAT 1.0</span>
          <h1>归档检查</h1>
          <p>将知识节点、数字证据和关系整理为开放、可迁移的归档包。</p>
        </div>
        <div className="archive-actions">
          <button type="button" className="button-quiet" onClick={exportMetadata}>
            导出 JSON
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!scanComplete || errors.length > 0 || exporting}
            title={errors.length ? "请先修复阻止归档的问题" : undefined}
            onClick={() => void exportArchive()}
          >
            {exporting ? "正在生成…" : "生成 .insarchive"}
          </button>
        </div>
      </div>

      <div className="archive-summary-grid">
        <article className="archive-score">
          <span>归档完整度</span>
          <strong>{completeness}%</strong>
          <div><i style={{ width: `${completeness}%` }} /></div>
          <small>{scanComplete ? "已完成本地文件检查" : "正在检查本地文件…"}</small>
        </article>
        <article><span>知识节点</span><strong>{nodes.length}</strong><small>Knowledge Objects</small></article>
        <article><span>数字资源</span><strong>{assets.length}</strong><small>Text · Image · Model · Video · Audio</small></article>
        <article><span>知识关系</span><strong>{relations.length}</strong><small>Typed Relations</small></article>
      </div>

      <section className="archive-exhibition">
        <header>
          <div>
            <span>ASTRO EXHIBITION PROJECT</span>
            <h2>从归档创建展示</h2>
            <p>选择展示结构，将归档数据和本地媒体整理为可独立运行、叙事和发布的 Astro 项目。</p>
          </div>
          <b>INS → ARCHIVE → ASTRO</b>
        </header>
        <div className="archive-template-grid">
          {exhibitionTemplates.map((template) => (
            <button
              type="button"
              key={template.id}
              className={exhibitionTemplate === template.id ? "active" : ""}
              onClick={() => setExhibitionTemplate(template.id)}
            >
              <span>{template.code}</span>
              <strong>{template.title}</strong>
              <small>{template.description}</small>
              <i>{exhibitionTemplate === template.id ? "已选择" : "选择模板"}</i>
            </button>
          ))}
        </div>
        <div className="archive-exhibition-actions">
          <div>
            <strong>当前工作区</strong>
            <small>先执行同一套归档检查，再生成带媒体与校验来源的展示项目。</small>
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!scanComplete || errors.length > 0 || exhibitionExporting}
            onClick={() => void exportCurrentExhibition()}
          >
            {exhibitionExporting ? "正在创建…" : "基于当前归档创建"}
          </button>
          <span>或</span>
          <button
            type="button"
            className="button-quiet"
            disabled={exhibitionExporting}
            onClick={() => archiveInputRef.current?.click()}
          >
            选择已有 .insarchive
          </button>
          <input
            ref={archiveInputRef}
            className="archive-file-input"
            type="file"
            accept=".insarchive,.zip,application/zip"
            onChange={(event) => void importArchiveForExhibition(event)}
          />
        </div>
        <footer>
          <span>输出</span>
          <strong>{safeName(workspaceName)}-Exhibition.zip</strong>
          <small>解压后运行 Start-Localhost.ps1；静态发布文件由 Build-Release.ps1 生成。</small>
        </footer>
      </section>

      <div className="archive-columns">
        <section className="archive-panel">
          <header>
            <div><span>VALIDATION REPORT</span><h2>检查结果</h2></div>
            <button type="button" onClick={() => void scanFiles()}>重新检查</button>
          </header>
          {issues.length === 0 ? (
            <div className="archive-ready"><b>✓</b><strong>可以归档</strong><small>未发现错误或警告。</small></div>
          ) : (
            <div className="archive-issues">
              {issues.map((issue) => (
                <div key={issue.id} className={issue.severity}>
                  <b>{issue.severity === "error" ? "!" : "△"}</b>
                  <span><strong>{issue.title}</strong><small>{issue.detail}</small></span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="archive-panel archive-metadata">
          <header><div><span>RESOURCE METADATA</span><h2>来源与版权</h2></div></header>
          <div className="archive-asset-list">
            {assets.map((asset) => (
              <article key={asset.id}>
                <div className="archive-asset-title">
                  <span>{archiveKindMeta[archiveKind(asset)].code}</span>
                  <strong title={asset.name}>{asset.name}</strong>
                </div>
                <label><span>来源</span><input value={asset.source ?? ""} placeholder="采集者、馆藏或网址" onChange={(event) => onUpdateAsset(asset.id, { source: event.target.value })} /></label>
                <label><span>版权</span><input value={asset.rights ?? ""} placeholder="版权持有人或许可方式" onChange={(event) => onUpdateAsset(asset.id, { rights: event.target.value })} /></label>
              </article>
            ))}
            {assets.length === 0 && <div className="archive-empty">当前工作区还没有数字资源。</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
