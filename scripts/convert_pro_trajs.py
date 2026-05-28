#!/usr/bin/env python3
"""Convert VibeSearch-Pro jsonl trajectories into website viewer JSON."""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PRO_DIR = REPO / "data" / "trajs" / "pro"
RESPONSE_PREVIEW_CHARS = 2000
TITLE_MAX_WORDS = 6


def is_english(text: str) -> bool:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[a-zA-Z]", text))
    return latin > cjk


def title_case_words(s: str) -> str:
    words = s.split()
    out: list[str] = []
    for w in words:
        if re.fullmatch(r"\d{4}", w):
            out.append(w)
        elif w.upper() in {"CRISPR", "GVC", "NBA", "F1", "AI", "VR", "WTO", "OECD", "NBER"}:
            out.append(w.upper())
        elif re.fullmatch(r"[A-Z]{2,}", w):
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:].lower() if w else w)
    return " ".join(out)


def summarize_english_title(question: str) -> str:
    text = (question or "").strip()
    if not text:
        return "Research Task"

    lead = re.split(r"\n|…|\.\.\.", text)[0].strip()
    lead = re.sub(
        r"^(?:I(?:'ve| have|'m| am)|Please help me|Help me)\s+",
        "",
        lead,
        flags=re.I,
    )
    lead = re.sub(
        r"^(?:look up|find|get|query|research on|learn about)\s+",
        "",
        lead,
        flags=re.I,
    )

    patterns = [
        r"recently saw news that\s+(.+?)(?:\?|\.|$)",
        r"recently gotten interested in\s+(.+?)(?:,|\.|\?|$)",
        r"looking for\s+(?:information\s+)?(?:related\s+to\s+)?(.+?)(?:\s+for\s+|\s+from\s+|\?|\.|$)",
        r"systematically studying\s+(.+?)(?:,|\.|\?|$)",
        r"reading\s+(?:the\s+)?(?:section\s+on\s+)?(.+?)(?:\s+in\s+|\?|\.|$)",
        r"research on\s+(.+?)(?:\s+sold\s+|\?|\.|$)",
        r"information about\s+(.+?)(?:\s+with\s+|\?|\.|$)",
        r"how did\s+(.+?)(?:\?|\.|$)",
        r"what (?:is|are|were)\s+(.+?)(?:\?|\.|$)",
    ]
    for pat in patterns:
        m = re.search(pat, lead, flags=re.I)
        if not m or not m.group(1).strip():
            continue
        phrase = m.group(1).strip(" ,.")
        phrase = re.sub(r"^\s*the\s+", "", phrase, flags=re.I)
        words = re.findall(r"[A-Za-z0-9]+(?:'[a-z]+)?", phrase)
        if len(words) >= 2:
            return title_case_words(" ".join(words[:TITLE_MAX_WORDS]))

    words = re.findall(r"[A-Za-z0-9]+(?:'[a-z]+)?", lead)
    if len(words) >= 2:
        return title_case_words(" ".join(words[:TITLE_MAX_WORDS]))
    return "Research Task"


def summarize_chinese_title(question: str) -> str:
    text = (question or "").strip()
    if not text:
        return "研究任务"
    s = re.split(r"[。；\n：:]", text)[0].strip()
    for prefix in (
        r"^我(?:最近在|最近|目前)?",
        r"^看到新闻说",
        r"^对",
        r"^在",
    ):
        s = re.sub(prefix, "", s)
    s = re.sub(r"^(?:想|要|需要|请帮我?)?(?:了解|查询|研究|梳理|整理|看)", "", s)
    s = re.sub(r"[，,？?].*$", "", s)
    s = re.sub(r"相关的内容.*$", "", s)
    s = re.sub(r"很感兴趣.*$", "", s)
    chars = re.sub(r"\s", "", s)
    if len(chars) >= 4:
        return chars[:16]
    return chars or "研究任务"


def summarize_title(question: str) -> str:
    if is_english(question):
        return summarize_english_title(question)
    return summarize_chinese_title(question)


