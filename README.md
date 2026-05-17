# Slides Extended Mobile Preview

Standalone Reveal.js preview for Markdown slide decks in Obsidian Mobile.

This plugin is a mobile-oriented preview companion inspired by Slides Extended. It renders the active Markdown note through Obsidian's Markdown renderer, places the result into a Reveal.js deck, and shows it inside an Obsidian view.

## Features

- Bundled Reveal.js runtime and themes.
- Horizontal slides with `---`.
- Vertical slides with `--`.
- Frontmatter `theme` support for bundled Reveal themes.
- Speaker notes with `notes:` by default.
- Custom `notesSeparator` frontmatter option.
- Slide backgrounds with `<!-- slide bg="..." -->`.
- Obsidian wikilink image backgrounds, for example `<!-- slide bg="[[image.png]]" -->`.
- Touch navigation and bottom `Prev` / `Next` controls.

## Installation

### BRAT

Add this repository to BRAT:

```text
kotborealis/slides-extended-mobile-preview
```

Then enable `Slides Extended Mobile Preview` in Obsidian community plugins.

### Manual

Copy these files and folders into `.obsidian/plugins/slides-extended-mobile-preview/`:

- `manifest.json`
- `main.js`
- `styles.css`
- `assets/`

Reload Obsidian and enable the plugin.

## Usage

Open a Markdown slide deck and run `Show Reveal mobile preview` from the command palette.

```md
# Title

---

## Slide

- Item
- Item

notes:
Presenter-only notes.

---

<!-- slide bg="[[background.png]]" -->

## Background Slide
```

## Supported Frontmatter

```yaml
---
theme: black
notesSeparator: notes:
---
```

`theme` should match a bundled Reveal theme name, such as `black`, `white`, `league`, `beige`, `sky`, `night`, `serif`, `simple`, `solarized`, `blood`, or `moon`.

## Limitations

This is not a full port of Slides Extended.

- No local preview server.
- No PDF/HTML export.
- No templates.
- No chalkboard/custom controls/menu plugin integration yet.
- No full Slides Extended annotation parser yet.

## Development

```sh
npm install
npm run build
npm run check
```

Build output is committed intentionally so BRAT and manual installation can load the plugin directly.
