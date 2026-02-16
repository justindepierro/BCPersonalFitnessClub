/* ===================================================
   tabs.js — Leaderboards, Sprint, Strength & Power,
   Scorecard, Testing Log, Testing Week, Constants,
   Sortable Tables
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    escJs,
    fmt,
    fmtZ,
    fmtHeight,
    ordGrade,
    formatLogDate,
    buildAgeFactorRows,
    tdNum,
    tdGraded,
    tdNumColored,
    gradeBadge,
    overallGradeCell,
    getAthleteById,
    showToast,
    chartAnimOpts,
    getStaleKeys,
    METRIC_INFO,
    TEST_METRIC_KEYS,
  } = APP;

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

    if (APP.charts.lb) {
      APP.charts.lb.destroy();
      APP.charts.lb = null;
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

    APP.charts.lb = new Chart(canvas, {
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
      APP._gradingSportCache[category] ||
      localStorage.getItem(storageKey) ||
      "Football";
    if (!sports.includes(selectedSport)) selectedSport = sports[0];

    function build() {
      APP._gradingSportCache[category] = selectedSport;
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
        <h4><i data-lucide="ruler" class="icon"></i> Age-Adjustment Factors</h4>
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
        const _s = { stale: true };
        const sN = (key, dec) =>
          sk.has(key) ? tdNum(a[key], dec, _s) : tdNum(a[key], dec);
        const sG = (key, dec, grade) =>
          sk.has(key)
            ? tdGraded(a[key], dec, grade, _s)
            : tdGraded(a[key], dec, grade);
        const sC = (key, dec) =>
          sk.has(key)
            ? tdNumColored(a[key], dec, _s)
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
        const _s = { stale: true };
        const sN = (key, dec) =>
          sk.has(key) ? tdNum(a[key], dec, _s) : tdNum(a[key], dec);
        const sG = (key, dec, grade) =>
          sk.has(key)
            ? tdGraded(a[key], dec, grade, _s)
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

  APP.renderers["leaderboards"] = window.renderLeaderboards;
  APP.renderers["sprint"] = renderSprintAnalysis;
  APP.renderers["strength"] = renderStrengthPower;
  APP.renderers["scorecard"] = window.renderScorecard;
  APP.renderers["log"] = window.renderTestingLog;
  APP.renderers["plan"] = renderTestingWeekPlan;
  APP.renderers["constants"] = renderConstants;
  Object.assign(APP, {
    renderSprintAnalysis, renderStrengthPower, renderTestingWeekPlan,
    renderConstants, handleSort, SPRINT_GRADE_KEYS, STRENGTH_GRADE_KEYS,
  });
})();
