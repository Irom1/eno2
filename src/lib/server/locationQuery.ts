/**
 * Extract a requested place from a free-form chat message.
 *
 * Chat users phrase location searches in several ways ("in Cambridge",
 * "near Arlington", "around Boston", "at Ballston Common Mall", ...). The
 * original helper only understood "near", so "Find ATMs in Cambridge" silently
 * searched the default location instead. This module understands the common
 * location prepositions and returns the text that follows the right-most one,
 * which is typically the most complete place phrase in the sentence.
 */

const LOCATION_KEYWORD = /\b(?:close\s+to|near|around|within|at|in)\b/gi;
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;
const TRAILING_PUNCTUATION = /[?!.,;:]+$/;
const WRAPPING_QUOTES = /^["'`]+|["'`]+$/g;

/** Normalize a candidate place phrase, returning "" when nothing remains. */
function cleanLocation(value: string): string {
  const withoutPunctuation = value.replace(TRAILING_PUNCTUATION, "").trim();
  const withoutQuotes = withoutPunctuation.replace(WRAPPING_QUOTES, "").trim();
  const withoutArticle = withoutQuotes.replace(LEADING_ARTICLE, "").trim();
  return withoutArticle.replace(TRAILING_PUNCTUATION, "").trim();
}

/**
 * Return the most specific location phrase in `message`, or `fallback` when the
 * message contains no recognizable location phrase.
 */
export function extractLocation(message: string, fallback: string): string {
  if (typeof message !== "string") return fallback;

  let best: { index: number; phrase: string } | null = null;
  for (const match of message.matchAll(LOCATION_KEYWORD)) {
    const index = match.index ?? 0;
    const phrase = cleanLocation(message.slice(index + match[0].length));
    if (!phrase) continue;
    // Keep the right-most keyword so multi-clause messages prefer the trailing,
    // most complete place ("near my home in Arlington" -> "Arlington").
    if (!best || index > best.index) best = { index, phrase };
  }

  return best?.phrase ?? fallback;
}
