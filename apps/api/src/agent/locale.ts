/** User-facing assistant language (not UI chrome). */

export type UserMessageLanguage = "en" | "yue" | "zh" | "mixed";

const YUE_MARKERS = /[嘅咗喺冇哋睇畀嚟唔嗰啲係點樣幾時]/;

export function detectUserMessageLanguage(text: string): UserMessageLanguage {
  const stripped = text.trim();
  if (!stripped) return "en";

  const cjk = (stripped.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (stripped.match(/[a-zA-Z]/g) ?? []).length;

  if (latin > 0 && cjk === 0) return "en";
  if (cjk > 0 && latin === 0) return YUE_MARKERS.test(stripped) ? "yue" : "zh";
  if (latin >= cjk) return "en";
  return YUE_MARKERS.test(stripped) ? "yue" : "mixed";
}

export function perTurnLanguageBlock(userText: string): string {
  const lang = detectUserMessageLanguage(userText);
  switch (lang) {
    case "en":
      return [
        "LANGUAGE THIS TURN: The user's latest message is in English.",
        "Reply entirely in English — headings, explanations, and tables.",
        "Do not use Cantonese or Chinese prose even if KB files, tool output, or earlier turns used Chinese.",
        "Point names, paths, and technical identifiers may stay as-is."
      ].join(" ");
    case "yue":
      return [
        "LANGUAGE THIS TURN: The user's latest message is in Hong Kong Cantonese.",
        "Reply in natural 粵語 with traditional characters."
      ].join(" ");
    case "zh":
      return [
        "LANGUAGE THIS TURN: The user's latest message is in Chinese.",
        "Match their script (simplified or traditional) and tone."
      ].join(" ");
    default:
      return "LANGUAGE THIS TURN: Match the language the user used in their latest message.";
  }
}

export function replyLanguageDirective(_env: Record<string, string | undefined> = process.env): string {
  return [
    "LANGUAGE: Always match the user's latest message in each reply — not KB language, not prior turns.",
    "English user → English only. Cantonese user → Hong Kong Cantonese (traditional; natural 粵語).",
    "Mandarin user → simplified or traditional Mandarin as they used.",
    "Do not switch language unless the user switches. Technical identifiers (point names, paths) may stay as-is."
  ].join(" ");
}
