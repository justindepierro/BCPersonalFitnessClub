/* ===================================================
   overview.js — Team Overview tab + inline weight editing
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    escJs,
    debounce,
    ordGrade,
    fmtZ,
    fmt,
    tdNum,
    tdGraded,
    overallGradeCell,
    getAthleteById,
    showToast,
    safeLSGet,
    safeLSSet,
    markTabsDirty,
    getPrevTestValues,
    getStaleKeys,
    getWeekKey,
    fmtWeekLabel,
    logWeight,
    getWeightHistory,
  } = APP;

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

    let cardsHtml = `
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
    const thead = document.querySelector("#rosterTable thead");
    let thRow = "<tr>";
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
        const _stale = { stale: true };
        // Helper: render current value (stale-styled if from older test) or fall back to previous
        function cellG(key, dec, grade) {
          if (a[key] !== null && a[key] !== undefined) {
            return staleKeys.has(key)
              ? tdGraded(a[key], dec, grade, _stale)
              : tdGraded(a[key], dec, grade);
          }
          if (prev[key] !== null && prev[key] !== undefined)
            return tdNum(prev[key], dec, _stale);
          return '<td class="num na">—</td>';
        }
        function cellN(key, dec) {
          if (a[key] !== null && a[key] !== undefined) {
            return staleKeys.has(key)
              ? tdNum(a[key], dec, _stale)
              : tdNum(a[key], dec);
          }
          if (prev[key] !== null && prev[key] !== undefined)
            return tdNum(prev[key], dec, _stale);
          return '<td class="num na">—</td>';
        }
        let relCols = "";
        if (showRel) {
          relCols =
            '<td class="num">' +
            (a.trainingAge !== null ? a.trainingAge : "—") +
            "</td>";
        }
        const relBenchCol = showRel
          ? cellG("relBench", 2, a.grades.relBench)
          : "";
        const relSquatCol = showRel
          ? cellG("relSquat", 2, a.grades.relSquat)
          : "";
        const mbRelCol = showRel ? cellG("mbRel", 2, a.grades.mbRel) : "";
        const ppCols = showRel
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
        <td class="num wt-cell" data-id="${esc(a.id)}" onclick="event.stopPropagation();inlineEditWeight(this,'${escJs(a.id)}')" onmouseenter="showWeightHistory(this,'${escJs(a.id)}')" onmouseleave="hideWeightHistory(this)" title="Click to update weight">${a.weight !== null && a.weight !== undefined ? '<span class="wt-val">' + a.weight + '</span><span class="wt-edit-icon">✎</span>' : '<span class="wt-val na-wt">—</span><span class="wt-edit-icon">✎</span>'}</td>
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

  /* ========== INLINE WEIGHT EDITING ========== */
  window.inlineEditWeight = function (td, athleteId) {
    // Prevent double-activation
    if (td.querySelector(".wt-inline-input")) return;
    const a = getAthleteById(athleteId);
    const currentWt = a ? a.weight : null;
    const valSpan = td.querySelector(".wt-val");
    const iconSpan = td.querySelector(".wt-edit-icon");
    if (iconSpan) iconSpan.style.display = "none";

    const input = document.createElement("input");
    input.type = "number";
    input.className = "wt-inline-input";
    input.step = "1";
    input.min = "50";
    input.max = "500";
    input.value =
      currentWt !== null && currentWt !== undefined ? currentWt : "";
    input.setAttribute(
      "aria-label",
      "Update weight for " + (a ? a.name : athleteId),
    );

    if (valSpan) valSpan.style.display = "none";
    td.appendChild(input);
    input.focus();
    input.select();

    function commit() {
      const raw = input.value.trim();
      const newWt = raw === "" ? null : parseInt(raw, 10);
      input.remove();
      if (valSpan) valSpan.style.display = "";
      if (iconSpan) iconSpan.style.display = "";

      // If unchanged or invalid, just restore
      if (newWt !== null && (isNaN(newWt) || newWt < 50 || newWt > 500)) return;
      if (newWt === currentWt) return;

      // Log to weekly weight log
      if (newWt !== null) {
        logWeight(athleteId, newWt);
      }

      // Apply to lc_edits (same pattern as the edit panel)
      let edits = safeLSGet("lc_edits", []);
      const existing = edits.find(function (e) {
        return e.id === athleteId;
      });
      if (existing) {
        existing.changes.weight_lb = newWt;
        existing.timestamp = new Date().toISOString();
      } else {
        edits.push({
          id: athleteId,
          changes: { weight_lb: newWt },
          timestamp: new Date().toISOString(),
        });
      }
      safeLSSet("lc_edits", JSON.stringify(edits));

      // Rebuild and re-render
      APP.rebuildFromStorage();
      APP._skipChartAnimation = true;
      markTabsDirty();
      renderOverview();
      APP.updateDataStatus();
      APP._skipChartAnimation = false;

      const weekKey = getWeekKey(new Date());
      showToast(
        (a ? a.name : athleteId) +
          " weight updated to " +
          newWt +
          " lb (" +
          fmtWeekLabel(weekKey) +
          ")",
        "success",
      );
    }

    let committed = false;
    input.addEventListener("keydown", function (e) {
      e.stopPropagation();
      if (e.key === "Enter") {
        committed = true;
        commit();
      }
      if (e.key === "Escape") {
        input.remove();
        if (valSpan) valSpan.style.display = "";
        if (iconSpan) iconSpan.style.display = "";
      }
    });
    input.addEventListener("blur", function () {
      if (!committed) commit();
    });
    input.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  };

  /** Show weight history tooltip on hover */
  window.showWeightHistory = function (td, athleteId) {
    if (td.querySelector(".wt-history-tip")) return;
    const history = getWeightHistory(athleteId);
    if (!history.length) return;

    const tip = document.createElement("div");
    tip.className = "wt-history-tip";
    let html = '<div class="wt-history-title">Weight Log</div>';
    const rows = history.slice(0, 12); // show last 12 weeks max
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dateStr = new Date(r.timestamp).toLocaleDateString();
      const delta = i < rows.length - 1 ? r.weight - rows[i + 1].weight : null;
      const deltaStr =
        delta !== null
          ? delta > 0
            ? "+" + delta
            : delta === 0
              ? "±0"
              : "" + delta
          : "";
      const deltaClass =
        delta !== null
          ? delta > 0
            ? "wt-up"
            : delta < 0
              ? "wt-down"
              : "wt-flat"
          : "";
      html +=
        '<div class="wt-history-row">' +
        '<span class="wt-history-week">' +
        esc(fmtWeekLabel(r.weekKey)) +
        "</span>" +
        '<span class="wt-history-wt">' +
        r.weight +
        " lb</span>" +
        (deltaStr
          ? '<span class="wt-history-delta ' +
            deltaClass +
            '">' +
            deltaStr +
            "</span>"
          : "") +
        "</div>";
    }
    tip.innerHTML = html;
    td.style.position = "relative";
    td.appendChild(tip);
  };

  window.hideWeightHistory = function (td) {
    const tip = td.querySelector(".wt-history-tip");
    if (tip) tip.remove();
  };

  APP.renderers["overview"] = window.renderOverview;
})();
