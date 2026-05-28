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

KEEP_UPPER = {
    "CRISPR",
    "DMA",
    "DAAs",
    "DAA",
    "GVC",
    "WTO",
    "OECD",
    "NBER",
    "IMF",
    "SDR",
    "TPC",
    "WIMP",
    "PICO",
    "DEAP",
    "SWI",
    "SNF",
    "HCV",
    "EU",
    "UK",
    "US",
    "AI",
    "VR",
    "AR",
    "BS",
}


def title_case_words(s: str) -> str:
    words = s.split()
    out: list[str] = []
    for w in words:
        if "/" in w:
            parts = w.split("/")
            out.append("/".join(
                p.upper() if p.upper() in KEEP_UPPER or (len(p) <= 6 and p.isupper()) else (
                    p[:1].upper() + p[1:].lower() if p else p
                )
                for p in parts
            ))
            continue
        if re.fullmatch(r"\d{4}", w):
            out.append(w)
        elif w.upper() in KEEP_UPPER or (len(w) <= 6 and w.isupper()):
            out.append(w.upper())
        elif re.fullmatch(r"[A-Z]{2,}", w):
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:].lower() if w else w)
    return " ".join(out)


def is_english(text: str) -> bool:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[a-zA-Z]", text))
    return latin > cjk


def clean_phrase(phrase: str) -> str:
    phrase = re.sub(r"\s+", " ", phrase.strip(" ,.;:?!\"'"))
    phrase = re.sub(r"^\s*the\s+", "", phrase, flags=re.I)
    phrase = re.sub(
        r"\s+(?:first|recently|lately|that|which|who|where|when|from|for|with|has|have|is|are|was|were|got|get)\b.*$",
        "",
        phrase,
        flags=re.I,
    )
    return phrase.strip()


TITLE_BAD_START = re.compile(
    r"^(?:How|Let Me|They|Two|Each|A Worm|Rise Of|I(?:'ve|'m| Am)?|We(?:'ve|'re)?|What|When|Where|Why|The Exact)\b",
    re.I,
)


def is_weak_title(title: str) -> bool:
    if not title or title in ("Research Task", "研究任务"):
        return True
    return bool(TITLE_BAD_START.match(title))


def title_from_phrase(phrase: str) -> str:
    phrase = clean_phrase(phrase)
    if not phrase:
        return ""
    tokens = re.findall(r"[A-Za-z0-9]+(?:'[a-z]+)?|/[A-Za-z0-9]+", phrase)
    merged: list[str] = []
    for tok in tokens:
        if tok.startswith("/") and merged:
            merged[-1] = merged[-1] + tok
        else:
            merged.append(tok)
    tokens = merged
    if len(tokens) < 1:
        return ""
    if len(tokens) == 1:
        tok = tokens[0]
        if tok.upper() in KEEP_UPPER or len(tok) >= 5:
            return title_case_words(tok)
        return ""
    return title_case_words(" ".join(tokens[:TITLE_MAX_WORDS]))


NAMED_TERMS_EN = [
    "SWI/SNF chromatin remodeling complex",
    "cross-border data flows",
    "gravitational wave detection",
    "mergers and acquisitions",
    "quantum error-correcting codes",
    "implied volatility surface",
    "Digital Markets Act",
    "Black-Scholes",
    "CRISPR gene editing therapy",
    "CRISPR gene editing",
    "interactive proof systems",
    "PCP theorem",
    "LSM-Tree",
    "RocksDB",
    "constitutional review systems",
    "war crimes",
    "Tallinn Manual",
    "OS kernel design",
    "iPSC reprogramming",
    "gut microbiota",
    "tumor microenvironment",
    "LLVM compiler",
    "LLVM IR",
    "hepatitis C treatment",
    "hepatitis C",
    "superconductors",
    "superconductivity",
    "option pricing",
    "quantum error correction",
    "CRISPR",
    "sovereign debt default",
    "Argentina sovereign debt",
    "QCD vacuum",
    "QCD vacuum instantons",
    "instantons",
    "quantum simulation of Fermi gases",
    "Fermi gases in optical lattices",
    "optical lattices",
    "Alzheimer's disease",
    "amyloid and tau",
    "nudge theory",
    "long-term potentiation",
    "synaptic plasticity",
    "Internet routing security",
    "BGP routing security",
    "RPKI",
    "carbon pricing",
    "EU ETS",
    "statistical mechanics",
    "industrial policy",
    "algorithmic stablecoin",
    "crypto collapse 2022",
    "history of calculus",
    "Newton and Leibniz calculus",
    "Newton and Leibniz",
    "UN Security Council veto",
    "buffer overflow",
    "Morris worm",
    "common ancestry",
    "evolutionary theory",
]


