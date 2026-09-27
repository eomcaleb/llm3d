/* llm3d: compare AI models by intelligence, cost per task and output tokens per task, in 3D.
   Data: Artificial Analysis (https://artificialanalysis.ai), built by scripts/build_data.py. */
"use strict";

const FONT = "Inter, sans-serif";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt$ = v => v < 0.1 ? "$" + v.toFixed(4) : "$" + v.toFixed(2);
const fmtK = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + "";
const fmtDate = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- company colours: the leading labs get distinct hues, everyone else a set of quiet tints ----------
const BRAND = {
  "OpenAI": "#3987e5", "Anthropic": "#e0662f", "Google": "#7dd3fc", "Meta": "#a3e635", "SpaceXAI": "#d4d4d4",
  "Xiaomi": "#e0c53a", "Alibaba": "#f472b6", "Z AI": "#1aa39a", "Kimi": "#c64fc4", "DeepSeek": "#cdb8ff",
  "MiniMax": "#fb7185", "StepFun": "#fdba74", "Mistral": "#fcd34d", "NVIDIA": "#86efac"
};
const QUIET = ["#9ca3af", "#a8a29e", "#94a3b8", "#b4a7d6", "#8fb8a8", "#c9a38a", "#a3a3a3", "#9fb3c8"];
const SYMBOLS = ["circle", "diamond", "square", "cross", "x", "circle-open", "diamond-open", "square-open"];
const EFFORT_ORDER = ["minimal", "low", "medium", "high", "xhigh", "max"];
// companies shown by default, in this order; every other company starts switched off
const DEFAULT_COMPANIES = ["Anthropic", "OpenAI", "Google", "SpaceXAI", "Kimi", "DeepSeek", "Z AI", "Meta", "NVIDIA", "MiniMax", "Mistral"];
// companies with their own row on the Companies tab
const COMPANY_TAB = ["Anthropic", "OpenAI", "SpaceXAI", "DeepSeek", "Kimi"];

// ---------- state ----------
const state = {
  selected: new Set(), prog: {}, scale: "linear", cam: "iso",
  drops: false, shadows: false, target: true, tprog: 1, shape: "quad", reach: 50,
  spin: true, qon: {}, qprog: {}
};
let DATA, MODELS, FAMILIES, COMPANIES, FAM_BY_ID, AX, QUARTERS;

// ---------- data ----------
async function load() {
  // data/models.js sets window.LLM3D_DATA, which also works when index.html is opened straight from disk
  DATA = window.LLM3D_DATA || await (await fetch("data/models.json")).json();
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
    f.released = f.points.map(m => m.released).sort().pop();
    f.label = f.name.replace(/ \((Reasoning|Non-reasoning)\)$/, "");
  }
  const byCo = new Map();
  for (const f of FAMILIES) {
    if (!byCo.has(f.company)) byCo.set(f.company, []);
    byCo.get(f.company).push(f);
  }
  let quiet = 0;
  COMPANIES = [...byCo.entries()].map(([name, fams]) => {
    fams.sort((a, b) => b.best - a.best);
    return { name, fams, best: fams[0].best, color: BRAND[name] || QUIET[quiet++ % QUIET.length] };
  }).sort((a, b) => {
    const ia = DEFAULT_COMPANIES.indexOf(a.name), ib = DEFAULT_COMPANIES.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.best - a.best;
  });
  for (const c of COMPANIES) c.fams.forEach((f, i) => { f.color = c.color; f.symbol = SYMBOLS[i % SYMBOLS.length]; });
  FAM_BY_ID = Object.fromEntries(FAMILIES.map(f => [f.id, f]));
  AX = axisExtents();
  QUARTERS = quartersOf(DATA.generated);
}

