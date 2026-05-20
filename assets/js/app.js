function asset(path) {
  if (path.startsWith("http")) return path;
  return new URL(path, document.baseURI).href;
}

async function loadJSON(path) {
  const url = path.startsWith("http") ? path : asset(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let markdownReady = false;

function ensureMarkdown() {
  if (markdownReady || typeof marked === "undefined") return;
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
  });
  markdownReady = true;
}

function preprocessTrajectoryMarkdown(text) {
  let s = String(text);
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/^={3,}\s*$/gm, "\n---\n");
  s = s.replace(
    /^The useful information in .+ for user goal .+ as follows:\s*/gm,
    ""
  );
  s = s.replace(/^Evidence in page:\s*/gim, "**Evidence in page**\n\n");
  s = s.replace(/^Summary:\s*/gim, "**Summary**\n\n");
  return s;
}

function renderMarkdown(text) {
  if (text == null || text === "") return "";
  const src = String(text);
  if (typeof marked !== "undefined") {
    ensureMarkdown();
    let html = marked.parse(src);
    if (typeof DOMPurify !== "undefined") {
      html = DOMPurify.sanitize(html, {
        ADD_ATTR: ["target", "rel"],
      });
      html = html.replace(
        /<a href=/g,
        '<a target="_blank" rel="noopener noreferrer" href='
      );
    }
    return html;
  }
  return escapeHtml(src);
}

function renderTrajectoryMarkdown(text) {
  return renderMarkdown(preprocessTrajectoryMarkdown(text));
}

function renderToolArgs(args) {
  const formatted = formatArgs(args);
  const trimmed = formatted.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return '<pre class="tool-args">' + escapeHtml(formatted) + "</pre>";
  }
  return '<div class="tool-args md-body">' + renderTrajectoryMarkdown(formatted) + "</div>";
}

