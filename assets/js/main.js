/* Aleksandr Balaev — site scripts. No dependencies. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Navigation ---------- */
  const nav = document.querySelector(".nav");
  if (nav) {
    const toggle = nav.querySelector(".nav__toggle");
    const menu = nav.querySelector(".nav__menu");

    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle?.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("is-locked", open);
    };

    toggle?.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
    menu?.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        setOpen(false);
        toggle?.focus();
      }
    });
    window.matchMedia("(min-width: 768px)").addEventListener("change", (e) => {
      if (e.matches) setOpen(false);
    });

    const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Decorative animations pause while off screen ---------- */
  if ("IntersectionObserver" in window) {
    const offscreen = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.classList.toggle("is-offscreen", !e.isIntersecting);
    });
    document.querySelectorAll("[data-anim]").forEach((el) => offscreen.observe(el));
  }

  /* ---------- Photo carousel on phones: one photo per swipe, page dots below ---------- */
  document.querySelectorAll("[data-carousel]").forEach((gallery) => {
    const slides = [...gallery.children];
    if (slides.length < 2) return;

    const centerOf = (slide) => slide.offsetLeft + slide.offsetWidth / 2;
    const dots = document.createElement("div");
    dots.className = "gallery-dots";
    const buttons = slides.map((slide, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Photo ${i + 1} of ${slides.length}`);
      button.addEventListener("click", () => {
        gallery.scrollTo({
          left: centerOf(slide) - gallery.clientWidth / 2,
          behavior: reduceMotion.matches ? "auto" : "smooth",
        });
      });
      dots.appendChild(button);
      return button;
    });
    gallery.after(dots);

    let current = -1;
    const update = () => {
      const max = gallery.scrollWidth - gallery.clientWidth;
      const mid = gallery.scrollLeft + gallery.clientWidth / 2;
      let index = 0;
      slides.forEach((slide, i) => {
        if (Math.abs(centerOf(slide) - mid) < Math.abs(centerOf(slides[index]) - mid)) index = i;
      });
      if (gallery.scrollLeft <= 2) index = 0;
      else if (gallery.scrollLeft >= max - 2) index = slides.length - 1;
      if (index === current) return;
      current = index;
      buttons.forEach((b, i) => b.setAttribute("aria-current", String(i === index)));
    };

    let queued = false;
    gallery.addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    }, { passive: true });

    // Only a swipeable gallery is a keyboard stop (arrow keys scroll it).
    const sync = () => {
      if (gallery.scrollWidth > gallery.clientWidth + 1) gallery.tabIndex = 0;
      else gallery.removeAttribute("tabindex");
      current = -1;
      update();
    };
    window.addEventListener("resize", sync);
    sync();
  });

  /* ---------- Claude spark that behaves like a living thing ----------
     The official mark is redrawn every frame: each of its 11 rays stretches,
     thins and bends on its own slow rhythm, the body breathes and sways.
     In the agents panel it also reaches toward the agent it hands an issue to
     and swallows the result when it comes back. At rest (no JS, reduced
     motion) it is the unchanged official path. */
  const sparks = [...document.querySelectorAll("[data-spark]")];
  if (sparks.length && !reduceMotion.matches && "IntersectionObserver" in window) {
    const CX = 61.5; // centre of the mark in its 128-unit viewBox
    const CY = 59.5;
    const TAU = Math.PI * 2;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

    const build = (path) => {
      const len = path.getTotalLength();
      const n = 720;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const q = path.getPointAtLength((len * i) / n);
        pts.push({ r: Math.hypot(q.x - CX, q.y - CY), a: Math.atan2(q.y - CY, q.x - CX) });
      }
      // Rays are the stretches of outline between the notches (local minima of r)
      const W = 11;
      const notches = [];
      for (let i = 0; i < n; i++) {
        if (pts[i].r > 35) continue;
        let low = true;
        for (let k = -W; k <= W && low; k++) if (pts[(i + k + n) % n].r < pts[i].r) low = false;
        if (low && (!notches.length || i - notches[notches.length - 1] > W)) notches.push(i);
      }
      const rays = notches.map((start, j) => {
        const end = notches[(j + 1) % notches.length];
        const idx = [];
        for (let i = start; i !== end; i = (i + 1) % n) idx.push(i);
        const tip = idx.reduce((m, i) => (pts[i].r > pts[m].r ? i : m), idx[0]);
        const base = (pts[start].r + pts[end].r) / 2;
        for (const i of idx) pts[i].ray = j;
        return {
          axis: pts[tip].a, tip: pts[tip].r, base,
          // each ray gets its own slow, never-quite-repeating rhythm
          f: [0.11 + rand() * 0.12, 0.23 + rand() * 0.17, 0.08 + rand() * 0.1, 0.19 + rand() * 0.14],
          p: [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU],
        };
      });
      return { pts, rays };
    };

    const living = sparks.map((path) => {
      const panel = path.closest(".orch");
      // Agents' directions as seen from the spark in panel units, and their dot animations
      const agents = panel
        ? [...panel.querySelectorAll(".orch__agent")].map((agent, k) => ({
            angle: [-0.51, 0.02, 0.54][k] ?? 0,
            dot: agent.querySelector(".orch__go"),
          }))
        : [];
      return { path, panel, agents, shape: null, visible: false, amp: panel ? 1 : 0.75, rest: path.getAttribute("d") };
    });

    const phaseOf = (el) => {
      const anim = el?.getAnimations?.()[0];
      const t = anim?.effect?.getComputedTiming?.();
      return t && t.progress != null ? t.progress : null;
    };

    const draw = (s, t) => {
      if (!s.shape) s.shape = build(s.path);
      const { pts, rays } = s.shape;
      const amp = s.amp;
      const breath = 1 + 0.035 * Math.sin((TAU * t) / 3.7) + 0.012 * Math.sin((TAU * t) / 1.9);
      let scale = breath;
      const sway = 0.07 * Math.sin((TAU * t) / 11) + 0.03 * Math.sin((TAU * t) / 4.3);

      const reach = new Float32Array(rays.length);
      const pull = new Float32Array(rays.length);
      for (const ag of s.agents) {
        const ph = phaseOf(ag.dot);
        if (ph == null) continue;
        // Hand-off: the dot leaves during 0–14% of the agent's cycle
        const send = ph < 0.18 ? Math.sin((Math.PI * ph) / 0.18) : 0;
        // Result arrives at 75%: a quick gulp, then a small rebound
        const gulp = bump(ph, 0.765, 0.022);
        const rebound = bump(ph, 0.81, 0.03);
        scale *= 1 - 0.07 * gulp + 0.03 * rebound;
        rays.forEach((ray, j) => {
          const d = wrap(ray.axis - ag.angle);
          const near = Math.exp(-((d / 0.55) ** 2));
          reach[j] += 0.26 * send * near - 0.1 * gulp * near;
          pull[j] += -0.3 * d * send * near + 0.12 * d * gulp * near;
        });
      }

      let out = "";
      // A wave runs round the body (neighbouring rays follow each other, like
      // cilia or an anemone's tentacles), with a little private drift per ray.
      const lens = rays.map((ray, j) => {
        const wave = TAU * 0.3 * t - (TAU * 2 * j) / rays.length;
        const L = 1 + amp * (0.07 * Math.sin(wave + 1.2) + 0.04 * Math.sin(TAU * ray.f[0] * t + ray.p[0])) + reach[j];
        const bend = amp * (0.09 * Math.sin(wave) + 0.035 * Math.sin(TAU * ray.f[2] * t + ray.p[2])) + pull[j];
        return { L, bend, thin: 1 / Math.sqrt(Math.max(L, 0.6)) };
      });
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const ray = rays[p.ray];
        let r = p.r;
        let a = p.a;
        if (ray && r > ray.base) {
          const m = lens[p.ray];
          const w = Math.min(1, (r - ray.base) / (ray.tip - ray.base));
          const off = wrap(a - ray.axis);
          r = ray.base + (r - ray.base) * m.L;
          // longer rays get thinner (like a muscle), and the tip bends more than the root
          a = ray.axis + off * (1 + (m.thin - 1) * w) + m.bend * w * w;
        }
        r *= scale;
        a += sway;
        const x = CX + r * Math.cos(a);
        const y = CY + r * Math.sin(a);
        out += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
      }
      s.path.setAttribute("d", out + "Z");
    };

    let running = false;
    const t0 = performance.now();
    const frame = (now) => {
      if (reduceMotion.matches) {
        living.forEach((s) => s.path.setAttribute("d", s.rest));
        running = false;
        return;
      }
      const active = living.filter((s) => s.visible);
      if (!active.length || document.hidden) {
        running = false;
        return;
      }
      for (const s of active) draw(s, (now - t0) / 1000);
      requestAnimationFrame(frame);
    };
    const kick = () => {
      if (running || document.hidden || reduceMotion.matches || !living.some((s) => s.visible)) return;
      running = true;
      requestAnimationFrame(frame);
    };

    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const s = living.find((x) => x.path.closest("svg") === e.target);
        if (s) s.visible = e.isIntersecting;
      }
      kick();
    });
    living.forEach((s) => seen.observe(s.path.closest("svg")));
    document.addEventListener("visibilitychange", kick);
    reduceMotion.addEventListener?.("change", kick);
  }

  /* ---------- Bot demo in the phone: a detailed walkthrough that loops ---------- */
  const chat = document.querySelector("[data-demo]");
  if (!chat) return;

  const screen = chat.closest(".phone__screen");
  const phone = chat.closest(".phone");
  const fallback = chat.innerHTML; // static deal, shown with reduced motion or without JS

  if (reduceMotion.matches || !("IntersectionObserver" in window) || !screen) return;

  // Time only runs while the phone is on screen and the tab is visible.
  let visible = false;
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  }, { threshold: 0.2 }).observe(phone || chat);

  const sleep = (ms) =>
    new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        if (visible && !document.hidden) left -= now - last;
        last = now;
        if (left <= 0) resolve();
        else setTimeout(tick, 40);
      };
      setTimeout(tick, 40);
    });
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  /* Pieces of the phone UI */
  const status = screen.querySelector(".chat-head__sub");
  // Telegram shows "typing…" under the bot's name, not in the chat. The label comes
  // from CSS, so the page text ("bot") never changes (the site editor relies on that).
  const setTyping = (on) => status?.classList.toggle("is-typing", on);

  const composer = document.createElement("div");
  composer.className = "composer";
  composer.innerHTML =
    '<div class="composer__field"><span class="composer__text"></span><span class="composer__placeholder">Message</span></div><span class="composer__send"></span>';
  const composerText = composer.querySelector(".composer__text");
  screen.appendChild(composer);

  const scrim = document.createElement("div");
  scrim.className = "sheet-scrim";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.innerHTML =
    '<span class="sheet__grabber"></span>' +
    '<p class="sheet__title">Meeting point</p><p class="sheet__sub">Mini App, OpenStreetMap</p>' +
    '<div class="map sheet__map"><span class="map__pin"></span></div>' +
    '<div class="sheet__place"><b>Wenceslas Square</b><span>Prague</span></div>' +
    '<div class="kb kb--3 sheet__times"><span class="key">17:00</span><span class="key">17:30</span><span class="key">18:00</span></div>' +
    '<span class="key key--primary sheet__btn">Confirm place</span>';
  screen.appendChild(scrim);
  screen.appendChild(sheet);

  // Telegram inline keyboard under a message. A key is a label, or { t, ok } for a green button.
  const inlineKeys = (rows) =>
    '<div class="ikb">' +
    rows
      .map((row) => '<div class="ikb__row">' + row.map((k) => {
        const key = typeof k === "string" ? { t: k } : k;
        return `<span class="key${key.ok ? " key--ok" : ""}">${key.t}</span>`;
      }).join("") + "</div>")
      .join("") +
    "</div>";

  // Message time, sitting at the end of the last line like in Telegram
  const stamp = (bubble, time) => {
    if (!time) return;
    const t = document.createElement("span");
    t.className = "msg__time";
    t.textContent = time;
    const last = bubble.lastElementChild;
    (last && last.tagName === "P" ? last : bubble).appendChild(t);
  };

  const show = async (el) => {
    el.classList.add("is-entering");
    chat.appendChild(el);
    await nextFrame();
    el.classList.remove("is-entering");
  };

  const bot = async (html, { cls = "", think = 750, read = 1300, keys = null, at = "", full = false } = {}) => {
    setTyping(true);
    await sleep(think);
    setTyping(false);
    const post = document.createElement("div");
    post.className = `post${keys ? " post--keys" : ""}${full ? " post--full" : ""}`;
    post.innerHTML = `<div class="msg ${cls}">${html}</div>` + (keys ? inlineKeys(keys) : "");
    stamp(post.firstElementChild, at);
    await show(post);
    await sleep(read);
    return post;
  };

  const ripple = (target) => {
    const s = screen.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "tap";
    dot.style.left = `${r.left - s.left + r.width / 2}px`;
    dot.style.top = `${r.top - s.top + r.height / 2}px`;
    screen.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  };

  const press = async (key) => {
    ripple(key);
    key.classList.add("is-pressed");
    await sleep(240);
    key.classList.remove("is-pressed");
    key.classList.add("is-chosen");
    await sleep(450);
  };

  const tap = async (root, label) => {
    const key = [...root.querySelectorAll(".key")].find((k) => k.textContent.trim() === label);
    if (key) await press(key);
  };

  const keyAt = (post, row, col) => post.querySelectorAll(".ikb__row")[row].children[col];

  // The bot edits its form in place: a key's label changes, with a short highlight
  const relabel = async (post, row, col, text) => {
    const key = keyAt(post, row, col);
    key.textContent = text;
    key.classList.add("is-updated");
    await sleep(650);
    key.classList.remove("is-updated");
  };

  const addNote = async (post, text) => {
    const bubble = post.querySelector(".msg");
    const note = document.createElement("p");
    note.className = "msg__note is-updated";
    note.textContent = text;
    const time = bubble.querySelector(".msg__time");
    bubble.appendChild(note);
    if (time) note.appendChild(time);
    await sleep(650);
    note.classList.remove("is-updated");
  };

  const type = async (text, at = "") => {
    composer.classList.add("is-typing");
    for (const ch of text) {
      composerText.textContent += ch;
      await sleep(95);
    }
    await sleep(380);
    ripple(composer.querySelector(".composer__send"));
    const el = document.createElement("div");
    el.className = "msg msg--me";
    el.textContent = text;
    stamp(el, at);
    composerText.textContent = "";
    composer.classList.remove("is-typing");
    await show(el);
    await sleep(500);
  };

  const mapSheet = async () => {
    sheet.querySelectorAll(".key").forEach((k) => k.classList.remove("is-chosen", "is-pressed"));
    scrim.classList.add("is-open");
    sheet.classList.add("is-open");
    await sleep(800);
    sheet.classList.add("is-pinned");
    await sleep(1300);
    await tap(sheet, "17:30");
    await sleep(500);
    await press(sheet.querySelector(".sheet__btn"));
    sheet.classList.remove("is-open", "is-pinned");
    scrim.classList.remove("is-open");
    await sleep(600);
  };

  const rate = async (root) => {
    const stars = [...root.querySelectorAll(".key")];
    ripple(stars[stars.length - 1]);
    for (const star of stars) {
      star.classList.add("is-on");
      await sleep(110);
    }
    await sleep(700);
  };

  const ok = '<span class="ok" aria-hidden="true"></span>';

  const walkthrough = async () => {
    const menu = await bot(
      `<p class="msg__title">Personal Exchange Bot</p><p>Swap rubles for local currency with people nearby. What would you like to do?</p>`,
      { think: 600, read: 1500, at: "13:10", keys: [["➕ New offer", "Offer feed"], ["My deals", "Profile"]] }
    );
    await tap(menu, "➕ New offer");

    // The offer form, as it looks in the bot: one message, edited as you fill it in
    const form = await bot(`<p class="msg__title">➕ New offer</p>`, {
      at: "13:12",
      full: true,
      read: 1700,
      keys: [
        ["You give", "Choose", "💵 Cash"],
        ["You get", "Choose", "💵 Cash"],
        ["Meeting", "🤝 In person", "📍 Prague 🇨🇿"],
        ["📝 Note"],
        ["📣 In @pfxy_praha", "✅ On"],
        ["✖️ Cancel", { t: "✅ Post", ok: true }],
      ],
    });
    await press(keyAt(form, 0, 1));
    await type("50000 rub", "13:12");
    await relabel(form, 0, 1, "50,000 RUB");
    await sleep(600);

    await press(keyAt(form, 1, 1));
    await type("13500 czk", "13:12");
    await relabel(form, 1, 1, "13,500 CZK");
    await addNote(form, "Rate 3.70 · market 3.64");
    await sleep(1800);

    await press(keyAt(form, 5, 1));
    await bot(`<p>${ok}Published in the Prague feed and @pfxy_praha.</p>`, { read: 2200, at: "13:13" });

    await bot(
      `<p class="msg__title">New response</p><ul class="replies"><li><span>Dmitry <span class="replies__rating">★ 4.9</span></span><span class="replies__rate">3.70</span></li></ul><p class="msg__note">Accepts your rate</p>`,
      { think: 1300, read: 1300, at: "13:31" }
    );
    const counter = await bot(
      `<p class="msg__title">Counter-offer</p><ul class="replies"><li><span>Anna <span class="replies__rating">★ 5.0</span></span><span class="replies__rate">3.65</span></li></ul><p class="trust"><span class="trust__chip">Phone checked</span><span class="trust__chip">Not in spam lists</span></p><p class="msg__note">You would get 13,699 CZK</p>`,
      { read: 2200, at: "13:34", keys: [["Choose Dmitry", "Choose Anna"]] }
    );
    await tap(counter, "Choose Anna");

    await bot(`<p class="msg__title">Deal with Anna started</p><p>Write here, and the bot passes your messages on.</p>`, { read: 1100, at: "13:35" });
    await bot(`<p class="msg__from">Anna</p><p>Hi! Where shall we meet?</p>`, { cls: "msg--relay", read: 900, at: "13:36" });
    await type("Somewhere central?", "13:36");
    const where = await bot(`<p>Choose a meeting point.</p>`, { read: 900, at: "13:36", keys: [["🗺 Open the map"]] });
    await tap(where, "🗺 Open the map");
    await mapSheet();

    await bot(
      `<p class="msg__title">Meeting point set</p><div class="map"><span class="map__pin"></span></div><p>Wenceslas Square, today at 17:30</p>`,
      { read: 2200, at: "13:37" }
    );
    const done = await bot(`<p>Did the exchange happen?</p>`, { think: 1200, at: "17:52", keys: [["Yes, all good", "Problem"]] });
    await tap(done, "Yes, all good");

    const rating = await bot(
      `<p>Anna confirmed too.</p><p class="msg__title">Rate Anna</p>`,
      { read: 900, at: "17:53", keys: [["★", "★", "★", "★", "★"]] }
    );
    await rate(rating);
    await bot(`<p>${ok}Deal closed. Thanks for the rating!</p>`, { read: 3200, at: "17:53" });
  };

  const loop = async () => {
    for (;;) {
      if (reduceMotion.matches) break;
      chat.classList.remove("is-fading");
      chat.innerHTML = "";
      await walkthrough();
      chat.classList.add("is-fading");
      await sleep(600);
    }
    chat.classList.remove("is-fading");
    setTyping(false);
    chat.innerHTML = fallback;
    composer.remove();
    sheet.remove();
    scrim.remove();
  };

  chat.innerHTML = "";
  loop();
})();
