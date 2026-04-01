/* ===================================================
   print.js — Print & report functions
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    fmtHeight,
    ordGrade,
    fmt,
    fmtZ,
    getAthleteById,
    showToast,
    getAthleteHistory,
    currentTestValues,
    TEST_METRIC_KEYS,
    GRADE_TIER_LABELS,
    GRADE_TIER_COLORS,
  } = APP;

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

  /* --- Print Sprint Analysis table --- */
  window.printSprintTable = function () {
    const D = window.CLUB;
    const sprinters = D.athletes.filter(function (a) {
      return a.sprint020 !== null;
    });
    if (sprinters.length === 0) {
      showToast("No sprint data to print.", "warn");
      return;
    }
    let html = '<div class="print-page">';
    html +=
      '<div class="print-header-bar"><span class="print-logo">BC Personal Fitness Club</span><span class="print-date">Sprint Analysis — ' +
      new Date().toLocaleDateString() +
      "</span></div>";
    html +=
      '<table class="print-data-table"><thead><tr><th>Athlete</th><th>Pos</th><th>Mass</th><th>0-20</th><th>20-30</th><th>30-40</th><th>40yd</th><th>vMax</th><th>v10</th><th>MPH</th><th>F1</th><th>momMax</th><th>Pow1</th></tr></thead><tbody>';
    for (let i = 0; i < sprinters.length; i++) {
      const a = sprinters[i];
      const f = function (v, d) {
        return v !== null && v !== undefined
          ? typeof d === "number"
            ? v.toFixed(d)
            : v
          : "—";
      };
      html +=
        "<tr><td>" +
        esc(a.name) +
        "</td><td>" +
        (a.position || "—") +
        '</td><td class="num">' +
        f(a.massKg, 1) +
        '</td><td class="num">' +
        f(a.sprint020, 2) +
        '</td><td class="num">' +
        f(a.sprint2030, 2) +
        '</td><td class="num">' +
        f(a.sprint3040, 2) +
        '</td><td class="num">' +
        f(a.forty, 2) +
        '</td><td class="num">' +
        f(a.vMax, 2) +
        '</td><td class="num">' +
        f(a.v10Max, 2) +
        '</td><td class="num">' +
        f(a.topMph, 1) +
        '</td><td class="num">' +
        f(a.F1, 1) +
        '</td><td class="num">' +
        f(a.momMax, 1) +
        '</td><td class="num">' +
        f(a.pow1, 0) +
        "</td></tr>";
    }
    html += "</tbody></table>";
    html +=
      '<div class="print-footer">BC Personal Fitness Club — Sprint Analysis Report</div></div>';
    openPrintWindow(html, "Sprint Analysis");
  };

  /* --- Print Strength & Power table --- */
  window.printStrengthTable = function () {
    const D = window.CLUB;
    const list = D.athletes.filter(function (a) {
      return (
        a.bench !== null ||
        a.squat !== null ||
        a.peakPower !== null ||
        a.medball !== null
      );
    });
    if (list.length === 0) {
      showToast("No strength data to print.", "warn");
      return;
    }
    let html = '<div class="print-page">';
    html +=
      '<div class="print-header-bar"><span class="print-logo">BC Personal Fitness Club</span><span class="print-date">Strength &amp; Power — ' +
      new Date().toLocaleDateString() +
      "</span></div>";
    html +=
      '<table class="print-data-table"><thead><tr><th>Athlete</th><th>Pos</th><th>Wt</th><th>Bench</th><th>Rel B</th><th>Squat</th><th>Rel S</th><th>MB</th><th>Vert</th><th>Broad</th><th>PP</th><th>Rel PP</th><th>Str Util</th></tr></thead><tbody>';
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const f = function (v, d) {
        return v !== null && v !== undefined
          ? typeof d === "number"
            ? v.toFixed(d)
            : v
          : "—";
      };
      html +=
        "<tr><td>" +
        esc(a.name) +
        "</td><td>" +
        (a.position || "—") +
        '</td><td class="num">' +
        f(a.weight, 0) +
        '</td><td class="num">' +
        f(a.bench, 0) +
        '</td><td class="num">' +
        f(a.relBench, 2) +
        '</td><td class="num">' +
        f(a.squat, 0) +
        '</td><td class="num">' +
        f(a.relSquat, 2) +
        '</td><td class="num">' +
        f(a.medball, 0) +
        '</td><td class="num">' +
        f(a.vert, 1) +
        '</td><td class="num">' +
        f(a.broad, 0) +
        '</td><td class="num">' +
        f(a.peakPower, 0) +
        '</td><td class="num">' +
        f(a.relPeakPower, 1) +
        '</td><td class="num">' +
        f(a.strengthUtil, 3) +
        "</td></tr>";
    }
    html += "</tbody></table>";
    html +=
      '<div class="print-footer">BC Personal Fitness Club — Strength &amp; Power Report</div></div>';
    openPrintWindow(html, "Strength & Power");
  };

  /* --- Print Team Summary One-Pager --- */
  window.printTeamSummary = function () {
    const D = window.CLUB;
    const athletes = D.athletes;
    const total = athletes.length;
    if (total === 0) {
      showToast("No athlete data to summarize.", "warn");
      return;
    }

    // Compute averages
    const sumKeys = [
      { key: "bench", label: "Bench 1RM", unit: "lb", dec: 0 },
      { key: "squat", label: "Squat 1RM", unit: "lb", dec: 0 },
      { key: "medball", label: "Med Ball", unit: "in", dec: 0 },
      { key: "vert", label: "Vertical", unit: "in", dec: 1 },
      { key: "broad", label: "Broad Jump", unit: "in", dec: 0 },
      { key: "forty", label: "40 yd", unit: "s", dec: 2 },
      { key: "peakPower", label: "Peak Power", unit: "W", dec: 0 },
      { key: "relBench", label: "Rel Bench", unit: "xBW", dec: 2 },
      { key: "relSquat", label: "Rel Squat", unit: "xBW", dec: 2 },
    ];
    const sums = {}, counts = {}, maxVals = {}, maxNames = {};
    for (let sk = 0; sk < sumKeys.length; sk++) {
      sums[sumKeys[sk].key] = 0;
      counts[sumKeys[sk].key] = 0;
      maxVals[sumKeys[sk].key] = null;
      maxNames[sumKeys[sk].key] = "";
    }
    const coreFields = ["bench", "squat", "medball", "vert", "broad", "forty"];
    let fullyTested = 0;
    for (let ai = 0; ai < athletes.length; ai++) {
      const a = athletes[ai];
      let allCore = true;
      for (let cf = 0; cf < coreFields.length; cf++) {
        if (a[coreFields[cf]] === null) allCore = false;
      }
      if (allCore) fullyTested++;
      for (let sk2 = 0; sk2 < sumKeys.length; sk2++) {
        const k = sumKeys[sk2].key;
        if (a[k] !== null && a[k] !== undefined) {
          sums[k] += a[k];
          counts[k]++;
          const isBetter =
            maxVals[k] === null
              ? true
              : k === "forty"
                ? a[k] < maxVals[k]
                : a[k] > maxVals[k];
          if (isBetter) {
            maxVals[k] = a[k];
            maxNames[k] = a.name;
          }
        }
      }
    }

    // Grade distribution
    const gradeCounts = { elite: 0, excellent: 0, good: 0, average: 0, below: 0 };
    for (let gi = 0; gi < athletes.length; gi++) {
      const og = athletes[gi].overallGrade;
      if (og && gradeCounts[og.tier] !== undefined) gradeCounts[og.tier]++;
    }

    // Top improvements (if test history exists)
    const improvements = [];
    for (let ti = 0; ti < athletes.length; ti++) {
      const ath = athletes[ti];
      const hist = getAthleteHistory(ath.id);
      if (hist.length < 2) continue;
      const newest = hist[0];
      const prior = hist[1];
      // Check bench improvement
      if (
        newest.values.bench_1rm != null &&
        prior.values.bench_1rm != null &&
        newest.values.bench_1rm > prior.values.bench_1rm
      ) {
        improvements.push({
          name: ath.name,
          metric: "Bench",
          from: prior.values.bench_1rm,
          to: newest.values.bench_1rm,
          delta: newest.values.bench_1rm - prior.values.bench_1rm,
        });
      }
      if (
        newest.values.squat_1rm != null &&
        prior.values.squat_1rm != null &&
        newest.values.squat_1rm > prior.values.squat_1rm
      ) {
        improvements.push({
          name: ath.name,
          metric: "Squat",
          from: prior.values.squat_1rm,
          to: newest.values.squat_1rm,
          delta: newest.values.squat_1rm - prior.values.squat_1rm,
        });
      }
    }
    improvements.sort(function (a, b) {
      return b.delta - a.delta;
    });
    const topImprov = improvements.slice(0, 6);

    // Data quality flags
    const flagCount = D.flags ? D.flags.length : 0;
    const warnCount = D.warnings ? D.warnings.length : 0;

    // Build HTML
    let html = '<div class="print-page">';
    html +=
      '<div class="print-header-bar"><span class="print-logo">BC Personal Fitness Club</span><span class="print-date">Team Summary — ' +
      new Date().toLocaleDateString() +
      "</span></div>";

    // Roster overview
    html += '<h3 class="print-section">Roster Overview</h3>';
    html +=
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;font-size:8pt">';
    html +=
      "<div><strong>Total Athletes:</strong> " +
      total +
      "</div><div><strong>Fully Tested:</strong> " +
      fullyTested +
      "/" +
      total +
      " (" +
      (total > 0 ? Math.round((fullyTested / total) * 100) : 0) +
      "%)</div><div><strong>Positions:</strong> " +
      D.positions.length +
      "</div></div>";

    // Grade distribution bar
    html += '<h3 class="print-section">Grade Distribution</h3>';
    html +=
      '<div style="display:flex;gap:8px;margin-bottom:10px;font-size:8pt">';
    const tierColors = {
      elite: "#d4edda",
      excellent: "#cce5ff",
      good: "#fff3cd",
      average: "#ffe0cc",
      below: "#f8d7da",
    };
    const tierLabels = {
      elite: "Elite",
      excellent: "Excellent",
      good: "Good",
      average: "Average",
      below: "Below",
    };
    for (const tk in tierLabels) {
      html +=
        '<span style="background:' +
        tierColors[tk] +
        ';padding:3px 8px;border-radius:4px;font-weight:600">' +
        tierLabels[tk] +
        ": " +
        gradeCounts[tk] +
        "</span>";
    }
    html += "</div>";

    // Team averages table
    html += '<h3 class="print-section">Team Averages &amp; Leaders</h3>';
    html +=
      '<table class="print-data-table"><thead><tr><th>Metric</th><th>Team Avg</th><th>Tested</th><th>Best</th><th>Leader</th></tr></thead><tbody>';
    for (let ski = 0; ski < sumKeys.length; ski++) {
      const sm = sumKeys[ski];
      const avg =
        counts[sm.key] > 0
          ? (sums[sm.key] / counts[sm.key]).toFixed(sm.dec)
          : "—";
      const best =
        maxVals[sm.key] !== null
          ? typeof sm.dec === "number"
            ? maxVals[sm.key].toFixed(sm.dec)
            : maxVals[sm.key]
          : "—";
      html +=
        "<tr><td>" +
        sm.label +
        " (" +
        sm.unit +
        ')</td><td class="num">' +
        avg +
        '</td><td class="num">' +
        counts[sm.key] +
        "/" +
        total +
        '</td><td class="num" style="font-weight:700">' +
        best +
        "</td><td>" +
        esc(maxNames[sm.key]) +
        "</td></tr>";
    }
    html += "</tbody></table>";

    // Top improvements
    if (topImprov.length > 0) {
      html += '<h3 class="print-section">Biggest Improvements</h3>';
      html +=
        '<table class="print-data-table"><thead><tr><th>Athlete</th><th>Metric</th><th>Previous</th><th>Current</th><th>Change</th></tr></thead><tbody>';
      for (let ii = 0; ii < topImprov.length; ii++) {
        const imp = topImprov[ii];
        html +=
          "<tr><td>" +
          esc(imp.name) +
          "</td><td>" +
          imp.metric +
          '</td><td class="num">' +
          imp.from +
          '</td><td class="num" style="font-weight:700">' +
          imp.to +
          '</td><td class="num" style="color:#155724;font-weight:700">+' +
          imp.delta +
          "</td></tr>";
      }
      html += "</tbody></table>";
    }

    // Flags
    if (flagCount > 0 || warnCount > 0) {
      html += '<h3 class="print-section">Data Quality Notes</h3>';
      html += '<div style="font-size:8pt">';
      if (warnCount > 0)
        html +=
          "<p>⚠️ " +
          warnCount +
          " data coverage warning(s) — some metrics have fewer than 5 data points.</p>";
      if (flagCount > 0)
        html +=
          "<p>🚩 " +
          flagCount +
          " athlete data flag(s) — see dashboard for details.</p>";
      html += "</div>";
    }

    html +=
      '<div class="print-footer">BC Personal Fitness Club — Team Summary Report</div></div>';
    openPrintWindow(html, "Team Summary");
  };

  /* --- Print progress section (for profile printout) --- */
  function buildPrintProgressSection(a) {
    const history = getAthleteHistory(a.id);
    if (history.length === 0) return "";
    const current = currentTestValues(a);
    const shown = history.slice(0, 4); // up to 4 previous tests

    let html =
      '<div class="print-progress" style="margin-top:10px;page-break-inside:avoid">';
    html +=
      '<h3 class="print-section">Progress History (' +
      history.length +
      " previous test" +
      (history.length > 1 ? "s" : "") +
      ")</h3>";

    // Build header
    html +=
      '<table class="print-metric-table print-progress-table" style="width:100%"><thead><tr><th>Metric</th><th>Current</th>';
    for (let ti = 0; ti < shown.length; ti++) {
      html +=
        "<th>" +
        esc(shown[ti].label || shown[ti].date) +
        "<br><small>" +
        shown[ti].date +
        "</small></th>";
    }
    html += "<th>Change</th></tr></thead><tbody>";

    // Helper: format a value with appropriate decimals
    function fmtVal(v, mk) {
      if (v === null || v === undefined) return "—";
      if (Number.isInteger(v)) return String(v);
      return v.toFixed(2);
    }

    // Metric rows — skip entirely if current AND all history values are null
    for (let i = 0; i < TEST_METRIC_KEYS.length; i++) {
      const mk = TEST_METRIC_KEYS[i];
      const cv = current[mk.jsonKey];
      let hasAny = cv !== null && cv !== undefined;
      const histVals = [];
      for (let si = 0; si < shown.length; si++) {
        const hv = shown[si].values[mk.jsonKey];
        histVals.push(hv);
        if (hv !== null && hv !== undefined) hasAny = true;
      }
      if (!hasAny) continue; // skip empty rows

      html +=
        "<tr><td><strong>" +
        mk.label +
        "</strong> <small>" +
        mk.unit +
        "</small></td>";
      html += '<td class="num">' + fmtVal(cv, mk) + "</td>";
      for (let hi = 0; hi < histVals.length; hi++) {
        html += '<td class="num">' + fmtVal(histVals[hi], mk) + "</td>";
      }

      // Delta column: current vs oldest shown, or newest vs second-newest
      let newV = null, oldV = null;
      if (shown.length >= 2) {
        newV = shown[0].values[mk.jsonKey];
        oldV = shown[1].values[mk.jsonKey];
      } else if (shown.length === 1) {
        newV = cv;
        oldV = shown[0].values[mk.jsonKey];
      }
      if (newV != null && oldV != null) {
        const d = newV - oldV;
        if (d === 0) {
          html += '<td class="num" style="color:#999">—</td>';
        } else {
          const pctChange =
            oldV !== 0 ? Math.round((d / Math.abs(oldV)) * 100) : 0;
          const improved = mk.lower ? d < 0 : d > 0;
          const arrow = improved ? "▲" : "▼";
          const sign = d > 0 ? "+" : "";
          html +=
            '<td class="num ' +
            (improved ? "print-delta-up" : "print-delta-down") +
            '">' +
            arrow +
            " " +
            sign +
            (Number.isInteger(d) ? d : d.toFixed(2)) +
            " <small>(" +
            sign +
            pctChange +
            "%)</small></td>";
        }
      } else {
        html += '<td class="num">—</td>';
      }
      html += "</tr>";
    }

    // 40 yd Total composite row (derived from sprint splits)
    const curForty = a.forty;
    let fortyHasAny = curForty != null;
    const fortyHist = [];
    for (let fi = 0; fi < shown.length; fi++) {
      const fv = shown[fi].values;
      const hForty =
        fv.sprint_020 != null &&
        fv.sprint_2030 != null &&
        fv.sprint_3040 != null
          ? +(fv.sprint_020 + fv.sprint_2030 + fv.sprint_3040).toFixed(2)
          : null;
      fortyHist.push(hForty);
      if (hForty !== null) fortyHasAny = true;
    }
    if (fortyHasAny) {
      html +=
        '<tr style="border-top:1px solid #bbb"><td><strong>40 yd Total</strong> <small>s</small></td>';
      html +=
        '<td class="num">' + (curForty != null ? curForty : "—") + "</td>";
      for (let fhi = 0; fhi < fortyHist.length; fhi++) {
        html +=
          '<td class="num">' +
          (fortyHist[fhi] !== null ? fortyHist[fhi] : "—") +
          "</td>";
      }
      // Delta for forty
      let newForty = null, oldForty = null;
      if (shown.length >= 2) {
        newForty = fortyHist[0];
        oldForty = fortyHist[1];
      } else if (shown.length === 1) {
        newForty = curForty;
        oldForty = fortyHist[0];
      }
      if (newForty != null && oldForty != null) {
        const fd = newForty - oldForty;
        if (fd === 0) {
          html += '<td class="num" style="color:#999">—</td>';
        } else {
          const fpct =
            oldForty !== 0 ? Math.round((fd / Math.abs(oldForty)) * 100) : 0;
          const fImproved = fd < 0;
          const fArrow = fImproved ? "▲" : "▼";
          const fSign = fd > 0 ? "+" : "";
          html +=
            '<td class="num ' +
            (fImproved ? "print-delta-up" : "print-delta-down") +
            '">' +
            fArrow +
            " " +
            fSign +
            fd.toFixed(2) +
            " <small>(" +
            fSign +
            fpct +
            "%)</small></td>";
        }
      } else {
        html += '<td class="num">—</td>';
      }
      html += "</tr>";
    }

    html += "</tbody></table></div>";
    return html;
  }

  /* --- Shared print window opener --- */
  function openPrintWindow(bodyHTML, title, extraCSS) {
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

  /* Progress table */
  .print-progress-table th { font-size: 7pt; text-transform: uppercase; color: #666; border-bottom: 1px solid #bbb; text-align: center; }
  .print-progress-table th:first-child { text-align: left; }
  .print-progress-table td small { font-size: 6.5pt; color: #777; }
  .print-delta-up { color: #155724; }
  .print-delta-down { color: #721c24; }

  .na { color: #aaa; }
  @media print {
    body { padding: 0; }
    @page { size: ${bodyHTML.includes("print-scorecard-page") ? "landscape" : "portrait"}; margin: 0.4in; }
  }
  ${extraCSS || ""}
</style></head><body>${bodyHTML}</body></html>`);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 400);
  }

  Object.assign(APP, { openPrintWindow, buildPrintProgressSection });

  /* ========== PDF TEAM REPORT (Item 21) ========== */
  window.exportTeamPDF = function () {
    const D = window.CLUB;
    if (!D || !D.athletes || D.athletes.length === 0) {
      showToast("No athlete data available.", "warn");
      return;
    }

    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    // Summary stats
    var total = D.athletes.length;
    var tested = D.athletes.filter(function (a) {
      return a.bench !== null || a.squat !== null || a.forty !== null;
    }).length;

    function avg(key) {
      var vals = D.athletes.filter(function (a) { return a[key] !== null; }).map(function (a) { return a[key]; });
      return vals.length ? (vals.reduce(function (s, v) { return s + v; }, 0) / vals.length) : null;
    }

    var avgBench = avg("bench");
    var avgSquat = avg("squat");
    var avg40 = avg("forty");
    var avgVert = avg("vert");

    // Build roster rows
    var rosterRows = D.athletes.map(function (a) {
      var og = a.overallGrade;
      return "<tr>" +
        "<td style='text-align:left;font-weight:600'>" + esc(a.name) + "</td>" +
        "<td>" + (esc(a.position) || "—") + "</td>" +
        "<td>" + (esc(a.group) || "—") + "</td>" +
        "<td class='num'>" + (a.bench !== null ? a.bench : "—") + "</td>" +
        "<td class='num'>" + (a.squat !== null ? a.squat : "—") + "</td>" +
        "<td class='num'>" + (a.medball !== null ? a.medball : "—") + "</td>" +
        "<td class='num'>" + (a.vert !== null ? a.vert.toFixed(1) : "—") + "</td>" +
        "<td class='num'>" + (a.forty !== null ? a.forty.toFixed(2) : "—") + "</td>" +
        "<td>" + (og ? og.label : "—") + "</td>" +
        "</tr>";
    }).join("");

    var bodyHTML = '<div class="pdf-report">' +
      '<div class="pdf-header">' +
        '<h1>BC Personal Fitness Club</h1>' +
        '<h2>Team Performance Report</h2>' +
        '<p class="pdf-date">' + today + '</p>' +
      '</div>' +
      '<div class="pdf-summary">' +
        '<div class="pdf-stat"><span class="pdf-stat-val">' + total + '</span><span class="pdf-stat-label">Athletes</span></div>' +
        '<div class="pdf-stat"><span class="pdf-stat-val">' + tested + '</span><span class="pdf-stat-label">Tested</span></div>' +
        '<div class="pdf-stat"><span class="pdf-stat-val">' + (avgBench ? avgBench.toFixed(0) : "—") + '</span><span class="pdf-stat-label">Avg Bench (lb)</span></div>' +
        '<div class="pdf-stat"><span class="pdf-stat-val">' + (avgSquat ? avgSquat.toFixed(0) : "—") + '</span><span class="pdf-stat-label">Avg Squat (lb)</span></div>' +
        '<div class="pdf-stat"><span class="pdf-stat-val">' + (avgVert ? avgVert.toFixed(1) : "—") + '</span><span class="pdf-stat-label">Avg Vert (in)</span></div>' +
        '<div class="pdf-stat"><span class="pdf-stat-val">' + (avg40 ? avg40.toFixed(2) : "—") + '</span><span class="pdf-stat-label">Avg 40yd (s)</span></div>' +
      '</div>' +
      '<h3>Full Roster</h3>' +
      '<table class="pdf-table"><thead><tr>' +
        '<th style="text-align:left">Name</th><th>Pos</th><th>Group</th>' +
        '<th>Bench</th><th>Squat</th><th>MB</th><th>Vert</th><th>40yd</th><th>Rating</th>' +
      '</tr></thead><tbody>' + rosterRows + '</tbody></table>' +
      '</div>';

    openPrintWindow(bodyHTML, "Team Report — " + today,
      '.pdf-report { font-family: "Inter", system-ui, sans-serif; color: #1a1d27; }' +
      '.pdf-header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #6c63ff; padding-bottom: 16px; }' +
      '.pdf-header h1 { font-size: 20pt; color: #6c63ff; margin-bottom: 4px; }' +
      '.pdf-header h2 { font-size: 12pt; font-weight: 600; color: #555; }' +
      '.pdf-date { font-size: 9pt; color: #888; margin-top: 4px; }' +
      '.pdf-summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 24px; }' +
      '.pdf-stat { text-align: center; padding: 12px 8px; border: 1px solid #ddd; border-radius: 6px; background: #f9f9fb; }' +
      '.pdf-stat-val { display: block; font-size: 18pt; font-weight: 800; color: #6c63ff; }' +
      '.pdf-stat-label { display: block; font-size: 7pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }' +
      'h3 { font-size: 11pt; margin-bottom: 8px; color: #333; }' +
      '.pdf-table { width: 100%; border-collapse: collapse; font-size: 8pt; }' +
      '.pdf-table th { background: #f4f5f7; padding: 6px 8px; text-align: center; font-weight: 700; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #ddd; }' +
      '.pdf-table td { padding: 5px 8px; text-align: center; border-bottom: 1px solid #eee; }' +
      '.pdf-table tbody tr:nth-child(even) { background: #fafbfc; }' +
      '.num { font-variant-numeric: tabular-nums; }' +
      '@page { size: landscape; margin: 0.4in; }' +
      '@media print { body { padding: 0; } }'
    );
    showToast("PDF report opened — use browser Print > Save as PDF.", "info");
  };
})();
