/* llm3d: compare AI models by intelligence, cost per task and output tokens per task, in 3D.
   Data: Artificial Analysis (https://artificialanalysis.ai), built by scripts/build_data.py.
   Kept deliberately simple: every chart draws once per change (no per-frame redraws); the only
   per-frame work is moving the 3D camera while auto-rotate or a view change is running. */
"use strict";

const FONT = "Inter, sans-serif";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt$ = v => v < 0.1 ? "$" + v.toFixed(4) : "$" + v.toFixed(2);
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "";
const fmtDate = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- companies and colours ----------
const BRAND = {
  "OpenAI": "#3987e5", "Anthropic": "#e0662f", "Google": "#7dd3fc", "Meta": "#a3e635", "SpaceXAI": "#d4d4d4",
  "Xiaomi": "#e0c53a", "Alibaba": "#f472b6", "Z AI": "#1aa39a", "Kimi": "#c64fc4", "DeepSeek": "#cdb8ff",
  "MiniMax": "#fb7185", "StepFun": "#fdba74", "Mistral": "#fcd34d", "NVIDIA": "#86efac"
};
const QUIET = ["#9ca3af", "#a8a29e", "#94a3b8", "#b4a7d6", "#8fb8a8", "#c9a38a", "#a3a3a3", "#9fb3c8"];
const SYMBOLS = ["circle", "diamond", "square", "cross", "x", "circle-open", "diamond-open", "square-open"];
const CLASS_COLORS = ["#3987e5", "#e0662f", "#22c55e", "#c64fc4", "#e0c53a", "#7dd3fc", "#fb7185", "#a3e635", "#cdb8ff", "#fdba74", "#1aa39a", "#f472b6", "#d4d4d4", "#94a3b8"];
// A model's class is its name without version numbers or bracketed dates: "Claude Opus 5.5" → "Claude Opus",
// "Claude 4.5 Sonnet" → "Claude Sonnet", "GPT-6 Sol" → "GPT Sol", "DeepSeek V4 Pro 0813" → "DeepSeek Pro", "Kimi K2.7 Code" → "Kimi Code".
// Size tags such as "120b" stay, so "gpt-oss-120b" and "gpt-oss-20b" are separate classes.
function modelClass(label) {
  return label.replace(/\s*\([^)]*\)/g, "").replace(/(^|[\s-])[KVMkvm]?\d+(\.\d+)*(?![\dbBkK])/g, "$1").replace(/\s*-\s+|\s+-\s*|-$/g, " ").replace(/\s+/g, " ").trim();
}
function shade(hex, t) {   // t = 0 keeps the colour, larger t mixes toward the page background
  const n = parseInt(hex.slice(1), 16), mix = c => Math.round(c * (1 - t));
  return "#" + [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => mix(c).toString(16).padStart(2, "0")).join("");
}
// one colour per family: hue by class, shade by release order within the class (newest brightest)
function familyColors(c) {
  const classes = [...new Set(c.fams.map(f => modelClass(f.label)))], out = {};
  for (const [i, cls] of classes.entries()) {
    const fams = c.fams.filter(f => modelClass(f.label) === cls).sort((a, b) => b.points.map(m => m.released).sort().pop().localeCompare(a.points.map(m => m.released).sort().pop()));
    fams.forEach((f, k) => { out[f.id] = shade(CLASS_COLORS[i % CLASS_COLORS.length], Math.min(0.6, k * 0.28)); });
  }
  return out;
}
const EFFORT_ORDER = ["minimal", "low", "medium", "high", "xhigh", "max"];
// companies shown by default, in this order; every other company starts switched off
const DEFAULT_COMPANIES = ["Anthropic", "OpenAI", "Google", "SpaceXAI", "Kimi", "DeepSeek", "Z AI", "Meta", "NVIDIA", "MiniMax", "Mistral"];
// companies with their own row on the Companies tab
const COMPANY_TAB = ["Anthropic", "OpenAI", "SpaceXAI", "DeepSeek", "Kimi"];

const state = { selected: new Set(), cam: "iso", target: true, shape: "quad", reach: 50, spin: true, qon: {} };
let DATA, MODELS, FAMILIES, COMPANIES, AXES, QUARTERS;

