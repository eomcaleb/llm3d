# llm3d: how the visualization must work

Read this before adding models, refreshing data or changing the charts. It records how the site is meant to look and behave, so new data lands the same way every time. If a change here conflicts with a new request, the new request wins; update this file to match.

llm3d is a **generic** site for comparing AI models. It must never be framed as one model against another. It lives at https://eomcaleb.github.io/llm3d/ and is served by GitHub Pages from `main`, repo root.

## Adding or refreshing models

1. Replace `data/Intelligence Index by Model Creator.xlsx` with a new Artificial Analysis export. That spreadsheet is the only list of which models exist and their Intelligence Index scores. A scheduled task may update it.
2. Run `python scripts/build_data.py`. It needs internet access and `openpyxl`. It writes `data/models.json` and `data/models.js`.
   - **What comes from where:** release dates, cost per task, output tokens per task, time per task and prices come from each model's Artificial Analysis page. A model family (its effort levels) comes from the Intelligence Index page.
   - **Which models are kept:** only models with a *measured* score, cost, tokens and release date. Models with estimated scores are skipped.
3. Check for bad source data. Artificial Analysis has shipped copied figures before (one model's cost, tokens and time repeated exactly on another). If two different models have identical cost, tokens and time, drop the copy and say so.
4. Open `index.html` (it works straight from disk because the data ships as `data/models.js`), check both tabs, then commit and push to `main`.

Do not hand-edit the numbers in `data/models.*`; regenerate them.

## Page structure

- **Header:**
  - **Wordmark:** "llm3d" plus the line "Compare AI models by intelligence, price and tokens used".
  - **Tabs:** **Home** and **Companies**.
  - **Data line:** the model count, company count and data date.
- **Loading screen:** three bouncing bars and "llm3d Plotting the models…". It stays until the 3D chart has painted, then fades. If Plotly or the data can't load, it shows an error.
- **Footer:** the only text below the charts is the Artificial Analysis attribution. Attribution is required; never remove it.
- **No extra text:** no explanatory paragraphs, notes or data tables.
- **Look:** black background, Inter font, dark theme only.
- **Mouse pointer:** the normal pointer shows over the charts.

## Home tab

### Model picker

- **One dropdown per company:** it lists the company's model families (a family = one model name across its effort levels) with each family's best score. A checkbox shows or hides each family.
- **Company order, and on by default:** Anthropic, OpenAI, Google, SpaceXAI, Kimi (Moonshot), DeepSeek, Z AI, Meta, NVIDIA, MiniMax, Mistral. Each of these shows its **top-scoring family** by default.
- **Every other company:** listed after these, by best score, and switched off.
- **"Top model per company"** restores the default. **"Clear"** hides everything.
- **Company colors:** fixed brand-ish hues in `BRAND` in `assets/app.js`. Companies not in `BRAND` get quiet grey tints. A new major lab should get a `BRAND` color that doesn't clash with the existing ones.
- **Telling families apart:** each family in a company gets a different marker shape, and every line is labeled at its last point.

### 3D chart

- **Axes:**
  - **X:** cost per task.
  - **Y:** output tokens per task.
  - **Z:** Intelligence Index, always 0–100.
  - **Scale:** all linear from 0. No log scale.
- **Frame:** the axes and grid are drawn as fixed 3D geometry out of the zero corner, so labels never jump sides while rotating.
  - **Labels:** axis labels are scene annotations, pinned to a 3D position at a fixed pixel size. Plotly's own 3D text shrinks with depth.
  - **Ticks:** kept sparse, about 5 per axis.
  - **Walls:** the two vertical walls have a faint tint, so it reads which side is in front while rotating.
- **Lines:** each family is one line across its effort levels, from lightest to heaviest effort, in the company color. A family with one configuration is a single point.
- **Views** (buttons inside the chart, top left): "3D overview", "Intelligence vs price", "Intelligence vs tokens". The flat views glide the camera there and hide the axis that points at the viewer.
- **Auto-rotate** (icon inside the chart, top right): **on by default**. It loops a fixed path:
  1. Swing one way to one angle.
  2. Swing back the other way to another angle.
  3. Rise to a top-down view.
  4. Return to the overview.

  Each move is eased, with a short pause between moves. Dragging the chart or picking a view stops it; the icon turns it back on.
- **Removed on purpose, do not bring back:** Pareto frontier toggles in 3D, project forward, Baseline Scaling / True Pareto, separate cost-efficient and token-efficient curves, the depth-axis switch, drop lines, floor shadows, the linear/log switch, the price what-if.

### Efficient-scaling target

- **On by default.** One compact dropdown button: "Efficient-scaling target · On ▾".
- **The dropdown holds:**
  - **Show target:** On / Off.
  - **Climb to 100:** plain-language shape names (Steady climb, Gentle curve, Strong early curve, Quick gains then plateau, Fast start then eases off, Most gains up front). The formula shows in small print only after a shape is chosen.
  - **Reaches 100 using:** a slider worded as a share of the budget ("half of the budget"), with the actual cost and tokens in small print.
- **The curve:** a model that scales well on both cost and tokens. It reaches 100 using only that share of the chart's cost and token range.
- **Connectors:** from each shown model to the curve. They must stay **faint** (thin, low opacity) so they never compete with the model lines. They are colored green (close) → amber → red (far), relative to the farthest model shown, with a small key inside the chart.

### How the frontier moved

- **Layout:** a separate section below the 3D chart with two 2D charts, **stacked vertically, each full width**: "Intelligence vs price", then "Intelligence vs tokens".
- **What's plotted:** each quarter's Pareto frontier (best score for the money, or for the tokens) of the models **released in that quarter only**, from all companies, not only the selected ones.
- **Quarters:** Q1–Q4 of the data's year, one chip each. A quarter with no releases yet is disabled.
- **Colors:** **shades of one violet hue**, older quarters dimmer and newer brighter. Not different hues.
- **Axes:** start at 0,0, are fixed (no zoom or pan) and **fitted to the data** with a little headroom. Intelligence is not stretched to 100. Ticks are sparse.
- **Labels:** every model on a frontier is labeled, with the part in brackets on its own second line ("Claude Opus 5.5" / "(max with fallback)").

## Companies tab

- **Rows:** one row per company, stacked vertically, currently Anthropic, OpenAI, SpaceXAI, DeepSeek, Kimi (`COMPANY_TAB` in `assets/app.js`).
- **Charts:** each row has "Intelligence vs price" on the left and "Intelligence vs tokens" on the right, on the same fixed axes as the frontier charts.
- **Lines:** each family is drawn as **its own line** across its effort levels, with **one label per line**. No Pareto frontiers on this tab.
- **Toggles:** every family is a toggle button, all on by default, with a color dot matching its line. No dropdowns here.
- **Colors:**
  - **Hue:** each **model class** gets its own hue. The class is the name without version numbers or bracketed dates: Opus, Sonnet, Haiku and Fable; GPT Sol, GPT Luna, GPT Astra, GPT mini and so on; Grok; DeepSeek Pro and DeepSeek Flash.
  - **Shade:** **versions** of a class are shades of that hue, newest brightest.
  - **Within one family:** a family's effort levels always share one color.
  - **Code:** `modelClass()` and `familyColors()` in `assets/app.js`. If a new naming pattern produces a wrong class, fix `modelClass()` instead of hard-coding colors.

## Performance rules (lag is the thing to avoid)

- **Charts redraw only when something changes:** once per toggle or setting. Never rebuild a chart on every animation frame, and no draw-in animations.
- **The only per-frame work is moving the 3D camera** (auto-rotate and view glides), at about 30 updates a second with `Plotly.relayout` on the camera only.
- **Load order:** the 3D chart draws first; the 2D charts draw after it has painted.
- **Adding a feature:** prefer the simpler version when a feature would add per-frame work.

## Code layout

- `index.html`: the page.
- `assets/style.css`: styles, with colors as CSS variables at the top.
- `assets/app.js`: all logic, with constants for colors, default companies, the Companies tab list, views and the auto-rotate path at the top.
- `scripts/build_data.py`: the data build.
- `data/`: the spreadsheet plus generated `models.json` and `models.js`.
- **Libraries:** Plotly 3.0.1 from cdnjs. No other libraries.
- **License:** MIT (`LICENSE`). Data (c) Artificial Analysis, used with attribution.
