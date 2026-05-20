#!/usr/bin/env python3
"""Download ground-truth JSON from Hugging Face into data/ground_truth/{pro,daily}/."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

REPO = Path(__file__).resolve().parents[1]
INDEX = REPO / "data" / "tasks_index.json"
OUT = REPO / "data" / "ground_truth"
HF = "https://huggingface.co/datasets/VibeSearchBench/VibeSearchBench/resolve/main"


def hf_daily_filenames(file: str) -> list[str]:
    """HF Daily uses spaces in the title slug; task_NNN_ prefix keeps underscores."""
    import re

    names: list[str] = []
    seen: set[str] = set()
    for name in (file,):
        if name not in seen:
            seen.add(name)
            names.append(name)
    m = re.match(r"^(task_\d+_)(.+)\.json$", file, re.I)
    if m:
        slug = re.sub(r"_+$", "", m.group(2))
        spaced = m.group(1) + slug.replace("_", " ") + ".json"
        for name in (spaced, spaced.replace(".json", "\u200c.json")):
            if name not in seen:
                seen.add(name)
                names.append(name)
    return names


def fetch_hf_gt(file: str) -> dict | None:
    for name in hf_daily_filenames(file):
        url = f"{HF}/VibeSearch-Daily/{quote(name)}"
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if data and (data.get("nodes") or data.get("triples")):
                return data
        except urllib.error.HTTPError:
            continue
    return None


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    tasks = index["subsets"]["pro"]["tasks"]
    ok = 0
    for task in tasks:
        file = task["file"]
        data = fetch_hf_gt(file)
        if not data:
            print("MISSING", file)
            continue
        text = json.dumps(data, ensure_ascii=False, indent=2)
        for subset in ("pro", "daily"):
            dest = OUT / subset
            dest.mkdir(parents=True, exist_ok=True)
            (dest / file).write_text(text, encoding="utf-8")
        ok += 1
        print("ok", file, f"({len(data.get('triples', []))} triples)")
    print("done:", OUT, f"{ok} files x 2 subsets")


if __name__ == "__main__":
    main()
