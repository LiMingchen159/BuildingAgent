import { useState, type ReactNode } from "react";

const HEADING_REGEX = /^(#{1,6})\s+(.*)$/;
const HR_REGEX = /^(?:-{3,}|_{3,}|\*{3,})\s*$/;
const FENCE_REGEX = /^```\s*([\w-]*)\s*$/;
const ORDERED_REGEX = /^(\s*)(\d+)\.\s+(.*)$/;
const UNORDERED_REGEX = /^(\s*)[-*+]\s+(.*)$/;
const BLOCKQUOTE_REGEX = /^>\s?(.*)$/;
const TABLE_DIVIDER_REGEX = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

interface CodeBlockNode {
  kind: "code";
  language: string | undefined;
  source: string;
}

interface ParagraphNode {
  kind: "paragraph";
  text: string;
}

interface HeadingNode {
  kind: "heading";
  level: number;
  text: string;
}

interface ListNode {
  kind: "list";
  ordered: boolean;
  items: string[];
}

interface BlockquoteNode {
  kind: "blockquote";
  text: string;
}

interface TableNode {
  kind: "table";
  header: string[];
  rows: string[][];
}

interface HrNode {
  kind: "hr";
}

type Block =
  | CodeBlockNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | BlockquoteNode
  | TableNode
  | HrNode;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(FENCE_REGEX);
    if (fence) {
      const language = fence[1] || undefined;
      const buffer: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_REGEX.test(lines[index]!.trim())) {
        buffer.push(lines[index]!);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ kind: "code", language, source: buffer.join("\n") });
      continue;
    }

    if (HR_REGEX.test(trimmed)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    const heading = trimmed.match(HEADING_REGEX);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length, text: heading[2]!.trim() });
      index += 1;
      continue;
    }

    if (BLOCKQUOTE_REGEX.test(trimmed)) {
      const buffer: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index]!.trim();
        if (!candidate) {
          break;
        }
        const match = candidate.match(BLOCKQUOTE_REGEX);
        if (!match) {
          break;
        }
        buffer.push(match[1] ?? "");
        index += 1;
      }
      blocks.push({ kind: "blockquote", text: buffer.join("\n") });
      continue;
    }

    if (UNORDERED_REGEX.test(line) || ORDERED_REGEX.test(line)) {
      const ordered = ORDERED_REGEX.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index]!;
        if (!candidate.trim()) {
          break;
        }
        const orderedMatch = candidate.match(ORDERED_REGEX);
        const unorderedMatch = candidate.match(UNORDERED_REGEX);
        if (!orderedMatch && !unorderedMatch) {
          break;
        }
        const matched = orderedMatch ?? unorderedMatch!;
        items.push(orderedMatch ? matched[3]!.trim() : matched[2]!.trim());
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && TABLE_DIVIDER_REGEX.test(lines[index + 1]!)) {
      const header = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) {
        rows.push(splitTableRow(lines[index]!));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const buffer: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index]!.trim() && !FENCE_REGEX.test(lines[index]!.trim()) && !HEADING_REGEX.test(lines[index]!.trim()) && !HR_REGEX.test(lines[index]!.trim()) && !BLOCKQUOTE_REGEX.test(lines[index]!.trim()) && !UNORDERED_REGEX.test(lines[index]!) && !ORDERED_REGEX.test(lines[index]!)) {
      buffer.push(lines[index]!);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: buffer.join(" ") });
  }

  return blocks;
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(text: string, keyPrefix: string, resolveImageUrl?: (url: string) => string): ReactNode[] {
  if (!text) {
    return [];
  }
  const tokens: ReactNode[] = [];
  let cursor = 0;
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(__[^_\n]+__)|(_[^_\n]+_)|(!\[([^\]]+)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let match: RegExpExecArray | null;
  let counter = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push(text.slice(cursor, match.index));
    }
    const segment = match[0];
    const key = `${keyPrefix}-${counter}`;
    counter += 1;
    if (segment.startsWith("`")) {
      tokens.push(<code className="md-inline-code" key={key}>{segment.slice(1, -1)}</code>);
    } else if (segment.startsWith("![")) {
      const alt = match[7] ?? "";
      const rawUrl = match[8] ?? "";
      const src = resolveImageUrl ? resolveImageUrl(rawUrl) : rawUrl;
      tokens.push(<img className="md-image" key={key} src={src} alt={alt} loading="lazy" />);
    } else if (segment.startsWith("**")) {
      tokens.push(<strong key={key}>{segment.slice(2, -2)}</strong>);
    } else if (segment.startsWith("__")) {
      tokens.push(<strong key={key}>{segment.slice(2, -2)}</strong>);
    } else if (segment.startsWith("*")) {
      tokens.push(<em key={key}>{segment.slice(1, -1)}</em>);
    } else if (segment.startsWith("_")) {
      tokens.push(<em key={key}>{segment.slice(1, -1)}</em>);
    } else if (segment.startsWith("[")) {
      const label = match[10] ?? "";
      const href = match[11] ?? "";
      const safe = href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("/") || href.startsWith("#");
      if (safe) {
        tokens.push(
          <a key={key} href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">
            {label}
          </a>
        );
      } else {
        tokens.push(label);
      }
    }
    cursor = match.index + segment.length;
  }
  if (cursor < text.length) {
    tokens.push(text.slice(cursor));
  }
  return tokens;
}

function CodeBlock({ language, source, onCopy }: { language: string | undefined; source: string; onCopy?: ((value: string) => void) | undefined }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(source);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = source;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      onCopy?.(source);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="md-codeblock" data-language={language ?? "plain"}>
      <div className="md-codeblock-toolbar">
        <span className="md-codeblock-language">{language ?? "code"}</span>
        <button type="button" className="md-codeblock-copy" onClick={() => void handleCopy()} aria-live="polite">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: escape(source) }} />
      </pre>
    </div>
  );
}

export interface MarkdownProps {
  source: string;
  className?: string | undefined;
  onCopyCode?: ((value: string) => void) | undefined;
  resolveImageUrl?: ((url: string) => string) | undefined;
}

export function Markdown({ source, className, onCopyCode, resolveImageUrl }: MarkdownProps) {
  const blocks = parseBlocks(source);
  return (
    <div className={["markdown", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.kind === "code") {
          return <CodeBlock key={key} language={block.language} source={block.source} onCopy={onCopyCode} />;
        }
        if (block.kind === "heading") {
          const Tag = (`h${Math.min(6, block.level)}`) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          return <Tag key={key}>{renderInline(block.text, key, resolveImageUrl)}</Tag>;
        }
        if (block.kind === "list") {
          if (block.ordered) {
            return (
              <ol key={key} className="md-list md-list-ordered">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`, resolveImageUrl)}</li>
                ))}
              </ol>
            );
          }
          return (
            <ul key={key} className="md-list md-list-unordered">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`, resolveImageUrl)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "blockquote") {
          return <blockquote key={key}>{renderInline(block.text, key, resolveImageUrl)}</blockquote>;
        }
        if (block.kind === "table") {
          return (
            <div key={key} className="md-table-wrap">
              <table className="md-table">
                <thead>
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      <th key={`${key}-h-${cellIndex}`}>{renderInline(cell, `${key}-h-${cellIndex}`, resolveImageUrl)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-r-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`${key}-r-${rowIndex}-${cellIndex}`}>{renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`, resolveImageUrl)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "hr") {
          return <hr key={key} />;
        }
        return <p key={key}>{renderInline(block.text, key, resolveImageUrl)}</p>;
      })}
    </div>
  );
}
