#!/usr/bin/env python3
"""Build data/tasks_index.json from per-subset trajectory exports."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TRAJ_ROOT = REPO / "data" / "trajs"
OUT = REPO / "data" / "tasks_index.json"

SUBSETS = {
    "pro": {
        "label": "VibeSearch-Pro",
        "description": "Professional research scenarios",
    },
    "daily": {
        "label": "VibeSearch-Daily",
        "description": "Daily-life scenarios",
    },
}


def truncate_question(text: str | None, max_len: int = 220) -> str:
    q = (text or "").strip()
    if len(q) <= max_len:
        return q
    return q[: max_len - 1].rstrip() + "…"


def task_entry(traj_path: Path, data: dict) -> dict:
    metrics = data.get("metrics") or {}
    stats = data.get("stats") or {}
    return {
        "qid": data.get("qid") or traj_path.stem.replace("_", " "),
        "file": traj_path.name,
        "question": truncate_question(data.get("question")),
        "triplet_f1": metrics.get("triplet_f1"),
        "node_f1": metrics.get("node_f1"),
        "user_turns": stats.get("user_turns"),
        "tool_calls": stats.get("tool_calls"),
    }


def build_subset(subset: str) -> dict:
    traj_dir = TRAJ_ROOT / subset
    if not traj_dir.is_dir():
        raise SystemExit(f"Missing trajectory directory: {traj_dir}")

    tasks: list[dict] = []
    for traj_path in sorted(traj_dir.glob("*.json")):
        data = json.loads(traj_path.read_text(encoding="utf-8"))
        tasks.append(task_entry(traj_path, data))

    tasks.sort(
        key=lambda t: (
            -(t.get("triplet_f1") if t.get("triplet_f1") is not None else -1),
            t["file"],
        )
    )

    meta = SUBSETS[subset]
    return {
        "label": meta["label"],
        "description": meta["description"],
        "demo": False,
        "tasks": tasks,
    }


def main() -> None:
    index = {"subsets": {name: build_subset(name) for name in SUBSETS}}
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, subset in index["subsets"].items():
        print(name, len(subset["tasks"]), "tasks")
    print("done:", OUT)


if __name__ == "__main__":
    main()
