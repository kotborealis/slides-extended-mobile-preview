const { ItemView, MarkdownRenderer, Notice, Plugin, TFile } = require("obsidian");

const VIEW_TYPE = "slides-extended-mobile-preview";
const REVEAL_DIST = ".obsidian/plugins/slides-extended/dist";
const SLIDES_EXTENDED_CSS = ".obsidian/plugins/slides-extended/css/slides-extended.css";

class MobileSlidesView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "Reveal Preview";
  }

  getIcon() {
    return "presentation";
  }

  async onOpen() {
    this.containerEl.addClass("se-mobile-preview-view");
    this.renderShell();
    this.registerDomEvent(window, "message", (event) => {
      if (event.data && event.data.type === "se-mobile-slide") {
        this.counterEl.setText(event.data.label);
        this.prevButton.disabled = event.data.index <= 1;
        this.nextButton.disabled = event.data.index >= event.data.total;
      }
      if (event.data && event.data.type === "se-mobile-error") {
        this.counterEl.setText("Error");
        new Notice(event.data.message);
      }
    });
  }

  async setFile(file) {
    this.file = file;
    await this.renderDeck();
  }

  async reloadIfCurrent(file) {
    if (this.file && file.path === this.file.path) {
      await this.renderDeck();
    }
  }

  renderShell() {
    this.containerEl.empty();
    this.frameEl = this.containerEl.createDiv("se-mobile-frame");
    this.iframeEl = this.frameEl.createEl("iframe", {
      attr: {
        sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
        title: "Reveal.js mobile preview",
      },
    });

    const controls = this.containerEl.createDiv("se-mobile-controls");
    this.prevButton = controls.createEl("button", { text: "Prev" });
    this.counterEl = controls.createDiv("se-mobile-counter");
    this.nextButton = controls.createEl("button", { text: "Next" });

    this.prevButton.addEventListener("click", () => this.callReveal("prev"));
    this.nextButton.addEventListener("click", () => this.callReveal("next"));
  }

  async renderDeck() {
    if (!this.file) {
      this.showEmpty("Open a Markdown note first.");
      return;
    }

    const source = await this.app.vault.read(this.file);
    const deck = parseDeck(source);
    const groups = splitSlides(deck.markdown);
    if (!groups.length) {
      this.showEmpty("No slides found.");
      return;
    }

    const sections = await this.renderSections(groups, deck.notesSeparator);
    const revealCss = this.resource(`${REVEAL_DIST}/reveal.css`);
    const slidesExtendedCss = this.resource(SLIDES_EXTENDED_CSS);
    const themeCss = this.resource(`${REVEAL_DIST}/theme/${deck.theme}.css`);
    const revealJs = this.resource(`${REVEAL_DIST}/reveal.js`);
    const notesJs = this.resource(".obsidian/plugins/slides-extended/plugin/notes/notes.js");

    this.iframeEl.srcdoc = buildRevealDocument({ revealCss, slidesExtendedCss, themeCss, revealJs, notesJs, sections });
    this.counterEl.setText("Loading");
    this.prevButton.disabled = false;
    this.nextButton.disabled = false;

    this.iframeEl.onload = () => {
      this.updateCounter();
    };
  }

  async renderSections(groups, notesSeparator) {
    const renderedGroups = [];
    for (const group of groups) {
      const renderedSlides = [];
      for (const slide of group) {
        renderedSlides.push(await this.renderSlideSection(slide, notesSeparator));
      }
      if (renderedSlides.length === 1) {
        renderedGroups.push(renderedSlides[0]);
      } else {
        renderedGroups.push(`<section>${renderedSlides.join("\n")}</section>`);
      }
    }
    return renderedGroups.join("\n");
  }

  async renderSlideSection(markdown, notesSeparator) {
    const { attrs, markdown: cleanedMarkdown } = this.extractSlideAttributes(markdown);
    const { content, notes } = this.extractSpeakerNotes(cleanedMarkdown, notesSeparator);
    const html = await this.renderMarkdown(content);
    const notesHtml = notes ? `<aside class="notes">${await this.renderMarkdown(notes)}</aside>` : "";
    const attrText = Object.entries(attrs)
      .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
      .join(" ");
    return `<section${attrText ? ` ${attrText}` : ""}>${html}${notesHtml}</section>`;
  }

  async renderMarkdown(markdown) {
    const el = document.createElement("div");
    el.addClass("markdown-preview-view", "markdown-rendered");
    await MarkdownRenderer.render(this.app, markdown.trim() || " ", el, this.file.path, this);
    return el.innerHTML;
  }

  extractSlideAttributes(markdown) {
    const attrs = {};
    let cleanedMarkdown = markdown;
    const slideComment = /<!--\s*slide\s+([\s\S]*?)-->/i.exec(markdown);
    if (!slideComment) {
      return { attrs, markdown: cleanedMarkdown };
    }

    const rawAttrs = slideComment[1];
    const bg = /\bbg\s*=\s*"([^"]+)"/i.exec(rawAttrs)?.[1] || /\bbg\s*=\s*'([^']+)'/i.exec(rawAttrs)?.[1];
    if (bg) {
      this.applyBackgroundAttribute(attrs, bg.trim());
    }

    cleanedMarkdown = cleanedMarkdown.replace(slideComment[0], "").trim();
    return { attrs, markdown: cleanedMarkdown };
  }

  extractSpeakerNotes(markdown, notesSeparator) {
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

  applyBackgroundAttribute(attrs, bg) {
    const resource = this.resolveBackgroundResource(bg);
    if (resource) {
      attrs["data-background-image"] = resource;
      return;
    }

    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(bg) || /^https?:\/\//i.test(bg)) {
      attrs["data-background-image"] = bg;
      return;
    }

    attrs["data-background-color"] = bg;
  }

  resolveBackgroundResource(bg) {
    const wikilink = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(bg);
    const target = wikilink ? wikilink[1] : bg;
    const file = this.app.metadataCache.getFirstLinkpathDest(target, this.file.path);
    return file ? this.app.vault.getResourcePath(file) : null;
  }

  resource(path) {
    return this.app.vault.adapter.getResourcePath(path);
  }

  showEmpty(message) {
    this.iframeEl.srcdoc = `<html><body style="font-family: sans-serif; padding: 1rem;">${escapeHtml(message)}</body></html>`;
    this.counterEl.setText("0 / 0");
    this.prevButton.disabled = true;
    this.nextButton.disabled = true;
  }

  callReveal(method) {
    const win = this.iframeEl.contentWindow;
    if (win) {
      win.postMessage({ type: "se-mobile-control", method }, "*");
    }
  }

  updateCounter() {
    const reveal = this.iframeEl.contentWindow?.Reveal;
    if (!reveal || typeof reveal.getIndices !== "function") {
      return;
    }
    const indices = reveal.getIndices();
    const total = this.iframeEl.contentWindow?.document.querySelectorAll(".slides section:not(.stack)").length || 0;
    const flatIndex = Array.from(this.iframeEl.contentWindow.document.querySelectorAll(".slides section:not(.stack)")).indexOf(reveal.getCurrentSlide());
    this.counterEl.setText(`${flatIndex + 1} / ${total}`);
    this.prevButton.disabled = indices.h === 0 && indices.v === 0;
    this.nextButton.disabled = flatIndex === total - 1;
  }
}

