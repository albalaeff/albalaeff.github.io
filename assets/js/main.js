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
  const typing = document.createElement("div");
  typing.className = "msg typing is-hidden";
  typing.innerHTML = "<span></span><span></span><span></span>";

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

  const kb = (cols, keys) =>
    `<div class="kb kb--${cols}">` + keys.map((k) => `<span class="key">${k}</span>`).join("") + "</div>";

  const show = async (el) => {
    el.classList.add("is-entering");
    chat.insertBefore(el, typing.parentNode === chat ? typing : null);
    await nextFrame();
    el.classList.remove("is-entering");
  };

  const bot = async (html, { cls = "", think = 750, read = 1300 } = {}) => {
    chat.appendChild(typing);
    typing.classList.remove("is-hidden");
    await sleep(think);
    typing.classList.add("is-hidden");
    const el = document.createElement("div");
    el.className = `msg msg--wide ${cls}`.trim();
    el.innerHTML = html;
    await show(el);
    await sleep(read);
    return el;
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

  const type = async (text) => {
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
      `<p class="msg__title">Personal Exchange Bot</p><p>Swap rubles for local currency with people nearby. What would you like to do?</p>${kb(2, ["Create offer", "Offer feed", "My deals", "Profile"])}`,
      { think: 600, read: 1500 }
    );
    await tap(menu, "Create offer");

    await bot(
      `<p class="msg__title">What do you give?</p><p>Pick a currency or just type the amount.</p>${kb(5, ["RUB", "EUR", "USD", "CZK", "UAH"])}`,
      { read: 1100 }
    );
    await type("50000 rub");

    const want = await bot(
      `<p>Recognised: <b>50,000 RUB</b></p><p class="msg__title">What do you want in return?</p>${kb(4, ["EUR", "CZK", "USD", "UAH"])}`
    );
    await tap(want, "CZK");

    const rateMsg = await bot(
      `<p class="msg__title">Set your rate</p><p class="msg__note">RUB for 1 CZK, updated a minute ago</p><dl class="offer"><div><dt>Market rate</dt><dd>3.64</dd></div><div><dt>Exchangers</dt><dd>3.81</dd></div></dl>${kb(3, ["3.64", "3.70", "Custom"])}`,
      { read: 1900 }
    );
    await tap(rateMsg, "3.70");

    const city = await bot(
      `<p>You get <b>13,514 CZK</b>.</p><p class="msg__title">Where can you meet?</p>${kb(3, ["Prague", "Brno", "Other"])}`
    );
    await tap(city, "Prague");

    const preview = await bot(
      `<p class="msg__title">Check your offer</p><dl class="offer"><div><dt>You give</dt><dd>50,000 RUB</dd></div><div><dt>You get</dt><dd>13,514 CZK</dd></div><div><dt>Rate</dt><dd>3.70</dd></div><div><dt>City</dt><dd>Prague</dd></div></dl>${kb(1, ["Publish", "Promote with Stars", "Edit"])}`,
      { read: 2000 }
    );
    await tap(preview, "Publish");

    await bot(`<p>${ok}Published in the Prague feed and city channel.</p>`, { read: 2200 });

    await bot(
      `<p class="msg__title">New response</p><ul class="replies"><li><span>Dmitry <span class="replies__rating">★ 4.9</span></span><span class="replies__rate">3.70</span></li></ul><p class="msg__note">Accepts your rate</p>`,
      { think: 1300, read: 1300 }
    );
    const counter = await bot(
      `<p class="msg__title">Counter-offer</p><ul class="replies"><li><span>Anna <span class="replies__rating">★ 5.0</span></span><span class="replies__rate">3.65</span></li></ul><p class="msg__note">You would get 13,699 CZK</p><p class="trust"><span class="trust__chip">Phone checked</span><span class="trust__chip">Not in spam lists</span></p>${kb(2, ["Choose Dmitry", "Choose Anna"])}`,
      { read: 2200 }
    );
    await tap(counter, "Choose Anna");

    await bot(`<p class="msg__title">Deal with Anna started</p><p>Write here, and the bot passes your messages on.</p>`, { read: 1100 });
    await bot(`<p class="msg__from">Anna</p><p>Hi! Where shall we meet?</p>`, { cls: "msg--relay", read: 900 });
    await type("Somewhere central?");
    const where = await bot(`<p>Choose a meeting point.</p>${kb(1, ["Open the map"])}`, { read: 900 });
    await tap(where, "Open the map");
    await mapSheet();

    await bot(
      `<p class="msg__title">Meeting point set</p><p>Wenceslas Square, today at 17:30</p><div class="map"><span class="map__pin"></span></div>`,
      { read: 2200 }
    );
    const done = await bot(`<p>Did the exchange happen?</p>${kb(2, ["Yes, all good", "Problem"])}`, { think: 1200 });
    await tap(done, "Yes, all good");

    const rating = await bot(
      `<p>Anna confirmed too.</p><p class="msg__title">Rate Anna</p>${kb(5, ["★", "★", "★", "★", "★"])}`,
      { read: 900 }
    );
    await rate(rating);
    await bot(`<p>${ok}Deal closed. Thanks for the rating!</p>`, { read: 3200 });
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
    chat.innerHTML = fallback;
    composer.remove();
    sheet.remove();
    scrim.remove();
  };

  chat.innerHTML = "";
  loop();
})();
