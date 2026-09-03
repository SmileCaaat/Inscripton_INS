"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  extensionOfFileName,
  jsonStructureLabel,
  parseJsonDocument,
  renderMarkdownToHtml,
  textDocumentRole,
  type TextSaveReason,
} from "./text-documents";

type TextDocumentEditorProps = {
  assetId: string;
  url: string;
  fileName: string;
  onSaveText?: (
    assetId: string,
    text: string,
    reason: TextSaveReason,
  ) => Promise<void> | void;
};

type EditorView = "edit" | "preview" | "split" | "structure";

const JSON_TREE_LIMIT = 80;

function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span className="json-token json-null">null</span>;
  if (typeof value === "string") {
    return <span className="json-token json-string">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <span className={`json-token json-${typeof value}`}>{String(value)}</span>
    );
  }
  if (depth > 8) {
    return <span className="json-token json-more">…</span>;
  }
  if (Array.isArray(value)) {
    const visible = value.slice(0, JSON_TREE_LIMIT);
    return (
      <details open={depth < 2}>
        <summary>[{value.length}]</summary>
        {visible.map((item, index) => (
          <div className="json-row" key={index}>
            <span className="json-key">{index}</span>
            <JsonTree value={item} depth={depth + 1} />
          </div>
        ))}
        {value.length > visible.length ? (
          <div className="json-row json-more">
            其余 {value.length - visible.length} 项未展开
          </div>
        ) : null}
      </details>
    );
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    const visible = keys.slice(0, JSON_TREE_LIMIT);
    return (
      <details open={depth < 2}>
        <summary>{`{${keys.length}}`}</summary>
        {visible.map((key) => (
          <div className="json-row" key={key}>
            <span className="json-key">{key}</span>
            <JsonTree
              value={(value as Record<string, unknown>)[key]}
              depth={depth + 1}
            />
          </div>
        ))}
        {keys.length > visible.length ? (
          <div className="json-row json-more">
            其余 {keys.length - visible.length} 个键未展开
          </div>
        ) : null}
      </details>
    );
  }
  return <span className="json-token">{String(value)}</span>;
}

export function TextDocumentEditor({
  assetId,
  url,
  fileName,
  onSaveText,
}: TextDocumentEditorProps) {
  const extension = extensionOfFileName(fileName);
  const isMarkdown = extension === "md";
  const isJson = extension === "json";
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<EditorView>("edit");
  const [savedHint, setSavedHint] = useState("");
  const draftRef = useRef("");
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setDirty(false);
    dirtyRef.current = false;
    setError("");
    setSavedHint("");
    setView("edit");
    setDraft("");
    draftRef.current = "";
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("文本读取失败");
        return response.text();
      })
      .then((value) => {
        if (cancelled) return;
        draftRef.current = value;
        setDraft(value);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "文本读取失败");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Reload when switching resources; ignore blob URL rotation after save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const jsonStatus = useMemo(
    () => (isJson ? parseJsonDocument(draft) : null),
    [draft, isJson],
  );
  const markdownHtml = useMemo(
    () => (isMarkdown ? renderMarkdownToHtml(draft) : ""),
    [draft, isMarkdown],
  );

  const persist = useCallback(
    async (reason: TextSaveReason, text: string) => {
      if (!onSaveText || savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setError("");
      try {
        await onSaveText(assetId, text, reason);
        if (draftRef.current === text) {
          dirtyRef.current = false;
          setDirty(false);
          setSavedHint(reason === "manual" ? "已保存" : "已自动保存");
        }
      } catch (reasonValue: unknown) {
        setError(
          reasonValue instanceof Error ? reasonValue.message : "保存失败",
        );
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [assetId, onSaveText],
  );

  useEffect(() => {
    if (!loaded || !dirty || !onSaveText) return;
    const timer = window.setTimeout(() => {
      void persist("auto", draft);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, loaded, onSaveText, persist]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const formatJson = () => {
    if (!jsonStatus?.ok) return;
    const next = `${JSON.stringify(jsonStatus.value, null, 2)}\n`;
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setDirty(true);
    setSavedHint("");
  };

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      void persist("manual", event.currentTarget.value);
    }
  };

  const role = textDocumentRole(fileName);
  const statusText = saving
    ? "正在保存…"
    : dirty
      ? "未保存"
      : savedHint || (loaded ? "已同步" : "读取中");

  return (
    <div className={`text-document-editor text-kind-${extension || "txt"}`}>
      <header className="text-document-toolbar">
        <div>
          <strong>{role}</strong>
          <span>{fileName}</span>
        </div>
        <div className="text-document-toolbar-actions">
          {isMarkdown ? (
            <>
              <button
                type="button"
                className={view === "edit" ? "active" : ""}
                onClick={() => setView("edit")}
              >
                编辑
              </button>
              <button
                type="button"
                className={view === "preview" ? "active" : ""}
                onClick={() => setView("preview")}
              >
                预览
              </button>
              <button
                type="button"
                className={view === "split" ? "active" : ""}
                onClick={() => setView("split")}
              >
                分栏
              </button>
            </>
          ) : null}
          {isJson ? (
            <>
              <button
                type="button"
                className={view === "edit" ? "active" : ""}
                onClick={() => setView("edit")}
              >
                编辑
              </button>
              <button
                type="button"
                className={view === "structure" ? "active" : ""}
                disabled={!jsonStatus?.ok}
                onClick={() => setView("structure")}
              >
                结构
              </button>
              <button
                type="button"
                disabled={!jsonStatus?.ok}
                onClick={formatJson}
              >
                格式化
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="text-save-button"
            disabled={!onSaveText || !dirty || saving}
            onClick={() => void persist("manual", draft)}
          >
            保存
          </button>
        </div>
      </header>

      {!loaded ? (
        <div className="rich-preview-state">
          <span className="rich-preview-spinner" />
          <strong>正在读取文本…</strong>
        </div>
      ) : (
        <div
          className={`text-document-body ${
            view === "split" ? "is-split" : ""
          }`}
        >
          {view !== "preview" && view !== "structure" ? (
            <textarea
              aria-label={`${role}编辑器`}
              spellCheck={isMarkdown}
              value={draft}
              onChange={(event) => {
                const value = event.target.value;
                draftRef.current = value;
                dirtyRef.current = true;
                setDraft(value);
                setDirty(true);
                setSavedHint("");
              }}
              onKeyDown={onEditorKeyDown}
            />
          ) : null}
          {isMarkdown && (view === "preview" || view === "split") ? (
            <article
              className="markdown-note-preview"
              dangerouslySetInnerHTML={{ __html: markdownHtml }}
            />
          ) : null}
          {isJson && view === "structure" && jsonStatus?.ok ? (
            <div className="json-structure-preview">
              <JsonTree value={jsonStatus.value} />
            </div>
          ) : null}
        </div>
      )}

      <footer className="text-document-status">
        <span>{statusText}</span>
        {isJson ? (
          <span className={jsonStatus?.ok ? "ok" : "error"}>
            {jsonStatus?.ok
              ? `有效 JSON · ${jsonStructureLabel(jsonStatus.value)}`
              : jsonStatus?.message ?? "JSON 无效"}
          </span>
        ) : (
          <span>Ctrl+S 保存 · 停止输入后自动写入本机</span>
        )}
        {error ? <span className="error">{error}</span> : null}
      </footer>
    </div>
  );
}
