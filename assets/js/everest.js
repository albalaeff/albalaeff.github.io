/* Everest scene for the "In development" section of the home page.
   A climber high on the summit ridge in the blue hour before dawn, moving up
   a fixed rope with the rest step: slide the jumar, step up, lock the
   downhill leg, breathe. At an anchor he bends down and moves the jumar past
   it. Far ahead, other climbers' headlamps on the summit pyramid; the wind
   blows spindrift off the ridge and a plume off the summit.
   Canvas 2D, no dependencies. Runs only while on screen and the tab is
   visible; with reduced motion it draws one still frame. */
(() => {
  "use strict";

  const host = document.querySelector("[data-everest]");
  const canvas = host && host.querySelector("canvas");
  const ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const seeded = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const rot = (x, y, a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  };
  const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* ---------- The ridge: world units are metres, y up ---------- */
  const SLOPE = 0.36;
  const G = (x) => x * SLOPE + 0.15 * Math.sin(x * 0.29 + 0.6) + 0.06 * Math.sin(x * 0.77 + 2.1) + 0.022 * Math.sin(x * 1.9 + 0.3);
  const dG = (x) => SLOPE + 0.0435 * Math.cos(x * 0.29 + 0.6) + 0.0462 * Math.cos(x * 0.77 + 2.1) + 0.0418 * Math.cos(x * 1.9 + 0.3);

  // Fixed-rope anchors (snow pickets); the rope is tied 30 cm above the snow
  const A0 = 3.1;
  const GAP = 26;
  const anchorX = (i) => A0 + i * GAP + (i ? (hash(i + 0.37) - 0.5) * 5 : 0);
  const anchorAt = (i) => {
    const x = anchorX(i);
    return { i, x, y: G(x) + 0.3 };
  };
  const anchorBefore = (x) => {
    let i = Math.floor((x - A0) / GAP);
    while (anchorX(i + 1) <= x) i++;
    while (anchorX(i) > x) i--;
    return i;
  };

  /* ---------- The climber's body ---------- */
  const THIGH = 0.43;
  const SHIN = 0.43;
  const LEG = THIGH + SHIN;
  const ANK = 0.105; // ankle above the sole
  const BALL = 0.16; // ball of the foot, ahead of the ankle
  const SPINE = 0.49; // pelvis to shoulder
  const UPPER = 0.31;
  const FORE = 0.28;
  const ARM = UPPER + FORE;
  const LEAN = 0.42; // forward lean at rest, radians
  const OFF = { x: 0.17, y: -0.31 }; // jumar relative to the shoulder at rest

  // A foot standing flat on the snow at x (crampon points sink in a little)
  const planted = (x) => {
    const a = Math.atan(dG(x));
    const oy = G(x) + 0.012;
    return { ax: x - Math.sin(a) * ANK, ay: oy + Math.cos(a) * ANK, a };
  };

  // The rear foot during the push: the heel peels off around the ball of the
  // foot just enough for the leg to reach; past that the toe leaves the snow.
  const peeled = (x, P, give = 0) => {
    const base = planted(x);
    const reach = LEG - 0.003 - give;
    const far = (f) => Math.hypot(P.x - f.ax, P.y - f.ay);
    if (far(base) <= reach) return base;
    const a = base.a;
    const px = x + Math.cos(a) * BALL;
    const py = G(x) + 0.012 + Math.sin(a) * BALL;
    const vx = base.ax - px;
    const vy = base.ay - py;
    const at = (b) => {
      const r = rot(vx, vy, -b);
      return { ax: px + r.x, ay: py + r.y, a: a - b };
    };
    let lo = 0;
    let hi = 1.0;
    const top = at(hi);
    if (far(top) > reach) {
      const d = far(top);
      const k = (d - reach) / d;
      top.ax += (P.x - top.ax) * k;
      top.ay += (P.y - top.ay) * k;
      return top;
    }
    for (let n = 0; n < 16; n++) {
      const m = (lo + hi) / 2;
      if (far(at(m)) > reach) lo = m;
      else hi = m;
    }
    return at(hi);
  };

  // Pelvis over the locked downhill leg (rest), and straight over the foot (top of the push)
  const restPelvis = (x) => {
    const f = planted(x);
    return { x: f.ax + 0.1, y: f.ay + Math.sqrt(LEG * LEG - 0.01) * 0.984 };
  };
  const highPelvis = (x) => {
    const f = planted(x);
    return { x: f.ax + 0.035, y: f.ay + Math.sqrt(LEG * LEG - 0.035 * 0.035) * 0.99 };
  };
  const shoulderOf = (P, al) => ({
    x: P.x + Math.sin(al) * SPINE + Math.cos(al) * 0.03,
    y: P.y + Math.cos(al) * SPINE - Math.sin(al) * 0.03,
  });

  // Two-bone IK. bend = +1 puts the middle joint on the left of the line (knee forward
  // for a leg pointing down), -1 on the right (elbow down for an arm pointing forward).
  let strain = 0; // how far a limb had to stretch past its length (debug only)
  const ik = (A, B, l1, l2, bend) => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d0 = Math.hypot(dx, dy) || 1e-6;
    strain = Math.max(strain, d0 - (l1 + l2));
    const d = clamp(d0, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const r = rot(dx / d0, dy / d0, bend * Math.acos(c));
    const M = { x: A.x + r.x * l1, y: A.y + r.y * l1 };
    const ux = (B.x - M.x) / (Math.hypot(B.x - M.x, B.y - M.y) || 1);
    const uy = (B.y - M.y) / (Math.hypot(B.x - M.x, B.y - M.y) || 1);
    return { M, end: { x: M.x + ux * l2, y: M.y + uy * l2 } };
  };

  /* ---------- The fixed rope ---------- */
  // A rope piece between two points: a catenary (as a parabola) that lies on the
  // snow where it would sag below it. a = tension over weight per metre.
  const ropePiece = (P, Q, a, out, x0, x1) => {
    const span = Q.x - P.x;
    if (span <= 1e-3) return;
    const sag = (span * span) / (8 * a);
    const from = Math.max(P.x, x0);
    const to = Math.min(Q.x, x1);
    if (from >= to) return;
    const y = (x) => {
      const u = (x - P.x) / span;
      return Math.max(lerp(P.y, Q.y, u) - 4 * sag * u * (1 - u), G(x) + 0.016);
    };
    // dense near the ends, where a slack rope rises steeply to the anchor or the hand
    const xs = [];
    for (let x = from; x < to; x += 0.06) xs.push(x);
    for (let k = 1; k <= 8; k++) {
      xs.push(Q.x - (0.06 * k) / 8);
      xs.push(P.x + (0.06 * k) / 8);
    }
    xs.push(to);
    xs.sort((m, n) => m - n);
    for (const x of xs) if (x >= from && x <= to) out.push({ x, y: y(x) });
    if (Q.x <= x1) out.push({ x: Q.x, y: Q.y });
  };

  const ROPE_T = 40; // the climber's light pull: the rope settles into the snow a few metres ahead

  // Direction of the rope just above the jumar (toward the next anchor)
  const ropeDir = (J, N) => {
    const span = Math.max(N.x - J.x, 0.05);
    const k = (N.y - J.y) / span - span / (2 * ROPE_T);
    const n = Math.hypot(1, k);
    return { x: 1 / n, y: k / n };
  };

  /* ---------- Motion: rest step, jumar, anchor transfer ---------- */
  const man = {
    feet: [0, 0.38], // world x of each foot: 0 is the near (left) foot, 1 the far one
    rear: 0, // the downhill, weighted foot
    mode: "rest",
    t: 0,
    dur: 2.2,
    look: false,
    steps: 0,
    nextLook: 4,
    len: 0.38,
    j: null, // jumar on the rope
    j0: null,
    j1: null,
    pre: 0.6,
    on: true, // jumar clipped to the rope
    tr: null,
    done: -99, // last anchor passed
    breath: 0.15,
    da: null,
    pose: null,
  };

  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  man.j = add(shoulderOf(restPelvis(man.feet[0]), LEAN), OFF);

  const nextAnchor = () => anchorAt(anchorBefore(man.j.x) + 1);

  const startRest = () => {
    const m = man;
    m.mode = "rest";
    m.t = 0;
    const front = m.feet[1 - m.rear];
    const a = nextAnchor();
    const d = a.x - restPelvis(m.feet[m.rear]).x;
    if (a.i !== m.done && d < 0.46) {
      startTransfer(a);
      return;
    }
    m.look = m.steps >= m.nextLook;
    if (m.look) m.nextLook = m.steps + 7 + Math.floor(hash(m.steps * 0.71) * 4);
    m.dur = m.look ? 4.8 : 1.55 + hash(m.steps * 3.1 + 0.2) * 1.1;
    m.len = 0.35 + hash(m.steps * 1.7 + 0.5) * 0.07;
    // Coming up to an anchor, adjust the step so that two rests from now it is right
    // in front of the feet (the next rest is already set by the front foot)
    const d1 = a.x - restPelvis(front).x;
    if (a.i !== m.done && d1 >= 0.46 && d1 - m.len < 0.25) m.len = clamp(d1 - 0.35, 0.2, 0.42);
    // the jumar slides up the rope as far as the body will go on the next step
    m.j0 = { ...m.j };
    let j1 = add(shoulderOf(restPelvis(front), LEAN), OFF);
    const stop = a.x - 0.08;
    if (j1.x > stop) {
      const k = (stop - m.j0.x) / (j1.x - m.j0.x || 1);
      j1 = k > 0 ? mix(m.j0, j1, k) : { ...m.j0 };
    }
    m.j1 = j1;
  };

  const startMove = () => {
    man.mode = "move";
    man.t = 0;
    man.dur = 1.45;
  };

  const startTransfer = (a) => {
    const m = man;
    m.mode = "transfer";
    m.t = 0;
    m.dur = 3.7;
    m.look = false;
    const S = shoulderOf(restPelvis(m.feet[m.rear]), LEAN);
    const back = { x: m.j.x - a.x, y: m.j.y - a.y };
    const bl = Math.hypot(back.x, back.y) || 1;
    m.tr = {
      a,
      j0: { ...m.j },
      below: { x: a.x + (back.x / bl) * 0.07, y: a.y + (back.y / bl) * 0.07 },
      over: { x: a.x + 0.012, y: a.y + 0.085 },
      above: { x: a.x + 0.075, y: a.y + 0.03 },
      end: { x: Math.max(S.x + 0.29, a.x + 0.12), y: S.y - 0.3 },
    };
  };

  startRest();

  const update = (dt) => {
    const m = man;
    m.t += dt;
    m.breath += dt / (m.mode === "move" ? 1.2 : 1.55);
    if (m.t >= m.dur) {
      if (m.mode === "rest") startMove();
      else if (m.mode === "move") {
        const swung = m.rear;
        m.feet[swung] = m.feet[1 - swung] + m.len;
        m.rear = 1 - swung;
        m.steps++;
        m.j = { ...m.j1 };
        startRest();
      } else {
        m.done = m.tr.a.i;
        m.j = { ...m.tr.end };
        m.on = true;
        m.steps++;
        startRest();
      }
    }
    m.pose = pose(dt);
  };

  const pose = (dt = 1 / 60) => {
    const m = man;
    const r = m.rear;
    const f = 1 - r;
    const feet = [null, null];
    let P;
    let al = LEAN;
    let psi = -0.42;
    let j = m.j;
    let on = true;
    let hand = null; // where the near hand is, when it isn't on the jumar
    let heave = 1;

    if (m.mode === "rest") {
      P = restPelvis(m.feet[r]);
      feet[r] = planted(m.feet[r]);
      feet[f] = planted(m.feet[f]);
      const p = m.t / m.dur;
      if (m.look) {
        const up = smooth(0.1, 0.34, p) * (1 - smooth(0.74, 0.94, p));
        psi = lerp(-0.42, 0.06, up);
        al = lerp(LEAN, 0.17, up);
        heave = 1.5;
        // he straightens up only as far as the hand on the jumar allows
        while (al < LEAN && dist(shoulderOf(P, al), m.j0) > 0.5) al += 0.01;
      }
      // reach forward with the jumar before stepping, as far as the arm allows
      const S = shoulderOf(P, al);
      let f6 = 0.6 * ease((m.t - (m.dur - 0.62)) / 0.62);
      while (f6 > 0 && dist(S, mix(m.j0, m.j1, f6)) > 0.5) f6 -= 0.02;
      j = mix(m.j0, m.j1, Math.max(0, f6));
      m.pre = Math.max(0, f6);
    } else if (m.mode === "move") {
      const p = m.t / m.dur;
      const A = restPelvis(m.feet[r]);
      const B = highPelvis(m.feet[f]);
      const C = restPelvis(m.feet[f]);
      P = p < 0.55 ? mix(A, B, ease(p / 0.55)) : mix(B, C, ease((p - 0.55) / 0.45));
      al = LEAN + 0.085 * Math.sin(Math.PI * clamp(p / 0.85, 0, 1));
      psi = -0.42 - 0.12 * Math.sin(Math.PI * p);
      feet[f] = planted(m.feet[f]);
      const xNew = m.feet[f] + m.len;
      const S0 = 0.34;
      const S1 = 0.9;
      const give = (q) => 0.07 * smooth(0.1, S0, q);
      if (p < S0) feet[r] = peeled(m.feet[r], P, give(p));
      else if (p < S1) {
        const P0 = mix(A, B, ease(S0 / 0.55));
        const st = peeled(m.feet[r], P0, give(S0));
        const en = planted(xNew);
        const s = (p - S0) / (S1 - S0);
        const e = ease(s);
        feet[r] = {
          ax: lerp(st.ax, en.ax, e),
          ay: lerp(st.ay, en.ay, e) + 0.1 * Math.sin(Math.PI * s),
          a: lerp(st.a, en.a, e) + 0.16 * Math.sin(Math.PI * s) * s,
        };
      } else feet[r] = planted(xNew);
      const f0 = m.pre ?? 0.6;
      j = mix(m.j0, m.j1, f0 + (1 - f0) * ease(p / 0.3));
    } else {
      const t = m.t;
      const T = m.tr;
      const c = smooth(0, 0.95, t) * (1 - smooth(1.95, 2.95, t));
      P = restPelvis(m.feet[r]);
      const fwd = clamp(T.a.x - P.x - 0.27, 0, 0.12);
      P = { x: P.x + fwd * c, y: P.y - 0.26 * c };
      al = LEAN + (0.9 - LEAN) * c;
      psi = lerp(-0.42, -1.02, c);
      feet[r] = planted(m.feet[r]);
      feet[f] = planted(m.feet[f]);
      heave = 1.3;
      if (t < 0.95) j = mix(T.j0, T.below, ease((t - 0.1) / 0.85));
      else if (t < 1.5) {
        on = false;
        const s = ease((t - 0.95) / 0.55);
        const q1 = mix(T.below, T.over, s);
        const q2 = mix(T.over, T.above, s);
        hand = mix(q1, q2, s);
        j = hand;
      } else if (t < 1.75) {
        j = { x: T.above.x, y: T.above.y + 0.006 * Math.sin(((t - 1.5) / 0.25) * TAU) };
      } else j = mix(T.above, T.end, ease((t - 1.75) / 1.15));
    }
    m.j = j;
    m.on = on;

    // breathing: inhale lifts and straightens the chest a little
    const br = 0.5 - 0.5 * Math.cos(TAU * m.breath);
    al -= 0.014 * br * heave;
    P = { x: P.x, y: P.y + 0.004 * br * heave };

    const n = { x: Math.sin(al), y: Math.cos(al) };
    const S = shoulderOf(P, al);
    const neck = { x: P.x + n.x * 0.55, y: P.y + n.y * 0.55 };
    const tilt = al + 0.25 + Math.max(0, -psi - 0.2) * 0.45;
    const Hc = { x: neck.x + Math.sin(tilt) * 0.12, y: neck.y + Math.cos(tilt) * 0.12 };
    psi += 0.03 * Math.sin(TAU * m.breath + 1) * heave;

    // legs
    const hips = [
      { x: P.x + 0.01, y: P.y },
      { x: P.x - 0.015, y: P.y },
    ];
    const knees = [0, 1].map((i) => ik(hips[i], { x: feet[i].ax, y: feet[i].ay }, THIGH, SHIN, 1).M);

    // arms: near hand on the jumar grip, far hand on the rope just above it
    const N = nextAnchor();
    const dir = ropeDir(j, N);
    if (on) {
      const raw = Math.atan2(dir.y, dir.x);
      m.da = m.da == null ? raw : m.da + Math.atan2(Math.sin(raw - m.da), Math.cos(raw - m.da)) * (1 - Math.exp(-dt / 0.12));
    }
    const da = m.da;
    const grip = add(j, rot(0.035, -0.052, da));
    const S2 = { x: S.x - 0.02, y: S.y + 0.008 };
    // far hand on the rope just above the jumar; closer in while bent over an anchor
    let fo = m.mode === "transfer" ? lerp(0.13, 0.075, smooth(0, 0.4, m.t) * (1 - smooth(2.6, 3.2, m.t))) : 0.13;
    let farHand = add(j, rot(fo, -0.01, da));
    while (fo > 0.03 && dist(S2, farHand) > ARM - 0.025) {
      fo -= 0.01;
      farHand = add(j, rot(fo, -0.01, da));
    }
    const nearArm = ik(S, grip, UPPER, FORE, -1);
    const farArm = ik(S2, farHand, UPPER, FORE, -1);

    // headlamp, mask valve
    const g = rot(1, 0, psi);
    const lamp = add(Hc, rot(0.085, 0.108, psi));
    const valve = add(Hc, rot(0.158, -0.075, psi));
    const beam = rot(1, 0, psi - 0.1);

    return {
      P, al, psi, n, S, S2, neck, Hc, hips, knees, feet, j, on, dir, da, grip,
      elbow: nearArm.M, hand: nearArm.end, elbow2: farArm.M, hand2: farArm.end,
      g, lamp, valve, beam, br, heave, N,
    };
  };

  /* ---------- Colours (already in the blue-hour light) ---------- */
  const shade = (hex, f) => {
    const v = parseInt(hex.slice(1), 16);
    const ch = (s) => Math.round(((v >> s) & 255) * f);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  };
  const NEAR = {
    suit: "#982c27", panel: "#1a1a21", baffle: "rgba(24,4,6,0.42)",
    boot: "#b0842c", rand: "#17171c", steel: "#a3acc0", mitt: "#16171d", cuff: "#74241f",
  };
  const FAR = {};
  for (const k of Object.keys(NEAR)) FAR[k] = NEAR[k].startsWith("#") ? shade(NEAR[k], 0.58) : NEAR[k];
  // light falls from behind him (the dawn) and from the sky above
  const LIGHT = { x: -0.62, y: 0.78 };
  const tones = (hex, f = 1) => ({ dark: shade(hex, 0.55 * f), base: shade(hex, f), light: shade(hex, 1.32 * f) });
  NEAR.suitT = tones(NEAR.suit);
  FAR.suitT = tones(NEAR.suit, 0.58);
  NEAR.panelT = tones("#24242c");
  FAR.panelT = tones("#24242c", 0.6);
  NEAR.bootT = tones(NEAR.boot);
  FAR.bootT = tones(NEAR.boot, 0.58);
  const cylinder = (c, A, B, r, T) => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1;
    let px = -dy / d;
    let py = dx / d;
    if (px * LIGHT.x + py * LIGHT.y < 0) {
      px = -px;
      py = -py;
    }
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    const g = c.createLinearGradient(mx - px * r, my - py * r, mx + px * r, my + py * r);
    g.addColorStop(0, T.dark);
    g.addColorStop(0.45, T.base);
    g.addColorStop(0.8, T.light);
    g.addColorStop(1, T.base);
    return g;
  };
  const KIT = {
    pack: "#262e47", lid: "#313a59", strap: "#15171f", bottle: "#c4652f", reg: "#8b93a2",
    mask: "#131418", valve: "#3c404a", frame: "#0e0f12", harness: "#1d2029", sling: "#2f6bd0",
    jumar: "#b5bdca", grip: "#c9332c", axe: "#9aa2b4", lamp: "#2a2d36", hose: "#2b313d",
  };

  /* ---------- Drawing helpers (world units) ---------- */
  const capsule = (c, A, B, ra, rb) => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    const ang = Math.atan2(dy, dx);
    const off = Math.acos(clamp((ra - rb) / d, -1, 1));
    c.beginPath();
    c.arc(A.x, A.y, ra, ang + off, ang + TAU - off);
    c.arc(B.x, B.y, rb, ang - off, ang + off);
    c.closePath();
  };
  const rrect = (c, x, y, w, h, r) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  // stitched down baffles across a limb
  const baffles = (c, A, B, ra, rb, col, ts) => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    c.strokeStyle = col;
    c.lineWidth = 0.007;
    c.beginPath();
    for (const t of ts) {
      const r = lerp(ra, rb, t) * 0.92;
      const cx = A.x + dx * t;
      const cy = A.y + dy * t;
      c.moveTo(cx - uy * r, cy + ux * r);
      c.quadraticCurveTo(cx + ux * 0.018, cy + uy * 0.018, cx + uy * r, cy - ux * r);
    }
    c.stroke();
  };

  const drawBoot = (c, F, p) => {
    c.save();
    c.translate(F.ax + Math.sin(F.a) * ANK, F.ay - Math.cos(F.a) * ANK);
    c.rotate(F.a);
    // crampon: frame, ten down points, two front points
    c.fillStyle = p.steel;
    c.beginPath();
    for (const x of [-0.082, -0.046, 0.004, 0.054, 0.104, 0.15]) {
      c.moveTo(x - 0.011, -0.002);
      c.lineTo(x + 0.003, -0.033);
      c.lineTo(x + 0.011, -0.002);
    }
    c.moveTo(0.186, 0.004);
    c.lineTo(0.266, -0.024);
    c.lineTo(0.2, -0.012);
    c.fill();
    c.fillRect(-0.09, -0.009, 0.29, 0.009);
    // boot
    c.beginPath();
    c.moveTo(-0.105, 0);
    c.lineTo(0.2, 0);
    c.quadraticCurveTo(0.248, 0.004, 0.243, 0.046);
    c.quadraticCurveTo(0.236, 0.088, 0.172, 0.102);
    c.lineTo(0.085, 0.132);
    c.lineTo(0.072, 0.256);
    c.lineTo(-0.086, 0.256);
    c.lineTo(-0.098, 0.12);
    c.quadraticCurveTo(-0.122, 0.052, -0.105, 0);
    c.closePath();
    const bg2 = c.createLinearGradient(-0.1, 0.25, 0.18, 0.0);
    bg2.addColorStop(0, p.bootT.light);
    bg2.addColorStop(0.5, p.bootT.base);
    bg2.addColorStop(1, p.bootT.dark);
    c.fillStyle = bg2;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = p.rand;
    c.fillRect(-0.15, -0.01, 0.45, 0.04); // rubber rand
    c.beginPath(); // toe cap
    c.ellipse(0.2, 0.03, 0.06, 0.045, 0, 0, TAU);
    c.fill();
    c.fillRect(-0.15, 0.226, 0.4, 0.05); // gaiter collar
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 0.006;
    c.beginPath(); // gaiter zip
    c.moveTo(0.06, 0.22);
    c.lineTo(0.09, 0.115);
    c.stroke();
    c.restore();
    c.restore();
  };

  const drawLeg = (c, H, K, F, p) => {
    const A = { x: F.ax, y: F.ay };
    capsule(c, H, K, 0.108, 0.084);
    c.fillStyle = cylinder(c, H, K, 0.108, p.suitT);
    c.fill();
    baffles(c, H, K, 0.108, 0.084, p.baffle, [0.3, 0.55, 0.8]);
    capsule(c, K, A, 0.082, 0.068);
    c.fillStyle = cylinder(c, K, A, 0.082, p.suitT);
    c.fill();
    // black scuff guard on the lower leg, above the boot
    c.save();
    c.clip();
    const u = { x: (A.x - K.x) / (dist(A, K) || 1), y: (A.y - K.y) / (dist(A, K) || 1) };
    const m = { x: K.x + u.x * 0.17, y: K.y + u.y * 0.17 };
    c.beginPath();
    c.moveTo(m.x - u.y * 0.2, m.y + u.x * 0.2);
    c.quadraticCurveTo(m.x + u.x * 0.03, m.y + u.y * 0.03, m.x + u.y * 0.2, m.y - u.x * 0.2);
    c.lineTo(A.x + u.y * 0.2 + u.x * 0.2, A.y - u.x * 0.2 + u.y * 0.2);
    c.lineTo(A.x - u.y * 0.2 + u.x * 0.2, A.y + u.x * 0.2 + u.y * 0.2);
    c.closePath();
    c.fillStyle = cylinder(c, K, A, 0.082, p.panelT);
    c.fill();
    c.restore();
    baffles(c, K, m, 0.082, 0.075, p.baffle, [0.55]);
    drawBoot(c, F, p);
  };

  const drawArm = (c, S, E, Hd, p) => {
    capsule(c, S, E, 0.074, 0.063);
    c.fillStyle = cylinder(c, S, E, 0.074, p.suitT);
    c.fill();
    baffles(c, S, E, 0.074, 0.063, p.baffle, [0.4, 0.7]);
    capsule(c, E, Hd, 0.061, 0.05);
    c.fillStyle = cylinder(c, E, Hd, 0.061, p.suitT);
    c.fill();
    baffles(c, E, Hd, 0.06, 0.05, p.baffle, [0.45]);
    const a = Math.atan2(Hd.y - E.y, Hd.x - E.x);
    c.save();
    c.translate(Hd.x, Hd.y);
    c.rotate(a);
    c.fillStyle = p.cuff;
    rrect(c, -0.07, -0.058, 0.05, 0.116, 0.02);
    c.fill();
    c.beginPath(); // summit mitt
    c.ellipse(0.012, -0.006, 0.072, 0.056, 0, 0, TAU);
    c.fillStyle = p.mitt;
    c.fill();
    c.restore();
  };

  // Torso, pack, oxygen and harness, drawn in the torso's frame: x forward, y up the spine
  const drawTorso = (c, Q) => {
    c.save();
    c.translate(Q.P.x, Q.P.y);
    c.rotate(-Q.al);
    const Lx = LIGHT.x * Math.cos(Q.al) - LIGHT.y * Math.sin(Q.al);
    const Ly = LIGHT.x * Math.sin(Q.al) + LIGHT.y * Math.cos(Q.al);
    const lit = (cx, cy, r, T) => {
      const g = c.createLinearGradient(cx - Lx * r, cy - Ly * r, cx + Lx * r, cy + Ly * r);
      g.addColorStop(0, T.dark);
      g.addColorStop(0.5, T.base);
      g.addColorStop(0.85, T.light);
      g.addColorStop(1, T.base);
      return g;
    };
    // ice axe strapped to the pack: shaft down the side, head at the top
    c.strokeStyle = KIT.axe;
    c.lineCap = "round";
    c.lineWidth = 0.019;
    c.beginPath();
    c.moveTo(-0.37, -0.06);
    c.lineTo(-0.345, 0.47);
    c.stroke();
    c.fillStyle = KIT.axe;
    c.beginPath(); // spike
    c.moveTo(-0.38, -0.055);
    c.lineTo(-0.372, -0.1);
    c.lineTo(-0.36, -0.055);
    c.fill();
    c.beginPath(); // pick and adze
    c.moveTo(-0.41, 0.49);
    c.quadraticCurveTo(-0.35, 0.495, -0.27, 0.452);
    c.lineTo(-0.272, 0.468);
    c.quadraticCurveTo(-0.35, 0.515, -0.41, 0.507);
    c.closePath();
    c.fill();
    // the pack: tapered, fuller at the top, with a lid and compression straps
    c.beginPath();
    c.moveTo(-0.12, 0.08);
    c.bezierCurveTo(-0.2, 0.06, -0.31, 0.07, -0.335, 0.13);
    c.bezierCurveTo(-0.37, 0.25, -0.385, 0.4, -0.36, 0.5);
    c.bezierCurveTo(-0.34, 0.575, -0.2, 0.585, -0.13, 0.55);
    c.closePath();
    c.fillStyle = lit(-0.24, 0.32, 0.18, { dark: "#151a2c", base: KIT.pack, light: "#3c4766" });
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = 0.012;
    c.beginPath();
    c.moveTo(-0.352, 0.22);
    c.lineTo(-0.135, 0.235);
    c.moveTo(-0.37, 0.38);
    c.lineTo(-0.135, 0.39);
    c.stroke();
    c.beginPath(); // lid
    c.moveTo(-0.13, 0.51);
    c.bezierCurveTo(-0.2, 0.505, -0.33, 0.49, -0.365, 0.53);
    c.bezierCurveTo(-0.37, 0.585, -0.25, 0.615, -0.13, 0.585);
    c.closePath();
    c.fillStyle = lit(-0.25, 0.55, 0.12, { dark: "#1b2136", base: KIT.lid, light: "#48557a" });
    c.fill();
    // orange oxygen cylinder and regulator above the lid
    c.fillStyle = lit(-0.245, 0.62, 0.05, { dark: "#6d3519", base: KIT.bottle, light: "#e98a4f" });
    rrect(c, -0.285, 0.578, 0.078, 0.068, 0.022);
    c.fill();
    c.fillStyle = KIT.reg;
    c.fillRect(-0.266, 0.64, 0.042, 0.04);
    c.beginPath();
    c.arc(-0.232, 0.662, 0.017, 0, TAU);
    c.fill();
    // the down suit
    c.beginPath();
    c.moveTo(-0.13, -0.05);
    c.bezierCurveTo(-0.15, 0.12, -0.14, 0.36, -0.125, 0.47);
    c.bezierCurveTo(-0.1, 0.54, 0.02, 0.56, 0.08, 0.52);
    c.bezierCurveTo(0.17, 0.47, 0.205, 0.36, 0.19, 0.24);
    c.bezierCurveTo(0.182, 0.12, 0.16, 0.02, 0.1, -0.05);
    c.bezierCurveTo(0.05, -0.1, -0.08, -0.1, -0.13, -0.05);
    c.closePath();
    c.fillStyle = lit(0.03, 0.24, 0.3, NEAR.suitT);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = lit(0.03, 0.5, 0.2, NEAR.panelT); // black shoulder yoke
    c.beginPath();
    c.moveTo(-0.2, 0.43);
    c.quadraticCurveTo(0.05, 0.49, 0.25, 0.39);
    c.lineTo(0.25, 0.7);
    c.lineTo(-0.2, 0.7);
    c.fill();
    c.strokeStyle = NEAR.baffle;
    c.lineWidth = 0.007;
    c.beginPath();
    for (const y of [0.07, 0.165, 0.26, 0.35]) {
      c.moveTo(-0.16, y + 0.012);
      c.quadraticCurveTo(0.02, y - 0.014, 0.22, y + 0.014);
    }
    c.stroke();
    c.fillStyle = KIT.harness; // harness waist belt
    c.beginPath();
    c.moveTo(-0.2, -0.005);
    c.lineTo(0.25, 0.02);
    c.lineTo(0.25, 0.068);
    c.lineTo(-0.2, 0.043);
    c.fill();
    c.restore();
    // shoulder strap over the suit
    c.strokeStyle = KIT.strap;
    c.lineWidth = 0.032;
    c.lineCap = "butt";
    c.beginPath();
    c.moveTo(-0.13, 0.5);
    c.quadraticCurveTo(0.04, 0.53, 0.115, 0.3);
    c.stroke();
    c.lineWidth = 0.02; // chest strap buckle
    c.beginPath();
    c.moveTo(0.1, 0.33);
    c.lineTo(0.19, 0.33);
    c.stroke();
    c.restore();
  };

  const toWorld = (Q, x, y) => add(Q.P, rot(x, y, -Q.al));
  const headPt = (Q, x, y) => add(Q.Hc, rot(x, y, Q.psi));

  const drawHose = (c, Q) => {
    const A = toWorld(Q, -0.225, 0.68);
    const B = toWorld(Q, 0.02, 0.69);
    const D = headPt(Q, 0.06, -0.1);
    c.strokeStyle = KIT.hose;
    c.lineWidth = 0.022;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(A.x, A.y);
    c.quadraticCurveTo(B.x, B.y, D.x, D.y);
    c.stroke();
  };

  const drawHead = (c, Q, sky) => {
    // collar: the hood grows out of the suit, no bare neck
    capsule(c, Q.neck, mix(Q.neck, Q.Hc, 0.75), 0.1, 0.09);
    c.fillStyle = cylinder(c, Q.neck, Q.Hc, 0.1, NEAR.suitT);
    c.fill();
    c.save();
    c.translate(Q.Hc.x, Q.Hc.y);
    c.rotate(Q.psi);
    const Lx = LIGHT.x * Math.cos(-Q.psi) - LIGHT.y * Math.sin(-Q.psi);
    const Ly = LIGHT.x * Math.sin(-Q.psi) + LIGHT.y * Math.cos(-Q.psi);
    // hood with a stiff brim over the goggles
    c.beginPath();
    c.moveTo(0.075, 0.115);
    c.bezierCurveTo(0.02, 0.15, -0.1, 0.15, -0.135, 0.06);
    c.bezierCurveTo(-0.16, -0.02, -0.12, -0.12, -0.04, -0.14);
    c.bezierCurveTo(0.03, -0.15, 0.08, -0.14, 0.1, -0.11);
    c.lineTo(0.13, 0.05);
    c.quadraticCurveTo(0.15, 0.085, 0.16, 0.09);
    c.quadraticCurveTo(0.13, 0.115, 0.075, 0.115);
    c.closePath();
    const hg = c.createRadialGradient(Lx * 0.08 - 0.01, Ly * 0.08, 0.01, -0.01, 0, 0.17);
    hg.addColorStop(0, NEAR.suitT.light);
    hg.addColorStop(0.55, NEAR.suitT.base);
    hg.addColorStop(1, NEAR.suitT.dark);
    c.fillStyle = hg;
    c.fill();
    c.strokeStyle = NEAR.baffle;
    c.lineWidth = 0.007;
    c.beginPath();
    c.moveTo(0.02, 0.135);
    c.quadraticCurveTo(-0.07, 0.04, -0.03, -0.13);
    c.stroke();
    c.beginPath(); // face opening, in shadow under the brim
    c.ellipse(0.085, -0.01, 0.06, 0.088, 0.1, 0, TAU);
    c.fillStyle = "#0c0c11";
    c.fill();
    // goggles with the dawn sky in the lens
    c.fillStyle = KIT.frame;
    rrect(c, 0.066, -0.004, 0.088, 0.058, 0.022);
    c.fill();
    c.fillStyle = sky;
    rrect(c, 0.078, 0.004, 0.07, 0.042, 0.016);
    c.fill();
    c.fillStyle = "rgba(255,235,220,0.55)";
    c.beginPath();
    c.ellipse(0.124, 0.034, 0.015, 0.006, -0.3, 0, TAU);
    c.fill();
    // oxygen mask with its exhale valve
    c.beginPath();
    c.moveTo(0.064, -0.02);
    c.quadraticCurveTo(0.152, -0.016, 0.172, -0.058);
    c.quadraticCurveTo(0.178, -0.104, 0.115, -0.122);
    c.quadraticCurveTo(0.058, -0.13, 0.046, -0.075);
    c.closePath();
    c.fillStyle = KIT.mask;
    c.fill();
    c.beginPath();
    c.arc(0.158, -0.075, 0.022, 0, TAU);
    c.fillStyle = KIT.valve;
    c.fill();
    c.strokeStyle = "rgba(160,170,190,0.35)";
    c.lineWidth = 0.005;
    c.beginPath();
    c.arc(0.158, -0.075, 0.013, 0, TAU);
    c.stroke();
    // headlamp strap and body
    c.strokeStyle = "#0f1015";
    c.lineWidth = 0.013;
    c.beginPath();
    c.moveTo(0.07, 0.112);
    c.bezierCurveTo(0.0, 0.155, -0.11, 0.13, -0.142, 0.03);
    c.stroke();
    c.fillStyle = KIT.lamp;
    rrect(c, 0.058, 0.093, 0.052, 0.036, 0.01);
    c.fill();
    c.restore();
  };

  const drawJumar = (c, Q) => {
    // sling from the harness to the jumar
    const belay = toWorld(Q, 0.2, 0.035);
    const hole = add(Q.j, rot(-0.03, -0.055, Q.da));
    c.strokeStyle = KIT.sling;
    c.lineWidth = 0.013;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(belay.x, belay.y);
    c.quadraticCurveTo((belay.x + hole.x) / 2, Math.min(belay.y, hole.y) - 0.05, hole.x, hole.y);
    c.stroke();
    c.save();
    c.translate(Q.j.x, Q.j.y);
    c.rotate(Q.da);
    c.fillStyle = KIT.jumar;
    rrect(c, -0.035, -0.014, 0.16, 0.026, 0.008);
    c.fill();
    c.fillRect(-0.03, -0.06, 0.014, 0.05);
    c.fillRect(0.088, -0.05, 0.014, 0.04);
    c.fillStyle = KIT.grip;
    rrect(c, -0.026, -0.078, 0.13, 0.034, 0.014);
    c.fill();
    c.restore();
  };

  /* ---------- Canvas, layers, layout ---------- */
  let W = 0;
  let H = 0;
  let dpr = 1;
  let k = 90; // pixels per metre
  let X0 = 0;
  let Y0 = 0;
  let L = null; // layout of the background
  const bg = document.createElement("canvas");
  const layer = document.createElement("canvas");
  const rim = document.createElement("canvas");
  const lctx = layer.getContext("2d");
  const rctx = rim.getContext("2d");
  const sprites = {};

  const sprite = (r, g, b) => {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const c = s.getContext("2d");
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    return s;
  };
  sprites.warm = sprite(255, 228, 196);
  sprites.pink = sprite(255, 206, 196);
  sprites.cool = sprite(200, 212, 240);
  sprites.snow = sprite(232, 238, 255);
  sprites.shade = sprite(8, 10, 32);
  sprites.mist = sprite(96, 88, 140);

  const makeGrain = () => {
    const s = document.createElement("canvas");
    s.width = s.height = 128;
    const c = s.getContext("2d");
    const img = c.createImageData(128, 128);
    const rnd = seeded(91);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 2 + rnd() * 5;
    }
    c.putImageData(img, 0, 0);
    return s;
  };

  const inPoly = (pts, x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };

  const layout = () => {
    const rect = host.getBoundingClientRect();
    W = Math.max(200, Math.round(rect.width));
    H = Math.max(200, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const wide = W / H;
    k = Math.min(H / 6.0, W / 4.4);
    X0 = W * (wide > 1.3 ? 0.33 : 0.37);
    Y0 = H * 0.8;

    const hor = H * 0.585;
    const S = { x: W * (wide > 1.3 ? 0.78 : 0.84), y: H * 0.12 };
    const sc = Math.min(H, W * 1.05);
    // south-east ridge in profile: summit, Hillary Step, cornice traverse, South Summit,
    // then the long ridge down; below the horizon the face falls away behind our ridge
    const left = [
      [0, 0], [-0.026, 0.028], [-0.046, 0.064], [-0.052, 0.09], [-0.08, 0.102], [-0.11, 0.11],
      [-0.133, 0.1], [-0.152, 0.106], [-0.18, 0.138], [-0.23, 0.2], [-0.29, 0.282], [-0.345, 0.37],
      [-0.39, 0.46], [-0.43, 0.56], [-0.47, 0.7], [-0.5, 0.86],
    ].map(([x, y]) => ({ x: S.x + x * sc, y: S.y + y * sc }));
    // break up the long lower ridge with small rock steps and towers
    for (let i = left.length - 2; i >= 8; i--) {
      const a = left[i];
      const b = left[i + 1];
      const extra = [];
      for (let q = 1; q < 4; q++) {
        const t = q / 4;
        const jag = (hash(i * 7 + q) - 0.5) * sc * 0.012 + (q === 2 ? -sc * 0.006 : 0);
        extra.push({ x: lerp(a.x, b.x, t) + jag * 0.6, y: lerp(a.y, b.y, t) - Math.abs(jag) });
      }
      left.splice(i + 1, 0, ...extra);
    }
    const right = [[0.035, 0.04], [0.09, 0.085], [0.17, 0.15], [0.3, 0.25], [0.5, 0.39]].map(([x, y]) => ({
      x: S.x + x * sc,
      y: S.y + y * sc,
    }));
    const pyramid = [...left.slice().reverse(), ...right, { x: S.x + 0.5 * sc, y: H * 1.2 }, { x: left[left.length - 1].x, y: H * 1.2 }];
    L = { hor, S, sc, left, right, pyramid, glow: { x: W * 0.2, y: hor } };

    // stars, only where the sky is open
    const rnd = seeded(7);
    L.stars = [];
    const count = Math.round((W * H) / 2300);
    for (let i = 0; i < count * 3 && L.stars.length < count; i++) {
      const x = rnd() * W;
      const y = Math.pow(rnd(), 1.35) * hor * 0.95;
      if (inPoly(pyramid, x, y)) continue;
      const nearGlow = smooth(hor * 0.45, hor * 0.95, y) * (1 - smooth(W * 0.1, W * 0.7, Math.abs(x - L.glow.x)) * 0.6);
      const big = rnd() < 0.08;
      L.stars.push({
        x, y,
        r: big ? 0.9 + rnd() * 0.5 : 0.35 + rnd() * 0.45,
        a: (0.35 + rnd() * 0.6) * (1 - nearGlow * 0.9),
        f: 0.5 + rnd() * 1.8,
        p: rnd() * TAU,
      });
    }

    // the route of the distant headlamps: just below the south-east ridge skyline
    const route = [];
    for (let i = left.length - 1; i >= 0; i--) {
      const q = left[i];
      if (q.y < S.y + sc * 0.12 || q.y > S.y + sc * 0.5) continue;
      route.push({ x: q.x + 1.4, y: q.y + 2 });
    }
    let len = 0;
    for (let i = 1; i < route.length; i++) len += dist(route[i - 1], route[i]);
    L.route = route;
    L.routeLen = len;

    buildBackground();
    layer.width = rim.width = Math.ceil(2.05 * k * dpr);
    layer.height = rim.height = Math.ceil(2.15 * k * dpr);
    resetParticles();
  };

  const routeAt = (s) => {
    let d = s * L.routeLen;
    const r = L.route;
    for (let i = 1; i < r.length; i++) {
      const seg = dist(r[i - 1], r[i]);
      if (d <= seg) return mix(r[i - 1], r[i], d / seg);
      d -= seg;
    }
    return r[r.length - 1];
  };

  const buildBackground = () => {
    bg.width = canvas.width;
    bg.height = canvas.height;
    const b = bg.getContext("2d");
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { hor, S, sc, left, pyramid, glow } = L;
    const v = (y) => clamp(y / H, 0, 1);

    // sky
    const sky = b.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#02040c");
    sky.addColorStop(v(hor * 0.45), "#050b20");
    sky.addColorStop(v(hor * 0.78), "#0c1736");
    sky.addColorStop(v(hor * 0.95), "#1d2550");
    sky.addColorStop(v(hor), "#363160");
    sky.addColorStop(1, "#0d1029");
    b.fillStyle = sky;
    b.fillRect(0, 0, W, H);

    // dawn glow low on the horizon, behind the climber
    const glowAt = (rx, ry, stops) => {
      b.save();
      b.globalCompositeOperation = "screen";
      b.translate(glow.x, glow.y);
      b.scale(1, ry / rx);
      const g = b.createRadialGradient(0, 0, 0, 0, 0, rx);
      for (const [o, c] of stops) g.addColorStop(o, c);
      b.fillStyle = g;
      b.fillRect(-rx, -rx, rx * 2, rx * 2);
      b.restore();
    };
    glowAt(W * 1.1, H * 0.5, [[0, "rgba(120,70,130,0.35)"], [0.5, "rgba(60,40,100,0.16)"], [1, "rgba(0,0,0,0)"]]);
    glowAt(W * 0.95, H * 0.17, [
      [0, "rgba(255,172,112,0.95)"], [0.16, "rgba(244,130,104,0.62)"], [0.4, "rgba(176,88,128,0.3)"],
      [0.72, "rgba(80,56,118,0.12)"], [1, "rgba(0,0,0,0)"],
    ]);

    // distant peaks on the horizon, backlit
    const rnd = seeded(23);
    const peaks = [
      { x: 0.05, h: 0.03, w: 0.07 }, { x: 0.15, h: 0.068, w: 0.11 }, { x: 0.255, h: 0.034, w: 0.07 },
      { x: 0.36, h: 0.05, w: 0.09 }, { x: 0.52, h: 0.026, w: 0.08 },
    ];
    b.beginPath();
    b.moveTo(0, hor + 2);
    for (let x = 0; x <= W; x += 2) {
      let h = 0;
      for (const p of peaks) {
        const t = 1 - Math.abs(x / W - p.x) / (p.w * (H / W) * 1.6);
        if (t > 0) h = Math.max(h, p.h * H * Math.pow(t, 1.25));
      }
      const u = x / H;
      const rough = Math.sin(u * 61) * 0.45 + Math.sin(u * 127 + 1.3) * 0.25 + Math.sin(u * 23 + 0.4) * 0.6 + (rnd() - 0.5) * 0.25;
      h += rough * Math.min(H * 0.006, h * 0.18);
      b.lineTo(x, hor - h);
    }
    b.lineTo(W, hor + 2);
    b.closePath();
    const pk = b.createLinearGradient(0, hor - H * 0.07, 0, hor);
    pk.addColorStop(0, "#3a2f5c");
    pk.addColorStop(1, "#2a2650");
    b.fillStyle = pk;
    b.fill();
    b.save();
    b.clip();
    b.globalCompositeOperation = "screen";
    const rimg = b.createLinearGradient(0, 0, W * 0.7, 0);
    rimg.addColorStop(0, "rgba(255,150,120,0.22)");
    rimg.addColorStop(1, "rgba(255,150,120,0)");
    b.fillStyle = rimg;
    b.fillRect(0, hor - H * 0.08, W, H * 0.08);
    b.restore();

    // sea of clouds far below
    const cloudTop = hor + H * 0.004;
    const cg = b.createLinearGradient(0, cloudTop, 0, cloudTop + H * 0.24);
    cg.addColorStop(0, "#544a7a");
    cg.addColorStop(0.15, "#433f70");
    cg.addColorStop(0.55, "#2c2d5a");
    cg.addColorStop(1, "#1a1d42");
    b.fillStyle = cg;
    b.fillRect(0, cloudTop, W, H - cloudTop);
    b.save();
    b.globalCompositeOperation = "screen";
    const cl = b.createRadialGradient(glow.x, cloudTop, 0, glow.x, cloudTop, W * 0.9);
    cl.addColorStop(0, "rgba(255,160,130,0.28)");
    cl.addColorStop(0.5, "rgba(170,100,140,0.1)");
    cl.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = cl;
    b.fillRect(0, cloudTop, W, H);
    b.restore();
    // cumulus tops in perspective: small and flat near the horizon, bigger closer in.
    // Each is a dome of puffs, lit on top from the dawn side, with shadow beneath.
    b.save();
    const crnd = seeded(41);
    const heaps = [];
    for (let i = 0; i < 90; i++) {
      const t = Math.pow(crnd(), 1.35);
      heaps.push({ t, x: crnd() * (W + H * 0.4) - H * 0.2, w: H * (0.05 + t * 0.32) * (0.6 + crnd() * 0.7), seed: crnd() * 1000 });
    }
    heaps.sort((m, n) => m.t - n.t);
    for (const q of heaps) {
      const y = cloudTop + H * 0.01 + q.t * (H - cloudTop);
      const flat = 0.16 + q.t * 0.22;
      const lit = (1 - smooth(0, W, Math.abs(q.x - glow.x))) * (1 - q.t * 0.55);
      b.globalCompositeOperation = "source-over";
      b.globalAlpha = 0.22 + q.t * 0.12;
      b.drawImage(sprites.shade, q.x - q.w * 0.7, y - q.w * flat * 0.15, q.w * 1.4, q.w * flat * 1.1);
      const n = 5 + Math.floor(hash(q.seed) * 4);
      for (let v = 0; v < n; v++) {
        const u = (v + 0.5) / n - 0.5 + (hash(q.seed + v) - 0.5) * 0.12;
        const r = q.w * (0.13 + hash(q.seed + v * 3.1) * 0.1);
        const bx = q.x + u * q.w * 0.9;
        const by = y - Math.sqrt(Math.max(0, 0.26 - u * u)) * q.w * flat * 1.4;
        b.globalCompositeOperation = "source-over";
        b.globalAlpha = 0.16;
        b.drawImage(sprites.mist, bx - r, by - r * flat * 2.2, r * 2, r * flat * 4.4);
        b.globalCompositeOperation = "screen";
        b.globalAlpha = 0.04 + 0.16 * lit;
        b.drawImage(q.t < 0.35 ? sprites.pink : sprites.cool, bx - r * 0.8, by - r * flat * 2.6, r * 1.6, r * flat * 2.6);
      }
    }
    b.restore();
    const haze = b.createLinearGradient(0, hor - H * 0.03, 0, hor + H * 0.03);
    haze.addColorStop(0, "rgba(255,170,140,0)");
    haze.addColorStop(0.5, "rgba(255,170,140,0.09)");
    haze.addColorStop(1, "rgba(255,170,140,0)");
    b.fillStyle = haze;
    b.fillRect(0, hor - H * 0.03, W, H * 0.06);

    // the summit pyramid
    const path = () => {
      b.beginPath();
      pyramid.forEach((p, i) => (i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y)));
      b.closePath();
    };
    path();
    const pg = b.createLinearGradient(S.x - sc * 0.3, S.y, S.x + sc * 0.25, S.y + sc * 0.55);
    pg.addColorStop(0, "#2c2a52");
    pg.addColorStop(0.4, "#191d3d");
    pg.addColorStop(1, "#0d1130");
    b.fillStyle = pg;
    b.fill();
    b.save();
    b.clip();
    // the face turned away from the dawn is in deeper shadow
    const nf = b.createLinearGradient(S.x - sc * 0.05, 0, S.x + sc * 0.22, 0);
    nf.addColorStop(0, "rgba(4,6,20,0)");
    nf.addColorStop(1, "rgba(4,6,20,0.5)");
    b.fillStyle = nf;
    b.fillRect(S.x - sc * 0.05, 0, sc, H);
    // snow flutings and rock ribs running down the fall line of the west face
    b.lineCap = "round";
    for (let i = 0; i < 44; i++) {
      const t = Math.pow(rnd(), 1.3) * 0.62;
      const seg = Math.floor(t * (left.length - 1));
      const top = mix(left[seg], left[seg + 1], rnd());
      const x = top.x + (2 + rnd() * sc * 0.16);
      const y = top.y + rnd() * sc * 0.02;
      const l = sc * (0.02 + rnd() * 0.09) * (1 - t * 0.5);
      const fall = 0.2 + rnd() * 0.5; // dx per dy, down and to the right
      const snow = rnd() < 0.62;
      const up = 1 - smooth(S.y, S.y + sc * 0.35, y);
      b.strokeStyle = snow ? `rgba(${Math.round(150 + 90 * up)},${Math.round(156 + 40 * up)},${Math.round(205 - 20 * up)},${0.04 + rnd() * 0.05 + up * 0.08})` : `rgba(2,3,14,${0.12 + rnd() * 0.12})`;
      b.lineWidth = snow ? 0.5 + rnd() * 0.9 : 0.8 + rnd() * 1.4;
      b.beginPath();
      b.moveTo(x, y);
      b.quadraticCurveTo(x + l * fall * 0.4, y + l * 0.55, x + l * fall + (rnd() - 0.5) * l * 0.12, y + l);
      b.stroke();
    }
    // broad snowfields and rock bands across the face
    for (let i = 0; i < 40; i++) {
      const t = rnd();
      const top = left[Math.floor(t * (left.length - 2))];
      const x = top.x + sc * (0.02 + rnd() * 0.3);
      const y = top.y + sc * (0.02 + rnd() * 0.18);
      const r = sc * (0.03 + rnd() * 0.08);
      const dark = rnd() < 0.55;
      b.globalAlpha = dark ? 0.35 : 0.1;
      b.drawImage(dark ? sprites.shade : sprites.cool, x - r, y - r * 0.4, r * 2, r * 0.8);
    }
    b.globalAlpha = 1;
    // first light on the summit: alpenglow
    b.globalCompositeOperation = "screen";
    const ag = b.createRadialGradient(S.x - sc * 0.03, S.y + sc * 0.03, 0, S.x - sc * 0.03, S.y + sc * 0.03, sc * 0.26);
    ag.addColorStop(0, "rgba(255,158,122,0.72)");
    ag.addColorStop(0.3, "rgba(232,112,118,0.38)");
    ag.addColorStop(0.65, "rgba(120,66,118,0.12)");
    ag.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = ag;
    b.fillRect(S.x - sc * 0.4, S.y - sc * 0.1, sc * 0.8, sc * 0.6);
    // the face drops into haze below the horizon
    b.globalCompositeOperation = "source-over";
    const fh = b.createLinearGradient(0, S.y + sc * 0.25, 0, hor + H * 0.12);
    fh.addColorStop(0, "rgba(22,26,60,0)");
    fh.addColorStop(0.55, "rgba(32,32,70,0.5)");
    fh.addColorStop(1, "rgba(30,30,66,0.92)");
    b.fillStyle = fh;
    b.fillRect(0, S.y + sc * 0.25, W, H);
    b.restore();
    // the ridge skyline catches the light near the top
    b.lineCap = "round";
    for (let i = 1; i < left.length; i++) {
      const t = i / (left.length - 1);
      b.strokeStyle = `rgba(255,176,140,${0.75 * Math.pow(1 - t, 1.6)})`;
      b.lineWidth = 1.2;
      b.beginPath();
      b.moveTo(left[i - 1].x, left[i - 1].y);
      b.lineTo(left[i].x, left[i].y);
      b.stroke();
    }
    b.strokeStyle = "rgba(255,190,160,0.35)";
    b.beginPath();
    b.moveTo(S.x, S.y);
    b.lineTo(L.right[0].x, L.right[0].y);
    b.stroke();

    // dither so the dark gradients don't band
    b.globalAlpha = 1;
    const dither = makeGrain();
    b.fillStyle = b.createPattern(dither, "repeat");
    b.fillRect(0, 0, W, H);
  };

  /* ---------- Things that move in the air ---------- */
  let plume = [];
  let drift = [];
  let puffs = [];
  let lamps = [];
  let wisps = [];

  const resetParticles = () => {
    const rnd = seeded(5);
    plume = [];
    for (let i = 0; i < 50; i++) plume.push(newPlume(rnd() * 14));
    const n = Math.round(clamp((W * H) / 2600, 60, 170));
    drift = [];
    for (let i = 0; i < n; i++) drift.push(newDrift(true));
    lamps = [];
    for (const s0 of [0.08, 0.13, 0.31, 0.47, 0.52, 0.71, 0.9]) lamps.push({ s: s0 + rnd() * 0.03, v: 0.004 + rnd() * 0.003, p: rnd() * TAU, b: 0.55 + rnd() * 0.45 });
    wisps = [];
    for (let i = 0; i < 4; i++) {
      wisps.push({ x: rnd() * W * 1.4 - W * 0.2, y: L.hor + H * (0.02 + rnd() * 0.08), w: H * (0.14 + rnd() * 0.18), v: 4 + rnd() * 6 });
    }
  };

  const newPlume = (age = 0) => ({
    age,
    life: 10 + Math.random() * 5,
    vx: 0.026 + Math.random() * 0.02,
    vy: -0.004 + Math.random() * 0.012,
    s: Math.random() * TAU,
    r0: 0.01 + Math.random() * 0.014,
  });

  // Spindrift: snow grains blown up the ridge, mostly within a metre of the surface
  const newDrift = (anywhere) => ({
    x: anywhere ? Math.random() * W : -10 - Math.random() * 80,
    h: 0.03 + Math.pow(Math.random(), 2.4) * 2.2, // metres above the snow
    z: 0.6 + Math.random() * 1.1, // depth: < 1 behind the climber, > 1 in front of him
    s: Math.random() * TAU,
    f: 1.5 + Math.random() * 2.5,
    life: anywhere ? 1 : 0,
    y: 0,
  });
  let flurries = [];

  /* ---------- Camera ---------- */
  const cam = { x: 0, v: 0, y: 0 };
  const groundScreenY = (sx) => Y0 - (G(cam.x + (sx - X0) / k) - cam.y) * k;
  const toScreen = (p) => ({ x: X0 + (p.x - cam.x) * k, y: Y0 - (p.y - cam.y) * k });

  let gust = 0.5;
  let clock = 0;

  const advance = (dt) => {
    clock += dt;
    update(dt);
    // camera follows the pelvis with a soft spring, so steps don't jerk the scene
    const target = man.pose.P.x - 0.1;
    const w = 1.1;
    cam.v += (w * w * (target - cam.x) - 2 * w * cam.v) * dt;
    cam.x += cam.v * dt;
    cam.y = cam.x * SLOPE + 0.6 * 0.15 * Math.sin(cam.x * 0.29 + 0.6);

    gust = clamp(0.42 + 0.3 * Math.sin(clock * 0.23) + 0.2 * Math.sin(clock * 0.61 + 1.3) + 0.12 * Math.sin(clock * 1.7 + 0.4), 0, 1);
    const wind = k * (2.2 + 6.5 * gust); // px per second

    for (const q of plume) {
      q.age += dt;
      if (q.age > q.life) Object.assign(q, newPlume());
    }
    for (const q of drift) {
      q.life += dt;
      q.x += wind * (0.45 + q.z * 0.45) * (0.6 + 0.4 * Math.min(1, q.h)) * dt;
      const hop = q.h * (0.75 + 0.35 * gust) + 0.06 * Math.sin(q.life * q.f + q.s);
      q.y = groundScreenY(q.x) - Math.max(0.01, hop) * k;
      if (q.x > W + 20) Object.assign(q, newDrift(false));
    }
    // in a strong gust the wind lifts whole clouds of snow off the crest
    if (gust > 0.62 && Math.random() < dt * 6 * (gust - 0.55)) {
      flurries.push({ x: Math.random() * W * 0.9 - W * 0.1, age: 0, life: 1.4 + Math.random(), r: 0.3 + Math.random() * 0.5, z: Math.random() < 0.5 ? 0.8 : 1.3 });
    }
    for (const q of flurries) {
      q.age += dt;
      q.x += wind * 0.55 * dt;
    }
    flurries = flurries.filter((q) => q.age < q.life && q.x < W + 80);
    // breath: exhale through the mask valve, condensing in the cold
    const ph = man.breath % 1;
    const exhale = ph > 0.5 && ph < 0.8;
    if (exhale && Math.random() < dt * (man.mode === "move" ? 9 : 14) * (man.pose.heave || 1)) {
      const V = toScreen(man.pose.valve);
      puffs.push({ x: V.x, y: V.y, age: 0, life: 1.3 + Math.random() * 0.6, vx: (0.25 + Math.random() * 0.2) * k, vy: (Math.random() * 0.14 - 0.02) * k, r: 0.02 + Math.random() * 0.02 });
    }
    for (const q of puffs) {
      q.age += dt;
      q.x += (q.vx + wind * 0.08) * dt;
      q.y += q.vy * dt;
      q.vx *= Math.exp(-dt * 1.4);
      q.vy -= 0.05 * k * dt;
    }
    puffs = puffs.filter((q) => q.age < q.life);
    for (const q of lamps) {
      q.s += q.v * dt * (0.25 + 0.75 * Math.max(0, Math.sin(clock * 0.35 + q.p)));
      if (q.s > 1) q.s -= 1;
    }
    for (const q of wisps) {
      q.x += q.v * dt;
      if (q.x - q.w > W) q.x = -q.w;
    }
  };

  /* ---------- One frame ---------- */
  // Spindrift and gusts of snow, behind (front = false) or in front of the climber.
  // Grains inside the headlamp beam light up.
  const snow = (front, Q) => {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const Ls = toScreen(Q.lamp);
    const bx = Q.beam.x;
    const by = -Q.beam.y;
    const wind = k * (2.2 + 6.5 * gust);
    const reach = 4.2 * k;
    c.globalCompositeOperation = "screen";
    for (const q of flurries) {
      if (q.z > 1 !== front) continue;
      const t = q.age / q.life;
      const gy = groundScreenY(q.x);
      const r = q.r * k * (0.6 + t);
      c.globalAlpha = 0.11 * Math.sin(Math.PI * t) * q.z;
      c.drawImage(sprites.snow, q.x - r * 1.6, gy - r * (0.6 + t * 0.9), r * 3.2, r * 1.3);
    }
    c.globalCompositeOperation = "source-over";
    c.lineCap = "round";
    for (const q of drift) {
      if (q.z > 1 !== front) continue;
      const gy = groundScreenY(q.x);
      if (!front && q.y > gy) continue;
      const v = wind * (0.45 + q.z * 0.45);
      const len = Math.min(v * 0.012, 12) * (0.35 + q.z * 0.35) * (0.5 + hash(q.s) * 0.8);
      const dx = q.x - Ls.x;
      const dy = q.y - Ls.y;
      const d = Math.hypot(dx, dy) || 1;
      const cos = (dx * bx + dy * by) / d;
      let glow = 0;
      if (cos > 0.97 && d < reach && q.y < gy) glow = smooth(0.97, 0.995, cos) * (1 - d / reach);
      const base = 0.3 * Math.pow(1 - q.h / 2.3, 2) * (0.35 + 0.8 * gust) * Math.min(1, q.life * 3) * (front ? 0.7 : 1);
      c.globalAlpha = clamp(base + glow, 0, 1);
      c.strokeStyle = glow > 0.08 ? "#fff0d8" : "#d6def6";
      c.lineWidth = 0.45 + q.z * 0.4;
      c.beginPath();
      c.moveTo(q.x - len, q.y + len * 0.12);
      c.lineTo(q.x, q.y);
      c.stroke();
    }
    c.globalAlpha = 1;
  };

  const draw = () => {
    const c = ctx;
    const Q = man.pose;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.drawImage(bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // stars
    c.fillStyle = "#e8edff";
    for (const s of L.stars) {
      const tw = 0.72 + 0.28 * Math.sin(clock * s.f * TAU * 0.3 + s.p) * Math.sin(clock * s.f * 0.9 + s.p * 2);
      c.globalAlpha = s.a * tw;
      if (s.r < 0.7) c.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
      else {
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, TAU);
        c.fill();
      }
    }

    // the plume streaming off the summit
    c.globalCompositeOperation = "screen";
    for (const q of plume) {
      const a = 0.15 * smooth(0, 1.6, q.age) * (1 - smooth(q.life * 0.35, q.life, q.age));
      if (a <= 0.002) continue;
      const x = L.S.x + 0.006 * H + q.vx * H * q.age;
      const y = L.S.y + 0.004 * H + q.vy * H * q.age + Math.sin(q.age * 0.8 + q.s) * H * 0.004 + q.age * q.age * H * 0.0004;
      const r = H * (q.r0 + q.age * 0.009);
      c.globalAlpha = a;
      c.drawImage(q.age < 4 ? sprites.pink : sprites.cool, x - r * 1.5, y - r * 0.75, r * 3, r * 1.5);
    }

    // other climbers' headlamps on the summit pyramid
    c.globalCompositeOperation = "lighter";
    for (const q of lamps) {
      const p = routeAt(q.s);
      const fade = smooth(0, 0.06, q.s) * (1 - smooth(0.9, 1, q.s));
      const fl = 0.7 + 0.3 * Math.sin(clock * 2.7 + q.p * 5) * Math.sin(clock * 1.1 + q.p);
      c.globalAlpha = 0.32 * fade * fl * q.b;
      c.drawImage(sprites.warm, p.x - 4, p.y - 4, 8, 8);
      c.globalAlpha = 0.9 * fade * fl * q.b;
      c.drawImage(sprites.warm, p.x - 1.1, p.y - 1.1, 2.2, 2.2);
    }

    // cloud wisps drifting over the sea of clouds
    c.globalCompositeOperation = "screen";
    for (const q of wisps) {
      c.globalAlpha = 0.12;
      c.drawImage(sprites.cool, q.x - q.w, q.y - q.w * 0.07, q.w * 2, q.w * 0.14);
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;

    // ---- world space: ridge, rope, climber ----
    const xl = cam.x - X0 / k - 0.3;
    const xr = cam.x + (W - X0) / k + 0.3;
    const yb = cam.y - (H - Y0) / k - 0.5;
    c.setTransform(dpr * k, 0, 0, -dpr * k, dpr * (X0 - cam.x * k), dpr * (Y0 + cam.y * k));

    const ridge = new Path2D();
    ridge.moveTo(xl, yb);
    for (let x = xl; x <= xr + 0.04; x += 2.5 / k) ridge.lineTo(x, G(x));
    ridge.lineTo(xr + 0.05, G(xr + 0.05));
    ridge.lineTo(xr + 0.05, yb);
    ridge.closePath();
    const ang = Math.atan(SLOPE);
    const C0 = { x: cam.x, y: G(cam.x) };
    const fg = c.createLinearGradient(C0.x, C0.y, C0.x + Math.sin(ang) * 3.4, C0.y - Math.cos(ang) * 3.4);
    fg.addColorStop(0, "#3a4474");
    fg.addColorStop(0.03, "#2c3560");
    fg.addColorStop(0.16, "#1c2246");
    fg.addColorStop(0.42, "#10142e");
    fg.addColorStop(1, "#05071a");
    c.fillStyle = fg;
    c.fill(ridge);

    // everything below sits under the crest, so no clipping is needed
    // wind-scoured patches, lighter and darker
    for (let i = Math.floor(xl / 1.6) - 2; i <= Math.ceil(xr / 1.6) + 1; i++) {
      const x = i * 1.6 + hash(i * 3.3) * 1.6;
      const r = 0.5 + hash(i * 8.1) * 1.1;
      const dep = 0.4 + r * 0.4 + hash(i * 5.9) * 2;
      const light = hash(i * 2.2) < 0.45;
      c.save();
      c.translate(x, G(x) - dep);
      c.rotate(Math.atan(SLOPE));
      c.scale(1, 0.32);
      c.globalAlpha = light ? 0.1 : 0.34;
      c.drawImage(light ? sprites.cool : sprites.shade, -r, -r, r * 2, r * 2);
      c.restore();
    }
    c.globalAlpha = 1;
    // wind ripples (sastrugi) on the snow face
    for (let i = Math.floor(xl / 0.7) - 2; i <= Math.ceil(xr / 0.7); i++) {
      for (let m = 0; m < 2; m++) {
        const h1 = hash(i * 3.17 + m * 11.3);
        const h2 = hash(i * 7.31 + m * 5.1);
        const h3 = hash(i * 1.93 + m * 2.7);
        const x = i * 0.7 + h1 * 0.7;
        const dep = 0.18 + Math.pow(h2, 1.4) * 2.6;
        const len = 0.3 + h3 * 0.9;
        const y0 = G(x) - dep;
        const y1 = G(x + len) - dep - 0.03;
        const fade = 1 - dep / 3;
        c.lineWidth = 0.012;
        c.strokeStyle = `rgba(150,165,220,${0.11 * fade})`;
        c.beginPath();
        c.moveTo(x, y0);
        c.quadraticCurveTo(x + len / 2, (y0 + y1) / 2 + 0.035, x + len, y1);
        c.stroke();
        c.strokeStyle = `rgba(2,4,18,${0.22 * fade})`;
        c.beginPath();
        c.moveTo(x + 0.02, y0 - 0.016);
        c.quadraticCurveTo(x + len / 2, (y0 + y1) / 2 + 0.018, x + len, y1 - 0.014);
        c.stroke();
      }
    }
    // rock outcrops breaking through the snow: lit tops, snow lying on them
    for (let i = Math.floor(xl / 3.2) - 1; i <= Math.ceil(xr / 3.2); i++) {
      if (hash(i * 4.7 + 1.1) > 0.42) continue;
      const x = i * 3.2 + hash(i * 2.3) * 3.2;
      const dep = 0.6 + hash(i * 6.1) * 1.8;
      const s0 = 0.16 + hash(i * 8.9) * 0.3;
      const cy = G(x) - dep;
      const pts2 = [];
      for (let v = 0; v < 11; v++) {
        const a = (v / 11) * TAU;
        const rr = s0 * (0.7 + hash(i * 13 + v) * 0.5);
        const up = Math.sin(a) > 0;
        pts2.push({ x: x + Math.cos(a) * rr * 1.25, y: cy + Math.sin(a) * rr * (up ? 0.62 : 0.3) + Math.cos(a) * rr * SLOPE * 0.8 });
      }
      c.save();
      c.translate(x, cy - s0 * 0.3);
      c.scale(1, 0.35);
      c.globalAlpha = 0.5;
      c.drawImage(sprites.shade, -s0 * 2.4, -s0 * 2.4, s0 * 4.8, s0 * 4.8);
      c.restore();
      c.globalAlpha = 1;
      const rock = new Path2D();
      pts2.forEach((q, v) => (v ? rock.lineTo(q.x, q.y) : rock.moveTo(q.x, q.y)));
      rock.closePath();
      const rg = c.createLinearGradient(0, cy + s0 * 0.6, 0, cy - s0 * 0.3);
      rg.addColorStop(0, "#2b3152");
      rg.addColorStop(0.45, "#151a33");
      rg.addColorStop(1, "#090c1c");
      c.fillStyle = rg;
      c.fill(rock);
      c.save();
      c.clip(rock);
      c.fillStyle = "rgba(150,165,220,0.3)"; // snow caught on the top
      c.beginPath();
      c.ellipse(x - s0 * 0.1, cy + s0 * 0.62, s0 * 0.9, s0 * 0.16, Math.atan(SLOPE) * 0.7, 0, TAU);
      c.fill();
      c.restore();
    }
    // the boot track along the crest
    for (let i = Math.floor(xl / 0.41); i <= Math.ceil(xr / 0.41); i++) {
      if (hash(i * 9.7) < 0.18) continue;
      const x = i * 0.41 + (hash(i * 5.3) - 0.5) * 0.18;
      const w = 0.08 + hash(i * 2.9) * 0.05;
      c.fillStyle = `rgba(4,6,22,${0.18 + hash(i * 4.1) * 0.22})`;
      c.beginPath();
      c.ellipse(x, G(x) - 0.026, w, 0.02, Math.atan(dG(x)), 0, TAU);
      c.fill();
    }
    // crest catching the sky light
    c.beginPath();
    for (let x = xl; x <= xr; x += 2.5 / k) {
      if (x === xl) c.moveTo(x, G(x));
      else c.lineTo(x, G(x));
    }
    c.strokeStyle = "rgba(196,206,245,0.42)";
    c.lineWidth = 1.1 / k;
    c.stroke();

    // headlamp: where the beam hits the snow
    const lampS = Q.lamp;
    let hit = null;
    for (let s = 0.2; s < 6; s += 0.04) {
      const px = lampS.x + Q.beam.x * s;
      const py = lampS.y + Q.beam.y * s;
      if (py < G(px)) {
        hit = { x: px, y: G(px), d: s };
        break;
      }
    }
    if (hit) {
      const I = clamp(1.5 - hit.d / 3, 0.2, 1);
      const R = 0.75 + hit.d * 0.28;
      const near = new Path2D();
      near.moveTo(hit.x - R - 0.2, hit.y - 3);
      for (let x = hit.x - R - 0.2; x <= hit.x + R + 0.2; x += 3 / k) near.lineTo(x, G(x));
      near.lineTo(hit.x + R + 0.2, hit.y - 3);
      near.closePath();
      c.save();
      c.clip(near);
      c.globalCompositeOperation = "lighter";
      c.translate(hit.x, hit.y);
      c.rotate(Math.atan(dG(hit.x)));
      c.scale(1, 0.55);
      const pool = c.createRadialGradient(0, 0, 0, 0, 0, R);
      pool.addColorStop(0, `rgba(255,232,200,${0.42 * I})`);
      pool.addColorStop(0.35, `rgba(255,220,182,${0.17 * I})`);
      pool.addColorStop(1, "rgba(255,210,170,0)");
      c.fillStyle = pool;
      c.fillRect(-R, -R, R * 2, R * 2);
      c.restore();
    }

    // pickets and the fixed rope
    const lit = hit || { x: lampS.x + Q.beam.x * 2, y: lampS.y + Q.beam.y * 2 };
    const ia = anchorBefore(xl) - 1;
    const ib = anchorBefore(xr) + 1;
    for (let i = ia; i <= ib; i++) {
      const a = anchorAt(i);
      if (a.x < xl - 0.5 || a.x > xr + 0.5) continue;
      const near = clamp(1 - dist(a, lit) / 2.2, 0, 1);
      const top = { x: a.x - 0.03, y: G(a.x) + 0.22 };
      c.strokeStyle = near > 0.05 ? `rgb(${Math.round(lerp(96, 230, near))},${Math.round(lerp(104, 222, near))},${Math.round(lerp(132, 210, near))})` : "#606884";
      c.lineWidth = 0.032;
      c.lineCap = "butt";
      c.beginPath();
      c.moveTo(a.x + 0.012, G(a.x) - 0.06);
      c.lineTo(top.x, top.y);
      c.stroke();
      c.lineWidth = 0.012;
      c.beginPath(); // sling and carabiner up to the rope
      c.moveTo(top.x, top.y - 0.02);
      c.lineTo(a.x, a.y - 0.02);
      c.stroke();
      c.beginPath();
      c.ellipse(a.x, a.y - 0.01, 0.022, 0.032, 0.3, 0, TAU);
      c.stroke();
    }
    const pts = [];
    const pieces = [];
    for (let i = ia; i < ib; i++) pieces.push([anchorAt(i), anchorAt(i + 1)]);
    const pi = anchorBefore(Q.j.x);
    for (const [P, R] of pieces) {
      if (Q.on && P.i === pi) {
        ropePiece(P, Q.j, 1.5, pts, xl, xr);
        ropePiece(Q.j, R, ROPE_T, pts, xl, xr);
      } else ropePiece(P, R, 2, pts, xl, xr);
      pts.push(null);
    }
    const ropeStroke = (style, width) => {
      c.strokeStyle = style;
      c.lineWidth = width;
      c.lineJoin = "round";
      c.lineCap = "round";
      c.beginPath();
      let pen = false;
      for (const p of pts) {
        if (!p) {
          pen = false;
          continue;
        }
        if (pen) c.lineTo(p.x, p.y);
        else c.moveTo(p.x, p.y);
        pen = true;
      }
      c.stroke();
    };
    ropeStroke("#7d2a2c", Math.max(0.013, 1.1 / k));
    const rl = c.createRadialGradient(lit.x, lit.y, 0, lit.x, lit.y, 1.8);
    rl.addColorStop(0, "rgba(255,120,96,0.95)");
    rl.addColorStop(1, "rgba(255,120,96,0)");
    ropeStroke(rl, Math.max(0.013, 1.1 / k));

    // the beam in the air, ending where it meets the snow
    c.save();
    c.globalCompositeOperation = "lighter";
    const R = hit ? Math.min(4.2, hit.d + 0.35) : 4.2;
    const cone = c.createRadialGradient(lampS.x, lampS.y, 0.02, lampS.x, lampS.y, R);
    cone.addColorStop(0, "rgba(255,236,206,0.06)");
    cone.addColorStop(0.3, "rgba(255,230,200,0.025)");
    cone.addColorStop(1, "rgba(255,230,200,0)");
    c.fillStyle = cone;
    // a few nested cones give the beam soft edges
    for (const w of [0.06, 0.11, 0.16, 0.22]) {
      const b1 = rot(Q.beam.x, Q.beam.y, w);
      const b2 = rot(Q.beam.x, Q.beam.y, -w);
      c.beginPath();
      c.moveTo(lampS.x, lampS.y);
      c.lineTo(lampS.x + b1.x * R, lampS.y + b1.y * R);
      c.lineTo(lampS.x + b2.x * R, lampS.y + b2.y * R);
      c.closePath();
      c.fill();
    }
    c.restore();

    snow(false, Q);

    // ---- the climber, on his own layer so he can be lit as one figure ----
    const lx0r = Q.P.x - 0.8;
    const ly1r = Q.P.y + 0.98;
    const devX = Math.floor(dpr * (X0 + (lx0r - cam.x) * k));
    const devY = Math.floor(dpr * (Y0 - (ly1r - cam.y) * k));
    const lx0 = cam.x + (devX / dpr - X0) / k;
    const ly1 = cam.y + (Y0 - devY / dpr) / k;
    const lc = lctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, layer.width, layer.height);
    lc.setTransform(dpr * k, 0, 0, -dpr * k, -dpr * k * lx0, dpr * k * ly1);
    lc.lineJoin = "round";
    const lens = lc.createLinearGradient(0, Q.Hc.y + 0.06, 0, Q.Hc.y - 0.02);
    lens.addColorStop(0, "#f2a27e");
    lens.addColorStop(0.5, "#8a5d8c");
    lens.addColorStop(1, "#22305e");
    drawArm(lc, Q.S2, Q.elbow2, Q.hand2, FAR);
    drawLeg(lc, Q.hips[1], Q.knees[1], Q.feet[1], FAR);
    drawTorso(lc, Q);
    drawLeg(lc, Q.hips[0], Q.knees[0], Q.feet[0], NEAR);
    drawHose(lc, Q);
    drawHead(lc, Q, lens);
    drawJumar(lc, Q);
    drawArm(lc, Q.S, Q.elbow, Q.hand, NEAR);
    // light: warm from the dawn behind him, cold shadow in front
    lc.globalCompositeOperation = "source-atop";
    const sh = lc.createLinearGradient(Q.P.x - 0.7, Q.P.y + 0.7, Q.P.x + 0.6, Q.P.y - 0.8);
    sh.addColorStop(0, "rgba(255,150,110,0.16)");
    sh.addColorStop(0.45, "rgba(30,30,70,0.05)");
    sh.addColorStop(1, "rgba(3,6,22,0.5)");
    lc.fillStyle = sh;
    lc.fillRect(lx0, ly1 - 2.2, 2.1, 2.25);
    // rim light: the silhouette minus itself shifted away from the light
    const rc = rctx;
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = "source-over";
    rc.clearRect(0, 0, rim.width, rim.height);
    rc.drawImage(layer, 0, 0);
    rc.globalCompositeOperation = "source-in";
    rc.fillStyle = "rgb(255,196,160)";
    rc.fillRect(0, 0, rim.width, rim.height);
    rc.globalCompositeOperation = "destination-out";
    rc.drawImage(layer, 1.3 * dpr, 0.9 * dpr);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(layer, devX, devY);
    c.globalAlpha = 0.55;
    c.drawImage(rim, devX, devY);
    c.globalAlpha = 1;

    // headlamp lens
    const Ls = toScreen(lampS);
    const fwd = toScreen({ x: lampS.x + Q.beam.x * 0.03, y: lampS.y + Q.beam.y * 0.03 });
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 0.55;
    const gr = 0.16 * k;
    c.drawImage(sprites.warm, fwd.x - gr, fwd.y - gr, gr * 2, gr * 2);
    c.globalAlpha = 1;
    c.drawImage(sprites.warm, fwd.x - 0.035 * k, fwd.y - 0.035 * k, 0.07 * k, 0.07 * k);

    // breath
    c.globalCompositeOperation = "screen";
    for (const q of puffs) {
      const t = q.age / q.life;
      const r = (q.r + t * 0.15) * k;
      c.globalAlpha = 0.3 * smooth(0, 0.12, t) * (1 - t);
      c.drawImage(sprites.snow, q.x - r, q.y - r, r * 2, r * 2);
    }

    snow(true, Q);
    c.globalAlpha = 1;

  };

  /* ---------- Run ---------- */
  let visible = false;
  let running = false;
  let last = 0;

  const frame = (now) => {
    if (!visible || document.hidden || reduce.matches) {
      running = false;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    advance(dt);
    draw();
    requestAnimationFrame(frame);
  };

  const kick = () => {
    if (running || !visible || document.hidden || reduce.matches) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  };

  // A still picture for reduced motion (and the first paint)
  const still = () => {
    for (let i = 0; i < 400; i++) advance(1 / 60);
  };

  let started = false;
  const resize = () => {
    layout();
    if (!started) {
      started = true;
      still();
      cam.x = man.pose.P.x - 0.1;
      cam.v = 0.12;
    }
    draw();
  };

  if ("ResizeObserver" in window) new ResizeObserver(() => resize()).observe(host);
  else window.addEventListener("resize", resize);
  resize();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      kick();
    }, { rootMargin: "80px" }).observe(host);
  } else {
    visible = true;
    kick();
  }
  document.addEventListener("visibilitychange", kick);
  reduce.addEventListener?.("change", () => {
    kick();
    draw();
  });
  host.classList.add("is-live");

  if (/[?&]everest-debug/.test(location.search)) {
    window.__everest = {
      man, cam,
      advance: (s, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) advance(dt); draw(); },
      advanceOnly: (dt) => advance(dt),
      draw,
      strain: () => strain,
      resetStrain: () => { strain = 0; },
      stop: () => { visible = false; },
    };
  }
})();
