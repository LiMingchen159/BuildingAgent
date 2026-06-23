export interface RepositoryDownloadLink {
  path: string;
  filename: string;
}

const OUTPUT_FILE_PATTERN = /\boutputs\/[A-Za-z0-9_./-]+\.(?:csv|md|json|txt|pdf|xlsx|yaml|yml|html|tsv|xml)\b/gi;

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
  text = text.replace(OUTPUT_FILE_PATTERN, (match, offset) => {
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
  for (const match of content.matchAll(OUTPUT_FILE_PATTERN)) {
    add(match[0] ?? "");
  }
  return [...links.values()];
}

export function dedupeRepositoryDownloads(
  downloads: RepositoryDownloadLink[] | undefined
): RepositoryDownloadLink[] | undefined {
  if (!downloads || downloads.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const deduped: RepositoryDownloadLink[] = [];
  for (const item of downloads) {
    const path = normalizeRepositoryAssetPath(item.path);
    const key = path.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ path, filename: item.filename || path.split("/").pop() || path });
  }
  return deduped.length > 0 ? deduped : undefined;
}

export function finalizeAssistantDownloads(
  downloads: RepositoryDownloadLink[] | undefined,
  content: string
): RepositoryDownloadLink[] | undefined {
  const fromTools = dedupeRepositoryDownloads(downloads) ?? [];
  const fromContent = extractRepositoryDownloadPaths(content);
  const merged = new Map<string, RepositoryDownloadLink>();
  for (const item of [...fromTools, ...fromContent]) {
    merged.set(item.path.toLowerCase(), item);
  }
  const values = [...merged.values()];
  return values.length > 0 ? values : undefined;
}
