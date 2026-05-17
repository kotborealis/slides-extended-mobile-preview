export interface ParsedDeck {
  markdown: string;
  notesSeparator: string | null;
  theme: string;
}

export interface SlideAttributesResult {
  attrs: Record<string, string>;
  markdown: string;
}

export interface SpeakerNotesResult {
  content: string;
  notes: string;
}

export function parseDeck(source: string): ParsedDeck {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(source);
  if (!match) {
    return { markdown: source.trim(), theme: "black", notesSeparator: null };
  }

  const frontmatter = match[1];
  const theme = /^theme:\s*["']?([^"'\n]+)["']?\s*$/im.exec(frontmatter)?.[1]?.trim() ?? "black";
  const notesSeparator =
    /^notesSeparator:\s*["']?([^"'\n]+)["']?\s*$/im.exec(frontmatter)?.[1]?.trim() ?? null;

  return {
    markdown: source.slice(match[0].length).trim(),
    notesSeparator,
    theme: theme.replace(/\.css$/i, ""),
  };
}

export function splitSlides(markdown: string): string[][] {
  return markdown
    .split(/\n\s*---\s*\n/g)
    .map((group) => group.split(/\n\s*--\s*\n/g).map((slide) => slide.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

export function extractSlideAttributes(markdown: string): SlideAttributesResult {
  const attrs: Record<string, string> = {};
  let cleanedMarkdown = markdown;
  const slideComment = /<!--\s*slide\s+([\s\S]*?)-->/i.exec(markdown);
  if (!slideComment) {
    return { attrs, markdown: cleanedMarkdown };
  }

  const rawAttrs = slideComment[1];
  const bg = /\bbg\s*=\s*"([^"]+)"/i.exec(rawAttrs)?.[1] ?? /\bbg\s*=\s*'([^']+)'/i.exec(rawAttrs)?.[1];
  if (bg) {
    attrs.bg = bg.trim();
  }

  cleanedMarkdown = cleanedMarkdown.replace(slideComment[0], "").trim();
  return { attrs, markdown: cleanedMarkdown };
}

export function extractSpeakerNotes(markdown: string, notesSeparator: string | null): SpeakerNotesResult {
  const separatorPattern = notesSeparator ? escapeRegExp(notesSeparator) : "notes:";
  const notesRegex = new RegExp(`(?:^|\\n)\\s*${separatorPattern}\\s*\\n?`, "i");
  const match = notesRegex.exec(markdown);
  if (!match) {
    return { content: markdown, notes: "" };
  }

  const noteStart = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const content = markdown.slice(0, noteStart).trim();
  const notes = markdown.slice(match.index + match[0].length).trim();
  return { content, notes };
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
