export interface RepositoryDownloadLink {
  path: string;
  filename: string;
}

const REPOSITORY_OUTPUT_FILE_PATTERN = /\boutputs\/[A-Za-z0-9_./-]+\.(?:csv|md|json|txt|pdf|xlsx|yaml|yml|html|tsv|xml)\b/gi;

export function normalizeRepositoryAssetPath(rawPath: string): string {
  let normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const nested = normalized.match(/\[([^\]]+)\]\((outputs\/[^)]+)\)/);
  if (nested) {
    normalized = nested[2] ?? normalized;
  }
  const kbMatch = normalized.match(/(?:^|\.\.\/|\/)kb\/outputs\/(.+)/i);
  if (kbMatch) {
    normalized = `outputs/${kbMatch[1]}`;
  }
  const outputsMatch = normalized.match(/(outputs\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
  return outputsMatch ? outputsMatch[1]! : normalized;
}

export function sanitizeRepositoryDownloadMarkdown(content: string): string {
  let text = content;
  text = text.replace(/\[([^\]]+)\]\(\[([^\]]+)\]\((outputs\/[^)]+)\)\)/g, "[$2]($3)");
  text = text.replace(/\[outputs\/([^\]]+)\]\((outputs\/[^)]+)\)/gi, "[$1]($2)");
  text = text.replace(REPOSITORY_OUTPUT_FILE_PATTERN, (match, offset) => {
    const charBefore = offset > 0 ? text[offset - 1] : "";
    const twoBefore = text.slice(Math.max(0, offset - 2), offset);
    if (charBefore === "(" || twoBefore === "](") {
      return match;
    }
    const filename = match.split("/").pop() ?? match;
    return `[${filename}](${match})`;
  });
  return text;
}

export function extractRepositoryDownloadPaths(content: string): RepositoryDownloadLink[] {
  const links = new Map<string, RepositoryDownloadLink>();
  const add = (rawPath: string) => {
    const path = normalizeRepositoryAssetPath(rawPath);
    if (!path.startsWith("outputs/")) {
      return;
    }
    const key = path.toLowerCase();
    if (links.has(key)) {
      return;
    }
    links.set(key, { path, filename: path.split("/").pop() ?? path });
  };

  for (const match of content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    add(match[2] ?? "");
  }
  for (const match of content.matchAll(REPOSITORY_OUTPUT_FILE_PATTERN)) {
    add(match[0] ?? "");
  }
  return [...links.values()];
}

export function linkifyRepositoryOutputPaths(content: string): string {
  return sanitizeRepositoryDownloadMarkdown(content);
}

export function mergeMessageDownloads(
  content: string,
  downloads?: RepositoryDownloadLink[]
): RepositoryDownloadLink[] {
  const merged = new Map<string, RepositoryDownloadLink>();
  for (const item of [...(downloads ?? []), ...extractRepositoryDownloadPaths(content)]) {
    merged.set(item.path.toLowerCase(), item);
  }
  return [...merged.values()];
}
