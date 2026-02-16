/* ===================================================
   compare.js — Compare & Improvement Tracker +
   Position Group Dashboard
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    escJs,
    fmt,
    fmtZ,
    getAthleteById,
    showToast,
    chartAnimOpts,
    destroyChart,
    getTestHistory,
    getAthleteHistory,
    normMetric,
    normMetricInv,
    METRIC_INFO,
    TEST_METRIC_KEYS,
    GRADE_TIER_LABELS,
    tierLabelFromAvg,
  } = APP;

  /* ========== COMPARE & IMPROVEMENT TRACKER ========== */



  function _destroyAllCmpCharts() {
    APP.charts.cmp = destroyChart(APP.charts.cmp);
    for (const c of APP.charts._cmpCharts) destroyChart(c);
    APP.charts._cmpCharts = [];
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

    // Build summary cards (including weight)
    const filteredMetrics = CMP_METRICS;
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

    const filteredMetrics = CMP_METRICS;
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
    const h2hMetrics = CMP_METRICS;
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

    APP.charts.cmp = new Chart(document.getElementById("cmpRadar"), {
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
    const weightKey = "weight";
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
      const wd = deltas[i][weightKey];
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
    APP.charts._cmpCharts.push(chart);
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

  APP.renderers["compare"] = window.renderComparison;
  APP.renderers["groups"] = window.renderGroupDashboard;
  Object.assign(APP, { _destroyAllCmpCharts });
})();
