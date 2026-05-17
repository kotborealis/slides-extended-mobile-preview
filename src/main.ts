import { ItemView, MarkdownRenderer, Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import {
  escapeHtml,
  extractSlideAttributes,
  extractSpeakerNotes,
  parseDeck,
  splitSlides,
} from "./deck";

const VIEW_TYPE = "slides-extended-mobile-preview";
const PLUGIN_ID = "slides-extended-mobile-preview";
const REVEAL_DIST = `.obsidian/plugins/${PLUGIN_ID}/assets/reveal`;

interface SlideMessage {
  index: number;
  label: string;
  total: number;
  type: "se-mobile-slide";
}

interface ErrorMessage {
  message: string;
  type: "se-mobile-error";
}

type PreviewMessage = ErrorMessage | SlideMessage;

interface ResourceAdapter {
  getResourcePath(path: string): string;
}

class MobileSlidesView extends ItemView {
  private counterEl!: HTMLDivElement;
  private file: TFile | null = null;
  private frameEl!: HTMLDivElement;
  private iframeEl!: HTMLIFrameElement;
  private nextButton!: HTMLButtonElement;
  private plugin: MobileSlidesPlugin;
  private prevButton!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: MobileSlidesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Reveal Preview";
  }

  getIcon(): string {
    return "presentation";
  }

  async onOpen(): Promise<void> {
    this.containerEl.addClass("se-mobile-preview-view");
    this.renderShell();
    this.registerDomEvent(window, "message", (event: MessageEvent<PreviewMessage>) => {
      if (event.data?.type === "se-mobile-slide") {
        this.counterEl.setText(event.data.label);
        this.prevButton.disabled = event.data.index <= 1;
        this.nextButton.disabled = event.data.index >= event.data.total;
      }
      if (event.data?.type === "se-mobile-error") {
        this.counterEl.setText("Error");
        new Notice(event.data.message);
      }
    });
  }

  async setFile(file: TFile): Promise<void> {
    this.file = file;
    await this.renderDeck();
  }

  async reloadIfCurrent(file: TFile): Promise<void> {
    if (this.file?.path === file.path) {
      await this.renderDeck();
    }
  }

  private renderShell(): void {
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

  private async renderDeck(): Promise<void> {
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
    const themeCss = this.resource(`${REVEAL_DIST}/theme/${deck.theme}.css`);
    const revealJs = this.resource(`${REVEAL_DIST}/reveal.js`);
    const notesJs = this.resource(`${REVEAL_DIST}/plugin/notes/notes.js`);

    this.iframeEl.srcdoc = buildRevealDocument({ revealCss, themeCss, revealJs, notesJs, sections });
    this.counterEl.setText("Loading");
    this.prevButton.disabled = false;
    this.nextButton.disabled = false;

    this.iframeEl.onload = () => {
      this.updateCounter();
    };
  }

  private async renderSections(groups: string[][], notesSeparator: string | null): Promise<string> {
    const renderedGroups: string[] = [];
    for (const group of groups) {
      const renderedSlides: string[] = [];
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

  private async renderSlideSection(markdown: string, notesSeparator: string | null): Promise<string> {
    const { attrs, markdown: cleanedMarkdown } = extractSlideAttributes(markdown);
    const { content, notes } = extractSpeakerNotes(cleanedMarkdown, notesSeparator);
    const sectionAttrs = this.resolveSectionAttributes(attrs);
    const html = await this.renderMarkdown(content);
    const notesHtml = notes ? `<aside class="notes">${await this.renderMarkdown(notes)}</aside>` : "";
    const attrText = Object.entries(sectionAttrs)
      .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
      .join(" ");
    return `<section${attrText ? ` ${attrText}` : ""}>${html}${notesHtml}</section>`;
  }

  private async renderMarkdown(markdown: string): Promise<string> {
    const el = document.createElement("div");
    el.addClass("markdown-preview-view", "markdown-rendered");
    await MarkdownRenderer.render(this.app, markdown.trim() || " ", el, this.file?.path ?? "", this);
    return el.innerHTML;
  }

  private resolveSectionAttributes(attrs: Record<string, string>): Record<string, string> {
    if (!attrs.bg) {
      return {};
    }

    const sectionAttrs: Record<string, string> = {};
    this.applyBackgroundAttribute(sectionAttrs, attrs.bg);
    return sectionAttrs;
  }

  private applyBackgroundAttribute(attrs: Record<string, string>, bg: string): void {
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

  private resolveBackgroundResource(bg: string): string | null {
    const wikilink = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/.exec(bg);
    const target = wikilink ? wikilink[1] : bg;
    const file = this.app.metadataCache.getFirstLinkpathDest(target, this.file?.path ?? "");
    return file ? this.app.vault.getResourcePath(file) : null;
  }

  private resource(path: string): string {
    return (this.app.vault.adapter as ResourceAdapter).getResourcePath(path);
  }

  private showEmpty(message: string): void {
    this.iframeEl.srcdoc = `<html><body style="font-family: sans-serif; padding: 1rem;">${escapeHtml(message)}</body></html>`;
    this.counterEl.setText("0 / 0");
    this.prevButton.disabled = true;
    this.nextButton.disabled = true;
  }

  private callReveal(method: "next" | "prev"): void {
    this.iframeEl.contentWindow?.postMessage({ type: "se-mobile-control", method }, "*");
  }

  private updateCounter(): void {
    const win = this.iframeEl.contentWindow as
      | (Window & {
          Reveal?: {
            getCurrentSlide(): Element;
            getIndices(): { h: number; v: number };
          };
        })
      | null;
    const reveal = win?.Reveal;
    if (!reveal) {
      return;
    }

    const doc = this.iframeEl.contentWindow?.document;
    const slides = Array.from(doc?.querySelectorAll(".slides section:not(.stack)") ?? []);
    const flatIndex = slides.indexOf(reveal.getCurrentSlide());
    const indices = reveal.getIndices();
    this.counterEl.setText(`${flatIndex + 1} / ${slides.length}`);
    this.prevButton.disabled = indices.h === 0 && indices.v === 0;
    this.nextButton.disabled = flatIndex === slides.length - 1;
  }
}

export default class MobileSlidesPlugin extends Plugin {
  async onload(): Promise<void> {
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

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  private getView(): MobileSlidesView | null {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof MobileSlidesView) {
        return leaf.view;
      }
    }
    return null;
  }

  private async openPreview(): Promise<void> {
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
    await (leaf.view as MobileSlidesView).setFile(file);
  }
}

function buildRevealDocument({
  revealCss,
  revealJs,
  notesJs,
  themeCss,
  sections,
}: {
  notesJs: string;
  revealCss: string;
  revealJs: string;
  sections: string;
  themeCss: string;
}): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="${revealCss}">
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