// ---------- data ----------
function load() {
  // data/models.js sets window.LLM3D_DATA, so the page also works when opened straight from disk
  DATA = window.LLM3D_DATA;
  MODELS = DATA.models.map(m => ({ ...m }));
  const fam = new Map();
  for (const m of MODELS) {
    const key = m.company + "|" + m.familyId;
    if (!fam.has(key)) fam.set(key, { id: key, name: m.family, company: m.company, points: [] });
    fam.get(key).points.push(m);
  }
  FAMILIES = [...fam.values()];
  for (const f of FAMILIES) {
    // efforts run from lightest to heaviest; without an effort label, cheapest first
    const rank = m => m.effort ? EFFORT_ORDER.indexOf(m.effort) : -1;
    f.points.sort((a, b) => rank(a) - rank(b) || a.cost - b.cost);
    f.best = Math.max(...f.points.map(m => m.index));
    f.label = f.name.replace(/ \((Reasoning|Non-reasoning)\)$/, "");
  }
  const byCo = new Map();
  for (const f of FAMILIES) { if (!byCo.has(f.company)) byCo.set(f.company, []); byCo.get(f.company).push(f); }
  let quiet = 0;
  COMPANIES = [...byCo.entries()].map(([name, fams]) => {
    fams.sort((a, b) => b.best - a.best);
    return { name, fams, best: fams[0].best, color: BRAND[name] || QUIET[quiet++ % QUIET.length] };
  }).sort((a, b) => {
    const ia = DEFAULT_COMPANIES.indexOf(a.name), ib = DEFAULT_COMPANIES.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.best - a.best;
  });
  for (const c of COMPANIES) c.fams.forEach((f, i) => { f.color = c.color; f.symbol = SYMBOLS[i % SYMBOLS.length]; });
  AXES = {
    x: { min: 0, max: nice(Math.max(...MODELS.map(m => m.cost)) * 1.02) },
    y: { min: 0, max: nice(Math.max(...MODELS.map(m => m.tokens)) * 1.02) },
    z: { min: 0, max: 100 }
  };
  QUARTERS = quartersOf(DATA.generated);
}
function nice(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const k of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p; return 10 * p; }
const frac = (a, v) => (v - a.min) / (a.max - a.min);
const unfrac = (a, u) => a.min + u * (a.max - a.min);

// quarters of the data's year; a quarter with no releases yet stays disabled
function quartersOf(isoDate) {
  const y = +isoDate.slice(0, 4), yy = String(y).slice(2);
  const Q = [["01-01", "03-31"], ["04-01", "06-30"], ["07-01", "09-30"], ["10-01", "12-31"]];
  return Q.map(([a, b], i) => ({ id: "q" + (i + 1), label: `Q${i + 1} '${yy}`, start: `${y}-${a}`, end: `${y}-${b}`, v: `--q${i + 1}` }));
}

// ---------- efficient-scaling target ----------
// A model that scales well on both cost and tokens: it reaches a perfect 100 using only `reach`% of the chart's
// cost and token range, climbing along the chosen shape. Curve points are shares (0..1) of each axis.
const SHAPES = {
  lin:   { f: u => u,                                            math: "score = n" },
  quad:  { f: u => 1 - (1 - u) ** 2,                             math: "score = 1 − (1 − n)²" },
  cubic: { f: u => 1 - (1 - u) ** 3,                             math: "score = 1 − (1 − n)³" },
  exp:   { f: u => (1 - Math.exp(-4 * u)) / (1 - Math.exp(-4)), math: "score = (1 − e^(−4n)) / (1 − e^(−4))" },
  sqrt:  { f: u => Math.sqrt(u),                                 math: "score = √n" },
  log:   { f: u => Math.log1p(20 * u) / Math.log1p(20),          math: "score = ln(1 + 20n) / ln 21" }
};
function targetCurve() {
  const g = SHAPES[state.shape].f, e = state.reach / 100, o = [];
  for (let i = 0; i <= 120; i++) { const t = i / 120; o.push([e * t, e * t, g(t)]); }
  return o;
}
const toData = q => [unfrac(AXES.x, q[0]), unfrac(AXES.y, q[1]), unfrac(AXES.z, q[2])];
// gap between a model and the target (at its own spend), and where its connector lands on the curve
function vsTarget(m, C) {
  const a = frac(AXES.x, m.cost), b = frac(AXES.y, m.tokens), c = frac(AXES.z, m.index);
  const key = q => state.cam === "cost" ? q[0] : state.cam === "tok" ? q[1] : (q[0] + q[1]) / 2, k = key([a, b]);
  let pred = C[C.length - 1][2];
  for (let i = 1; i < C.length; i++) if (key(C[i]) >= k) { const k0 = key(C[i - 1]), k1 = key(C[i]), f = k1 > k0 ? (k - k0) / (k1 - k0) : 0; pred = C[i - 1][2] + (C[i][2] - C[i - 1][2]) * f; break; }
  let foot = [a, b, Math.min(pred, 1)];
  if (state.cam === "iso") { let best = Infinity; for (const q of C) { const d = (q[0] - a) ** 2 + (q[1] - b) ** 2 + (q[2] - c) ** 2; if (d < best) { best = d; foot = q; } } }
  return { delta: m.index - unfrac(AXES.z, pred), foot: toData(foot) };
}
const GAP = [[0, "#22c55e"], [0.5, "#f59e0b"], [1, "#ef4444"]];

