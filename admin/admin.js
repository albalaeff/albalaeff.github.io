/* Site editor: edit text and photos on the real page, save as a commit to GitHub. */
import {
  analyze, buildPreview, buildEdits, applyEdits, rebaseEdits,
  utf8ToBase64, bytesToBase64, base64ToUtf8,
} from "./core.js";

const REPO = { owner: "albalaeff", name: "albalaeff.github.io", branch: "main" };
const API = "https://api.github.com";
const PAGES = [
  { path: "index.html", label: "Главная", name: "home page" },
  { path: "work/personal-exchange-bot.html", label: "Кейс: Personal Exchange Bot", name: "bot case study" },
  { path: "404.html", label: "Страница 404", name: "404 page" },
];
const TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new?name=Site%20editor" +
  "&description=Edit%20albalaeff.github.io%20from%20the%20%2Fadmin%2F%20page" +
  "&target_name=albalaeff&expires_in=365&contents=write";
const KEYS = { token: "site-editor.token", hint: "site-editor.hint-seen", device: "site-editor.device" };
const SITE_ROOT = new URL("../", location.href);
const MAX_SIDE = 2000;

const EDITOR_CSS = `
<style id="site-editor">
  /* Outlines only: they never change the page's own look (radius, shadows, borders). */
  [data-cms] { cursor: text; outline: 2px solid transparent; outline-offset: 3px; }
  [data-cms]:hover { outline-color: rgba(0, 113, 227, .4); }
  [data-cms]:focus { outline: 2px solid #0071e3; }
  [data-cms].cms-dirty { outline: 2px dashed #ff9f0a; }
  [data-cms].cms-dirty:focus { outline: 2px solid #0071e3; }
  [data-cms], [data-cms] * { -webkit-user-select: text; user-select: text; }
  [data-cms-img] { cursor: pointer; transition: filter .15s ease; }
  [data-cms-img]:hover { filter: brightness(.82); outline: 3px solid #0071e3; outline-offset: -3px; }
  .skip-link { display: none !important; }
</style>
`;

/* ---------- Small helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let toastTimer = 0;
function toast(html, { error = false, sticky = false } = {}) {
  const el = $("#toast");
  el.innerHTML = html;
  el.classList.toggle("is-error", error);
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { el.hidden = true; }, error ? 9000 : 6000);
}

/* ---------- GitHub API ---------- */
let token = store.get(KEYS.token);