function nice(v) { const p = 10 ** Math.floor(Math.log10(v)); for (const k of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p; return 10 * p; }
function axisExtents() {
  const c = MODELS.map(m => m.cost), t = MODELS.map(m => m.tokens);
  return { costMax: nice(Math.max(...c) * 1.02), tokMax: nice(Math.max(...t) * 1.02), costMin: Math.min(...c), tokMin: Math.min(...t) };
}
function axes() {
  const lg = state.scale === "log";
  return {
    x: lg ? { log: true, min: 10 ** Math.floor(Math.log10(AX.costMin)), max: AX.costMax } : { log: false, min: 0, max: AX.costMax },
    y: lg ? { log: true, min: 10 ** Math.floor(Math.log10(AX.tokMin)), max: AX.tokMax } : { log: false, min: 0, max: AX.tokMax },
    z: lg ? { log: false, min: 10, max: 100 } : { log: false, min: 0, max: 100 }
  };
}
const frac = (a, v) => a.log ? (Math.log(v) - Math.log(a.min)) / (Math.log(a.max) - Math.log(a.min)) : (v - a.min) / (a.max - a.min);
const unfrac = (a, u) => a.log ? Math.exp(Math.log(a.min) + u * (Math.log(a.max) - Math.log(a.min))) : a.min + u * (a.max - a.min);

// quarters of the data's year; a quarter with no releases yet stays disabled
function quartersOf(isoDate) {
  const y = +isoDate.slice(0, 4), yy = String(y).slice(2);
  const Q = [["01-01", "03-31"], ["04-01", "06-30"], ["07-01", "09-30"], ["10-01", "12-31"]];
  return Q.map(([a, b], i) => ({ id: "q" + (i + 1), label: `Q${i + 1} '${yy}`, start: `${y}-${a}`, end: `${y}-${b}`, v: `--q${i + 1}` }));
}

// ---------- efficient-scaling target ----------
// A model that scales well on both cost and tokens: it reaches a perfect 100 using only `reach`% of the chart's
// cost and token range, climbing along the chosen shape. Positions are shares (0..1) of each drawn axis.
const SHAPES = {
  lin:   { f: u => u,                                       math: "score = n" },
  quad:  { f: u => 1 - (1 - u) ** 2,                        math: "score = 1 − (1 − n)²" },
  cubic: { f: u => 1 - (1 - u) ** 3,                        math: "score = 1 − (1 − n)³" },
  exp:   { f: u => (1 - Math.exp(-4 * u)) / (1 - Math.exp(-4)), math: "score = (1 − e^(−4n)) / (1 − e^(−4))" },
  sqrt:  { f: u => Math.sqrt(u),                            math: "score = √n" },
  log:   { f: u => Math.log1p(20 * u) / Math.log1p(20),     math: "score = ln(1 + 20n) / ln 21" }
};
function targetCurve() {
  const g = SHAPES[state.shape].f, e = state.reach / 100, o = [];
  for (let i = 0; i <= 400; i++) { const t = i / 400; o.push([e * t, e * t, g(t)]); }
  return o;
}
const toData = (A, q) => [unfrac(A.x, q[0]), unfrac(A.y, q[1]), unfrac(A.z, q[2])];
// gap between a model and the target, and where its connector lands on the curve
function vsTarget(m, A, C) {
  const a = frac(A.x, m.cost), b = frac(A.y, m.tokens), c = frac(A.z, m.index);
  const key = q => state.cam === "cost" ? q[0] : state.cam === "tok" ? q[1] : (q[0] + q[1]) / 2;
  const k = key([a, b]);
  let pred = C[C.length - 1][2];
  for (let i = 1; i < C.length; i++) if (key(C[i]) >= k) { const k0 = key(C[i - 1]), k1 = key(C[i]), f = k1 > k0 ? (k - k0) / (k1 - k0) : 0; pred = C[i - 1][2] + (C[i][2] - C[i - 1][2]) * f; break; }
  let foot;
  if (state.cam === "iso") { let best = Infinity; for (const q of C) { const d = (q[0] - a) ** 2 + (q[1] - b) ** 2 + (q[2] - c) ** 2; if (d < best) { best = d; foot = q; } } }
  else foot = [a, b, Math.min(pred, 1)];
  return { delta: m.index - unfrac(A.z, pred), foot: state.cam === "iso" ? toData(A, foot) : [m.cost, m.tokens, unfrac(A.z, Math.min(pred, 1))] };
}
const GAP = [[0, "#22c55e"], [0.5, "#f59e0b"], [1, "#ef4444"]];

// ---------- 3D scene ----------
function ticks(A) {
  const lg = state.scale === "log";
  const cost = lg ? [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10].filter(v => v >= A.x.min && v <= A.x.max)
                  : Array.from({ length: Math.floor(A.x.max / step(A.x.max)) + 1 }, (_, i) => i * step(A.x.max));
  const tok = lg ? [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000].filter(v => v >= A.y.min && v <= A.y.max)
                 : Array.from({ length: Math.floor(A.y.max / step(A.y.max)) + 1 }, (_, i) => i * step(A.y.max));
  return {
    x: { v: cost, t: cost.map(v => v < 0.1 && v > 0 ? "$" + v : v < 1 && v > 0 ? "$" + v.toFixed(2) : "$" + v), title: "Cost per task" + (lg ? " (log)" : "") + " →" },
    y: { v: tok, t: tok.map(v => v === 0 ? "0" : fmtK(v)), title: "Output tokens per task" + (lg ? " (log)" : "") + " →" },
    z: { v: lg ? [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }
  };
}
function step(max) { const raw = max / 4.5, p = 10 ** Math.floor(Math.log10(raw)); for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw) return k * p; return 10 * p; }

// grid and axes drawn as fixed 3D lines out of the zero corner, so labels never jump sides while rotating
let FRAME_ANN = [];
function frame(A) {
  FRAME_ANN = [];
  const K = ticks(A), g = css("--grid"), X = A.x, Y = A.y, Z = A.z, ink = css("--ink-2"), hi = css("--ink");
  const gx = [], gy = [], gz = [], seg = (a, b) => { gx.push(a[0], b[0], null); gy.push(a[1], b[1], null); gz.push(a[2], b[2], null); };
  K.x.v.forEach(v => { seg([v, Y.min, Z.min], [v, Y.max, Z.min]); seg([v, Y.min, Z.min], [v, Y.min, Z.max]); });
  K.y.v.forEach(v => { seg([X.min, v, Z.min], [X.max, v, Z.min]); seg([X.min, v, Z.min], [X.min, v, Z.max]); });
  K.z.v.forEach(v => { seg([X.min, Y.min, v], [X.max, Y.min, v]); seg([X.min, Y.min, v], [X.min, Y.max, v]); });
  const wall = (xs, ys, zs, col) => ({ type: "mesh3d", x: xs, y: ys, z: zs, i: [0, 0], j: [1, 2], k: [2, 3], color: col, opacity: 0.09,
    flatshading: true, lighting: { ambient: 1, diffuse: 0, specular: 0 }, hoverinfo: "skip", showlegend: false });
  // faintly tinted vertical walls: seen through, they dim whatever is behind them, so their side reads while rotating
  const T = [
    wall([X.min, X.min, X.min, X.min], [Y.min, Y.max, Y.max, Y.min], [Z.min, Z.min, Z.max, Z.max], css("--wall-a")),
    wall([X.min, X.max, X.max, X.min], [Y.min, Y.min, Y.min, Y.min], [Z.min, Z.min, Z.max, Z.max], css("--wall-b")),
    { type: "scatter3d", mode: "lines", x: gx, y: gy, z: gz, line: { color: g, width: 1 }, hoverinfo: "skip", showlegend: false }];
  T.push({ type: "scatter3d", mode: "lines", x: [X.max, X.min, X.min, X.min, X.min], y: [Y.min, Y.min, Y.max, Y.min, Y.min], z: [Z.min, Z.min, Z.min, Z.min, Z.max], line: { color: css("--ink-3"), width: 3 }, hoverinfo: "skip", showlegend: false });
  // labels are scene annotations: they stay pinned to their 3D spot but keep a fixed on-screen size
  const txt = (x, y, z, t, pos, size, col) => {
    const [xa, ya] = pos === "middle left" ? ["right", "middle"] : pos === "top center" ? ["center", "bottom"] : ["center", "top"];
    x.forEach((_, i) => FRAME_ANN.push({ x: x[i], y: y[i], z: z[i], text: t[i], showarrow: false, xanchor: xa, yanchor: ya, xshift: xa === "right" ? -6 : 0, yshift: ya === "top" ? -4 : ya === "bottom" ? 4 : 0, font: { family: FONT, size, color: col } }));
    return null;
  };
  const xi = K.x.v.map((v, i) => i).filter(i => K.x.v[i] > X.min), yi = K.y.v.map((v, i) => i).filter(i => K.y.v[i] > Y.min);
  // in a flat view the axis pointing at the viewer collapses to a dot, so its labels are left out
  if (state.cam !== "tok") { T.push(txt(xi.map(i => K.x.v[i]), xi.map(() => Y.min), xi.map(() => Z.min), xi.map(i => K.x.t[i]), "bottom center", 11, ink)); T.push(txt([X.max], [Y.min], [Z.min], [K.x.title], "top center", 12.5, hi)); }
  if (state.cam !== "cost") { T.push(txt(yi.map(() => X.min), yi.map(i => K.y.v[i]), yi.map(() => Z.min), yi.map(i => K.y.t[i]), "bottom center", 11, ink)); T.push(txt([X.min], [Y.max], [Z.min], [K.y.title], "top center", 12.5, hi)); }
  T.push(txt(K.z.v.map(() => X.min), K.z.v.map(() => Y.min), K.z.v, K.z.v.map(String), "middle left", 11, ink));
  T.push(txt([X.min], [Y.min], [Z.max], ["Intelligence Index ↑"], "top center", 12.5, hi));
  return T.filter(Boolean);
}

function hover(m, A, C) {
  let s = `<b>${m.name}</b><br>${m.company}${m.effort ? " · " + m.effort + " effort" : ""} · released ${fmtDate(m.released)}`
    + `<br>Intelligence Index <b>${m.index.toFixed(1)}</b><br>Cost ${fmt$(m.cost)} per task<br>${fmtK(m.tokens)} output tokens per task`
    + (m.time ? `<br>${Math.round(m.time)} s per task` : "")
    + (m.priceIn != null ? `<br>Price $${m.priceIn} in / $${m.priceOut} out per 1M tokens` : "");
  if (state.target && C) { const d = vsTarget(m, A, C).delta; s += `<br>vs efficient target <b>${d >= 0 ? "▲ +" : "▼ −"}${Math.abs(d).toFixed(1)}</b> pts`; }
  return s;
}

// part of a family's line drawn so far (0..1), for the draw-in animation
function partial(f, A) {
  const P = f.points, t = state.prog[f.id] ?? 1, n = P.length;
  if (n === 1) return { reached: t > 0 ? P : [], X: [P[0].cost], Y: [P[0].tokens], Z: [P[0].index], done: t >= 1 };
  const pos = t * (n - 1), k = Math.floor(pos), fr = pos - k, reached = P.slice(0, k + 1);
  const X = reached.map(m => m.cost), Y = reached.map(m => m.tokens), Z = reached.map(m => m.index);
  if (fr > 0 && k + 1 < n) {
    const a = P[k], b = P[k + 1], lg = state.scale === "log";
    const mix = (u, v) => lg ? Math.exp(Math.log(u) + (Math.log(v) - Math.log(u)) * fr) : u + (v - u) * fr;
    X.push(mix(a.cost, b.cost)); Y.push(mix(a.tokens, b.tokens)); Z.push(a.index + (b.index - a.index) * fr);
  }
  return { reached, X, Y, Z, done: t >= 1 };
}

function traces() {
  const A = axes(), T = frame(A), zmin = A.z.min, surf = css("--surface");
  const C = state.target ? targetCurve() : null, shown = [];
  for (const f of FAMILIES) {
    if (!state.selected.has(f.id)) continue;
    const P = partial(f, A); shown.push(...P.reached);
    if (P.X.length > 1) T.push({ type: "scatter3d", mode: "lines", x: P.X, y: P.Y, z: P.Z, line: { color: f.color, width: 5 }, hoverinfo: "skip", showlegend: false });
    const open = f.symbol.endsWith("-open") || f.symbol === "x";
    T.push({ type: "scatter3d", mode: "markers+text", x: P.reached.map(m => m.cost), y: P.reached.map(m => m.tokens), z: P.reached.map(m => m.index),
      marker: { size: f.symbol === "x" ? 3.5 : 5, color: f.color, symbol: f.symbol, line: { color: open ? f.color : surf, width: open ? 2 : 1 } },
      text: P.reached.map((m, i) => P.done && i === P.reached.length - 1 ? f.label : ""), textposition: "top center",
      textfont: { family: FONT, size: 12, color: css("--ink") }, hovertext: P.reached.map(m => hover(m, A, C)), hoverinfo: "text", showlegend: false });
    if (state.drops && P.reached.length) {
      const x = [], y = [], z = []; P.reached.forEach(m => { x.push(m.cost, m.cost, null); y.push(m.tokens, m.tokens, null); z.push(zmin, m.index, null); });
      T.push({ type: "scatter3d", mode: "lines", x, y, z, line: { color: f.color, width: 1.5 }, opacity: .35, hoverinfo: "skip", showlegend: false });
    }
    if (state.shadows && P.X.length > 1) T.push({ type: "scatter3d", mode: "lines", x: P.X, y: P.Y, z: P.Z.map(() => zmin), line: { color: f.color, width: 2 }, opacity: .3, hoverinfo: "skip", showlegend: false });
  }
  if (C) {
    const S = C.slice(0, Math.max(2, Math.round(state.tprog * (C.length - 1)) + 1)).map(q => toData(A, q)), full = state.tprog >= 1;
    T.push({ type: "scatter3d", mode: "lines+text", x: S.map(q => q[0]), y: S.map(q => q[1]), z: S.map(q => q[2]), line: { color: css("--target"), width: 4, dash: "dash" },
      text: S.map((_, i) => full && i === S.length - 1 ? "Efficient target" : ""), textposition: "top center", textfont: { family: FONT, size: 13, color: css("--target") }, hoverinfo: "skip", showlegend: false });
    if (full && shown.length) {   // connectors: green = close to the target, red = far (relative to the farthest shown)
      const G = shown.map(m => ({ m, v: vsTarget(m, A, C) })), far = Math.max(...G.map(o => Math.abs(o.v.delta))) || 1;
      const x = [], y = [], z = [], c = [];
      G.forEach(({ m, v }) => { const r = Math.abs(v.delta) / far; x.push(m.cost, v.foot[0], null); y.push(m.tokens, v.foot[1], null); z.push(m.index, v.foot[2], null); c.push(r, r, r); });
      T.push({ type: "scatter3d", mode: "lines", x, y, z, line: { color: c, colorscale: GAP, cmin: 0, cmax: 1, width: 1.5 }, opacity: .28, hoverinfo: "skip", showlegend: false });
    }
  }
  return T;
}

const ORTHO = { type: "orthographic" };
const VIEWS = {
  iso:  { eye: { x: 1.3, y: 0.5, z: 0.45 } },
  iso2: { eye: { x: 0.55, y: 1.25, z: 0.5 } },
  cost: { eye: { x: 0, y: -1.45, z: 0 } },
  tok:  { eye: { x: 1.45, y: 0, z: 0 } }
};
const camOf = v => ({ eye: { ...VIEWS[v].eye }, up: { x: 0, y: 0, z: 1 }, projection: ORTHO });
// a random angle that still looks at the chart from the open side (in front of the zero corner)
function randomEye() {
  const az = 0.12 + Math.random() * 1.3, el = 0.12 + Math.random() * 0.62, r = 1.42;
  return { x: r * Math.cos(el) * Math.cos(az), y: r * Math.cos(el) * Math.sin(az), z: r * Math.sin(el) };
}

function layout() {
  // log scale is drawn on linear axes with pre-logged values (see draw); Plotly's 3D log axes shrink text labels
  const A = axes(), ax = a => ({ visible: false, showspikes: false, type: "linear", range: a.log ? [Math.log10(a.min), Math.log10(a.max)] : [a.min, a.max] });
  return {
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"), margin: { l: 0, r: 0, t: 0, b: 0 }, font: { family: FONT, color: css("--ink-2") }, showlegend: false,
    hoverlabel: { bgcolor: "#0d0d0d", bordercolor: css("--line"), font: { family: FONT, size: 12.5, color: css("--ink") } },
    scene: { xaxis: ax(A.x), yaxis: ax(A.y), zaxis: ax(A.z), aspectmode: "manual", aspectratio: { x: 1.25, y: 1.1, z: 0.85 }, camera: camOf("iso") }
  };
}

const plot = document.getElementById("plot");
let drawn = false;
function liveCam() {
  try { const c = plot._fullLayout.scene._scene.getCamera(); if (c && c.eye) return JSON.parse(JSON.stringify(c)); } catch (e) { }
  return plot.layout && plot.layout.scene && plot.layout.scene.camera ? JSON.parse(JSON.stringify(plot.layout.scene.camera)) : null;
}
function draw(keepCam = true, camOverride) {
  const L = layout();
  if (camOverride) L.scene.camera = camOverride;
  else if (keepCam && drawn) { const c = liveCam(); if (c) { c.projection = ORTHO; L.scene.camera = c; } }
  const T = traces(), lg = v => v == null ? null : Math.log10(v);
  if (state.scale === "log") for (const t of T) { t.x = t.x.map(lg); t.y = t.y.map(lg); }
  L.scene.annotations = FRAME_ANN.map(a => state.scale === "log" ? { ...a, x: lg(a.x), y: lg(a.y) } : a);
  Plotly.react(plot, T, L, { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["toImage", "resetCameraLastSave3d"] });
  drawn = true;
}

// ---------- one animation loop: line draw-ins and camera moves share each frame ----------
const DURATION = 1400, anims = {};
let raf = null, camMove = null;
const ease = u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
function setProg(k, v) {
  const [pre, name] = k.split(":");
  if (pre === "f") state.prog[name] = v; else if (pre === "t") state.tprog = v; else if (pre === "q") { state.qprog[name] = v; }
}
function animate(keys) {
  const t0 = performance.now();
  keys.forEach(k => { setProg(k, 0); anims[k] = t0; });
  if (reduceMotion) { keys.forEach(k => { setProg(k, 1); delete anims[k]; }); draw(); drawQuarters(); return; }
  ensureLoop();
}
// frames come from requestAnimationFrame; if the browser stops handing them out (throttled or embedded views),
// a short timer keeps camera moves and draw-ins finishing on time
let watchdog = null;
function ensureLoop() {
  if (raf) return;
  raf = requestAnimationFrame(loop);
  clearTimeout(watchdog);
  // not in a hidden tab: there the browser pauses frames on purpose, and the loop resumes when the tab is shown
  watchdog = setTimeout(() => { if (raf && !document.hidden) { cancelAnimationFrame(raf); raf = null; loop(); } }, 120);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && (camMove || state.spin || Object.keys(anims).length)) { cancelAnimationFrame(raf); raf = null; ensureLoop(); } });
