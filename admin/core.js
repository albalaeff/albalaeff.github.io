/* Site editor core: finds editable text and photos in a page's HTML source
   and writes edits back into that source without touching anything else.
   Pure functions, no DOM access, so they run in the browser and in Node tests. */
import { parse } from "./parse5.js";

/* Elements that may sit inside an editable text block. */
const INLINE = new Set([
  "a", "abbr", "b", "br", "cite", "code", "em", "i", "kbd", "mark", "q", "s",
  "small", "span", "strong", "sub", "sup", "time", "u", "wbr",
]);

/* Subtrees the editor never touches. */
const SKIP = new Set([
  "head", "script", "style", "svg", "template", "noscript", "iframe",
  "video", "audio", "canvas", "select", "textarea", "input", "math",
]);

const isElement = (n) => n && typeof n.tagName === "string";
const attr = (el, name) => el.attrs.find((a) => a.name === name);

const hasDirectText = (el) =>
  el.childNodes.some((c) => c.nodeName === "#text" && /\S/.test(c.value));

const inlineOnly = (el) =>
  el.childNodes.every((c) => !isElement(c) || (INLINE.has(c.tagName) && inlineOnly(c)));

/* Whitespace at the start of the line where `offset` sits (used to keep indentation). */
const lineIndent = (src, offset) => {
  const lineStart = src.lastIndexOf("\n", offset - 1) + 1;
  const m = /^[ \t]*/.exec(src.slice(lineStart, offset));
  return m ? m[0] : "";
};

/**
 * Parses a page and lists what can be edited.
 * texts:  [{ id, tag, inner:[a,b], outer:[a,b], startTagEnd, href }]
 * images: [{ id, attrs, tag:[a,b], outer:[a,b], picture }]
 * All ranges are string offsets into `src`.
 */
export function analyze(src) {
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const texts = [];
  const images = [];
  let head = null;

  const walk = (node) => {
    if (isElement(node)) {
      const tag = node.tagName;
      if (tag === "head") head = node;
      if (SKIP.has(tag)) return;
      if (attr(node, "data-demo")) return; // replaced by the animated demo in main.js
      const loc = node.sourceCodeLocation;
      if (!loc) return; // created by the parser, not present in the source

      if (tag === "img") {
        const parent = node.parentNode;
        const picture = isElement(parent) && parent.tagName === "picture" && parent.sourceCodeLocation?.endTag
          ? {
              inner: [parent.sourceCodeLocation.startTag.endOffset, parent.sourceCodeLocation.endTag.startOffset],
              outer: [parent.sourceCodeLocation.startOffset, parent.sourceCodeLocation.endOffset],
              indent: lineIndent(src, parent.sourceCodeLocation.startOffset),
              // <source media> shows another photo on other screens (the phone portrait): kept as written.
              keep: parent.childNodes
                .filter((c) => isElement(c) && c.tagName === "source" && attr(c, "media") && c.sourceCodeLocation)
                .map((c) => src.slice(c.sourceCodeLocation.startOffset, c.sourceCodeLocation.endOffset)),
            }
          : null;
        images.push({
          id: images.length,
          attrs: node.attrs.map((a) => ({ name: a.name, value: a.value })),
          tag: [loc.startOffset, loc.endOffset],
          outer: picture ? picture.outer : [loc.startOffset, loc.endOffset],
          picture,
        });
        return;
      }

      if (loc.startTag && loc.endTag && hasDirectText(node) && inlineOnly(node)) {
        const href = tag === "a" && attr(node, "href") && loc.attrs?.href
          ? { range: [loc.attrs.href.startOffset, loc.attrs.href.endOffset], value: attr(node, "href").value }
          : null;
        texts.push({
          id: texts.length,
          tag,
          inner: [loc.startTag.endOffset, loc.endTag.startOffset],
          outer: [loc.startOffset, loc.endOffset],
          startTagEnd: loc.startTag.endOffset,
          href,
        });
        return; // the whole block is one editable unit
      }
    }
    const children = node.tagName === "template" ? [] : node.childNodes || [];
    for (const child of children) walk(child);
  };
  walk(doc);

  const headStart = head?.sourceCodeLocation?.startTag ? head.sourceCodeLocation.startTag.endOffset : null;
  const headEnd = head?.sourceCodeLocation?.endTag ? head.sourceCodeLocation.endTag.startOffset : null;
  return { texts, images, headStart, headEnd };
}

/** Applies [{ range:[a,b], text }] to src. Ranges must not overlap. */
export function applyEdits(src, edits) {
  const sorted = [...edits].sort((x, y) => y.range[0] - x.range[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].range[1] > sorted[i - 1].range[0]) throw new Error("Overlapping edits");
  }
  let out = src;
  for (const e of sorted) out = out.slice(0, e.range[0]) + e.text + out.slice(e.range[1]);
  return out;
}

/**
 * Builds the HTML shown in the editor's preview: the page itself plus
 * markers on editable elements, a <base> for assets and the editor's styles.
 */
