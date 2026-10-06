import EmailReplyParser from "email-reply-parser";

// Lines that start the quoted part of a reply in common mail apps/languages,
// in case the parser misses them.
const CUT_MARKERS = [
  /^On .+ wrote:\s*$/im,
  /^Le .+ a écrit\s*:\s*$/im,
  /^El .+ escribió:\s*$/im,
  /^Am .+ schrieb .+:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Message d'origine\s*-{2,}/im,
  /^-{5,}\s*Forwarded message/im,
  /^From:\s.+$/im,
  /^De\s?:\s.+$/im,
  /^Sent from my (iPhone|iPad|Android|mobile)/im,
  /^Envoyé de mon (iPhone|iPad)/im,
];

/** Returns only the new text of an email reply, without quoted history or signature delimiters. */
export function stripQuoted(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  let visible = new EmailReplyParser().parseReply(normalized);
  // Gmail often wraps "On … wrote:" over two lines; join before matching.
  const joined = visible.replace(/\n(?=[^\n]*wrote:\s*$)/m, " ");
  let cut = joined.length;
  for (const re of CUT_MARKERS) {
    const m = re.exec(joined);
    if (m && m.index < cut) cut = m.index;
  }
  visible = joined.slice(0, cut);
  // Drop any remaining ">" quoted lines.
  visible = visible
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
  return visible.replace(/\n{3,}/g, "\n\n").trim();
}
