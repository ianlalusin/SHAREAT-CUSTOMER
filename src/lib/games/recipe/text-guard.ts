/**
 * A coarse block-list for text a diner publishes under the SharEat name.
 *
 * NOT a profanity solution and not a substitute for the human review every
 * free-text recipe goes through — it only keeps the obvious out of the queue so
 * a reviewer's time goes on real judgement calls. Anything subtle is exactly
 * what the reviewer is for.
 *
 * Matching is on whole words over a normalised token list rather than a regex.
 * Tokens make the word-boundary rule exact — "assassin" and "gagaling" must not
 * trip — and leave no escaping to get wrong.
 */

const BLOCKED = [
  // English
  "fuck", "shit", "bitch", "cunt", "asshole", "dick", "pussy", "whore", "slut",
  "nigger", "faggot", "retard", "rape",
  // Filipino / Taglish
  "putangina", "tangina", "puta", "gago", "gaga", "tanga", "bobo", "ulol",
  "pakyu", "kingina", "punyeta", "leche", "tarantado", "bwisit", "hayop ka",
  "burat", "titi", "puke", "pekpek", "kantot", "jakol", "bayag",
];

/**
 * Lowercase, strip accents, and reduce anything that is not a letter or digit
 * to a single space — so punctuation cannot hide a word ("(fuck)!" still trips)
 * while "f-u-c-k" deliberately does not. Spaced-out evasion is a judgement call
 * for the reviewer, not something to chase with a blunt list.
 */
function tokenise(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** The blocked terms present in `text`. Empty means nothing tripped. */
export function findBlockedWords(text: string): string[] {
  const tokens = tokenise(text);
  if (tokens.length === 0) return [];

  const single = new Set(tokens);
  // Padded so a multi-word term only matches on whole-token boundaries.
  const joined = ` ${tokens.join(" ")} `;

  return BLOCKED.filter((term) => {
    const parts = tokenise(term);
    if (parts.length === 0) return false;
    if (parts.length === 1) return single.has(parts[0]);
    return joined.includes(` ${parts.join(" ")} `);
  });
}

export function hasBlockedWords(text: string): boolean {
  return findBlockedWords(text).length > 0;
}