def summarize_english_title(question: str) -> str:
    text = (question or "").strip()
    if not text:
        return "Research Task"

    lower = text.lower()
    for term in sorted(NAMED_TERMS_EN, key=len, reverse=True):
        if term.lower() in lower:
            title = title_from_phrase(term)
            if title and not is_weak_title(title):
                return title

    for m in re.finditer(r"([A-Z][A-Za-z0-9/\-\s]{2,45}?)\s*\(([A-Z]{2,8})\)", text):
        name = clean_phrase(m.group(1))
        if name and len(name.split()) <= 8 and not is_weak_title(name):
            title = title_case_words(f"{name} ({m.group(2)})")
            if not is_weak_title(title):
                return title

    patterns = [
        r"interested in (?:the complete story of )?([^.?\n]{4,90}?)(?:\.|,|\?| Starting)",
        r"systematically studying the field of ([^.?\n]{4,90}?)(?: and|,|\.)",
        r"particularly interested in the line of development from ([^.?\n]{4,90}?)\s+to",
        r"article about ([^.?\n]{4,90}?)(?: that|\.|,|\?| mentioned)",
        r"history of ([^.?\n]{4,90}?)(?: and |,|\.|\?| treatment| —|-)",
        r"field of ([^.?\n]{4,90}?)(?: first|\.|,|\?)",
        r"reading about ([^.?\n]{4,90}?)(?: recently|,|\.)",
        r"reading (?:a survey on|papers on|some popular science articles about) ([^.?\n]{4,90}?)(?: recently|,|\.)",
        r"reading the ([^.?\n]{4,90}?) source code recently",
        r"learning about ([^.?\n]{4,90}?)(?:\.|,|\?| I)",
        r"studying the ([^.?\n]{4,90}?)(?: recently|,|\.)",
        r"systematically understand (?:the )?([^.?\n]{4,90}?)(?:\.| First| What)(?! family)",
        r"understand (?:the entire journey of |how )(?:the )?([^.?\n]{4,90}?)(?:\.| What| from)",
        r"concept of (?:the )?([^.?\n]{4,90}?)(?:,|\.)",
        r"world['’]s first ([^.?\n]{4,90}?)(?: was|\.|\?| approved)",
        r"following (?:the |various )?([^.?\n]{4,90}?)(?: that| around|,|\.)",
        r"researching ([^.?\n]{4,90}?)(?: lately| recently and|,|\.)",
        r"around ([^.?\n]{4,70}?)(?:,| and|\.|\?)",
        r"development of ([^.?\n]{4,90}?)(?:\?|\.|\n| First)",
        r"how did (?:this |the )?([^.?\n]{4,80}?)(?: come| work|\?)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.I)
        if not m:
            continue
        title = title_from_phrase(m.group(1))
        if title and not is_weak_title(title):
            return title

    return "Research Task"


def summarize_chinese_title(question: str) -> str:
    text = (question or "").strip()
    if not text:
        return "研究任务"

    patterns = [
        r"对(.+?)很感兴趣",
        r"有种叫\s*(.+?)\s*的",
        r"在研读(.+?)的文献",
        r"在研究(.+?)的演变",
        r"在研究(.+?)，想",
        r"关于(.+?)，",
        r"梳理一下(.+?)，",
        r"想弄明白(.+?)是",
        r"近些年来(.+?)方面",
        r"量子计算领域在(.+?)方面",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if not m:
            continue
        s = re.sub(r"\s", "", m.group(1).strip())
        s = re.sub(r"^(?:全球|各种|不同|相关)", "", s)
        if len(s) >= 4:
            return s[:18]

    s = re.split(r"[。；\n？?]", text)[0]
    s = re.sub(r"^我(?:最近在|最近|目前)?(?:看到新闻说)?", "", s)
    s = re.sub(r"^(?:想|要|需要|请帮我?)?(?:了解|查询|研究|梳理|整理|看|弄明白)", "", s)
    s = re.sub(r"[，,].*$", "", s)
    s = re.sub(r"\s", "", s)
    return s[:18] if len(s) >= 4 else "研究任务"


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
