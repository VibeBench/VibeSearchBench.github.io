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

const TITLE_STOP = new Set([
  "i", "im", "i'm", "a", "an", "the", "and", "or", "to", "for", "of", "in", "on", "at", "with",
  "my", "me", "we", "our", "your", "please", "help", "need", "following", "requirements", "all",
  "that", "meet", "information", "from", "about", "looking", "get", "want", "query", "sort", "out",
  "list", "first", "second", "referring", "website", "content", "their", "related", "complete", "set",
  "currently", "been", "have", "has", "are", "is", "am", "be", "been", "being", "was", "were",
  "tell", "provide", "find", "query", "using", "based", "order",
]);

const STEP_TOPIC = [
  ["hotel", "Hotels"],
  ["port", "Ports"],
  ["vessel", "Vessels"],
  ["route", "Routes"],
  ["equipment", "Equipment"],
  ["tournament", "Tournaments"],
  ["university", "Universities"],
  ["museum", "Museum"],
  ["movie", "Movies"],
  ["studio", "Studios"],
];

function titleWordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function clipTitleWords(s, max) {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).join(" ");
}

function titleCaseWords(s) {
  return s.split(/\s+/).map(function (w) {
    if (/^\d{4}$/.test(w)) return w;
    if (/^[A-Z][a-z]/.test(w) || /^[A-Z]{2,}$/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}

function stripTitleFillers(s) {
  const skip = new Set(["a", "an", "the", "of", "for", "and", "with", "all", "their", "related", "about"]);
  return s
    .split(/\s+/)
    .filter(function (w) {
      return !skip.has(w.toLowerCase());
    })
    .join(" ");
}

function topicsFromSteps(question) {
  const lower = question.toLowerCase();
  const found = [];
  STEP_TOPIC.forEach(function (pair) {
    if (lower.indexOf(pair[0]) !== -1) found.push(pair[1]);
  });
  return found;
}

function mergeTitleParts(parts, max) {
  const seen = new Set();
  const words = [];
  parts.forEach(function (p) {
    p.split(/\s+/).forEach(function (w) {
      const key = w.toLowerCase();
      if (!w || seen.has(key)) return;
      seen.add(key);
      words.push(w);
    });
  });
  return clipTitleWords(words.join(" "), max);
}

function summarizeChineseTitle(lead) {
  let s = lead.replace(/^(?:我)?(?:想|要|需要|请帮我?)+/, "").trim();
  s = s.split(/[。；\n：:]/)[0].replace(/如下.*$/, "").trim();
  if (!s || s.length < 4) return "";
  const chars = s.replace(/\s/g, "");
  return chars.length <= 18 ? chars : chars.slice(0, 18);
}

function summarizeEnglishTitle(question) {
  let lead = question.split(/\n|…|\.\.\./)[0].trim();
  lead = lead
    .replace(/\s*(please help|following requirements|in order|all content|meet my).*$/i, "")
    .trim();

  const tries = [];
  const dateM = lead.match(
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i
  );
  let m = lead.match(/planning\s+(?:a\s+)?(\w+(?:\s+\w+){0,2})\s+trip/i);
  if (m) {
    const when = dateM ? " " + dateM[1] : "";
    tries.push(stripTitleFillers(m[1] + " Trip" + when));
  }

  m = lead.match(/interested in\s+([^,.\n]+)/i);
  if (m) tries.push(stripTitleFillers(m[1]));

  m = lead.match(/looking for\s+(?:a\s+)?(?:complete set of information about\s+)?([^,.\n]+)/i);
  if (m) tries.push(stripTitleFillers(m[1].replace(/'s\b/gi, "")));

  m = lead.match(/(?:about|regarding)\s+([A-Z][^,.\n]{2,50})/);
  if (m) tries.push(stripTitleFillers(m[1].replace(/'s\b/gi, "")));

  m = lead.match(/(?:buy|purchase|find|need)\s+(?:the\s+)?([^,.\n]{6,70})/i);
  if (m) tries.push(stripTitleFillers(m[1]));

  const site = lead.match(/\b(?:from|on)\s+the\s+(\w+)\s+website\b/i);
  const stepTopics = topicsFromSteps(question);

  for (let i = 0; i < tries.length; i++) {
    let phrase = titleCaseWords(clipTitleWords(tries[i], 6));
    if (site) phrase = mergeTitleParts([site[1], phrase].concat(stepTopics.slice(0, 2)), 6);
    else if (stepTopics.length && titleWordCount(phrase) < 5) {
      phrase = mergeTitleParts([phrase].concat(stepTopics), 6);
    }
    phrase = titleCaseWords(clipTitleWords(phrase, 6));
    if (titleWordCount(phrase) >= 3) return phrase;
  }

  const words = (lead.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).filter(function (w) {
    return !TITLE_STOP.has(w.toLowerCase()) && w.length > 1;
  });
  const picked = [];
  words.forEach(function (w) {
    if (picked.length >= 6) return;
    if (/^[A-Z]/.test(w) || /^\d/.test(w)) picked.push(w);
  });
  words.forEach(function (w) {
    if (picked.length >= 6) return;
    if (picked.indexOf(w) === -1) picked.push(w);
  });
  let fallback = titleCaseWords(clipTitleWords(picked.join(" "), 6));
  if (site) fallback = mergeTitleParts([site[1], fallback], 6);
  if (titleWordCount(fallback) >= 3) return fallback;
  return "";
}

function summarizeTaskTitle(task) {
  if (task.short_title) return String(task.short_title).trim();
  const q = (task.question || "").trim();
  const slugTitle = parseTaskId(task.qid).title;
  if (!q) return slugTitle;

  const lead = q.split(/\n|…|\.\.\./)[0].trim();
  if (!isEnglishTask(task)) {
    const zh = summarizeChineseTitle(lead);
    return zh || slugTitle;
  }

  const en = summarizeEnglishTitle(q);
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

function renderTurn(turn) {
  if (turn.type === "user") {
    return (
      '<div class="turn turn-user">' +
      '<div class="turn-role">User</div>' +
      '<div class="turn-content">' +
      escapeHtml(turn.content || "") +
      "</div></div>"
    );
  }

  let html = '<div class="turn turn-assistant"><div class="turn-role">Agent</div>';
  if (turn.thinking) {
    html += '<div class="turn-thinking">' + escapeHtml(turn.thinking) + "</div>";
  }
  if (turn.content) {
    html += '<div class="turn-content">' + escapeHtml(turn.content) + "</div>";
  }
  for (const tc of turn.tool_calls || []) {
    html += '<div class="tool-block">';
    html += '<div class="tool-head">' + escapeHtml(tc.name) + "</div>";
    html += '<pre class="tool-args">' + escapeHtml(formatArgs(tc.args)) + "</pre>";
    if (tc.result != null) {
      html += '<pre class="tool-result">' + escapeHtml(tc.result) + "</pre>";
    }
    html += "</div>";
  }
  html += "</div>";
  return html;
}

function renderTrajectory(task) {
  const viewer = document.getElementById("task-viewer");
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
    '<p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.5rem">' +
    escapeHtml(task.question || "") +
    "</p>";
  html += '<div class="task-metrics">';
  html += '<span class="metric-pill">Triplet F1: <strong>' + f1 + "</strong></span>";
  html += '<span class="metric-pill">Node F1: <strong>' + nf1 + "</strong></span>";
  html += '<span class="metric-pill">User turns: ' + (task.stats?.user_turns ?? "—") + "</span>";
  html += '<span class="metric-pill">Tool calls: ' + (task.stats?.tool_calls ?? "—") + "</span>";
  html += "</div></header>";
  html +=
    '<div class="trajectory">' +
    (turnsHtml || '<p class="empty-state">No turns in trajectory.</p>') +
    "</div>";
  if (task.response_preview) {
    html += '<div style="padding:0.75rem 1.15rem;border-top:1px solid var(--border)">';
    html += '<div class="turn-role">Final extraction (preview)</div>';
    html +=
      '<pre class="tool-args" style="max-height:120px">' +
      escapeHtml(task.response_preview) +
      "</pre></div>";
  }
  viewer.innerHTML = html;
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
  renderTrajectory(taskCache[cacheKey]);
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