function formatArgs(args) {
  if (typeof args === "string") return args;
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatTaskTitle(raw) {
  return String(raw)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function parseTaskId(qid) {
  if (!qid) return { number: "", title: "Task", label: "Task" };
  const m = String(qid).match(/^task_(\d+)_(.+)$/i);
  if (!m) return { number: "", title: formatTaskTitle(qid), label: formatTaskTitle(qid) };
  const number = m[1];
  const title = formatTaskTitle(m[2]);
  return { number: number, title: title, label: number + " " + title };
}

const TITLE_MAX_WORDS = 6;

const DOMAIN_TITLES = [
  [/marvel|captain america|civil war/i, "Marvel Superhero VFX"],
  [/cs:go|csgo|counter-strike|hltv/i, "CSGO Major Tournaments"],
  [/qi2|wireless charger|magnetic wireless/i, "Qi2 Wireless Chargers"],
  [/ikea|furniture/i, "IKEA Furniture Shopping"],
  [/museum|louvre|british museum/i, "Europe Museum Travel"],
  [/trek|trekking|lonely planet/i, "World Trekking Routes"],
  [/cruise|gangwaze|youlun/i, "Cruise Trip Planning"],
  [/national park|yellowstone/i, "US National Parks"],
  [/oscar|academy award/i, "Oscar Winning Films"],
  [/tennis|wimbledon|us open/i, "Tennis Gear Shopping"],
  [/disney|pixar|animated/i, "Disney Animation Studios"],
  [/hospital|clinical|medical/i, "Hospital Specialist Search"],
  [/coffee|espresso/i, "Coffee Bean Research"],
  [/vinyl|record/i, "Vinyl Record Collecting"],
  [/surf|climbing shoe/i, "Climbing Shoe Selection"],
  [/university|qs ranking|college/i, "University Hospital Search"],
  [/phone|smartphone|iphone|android/i, "Smartphone Comparison"],
  [/game music|soundtrack/i, "Game Music Discovery"],
  [/maternal|pregnancy/i, "Maternal Health Products"],
  [/tropical fish|aquarium/i, "Tropical Fish Care"],
  [/sushi|restaurant/i, "Sushi Restaurant Research"],
];

const SLUG_TITLES = {
  marvel: "Marvel Superhero VFX",
  phone: "Qi2 Wireless Chargers",
  museum: "Europe Museum Travel",
  hospital: "University Hospital Search",
  furnitureselect: "IKEA Furniture Shopping",
  csgo: "CSGO Tournaments",
  tubuluxian: "World Trekking Routes",
  youlun: "Cruise Trip Planning",
  erjijiangzao: "Noise Cancelling Earbuds",
  huaban: "Skateboard Deck Research",
  chonglangban: "Surfboard Selection",
  shipin: "Sushi Brands Menus",
  shizhuangzhou: "Fashion Week Brands",
  muying: "Baby Product Safety",
  yinger: "Infant Formula Research",
};

const SLUG_TITLES_ZH = {
  hospital: "附属医院脑科查询",
  youlun: "邮轮出行规划",
  erjijiangzao: "降噪耳机选购",
  huaban: "滑板装备查询",
  shipin: "寿司品牌菜单",
  shizhuangzhou: "时装周品牌",
  muying: "母婴用品安全",
  yinger: "婴儿奶粉研究",
};

const DOMAIN_TITLES_ZH = [
  [/医院|附属|临床|脑科|QS/, "附属医院脑科查询"],
  [/奥斯卡|导演|电影/, "奥斯卡导演电影"],
  [/沙发|家具/, "沙发家具选购"],
  [/咖啡/, "咖啡豆研究"],
  [/寿司/, "寿司品牌查询"],
];

function clipTitleWords(s, max) {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join(" ");
}

function titleCaseWords(s) {
  return s.split(/\s+/).map(function (w) {
    if (/^\d{4}$/.test(w)) return w;
    if (/^cs:?go$/i.test(w)) return "CSGO";
    if (/^qi2$/i.test(w)) return "Qi2";
    if (/^ikea$/i.test(w)) return "IKEA";
    if (/^[A-Z][a-z]/.test(w) || /^[A-Z]{2,}$/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}

function trimIncompletePhrase(s) {
  let t = s.trim().replace(/\s+/g, " ");
  const dropEnd =
    /\s+(?:to|for|of|in|on|at|with|the|a|an|and|or|during|from|as|by|into|related|that|who|which|whose|where|when|please|strictly|following|all|my|me|you|help|need|want|get|look|up|information|details|requirements|constraints)+$/i;
  while (dropEnd.test(t)) t = t.replace(dropEnd, "");
  return t.trim();
}

function finalizeEnglishTitle(s) {
  const t = titleCaseWords(trimIncompletePhrase(clipTitleWords(s, TITLE_MAX_WORDS)));
  const n = t.split(/\s+/).filter(Boolean).length;
  if (n < 2) return "";
  return t;
}

function slugKeyFromQid(qid) {
  const raw = String(qid).match(/^task_\d+_(.+)$/i);
  if (!raw) return "";
  return raw[1].toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleFromSlug(qid, chinese) {
  const key = slugKeyFromQid(qid);
  if (!key) return "";
  if (chinese && SLUG_TITLES_ZH[key]) return SLUG_TITLES_ZH[key];
  if (SLUG_TITLES[key]) return SLUG_TITLES[key];
  const raw = String(qid).match(/^task_\d+_(.+)$/i);
  if (!raw) return "";
  const spaced = formatTaskTitle(raw[1]);
  if (/^[A-Za-z][a-z]+(\s+[A-Za-z][a-z]+)*$/.test(spaced) && spaced.length <= 28) return spaced;
  if (/\b(US|UK|NBA|F1|AI|VR|AR|OS)\b/i.test(spaced)) return clipTitleWords(spaced, TITLE_MAX_WORDS);
  if (/[A-Z]{2,}/.test(spaced)) return clipTitleWords(spaced, TITLE_MAX_WORDS);
  return "";
}

function summarizeChineseTitle(lead, qid) {
  const text = String(lead || "");
  for (let i = 0; i < DOMAIN_TITLES_ZH.length; i++) {
    if (DOMAIN_TITLES_ZH[i][0].test(text)) return DOMAIN_TITLES_ZH[i][1];
  }

  let s = text
    .replace(/^我想要查询的相关信息如下[：:]?\s*/i, "")
    .replace(/^我(?:现在|目前)?(?:想|要|需要|请帮我?)?(?:想要)?/, "")
    .replace(/的相关信息.*$/, "")
    .replace(/如下.*$/, "")
    .trim();
  s = s.split(/[。；\n：:]/)[0].replace(/请.*$/, "").trim();
  s = s.replace(/^(?:查询|获取|统计|筛选|列出|整理|了解|有一系列|按|严格)+/, "");
  if (!s || s.length < 3 || /^的/.test(s)) return titleFromSlug(qid, true);
  const chars = s.replace(/\s/g, "");
  if (chars.length <= 16) return chars;
  const punct = chars.search(/[，、]/);
  if (punct > 4 && punct <= 16) return chars.slice(0, punct);
  return chars.slice(0, 16);
}

function summarizeEnglishTitle(question, qid) {
  const text = String(question || "");
  const lower = text.toLowerCase();

  for (let i = 0; i < DOMAIN_TITLES.length; i++) {
    if (DOMAIN_TITLES[i][0].test(text)) return DOMAIN_TITLES[i][1];
  }

  let lead = text.split(/\n|…|\.\.\./)[0].trim();
  lead = lead
    .replace(/^i\s+(?:need you to\s+|would like to\s+|want to\s+|am\s+)/i, "")
    .replace(/^(?:please\s+)?(?:help me\s+)?(?:look up|find|get|query)\s+/i, "")
    .replace(/\s*(?:please help|following requirements|strictly following|in order|all content|meet my).*$/i, "")
    .trim();

  const patterns = [
    /looking for\s+(?:information\s+)?(?:related\s+to\s+)?(.+?)(?:\s+for\s+the\s+|\s+from\s+\d{4}|\s+during\s+|\s+that\s+|\s+to\s+make\s+|,\s*and\s+|\.\s|\n)/i,
    /research on\s+(.+?)(?:\s+sold\s+between|\s+to\s+make\s+|,\s*and\s+|\.\s|\n)/i,
    /planning to\s+buy\s+(.+?)(?:,\s*and\s+|\.\s|\n)/i,
    /planning\s+(?:a\s+)?(\w+)\s+trip/i,
    /interested in\s+(.+?)(?:,|\.|\s+because|\n)/i,
    /travel to\s+(.+?)(?:\s+during|\s+this\s+|\.\s|,|\n)/i,
    /gather\s+(.+?)(?:\s+that\s+|\.\s|\n)/i,
  ];

  for (let p = 0; p < patterns.length; p++) {
    const m = lead.match(patterns[p]);
    if (!m || !m[1]) continue;
    let phrase = m[1].replace(/'s\b/gi, "").replace(/^\s*the\s+/i, "").trim();
    if (patterns[p].source.indexOf("planning") >= 0 && patterns[p].source.indexOf("trip") >= 0) {
      const dateM = lead.match(
        /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i
      );
      phrase = phrase + " Trip" + (dateM ? " " + dateM[1] : "");
    }
    const title = finalizeEnglishTitle(phrase);
    if (title) return title;
  }

  const site = lead.match(/\b(?:from|on)\s+the\s+(\w+)\s+website\b/i);
  if (site) {
    const t = finalizeEnglishTitle(site[1] + " Website Research");
    if (t) return t;
  }

  return titleFromSlug(qid);
}

function summarizeTaskTitle(task) {
  if (task.short_title) return String(task.short_title).trim();
  const q = (task.question || "").trim();
  const slugTitle = parseTaskId(task.qid).title;
  if (!q) return slugTitle;

  const lead = q.split(/\n|…|\.\.\./)[0].trim();
  if (!isEnglishTask(task)) {
    const zh = summarizeChineseTitle(q, task.qid);
    return zh || slugTitle;
  }

  const en = summarizeEnglishTitle(q, task.qid);
  return en || slugTitle;
}

function getTaskDisplayTitle(task) {
  const parsed = parseTaskId(task.qid);
  const title = summarizeTaskTitle(task);
  return { number: parsed.number, title: title, label: parsed.number + " " + title };
}

function isEnglishTask(task) {
  const text = (task.question || "") + " " + (task.qid || "");
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return latin > cjk;
}

function matchesLanguage(task, lang) {
  if (lang === "all") return true;
  const en = isEnglishTask(task);
  return lang === "english" ? en : !en;
}

function sortTasks(tasks) {
  return tasks.slice().sort(function (a, b) {
    const na = parseInt(parseTaskId(a.qid).number, 10) || 0;
    const nb = parseInt(parseTaskId(b.qid).number, 10) || 0;
    return na - nb;
  });
}

function taskSearchText(task) {
  const p = getTaskDisplayTitle(task);
  return [task.qid, p.number, p.title, p.label, task.question].join(" ").toLowerCase();
}

const nav = document.getElementById("nav");
if (nav) {
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 8);
  });
}

document.querySelectorAll('.nav-links a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (e) => {
    const id = link.getAttribute("href").slice(1);
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

let leaderboardData = null;
let framework = "openclaw";
let subset = "avg";
let sortKey = "f1";
let sortDir = -1;

function getMetrics(model, fw, sub) {
  return model[fw]?.[sub] || { p: 0, r: 0, f1: 0 };
}

function renderLeaderboard() {
  if (!leaderboardData) return;
  const tbody = document.getElementById("leaderboard-body");
  const rows = leaderboardData.models.map((m) => {
    const met = getMetrics(m, framework, subset);
    return { name: m.name, highlight: m.highlight, ...met };
  });

  rows.sort((a, b) => {
    const av = a[sortKey] ?? a.name;
    const bv = b[sortKey] ?? b.name;
    if (typeof av === "string") return sortDir * av.localeCompare(bv);
    return sortDir * (av - bv);
  });

  tbody.innerHTML = rows
    .map((row, i) => {
      const rank = i + 1;
      const rankCls = rank <= 3 ? `rank-${rank}` : "";
      return `<tr>
        <td><span class="rank-badge ${rankCls}">${rank}</span></td>
        <td class="model-name ${row.highlight ? "best" : ""}">${escapeHtml(row.name)}</td>
        <td class="metric-cell"><strong>${row.f1.toFixed(2)}</strong></td>
        <td class="metric-cell">${row.p.toFixed(2)}</td>
        <td class="metric-cell">${row.r.toFixed(2)}</td>
      </tr>`;
    })
    .join("");

  document.querySelectorAll("#leaderboard-table th").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.sort === sortKey);
  });
}

function renderHeroStats() {
  if (!leaderboardData) return;
  const fw = "openclaw";
  const sub = "avg";

  let bestF1 = 0;
  leaderboardData.models.forEach((m) => {
    const f1 = getMetrics(m, fw, sub).f1;
    if (f1 > bestF1) bestF1 = f1;
  });

  const bestModels = leaderboardData.models.filter(
    (m) => m.highlight || getMetrics(m, fw, sub).f1 >= bestF1 - 0.001
  );

  const statsByModel = new Map(
    (leaderboardData.interaction_stats || []).map((row) => [row.model, row[fw]])
  );

  let userSum = 0;
  let toolSum = 0;
  let n = 0;
  bestModels.forEach((m) => {
    const s = statsByModel.get(m.name);
    if (!s) return;
    userSum += s.user;
    toolSum += s.asst;
    n += 1;
  });

  const userEl = document.getElementById("hero-user-turns");
  const toolEl = document.getElementById("hero-tool-turns");
  const f1El = document.getElementById("hero-best-f1");
  if (userEl) userEl.textContent = n ? (userSum / n).toFixed(1) : "—";
  if (toolEl) toolEl.textContent = n ? (toolSum / n).toFixed(1) : "—";
  if (f1El) f1El.textContent = bestF1 ? bestF1.toFixed(1) : "—";
}

function renderInteractionStats() {
  if (!leaderboardData?.interaction_stats) return;
  const tbody = document.getElementById("interaction-body");
  tbody.innerHTML = leaderboardData.interaction_stats
    .map((row) => {
      const s = row[framework];
      return `<tr>
        <td class="model-name">${escapeHtml(row.model)}</td>
        <td>${s.asst.toFixed(1)}</td>
        <td>${s.user.toFixed(1)}</td>
        <td>${s.ratio.toFixed(2)}</td>
        <td>${s.compact.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
}

function setupLeaderboardTabs() {
  document.querySelectorAll("#framework-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#framework-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      framework = btn.dataset.framework;
      renderLeaderboard();
      renderInteractionStats();
    });
  });

  document.querySelectorAll("#subset-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#subset-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      subset = btn.dataset.subset;
      renderLeaderboard();
    });
  });

  document.querySelectorAll("#leaderboard-table th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = key === "name" ? 1 : -1;
      }
      renderLeaderboard();
    });
  });
}

let tasksIndex = null;
let currentSubset = "pro";
let currentLanguage = "english";
let currentTaskFile = null;
const taskCache = {};
const gtCache = {};
const extractionCache = {};

const KG_GRAPH_MAX_TRIPLETS = 500;
const GT_GRAPH_MAX_TRIPLETS = 200;
const HF_GT_BASE =
  "https://huggingface.co/datasets/VibeSearchBench/VibeSearchBench/resolve/main/";

function truncateKgLabel(s, max) {
  const t = String(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function parseKgTriplets(raw) {
  if (!raw) return [];
  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const truncIdx = text.search(/\n\n…|\.\.\.\s*\[|\[\d+\s*chars truncated\]/i);
  if (truncIdx > 0) text = text.slice(0, truncIdx).trim();

  function pushFromArray(arr, out) {
    arr.forEach(function (item) {
      if (!item || item.head == null || item.tail == null) return;
      out.push({
        head: String(item.head),
        relation: item.relation != null ? String(item.relation) : "",
        tail: String(item.tail),
      });
    });
  }

  const out = [];
  try {
    let parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      pushFromArray(parsed, out);
      return out;
    }
  } catch (e1) {
    /* fall through */
  }

  if (text.startsWith("[") && !text.endsWith("]")) {
    const fixed = text.replace(/,\s*$/, "") + "]";
    try {
      pushFromArray(JSON.parse(fixed), out);
      if (out.length) return out;
    } catch (e2) {
      /* fall through */
    }
  }

  const re =
    /\{\s*"head"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"relation"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"tail"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g;
  let m;
  const src = String(raw);
  while ((m = re.exec(src)) !== null) {
    try {
      out.push({
        head: JSON.parse('"' + m[1] + '"'),
        relation: JSON.parse('"' + m[2] + '"'),
        tail: JSON.parse('"' + m[3] + '"'),
      });
    } catch (e3) {
      /* skip malformed object */
    }
  }
  return out;
}

function renderTaskAccordionSection(id, title, bodyHtml, open) {
  return (
    '<section class="task-acc-section' +
    (open ? " is-open" : "") +
    '" data-acc="' +
    escapeHtml(id) +
    '">' +
    '<button type="button" class="task-acc-head" aria-expanded="' +
    (open ? "true" : "false") +
    '">' +
    '<span class="task-acc-chevron" aria-hidden="true">▸</span>' +
    '<span class="task-acc-title">' +
    escapeHtml(title) +
    "</span></button>" +
    '<div class="task-acc-body">' +
    bodyHtml +
    "</div></section>"
  );
}

function setupTaskAccordion(viewer) {
  const root = viewer.querySelector(".task-accordion");
  if (!root || root.dataset.accBound === "1") return;
  root.dataset.accBound = "1";

  function setSectionOpen(section, open) {
    section.classList.toggle("is-open", open);
    const btn = section.querySelector(".task-acc-head");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      if (section.dataset.acc === "gt" && viewer._gtNetwork) {
        setTimeout(function () {
          viewer._gtNetwork.redraw();
          viewer._gtNetwork.fit({ animation: { duration: 200 } });
        }, 80);
      }
      if (section.dataset.acc === "final" && viewer._kgNetwork) {
        setTimeout(function () {
          viewer._kgNetwork.redraw();
          viewer._kgNetwork.fit({ animation: { duration: 200 } });
        }, 80);
      }
    }
  }

  root.querySelectorAll(".task-acc-head").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const section = btn.closest(".task-acc-section");
      if (!section) return;
      setSectionOpen(section, !section.classList.contains("is-open"));
    });
  });

  const toolbar = viewer.querySelector(".task-accordion-toolbar");
  if (toolbar) {
    toolbar.querySelectorAll("[data-acc-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const action = btn.dataset.accAction;
        root.querySelectorAll(".task-acc-section").forEach(function (section) {
          setSectionOpen(section, action === "expand-all");
        });
      });
    });
  }
}

function hfDailyGroundTruthFilenames(file) {
  const names = [];
  const seen = {};
  function add(name) {
    if (name && !seen[name]) {
      seen[name] = true;
      names.push(name);
    }
  }
  add(file);
  const m = file.match(/^(task_\d+_)(.+)\.json$/i);
  if (m) {
    const slug = m[2].replace(/_+$/, "");
    const spaced = m[1] + slug.replace(/_/g, " ") + ".json";
    add(spaced);
    add(spaced.replace(/\.json$/i, "\u200c.json"));
  }
  return names;
}

function groundTruthJsonUrls(subset, qid, file) {
  const urls = [];
  const base = file.replace(/\.json$/i, "");
  urls.push(asset("data/ground_truth/" + subset + "/" + file));
  urls.push(asset("data/ground_truth/" + subset + "/" + base + ".json"));
  urls.push(asset("data/ground_truth/daily/" + file));
  urls.push(asset("data/ground_truth/daily/" + base + ".json"));
  // Official GT JSON for trajectories lives under VibeSearch-Daily on Hugging Face.
  // Do NOT use VibeSearch-Pro/NNN.json — NNN is HF's own index, not task_XXX in qid.
  hfDailyGroundTruthFilenames(file).forEach(function (name) {
    urls.push(HF_GT_BASE + "VibeSearch-Daily/" + encodeURIComponent(name));
  });
  return urls;
}

function normalizeGtTriples(gt) {
  if (!gt) return [];
  const idToName = {};
  (gt.nodes || []).forEach(function (n) {
    idToName[n.node_id] = n.node_name || n.name || n.node_id;
  });
  return (gt.triples || [])
    .map(function (t) {
      return {
        head: idToName[t.head_id] || t.head || t.head_id || "",
        relation: t.relation || "",
        tail: idToName[t.tail_id] || t.tail || t.tail_id || "",
      };
    })
    .filter(function (t) {
      return t.head && t.tail;
    });
}

async function loadGroundTruthData(subset, qid, file) {
  const key = subset + "/" + file;
  if (gtCache[key]) return gtCache[key];
  const urls = groundTruthJsonUrls(subset, qid, file);
  for (let i = 0; i < urls.length; i++) {
    try {
      const data = await loadJSON(urls[i]);
      if (data && ((data.nodes && data.nodes.length) || (data.triples && data.triples.length))) {
        gtCache[key] = data;
        return data;
      }
    } catch (e) {
      /* try next source */
    }
  }
  return null;
}

function graphWrapHtml(graphId, extraClass, ariaLabel, hidden) {
  const cls = "kg-graph" + (extraClass ? " " + extraClass : "");
  return (
    '<div class="kg-graph-wrap"' +
    (hidden ? " hidden" : "") +
    ">" +
    '<div class="kg-graph-toolbar">' +
    '<button type="button" class="kg-fullscreen-btn" title="View graph fullscreen">Fullscreen</button>' +
    "</div>" +
    '<div id="' +
    graphId +
    '" class="' +
    cls +
    '" aria-label="' +
    escapeHtml(ariaLabel) +
    '"></div></div>'
  );
}

function bindGraphFullscreen(wrap, getNetwork) {
  if (!wrap || wrap.dataset.fsBound === "1") return;
  wrap.dataset.fsBound = "1";
  const btn = wrap.querySelector(".kg-fullscreen-btn");
  if (!btn) return;

  function refreshNetwork() {
    const net = getNetwork();
    if (net) {
      setTimeout(function () {
        net.redraw();
        net.fit({ animation: { duration: 200 } });
      }, 150);
    }
  }

  function updateBtn() {
    btn.textContent = document.fullscreenElement === wrap ? "Exit fullscreen" : "Fullscreen";
  }

  btn.addEventListener("click", function () {
    if (document.fullscreenElement === wrap) {
      document.exitFullscreen();
    } else if (wrap.requestFullscreen) {
      wrap.requestFullscreen();
    } else if (wrap.webkitRequestFullscreen) {
      wrap.webkitRequestFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", function () {
    if (document.fullscreenElement === wrap || !document.fullscreenElement) {
      updateBtn();
      refreshNetwork();
    }
  });
}

function normalizeExtractionTriplets(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(function (t) {
      if (!t || t.head == null || t.tail == null) return null;
      return {
        head: String(t.head),
        relation: t.relation != null ? String(t.relation) : "",
        tail: String(t.tail),
      };
    })
    .filter(Boolean);
}

function countKgNodes(triplets) {
  const nodes = new Set();
  triplets.forEach(function (t) {
    nodes.add(t.head);
    nodes.add(t.tail);
  });
  return nodes.size;
}

function analyzeKgComponents(triplets) {
  const adj = new Map();
  function touch(id) {
    if (!adj.has(id)) adj.set(id, new Set());
  }
  function link(a, b) {
    if (!a || !b || a === b) return;
    touch(a);
    touch(b);
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  triplets.forEach(function (t) {
    link(t.head, t.tail);
  });

  const components = [];
  const seen = new Set();
  adj.forEach(function (_neighbors, start) {
    if (seen.has(start)) return;
    const comp = new Set();
    const stack = [start];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      comp.add(n);
      const neighbors = adj.get(n);
      if (!neighbors) continue;
      neighbors.forEach(function (m) {
        if (!seen.has(m)) stack.push(m);
      });
    }
    components.push(comp);
  });

  components.sort(function (a, b) {
    return b.size - a.size;
  });
  const largest = components[0] || new Set();
  return {
    componentCount: components.length,
    largest: largest,
    largestNodeCount: largest.size,
    totalNodeCount: seen.size,
  };
}

function tripletsInComponent(triplets, nodeSet) {
  return triplets.filter(function (t) {
    return nodeSet.has(t.head) && nodeSet.has(t.tail);
  });
}

/** Keep only the largest connected cluster so the graph view is not scattered islands. */
function tripletsForGraphView(triplets, opts) {
  const maxN = (opts && opts.maxTriplets) || KG_GRAPH_MAX_TRIPLETS;
  const analysis = analyzeKgComponents(triplets);
  let viewTriplets = triplets;
  if (analysis.componentCount > 1 && analysis.largest.size) {
    viewTriplets = tripletsInComponent(triplets, analysis.largest);
  }
  return {
    triplets: viewTriplets.slice(0, maxN),
    total: triplets.length,
    analysis: analysis,
    hiddenComponents: Math.max(0, analysis.componentCount - 1),
    hiddenNodes: Math.max(0, analysis.totalNodeCount - analysis.largestNodeCount),
  };
}

async function loadFinalExtraction(subset, file, task) {
  const key = subset + "/" + file;
  if (extractionCache[key]) return extractionCache[key];

  const urls = [];
  const seen = {};
  function addUrl(path) {
    const u = asset(path);
    if (!seen[u]) {
      seen[u] = true;
      urls.push(u);
    }
  }
  addUrl("data/final_extractions/" + subset + "/" + file);
  addUrl("data/final_extractions/daily/" + file);
  addUrl("data/final_extractions/pro/" + file);

  for (let i = 0; i < urls.length; i++) {
    try {
      const data = await loadJSON(urls[i]);
      const triplets = normalizeExtractionTriplets(data.triplets);
      if (triplets.length) {
        extractionCache[key] = {
          triplets: triplets,
          total: data.total || triplets.length,
          source: "full",
        };
        return extractionCache[key];
      }
    } catch (e) {
      /* try next */
    }
  }

  if (task.response_preview) {
    const triplets = parseKgTriplets(task.response_preview);
    if (triplets.length) {
      extractionCache[key] = {
        triplets: triplets,
        total: triplets.length,
        source: "preview",
      };
      return extractionCache[key];
    }
  }
  return null;
}

function renderKgExtraction(extraction) {
  const triplets = extraction.triplets || [];
  const total = extraction.total || triplets.length;
  const graphView = tripletsForGraphView(triplets);
  const shown = graphView.triplets;
  const nodeCount = countKgNodes(shown);

  if (!total) {
    return '<div class="kg-extraction"><p class="kg-note">No final extraction available.</p></div>';
  }

  let note = "";
  if (extraction.source === "preview") {
    note =
      '<p class="kg-note">Showing truncated preview only. Run <code>python3 scripts/build_final_extractions.py</code> and redeploy for the full graph.</p>';
  }
  if (graphView.hiddenComponents > 0) {
    note +=
      '<p class="kg-note">Graph shows the <strong>main connected cluster</strong> (' +
      graphView.analysis.largestNodeCount +
      " nodes). " +
      graphView.hiddenComponents +
      " smaller disconnected group" +
      (graphView.hiddenComponents !== 1 ? "s" : "") +
      " (" +
      graphView.hiddenNodes +
      " nodes) are hidden — extraction JSON still lists all triplets.</p>";
  }
  if (total > shown.length && extraction.source !== "preview") {
    note +=
      '<p class="kg-note">Drawing ' +
      shown.length +
      " of " +
      total +
      " triplets in the main cluster (cap " +
      KG_GRAPH_MAX_TRIPLETS +
      ").</p>";
  }

  return (
    '<div class="kg-extraction">' +
    '<div class="kg-extraction-head">' +
    '<div class="kg-tabs" role="tablist">' +
    '<button type="button" class="kg-tab active" data-kg-tab="graph" role="tab" aria-selected="true">Graph</button>' +
    '<button type="button" class="kg-tab" data-kg-tab="json" role="tab" aria-selected="false">JSON</button>' +
    "</div></div>" +
    note +
    '<div class="kg-panel kg-panel-graph active" data-kg-panel="graph" role="tabpanel">' +
    graphWrapHtml("kg-graph", "", "Predicted knowledge graph") +
    '<p class="kg-legend">' +
    total +
    " triplet" +
    (total !== 1 ? "s" : "") +
    " · " +
    nodeCount +
    " node" +
    (nodeCount !== 1 ? "s" : "") +
    " · drag to explore</p></div>" +
    '<div class="kg-panel kg-panel-json" data-kg-panel="json" role="tabpanel" hidden>' +
    '<pre class="kg-raw">' +
    escapeHtml(JSON.stringify(shown, null, 2)) +
    "</pre></div></div>"
  );
}

function renderGroundTruthShell() {
  return (
    '<div class="ground-truth-panel">' +
    '<p class="gt-status">Loading ground truth…</p>' +
    graphWrapHtml("gt-graph", "gt-graph", "Ground truth knowledge graph", true) +
    '<p class="kg-legend gt-legend" hidden></p>' +
    "</div>"
  );
}

function setupKgTabs(scope) {
  const root = scope || document;
  const tabs = root.querySelectorAll(".kg-tab");
  if (!tabs.length) return;
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const panelRoot = btn.closest(".kg-extraction");
      if (!panelRoot) return;
      const name = btn.dataset.kgTab;
      panelRoot.querySelectorAll(".kg-tab").forEach(function (b) {
        const on = b.dataset.kgTab === name;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      panelRoot.querySelectorAll(".kg-panel").forEach(function (p) {
        const on = p.dataset.kgPanel === name;
        p.classList.toggle("active", on);
        p.hidden = !on;
      });
      const viewer = document.getElementById("task-viewer");
      if (name === "graph" && viewer && viewer._kgNetwork) {
        viewer._kgNetwork.redraw();
        viewer._kgNetwork.fit({ animation: { duration: 200 } });
      }
    });
  });
}

function initTripletsGraph(el, triplets, viewer, networkKey, style) {
  if (!el || typeof vis === "undefined") return null;

  if (viewer[networkKey]) {
    viewer[networkKey].destroy();
    viewer[networkKey] = null;
  }

  const maxN = style.maxTriplets || KG_GRAPH_MAX_TRIPLETS;
  const capped = triplets.slice(0, maxN);
  const nodeMap = new Map();
  const edgeList = [];

  capped.forEach(function (t, i) {
    const h = t.head;
    const tail = t.tail;
    const rel = t.relation || "";
    if (!nodeMap.has(h)) {
      nodeMap.set(h, {
        id: h,
        label: truncateKgLabel(h, 30),
        title: h,
        shape: "dot",
        font: { size: 12, face: "Inter, sans-serif" },
      });
    }
    if (!nodeMap.has(tail)) {
      nodeMap.set(tail, {
        id: tail,
        label: truncateKgLabel(tail, 30),
        title: tail,
        shape: "dot",
        font: { size: 12, face: "Inter, sans-serif" },
      });
    }
    edgeList.push({
      id: networkKey + "-e" + i,
      from: h,
      to: tail,
      label: rel ? truncateKgLabel(rel, 22) : "",
      title: rel,
      arrows: "to",
      font: { size: 9, align: "middle", face: "Inter, sans-serif" },
      smooth: { type: "dynamic" },
    });
  });

  const nodes = new vis.DataSet(Array.from(nodeMap.values()));
  const edges = new vis.DataSet(edgeList);
  const network = new vis.Network(
    el,
    { nodes: nodes, edges: edges },
    {
      physics: {
        enabled: true,
        stabilization: { iterations: 100 },
        barnesHut: {
          gravitationalConstant: -2800,
          springLength: style.springLength || 140,
          springConstant: 0.05,
        },
      },
      interaction: { hover: true, tooltipDelay: 120, navigationButtons: false },
      edges: {
        color: style.edgeColor || {
          color: "#94a3b8",
          highlight: "#2563eb",
          hover: "#2563eb",
        },
        width: style.edgeWidth || 1.2,
      },
      nodes: {
        color: style.nodeColor || {
          background: "#e0f2fe",
          border: "#2563eb",
          highlight: { background: "#bfdbfe", border: "#1d4ed8" },
          hover: { background: "#bfdbfe", border: "#1d4ed8" },
        },
        borderWidth: 1.5,
        margin: 10,
      },
      layout: { improvedLayout: nodeMap.size < 80 },
    }
  );
  network.once("stabilizationIterationsDone", function () {
    network.fit({ animation: { duration: 250 } });
  });
  viewer[networkKey] = network;
  const wrap = el.closest(".kg-graph-wrap");
  if (wrap) {
    bindGraphFullscreen(wrap, function () {
      return viewer[networkKey];
    });
  }
  return { shown: capped.length, total: triplets.length, maxN: capped.length };
}

function initKgGraph(viewer, triplets) {
  const el = viewer.querySelector("#kg-graph");
  const graphView = tripletsForGraphView(triplets);
  initTripletsGraph(el, graphView.triplets, viewer, "_kgNetwork", {
    maxTriplets: KG_GRAPH_MAX_TRIPLETS,
    edgeWidth: 1.8,
    springLength: 110,
  });
}

async function loadGroundTruthPanel(viewer, subset, qid, file) {
  const panel = viewer.querySelector(".ground-truth-panel");
  if (!panel) return;

  if (viewer._gtNetwork) {
    viewer._gtNetwork.destroy();
    viewer._gtNetwork = null;
  }

  const status = panel.querySelector(".gt-status");
  const graph = panel.querySelector("#gt-graph");
  const graphWrap = panel.querySelector(".kg-graph-wrap");
  const legend = panel.querySelector(".gt-legend");

  status.hidden = false;
  status.textContent = "Loading ground truth…";
  if (graphWrap) graphWrap.hidden = true;
  legend.hidden = true;

  const gt = await loadGroundTruthData(subset, qid, file);
  const triplets = normalizeGtTriples(gt);

  if (triplets.length) {
    if (graphWrap) graphWrap.hidden = false;
    status.hidden = true;
    const stats = initTripletsGraph(graph, triplets, viewer, "_gtNetwork", {
      maxTriplets: GT_GRAPH_MAX_TRIPLETS,
      nodeColor: {
        background: "#dcfce7",
        border: "#16a34a",
        highlight: { background: "#bbf7d0", border: "#15803d" },
        hover: { background: "#bbf7d0", border: "#15803d" },
      },
      edgeColor: {
        color: "#86efac",
        highlight: "#16a34a",
        hover: "#16a34a",
      },
    });
    if (stats && legend) {
      legend.hidden = false;
      let text = stats.total + " ground-truth triplet" + (stats.total !== 1 ? "s" : "");
      if (stats.total > stats.maxN) {
        text += " (showing " + stats.shown + ")";
      }
      text += " · drag nodes to explore";
      legend.textContent = text;
    }
    const gtSection = viewer.querySelector('.task-acc-section[data-acc="gt"]');
    if (gtSection && !gtSection.classList.contains("is-open")) {
      gtSection.classList.add("is-open");
      const btn = gtSection.querySelector(".task-acc-head");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
    return;
  }

  status.hidden = false;
  status.textContent = "Ground truth not available for this task.";
  if (graphWrap) graphWrap.hidden = true;
  legend.hidden = true;
}

function renderTurn(turn) {
  if (turn.type === "user") {
    return (
      '<div class="turn turn-user">' +
      '<div class="turn-role">User</div>' +
      '<div class="turn-content md-body">' +
      renderTrajectoryMarkdown(turn.content || "") +
      "</div></div>"
    );
  }

  let html = '<div class="turn turn-assistant"><div class="turn-role">Agent</div>';
  if (turn.thinking) {
    html +=
      '<div class="turn-thinking md-body">' + renderTrajectoryMarkdown(turn.thinking) + "</div>";
  }
  if (turn.content) {
    html +=
      '<div class="turn-content md-body">' + renderTrajectoryMarkdown(turn.content) + "</div>";
  }
  for (const tc of turn.tool_calls || []) {
    html += '<div class="tool-block">';
    html += '<div class="tool-head">' + escapeHtml(tc.name) + "</div>";
    html += renderToolArgs(tc.args);
    if (tc.result != null) {
      html +=
        '<div class="tool-result md-body">' + renderTrajectoryMarkdown(tc.result) + "</div>";
    }
    html += "</div>";
  }
  html += "</div>";
  return html;
}

async function renderTrajectory(task, subset, file) {
  const viewer = document.getElementById("task-viewer");
  const extraction = await loadFinalExtraction(subset, file, task);
  const m = task.metrics || {};
  const f1 = m.triplet_f1 != null ? (m.triplet_f1 * 100).toFixed(1) + "%" : "—";
  const nf1 = m.node_f1 != null ? (m.node_f1 * 100).toFixed(1) + "%" : "—";
  const turnsHtml = (task.turns || []).map(renderTurn).join("");

  let html = "";
  const display = getTaskDisplayTitle(task);
  html += '<header class="task-viewer-header">';
  html +=
    '<h3><span class="task-heading-num">' +
    escapeHtml(display.number) +
    '</span> <span class="task-heading-name">' +
    escapeHtml(display.title) +
    "</span></h3>";
  html +=
    '<p class="task-question-preview">' +
    escapeHtml(task.question || "") +
    "</p>";
  html += '<div class="task-metrics">';
  html += '<span class="metric-pill">Triplet F1: <strong>' + f1 + "</strong></span>";
  html += '<span class="metric-pill">Node F1: <strong>' + nf1 + "</strong></span>";
  html += '<span class="metric-pill">User turns: ' + (task.stats?.user_turns ?? "—") + "</span>";
  html += '<span class="metric-pill">Tool calls: ' + (task.stats?.tool_calls ?? "—") + "</span>";
  html += "</div></header>";
  html += '<div class="task-viewer-body">';
  html +=
    '<div class="task-accordion-toolbar">' +
    '<button type="button" class="task-acc-tool" data-acc-action="expand-all">Expand all</button>' +
    '<button type="button" class="task-acc-tool" data-acc-action="collapse-all">Collapse all</button>' +
    '<span class="task-acc-hint">Click a section title to fold / unfold</span>' +
    "</div>";
  html += '<div class="task-accordion">';
  html += renderTaskAccordionSection(
    "traj",
    "Trajectory",
    '<div class="trajectory">' +
      (turnsHtml || '<p class="empty-state">No turns in trajectory.</p>') +
      "</div>",
    true
  );
  html += renderTaskAccordionSection("gt", "Ground truth", renderGroundTruthShell(), false);
  if (extraction && extraction.triplets.length) {
    html += renderTaskAccordionSection(
      "final",
      "Final extraction",
      renderKgExtraction(extraction),
      false
    );
  }
  html += "</div></div>";
  viewer.innerHTML = html;

  setupTaskAccordion(viewer);

  const qid = task.qid || "";
  loadGroundTruthPanel(viewer, subset, qid, file);

  if (extraction && extraction.triplets.length) {
    initKgGraph(viewer, extraction.triplets);
    const finalSection = viewer.querySelector('.task-acc-section[data-acc="final"]');
    if (finalSection) setupKgTabs(finalSection);
  }
}

async function selectTask(subset, file) {
  currentTaskFile = file;
  document.querySelectorAll(".task-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.file === file);
  });

  const cacheKey = subset + "/" + file;
  if (!taskCache[cacheKey]) {
    taskCache[cacheKey] = await loadJSON("data/trajs/" + subset + "/" + file);
  }
  await renderTrajectory(taskCache[cacheKey], subset, file);
}

function renderTaskList(filter) {
  const list = document.getElementById("task-list");
  const sub = tasksIndex && tasksIndex.subsets && tasksIndex.subsets[currentSubset];
  if (!sub || !sub.tasks || !sub.tasks.length) {
    list.innerHTML = '<p class="empty-state">No tasks loaded.</p>';
    return;
  }

  const q = (filter || "").trim().toLowerCase();
  const tasks = sortTasks(
    sub.tasks.filter(function (t) {
      if (!matchesLanguage(t, currentLanguage)) return false;
      if (!q) return true;
      return taskSearchText(t).includes(q);
    })
  );

  if (!tasks.length) {
    currentTaskFile = null;
    list.innerHTML = '<p class="empty-state">No tasks match this filter.</p>';
    return;
  }

  list.innerHTML = tasks
    .map(function (t) {
      const active = t.file === currentTaskFile ? " active" : "";
      const display = getTaskDisplayTitle(t);
      const f1 =
        t.triplet_f1 != null
          ? "<span>F1 " + (t.triplet_f1 * 100).toFixed(0) + "%</span>"
          : "";
      return (
        '<button type="button" class="task-item' +
        active +
        '" data-file="' +
        escapeHtml(t.file) +
        '">' +
        '<div class="task-item-title">' +
        '<span class="task-item-num">' +
        escapeHtml(display.number) +
        "</span>" +
        '<span class="task-item-name">' +
        escapeHtml(display.title) +
        "</span>" +
        "</div>" +
        '<div class="task-item-meta">' +
        f1 +
        "<span>" +
        (t.user_turns != null ? t.user_turns : "—") +
        " user turns</span>" +
        "<span>" +
        (t.tool_calls != null ? t.tool_calls : "—") +
        " tools</span>" +
        "</div></button>"
      );
    })
    .join("");

  list.querySelectorAll(".task-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectTask(currentSubset, btn.dataset.file);
    });
  });

  const activeVisible = tasks.some(function (t) {
    return t.file === currentTaskFile;
  });
  if (!currentTaskFile || !activeVisible) {
    selectTask(currentSubset, tasks[0].file);
  }
}

function setupTasks() {
  const subsetSelect = document.getElementById("subset-select");
  const languageSelect = document.getElementById("language-select");
  const search = document.getElementById("task-search");
  currentLanguage = languageSelect.value || "english";

  function refreshTaskList() {
    currentTaskFile = null;
    renderTaskList(search.value);
  }

  subsetSelect.addEventListener("change", function () {
    currentSubset = subsetSelect.value;
    Object.keys(taskCache).forEach(function (k) {
      delete taskCache[k];
    });
    refreshTaskList();
  });

  languageSelect.addEventListener("change", function () {
    currentLanguage = languageSelect.value;
    refreshTaskList();
  });

  search.addEventListener("input", function () {
    renderTaskList(search.value);
  });

  if (tasksIndex && tasksIndex.demo_mode) {
    const banner = document.getElementById("demo-banner");
    banner.hidden = false;
    banner.textContent =
      "Demo mode: run python scripts/build_website_data.py on a host with trajectory access to export all tasks.";
  }

  renderTaskList();
}

async function init() {
  const needsLeaderboard = document.getElementById("leaderboard-body");
  const needsTasks = document.getElementById("task-list");
  const needsHero = document.getElementById("hero-user-turns");

  if (!needsLeaderboard && !needsTasks && !needsHero) return;

  try {
    if (needsLeaderboard || needsHero) {
      leaderboardData = await loadJSON("data/leaderboard.json");
    }
    if (needsTasks) {
      tasksIndex = await loadJSON("data/tasks_index.json");
    }

    if (needsHero) {
      renderHeroStats();
    }

    if (needsLeaderboard) {
      const trajLabel = document.getElementById("traj-model-label");
      if (trajLabel && leaderboardData.trajectory_model) {
        trajLabel.textContent = leaderboardData.trajectory_model;
      }
      setupLeaderboardTabs();
      renderLeaderboard();
      renderInteractionStats();
    }

    if (needsTasks) {
      setupTasks();
    }
  } catch (err) {
    console.error(err);
    const lb = document.getElementById("leaderboard-body");
    if (lb) {
      lb.innerHTML =
        "<tr><td colspan=\"5\">Failed to load data: " + escapeHtml(err.message) + "</td></tr>";
    }
  }
}

init();
