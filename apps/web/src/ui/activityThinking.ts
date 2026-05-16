const THINKING_BLOCK_PATTERNS = [
  /<think>([\s\S]*?)<\/think>/gi,
  /<think>([\s\S]*?)<\/redacted_thinking>/gi
];

export interface ParsedActivityLabel {
  thinkingBlocks: string[];
  visibleText: string;
}

export function parseActivityLabel(label: string): ParsedActivityLabel {
  const thinkingBlocks: string[] = [];
  let visibleText = label;
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    for (const match of visibleText.matchAll(matcher)) {
      const block = match[1]?.trim();
      if (block) {
        thinkingBlocks.push(block);
      }
    }
    visibleText = visibleText.replace(new RegExp(pattern.source, pattern.flags), "");
  }
  visibleText = visibleText.replace(/\n{3,}/g, "\n\n").trim();
  return { thinkingBlocks, visibleText };
}
