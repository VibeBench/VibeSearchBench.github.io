function asset(path) {
  const base = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${base}${path}`.replace(/\/+/g, "/").replace(":/", "://");
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

const nav = document.getElementById("nav");
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 8);
});

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
  html += '<header class="task-viewer-header">';
  html += "<h3>" + escapeHtml(task.qid || "Task") + "</h3>";
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
  const tasks = sub.tasks.filter(function (t) {
    if (!q) return true;
    return (
      (t.qid && t.qid.toLowerCase().includes(q)) ||
      (t.question && t.question.toLowerCase().includes(q))
    );
  });

  list.innerHTML = tasks
    .map(function (t) {
      const active = t.file === currentTaskFile ? " active" : "";
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
        '<div class="task-item-q">' +
        escapeHtml(t.question || t.qid) +
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

  if (tasks.length && !currentTaskFile) {
    selectTask(currentSubset, tasks[0].file);
  }
}

function setupTasks() {
  const subsetSelect = document.getElementById("subset-select");
  const search = document.getElementById("task-search");

  subsetSelect.addEventListener("change", function () {
    currentSubset = subsetSelect.value;
    currentTaskFile = null;
    Object.keys(taskCache).forEach(function (k) {
      delete taskCache[k];
    });
    renderTaskList(search.value);
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
  try {
    leaderboardData = await loadJSON("data/leaderboard.json");
    tasksIndex = await loadJSON("data/tasks_index.json");

    const trajLabel = document.getElementById("traj-model-label");
    if (trajLabel && leaderboardData.trajectory_model) {
      trajLabel.textContent = leaderboardData.trajectory_model;
    }

    setupLeaderboardTabs();
    renderLeaderboard();
    renderInteractionStats();
    setupTasks();
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
