<p align="center">
  <a href="https://vibebench.github.io/VibeSearchBench.github.io/">
    <img src="assets/img/logo.png" alt="VibeSearchBench" width="220" />
  </a>
</p>

<h1 align="center">VibeSearchBench</h1>

<p align="center"><em>Proactive Search · Evolving Intent · Structured Knowledge</em></p>

<p align="center">
  <a href="https://vibebench.github.io/VibeSearchBench.github.io/"><img src="https://img.shields.io/badge/🌐-Project_Page-2563eb?style=for-the-badge" alt="Project Page" /></a>
  <a href="https://vibebench.github.io/VibeSearchBench.github.io/leaderboard.html"><img src="https://img.shields.io/badge/🏆-Leaderboard-7c3aed?style=for-the-badge" alt="Leaderboard" /></a>
  <a href="https://vibebench.github.io/VibeSearchBench.github.io/assets/paper.pdf"><img src="https://img.shields.io/badge/📄-Paper-18181b?style=for-the-badge" alt="Paper" /></a>
  <a href="https://github.com/VibeBench/VibeSearchBench"><img src="https://img.shields.io/badge/💻-Code-18181b?style=for-the-badge" alt="Code" /></a>
  <a href="https://huggingface.co/datasets/VibeSearchBench/VibeSearchBench"><img src="https://img.shields.io/badge/🤗-Dataset-ffd21e?style=for-the-badge" alt="Dataset" /></a>
</p>

<p align="center" style="margin-top:1.1em;margin-bottom:0.35em">
  <strong>
    By far the
    <span style="color:#dc2626;background:rgba(220,38,38,0.12);padding:0.15em 0.45em;border-radius:5px;font-weight:800;border-bottom:2px solid rgba(220,38,38,0.45)">hardest</span>
    <span style="color:#15803d;background:rgba(22,163,74,0.12);padding:0.15em 0.45em;border-radius:5px;font-weight:800;border-bottom:2px solid rgba(22,163,74,0.45)">verifiable</span>
    <span style="color:#7c3aed;background:rgba(124,58,237,0.12);padding:0.15em 0.45em;border-radius:5px;font-weight:800;border-bottom:2px solid rgba(124,58,237,0.45)">long-horizon</span>
    search benchmark
  </strong>
</p>

<p align="center" style="color:#71717a;font-size:0.92em;line-height:1.55;margin:0.2em 0 0.65em">
  200 bilingual tasks · proactive search in the wild · persona-driven progressive disclosure · schema-free knowledge graph evaluation
</p>

<p align="center" style="margin-bottom:1.75em">
  <img src="https://img.shields.io/badge/Tasks-200-2563eb?style=flat-square" alt="200 Tasks" />
  <img src="https://img.shields.io/badge/Domains-20-0891b2?style=flat-square" alt="20 Domains" />
  <img src="https://img.shields.io/badge/Models-7-7c3aed?style=flat-square" alt="7 Models evaluated" />
  <img src="https://img.shields.io/badge/Best_Triplet_F1-30.3-16a34a?style=flat-square" alt="Best triplet F1 30.3" />
</p>

## What is VibeSearch?

Real users rarely specify full intent upfront. **VibeSearch** captures bidirectional convergence: agents interleave partial results with follow-up questions while users progressively disclose needs. **VibeSearchBench** pairs each task with a persona simulator and evaluates schema-free knowledge graphs via graph matching (Precision / Recall / F1).

| Subset | Description |
|--------|-------------|
| **VibeSearch-Pro** | 100 professional research scenarios — literature reviews, market analysis, technical due diligence |
| **VibeSearch-Daily** | 100 daily-life search tasks — shopping, travel, lifestyle with vague initial queries |
| **Evaluation** | Progressive-disclosure user simulator, multi-turn tool use (search / visit / code), LLM-as-judge graph matching |

**Explore:** [Leaderboard](https://vibebench.github.io/VibeSearchBench.github.io/leaderboard.html) · [Task trajectories](https://vibebench.github.io/VibeSearchBench.github.io/tasks.html)

## Live site

**https://vibebench.github.io/VibeSearchBench.github.io/**

This repo is under the [VibeBench](https://github.com/VibeBench) org, so it is a **project** site (not `vibesearchbench.github.io`, which would require a `VibeSearchBench` GitHub org).

### Enable GitHub Pages (required once)

The **Publish site to gh-pages** workflow builds the site and pushes the `gh-pages` branch. Then:

1. Open **Settings → Pages**: https://github.com/VibeBench/VibeSearchBench.github.io/settings/pages  
2. **Build and deployment → Source** → **Deploy from a branch**  
3. Branch **`gh-pages`**, folder **`/ (root)`** → **Save**  
4. Wait 2–5 min → https://vibebench.github.io/VibeSearchBench.github.io/

If Actions cannot push, enable **Settings → Actions → General → Workflow permissions → Read and write**.

If the Pages menu is missing, a **VibeBench org owner** must allow Pages: https://github.com/organizations/VibeBench/settings/pages

Site files live at the repository root (no `/docs` folder). `.nojekyll` disables Jekyll so `data/` is served as static files.

## Update from the main benchmark repo

```bash
cd /path/to/VibeSearchBench
bash scripts/publish_github_io.sh
```

Or build only:

```bash
SITE_DIR=../VibeSearchBench.github.io bash scripts/build_website.sh
cd ../VibeSearchBench.github.io && git add -A && git commit -m "Update site" && git push
```

## Trajectory layout

- **Source (jsonl):** `data/trajs/claude-opus-4.6_custom_serper_simulated/trajs_reextract/` (Daily), `.../trajs/` (Pro)
- **Viewer (json):** `data/trajs/daily/`, `data/trajs/pro/` — generated by the main repo script

```bash
cd /path/to/VibeSearchBench && python3 scripts/build_website_data.py
python3 scripts/build_final_extractions.py   # full Final extraction graphs (from jsonl response)
```

Then commit and push this repository.

<p align="center">
  VibeSearchBench · Rednote-Hilab &amp; Unipat AI
</p>
