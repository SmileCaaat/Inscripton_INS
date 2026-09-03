"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import type { Book, Rendition } from "epubjs";
import type WaveSurfer from "wavesurfer.js";
import { TextDocumentEditor } from "./text-document-editor";
import {
  isEditableTextFile,
  type TextSaveReason,
} from "./text-documents";

type PreviewProps = {
  url: string;
  fileName: string;
  assetId?: string;
  onSaveText?: (
    assetId: string,
    text: string,
    reason: TextSaveReason,
  ) => Promise<void> | void;
};

function extensionOf(fileName: string) {
  return fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function framedHtml(body: string, title: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title.replace(/[<>&"]/g, "")}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 28px 34px 60px; background: #fbfaf6; color: #24231f;
      font: 15px/1.75 Arial, "Noto Sans SC", sans-serif; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { min-width: 72px; padding: 6px 8px; border: 1px solid #c9c5ba; text-align: left; }
    th { position: sticky; top: 0; background: #e9e4d9; }
    tr:nth-child(even) td { background: #f4f1e9; }
    h1, h2, h3 { font-family: Georgia, "Noto Serif SC", serif; line-height: 1.3; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="rich-preview-state">
      <span className="rich-preview-spinner" />
      <strong>{label}</strong>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rich-preview-state error">
      <span>!</span>
      <strong>无法预览此文件</strong>
      <small>{message}</small>
    </div>
  );
}

function PdfPreview({ url, fileName }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPageNumber(1);
    setPageCount(0);
    void import("pdfjs-dist")
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const task = pdfjs.getDocument({ url });
        loadingTaskRef.current = task;
        const document = await task.promise;
        if (cancelled) {
          await document.cleanup();
          return;
        }
        documentRef.current = document;
        setPageCount(document.numPages);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(reason instanceof Error ? reason.message : "PDF 读取失败");
      });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      void documentRef.current?.cleanup();
      documentRef.current = null;
      void loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas || pageCount === 0) return;
    let cancelled = false;
    void document
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法创建 PDF 画布");
        renderTaskRef.current?.cancel();
        const task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        renderTaskRef.current = task;
        return task.promise;
      })
      .catch((reason: unknown) => {
        if (
          cancelled ||
          (reason instanceof Error && reason.name === "RenderingCancelledException")
        ) {
          return;
        }
        setError(reason instanceof Error ? reason.message : "页面渲染失败");
      });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pageCount, pageNumber, scale]);

  return (
    <div className="rich-preview pdf-preview">
      <header className="rich-preview-toolbar">
        <strong>PDF.js · {fileName}</strong>
        <div>
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          >
            上一页
          </button>
          <span>{pageCount ? `${pageNumber} / ${pageCount}` : "—"}</span>
          <button
            type="button"
            disabled={pageNumber >= pageCount}
            onClick={() =>
              setPageNumber((page) => Math.min(pageCount, page + 1))
            }
          >
            下一页
          </button>
          <button
            type="button"
            onClick={() => setScale((value) => Math.max(0.55, value - 0.15))}
          >
            −
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((value) => Math.min(2.5, value + 0.15))}
          >
            ＋
          </button>
        </div>
      </header>
      <div className="pdf-page-scroll">
        {loading && <LoadingState label="正在解析 PDF…" />}
        {error && <ErrorState message={error} />}
        <canvas ref={canvasRef} aria-label={`${fileName} 第 ${pageNumber} 页`} />
      </div>
    </div>
  );
}

