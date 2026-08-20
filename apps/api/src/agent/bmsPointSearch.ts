/**
 * Helpers for recovering from a missed BMS catalog lookup.
 *
 * The catalog API matches `q` as a plain substring over point name + description,
 * so a phrase like "Chiller 1 return water temperature" never matches even though
 * "Return Temperature" and "CHWRT" both do. These helpers turn a failed phrase into
 * a small set of catalog probes and rank whatever comes back.
 */

export interface BmsCatalogItem {
  name?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

/** Conversational filler that never appears in a point name or description. */
const SEARCH_STOP_WORDS = new Set([
  "a", "about", "an", "and", "any", "are", "at", "be", "current", "currently", "data",
  "do", "does", "for", "from", "get", "give", "has", "have", "how", "in", "is", "it",
  "latest", "me", "much", "my", "now", "of", "on", "or", "please", "point", "points",
  "reading", "readings", "right", "s", "show", "status", "tell", "that", "the", "there",
  "this", "to", "value", "values", "was", "what", "whats", "when", "where", "which",
  "with", "you", "your"
]);

/** Terms shorter than this are kept for scoring but are too broad to probe with. */
const MIN_PROBE_LENGTH = 3;

export interface BmsPointSearchPlan {
  /** Every meaningful token, used to score candidates. */
  terms: string[];
  /** The subset actually issued as catalog queries. */
  probes: string[];
}

/**
 * Split a free-text query into scoring terms and the catalog probes worth issuing.
 * Returns no probes when the query is already a single token, since re-issuing the
 * caller's own query would just repeat the miss.
 */
export function planBmsPointSearch(query: string, maxProbes = 6): BmsPointSearchPlan {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const token of query.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (!token || SEARCH_STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
  }
  if (terms.length < 2) {
    return { terms, probes: [] };
  }
  const probes = terms.filter((term) => term.length >= MIN_PROBE_LENGTH).slice(0, maxProbes);
  return { terms, probes };
}

/** Count how many query terms appear in a candidate's name or description. */
export function scoreBmsPointCandidate(item: BmsCatalogItem, terms: string[]): number {
  const haystack = `${String(item.name ?? "")} ${String(item.description ?? "")}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

/**
 * Merge candidates gathered from several probes, drop anything that matches nothing,
 * and order by term coverage. Ties break on name so results stay deterministic.
 */
export function rankBmsPointCandidates(
  items: BmsCatalogItem[],
  terms: string[],
  limit: number
): Array<BmsCatalogItem & { match_score: number }> {
  const byKey = new Map<string, BmsCatalogItem & { match_score: number }>();
  for (const item of items) {
    const score = scoreBmsPointCandidate(item, terms);
    if (score === 0) continue;
    const key = String(item.name ?? item.object_ref ?? JSON.stringify(item));
    const existing = byKey.get(key);
    if (!existing || existing.match_score < score) {
      byKey.set(key, { ...item, match_score: score });
    }
  }
  return [...byKey.values()]
    .sort((left, right) =>
      right.match_score - left.match_score ||
      String(left.name ?? "").localeCompare(String(right.name ?? "")))
    .slice(0, limit);
}

/** Guidance returned when even the widened search finds nothing. */
export function bmsPointSearchMissHint(query: string, probes: string[]): string {
  const attempted = probes.length
    ? `Already retried with these terms: ${probes.join(", ")}.`
    : "The query was a single term, so there was nothing broader to retry.";
  return [
    `No catalog match for "${query}". ${attempted}`,
    "The catalog matches substrings of point name and description, so short site tokens work best (e.g. CHWRT, \"Return Temperature\", WCC-L1-01).",
    "Do not keep guessing aliases. Read kb:/KB_CATALOG_SUMMARY.md for this site's naming convention, then query again with a token from it."
  ].join(" ");
}
