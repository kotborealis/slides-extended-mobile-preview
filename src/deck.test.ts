import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSlideAttributes, extractSpeakerNotes, parseDeck, splitSlides } from "./deck.js";

describe("parseDeck", () => {
  it("extracts theme and notesSeparator from frontmatter", () => {
    assert.deepEqual(
      parseDeck(`---
theme: night
notesSeparator: presenter:
---
# Slide`),
      { markdown: "# Slide", theme: "night", notesSeparator: "presenter:" },
    );
  });

  it("uses defaults when frontmatter is absent", () => {
    assert.deepEqual(parseDeck("# Slide"), { markdown: "# Slide", theme: "black", notesSeparator: null });
  });
});

describe("splitSlides", () => {
  it("splits horizontal and vertical slides", () => {
    assert.deepEqual(splitSlides("a\n\n---\n\nb\n\n--\n\nc"), [["a"], ["b", "c"]]);
  });
});

describe("extractSpeakerNotes", () => {
  it("extracts notes: by default", () => {
    assert.deepEqual(extractSpeakerNotes("Visible\n\nnotes:\nHidden", null), {
      content: "Visible",
      notes: "Hidden",
    });
  });

  it("does not extract note: by default", () => {
    assert.equal(extractSpeakerNotes("Visible\n\nnote:\nStill visible", null).notes, "");
  });

  it("uses a custom separator", () => {
    assert.deepEqual(extractSpeakerNotes("Visible\n\npresenter:\nHidden", "presenter:"), {
      content: "Visible",
      notes: "Hidden",
    });
  });
});

describe("extractSlideAttributes", () => {
  it("extracts slide background comments", () => {
    assert.deepEqual(extractSlideAttributes('<!-- slide bg="[[image.png]]" -->\n# Slide'), {
      attrs: { bg: "[[image.png]]" },
      markdown: "# Slide",
    });
  });
});
