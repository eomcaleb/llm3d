# llm3d

Compare AI models by **intelligence**, **price** and **tokens used** in one rotatable 3D chart.

- **Intelligence:** the Artificial Analysis Intelligence Index.
- **Price:** cost per Index task.
- **Tokens used:** output tokens per Index task.

Live site: https://eomcaleb.github.io/llm3d/

## Features

- **Pick models by company:** each company has a dropdown listing its model families. The chart starts with the top model from a set of leading labs; every other company starts switched off.
- **Effort levels:** a model family with several effort levels (low → max) is drawn as one line.
- **Views:** switch between the 3D overview and two flat views, "Intelligence vs price" and "Intelligence vs tokens". Auto-rotate wanders through a few 3D angles, then glides into each flat view and pauses there. It's on by default; the rotate icon inside the chart turns it off.
- **Efficient-scaling target:** a reference curve for a model that reaches a perfect 100 using only part of the budget. Pick how it climbs and how much budget it needs. Connectors show each model's distance from the curve, from green (close) to red (far).
- **How the frontier moved:** Pareto frontiers of intelligence vs price and intelligence vs tokens, for the models released in each quarter.
- **Companies tab:** the same quarterly frontiers for one company per row (Anthropic, OpenAI, SpaceXAI, DeepSeek, Kimi), with a toggle for each of the company's model families.

## Run locally

Open `index.html` directly. The data ships as `data/models.js`, so the page works from disk too. Or serve the folder:

```sh
python -m http.server 8000
# open http://localhost:8000
```

## Refresh the data

```sh
python scripts/build_data.py            # models listed in data/Intelligence Index by Model Creator.xlsx (needs openpyxl)
python scripts/build_data.py --all      # every model Artificial Analysis lists
```

The spreadsheet decides which models appear and their Intelligence Index scores; release dates, cost, output tokens and time per task come from each model's Artificial Analysis page. Update the spreadsheet (for example with a scheduled task) and rerun the script to refresh the site. A model is only included when Artificial Analysis has measured all four of these:

- Intelligence Index
- Cost per task
- Output tokens per task
- Release date

Models with only an estimated score are skipped.

## Deploy (GitHub Pages)

The site is static and served from the repository root on `main`. The `.nojekyll` file tells GitHub Pages to serve the files as-is. In **Settings → Pages**, set the source to "Deploy from a branch", branch `main`, folder `/ (root)`.

## Data and attribution

Data: [Artificial Analysis](https://artificialanalysis.ai). Attribution to Artificial Analysis is required wherever this data is shown. Use of the data is subject to the Artificial Analysis [Terms of Use](https://artificialanalysis.ai/docs/legal/Terms-of-Use.pdf).

## License

Code: MIT, see [LICENSE](LICENSE).
