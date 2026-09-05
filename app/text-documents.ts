export const EDITABLE_TEXT_EXTENSIONS = [
  "txt",
  "md",
  "json",
  "xml",
  "html",
  "css",
  "js",
  "ts",
] as const;

export type EditableTextExtension = (typeof EDITABLE_TEXT_EXTENSIONS)[number];
export type TextSaveReason = "auto" | "manual";

export function extensionOfFileName(fileName: string) {
  return fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function isEditableTextFile(fileName: string) {
  return EDITABLE_TEXT_EXTENSIONS.includes(
    extensionOfFileName(fileName) as EditableTextExtension,
  );
}

export function mimeTypeForTextFile(fileName: string) {
  switch (extensionOfFileName(fileName)) {
    case "md":
      return "text/markdown;charset=utf-8";
    case "json":
      return "application/json;charset=utf-8";
    case "xml":
      return "application/xml;charset=utf-8";
    case "html":
      return "text/html;charset=utf-8";
    case "css":
      return "text/css;charset=utf-8";
    case "js":
      return "text/javascript;charset=utf-8";
    default:
      return "text/plain;charset=utf-8";
  }
}

export function textDocumentRole(fileName: string) {
  switch (extensionOfFileName(fileName)) {
    case "md":
      return "Markdown 笔记";
    case "json":
      return "JSON 数据源";
    case "txt":
      return "纯文本";
    case "xml":
      return "XML";
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "js":
      return "JavaScript";
    case "ts":
      return "TypeScript";
    default:
      return "文本";
  }
}

export function uniqueAssetFileName(
  assets: Array<{ name: string; path: string }>,
  path: string,
  baseName: string,
  extension: string,
) {
  const suffix = extension.startsWith(".") ? extension : `.${extension}`;
  let name = `${baseName}${suffix}`;
  let index = 2;
  while (
    assets.some(
      (asset) =>
        asset.path === path &&
        asset.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    name = `${baseName} ${index}${suffix}`;
    index += 1;
  }
  return name;
}

export function markdownNoteTemplate(title: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `# ${title}

- 日期：${date}
- 来源：

## 笔记

`;
}

export function jsonDataTemplate(title: string) {
  return `${JSON.stringify(
    {
      title,
      createdAt: new Date().toISOString(),
      notes: "",
      records: [],
    },
    null,
    2,
  )}\n`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeUrl(value: string) {
  const url = value.trim();
  if (/^(https?:|mailto:|blob:|#|\/)/i.test(url)) return url;
  if (/^[a-z0-9._~/-]+$/i.test(url) && !/javascript/i.test(url)) return url;
  return "";
}

function renderInlineMarkdown(value: string) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, alt: string, href: string) => {
        const url = safeUrl(href.replaceAll("&amp;", "&"));
        return url
          ? `<img alt="${alt}" src="${escapeHtml(url)}" />`
          : _match;
      },
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label: string, href: string) => {
        const url = safeUrl(href.replaceAll("&amp;", "&"));
        return url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>`
          : _match;
      },
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function renderMarkdownToHtml(source: string) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let index = 0;
  let inList: "ul" | "ol" | null = null;
  let inCode = false;
  const code: string[] = [];

  const closeList = () => {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      index += 1;
      continue;
    }
    if (inCode) {
      code.push(line);
      index += 1;
      continue;
    }
    if (/^\s*$/.test(line)) {
      closeList();
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(
        `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`,
      );
      index += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push("<hr />");
      index += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(line.slice(2))}</blockquote>`);
      index += 1;
      continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    if (unordered) {
      if (inList !== "ul") {
        closeList();
        html.push("<ul>");
        inList = "ul";
      }
      html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
      index += 1;
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      if (inList !== "ol") {
        closeList();
        html.push("<ol>");
        inList = "ol";
      }
      html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
      index += 1;
      continue;
    }
    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    index += 1;
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  }
  closeList();
  return html.join("");
}

export type JsonParseStatus =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

export function parseJsonDocument(text: string): JsonParseStatus {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (reason) {
    return {
      ok: false,
      message: reason instanceof Error ? reason.message : "JSON 无法解析",
    };
  }
}

export function jsonStructureLabel(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `数组 · ${value.length} 项`;
  if (typeof value === "object") {
    return `对象 · ${Object.keys(value).length} 个键`;
  }
  return typeof value;
}