def slugify(title: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", title, flags=re.UNICODE)
    slug = slug.strip().replace("-", " ").replace(" ", "_")
    slug = re.sub(r"_+", "_", slug)
    return (slug[:48].strip("_") or "Task")


def extract_thinking(msg: dict) -> str:
    if msg.get("reasoning_content"):
        return str(msg["reasoning_content"]).strip()
    parts: list[str] = []
    for block in msg.get("thinking_blocks") or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "thinking":
            text = block.get("thinking") or block.get("content") or ""
            if text:
                parts.append(str(text).strip())
    return "\n\n".join(parts)


def parse_tool_args(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": str(raw)}


def messages_to_turns(messages: list[dict]) -> list[dict]:
    turns: list[dict] = []
    i = 0
    while i < len(messages):
        msg = messages[i]
        role = msg.get("role")
        if role == "system":
            i += 1
            continue
        if role == "user":
            turns.append({"type": "user", "content": msg.get("content") or ""})
            i += 1
            continue
        if role == "assistant":
            tool_calls_out: list[dict] = []
            for tc in msg.get("tool_calls") or []:
                fn = tc.get("function") or {}
                tool_calls_out.append(
                    {
                        "id": tc.get("id") or "",
                        "name": fn.get("name") or "",
                        "args": parse_tool_args(fn.get("arguments")),
                        "result": None,
                    }
                )
            i += 1
            result_by_id: dict[str, str] = {}
            while i < len(messages) and messages[i].get("role") == "tool":
                tmsg = messages[i]
                tid = tmsg.get("tool_call_id") or ""
                result_by_id[tid] = tmsg.get("content") or ""
                i += 1
            for tc in tool_calls_out:
                if tc["id"] in result_by_id:
                    tc["result"] = result_by_id[tc["id"]]
            turns.append(
                {
                    "type": "assistant",
                    "thinking": extract_thinking(msg),
                    "content": msg.get("content") or "",
                    "tool_calls": tool_calls_out,
                }
            )
            continue
        i += 1
    return turns


def count_stats(turns: list[dict]) -> dict:
    user_turns = sum(1 for t in turns if t.get("type") == "user")
    assistant_turns = sum(1 for t in turns if t.get("type") == "assistant")
    tool_calls = sum(len(t.get("tool_calls") or []) for t in turns if t.get("type") == "assistant")
    return {
        "user_turns": user_turns,
        "assistant_turns": assistant_turns,
        "tool_calls": tool_calls,
    }


def convert_record(raw: dict, num: str) -> dict:
    question = raw.get("question") or ""
    short_title = summarize_title(question)
    slug = slugify(short_title)
    qid = f"task_{num}_{slug}"

    turns = messages_to_turns(raw.get("messages") or [])
    stats = count_stats(turns)
    response = raw.get("response") or ""
    preview = response[:RESPONSE_PREVIEW_CHARS]
    if len(response) > RESPONSE_PREVIEW_CHARS:
        preview += "\n\n… [" + str(len(response) - RESPONSE_PREVIEW_CHARS) + " chars truncated]"

    return {
        "qid": qid,
        "subset": "pro",
        "sample_idx": raw.get("sample_idx", 0),
        "question": question,
        "short_title": short_title,
        "termination": raw.get("termination") or "answer",
        "metrics": {
            "node_precision": raw.get("node_precision"),
            "node_recall": raw.get("node_recall"),
            "node_f1": raw.get("node_f1"),
            "triplet_precision": raw.get("triplet_precision"),
            "triplet_recall": raw.get("triplet_recall"),
            "triplet_f1": raw.get("triplet_f1"),
        },
        "stats": stats,
        "response_preview": preview,
        "turns": turns,
    }


def load_jsonl_record(path: Path) -> dict:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"empty jsonl: {path}")
    first = text.splitlines()[0]
    try:
        return json.loads(first)
    except json.JSONDecodeError:
        return json.loads("".join(text.splitlines()))


def main() -> None:
    jsonl_files = sorted(PRO_DIR.glob("[0-9][0-9][0-9].jsonl"))
    if not jsonl_files:
        raise SystemExit(f"No pro jsonl files found in {PRO_DIR}")

    removed = 0
    for old in PRO_DIR.glob("task_*.json"):
        old.unlink()
        removed += 1

    ok = 0
    for jl in jsonl_files:
        num = jl.stem
        raw = load_jsonl_record(jl)
        payload = convert_record(raw, num)
        out = PRO_DIR / f"{num}.json"
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ok += 1
        print("ok", num, payload["short_title"], f"turns={len(payload['turns'])}")
    print("done:", ok, "converted,", removed, "legacy task_*.json removed")


if __name__ == "__main__":
    main()