// ---------- 3D scene ----------
function step(max) { const raw = max / 4.5, p = 10 ** Math.floor(Math.log10(raw)); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw) return k * p; return 10 * p; }
const range = max => Array.from({ length: Math.floor(max / step(max)) + 1 }, (_, i) => i * step(max));

// grid, walls and axes drawn as fixed 3D geometry out of the zero corner, so nothing jumps sides while rotating;
// labels are scene annotations, pinned to a 3D spot but drawn at a fixed on-screen size
function frame() {
  const { x: X, y: Y, z: Z } = AXES, g = css("--grid"), ink = css("--ink-2"), hi = css("--ink"), ann = [];
  const xv = range(X.max), yv = range(Y.max), zv = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const gx = [], gy = [], gz = [], seg = (a, b) => { gx.push(a[0], b[0], null); gy.push(a[1], b[1], null); gz.push(a[2], b[2], null); };
  xv.forEach(v => { seg([v, 0, 0], [v, Y.max, 0]); seg([v, 0, 0], [v, 0, Z.max]); });
  yv.forEach(v => { seg([0, v, 0], [X.max, v, 0]); seg([0, v, 0], [0, v, Z.max]); });
  zv.forEach(v => { seg([0, 0, v], [X.max, 0, v]); seg([0, 0, v], [0, Y.max, v]); });
  // faintly tinted vertical walls: seen through, they dim whatever is behind them, so their side reads while rotating
  const wall = (xs, ys, zs, col) => ({ type: "mesh3d", x: xs, y: ys, z: zs, i: [0, 0], j: [1, 2], k: [2, 3], color: col, opacity: 0.09,
    flatshading: true, lighting: { ambient: 1, diffuse: 0, specular: 0 }, hoverinfo: "skip", showlegend: false });
  const T = [
    wall([0, 0, 0, 0], [0, Y.max, Y.max, 0], [0, 0, Z.max, Z.max], css("--wall-a")),
    wall([0, X.max, X.max, 0], [0, 0, 0, 0], [0, 0, Z.max, Z.max], css("--wall-b")),
    { type: "scatter3d", mode: "lines", x: gx, y: gy, z: gz, line: { color: g, width: 1 }, hoverinfo: "skip", showlegend: false },
    { type: "scatter3d", mode: "lines", x: [X.max, 0, 0, 0, 0], y: [0, 0, Y.max, 0, 0], z: [0, 0, 0, 0, Z.max], line: { color: css("--ink-3"), width: 3 }, hoverinfo: "skip", showlegend: false }
  ];
  const label = (x, y, z, text, where, size, color) => ann.push({ x, y, z, text, showarrow: false, font: { family: FONT, size, color },
    xanchor: where === "left" ? "right" : "center", yanchor: where === "below" ? "top" : where === "above" ? "bottom" : "middle",
    xshift: where === "left" ? -6 : 0, yshift: where === "below" ? -4 : where === "above" ? 4 : 0 });
  // in a flat view the axis pointing at the viewer collapses to a dot, so its labels are left out
  if (state.cam !== "tok") { xv.filter(v => v > 0).forEach(v => label(v, 0, 0, "$" + v, "below", 11, ink)); label(X.max, 0, 0, "Cost per task →", "above", 12.5, hi); }
  if (state.cam !== "cost") { yv.filter(v => v > 0).forEach(v => label(0, v, 0, fmtK(v), "below", 11, ink)); label(0, Y.max, 0, "Output tokens per task →", "above", 12.5, hi); }
  zv.forEach(v => label(0, 0, v, String(v), "left", 11, ink));
  label(0, 0, Z.max, "Intelligence Index ↑", "above", 12.5, hi);
  return { T, ann };
}

