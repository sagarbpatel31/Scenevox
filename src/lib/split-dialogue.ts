/** Keep every code point, including whitespace. Never split a word or surrogate pair. */
export function splitDialogue(text: string, limit = 500): string[] {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Invalid line limit.");
  const parts: string[] = [];
  let remaining = Array.from(text);
  while (remaining.length > limit) {
    let boundary = 0;
    for (let i = limit; i > 0; i--) {
      if (/\s/u.test(remaining[i - 1]) || /\s/u.test(remaining[i] ?? "")) {
        if (
          remaining.slice(0, i).join("").trim() &&
          remaining.slice(i).join("").trim()
        ) {
          boundary = i;
          break;
        }
      }
    }
    if (!boundary)
      throw new Error(
        "This line cannot be split without cutting a word. Add a space or sentence break, then try again.",
      );
    const window = remaining.slice(0, boundary).join("");
    // Prefer a nearby sentence ending, without moving or dropping punctuation.
    const endings = [...window.matchAll(/[.!?。！？][”’"']?\s+/gu)];
    const sentence = endings.at(-1);
    if (sentence) {
      const length = Array.from(
        window.slice(0, sentence.index! + sentence[0].length),
      ).length;
      if (length >= limit / 2) boundary = length;
    }
    parts.push(remaining.slice(0, boundary).join(""));
    remaining = remaining.slice(boundary);
  }
  if (!remaining.join("").trim())
    throw new Error(
      "Remove excess trailing whitespace before splitting this line.",
    );
  parts.push(remaining.join(""));
  return parts;
}