function DocxPreview({ url, fileName }: PreviewProps) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setHtml("");
    setError("");
    void Promise.all([
      fetch(url).then((response) => response.arrayBuffer()),
      import("mammoth"),
    ])
      .then(async ([arrayBuffer, mammoth]) => {
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        const notices = result.messages.length
          ? `<aside style="padding:8px 10px;background:#f3ead4;font-size:12px">${result.messages
              .map((message) => message.message)
              .join("<br>")}</aside>`
          : "";
        setHtml(framedHtml(`${notices}${result.value}`, fileName));
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "DOCX 读取失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileName, url]);

  if (error) return <ErrorState message={error} />;
  if (!html) return <LoadingState label="正在转换 Word 文档…" />;
  return (
    <iframe
      className="rich-document-frame"
      sandbox=""
      srcDoc={html}
      title={`${fileName} Word 预览`}
    />
  );
}

type SheetPreviewData = {
  name: string;
  html: string;
};

function SpreadsheetPreview({ url, fileName }: PreviewProps) {
  const [sheets, setSheets] = useState<SheetPreviewData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSheets([]);
    setActiveSheet(0);
    setError("");
    void Promise.all([
      fetch(url).then((response) => response.arrayBuffer()),
      import("xlsx"),
    ])
      .then(([arrayBuffer, XLSX]) => {
        const workbook = XLSX.read(arrayBuffer, {
          type: "array",
          cellDates: true,
        });
        const nextSheets = workbook.SheetNames.map((name) => ({
          name,
          html: framedHtml(
            XLSX.utils.sheet_to_html(workbook.Sheets[name], {
              id: `sheet-${name.replace(/\W+/g, "-")}`,
            }),
            `${fileName} · ${name}`,
          ),
        }));
        if (!cancelled) setSheets(nextSheets);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "表格读取失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileName, url]);

  if (error) return <ErrorState message={error} />;
  if (sheets.length === 0) return <LoadingState label="正在读取表格…" />;
  return (
    <div className="rich-preview spreadsheet-preview">
      <header className="rich-preview-toolbar">
        <strong>SheetJS · {fileName}</strong>
        <label>
          工作表
          <select
            value={activeSheet}
            onChange={(event) => setActiveSheet(Number(event.target.value))}
          >
            {sheets.map((sheet, index) => (
              <option value={index} key={sheet.name}>
                {sheet.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <iframe
        className="rich-document-frame"
        sandbox=""
        srcDoc={sheets[activeSheet].html}
        title={`${fileName} · ${sheets[activeSheet].name}`}
      />
    </div>
  );
}

function EpubPreview({ url, fileName }: PreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [fontSize, setFontSize] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([
      fetch(url).then((response) => response.arrayBuffer()),
      import("epubjs"),
    ])
      .then(async ([arrayBuffer, epubModule]) => {
        if (cancelled) return;
        const book = epubModule.default(arrayBuffer);
        bookRef.current = book;
        const rendition = book.renderTo(mount, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "paginated",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        rendition.themes.default({
          body: {
            background: "#fbfaf6",
            color: "#24231f",
            "font-family": 'Georgia, "Noto Serif SC", serif',
            "line-height": "1.8",
            padding: "18px !important",
          },
          img: { "max-width": "100% !important" },
        });
        rendition.themes.fontSize("100%");
        await rendition.display();
        if (!cancelled) setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(reason instanceof Error ? reason.message : "EPUB 读取失败");
      });
    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      mount.replaceChildren();
    };
  }, [url]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  return (
    <div className="rich-preview epub-preview">
      <header className="rich-preview-toolbar">
        <strong>epub.js · {fileName}</strong>
        <div>
          <button type="button" onClick={() => void renditionRef.current?.prev()}>
            上一页
          </button>
          <button type="button" onClick={() => void renditionRef.current?.next()}>
            下一页
          </button>
          <button
            type="button"
            onClick={() => setFontSize((size) => Math.max(70, size - 10))}
          >
            A−
          </button>
          <span>{fontSize}%</span>
          <button
            type="button"
            onClick={() => setFontSize((size) => Math.min(180, size + 10))}
          >
            A＋
          </button>
        </div>
      </header>
      <div className="epub-stage" ref={mountRef} />
      {loading && <LoadingState label="正在打开电子书…" />}
      {error && <ErrorState message={error} />}
    </div>
  );
}

function AudioPreview({ url, fileName }: PreviewProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = waveformRef.current;
    if (!container) return;
    let cancelled = false;
    setError("");
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    void import("wavesurfer.js")
      .then(({ default: WaveSurferClass }) => {
        if (cancelled) return;
        const wavesurfer = WaveSurferClass.create({
          container,
          url,
          height: 94,
          waveColor: "#a9a394",
          progressColor: "#913f2e",
          cursorColor: "#171714",
          barWidth: 2,
          barGap: 2,
          barRadius: 2,
          normalize: true,
        });
        wavesurferRef.current = wavesurfer;
        wavesurfer.setVolume(0.85);
        wavesurfer.on("ready", (seconds) => setDuration(seconds));
        wavesurfer.on("timeupdate", setCurrentTime);
        wavesurfer.on("play", () => setPlaying(true));
        wavesurfer.on("pause", () => setPlaying(false));
        wavesurfer.on("finish", () => setPlaying(false));
        wavesurfer.on("error", (reason) =>
          setError(reason instanceof Error ? reason.message : "音频读取失败"),
        );
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "音频播放器加载失败");
        }
      });
    return () => {
      cancelled = true;
      wavesurferRef.current?.destroy();
      wavesurferRef.current = null;
      container.replaceChildren();
    };
  }, [url]);

  useEffect(() => {
    wavesurferRef.current?.setVolume(volume);
  }, [volume]);

  return (
    <div className="rich-preview audio-preview">
      <header>
        <span>AUDIO WAVEFORM</span>
        <strong>{fileName}</strong>
      </header>
      <div className="audio-waveform" ref={waveformRef} />
      <div className="audio-controls">
        <button
          type="button"
          onClick={() => void wavesurferRef.current?.playPause()}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <label>
          音量
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </label>
      </div>
      {error && <ErrorState message={error} />}
    </div>
  );
}

export function DocumentMediaPreview({
  url,
  fileName,
  assetId,
  onSaveText,
}: PreviewProps) {
  const extension = useMemo(() => extensionOf(fileName), [fileName]);
  if (extension === "pdf") return <PdfPreview url={url} fileName={fileName} />;
  if (extension === "docx") {
    return <DocxPreview url={url} fileName={fileName} />;
  }
  if (
    ["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"].includes(extension)
  ) {
    return <SpreadsheetPreview url={url} fileName={fileName} />;
  }
  if (extension === "epub") {
    return <EpubPreview url={url} fileName={fileName} />;
  }
  if (
    ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm"].includes(
      extension,
    )
  ) {
    return <AudioPreview url={url} fileName={fileName} />;
  }
  if (isEditableTextFile(fileName)) {
    if (!assetId) {
      return <ErrorState message="缺少可编辑文本资源标识" />;
    }
    return (
      <TextDocumentEditor
        assetId={assetId}
        url={url}
        fileName={fileName}
        onSaveText={onSaveText}
      />
    );
  }
  return (
    <ErrorState
      message={`当前没有适用于 .${extension || "未知"} 文件的内嵌查看器`}
    />
  );
}