class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function gh(path, { method = "GET", body } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
  };
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(API + path, { method, headers, cache: "no-store", body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new GitHubError("Нет связи с GitHub. Проверь интернет и попробуй ещё раз.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new GitHubError(data?.message || `GitHub ответил ${res.status}`, res.status);
  return data;
}

const contentsUrl = (path) =>
  `/repos/${REPO.owner}/${REPO.name}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

async function readFile(path) {
  const d = await gh(`${contentsUrl(path)}?ref=${REPO.branch}`);
  return { text: base64ToUtf8(d.content), sha: d.sha };
}

function writeFile(path, base64, message, sha) {
  const body = { message, content: base64, branch: REPO.branch };
  if (sha) body.sha = sha;
  return gh(contentsUrl(path), { method: "PUT", body });
}

function explain(err) {
  if (err.status === 401) return "Ключ GitHub больше не действует (истёк или удалён). Войди с новым ключом.";
  if (err.status === 403 && /not accessible|permission/i.test(err.message)) {
    return "У ключа нет права записи. В настройках ключа на GitHub поставь Contents: Read and write.";
  }
  if (err.status === 404) return "Ключ не видит репозиторий albalaeff.github.io. При создании ключа выбери его в Repository access.";
  if (err.status === 409 || err.status === 422) return "Файл только что изменился на GitHub. Нажми «Сохранить» ещё раз.";
  return err.message || "Что-то пошло не так.";
}

/* ---------- State ---------- */
const state = {
  page: PAGES[0],
  src: "",
  sha: "",
  analysis: null,
  snapshot: new Map(), // text id -> innerHTML right after load
  dirty: new Set(), // text ids the user typed in
  hrefs: new Map(), // text id (an <a>) -> new href
  images: new Map(), // image id -> { blob, ext, fileName, width, height, alt, url }
  device: store.get(KEYS.device) === "mobile" ? "mobile" : "desktop",
  saving: false,
  current: null, // text block being edited
  linkTarget: null, // <a> under the caret
  imageId: null, // photo open in the panel
};

const frame = () => $("#frame");
const fdoc = () => frame().contentDocument;

/* ---------- Sign-in ---------- */
function showLogin(message) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#token-link").href = TOKEN_URL;
  const errEl = $("#login-error");
  errEl.hidden = !message;
  errEl.textContent = message || "";
  $("#token-input").focus();
}

async function signIn(value) {
  token = value.trim();
  const button = $("#login-submit");
  button.disabled = true;
  try {
    await gh(`/repos/${REPO.owner}/${REPO.name}`);
    store.set(KEYS.token, token);
    $("#token-input").value = "";
    await startEditor();
  } catch (err) {
    token = null;
    const msg = err.status === 401
      ? "Ключ не подошёл. Проверь, что скопировал его целиком."
      : explain(err);
    showLogin(msg);
  } finally {
    button.disabled = false;
  }
}

function signOut() {
  if (changeCount() && !confirm("Несохранённые правки пропадут. Выйти?")) return;
  store.del(KEYS.token);
  token = null;
  resetChanges();
  showLogin();
}

/* ---------- Loading and rendering a page ---------- */
async function startEditor() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#hint").hidden = store.get(KEYS.hint) === "1";
  setDevice(state.device);
  await openPage(state.page);
}

async function openPage(page) {
  $("#loading").hidden = false;
  $("#loading").textContent = "Загружаю страницу…";
  try {
    const file = await readFile(page.path);
    state.page = page;
    state.src = file.text;
    state.sha = file.sha;
    $("#page-select").value = page.path;
    render();
  } catch (err) {
    if (err.status === 401) return showLogin(explain(err));
    $("#loading").textContent = explain(err);
  }
}

function pageBase(page) {
  const dir = page.path.includes("/") ? page.path.slice(0, page.path.lastIndexOf("/") + 1) : "";
  return new URL(dir, SITE_ROOT).href;
}

function render({ keepScroll = false } = {}) {
  const scroll = keepScroll ? frame().contentWindow?.scrollY || 0 : 0;
  $("#toast").hidden = true;
  hideToolbar();
  closeImagePanel();
  resetChanges();
  state.analysis = analyze(state.src);
  const html = buildPreview(state.src, state.analysis, { baseHref: pageBase(state.page), headExtra: EDITOR_CSS });
  frame().onload = () => {
    wireFrame();
    if (scroll) frame().contentWindow.scrollTo(0, scroll);
    $("#loading").hidden = true;
  };
  frame().srcdoc = html;
}

/* ---------- Editing inside the preview ---------- */
function wireFrame() {
  const doc = fdoc();
  const win = frame().contentWindow;
  state.snapshot.clear();
  doc.querySelectorAll("[data-cms]").forEach((el) => {
    el.setAttribute("contenteditable", "true");
    state.snapshot.set(Number(el.dataset.cms), el.innerHTML);
  });

  // Links and photos don't navigate in the editor.
  doc.addEventListener("click", (e) => {
    const img = e.target.closest?.("[data-cms-img]");
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      openImagePanel(Number(img.dataset.cmsImg));
      return;
    }
    if (e.target.closest?.("a")) e.preventDefault();
  }, true);

  doc.addEventListener("input", (e) => {
    const el = e.target.closest?.("[data-cms]");
    if (!el) return;
    state.dirty.add(Number(el.dataset.cms));
    markBlock(el);
    refreshStatus();
    positionToolbar();
  });

  doc.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
      return;
    }
    const el = e.target.closest?.("[data-cms]");
    if (!el) return;
    if (e.key === "Enter") {
      e.preventDefault(); // one block stays one block; Enter makes a line break
      if (!doc.execCommand("insertLineBreak")) doc.execCommand("insertHTML", false, "<br>");
    } else if (e.key === "Escape") {
      el.blur();
      hideToolbar();
    }
  });

  doc.addEventListener("paste", (e) => {
    if (!e.target.closest?.("[data-cms]")) return;
    e.preventDefault();
    const text = (e.clipboardData?.getData("text/plain") || "").replace(/\s*\n\s*/g, " ");
    doc.execCommand("insertText", false, text);
  });

  doc.addEventListener("drop", (e) => e.preventDefault());
  doc.addEventListener("dragstart", (e) => e.preventDefault());

  doc.addEventListener("focusin", (e) => {
    const el = e.target.closest?.("[data-cms]");
    if (el) showToolbar(el);
  });
  doc.addEventListener("focusout", () => {
    setTimeout(() => {
      const inToolbar = $("#toolbar").contains(document.activeElement);
      const active = fdoc()?.activeElement;
      if (!inToolbar && !active?.closest?.("[data-cms]")) hideToolbar();
    }, 120);
  });
  doc.addEventListener("selectionchange", updateLinkField);
  win.addEventListener("scroll", positionToolbar, { passive: true });
  win.addEventListener("resize", positionToolbar);
}

function markBlock(el) {
  const id = Number(el.dataset.cms);
  const changed = blockHtml(el) !== state.snapshot.get(id) || state.hrefs.has(id);
  el.classList.toggle("cms-dirty", changed);
}

/* The block's HTML as it will be saved, with browser editing debris removed. */
function blockHtml(el) {
  const id = Number(el.dataset.cms);
  const original = state.snapshot.get(id) || "";
  const c = el.cloneNode(true);
  const unwrap = (n) => n.replaceWith(...n.childNodes);
  c.querySelectorAll("font").forEach(unwrap);
  c.querySelectorAll("[style]").forEach((n) => {
    n.removeAttribute("style");
    if (n.tagName === "SPAN" && n.attributes.length === 0) unwrap(n);
  });
  c.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  c.querySelectorAll("div, p").forEach((n) => {
    n.before(n.ownerDocument.createElement("br"));
    unwrap(n);
  });
  while (c.lastChild && c.lastChild.nodeName === "BR" && !/<br>\s*$/.test(original)) c.lastChild.remove();
  // Browsers type non-breaking spaces at the edges of text and next to spaces; those become
  // ordinary spaces. One between two characters (like in "+421 950 704 527") is kept.
  const walker = c.ownerDocument.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    n.nodeValue = n.nodeValue
      .replace(/^\u00a0+|\u00a0+$/g, (m) => " ".repeat(m.length))
      .replace(/ \u00a0|\u00a0 /g, "  ")
      .replace(/ {2,}/g, (m, idx, all) => (idx === 0 || idx + m.length === all.length ? m : " "));
  }
  return c.innerHTML;
}

/* ---------- Floating toolbar ---------- */
function showToolbar(el) {
  state.current = el;
  $("#toolbar").hidden = false;
  updateLinkField();
  positionToolbar();
}

function hideToolbar() {
  state.current = null;
  state.linkTarget = null;
  $("#toolbar").hidden = true;
}

function positionToolbar() {
  const el = state.current;
  const bar = $("#toolbar");
  if (!el || bar.hidden || !el.isConnected) return;
  const f = frame().getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const h = bar.offsetHeight;
  const w = bar.offsetWidth;
  let top = f.top + r.top - h - 10;
  if (top < f.top + 4) top = f.top + r.bottom + 10;
  const left = Math.max(8, Math.min(f.left + r.left, window.innerWidth - w - 8));
  const offscreen = r.bottom < 0 || r.top > f.height;
  bar.style.visibility = offscreen ? "hidden" : "visible";
  bar.style.top = `${Math.round(top)}px`;
  bar.style.left = `${Math.round(left)}px`;
}

function updateLinkField() {
  const el = state.current;
  if (!el) return;
  let a = el.tagName === "A" ? el : null;
  if (!a) {
    const node = fdoc().getSelection()?.anchorNode;
    const parent = node?.nodeType === 1 ? node : node?.parentElement;
    const found = parent?.closest?.("a");
    if (found && el.contains(found)) a = found;
  }
  if (document.activeElement === $("#link-input")) return; // don't fight the user while typing
  state.linkTarget = a && a.hasAttribute("href") ? a : null;
  $("#link-wrap").hidden = !state.linkTarget;
  if (state.linkTarget) $("#link-input").value = state.linkTarget.getAttribute("href");
  positionToolbar();
}

function setLink(value) {
  const a = state.linkTarget;
  const el = state.current;
  if (!a || !el) return;
  a.setAttribute("href", value);
  const id = Number(el.dataset.cms);
  if (a === el) {
    if (value === state.analysis.texts[id].href?.value) state.hrefs.delete(id);
    else state.hrefs.set(id, value);
  } else {
    state.dirty.add(id);
  }
  markBlock(el);
  refreshStatus();
}

function revertBlock() {
  const el = state.current;
  if (!el) return;
  const id = Number(el.dataset.cms);
  el.innerHTML = state.snapshot.get(id);
  const href = state.analysis.texts[id].href;
  if (href) el.setAttribute("href", href.value);
  state.dirty.delete(id);
  state.hrefs.delete(id);
  el.classList.remove("cms-dirty");
  updateLinkField();
  refreshStatus();
}

/* ---------- Photos ---------- */
function openImagePanel(id) {
  hideToolbar();
  state.imageId = id;
  const img = fdoc().querySelector(`[data-cms-img="${id}"]`);
  const change = state.images.get(id);
  $("#img-preview").src = change?.url || img.currentSrc || img.src;
  $("#img-alt").value = change?.alt ?? img.getAttribute("alt") ?? "";
  $("#img-file").value = "";
  $("#img-panel").style.top = `${Math.round($(".bar").getBoundingClientRect().bottom)}px`; // keep Save visible
  $("#img-panel").hidden = false;
}

function closeImagePanel() {
  state.imageId = null;
  $("#img-panel").hidden = true;
}

const slug = (name) =>
  name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "photo";

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Подойдут JPG, PNG или WebP. Фото с iPhone (HEIC) сначала сохрани как JPG.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  let type = "image/jpeg";
  let ext = "jpg";
  if (file.type !== "image/jpeg") {
    const px = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < px.length; i += 4) {
      if (px[i] < 255) { type = "image/png"; ext = "png"; break; }
    }
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.86));
  if (!blob) throw new Error("Не получилось обработать фото.");
  return { blob, ext, width, height, fileName: `${slug(file.name)}-${stamp()}.${ext}` };
}

async function onImageFile(file) {
  const id = state.imageId;
  if (id == null || !file) return;
  try {
    const prepared = await prepareImage(file);
    const prev = state.images.get(id) || {};
    if (prev.url) URL.revokeObjectURL(prev.url);
    const url = URL.createObjectURL(prepared.blob);
    state.images.set(id, { ...prev, ...prepared, url, alt: $("#img-alt").value });
    // Show it on the page right away.
    const img = fdoc().querySelector(`[data-cms-img="${id}"]`);
    img.closest("picture")?.querySelectorAll("source").forEach((s) => s.remove());
    img.removeAttribute("srcset");
    img.src = url;
    $("#img-preview").src = url;
    refreshStatus();
  } catch (err) {
    toast(esc(err.message), { error: true });
  }
}

function onAltInput(value) {
  const id = state.imageId;
  if (id == null) return;
  const original = state.analysis.images[id].attrs.find((a) => a.name === "alt")?.value ?? "";
  const change = state.images.get(id) || {};
  if (!change.blob && value === original) state.images.delete(id);
  else state.images.set(id, { ...change, alt: value });
  fdoc().querySelector(`[data-cms-img="${id}"]`)?.setAttribute("alt", value);
  refreshStatus();
}

/* ---------- Changes ---------- */
function collectTextChanges() {
  const texts = new Map();
  const doc = fdoc();
  for (const id of state.dirty) {
    const el = doc?.querySelector(`[data-cms="${id}"]`);
    if (!el) continue;
    const html = blockHtml(el);
    if (html !== state.snapshot.get(id)) texts.set(id, html);
  }
  const hrefs = new Map([...state.hrefs].filter(([id, v]) => v !== state.analysis.texts[id].href?.value));
  return { texts, hrefs };
}

function changeCount() {
  if (!state.analysis) return 0;
  const { texts, hrefs } = collectTextChanges();
  const ids = new Set([...texts.keys(), ...hrefs.keys()]);
  return ids.size + state.images.size;
}

function refreshStatus() {
  const n = changeCount();
  const status = $("#status");
  status.textContent = n ? `Несохранённых правок: ${n}` : "Нет изменений";
  status.classList.toggle("is-dirty", n > 0);
  $("#save").disabled = !n || state.saving;
  $("#discard").disabled = !n || state.saving;
}

function resetChanges() {
  for (const ch of state.images.values()) if (ch.url) URL.revokeObjectURL(ch.url);
  state.dirty.clear();
  state.hrefs.clear();
  state.images.clear();
  refreshStatus();
}

/* Path of an uploaded file as written in the page's HTML. */
function assetPathFor(page, path) {
  if (page.path === "404.html") return `/${path}`; // 404 uses absolute paths on purpose
  const depth = page.path.split("/").length - 1;
  return "../".repeat(depth) + path;
}

async function save() {
  if (state.saving || !changeCount()) return;
  state.saving = true;
  refreshStatus();
  toast("Сохраняю…", { sticky: true });
  try {
    const { texts, hrefs } = collectTextChanges();

    // 1. Upload new photos.
    const images = new Map();
    for (const [id, ch] of state.images) {
      const entry = {};
      if (ch.blob) {
        const path = `assets/img/${ch.fileName}`;
        if (!ch.uploaded) {
          const bytes = new Uint8Array(await ch.blob.arrayBuffer());
          await writeFile(path, bytesToBase64(bytes), `Add photo ${ch.fileName} from the site editor`);
          ch.uploaded = true;
        }
        Object.assign(entry, { src: assetPathFor(state.page, path), width: ch.width, height: ch.height });
      }
      if (ch.alt != null) entry.alt = ch.alt;
      images.set(id, entry);
    }

    // 2. Turn changes into edits of the page source.
    let edits = buildEdits(state.src, state.analysis, { texts, hrefs, images });
    let base = state.src;
    let sha = state.sha;
    const latest = await readFile(state.page.path);
    if (latest.sha !== state.sha) {
      // Someone (or another session) changed the file meanwhile: move our edits onto it.
      const moved = rebaseEdits(state.src, latest.text, edits);
      if (moved.failed.length) {
        throw new Error(
          `Пока ты редактировал, файл изменился на GitHub, и ${moved.failed.length} из ${edits.length} правок не удалось перенести. ` +
          "Скопируй свой текст, нажми «Отменить» и внеси правку заново.",
        );
      }
      edits = moved.edits;
      base = latest.text;
      sha = latest.sha;
    }
    const next = applyEdits(base, edits);

    // 3. Commit.
    const count = new Set([...texts.keys(), ...hrefs.keys()]).size + images.size;
    const message = `Edit the ${state.page.name} in the site editor (${count} ${count === 1 ? "change" : "changes"})`;
    const res = await writeFile(state.page.path, utf8ToBase64(next), message, sha);

    state.src = next;
    state.sha = res.content.sha;
    state.saving = false;
    render({ keepScroll: true });
    const link = res.commit?.html_url ? ` <a href="${esc(res.commit.html_url)}" target="_blank" rel="noopener">Коммит</a>` : "";
    toast(`Сохранено. Сайт обновится примерно через минуту.${link}`);
  } catch (err) {
    state.saving = false;
    refreshStatus();
    if (err.status === 401) {
      toast(esc(explain(err)), { error: true });
      return;
    }
    toast(esc(err instanceof GitHubError ? explain(err) : err.message), { error: true });
  }
}

function discard() {
  if (!changeCount()) return;
  if (!confirm("Отменить все несохранённые правки на этой странице?")) return;
  render({ keepScroll: true });
}

/* ---------- Device width ---------- */
function setDevice(device) {
  state.device = device;
  store.set(KEYS.device, device);
  $("#stage").dataset.device = device;
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === device)));
  setTimeout(positionToolbar, 320);
}

/* ---------- Wiring ---------- */
function init() {
  const select = $("#page-select");
  for (const p of PAGES) select.add(new Option(p.label, p.path));
  select.addEventListener("change", () => {
    const page = PAGES.find((p) => p.path === select.value);
    if (changeCount() && !confirm("На этой странице есть несохранённые правки. Перейти без сохранения?")) {
      select.value = state.page.path;
      return;
    }
    openPage(page);
  });

  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => setDevice(b.dataset.device)));
  $("#save").addEventListener("click", save);
  $("#discard").addEventListener("click", discard);
  $("#logout").addEventListener("click", () => { $("#menu").open = false; signOut(); });
  $("#open-history").href = `https://github.com/${REPO.owner}/${REPO.name}/commits/${REPO.branch}`;
  $("#hint-close").addEventListener("click", () => { $("#hint").hidden = true; store.set(KEYS.hint, "1"); });

  // Toolbar buttons keep the caret in the page.
  $("#toolbar").addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  $("#toolbar").addEventListener("click", (e) => {
    const cmd = e.target.closest("[data-cmd]")?.dataset.cmd;
    if (cmd) fdoc().execCommand(cmd);
    if (e.target.closest("#revert")) revertBlock();
  });
  $("#link-input").addEventListener("input", (e) => setLink(e.target.value.trim()));
  $("#link-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); state.current?.focus(); }
  });
  $("#link-input").addEventListener("blur", () => setTimeout(() => {
    if (!fdoc()?.activeElement?.closest?.("[data-cms]") && !$("#toolbar").contains(document.activeElement)) hideToolbar();
  }, 120));

  $("#img-file").addEventListener("change", (e) => onImageFile(e.target.files[0]));
  $("#img-alt").addEventListener("input", (e) => onAltInput(e.target.value));
  $("#img-close").addEventListener("click", closeImagePanel);
  $("#img-done").addEventListener("click", closeImagePanel);

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    signIn($("#token-input").value);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && !$("#app").hidden) {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") closeImagePanel();
  });
  document.addEventListener("click", (e) => {
    const menu = $("#menu");
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  window.addEventListener("resize", positionToolbar);
  window.addEventListener("beforeunload", (e) => {
    if (changeCount()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  if (token) startEditor();
  else showLogin();
}

init();
