#!/usr/bin/env python3
"""Download ground-truth JSON from Hugging Face into data/ground_truth/{pro,daily}/."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
INDEX = REPO / "data" / "tasks_index.json"
OUT = REPO / "data" / "ground_truth"
HF = "https://huggingface.co/datasets/VibeSearchBench/VibeSearchBench/resolve/main"


def task_number(qid: str) -> str | None:
    m = __import__("re").match(r"^task_(\d+)_", qid, __import__("re").I)
    return m.group(1) if m else None


def hf_url(subset: str, qid: str, file: str) -> str:
    num = task_number(qid)
    if subset == "pro" and num:
        return f"{HF}/VibeSearch-Pro/{num}.json"
    from urllib.parse import quote

    return f"{HF}/VibeSearch-Daily/{quote(file)}"


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    for subset, cfg in index["subsets"].items():
        dest = OUT / subset
        dest.mkdir(parents=True, exist_ok=True)
        for task in cfg["tasks"]:
            qid = task["qid"]
            file = task["file"]
            url = hf_url(subset, qid, file)
            out_path = dest / file
            print("fetch", url, "->", out_path)
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("done:", OUT)


if __name__ == "__main__":
    main()
