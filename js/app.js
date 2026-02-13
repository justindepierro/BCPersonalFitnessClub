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

  /* ---------- Athlete Map (O(1) lookups by id) ---------- */
  let _athleteMap = null;
  function getAthleteMap() {
    if (_athleteMap) return _athleteMap;
    _athleteMap = new Map();
    var athletes = window.CLUB ? window.CLUB.athletes : [];
    for (var i = 0; i < athletes.length; i++) {
      _athleteMap.set(athletes[i].id, athletes[i]);
    }
    return _athleteMap;
  }
  function getAthleteById(id) {
    return getAthleteMap().get(id) || null;
  }
  function invalidateAthleteMap() {
    _athleteMap = null;
  }

  /* ---------- Chart animation control ---------- */
  let _skipChartAnimation = false;
  function chartAnimOpts() {
    return _skipChartAnimation ? { animation: false } : {};
  }

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

  /** Escape a value for embedding inside onclick="fn('VALUE')" */
  function escJs(s) {
    return esc(String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
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

  /* ---------- Format grade as ordinal (6th, 7th, … 12th) ---------- */
  function ordGrade(g) {
    if (g === null || g === undefined) return "N/A";
    const s = ["th", "st", "nd", "rd"];
    const v = g % 100;
    return g + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- Tier label from average score — delegates to data.js source of truth ---------- */
  function tierLabelFromAvg(avg) {
    return window._gradeHelpers.overallGradeLabel(avg);
  }

  /* ---------- Shared grade tier constants (single source of truth) ---------- */
  /* These are referenced by donut charts, group dashboards, etc.
     Tier names, labels, and scores come from HS_STANDARDS in data.js.
     Colors are presentation-only, defined once here. */
  const GRADE_TIER_LABELS = {
    elite: "Elite",
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    below: "Below Avg",
  };
  const GRADE_TIER_COLORS = {
    elite: "#a78bfa",
    excellent: "#4ade80",
    good: "#60a5fa",
    average: "#facc15",
    below: "#f87171",
  };
  const GRADE_TIER_ORDER = ["elite", "excellent", "good", "average", "below"];

  /** Map a percentile (0–100) to a grade-system tier for display consistency.
      The canonical percentile tier vocabulary (strong/solid/competitive/developing)
      is used for scorecard tiers; this mapping uses grade tiers (elite/excellent/
      good/average/below) when displaying percentiles alongside grade data
      (e.g. cohort column, profile badge) for uniform badge styling. */
  function pctToGradeTier(pct) {
    if (pct === null || pct === undefined) return "below";
    if (pct >= 90) return "elite";
    if (pct >= 75) return "excellent";
    if (pct >= 50) return "good";
    if (pct >= 25) return "average";
    return "below";
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
    {
      key: "proAgility",
      jsonKey: "pro_agility",
      label: "5-10-5",
      unit: "s",
      lower: true,
    },
    {
      key: "lDrill",
      jsonKey: "l_drill",
      label: "L-Drill",
      unit: "s",
      lower: true,
    },
    {
      key: "backpedal",
      jsonKey: "backpedal",
      label: "Backpedal",
      unit: "s",
      lower: true,
    },
    {
      key: "wDrill",
      jsonKey: "w_drill",
      label: "W-Drill",
      unit: "s",
      lower: true,
    },
  ];

  /* ---------- Test History helpers ---------- */

  /* Compute team averages, min, max for a set of athlete values */
  function computeTestAverages(athleteDetails) {
    var stats = {};
    for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      var key = TEST_METRIC_KEYS[mk].jsonKey;
      var sum = 0,
        count = 0,
        min = Infinity,
        max = -Infinity;
      for (var ai = 0; ai < athleteDetails.length; ai++) {
        var v = athleteDetails[ai].values[key];
        if (v !== null && v !== undefined && !isNaN(v)) {
          sum += v;
          count++;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      stats[key] = {
        avg: count > 0 ? +(sum / count).toFixed(1) : null,
        min: count > 0 ? min : null,
        max: count > 0 ? max : null,
        count: count,
      };
    }
    return stats;
  }

  /* Build HTML for a team averages summary bar */
  function buildAvgSummaryHTML(stats) {
    var html = '<div class="ta-summary">';
    html += '<span class="ta-title">Team Averages</span>';
    for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      var key = TEST_METRIC_KEYS[mk].jsonKey;
      var s = stats[key];
      if (s.avg !== null) {
        html +=
          '<span class="ta-chip"><span class="ta-chip-label">' +
          TEST_METRIC_KEYS[mk].label +
          "</span><strong>" +
          s.avg +
          "</strong><small>" +
          TEST_METRIC_KEYS[mk].unit +
          "</small></span>";
      }
    }
    html += "</div>";
    return html;
  }

  /* Build avg/best/worst footer rows for a detail table */
  function buildAvgTableRows(stats, showBestWorst, extraCol) {
    var extra = extraCol ? "<td></td>" : "";
    var avgRow =
      '<tr class="ta-row ta-avg-row"><td><strong>Team Avg</strong></td>';
    for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      var s = stats[TEST_METRIC_KEYS[mk].jsonKey];
      avgRow += '<td class="num">' + (s.avg !== null ? s.avg : "—") + "</td>";
    }
    avgRow += extra + "</tr>";
    if (!showBestWorst) return avgRow;
    var bestRow =
      '<tr class="ta-row ta-best-row"><td><strong>Best</strong></td>';
    var worstRow =
      '<tr class="ta-row ta-worst-row"><td><strong>Worst</strong></td>';
    for (var mk2 = 0; mk2 < TEST_METRIC_KEYS.length; mk2++) {
      var s2 = stats[TEST_METRIC_KEYS[mk2].jsonKey];
      var lower = TEST_METRIC_KEYS[mk2].lower;
      bestRow +=
        '<td class="num">' +
        (s2.avg !== null ? (lower ? s2.min : s2.max) : "—") +
        "</td>";
      worstRow +=
        '<td class="num">' +
        (s2.avg !== null ? (lower ? s2.max : s2.min) : "—") +
        "</td>";
    }
    bestRow += extra + "</tr>";
    worstRow += extra + "</tr>";
    return avgRow + bestRow + worstRow;
  }

  let _testHistoryCache = null;
  function getTestHistory() {
    if (_testHistoryCache !== null) return _testHistoryCache;
    _testHistoryCache = safeLSGet("lc_test_history", {});
    return _testHistoryCache;
  }
  function setTestHistory(h) {
    _testHistoryCache = null; // invalidate cache
    safeLSSet("lc_test_history", JSON.stringify(h));
    // Invalidate stale/prev caches when test data changes
    _prevTestCache = null;
    _staleKeysCache = null;
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
  function safeLSGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("localStorage read failed for " + key + ":", e);
      return fallback;
    }
  }
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
    invalidateNormCache();
    _prevTestCache = null;
    _staleKeysCache = null;
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
    proAgility: {
      name: "5-10-5 Pro Agility",
      unit: "s",
      measures: "Lateral quickness and change-of-direction speed",
      tellsYou:
        "How quickly an athlete can decelerate, redirect, and re-accelerate laterally. Key for skill-position players.",
    },
    lDrill: {
      name: "L-Drill (3-Cone)",
      unit: "s",
      measures: "Multi-directional agility and body control",
      tellsYou:
        "Tests short-area quickness through 90° and 180° cuts. Correlates with ability to navigate traffic.",
    },
    backpedal: {
      name: "Backpedal (10+10)",
      unit: "s",
      measures: "10-yd backpedal + 10-yd forward sprint",
      tellsYou:
        "Ability to retreat and transition to forward speed. Critical for DBs, LBs, and any zone-coverage athlete.",
    },
    wDrill: {
      name: "W-Drill (5-Cone)",
      unit: "s",
      measures: "Open-hip agility and footwork through weaving pattern",
      tellsYou:
        "Tests fluid hip transitions and change of direction at multiple angles. Designed for DBs and coverage players.",
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

    // Restore age-adjusted toggle state
    const ageToggle = document.getElementById("ageAdjToggle");
    if (ageToggle) {
      ageToggle.checked = localStorage.getItem("lc_age_adjusted") === "true";
    }
    // Sync overview duplicates
    const overviewAgeToggle = document.getElementById("overviewAgeToggle");
    if (overviewAgeToggle) {
      overviewAgeToggle.checked =
        localStorage.getItem("lc_age_adjusted") === "true";
    }
    const overviewRelToggle = document.getElementById("overviewRelToggle");
    if (overviewRelToggle) {
      overviewRelToggle.checked =
        localStorage.getItem("lc_show_relatives") === "true";
    }
    // Restore body-adjusted toggle state
    const bodyToggle = document.getElementById("bodyAdjToggle");
    if (bodyToggle) {
      bodyToggle.checked = localStorage.getItem("lc_body_adjusted") === "true";
    }
    const overviewBodyToggle = document.getElementById("overviewBodyToggle");
    if (overviewBodyToggle) {
      overviewBodyToggle.checked =
        localStorage.getItem("lc_body_adjusted") === "true";
    }
    // Restore cohort toggle state
    const cohortToggle = document.getElementById("cohortToggle");
    if (cohortToggle) {
      cohortToggle.checked = localStorage.getItem("lc_cohort_mode") === "true";
    }
    const overviewCohortToggle = document.getElementById(
      "overviewCohortToggle",
    );
    if (overviewCohortToggle) {
      overviewCohortToggle.checked =
        localStorage.getItem("lc_cohort_mode") === "true";
    }

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

    // Populate dynamic group filters from actual athlete groups
    const activeGroups = [...new Set(D.athletes.map((a) => a.group))].sort();
    const groupSelects = [
      document.getElementById("overviewGroupFilter"),
      document.getElementById("lbGroupFilter"),
      document.getElementById("grpDash"),
    ];
    for (const gs of groupSelects) {
      if (!gs) continue;
      for (const g of activeGroups) {
        const o = document.createElement("option");
        o.value = g;
        o.textContent = g;
        gs.appendChild(o);
      }
    }

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

    // Only render the visible tab; mark the rest dirty for lazy rendering
    markTabsDirty();
    renderOverview();
    _tabDirty["overview"] = false;
    renderConstants();
    _tabDirty["constants"] = false;
    updateDataStatus();

    // Sortable bindings (delegated to survive thead rebuilds)
    document.querySelectorAll(".data-table.sortable").forEach((table) => {
      table.addEventListener("click", function (ev) {
        var th = ev.target.closest("th[data-sort]");
        if (!th) return;
        handleSort(table, th.dataset.sort, th);
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
      let _scrollTick = false;
      window.addEventListener(
        "scroll",
        function () {
          if (_scrollTick) return;
          _scrollTick = true;
          requestAnimationFrame(function () {
            scrollBtn.classList.toggle("visible", window.scrollY > 400);
            _scrollTick = false;
          });
        },
        { passive: true },
      );
      scrollBtn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  });

  /* ========== TAB SWITCHING ========== */

  function destroyChart(ref) {
    if (ref) ref.destroy();
    return null;
  }

  window.showTab = function (tabId) {
    /* Destroy chart instances when leaving their tabs to free GPU memory */
    const prevTab = document.querySelector(".tab.active");
    if (prevTab) {
      const prevId = prevTab.dataset.tab;
      if (prevId === "profiles") {
        profileChartInstance = destroyChart(profileChartInstance);
        profilePctChartInstance = destroyChart(profilePctChartInstance);
        profileSprintChartInstance = destroyChart(profileSprintChartInstance);
        profileDonutInstance = destroyChart(profileDonutInstance);
        profileQuadrantInstance = destroyChart(profileQuadrantInstance);
      }
      if (prevId === "leaderboards")
        lbChartInstance = destroyChart(lbChartInstance);
      if (prevId === "compare") _destroyAllCmpCharts();
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

  /* Shared helper: builds age-adjustment factor table rows HTML */
  function buildAgeFactorRows(ageFactors, ageFactorsSpeed) {
    return Object.entries(ageFactors)
      .sort((a, b) => b[0] - a[0])
      .map(([g, f]) => {
        const sf = ageFactorsSpeed[g];
        return `<tr><td>${g}th</td><td>${f.toFixed(2)}</td><td>${sf.toFixed(2)}</td><td>${f === 1 ? "Full standard (baseline)" : "Strength × " + f.toFixed(2) + ", Speed × " + sf.toFixed(2)}</td></tr>`;
      })
      .join("");
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

  /* Get the most recent previous test value for a given metric key (jsonKey) */
  let _prevTestCache = null;
  let _staleKeysCache = null;

  function getPrevTestValues(athleteId) {
    if (!_prevTestCache) _prevTestCache = {};
    if (_prevTestCache[athleteId]) return _prevTestCache[athleteId];
    const entries = getAthleteHistory(athleteId); // sorted newest-first
    const vals = {};
    // Walk newest-to-oldest; first non-null value for each key wins
    for (const e of entries) {
      for (const mk of TEST_METRIC_KEYS) {
        if (vals[mk.key] === undefined) {
          const v = e.values[mk.jsonKey];
          if (v !== null && v !== undefined) vals[mk.key] = v;
        }
      }
    }
    _prevTestCache[athleteId] = vals;
    // Derive forty from sprint splits if available
    if (
      vals.sprint020 != null &&
      vals.sprint2030 != null &&
      vals.sprint3040 != null &&
      !vals.forty
    ) {
      vals.forty = +(
        vals.sprint020 +
        vals.sprint2030 +
        vals.sprint3040
      ).toFixed(2);
    }
    return vals;
  }

  /**
   * Return a Set of metric KEYS whose current value exists but was NOT part of
   * the athlete's most recent test entry.  These are "stale" — carried over from
   * an older session and should render in italics.
   *
   */
  function getStaleKeys(athleteId) {
    if (!_staleKeysCache) _staleKeysCache = {};
    if (_staleKeysCache[athleteId]) return _staleKeysCache[athleteId];
    const entries = getAthleteHistory(athleteId); // newest-first
    const stale = new Set();
    if (!entries || entries.length === 0) {
      _staleKeysCache[athleteId] = stale;
      return stale;
    }
    const latest = entries[0]; // most recent test snapshot
    // Skip completely empty entries (e.g. new test worksheet opened but not filled)
    let latestWithData = latest;
    for (let ei = 0; ei < entries.length; ei++) {
      if (Object.values(entries[ei].values).some((v) => v != null)) {
        latestWithData = entries[ei];
        break;
      }
    }
    for (const mk of TEST_METRIC_KEYS) {
      const inLatest =
        latestWithData.values.hasOwnProperty(mk.jsonKey) &&
        latestWithData.values[mk.jsonKey] !== null &&
        latestWithData.values[mk.jsonKey] !== undefined;
      if (!inLatest) stale.add(mk.key);
    }
    // Derived keys: forty is stale if all sprint splits are stale
    if (
      stale.has("sprint020") &&
      stale.has("sprint2030") &&
      stale.has("sprint3040")
    ) {
      stale.add("forty");
    } else {
      stale.delete("forty");
    }
    // Derived keys from weight + primary metrics
    if (stale.has("bench")) {
      stale.add("relBench");
    }
    if (stale.has("squat")) {
      stale.add("relSquat");
    }
    if (stale.has("medball")) {
      stale.add("mbRel");
    }
    // vert drives peakPower
    if (stale.has("vert")) {
      stale.add("peakPower");
      stale.add("relPeakPower");
    }
    // Sprint-derived metrics stale if sprint splits are stale
    if (stale.has("sprint020")) {
      for (const k of ["v1", "a1", "F1", "mom1", "pow1", "massKg"])
        stale.add(k);
    }
    if (stale.has("sprint2030")) {
      for (const k of ["v2", "a2", "F2", "pow2"]) stale.add(k);
    }
    if (stale.has("sprint3040")) {
      for (const k of ["v3", "a3", "F3", "pow3"]) stale.add(k);
    }
    if (
      stale.has("sprint020") &&
      stale.has("sprint2030") &&
      stale.has("sprint3040")
    ) {
      for (const k of ["vMax", "v10Max", "topMph", "momMax"]) stale.add(k);
    }
    _staleKeysCache[athleteId] = stale;
    return stale;
  }

  function tdNum(val, decimals) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    return `<td class="num">${fmt(val, decimals)}</td>`;
  }

  function tdNumStale(val, decimals) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    return `<td class="num stale-val" title="Previous test data">${fmt(val, decimals)}</td>`;
  }

  function tdGraded(val, decimals, grade) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    if (!grade) return `<td class="num">${v}</td>`;
    return `<td class="num grade-text-${grade.tier}" title="${grade.label}">${v}</td>`;
  }

  function tdGradedStale(val, decimals, grade) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    if (!grade)
      return `<td class="num stale-val" title="Previous test data">${v}</td>`;
    return `<td class="num stale-val grade-text-${grade.tier}" title="${grade.label} (previous test data)">${v}</td>`;
  }

  function tdNumColoredStale(val, decimals) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    const cls = val < 0 ? "z-neg" : val > 0 ? "z-pos" : "";
    return `<td class="num stale-val ${cls}" title="Previous test data">${v}</td>`;
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
    // Compute summary stats in a single pass
    const sumKeys = [
      "bench",
      "squat",
      "medball",
      "vert",
      "forty",
      "peakPower",
      "relBench",
      "relSquat",
      "relPeakPower",
    ];
    const sums = {},
      counts = {};
    for (const k of sumKeys) {
      sums[k] = 0;
      counts[k] = 0;
    }
    const coreFields = ["bench", "squat", "medball", "vert", "broad", "forty"];
    let fullyTested = 0;
    for (const a of list) {
      for (const k of sumKeys) {
        if (a[k] !== null && a[k] !== undefined) {
          sums[k] += a[k];
          counts[k]++;
        }
      }
      if (coreFields.every((k) => a[k] !== null)) fullyTested++;
    }
    const avgOf = (k) => (counts[k] > 0 ? sums[k] / counts[k] : null);
    const avgBench = avgOf("bench");
    const avgSquat = avgOf("squat");
    const avgMB = avgOf("medball");
    const avg40 = avgOf("forty");
    const avgVert = avgOf("vert");
    const avgPP = avgOf("peakPower");
    const avgRelB = avgOf("relBench");
    const avgRelS = avgOf("relSquat");
    const avgRelPP = avgOf("relPeakPower");
    const completePct = total > 0 ? Math.round((fullyTested / total) * 100) : 0;

    const showRel = localStorage.getItem("lc_show_relatives") === "true";

    var cardsHtml = `
      <div class="summary-card"><div class="label">Athletes</div><div class="value">${total}</div><div class="sub">${D.positions.length} positions</div></div>
      <div class="summary-card"><div class="label">Avg Bench</div><div class="value">${avgBench ? avgBench.toFixed(0) : "—"}<small> lb</small></div><div class="sub">${counts.bench} tested${showRel && avgRelB ? " · " + avgRelB.toFixed(2) + " xBW" : ""}</div></div>
      <div class="summary-card"><div class="label">Avg Squat</div><div class="value">${avgSquat ? avgSquat.toFixed(0) : "—"}<small> lb</small></div><div class="sub">${counts.squat} tested${showRel && avgRelS ? " · " + avgRelS.toFixed(2) + " xBW" : ""}</div></div>
      <div class="summary-card"><div class="label">Avg MB Throw</div><div class="value">${avgMB ? avgMB.toFixed(0) : "—"}<small> in</small></div><div class="sub">${counts.medball} tested</div></div>
      <div class="summary-card"><div class="label">Avg Vert</div><div class="value">${avgVert ? avgVert.toFixed(1) : "—"}<small> in</small></div><div class="sub">${counts.vert} tested</div></div>
      <div class="summary-card"><div class="label">Avg 40 yd</div><div class="value">${avg40 ? avg40.toFixed(2) : "—"}<small> s</small></div><div class="sub">${counts.forty} tested</div></div>
      <div class="summary-card"><div class="label">Avg Peak Power</div><div class="value">${avgPP ? avgPP.toFixed(0) : "—"}<small> W</small></div><div class="sub">${counts.peakPower} tested${showRel && avgRelPP ? " · " + avgRelPP.toFixed(1) + " W/kg" : ""}</div></div>
      <div class="summary-card"><div class="label">Data Completeness</div><div class="value">${completePct}<small>%</small></div><div class="sub">${fullyTested}/${total} fully tested</div></div>
    `;
    if (showRel) {
      cardsHtml += `
        <div class="summary-card"><div class="label">Avg Rel Bench</div><div class="value">${avgRelB ? avgRelB.toFixed(2) : "—"}<small> xBW</small></div><div class="sub">${counts.relBench} tested</div></div>
        <div class="summary-card"><div class="label">Avg Rel Squat</div><div class="value">${avgRelS ? avgRelS.toFixed(2) : "—"}<small> xBW</small></div><div class="sub">${counts.relSquat} tested</div></div>
        <div class="summary-card"><div class="label">Avg Rel PP</div><div class="value">${avgRelPP ? avgRelPP.toFixed(1) : "—"}<small> W/kg</small></div><div class="sub">${counts.relPeakPower} tested</div></div>
      `;
    }
    document.getElementById("summaryCards").innerHTML = cardsHtml;

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
    const rosterWrap = document.querySelector(".roster-table-wrap");
    if (rosterWrap) rosterWrap.classList.toggle("has-rel-cols", !!showRel);

    // Dynamically build thead to reflect toggle state
    var thead = document.querySelector("#rosterTable thead");
    var thRow = "<tr>";
    thRow += '<th data-sort="name">Athlete</th>';
    thRow += '<th data-sort="position" title="Playing position">Pos</th>';
    thRow +=
      '<th data-sort="group" title="Position group">' +
      (showRel ? "Grp" : "Group") +
      "</th>";
    thRow +=
      '<th data-sort="grade" title="Current grade level (6th–12th)">' +
      (showRel ? "Gr" : "Grade") +
      "</th>";
    if (showRel) {
      thRow +=
        '<th data-sort="trainingAge" title="Training age = grade − 8 (years of development)">TA</th>';
    }
    thRow +=
      '<th data-sort="height" title="Standing height in inches">' +
      (showRel ? "Ht" : "Ht (in)") +
      "</th>";
    thRow +=
      '<th data-sort="weight" title="Body weight in pounds">' +
      (showRel ? "Wt" : "Wt (lb)") +
      "</th>";
    thRow +=
      '<th data-sort="bench" title="Bench Press 1RM (lb)">' +
      (showRel ? "BP" : "Bench") +
      "</th>";
    if (showRel) {
      thRow +=
        '<th data-sort="relBench" title="Bench Press / Body Weight (xBW)">rBP</th>';
    }
    thRow +=
      '<th data-sort="squat" title="Back Squat 1RM (lb)">' +
      (showRel ? "SQ" : "Squat") +
      "</th>";
    if (showRel) {
      thRow +=
        '<th data-sort="relSquat" title="Squat / Body Weight (xBW)">rSQ</th>';
    }
    thRow +=
      '<th data-sort="medball" title="Seated Med Ball Throw (in)">MB</th>';
    if (showRel) {
      thRow +=
        '<th data-sort="mbRel" title="Med Ball / Body Weight (in/lb)">rMB</th>';
    }
    thRow += '<th data-sort="vert" title="Vertical Jump (in)">VJ</th>';
    thRow += '<th data-sort="broad" title="Broad Jump (in)">BJ</th>';
    thRow +=
      '<th data-sort="forty" title="40-Yard Dash (s). Lower is better.">' +
      (showRel ? "40" : "40 yd") +
      "</th>";
    if (showRel) {
      thRow +=
        '<th data-sort="peakPower" title="Peak Power via Sayers equation (W)">PP</th>';
      thRow +=
        '<th data-sort="relPeakPower" title="Peak Power / Mass (W/kg)">rPP</th>';
    }
    thRow += '<th data-sort="zMB" title="Med Ball Z-Score">zMB</th>';
    thRow += '<th data-sort="overallGrade" title="Overall rating">Rating</th>';
    const showCohort = localStorage.getItem("lc_cohort_mode") === "true";
    if (showCohort) {
      thRow +=
        '<th data-sort="cohortPct" title="Avg percentile within body-profile & position cohort">Cohort&nbsp;%</th>';
    }
    thRow += "</tr>";
    thead.innerHTML = thRow;

    tbody.innerHTML = list
      .map((a) => {
        const isTested = coreFields.some((k) => a[k] !== null);
        const rowCls = isTested ? "clickable" : "clickable untested-row";
        // Look up previous test values for missing cells
        const prev = getPrevTestValues(a.id);
        const staleKeys = getStaleKeys(a.id);
        // Helper: render current value (stale-styled if from older test) or fall back to previous
        function cellG(key, dec, grade) {
          if (a[key] !== null && a[key] !== undefined) {
            return staleKeys.has(key)
              ? tdGradedStale(a[key], dec, grade)
              : tdGraded(a[key], dec, grade);
          }
          if (prev[key] !== null && prev[key] !== undefined)
            return tdNumStale(prev[key], dec);
          return '<td class="num na">—</td>';
        }
        function cellN(key, dec) {
          if (a[key] !== null && a[key] !== undefined) {
            return staleKeys.has(key)
              ? tdNumStale(a[key], dec)
              : tdNum(a[key], dec);
          }
          if (prev[key] !== null && prev[key] !== undefined)
            return tdNumStale(prev[key], dec);
          return '<td class="num na">—</td>';
        }
        var relCols = "";
        if (showRel) {
          relCols =
            '<td class="num">' +
            (a.trainingAge !== null ? a.trainingAge : "—") +
            "</td>";
        }
        var relBenchCol = showRel
          ? cellG("relBench", 2, a.grades.relBench)
          : "";
        var relSquatCol = showRel
          ? cellG("relSquat", 2, a.grades.relSquat)
          : "";
        var mbRelCol = showRel ? cellG("mbRel", 2, a.grades.mbRel) : "";
        var ppCols = showRel
          ? cellG("peakPower", 0, a.grades.peakPower) +
            cellG("relPeakPower", 1, a.grades.relPeakPower)
          : "";
        return `
      <tr class="${rowCls}" tabindex="0" role="button" onclick="selectAthlete('${escJs(a.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectAthlete('${escJs(a.id)}')}">
        <td><strong>${esc(a.name)}</strong>${!isTested ? ' <span class="untested-badge">Untested</span>' : ""}</td>
        <td>${esc(a.position) || "—"}</td>
        <td><span class="group-tag group-${(a.group || "").replace(/\s/g, "")}">${esc(a.group || "—")}</span></td>
        <td class="num">${a.grade ? ordGrade(a.grade) : "—"}</td>
        ${relCols}
        ${cellN("height", 0)}
        ${cellN("weight", 0)}
        ${cellG("bench", 0, a.grades.bench)}
        ${relBenchCol}
        ${cellG("squat", 0, a.grades.squat)}
        ${relSquatCol}
        ${cellG("medball", 0, a.grades.medball)}
        ${mbRelCol}
        ${cellG("vert", 1, a.grades.vert)}
        ${cellG("broad", 0, a.grades.broad)}
        ${cellG("forty", 2, a.grades.forty)}
        ${ppCols}
        <td class="num">${fmtZ(a.zMB)}</td>
        ${overallGradeCell(a.overallGrade)}
        ${showCohort ? '<td class="num">' + (a.cohort && a.cohort.avgPct !== null ? a.cohort.avgPct + '<small>% <span title="' + esc(a.cohort.key) + " (n=" + a.cohort.size + ", " + a.cohort.metricsUsed + ' metrics)">(' + a.cohort.size + ")</span></small>" : "—") + "</td>" : ""}
      </tr>
    `;
      })
      .join("");
  };

  window.selectAthlete = function (id) {
    const a = getAthleteById(id);
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
    const a = getAthleteById(id);
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
            <span class="meta-item"><strong>Sport:</strong> ${esc(a.sport) || "Football"}</span>
            <span class="meta-item"><strong>Position:</strong> ${esc(a.position) || "N/A"}</span>
            <span class="meta-item"><strong>Group:</strong> <span class="group-tag group-${(a.group || "").replace(/\s/g, "")}">${a.group || "—"}</span></span>
            <span class="meta-item"><strong>Grade:</strong> ${a.grade ? ordGrade(a.grade) : "N/A"}</span>
            <span class="meta-item"><strong>Training Age:</strong> ${a.trainingAge !== null ? a.trainingAge + " yr" + (a.trainingAge !== 1 ? "s" : "") : "N/A"}</span>
            <span class="meta-item"><strong>Height:</strong> ${a.height ? fmtHeight(a.height) + " (" + a.height + " in)" : "N/A"}</span>
            <span class="meta-item"><strong>Weight:</strong> ${a.weight ? a.weight + " lb (" + a.massKg + " kg)" : "N/A"}</span>
            <span class="meta-item"><strong>ID:</strong> ${a.id}</span>
            ${D.ageAdjusted ? '<span class="meta-item"><span class="grade-badge grade-bg-good" style="font-size:.65rem">Age-Adjusted</span></span>' : ""}
            ${D.bodyAdjusted ? '<span class="meta-item"><span class="grade-badge grade-bg-good" style="font-size:.65rem">Body-Adjusted</span></span>' : ""}
          </div>
          ${
            a.cohort && a.cohort.avgPct !== null
              ? `
          <div class="profile-cohort-bar">
            <span class="cohort-label">Cohort Rank:</span>
            <span class="grade-badge grade-bg-${pctToGradeTier(a.cohort.avgPct)}" style="font-size:.65rem">${a.cohort.avgPct}th pctl</span>
            <span class="cohort-detail">${esc(a.cohort.key)} (n=${a.cohort.size}, ${a.cohort.metricsUsed} metrics)</span>
          </div>`
              : ""
          }
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
        ${metricCard("Med Ball Throw", a.medball, "in", a.medball ? Math.floor(a.medball / 12) + "'" + (a.medball % 12) + '" (' + a.medball + " in)" : null, a.grades.medball)}
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
  const _normCache = new Map();
  function _getMinMax(key) {
    if (_normCache.has(key)) return _normCache.get(key);
    const vals = window.CLUB.athletes
      .map((x) => x[key])
      .filter((v) => v !== null);
    if (vals.length === 0) {
      _normCache.set(key, { min: 0, max: 0 });
      return { min: 0, max: 0 };
    }
    let min = vals[0],
      max = vals[0];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] < min) min = vals[i];
      if (vals[i] > max) max = vals[i];
    }
    const result = { min, max };
    _normCache.set(key, result);
    return result;
  }
  function invalidateNormCache() {
    _normCache.clear();
  }

  function normMetric(val, key) {
    if (val == null) return 0;
    const { max } = _getMinMax(key);
    return max > 0 ? Math.round((val / max) * 100) : 0;
  }
  function normMetricInv(val, key) {
    if (val == null) return 0;
    const { min, max } = _getMinMax(key);
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
        ...chartAnimOpts(),
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
        ...chartAnimOpts(),
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
        ...chartAnimOpts(),
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

    const tierCounts = {};
    for (const t of GRADE_TIER_ORDER) tierCounts[t] = 0;

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
        labels: activeTiers.map((t) => GRADE_TIER_LABELS[t]),
        datasets: [
          {
            data: activeTiers.map((t) => tierCounts[t]),
            backgroundColor: activeTiers.map(
              (t) => GRADE_TIER_COLORS[t] + "44",
            ),
            borderColor: activeTiers.map((t) => GRADE_TIER_COLORS[t]),
            borderWidth: 2,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        ...chartAnimOpts(),
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
        ...chartAnimOpts(),
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
          annotation: Chart.registry?.plugins?.get("annotation")
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
      const pct =
        total <= 1 ? 100 : Math.round(((total - rank) / (total - 1)) * 100);
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
    if (shown.length >= 2) html += "<th>Change</th>";
    else if (shown.length === 1) html += "<th>vs Test</th>";
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
      // Delta column
      var newV = null,
        oldV = null;
      if (shown.length >= 2) {
        newV = shown[0].values[mk.jsonKey];
        oldV = shown[1].values[mk.jsonKey];
      } else if (shown.length === 1) {
        newV = curVal;
        oldV = shown[0].values[mk.jsonKey];
      }
      if (shown.length >= 1) {
        if (newV != null && oldV != null) {
          var delta = newV - oldV;
          var pctChange =
            oldV !== 0 ? Math.round((delta / Math.abs(oldV)) * 100) : 0;
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
    html += '<td class="num">' + (curForty != null ? curForty : "—") + "</td>";
    for (var fi = 0; fi < shown.length; fi++) {
      var fv = shown[fi].values;
      var hForty =
        fv.sprint_020 != null &&
        fv.sprint_2030 != null &&
        fv.sprint_3040 != null
          ? +(fv.sprint_020 + fv.sprint_2030 + fv.sprint_3040).toFixed(2)
          : null;
      html += '<td class="num">' + (hForty !== null ? hForty : "—") + "</td>";
    }
    if (shown.length >= 2) {
      var fvNewer = shown[0].values;
      var fvOlder = shown[1].values;
      var newerForty =
        fvNewer.sprint_020 != null &&
        fvNewer.sprint_2030 != null &&
        fvNewer.sprint_3040 != null
          ? +(
              fvNewer.sprint_020 +
              fvNewer.sprint_2030 +
              fvNewer.sprint_3040
            ).toFixed(2)
          : null;
      var olderForty =
        fvOlder.sprint_020 != null &&
        fvOlder.sprint_2030 != null &&
        fvOlder.sprint_3040 != null
          ? +(
              fvOlder.sprint_020 +
              fvOlder.sprint_2030 +
              fvOlder.sprint_3040
            ).toFixed(2)
          : null;
      if (newerForty !== null && olderForty !== null) {
        var fd = newerForty - olderForty;
        var fpct =
          olderForty !== 0 ? Math.round((fd / Math.abs(olderForty)) * 100) : 0;
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
    } else if (shown.length === 1) {
      var fvLast = shown[0].values;
      var lastForty =
        fvLast.sprint_020 != null &&
        fvLast.sprint_2030 != null &&
        fvLast.sprint_3040 != null
          ? +(
              fvLast.sprint_020 +
              fvLast.sprint_2030 +
              fvLast.sprint_3040
            ).toFixed(2)
          : null;
      if (curForty !== null && lastForty !== null) {
        var fd1 = curForty - lastForty;
        var fpct1 =
          lastForty !== 0 ? Math.round((fd1 / Math.abs(lastForty)) * 100) : 0;
        var fImproved1 = fd1 < 0;
        var fDeclined1 = fd1 > 0;
        var fCls1 = fImproved1
          ? "delta-up"
          : fDeclined1
            ? "delta-down"
            : "delta-flat";
        var fArrow1 = fImproved1 ? "▲" : fDeclined1 ? "▼" : "—";
        var fSign1 = fd1 > 0 ? "+" : "";
        html +=
          '<td class="num ' +
          fCls1 +
          '">' +
          fArrow1 +
          " " +
          fSign1 +
          fd1.toFixed(2) +
          " <small>(" +
          fSign1 +
          fpct1 +
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
      var _eId = escJs(a.id);
      var _eDate = escJs(shown[di].date);
      var _eLabel = escJs(shown[di].label);
      html += '<span class="history-action-group">';
      html +=
        '<button class="btn btn-xs btn-muted" onclick="openEditPanel(\'' +
        _eId +
        "'); setTimeout(function(){ editHistoryEntry('" +
        _eId +
        "','" +
        _eDate +
        "','" +
        _eLabel +
        '\')},300)" title="Edit this test">✏️</button>';
      html +=
        '<button class="btn btn-xs btn-muted" onclick="deleteHistoryEntry(\'' +
        _eId +
        "','" +
        _eDate +
        "','" +
        _eLabel +
        '\')" title="Delete this test">🗑</button>';
      html +=
        '<small class="history-action-name">' +
        esc(shown[di].label || shown[di].date) +
        "</small>";
      html += "</span>";
    }
    html += "</div>";

    return html;
  }

  window.deleteHistoryEntry = function (athleteId, date, label) {
    if (!confirm('Delete test entry "' + label + '" (' + date + ")?")) return;
    deleteTestEntry(athleteId, date, label);
    rebuildFromStorage();
    reRenderAll();
    // Refresh edit panel if open for this athlete
    if (editingAthleteId === athleteId) {
      var a = getAthleteById(athleteId);
      if (a) buildEditFields(a);
    }
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

  /* --- helpers for test notes --- */
  function getTestNotes() {
    return safeLSGet("lc_test_notes", {});
  }
  function setTestNotes(n) {
    safeLSSet("lc_test_notes", n);
  }
  function noteKey(date, label) {
    return date + "|" + label;
  }

  /* --- Collect testMap from history --- */
  function buildTestMap() {
    var h = getTestHistory();
    var athleteIds = Object.keys(h);
    var notes = getTestNotes();
    var testMap = {};
    for (var i = 0; i < athleteIds.length; i++) {
      var aid = athleteIds[i];
      var entries = h[aid];
      for (var j = 0; j < entries.length; j++) {
        var e = entries[j];
        var key = e.label + "|" + e.date;
        if (!testMap[key]) {
          var nk = noteKey(e.date, e.label);
          testMap[key] = {
            label: e.label,
            date: e.date,
            count: 0,
            athletes: [],
            athleteDetails: [],
            note: notes[nk] || "",
          };
        }
        testMap[key].count++;
        var found = getAthleteById(aid);
        var aName = found ? found.name : aid;
        testMap[key].athletes.push(aName);
        var mCount = 0;
        for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
          var v = e.values[TEST_METRIC_KEYS[mk].jsonKey];
          if (v !== null && v !== undefined) mCount++;
        }
        testMap[key].athleteDetails.push({
          name: aName,
          id: aid,
          metrics: mCount,
          values: e.values,
        });
      }
    }
    return { testMap: testMap, athleteIds: athleteIds };
  }

  /* --- View all saved test dates --- */
  window.viewSavedTests = function () {
    var result = buildTestMap();
    var testMap = result.testMap;
    var athleteIds = result.athleteIds;
    var D = window.CLUB;

    var tests = Object.values(testMap).sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });

    var totalEntries = 0;
    for (var t = 0; t < tests.length; t++) totalEntries += tests[t].count;

    // Build test cards
    var cards = "";
    for (var ci = 0; ci < tests.length; ci++) {
      var test = tests[ci];
      var safeDate = esc(test.date);
      var rawLabelLower = test.label.toLowerCase();
      var escapedDate = escJs(test.date);
      var escapedLabel = escJs(test.label);

      // Data completeness
      var totalMetricSlots =
        test.athleteDetails.length * TEST_METRIC_KEYS.length;
      var filledMetricSlots = 0;
      for (var fmi = 0; fmi < test.athleteDetails.length; fmi++) {
        filledMetricSlots += test.athleteDetails[fmi].metrics;
      }
      var completePct =
        totalMetricSlots > 0
          ? Math.round((filledMetricSlots / totalMetricSlots) * 100)
          : 0;

      // Is this the most recent test?
      var isLatest = ci === 0;

      cards +=
        '<div class="th-card' +
        (isLatest ? " th-card-latest" : "") +
        '" data-idx="' +
        ci +
        '" data-date="' +
        safeDate +
        '" data-label="' +
        rawLabelLower +
        '">';
      cards += '<div class="th-card-header">';
      cards += '<div class="th-card-title">';
      cards +=
        '<span class="th-label">' +
        esc(test.label) +
        (isLatest ? ' <span class="th-badge-latest">CURRENT</span>' : "") +
        "</span>";
      cards += '<span class="th-date">' + safeDate + "</span>";
      if (test.note) {
        cards +=
          '<span class="th-note-preview">📝 ' +
          esc(
            test.note.length > 60
              ? test.note.substring(0, 60) + "…"
              : test.note,
          ) +
          "</span>";
      }
      cards += "</div>";
      cards += '<div class="th-card-stats">';
      cards +=
        '<span class="th-stat"><strong>' +
        test.count +
        "</strong> athlete" +
        (test.count !== 1 ? "s" : "") +
        "</span>";
      cards +=
        '<span class="th-stat th-completeness"><span class="th-bar"><span class="th-bar-fill" style="width:' +
        completePct +
        "%;background:" +
        (completePct === 100
          ? "#4ade80"
          : completePct > 50
            ? "#facc15"
            : "#f87171") +
        '"></span></span>' +
        completePct +
        "%</span>";
      cards += "</div>";
      cards += "</div>";
      // Primary action buttons
      cards += '<div class="th-card-actions">';
      cards +=
        '<button class="btn btn-xs" onclick="toggleTestDetail(' +
        ci +
        ')" title="View athlete details">👤 Details</button>';
      cards +=
        '<button class="btn btn-xs btn-primary" onclick="openNewTestEntry(\'' +
        escapedDate +
        "','" +
        escapedLabel +
        '\')" title="Open full worksheet for editing">📝 Worksheet</button>';
      cards +=
        '<button class="btn btn-xs" onclick="applyTestAsCurrent(\'' +
        escapedDate +
        "','" +
        escapedLabel +
        '\')" title="Apply this test data as current athlete values">🔄 Apply as Current</button>';
      // More actions dropdown
      cards += '<div class="th-more-wrap">';
      cards +=
        '<button class="btn btn-xs" onclick="toggleThMore(this)" title="More actions">⋯ More</button>';
      cards += '<div class="th-more-menu">';
      cards +=
        "<button onclick=\"renameTestDate('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">✏️ Rename</button>";
      cards +=
        "<button onclick=\"changeTestDate('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">📅 Change Date</button>";
      cards +=
        "<button onclick=\"duplicateTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">📋 Duplicate</button>";
      cards +=
        "<button onclick=\"editTestNote('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">📝 Notes</button>";
      cards +=
        "<button onclick=\"addAthletesToTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">➕ Add Athletes</button>";
      cards +=
        "<button onclick=\"removeAthleteFromTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">➖ Remove Athlete</button>";
      cards +=
        "<button onclick=\"exportSingleTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">📤 Export</button>";
      cards +=
        '<button class="th-more-danger" onclick="deleteBulkTestEntry(\'' +
        escapedDate +
        "','" +
        escapedLabel +
        "')\">🗑 Delete</button>";
      cards += "</div></div>";
      cards += "</div>";
      // Expandable detail
      cards +=
        '<div class="th-detail" id="thDetail' + ci + '" style="display:none">';
      cards += '<table class="th-detail-table"><thead><tr><th>Athlete</th>';
      for (var hk = 0; hk < TEST_METRIC_KEYS.length; hk++) {
        cards += "<th>" + TEST_METRIC_KEYS[hk].label + "</th>";
      }
      cards += "</tr></thead><tbody>";
      for (var ai = 0; ai < test.athleteDetails.length; ai++) {
        var ad = test.athleteDetails[ai];
        cards += "<tr><td><strong>" + esc(ad.name) + "</strong></td>";
        for (var vk = 0; vk < TEST_METRIC_KEYS.length; vk++) {
          var jsonKey = TEST_METRIC_KEYS[vk].jsonKey;
          var val = ad.values[jsonKey];
          var displayVal = val !== null && val !== undefined ? val : "—";
          cards +=
            '<td class="num ie-cell" data-aid="' +
            esc(ad.id) +
            '" data-date="' +
            safeDate +
            '" data-label="' +
            esc(test.label) +
            '" data-key="' +
            jsonKey +
            '" onclick="inlineEditCell(this)" title="Click to edit">' +
            displayVal +
            "</td>";
        }
        cards += "</tr>";
      }
      var testStats = computeTestAverages(test.athleteDetails);
      cards +=
        "</tbody><tfoot>" +
        buildAvgTableRows(testStats, true) +
        "</tfoot></table>";
      cards += buildAvgSummaryHTML(testStats);
      cards += "</div>";
      cards += "</div>";
    }

    var emptyState =
      athleteIds.length === 0
        ? '<div class="th-empty"><div class="th-empty-icon">📊</div><h3>No Test History Yet</h3><p>Save your first test baseline to start tracking athlete progress over time.</p><button class="btn btn-primary" onclick="document.querySelector(\'.test-history-modal\').remove(); saveAllAsTestDate()">📅 Save Current Team Data</button></div>'
        : "";

    var bodyHTML =
      '<div class="th-modal-body">' +
      '<div class="th-modal-header">' +
      "<h2>📋 Test History Manager</h2>" +
      '<p class="th-summary">' +
      (tests.length > 0
        ? tests.length +
          " test session" +
          (tests.length !== 1 ? "s" : "") +
          " · " +
          totalEntries +
          " total entries · " +
          athleteIds.length +
          " athlete" +
          (athleteIds.length !== 1 ? "s" : "") +
          " tracked"
        : "") +
      "</p>" +
      "</div>" +
      (tests.length > 0
        ? '<div class="th-toolbar">' +
          '<button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.test-history-modal\').remove(); saveAllAsTestDate()">📅 Save New Test Date</button>' +
          '<button class="btn btn-sm" onclick="exportTestHistoryOnly()">📤 Export All</button>' +
          '<label class="btn btn-sm" style="cursor:pointer">📥 Import<input type="file" accept=".json" onchange="importTestHistoryOnly(this)" style="display:none" /></label>' +
          (tests.length >= 2
            ? '<button class="btn btn-sm" onclick="compareTests()">🔀 Compare Tests</button>'
            : "") +
          '<div style="flex:1"></div>' +
          '<div class="th-search-wrap"><input type="text" class="th-search" id="thSearchInput" placeholder="Search tests…" oninput="filterTestCards(this.value)" /></div>' +
          '<select class="th-sort-select" id="thSortSelect" onchange="sortTestCards(this.value)">' +
          '<option value="date-desc">Newest First</option>' +
          '<option value="date-asc">Oldest First</option>' +
          '<option value="name-asc">Name A–Z</option>' +
          '<option value="name-desc">Name Z–A</option>' +
          '<option value="athletes-desc">Most Athletes</option>' +
          "</select>" +
          '<div class="th-view-toggle">' +
          '<button class="btn btn-sm th-view-btn active" data-view="list" onclick="switchThView(\'list\')">☰ List</button>' +
          '<button class="btn btn-sm th-view-btn" data-view="calendar" onclick="switchThView(\'calendar\')">📅 Calendar</button>' +
          "</div>" +
          "</div>"
        : "") +
      (emptyState ||
        '<div id="thListView" class="th-card-list">' + cards + "</div>") +
      '<div id="thCalendarView" class="th-calendar-wrap" style="display:none"></div>' +
      '<div class="th-new-test-bar"><button class="btn btn-primary" onclick="openNewTestEntry()">➕ Start New Test Session</button></div>' +
      '<p class="th-footer-note">Test history is included in full JSON exports and restored on import.</p>' +
      "</div>";

    // Remove existing modal if open
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();

    // Show as a modal overlay
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay test-history-modal";
    overlay.innerHTML =
      '<div class="modal-content th-modal-content">' +
      '<button class="modal-close" aria-label="Close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      bodyHTML +
      "</div>";
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);

    // Build calendar content
    if (tests.length > 0) buildTestCalendar(tests);
  };

  /* --- View toggle (List / Calendar) --- */
  window.switchThView = function (view) {
    var listEl = document.getElementById("thListView");
    var calEl = document.getElementById("thCalendarView");
    if (!listEl || !calEl) return;
    var btns = document.querySelectorAll(".th-view-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle(
        "active",
        btns[i].getAttribute("data-view") === view,
      );
    }
    listEl.style.display = view === "list" ? "" : "none";
    calEl.style.display = view === "calendar" ? "" : "none";
  };

  /* --- Calendar view builder --- */
  function buildTestCalendar(tests) {
    var wrap = document.getElementById("thCalendarView");
    if (!wrap) return;

    // Group tests by YYYY-MM
    var byMonth = {};
    var allDates = [];
    for (var i = 0; i < tests.length; i++) {
      var d = tests[i].date;
      var ym = d.substring(0, 7); // "YYYY-MM"
      if (!byMonth[ym]) byMonth[ym] = {};
      var day = parseInt(d.substring(8, 10), 10);
      if (!byMonth[ym][day]) byMonth[ym][day] = [];
      byMonth[ym][day].push(tests[i]);
      if (allDates.indexOf(d) === -1) allDates.push(d);
    }

    // Sort months chronologically (newest first)
    var months = Object.keys(byMonth).sort(function (a, b) {
      return a > b ? -1 : a < b ? 1 : 0;
    });

    var MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    var html = "";
    for (var mi = 0; mi < months.length; mi++) {
      var ym = months[mi];
      var parts = ym.split("-");
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1; // 0-indexed
      var monthName = MONTH_NAMES[month];
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var firstDow = new Date(year, month, 1).getDay(); // 0=Sun

      // Count total sessions this month
      var monthTests = byMonth[ym];
      var sessionCount = 0;
      for (var dk in monthTests) sessionCount += monthTests[dk].length;

      html += '<div class="cal-month">';
      html +=
        '<div class="cal-month-header"><span class="cal-month-name">' +
        monthName +
        " " +
        year +
        '</span><span class="cal-month-count">' +
        sessionCount +
        " session" +
        (sessionCount !== 1 ? "s" : "") +
        "</span></div>";
      html += '<div class="cal-grid">';
      // Day-of-week headers
      for (var dh = 0; dh < 7; dh++) {
        html += '<div class="cal-dow">' + DAY_NAMES[dh] + "</div>";
      }
      // Leading blanks
      for (var lb = 0; lb < firstDow; lb++) {
        html += '<div class="cal-day cal-blank"></div>';
      }
      // Days
      for (var day = 1; day <= daysInMonth; day++) {
        var dayTests = monthTests[day] || [];
        var hasTests = dayTests.length > 0;
        var dayClass = "cal-day" + (hasTests ? " cal-has-test" : "");
        if (hasTests) {
          html += '<div class="' + dayClass + '" onclick="calDayClick(this)">';
          html += '<span class="cal-day-num">' + day + "</span>";
          html += '<div class="cal-dots">';
          for (var dt = 0; dt < dayTests.length; dt++) {
            html +=
              '<span class="cal-dot" title="' +
              esc(dayTests[dt].label) +
              " (" +
              dayTests[dt].count +
              ' athletes)"></span>';
          }
          html += "</div>";
          // Hidden detail panel
          html += '<div class="cal-day-detail" style="display:none">';
          for (var dt2 = 0; dt2 < dayTests.length; dt2++) {
            var t = dayTests[dt2];
            var eDate = escJs(t.date);
            var eLabel = escJs(t.label);
            html += '<div class="cal-test-item">';
            html += '<span class="cal-test-label">' + esc(t.label) + "</span>";
            html +=
              '<span class="cal-test-count">' +
              t.count +
              " athlete" +
              (t.count !== 1 ? "s" : "") +
              "</span>";
            html += '<div class="cal-test-actions">';
            html +=
              '<button class="btn btn-xs btn-primary" onclick="event.stopPropagation(); openNewTestEntry(\'' +
              eDate +
              "','" +
              eLabel +
              '\')" title="Open worksheet">📝</button>';
            html +=
              '<button class="btn btn-xs" onclick="event.stopPropagation(); applyTestAsCurrent(\'' +
              eDate +
              "','" +
              eLabel +
              '\')" title="Apply as current">🔄</button>';
            html +=
              '<button class="btn btn-xs btn-muted" onclick="event.stopPropagation(); deleteBulkTestEntry(\'' +
              eDate +
              "','" +
              eLabel +
              '\')" title="Delete">🗑</button>';
            html += "</div></div>";
          }
          html += "</div>";
          html += "</div>";
        } else {
          html +=
            '<div class="' +
            dayClass +
            '"><span class="cal-day-num">' +
            day +
            "</span></div>";
        }
      }
      html += "</div></div>";
    }

    // Timeline below the calendar
    html += '<div class="cal-timeline">';
    html += '<div class="cal-timeline-title">📅 Chronological Timeline</div>';
    // Sort tests oldest to newest for timeline
    var sorted = tests.slice().sort(function (a, b) {
      return a.date > b.date ? 1 : a.date < b.date ? -1 : 0;
    });
    for (var ti = 0; ti < sorted.length; ti++) {
      var st = sorted[ti];
      var eDate2 = escJs(st.date);
      var eLabel2 = escJs(st.label);
      html += '<div class="cal-tl-item">';
      html += '<div class="cal-tl-dot"></div>';
      html += '<div class="cal-tl-content">';
      html += '<div class="cal-tl-date">' + esc(st.date) + "</div>";
      html += '<div class="cal-tl-label">' + esc(st.label) + "</div>";
      html +=
        '<div class="cal-tl-meta">' +
        st.count +
        " athlete" +
        (st.count !== 1 ? "s" : "") +
        "</div>";
      html += '<div class="cal-tl-actions">';
      html +=
        '<button class="btn btn-xs btn-primary" onclick="openNewTestEntry(\'' +
        eDate2 +
        "','" +
        eLabel2 +
        "')\">📝 Worksheet</button>";
      html +=
        '<button class="btn btn-xs" onclick="applyTestAsCurrent(\'' +
        eDate2 +
        "','" +
        eLabel2 +
        "')\">🔄 Apply</button>";
      html += "</div>";
      html += "</div></div>";
    }
    html += "</div>";

    wrap.innerHTML = html;
  }

  window.calDayClick = function (el) {
    var detail = el.querySelector(".cal-day-detail");
    if (!detail) return;
    // Close any other open details
    var allOpen = document.querySelectorAll('.cal-day-detail[style*="block"]');
    for (var i = 0; i < allOpen.length; i++) {
      if (allOpen[i] !== detail) allOpen[i].style.display = "none";
    }
    detail.style.display = detail.style.display === "none" ? "block" : "none";
  };

  /* --- Inline cell editing in test history modal --- */
  window.inlineEditCell = function (td) {
    // Don't re-enter if already editing
    if (td.querySelector("input")) return;
    var current = td.textContent.trim();
    if (current === "—") current = "";
    td.classList.add("ie-editing");
    var input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.className = "ie-input";
    input.value = current;
    input.setAttribute("data-original", current);
    td.textContent = "";
    td.appendChild(input);
    input.focus();
    input.select();
    input.addEventListener("blur", function () {
      commitInlineEdit(td, input);
    });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        input.blur();
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        input.value = input.getAttribute("data-original");
        input.blur();
      }
      // Tab to next editable cell
      if (ev.key === "Tab") {
        ev.preventDefault();
        input.blur();
        var cells = Array.from(
          td.closest("table").querySelectorAll(".ie-cell"),
        );
        var idx = cells.indexOf(td);
        var next = ev.shiftKey ? cells[idx - 1] : cells[idx + 1];
        if (next) next.click();
      }
    });
  };

  window.commitInlineEdit = function (td, input) {
    var newVal = input.value.trim();
    var original = input.getAttribute("data-original");
    var aid = td.getAttribute("data-aid");
    var date = td.getAttribute("data-date");
    var label = td.getAttribute("data-label");
    var key = td.getAttribute("data-key");
    td.classList.remove("ie-editing");

    // No change
    if (newVal === original) {
      td.textContent = original || "—";
      return;
    }

    // Update localStorage
    var h = getTestHistory();
    if (!h[aid]) h[aid] = [];
    var found = false;
    for (var i = 0; i < h[aid].length; i++) {
      if (h[aid][i].date === date && h[aid][i].label === label) {
        if (newVal === "") {
          h[aid][i].values[key] = null;
        } else {
          var parsed = parseFloat(newVal);
          if (isNaN(parsed)) {
            td.textContent = original || "—";
            return;
          }
          h[aid][i].values[key] = parsed;
        }
        found = true;
        break;
      }
    }
    if (!found) {
      var parsedNew = newVal === "" ? null : parseFloat(newVal);
      if (parsedNew !== null && isNaN(parsedNew)) {
        td.textContent = original || "—";
        return;
      }
      var newEntry = { date: date, label: label, values: {} };
      newEntry.values[key] = parsedNew;
      h[aid].push(newEntry);
    }
    setTestHistory(h);

    // Update cell display
    td.textContent = newVal || "—";
    td.classList.add("ie-saved");
    setTimeout(function () {
      td.classList.remove("ie-saved");
    }, 800);

    // Update progress column if in test entry worksheet
    var row = td.closest("tr");
    if (row) {
      var progressCell = row.querySelector(".te-progress");
      if (progressCell) {
        var cells = row.querySelectorAll(".ie-cell");
        var filled = 0;
        cells.forEach(function (c) {
          var t = c.textContent.trim();
          if (t && t !== "—") filled++;
        });
        var pct = Math.round((filled / TEST_METRIC_KEYS.length) * 100);
        progressCell.textContent = pct + "%";
        progressCell.className =
          "te-progress " +
          (pct === 100 ? "te-complete" : pct > 0 ? "te-partial" : "te-none");
      }
    }

    // Refresh profile if visible
    var selId = document.getElementById("athleteSelect").value;
    if (selId) renderProfile();
  };

  window.toggleTestDetail = function (idx) {
    var el = document.getElementById("thDetail" + idx);
    if (!el) return;
    el.style.display = el.style.display === "none" ? "block" : "none";
  };

  window.renameTestDate = function (date, oldLabel) {
    var newLabel = prompt(
      'Rename test "' + oldLabel + '" (' + date + "):",
      oldLabel,
    );
    if (newLabel === null || !newLabel.trim() || newLabel.trim() === oldLabel)
      return;
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
    // Migrate test notes to new label
    var notes = getTestNotes();
    var oldNk = noteKey(date, oldLabel);
    var newNk = noteKey(date, newLabel);
    if (notes[oldNk]) {
      notes[newNk] = notes[oldNk];
      delete notes[oldNk];
      setTestNotes(notes);
    }
    showToast(
      'Renamed to "' + newLabel + '" (' + renamed + " entries)",
      "success",
    );
    viewSavedTests(); // refresh modal
    var pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
  };

  window.exportSingleTest = function (date, label) {
    var h = getTestHistory();
    var D = window.CLUB;
    var exportObj = {
      source: "BC Personal Fitness Club — Test Export",
      exportDate: new Date().toISOString(),
      testDate: date,
      testLabel: label,
      entries: [],
    };
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          var found = getAthleteById(ids[i]);
          exportObj.entries.push({
            athleteId: ids[i],
            athleteName: found ? found.name : ids[i],
            date: date,
            label: label,
            values: h[ids[i]][j].values,
          });
        }
      }
    }
    var json = JSON.stringify(exportObj, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "test_" + label.replace(/\s+/g, "_").toLowerCase() + "_" + date + ".json";
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
    showToast(
      'Exported "' + label + '" — ' + exportObj.entries.length + " athletes",
      "success",
    );
  };

  window.exportTestHistoryOnly = function () {
    var h = getTestHistory();
    if (Object.keys(h).length === 0) {
      showToast("No test history to export.", "warn");
      return;
    }
    var D = window.CLUB;
    // Enrich with athlete names for readability
    var exportObj = {
      source: "BC Personal Fitness Club — Full Test History",
      exportDate: new Date().toISOString(),
      test_history: h,
      athlete_names: {},
    };
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      var found = getAthleteById(ids[i]);
      if (found) exportObj.athlete_names[ids[i]] = found.name;
    }
    var json = JSON.stringify(exportObj, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "test_history_" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
    showToast(
      "Exported full test history — " + ids.length + " athletes",
      "success",
    );
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
        if (data.test_history && typeof data.test_history === "object") {
          histData = data.test_history;
        }
        // Support single-test export format
        else if (data.entries && Array.isArray(data.entries)) {
          histData = {};
          for (var i = 0; i < data.entries.length; i++) {
            var en = data.entries[i];
            if (!histData[en.athleteId]) histData[en.athleteId] = [];
            histData[en.athleteId].push({
              date: en.date,
              label: en.label,
              values: en.values,
            });
          }
        }

        if (!histData || Object.keys(histData).length === 0) {
          showToast("No test history found in this file.", "error");
          inputEl.value = "";
          return;
        }

        var incoming = Object.keys(histData);
        var mode = confirm(
          "Found test data for " +
            incoming.length +
            ' athlete(s) in "' +
            file.name +
            '".\n\n' +
            "OK = Merge with existing history\nCancel = Replace all existing history",
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
                if (
                  h[aid][ei].date === ne.date &&
                  h[aid][ei].label === ne.label
                ) {
                  exists = true;
                  break;
                }
              }
              if (!exists) h[aid].push(ne);
            }
          }
          setTestHistory(h);
          showToast("Merged test history from " + file.name, "success");
        } else {
          // Replace
          setTestHistory(histData);
          showToast("Replaced test history from " + file.name, "success");
        }

        // Refresh
        viewSavedTests();
        var pid = document.getElementById("athleteSelect").value;
        if (pid) renderProfile();
      } catch (err) {
        console.error("Import test history error:", err);
        showToast("Import failed: " + err.message, "error");
      }
      inputEl.value = "";
    };
    reader.readAsText(file);
  };

  /* --- Open a blank test entry worksheet for all athletes --- */
  window.openNewTestEntry = function (prefillDate, prefillLabel) {
    // Close test history modal if open
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();

    var today = new Date().toISOString().slice(0, 10);
    var dateStr = prefillDate || null;
    var label = prefillLabel || null;

    if (!dateStr) {
      dateStr = prompt("Test date (YYYY-MM-DD):", today);
      if (!dateStr || !dateStr.trim()) return;
      dateStr = dateStr.trim();
    }
    if (!label) {
      label = prompt("Test name / label:", "Test " + dateStr);
      if (!label || !label.trim()) return;
      label = label.trim();
    }

    var D = window.CLUB;
    var athletes = D.athletes.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    var h = getTestHistory();

    // Ensure every athlete has an entry for this date+label (even if empty)
    for (var i = 0; i < athletes.length; i++) {
      var aid = athletes[i].id;
      if (!h[aid]) h[aid] = [];
      var exists = h[aid].some(function (e) {
        return e.date === dateStr && e.label === label;
      });
      if (!exists) {
        h[aid].push({ date: dateStr, label: label, values: {} });
      }
    }
    setTestHistory(h);

    // Build the worksheet table
    var safeDate = esc(dateStr);
    var safeLabel = esc(label);
    var rows = "";
    var filledCount = 0;
    for (var ai = 0; ai < athletes.length; ai++) {
      var a = athletes[ai];
      var entry = null;
      if (h[a.id]) {
        for (var ei = 0; ei < h[a.id].length; ei++) {
          if (h[a.id][ei].date === dateStr && h[a.id][ei].label === label) {
            entry = h[a.id][ei];
            break;
          }
        }
      }
      var vals = entry ? entry.values : {};
      var metricCount = 0;
      rows += "<tr>";
      rows += '<td class="te-athlete-name">' + esc(a.name) + "</td>";
      for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
        var key = TEST_METRIC_KEYS[mk].jsonKey;
        var val = vals[key];
        var display = val !== null && val !== undefined ? val : "";
        if (display !== "") metricCount++;
        rows +=
          '<td class="ie-cell" data-aid="' +
          esc(a.id) +
          '" data-date="' +
          safeDate +
          '" data-label="' +
          safeLabel +
          '" data-key="' +
          key +
          '" onclick="inlineEditCell(this)" title="Click to enter ' +
          TEST_METRIC_KEYS[mk].label +
          '">' +
          (display !== "" ? display : '<span class="te-empty-cell">—</span>') +
          "</td>";
      }
      if (metricCount > 0) filledCount++;
      var pct = Math.round((metricCount / TEST_METRIC_KEYS.length) * 100);
      var pctClass =
        pct === 100 ? "te-complete" : pct > 0 ? "te-partial" : "te-none";
      rows += '<td class="te-progress ' + pctClass + '">' + pct + "%</td>";
      rows += "</tr>";
    }

    var bodyHTML =
      '<div class="th-modal-body">' +
      '<div class="th-modal-header">' +
      "<h2>📝 " +
      safeLabel +
      "</h2>" +
      '<p class="th-summary">' +
      safeDate +
      " · " +
      athletes.length +
      " athletes · Click any cell to enter data</p>" +
      "</div>" +
      '<div class="te-instructions">' +
      "<span>💡 Click a cell to enter a value. <strong>Tab</strong> moves to the next cell. <strong>Enter</strong> saves. <strong>Esc</strong> cancels. Data saves automatically.</span>" +
      "</div>" +
      '<div class="te-table-wrap">' +
      '<table class="th-detail-table te-table">' +
      '<thead><tr><th class="te-athlete-col">Athlete</th>';
    for (var hk = 0; hk < TEST_METRIC_KEYS.length; hk++) {
      bodyHTML +=
        "<th>" +
        TEST_METRIC_KEYS[hk].label +
        ' <small class="te-unit">(' +
        TEST_METRIC_KEYS[hk].unit +
        ")</small></th>";
    }
    bodyHTML += "<th>Done</th></tr></thead>";
    bodyHTML += "<tbody>" + rows + "</tbody>";
    // Compute and append team averages footer
    var wsStats = computeTestAverages(
      athletes.map(function (a) {
        var entry = null;
        if (h[a.id]) {
          for (var ei2 = 0; ei2 < h[a.id].length; ei2++) {
            if (h[a.id][ei2].date === dateStr && h[a.id][ei2].label === label) {
              entry = h[a.id][ei2];
              break;
            }
          }
        }
        return { values: entry ? entry.values : {} };
      }),
    );
    bodyHTML += "<tfoot>" + buildAvgTableRows(wsStats, true, true) + "</tfoot>";
    bodyHTML += "</table></div>";
    // Team averages summary bar
    bodyHTML += buildAvgSummaryHTML(wsStats);
    bodyHTML += '<div class="te-footer">';
    bodyHTML +=
      '<span class="te-footer-stat">' +
      filledCount +
      "/" +
      athletes.length +
      " athletes have data</span>";
    bodyHTML += '<div class="te-footer-actions">';
    bodyHTML +=
      '<button class="btn btn-sm" onclick="document.querySelector(\'.te-modal\').remove(); viewSavedTests()">← Back to Test History</button>';
    bodyHTML +=
      '<button class="btn btn-sm" onclick="applyTestAsCurrent(\'' +
      escJs(dateStr) +
      "','" +
      escJs(label) +
      '\')" title="Update all athlete current values from this test">🔄 Apply as Current Data</button>';
    bodyHTML +=
      '<button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.te-modal\').remove(); viewSavedTests()">✅ Done</button>';
    bodyHTML += "</div></div></div>";

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay te-modal";
    overlay.innerHTML =
      '<div class="modal-content th-modal-content te-content">' +
      '<button class="modal-close" aria-label="Close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      bodyHTML +
      "</div>";
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  };

  /* --- Apply a test session's data as current athlete values --- */
  window.applyTestAsCurrent = function (date, label) {
    if (
      !confirm(
        'Apply "' +
          label +
          '" (' +
          date +
          ") as current values for all athletes? This will overwrite existing data.",
      )
    )
      return;
    var h = getTestHistory();
    var ids = Object.keys(h);
    var edits = safeLSGet("lc_edits", []);
    var count = 0;

    for (var i = 0; i < ids.length; i++) {
      var aid = ids[i];
      for (var j = 0; j < h[aid].length; j++) {
        if (h[aid][j].date === date && h[aid][j].label === label) {
          var vals = h[aid][j].values;
          var changes = {};
          var hasData = false;
          for (var k in vals) {
            if (vals[k] !== null && vals[k] !== undefined) {
              changes[k] = vals[k];
              hasData = true;
            }
          }
          if (hasData) {
            var existing = edits.find(function (e) {
              return e.id === aid;
            });
            if (existing) {
              Object.assign(existing.changes, changes);
            } else {
              edits.push({ id: aid, changes: changes });
            }
            count++;
          }
          break;
        }
      }
    }

    safeLSSet("lc_edits", JSON.stringify(edits));
    rebuildFromStorage();
    markTabsDirty();
    var activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    updateDataStatus();
    var pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
    showToast(
      'Applied "' +
        label +
        '" data to ' +
        count +
        " athletes as current values.",
      "success",
    );
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

  /* --- Change the date of a test session --- */
  window.changeTestDate = function (oldDate, label) {
    var newDate = prompt(
      'Change date for "' + label + '" (currently ' + oldDate + "):",
      oldDate,
    );
    if (!newDate || !newDate.trim() || newDate.trim() === oldDate) return;
    newDate = newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      showToast("Invalid date format. Use YYYY-MM-DD.", "error");
      return;
    }
    var h = getTestHistory();
    var ids = Object.keys(h);
    var changed = 0;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === oldDate && h[ids[i]][j].label === label) {
          h[ids[i]][j].date = newDate;
          changed++;
        }
      }
    }
    setTestHistory(h);
    // Migrate notes
    var notes = getTestNotes();
    var oldNk = noteKey(oldDate, label);
    var newNk = noteKey(newDate, label);
    if (notes[oldNk]) {
      notes[newNk] = notes[oldNk];
      delete notes[oldNk];
      setTestNotes(notes);
    }
    showToast(
      "Changed date to " + newDate + " (" + changed + " entries)",
      "success",
    );
    rebuildFromStorage();
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
    viewSavedTests();
    var pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
  };

  /* --- Duplicate a test session --- */
  window.duplicateTest = function (date, label) {
    var newDate = prompt("Date for the duplicate (YYYY-MM-DD):", date);
    if (!newDate || !newDate.trim()) return;
    newDate = newDate.trim();
    var newLabel = prompt("Label for the duplicate:", label + " (copy)");
    if (!newLabel || !newLabel.trim()) return;
    newLabel = newLabel.trim();
    if (newDate === date && newLabel === label) {
      showToast("Duplicate must have a different date or label.", "warn");
      return;
    }
    var h = getTestHistory();
    var ids = Object.keys(h);
    var duped = 0;
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          // Deep clone values
          var clonedVals = JSON.parse(JSON.stringify(h[ids[i]][j].values));
          h[ids[i]].push({
            date: newDate,
            label: newLabel,
            values: clonedVals,
          });
          duped++;
          break;
        }
      }
    }
    setTestHistory(h);
    showToast(
      'Duplicated "' +
        label +
        '" → "' +
        newLabel +
        '" (' +
        duped +
        " athletes)",
      "success",
    );
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
    viewSavedTests();
  };

  /* --- Edit notes on a test session --- */
  window.editTestNote = function (date, label) {
    var notes = getTestNotes();
    var nk = noteKey(date, label);
    var current = notes[nk] || "";
    var newNote = prompt('Notes for "' + label + '" (' + date + "):", current);
    if (newNote === null) return;
    if (newNote.trim()) {
      notes[nk] = newNote.trim();
    } else {
      delete notes[nk];
    }
    setTestNotes(notes);
    showToast(newNote.trim() ? "Note saved." : "Note cleared.", "success");
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
    viewSavedTests();
  };

  /* --- Add athletes to an existing test session --- */
  window.addAthletesToTest = function (date, label) {
    var D = window.CLUB;
    var h = getTestHistory();
    // Find athletes NOT in this test
    var inTest = {};
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          inTest[ids[i]] = true;
          break;
        }
      }
    }
    var missing = D.athletes.filter(function (a) {
      return !inTest[a.id];
    });
    if (missing.length === 0) {
      showToast("All athletes are already in this test.", "info");
      return;
    }
    var names = missing
      .map(function (a, idx) {
        return idx + 1 + ". " + a.name;
      })
      .join("\n");
    var reply = prompt(
      'Add athletes to "' +
        label +
        '" (' +
        date +
        "):\n\n" +
        names +
        "\n\n" +
        'Enter numbers separated by commas (e.g. 1,3,5) or "all":',
    );
    if (!reply || !reply.trim()) return;
    reply = reply.trim().toLowerCase();
    var toAdd = [];
    if (reply === "all") {
      toAdd = missing;
    } else {
      var nums = reply.split(",").map(function (s) {
        return parseInt(s.trim(), 10);
      });
      for (var ni = 0; ni < nums.length; ni++) {
        if (nums[ni] >= 1 && nums[ni] <= missing.length) {
          toAdd.push(missing[nums[ni] - 1]);
        }
      }
    }
    if (toAdd.length === 0) {
      showToast("No valid athletes selected.", "warn");
      return;
    }
    for (var ai = 0; ai < toAdd.length; ai++) {
      var aid = toAdd[ai].id;
      if (!h[aid]) h[aid] = [];
      h[aid].push({ date: date, label: label, values: {} });
    }
    setTestHistory(h);
    showToast(
      "Added " + toAdd.length + ' athlete(s) to "' + label + '"',
      "success",
    );
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
    viewSavedTests();
  };

  /* --- Remove an athlete from a test session --- */
  window.removeAthleteFromTest = function (date, label) {
    var D = window.CLUB;
    var h = getTestHistory();
    // Find athletes IN this test
    var inTest = [];
    var ids = Object.keys(h);
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          var found = getAthleteById(ids[i]);
          inTest.push({ id: ids[i], name: found ? found.name : ids[i] });
          break;
        }
      }
    }
    if (inTest.length === 0) {
      showToast("No athletes in this test.", "warn");
      return;
    }
    var names = inTest
      .map(function (a, idx) {
        return idx + 1 + ". " + a.name;
      })
      .join("\n");
    var reply = prompt(
      'Remove athletes from "' +
        label +
        '" (' +
        date +
        "):\n\n" +
        names +
        "\n\nEnter numbers separated by commas (e.g. 1,3):",
    );
    if (!reply || !reply.trim()) return;
    var nums = reply
      .trim()
      .split(",")
      .map(function (s) {
        return parseInt(s.trim(), 10);
      });
    var removed = 0;
    for (var ni = 0; ni < nums.length; ni++) {
      if (nums[ni] >= 1 && nums[ni] <= inTest.length) {
        var rid = inTest[nums[ni] - 1].id;
        if (h[rid]) {
          h[rid] = h[rid].filter(function (e) {
            return !(e.date === date && e.label === label);
          });
          if (h[rid].length === 0) delete h[rid];
          removed++;
        }
      }
    }
    if (removed === 0) {
      showToast("No valid athletes selected.", "warn");
      return;
    }
    setTestHistory(h);
    showToast(
      "Removed " + removed + ' athlete(s) from "' + label + '"',
      "success",
    );
    var existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
    viewSavedTests();
    var pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
  };

  /* --- More actions dropdown toggle --- */
  window.toggleThMore = function (btn) {
    var menu = btn.nextElementSibling;
    var isOpen = menu.classList.contains("th-more-open");
    // Close all open menus
    document
      .querySelectorAll(".th-more-menu.th-more-open")
      .forEach(function (m) {
        m.classList.remove("th-more-open");
      });
    if (!isOpen) menu.classList.add("th-more-open");
  };
  // Close menus when clicking outside
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest(".th-more-wrap")) {
      document
        .querySelectorAll(".th-more-menu.th-more-open")
        .forEach(function (m) {
          m.classList.remove("th-more-open");
        });
    }
  });

  /* --- Search / filter test cards --- */
  window.filterTestCards = function (query) {
    query = (query || "").toLowerCase();
    var cards = document.querySelectorAll("#thListView .th-card");
    for (var i = 0; i < cards.length; i++) {
      var label = cards[i].getAttribute("data-label") || "";
      var date = cards[i].getAttribute("data-date") || "";
      var match =
        !query || label.indexOf(query) >= 0 || date.indexOf(query) >= 0;
      cards[i].style.display = match ? "" : "none";
    }
  };

  /* --- Sort test cards --- */
  window.sortTestCards = function (mode) {
    var list = document.getElementById("thListView");
    if (!list) return;
    var cards = Array.from(list.querySelectorAll(".th-card"));
    cards.sort(function (a, b) {
      var aDate = a.getAttribute("data-date") || "";
      var bDate = b.getAttribute("data-date") || "";
      var aLabel = a.getAttribute("data-label") || "";
      var bLabel = b.getAttribute("data-label") || "";
      // Count athletes from the stat text
      var aCount = parseInt(
        (a.querySelector(".th-stat strong") || {}).textContent || "0",
        10,
      );
      var bCount = parseInt(
        (b.querySelector(".th-stat strong") || {}).textContent || "0",
        10,
      );
      switch (mode) {
        case "date-asc":
          return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
        case "date-desc":
          return aDate > bDate ? -1 : aDate < bDate ? 1 : 0;
        case "name-asc":
          return aLabel < bLabel ? -1 : aLabel > bLabel ? 1 : 0;
        case "name-desc":
          return aLabel > bLabel ? -1 : aLabel < bLabel ? 1 : 0;
        case "athletes-desc":
          return bCount - aCount;
        default:
          return 0;
      }
    });
    for (var i = 0; i < cards.length; i++) list.appendChild(cards[i]);
  };

  /* --- Compare two test sessions side-by-side --- */
  window.compareTests = function () {
    var result = buildTestMap();
    var tests = Object.values(result.testMap).sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });
    if (tests.length < 2) {
      showToast("Need at least 2 test sessions to compare.", "warn");
      return;
    }

    var options = tests
      .map(function (t, i) {
        return i + 1 + ". " + t.label + " (" + t.date + ")";
      })
      .join("\n");
    var pick1 = prompt(
      "Compare Tests — pick FIRST test:\n\n" + options + "\n\nEnter number:",
    );
    if (!pick1) return;
    var idx1 = parseInt(pick1.trim(), 10) - 1;
    if (isNaN(idx1) || idx1 < 0 || idx1 >= tests.length) {
      showToast("Invalid selection.", "warn");
      return;
    }

    var pick2 = prompt(
      'Pick SECOND test to compare with "' +
        tests[idx1].label +
        '":\n\n' +
        options +
        "\n\nEnter number:",
    );
    if (!pick2) return;
    var idx2 = parseInt(pick2.trim(), 10) - 1;
    if (isNaN(idx2) || idx2 < 0 || idx2 >= tests.length || idx2 === idx1) {
      showToast("Invalid or same selection.", "warn");
      return;
    }

    var t1 = tests[idx1];
    var t2 = tests[idx2];
    // Determine older/newer
    var older = t1.date <= t2.date ? t1 : t2;
    var newer = t1.date <= t2.date ? t2 : t1;

    // Build athlete lookup for both
    var olderMap = {};
    for (var oi = 0; oi < older.athleteDetails.length; oi++)
      olderMap[older.athleteDetails[oi].id] = older.athleteDetails[oi];
    var newerMap = {};
    for (var ni = 0; ni < newer.athleteDetails.length; ni++)
      newerMap[newer.athleteDetails[ni].id] = newer.athleteDetails[ni];
    // All athlete IDs in either
    var allIds = {};
    for (var ki in olderMap) allIds[ki] = true;
    for (var ki2 in newerMap) allIds[ki2] = true;
    var D = window.CLUB;

    var html = '<div class="th-modal-body">';
    html += '<div class="th-modal-header"><h2>🔀 Compare Tests</h2>';
    html +=
      '<p class="th-summary">' +
      esc(older.label) +
      " (" +
      older.date +
      ") vs " +
      esc(newer.label) +
      " (" +
      newer.date +
      ")</p></div>";
    html +=
      '<div class="te-instructions"><span>🟢 = improved · 🔴 = declined · ↑↓ arrows show direction of change</span></div>';
    html +=
      '<div class="te-table-wrap"><table class="th-detail-table te-table"><thead><tr>';
    html += "<th>Athlete</th>";
    for (var mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      html += "<th>" + TEST_METRIC_KEYS[mk].label + "</th>";
    }
    html += "</tr></thead><tbody>";

    var sortedIds = Object.keys(allIds).sort(function (a, b) {
      var na = (getAthleteById(a) || {}).name || a;
      var nb = (getAthleteById(b) || {}).name || b;
      return na.localeCompare(nb);
    });

    for (var si = 0; si < sortedIds.length; si++) {
      var aid = sortedIds[si];
      var found = getAthleteById(aid);
      var name = found ? found.name : aid;
      var oEntry = olderMap[aid];
      var nEntry = newerMap[aid];
      html += "<tr><td><strong>" + esc(name) + "</strong></td>";
      for (var cmk = 0; cmk < TEST_METRIC_KEYS.length; cmk++) {
        var jk = TEST_METRIC_KEYS[cmk].jsonKey;
        var lower = TEST_METRIC_KEYS[cmk].lower;
        var oVal = oEntry ? oEntry.values[jk] : null;
        var nVal = nEntry ? nEntry.values[jk] : null;
        if (oVal == null && nVal == null) {
          html += '<td class="num">—</td>';
        } else if (oVal == null) {
          html +=
            '<td class="num">' +
            nVal +
            ' <small class="text-muted">new</small></td>';
        } else if (nVal == null) {
          html +=
            '<td class="num">' +
            oVal +
            ' <small class="text-muted">only old</small></td>';
        } else {
          var diff = nVal - oVal;
          var improved = lower ? diff < 0 : diff > 0;
          var declined = lower ? diff > 0 : diff < 0;
          var cls = improved
            ? "delta-up"
            : declined
              ? "delta-down"
              : "delta-flat";
          var arrow = improved ? "▲" : declined ? "▼" : "—";
          var sign = diff > 0 ? "+" : "";
          html +=
            '<td class="num ' +
            cls +
            '">' +
            nVal +
            " <small>" +
            arrow +
            " " +
            sign +
            Math.round(diff * 100) / 100 +
            "</small></td>";
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    html += '<div class="te-footer"><div class="te-footer-actions">';
    html +=
      '<button class="btn btn-sm btn-primary" onclick="this.closest(\'.cmp-modal\').remove(); viewSavedTests()">← Back</button>';
    html += "</div></div></div>";

    // Close test history modal
    var existingTh = document.querySelector(".test-history-modal");
    if (existingTh) existingTh.remove();

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay cmp-modal";
    overlay.innerHTML =
      '<div class="modal-content th-modal-content">' +
      '<button class="modal-close" aria-label="Close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      html +
      "</div>";
    overlay.addEventListener("click", function (ev) {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
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
      <tr class="clickable" tabindex="0" role="button" onclick="selectAthlete('${escJs(e.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectAthlete('${escJs(e.id)}')}">
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
        ...chartAnimOpts(),
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
  /* ========== DYNAMIC GRADING REFERENCE TABLES ========== */
  const SPRINT_GRADE_KEYS = ["forty", "vMax", "v10Max", "F1", "momMax"];
  const STRENGTH_GRADE_KEYS = [
    "bench",
    "squat",
    "relBench",
    "relSquat",
    "vert",
    "broad",
    "medball",
    "mbRel",
    "peakPower",
    "relPeakPower",
  ];

  const _gradingSportCache = {};

  function renderGradingSection(containerId, category) {
    const D = window.CLUB;
    const container = document.getElementById(containerId);
    if (!container || !D) return;

    const STD = D.hsStandards;
    const SP = D.sportPositions;
    const meta = STD._meta;
    const labels = STD._labels;
    const ageFactors = STD._ageFactors;
    const metricKeys =
      category === "sprint" ? SPRINT_GRADE_KEYS : STRENGTH_GRADE_KEYS;
    const metricMeta = metricKeys
      .map((k) => meta.find((m) => m.key === k))
      .filter(Boolean);

    const sports = Object.keys(STD).filter((k) => !k.startsWith("_"));
    const storageKey = `lc_gradingSport_${category}`;
    let selectedSport =
      _gradingSportCache[category] ||
      localStorage.getItem(storageKey) ||
      "Football";
    if (!sports.includes(selectedSport)) selectedSport = sports[0];

    function build() {
      _gradingSportCache[category] = selectedSport;
      const sportStds = STD[selectedSport];
      const groupNames = Object.keys(sportStds);
      const sp = SP[selectedSport];
      const catLabel =
        category === "sprint" ? "Sprint" : "Strength &amp; power";

      /* --- Intro --- */
      const intro = `<p class="ref-intro">
        ${catLabel} metrics are graded against sport-specific published norms
        (NSCA, state combine databases, S&amp;C literature). Thresholds vary by
        position group because physical demands differ by role. When the
        <strong>Age-Adjusted</strong> toggle is enabled, thresholds are scaled
        by grade level so younger athletes are compared to developmentally
        appropriate standards.
      </p>`;

      /* --- Sport selector --- */
      const sportSel = `<div style="margin-bottom:1rem">
        <label style="font-weight:600;margin-right:.5rem">Sport:</label>
        <select id="${containerId}Sport" style="padding:.3rem .5rem;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
          ${sports.map((s) => `<option value="${s}"${s === selectedSport ? " selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>`;

      /* --- Group tables --- */
      const tables = groupNames
        .map((group) => {
          const stds = sportStds[group];
          const positions = sp?.groups?.[group]?.join(", ") || group;
          const rows = metricMeta
            .map((m) => {
              const thresholds = stds[m.key];
              if (!thresholds) return "";
              const dir = m.invert ? "≤" : "≥";
              const belowDir = m.invert ? "&gt;" : "&lt;";
              const last = thresholds[thresholds.length - 1];
              return `<tr>
              <td>${m.label} (${m.unit})</td>
              ${thresholds.map((t) => `<td>${dir} ${t}</td>`).join("")}
              <td>${belowDir} ${last}</td>
            </tr>`;
            })
            .filter(Boolean)
            .join("");
          return `<div class="grade-table-block">
          <h4>${group} (${positions})</h4>
          <table class="grade-std-table">
            <thead><tr><th>Metric</th>${labels.map((l) => `<th>${l}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
        })
        .join("");

      /* --- Diagnostics --- */
      let diag = "";
      if (category === "sprint") {
        diag = `<div class="ref-category">
          <h4>📊 Ungraded Diagnostic Columns</h4>
          <p class="ref-desc">These columns don't have formal HS standards but are valuable for coaching diagnostics:</p>
          <ul class="ref-diag-list">
            <li><strong>Individual splits (0–20, 20–30, 30–40):</strong> Identify WHERE in the sprint an athlete is strong or weak.</li>
            <li><strong>v1, v2, v3:</strong> Compare velocity across phases — are they still building speed or dropping off?</li>
            <li><strong>a2, a3:</strong> Positive = still accelerating, negative = decelerating. Diagnose speed endurance issues.</li>
            <li><strong>F2, F3:</strong> Force in later phases — typically small. Large negative F3 means significant deceleration.</li>
            <li><strong>p1:</strong> Momentum after acceleration phase — compare to pₑ to see how much momentum they gain in the last 20 yards.</li>
            <li><strong>P1, P2, P3:</strong> Sprint power by phase — P1 is the key performance metric; P2/P3 are diagnostic.</li>
          </ul>
        </div>`;
      } else {
        diag = `<div class="ref-category">
          <h4>📊 Ungraded Diagnostic Columns</h4>
          <p class="ref-desc">These columns don't have formal grading thresholds but provide important context:</p>
          <ul class="ref-diag-list">
            <li><strong>Wt (lb) / Mass (kg):</strong> Body composition context. Not graded because optimal weight varies drastically by position.</li>
            <li><strong>Strength Utilisation:</strong> Diagnostic ratio comparing sprint force to squat strength. Low values flag athletes who are strong in the weight room but aren't expressing it on the field — a coaching target for sprint mechanics and rate-of-force development training.</li>
          </ul>
        </div>`;
      }

      /* --- Age-adjustment docs --- */
      const ageFactorsSpeed = STD._ageFactorsSpeed;
      const ageRows = buildAgeFactorRows(ageFactors, ageFactorsSpeed);
      const ageDoc = `<div class="ref-category">
        <h4>📐 Age-Adjustment Factors</h4>
        <p class="ref-desc">
          When the <strong>Age-Adjusted</strong> toggle is on, thresholds are scaled by a
          grade-based factor. Strength metrics use steeper scaling (younger athletes
          are much weaker); speed/inverted metrics use gentler scaling (speed develops
          faster than strength). For normal metrics, thresholds are <em>multiplied</em>
          by the factor. For inverted metrics, thresholds are <em>divided</em> by the factor.
        </p>
        <table class="grade-std-table std-medium">
          <thead><tr><th>Grade</th><th>Strength</th><th>Speed</th><th>Effect</th></tr></thead>
          <tbody>${ageRows}</tbody>
        </table>
      </div>`;

      /* --- Scoring methodology --- */
      const scoring = `<div class="ref-category">
        <h4>🧮 How Grades Are Calculated</h4>
        <p class="ref-desc">
          Each graded metric is compared against the thresholds above to assign a
          <strong>tier score</strong>: Elite = 5, Excellent = 4, Good = 3, Average = 2,
          Below Avg = 1. An athlete's <strong>Overall Grade</strong> is the average of
          all individual tier scores. The overall average maps to a final tier:
        </p>
        <table class="grade-std-table std-narrow">
          <thead><tr><th>Overall Score</th><th>Tier</th></tr></thead>
          <tbody>
            <tr><td>≥ 4.50</td><td>Elite</td></tr>
            <tr><td>≥ 3.50</td><td>Excellent</td></tr>
            <tr><td>≥ 2.50</td><td>Good</td></tr>
            <tr><td>≥ 1.50</td><td>Average</td></tr>
            <tr><td>&lt; 1.50</td><td>Below Avg</td></tr>
          </tbody>
        </table>
      </div>`;

      container.innerHTML =
        intro +
        sportSel +
        '<div class="grade-tables-wrap">' +
        tables +
        "</div>" +
        diag +
        ageDoc +
        scoring;

      /* Wire sport selector */
      const sel = document.getElementById(`${containerId}Sport`);
      if (sel) {
        sel.onchange = function () {
          selectedSport = this.value;
          localStorage.setItem(storageKey, selectedSport);
          build();
        };
      }
    }

    build();
  }

  function renderSprintAnalysis() {
    const D = window.CLUB;
    renderGradingSection("sprintGradingBody", "sprint");
    const tbody = document.querySelector("#sprintTable tbody");
    const sprinters = D.athletes.filter((a) => a.sprint020 !== null);

    tbody.innerHTML = sprinters
      .map((a) => {
        const sk = getStaleKeys(a.id);
        const sN = (key, dec) =>
          sk.has(key) ? tdNumStale(a[key], dec) : tdNum(a[key], dec);
        const sG = (key, dec, grade) =>
          sk.has(key)
            ? tdGradedStale(a[key], dec, grade)
            : tdGraded(a[key], dec, grade);
        const sC = (key, dec) =>
          sk.has(key)
            ? tdNumColoredStale(a[key], dec)
            : tdNumColored(a[key], dec);
        return `
      <tr class="clickable" tabindex="0" role="button" onclick="selectAthlete('${escJs(a.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectAthlete('${escJs(a.id)}')}">
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.position) || "—"}</td>
        <td class="num">${a.massKg ? a.massKg.toFixed(1) : "—"}</td>
        ${sN("sprint020", 2)}
        ${sN("sprint2030", 2)}
        ${sN("sprint3040", 2)}
        ${sG("forty", 2, a.grades.forty)}
        ${sN("v1", 2)}
        ${sN("v2", 2)}
        ${sN("v3", 2)}
        ${sG("vMax", 2, a.grades.vMax)}
        ${sG("v10Max", 2, a.grades.v10Max)}
        ${sN("topMph", 1)}
        ${sN("a1", 2)}
        ${sC("a2", 2)}
        ${sC("a3", 2)}
        ${sG("F1", 1, a.grades.F1)}
        ${sC("F2", 1)}
        ${sC("F3", 1)}
        ${sG("momMax", 1, a.grades.momMax)}
        ${sN("mom1", 1)}
        ${sN("pow1", 0)}
        ${sC("pow2", 0)}
        ${sC("pow3", 0)}
      </tr>
    `;
      })
      .join("");

    if (sprinters.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="24" class="placeholder-text">No sprint data available.</td></tr>';
    }
  }

  /* ========== STRENGTH & POWER ========== */
  function renderStrengthPower() {
    const D = window.CLUB;
    renderGradingSection("strengthGradingBody", "strength");
    const tbody = document.querySelector("#strengthTable tbody");
    const list = D.athletes.filter(
      (a) =>
        a.bench !== null ||
        a.squat !== null ||
        a.peakPower !== null ||
        a.medball !== null,
    );

    tbody.innerHTML = list
      .map((a) => {
        const sk = getStaleKeys(a.id);
        const sN = (key, dec) =>
          sk.has(key) ? tdNumStale(a[key], dec) : tdNum(a[key], dec);
        const sG = (key, dec, grade) =>
          sk.has(key)
            ? tdGradedStale(a[key], dec, grade)
            : tdGraded(a[key], dec, grade);
        return `
      <tr class="clickable" tabindex="0" role="button" onclick="selectAthlete('${escJs(a.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectAthlete('${escJs(a.id)}')}">
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.position) || "—"}</td>
        ${sN("weight", 0)}
        ${sN("massKg", 1)}
        ${sG("bench", 0, a.grades.bench)}
        ${sG("squat", 0, a.grades.squat)}
        ${sG("relBench", 2, a.grades.relBench)}
        ${sG("relSquat", 2, a.grades.relSquat)}
        ${sG("vert", 1, a.grades.vert)}
        ${sG("peakPower", 0, a.grades.peakPower)}
        ${sG("relPeakPower", 1, a.grades.relPeakPower)}
        ${sG("medball", 0, a.grades.medball)}
        ${sG("mbRel", 2, a.grades.mbRel)}
        ${sN("strengthUtil", 3)}
      </tr>
    `;
      })
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
        '<tr><td colspan="18" class="placeholder-text">No scorecard data available.</td></tr>';
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
        <td><span class="group-tag group-${(a.group || "").replace(/\s/g, "")}">${esc(a.group || "—")}</span></td>
        ${cells}
      </tr>`;
      })
      .join("");
  };

  /* ========== PERFORMANCE STANDARDS ========== */
  window.updateBmGroupOptions = function () {
    const sport = document.getElementById("bmSport")?.value || "Football";
    const sel = document.getElementById("bmGroup");
    if (!sel) return;
    const STD = window.CLUB?.hsStandards;
    if (!STD || !STD[sport]) return;
    const sp = window.CLUB.sportPositions[sport];
    const curVal = sel.value;
    let opts = '<option value="all">All Groups</option>';
    for (const g of Object.keys(STD[sport])) {
      const posInGroup = sp?.groups[g] || [];
      const lbl =
        g + (posInGroup.length ? " (" + posInGroup.join("/") + ")" : "");
      opts += '<option value="' + g + '">' + lbl + "</option>";
    }
    sel.innerHTML = opts;
    if (curVal) sel.value = curVal;
  };

  window.renderBenchmarks = function () {
    const D = window.CLUB;
    const STD = D.hsStandards;

    // Dynamically populate sport dropdown from data
    const bmSportSel = document.getElementById("bmSport");
    if (bmSportSel && bmSportSel.options.length === 0) {
      const sports = Object.keys(STD).filter((k) => !k.startsWith("_"));
      for (const s of sports) {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        bmSportSel.appendChild(o);
      }
    }

    const sFilter = bmSportSel?.value || "Football";
    // Ensure group options match selected sport
    window.updateBmGroupOptions();
    const gFilter = document.getElementById("bmGroup").value;
    const mFilter = document.getElementById("bmMetric").value;
    const container = document.getElementById("benchmarksContent");

    const sportStds = STD[sFilter];
    if (!sportStds) {
      container.innerHTML =
        '<p class="placeholder-text">No standards defined for ' +
        sFilter +
        ".</p>";
      return;
    }
    const allGroups = Object.keys(sportStds);
    const groups = gFilter === "all" ? allGroups : [gFilter];
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
      const gs = sportStds[g];
      if (!gs) continue;
      const groupAthletes = D.athletes.filter(
        (a) => a.group === g && a.sport === sFilter,
      );
      // Build label showing positions in this group
      const sp = D.sportPositions[sFilter];
      const posInGroup = sp?.groups[g] || [];
      const groupLabel =
        g + (posInGroup.length ? " (" + posInGroup.join("/") + ")" : "");

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
          if (e.vert != null) parts.push(`VJ: ${e.vert} in`);
          if (e.broad != null) parts.push(`BJ: ${e.broad} in`);
          result = parts.join(" | ") || "—";
        } else if (e.test === "Strength") {
          const parts = [];
          if (e.bench != null) parts.push(`Bench: ${e.bench} lb`);
          if (e.squat != null) parts.push(`Squat: ${e.squat} lb`);
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
      { key: "MS_TO_MPH", unit: "mph/(m/s)", desc: "Metres/sec to miles/hr" },
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

    /* --- Build sport / position group reference --- */
    const SP = D.sportPositions;
    const sportRows = Object.entries(SP)
      .map(([sport, info]) => {
        const groups = Object.entries(info.groups)
          .map(([g, positions]) => `${g} (${positions.join(", ")})`)
          .join("; ");
        return `<tr><td>${sport}</td><td>${info.positions.join(", ")}</td><td>${groups}</td></tr>`;
      })
      .join("");

    /* --- Build age-adjustment factor reference --- */
    const ageFactors = D.hsStandards._ageFactors;
    const ageFactorsSpeed = D.hsStandards._ageFactorsSpeed;
    const ageRows = buildAgeFactorRows(ageFactors, ageFactorsSpeed);

    notes.innerHTML = `
      <h4>Derived Sprint Formulas</h4>
      <ul>
        <li><strong>Velocity:</strong> v = distance / time (segment distances: 0–20yd = 18.288m, 20–30/30–40 = 9.144m)</li>
        <li><strong>Acceleration:</strong> a₁ = v₁/t₁ (from rest); a₂ = (v₂−v₁)/t₂; a₃ = (v₃−v₂)/t₃</li>
        <li><strong>Force:</strong> F = mass × acceleration (N)</li>
        <li><strong>Impulse:</strong> J = F × t (N·s)</li>
        <li><strong>Momentum:</strong> p = mass × velocity (kg·m/s). Peak Momentum uses the best 10-yard split velocity.</li>
        <li><strong>Power:</strong> P = F × v (W)</li>
        <li><strong>Top Speed (mph):</strong> vMax × MS_TO_MPH (${D.constants.MS_TO_MPH})</li>
      </ul>
      <h4>Derived Strength & Power</h4>
      <ul>
        <li><strong>Sayers Peak Power:</strong> P = ${D.constants.SAYERS_A} × VJ(cm) + ${D.constants.SAYERS_B} × mass(kg) − ${Math.abs(D.constants.SAYERS_C)}</li>
        <li><strong>Relative Strength:</strong> Bench/BW or Squat/BW (body-weight ratio)</li>
        <li><strong>Relative Med Ball:</strong> Med Ball distance / Body weight (in/lb)</li>
        <li><strong>Relative Peak Power:</strong> Peak Power / mass (W/kg)</li>
        <li><strong>Strength Utilisation:</strong> F₁ / (Squat_kg × g) — ratio of sprint force to max strength</li>
      </ul>
      <h4>Composite Scoring</h4>
      <ul>
        <li><strong>Explosive Upper Index:</strong> 0.6 × z(MB_rel) + 0.4 × z(RelBench)</li>
        <li><strong>Total Explosive Index:</strong> 0.45 × ExplosiveUpper + 0.30 × z(PeakPower) + 0.25 × z(vMax)</li>
        <li><strong>Percentile Tiers:</strong> Elite ≥90th, Strong 75–90th, Solid 50–75th, Competitive 25–50th, Developing &lt;25th</li>
      </ul>
      <h4>HS Performance Grading (Absolute Standards)</h4>
      <p class="ref-desc">
        In addition to percentile-based tiers (relative to teammates), each athlete
        is graded against <strong>published high-school norms</strong> sourced from
        NSCA, state combine databases, and S&amp;C literature. These are
        <em>absolute</em> thresholds — independent of team size or teammate
        performance.
      </p>
      <ul>
        <li>Each graded metric earns a <strong>tier score</strong>: Elite = 5, Excellent = 4, Good = 3, Average = 2, Below Avg = 1.</li>
        <li><strong>Overall Grade</strong> = mean of all individual tier scores. Mapped to a final tier:
          ≥4.5 → Elite, ≥3.5 → Excellent, ≥2.5 → Good, ≥1.5 → Average, &lt;1.5 → Below Avg.</li>
        <li>Thresholds are <strong>sport- and position-group-specific</strong> (see table below).</li>
        <li>15 metrics are graded: 40yd, vMax, v10Best, F1, Peak Momentum, Bench, Squat, Rel Bench, Rel Squat,
          Vertical, Broad Jump, Med Ball, MB Relative, Peak Power, Rel Peak Power.</li>
      </ul>
      <h4>Sport &amp; Position Groups</h4>
      <table class="grade-std-table std-wide">
        <thead><tr><th>Sport</th><th>Positions</th><th>Grading Groups</th></tr></thead>
        <tbody>${sportRows}</tbody>
      </table>
      <h4>Age-Adjustment System</h4>
      <p class="ref-desc">
        Base thresholds reflect 12th-grade (senior) expectations. When the
        <strong>Age-Adjusted</strong> toggle is enabled, thresholds scale by grade
        level. Strength metrics use steeper scaling (younger athletes are much
        weaker); speed/inverted metrics use gentler scaling (speed develops
        faster than strength).
      </p>
      <table class="grade-std-table std-medium">
        <thead><tr><th>Grade</th><th>Strength Factor</th><th>Speed Factor</th><th>Effect</th></tr></thead>
        <tbody>${ageRows}</tbody>
      </table>
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
    const a = getAthleteById(id);
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
    const strengthKeys = new Set(sorted.slice(0, 3).map(([k]) => k));
    const weaknesses = sorted
      .slice(-3)
      .reverse()
      .filter(([k]) => !strengthKeys.has(k))
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

    openPrintWindow(printHTML, a.name + " — Athlete Profile");
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
      const top3Keys = new Set(top3.map(([k]) => k));
      const bot3 = sorted
        .slice(-3)
        .reverse()
        .filter(([k]) => !top3Keys.has(k));
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

  /* ========== COMPARE & IMPROVEMENT TRACKER ========== */
  let cmpChartInstance = null;
  let _cmpCharts = [];

  function _destroyAllCmpCharts() {
    cmpChartInstance = destroyChart(cmpChartInstance);
    for (const c of _cmpCharts) destroyChart(c);
    _cmpCharts = [];
  }

  const CMP_METRICS = [
    {
      key: "bench",
      label: "Bench 1RM",
      unit: "lb",
      dec: 0,
      jsonKey: "bench_1rm",
    },
    {
      key: "squat",
      label: "Squat 1RM",
      unit: "lb",
      dec: 0,
      jsonKey: "squat_1rm",
    },
    {
      key: "medball",
      label: "Med Ball",
      unit: "in",
      dec: 0,
      jsonKey: "medball_in",
    },
    { key: "vert", label: "Vert Jump", unit: "in", dec: 1, jsonKey: "vert_in" },
    {
      key: "broad",
      label: "Broad Jump",
      unit: "in",
      dec: 0,
      jsonKey: "broad_in",
    },
    {
      key: "weight",
      label: "Weight",
      unit: "lb",
      dec: 0,
      jsonKey: "weight_lb",
    },
    {
      key: "forty",
      label: "40 yd Dash",
      unit: "s",
      dec: 2,
      invert: true,
      derived: true,
    },
    { key: "vMax", label: "Max Velocity", unit: "m/s", dec: 2, derived: true },
    { key: "F1", label: "Sprint Force", unit: "N", dec: 1, derived: true },
    {
      key: "momMax",
      label: "Peak Momentum",
      unit: "kg·m/s",
      dec: 1,
      derived: true,
    },
    { key: "peakPower", label: "Peak Power", unit: "W", dec: 0, derived: true },
    { key: "relBench", label: "Rel Bench", unit: "×BW", dec: 2, derived: true },
    { key: "relSquat", label: "Rel Squat", unit: "×BW", dec: 2, derived: true },
    {
      key: "relPeakPower",
      label: "Rel Peak Power",
      unit: "W/kg",
      dec: 1,
      derived: true,
    },
    {
      key: "proAgility",
      label: "5-10-5",
      unit: "s",
      dec: 2,
      invert: true,
      jsonKey: "pro_agility",
    },
    {
      key: "lDrill",
      label: "L-Drill",
      unit: "s",
      dec: 2,
      invert: true,
      jsonKey: "l_drill",
    },
    {
      key: "backpedal",
      label: "Backpedal",
      unit: "s",
      dec: 2,
      invert: true,
      jsonKey: "backpedal",
    },
    {
      key: "wDrill",
      label: "W-Drill",
      unit: "s",
      dec: 2,
      invert: true,
      jsonKey: "w_drill",
    },
  ];

  /* Get unique test sessions across all athletes sorted by date */
  function _getTestSessions() {
    const h = getTestHistory();
    const map = {};
    for (const aid in h) {
      for (const e of h[aid]) {
        const k = e.date + "|" + e.label;
        if (!map[k]) map[k] = { date: e.date, label: e.label, count: 0 };
        map[k].count++;
      }
    }
    return Object.values(map).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  }

  /* Populate baseline session dropdown */
  function _populateBaselineSessions() {
    const sel = document.getElementById("cmpBaselineSession");
    if (!sel) return;
    const curVal = sel.value;
    const sessions = _getTestSessions();
    sel.innerHTML = '<option value="">— pick baseline test —</option>';
    for (const s of sessions) {
      const opt = document.createElement("option");
      opt.value = s.date + "|" + s.label;
      opt.textContent =
        s.label + " (" + s.date + ") — " + s.count + " athletes";
      sel.appendChild(opt);
    }
    if (curVal) sel.value = curVal;
  }

  /* Populate group dropdown for compare */
  function _populateCmpGroups() {
    const sel = document.getElementById("cmpGroupSel");
    if (!sel) return;
    const groups = [
      ...new Set(window.CLUB.athletes.map((a) => a.group)),
    ].sort();
    const curVal = sel.value;
    sel.innerHTML = '<option value="all">All Groups</option>';
    for (const g of groups) {
      sel.innerHTML += '<option value="' + esc(g) + '">' + esc(g) + "</option>";
    }
    if (curVal) sel.value = curVal;
  }

  /* Get baseline values for an athlete from a specific test session */
  function _getSessionValues(athleteId, sessionDate, sessionLabel) {
    const entries = getAthleteHistory(athleteId);
    for (const e of entries) {
      if (e.date === sessionDate && e.label === sessionLabel) return e.values;
    }
    return null;
  }

  /* Compute delta between current athlete value and baseline test value */
  function _computeDeltas(athletes, sessionDate, sessionLabel) {
    const results = [];
    for (const a of athletes) {
      const baseline = _getSessionValues(a.id, sessionDate, sessionLabel);
      if (!baseline) {
        results.push(null);
        continue;
      }
      const deltas = {};
      for (const m of CMP_METRICS) {
        const curVal = a[m.key];
        let baseVal = null;
        if (m.jsonKey) baseVal = baseline[m.jsonKey] ?? null;
        // Derived metrics from baseline sprint splits / body data
        if (m.derived && baseVal == null) {
          const C = window.CLUB.constants;
          const s020 = baseline.sprint_020,
            s2030 = baseline.sprint_2030,
            s3040 = baseline.sprint_3040;
          const bWt = baseline.weight_lb,
            bBench = baseline.bench_1rm,
            bSquat = baseline.squat_1rm;
          const bVert = baseline.vert_in;
          const hasSprints = s020 != null && s2030 != null && s3040 != null;
          const massKg = bWt != null ? +(bWt * C.LB_TO_KG).toFixed(2) : null;
          if (m.key === "forty" && hasSprints)
            baseVal = +(s020 + s2030 + s3040).toFixed(2);
          if (m.key === "vMax" && hasSprints) {
            const v1 = C.TWENTY_YD_M / s020,
              v2 = C.TEN_YD_M / s2030,
              v3 = C.TEN_YD_M / s3040;
            baseVal = +Math.max(v1, v2, v3).toFixed(3);
          }
          if (m.key === "F1" && hasSprints && massKg != null) {
            const v1 = C.TWENTY_YD_M / s020;
            baseVal = +(massKg * (v1 / s020)).toFixed(1);
          }
          if (m.key === "momMax" && hasSprints && massKg != null) {
            const v2 = C.TEN_YD_M / s2030,
              v3 = C.TEN_YD_M / s3040;
            baseVal = +(massKg * Math.max(v2, v3)).toFixed(1);
          }
          if (m.key === "peakPower" && bVert != null && massKg != null) {
            baseVal = +(
              C.SAYERS_A * (bVert * C.IN_TO_CM) +
              C.SAYERS_B * massKg +
              C.SAYERS_C
            ).toFixed(0);
          }
          if (m.key === "relPeakPower" && bVert != null && massKg != null) {
            const pp =
              C.SAYERS_A * (bVert * C.IN_TO_CM) +
              C.SAYERS_B * massKg +
              C.SAYERS_C;
            baseVal = +(pp / massKg).toFixed(1);
          }
          if (m.key === "relBench" && bBench != null && bWt != null && bWt > 0)
            baseVal = +(bBench / bWt).toFixed(2);
          if (m.key === "relSquat" && bSquat != null && bWt != null && bWt > 0)
            baseVal = +(bSquat / bWt).toFixed(2);
        }
        if (curVal != null && baseVal != null) {
          const rawDelta = curVal - baseVal;
          const pctDelta =
            baseVal !== 0
              ? Math.max(
                  -500,
                  Math.min(500, (rawDelta / Math.abs(baseVal)) * 100),
                )
              : 0;
          deltas[m.key] = {
            cur: curVal,
            base: baseVal,
            delta: rawDelta,
            pct: pctDelta,
          };
        }
      }
      results.push(deltas);
    }
    return results;
  }

  /* Format delta cell */
  function _deltaCell(d, m) {
    if (!d || !d[m.key]) return '<td class="num na">—</td>';
    const dd = d[m.key];
    const raw = dd.delta;
    const pct = dd.pct;
    const improved = m.invert ? raw < 0 : raw > 0;
    const declined = m.invert ? raw > 0 : raw < 0;
    const cls = improved ? "delta-up" : declined ? "delta-down" : "";
    const arrow = improved ? "▲" : declined ? "▼" : "";
    const sign = raw > 0 ? "+" : "";
    return (
      '<td class="num ' +
      cls +
      '" title="From ' +
      dd.base.toFixed(m.dec) +
      " → " +
      dd.cur.toFixed(m.dec) +
      '">' +
      arrow +
      " " +
      sign +
      raw.toFixed(m.dec) +
      " <small>(" +
      sign +
      pct.toFixed(1) +
      "%)</small></td>"
    );
  }

  window.switchCompareMode = function () {
    const mode = document.getElementById("cmpMode").value;
    document.getElementById("cmpGroupFilters").style.display =
      mode === "group" ? "flex" : "none";
    document.getElementById("cmpH2HFilters").style.display =
      mode === "h2h" ? "flex" : "none";
    renderComparison();
  };

  window.renderComparison = function () {
    const mode = document.getElementById("cmpMode").value;
    _populateBaselineSessions();
    if (mode === "group") _populateCmpGroups();
    if (mode === "club") _renderClubComparison();
    else if (mode === "group") _renderGroupComparison();
    else _renderH2HComparison();
  };

  /* ===== CLUB-WIDE COMPARISON ===== */
  function _renderClubComparison() {
    const D = window.CLUB;
    const container = document.getElementById("compareContent");
    _destroyAllCmpCharts();

    const baselineSel = document.getElementById("cmpBaselineSession").value;
    if (!baselineSel) {
      container.innerHTML =
        '<p class="placeholder-text">Select a baseline test session to compare against current data.</p>';
      return;
    }
    const _sepIdx1 = baselineSel.indexOf("|");
    const sessionDate = baselineSel.substring(0, _sepIdx1);
    const sessionLabel = baselineSel.substring(_sepIdx1 + 1);
    document.getElementById("cmpBaselineInfo").textContent =
      'Showing improvement from "' +
      sessionLabel +
      '" (' +
      sessionDate +
      ") → Current";

    const athletes = D.athletes;
    const deltas = _computeDeltas(athletes, sessionDate, sessionLabel);

    // Build summary cards
    const filteredMetrics = CMP_METRICS.filter((m) => m.key !== "weight");
    const summaryData = {};
    for (const m of filteredMetrics) {
      const vals = [];
      for (let i = 0; i < athletes.length; i++) {
        if (deltas[i] && deltas[i][m.key]) {
          vals.push(deltas[i][m.key]);
        }
      }
      if (vals.length === 0) continue;
      const avgDelta = vals.reduce((s, v) => s + v.delta, 0) / vals.length;
      const avgPct = vals.reduce((s, v) => s + v.pct, 0) / vals.length;
      const improved = vals.filter((v) =>
        m.invert ? v.delta < 0 : v.delta > 0,
      ).length;
      const declined = vals.filter((v) =>
        m.invert ? v.delta > 0 : v.delta < 0,
      ).length;
      summaryData[m.key] = {
        avgDelta,
        avgPct,
        improved,
        declined,
        total: vals.length,
        label: m.label,
        unit: m.unit,
        dec: m.dec,
        invert: m.invert,
      };
    }

    if (Object.keys(summaryData).length === 0) {
      container.innerHTML =
        '<p class="placeholder-text">No comparable data found between current and "' +
        esc(sessionLabel) +
        '".</p>';
      return;
    }

    // Count overall
    let totalImproved = 0,
      totalDeclined = 0,
      totalSame = 0;
    for (let i = 0; i < athletes.length; i++) {
      if (!deltas[i]) continue;
      let up = 0,
        down = 0;
      for (const m of filteredMetrics) {
        const d = deltas[i][m.key];
        if (!d) continue;
        if (m.invert ? d.delta < 0 : d.delta > 0) up++;
        else if (m.invert ? d.delta > 0 : d.delta < 0) down++;
      }
      if (up > down) totalImproved++;
      else if (down > up) totalDeclined++;
      else totalSame++;
    }

    let html = '<div class="cmp-summary-banner">';
    html +=
      '<div class="cmp-stat-card cmp-stat-up"><div class="cmp-stat-num">' +
      totalImproved +
      '</div><div class="cmp-stat-label">Athletes Improved</div></div>';
    html +=
      '<div class="cmp-stat-card cmp-stat-same"><div class="cmp-stat-num">' +
      totalSame +
      '</div><div class="cmp-stat-label">Unchanged</div></div>';
    html +=
      '<div class="cmp-stat-card cmp-stat-down"><div class="cmp-stat-num">' +
      totalDeclined +
      '</div><div class="cmp-stat-label">Athletes Declined</div></div>';
    html += "</div>";

    // Metric-by-metric summary cards
    html += '<h3 class="cmp-section-title">Average Change by Metric</h3>';
    html += '<div class="cmp-metric-cards">';
    for (const key in summaryData) {
      const s = summaryData[key];
      const improved = s.invert ? s.avgDelta < 0 : s.avgDelta > 0;
      const cls = improved ? "delta-up" : s.avgDelta === 0 ? "" : "delta-down";
      const sign = s.avgDelta > 0 ? "+" : "";
      html += '<div class="cmp-metric-card">';
      html += '<div class="cmp-mc-label">' + s.label + "</div>";
      html +=
        '<div class="cmp-mc-delta ' +
        cls +
        '">' +
        sign +
        s.avgDelta.toFixed(s.dec) +
        " " +
        s.unit +
        "</div>";
      html +=
        '<div class="cmp-mc-pct ' +
        cls +
        '">' +
        sign +
        s.avgPct.toFixed(1) +
        "%</div>";
      html +=
        '<div class="cmp-mc-counts">▲' +
        s.improved +
        " / ▼" +
        s.declined +
        " / " +
        s.total +
        "</div>";
      html += "</div>";
    }
    html += "</div>";

    // Bar chart for average % change
    html += '<h3 class="cmp-section-title">Average % Change by Metric</h3>';
    html +=
      '<div class="cmp-bar-wrap"><canvas id="cmpBarChart"></canvas></div>';

    // Per-athlete improvement table
    html += '<h3 class="cmp-section-title">Individual Athlete Changes</h3>';
    html += _buildDeltaTable(athletes, deltas, filteredMetrics);

    container.innerHTML = html;
    _buildBarChart("cmpBarChart", summaryData);
  }

  /* ===== GROUP COMPARISON ===== */
  function _renderGroupComparison() {
    const D = window.CLUB;
    const container = document.getElementById("compareContent");
    _destroyAllCmpCharts();

    const baselineSel = document.getElementById("cmpBaselineSession").value;
    if (!baselineSel) {
      container.innerHTML =
        '<p class="placeholder-text">Select a baseline test session to compare against current data.</p>';
      return;
    }
    const _sepIdx2 = baselineSel.indexOf("|");
    const sessionDate = baselineSel.substring(0, _sepIdx2);
    const sessionLabel = baselineSel.substring(_sepIdx2 + 1);
    document.getElementById("cmpBaselineInfo").textContent =
      'Showing improvement from "' +
      sessionLabel +
      '" (' +
      sessionDate +
      ") → Current";

    const groupFilter = document.getElementById("cmpGroupSel").value;
    const allGroups =
      groupFilter === "all"
        ? [...new Set(D.athletes.map((a) => a.group))].sort()
        : [groupFilter];

    const filteredMetrics = CMP_METRICS.filter((m) => m.key !== "weight");
    let html = "";

    // Cache per-group data for reuse in chart building
    const _groupCache = {};

    for (const group of allGroups) {
      const athletes = D.athletes.filter((a) => a.group === group);
      if (athletes.length === 0) continue;
      const deltas = _computeDeltas(athletes, sessionDate, sessionLabel);

      // group summary
      const groupSummary = {};
      for (const m of filteredMetrics) {
        const vals = [];
        for (let i = 0; i < athletes.length; i++) {
          if (deltas[i] && deltas[i][m.key]) vals.push(deltas[i][m.key]);
        }
        if (vals.length === 0) continue;
        const avgDelta = vals.reduce((s, v) => s + v.delta, 0) / vals.length;
        const avgPct = vals.reduce((s, v) => s + v.pct, 0) / vals.length;
        const improved = vals.filter((v) =>
          m.invert ? v.delta < 0 : v.delta > 0,
        ).length;
        const declined = vals.filter((v) =>
          m.invert ? v.delta > 0 : v.delta < 0,
        ).length;
        groupSummary[m.key] = {
          avgDelta,
          avgPct,
          improved,
          declined,
          total: vals.length,
          label: m.label,
          unit: m.unit,
          dec: m.dec,
          invert: m.invert,
        };
      }

      if (Object.keys(groupSummary).length === 0) continue;
      _groupCache[group] = { athletes, deltas, groupSummary };

      html += '<div class="cmp-group-section">';
      html +=
        '<h3 class="cmp-group-title"><span class="group-tag group-' +
        group.replace(/\s/g, "") +
        '">' +
        group +
        "</span> <small>(" +
        athletes.length +
        " athletes)</small></h3>";

      // Metric cards
      html += '<div class="cmp-metric-cards">';
      for (const key in groupSummary) {
        const s = groupSummary[key];
        const improved = s.invert ? s.avgDelta < 0 : s.avgDelta > 0;
        const cls = improved
          ? "delta-up"
          : s.avgDelta === 0
            ? ""
            : "delta-down";
        const sign = s.avgDelta > 0 ? "+" : "";
        html += '<div class="cmp-metric-card">';
        html += '<div class="cmp-mc-label">' + s.label + "</div>";
        html +=
          '<div class="cmp-mc-delta ' +
          cls +
          '">' +
          sign +
          s.avgDelta.toFixed(s.dec) +
          " " +
          s.unit +
          "</div>";
        html +=
          '<div class="cmp-mc-pct ' +
          cls +
          '">' +
          sign +
          s.avgPct.toFixed(1) +
          "%</div>";
        html +=
          '<div class="cmp-mc-counts">▲' +
          s.improved +
          " / ▼" +
          s.declined +
          " / " +
          s.total +
          "</div>";
        html += "</div>";
      }
      html += "</div>";

      // Bar chart
      const chartId = "cmpGroupBar_" + group.replace(/\s/g, "");
      html +=
        '<div class="cmp-bar-wrap"><canvas id="' +
        chartId +
        '"></canvas></div>';

      // Athlete table
      html += _buildDeltaTable(athletes, deltas, filteredMetrics);
      html += "</div>";
    }

    if (!html) {
      container.innerHTML =
        '<p class="placeholder-text">No comparable data found for the selected group.</p>';
      return;
    }
    container.innerHTML = html;

    // Build charts for each group (reuse cached data)
    for (const group in _groupCache) {
      const { groupSummary } = _groupCache[group];
      const chartId = "cmpGroupBar_" + group.replace(/\s/g, "");
      const canvas = document.getElementById(chartId);
      if (canvas) _buildBarChart(chartId, groupSummary);
    }
  }

  /* ===== HEAD-TO-HEAD COMPARISON ===== */
  function _renderH2HComparison() {
    const D = window.CLUB;
    const container = document.getElementById("compareContent");
    _destroyAllCmpCharts();

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
    const athletes = ids.map((id) => getAthleteById(id)).filter(Boolean);
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
    let html = '<div class="cmp-profile-row cols-' + cols + '">';
    for (const a of athletes) {
      html +=
        '<div class="cmp-card">' +
        '<div class="cmp-avatar">' +
        a.initials +
        "</div>" +
        '<div class="cmp-name">' +
        esc(a.name) +
        "</div>" +
        '<div class="cmp-meta">' +
        (esc(a.position) || "—") +
        " · " +
        esc(a.group) +
        " · " +
        (a.weight || "—") +
        " lb" +
        (a.overallGrade
          ? ' · <span class="grade-badge grade-bg-' +
            a.overallGrade.tier +
            '">' +
            a.overallGrade.label +
            "</span>"
          : "") +
        "</div>" +
        "</div>";
    }
    html += "</div>";

    // Current values table
    const h2hMetrics = CMP_METRICS.filter((m) => m.key !== "weight");
    html +=
      '<div class="table-wrap"><table class="cmp-table"><thead><tr><th>Metric</th>';
    for (const a of athletes)
      html += "<th>" + esc(a.name).split(" ")[0] + "</th>";
    html += "<th>Δ</th></tr></thead><tbody>";

    for (const m of h2hMetrics) {
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

      html += "<tr><td>" + m.label + " <small>(" + m.unit + ")</small></td>";
      for (let i = 0; i < athletes.length; i++) {
        const v = vals[i];
        const cls =
          i === bestIdx
            ? "cmp-best"
            : i === worstIdx && athletes.length > 2
              ? "cmp-worst"
              : "";
        html +=
          '<td class="num ' +
          cls +
          '">' +
          (v !== null ? v.toFixed(m.dec) : "—") +
          "</td>";
      }
      html +=
        '<td class="num">' +
        (delta !== null ? delta.toFixed(m.dec) : "—") +
        "</td>";
      html += "</tr>";
    }
    html += "</tbody></table></div>";

    // Improvement section if baseline selected
    const baselineSel = document.getElementById("cmpBaselineSession").value;
    if (baselineSel) {
      const _sepIdx3 = baselineSel.indexOf("|");
      const sessionDate = baselineSel.substring(0, _sepIdx3);
      const sessionLabel = baselineSel.substring(_sepIdx3 + 1);
      const deltas = _computeDeltas(athletes, sessionDate, sessionLabel);
      document.getElementById("cmpBaselineInfo").textContent =
        'Showing improvement from "' + sessionLabel + '" → Current';

      html +=
        '<h3 class="cmp-section-title">Individual Improvement since "' +
        esc(sessionLabel) +
        '"</h3>';
      html +=
        '<div class="table-wrap"><table class="cmp-table"><thead><tr><th>Metric</th>';
      for (const a of athletes)
        html += "<th>" + esc(a.name).split(" ")[0] + "</th>";
      html += "</tr></thead><tbody>";
      for (const m of h2hMetrics) {
        html += "<tr><td>" + m.label + "</td>";
        for (let i = 0; i < athletes.length; i++) {
          html += _deltaCell(deltas[i], m);
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
    }

    // Radar overlay
    html += '<div class="cmp-radar-wrap"><canvas id="cmpRadar"></canvas></div>';
    container.innerHTML = html;

    // Build overlaid radar chart
    if (typeof Chart === "undefined") {
      const rw = document.getElementById("cmpRadar")?.parentElement;
      if (rw)
        rw.innerHTML =
          '<p class="placeholder-text">Charts unavailable (Chart.js failed to load)</p>';
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

    const datasets = athletes.map((a, i) => ({
      label: a.name,
      data: [
        normMetric(a.bench, "bench"),
        normMetric(a.squat, "squat"),
        normMetric(a.medball, "medball"),
        normMetric(a.vert, "vert"),
        normMetric(a.broad, "broad"),
        normMetricInv(a.forty, "forty"),
        normMetric(a.F1, "F1"),
        normMetric(a.peakPower, "peakPower"),
        normMetric(a.momMax, "momMax"),
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
        ...chartAnimOpts(),
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
              label: (ctx) =>
                ctx.dataset.label + ": " + ctx.raw + "% of team max",
            },
          },
        },
      },
    });
  }

  /* ===== SHARED: Delta table builder ===== */
  function _buildDeltaTable(athletes, deltas, metrics) {
    const weightMeta = {
      key: "weight",
      label: "Weight",
      unit: "lb",
      dec: 0,
    };
    let html =
      '<div class="table-wrap"><table class="cmp-table"><thead><tr><th>Athlete</th><th>Group</th><th>Wt Δ</th>';
    for (const m of metrics) html += "<th>" + m.label + "</th>";
    html += "</tr></thead><tbody>";
    for (let i = 0; i < athletes.length; i++) {
      const a = athletes[i];
      if (!deltas[i]) continue;
      html +=
        '<tr><td style="text-align:left;text-transform:none;font-weight:700;color:var(--text)">' +
        esc(a.name) +
        "</td>";
      html +=
        '<td><span class="group-tag group-' +
        (a.group || "").replace(/\s/g, "") +
        '">' +
        esc(a.group || "—") +
        "</span></td>";
      // Weight delta column (neutral styling — gaining/losing neither good nor bad)
      const wd = deltas[i][weightMeta.key];
      if (!wd) {
        html += '<td class="num na">—</td>';
      } else {
        const sign = wd.delta > 0 ? "+" : "";
        html +=
          '<td class="num" title="From ' +
          wd.base.toFixed(0) +
          " → " +
          wd.cur.toFixed(0) +
          ' lb">' +
          sign +
          wd.delta.toFixed(0) +
          " <small>(" +
          sign +
          wd.pct.toFixed(1) +
          "%)</small></td>";
      }
      for (const m of metrics) {
        html += _deltaCell(deltas[i], m);
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  /* ===== SHARED: Bar chart builder ===== */
  function _buildBarChart(canvasId, summaryData) {
    if (typeof Chart === "undefined") return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const labels = [];
    const values = [];
    const colors = [];
    for (const key in summaryData) {
      const s = summaryData[key];
      labels.push(s.label);
      const pct = s.avgPct || 0;
      values.push(+pct.toFixed(1));
      const improved = s.invert ? pct < 0 : pct > 0;
      colors.push(
        improved
          ? "rgba(74,222,128,.7)"
          : pct === 0
            ? "rgba(139,144,160,.5)"
            : "rgba(239,68,68,.7)",
      );
    }
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: colors.map((c) =>
              c.replace(",.7)", ",1)").replace(",.5)", ",1)"),
            ),
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        ...chartAnimOpts(),
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => (ctx.raw > 0 ? "+" : "") + ctx.raw + "%",
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "% Change",
              color: "#8b90a0",
              font: { size: 11 },
            },
            grid: { color: "rgba(255,255,255,.06)" },
            ticks: {
              color: "#8b90a0",
              callback: (v) => (v > 0 ? "+" : "") + v + "%",
            },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#e4e6ed", font: { size: 11, weight: "600" } },
          },
        },
      },
    });
    _cmpCharts.push(chart);
  }

  /* ========== POSITION GROUP DASHBOARD ========== */
  window.renderGroupDashboard = function () {
    const D = window.CLUB;
    const container = document.getElementById("groupDashContent");
    const gFilter = document.getElementById("grpDash").value;
    const groups =
      gFilter === "all"
        ? [...new Set(D.athletes.map((a) => a.group))].sort()
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
      // Build label dynamically from sport positions
      let groupLabel = g;
      for (const sp of Object.values(D.sportPositions || {})) {
        if (sp.groups[g]) {
          groupLabel = g + " (" + sp.groups[g].join("/") + ")";
          break;
        }
      }

      html += `<div class="grp-panel">
        <div class="grp-panel-header">
          <span class="grp-panel-title">${groupLabel}</span>
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
        for (const [t, c] of Object.entries(tierCounts)) {
          if (c > 0) {
            html += `<span class="grade-badge grade-bg-${t}">${GRADE_TIER_LABELS[t]}: ${c}</span>`;
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
          .map((a) => a.grades?.[mm.key]?.score)
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
      "Sport",
      "Grade",
      "Training Age",
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
      "z-Bench",
      "z-Squat",
      "z-MB",
      "z-Vert",
      "z-Broad",
      "z-40yd",
      "z-vMax",
      "z-F1",
      "z-PeakPower",
      "z-RelBench",
      "z-RelSquat",
      "z-MBRel",
      "5-10-5 (s)",
      "L-Drill (s)",
      "Backpedal (s)",
      "W-Drill (s)",
      "z-ProAgility",
      "z-LDrill",
      "z-Backpedal",
      "z-WDrill",
      "Explosive Upper",
      "Total Explosive",
      "Overall Grade",
      "Grade Score",
    ];
    const rows = [headers.join(",")];
    for (const a of D.athletes) {
      const row = [
        '"' + (a.name || "").replace(/"/g, '""') + '"',
        '"' + (a.position || "").replace(/"/g, '""') + '"',
        '"' + (a.sport || "Football").replace(/"/g, '""') + '"',
        a.grade ?? "",
        a.trainingAge ?? "",
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
        a.zBench ?? "",
        a.zSquat ?? "",
        a.zMB ?? "",
        a.zVert ?? "",
        a.zBroad ?? "",
        a.zForty ?? "",
        a.zVMax ?? "",
        a.zF1 ?? "",
        a.zPeakPower ?? "",
        a.zRelBench ?? "",
        a.zRelSquat ?? "",
        a.zMBRel ?? "",
        a.proAgility ?? "",
        a.lDrill ?? "",
        a.backpedal ?? "",
        a.wDrill ?? "",
        a.zProAgility ?? "",
        a.zLDrill ?? "",
        a.zBackpedal ?? "",
        a.zWDrill ?? "",
        a.explosiveUpper ?? "",
        a.totalExplosive ?? "",
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
    }, 1000);
  };

  /* ========== SNAPSHOT MANAGEMENT ========== */
  function refreshSnapshotList() {
    const sel = document.getElementById("snapshotSelect");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Load Snapshot —</option>';
    const snapshots = safeLSGet("lc_snapshots", []);
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
    const editsArr = safeLSGet("lc_edits", []);
    const added = safeLSGet("lc_added", []);
    const deleted = safeLSGet("lc_deleted", []);
    const snapshots = safeLSGet("lc_snapshots", []);
    const parts = [];
    if (editsArr.length) parts.push("edits");
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
    const snapshots = safeLSGet("lc_snapshots", []);

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
    const added = safeLSGet("lc_added", []);
    for (const a of added) {
      if (!rawCopy.athletes.find((x) => x.id === a.id))
        rawCopy.athletes.push(a);
    }

    // Apply deletions
    const deleted = safeLSGet("lc_deleted", []);
    if (deleted.length)
      rawCopy.athletes = rawCopy.athletes.filter(
        (a) => !deleted.includes(a.id),
      );

    // Apply edits
    const edits = safeLSGet("lc_edits", []);
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
    const snapshots = safeLSGet("lc_snapshots", []);
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
    let snapshots = safeLSGet("lc_snapshots", []);
    snapshots = snapshots.filter((s) => s.name !== name);
    safeLSSet("lc_snapshots", JSON.stringify(snapshots));
    refreshSnapshotList();
    updateDataStatus();
  };

  /* ---------- Age-Adjusted Standards Toggle ---------- */
  window.toggleAgeAdjusted = function (on) {
    safeLSSet("lc_age_adjusted", on ? "true" : "false");
    // Sync both age-adj toggles
    var ageT1 = document.getElementById("ageAdjToggle");
    var ageT2 = document.getElementById("overviewAgeToggle");
    if (ageT1) ageT1.checked = on;
    if (ageT2) ageT2.checked = on;
    rebuildFromStorage();
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    renderProfile();
    showToast(
      on
        ? "Age-adjusted standards enabled — grades scaled by training age"
        : "Age-adjusted standards disabled — using senior (12th grade) standards",
      "info",
    );
  };

  /* ---------- Overview Relatives Toggle ---------- */
  window.toggleOverviewRelatives = function (on) {
    safeLSSet("lc_show_relatives", on ? "true" : "false");
    renderOverview();
  };

  /* ---------- Body-Adjusted Standards Toggle ---------- */
  window.toggleBodyAdjusted = function (on) {
    safeLSSet("lc_body_adjusted", on ? "true" : "false");
    // Sync both body-adj toggles
    var bt1 = document.getElementById("bodyAdjToggle");
    var bt2 = document.getElementById("overviewBodyToggle");
    if (bt1) bt1.checked = on;
    if (bt2) bt2.checked = on;
    rebuildFromStorage();
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    renderProfile();
    showToast(
      on
        ? "Body-adjusted standards enabled — thresholds scaled by weight class & height"
        : "Body-adjusted standards disabled — using baseline thresholds",
      "info",
    );
  };

  /* ---------- Cohort Percentile Toggle ---------- */
  window.toggleCohortMode = function (on) {
    safeLSSet("lc_cohort_mode", on ? "true" : "false");
    // Sync both cohort toggles
    var ct1 = document.getElementById("cohortToggle");
    var ct2 = document.getElementById("overviewCohortToggle");
    if (ct1) ct1.checked = on;
    if (ct2) ct2.checked = on;
    rebuildFromStorage();
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    renderProfile();
    showToast(
      on
        ? "Cohort percentiles enabled — ranking against peers with same body profile & position"
        : "Cohort percentiles disabled",
      "info",
    );
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

    // Refresh group filter dropdowns from current athlete groups
    const activeGroups = [
      ...new Set(window.CLUB.athletes.map((a) => a.group)),
    ].sort();
    const groupSelects = [
      document.getElementById("overviewGroupFilter"),
      document.getElementById("lbGroupFilter"),
      document.getElementById("grpDash"),
    ];
    for (const gs of groupSelects) {
      if (!gs) continue;
      const curVal = gs.value;
      // Keep only the "All Groups" option, rebuild the rest
      gs.innerHTML = '<option value="all">All Groups</option>';
      for (const g of activeGroups) {
        const o = document.createElement("option");
        o.value = g;
        o.textContent = g;
        gs.appendChild(o);
      }
      // Restore previous selection if still valid
      if (curVal && curVal !== "all" && activeGroups.includes(curVal))
        gs.value = curVal;
    }

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
    const added = safeLSGet("lc_added", []);
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
    const deleted = safeLSGet("lc_deleted", []);
    if (deleted.length) {
      rawCopy.athletes = rawCopy.athletes.filter(function (a) {
        return !deleted.includes(a.id);
      });
    }

    // Apply latest test data as current values for each athlete.
    // Test history represents newer measurements and overwrites JSON baseline.
    // Manual edits (lc_edits) are applied AFTER and override everything.
    var testH = getTestHistory();
    var testIds = Object.keys(testH);
    for (var ti = 0; ti < testIds.length; ti++) {
      var tAid = testIds[ti];
      var tEntries = testH[tAid];
      if (!tEntries || tEntries.length === 0) continue;
      // Find the most recent date
      var latestDate = tEntries[0].date;
      for (var tj = 1; tj < tEntries.length; tj++) {
        if (tEntries[tj].date > latestDate) latestDate = tEntries[tj].date;
      }
      // Merge all entries from that date (in case of multiple labels)
      var tAthlete = rawCopy.athletes.find(function (a) {
        return a.id === tAid;
      });
      if (!tAthlete) continue;
      for (var tk = 0; tk < tEntries.length; tk++) {
        if (tEntries[tk].date !== latestDate) continue;
        var vals = tEntries[tk].values;
        for (var vk in vals) {
          if (vals[vk] !== null && vals[vk] !== undefined && vals[vk] !== "") {
            tAthlete[vk] = vals[vk];
          }
        }
      }
    }

    // Apply edits AFTER test history so manual edits take priority
    const edits = safeLSGet("lc_edits", []);
    for (const edit of edits) {
      const athlete = rawCopy.athletes.find(function (a) {
        return a.id === edit.id;
      });
      if (athlete) Object.assign(athlete, edit.changes);
    }

    window.CLUB = window._processData(rawCopy);
    invalidateAthleteMap();
  }

  /* ========== NEXT ATHLETE ID ========== */
  function nextAthleteId() {
    const D = window.CLUB;
    const added = safeLSGet("lc_added", []);
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
      sport: "Football",
      grade: null,
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
    const added = safeLSGet("lc_added", []);
    added.push(newAthlete);
    safeLSSet("lc_added", JSON.stringify(added));

    // Create blank test history entries for all existing test dates
    var h = getTestHistory();
    var existingDates = {}; // "date|label" -> true
    var allIds = Object.keys(h);
    for (var hi = 0; hi < allIds.length; hi++) {
      for (var hj = 0; hj < h[allIds[hi]].length; hj++) {
        var ent = h[allIds[hi]][hj];
        existingDates[ent.date + "|" + ent.label] = true;
      }
    }
    var dateKeys = Object.keys(existingDates);
    if (dateKeys.length > 0) {
      if (!h[id]) h[id] = [];
      for (var dk = 0; dk < dateKeys.length; dk++) {
        var parts = dateKeys[dk].split("|");
        h[id].push({
          date: parts[0],
          label: parts.slice(1).join("|"),
          values: {},
        });
      }
      setTestHistory(h);
    }

    // Rebuild & re-render
    rebuildFromStorage();
    reRenderAll();
    updateDataStatus();

    // Select the new athlete and open the edit panel
    document.getElementById("athleteSelect").value = id;
    showTab("profiles");
    renderProfile();
    openEditPanel(id);

    var testMsg =
      dateKeys.length > 0
        ? " — " + dateKeys.length + " test date(s) pre-populated"
        : "";
    showToast("Added " + name.trim() + " (" + id + ")" + testMsg, "success");
  };

  /* ========== DELETE ATHLETE ========== */
  window.deleteCurrentAthlete = function () {
    // Determine which athlete to delete
    let id = editingAthleteId || document.getElementById("athleteSelect").value;
    if (!id) {
      showToast("Select an athlete first.", "warn");
      return;
    }

    const a = getAthleteById(id);
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
    const deleted = safeLSGet("lc_deleted", []);
    if (deleted.indexOf(id) === -1) deleted.push(id);
    safeLSSet("lc_deleted", JSON.stringify(deleted));

    // Also remove from lc_added if it was a newly added athlete
    let added = safeLSGet("lc_added", []);
    added = added.filter(function (a) {
      return a.id !== id;
    });
    safeLSSet("lc_added", JSON.stringify(added));

    // Also remove from lc_edits
    let edits = safeLSGet("lc_edits", []);
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
  let _editPanelSnapshot = {}; // original field values when panel opened

  const EDITABLE_FIELDS = [
    {
      key: "name",
      jsonKey: "name",
      label: "Name",
      type: "text",
      section: "Bio",
    },
    {
      key: "sport",
      jsonKey: "sport",
      label: "Sport",
      type: "select",
      options: ["Football", "Soccer", "Baseball", "Basketball"],
      section: "Bio",
    },
    {
      key: "position",
      jsonKey: "position",
      label: "Position",
      type: "select",
      options: ["RB", "WR", "DB", "QB", "TE", "LB", "OL", "DL"],
      dynamicOptions: true,
      section: "Bio",
    },
    {
      key: "grade",
      jsonKey: "grade",
      label: "Grade",
      type: "select",
      options: ["", "6", "7", "8", "9", "10", "11", "12"],
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
    {
      key: "proAgility",
      jsonKey: "pro_agility",
      label: "5-10-5 Shuttle (s)",
      type: "number",
      step: "0.01",
      min: "3.5",
      max: "7.0",
      section: "Agility",
    },
    {
      key: "lDrill",
      jsonKey: "l_drill",
      label: "L-Drill / 3-Cone (s)",
      type: "number",
      step: "0.01",
      min: "5.5",
      max: "11.0",
      section: "Agility",
    },
    {
      key: "backpedal",
      jsonKey: "backpedal",
      label: "Backpedal 10+10 (s)",
      type: "number",
      step: "0.01",
      min: "2.5",
      max: "6.0",
      section: "Agility",
    },
    {
      key: "wDrill",
      jsonKey: "w_drill",
      label: "W-Drill 5-Cone (s)",
      type: "number",
      step: "0.01",
      min: "3.5",
      max: "8.0",
      section: "Agility",
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

    // Capture snapshot of current values so autoSave only stores actual changes
    _editPanelSnapshot = {};
    for (let si = 0; si < EDITABLE_FIELDS.length; si++) {
      const sf = EDITABLE_FIELDS[si];
      const val = a[sf.key] !== undefined ? a[sf.key] : null;
      if (sf.type === "number") {
        _editPanelSnapshot[sf.jsonKey] =
          val !== null && val !== undefined ? parseFloat(val) : null;
      } else if (sf.key === "grade") {
        _editPanelSnapshot[sf.jsonKey] =
          val !== null && val !== undefined ? parseInt(val, 10) : null;
      } else {
        _editPanelSnapshot[sf.jsonKey] = val || null;
      }
    }

    // Get saved edits for this athlete to detect changes
    const edits = safeLSGet("lc_edits", []);
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
        // For position field, get sport-specific options
        let opts = f.options;
        if (f.dynamicOptions && f.key === "position") {
          const sp = window.CLUB?.sportPositions;
          const curSport = a.sport || "Football";
          if (sp && sp[curSport]) opts = sp[curSport].positions;
        }
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
        for (let oi = 0; oi < opts.length; oi++) {
          if (opts[oi] === "") continue;
          const dispLabel =
            f.key === "grade"
              ? ordGrade(parseInt(opts[oi], 10)) + " Grade"
              : opts[oi];
          html +=
            '<option value="' +
            opts[oi] +
            '"' +
            (val === opts[oi] || (f.key === "grade" && String(val) === opts[oi])
              ? " selected"
              : "") +
            ">" +
            dispLabel +
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
          esc(val !== null && val !== undefined ? String(val) : "") +
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
        var metricChips = "";
        for (var tki = 0; tki < TEST_METRIC_KEYS.length; tki++) {
          var tkVal = he.values[TEST_METRIC_KEYS[tki].jsonKey];
          if (tkVal !== null && tkVal !== undefined) {
            metricsWithData++;
            metricChips +=
              '<span class="th-chip">' +
              TEST_METRIC_KEYS[tki].label +
              ": <strong>" +
              tkVal +
              "</strong></span>";
          }
        }
        // Compute 40yd from sprints if available
        var s020 = he.values.sprint_020,
          s2030 = he.values.sprint_2030,
          s3040 = he.values.sprint_3040;
        if (
          s020 !== null &&
          s020 !== undefined &&
          s2030 !== null &&
          s2030 !== undefined &&
          s3040 !== null &&
          s3040 !== undefined
        ) {
          metricChips +=
            '<span class="th-chip th-chip-computed">40yd: <strong>' +
            (s020 + s2030 + s3040).toFixed(2) +
            "s</strong></span>";
        }
        html += '<div class="edit-history-item">';
        html +=
          '<div class="edit-history-info"><strong>' +
          esc(he.label) +
          "</strong> <small>" +
          he.date +
          " · " +
          metricsWithData +
          "/" +
          TEST_METRIC_KEYS.length +
          " metrics</small>" +
          '<div class="th-chip-row">' +
          metricChips +
          "</div>" +
          "</div>";
        html += '<div class="edit-history-btns">';
        var _heId = escJs(a.id);
        var _heDate = escJs(he.date);
        var _heLabel = escJs(he.label);
        html +=
          '<button class="btn btn-xs btn-muted" onclick="editHistoryEntry(\'' +
          _heId +
          "','" +
          _heDate +
          "','" +
          _heLabel +
          '\')" title="Edit this test entry">✏️</button> ';
        html +=
          '<button class="btn btn-xs btn-muted" onclick="deleteHistoryEntry(\'' +
          _heId +
          "','" +
          _heDate +
          "','" +
          _heLabel +
          '\')" title="Delete this test entry">🗑</button>';
        html += "</div>";
        html += "</div>";
      }
      html += "</div>";
    } else {
      html +=
        '<div class="th-empty-inline"><small>No test history for this athlete. Save a test date or add historical data above.</small></div>';
    }

    // Hidden previous test entry form (shared for add & edit)
    html +=
      '<div id="prevTestForm" class="prev-test-form" style="display:none">';
    html += '<input type="hidden" id="prevTestEditMode" value="" />';
    html += '<input type="hidden" id="prevTestOrigDate" value="" />';
    html += '<input type="hidden" id="prevTestOrigLabel" value="" />';
    html +=
      '<div class="edit-section-title" id="prevTestFormTitle">Enter Previous Test Data</div>';
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

    // When sport changes, rebuild position options
    const sportSel = document.getElementById("edit_sport");
    const posSel = document.getElementById("edit_position");
    if (sportSel && posSel) {
      sportSel.addEventListener("change", function () {
        const sp = window.CLUB?.sportPositions;
        const newSport = sportSel.value || "Football";
        const opts = sp && sp[newSport] ? sp[newSport].positions : [];
        posSel.innerHTML = '<option value="">— None —</option>';
        for (let pi = 0; pi < opts.length; pi++) {
          posSel.innerHTML +=
            '<option value="' + opts[pi] + '">' + opts[pi] + "</option>";
        }
      });
    }
  }

  /* ---------- Auto-save ---------- */
  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(doAutoSave, 800);

    // Show typing indicator
    const statusEl = document.getElementById("autoSaveStatus");
    if (statusEl) {
      statusEl.textContent = "typing…";
      statusEl.classList.add("visible");
    }
  }

  function doAutoSave() {
    if (!editingAthleteId) return;

    // Gather only fields that actually changed from when the panel opened
    const changes = {};
    for (let i = 0; i < EDITABLE_FIELDS.length; i++) {
      const f = EDITABLE_FIELDS[i];
      const el = document.getElementById("edit_" + f.key);
      if (!el) continue;
      const rawVal = el.value.trim();
      let newVal;
      if (f.type === "number") {
        const parsed = parseFloat(rawVal);
        newVal = rawVal === "" ? null : isNaN(parsed) ? null : parsed;
      } else if (f.key === "grade") {
        newVal = rawVal === "" ? null : parseInt(rawVal, 10);
      } else {
        newVal = rawVal || null;
      }
      const origVal = _editPanelSnapshot[f.jsonKey];
      // Only record if value actually differs from original
      if (newVal !== origVal && !(newVal == null && origVal == null)) {
        changes[f.jsonKey] = newVal;
      }
    }

    // Save to localStorage
    let edits = safeLSGet("lc_edits", []);
    const existing = edits.find(function (e) {
      return e.id === editingAthleteId;
    });
    if (Object.keys(changes).length === 0) {
      // No changes — remove any existing edit entry for this athlete
      if (existing) {
        edits = edits.filter(function (e) {
          return e.id !== editingAthleteId;
        });
      }
    } else if (existing) {
      existing.changes = changes;
    } else {
      edits.push({ id: editingAthleteId, changes: changes });
    }
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Reprocess data
    rebuildFromStorage();

    // Skip chart animations during auto-save re-renders
    _skipChartAnimation = true;

    // Re-render only active tab + profile
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    updateDataStatus();

    // Keep athlete selected & profile visible
    const athSel = document.getElementById("athleteSelect");
    if (athSel) athSel.value = editingAthleteId;
    if (!activeTab || activeTab.dataset.tab !== "profiles") {
      renderProfile();
    }

    _skipChartAnimation = false;

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
    const edits = safeLSGet("lc_edits", []);
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
    const a = getAthleteById(editingAthleteId);
    if (!a) return;

    var dateStr = prompt(
      "Enter test date (YYYY-MM-DD):",
      new Date().toISOString().slice(0, 10),
    );
    if (!dateStr) return;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
      isNaN(new Date(dateStr + "T00:00:00").getTime())
    ) {
      showToast("Invalid date format. Please use YYYY-MM-DD.", "warn");
      return;
    }
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
    document.getElementById("prevTestFormTitle").textContent =
      "Enter Previous Test Data";
    document.getElementById("prevTestSubmitBtn").textContent =
      "💾 Save Previous Test";
    document.getElementById("prevTestDate").value = "";
    document.getElementById("prevTestLabel").value = "";
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      var el = document.getElementById(
        "prevTest_" + TEST_METRIC_KEYS[i].jsonKey,
      );
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
    if (!entry) {
      showToast("Test entry not found.", "error");
      return;
    }

    var form = document.getElementById("prevTestForm");
    if (!form) return;

    // Set edit mode
    document.getElementById("prevTestEditMode").value = "edit";
    document.getElementById("prevTestOrigDate").value = date;
    document.getElementById("prevTestOrigLabel").value = label;
    document.getElementById("prevTestFormTitle").textContent =
      "Edit Test: " + label + " (" + date + ")";
    document.getElementById("prevTestSubmitBtn").textContent =
      "💾 Update Test Entry";

    // Pre-fill date & label
    document.getElementById("prevTestDate").value = entry.date;
    document.getElementById("prevTestLabel").value = entry.label;

    // Pre-fill metric values
    for (var i = 0; i < TEST_METRIC_KEYS.length; i++) {
      var mk = TEST_METRIC_KEYS[i];
      var el = document.getElementById("prevTest_" + mk.jsonKey);
      if (el) {
        var v = entry.values[mk.jsonKey];
        el.value = v !== null && v !== undefined ? v : "";
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
    rebuildFromStorage();
    markTabsDirty();
    var a = getAthleteById(editingAthleteId);
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
    const a = getAthleteById(id);
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
    // Flush any pending auto-save before closing
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      doAutoSave();
    }
    document.getElementById("editPanel").classList.remove("open");
    document.getElementById("editPanelBackdrop").classList.remove("open");
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
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      doAutoSave();
    }
    const sorted = sortedAthletes();
    if (sorted.length === 0) return;
    let idx = sorted.findIndex(function (a) {
      return a.id === editingAthleteId;
    });
    if (idx <= 0) idx = sorted.length;
    openEditPanel(sorted[idx - 1].id);
  };

  window.editPanelNext = function () {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
      doAutoSave();
    }
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
    let edits = safeLSGet("lc_edits", []);
    edits = edits.filter(function (e) {
      return e.id !== editingAthleteId;
    });
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Reprocess from original + remaining edits
    rebuildFromStorage();
    reRenderAll();
    updateDataStatus();

    // Refresh the panel with original data
    const a = getAthleteById(editingAthleteId);
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
    const a = getAthleteById(editingAthleteId);
    if (!a) return;

    const exported = {
      id: a.id,
      name: a.name,
      position: a.position,
      sport: a.sport || "Football",
      grade: a.grade,
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
      // Close topmost modal overlay first
      var modals = document.querySelectorAll(".modal-overlay");
      if (modals.length > 0) {
        modals[modals.length - 1].remove();
        return;
      }
      // Then close edit panel
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
          sport: a.sport || "Football",
          grade: a.grade,
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
    }, 1000);
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
            sport: a.sport || null,
            grade: a.grade !== undefined ? a.grade : null,
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
        localStorage.removeItem("lc_snapshots");
        localStorage.removeItem("lc_test_notes");

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
})();
