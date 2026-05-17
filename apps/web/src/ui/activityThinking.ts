const THINK_BLOCK_PATTERN = /<(think|redacted_thinking)>([\s\S]*?)<\/(think|redacted_thinking)>/gi;
const THINK_OPEN_PATTERN = /<(think|redacted_thinking)>([\s\S]*)$/i;

export interface ParsedActivityLabel {
  thinkingBlocks: string[];
  visibleText: string;
}

export interface ParsedAssistantContent {
  thinkingBlocks: string[];
  /** Open think block still streaming (no closing tag yet). */
  streamingThinking: string | null;
  visibleText: string;
}

function stripWithPatterns(text: string): string {
  let result = text;
  for (const pattern of [THINK_BLOCK_PATTERN, THINK_OPEN_PATTERN]) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), "");
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function parseAssistantContent(content: string): ParsedAssistantContent {
  const thinkingBlocks: string[] = [];
  for (const match of content.matchAll(new RegExp(THINK_BLOCK_PATTERN.source, THINK_BLOCK_PATTERN.flags))) {
    const block = match[2]?.trim();
    if (block) {
      thinkingBlocks.push(block);
    }
  }

  let visibleText = content.replace(new RegExp(THINK_BLOCK_PATTERN.source, THINK_BLOCK_PATTERN.flags), "");
  let streamingThinking: string | null = null;
  const openMatch = visibleText.match(THINK_OPEN_PATTERN);
  if (openMatch) {
    streamingThinking = openMatch[2]?.trim() || "";
    visibleText = visibleText.slice(0, openMatch.index ?? 0);
  }

  visibleText = visibleText.replace(/\n{3,}/g, "\n\n").trim();
  return { thinkingBlocks, streamingThinking, visibleText };
}

export function parseActivityLabel(label: string): ParsedActivityLabel {
  const parsed = parseAssistantContent(label);
  const thinkingBlocks = [...parsed.thinkingBlocks];
  if (parsed.streamingThinking) {
    thinkingBlocks.push(parsed.streamingThinking);
  }
  return {
    thinkingBlocks,
    visibleText: parsed.visibleText
  };
}

/** Remove provider thinking wrappers from assistant answer markdown. */
export function stripThinkingFromAnswer(content: string): string {
  return parseAssistantContent(content).visibleText;
}

/** First-message sidebar title from the user's question (no LLM). */
export function instantConversationTitle(userText: string): string {
  const compact = userText.replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 60) : "New conversation";
}

/** Strip thinking + markdown noise for sidebar conversation titles. */
export function sanitizeConversationTitle(text: string): string {
  const stripped = stripWithPatterns(text);
  return stripped
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