function hover(m, C) {
  let s = `<b>${m.name}</b><br>${m.company}${m.effort ? " · " + m.effort + " effort" : ""} · released ${fmtDate(m.released)}`
    + `<br>Intelligence Index <b>${m.index.toFixed(1)}</b><br>Cost ${fmt$(m.cost)} per task<br>${fmtK(m.tokens)} output tokens per task`
    + (m.time ? `<br>${Math.round(m.time)} s per task` : "")
    + (m.priceIn != null ? `<br>Price $${m.priceIn} in / $${m.priceOut} out per 1M tokens` : "");
  if (C) { const d = vsTarget(m, C).delta; s += `<br>vs efficient target <b>${d >= 0 ? "▲ +" : "▼ −"}${Math.abs(d).toFixed(1)}</b> pts`; }
  return s;
}

function scene() {
  const { T, ann } = frame(), surf = css("--surface"), C = state.target ? targetCurve() : null, shown = [];
  for (const f of FAMILIES) {
    if (!state.selected.has(f.id)) continue;
    const P = f.points; shown.push(...P);
    const open = f.symbol.endsWith("-open") || f.symbol === "x";
    T.push({ type: "scatter3d", mode: P.length > 1 ? "lines+markers+text" : "markers+text", x: P.map(m => m.cost), y: P.map(m => m.tokens), z: P.map(m => m.index),
      line: { color: f.color, width: 5 },
      marker: { size: f.symbol === "x" ? 3.5 : 5, color: f.color, symbol: f.symbol, line: { color: open ? f.color : surf, width: open ? 2 : 1 } },
      text: P.map((_, i) => i === P.length - 1 ? f.label : ""), textposition: "top center", textfont: { family: FONT, size: 12, color: css("--ink") },
      hovertext: P.map(m => hover(m, C)), hoverinfo: "text", showlegend: false });
  }
  if (C) {
    const S = C.map(toData);
    T.push({ type: "scatter3d", mode: "lines+text", x: S.map(q => q[0]), y: S.map(q => q[1]), z: S.map(q => q[2]), line: { color: css("--target"), width: 4, dash: "dash" },
      text: S.map((_, i) => i === S.length - 1 ? "Efficient target" : ""), textposition: "top center", textfont: { family: FONT, size: 13, color: css("--target") }, hoverinfo: "skip", showlegend: false });
    if (shown.length) {   // faint connectors: green = close to the target, red = far (relative to the farthest shown)
      const G = shown.map(m => ({ m, v: vsTarget(m, C) })), far = Math.max(...G.map(o => Math.abs(o.v.delta))) || 1;
      const x = [], y = [], z = [], c = [];
      G.forEach(({ m, v }) => { const r = Math.abs(v.delta) / far; x.push(m.cost, v.foot[0], null); y.push(m.tokens, v.foot[1], null); z.push(m.index, v.foot[2], null); c.push(r, r, r); });
      T.push({ type: "scatter3d", mode: "lines", x, y, z, line: { color: c, colorscale: GAP, cmin: 0, cmax: 1, width: 1.5 }, opacity: .28, hoverinfo: "skip", showlegend: false });
    }
  }
  return { T, ann };
}

const ORTHO = { type: "orthographic" };
// eye position from azimuth / elevation in degrees (the chart is always seen from the open side of the zero corner)
const eyeAt = (azDeg, elDeg, r = 1.45) => { const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180; return { x: r * Math.cos(el) * Math.cos(az), y: r * Math.cos(el) * Math.sin(az), z: r * Math.sin(el) }; };
const VIEWS = {
  iso: { x: 1.3, y: 0.5, z: 0.45 }, cost: { x: 0, y: -1.45, z: 0 }, tok: { x: 1.45, y: 0, z: 0 },
  // auto-rotate stops: swing one way, swing back the other way, then rise to look straight down
  swingA: eyeAt(78, 22), swingB: eyeAt(8, 24), top: eyeAt(40, 84)
};
const ROTATE_PATH = [["swingA", 6000], ["swingB", 7000], ["top", 4500], ["iso", 4500]];
const camAt = eye => ({ eye: { ...eye }, up: { x: 0, y: 0, z: 1 }, projection: ORTHO });

