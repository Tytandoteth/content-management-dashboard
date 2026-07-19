/**
 * Brand copy rules, enforced in code rather than left to whoever is writing.
 *
 * The standing rule: Ty.ai copy NEVER uses em dashes (—) or en dashes (–). They
 * are the single loudest "this was written by an AI" tell, and they kept slipping
 * back into captions, articles, and threads. Anything that produces user-facing
 * copy should run it through `noEmDash()` on the way out, including text we did
 * not write ourselves (fetched GitHub descriptions, LLM output).
 */

/**
 * Replace em/en dashes with the punctuation a person would actually type.
 *
 *   "Postiz — the scheduler"   → "Postiz, the scheduler"
 *   "fast, cheap—and local"    → "fast, cheap, and local"
 *   "$50–100/mo"               → "$50-100/mo"   (numeric range keeps a hyphen)
 *
 * Hyphens and arrows are untouched; only the two dash characters are rewritten.
 */
export function noEmDash(text: string): string {
  return text
    // Numeric ranges read naturally as a hyphen: "50–100" → "50-100".
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    // A spaced dash is doing a comma's job: "a — b" → "a, b".
    .replace(/\s*[—–]\s*/g, ", ")
    // Tidy the seams the substitution can leave behind.
    .replace(/,\s*,+/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\s*([.!?;:])/g, "$1")
    .replace(/,\s*$/g, "");
}

/** True when copy still contains a banned dash. Handy for tests/assertions. */
export function hasEmDash(text: string): boolean {
  return /[—–]/.test(text);
}
