"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { isEditableTextFile, type TextSaveReason } from "./text-documents";

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

type PreviewAsset = {
  id: string;
  name: string;
  path: string;
  kind: "image" | "document" | "model" | "video" | "audio" | "text";
  size: string;
  references: number;
  previewUrl?: string;
};

type AssetPreviewProps = {
  asset?: PreviewAsset;
  onDownload: () => void;
  onSaveText?: (
    assetId: string,
    text: string,
    reason: TextSaveReason,
  ) => Promise<void> | void;
  action?: ReactNode;
};

function assetGlyph(kind: PreviewAsset["kind"]) {
  if (kind === "model") return "3D";
  if (kind === "document") return "DOC";
  if (kind === "video") return "▶";
  if (kind === "audio") return "♫";
  if (kind === "text") return "TXT";
  return "IMG";
}

export function AssetPreview({
  asset,
  onDownload,
  onSaveText,
  action,
}: AssetPreviewProps) {
  const editableText = Boolean(asset && isEditableTextFile(asset.name));
  const stageKind = editableText ? "text" : asset?.kind;

  return (
    <>
      <div className="panel-heading">
        <span>{editableText ? "资源编辑" : "资源预览"}</span>
        <button
          type="button"
          aria-label="下载当前资源"
          title="下载当前资源"
          disabled={!asset?.previewUrl}
          onClick={onDownload}
        >
          ↓
        </button>
      </div>
      {asset ? (
        <div className="asset-preview">
          <div
            className={`asset-preview-stage${stageKind ? ` asset-${stageKind}` : ""}`}
          >
            {asset.previewUrl && asset.kind === "image" ? (
              <img src={asset.previewUrl} alt={asset.name} />
            ) : asset.previewUrl && asset.kind === "video" ? (
              <video src={asset.previewUrl} controls />
            ) : asset.previewUrl && asset.kind === "model" ? (
              <ModelPreview url={asset.previewUrl} fileName={asset.name} />
            ) : asset.previewUrl &&
              (asset.kind === "document" ||
                asset.kind === "audio" ||
                asset.kind === "text" ||
                editableText) ? (
              <DocumentMediaPreview
                assetId={asset.id}
                url={asset.previewUrl}
                fileName={asset.name}
                onSaveText={onSaveText}
              />
            ) : asset.kind === "model" ? (
              <div className="model-file-missing">
                <span>3D</span>
                <strong>示例资源未绑定本机模型文件</strong>
                <small>导入 GLB、GLTF、FBX 或 OBJ 后可直接交互预览</small>
              </div>
            ) : (
              <span>{assetGlyph(asset.kind)}</span>
            )}
          </div>
          <div className="asset-preview-meta">
            <span>{asset.kind.toUpperCase()}</span>
            <h3>{asset.name}</h3>
            <p>{asset.path}</p>
            <dl>
              <div>
                <dt>文件大小</dt>
                <dd>{asset.size}</dd>
              </div>
              <div>
                <dt>节点引用</dt>
                <dd>{asset.references}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{editableText ? "可编辑本机文本" : "本机可用"}</dd>
              </div>
            </dl>
            {action}
          </div>
        </div>
      ) : (
        <div className="asset-preview-empty">
          <span>◎</span>
          <strong>选择一个资源进行预览</strong>
        </div>
      )}
    </>
  );
}