const plot = document.getElementById("plot");
let camNow = camAt(VIEWS.iso);   // the camera we last set; kept here so per-frame moves never read it back from Plotly
function liveCam() {
  try { const c = plot._fullLayout.scene._scene.getCamera(); if (c && c.eye) return { eye: { ...c.eye }, up: { x: 0, y: 0, z: 1 }, projection: ORTHO }; } catch (e) { }
  return camNow;
}
function draw() {
  const { T, ann } = scene(), ax = a => ({ visible: false, showspikes: false, range: [a.min, a.max] });
  return Plotly.react(plot, T, {
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"), margin: { l: 0, r: 0, t: 0, b: 0 }, font: { family: FONT, color: css("--ink-2") }, showlegend: false,
    hoverlabel: { bgcolor: "#0d0d0d", bordercolor: css("--line"), font: { family: FONT, size: 12.5, color: css("--ink") } },
    scene: { xaxis: ax(AXES.x), yaxis: ax(AXES.y), zaxis: ax(AXES.z), aspectmode: "manual", aspectratio: { x: 1.25, y: 1.1, z: 0.85 }, camera: camNow, annotations: ann }
  }, { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["toImage", "resetCameraLastSave3d"] });
}
const setCam = c => { camNow = c; Plotly.relayout(plot, { "scene.camera": c }); };

// ---------- camera: one frame loop that only ever moves the camera ----------
// Auto-rotate follows ROTATE_PATH: glide to each stop in turn (eased), pause briefly, and loop.
const FRAME_MS = 33, ROTATE_PAUSE = 900;      // ~30 camera updates a second keeps motion smooth and cheap
let raf = null, lastFrame = 0, pointerDown = false, camMove = null, rotateStep = 0, rotateTimer = null;
const sph = e => { const r = Math.hypot(e.x, e.y, e.z); return { r, az: Math.atan2(e.y, e.x), el: Math.asin(e.z / r) }; };
function ensureLoop() { if (!raf) raf = requestAnimationFrame(loop); }
function loop(ts) {
  raf = null;
  if (!camMove || pointerDown || document.getElementById("tab-home").hidden) return;
  ensureLoop();
  if (ts - lastFrame < FRAME_MS) return;
  lastFrame = ts;
  const M = camMove, u = Math.min(1, (ts - M.t0) / M.ms), k = u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  const r = M.from.r + (M.to.r - M.from.r) * k, az = M.from.az + M.dAz * k, el = M.from.el + (M.to.el - M.from.el) * k;
  setCam(camAt({ x: r * Math.cos(el) * Math.cos(az), y: r * Math.cos(el) * Math.sin(az), z: r * Math.sin(el) }));
  if (u >= 1) {
    camMove = null; camNow = camAt(VIEWS[M.view]);
    const flat = M.view === "cost" || M.view === "tok";
    if (flat || state.cam !== "iso") { state.cam = flat ? M.view : "iso"; draw(); }   // flat views hide the axis that points at you
    M.onDone && M.onDone();
  }
}
function moveCamera(view, ms, onDone) {
  const from = sph(liveCam().eye), to = sph(VIEWS[view]);
  let dAz = to.az - from.az; if (dAz > Math.PI) dAz -= 2 * Math.PI; if (dAz < -Math.PI) dAz += 2 * Math.PI;
  if (state.cam !== "iso" && view !== "cost" && view !== "tok") { state.cam = "iso"; draw(); }
  camMove = { from, to, dAz, t0: performance.now(), ms: reduceMotion ? 1 : ms, view, onDone };
  lastFrame = 0; ensureLoop();
}
function rotateNext() {
  if (!state.spin) return;
  const [view, ms] = ROTATE_PATH[rotateStep++ % ROTATE_PATH.length];
  moveCamera(view, ms, () => { if (state.spin) rotateTimer = setTimeout(rotateNext, ROTATE_PAUSE); });
}
function setSpin(on) {
  state.spin = on; document.getElementById("tour").setAttribute("aria-pressed", on);
  clearTimeout(rotateTimer);
  if (on) { camNow = liveCam(); markView("iso"); rotateNext(); }
  else if (camMove && camMove.onDone) camMove = null;          // stop where it is
}
function markView(v) { document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v)); }

