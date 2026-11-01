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