const sph = e => { const r = Math.hypot(e.x, e.y, e.z); return { r, az: Math.atan2(e.y, e.x), el: Math.asin(e.z / r) }; };
// smooth camera move from wherever the view is now; onDone runs once it lands
function moveCamera(view, ms, onDone) {
  const lc = liveCam(), from = sph((lc && lc.eye) || VIEWS.iso.eye), to = sph(VIEWS[view].eye);
  let dAz = to.az - from.az; if (dAz > Math.PI) dAz -= 2 * Math.PI; if (dAz < -Math.PI) dAz += 2 * Math.PI;
  const flat = view === "cost" || view === "tok";
  if (state.cam !== "iso" && !flat) { state.cam = "iso"; }
  camMove = { from, to, dAz, t0: performance.now(), ms: reduceMotion ? 1 : ms, view, onDone, relabel: true };
  ensureLoop();
}
function loop() {
  raf = null; clearTimeout(watchdog);
  const ts = performance.now();
  let cam = null;
  const homeVisible = !document.getElementById("tab-home").hidden;
  if (state.spin && !camMove && !pointerDown && homeVisible) cam = spinCamera(ts);
  if (!state.spin || pointerDown) spinStart = 0;
  if (camMove) {
    const u = Math.min(1, (ts - camMove.t0) / camMove.ms), k = u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2, M = camMove;
    const r = M.from.r + (M.to.r - M.from.r) * k, az = M.from.az + M.dAz * k, el = M.from.el + (M.to.el - M.from.el) * k;
    cam = { eye: { x: r * Math.cos(el) * Math.cos(az), y: r * Math.cos(el) * Math.sin(az), z: r * Math.sin(el) }, up: { x: 0, y: 0, z: 1 }, projection: ORTHO };
    if (u >= 1) {
      camMove = null; cam = camOf(M.view);
      state.cam = M.view === "cost" || M.view === "tok" ? M.view : "iso";
      draw(false, cam);                       // redraw once so the collapsed axis hides its labels
      M.onDone && M.onDone();
      cam = null;
    }
  }
  const animating = Object.keys(anims).length > 0;
  if (animating) {
    let quarters = false;
    for (const k in anims) {
      const u = Math.max(0, Math.min(1, (ts - anims[k]) / DURATION));
      setProg(k, ease(u)); if (k.startsWith("q:")) quarters = true;
      if (u >= 1) { setProg(k, 1); delete anims[k]; }
    }
    draw(true, cam);
    if (quarters) drawQuarters();
  } else if (cam) {
    Plotly.relayout(plot, { "scene.camera": cam });
  }
  if (camMove || Object.keys(anims).length || (state.spin && homeVisible)) ensureLoop();
}

