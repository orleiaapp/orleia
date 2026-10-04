"use client";

/**
 * The action marker the model emits to request an action - plus the common
 * misspellings/formatting variants it drifts into (missing X, a space, a
 * hyphen, no separator). Every detection site uses these so a typo'd marker
 * can NEVER leak raw JSON into the chat: if the model can't write the exact
 * token, we still catch the shape of it and run it in the background.
 */
export const ACTION_MARKER_VARIANTS = [
  "orleia_action",
  "levis_action",
  "orleia action",
  "orleia-action",
  "orleiaaction",
] as const;

/** Matches any marker variant (case-insensitive). Non-global - safe for .test/.search. */
export const ACTION_MARKER_RE = /\b(?:orleia|levis)[-_ ]?action\b/i;

/** Matches a complete action block: fuzzy marker + optional colon + JSON. */
export const ACTION_BLOCK_RE =
  /\b(?:orleia|levis)[-_ ]?action\s*:?\s*(\{(?:[^{}]|\{[^{}]*\})*\})/gi;

/**
 * Final safety net: strips any action marker and whatever follows it
 * (complete JSON or a truncated remnant) so raw action JSON can never reach
 * the chat UI. Returns the cleaned text (possibly "").
 */
export function stripActionRemnants(text: string): string {
  if (!text) return "";
  let out = text;
  // Complete but unexecuted blocks (paranoia - normally handled earlier).
  out = out.replace(ACTION_BLOCK_RE, "");
  // If a marker still remains, the block after it is truncated/malformed -
  // drop from the marker to the end of the text. Safe: per the tool contract
  // an action block is always the final thing the model emits, so any
  // user-visible prose sits BEFORE the marker and is preserved.
  const idx = out.search(ACTION_MARKER_RE);
  if (idx >= 0) out = out.slice(0, idx);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================
// Pet flavor-text emotes ("Blob waves a tiny paw.", "Ears perk up at
// the mention of friends").
//
// The model likes to narrate cute pet actions before/instead of
// answering. Product decision: never show them - in new replies AND
// in old stored ones, so every variant (any pet name, any verb, any
// tense) is filtered at the one place both chat surfaces render from.
// ============================================================

/** Subject: a Capitalized noun phrase (a pet/agent name, or "Ears", "Tail"...). */
const FLAVOR_SUBJ =
  String.raw`(?:[A-Z][\w'’-]*(?:\s+(?:the\s+)?[a-z][\w'’-]*){0,3}|Ears|Tail|Whiskers|Paws|Eyes|Nose|Head|Fur)`;

/** Motion/emote verbs pets get narrated with, plus common inflections. */
const FLAVOR_VERB =
  String.raw`(?:wav|perk|wag|bounc|tilt|nod|chatter|purr|squeak|chirp|nuzzl|pounc|stretch|yawn|blink|sniff|wriggl|squirm|leap|hop|spin|beam|grin|giggl|clap|zoom|glanc|dart|wiggl|swish|flick|twitch|droop|twirl|snuggl|cuddl|scamper|scuttl|paddl|bob|perk)(?:s|es|ed|ing)?`;

/** Line starts with a third-person action beat (never first person). */
const FLAVOR_START_RE = new RegExp(
  String.raw`^(?!\s*(?:I|We|You|He|She|It|They)\b)[>*_\-•\s]*${FLAVOR_SUBJ}\s+${FLAVOR_VERB}\b`,
  ""
);

/** The same beat, extended to a full sentence (so we can drop just that). */
const FLAVOR_SENTENCE_RE = new RegExp(
  String.raw`^\s*[>*_\-•\s]*${FLAVOR_SUBJ}\s+${FLAVOR_VERB}[^.!?\n]*[.!?]\s*`,
  ""
);

/**
 * A bare italic/dashed emote line: "*perks up*", "_tail wagging_".
 * Lines wrapped in **double asterisks** are markdown bold (rendered with
 * real weight in bubbles), never flavor - so they are left alone.
 */
const FLAVOR_EMOTE_LINE_RE = /^\s*(?!\*\*)[>*_\-]+\s*[^*\n]{1,60}\s*[*_\-]+\s*$/;

/** Remove pet action-beat lines from a reply. Returns "" for pure flavor. */
export function stripPetFlavor(text: string): string {
  if (!text) return text;
  const lines = text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (FLAVOR_EMOTE_LINE_RE.test(trimmed)) return "";
    if (!FLAVOR_START_RE.test(line)) return line;
    // Full sentence beat -> drop just it and keep any real prose after it.
    const rest = line.replace(FLAVOR_SENTENCE_RE, "");
    if (rest !== line && rest.trim()) return rest.trimEnd();
    // Beat with no terminator (or nothing left) -> drop the whole line.
    return "";
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Cleans leaked action JSON and pet flavor emotes out of a stored reply
 * (used when loading conversations - including ones saved before these
 * filters existed). Only rewrites the string when something actually needs
 * cleaning, so loading a conversation never rewrites healthy messages.
 */
export function sanitizeStoredReply(text: string): string {
  if (!text) return text;
  let out = text;
  if (ACTION_MARKER_RE.test(out)) out = stripActionRemnants(out);
  const flavor = stripPetFlavor(out);
  return flavor !== out ? flavor : out;
}
