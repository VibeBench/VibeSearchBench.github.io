#!/usr/bin/env python3
"""Download ground-truth JSON from Hugging Face into data/ground_truth/{pro,daily}/."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

REPO = Path(__file__).resolve().parents[1]
INDEX = REPO / "data" / "tasks_index.json"
OUT = REPO / "data" / "ground_truth"
HF = "https://huggingface.co/datasets/VibeSearchBench/VibeSearchBench/resolve/main"


def hf_daily_filenames(file: str) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()

    def add(name: str) -> None:
        if name and name not in seen:
            seen.add(name)
            names.append(name)

    add(file)
    m = re.match(r"^(task_\d+_)(.+)\.json$", file, re.I)
    if m:
        slug = re.sub(r"_+$", "", m.group(2))
        spaced = m.group(1) + slug.replace("_", " ") + ".json"
        add(spaced)
        add(spaced.replace(".json", "\u200c.json"))
    return names


def hf_pro_filename(file: str) -> str | None:
    m = re.match(r"^(\d{3})\.json$", file)
    if m:
        return f"{m.group(1)}.json"
    m2 = re.match(r"^task_(\d{3})_", file, re.I)
    if m2:
        return f"{m2.group(1)}.json"
    return None


def fetch_hf_json(path: str) -> dict | None:
    url = f"{HF}/{quote(path, safe='/')}"
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data and (data.get("nodes") or data.get("triples")):
            return data
    except urllib.error.HTTPError:
        return None
    return None


def fetch_gt_for_task(subset: str, file: str) -> dict | None:
    if subset == "pro":
        hf_name = hf_pro_filename(file)
        if hf_name:
            data = fetch_hf_json(f"VibeSearch-Pro/{hf_name}")
            if data:
                return data
    for name in hf_daily_filenames(file):
        data = fetch_hf_json(f"VibeSearch-Daily/{name}")
        if data:
            return data
    return None


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    ok = 0
    for subset, meta in index["subsets"].items():
        for task in meta.get("tasks") or []:
            file = task["file"]
            data = fetch_gt_for_task(subset, file)
            if not data:
                print("MISSING", subset, file)
                continue
            dest = OUT / subset
            dest.mkdir(parents=True, exist_ok=True)
            (dest / file).write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            ok += 1
            print("ok", subset, file, f"({len(data.get('triples', []))} triples)")
    print("done:", OUT, ok, "files")


if __name__ == "__main__":
    main()