// ---------- auto-rotate: a steady spin around the Intelligence axis ----------
const SPIN_DEG_PER_S = 7;
let spinLast = 0, spinStart = 0, pointerDown = false;
function spinCamera(ts) {
  if (!spinStart) { spinStart = ts; spinLast = ts; }
  const dt = Math.min(0.1, (ts - spinLast) / 1000); spinLast = ts;
  const ramp = Math.min(1, (ts - spinStart) / 1500) ** 2;       // ease in over 1.5 s
  const c = liveCam(); if (!c || !c.eye) return null;
  const e = c.eye, r = Math.hypot(e.x, e.y), az = Math.atan2(e.y, e.x) + SPIN_DEG_PER_S * Math.PI / 180 * dt * ramp;
  return { eye: { x: r * Math.cos(az), y: r * Math.sin(az), z: e.z }, up: { x: 0, y: 0, z: 1 }, projection: ORTHO };
}
function setSpin(on) {
  state.spin = on; document.getElementById("tour").setAttribute("aria-pressed", on);
  if (on) {
    spinStart = 0;
    if (state.cam !== "iso") { state.cam = "iso"; markView("iso"); draw(); }
    ensureLoop();
  }
}
function markView(v) { document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v)); }

// ---------- quarterly frontiers: models released inside each quarter, in their own 2D views ----------
function frontier(set, key) {
  const s = [...set].sort((a, b) => key(a) - key(b) || b.index - a.index), out = []; let best = -Infinity;
  for (const m of s) if (m.index > best) { out.push(m); best = m.index; }
  return out;
}
function revealLine(xs, ys, t) {
  if (t >= 1 || xs.length < 2) return { xs, ys };
  const n = Math.max(1, Math.round(t * (xs.length - 1)));
  return { xs: xs.slice(0, n + 1), ys: ys.slice(0, n + 1) };
}
// fixed ranges shared by every frontier chart so they can be compared at a glance
function frontierRanges() {
  return { cost: [0, nice(Math.max(...MODELS.map(m => m.cost)) * 1.15)], tok: [0, nice(Math.max(...MODELS.map(m => m.tokens)) * 1.15)],
           index: [0, nice(Math.max(...MODELS.map(m => m.index)) * 1.3)] };
}
function frontierChart(el, models, which, animated) {
  const key = which === "cost" ? (m => m.cost) : (m => m.tokens), R0 = frontierRanges(), T = [];
  for (const q of QUARTERS) {
    if (!state.qon[q.id]) continue;
    const fr = frontier(models.filter(m => m.released >= q.start && m.released <= q.end), key);
    if (!fr.length) continue;
    const t = animated ? (state.qprog[q.id] ?? 1) : 1, col = css(q.v), R = revealLine(fr.map(key), fr.map(m => m.index), t), full = t >= 1;
    T.push({ type: "scatter", mode: "lines+markers" + (full ? "+text" : ""), name: q.label, x: R.xs, y: R.ys, line: { color: col, width: 2.5, shape: "hv" },
      marker: { size: 7, color: col, line: { color: "#000", width: 1 } },
      text: fr.map(m => m.name), textposition: "top right", textfont: { family: FONT, size: 10.5, color: col }, cliponaxis: false,
      hovertext: fr.map(m => `<b>${q.label}</b> · ${m.name}<br>${m.company} · released ${fmtDate(m.released)}<br>Index <b>${m.index.toFixed(1)}</b><br>${fmt$(m.cost)} per task · ${fmtK(m.tokens)} tokens`), hoverinfo: "text" });
  }
  const ink = css("--ink-2"), grid = css("--grid");
  const ax = (t, extra) => Object.assign({ title: { text: t, font: { size: 12, color: ink, family: FONT } }, gridcolor: grid, zeroline: true, zerolinecolor: css("--ink-3"),
    linecolor: css("--line"), tickfont: { size: 11, color: ink, family: FONT }, nticks: 5, fixedrange: true }, extra);
  Plotly.react(el, T, {
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"), margin: { l: 56, r: 24, t: 10, b: 48 }, font: { family: FONT, color: ink },
    showlegend: true, legend: { orientation: "h", x: 0, y: 1.08, font: { size: 11.5, color: ink } },
    hoverlabel: { bgcolor: "#0d0d0d", bordercolor: css("--line"), font: { family: FONT, size: 12, color: css("--ink") } },
    xaxis: which === "cost" ? ax("Cost per task", { range: R0.cost, tickprefix: "$" }) : ax("Output tokens per task", { range: R0.tok }),
    yaxis: ax("Intelligence Index", { range: R0.index })
  }, { displaylogo: false, responsive: true, displayModeBar: false });
}
function drawQuarters() {
  frontierChart("q-cost", MODELS, "cost", true);
  frontierChart("q-tok", MODELS, "tok", true);
  if (companiesBuilt) drawCompanyRows();
}

