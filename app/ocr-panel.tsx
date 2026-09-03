"use client";

import { useEffect, useMemo, useState } from "react";
import { OCR_MODE_OPTIONS, type OcrDocumentResult, type OcrMode, type OcrPageResult } from "./ocr/ocr-types";
import { recognizeImage } from "./ocr/ocr-service";
import { readOcrDocument, saveOcrDocument } from "./ocr/ocr-storage";

type OcrAsset = { id: string; name: string; previewUrl?: string; mimeType?: string; kind: string };

type Props = {
  asset?: OcrAsset;
  onCreateCorrectedText: (source: OcrAsset, document: OcrDocumentResult) => void;
  onNotice: (message: string) => void;
};

function download(name: string, content: string, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function OcrPanel({ asset, onCreateCorrectedText, onNotice }: Props) {
  const [mode, setMode] = useState<OcrMode>("standard");
  const [document, setDocument] = useState<OcrDocumentResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const page = document?.pages[0];

  useEffect(() => {
    let cancelled = false;
    setDocument(undefined);
    setError("");
    if (!asset) return;
    void readOcrDocument(asset.id).then((saved) => {
      if (!cancelled) setDocument(saved);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [asset?.id]);

  const correctedText = page?.correctedText ?? page?.rawText ?? "";
  const completion = useMemo(() => page?.processingTime ? `${(page.processingTime / 1000).toFixed(1)} 秒` : "尚未识别", [page?.processingTime]);

  const savePage = async (nextPage: OcrPageResult) => {
    if (!asset) return;
    const next: OcrDocumentResult = {
      id: document?.id ?? `ocr-${crypto.randomUUID()}`,
      assetId: asset.id,
      assetName: asset.name,
      createdAt: document?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: "PP-OCRv5_mobile",
      mode,
      pages: [nextPage],
    };
    setDocument(next);
    await saveOcrDocument(next);
  };

  const run = async () => {
    if (!asset?.previewUrl) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(asset.previewUrl);
      if (!response.ok) throw new Error("无法读取本机资源");
      const result = await recognizeImage(await response.blob(), mode);
      await savePage(result);
      onNotice(`已识别 ${result.blocks.length} 个文字块，原始结果已保存在本机`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "OCR 识别失败";
      setError(message);
      if (asset) await savePage({ page: 1, width: 0, height: 0, blocks: [], rawText: "", status: "error", error: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ocr-view">
      <header className="ocr-header">
        <div><span>INS OCR · 文献数字化</span><h2>{asset?.name ?? "请选择一个图片资源"}</h2></div>
        <div className="ocr-toolbar">
          <select value={mode} disabled={busy} onChange={(event) => setMode(event.target.value as OcrMode)} aria-label="OCR 性能模式">
            {OCR_MODE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label} · 最长边 {item.longEdge}px</option>)}
          </select>
          <button type="button" className="button-primary" disabled={!asset?.previewUrl || asset?.kind !== "image" || busy} onClick={() => void run()}>{busy ? "正在识别…" : document?.pages.length ? "重新识别" : "开始识别"}</button>
        </div>
      </header>
      {!asset ? <div className="ocr-empty"><strong>从资源库选择图片，或右键图片选择“OCR 文本识别”。</strong><small>识别、校勘和结果保存均在本机完成。</small></div> : asset.kind !== "image" ? <div className="ocr-empty"><strong>当前第一阶段已开放图片 OCR。</strong><small>扫描 PDF 的逐页队列将在下一阶段接入同一结果库；不会把 PDF 页面同时展开到内存。</small></div> : (
        <div className="ocr-workspace">
          <section className="ocr-source-panel">
            <div className="ocr-panel-heading"><span>原始图像</span><small>{page?.status === "recognized" ? `已识别 · ${completion}` : "本机文件"}</small></div>
            <div className="ocr-image-stage">
              {asset.previewUrl && <img src={asset.previewUrl} alt={asset.name} />}
              {page?.blocks.map((block) => <span key={block.id} className="ocr-block-box" title={`${block.text} · ${(block.confidence * 100).toFixed(0)}%`} style={{ left: `${(block.polygon[0][0] / page.width) * 100}%`, top: `${(block.polygon[0][1] / page.height) * 100}%`, width: `${((block.polygon[1][0] - block.polygon[0][0]) / page.width) * 100}%`, height: `${((block.polygon[2][1] - block.polygon[1][1]) / page.height) * 100}%` }} />)}
            </div>
            <p>悬停文字框可查看原始置信度。OCR 不会自动修改原文。</p>
          </section>
          <section className="ocr-editor-panel">
            <div className="ocr-panel-heading"><span>人工校勘文本</span><small>{page?.blocks.length ?? 0} 个文字块</small></div>
            <textarea value={correctedText} placeholder="识别结果会显示在这里。你可以直接校勘，但原始 OCR 结果会始终保留。" onChange={(event) => { if (!page) return; void savePage({ ...page, correctedText: event.target.value, status: "reviewed" }); }} />
            {error && <p className="ocr-error">{error}</p>}
            <footer className="ocr-actions">
              <button type="button" disabled={!page} onClick={() => download(`${asset.name}.txt`, correctedText)}>导出 TXT</button>
              <button type="button" disabled={!page} onClick={() => download(`${asset.name}.md`, `# ${asset.name}\n\n${correctedText}`, "text/markdown;charset=utf-8")}>导出 Markdown</button>
              <button type="button" disabled={!document} onClick={() => download(`${asset.name}.ocr.json`, JSON.stringify(document, null, 2), "application/json")}>导出 JSON</button>
              <button type="button" className="button-primary" disabled={!document || !correctedText.trim()} onClick={() => { if (document) onCreateCorrectedText(asset, document); }}>保存为校勘文本资源</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