export function buildPreview(src, analysis, { baseHref, headExtra = "" }) {
  const inserts = [];
  for (const t of analysis.texts) {
    inserts.push({ range: [t.startTagEnd - 1, t.startTagEnd - 1], text: ` data-cms="${t.id}"` });
  }
  for (const im of analysis.images) {
    const end = im.tag[1];
    const at = src.slice(end - 2, end) === "/>" ? end - 2 : end - 1;
    inserts.push({ range: [at, at], text: ` data-cms-img="${im.id}"` });
  }
  if (analysis.headStart != null) {
    inserts.push({ range: [analysis.headStart, analysis.headStart], text: `\n<base href="${escapeAttr(baseHref)}">` });
  }
  if (analysis.headEnd != null) {
    inserts.push({ range: [analysis.headEnd, analysis.headEnd], text: headExtra });
  }
  return applyEdits(src, inserts);
}

export function escapeAttr(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Serialises an <img> tag from an ordered attribute list. */
export function imgTag(attrs) {
  const parts = attrs.map((a) => (a.value === "" && a.name !== "alt" ? a.name : `${a.name}="${escapeAttr(a.value)}"`));
  return `<img ${parts.join(" ")}>`;
}

/** Returns attrs with the given values set (keeping order) and the listed names removed. */
export function withAttrs(attrs, set = {}, remove = []) {
  const out = attrs.filter((a) => !remove.includes(a.name)).map((a) => ({ ...a }));
  for (const [name, value] of Object.entries(set)) {
    const found = out.find((a) => a.name === name);
    if (found) found.value = String(value);
    else out.push({ name, value: String(value) });
  }
  return out;
}

/**
 * Turns the editor's changes into source edits.
 * changes = {
 *   texts:  Map(id -> newInnerHtml),
 *   hrefs:  Map(id -> newHref),
 *   images: Map(id -> { src?, width?, height?, alt? })
 * }
 * Every edit carries an `anchor` (the owning element's outer range) for rebasing.
 */
export function buildEdits(src, analysis, changes) {
  const edits = [];
  for (const [id, html] of changes.texts || []) {
    const t = analysis.texts[id];
    edits.push({ range: t.inner, text: html, anchor: t.outer, kind: "text", id });
  }
  for (const [id, href] of changes.hrefs || []) {
    const t = analysis.texts[id];
    if (!t.href) continue;
    edits.push({ range: t.href.range, text: `href="${escapeAttr(href)}"`, anchor: t.outer, kind: "href", id });
  }
  for (const [id, ch] of changes.images || []) {
    const im = analysis.images[id];
    if (ch.src) {
      const set = { src: ch.src };
      if (ch.width) set.width = ch.width;
      if (ch.height) set.height = ch.height;
      if (ch.alt != null) set.alt = ch.alt;
      const tag = imgTag(withAttrs(im.attrs, set, ["srcset", "sizes"]));
      if (im.picture) {
        // Drop the AVIF/WebP <source> elements: they point at the old photo.
        // Those with a media query belong to other screens and stay.
        const ind = im.picture.indent;
        const lines = [...im.picture.keep, tag].map((t) => `\n${ind}  ${t}`).join("");
        edits.push({ range: im.picture.inner, text: `${lines}\n${ind}`, anchor: im.outer, kind: "image", id });
      } else {
        edits.push({ range: im.tag, text: tag, anchor: im.outer, kind: "image", id });
      }
    } else if (ch.alt != null) {
      edits.push({ range: im.tag, text: imgTag(withAttrs(im.attrs, { alt: ch.alt })), anchor: im.outer, kind: "alt", id });
    }
  }
  return edits;
}

const occurrences = (hay, needle) => {
  const found = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    found.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return found;
};

/**
 * Moves edits made against `oldSrc` onto `newSrc` (the file changed on GitHub
 * since the editor loaded it). Each edit is located through its element's
 * original source, which must appear exactly once in the new file.
 * Returns { edits, failed }.
 */
export function rebaseEdits(oldSrc, newSrc, edits) {
  const out = [];
  const failed = [];
  for (const e of edits) {
    let delta = null;
    for (const pad of [0, 200, 600]) {
      const from = Math.max(0, e.anchor[0] - pad);
      const needle = oldSrc.slice(from, e.anchor[1]);
      const hits = occurrences(newSrc, needle);
      if (hits.length === 1) {
        delta = hits[0] - from;
        break;
      }
      if (hits.length === 0) break; // the element itself changed: give up
    }
    if (delta === null || newSrc.slice(e.range[0] + delta, e.range[1] + delta) !== oldSrc.slice(e.range[0], e.range[1])) {
      failed.push(e);
      continue;
    }
    out.push({ ...e, range: [e.range[0] + delta, e.range[1] + delta], anchor: [e.anchor[0] + delta, e.anchor[1] + delta] });
  }
  return { edits: out, failed };
}

/* UTF-8 safe base64 helpers for the GitHub contents API. */
export function utf8ToBase64(str) {
  return bytesToBase64(new TextEncoder().encode(str));
}

export function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