// ---------- Companies tab: the same frontier view, one row per company ----------
let companiesBuilt = false;
const companyOn = {};   // family id -> shown on the Companies tab (all on by default)
function buildCompanyRows() {
  const host = document.getElementById("company-rows");
  host.innerHTML = "";
  for (const name of COMPANY_TAB) {
    const c = COMPANIES.find(x => x.name === name);
    if (!c) continue;
    const row = document.createElement("section"); row.className = "panel crow"; row.setAttribute("aria-label", name);
    const head = document.createElement("div"); head.className = "bar";
    head.innerHTML = `<h2><span class="sw" style="background:${c.color}"></span>${name}</h2>`;
    const chips = document.createElement("div"); chips.className = "group"; chips.setAttribute("role", "group"); chips.setAttribute("aria-label", name + " models");
    c.fams.forEach((f, i) => {
      if (!(f.id in companyOn)) companyOn[f.id] = true;
      const b = document.createElement("button"); b.type = "button"; b.className = "mini"; b.setAttribute("aria-pressed", companyOn[f.id]);
      b.innerHTML = `<span class="sw" style="background:${FAMILY_COLORS[i % FAMILY_COLORS.length]};width:9px;height:9px"></span>`;
      b.append(document.createTextNode(f.label));
      b.onclick = () => { companyOn[f.id] = !companyOn[f.id]; b.setAttribute("aria-pressed", companyOn[f.id]); drawCompanyRow(c); };
      chips.append(b);
    });
    head.append(chips);
    const grid = document.createElement("div"); grid.className = "qgrid";
    grid.innerHTML = `<div class="qcell"><h3>Intelligence vs price</h3><div class="qplot" id="cq-cost-${c.fams[0].id.replace(/[^a-z0-9]/gi, "")}"></div></div>
      <div class="qcell"><h3>Intelligence vs tokens</h3><div class="qplot" id="cq-tok-${c.fams[0].id.replace(/[^a-z0-9]/gi, "")}"></div></div>`;
    row.append(head, grid); host.append(row);
    c.rowIds = [grid.querySelectorAll(".qplot")[0], grid.querySelectorAll(".qplot")[1]];
  }
  companiesBuilt = true;
}
const FAMILY_COLORS = ["#3987e5", "#e0662f", "#22c55e", "#c64fc4", "#e0c53a", "#7dd3fc", "#fb7185", "#a3e635", "#cdb8ff", "#fdba74", "#1aa39a", "#f472b6", "#d4d4d4", "#94a3b8"];
function familyChart(el, c, which) {
  const key = which === "cost" ? (m => m.cost) : (m => m.tokens), R0 = frontierRanges(), T = [];
  c.fams.forEach((f, i) => {
    if (!companyOn[f.id]) return;
    const col = FAMILY_COLORS[i % FAMILY_COLORS.length], P = f.points, last = P.length - 1;
    T.push({ type: "scatter", mode: "lines+markers+text", name: f.label, x: P.map(key), y: P.map(m => m.index),
      line: { color: col, width: 2.5 }, marker: { size: 7, color: col, line: { color: "#000", width: 1 } },
      text: P.map((_, j) => j === last ? f.label : ""), textposition: "top right", textfont: { family: FONT, size: 11, color: col }, cliponaxis: false,
      hovertext: P.map(m => `<b>${m.name}</b><br>released ${fmtDate(m.released)}<br>Index <b>${m.index.toFixed(1)}</b><br>${fmt$(m.cost)} per task · ${fmtK(m.tokens)} tokens`), hoverinfo: "text" });
  });
  const ink = css("--ink-2"), grid = css("--grid");
  const ax = (t, extra) => Object.assign({ title: { text: t, font: { size: 12, color: ink, family: FONT } }, gridcolor: grid, zeroline: true, zerolinecolor: css("--ink-3"),
    linecolor: css("--line"), tickfont: { size: 11, color: ink, family: FONT }, nticks: 5, fixedrange: true }, extra);
  Plotly.react(el, T, {
    paper_bgcolor: css("--surface"), plot_bgcolor: css("--surface"), margin: { l: 56, r: 24, t: 10, b: 48 }, font: { family: FONT, color: ink }, showlegend: false,
    hoverlabel: { bgcolor: "#0d0d0d", bordercolor: css("--line"), font: { family: FONT, size: 12, color: css("--ink") } },
    xaxis: which === "cost" ? ax("Cost per task", { range: R0.cost, tickprefix: "$" }) : ax("Output tokens per task", { range: R0.tok }),
    yaxis: ax("Intelligence Index", { range: R0.index })
  }, { displaylogo: false, responsive: true, displayModeBar: false });
}
function drawCompanyRow(c) {
  familyChart(c.rowIds[0], c, "cost");
  familyChart(c.rowIds[1], c, "tok");
}
function drawCompanyRows() { for (const c of COMPANIES) if (c.rowIds) drawCompanyRow(c); }

