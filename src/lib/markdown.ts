/**
 * Tiny, safe markdown renderer. Everything is HTML-escaped *before* any
 * formatting is applied, so provider/LLM text can never inject markup.
 * Supported: **bold**, *italic*, `code`, ATX headings, `-` bullets,
 * numbered lists, paragraphs, and single newlines inside a paragraph.
 */

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

function renderInline(value: string): string {
  const code: string[] = [];
  let text = value.replace(/`([^`]+)`/g, (_match, inner: string) => {
    code.push(inner);
    return `\u0000${code.length - 1}\u0000`;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // Remove unmatched bold markers left if a text block boundary split a span.
  // Only runs after matched bold pairs are converted, so real bold survives.
  text = text.replace(/\*\*/g, "");
  text = text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => `<code>${code[Number(index)] ?? ""}</code>`);
  return text;
}

const HEADING = /^#{1,6}\s+(.+)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+\.\s+(.*)$/;

export function renderMarkdown(input: string): string {
  if (!input) return "";
  const lines = escapeHtml(input).split(/\r?\n/);

  let html = "";
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    html += `<p>${paragraph.map(renderInline).join("<br>")}</p>`;
    paragraph = [];
  };

  const flushList = (): void => {
    if (listType && listItems.length > 0) {
      html += `<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${listType}>`;
    }
    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      html += `<h3>${renderInline(heading[1] ?? "")}</h3>`;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(bullet[1] ?? "");
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(numbered[1] ?? "");
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return html;
}
