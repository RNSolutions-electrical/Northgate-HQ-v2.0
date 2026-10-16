# Proposal letterhead assets

The logo is the unchanged PNG extracted from the company-provided letterhead reference on 2026-10-16. SHA-256: `b33dfd38a3066fe61507096bfe090bf69229180068ebd39eda42d3cb88cbc8d5`.

The reference uses Calibri body text and Arial Narrow footer text. This implementation does not redistribute those proprietary Microsoft fonts:

- `Carlito-Regular.ttf` and `Carlito-Bold.ttf` are unmodified SIL OFL fonts from https://github.com/googlefonts/carlito at commit `3a810cab78ebd6e2e4eed42af9e8453c4f9b850a`. Upstream describes Carlito as metric-compatible with Calibri. See `Carlito-OFL.txt`.
- `LiberationSans-Regular.ttf` is an unmodified SIL OFL font from the installed Debian `fonts-liberation` package. Upstream: https://github.com/liberationfonts/liberation-fonts. See `LiberationSans-LICENSE.txt`. The PDF footer horizontally scales this font to 78% to approximate the source's narrow sans-serif styling.

The PDF embeds full font programs and disables ligatures. Visual QA caught missing glyphs with fontkit subsetting and incorrect ligature advances with full-font default shaping. These options intentionally prioritize consistent, readable exported PDFs across PDF readers over smaller output size. Keep visual raster review in addition to text-extraction tests when changing fonts.

Assets are loaded from the application bundle, with no third-party font request at export time. No historical proposal amounts or customer content are included in these assets.
