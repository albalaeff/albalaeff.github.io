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

  /* ---------- Deal demo in the phone ---------- */
  const chat = document.querySelector("[data-demo]");
  if (!chat) return;

  const steps = [...chat.querySelectorAll("[data-step]")];
  const replay = document.querySelector(".demo__replay");
  const typing = document.createElement("div");
  typing.className = "msg typing is-hidden";
  typing.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(typing);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  let run = 0;

  const reveal = async (el) => {
    el.classList.add("is-entering");
    el.classList.remove("is-hidden");
    await nextFrame();
    el.classList.remove("is-entering");
  };

  const play = async () => {
    const id = ++run;
    if (replay) replay.hidden = true;
    steps.forEach((el) => el.classList.add("is-hidden"));
    await wait(400);

    for (const el of steps) {
      if (id !== run) return;
      chat.appendChild(typing);
      if (el.dataset.step === "bot") {
        await reveal(typing);
        await wait(900);
        if (id !== run) return;
        typing.classList.add("is-hidden");
      } else {
        await wait(700);
        if (id !== run) return;
      }
      // Keep DOM order equal to reveal order, so replays stay in sequence.
      chat.insertBefore(el, typing);
      await reveal(el);
      await wait(el.dataset.step === "bot" ? 1100 : 500);
    }
    if (replay && id === run) replay.hidden = false;
  };

  const showAll = () => {
    run++;
    typing.classList.add("is-hidden");
    steps.forEach((el) => el.classList.remove("is-hidden", "is-entering"));
  };

  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    showAll();
    return;
  }

  // Hide before it scrolls into view, then play once when it does.
  steps.forEach((el) => el.classList.add("is-hidden"));
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        play();
      }
    },
    { threshold: 0.45 }
  );
  io.observe(chat.closest(".phone") || chat);

  replay?.addEventListener("click", play);
  reduceMotion.addEventListener("change", (e) => {
    if (e.matches) showAll();
  });
})();
