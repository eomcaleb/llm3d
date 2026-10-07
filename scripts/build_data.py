"""Build data/models.json for llm3d from Artificial Analysis.

Every model needs four measured numbers to be placed in the 3D chart:
Intelligence Index, cost per Index task, output tokens per Index task and a release date.
Models with an estimated Index score or no cost data are skipped.

Usage:
    python scripts/build_data.py              # models named in data/Intelligence Index by Model Creator.xlsx (default)
    python scripts/build_data.py --xlsx X     # models named in another AA "Intelligence Index by Model Creator" export
    python scripts/build_data.py --all        # every model Artificial Analysis lists

The spreadsheet decides which models appear and their Index scores; release dates, cost, output tokens and
time per task come from each model's Artificial Analysis page. Output: data/models.json and data/models.js
(the .js copy lets index.html open straight from disk, where browsers block fetch).

Data (c) Artificial Analysis, https://artificialanalysis.ai. Attribution is required wherever it is shown.
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import pathlib
import re
import time
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (llm3d data build)"}
BASE = "https://artificialanalysis.ai"
DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
OUT = DATA_DIR / "models.json"
OUT_JS = DATA_DIR / "models.js"
XLSX = DATA_DIR / "Intelligence Index by Model Creator.xlsx"


def get(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    return urllib.request.urlopen(req, timeout=90).read().decode("utf-8").replace('\\"', '"')


def json_object(s, i):
    """Return the balanced {...} starting at index i."""
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i:j + 1]
    raise ValueError("unbalanced object")


def leaderboard():
    """shortName -> slug, creator, estimated flag, cost per task."""
    s = get("/leaderboards/models")
    rows = {}
    for m in re.finditer(r'\{"slug":"([a-z0-9-]+)","name":"([^"]+)","shortName":"([^"]+)"', s):
        slug, name, short = m.groups()
        obj = json.loads(json_object(s, m.start()).replace('"$undefined"', "null"))
        rows[short] = dict(slug=slug, name=name, short=short, company=obj.get("modelCreatorName"),
                           estimated=obj.get("intelligenceIndexIsEstimated"), index=obj.get("intelligenceIndex"),
                           cost=obj.get("intelligenceIndexCostPerTask"))
        rows.setdefault(name, rows[short])
        rows.setdefault(slug, rows[short])   # survives renames such as "Gemini 3.5 Flash" -> "Gemini 3.5 Flash (high)"
    return rows


def families():
    """slug -> (family slug, family name, release date) from the Intelligence Index model picker."""
    s = get("/evaluations/artificial-analysis-intelligence-index")
    out = {}
    pat = r'"slug":"([a-z0-9-]+)","name":"[^"]+","deprecated":(?:true|false),"release":\{"slug":"([^"]+)","name":"([^"]+)"\},"releaseDate":"([^"]*)"'
    for m in re.finditer(pat, s):
        out.setdefault(m.group(1), (m.group(2), m.group(3), m.group(4)))
    return out


def model_page(slug):
    s = get("/models/" + slug)
    i = s.find('"currentModel":{')
    if i >= 0:
        m = json.loads(json_object(s, i + len('"currentModel":')))
    else:
        # newer page layout: the model is an entry of an "initialModels" list
        m = re.search(r'\{"id":"[^"]+","slug":"' + re.escape(slug) + '"', s)
        if not m:
            raise ValueError("model data not found on page")
        m = json.loads(json_object(s, m.start()).replace('"$undefined"', "null"))
    cost = ((m.get("intelligenceIndexCostPerTask") or {}).get("cost") or {}).get("total")
    tokens = (m.get("intelligenceIndexOutputTokensPerTask") or {}).get("output")
    effort = m.get("effort") or {}
    return dict(cost=cost, tokens=tokens, time=m.get("intelligenceIndexTimePerTask"),
                effort=effort.get("label"), level=effort.get("level"), released=m.get("releaseDate"),
                priceIn=m.get("price1mInputTokens"), priceOut=m.get("price1mOutputTokens"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=str(XLSX), help="AA Intelligence Index export that lists the models to include")
    ap.add_argument("--all", action="store_true", help="ignore the spreadsheet and include every model AA lists")
    args = ap.parse_args()

    lb = leaderboard()
    fam = families()

    if not args.all:
        import openpyxl
        ws = openpyxl.load_workbook(args.xlsx, data_only=True)["Data"]
        wanted = [(r[0], r[1], r[2]) for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]
        picks = []
        for name, index, company in wanted:
            row = lb.get(name) or lb.get(re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"))
            if row:
                picks.append(dict(row, index=index, company=company))
    else:
        picks = list({r["slug"]: r for r in lb.values()}.values())

    # only models with a measured score and cost can be placed
    picks = [p for p in picks if not p["estimated"] and p["cost"] and p["index"] is not None]
    print(f"fetching {len(picks)} model pages ...")

    def enrich(p):
        err = None
        for attempt in range(4):  # AA pages time out or rate-limit now and then
            try:
                return dict(p, **model_page(p["slug"]))
            except Exception as e:
                err = e
                time.sleep(2 + 4 * attempt)
        return dict(p, error=str(err))

    with cf.ThreadPoolExecutor(6) as ex:
        rows = list(ex.map(enrich, picks))
    for r in rows:
        if r.get("error"):
            print(f"  failed: {r['short']} ({r['error']})")
        elif not r.get("tokens") or not r.get("cost"):
            print(f"  skipped, no measured cost/tokens: {r['short']}")

    models = []
    for r in rows:
        if r.get("error") or not r.get("tokens") or not r.get("cost"):
            continue
        if r["slug"] in fam:
            fslug, fname, frel = fam[r["slug"]]
        elif r.get("released"):
            # Brand-new models reach the Index page's family picker a few days late; a model without effort
            # variants is its own family until then.
            fname = re.sub(r"\s*\([^)]*\)", "", r["name"]).strip()
            fslug, frel = re.sub(r"[^a-z0-9]+", "-", fname.lower()).strip("-"), r["released"]
        else:
            continue
        models.append(dict(
            id=r["slug"], name=r["short"], family=fname, familyId=fslug, company=r["company"],
            effort=r.get("effort"), level=r.get("level"),
            index=round(r["index"], 3), cost=round(r["cost"], 6), tokens=round(r["tokens"]),
            time=round(r["time"], 1) if r.get("time") else None,
            released=r.get("released") or frel, priceIn=r.get("priceIn"), priceOut=r.get("priceOut")))

    models.sort(key=lambda m: (m["company"], m["familyId"], m["level"] if m["level"] is not None else -1, m["cost"]))
    DATA_DIR.mkdir(exist_ok=True)
    payload = {
        "generated": dt.date.today().isoformat(),
        "source": "Artificial Analysis Intelligence Index, https://artificialanalysis.ai",
        "models": models,
    }
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    OUT_JS.write_text("// generated by scripts/build_data.py; data (c) Artificial Analysis, https://artificialanalysis.ai\n"
                      "window.LLM3D_DATA = " + json.dumps(payload) + ";\n", encoding="utf-8")
    print(f"wrote {len(models)} models from {len({m['company'] for m in models})} companies to {OUT}")


if __name__ == "__main__":
    main()
