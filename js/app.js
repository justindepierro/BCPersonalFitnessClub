/* ===================================================
   app.js — BC Personal Fitness Club Dashboard
   Renders all tabs: Overview, Profiles, Leaderboards,
   Sprint Analysis, Strength & Power, Scorecard,
   Benchmarks, Testing Log, Testing Week Plan.
   =================================================== */

(function () {
  "use strict";

  let lbChartInstance = null;
  let profileChartInstance = null;
  let profilePctChartInstance = null;
  let profileSprintChartInstance = null;
  let profileDonutInstance = null;
  let profileQuadrantInstance = null;

  /* ---------- HTML Escaping (XSS protection) ---------- */
  const ESC_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return ESC_MAP[c];
    });
  }

  /* ---------- Debounce helper ---------- */
  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ---------- Sorted athletes cache ---------- */
  function sortedAthletes() {
    return window.CLUB.athletes.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
  }

  /* ---------- Format height (inches to ft'in") ---------- */
  function fmtHeight(h) {
    if (h === null || h === undefined) return "N/A";
    const ft = Math.floor(h / 12);
    const ins = h % 12;
    return ft + "'" + (Number.isInteger(ins) ? ins : ins.toFixed(1)) + '"';
  }

  /* ---------- Tier label from average score ---------- */
  function tierLabelFromAvg(avg) {
    if (avg >= 4.5) return "Elite";
    if (avg >= 3.5) return "Excellent";
    if (avg >= 2.5) return "Good";
    if (avg >= 1.5) return "Average";
    return "Below Avg";
  }

  /* ---------- Test History Metric Keys ---------- */
  const TEST_METRIC_KEYS = [
    { key: "weight", jsonKey: "weight_lb", label: "Weight", unit: "lb" },
    { key: "bench", jsonKey: "bench_1rm", label: "Bench 1RM", unit: "lb" },
    { key: "squat", jsonKey: "squat_1rm", label: "Squat 1RM", unit: "lb" },
    { key: "medball", jsonKey: "medball_in", label: "Med Ball", unit: "in" },
    { key: "vert", jsonKey: "vert_in", label: "Vertical", unit: "in" },
    { key: "broad", jsonKey: "broad_in", label: "Broad Jump", unit: "in" },
    {
      key: "sprint020",
      jsonKey: "sprint_020",
      label: "0-20 yd",
      unit: "s",
      lower: true,
    },
    {
      key: "sprint2030",
      jsonKey: "sprint_2030",
      label: "20-30 yd",
      unit: "s",
      lower: true,
    },
    {
      key: "sprint3040",
      jsonKey: "sprint_3040",
      label: "30-40 yd",
      unit: "s",
      lower: true,
    },
  ];

  /* ---------- Test History helpers ---------- */
  function getTestHistory() {
    return JSON.parse(localStorage.getItem("lc_test_history") || "{}");
  }
  function setTestHistory(h) {
    safeLSSet("lc_test_history", JSON.stringify(h));
  }
  function getAthleteHistory(athleteId) {
    const h = getTestHistory();
    return (h[athleteId] || []).slice().sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });
  }
  function saveTestEntry(athleteId, date, label, values) {
    const h = getTestHistory();
    if (!h[athleteId]) h[athleteId] = [];
    // Prevent exact same date + label duplicate
    h[athleteId] = h[athleteId].filter(function (e) {
      return !(e.date === date && e.label === label);
    });
    h[athleteId].push({ date: date, label: label, values: values });
    setTestHistory(h);
  }
  function deleteTestEntry(athleteId, date, label) {
    const h = getTestHistory();
    if (!h[athleteId]) return;
    h[athleteId] = h[athleteId].filter(function (e) {
      return !(e.date === date && e.label === label);
    });
    if (h[athleteId].length === 0) delete h[athleteId];
    setTestHistory(h);
  }
  function currentTestValues(a) {
    var vals = {};
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      vals[TEST_METRIC_KEYS[i].jsonKey] = a[TEST_METRIC_KEYS[i].key];
    }
    return vals;
  }

  /* ---------- Safe localStorage (quota-aware) ---------- */
  function safeLSSet(key, value) {
    try {
      localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    } catch (e) {
      if (e.name === "QuotaExceededError" || e.code === 22) {
        showToast("Storage full — consider deleting old snapshots.", "error");
      }
      console.error("localStorage write failed:", e);
    }
  }

  /* ---------- Lazy Tab Re-rendering ---------- */
  const _tabDirty = {};
  function markTabsDirty() {
    const tabs = [
      "overview",
      "leaderboards",
      "sprint",
      "strength",
      "scorecard",
      "benchmarks",
      "log",
      "plan",
      "constants",
      "groups",
      "profiles",
      "compare",
    ];
    for (const t of tabs) _tabDirty[t] = true;
  }
  function renderIfDirty(tabId) {
    if (!_tabDirty[tabId]) return;
    _tabDirty[tabId] = false;
    const renderers = {
      overview: renderOverview,
      leaderboards: renderLeaderboards,
      sprint: renderSprintAnalysis,
      strength: renderStrengthPower,
      scorecard: renderScorecard,
      benchmarks: renderBenchmarks,
      log: renderTestingLog,
      plan: renderTestingWeekPlan,
      constants: renderConstants,
      groups: renderGroupDashboard,
      profiles: renderProfile,
      compare: renderComparison,
    };
    if (renderers[tabId]) renderers[tabId]();
  }

  /* ---------- Metric Descriptions (for tooltips) ---------- */
  const METRIC_INFO = {
    bench: {
      name: "Bench Press 1RM",
      unit: "lb",
      measures: "Maximum upper-body pressing strength",
      tellsYou:
        "How much force an athlete can produce horizontally through the chest, shoulders, and triceps. Key for blocking and stiff-arms.",
    },
    squat: {
      name: "Back Squat 1RM",
      unit: "lb",
      measures: "Maximum lower-body strength",
      tellsYou:
        "Overall leg drive capacity — foundational for sprinting, jumping, and changing direction.",
    },
    relBench: {
      name: "Relative Bench",
      unit: "xBW",
      measures: "Bench press normalized to body weight",
      tellsYou:
        "Upper-body strength pound-for-pound. A 1.0+ xBW bench is a solid HS benchmark.",
    },
    relSquat: {
      name: "Relative Squat",
      unit: "xBW",
      measures: "Squat normalized to body weight",
      tellsYou:
        "Lower-body strength pound-for-pound. Higher values correlate with faster sprint acceleration.",
    },
    medball: {
      name: "Seated Med Ball Throw",
      unit: "in",
      measures: "Upper-body explosive power (10 lb ball)",
      tellsYou:
        "How quickly an athlete can generate and release upper-body force. Great predictor of hitting/throwing power.",
    },
    mbRel: {
      name: "Med Ball Relative",
      unit: "in/lb",
      measures: "Med ball throw normalized to body weight",
      tellsYou:
        "Explosive power efficiency — lighter athletes with big throws score high here.",
    },
    vert: {
      name: "Vertical Jump",
      unit: "in",
      measures: "Lower-body explosive power (counter-movement)",
      tellsYou:
        "Ability to generate force vertically in a short time. Correlates with acceleration and change of direction.",
    },
    broad: {
      name: "Broad Jump",
      unit: "in",
      measures: "Horizontal explosive power",
      tellsYou:
        "Combines leg strength and coordination for horizontal displacement. Good general athleticism indicator.",
    },
    forty: {
      name: "40-Yard Dash",
      unit: "s",
      measures: "Linear sprint speed over 40 yards",
      tellsYou:
        "Overall speed. Lower is better. Combines acceleration (0-20) and top-end speed (20-40).",
    },
    vMax: {
      name: "Max Velocity",
      unit: "m/s",
      measures: "Highest velocity achieved across all splits",
      tellsYou:
        "The athlete's top speed. Important for breakaway plays and closing speed on defense.",
    },
    v10Max: {
      name: "Best 10-yd Velocity",
      unit: "m/s",
      measures: "Highest velocity from a 10-yard segment (20-30 or 30-40)",
      tellsYou:
        "Top-end speed over a pure 10-yard window, without the acceleration bias of the first 20 yards.",
    },
    v1: {
      name: "Velocity 0–20 yd",
      unit: "m/s",
      measures: "Average velocity over first 20 yards",
      tellsYou:
        "Acceleration-phase speed. Includes reaction time and first-step quickness.",
    },
    v2: {
      name: "Velocity 20–30 yd",
      unit: "m/s",
      measures: "Average velocity during transition phase",
      tellsYou:
        "Speed as the athlete transitions from acceleration to top speed.",
    },
    v3: {
      name: "Velocity 30–40 yd",
      unit: "m/s",
      measures: "Average velocity during top-speed phase",
      tellsYou:
        "Ability to maintain or increase speed — flags speed endurance issues if slower than 20-30 split.",
    },
    a1: {
      name: "Acceleration (0–20)",
      unit: "m/s\u00B2",
      measures: "Rate of velocity change from standstill",
      tellsYou:
        "How quickly the athlete gets up to speed. Critical first-step quickness metric.",
    },
    a2: {
      name: "Acceleration (20–30)",
      unit: "m/s\u00B2",
      measures: "Rate of velocity change in transition",
      tellsYou: "Continued acceleration ability. Positive = still speeding up.",
    },
    a3: {
      name: "Acceleration (30–40)",
      unit: "m/s\u00B2",
      measures: "Rate of velocity change at top speed",
      tellsYou:
        "Often near zero or negative. Negative means decelerating — flags speed endurance issues.",
    },
    F1: {
      name: "Sprint Force (0–20)",
      unit: "N",
      measures:
        "Average horizontal force during acceleration (mass \u00D7 acceleration)",
      tellsYou:
        "How much force the athlete applies to the ground during the drive phase. Bigger + faster athletes produce more.",
    },
    F2: {
      name: "Sprint Force (20–30)",
      unit: "N",
      measures: "Average horizontal force in transition",
      tellsYou:
        "Force production during the transition phase. Should be lower than F1 as acceleration decreases.",
    },
    F3: {
      name: "Sprint Force (30–40)",
      unit: "N",
      measures: "Average horizontal force at top speed",
      tellsYou:
        "May be negative if decelerating. Low or negative values flag mechanics or endurance issues.",
    },
    imp1: {
      name: "Impulse (0–20)",
      unit: "N\u00B7s",
      measures: "Force \u00D7 time during acceleration phase",
      tellsYou:
        "Total force applied over time. Higher impulse = more momentum built up during acceleration.",
    },
    mom1: {
      name: "Momentum (0–20)",
      unit: "kg\u00B7m/s",
      measures: "Mass \u00D7 velocity at end of 0-20 yd",
      tellsYou:
        "How hard the athlete is to stop at various points. Heavier + faster = more momentum.",
    },
    mom3: {
      name: "Momentum (30–40)",
      unit: "kg\u00B7m/s",
      measures: "Mass \u00D7 velocity at end of sprint",
      tellsYou:
        'Peak momentum at the end of the sprint — the "freight train" factor.',
    },
    momMax: {
      name: "Peak Momentum (best 10yd)",
      unit: "kg\u00B7m/s",
      measures: "Mass \u00D7 best 10-yard split velocity",
      tellsYou:
        'How much momentum the athlete carries at their top 10-yd speed. The "how hard are you to tackle" number. Higher = more force needed to stop them.',
    },
    pow1: {
      name: "Sprint Power (0–20)",
      unit: "W",
      measures: "Force \u00D7 velocity during acceleration",
      tellsYou:
        "Mechanical power output during the drive phase. Combines strength and speed.",
    },
    pow2: {
      name: "Sprint Power (20–30)",
      unit: "W",
      measures: "Force \u00D7 velocity in transition",
      tellsYou: "Power output during transition phase.",
    },
    pow3: {
      name: "Sprint Power (30–40)",
      unit: "W",
      measures: "Force \u00D7 velocity at top speed",
      tellsYou: "Power output at top speed. May drop if decelerating.",
    },
    peakPower: {
      name: "Sayers Peak Power",
      unit: "W",
      measures: "Estimated peak power from vertical jump and body mass",
      tellsYou:
        "Total lower-body power output. Validated formula (Sayers et al.) used in NFL Combine and college S&C.",
    },
    relPeakPower: {
      name: "Relative Peak Power",
      unit: "W/kg",
      measures: "Peak power divided by body mass",
      tellsYou:
        "Power-to-weight ratio. Higher values mean more explosive per pound — important for speed positions.",
    },
    strengthUtil: {
      name: "Strength Utilisation",
      unit: "",
      measures:
        "Sprint force \u00F7 (squat force), i.e. F1 / (squat_kg \u00D7 g)",
      tellsYou:
        "What percentage of max strength is used during sprinting. Low values mean the athlete is strong but isn't applying it to running.",
    },
    zMB: {
      name: "MB Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou:
        "How far above or below the team average. Positive = above average, negative = below.",
    },
    zBench: {
      name: "Bench Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou:
        "Bench press ranking relative to the team. +1.0 = one standard deviation above average.",
    },
    zSquat: {
      name: "Squat Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Squat ranking relative to the team.",
    },
    zVert: {
      name: "Vert Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Vertical jump ranking relative to the team.",
    },
    zForty: {
      name: "40-yd Z-Score",
      unit: "",
      measures:
        "Standard deviations from team mean (inverted — higher = faster)",
      tellsYou:
        "Speed ranking relative to the team. Positive = faster than average.",
    },
    zF1: {
      name: "Sprint Force Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Sprint force ranking relative to the team.",
    },
    zPeakPower: {
      name: "Peak Power Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Peak power ranking relative to the team.",
    },
    explosiveUpper: {
      name: "Explosive Upper Index",
      unit: "",
      measures: "0.6 \u00D7 z(MB_rel) + 0.4 \u00D7 z(Rel Bench)",
      tellsYou:
        "Composite score combining upper-body explosive power and strength. Higher = more explosive upper body.",
    },
    totalExplosive: {
      name: "Total Explosive Index",
      unit: "",
      measures:
        "0.45 \u00D7 ExpUpper + 0.30 \u00D7 z(PP) + 0.25 \u00D7 z(vMax)",
      tellsYou:
        "Overall explosiveness score combining upper-body power, lower-body power, and speed.",
    },
    height: {
      name: "Height",
      unit: "in",
      measures: "Standing height",
      tellsYou: "Affects leverage, reach, and position suitability.",
    },
    weight: {
      name: "Body Weight",
      unit: "lb",
      measures: "Body mass",
      tellsYou: "Affects force production, momentum, and position suitability.",
    },
    massKg: {
      name: "Mass",
      unit: "kg",
      measures: "Body mass in metric",
      tellsYou: "Used in physics calculations (force, momentum, power).",
    },
    sprint020: {
      name: "0–20 yd Split",
      unit: "s",
      measures: "Time for first 20 yards from standstill",
      tellsYou:
        "Acceleration ability. Includes reaction/start. Lower is better.",
    },
    sprint2030: {
      name: "20–30 yd Split",
      unit: "s",
      measures: "Time for 10 yards during transition",
      tellsYou: "Transition from acceleration to top speed. Lower is better.",
    },
    sprint3040: {
      name: "30–40 yd Split",
      unit: "s",
      measures: "Time for final 10 yards",
      tellsYou:
        "Top-end speed maintenance. If slower than 20-30 split, athlete is decelerating.",
    },
  };

  /* ---------- Boot ---------- */
  document.addEventListener("club-data-ready", function () {
    // Hide loading indicator
    const loadingEl = document.getElementById("loadingIndicator");
    if (loadingEl) loadingEl.style.display = "none";

    const D = window.CLUB;
    document.getElementById("exportDate").textContent = D.exportDate;

    // Populate position filter
    const posSel = document.getElementById("overviewPosFilter");
    const lbPosSel = document.getElementById("lbPosFilter");
    D.positions.forEach((p) => {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      posSel.appendChild(o);
      const o2 = document.createElement("option");
      o2.value = p;
      o2.textContent = p;
      lbPosSel.appendChild(o2);
    });

    // Populate athlete selector + scorecard filter + comparison selects
    const athSel = document.getElementById("athleteSelect");
    const scFilt = document.getElementById("scorecardFilter");
    const cmpSelects = [
      document.getElementById("cmpA"),
      document.getElementById("cmpB"),
      document.getElementById("cmpC"),
    ];
    D.athletes
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((a) => {
        const o1 = document.createElement("option");
        o1.value = a.id;
        o1.textContent = `${a.name}${a.position ? " (" + a.position + ")" : ""}`;
        athSel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = a.id;
        o2.textContent = `${a.name}${a.position ? " (" + a.position + ")" : ""}`;
        scFilt.appendChild(o2);

        for (const sel of cmpSelects) {
          const o3 = document.createElement("option");
          o3.value = a.id;
          o3.textContent = `${a.name}${a.position ? " (" + a.position + ")" : ""}`;
          sel.appendChild(o3);
        }
      });

    // Populate snapshot selector
    refreshSnapshotList();

    // Render all tabs
    renderOverview();
    renderLeaderboards();
    renderSprintAnalysis();
    renderStrengthPower();
    renderScorecard();
    renderBenchmarks();
    renderTestingLog();
    renderTestingWeekPlan();
    renderConstants();
    renderGroupDashboard();
    updateDataStatus();

    // Sortable bindings
    document.querySelectorAll(".data-table.sortable thead th").forEach((th) => {
      th.addEventListener("click", function () {
        const table = this.closest("table");
        const col = this.dataset.sort;
        if (!col) return;
        handleSort(table, col, this);
      });
    });

    // Keyboard arrow navigation for tabs
    document.querySelector(".tabs").addEventListener("keydown", function (ev) {
      const tabs = Array.from(this.querySelectorAll(".tab"));
      const idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      let next = -1;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        next = (idx + 1) % tabs.length;
      } else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
        next = (idx - 1 + tabs.length) % tabs.length;
      } else if (ev.key === "Home") {
        next = 0;
      } else if (ev.key === "End") {
        next = tabs.length - 1;
      }
      if (next >= 0) {
        ev.preventDefault();
        tabs[next].focus();
        tabs[next].click();
      }
    });

    // Scroll-to-top button
    const scrollBtn = document.getElementById("scrollTopBtn");
    if (scrollBtn) {
      window.addEventListener("scroll", function () {
        scrollBtn.classList.toggle("visible", window.scrollY > 400);
      });
      scrollBtn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  });

  /* ========== TAB SWITCHING ========== */
  window.showTab = function (tabId) {
    /* Destroy chart instances when leaving their tabs to free GPU memory */
    const prevTab = document.querySelector(".tab.active");
    if (prevTab) {
      const prevId = prevTab.dataset.tab;
      if (prevId === "profiles" && profileChartInstance) {
        profileChartInstance.destroy();
        profileChartInstance = null;
      }
      if (prevId === "profiles" && profilePctChartInstance) {
        profilePctChartInstance.destroy();
        profilePctChartInstance = null;
      }
      if (prevId === "profiles" && profileSprintChartInstance) {
        profileSprintChartInstance.destroy();
        profileSprintChartInstance = null;
      }
      if (prevId === "profiles" && profileDonutInstance) {
        profileDonutInstance.destroy();
        profileDonutInstance = null;
      }
      if (prevId === "profiles" && profileQuadrantInstance) {
        profileQuadrantInstance.destroy();
        profileQuadrantInstance = null;
      }
      if (prevId === "leaderboards" && lbChartInstance) {
        lbChartInstance.destroy();
        lbChartInstance = null;
      }
      if (prevId === "compare" && cmpChartInstance) {
        cmpChartInstance.destroy();
        cmpChartInstance = null;
      }
    }
    document.querySelectorAll(".tab").forEach((t) => {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
      t.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === "tab-" + tabId);
    });
    renderIfDirty(tabId);
  };

  /* ========== HELPERS ========== */
  function fmt(v, decimals) {
    if (v === null || v === undefined) return "—";
    if (typeof decimals === "number") return v.toFixed(decimals);
    return String(v);
  }

  function fmtZ(z) {
    if (z === null || z === undefined) return '<span class="na">—</span>';
    const cls = z > 0.5 ? "z-pos" : z < -0.5 ? "z-neg" : "z-avg";
    return `<span class="${cls}">${z >= 0 ? "+" : ""}${z.toFixed(2)}</span>`;
  }

  function formatLogDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function tierBadge(tier) {
    if (!tier) return "";
    const labels = {
      elite: "Elite",
      strong: "Strong",
      solid: "Solid",
      competitive: "Competitive",
      developing: "Developing",
    };
    return `<span class="tier-badge tier-${tier}">${labels[tier] || tier}</span>`;
  }

  function pctBarHTML(pct, colorVar) {
    if (pct === null || pct === undefined) return "";
    const col =
      colorVar ||
      (pct >= 75
        ? "var(--green)"
        : pct >= 50
          ? "var(--blue)"
          : pct >= 25
            ? "var(--yellow)"
            : "var(--red)");
    return `<div class="pct-bar-wrap"><div class="pct-bar-bg"><div class="pct-bar-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
  }

  function tdNum(val, decimals) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    return `<td class="num">${fmt(val, decimals)}</td>`;
  }

  function tdGraded(val, decimals, grade) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    if (!grade) return `<td class="num">${v}</td>`;
    return `<td class="num grade-text-${grade.tier}" title="${grade.label}">${v}</td>`;
  }

  function tdNumColored(val, decimals) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    const cls = val < 0 ? "z-neg" : val > 0 ? "z-pos" : "";
    return `<td class="num ${cls}">${v}</td>`;
  }

  function gradeBadge(grade) {
    if (!grade) return "";
    return `<span class="grade-badge grade-bg-${grade.tier}" title="${grade.label}">${grade.label}</span>`;
  }

  function overallGradeCell(og) {
    if (!og) return '<td class="na">—</td>';
    return `<td class="grade-overall" data-sort-value="${og.score}" title="${og.label} — based on ${og.count} metrics, avg ${og.score}/5">
      <span class="grade-badge grade-bg-${og.tier}">${og.label}</span>
      <span class="grade-score">${og.score}</span>
    </td>`;
  }

  /* ========== OVERVIEW ========== */
  window.debouncedOverview = debounce(function () {
    renderOverview();
  }, 250);

  window.renderOverview = function () {
    const D = window.CLUB;
    const posFilter = document.getElementById("overviewPosFilter").value;
    const grpFilter = document.getElementById("overviewGroupFilter").value;
    const gradeFilter = document.getElementById("overviewGradeFilter").value;
    const searchTerm = (document.getElementById("rosterSearch").value || "")
      .trim()
      .toLowerCase();

    let list = D.athletes;
    if (posFilter !== "all")
      list = list.filter((a) => a.position === posFilter);
    if (grpFilter !== "all") list = list.filter((a) => a.group === grpFilter);
    if (searchTerm)
      list = list.filter((a) => a.name.toLowerCase().includes(searchTerm));
    if (gradeFilter !== "all") {
      const gradeOrder = {
        elite: 5,
        excellent: 4,
        good: 3,
        average: 2,
        below: 1,
      };
      const minScore = gradeOrder[gradeFilter] || 0;
      if (gradeFilter === "below") {
        list = list.filter(
          (a) => a.overallGrade && a.overallGrade.tier === "below",
        );
      } else {
        list = list.filter(
          (a) => a.overallGrade && gradeOrder[a.overallGrade.tier] >= minScore,
        );
      }
    }

    const total = list.length;
    const avg = (key) => {
      const v = list.filter((a) => a[key] !== null);
      return v.length ? v.reduce((s, a) => s + a[key], 0) / v.length : null;
    };
    const avgBench = avg("bench");
    const avgSquat = avg("squat");
    const avgMB = avg("medball");
    const avg40 = avg("forty");
    const avgVert = avg("vert");
    const avgPP = avg("peakPower");

    // Data completeness
    const coreFields = ["bench", "squat", "medball", "vert", "broad", "forty"];
    const fullyTested = list.filter((a) =>
      coreFields.every((k) => a[k] !== null),
    ).length;
    const completePct = total > 0 ? Math.round((fullyTested / total) * 100) : 0;

    document.getElementById("summaryCards").innerHTML = `
      <div class="summary-card"><div class="label">Athletes</div><div class="value">${total}</div><div class="sub">${D.positions.length} positions</div></div>
      <div class="summary-card"><div class="label">Avg Bench</div><div class="value">${avgBench ? avgBench.toFixed(0) : "—"}<small> lb</small></div><div class="sub">${list.filter((a) => a.bench !== null).length} tested</div></div>
      <div class="summary-card"><div class="label">Avg Squat</div><div class="value">${avgSquat ? avgSquat.toFixed(0) : "—"}<small> lb</small></div><div class="sub">${list.filter((a) => a.squat !== null).length} tested</div></div>
      <div class="summary-card"><div class="label">Avg MB Throw</div><div class="value">${avgMB ? avgMB.toFixed(0) : "—"}<small> in</small></div><div class="sub">${list.filter((a) => a.medball !== null).length} tested</div></div>
      <div class="summary-card"><div class="label">Avg Vert</div><div class="value">${avgVert ? avgVert.toFixed(1) : "—"}<small> in</small></div><div class="sub">${list.filter((a) => a.vert !== null).length} tested</div></div>
      <div class="summary-card"><div class="label">Avg 40 yd</div><div class="value">${avg40 ? avg40.toFixed(2) : "—"}<small> s</small></div><div class="sub">${list.filter((a) => a.forty !== null).length} tested</div></div>
      <div class="summary-card"><div class="label">Avg Peak Power</div><div class="value">${avgPP ? avgPP.toFixed(0) : "—"}<small> W</small></div><div class="sub">${list.filter((a) => a.peakPower !== null).length} tested</div></div>
      <div class="summary-card"><div class="label">Data Completeness</div><div class="value">${completePct}<small>%</small></div><div class="sub">${fullyTested}/${total} fully tested</div></div>
    `;

    // Data quality warnings & flags
    const warnContainer = document.getElementById("dataWarnings");
    if (warnContainer) {
      let warnHtml = "";
      if (D.warnings && D.warnings.length) {
        warnHtml += D.warnings
          .map(
            (w) =>
              `<div class="info-banner warn"><strong>Low Sample:</strong> ${w.metric} (n=${w.n}) — ${w.msg}</div>`,
          )
          .join("");
      }
      if (D.flags && D.flags.length) {
        warnHtml += D.flags
          .map(
            (f) =>
              `<div class="info-banner flag"><strong>Data Flag:</strong> ${f.athlete} — ${f.msg}</div>`,
          )
          .join("");
      }
      warnContainer.innerHTML = warnHtml;
    }

    const tbody = document.querySelector("#rosterTable tbody");
    tbody.innerHTML = list
      .map((a) => {
        const isTested = coreFields.some((k) => a[k] !== null);
        const rowCls = isTested ? "clickable" : "clickable untested-row";
        return `
      <tr class="${rowCls}" tabindex="0" role="button" onclick="selectAthlete('${a.id}')" onkeydown="if(event.key==='Enter')selectAthlete('${a.id}')">
        <td><strong>${esc(a.name)}</strong>${!isTested ? ' <span class="untested-badge">Untested</span>' : ""}</td>
        <td>${esc(a.position) || "—"}</td>
        <td><span class="group-tag group-${a.group.replace(/\s/g, "")}">${esc(a.group)}</span></td>
        ${tdNum(a.height, 1)}
        ${tdNum(a.weight)}
        ${tdGraded(a.bench, 0, a.grades.bench)}
        ${tdGraded(a.squat, 0, a.grades.squat)}
        ${tdGraded(a.medball, 0, a.grades.medball)}
        ${tdGraded(a.vert, 1, a.grades.vert)}
        ${tdGraded(a.broad, 0, a.grades.broad)}
        ${tdGraded(a.forty, 2, a.grades.forty)}
        <td class="num">${fmtZ(a.zMB)}</td>
        ${overallGradeCell(a.overallGrade)}
      </tr>
    `;
      })
      .join("");
  };

  window.selectAthlete = function (id) {
    const a = window.CLUB.athletes.find(function (x) {
      return x.id === id;
    });
    if (!a) {
      showToast("Athlete not found — data may have changed.", "warn");
      renderOverview();
      return;
    }
    document.getElementById("athleteSelect").value = id;
    showTab("profiles");
    renderProfile();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ========== ATHLETE PROFILE ========== */
  window.renderProfile = function () {
    const D = window.CLUB;
    const id = document.getElementById("athleteSelect").value;
    const container = document.getElementById("profileContent");

    if (!id) {
      container.innerHTML =
        '<p class="placeholder-text">Select an athlete to view their profile.</p>';
      return;
    }
    const a = D.athletes.find((x) => x.id === id);
    if (!a) {
      container.innerHTML =
        '<p class="placeholder-text">Athlete not found.</p>';
      return;
    }

    let html = `
    <div class="profile-card" id="printProfileCard">
      <div class="profile-header">
        <div class="profile-avatar">${a.initials}</div>
        <div>
          <div class="profile-name">${esc(a.name)} ${a.overallGrade ? `<span class="grade-badge grade-bg-${a.overallGrade.tier}" style="font-size:.7rem;vertical-align:middle;margin-left:.5rem">${a.overallGrade.label} (${a.overallGrade.score})</span>` : ""}</div>
          <div class="profile-meta">
            <span class="meta-item"><strong>Position:</strong> ${esc(a.position) || "N/A"}</span>
            <span class="meta-item"><strong>Group:</strong> <span class="group-tag group-${a.group.replace(/\s/g, "")}">${a.group}</span></span>
            <span class="meta-item"><strong>Height:</strong> ${a.height ? fmtHeight(a.height) + " (" + a.height + " in)" : "N/A"}</span>
            <span class="meta-item"><strong>Weight:</strong> ${a.weight ? a.weight + " lb (" + a.massKg + " kg)" : "N/A"}</span>
            <span class="meta-item"><strong>ID:</strong> ${a.id}</span>
          </div>
        </div>
      </div>

      <div class="profile-section-title">Strength</div>
      <div class="metric-grid">
        ${metricCard("Bench 1RM", a.bench, "lb", a.relBench !== null ? "Rel: " + a.relBench + "x BW (" + a.benchKg + " kg)" : null, a.grades.bench)}
        ${metricCard("Squat 1RM", a.squat, "lb", a.relSquat !== null ? "Rel: " + a.relSquat + "x BW (" + a.squatKg + " kg)" : null, a.grades.squat)}
        ${metricCard("Rel Bench", a.relBench, "xBW", null, a.grades.relBench)}
        ${metricCard("Rel Squat", a.relSquat, "xBW", null, a.grades.relSquat)}
        ${metricCardZ("Bench Z-Score", a.zBench)}
        ${metricCardZ("Squat Z-Score", a.zSquat)}
      </div>

      <div class="profile-section-title">Explosiveness</div>
      <div class="metric-grid">
        ${metricCard("Med Ball Throw", a.medball, "in", a.medball ? fmtHeight(a.medball) : null, a.grades.medball)}
        ${metricCard("MB Relative", a.mbRel, "in/lb", null, a.grades.mbRel)}
        ${metricCard("Vertical Jump", a.vert, "in", a.vertCm ? a.vertCm + " cm" : null, a.grades.vert)}
        ${metricCard("Broad Jump", a.broad, "in", a.broadCm ? a.broadCm + " cm" : null, a.grades.broad)}
        ${metricCard("Peak Power (Sayers)", a.peakPower, "W", a.relPeakPower ? "Rel: " + a.relPeakPower + " W/kg" : null, a.grades.peakPower)}
        ${metricCard("Rel Peak Power", a.relPeakPower, "W/kg", null, a.grades.relPeakPower)}
      </div>

      <div class="profile-section-title">Speed</div>
      <div class="metric-grid">
        ${metricCard("0–20 yd", a.sprint020, "s", a.v1 ? "v=" + a.v1 + " m/s" : null)}
        ${metricCard("20–30 yd", a.sprint2030, "s", a.v2 ? "v=" + a.v2 + " m/s" : null)}
        ${metricCard("30–40 yd", a.sprint3040, "s", a.v3 ? "v=" + a.v3 + " m/s" : null)}
        ${metricCard("40 yd Total", a.forty, "s", a.vMax ? "vMax=" + a.vMax + " m/s" : null, a.grades.forty)}
        ${metricCard("Max Velocity", a.vMax, "m/s", null, a.grades.vMax)}
        ${metricCard("Best 10yd Vel", a.v10Max, "m/s", null, a.grades.v10Max)}
      </div>

      <div class="profile-section-title">Sprint Force &amp; Power</div>
      <div class="metric-grid">
        ${metricCard("Force (0–20)", a.F1, "N", a.imp1 ? "Impulse: " + a.imp1 + " N·s" : null, a.grades.F1)}
        ${metricCard("Force (20–30)", a.F2, "N", a.imp2 ? "Impulse: " + a.imp2 + " N·s" : null)}
        ${metricCard("Force (30–40)", a.F3, "N", a.imp3 ? "Impulse: " + a.imp3 + " N·s" : null)}
        ${metricCard("Peak Momentum", a.momMax, "kg·m/s", a.v10Max ? "mass × best 10yd v (" + a.v10Max + " m/s)" : null, a.grades.momMax)}
        ${metricCard("Momentum (final)", a.mom3, "kg·m/s")}
        ${metricCard("Power (0–20)", a.pow1, "W")}
        ${metricCard("Strength Util", a.strengthUtil, "", a.strengthUtil ? "F1 / (Squat×g)" : null)}
      </div>

      <div class="profile-section-title">Analytics &amp; Rankings</div>
      <div class="metric-grid">
        ${metricCardZ("MB Z-Score", a.zMB)}
        ${metricCardPct("MB Pctl (Team)", a.mbPctTeam, a.mbTier)}
        ${metricCardPct("MB Pctl (Group)", a.mbPctGroup, a.mbTier)}
        ${metricCardZ("Explosive Upper Idx", a.explosiveUpper)}
        ${metricCardZ("Total Explosive Idx", a.totalExplosive)}
        ${metricCardZ("Speed Z-Score (40)", a.zForty)}
        ${metricCardZ("Sprint Force Z", a.zF1)}
        ${metricCardZ("Peak Power Z", a.zPeakPower)}
      </div>

      ${
        Object.keys(a.scorecard).length > 0
          ? `
      <div class="profile-section-title">Scorecard</div>
      <div class="scorecard-mini">
        ${Object.entries(a.scorecard)
          .map(([k, sc]) => {
            const label =
              D.scorecardMetrics.find((m) => m.key === k)?.label || k;
            return `<div class="sc-item">
            <span class="sc-label">${label}</span>
            <span class="sc-val">${typeof sc.value === "number" ? (Number.isInteger(sc.value) ? sc.value : sc.value.toFixed(2)) : sc.value}</span>
            ${tierBadge(sc.tier)}
            <span class="sc-pct">${sc.percentile}th</span>
            ${pctBarHTML(sc.percentile)}
          </div>`;
          })
          .join("")}
      </div>`
          : ""
      }

      ${buildProgressSection(a)}

      <div class="profile-section-title">Radar</div>
      <div class="profile-chart-wrap"><canvas id="profileRadar"></canvas></div>

      <div class="profile-section-title">Scorecard Percentiles</div>
      <div class="profile-chart-wrap profile-chart-wide"><canvas id="profilePercentileChart"></canvas></div>

      <div class="profile-section-title">Sprint Velocity Profile</div>
      <div class="profile-chart-wrap"><canvas id="profileSprintChart"></canvas></div>

      <div class="profile-section-title">Grade Distribution</div>
      <div class="profile-chart-wrap profile-chart-sm"><canvas id="profileGradeDonut"></canvas></div>

      <div class="profile-section-title">Strength vs Speed</div>
      <div class="profile-chart-wrap"><canvas id="profileQuadrant"></canvas></div>

      ${buildTeamRankingSection(a)}
    </div>`;

    container.innerHTML = html;
    buildProfileRadar(a);
    buildPercentileChart(a);
    buildSprintVelocityChart(a);
    buildGradeDonut(a);
    buildStrengthSpeedChart(a);
  };

  function metricCard(label, val, unit, sub, grade) {
    const gradeHTML = grade ? ` ${gradeBadge(grade)}` : "";
    return `<div class="metric-card ${grade ? "mc-graded mc-" + grade.tier : ""}">
      <div class="metric-label">${label}${gradeHTML}</div>
      <div class="metric-value">${val !== null && val !== undefined ? val : "—"} <small>${val !== null ? unit || "" : ""}</small></div>
      ${sub ? '<div class="metric-sub">' + sub + "</div>" : ""}
    </div>`;
  }

  function metricCardZ(label, z) {
    return `<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${fmtZ(z)}</div></div>`;
  }

  function metricCardPct(label, pct, tier) {
    return `<div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${pct !== null ? pct + "<small>th</small>" : "—"}</div>
      ${tierBadge(tier)}${pctBarHTML(pct)}
    </div>`;
  }

  /* ---------- Shared normalization (used by radar + comparison) ---------- */
  function normMetric(val, key) {
    if (val === null) return 0;
    const D = window.CLUB;
    const vals = D.athletes.map((x) => x[key]).filter((v) => v !== null);
    if (vals.length === 0) return 0;
    const max = Math.max(...vals);
    return max > 0 ? Math.round((val / max) * 100) : 0;
  }
  function normMetricInv(val, key) {
    if (val === null) return 0;
    const D = window.CLUB;
    const vals = D.athletes.map((x) => x[key]).filter((v) => v !== null);
    if (vals.length === 0) return 0;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) return 100;
    return Math.round(((max - val) / (max - min)) * 100);
  }

  function buildProfileRadar(a) {
    const D = window.CLUB;
    const canvas = document.getElementById("profileRadar");
    if (!canvas) return;
    if (typeof Chart === "undefined") {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">Charts unavailable (Chart.js failed to load)</p>';
      return;
    }
    if (profileChartInstance) {
      profileChartInstance.destroy();
      profileChartInstance = null;
    }

    const radarKeys = [
      "bench",
      "squat",
      "medball",
      "vert",
      "broad",
      "forty",
      "F1",
      "peakPower",
      "momMax",
    ];
    const labels = radarKeys.map((k) => METRIC_INFO[k]?.name || k);
    const values = [
      normMetric(a.bench, "bench"),
      normMetric(a.squat, "squat"),
      normMetric(a.medball, "medball"),
      normMetric(a.vert, "vert"),
      normMetric(a.broad, "broad"),
      normMetricInv(a.forty, "forty"),
      normMetric(a.F1, "F1"),
      normMetric(a.peakPower, "peakPower"),
      normMetric(a.momMax, "momMax"),
    ];

    profileChartInstance = new Chart(canvas, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: a.name,
            data: values,
            fill: true,
            backgroundColor: "rgba(167,139,250,.2)",
            borderColor: "#a78bfa",
            pointBackgroundColor: "#a78bfa",
            pointBorderColor: "#fff",
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            grid: { color: "rgba(255,255,255,.08)" },
            angleLines: { color: "rgba(255,255,255,.08)" },
            pointLabels: {
              color: "#8b90a0",
              font: { size: 11, weight: "600" },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const key = radarKeys[ctx.dataIndex];
                const mi = METRIC_INFO[key];
                return `${ctx.label}: ${ctx.raw}% of team max`;
              },
              afterLabel: (ctx) => {
                const key = radarKeys[ctx.dataIndex];
                const mi = METRIC_INFO[key];
                if (!mi) return "";
                const raw = a[key];
                const valStr =
                  raw !== null && raw !== undefined
                    ? raw + " " + mi.unit
                    : "N/A";
                return ["Value: " + valStr, mi.tellsYou];
              },
            },
          },
        },
      },
    });
  }

  /* ========== PERCENTILE HORIZONTAL BAR CHART ========== */
  function buildPercentileChart(a) {
    const D = window.CLUB;
    const canvas = document.getElementById("profilePercentileChart");
    if (!canvas || typeof Chart === "undefined") return;
    if (profilePctChartInstance) {
      profilePctChartInstance.destroy();
      profilePctChartInstance = null;
    }

    const entries = Object.entries(a.scorecard);
    if (entries.length === 0) {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">No scorecard data available.</p>';
      return;
    }

    const labels = entries.map(([k]) => {
      const m = D.scorecardMetrics.find((m) => m.key === k);
      return m ? m.label : k;
    });
    const values = entries.map(([, sc]) => sc.percentile);
    const colors = values.map((v) =>
      v >= 80
        ? "#a78bfa"
        : v >= 60
          ? "#4ade80"
          : v >= 40
            ? "#60a5fa"
            : v >= 20
              ? "#facc15"
              : "#f87171",
    );

    profilePctChartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors.map((c) => c + "33"),
            borderColor: colors,
            borderWidth: 1.5,
            borderRadius: 4,
            barPercentage: 0.7,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#8b90a0", callback: (v) => v + "%" },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#e4e6ed", font: { size: 11 } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const key = entries[ctx.dataIndex][0];
                const sc = a.scorecard[key];
                const val = sc
                  ? typeof sc.value === "number"
                    ? Number.isInteger(sc.value)
                      ? sc.value
                      : sc.value.toFixed(2)
                    : sc.value
                  : "";
                return ctx.raw + "th percentile — Value: " + val;
              },
            },
          },
        },
      },
    });
  }

  /* ========== SPRINT VELOCITY LINE CHART ========== */
  function buildSprintVelocityChart(a) {
    const D = window.CLUB;
    const canvas = document.getElementById("profileSprintChart");
    if (!canvas || typeof Chart === "undefined") return;
    if (profileSprintChartInstance) {
      profileSprintChartInstance.destroy();
      profileSprintChartInstance = null;
    }

    if (!a.v1 && !a.v2 && !a.v3) {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">No sprint data available.</p>';
      return;
    }

    const phases = ["0–20 yd", "20–30 yd", "30–40 yd"];
    const athleteVels = [a.v1, a.v2, a.v3];

    // Compute team averages
    const teamAvgs = [null, null, null];
    let count = [0, 0, 0];
    for (const t of D.athletes) {
      if (t.v1 !== null) {
        teamAvgs[0] = (teamAvgs[0] || 0) + t.v1;
        count[0]++;
      }
      if (t.v2 !== null) {
        teamAvgs[1] = (teamAvgs[1] || 0) + t.v2;
        count[1]++;
      }
      if (t.v3 !== null) {
        teamAvgs[2] = (teamAvgs[2] || 0) + t.v3;
        count[2]++;
      }
    }
    for (let i = 0; i < 3; i++) {
      if (count[i] > 0) teamAvgs[i] = +(teamAvgs[i] / count[i]).toFixed(2);
    }

    profileSprintChartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: phases,
        datasets: [
          {
            label: a.name,
            data: athleteVels,
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167,139,250,.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 6,
            pointBackgroundColor: "#a78bfa",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "Team Avg",
            data: teamAvgs,
            borderColor: "#60a5fa",
            backgroundColor: "rgba(96,165,250,.08)",
            fill: false,
            borderDash: [6, 3],
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#60a5fa",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            title: { display: true, text: "Velocity (m/s)", color: "#8b90a0" },
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#8b90a0" },
          },
          x: {
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#8b90a0" },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: "#e4e6ed",
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.dataset.label +
                ": " +
                (ctx.raw !== null ? ctx.raw + " m/s" : "N/A"),
            },
          },
        },
      },
    });
  }

  /* ========== GRADE DISTRIBUTION DONUT ========== */
  function buildGradeDonut(a) {
    const canvas = document.getElementById("profileGradeDonut");
    if (!canvas || typeof Chart === "undefined") return;
    if (profileDonutInstance) {
      profileDonutInstance.destroy();
      profileDonutInstance = null;
    }

    if (!a.grades || Object.keys(a.grades).length === 0) {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">No graded metrics available.</p>';
      return;
    }

    const tierCounts = {
      elite: 0,
      excellent: 0,
      good: 0,
      average: 0,
      below: 0,
    };
    const tierLabels = {
      elite: "Elite",
      excellent: "Excellent",
      good: "Good",
      average: "Average",
      below: "Below Avg",
    };
    const tierColors = {
      elite: "#a78bfa",
      excellent: "#4ade80",
      good: "#60a5fa",
      average: "#facc15",
      below: "#f87171",
    };

    for (const g of Object.values(a.grades)) {
      if (g && g.tier && tierCounts.hasOwnProperty(g.tier))
        tierCounts[g.tier]++;
    }

    const activeTiers = Object.keys(tierCounts).filter(
      (t) => tierCounts[t] > 0,
    );
    if (activeTiers.length === 0) {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">No graded metrics available.</p>';
      return;
    }

    const totalGraded = activeTiers.reduce((s, t) => s + tierCounts[t], 0);

    profileDonutInstance = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: activeTiers.map((t) => tierLabels[t]),
        datasets: [
          {
            data: activeTiers.map((t) => tierCounts[t]),
            backgroundColor: activeTiers.map((t) => tierColors[t] + "44"),
            borderColor: activeTiers.map((t) => tierColors[t]),
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "55%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#e4e6ed",
              padding: 16,
              usePointStyle: true,
              pointStyle: "rectRounded",
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.label +
                ": " +
                ctx.raw +
                " metric" +
                (ctx.raw !== 1 ? "s" : "") +
                " (" +
                Math.round((ctx.raw / totalGraded) * 100) +
                "%)",
            },
          },
        },
      },
    });
  }

  /* ========== STRENGTH vs SPEED SCATTER CHART ========== */
  function buildStrengthSpeedChart(a) {
    const D = window.CLUB;
    const canvas = document.getElementById("profileQuadrant");
    if (!canvas || typeof Chart === "undefined") return;
    if (profileQuadrantInstance) {
      profileQuadrantInstance.destroy();
      profileQuadrantInstance = null;
    }

    // Use relative squat as "strength" and 40 time (inverted for speed) as "speed"
    if (a.relSquat === null || a.forty === null) {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">Needs squat and 40-yd data.</p>';
      return;
    }

    const teamPoints = [];
    let sumStr = 0,
      sumSpd = 0,
      n = 0;
    for (const t of D.athletes) {
      if (t.relSquat !== null && t.forty !== null) {
        teamPoints.push({ x: t.relSquat, y: t.forty, name: t.name, id: t.id });
        sumStr += t.relSquat;
        sumSpd += t.forty;
        n++;
      }
    }
    if (n === 0) return;
    const avgStr = sumStr / n;
    const avgSpd = sumSpd / n;

    const others = teamPoints.filter((p) => p.id !== a.id);

    profileQuadrantInstance = new Chart(canvas, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Teammates",
            data: others.map((p) => ({ x: p.x, y: p.y })),
            backgroundColor: "rgba(96,165,250,.35)",
            borderColor: "#60a5fa",
            pointRadius: 5,
            pointHoverRadius: 7,
            _names: others.map((p) => p.name),
          },
          {
            label: a.name,
            data: [{ x: a.relSquat, y: a.forty }],
            backgroundColor: "#a78bfa",
            borderColor: "#fff",
            pointRadius: 9,
            pointBorderWidth: 2,
            pointHoverRadius: 11,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          x: {
            title: {
              display: true,
              text: "Relative Squat (xBW) →  Stronger",
              color: "#8b90a0",
            },
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#8b90a0" },
          },
          y: {
            reverse: true,
            title: {
              display: true,
              text: "40-yd Dash (s) ↑  Faster",
              color: "#8b90a0",
            },
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#8b90a0" },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: "#e4e6ed",
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const ds = ctx.dataset;
                const name = ds._names ? ds._names[ctx.dataIndex] : a.name;
                return (
                  name + ": Squat " + ctx.raw.x + "xBW, 40yd " + ctx.raw.y + "s"
                );
              },
            },
          },
          annotation:
            typeof Chart.registry?.plugins?.get("annotation") !== "undefined"
              ? {
                  annotations: {
                    avgStr: {
                      type: "line",
                      xMin: avgStr,
                      xMax: avgStr,
                      borderColor: "rgba(255,255,255,.15)",
                      borderDash: [4, 4],
                    },
                    avgSpd: {
                      type: "line",
                      yMin: avgSpd,
                      yMax: avgSpd,
                      borderColor: "rgba(255,255,255,.15)",
                      borderDash: [4, 4],
                    },
                  },
                }
              : undefined,
        },
      },
    });
  }

  /* ========== TEAM RANKING BARS ========== */
  function buildTeamRankingSection(a) {
    const D = window.CLUB;
    const metrics = [
      { key: "bench", label: "Bench 1RM", unit: "lb", inv: false },
      { key: "squat", label: "Squat 1RM", unit: "lb", inv: false },
      { key: "medball", label: "Med Ball", unit: "in", inv: false },
      { key: "vert", label: "Vertical", unit: "in", inv: false },
      { key: "broad", label: "Broad Jump", unit: "in", inv: false },
      { key: "forty", label: "40-yd Dash", unit: "s", inv: true },
      { key: "vMax", label: "Max Velocity", unit: "m/s", inv: false },
      { key: "peakPower", label: "Peak Power", unit: "W", inv: false },
    ];

    let rows = "";
    for (const m of metrics) {
      if (a[m.key] === null || a[m.key] === undefined) continue;
      const vals = D.athletes
        .filter((t) => t[m.key] !== null)
        .map((t) => t[m.key]);
      if (vals.length === 0) continue;
      const sorted = m.inv
        ? [...vals].sort((a, b) => a - b)
        : [...vals].sort((a, b) => b - a);
      const rank = sorted.indexOf(a[m.key]) + 1;
      const total = sorted.length;
      const pct = Math.round(((total - rank) / (total - 1 || 1)) * 100);
      const col =
        pct >= 75
          ? "var(--purple)"
          : pct >= 50
            ? "var(--green)"
            : pct >= 25
              ? "var(--blue)"
              : "var(--yellow)";
      rows += `<div class="rank-row">
        <span class="rank-label">${m.label}</span>
        <span class="rank-value">${a[m.key]} ${m.unit}</span>
        <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${pct}%;background:${col}"></div></div>
        <span class="rank-pos">#${rank}<small>/${total}</small></span>
      </div>`;
    }

    if (!rows) return "";
    return `<div class="profile-section-title">Team Rankings</div><div class="team-ranking-grid">${rows}</div>`;
  }

  /* ========== TEST HISTORY — PROFILE PROGRESS SECTION ========== */
  function buildProgressSection(a) {
    const history = getAthleteHistory(a.id);
    if (history.length === 0) return "";

    const current = currentTestValues(a);
    let html =
      '<div class="profile-section-title">Progress History <small>(' +
      history.length +
      " previous test" +
      (history.length > 1 ? "s" : "") +
      ")</small></div>";
    html +=
      '<div class="progress-table-wrap"><table class="data-table progress-table"><thead><tr>';
    html += "<th>Metric</th><th>Current</th>";
    // Show up to last 4 tests
    const shown = history.slice(0, 4);
    for (var ti = 0; ti < shown.length; ti++) {
      html +=
        "<th>" +
        esc(shown[ti].label || shown[ti].date) +
        "<br><small>" +
        shown[ti].date +
        "</small></th>";
    }
    if (shown.length > 0) html += "<th>vs Last</th>";
    html += "</tr></thead><tbody>";

    for (var mi = 0; mi < TEST_METRIC_KEYS.length; mi++) {
      var mk = TEST_METRIC_KEYS[mi];
      var curVal = current[mk.jsonKey];
      html +=
        "<tr><td><strong>" +
        mk.label +
        "</strong> <small>" +
        mk.unit +
        "</small></td>";
      html +=
        '<td class="num">' +
        (curVal !== null && curVal !== undefined ? curVal : "—") +
        "</td>";
      for (var si = 0; si < shown.length; si++) {
        var hVal = shown[si].values[mk.jsonKey];
        html +=
          '<td class="num">' +
          (hVal !== null && hVal !== undefined ? hVal : "—") +
          "</td>";
      }
      // Delta vs most recent
      if (shown.length > 0) {
        var lastVal = shown[0].values[mk.jsonKey];
        if (
          curVal !== null &&
          curVal !== undefined &&
          lastVal !== null &&
          lastVal !== undefined
        ) {
          var delta = curVal - lastVal;
          var pctChange =
            lastVal !== 0 ? Math.round((delta / Math.abs(lastVal)) * 100) : 0;
          var improved = mk.lower ? delta < 0 : delta > 0;
          var declined = mk.lower ? delta > 0 : delta < 0;
          var cls = improved
            ? "delta-up"
            : declined
              ? "delta-down"
              : "delta-flat";
          var arrow = improved ? "▲" : declined ? "▼" : "—";
          var sign = delta > 0 ? "+" : "";
          html +=
            '<td class="num ' +
            cls +
            '">' +
            arrow +
            " " +
            sign +
            (Number.isInteger(delta) ? delta : delta.toFixed(2)) +
            " <small>(" +
            sign +
            pctChange +
            "%)</small></td>";
        } else {
          html += '<td class="na">—</td>';
        }
      }
      html += "</tr>";
    }

    // Forty composite row
    var curForty = a.forty;
    html +=
      '<tr class="progress-composite"><td><strong>40 yd Total</strong> <small>s</small></td>';
    html += '<td class="num">' + (curForty !== null ? curForty : "—") + "</td>";
    for (var fi = 0; fi < shown.length; fi++) {
      var fv = shown[fi].values;
      var hForty =
        fv.sprint_020 !== null &&
        fv.sprint_2030 !== null &&
        fv.sprint_3040 !== null
          ? +(fv.sprint_020 + fv.sprint_2030 + fv.sprint_3040).toFixed(2)
          : null;
      html += '<td class="num">' + (hForty !== null ? hForty : "—") + "</td>";
    }
    if (shown.length > 0) {
      var fvLast = shown[0].values;
      var lastForty =
        fvLast.sprint_020 !== null &&
        fvLast.sprint_2030 !== null &&
        fvLast.sprint_3040 !== null
          ? +(
              fvLast.sprint_020 +
              fvLast.sprint_2030 +
              fvLast.sprint_3040
            ).toFixed(2)
          : null;
      if (curForty !== null && lastForty !== null) {
        var fd = curForty - lastForty;
        var fpct =
          lastForty !== 0 ? Math.round((fd / Math.abs(lastForty)) * 100) : 0;
        var fImproved = fd < 0;
        var fDeclined = fd > 0;
        var fCls = fImproved
          ? "delta-up"
          : fDeclined
            ? "delta-down"
            : "delta-flat";
        var fArrow = fImproved ? "▲" : fDeclined ? "▼" : "—";
        var fSign = fd > 0 ? "+" : "";
        html +=
          '<td class="num ' +
          fCls +
          '">' +
          fArrow +
          " " +
          fSign +
          fd.toFixed(2) +
          " <small>(" +
          fSign +
          fpct +
          "%)</small></td>";
      } else {
        html += '<td class="na">—</td>';
      }
    }
    html += "</tr>";

    html += "</tbody></table></div>";

    // Per-test action buttons
    html += '<div class="history-actions">';
    html += '<span class="history-actions-label">Manage tests:</span>';
    for (var di = 0; di < shown.length; di++) {
      html += '<span class="history-action-group">';
      html +=
        '<button class="btn btn-xs btn-muted" onclick="openEditPanel(\'' + esc(a.id) + '\'); setTimeout(function(){ editHistoryEntry(\'' +
        esc(a.id) +
        "','" +
        esc(shown[di].date) +
        "','" +
        esc(shown[di].label) +
        "')},300)\" title=\"Edit this test\">✏️</button>";
      html +=
        '<button class="btn btn-xs btn-muted" onclick="deleteHistoryEntry(\'' +
        esc(a.id) +
        "','" +
        esc(shown[di].date) +
        "','" +
        esc(shown[di].label) +
        '\')" title="Delete this test">🗑</button>';
      html += '<small class="history-action-name">' + esc(shown[di].label || shown[di].date) + '</small>';
      html += '</span>';
    }
    html += "</div>";

    return html;
  }

  window.deleteHistoryEntry = function (athleteId, date, label) {
    if (!confirm('Delete test entry "' + label + '" (' + date + ")?")) return;
    deleteTestEntry(athleteId, date, label);
    renderProfile();
    showToast("Deleted test entry: " + label, "info");
  };

  /* --- Save ALL athletes' current data as a test date --- */
  window.saveAllAsTestDate = function () {
    var D = window.CLUB;
    var tested = D.athletes.filter(function (a) {
      return Object.keys(a.scorecard).length > 0;
    });
    if (tested.length === 0) {
      showToast("No athletes with test data to save.", "warn");
      return;
    }

    var dateStr = prompt(
      "Enter test date (YYYY-MM-DD):",
      new Date().toISOString().slice(0, 10),
    );
    if (!dateStr) return;
    var label = prompt(
      'Enter a label for this test (e.g. "Pre-Season 2026", "Winter Testing"):',
      "",
    );
    if (label === null) return;
    if (!label.trim()) label = dateStr;
    label = label.trim();

    var count = 0;
    for (var i = 0; i < tested.length; i++) {
      var a = tested[i];
      var vals = currentTestValues(a);
      // Only save if at least one non-null metric
      var hasData = false;
      for (var k in vals) {
        if (vals[k] !== null && vals[k] !== undefined) {
          hasData = true;
          break;
        }
      }
      if (hasData) {
        saveTestEntry(a.id, dateStr, label, vals);
        count++;
      }
    }
    showToast(
      'Saved "' + label + '" test data for ' + count + " athletes.",
      "success",
    );
    // Refresh profile if one is selected
    var id = document.getElementById("athleteSelect").value;
    if (id) renderProfile();
  };

  /* --- View all saved test dates --- */
  window.viewSavedTests = function () {
    var h = getTestHistory();
    var athleteIds = Object.keys(h);
    var D = window.CLUB;

    // Collect unique test labels/dates across all athletes
    var testMap = {}; // "label|date" -> { label, date, count, athletes[] }
    for (var i = 0; i < athleteIds.length; i++) {
      var aid = athleteIds[i];
      var entries = h[aid];
      for (var j = 0; j < entries.length; j++) {
        var e = entries[j];
        var key = e.label + "|" + e.date;
        if (!testMap[key]) {
          testMap[key] = {
            label: e.label,
            date: e.date,
            count: 0,
            athletes: [],
            athleteDetails: [],
          };
        }
        testMap[key].count++;
        var found = D.athletes.find(function (x) { return x.id === aid; });
        var aName = found ? found.name : aid;
        testMap[key].athletes.push(aName);
        // Count non-null metrics for this athlete's entry
        var mCount = 0;
        for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
          var v = e.values[TEST_METRIC_KEYS[mk].jsonKey];
          if (v !== null && v !== undefined) mCount++;
        }
        testMap[key].athleteDetails.push({ name: aName, id: aid, metrics: mCount, values: e.values });
      }
    }

    var tests = Object.values(testMap).sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });

    var totalEntries = 0;
    for (var t = 0; t < tests.length; t++) totalEntries += tests[t].count;

    // Build test cards
    var cards = '';
    for (var ci = 0; ci < tests.length; ci++) {
      var test = tests[ci];
      var safeDate = esc(test.date);
      var safeLabel = esc(test.label);
      var escapedDate = test.date.replace(/'/g, "\\'");
      var escapedLabel = test.label.replace(/'/g, "\\'");
      cards += '<div class="th-card" data-idx="' + ci + '">';
      cards += '<div class="th-card-header">';
      cards += '<div class="th-card-title">';
      cards += '<span class="th-label">' + safeLabel + '</span>';
      cards += '<span class="th-date">' + safeDate + '</span>';
      cards += '</div>';
      cards += '<div class="th-card-stats">';
      cards += '<span class="th-stat"><strong>' + test.count + '</strong> athlete' + (test.count !== 1 ? 's' : '') + '</span>';
      cards += '</div>';
      cards += '</div>';
      cards += '<div class="th-card-actions">';
      cards += '<button class="btn btn-xs" onclick="toggleTestDetail(' + ci + ')" title="View athlete details">👤 Details</button>';
      cards += '<button class="btn btn-xs" onclick="renameTestDate(\'' + escapedDate + "','" + escapedLabel + '\')" title="Rename this test">✏️ Rename</button>';
      cards += '<button class="btn btn-xs" onclick="exportSingleTest(\'' + escapedDate + "','" + escapedLabel + '\')" title="Export this test as JSON">📤 Export</button>';
      cards += '<button class="btn btn-xs btn-muted" onclick="deleteBulkTestEntry(\'' + escapedDate + "','" + escapedLabel + '\')" title="Delete this test for all athletes">🗑 Delete</button>';
      cards += '</div>';
      // Expandable detail
      cards += '<div class="th-detail" id="thDetail' + ci + '" style="display:none">';
      cards += '<table class="th-detail-table"><thead><tr><th>Athlete</th>';
      for (var hk = 0; hk < TEST_METRIC_KEYS.length; hk++) {
        cards += '<th>' + TEST_METRIC_KEYS[hk].label + '</th>';
      }
      cards += '</tr></thead><tbody>';
      for (var ai = 0; ai < test.athleteDetails.length; ai++) {
        var ad = test.athleteDetails[ai];
        cards += '<tr><td><strong>' + esc(ad.name) + '</strong></td>';
        for (var vk = 0; vk < TEST_METRIC_KEYS.length; vk++) {
          var val = ad.values[TEST_METRIC_KEYS[vk].jsonKey];
          cards += '<td class="num">' + (val !== null && val !== undefined ? val : '<span class="na">—</span>') + '</td>';
        }
        cards += '</tr>';
      }
      cards += '</tbody></table></div>';
      cards += '</div>';
    }

    var emptyState = athleteIds.length === 0
      ? '<div class="th-empty"><div class="th-empty-icon">📊</div><h3>No Test History Yet</h3><p>Save your first test baseline to start tracking athlete progress over time.</p><button class="btn btn-primary" onclick="document.querySelector(\'.test-history-modal\').remove(); saveAllAsTestDate()">📅 Save Current Team Data</button></div>'
      : '';

    var bodyHTML =
      '<div class="th-modal-body">' +
      '<div class="th-modal-header">' +
      '<h2>📋 Test History Manager</h2>' +
      '<p class="th-summary">' +
      (tests.length > 0
        ? tests.length + ' test session' + (tests.length !== 1 ? 's' : '') + ' · ' + totalEntries + ' total entries · ' + athleteIds.length + ' athlete' + (athleteIds.length !== 1 ? 's' : '') + ' tracked'
        : '') +
      '</p>' +
      '</div>' +
      (tests.length > 0
        ? '<div class="th-toolbar">' +
          '<button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.test-history-modal\').remove(); saveAllAsTestDate()">📅 Save New Test Date</button>' +
          '<button class="btn btn-sm" onclick="exportTestHistoryOnly()">📤 Export All Test History</button>' +
          '<label class="btn btn-sm" style="cursor:pointer">📥 Import Test History<input type="file" accept=".json" onchange="importTestHistoryOnly(this)" style="display:none" /></label>' +
          '</div>'
        : '') +
      (emptyState || '<div class="th-card-list">' + cards + '</div>') +
      '<p class="th-footer-note">Test history is included in full JSON exports and restored on import.</p>' +
      '</div>';

    // Remove existing modal if open
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();

    // Show as a modal overlay
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay test-history-modal";
    overlay.innerHTML =
      '<div class="modal-content th-modal-content">' +
      '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      bodyHTML +
      '</div>';
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  };

  window.toggleTestDetail = function (idx) {
    var el = document.getElementById('thDetail' + idx);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.renameTestDate = function (date, oldLabel) {
    var newLabel = prompt('Rename test "' + oldLabel + '" (' + date + '):', oldLabel);
    if (newLabel === null || !newLabel.trim() || newLabel.trim() === oldLabel) return;
    newLabel = newLabel.trim();
    var h = getTestHistory();
    var ids = Object.keys(h);
    var renamed = 0;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === oldLabel) {
          h[ids[i]][j].label = newLabel;
          renamed++;
        }
      }
    }
    setTestHistory(h);
    showToast('Renamed to "' + newLabel + '" (' + renamed + ' entries)', 'success');
    viewSavedTests(); // refresh modal
    var pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
  };

  window.exportSingleTest = function (date, label) {
    var h = getTestHistory();
    var D = window.CLUB;
    var exportObj = { source: 'BC Personal Fitness Club — Test Export', exportDate: new Date().toISOString(), testDate: date, testLabel: label, entries: [] };
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          var found = D.athletes.find(function (x) { return x.id === ids[i]; });
          exportObj.entries.push({ athleteId: ids[i], athleteName: found ? found.name : ids[i], date: date, label: label, values: h[ids[i]][j].values });
        }
      }
    }
    var json = JSON.stringify(exportObj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'test_' + label.replace(/\s+/g, '_').toLowerCase() + '_' + date + '.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
    showToast('Exported "' + label + '" — ' + exportObj.entries.length + ' athletes', 'success');
  };

  window.exportTestHistoryOnly = function () {
    var h = getTestHistory();
    if (Object.keys(h).length === 0) { showToast('No test history to export.', 'warn'); return; }
    var D = window.CLUB;
    // Enrich with athlete names for readability
    var exportObj = { source: 'BC Personal Fitness Club — Full Test History', exportDate: new Date().toISOString(), test_history: h, athlete_names: {} };
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      var found = D.athletes.find(function (x) { return x.id === ids[i]; });
      if (found) exportObj.athlete_names[ids[i]] = found.name;
    }
    var json = JSON.stringify(exportObj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'test_history_' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 10000);
    showToast('Exported full test history — ' + ids.length + ' athletes', 'success');
  };

  window.importTestHistoryOnly = function (inputEl) {
    var file = inputEl.files && inputEl.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var histData = null;

        // Support full export format
        if (data.test_history && typeof data.test_history === 'object') {
          histData = data.test_history;
        }
        // Support single-test export format
        else if (data.entries && Array.isArray(data.entries)) {
          histData = {};
          for (var i = 0; i < data.entries.length; i++) {
            var en = data.entries[i];
            if (!histData[en.athleteId]) histData[en.athleteId] = [];
            histData[en.athleteId].push({ date: en.date, label: en.label, values: en.values });
          }
        }

        if (!histData || Object.keys(histData).length === 0) {
          showToast('No test history found in this file.', 'error');
          inputEl.value = '';
          return;
        }

        var incoming = Object.keys(histData);
        var mode = confirm(
          'Found test data for ' + incoming.length + ' athlete(s) in "' + file.name + '".\n\n' +
          'OK = Merge with existing history\nCancel = Replace all existing history'
        );

        if (mode) {
          // Merge
          var h = getTestHistory();
          for (var ai = 0; ai < incoming.length; ai++) {
            var aid = incoming[ai];
            if (!h[aid]) h[aid] = [];
            var newEntries = histData[aid];
            for (var ni = 0; ni < newEntries.length; ni++) {
              var ne = newEntries[ni];
              // Skip duplicates
              var exists = false;
              for (var ei = 0; ei < h[aid].length; ei++) {
                if (h[aid][ei].date === ne.date && h[aid][ei].label === ne.label) { exists = true; break; }
              }
              if (!exists) h[aid].push(ne);
            }
          }
          setTestHistory(h);
          showToast('Merged test history from ' + file.name, 'success');
        } else {
          // Replace
          setTestHistory(histData);
          showToast('Replaced test history from ' + file.name, 'success');
        }

        // Refresh
        viewSavedTests();
        var pid = document.getElementById("athleteSelect").value;
        if (pid) renderProfile();
      } catch (err) {
        console.error('Import test history error:', err);
        showToast('Import failed: ' + err.message, 'error');
      }
      inputEl.value = '';
    };
    reader.readAsText(file);
  };

  window.deleteBulkTestEntry = function (date, label) {
    if (
      !confirm(
        'Delete all "' + label + '" (' + date + ") entries for every athlete?",
      )
    )
      return;
    var h = getTestHistory();
    var count = 0;
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      var before = h[ids[i]].length;
      h[ids[i]] = h[ids[i]].filter(function (e) {
        return !(e.date === date && e.label === label);
      });
      count += before - h[ids[i]].length;
      if (h[ids[i]].length === 0) delete h[ids[i]];
    }
    setTestHistory(h);
    showToast("Deleted " + count + ' entries for "' + label + '"', "info");
    // Close and re-open to refresh
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
    viewSavedTests();
    // Refresh profile if open
    var pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
  };

  /* ========== LEADERBOARDS ========== */
  window.renderLeaderboards = function () {
    const D = window.CLUB;
    const metric = document.getElementById("lbMetric").value;
    const posFilter = document.getElementById("lbPosFilter").value;
    const grpFilter = document.getElementById("lbGroupFilter").value;

    const entries = [];
    for (const a of D.athletes) {
      if (posFilter !== "all" && a.position !== posFilter) continue;
      if (grpFilter !== "all" && a.group !== grpFilter) continue;
      const val = a[metric];
      if (val !== null && val !== undefined) {
        entries.push({
          name: a.name,
          position: a.position || "—",
          val,
          id: a.id,
        });
      }
    }

    if (metric === "forty") entries.sort((a, b) => a.val - b.val);
    else entries.sort((a, b) => b.val - a.val);
    const top = entries.slice(0, 15);

    const tbody = document.querySelector("#lbTable tbody");
    tbody.innerHTML = top
      .map(
        (e, i) => `
      <tr class="clickable" tabindex="0" role="button" onclick="selectAthlete('${e.id}')" onkeydown="if(event.key==='Enter')selectAthlete('${e.id}')">
        <td class="num">${i + 1}</td>
        <td><strong>${esc(e.name)}</strong></td>
        <td>${esc(e.position)}</td>
        <td class="num">${typeof e.val === "number" ? (Number.isInteger(e.val) ? e.val : e.val.toFixed(2)) : e.val}</td>
      </tr>
    `,
      )
      .join("");

    if (lbChartInstance) {
      lbChartInstance.destroy();
      lbChartInstance = null;
    }
    const canvas = document.getElementById("lbChart");
    if (typeof Chart === "undefined") {
      canvas.parentElement.innerHTML =
        '<p class="placeholder-text">Charts unavailable (Chart.js failed to load)</p>';
      return;
    }
    const colors = top.map((_, i) =>
      i === 0
        ? "#a78bfa"
        : i === 1
          ? "#b8a4fb"
          : i === 2
            ? "#c9bdfc"
            : "rgba(167,139,250,.45)",
    );

    const mi = METRIC_INFO[metric];
    const chartLabel = mi ? mi.name + " (" + mi.unit + ")" : metric;

    lbChartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels: top.map((e) => e.name),
        datasets: [
          {
            label: chartLabel,
            data: top.map((e) => e.val),
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: { color: "#8b90a0", font: { size: 10 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#e4e6ed", font: { size: 11, weight: "600" } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1a1d27",
            titleColor: "#e4e6ed",
            bodyColor: "#e4e6ed",
            borderColor: "#2e3345",
            borderWidth: 1,
            callbacks: {
              title: (items) => items[0].label,
              label: (ctx) => {
                const val =
                  typeof ctx.raw === "number"
                    ? Number.isInteger(ctx.raw)
                      ? ctx.raw
                      : ctx.raw.toFixed(2)
                    : ctx.raw;
                return (
                  (mi ? mi.name : metric) +
                  ": " +
                  val +
                  (mi ? " " + mi.unit : "")
                );
              },
              afterLabel: () => {
                if (!mi) return "";
                return mi.tellsYou;
              },
            },
          },
        },
      },
    });
  };

  /* ========== SPRINT ANALYSIS ========== */
  function renderSprintAnalysis() {
    const D = window.CLUB;
    const tbody = document.querySelector("#sprintTable tbody");
    const sprinters = D.athletes.filter((a) => a.sprint020 !== null);

    tbody.innerHTML = sprinters
      .map(
        (a) => `
      <tr class="clickable" tabindex="0" role="button" onclick="selectAthlete('${a.id}')" onkeydown="if(event.key==='Enter')selectAthlete('${a.id}')">
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.position) || "—"}</td>
        ${tdNum(a.massKg, 1)}
        ${tdNum(a.sprint020, 2)}
        ${tdNum(a.sprint2030, 2)}
        ${tdNum(a.sprint3040, 2)}
        ${tdGraded(a.forty, 2, a.grades.forty)}
        ${tdNum(a.v1, 2)}
        ${tdNum(a.v2, 2)}
        ${tdNum(a.v3, 2)}
        ${tdGraded(a.vMax, 2, a.grades.vMax)}
        ${tdGraded(a.v10Max, 2, a.grades.v10Max)}
        ${tdNum(a.topMph, 1)}
        ${tdNum(a.a1, 2)}
        ${tdNumColored(a.a2, 2)}
        ${tdNumColored(a.a3, 2)}
        ${tdGraded(a.F1, 1, a.grades.F1)}
        ${tdNumColored(a.F2, 1)}
        ${tdNumColored(a.F3, 1)}
        ${tdGraded(a.momMax, 1, a.grades.momMax)}
        ${tdNum(a.mom1, 1)}
        ${tdNum(a.pow1, 0)}
        ${tdNumColored(a.pow2, 0)}
        ${tdNumColored(a.pow3, 0)}
      </tr>
    `,
      )
      .join("");

    if (sprinters.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="24" class="placeholder-text">No sprint data available.</td></tr>';
    }
  }

  /* ========== STRENGTH & POWER ========== */
  function renderStrengthPower() {
    const D = window.CLUB;
    const tbody = document.querySelector("#strengthTable tbody");
    const list = D.athletes.filter(
      (a) =>
        a.bench !== null ||
        a.squat !== null ||
        a.peakPower !== null ||
        a.medball !== null,
    );

    tbody.innerHTML = list
      .map(
        (a) => `
      <tr class="clickable" tabindex="0" role="button" onclick="selectAthlete('${a.id}')" onkeydown="if(event.key==='Enter')selectAthlete('${a.id}')">
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.position) || "—"}</td>
        ${tdNum(a.weight)}
        ${tdNum(a.massKg, 1)}
        ${tdGraded(a.bench, 0, a.grades.bench)}
        ${tdGraded(a.squat, 0, a.grades.squat)}
        ${tdGraded(a.relBench, 2, a.grades.relBench)}
        ${tdGraded(a.relSquat, 2, a.grades.relSquat)}
        ${tdGraded(a.vert, 1, a.grades.vert)}
        ${tdGraded(a.peakPower, 0, a.grades.peakPower)}
        ${tdGraded(a.relPeakPower, 1, a.grades.relPeakPower)}
        ${tdGraded(a.medball, 0, a.grades.medball)}
        ${tdGraded(a.mbRel, 2, a.grades.mbRel)}
        ${tdNum(a.strengthUtil, 3)}
      </tr>
    `,
      )
      .join("");

    if (list.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="14" class="placeholder-text">No strength data available.</td></tr>';
    }
  }

  /* ========== SCORECARD ========== */
  window.renderScorecard = function () {
    const D = window.CLUB;
    const filter = document.getElementById("scorecardFilter").value;
    let list = D.athletes;
    if (filter !== "all") list = list.filter((a) => a.id === filter);

    // Only show athletes with at least one scorecard entry
    list = list.filter((a) => Object.keys(a.scorecard).length > 0);

    if (list.length === 0) {
      document.querySelector("#scorecardTable tbody").innerHTML =
        '<tr><td colspan="20" class="placeholder-text">No scorecard data available.</td></tr>';
      return;
    }

    const metrics = D.scorecardMetrics;
    const header = document.getElementById("scorecardHeader");
    header.innerHTML =
      "<th>Athlete</th><th>Pos</th><th>Group</th>" +
      metrics
        .map((m) => {
          const mi = METRIC_INFO[m.key];
          const tip = mi
            ? mi.measures + ". " + mi.tellsYou
            : m.label + " (" + m.unit + ")";
          return `<th title="${tip}">${m.label}</th>`;
        })
        .join("");

    const tbody = document.querySelector("#scorecardTable tbody");
    tbody.innerHTML = list
      .map((a) => {
        const cells = metrics
          .map((m) => {
            const sc = a.scorecard[m.key];
            if (!sc) return '<td class="na">—</td>';
            const mi = METRIC_INFO[m.key];
            const absGrade = a.grades[m.key];
            const absTip = absGrade ? " | HS Standard: " + absGrade.label : "";
            const tip = mi
              ? `${mi.name}: ${sc.value} ${m.unit} — ${sc.percentile}th percentile (${sc.tier})${absTip}. ${mi.tellsYou}`
              : `${sc.value} ${m.unit} — ${sc.percentile}th percentile`;
            return `<td class="sc-cell tier-bg-${sc.tier}" title="${tip}">
          <div class="sc-cell-val">${typeof sc.value === "number" ? (Number.isInteger(sc.value) ? sc.value : sc.value.toFixed(2)) : sc.value}</div>
          <div class="sc-cell-pct">${sc.percentile}<small>th</small>${absGrade ? ' <span class="grade-badge grade-bg-' + absGrade.tier + '" style="font-size:.5rem;padding:.08rem .3rem">' + absGrade.label + "</span>" : ""}</div>
        </td>`;
          })
          .join("");
        return `<tr>
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.position) || "—"}</td>
        <td><span class="group-tag group-${a.group.replace(/\s/g, "")}">${esc(a.group)}</span></td>
        ${cells}
      </tr>`;
      })
      .join("");
  };

  /* ========== PERFORMANCE STANDARDS ========== */
  window.renderBenchmarks = function () {
    const D = window.CLUB;
    const gFilter = document.getElementById("bmGroup").value;
    const mFilter = document.getElementById("bmMetric").value;
    const container = document.getElementById("benchmarksContent");
    const STD = D.hsStandards;

    const groups =
      gFilter === "all" ? ["Skill", "Big Skill", "Linemen"] : [gFilter];
    const metricMeta = STD._meta;
    const shownMetrics =
      mFilter === "all"
        ? metricMeta
        : metricMeta.filter((m) => m.key === mFilter);

    let html = "";

    // Grade legend
    html += `<div class="grade-legend">
      <span class="grade-badge grade-bg-elite">Elite</span>
      <span class="grade-badge grade-bg-excellent">Excellent</span>
      <span class="grade-badge grade-bg-good">Good</span>
      <span class="grade-badge grade-bg-average">Average</span>
      <span class="grade-badge grade-bg-below">Below Avg</span>
    </div>`;

    for (const g of groups) {
      const gs = STD[g];
      if (!gs) continue;
      const groupAthletes = D.athletes.filter((a) => a.group === g);
      const groupLabel =
        g === "Skill"
          ? "Skill (RB/WR/DB)"
          : g === "Big Skill"
            ? "Big Skill (QB/TE/LB)"
            : "Linemen (OL/DL)";

      html += `<div class="standards-group"><h3>${groupLabel} <small>(n=${groupAthletes.length})</small></h3>`;

      // Standards reference table
      html += `<div class="benchmark-table-wrap"><table class="data-table standards-ref-table"><thead><tr>
        <th>Metric</th>
        <th class="std-tier-header" style="color:var(--green)">Elite</th>
        <th class="std-tier-header" style="color:var(--blue)">Excellent</th>
        <th class="std-tier-header" style="color:var(--yellow)">Good</th>
        <th class="std-tier-header" style="color:var(--orange)">Average</th>
        <th class="std-tier-header" style="color:var(--red)">Below Avg</th>
        <th>Team Avg</th>
        <th>Grade Distribution</th>
      </tr></thead><tbody>`;

      for (const mm of shownMetrics) {
        const thresholds = gs[mm.key];
        if (!thresholds) continue;
        const athKey = mm.key;
        const vals = groupAthletes
          .map((a) => a[athKey])
          .filter((v) => v !== null);
        const avg = vals.length
          ? vals.reduce((s, v) => s + v, 0) / vals.length
          : null;
        const avgStr =
          avg !== null
            ? mm.unit === "xBW" || mm.unit === "in/lb"
              ? avg.toFixed(2)
              : mm.unit === "s" || mm.unit === "m/s" || mm.unit === "W/kg"
                ? avg.toFixed(1)
                : Math.round(avg)
            : "—";

        // Count athletes per tier
        const tierCounts = {
          elite: 0,
          excellent: 0,
          good: 0,
          average: 0,
          below: 0,
        };
        for (const a of groupAthletes) {
          const g2 = a.grades[athKey];
          if (g2) tierCounts[g2.tier]++;
        }
        const tested = Object.values(tierCounts).reduce((s, v) => s + v, 0);

        // Grade distribution bar
        const distBar =
          tested > 0
            ? `<div class="dist-bar">
          ${tierCounts.elite ? `<div class="dist-seg dist-elite" style="flex:${tierCounts.elite}" title="Elite: ${tierCounts.elite}">${tierCounts.elite}</div>` : ""}
          ${tierCounts.excellent ? `<div class="dist-seg dist-excellent" style="flex:${tierCounts.excellent}" title="Excellent: ${tierCounts.excellent}">${tierCounts.excellent}</div>` : ""}
          ${tierCounts.good ? `<div class="dist-seg dist-good" style="flex:${tierCounts.good}" title="Good: ${tierCounts.good}">${tierCounts.good}</div>` : ""}
          ${tierCounts.average ? `<div class="dist-seg dist-average" style="flex:${tierCounts.average}" title="Average: ${tierCounts.average}">${tierCounts.average}</div>` : ""}
          ${tierCounts.below ? `<div class="dist-seg dist-below" style="flex:${tierCounts.below}" title="Below Avg: ${tierCounts.below}">${tierCounts.below}</div>` : ""}
        </div>`
            : '<span class="na">—</span>';

        const op = mm.invert ? "≤" : "≥";
        const belowOp = mm.invert ? ">" : "<";

        html += `<tr>
          <td><strong>${mm.label}</strong> <small>(${mm.unit})</small></td>
          <td class="num std-value grade-text-elite">${op}${thresholds[0]}</td>
          <td class="num std-value grade-text-excellent">${op}${thresholds[1]}</td>
          <td class="num std-value grade-text-good">${op}${thresholds[2]}</td>
          <td class="num std-value grade-text-average">${op}${thresholds[3]}</td>
          <td class="num std-value grade-text-below">${belowOp}${thresholds[3]}</td>
          <td class="num">${avgStr}</td>
          <td>${distBar}</td>
        </tr>`;
      }
      html += "</tbody></table></div>";

      // Athlete grade cards (when filtering to single metric)
      if (mFilter !== "all") {
        const athKey = mFilter;
        const mm = metricMeta.find((m) => m.key === mFilter);
        const sorted = groupAthletes
          .filter((a) => a[athKey] !== null)
          .sort((a, b) =>
            mm?.invert ? a[athKey] - b[athKey] : b[athKey] - a[athKey],
          );

        if (sorted.length > 0) {
          html += '<div class="std-athlete-list">';
          for (const a of sorted) {
            const grade = a.grades[athKey];
            html += `<div class="std-athlete-row">
              <span class="std-athlete-name">${esc(a.name)}</span>
              <span class="std-athlete-val">${typeof a[athKey] === "number" ? (Number.isInteger(a[athKey]) ? a[athKey] : a[athKey].toFixed(2)) : a[athKey]} ${mm ? mm.unit : ""}</span>
              <span class="std-athlete-tier">${grade ? gradeBadge(grade) : '<span class="na">—</span>'}</span>
            </div>`;
          }
          html += "</div>";
        }
      }

      // Team grade summary cards (when showing all metrics)
      if (mFilter === "all") {
        html += '<div class="std-summary-row">';
        for (const a of groupAthletes.sort((x, y) => {
          const sx = x.overallGrade ? x.overallGrade.score : 0;
          const sy = y.overallGrade ? y.overallGrade.score : 0;
          return sy - sx;
        })) {
          const og = a.overallGrade;
          if (!og) continue;
          const gradeChips = Object.entries(a.grades)
            .map(([k, g]) => {
              const mm2 = metricMeta.find((m) => m.key === k);
              return `<span class="grade-chip grade-bg-${g.tier}" title="${mm2 ? mm2.label : k}: ${g.label}">${mm2 ? mm2.label.substring(0, 6) : k}</span>`;
            })
            .join("");
          html += `<div class="grade-summary-card">
            <div class="grade-summary-header">
              <strong>${esc(a.name)}</strong> <small>${esc(a.position) || ""}</small>
              <span class="grade-badge grade-bg-${og.tier}" style="margin-left:auto">${og.label} (${og.score})</span>
            </div>
            <div class="grade-chips-row">${gradeChips}</div>
          </div>`;
        }
        html += "</div>";
      }

      html += "</div>";
    }

    container.innerHTML =
      html || '<p class="placeholder-text">No standards data available.</p>';
  };

  /* ========== TESTING LOG ========== */
  window.renderTestingLog = function () {
    const D = window.CLUB;
    const filter = document.getElementById("logFilter").value;
    let log = D.testingLog;
    if (filter !== "all") log = log.filter((e) => e.test === filter);

    const tbody = document.querySelector("#logTable tbody");
    tbody.innerHTML = log
      .map((e) => {
        let result = "";
        if (e.test === "Sprint") {
          const parts = [];
          if (e.sprint020 != null) parts.push(`0–20: ${e.sprint020}s`);
          if (e.sprint2030 != null) parts.push(`20–30: ${e.sprint2030}s`);
          if (e.sprint3040 != null) parts.push(`30–40: ${e.sprint3040}s`);
          result = parts.join(" | ") || "—";
        } else if (e.test === "Jump") {
          const parts = [];
          if (e.vert) parts.push(`VJ: ${e.vert} in`);
          if (e.broad) parts.push(`BJ: ${e.broad} in`);
          result = parts.join(" | ") || "—";
        } else if (e.test === "Strength") {
          const parts = [];
          if (e.bench) parts.push(`Bench: ${e.bench} lb`);
          if (e.squat) parts.push(`Squat: ${e.squat} lb`);
          result = parts.join(" | ") || "—";
        } else if (e.test === "Med Ball") {
          result =
            e.medball != null
              ? `MB: ${e.medball} in (${fmtHeight(e.medball)})`
              : "—";
        }

        return `<tr>
        <td data-sort-value="${e.date || ""}">${formatLogDate(e.date)}</td>
        <td><strong>${esc(e.name)}</strong></td>
        <td><span class="test-type-badge test-${(e.test || "Unknown").replace(/\s/g, "")}">${esc(e.test) || "Unknown"}</span></td>
        <td>${result}</td>
        <td>${esc(e.location) || ""}</td>
      </tr>`;
      })
      .join("");
  };

  /* ========== TESTING WEEK PLAN ========== */
  function renderTestingWeekPlan() {
    const D = window.CLUB;
    const container = document.getElementById("planContent");

    if (!D.testingWeekPlan || D.testingWeekPlan.length === 0) {
      container.innerHTML =
        '<p class="placeholder-text">No testing week plan available.</p>';
      return;
    }

    container.innerHTML = D.testingWeekPlan
      .map(
        (day) => `
      <div class="plan-day-card">
        <div class="plan-day-header">
          <span class="plan-day-num">Day ${day.day}</span>
          <span class="plan-day-label">${esc(day.label)}</span>
          <span class="plan-day-focus">${esc(day.focus)}</span>
        </div>
        <div class="plan-day-body">
          <div class="plan-section">
            <strong>Tests:</strong>
            <ul>${(day.tests || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          </div>
          <div class="plan-section">
            <strong>Equipment:</strong> ${esc(day.equipment)}
          </div>
          <div class="plan-section">
            <strong>Warm-Up Protocol:</strong> ${esc(day.warm_up)}
          </div>
          <div class="plan-section plan-notes">
            <strong>Notes:</strong> ${esc(day.notes)}
          </div>
        </div>
      </div>
    `,
      )
      .join("");
  }

  /* ========== CONSTANTS REFERENCE ========== */
  function renderConstants() {
    const D = window.CLUB;
    const grid = document.getElementById("constantsGrid");
    const notes = document.getElementById("formulaNotes");

    const constDefs = [
      { key: "LB_TO_KG", unit: "kg/lb", desc: "Pounds to kilograms" },
      { key: "IN_TO_CM", unit: "cm/in", desc: "Inches to centimeters" },
      { key: "TEN_YD_M", unit: "m", desc: "10 yards in meters" },
      { key: "TWENTY_YD_M", unit: "m", desc: "20 yards in meters" },
      { key: "G", unit: "m/s²", desc: "Gravity constant" },
      { key: "SAYERS_A", unit: "", desc: "Sayers VJ coefficient" },
      { key: "SAYERS_B", unit: "", desc: "Sayers mass coefficient" },
      { key: "SAYERS_C", unit: "W", desc: "Sayers constant term" },
    ];

    grid.innerHTML = constDefs
      .map(
        (c) => `
      <div class="const-item">
        <span class="const-name">${c.key}</span>
        <span class="const-val">${D.constants[c.key]}</span>
        <span class="const-unit">${c.unit}</span>
        <span class="const-desc">${c.desc}</span>
      </div>
    `,
      )
      .join("");

    notes.innerHTML = `
      <h4>Derived Sprint Formulas</h4>
      <ul>
        <li><strong>Velocity:</strong> v = distance / time (segment distances: 0–20yd = 18.288m, 20–30/30–40 = 9.144m)</li>
        <li><strong>Acceleration:</strong> a₁ = v₁/t₁ (from rest); a₂ = (v₂−v₁)/t₂; a₃ = (v₃−v₂)/t₃</li>
        <li><strong>Force:</strong> F = mass × acceleration (N)</li>
        <li><strong>Impulse:</strong> J = F × t (N·s)</li>
        <li><strong>Momentum:</strong> p = mass × velocity (kg·m/s). Peak Momentum uses the best 10-yard split velocity.</li>
        <li><strong>Power:</strong> P = F × v (W)</li>
      </ul>
      <h4>Derived Strength & Power</h4>
      <ul>
        <li><strong>Sayers Peak Power:</strong> P = 60.7 × VJ(cm) + 45.3 × mass(kg) − 2055</li>
        <li><strong>Relative Strength:</strong> Bench/BW or Squat/BW</li>
        <li><strong>Strength Utilisation:</strong> F₁ / (Squat_kg × g) — ratio of sprint force to max strength</li>
      </ul>
      <h4>Scoring</h4>
      <ul>
        <li><strong>Explosive Upper Index:</strong> 0.6 × z(MB_rel) + 0.4 × z(RelBench)</li>
        <li><strong>Total Explosive Index:</strong> 0.45 × ExplosiveUpper + 0.30 × z(PeakPower) + 0.25 × z(vMax)</li>
        <li><strong>Tiers:</strong> Elite ≥90th, Strong 75–90th, Solid 50–75th, Competitive 25–50th, Developing &lt;25th</li>
      </ul>
      <p style="margin-top:.75rem"><em>${D.notes.join(" ")}</em></p>
    `;
  }

  /* ========== SORTABLE TABLES ========== */
  function handleSort(table, col, th) {
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const isCurrentCol =
      th.classList.contains("sorted-asc") ||
      th.classList.contains("sorted-desc");
    const dir =
      isCurrentCol && th.classList.contains("sorted-asc") ? "desc" : "asc";
    table
      .querySelectorAll("thead th")
      .forEach((t) => t.classList.remove("sorted-asc", "sorted-desc"));
    th.classList.add(dir === "asc" ? "sorted-asc" : "sorted-desc");
    const colIdx = Array.from(th.parentElement.children).indexOf(th);

    rows.sort((a, b) => {
      // Prefer data-sort-value attribute for custom sort values (e.g. ISO dates)
      const aSortAttr = a.children[colIdx]?.getAttribute("data-sort-value");
      const bSortAttr = b.children[colIdx]?.getAttribute("data-sort-value");
      let aVal = aSortAttr ?? (a.children[colIdx]?.textContent.trim() || "");
      let bVal = bSortAttr ?? (b.children[colIdx]?.textContent.trim() || "");
      if (aVal === "—") aVal = "";
      if (bVal === "—") bVal = "";
      const aNum = parseFloat(aVal.replace(/[^0-9.\-+]/g, ""));
      const bNum = parseFloat(bVal.replace(/[^0-9.\-+]/g, ""));
      if (!isNaN(aNum) && !isNaN(bNum))
        return dir === "asc" ? aNum - bNum : bNum - aNum;
      if (aVal === "" && bVal !== "") return 1;
      if (bVal === "" && aVal !== "") return -1;
      return dir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
    const frag = document.createDocumentFragment();
    rows.forEach((r) => frag.appendChild(r));
    tbody.appendChild(frag);
  }

  /* ========== PRINT ========== */

  /* --- Print Profile (compact single-page layout) --- */
  window.printProfile = function () {
    const D = window.CLUB;
    const id = document.getElementById("athleteSelect").value;
    if (!id) {
      showToast("Select an athlete first.", "warn");
      return;
    }
    const a = D.athletes.find((x) => x.id === id);
    if (!a) {
      showToast("Athlete not found.", "error");
      return;
    }

    const og = a.overallGrade;
    const metrics = D.scorecardMetrics;

    // Helper: concise metric row
    function mRow(label, val, unit, grade) {
      const v = val !== null && val !== undefined ? val : "—";
      const u = v !== "—" ? unit || "" : "";
      const g = grade
        ? '<span class="print-grade print-grade-' +
          grade.tier +
          '">' +
          grade.label +
          "</span>"
        : "";
      return (
        "<tr><td>" +
        label +
        '</td><td class="num">' +
        v +
        " " +
        u +
        "</td><td>" +
        g +
        "</td></tr>"
      );
    }

    // Scorecard rows
    const scRows = Object.entries(a.scorecard)
      .map(([k, sc]) => {
        const label = metrics.find((m) => m.key === k)?.label || k;
        return (
          "<tr><td>" +
          label +
          '</td><td class="num">' +
          (typeof sc.value === "number"
            ? Number.isInteger(sc.value)
              ? sc.value
              : sc.value.toFixed(2)
            : sc.value) +
          '</td><td class="num">' +
          sc.percentile +
          'th</td><td><span class="print-tier print-tier-' +
          sc.tier +
          '">' +
          sc.tier.charAt(0).toUpperCase() +
          sc.tier.slice(1) +
          "</span></td></tr>"
        );
      })
      .join("");

    // Smart analysis
    const scEntries = Object.entries(a.scorecard);
    const sorted = scEntries
      .slice()
      .sort((a, b) => b[1].percentile - a[1].percentile);
    const strengths = sorted
      .slice(0, 3)
      .map(
        ([k, sc]) =>
          (metrics.find((m) => m.key === k)?.label || k) +
          " (" +
          sc.percentile +
          "th)",
      );
    const weaknesses = sorted
      .slice(-3)
      .reverse()
      .map(
        ([k, sc]) =>
          (metrics.find((m) => m.key === k)?.label || k) +
          " (" +
          sc.percentile +
          "th)",
      );

    const printHTML = `
    <div class="print-page print-profile-page">
      <div class="print-header-bar">
        <div class="print-logo">Burke Catholic Personal Fitness Club</div>
        <div class="print-date">Generated: ${new Date().toLocaleDateString()}</div>
      </div>
      <div class="print-athlete-header">
        <div class="print-avatar">${a.initials}</div>
        <div class="print-athlete-info">
          <div class="print-athlete-name">${esc(a.name)} ${og ? '<span class="print-grade print-grade-' + og.tier + '">' + og.label + " (" + og.score + ")</span>" : ""}</div>
          <div class="print-athlete-meta">
            ${esc(a.position) || "N/A"} &bull; ${esc(a.group)} &bull; ${a.height ? fmtHeight(a.height) : "—"} &bull; ${a.weight ? a.weight + " lb" : "—"}
          </div>
        </div>
      </div>

      <div class="print-columns">
        <div class="print-col">
          <h3 class="print-section">Strength</h3>
          <table class="print-metric-table">
            ${mRow("Bench 1RM", a.bench, "lb", a.grades.bench)}
            ${mRow("Squat 1RM", a.squat, "lb", a.grades.squat)}
            ${mRow("Rel Bench", a.relBench, "xBW", a.grades.relBench)}
            ${mRow("Rel Squat", a.relSquat, "xBW", a.grades.relSquat)}
          </table>
          <h3 class="print-section">Explosiveness</h3>
          <table class="print-metric-table">
            ${mRow("Med Ball", a.medball, "in", a.grades.medball)}
            ${mRow("Vertical", a.vert, "in", a.grades.vert)}
            ${mRow("Broad Jump", a.broad, "in", a.grades.broad)}
            ${mRow("Peak Power", a.peakPower, "W", a.grades.peakPower)}
          </table>
          <h3 class="print-section">Speed</h3>
          <table class="print-metric-table">
            ${mRow("40 yd", a.forty, "s", a.grades.forty)}
            ${mRow("Max Vel", a.vMax, "m/s", a.grades.vMax)}
            ${mRow("Sprint Force", a.F1, "N", a.grades.F1)}
            ${mRow("Peak Momentum", a.momMax, "kg·m/s", a.grades.momMax)}
          </table>
        </div>
        <div class="print-col">
          <h3 class="print-section">Percentile Scorecard</h3>
          <table class="print-metric-table print-sc-table">
            <thead><tr><th>Metric</th><th>Value</th><th>%ile</th><th>Tier</th></tr></thead>
            <tbody>${scRows || '<tr><td colspan="4">No scorecard data</td></tr>'}</tbody>
          </table>
          <h3 class="print-section">Analysis</h3>
          <div class="print-analysis">
            <div class="print-analysis-block">
              <strong>Top Strengths:</strong>
              <ul>${strengths.map((s) => "<li>" + s + "</li>").join("")}</ul>
            </div>
            <div class="print-analysis-block">
              <strong>Areas to Develop:</strong>
              <ul>${weaknesses.map((s) => "<li>" + s + "</li>").join("")}</ul>
            </div>
          </div>
        </div>
      </div>
      ${buildPrintProgressSection(a)}
      <div class="print-footer">Burke Catholic Personal Fitness Club &mdash; Confidential</div>
    </div>`;

    openPrintWindow(printHTML, esc(a.name) + " — Athlete Profile");
  };

  /* --- Print Scorecard (coach report with breakdown) --- */
  window.printScorecard = function () {
    const D = window.CLUB;
    const filter = document.getElementById("scorecardFilter").value;
    let list = D.athletes;
    if (filter !== "all") list = list.filter((a) => a.id === filter);
    list = list.filter((a) => Object.keys(a.scorecard).length > 0);
    if (list.length === 0) {
      showToast("No scorecard data to print.", "warn");
      return;
    }

    const metrics = D.scorecardMetrics;
    const isSingle = list.length === 1;

    // Build main table
    const headerCells =
      "<th>Athlete</th><th>Pos</th><th>Group</th>" +
      metrics.map((m) => "<th>" + m.label + "</th>").join("");
    const bodyRows = list
      .map((a) => {
        const cells = metrics
          .map((m) => {
            const sc = a.scorecard[m.key];
            if (!sc) return '<td class="na">—</td>';
            return (
              '<td class="print-sc-cell print-tier-bg-' +
              sc.tier +
              '">' +
              (typeof sc.value === "number"
                ? Number.isInteger(sc.value)
                  ? sc.value
                  : sc.value.toFixed(2)
                : sc.value) +
              "<br><small>" +
              sc.percentile +
              "th</small></td>"
            );
          })
          .join("");
        return (
          "<tr><td><strong>" +
          esc(a.name) +
          "</strong></td><td>" +
          (esc(a.position) || "—") +
          "</td><td>" +
          esc(a.group) +
          "</td>" +
          cells +
          "</tr>"
        );
      })
      .join("");

    // Smart Breakdown
    let analysisHTML = "";
    if (isSingle) {
      // Individual analysis
      const a = list[0];
      const og = a.overallGrade;
      const scArr = Object.entries(a.scorecard);
      const sorted = scArr
        .slice()
        .sort((x, y) => y[1].percentile - x[1].percentile);
      const top3 = sorted.slice(0, 3);
      const bot3 = sorted.slice(-3).reverse();
      const tierCounts = {
        elite: 0,
        strong: 0,
        solid: 0,
        competitive: 0,
        developing: 0,
      };
      scArr.forEach(([, sc]) => tierCounts[sc.tier]++);
      const avgPct =
        scArr.length > 0
          ? Math.round(
              scArr.reduce((s, [, sc]) => s + sc.percentile, 0) / scArr.length,
            )
          : 0;

      analysisHTML = `
      <div class="print-breakdown">
        <h3>Smart Breakdown: ${esc(a.name)}</h3>
        <div class="print-bd-grid">
          <div class="print-bd-card">
            <div class="print-bd-title">Overall Grade</div>
            <div class="print-bd-big ${og ? "print-grade-" + og.tier : ""}">${og ? og.label + " (" + og.score + "/5)" : "N/A"}</div>
            <div class="print-bd-sub">Avg Percentile: ${avgPct}th</div>
          </div>
          <div class="print-bd-card">
            <div class="print-bd-title">Top Strengths</div>
            <ul>${top3.map(([k, sc]) => "<li><strong>" + (metrics.find((m) => m.key === k)?.label || k) + "</strong> — " + sc.percentile + "th (" + sc.tier + ")</li>").join("")}</ul>
          </div>
          <div class="print-bd-card">
            <div class="print-bd-title">Priority Development</div>
            <ul>${bot3.map(([k, sc]) => "<li><strong>" + (metrics.find((m) => m.key === k)?.label || k) + "</strong> — " + sc.percentile + "th (" + sc.tier + ")</li>").join("")}</ul>
          </div>
          <div class="print-bd-card">
            <div class="print-bd-title">Tier Distribution</div>
            <table class="print-tier-dist">
              ${Object.entries(tierCounts)
                .filter(([, c]) => c > 0)
                .map(
                  ([t, c]) =>
                    '<tr><td><span class="print-tier print-tier-' +
                    t +
                    '">' +
                    t.charAt(0).toUpperCase() +
                    t.slice(1) +
                    "</span></td><td>" +
                    c +
                    "/" +
                    scArr.length +
                    "</td></tr>",
                )
                .join("")}
            </table>
          </div>
        </div>
        <div class="print-coaching-notes">
          <strong>Coaching Notes:</strong>
          <ul>
            ${avgPct >= 75 ? "<li>High-performing athlete across the board — focus on maintaining and leadership role.</li>" : ""}
            ${avgPct >= 50 && avgPct < 75 ? "<li>Solid foundation — targeted work on weaker metrics can push toward elite status.</li>" : ""}
            ${avgPct < 50 ? "<li>Developing athlete — establish baseline habits and focus on the 2-3 most impactful metrics.</li>" : ""}
            ${tierCounts.developing > 0 ? "<li>" + tierCounts.developing + " metric" + (tierCounts.developing > 1 ? "s" : "") + " in Developing tier — review programming for these areas.</li>" : ""}
            ${tierCounts.elite > 0 ? "<li>" + tierCounts.elite + " metric" + (tierCounts.elite > 1 ? "s" : "") + " at Elite level — athlete excels here.</li>" : ""}
          </ul>
        </div>
      </div>`;
    } else {
      // Team-level summary
      const tierTotals = {
        elite: 0,
        strong: 0,
        solid: 0,
        competitive: 0,
        developing: 0,
      };
      let totalEntries = 0;
      list.forEach((a) => {
        Object.values(a.scorecard).forEach((sc) => {
          tierTotals[sc.tier]++;
          totalEntries++;
        });
      });
      const teamAvgPct =
        totalEntries > 0
          ? Math.round(
              list.reduce(
                (s, a) =>
                  s +
                  Object.values(a.scorecard).reduce(
                    (ss, sc) => ss + sc.percentile,
                    0,
                  ),
                0,
              ) / totalEntries,
            )
          : 0;

      // Per-metric team averages
      const metricAvgs = metrics
        .map((m) => {
          const vals = list
            .map((a) => a.scorecard[m.key]?.percentile)
            .filter((v) => v !== undefined);
          const avg =
            vals.length > 0
              ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
              : null;
          return { label: m.label, avg };
        })
        .filter((x) => x.avg !== null)
        .sort((a, b) => b.avg - a.avg);

      // Top performers
      const byAvg = list
        .map((a) => {
          const scArr = Object.values(a.scorecard);
          const avg =
            scArr.length > 0
              ? Math.round(
                  scArr.reduce((s, sc) => s + sc.percentile, 0) / scArr.length,
                )
              : 0;
          return { name: a.name, avg, og: a.overallGrade };
        })
        .sort((a, b) => b.avg - a.avg);

      analysisHTML = `
      <div class="print-breakdown">
        <h3>Team Scorecard Analysis (n=${list.length})</h3>
        <div class="print-bd-grid">
          <div class="print-bd-card">
            <div class="print-bd-title">Team Overview</div>
            <div class="print-bd-big">${teamAvgPct}th</div>
            <div class="print-bd-sub">Average Percentile</div>
            <table class="print-tier-dist">
              ${Object.entries(tierTotals)
                .filter(([, c]) => c > 0)
                .map(
                  ([t, c]) =>
                    '<tr><td><span class="print-tier print-tier-' +
                    t +
                    '">' +
                    t.charAt(0).toUpperCase() +
                    t.slice(1) +
                    "</span></td><td>" +
                    c +
                    "/" +
                    totalEntries +
                    " (" +
                    Math.round((c / totalEntries) * 100) +
                    "%)</td></tr>",
                )
                .join("")}
            </table>
          </div>
          <div class="print-bd-card">
            <div class="print-bd-title">Strongest Metrics (Team)</div>
            <ol>${metricAvgs
              .slice(0, 5)
              .map((x) => "<li>" + x.label + " — avg " + x.avg + "th</li>")
              .join("")}</ol>
          </div>
          <div class="print-bd-card">
            <div class="print-bd-title">Weakest Metrics (Team)</div>
            <ol>${metricAvgs
              .slice(-5)
              .reverse()
              .map((x) => "<li>" + x.label + " — avg " + x.avg + "th</li>")
              .join("")}</ol>
          </div>
          <div class="print-bd-card">
            <div class="print-bd-title">Top Performers</div>
            <ol>${byAvg
              .slice(0, 5)
              .map(
                (x) =>
                  "<li>" +
                  esc(x.name) +
                  " — " +
                  x.avg +
                  "th avg" +
                  (x.og ? " (" + x.og.label + ")" : "") +
                  "</li>",
              )
              .join("")}</ol>
          </div>
        </div>
      </div>`;
    }

    const printHTML = `
    <div class="print-page print-scorecard-page">
      <div class="print-header-bar">
        <div class="print-logo">Burke Catholic Personal Fitness Club</div>
        <div class="print-date">Scorecard Report &mdash; ${new Date().toLocaleDateString()}</div>
      </div>
      <div class="print-tier-legend">
        <span class="print-tier print-tier-elite">Elite ≥90th</span>
        <span class="print-tier print-tier-strong">Strong 75–90th</span>
        <span class="print-tier print-tier-solid">Solid 50–75th</span>
        <span class="print-tier print-tier-competitive">Competitive 25–50th</span>
        <span class="print-tier print-tier-developing">Developing &lt;25th</span>
      </div>
      <div class="print-table-wrap">
        <table class="print-data-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      ${analysisHTML}
      <div class="print-footer">Burke Catholic Personal Fitness Club &mdash; Confidential Coach Report</div>
    </div>`;

    openPrintWindow(printHTML, "Scorecard Report");
  };

  /* --- Print progress section (for profile printout) --- */
  function buildPrintProgressSection(a) {
    var history = getAthleteHistory(a.id);
    if (history.length === 0) return "";
    var current = currentTestValues(a);
    var last = history[0]; // most recent
    var html =
      '<div class="print-progress" style="margin-top:10px;page-break-inside:avoid">';
    html +=
      '<h3 class="print-section">Progress vs ' +
      esc(last.label || last.date) +
      " (" +
      last.date +
      ")</h3>";
    html +=
      '<table class="print-metric-table" style="width:100%"><thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead><tbody>';
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      var mk = TEST_METRIC_KEYS[i];
      var cv = current[mk.jsonKey];
      var pv = last.values[mk.jsonKey];
      var changeStr = "—";
      if (cv !== null && cv !== undefined && pv !== null && pv !== undefined) {
        var d = cv - pv;
        var improved = mk.lower ? d < 0 : d > 0;
        var sign = d > 0 ? "+" : "";
        changeStr =
          (improved ? "▲ " : d === 0 ? "" : "▼ ") +
          sign +
          (Number.isInteger(d) ? d : d.toFixed(2)) +
          " " +
          mk.unit;
      }
      html +=
        "<tr><td>" +
        mk.label +
        '</td><td class="num">' +
        (cv !== null && cv !== undefined ? cv : "—") +
        '</td><td class="num">' +
        (pv !== null && pv !== undefined ? pv : "—") +
        '</td><td class="num">' +
        changeStr +
        "</td></tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  /* --- Shared print window opener --- */
  function openPrintWindow(bodyHTML, title) {
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) {
      showToast(
        "Pop-up blocked — please allow pop-ups for this site.",
        "error",
      );
      return;
    }
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; padding: 0.5in; font-size: 9pt; line-height: 1.35; }
  .print-page { max-width: 7.5in; margin: 0 auto; }
  .print-header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6c63ff; padding-bottom: 6px; margin-bottom: 10px; }
  .print-logo { font-weight: 800; font-size: 11pt; color: #6c63ff; }
  .print-date { font-size: 8pt; color: #666; }
  .print-footer { text-align: center; font-size: 7pt; color: #999; margin-top: 12px; padding-top: 6px; border-top: 1px solid #ddd; }

  /* Profile print */
  .print-athlete-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .print-avatar { width: 44px; height: 44px; border-radius: 50%; background: #6c63ff; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14pt; flex-shrink: 0; }
  .print-athlete-name { font-size: 13pt; font-weight: 800; }
  .print-athlete-meta { font-size: 8pt; color: #555; margin-top: 2px; }
  .print-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .print-section { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin: 8px 0 4px; }
  .print-metric-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .print-metric-table td, .print-metric-table th { padding: 2px 5px; border-bottom: 1px solid #eee; }
  .print-metric-table th { text-align: left; font-size: 7pt; text-transform: uppercase; color: #666; }
  .print-metric-table .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .print-sc-table thead th { font-size: 7pt; text-transform: uppercase; color: #666; border-bottom: 1px solid #bbb; }
  .print-analysis { font-size: 8pt; }
  .print-analysis-block { margin-bottom: 6px; }
  .print-analysis-block ul { margin-left: 14px; }
  .print-analysis-block li { margin-bottom: 1px; }

  /* Scorecard print */
  .print-tier-legend { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; font-size: 7pt; }
  .print-table-wrap { overflow: visible; }
  .print-data-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
  .print-data-table th, .print-data-table td { padding: 3px 4px; border: 1px solid #ccc; text-align: center; }
  .print-data-table th { background: #f0f0f0; font-size: 7pt; text-transform: uppercase; font-weight: 700; }
  .print-data-table td:first-child, .print-data-table td:nth-child(2), .print-data-table td:nth-child(3) { text-align: left; white-space: nowrap; }
  .print-data-table small { display: block; font-size: 6.5pt; color: #777; }
  .print-sc-cell { font-weight: 600; }

  /* Tier coloring */
  .print-tier { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 7pt; font-weight: 700; }
  .print-tier-elite { background: #d4edda; color: #155724; }
  .print-tier-strong { background: #cce5ff; color: #004085; }
  .print-tier-solid { background: #fff3cd; color: #856404; }
  .print-tier-competitive { background: #ffe0cc; color: #8a4500; }
  .print-tier-developing { background: #f8d7da; color: #721c24; }
  .print-tier-bg-elite { background: #d4edda; }
  .print-tier-bg-strong { background: #cce5ff; }
  .print-tier-bg-solid { background: #fff3cd; }
  .print-tier-bg-competitive { background: #ffe0cc; }
  .print-tier-bg-developing { background: #f8d7da; }

  /* Grade badges */
  .print-grade { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 7pt; font-weight: 700; vertical-align: middle; margin-left: 4px; }
  .print-grade-elite { background: #d4edda; color: #155724; }
  .print-grade-excellent { background: #cce5ff; color: #004085; }
  .print-grade-good { background: #fff3cd; color: #856404; }
  .print-grade-average { background: #ffe0cc; color: #8a4500; }
  .print-grade-below { background: #f8d7da; color: #721c24; }

  /* Breakdown cards */
  .print-breakdown { margin-top: 12px; page-break-inside: avoid; }
  .print-breakdown h3 { font-size: 10pt; margin-bottom: 8px; border-bottom: 1px solid #6c63ff; padding-bottom: 3px; color: #6c63ff; }
  .print-bd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .print-bd-card { border: 1px solid #ddd; border-radius: 4px; padding: 8px; }
  .print-bd-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #555; margin-bottom: 4px; }
  .print-bd-big { font-size: 18pt; font-weight: 800; margin-bottom: 2px; }
  .print-bd-sub { font-size: 7.5pt; color: #777; }
  .print-bd-card ul, .print-bd-card ol { margin-left: 14px; font-size: 8pt; }
  .print-bd-card li { margin-bottom: 2px; }
  .print-tier-dist { width: 100%; font-size: 8pt; margin-top: 6px; }
  .print-tier-dist td { padding: 1px 4px; }
  .print-coaching-notes { margin-top: 10px; border: 1px solid #e0d6ff; background: #f8f6ff; border-radius: 4px; padding: 8px; font-size: 8pt; }
  .print-coaching-notes ul { margin-left: 14px; margin-top: 4px; }
  .print-coaching-notes li { margin-bottom: 3px; }

  .na { color: #aaa; }
  @media print {
    body { padding: 0; }
    @page { size: ${bodyHTML.includes("print-scorecard-page") ? "landscape" : "portrait"}; margin: 0.4in; }
  }
</style></head><body>${bodyHTML}</body></html>`);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 400);
  }

  /* ========== HEAD-TO-HEAD COMPARISON ========== */
  let cmpChartInstance = null;

  window.renderComparison = function () {
    const D = window.CLUB;
    const container = document.getElementById("compareContent");
    const ids = [
      document.getElementById("cmpA").value,
      document.getElementById("cmpB").value,
      document.getElementById("cmpC").value,
    ].filter(Boolean);

    if (ids.length < 2) {
      container.innerHTML =
        '<p class="placeholder-text">Select two or three athletes to compare.</p>';
      return;
    }
    const athletes = ids
      .map((id) => D.athletes.find((a) => a.id === id))
      .filter(Boolean);
    if (athletes.length < 2) {
      container.innerHTML =
        '<p class="placeholder-text">Athletes not found.</p>';
      return;
    }

    const cols = athletes.length;
    const palette = ["#a78bfa", "#4ade80", "#60a5fa"];
    const paletteBg = [
      "rgba(167,139,250,.2)",
      "rgba(74,222,128,.2)",
      "rgba(96,165,250,.2)",
    ];

    // Profile cards
    let html = `<div class="cmp-profile-row cols-${cols}">`;
    for (const a of athletes) {
      html += `<div class="cmp-card">
        <div class="cmp-avatar">${a.initials}</div>
        <div class="cmp-name">${esc(a.name)}</div>
        <div class="cmp-meta">${esc(a.position) || "—"} · ${esc(a.group)} · ${a.weight || "—"} lb${a.overallGrade ? ' · <span class="grade-badge grade-bg-' + a.overallGrade.tier + '">' + a.overallGrade.label + "</span>" : ""}</div>
      </div>`;
    }
    html += "</div>";

    // Comparison metrics
    const cmpMetrics = [
      { key: "bench", label: "Bench 1RM", unit: "lb", dec: 0 },
      { key: "squat", label: "Squat 1RM", unit: "lb", dec: 0 },
      { key: "relBench", label: "Rel Bench", unit: "xBW", dec: 2 },
      { key: "relSquat", label: "Rel Squat", unit: "xBW", dec: 2 },
      { key: "medball", label: "Med Ball", unit: "in", dec: 0 },
      { key: "vert", label: "Vert Jump", unit: "in", dec: 1 },
      { key: "broad", label: "Broad Jump", unit: "in", dec: 0 },
      { key: "forty", label: "40 yd Dash", unit: "s", dec: 2, invert: true },
      { key: "vMax", label: "Max Velocity", unit: "m/s", dec: 2 },
      { key: "v10Max", label: "Best 10yd Vel", unit: "m/s", dec: 2 },
      { key: "F1", label: "Sprint Force", unit: "N", dec: 1 },
      { key: "momMax", label: "Peak Momentum", unit: "kg·m/s", dec: 1 },
      { key: "peakPower", label: "Peak Power", unit: "W", dec: 0 },
      { key: "relPeakPower", label: "Rel Peak Power", unit: "W/kg", dec: 1 },
    ];

    html +=
      '<div class="table-wrap"><table class="cmp-table"><thead><tr><th>Metric</th>';
    for (const a of athletes) html += `<th>${esc(a.name).split(" ")[0]}</th>`;
    html += "<th>Δ</th></tr></thead><tbody>";

    for (const m of cmpMetrics) {
      const vals = athletes.map((a) => a[m.key]);
      const numVals = vals.filter((v) => v !== null);
      let bestIdx = -1;
      let worstIdx = -1;
      if (numVals.length >= 2) {
        if (m.invert) {
          const best = Math.min(...numVals);
          const worst = Math.max(...numVals);
          if (best !== worst) {
            bestIdx = vals.indexOf(best);
            worstIdx = vals.indexOf(worst);
          }
        } else {
          const best = Math.max(...numVals);
          const worst = Math.min(...numVals);
          if (best !== worst) {
            bestIdx = vals.indexOf(best);
            worstIdx = vals.indexOf(worst);
          }
        }
      }
      const delta =
        numVals.length >= 2
          ? Math.abs(Math.max(...numVals) - Math.min(...numVals))
          : null;

      html += `<tr><td>${m.label} <small>(${m.unit})</small></td>`;
      for (let i = 0; i < athletes.length; i++) {
        const v = vals[i];
        const cls =
          i === bestIdx
            ? "cmp-best"
            : i === worstIdx && athletes.length > 2
              ? "cmp-worst"
              : "";
        html += `<td class="num ${cls}">${v !== null ? v.toFixed(m.dec) : "—"}</td>`;
      }
      html += `<td class="num">${delta !== null ? delta.toFixed(m.dec) : "—"}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table></div>";

    // Radar overlay
    html += '<div class="cmp-radar-wrap"><canvas id="cmpRadar"></canvas></div>';
    container.innerHTML = html;

    // Build overlaid radar chart
    if (cmpChartInstance) {
      cmpChartInstance.destroy();
      cmpChartInstance = null;
    }
    if (typeof Chart === "undefined") {
      document.getElementById("cmpRadar").parentElement.innerHTML =
        '<p class="placeholder-text">Charts unavailable (Chart.js failed to load)</p>';
      container.innerHTML = html;
      return;
    }
    const radarKeys = [
      "bench",
      "squat",
      "medball",
      "vert",
      "broad",
      "forty",
      "F1",
      "peakPower",
      "momMax",
    ];
    const radarLabels = radarKeys.map((k) => METRIC_INFO[k]?.name || k);

    function normVal(val, key) {
      return normMetric(val, key);
    }
    function normInv(val, key) {
      return normMetricInv(val, key);
    }

    const datasets = athletes.map((a, i) => ({
      label: a.name,
      data: [
        normVal(a.bench, "bench"),
        normVal(a.squat, "squat"),
        normVal(a.medball, "medball"),
        normVal(a.vert, "vert"),
        normVal(a.broad, "broad"),
        normInv(a.forty, "forty"),
        normVal(a.F1, "F1"),
        normVal(a.peakPower, "peakPower"),
        normVal(a.momMax, "momMax"),
      ],
      fill: true,
      backgroundColor: paletteBg[i],
      borderColor: palette[i],
      pointBackgroundColor: palette[i],
      pointBorderColor: "#fff",
      pointHoverRadius: 6,
    }));

    cmpChartInstance = new Chart(document.getElementById("cmpRadar"), {
      type: "radar",
      data: { labels: radarLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            grid: { color: "rgba(255,255,255,.08)" },
            angleLines: { color: "rgba(255,255,255,.08)" },
            pointLabels: {
              color: "#8b90a0",
              font: { size: 11, weight: "600" },
            },
          },
        },
        plugins: {
          legend: { labels: { color: "#e4e6ed", font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}% of team max`,
            },
          },
        },
      },
    });
  };

  /* ========== POSITION GROUP DASHBOARD ========== */
  window.renderGroupDashboard = function () {
    const D = window.CLUB;
    const container = document.getElementById("groupDashContent");
    const gFilter = document.getElementById("grpDash").value;
    const groups =
      gFilter === "all"
        ? ["Skill", "Big Skill", "Linemen", "Other"]
        : [gFilter];

    const summaryMetrics = [
      { key: "bench", label: "Avg Bench", unit: "lb", dec: 0 },
      { key: "squat", label: "Avg Squat", unit: "lb", dec: 0 },
      { key: "medball", label: "Avg MB", unit: "in", dec: 0 },
      { key: "vert", label: "Avg Vert", unit: "in", dec: 1 },
      { key: "forty", label: "Avg 40yd", unit: "s", dec: 2 },
      { key: "peakPower", label: "Avg PP", unit: "W", dec: 0 },
    ];

    let html = '<div class="grp-dashboard">';

    for (const g of groups) {
      const ga = D.athletes.filter((a) => a.group === g);
      if (ga.length === 0) continue;
      const groupLabels = {
        Skill: "Skill (RB/WR/DB)",
        "Big Skill": "Big Skill (QB/TE/LB)",
        Linemen: "Linemen (OL/DL)",
        Other: "Other",
      };

      html += `<div class="grp-panel">
        <div class="grp-panel-header">
          <span class="grp-panel-title">${groupLabels[g] || g}</span>
          <span class="grp-panel-count">${ga.length} athletes</span>
        </div>`;

      // Avg stats
      html += '<div class="grp-stats-grid">';
      for (const sm of summaryMetrics) {
        const vals = ga.map((a) => a[sm.key]).filter((v) => v !== null);
        const avg = vals.length
          ? vals.reduce((s, v) => s + v, 0) / vals.length
          : null;
        const best = vals.length
          ? sm.key === "forty"
            ? Math.min(...vals)
            : Math.max(...vals)
          : null;
        html += `<div class="grp-stat-card">
          <div class="grp-stat-label">${sm.label}</div>
          <div class="grp-stat-val">${avg !== null ? avg.toFixed(sm.dec) : "—"}<small> ${sm.unit}</small></div>
          <div class="grp-stat-sub">Best: ${best !== null ? best.toFixed(sm.dec) : "—"} · n=${vals.length}</div>
        </div>`;
      }
      html += "</div>";

      // Grade distribution
      const tierCounts = {
        elite: 0,
        excellent: 0,
        good: 0,
        average: 0,
        below: 0,
      };
      for (const a of ga) {
        if (a.overallGrade) tierCounts[a.overallGrade.tier]++;
      }
      const totalGraded = Object.values(tierCounts).reduce((s, v) => s + v, 0);
      if (totalGraded > 0) {
        html += '<div class="grp-grade-dist">';
        const tierLabels = {
          elite: "Elite",
          excellent: "Excellent",
          good: "Good",
          average: "Average",
          below: "Below Avg",
        };
        for (const [t, c] of Object.entries(tierCounts)) {
          if (c > 0) {
            html += `<span class="grade-badge grade-bg-${t}">${tierLabels[t]}: ${c}</span>`;
          }
        }
        html += "</div>";
      }

      // Top athletes by overall grade
      const ranked = ga
        .filter((a) => a.overallGrade)
        .sort((a, b) => b.overallGrade.score - a.overallGrade.score);
      if (ranked.length > 0) {
        html +=
          '<div style="margin-top:.75rem"><strong style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase">Top Athletes by Grade</strong>';
        for (let i = 0; i < Math.min(5, ranked.length); i++) {
          const a = ranked[i];
          html += `<div class="grp-top-athlete">
            <span class="grp-top-rank">#${i + 1}</span>
            <strong>${esc(a.name)}</strong>
            <span style="color:var(--text-muted);font-size:.75rem">${esc(a.position) || "—"}</span>
            <span class="grade-badge grade-bg-${a.overallGrade.tier}" style="margin-left:auto">${a.overallGrade.label} (${a.overallGrade.score})</span>
          </div>`;
        }
        html += "</div>";
      }

      // Weakest areas — find metrics where group avg grade is lowest
      const metricAvgGrades = [];
      for (const mm of D.hsStandards._meta) {
        const scores = ga
          .map((a) => a.grades[mm.key]?.score)
          .filter((v) => v !== undefined);
        if (scores.length > 0) {
          const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
          metricAvgGrades.push({ key: mm.key, label: mm.label, avg: avgScore });
        }
      }
      metricAvgGrades.sort((a, b) => a.avg - b.avg);
      if (metricAvgGrades.length > 0) {
        const weakest = metricAvgGrades.slice(0, 3);
        const strongest = metricAvgGrades.slice(-3).reverse();
        html += '<div class="grp-chart-row">';
        html +=
          '<div><strong style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase">⚠️ Weakest Areas</strong>';
        for (const m of weakest) {
          const tierLabel = tierLabelFromAvg(m.avg);
          html += `<div class="grp-top-athlete"><strong>${m.label}</strong><span style="margin-left:auto;font-family:var(--mono);font-size:.78rem">${m.avg.toFixed(1)}/5 (${tierLabel})</span></div>`;
        }
        html += "</div>";
        html +=
          '<div><strong style="font-size:.75rem;color:var(--text-muted);text-transform:uppercase">💪 Strongest Areas</strong>';
        for (const m of strongest) {
          const tierLabel = tierLabelFromAvg(m.avg);
          html += `<div class="grp-top-athlete"><strong>${m.label}</strong><span style="margin-left:auto;font-family:var(--mono);font-size:.78rem">${m.avg.toFixed(1)}/5 (${tierLabel})</span></div>`;
        }
        html += "</div></div>";
      }

      html += "</div>";
    }
    html += "</div>";
    container.innerHTML = html;
  };

  /* ========== CSV EXPORT ========== */
  window.exportCSV = function () {
    const D = window.CLUB;
    const headers = [
      "Name",
      "Position",
      "Group",
      "Height (in)",
      "Weight (lb)",
      "Bench (lb)",
      "Squat (lb)",
      "Med Ball (in)",
      "Vert (in)",
      "Broad (in)",
      "0-20 (s)",
      "20-30 (s)",
      "30-40 (s)",
      "40yd (s)",
      "Rel Bench",
      "Rel Squat",
      "MB Rel",
      "vMax (m/s)",
      "v10Max (m/s)",
      "F1 (N)",
      "Peak Momentum",
      "Peak Power (W)",
      "Rel Peak Power",
      "Strength Util",
      "Overall Grade",
      "Grade Score",
    ];
    const rows = [headers.join(",")];
    for (const a of D.athletes) {
      const row = [
        '"' + (a.name || "").replace(/"/g, '""') + '"',
        '"' + (a.position || "").replace(/"/g, '""') + '"',
        '"' + (a.group || "").replace(/"/g, '""') + '"',
        a.height ?? "",
        a.weight ?? "",
        a.bench ?? "",
        a.squat ?? "",
        a.medball ?? "",
        a.vert ?? "",
        a.broad ?? "",
        a.sprint020 ?? "",
        a.sprint2030 ?? "",
        a.sprint3040 ?? "",
        a.forty ?? "",
        a.relBench ?? "",
        a.relSquat ?? "",
        a.mbRel ?? "",
        a.vMax ?? "",
        a.v10Max ?? "",
        a.F1 ?? "",
        a.momMax ?? "",
        a.peakPower ?? "",
        a.relPeakPower ?? "",
        a.strengthUtil ?? "",
        a.overallGrade ? a.overallGrade.label : "",
        a.overallGrade ? a.overallGrade.score : "",
      ];
      rows.push(row.join(","));
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "bc_fitness_club_data.csv";
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 10000);
  };

  /* ========== SNAPSHOT MANAGEMENT ========== */
  function refreshSnapshotList() {
    const sel = document.getElementById("snapshotSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Load Snapshot —</option>';
    const snapshots = JSON.parse(localStorage.getItem("lc_snapshots") || "[]");
    for (const s of snapshots) {
      const o = document.createElement("option");
      o.value = s.name;
      o.textContent = `${s.name} (${s.date})`;
      sel.appendChild(o);
    }
  }

  function updateDataStatus() {
    const el = document.getElementById("dataStatus");
    if (!el) return;
    const hasEdits = localStorage.getItem("lc_edits");
    const added = JSON.parse(localStorage.getItem("lc_added") || "[]");
    const deleted = JSON.parse(localStorage.getItem("lc_deleted") || "[]");
    const snapshots = JSON.parse(localStorage.getItem("lc_snapshots") || "[]");
    const parts = [];
    if (hasEdits) parts.push("edits");
    if (added.length) parts.push("+" + added.length + " added");
    if (deleted.length) parts.push("-" + deleted.length + " deleted");
    if (parts.length) {
      el.textContent = "⚡ Modified data: " + parts.join(", ");
      el.className = "data-status has-edits";
    } else {
      el.textContent = `Original data · ${snapshots.length} snapshot${snapshots.length !== 1 ? "s" : ""} saved`;
      el.className = "data-status";
    }
  }

  window.saveSnapshot = function () {
    const name = prompt(
      "Snapshot name:",
      "Snapshot " + new Date().toLocaleDateString(),
    );
    if (!name) return;
    const snapshots = JSON.parse(localStorage.getItem("lc_snapshots") || "[]");

    // Prevent duplicate snapshot names
    if (
      snapshots.some(function (s) {
        return s.name === name;
      })
    ) {
      if (
        !confirm(
          'A snapshot named "' + name + '" already exists. Overwrite it?',
        )
      )
        return;
      const idx = snapshots.findIndex(function (s) {
        return s.name === name;
      });
      snapshots.splice(idx, 1);
    }

    // Build a snapshot of the current state (original + additions - deletions + edits)
    const rawCopy = JSON.parse(JSON.stringify(window._rawDataCache));

    // Apply additions
    const added = JSON.parse(localStorage.getItem("lc_added") || "[]");
    for (const a of added) {
      if (!rawCopy.athletes.find((x) => x.id === a.id))
        rawCopy.athletes.push(a);
    }

    // Apply deletions
    const deleted = JSON.parse(localStorage.getItem("lc_deleted") || "[]");
    if (deleted.length)
      rawCopy.athletes = rawCopy.athletes.filter(
        (a) => !deleted.includes(a.id),
      );

    // Apply edits
    const edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    for (const edit of edits) {
      const athlete = rawCopy.athletes.find((a) => a.id === edit.id);
      if (athlete) Object.assign(athlete, edit.changes);
    }
    snapshots.push({
      name,
      date: new Date().toLocaleString(),
      data: rawCopy,
    });
    safeLSSet("lc_snapshots", JSON.stringify(snapshots));
    refreshSnapshotList();
    updateDataStatus();
    showToast('Snapshot "' + name + '" saved!', "success");
  };

  window.loadSnapshot = function () {
    const sel = document.getElementById("snapshotSelect");
    const name = sel.value;
    if (!name) {
      showToast("Select a snapshot to load.", "warn");
      return;
    }
    const snapshots = JSON.parse(localStorage.getItem("lc_snapshots") || "[]");
    const snap = snapshots.find((s) => s.name === name);
    if (!snap) {
      showToast("Snapshot not found.", "error");
      return;
    }
    if (
      !confirm('Load snapshot "' + name + '"? This will replace current data.')
    )
      return;
    // Clear all local modifications
    localStorage.removeItem("lc_edits");
    localStorage.removeItem("lc_added");
    localStorage.removeItem("lc_deleted");
    window.CLUB = window._processData(JSON.parse(JSON.stringify(snap.data)));
    reRenderAll();
    updateDataStatus();
    showToast('Snapshot "' + name + '" loaded!', "success");
  };

  window.deleteSnapshot = function () {
    const sel = document.getElementById("snapshotSelect");
    const name = sel.value;
    if (!name) {
      showToast("Select a snapshot to delete.", "warn");
      return;
    }
    if (!confirm('Delete snapshot "' + name + '"?')) return;
    let snapshots = JSON.parse(localStorage.getItem("lc_snapshots") || "[]");
    snapshots = snapshots.filter((s) => s.name !== name);
    safeLSSet("lc_snapshots", JSON.stringify(snapshots));
    refreshSnapshotList();
    updateDataStatus();
  };

  window.resetToOriginal = function () {
    if (
      !confirm(
        "Discard all edits, added athletes, and deletions? This restores the original dataset.",
      )
    )
      return;
    localStorage.removeItem("lc_edits");
    localStorage.removeItem("lc_added");
    localStorage.removeItem("lc_deleted");
    const raw = JSON.parse(JSON.stringify(window._rawDataCache));
    window.CLUB = window._processData(raw);
    // Close edit panel if open
    const panel = document.getElementById("editPanel");
    if (panel && panel.classList.contains("open")) closeEditPanel();
    reRenderAll();
    updateDataStatus();
  };

  function refreshAthleteDropdowns() {
    const D = window.CLUB;
    const athSel = document.getElementById("athleteSelect");
    const scFilt = document.getElementById("scorecardFilter");
    const cmpSelects = [
      document.getElementById("cmpA"),
      document.getElementById("cmpB"),
      document.getElementById("cmpC"),
    ];

    // Save current selections
    const prevAth = athSel.value;
    const prevSc = scFilt.value;
    const prevCmp = cmpSelects.map((s) => s.value);

    // Clear existing options (keep first placeholder option)
    [athSel, scFilt, ...cmpSelects].forEach((sel) => {
      while (sel.options.length > 1) sel.remove(1);
    });

    // Repopulate
    D.athletes
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .forEach(function (a) {
        const label = `${a.name}${a.position ? " (" + a.position + ")" : ""}`;
        athSel.add(new Option(label, a.id));
        scFilt.add(new Option(label, a.id));
        cmpSelects.forEach((sel) => sel.add(new Option(label, a.id)));
      });

    // Restore previous selections
    athSel.value = prevAth;
    scFilt.value = prevSc;
    cmpSelects.forEach((sel, i) => (sel.value = prevCmp[i]));
  }

  function refreshPositionFilter() {
    const D = window.CLUB;
    const selectors = [
      document.getElementById("overviewPosFilter"),
      document.getElementById("lbPosFilter"),
    ];
    for (const posSel of selectors) {
      if (!posSel) continue;
      const prev = posSel.value;
      while (posSel.options.length > 1) posSel.remove(1);
      D.positions.forEach(function (p) {
        const o = document.createElement("option");
        o.value = p;
        o.textContent = p;
        posSel.appendChild(o);
      });
      posSel.value = prev;
    }
  }

  function reRenderAll() {
    // Refresh athlete dropdowns (names/positions may have changed)
    refreshAthleteDropdowns();

    // Refresh position filter dropdown
    refreshPositionFilter();

    // Mark all tabs dirty; only render the currently active one
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);

    // Also render profile if one is selected
    const id = document.getElementById("athleteSelect").value;
    if (id && activeTab && activeTab.dataset.tab === "profiles")
      renderProfile();
  }

  /* ========== REBUILD DATA FROM LOCALSTORAGE ========== */
  function rebuildFromStorage() {
    const rawCopy = JSON.parse(JSON.stringify(window._rawDataCache));

    // Apply additions
    const added = JSON.parse(localStorage.getItem("lc_added") || "[]");
    for (const a of added) {
      if (
        !rawCopy.athletes.find(function (x) {
          return x.id === a.id;
        })
      ) {
        rawCopy.athletes.push(a);
      }
    }

    // Apply deletions
    const deleted = JSON.parse(localStorage.getItem("lc_deleted") || "[]");
    if (deleted.length) {
      rawCopy.athletes = rawCopy.athletes.filter(function (a) {
        return !deleted.includes(a.id);
      });
    }

    // Apply edits
    const edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    for (const edit of edits) {
      const athlete = rawCopy.athletes.find(function (a) {
        return a.id === edit.id;
      });
      if (athlete) Object.assign(athlete, edit.changes);
    }

    window.CLUB = window._processData(rawCopy);
  }

  /* ========== NEXT ATHLETE ID ========== */
  function nextAthleteId() {
    const D = window.CLUB;
    const added = JSON.parse(localStorage.getItem("lc_added") || "[]");
    // Collect all existing IDs from processed data + localStorage additions
    const allIds = D.athletes.map(function (a) {
      return a.id;
    });
    for (const a of added) {
      if (allIds.indexOf(a.id) === -1) allIds.push(a.id);
    }
    // Also check the raw cache for any IDs in the original JSON
    if (window._rawDataCache && window._rawDataCache.athletes) {
      for (const a of window._rawDataCache.athletes) {
        if (allIds.indexOf(a.id) === -1) allIds.push(a.id);
      }
    }

    // Find the highest numeric suffix
    let maxNum = 0;
    for (const id of allIds) {
      const m = id.match(/^ATH(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    // Pad to 3 digits (or more if needed)
    const next = maxNum + 1;
    const padded = String(next).padStart(3, "0");
    return "ATH" + padded;
  }

  /* ========== ADD ATHLETE ========== */
  window.addAthlete = function () {
    const name = prompt("Enter athlete name:");
    if (!name || !name.trim()) return;

    const id = nextAthleteId();
    const newAthlete = {
      id: id,
      name: name.trim(),
      position: null,
      height_in: null,
      weight_lb: null,
      bench_1rm: null,
      squat_1rm: null,
      medball_in: null,
      vert_in: null,
      broad_in: null,
      sprint_020: null,
      sprint_2030: null,
      sprint_3040: null,
    };

    // Save to lc_added
    const added = JSON.parse(localStorage.getItem("lc_added") || "[]");
    added.push(newAthlete);
    safeLSSet("lc_added", JSON.stringify(added));

    // Rebuild & re-render
    rebuildFromStorage();
    reRenderAll();
    updateDataStatus();

    // Select the new athlete and open the edit panel
    document.getElementById("athleteSelect").value = id;
    showTab("profiles");
    renderProfile();
    openEditPanel(id);

    showToast("Added " + name.trim() + " (" + id + ")", "success");
  };

  /* ========== DELETE ATHLETE ========== */
  window.deleteCurrentAthlete = function () {
    // Determine which athlete to delete
    let id = editingAthleteId || document.getElementById("athleteSelect").value;
    if (!id) {
      showToast("Select an athlete first.", "warn");
      return;
    }

    const a = window.CLUB.athletes.find(function (x) {
      return x.id === id;
    });
    const displayName = a ? a.name : id;

    if (
      !confirm(
        "Delete " +
          displayName +
          " (" +
          id +
          ")? This cannot be undone (unless you reset to original).",
      )
    )
      return;

    // Close edit panel if we're deleting the currently-edited athlete
    if (editingAthleteId === id) {
      closeEditPanel();
    }

    // Add to lc_deleted
    const deleted = JSON.parse(localStorage.getItem("lc_deleted") || "[]");
    if (deleted.indexOf(id) === -1) deleted.push(id);
    safeLSSet("lc_deleted", JSON.stringify(deleted));

    // Also remove from lc_added if it was a newly added athlete
    let added = JSON.parse(localStorage.getItem("lc_added") || "[]");
    added = added.filter(function (a) {
      return a.id !== id;
    });
    safeLSSet("lc_added", JSON.stringify(added));

    // Also remove from lc_edits
    let edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    edits = edits.filter(function (e) {
      return e.id !== id;
    });
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Rebuild & re-render
    rebuildFromStorage();

    // Clear the athlete selector
    document.getElementById("athleteSelect").value = "";
    document.getElementById("profileContent").innerHTML =
      '<p class=\"placeholder-text\">Select an athlete to view their profile.</p>';

    reRenderAll();
    updateDataStatus();

    showToast("Deleted " + displayName + " (" + id + ")", "info");
  };

  /* ========== EDIT PANEL (slide-in) ========== */
  let editingAthleteId = null;
  let autoSaveTimer = null;

  const EDITABLE_FIELDS = [
    {
      key: "name",
      jsonKey: "name",
      label: "Name",
      type: "text",
      section: "Bio",
    },
    {
      key: "position",
      jsonKey: "position",
      label: "Position",
      type: "select",
      options: ["RB", "WR", "DB", "QB", "TE", "LB", "OL", "DL"],
      section: "Bio",
    },
    {
      key: "height",
      jsonKey: "height_in",
      label: "Height (in)",
      type: "number",
      step: "0.5",
      min: "48",
      max: "84",
      section: "Bio",
    },
    {
      key: "weight",
      jsonKey: "weight_lb",
      label: "Weight (lb)",
      type: "number",
      step: "1",
      min: "80",
      max: "400",
      section: "Bio",
    },
    {
      key: "bench",
      jsonKey: "bench_1rm",
      label: "Bench 1RM (lb)",
      type: "number",
      step: "5",
      min: "0",
      max: "600",
      section: "Strength",
    },
    {
      key: "squat",
      jsonKey: "squat_1rm",
      label: "Squat 1RM (lb)",
      type: "number",
      step: "5",
      min: "0",
      max: "800",
      section: "Strength",
    },
    {
      key: "medball",
      jsonKey: "medball_in",
      label: "Med Ball (in)",
      type: "number",
      step: "1",
      min: "0",
      max: "500",
      section: "Explosiveness",
    },
    {
      key: "vert",
      jsonKey: "vert_in",
      label: "Vertical Jump (in)",
      type: "number",
      step: "0.5",
      min: "0",
      max: "50",
      section: "Explosiveness",
    },
    {
      key: "broad",
      jsonKey: "broad_in",
      label: "Broad Jump (in)",
      type: "number",
      step: "1",
      min: "0",
      max: "150",
      section: "Explosiveness",
    },
    {
      key: "sprint020",
      jsonKey: "sprint_020",
      label: "0–20yd Split (s)",
      type: "number",
      step: "0.01",
      min: "1.5",
      max: "6.0",
      section: "Sprint",
    },
    {
      key: "sprint2030",
      jsonKey: "sprint_2030",
      label: "20–30yd Split (s)",
      type: "number",
      step: "0.01",
      min: "0.5",
      max: "3.0",
      section: "Sprint",
    },
    {
      key: "sprint3040",
      jsonKey: "sprint_3040",
      label: "30–40yd Split (s)",
      type: "number",
      step: "0.01",
      min: "0.5",
      max: "3.0",
      section: "Sprint",
    },
  ];

  /* ---------- Toast Notifications ---------- */
  function showToast(msg, type) {
    type = type || "info";
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const t = document.createElement("div");
    t.className = "toast toast-" + type;
    t.innerHTML =
      "<span>" +
      esc(msg) +
      '</span><button class="toast-dismiss" aria-label="Dismiss">&times;</button>';
    t.querySelector(".toast-dismiss").addEventListener("click", function () {
      t.remove();
    });
    container.appendChild(t);
    const dur = type === "error" ? 6000 : 3200;
    setTimeout(function () {
      t.remove();
    }, dur);
  }

  /* ---------- Edit Panel helpers ---------- */
  function populateEditAthleteSelect() {
    const D = window.CLUB;
    const sel = document.getElementById("editAthleteSelect");
    if (!sel) return;
    sel.innerHTML = "";
    sortedAthletes().forEach(function (a) {
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.name + (a.position ? " (" + a.position + ")" : "");
      sel.appendChild(o);
    });
  }

  function buildEditFields(a) {
    const body = document.getElementById("editPanelBody");
    if (!body) return;

    // Get saved edits for this athlete to detect changes
    const edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    const athleteEdits = edits.find(function (e) {
      return e.id === a.id;
    });
    const changedKeys = athleteEdits ? Object.keys(athleteEdits.changes) : [];

    let html = "";
    let currentSection = "";

    for (let i = 0; i < EDITABLE_FIELDS.length; i++) {
      const f = EDITABLE_FIELDS[i];

      // Start new section?
      if (f.section !== currentSection) {
        if (currentSection !== "") html += "</div>"; // close previous grid
        currentSection = f.section;
        html += '<div class="edit-section-title">' + f.section + "</div>";
        html += '<div class="edit-grid">';
      }

      const val = a[f.key];
      const isChanged = changedKeys.indexOf(f.jsonKey) >= 0;
      const changedCls = isChanged ? " field-changed" : "";

      if (f.type === "select") {
        html += '<div class="edit-field"><label>' + f.label + "</label>";
        html +=
          '<select id="edit_' +
          f.key +
          '" data-field="' +
          f.key +
          '" class="' +
          changedCls.trim() +
          '">';
        html += '<option value="">— None —</option>';
        for (let oi = 0; oi < f.options.length; oi++) {
          html +=
            '<option value="' +
            f.options[oi] +
            '"' +
            (val === f.options[oi] ? " selected" : "") +
            ">" +
            f.options[oi] +
            "</option>";
        }
        html += "</select></div>";
      } else {
        html += '<div class="edit-field"><label>' + f.label + "</label>";
        html +=
          '<input type="' +
          f.type +
          '" id="edit_' +
          f.key +
          '" data-field="' +
          f.key +
          '" class="' +
          changedCls.trim() +
          '" value="' +
          (val !== null && val !== undefined ? val : "") +
          '"' +
          (f.step ? ' step="' + f.step + '"' : "") +
          (f.min !== undefined ? ' min="' + f.min + '"' : "") +
          (f.max !== undefined ? ' max="' + f.max + '"' : "") +
          " /></div>";
      }
    }
    if (currentSection !== "") html += "</div>"; // close last grid

    // Test History section in edit panel
    const history = getAthleteHistory(a.id);
    html +=
      '<div class="edit-section-title">Test History <small>(' +
      history.length +
      " saved)</small></div>";
    html += '<div class="edit-history-actions">';
    html +=
      '<button class="btn btn-sm btn-primary" onclick="saveCurrentAsTest()" title="Snapshot current values as a dated test">📅 Save Current as Test Date</button> ';
    html +=
      '<button class="btn btn-sm" onclick="openAddPreviousTest()" title="Manually enter historical test data">📝 Add Previous Test</button>';
    html += "</div>";
    if (history.length > 0) {
      html += '<div class="edit-history-list">';
      for (var hi = 0; hi < history.length; hi++) {
        var he = history[hi];
        var metricsWithData = 0;
        var metricChips = '';
        for (var tki = 0; tki < TEST_METRIC_KEYS.length; tki++) {
          var tkVal = he.values[TEST_METRIC_KEYS[tki].jsonKey];
          if (tkVal !== null && tkVal !== undefined) {
            metricsWithData++;
            metricChips += '<span class="th-chip">' + TEST_METRIC_KEYS[tki].label + ': <strong>' + tkVal + '</strong></span>';
          }
        }
        // Compute 40yd from sprints if available
        var s020 = he.values.sprint_020, s2030 = he.values.sprint_2030, s3040 = he.values.sprint_3040;
        if (s020 !== null && s020 !== undefined && s2030 !== null && s2030 !== undefined && s3040 !== null && s3040 !== undefined) {
          metricChips += '<span class="th-chip th-chip-computed">40yd: <strong>' + (s020 + s2030 + s3040).toFixed(2) + 's</strong></span>';
        }
        html += '<div class="edit-history-item">';
        html +=
          '<div class="edit-history-info"><strong>' +
          esc(he.label) +
          "</strong> <small>" +
          he.date +
          " · " +
          metricsWithData +
          "/" + TEST_METRIC_KEYS.length +
          " metrics</small>" +
          '<div class="th-chip-row">' + metricChips + '</div>' +
          "</div>";
        html += '<div class="edit-history-btns">';
        html +=
          '<button class="btn btn-xs btn-muted" onclick="editHistoryEntry(\'' +
          esc(a.id) +
          "','" +
          esc(he.date) +
          "','" +
          esc(he.label) +
          "')\" title=\"Edit this test entry\">✏️</button> ";
        html +=
          '<button class="btn btn-xs btn-muted" onclick="deleteHistoryEntry(\'' +
          esc(a.id) +
          "','" +
          esc(he.date) +
          "','" +
          esc(he.label) +
          "')\" title=\"Delete this test entry\">🗑</button>";
        html += '</div>';
        html += "</div>";
      }
      html += "</div>";
    } else {
      html += '<div class="th-empty-inline"><small>No test history for this athlete. Save a test date or add historical data above.</small></div>';
    }

    // Hidden previous test entry form (shared for add & edit)
    html +=
      '<div id="prevTestForm" class="prev-test-form" style="display:none">';
    html += '<input type="hidden" id="prevTestEditMode" value="" />';
    html += '<input type="hidden" id="prevTestOrigDate" value="" />';
    html += '<input type="hidden" id="prevTestOrigLabel" value="" />';
    html += '<div class="edit-section-title" id="prevTestFormTitle">Enter Previous Test Data</div>';
    html += '<div class="edit-grid">';
    html +=
      '<div class="edit-field"><label>Test Date</label><input type="date" id="prevTestDate" value="" /></div>';
    html +=
      '<div class="edit-field"><label>Label (e.g. "Spring 2025")</label><input type="text" id="prevTestLabel" placeholder="Spring 2025" /></div>';
    html += "</div>";
    html += '<div class="edit-grid">';
    for (var pti = 0; pti < TEST_METRIC_KEYS.length; pti++) {
      var ptk = TEST_METRIC_KEYS[pti];
      if (ptk.jsonKey === "weight_lb") continue; // Weight is in the fields above, skip dupe
      html +=
        '<div class="edit-field"><label>' +
        ptk.label +
        " (" +
        ptk.unit +
        ')</label><input type="number" id="prevTest_' +
        ptk.jsonKey +
        '" step="any" /></div>';
    }
    // Include weight
    html +=
      '<div class="edit-field"><label>Weight (lb)</label><input type="number" id="prevTest_weight_lb" step="1" /></div>';
    html += "</div>";
    html += '<div class="edit-history-actions">';
    html +=
      '<button class="btn btn-sm btn-primary" onclick="submitPreviousTest()" id="prevTestSubmitBtn">💾 Save Previous Test</button> ';
    html +=
      '<button class="btn btn-sm" onclick="closePrevTestForm()">Cancel</button>';
    html += "</div></div>";

    body.innerHTML = html;

    // Attach auto-save listeners to all fields
    body.querySelectorAll("input, select").forEach(function (el) {
      el.addEventListener("input", scheduleAutoSave);
      el.addEventListener("change", scheduleAutoSave);
    });
  }

  /* ---------- Auto-save ---------- */
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(doAutoSave, 500);

    // Show typing indicator
    const statusEl = document.getElementById("autoSaveStatus");
    if (statusEl) {
      statusEl.textContent = "typing…";
      statusEl.classList.add("visible");
    }
  }

  function doAutoSave() {
    if (!editingAthleteId) return;

    // Gather current field values
    const changes = {};
    for (let i = 0; i < EDITABLE_FIELDS.length; i++) {
      const f = EDITABLE_FIELDS[i];
      const el = document.getElementById("edit_" + f.key);
      if (!el) continue;
      const rawVal = el.value.trim();
      if (f.type === "number") {
        changes[f.jsonKey] = rawVal === "" ? null : parseFloat(rawVal);
      } else {
        changes[f.jsonKey] = rawVal || null;
      }
    }

    // Save to localStorage
    let edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    const existing = edits.find(function (e) {
      return e.id === editingAthleteId;
    });
    if (existing) {
      Object.assign(existing.changes, changes);
    } else {
      edits.push({ id: editingAthleteId, changes: changes });
    }
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Reprocess data
    rebuildFromStorage();

    // Re-render only active tab + profile
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    updateDataStatus();

    // Keep athlete selected & profile visible
    const athSel = document.getElementById("athleteSelect");
    if (athSel) athSel.value = editingAthleteId;
    renderProfile();

    // Update the edit panel nav dropdown
    populateEditAthleteSelect();
    document.getElementById("editAthleteSelect").value = editingAthleteId;

    // Mark changed fields
    markChangedFields();

    // Show save confirmation
    const statusEl = document.getElementById("autoSaveStatus");
    if (statusEl) {
      statusEl.textContent = "✓ Saved";
      statusEl.classList.add("visible");
      setTimeout(function () {
        statusEl.classList.remove("visible");
      }, 2000);
    }
  }

  function markChangedFields() {
    const edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    const athleteEdits = edits.find(function (e) {
      return e.id === editingAthleteId;
    });
    const changedKeys = athleteEdits ? Object.keys(athleteEdits.changes) : [];

    for (let i = 0; i < EDITABLE_FIELDS.length; i++) {
      const f = EDITABLE_FIELDS[i];
      const el = document.getElementById("edit_" + f.key);
      if (!el) continue;
      if (changedKeys.indexOf(f.jsonKey) >= 0) {
        el.classList.add("field-changed");
      } else {
        el.classList.remove("field-changed");
      }
    }
  }

  /* ---------- Test History Actions ---------- */
  window.saveCurrentAsTest = function () {
    if (!editingAthleteId) return;
    const D = window.CLUB;
    const a = D.athletes.find(function (x) {
      return x.id === editingAthleteId;
    });
    if (!a) return;

    var dateStr = prompt(
      "Enter test date (YYYY-MM-DD):",
      new Date().toISOString().slice(0, 10),
    );
    if (!dateStr) return;
    var label = prompt(
      "Enter a label for this test (e.g. 'Spring 2025', 'Pre-Season'):",
      "",
    );
    if (label === null) return;
    if (!label.trim()) label = dateStr;

    var vals = currentTestValues(a);
    saveTestEntry(a.id, dateStr, label.trim(), vals);
    showToast(
      "Saved test entry: " + label.trim() + " (" + dateStr + ")",
      "success",
    );
    buildEditFields(a); // refresh the edit panel
    renderProfile();
  };

  window.openAddPreviousTest = function () {
    // Reset form to "add" mode
    var form = document.getElementById("prevTestForm");
    if (!form) return;
    document.getElementById("prevTestEditMode").value = "";
    document.getElementById("prevTestOrigDate").value = "";
    document.getElementById("prevTestOrigLabel").value = "";
    document.getElementById("prevTestFormTitle").textContent = "Enter Previous Test Data";
    document.getElementById("prevTestSubmitBtn").textContent = "💾 Save Previous Test";
    document.getElementById("prevTestDate").value = "";
    document.getElementById("prevTestLabel").value = "";
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      var el = document.getElementById("prevTest_" + TEST_METRIC_KEYS[i].jsonKey);
      if (el) el.value = "";
    }
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  window.editHistoryEntry = function (athleteId, date, label) {
    var history = getAthleteHistory(athleteId);
    var entry = null;
    for (var i = 0; i < history.length; i++) {
      if (history[i].date === date && history[i].label === label) {
        entry = history[i];
        break;
      }
    }
    if (!entry) { showToast("Test entry not found.", "error"); return; }

    var form = document.getElementById("prevTestForm");
    if (!form) return;

    // Set edit mode
    document.getElementById("prevTestEditMode").value = "edit";
    document.getElementById("prevTestOrigDate").value = date;
    document.getElementById("prevTestOrigLabel").value = label;
    document.getElementById("prevTestFormTitle").textContent = "Edit Test: " + label + " (" + date + ")";
    document.getElementById("prevTestSubmitBtn").textContent = "💾 Update Test Entry";

    // Pre-fill date & label
    document.getElementById("prevTestDate").value = entry.date;
    document.getElementById("prevTestLabel").value = entry.label;

    // Pre-fill metric values
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      var mk = TEST_METRIC_KEYS[i];
      var el = document.getElementById("prevTest_" + mk.jsonKey);
      if (el) {
        var v = entry.values[mk.jsonKey];
        el.value = (v !== null && v !== undefined) ? v : "";
      }
    }

    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  window.closePrevTestForm = function () {
    var form = document.getElementById("prevTestForm");
    if (form) form.style.display = "none";
  };

  window.submitPreviousTest = function () {
    if (!editingAthleteId) return;
    var dateEl = document.getElementById("prevTestDate");
    var labelEl = document.getElementById("prevTestLabel");
    if (!dateEl || !dateEl.value) {
      showToast("Please enter a test date.", "warn");
      return;
    }

    var dateStr = dateEl.value;
    var label = (labelEl && labelEl.value.trim()) || dateStr;

    var vals = {};
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      var mk = TEST_METRIC_KEYS[i];
      var el = document.getElementById("prevTest_" + mk.jsonKey);
      if (el && el.value.trim() !== "") {
        vals[mk.jsonKey] = parseFloat(el.value);
      } else {
        vals[mk.jsonKey] = null;
      }
    }

    // If in edit mode, delete the original entry first
    var editMode = document.getElementById("prevTestEditMode");
    if (editMode && editMode.value === "edit") {
      var origDate = document.getElementById("prevTestOrigDate").value;
      var origLabel = document.getElementById("prevTestOrigLabel").value;
      deleteTestEntry(editingAthleteId, origDate, origLabel);
    }

    saveTestEntry(editingAthleteId, dateStr, label, vals);

    var isEdit = editMode && editMode.value === "edit";
    showToast(
      (isEdit ? "Updated" : "Saved") + " test: " + label + " (" + dateStr + ")",
      "success",
    );

    // Refresh edit panel & profile
    var a = window.CLUB.athletes.find(function (x) {
      return x.id === editingAthleteId;
    });
    if (a) buildEditFields(a);
    renderProfile();
  };

  /* ---------- Panel open / close / navigate ---------- */
  window.openEditPanel = function (athleteId) {
    const D = window.CLUB;
    const id = athleteId || document.getElementById("athleteSelect").value;
    if (!id) {
      showToast("Select an athlete first.", "warn");
      return;
    }
    const a = D.athletes.find(function (x) {
      return x.id === id;
    });
    if (!a) return;
    editingAthleteId = id;

    // Populate the nav dropdown
    populateEditAthleteSelect();
    document.getElementById("editAthleteSelect").value = id;

    // Set title
    document.getElementById("editPanelTitle").textContent = "Edit: " + a.name;

    // Build fields
    buildEditFields(a);

    // Open panel with animation
    document.getElementById("editPanel").classList.add("open");
    document.getElementById("editPanelBackdrop").classList.add("open");

    // Also select this athlete in the main profile tab
    document.getElementById("athleteSelect").value = id;
    renderProfile();
  };

  window.closeEditPanel = function () {
    document.getElementById("editPanel").classList.remove("open");
    document.getElementById("editPanelBackdrop").classList.remove("open");
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    editingAthleteId = null;
  };

  window.editPanelSelectAthlete = function (id) {
    if (!id) return;
    // Flush any pending auto-save for previous athlete
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      doAutoSave();
    }
    openEditPanel(id);
  };

  window.editPanelPrev = function () {
    const D = window.CLUB;
    const sorted = sortedAthletes();
    if (sorted.length === 0) return;
    let idx = sorted.findIndex(function (a) {
      return a.id === editingAthleteId;
    });
    if (idx <= 0) idx = sorted.length;
    openEditPanel(sorted[idx - 1].id);
  };

  window.editPanelNext = function () {
    const D = window.CLUB;
    const sorted = sortedAthletes();
    if (sorted.length === 0) return;
    let idx = sorted.findIndex(function (a) {
      return a.id === editingAthleteId;
    });
    if (idx >= sorted.length - 1) idx = -1;
    openEditPanel(sorted[idx + 1].id);
  };

  /* ---------- Undo & athlete-level export ---------- */
  window.undoAthleteEdits = function () {
    if (!editingAthleteId) return;
    let edits = JSON.parse(localStorage.getItem("lc_edits") || "[]");
    edits = edits.filter(function (e) {
      return e.id !== editingAthleteId;
    });
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Reprocess from original + remaining edits
    rebuildFromStorage();
    reRenderAll();
    updateDataStatus();

    // Refresh the panel with original data
    const a = window.CLUB.athletes.find(function (x) {
      return x.id === editingAthleteId;
    });
    if (a) {
      buildEditFields(a);
      document.getElementById("editPanelTitle").textContent = "Edit: " + a.name;
      populateEditAthleteSelect();
      document.getElementById("editAthleteSelect").value = editingAthleteId;
    }
    showToast("Changes undone for this athlete.", "info");
  };

  window.exportAthleteJSON = function () {
    if (!editingAthleteId) return;
    const a = window.CLUB.athletes.find(function (x) {
      return x.id === editingAthleteId;
    });
    if (!a) return;

    const exported = {
      id: a.id,
      name: a.name,
      position: a.position,
      group: a.group,
      height_in: a.height,
      weight_lb: a.weight,
      bench_1rm: a.bench,
      squat_1rm: a.squat,
      medball_in: a.medball,
      vert_in: a.vert,
      broad_in: a.broad,
      sprint_020: a.sprint020,
      sprint_2030: a.sprint2030,
      sprint_3040: a.sprint3040,
    };

    const json = JSON.stringify(exported, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(json)
        .then(function () {
          showToast("Athlete JSON copied to clipboard!", "success");
        })
        .catch(function () {
          prompt("Copy this JSON:", json);
        });
    } else {
      prompt("Copy this JSON:", json);
    }
  };

  // Close panel on Escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      const panel = document.getElementById("editPanel");
      if (panel && panel.classList.contains("open")) {
        closeEditPanel();
      }
    }
  });

  /* ========== JSON EXPORT (full dataset) ========== */
  window.exportJSON = function () {
    const D = window.CLUB;
    const exportData = {
      exportDate: new Date().toISOString(),
      source: "BC Personal Fitness Club Dashboard",
      athleteCount: D.athletes.length,
      athletes: D.athletes.map(function (a) {
        return {
          id: a.id,
          name: a.name,
          position: a.position,
          group: a.group,
          height_in: a.height,
          weight_lb: a.weight,
          bench_1rm: a.bench,
          squat_1rm: a.squat,
          medball_in: a.medball,
          vert_in: a.vert,
          broad_in: a.broad,
          sprint_020: a.sprint020,
          sprint_2030: a.sprint2030,
          sprint_3040: a.sprint3040,
          sprint_notes: a.sprintNotes || null,
          forty: a.forty,
          relBench: a.relBench,
          relSquat: a.relSquat,
          mbRel: a.mbRel,
          vMax: a.vMax,
          peakPower: a.peakPower,
          relPeakPower: a.relPeakPower,
          overallGrade: a.overallGrade ? a.overallGrade.label : null,
          gradeScore: a.overallGrade ? a.overallGrade.score : null,
        };
      }),
    };

    /* Include non-athlete data for full round-trip */
    if (D.testingLog && D.testingLog.length > 0) {
      exportData.testing_log = D.testingLog.map(function (e) {
        return {
          date: e.date,
          athlete_id: e.athleteId,
          name: e.name,
          test: e.test,
          split_020: e.sprint020,
          split_2030: e.sprint2030,
          split_3040: e.sprint3040,
          location: e.location,
          vert: e.vert,
          broad: e.broad,
          bench: e.bench,
          squat: e.squat,
          medball: e.medball,
        };
      });
    }
    if (D.testingWeekPlan && D.testingWeekPlan.length > 0) {
      exportData.testing_week_plan = D.testingWeekPlan;
    }
    if (window._rawDataCache) {
      if (window._rawDataCache.meta)
        exportData.meta = window._rawDataCache.meta;
      if (window._rawDataCache.constants)
        exportData.constants = window._rawDataCache.constants;
    }

    // Include test history
    var testHist = getTestHistory();
    if (Object.keys(testHist).length > 0) {
      exportData.test_history = testHist;
    }

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "bc_fitness_club_data_" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 10000);
    showToast("JSON exported — " + D.athletes.length + " athletes", "success");
  };

  /* ========== JSON IMPORT (restore from export) ========== */
  window.importJSON = function (inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);

        /* --- Validate structure --- */
        let athletes;
        if (data.athletes && Array.isArray(data.athletes)) {
          athletes = data.athletes;
        } else {
          throw new Error("Invalid file: no athletes array found.");
        }
        if (athletes.length === 0) {
          throw new Error("File contains 0 athletes.");
        }

        /* --- Validate athletes --- */
        const importWarnings = [];
        const seenIds = new Set();
        for (let i = 0; i < athletes.length; i++) {
          const a = athletes[i];
          if (!a.id)
            importWarnings.push("Athlete #" + (i + 1) + " missing id.");
          if (!a.name)
            importWarnings.push("Athlete #" + (i + 1) + " missing name.");
          if (a.id && seenIds.has(a.id))
            importWarnings.push("Duplicate id: " + a.id);
          if (a.id) seenIds.add(a.id);
        }
        if (importWarnings.length > 0) {
          const proceed = confirm(
            "Import warnings:\n• " +
              importWarnings.join("\n• ") +
              "\n\nContinue anyway?",
          );
          if (!proceed) {
            inputEl.value = "";
            return;
          }
        }

        /* --- Check if this is an exported JSON (has source field) or raw format --- */
        const isExport =
          data.source === "BC Personal Fitness Club Dashboard" ||
          data.source === "Lifting Club Dashboard";

        /* --- Map athletes back to raw format --- */
        const rawAthletes = athletes.map(function (a) {
          const raw = {
            id: a.id,
            name: a.name,
            position: a.position,
            height_in: a.height_in !== undefined ? a.height_in : null,
            weight_lb: a.weight_lb !== undefined ? a.weight_lb : null,
            sprint_020: a.sprint_020 !== undefined ? a.sprint_020 : null,
            sprint_2030: a.sprint_2030 !== undefined ? a.sprint_2030 : null,
            sprint_3040: a.sprint_3040 !== undefined ? a.sprint_3040 : null,
            sprint_notes: a.sprint_notes || null,
            vert_in: a.vert_in !== undefined ? a.vert_in : null,
            broad_in: a.broad_in !== undefined ? a.broad_in : null,
            bench_1rm: a.bench_1rm !== undefined ? a.bench_1rm : null,
            squat_1rm: a.squat_1rm !== undefined ? a.squat_1rm : null,
            medball_in: a.medball_in !== undefined ? a.medball_in : null,
          };
          return raw;
        });

        if (
          !confirm(
            "Import " +
              rawAthletes.length +
              ' athletes from "' +
              file.name +
              '"?\n\nThis will replace ALL current data and clear any unsaved edits.',
          )
        ) {
          inputEl.value = "";
          return;
        }

        /* --- Build raw data object (preserve all top-level keys) --- */
        const rawData = {
          meta: data.meta || {
            source_workbook: "Imported from " + file.name,
            export_date: data.exportDate || new Date().toISOString(),
            notes: ["Imported via JSON upload"],
          },
          constants: data.constants || {
            LB_TO_KG: 0.45359237,
            IN_TO_CM: 2.54,
            TEN_YD_M: 9.144,
            TWENTY_YD_M: 18.288,
            G: 9.81,
            SAYERS_A: 60.7,
            SAYERS_B: 45.3,
            SAYERS_C: -2055,
          },
          athletes: rawAthletes,
        };
        /* Carry over optional top-level collections if present */
        if (data.testing_log) rawData.testing_log = data.testing_log;
        if (data.testing_week_plan)
          rawData.testing_week_plan = data.testing_week_plan;
        if (data.benchmarks) rawData.benchmarks = data.benchmarks;

        /* --- Clear all local modifications --- */
        localStorage.removeItem("lc_edits");
        localStorage.removeItem("lc_added");
        localStorage.removeItem("lc_deleted");

        /* --- Restore test history if present in import --- */
        if (data.test_history && typeof data.test_history === "object") {
          safeLSSet("lc_test_history", JSON.stringify(data.test_history));
        } else {
          localStorage.removeItem("lc_test_history");
        }

        /* --- Set new raw cache and reprocess --- */
        window._rawDataCache = JSON.parse(JSON.stringify(rawData));
        window.CLUB = window._processData(rawData);
        reRenderAll();
        updateDataStatus();
        showToast(
          "Imported " + rawAthletes.length + " athletes from " + file.name,
          "success",
        );
      } catch (err) {
        console.error("Import error:", err);
        showToast("Import failed: " + err.message, "error");
      }
      inputEl.value = ""; // reset so same file can be re-imported
    };
    reader.readAsText(file);
  };

  // Legacy compat (kept for any external references)
  window.openEditModal = window.openEditPanel;
  window.closeEditModal = window.closeEditPanel;
})();
