# Development Notes

## Release Process

### Version Sync
- Plugin version in `manifest.json` MUST match Git tag (e.g., v0.6.7)
- Update both `package.json` and `manifest.json` before tagging

### Release Workflow
1. Make changes, update version in both files
2. Commit and push to master
3. Create Git tag: `git tag v0.6.7 && git push origin v0.6.7`
4. Release workflow automatically runs and creates GitHub release with:
   - manifest.json
   - main.js (bundled with all Reveal.js assets inline)
   - styles.css

### CI Checks
- lint
- typecheck
- test
- build

### Branch Protection
- master requires all CI checks to pass
- No required reviews (single maintainer)

## Bundle Strategy

All Reveal.js assets are bundled inline in main.js using esbuild `--define`:
- REVEAL_CSS - main reveal.js CSS
- REVEAL_JS - main reveal.js JS
- NOTES_JS - notes plugin
- THEMES - object with all theme CSS (black, white, league, etc.)

This allows the plugin to work without any external assets - perfect for Obsidian Mobile distribution via BRAT.

## Local Development

### Build
```bash
npm run build
```

### Install to Vault
```bash
cp main.js manifest.json styles.css ~/.obsidian/plugins/slides-extended-mobile-preview/
```

### Test
```bash
npm run check  # lint + typecheck + test + build
```