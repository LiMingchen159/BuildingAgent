const THINKING_BLOCK_PATTERNS = [
  /<think>([\s\S]*?)<\/think>/gi,
  /<think>([\s\S]*?)<\/redacted_thinking>/gi
];

export interface ParsedActivityLabel {
  thinkingBlocks: string[];
  visibleText: string;
}

function stripWithPatterns(text: string): string {
  let result = text;
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function parseActivityLabel(label: string): ParsedActivityLabel {
  const thinkingBlocks: string[] = [];
  let scratch = label;
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    for (const match of scratch.matchAll(matcher)) {
      const block = match[1]?.trim();
      if (block) {
        thinkingBlocks.push(block);
      }
    }
    scratch = scratch.replace(new RegExp(pattern.source, pattern.flags), "");
  }
  const visibleText = scratch.replace(/\n{3,}/g, "\n\n").trim();
  return { thinkingBlocks, visibleText };
}

/** Remove provider thinking wrappers from assistant answer markdown. */
export function stripThinkingFromAnswer(content: string): string {
  return stripWithPatterns(content);
}