module.exports = class MobileSlidesPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new MobileSlidesView(leaf, this));

    this.addRibbonIcon("presentation", "Show Reveal mobile preview", () => this.openPreview());
    this.addCommand({
      id: "show-mobile-reveal-preview",
      name: "Show Reveal mobile preview",
      callback: () => this.openPreview(),
    });

    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!(file instanceof TFile)) {
          return;
        }
        const view = this.getView();
        if (view) {
          await view.reloadIfCurrent(file);
        }
      }),
    );
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  getView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof MobileSlidesView) {
        return leaf.view;
      }
    }
    return null;
  }

  async openPreview() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a Markdown note first.");
      return;
    }

    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }

    await this.app.workspace.revealLeaf(leaf);
    await leaf.view.setFile(file);
  }
};

function parseDeck(source) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(source);
  if (!match) {
    return { markdown: source.trim(), theme: "black", notesSeparator: null };
  }

  const frontmatter = match[1];
  const theme = /^theme:\s*["']?([^"'\n]+)["']?\s*$/im.exec(frontmatter)?.[1]?.trim() || "black";
  const notesSeparator = /^notesSeparator:\s*["']?([^"'\n]+)["']?\s*$/im.exec(frontmatter)?.[1]?.trim() || null;
  return {
    markdown: source.slice(match[0].length).trim(),
    theme: theme.replace(/\.css$/i, ""),
    notesSeparator,
  };
}

function splitSlides(markdown) {
  return markdown
    .split(/\n\s*---\s*\n/g)
    .map((group) => group.split(/\n\s*--\s*\n/g).map((slide) => slide.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

function buildRevealDocument({ revealCss, slidesExtendedCss, themeCss, revealJs, notesJs, sections }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="${revealCss}">
  <link rel="stylesheet" href="${slidesExtendedCss}">
  <link rel="stylesheet" href="${themeCss}" id="theme">
  <style>
    html, body { margin: 0; height: 100%; background: #111; }
    .reveal { height: 100%; }
    .reveal .slides { text-align: center; }
    .reveal .slides section { box-sizing: border-box; overflow-wrap: anywhere; }
    .reveal h1, .reveal h2, .reveal h3 { line-height: 1.05; }
    .reveal img { max-height: 62vh; object-fit: contain; }
    .reveal pre { width: 100%; }
    .reveal code { white-space: pre-wrap; }
    .reveal table { font-size: 0.7em; }
    .reveal .internal-link { color: #8ab4ff; }
    .reveal .task-list-item-checkbox { transform: scale(1.4); }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
${sections}
    </div>
  </div>
  <script src="${revealJs}"></script>
  <script src="${notesJs}"></script>
  <script>
    const deck = new Reveal({
      controls: true,
      progress: true,
      center: true,
      hash: false,
      history: false,
      embedded: true,
      touch: true,
      overview: true,
      transition: 'slide',
      width: 960,
      height: 540,
      margin: 0.05,
      minScale: 0.1,
      maxScale: 2.0,
      plugins: window.RevealNotes ? [window.RevealNotes] : []
    });
    function notify() {
      const slides = Array.from(document.querySelectorAll('.slides section:not(.stack)'));
      const index = slides.indexOf(deck.getCurrentSlide()) + 1;
      parent.postMessage({ type: 'se-mobile-slide', index, total: slides.length, label: index + ' / ' + slides.length }, '*');
    }
    deck.on('ready', notify);
    deck.on('slidechanged', notify);
    window.addEventListener('message', function(event) {
      if (!event.data || event.data.type !== 'se-mobile-control') return;
      if (event.data.method === 'next') deck.next();
      if (event.data.method === 'prev') deck.prev();
      requestAnimationFrame(notify);
    });
    deck.initialize().then(notify);
    window.Reveal = deck;
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
