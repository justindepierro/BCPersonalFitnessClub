/* ===================================================
   profile.js — Athlete Profile tab + chart builders
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    fmtHeight,
    ordGrade,
    fmtZ,
    fmt,
    getAthleteById,
    chartAnimOpts,
    destroyChart,
    pctToGradeTier,
    tierBadge,
    pctBarHTML,
    gradeBadge,
    METRIC_INFO,
    GRADE_TIER_ORDER,
    GRADE_TIER_LABELS,
    GRADE_TIER_COLORS,
    getAthleteHistory,
    currentTestValues,
    TEST_METRIC_KEYS,
  } = APP;

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

      ${APP.buildProgressSection(a)}

      <div class="profile-section-title">Progress Timeline</div>
      <div class="profile-chart-wrap profile-chart-wide"><canvas id="profileProgressChart"></canvas></div>

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
    buildProgressTimeline(a);
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

  function _getMinMax(key) {
    if (APP._normCache.has(key)) return APP._normCache.get(key);
    const vals = window.CLUB.athletes
      .map((x) => x[key])
      .filter((v) => v !== null);
    if (vals.length === 0) {
      APP._normCache.set(key, { min: 0, max: 0 });
      return { min: 0, max: 0 };
    }
    let min = vals[0],
      max = vals[0];
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] < min) min = vals[i];
      if (vals[i] > max) max = vals[i];
    }
    const result = { min, max };
    APP._normCache.set(key, result);
    return result;
  }
  function invalidateNormCache() {
    APP._normCache.clear();
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
    if (APP.charts.profileRadar) {
      APP.charts.profileRadar.destroy();
      APP.charts.profileRadar = null;
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

    var T = APP.getChartTheme();
    APP.charts.profileRadar = new Chart(canvas, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: a.name,
            data: values,
            fill: true,
            backgroundColor: T.purple + "33",
            borderColor: T.purple,
            pointBackgroundColor: T.purple,
            pointBorderColor: T.bg,
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
            grid: { color: T.grid },
            angleLines: { color: T.grid },
            pointLabels: {
              color: T.tick,
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
    if (APP.charts.profilePct) {
      APP.charts.profilePct.destroy();
      APP.charts.profilePct = null;
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
    var T = APP.getChartTheme();
    const colors = values.map((v) =>
      v >= 80
        ? T.purple
        : v >= 60
          ? T.green
          : v >= 40
            ? T.blue
            : v >= 20
              ? T.yellow
              : T.red,
    );

    APP.charts.profilePct = new Chart(canvas, {
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
            grid: { color: T.grid },
            ticks: { color: T.tick, callback: (v) => v + "%" },
          },
          y: {
            grid: { display: false },
            ticks: { color: T.text, font: { size: 11 } },
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
    if (APP.charts.profileSprint) {
      APP.charts.profileSprint.destroy();
      APP.charts.profileSprint = null;
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

    var T = APP.getChartTheme();
    APP.charts.profileSprint = new Chart(canvas, {
      type: "line",
      data: {
        labels: phases,
        datasets: [
          {
            label: a.name,
            data: athleteVels,
            borderColor: T.purple,
            backgroundColor: T.purple + "26",
            fill: true,
            tension: 0.3,
            pointRadius: 6,
            pointBackgroundColor: T.purple,
            pointBorderColor: T.bg,
            pointBorderWidth: 2,
          },
          {
            label: "Team Avg",
            data: teamAvgs,
            borderColor: T.blue,
            backgroundColor: T.blue + "14",
            fill: false,
            borderDash: [6, 3],
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: T.blue,
            pointBorderColor: T.bg,
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
            title: { display: true, text: "Velocity (m/s)", color: T.tick },
            grid: { color: T.grid },
            ticks: { color: T.tick },
          },
          x: {
            grid: { color: T.grid },
            ticks: { color: T.tick },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: T.text,
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
    if (APP.charts.profileDonut) {
      APP.charts.profileDonut.destroy();
      APP.charts.profileDonut = null;
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

    var T = APP.getChartTheme();
    APP.charts.profileDonut = new Chart(canvas, {
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
              color: T.text,
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
    if (APP.charts.profileQuadrant) {
      APP.charts.profileQuadrant.destroy();
      APP.charts.profileQuadrant = null;
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

    var T = APP.getChartTheme();
    const others = teamPoints.filter((p) => p.id !== a.id);

    APP.charts.profileQuadrant = new Chart(canvas, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Teammates",
            data: others.map((p) => ({ x: p.x, y: p.y })),
            backgroundColor: T.blue + "59",
            borderColor: T.blue,
            pointRadius: 5,
            pointHoverRadius: 7,
            _names: others.map((p) => p.name),
          },
          {
            label: a.name,
            data: [{ x: a.relSquat, y: a.forty }],
            backgroundColor: T.purple,
            borderColor: T.bg,
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
              color: T.tick,
            },
            grid: { color: T.grid },
            ticks: { color: T.tick },
          },
          y: {
            reverse: true,
            title: {
              display: true,
              text: "40-yd Dash (s) ↑  Faster",
              color: T.tick,
            },
            grid: { color: T.grid },
            ticks: { color: T.tick },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: T.text,
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
                    borderColor: T.grid,
                    borderDash: [4, 4],
                  },
                  avgSpd: {
                    type: "line",
                    yMin: avgSpd,
                    yMax: avgSpd,
                    borderColor: T.grid,
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

  /* ========== PROGRESS TIMELINE CHART ========== */
  function buildProgressTimeline(a) {
    const canvas = document.getElementById("profileProgressChart");
    if (!canvas || typeof Chart === "undefined") return;
    if (APP.charts.profileProgress) {
      APP.charts.profileProgress.destroy();
      APP.charts.profileProgress = null;
    }

    const history = getAthleteHistory(a.id); // newest-first
    if (history.length === 0) {
      canvas.parentElement.style.display = "none";
      // Also hide the section title
      const prevTitle = canvas.parentElement.previousElementSibling;
      if (prevTitle && prevTitle.classList.contains("profile-section-title"))
        prevTitle.style.display = "none";
      return;
    }

    // Build timeline: each test date is a data point, plus "Current" at the end
    const current = currentTestValues(a);
    // Sort entries oldest-first for the timeline
    const sorted = history.slice().sort(function (x, y) {
      return x.date < y.date ? -1 : x.date > y.date ? 1 : 0;
    });

    var T = APP.getChartTheme();
    // Pick the 4 most interesting metrics to chart (ones with data across multiple entries)
    const candidates = [
      { key: "bench_1rm", label: "Bench", color: T.purple, iKey: "bench" },
      { key: "squat_1rm", label: "Squat", color: T.blue, iKey: "squat" },
      { key: "vert_in", label: "Vert", color: T.green, iKey: "vert" },
      { key: "broad_in", label: "Broad", color: T.yellow, iKey: "broad" },
      {
        key: "medball_in",
        label: "Med Ball",
        color: T.orange,
        iKey: "medball",
      },
      { key: "weight_lb", label: "Weight", color: T.muted, iKey: "weight" },
    ];

    // Build labels and datasets
    const labels = sorted.map(function (e) {
      return e.label || e.date;
    });
    labels.push("Current");

    const datasets = [];
    for (let ci = 0; ci < candidates.length; ci++) {
      const c = candidates[ci];
      const data = [];
      let hasMultiple = 0;
      for (let si = 0; si < sorted.length; si++) {
        const v = sorted[si].values[c.key];
        data.push(v != null ? v : null);
        if (v != null) hasMultiple++;
      }
      // Add current value as last point
      const curV = current[c.key];
      data.push(curV != null ? curV : null);
      if (curV != null) hasMultiple++;

      if (hasMultiple >= 2) {
        datasets.push({
          label: c.label,
          data: data,
          borderColor: c.color,
          backgroundColor: c.color + "22",
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: c.color,
          pointBorderColor: T.bg,
          pointBorderWidth: 2,
          spanGaps: true,
        });
      }
    }

    if (datasets.length === 0) {
      canvas.parentElement.style.display = "none";
      const prevTitle2 = canvas.parentElement.previousElementSibling;
      if (prevTitle2 && prevTitle2.classList.contains("profile-section-title"))
        prevTitle2.style.display = "none";
      return;
    }

    // For metrics with very different scales, use multiple Y axes
    let useMultiAxis = false;
    if (datasets.length >= 2) {
      const ranges = datasets.map(function (ds) {
        const vals = ds.data.filter(function (v) {
          return v !== null;
        });
        return {
          min: Math.min.apply(null, vals),
          max: Math.max.apply(null, vals),
        };
      });
      const maxRange = Math.max.apply(
        null,
        ranges.map(function (r) {
          return r.max;
        }),
      );
      const minRange = Math.min.apply(
        null,
        ranges.map(function (r) {
          return r.min;
        }),
      );
      // If ratio between largest and smallest max is >5x, use dual axes
      if (maxRange > 0 && minRange > 0 && maxRange / minRange > 5)
        useMultiAxis = true;
    }

    if (useMultiAxis && datasets.length >= 2) {
      // Split: first dataset on left y, rest on right y
      datasets[0].yAxisID = "y";
      for (let di = 1; di < datasets.length; di++) {
        datasets[di].yAxisID = "y1";
      }
    }

    const scales = {
      x: {
        grid: { color: T.grid },
        ticks: { color: T.tick, font: { size: 10 } },
      },
      y: {
        position: "left",
        grid: { color: T.grid },
        ticks: { color: T.tick },
        title: useMultiAxis
          ? {
              display: true,
              text: datasets[0].label,
              color: datasets[0].borderColor,
              font: { size: 10 },
            }
          : { display: false },
      },
    };
    if (useMultiAxis) {
      scales.y1 = {
        position: "right",
        grid: { drawOnChartArea: false },
        ticks: { color: T.tick },
        title: {
          display: true,
          text: datasets
            .slice(1)
            .map(function (d) {
              return d.label;
            })
            .join(", "),
          color: T.tick,
          font: { size: 10 },
        },
      };
    }

    APP.charts.profileProgress = new Chart(canvas, {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: {
        ...chartAnimOpts(),
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: scales,
        plugins: {
          legend: {
            labels: {
              color: T.text,
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return (
                  ctx.dataset.label +
                  ": " +
                  (ctx.raw !== null ? ctx.raw : "N/A")
                );
              },
            },
          },
        },
      },
    });
  }

  APP.renderers["profiles"] = window.renderProfile;
  Object.assign(APP, { normMetric, normMetricInv, invalidateNormCache, metricCard, metricCardZ, metricCardPct });
})();
