## Fonts

This folder is for **self-hosted** font files.

### Junicode (Regular + Bold)
Junicode is bundled locally under `public/fonts/junicode/` (from the official release zip) and wired via `@font-face` in `app/globals.css`.

### SF Pro Display (Regular + Medium + Bold)
SF Pro Display is **Apple proprietary**. We can't legally download/commit it for you.

If you have the font files (you can obtain them from Apple under their license), place them here:

- `public/fonts/sf-pro-display/SFProDisplay-Regular.woff2`
- `public/fonts/sf-pro-display/SFProDisplay-Medium.woff2`
- `public/fonts/sf-pro-display/SFProDisplay-Bold.woff2`

Then we can enable the `next/font/local` loader in `app/fonts.ts` (currently commented out to avoid breaking builds when files are missing).