// ---------- controls ----------
function buildCompanies() {
  const host = document.getElementById("companies");
  host.innerHTML = "";
  for (const c of COMPANIES) {
    const wrap = document.createElement("div"); wrap.className = "co";
    const btn = document.createElement("button"); btn.type = "button"; btn.setAttribute("aria-haspopup", "true"); btn.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div"); menu.className = "menu"; menu.hidden = true; menu.setAttribute("role", "menu");
    const refresh = () => { const n = c.fams.filter(f => state.selected.has(f.id)).length; btn.dataset.count = n; btn.innerHTML = `<span class="sw" style="background:${c.color}"></span>${c.name}<span class="n">${n}/${c.fams.length}</span><span class="caret">▾</span>`; };
    c.fams.forEach(f => {
      const row = document.createElement("label");
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = state.selected.has(f.id);
      cb.onchange = () => { setFamily(f.id, cb.checked); refresh(); };
      row.append(cb, document.createTextNode(f.label + (f.points.length > 1 ? ` (${f.points.length} efforts)` : "")));
      const sc = document.createElement("span"); sc.className = "score"; sc.textContent = f.best.toFixed(1); row.append(sc);
      menu.append(row);
    });
    btn.onclick = e => { e.stopPropagation(); const open = menu.hidden; closeMenus(); menu.hidden = !open; btn.setAttribute("aria-expanded", open); };
    wrap.append(btn, menu); host.append(wrap); refresh();
    c.refresh = () => { refresh(); menu.querySelectorAll("input").forEach((cb, i) => cb.checked = state.selected.has(c.fams[i].id)); };
  }
}
function closeMenus() { document.querySelectorAll(".menu").forEach(m => m.hidden = true); document.querySelectorAll(".co > button").forEach(b => b.setAttribute("aria-expanded", "false")); }
document.addEventListener("click", e => { if (!e.target.closest(".co")) closeMenus(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenus(); });

function setFamily(id, on) {
  if (on) { state.selected.add(id); animate(["f:" + id]); }
  else { state.selected.delete(id); delete anims["f:" + id]; draw(); }
}
function topPerCompany() { state.selected = new Set(COMPANIES.filter(c => DEFAULT_COMPANIES.includes(c.name)).map(c => c.fams[0].id)); }

function targetText() {
  const A = axes(), e = state.reach / 100;
  const words = { 25: "a quarter of", 50: "half of", 75: "three quarters of" }[state.reach] || `${state.reach}% of`;
  document.getElementById("reach-out").textContent = `${words} the budget`;
  document.getElementById("reach-abs").textContent = `${fmt$(unfrac(A.x, e))} and ${fmtK(unfrac(A.y, e))} tokens per task`;
  document.getElementById("shape-math").textContent = SHAPES[state.shape].math + "   (n = share of the budget used)";
}

function wire() {
  document.getElementById("reset-models").onclick = () => { topPerCompany(); COMPANIES.forEach(c => c.refresh()); animate([...state.selected].map(id => "f:" + id)); };
  document.getElementById("clear-models").onclick = () => { state.selected.clear(); COMPANIES.forEach(c => c.refresh()); draw(); };

  const tgt = document.getElementById("target");
  tgt.onclick = () => {
    state.target = !state.target; tgt.setAttribute("aria-pressed", state.target);
    for (const id of ["target-ctl", "reach-ctl"]) document.getElementById(id).setAttribute("aria-disabled", !state.target);
    document.getElementById("gap-key").hidden = !state.target;
    if (state.target) animate(["t:x"]); else draw();
  };
  document.getElementById("shape").onchange = e => { state.shape = e.target.value; targetText(); if (state.target) animate(["t:x"]); };
  document.getElementById("reach").oninput = e => { state.reach = +e.target.value; targetText(); if (state.target) draw(); };

  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { setSpin(false); markView(b.dataset.view); moveCamera(b.dataset.view, 1100); });
  document.getElementById("tour").onclick = () => setSpin(!state.spin);
  for (const id of ["drops", "shadows"]) {
    const b = document.getElementById(id);
    b.onclick = () => { state[id] = !state[id]; b.setAttribute("aria-pressed", state[id]); draw(); };
  }
  document.querySelectorAll("[data-scale]").forEach(b => b.onclick = () => {
    state.scale = b.dataset.scale; document.querySelectorAll("[data-scale]").forEach(o => o.setAttribute("aria-pressed", o === b)); targetText(); draw();
  });

  // dragging the chart takes over from the tour and turns a flat view back into a free 3D view
  let downEye = null;
  plot.addEventListener("pointerdown", () => { pointerDown = true; const c = liveCam(); downEye = c && c.eye ? { ...c.eye } : null; }, { capture: true });
  window.addEventListener("pointerup", () => { pointerDown = false; });
  window.addEventListener("pointerup", () => {
    if (!downEye) return;
    const c = liveCam(), e = c && c.eye, moved = e && Math.hypot(e.x - downEye.x, e.y - downEye.y, e.z - downEye.z) > 0.02;
    downEye = null;
    if (!moved) return;
    camMove = null;
    if (state.cam !== "iso") { state.cam = "iso"; markView("iso"); draw(); }
  });

  // quarter chips: each quarter's releases only; a quarter with no releases yet is disabled
  for (const qh of document.querySelectorAll("[data-quarters]")) for (const q of QUARTERS) {
    const n = MODELS.filter(m => m.released >= q.start && m.released <= q.end).length;
    if (!(q.id in state.qon)) state.qon[q.id] = n > 0;
    const b = document.createElement("button"); b.className = "mini"; b.type = "button"; b.dataset.q = q.id; b.setAttribute("aria-pressed", state.qon[q.id]);
    b.innerHTML = `<svg width="14" height="8" aria-hidden="true"><line x1="1" y1="4" x2="13" y2="4" stroke="var(${q.v})" stroke-width="3"/></svg>${q.label}`;
    if (!n) { b.disabled = true; b.title = `No releases yet: ${q.label} runs ${fmtDate(q.start)} to ${fmtDate(q.end)}`; }
    b.onclick = () => {
      state.qon[q.id] = !state.qon[q.id];
      document.querySelectorAll(`[data-q="${q.id}"]`).forEach(o => o.setAttribute("aria-pressed", state.qon[q.id]));
      if (state.qon[q.id]) animate(["q:" + q.id]); else drawQuarters();
    };
    qh.append(b);
  }
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  document.getElementById("tab-home").hidden = name !== "home";
  document.getElementById("tab-companies").hidden = name !== "companies";
  if (name === "companies") {
    if (!companiesBuilt) buildCompanyRows();
    drawCompanyRows();
  } else {
    Plotly.Plots.resize(plot); drawQuarters();
    if (state.spin) ensureLoop();
  }
}
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---------- start ----------
(async function start() {
  await load();
  document.getElementById("meta").textContent = `${MODELS.length} model configurations from ${COMPANIES.length} companies · data as of ${fmtDate(DATA.generated)}`;
  document.getElementById("attr").innerHTML = `Data: <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a> (Intelligence Index, cost per task, output tokens per task), as of ${fmtDate(DATA.generated)}. Attribution: Artificial Analysis, artificialanalysis.ai.`;
  topPerCompany();
  buildCompanies();
  wire();
  targetText();
  draw(false, camOf("iso"));
  animate([...state.selected].map(id => "f:" + id).concat(QUARTERS.filter(q => state.qon[q.id]).map(q => "q:" + q.id)));
  drawQuarters();
  if (state.spin) ensureLoop();
})();
