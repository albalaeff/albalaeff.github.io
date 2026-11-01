# albalaeff.github.io

Personal site of **Aleksandr Balaev**, junior AI engineer based in Nitra, Slovakia.
Live at **https://albalaeff.eu** (the old address, albalaeff.github.io, redirects there).

The featured project is [Personal Exchange Bot](https://t.me/pfxybot), a peer-to-peer
currency exchange in Telegram, co-built with Claude Code agents.

## Stack

Plain HTML, CSS and a little JavaScript. No framework and no build step: GitHub Pages
serves the files as they are.

- Design follows Apple's Human Interface Guidelines for the web: system font (SF Pro on
  Apple devices, self-hosted Inter elsewhere), light and dark mode, 44 px touch targets,
  visible keyboard focus, `prefers-reduced-motion` respected.
- Photos are served as AVIF and WebP with JPEG fallback, with metadata stripped.
- No cookies, no trackers, no third-party requests.

## Structure

```
index.html                       Home page
work/personal-exchange-bot.html  Bot case study
404.html                         Not-found page (absolute paths on purpose)
assets/css/main.css              All styles
assets/js/main.js                Mobile menu and the chat demo
assets/img/                      Photos, certificate preview, link-preview image (og.jpg)
assets/docs/                     CV and certificate (PDF)
assets/fonts/                    Inter (Latin subset)
admin/                           Visual site editor (see below)
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Site editor (`/admin/`)

**https://albalaeff.eu/admin/** is a visual editor: the real page with every text
block editable in place, photos replaceable by clicking them. Saving commits the change
to `main` through the GitHub API, and Pages publishes it about a minute later.

- **Sign-in:** a fine-grained GitHub token limited to this repository with
  *Contents: Read and write*. The sign-in screen links to a pre-filled token form. The token
  stays in that browser's local storage; *Sign out* removes it.
- **What can be edited:** every piece of text in `index.html`, `work/personal-exchange-bot.html`
  and `404.html` (bold, italic, links, line breaks), photos and their `alt` text. Not editable
  here: the animated phone demo (its script lives in `assets/js/main.js`), `<head>` tags,
  layout and styles.
- **How saving works:** the editor finds each block's exact position in the HTML source
  (with [parse5](https://github.com/inikulin/parse5), bundled as `admin/parse5.js`) and
  replaces only that block, so a commit touches only the lines that changed. If the file
  changed on GitHub in the meantime, edits are moved onto the new version; if a block itself
  was changed by someone else, the editor refuses to save rather than overwrite it.
- **Replaced photos** are resized to 2000 px on the long side, saved as JPEG (PNG if
  transparent, metadata stripped) under `assets/img/`, and the `<picture>` keeps a single
  `<img>`, plus any `<source media="…">`: those show a photo of their own on other screens.
  Older photo files stay in the repo.
- **The phone portrait** (`assets/img/portrait-phone.*`, the home page on screens under
  880 px) is a `<source media>`, so the editor doesn't replace it: change the files and
  the three `<source>` lines in `index.html` by hand.
- Files: `admin/index.html`, `admin/admin.css`, `admin/admin.js` (UI and GitHub calls),
  `admin/core.js` (parsing and source edits, no DOM), `admin/parse5.js`. The folder is
  `noindex` and disallowed in `robots.txt`.

## Updating

- **CV:** `assets/docs/Aleksandr-Balaev-CV.pdf` (one page, A4, built from HTML with
  Chromium). Replace the file to update it, then bump the `?v=` on the CV links in
  `index.html` and `work/personal-exchange-bot.html` so browsers fetch the new copy.
- **After changing CSS or JS:** bump the `?v=` number in the `main.css` and `main.js` links
  of every page (`index.html`, `work/personal-exchange-bot.html`, `404.html`). GitHub Pages
  caches files for about 10 minutes, and the new number makes browsers load the fresh version.
- **GitHub Foundations:** after the exam, replace the “In preparation” card in
  `#certificates` with the badge and a verification link.
- **Domain:** `albalaeff.eu`, registered at Spaceship. The `CNAME` file tells GitHub Pages to
  serve the site there. DNS at Spaceship (Advanced DNS): four `A` records for `@`
  (185.199.108.153, .109.153, .110.153, .111.153), four `AAAA` records for `@`
  (2606:50c0:8000::153 … 2606:50c0:8003::153), `CNAME www → albalaeff.github.io`, and the
  `_github-pages-challenge-albalaeff` TXT record that verifies the domain for the GitHub account.
  Absolute URLs (canonical, `og:` tags, JSON-LD, `sitemap.xml`, `robots.txt`) use
  `https://albalaeff.eu`.