// ---------- 2D charts: quarterly frontiers (Home) and model lines (Companies) ----------
function frontier(set, key) {
  const s = [...set].sort((a, b) => key(a) - key(b) || b.index - a.index), out = []; let best = -Infinity;
  for (const m of s) if (m.index > best) { out.push(m); best = m.index; }
  return out;
}
// fixed ranges from 0,0 shared by every 2D chart, with room to spare, so charts compare at a glance
let RANGES;
function ranges() {
  // fitted to the data (a little headroom for labels), not stretched to 100
  const top = Math.max(...MODELS.map(m => m.index));
  return RANGES || (RANGES = { cost: [0, nice(Math.max(...MODELS.map(m => m.cost)) * 1.12)], tok: [0, nice(Math.max(...MODELS.map(m => m.tokens)) * 1.12)],
                               index: [0, Math.ceil(top * 1.12 / 5) * 5] });
}
function chart2d(el, T, which, legend) {
  const ink = css("--ink-2"), R = ranges();
  const ax = (t, extra) => Object.assign({ title: { text: t, font: { size: 12, color: ink, family: FONT } }, gridcolor: css("--grid"), zeroline: true, zerolinecolor: css("--ink-3"),
    linecolor: css("--line"), tickfont: { size: 11, color: ink, family: FONT }, nticks: 5, fixedrange: true }, extra);
  return Plotly.react(el, T, {
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"), margin: { l: 56, r: 24, t: 10, b: 48 }, font: { family: FONT, color: ink },
    showlegend: legend, legend: { orientation: "h", x: 0, y: 1.08, font: { size: 11.5, color: ink } },
    hoverlabel: { bgcolor: "#0d0d0d", bordercolor: css("--line"), font: { family: FONT, size: 12, color: css("--ink") } },
    xaxis: which === "cost" ? ax("Cost per task", { range: R.cost, tickprefix: "$" }) : ax("Output tokens per task", { range: R.tok }),
    yaxis: ax("Intelligence Index", { range: R.index })
  }, { displaylogo: false, responsive: true, displayModeBar: false });
}
const keyOf = which => which === "cost" ? (m => m.cost) : (m => m.tokens);
function quarterChart(el, which) {
  const key = keyOf(which), T = [];
  for (const q of QUARTERS) {
    if (!state.qon[q.id]) continue;
    const fr = frontier(MODELS.filter(m => m.released >= q.start && m.released <= q.end), key);
    if (!fr.length) continue;
    const col = css(q.v);
    T.push({ type: "scatter", mode: "lines+markers+text", name: q.label, x: fr.map(key), y: fr.map(m => m.index), line: { color: col, width: 2.5, shape: "hv" },
      marker: { size: 7, color: col, line: { color: "#000", width: 1 } },
      text: fr.map(m => m.name.replace(/ \(/, "<br>(")), textposition: "top right", textfont: { family: FONT, size: 10.5, color: col }, cliponaxis: false,
      hovertext: fr.map(m => `<b>${q.label}</b> · ${m.name}<br>${m.company} · released ${fmtDate(m.released)}<br>Index <b>${m.index.toFixed(1)}</b><br>${fmt$(m.cost)} per task · ${fmtK(m.tokens)} tokens`), hoverinfo: "text" });
  }
  return chart2d(el, T, which, true);
}
function drawQuarters() { quarterChart("q-cost", "cost"); quarterChart("q-tok", "tok"); }

let companiesBuilt = false;
const companyOn = {};   // family id -> shown on the Companies tab (all on by default)
function familyChart(el, c, which) {
  const key = keyOf(which), T = [];
  const colors = c.colors || (c.colors = familyColors(c));
  c.fams.forEach(f => {
    if (!companyOn[f.id]) return;
    const col = colors[f.id], P = f.points, last = P.length - 1;
    T.push({ type: "scatter", mode: "lines+markers+text", name: f.label, x: P.map(key), y: P.map(m => m.index),
      line: { color: col, width: 2.5 }, marker: { size: 7, color: col, line: { color: "#000", width: 1 } },
      text: P.map((_, j) => j === last ? f.label : ""), textposition: "top right", textfont: { family: FONT, size: 11, color: col }, cliponaxis: false,
      hovertext: P.map(m => `<b>${m.name}</b><br>released ${fmtDate(m.released)}<br>Index <b>${m.index.toFixed(1)}</b><br>${fmt$(m.cost)} per task · ${fmtK(m.tokens)} tokens`), hoverinfo: "text" });
  });
  return chart2d(el, T, which, false);
}
function buildCompanyRows() {
  const host = document.getElementById("company-rows");
  for (const name of COMPANY_TAB) {
    const c = COMPANIES.find(x => x.name === name);
    if (!c) continue;
    const row = document.createElement("section"); row.className = "panel crow"; row.setAttribute("aria-label", name);
    const head = document.createElement("div"); head.className = "bar";
    head.innerHTML = `<h2><span class="sw" style="background:${c.color}"></span>${name}</h2>`;
    const chips = document.createElement("div"); chips.className = "group"; chips.setAttribute("role", "group"); chips.setAttribute("aria-label", name + " models");
    c.colors = familyColors(c);
    c.fams.forEach(f => {
      if (!(f.id in companyOn)) companyOn[f.id] = true;
      const b = document.createElement("button"); b.type = "button"; b.className = "mini"; b.setAttribute("aria-pressed", companyOn[f.id]);
      b.innerHTML = `<span class="dot" style="background:${c.colors[f.id]}"></span>`;
      b.append(document.createTextNode(f.label));
      b.onclick = () => { companyOn[f.id] = !companyOn[f.id]; b.setAttribute("aria-pressed", companyOn[f.id]); drawCompanyRow(c); };
      chips.append(b);
    });
    head.append(chips);
    const grid = document.createElement("div"); grid.className = "qgrid";
    grid.innerHTML = `<div class="qcell"><h3>Intelligence vs price</h3><div class="qplot"></div></div><div class="qcell"><h3>Intelligence vs tokens</h3><div class="qplot"></div></div>`;
    row.append(head, grid); host.append(row);
    c.rowEls = [...grid.querySelectorAll(".qplot")];
  }
  companiesBuilt = true;
}
function drawCompanyRow(c) { familyChart(c.rowEls[0], c, "cost"); familyChart(c.rowEls[1], c, "tok"); }

// ---------- controls ----------
function buildCompanies() {
  const host = document.getElementById("companies");
  for (const c of COMPANIES) {
    const wrap = document.createElement("div"); wrap.className = "co";
    const btn = document.createElement("button"); btn.type = "button"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div"); menu.className = "menu"; menu.hidden = true;
    const refresh = () => { const n = c.fams.filter(f => state.selected.has(f.id)).length; btn.dataset.count = n; btn.innerHTML = `<span class="sw" style="background:${c.color}"></span>${c.name}<span class="n">${n}/${c.fams.length}</span><span class="caret">▾</span>`; };
    c.fams.forEach(f => {
      const row = document.createElement("label");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = state.selected.has(f.id);
      cb.onchange = () => { cb.checked ? state.selected.add(f.id) : state.selected.delete(f.id); refresh(); draw(); };
      row.append(cb, document.createTextNode(f.label + (f.points.length > 1 ? ` (${f.points.length} efforts)` : "")));
      const sc = document.createElement("span"); sc.className = "score"; sc.textContent = f.best.toFixed(1); row.append(sc);
      menu.append(row);
    });
    btn.onclick = e => { e.stopPropagation(); togglePopover(menu, btn); };
    wrap.append(btn, menu); host.append(wrap); refresh();
    c.refresh = () => { refresh(); menu.querySelectorAll("input").forEach((cb, i) => cb.checked = state.selected.has(c.fams[i].id)); };
  }
}
function togglePopover(menu, btn) { const open = menu.hidden; closeMenus(); menu.hidden = !open; btn.setAttribute("aria-expanded", open); }
function closeMenus() { document.querySelectorAll(".menu").forEach(m => m.hidden = true); document.querySelectorAll("[aria-expanded]").forEach(b => b.setAttribute("aria-expanded", "false")); }
document.addEventListener("click", e => { if (!e.target.closest(".co")) closeMenus(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenus(); });
function topPerCompany() { state.selected = new Set(COMPANIES.filter(c => DEFAULT_COMPANIES.includes(c.name)).map(c => c.fams[0].id)); }

function targetText() {
  const e = state.reach / 100;
  const words = { 25: "a quarter of", 50: "half of", 75: "three quarters of" }[state.reach] || `${state.reach}% of`;
  document.getElementById("target-state").textContent = state.target ? "On" : "Off";
  document.getElementById("reach-out").textContent = `${words} the budget`;
  document.getElementById("reach-abs").textContent = `${fmt$(unfrac(AXES.x, e))} and ${fmtK(unfrac(AXES.y, e))} tokens per task`;
  document.getElementById("shape-math").textContent = SHAPES[state.shape].math + "   (n = share of the budget used)";
  document.querySelectorAll("[data-target]").forEach(b => b.setAttribute("aria-pressed", String(state.target) === b.dataset.target));
  document.getElementById("gap-key").hidden = !state.target;
}

function wire() {
  document.getElementById("reset-models").onclick = () => { topPerCompany(); COMPANIES.forEach(c => c.refresh()); draw(); };
  document.getElementById("clear-models").onclick = () => { state.selected.clear(); COMPANIES.forEach(c => c.refresh()); draw(); };

  const tbtn = document.getElementById("target-btn"), tmenu = document.getElementById("target-menu");
  tbtn.onclick = e => { e.stopPropagation(); togglePopover(tmenu, tbtn); };
  document.querySelectorAll("[data-target]").forEach(b => b.onclick = () => { state.target = b.dataset.target === "true"; targetText(); draw(); });
  document.getElementById("shape").onchange = e => { state.shape = e.target.value; targetText(); if (state.target) draw(); };
  document.getElementById("reach").oninput = e => { state.reach = +e.target.value; targetText(); if (state.target) draw(); };

  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { setSpin(false); camMove = null; markView(b.dataset.view); moveCamera(b.dataset.view, 1100); });
  document.getElementById("tour").onclick = () => setSpin(!state.spin);

  // dragging pauses the spin, which then carries on from the new angle; dragging out of a flat view makes it 3D again
  plot.addEventListener("pointerdown", () => { pointerDown = true; }, { capture: true });
  window.addEventListener("pointerup", () => {
    if (!pointerDown) return;
    pointerDown = false;
    const before = camNow.eye; camNow = liveCam();
    const e = camNow.eye, moved = Math.hypot(e.x - before.x, e.y - before.y, e.z - before.z) > 0.02;
    if (!moved) { if (camMove) ensureLoop(); return; }
    if (state.spin) setSpin(false);
    camMove = null;
    if (state.cam !== "iso") { state.cam = "iso"; markView("iso"); draw(); }
  });

  // quarter chips: each quarter's releases only; a quarter with no releases yet is disabled
  const qh = document.getElementById("quarters");
  for (const q of QUARTERS) {
    const n = MODELS.filter(m => m.released >= q.start && m.released <= q.end).length;
    state.qon[q.id] = n > 0;
    const b = document.createElement("button"); b.className = "mini"; b.type = "button"; b.setAttribute("aria-pressed", state.qon[q.id]);
    b.innerHTML = `<span class="dot" style="background:var(${q.v})"></span>${q.label}`;
    if (!n) { b.disabled = true; b.title = `No releases yet: ${q.label} runs ${fmtDate(q.start)} to ${fmtDate(q.end)}`; }
    b.onclick = () => { state.qon[q.id] = !state.qon[q.id]; b.setAttribute("aria-pressed", state.qon[q.id]); drawQuarters(); };
    qh.append(b);
  }

  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => showTab(b.dataset.tab));
}

