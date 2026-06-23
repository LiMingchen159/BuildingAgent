import "katex/dist/katex.min.css";

import { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeRepositoryAssetPath } from "../repositoryLinks";

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isExternalHref(href: string): boolean {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("#") ||
    href.startsWith("data:")
  );
}

function isRepositoryOutputPath(href: string): boolean {
  return normalizeRepositoryAssetPath(href).startsWith("outputs/");
}

/** remark-math only treats `$$\n...\n$$` as display math; LLMs often emit `$$ ... $$` on one line. */
function normalizeDisplayMath(source: string): string {
  return source.replace(/^\$\$\s*([^\n$]+?)\s*\$\$$/gm, (_, body: string) => `$$\n${body.trim()}\n$$`);
}

/** GPT-style `\(...\)` / `\[...\]` delimiters are not recognized by remark-math. */
function normalizeMathDelimiters(source: string): string {
  return source
    .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, content: string) => `$$\n${content.trim()}\n$$`)
    .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, content: string) => `$${content.trim()}$`);
}

function preprocessMarkdown(source: string): string {
  const parts = source.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, index) => (index % 2 === 1 ? part : normalizeDisplayMath(normalizeMathDelimiters(part))))
    .join("");
}

function CodeBlock({
  language,
  source,
  onCopy
}: {
  language: string | undefined;
  source: string;
  onCopy?: ((value: string) => void) | undefined;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
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

function createMarkdownComponents(options: {
  onCopyCode?: ((value: string) => void) | undefined;
  resolveImageUrl?: ((url: string) => string) | undefined;
  resolveLinkUrl?: ((url: string) => string) | undefined;
  onRepositoryFileDownload?: ((path: string, filename: string) => void) | undefined;
}): Components {
  const { onCopyCode, resolveImageUrl, resolveLinkUrl, onRepositoryFileDownload } = options;

  return {
    pre({ children }) {
      return <>{children}</>;
    },
    code({ className, children }) {
      const text = String(children).replace(/\n$/, "");
      const match = /language-([\w-]+)/.exec(className ?? "");
      if (match || text.includes("\n")) {
        return <CodeBlock language={match?.[1]} source={text} onCopy={onCopyCode} />;
      }
      return <code className="md-inline-code">{children}</code>;
    },
    a({ href, children }) {
      const rawHref = href ?? "";
      const normalizedHref = normalizeRepositoryAssetPath(rawHref);
      const resolvedHref =
        resolveLinkUrl && !isExternalHref(normalizedHref) ? resolveLinkUrl(normalizedHref) : normalizedHref;
      const safe = isExternalHref(normalizedHref) || resolvedHref.startsWith("/");
      if (!safe) {
        return <>{children}</>;
      }

      const downloadName = normalizedHref.startsWith("outputs/")
        ? normalizedHref.split("/").pop()
        : resolvedHref.includes("/")
          ? resolvedHref.split("/").pop()?.split("?")[0]
          : undefined;
      const useDownloadHandler = Boolean(onRepositoryFileDownload && isRepositoryOutputPath(normalizedHref));

      return (
        <a
          className="md-download-link"
          href={useDownloadHandler ? "#" : resolvedHref}
          {...(useDownloadHandler
            ? {
                onClick: (event) => {
                  event.preventDefault();
                  onRepositoryFileDownload?.(normalizedHref, downloadName ?? String(children));
                }
              }
            : downloadName
              ? { download: downloadName }
              : {})}
          target={useDownloadHandler || normalizedHref.startsWith("#") ? undefined : "_blank"}
          rel="noopener noreferrer"
        >
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      const rawUrl = src ?? "";
      const resolved = resolveImageUrl ? resolveImageUrl(rawUrl) : rawUrl;
      return <img className="md-image" src={resolved} alt={alt ?? ""} loading="lazy" />;
    },
    table({ children, ...props }) {
      return (
        <div className="md-table-wrap">
          <table className="md-table" {...props}>
            {children}
          </table>
        </div>
      );
    },
    hr() {
      return <div className="md-break" aria-hidden />;
    }
  };
}

export interface MarkdownProps {
  source: string;
  className?: string | undefined;
  onCopyCode?: ((value: string) => void) | undefined;
  resolveImageUrl?: ((url: string) => string) | undefined;
  resolveLinkUrl?: ((url: string) => string) | undefined;
  onRepositoryFileDownload?: ((path: string, filename: string) => void) | undefined;
}

export function Markdown({
  source,
  className,
  onCopyCode,
  resolveImageUrl,
  resolveLinkUrl,
  onRepositoryFileDownload
}: MarkdownProps) {
  const components = useMemo(
    () =>
      createMarkdownComponents({
        ...(onCopyCode ? { onCopyCode } : {}),
        ...(resolveImageUrl ? { resolveImageUrl } : {}),
        ...(resolveLinkUrl ? { resolveLinkUrl } : {}),
        ...(onRepositoryFileDownload ? { onRepositoryFileDownload } : {})
      }),
    [onCopyCode, resolveImageUrl, resolveLinkUrl, onRepositoryFileDownload]
  );

  const normalizedSource = useMemo(() => preprocessMarkdown(source), [source]);

  return (
    <div className={["markdown", className].filter(Boolean).join(" ")}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {normalizedSource}
      </ReactMarkdown>
    </div>
  );
}
