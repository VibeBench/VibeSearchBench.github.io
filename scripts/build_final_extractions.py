#!/usr/bin/env python3
"""Export full final KG extractions from trajectory jsonl into data/final_extractions/."""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TRAJ_DIR = REPO / "data" / "trajs" / "pro"
JSONL_DIR = REPO / "data" / "trajs" / "claude-opus-4.6_custom_serper_simulated" / "trajs_reextract"
OUT = REPO / "data" / "final_extractions"


def parse_triplets_from_response(raw: str) -> list[dict]:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```\s*$", "", text)
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return _normalize_triplet_list(parsed)
    except json.JSONDecodeError:
        if text.startswith("[") and not text.endswith("]"):
            try:
                return _normalize_triplet_list(json.loads(text.rstrip(",") + "]"))
            except json.JSONDecodeError:
                pass

    triplet_re = re.compile(
        r'\{\s*"head"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"relation"\s*:\s*'
        r'"((?:\\.|[^"\\])*)"\s*,\s*"tail"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}'
    )
    out: list[dict] = []
    for head, relation, tail in triplet_re.findall(raw):
        try:
            out.append(
                {
                    "head": json.loads(f'"{head}"'),
                    "relation": json.loads(f'"{relation}"'),
                    "tail": json.loads(f'"{tail}"'),
                }
            )
        except json.JSONDecodeError:
            continue
    return out


def _normalize_triplet_list(parsed: list) -> list[dict]:
    return [
        {
            "head": str(t["head"]),
            "relation": str(t.get("relation", "")),
            "tail": str(t["tail"]),
        }
        for t in parsed
        if t and t.get("head") is not None and t.get("tail") is not None
    ]


def jsonl_for_traj(traj_file: str) -> Path | None:
    stem = traj_file.replace(".json", "")
    index = {p.stem: p for p in JSONL_DIR.glob("*.jsonl")}
    if stem in index:
        return index[stem]
    m = re.match(r"^(task_\d+_)(.+)$", stem, re.I)
    if m:
        slug = re.sub(r"_+$", "", m.group(2))
        spaced = m.group(1) + slug.replace("_", " ")
        if spaced in index:
            return index[spaced]
        if spaced + "\u200c" in index:
            return index[spaced + "\u200c"]
    m2 = re.match(r"task_(\d+)", stem)
    if m2:
        prefix = f"task_{m2.group(1)}"
        for k, p in index.items():
            if k.startswith(prefix):
                return p
    return None


def main() -> None:
    ok = 0
    for traj_path in sorted(TRAJ_DIR.glob("*.json")):
        jl = jsonl_for_traj(traj_path.name)
        if not jl:
            print("MISSING jsonl", traj_path.name)
            continue
        row = json.loads(jl.read_text(encoding="utf-8").splitlines()[0])
        triplets = parse_triplets_from_response(row.get("response") or "")
        if not triplets:
            print("EMPTY", traj_path.name)
            continue
        payload = {
            "qid": row.get("qid") or traj_path.stem,
            "total": len(triplets),
            "triplets": triplets,
        }
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        for subset in ("pro", "daily"):
            dest = OUT / subset
            dest.mkdir(parents=True, exist_ok=True)
            (dest / traj_path.name).write_text(text, encoding="utf-8")
        ok += 1
        nodes = len({t["head"] for t in triplets} | {t["tail"] for t in triplets})
        print("ok", traj_path.name, len(triplets), "triplets", nodes, "nodes")
    print("done:", OUT, ok, "tasks")


if __name__ == "__main__":
    main()