function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.getElementById("tab-home").hidden = name !== "home";
  document.getElementById("tab-companies").hidden = name !== "companies";
  if (name === "companies") {
    if (!companiesBuilt) { buildCompanyRows(); COMPANIES.forEach(c => c.rowEls && drawCompanyRow(c)); }
  } else {
    Plotly.Plots.resize(plot); if (camMove) ensureLoop();
  }
}

// ---------- start ----------
function start() {
  load();
  document.getElementById("meta").textContent = `${MODELS.length} model configurations from ${COMPANIES.length} companies · data as of ${fmtDate(DATA.generated)}`;
  document.getElementById("attr").innerHTML = `Data: <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a> (Intelligence Index, cost per task, output tokens per task), as of ${fmtDate(DATA.generated)}. Attribution: Artificial Analysis, artificialanalysis.ai.`;
  topPerCompany();
  buildCompanies();
  wire();
  targetText();
  // the 3D chart first; the loading screen lifts once it has painted, then the 2D charts follow
  draw().then(() => {
    document.getElementById("loading").classList.add("done");
    setTimeout(() => document.getElementById("loading").remove(), 400);
    requestAnimationFrame(() => setTimeout(() => { drawQuarters(); if (state.spin) rotateNext(); }, 50));
  });
}
if (window.Plotly && window.LLM3D_DATA) start();
else {
  const msg = document.querySelector("#loading .msg");
  if (msg) msg.textContent = "Couldn't load the chart library or the data. Check your connection and reload.";
}
