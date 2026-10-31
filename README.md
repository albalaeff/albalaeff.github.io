# albalaeff.github.io

Personal site of **Aleksandr Balaev**, junior AI engineer based in Nitra, Slovakia.
Live at **https://albalaeff.github.io**.

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
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Updating

- **CV:** `assets/docs/Aleksandr-Balaev-CV.pdf` (one page, A4). Replace the file to update
  it; the links on the site stay the same.
- **GitHub Foundations:** after the exam, replace the “In preparation” card in
  `#certificates` with the badge and a verification link.
- **Own domain:** add a `CNAME` file with the domain, then update the absolute URLs in
  `<link rel="canonical">`, the `og:` tags, `sitemap.xml` and `robots.txt`.
