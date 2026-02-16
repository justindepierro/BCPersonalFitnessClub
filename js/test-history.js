/* ===================================================
   test-history.js — Test history data layer & weight log
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    safeLSGet,
    safeLSSet,
    showToast,
    TEST_METRIC_KEYS,
  } = APP;


  /* ---------- Weekly Weight Log ---------- */
  /** Get ISO week key like "2026-W07" from a Date */
  function getWeekKey(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    // ISO week: Monday-based
    const day = (date.getDay() + 6) % 7; // Mon=0 … Sun=6
    date.setDate(date.getDate() - day + 3); // nearest Thursday
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getFullYear() + "-W" + String(weekNum).padStart(2, "0");
  }
  /** Format a weekKey for display: "W07 · Feb 2026" */
  function fmtWeekLabel(wk) {
    // Parse "YYYY-Www" → approximate Monday of that week
    const m = wk.match(/^(\d{4})-W(\d{2})$/);
    if (!m) return wk;
    const yr = parseInt(m[1], 10);
    const wn = parseInt(m[2], 10);
    // Jan 4 always falls in ISO week 1
    const jan4 = new Date(yr, 0, 4);
    const dayOfWeek = (jan4.getDay() + 6) % 7; // Mon=0
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + (wn - 1) * 7);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return (
      "W" +
      m[2] +
      " · " +
      months[monday.getMonth()] +
      " " +
      monday.getFullYear()
    );
  }
  function getWeightLog() {
    return safeLSGet("lc_weight_log", {});
  }
  function saveWeightLog(log) {
    safeLSSet("lc_weight_log", JSON.stringify(log));
  }
  /** Save a weight entry for an athlete. Only keeps the latest per week. */
  function logWeight(athleteId, weight) {
    const log = getWeightLog();
    if (!log[athleteId]) log[athleteId] = [];
    const now = new Date();
    const weekKey = getWeekKey(now);
    // Remove any existing entry for this week
    log[athleteId] = log[athleteId].filter(function (e) {
      return e.weekKey !== weekKey;
    });
    log[athleteId].push({
      weight: weight,
      timestamp: now.toISOString(),
      weekKey: weekKey,
    });
    // Sort newest first
    log[athleteId].sort(function (a, b) {
      return a.timestamp > b.timestamp ? -1 : 1;
    });
    // Keep last 52 weeks max
    if (log[athleteId].length > 52)
      log[athleteId] = log[athleteId].slice(0, 52);
    saveWeightLog(log);
  }
  /** Get weight history for an athlete, newest first */
  function getWeightHistory(athleteId) {
    const log = getWeightLog();
    return (log[athleteId] || []).slice().sort(function (a, b) {
      return a.timestamp > b.timestamp ? -1 : 1;
    });
  }

  function getTestHistory() {
    if (APP._testHistoryCache !== null) return APP._testHistoryCache;
    APP._testHistoryCache = safeLSGet("lc_test_history", {});
    return APP._testHistoryCache;
  }
  function setTestHistory(h) {
    APP._testHistoryCache = null; // invalidate cache
    safeLSSet("lc_test_history", JSON.stringify(h));
    // Invalidate stale/prev caches when test data changes
    APP._prevTestCache = null;
    APP._staleKeysCache = null;
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
    const vals = {};
    for (let i = 0; i < TEST_METRIC_KEYS.length; i++) {
      vals[TEST_METRIC_KEYS[i].jsonKey] = a[TEST_METRIC_KEYS[i].key];
    }
    return vals;
  }

  /* ---------- Test Notes ---------- */
  function getTestNotes() {
    return safeLSGet("lc_test_notes", {});
  }
  function setTestNotes(n) {
    safeLSSet("lc_test_notes", n);
  }
  function noteKey(date, label) {
    return date + "|" + label;
  }

  function computeTestAverages(athleteDetails) {
    const stats = {};
    for (let mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      const key = TEST_METRIC_KEYS[mk].jsonKey;
      let sum = 0, count = 0, min = Infinity, max = -Infinity;
      for (let ai = 0; ai < athleteDetails.length; ai++) {
        const v = athleteDetails[ai].values[key];
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
    let html = '<div class="ta-summary">';
    html += '<span class="ta-title">Team Averages</span>';
    for (let mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      const key = TEST_METRIC_KEYS[mk].jsonKey;
      const s = stats[key];
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
    const extra = extraCol ? "<td></td>" : "";
    let avgRow =
      '<tr class="ta-row ta-avg-row"><td><strong>Team Avg</strong></td>';
    for (let mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      const s = stats[TEST_METRIC_KEYS[mk].jsonKey];
      avgRow += '<td class="num">' + (s.avg !== null ? s.avg : "—") + "</td>";
    }
    avgRow += extra + "</tr>";
    if (!showBestWorst) return avgRow;
    let bestRow =
      '<tr class="ta-row ta-best-row"><td><strong>Best</strong></td>';
    let worstRow =
      '<tr class="ta-row ta-worst-row"><td><strong>Worst</strong></td>';
    for (let mk2 = 0; mk2 < TEST_METRIC_KEYS.length; mk2++) {
      const s2 = stats[TEST_METRIC_KEYS[mk2].jsonKey];
      const lower = TEST_METRIC_KEYS[mk2].lower;
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



  function getPrevTestValues(athleteId) {
    if (!APP._prevTestCache) APP._prevTestCache = {};
    if (APP._prevTestCache[athleteId]) return APP._prevTestCache[athleteId];
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
    APP._prevTestCache[athleteId] = vals;
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
    if (!APP._staleKeysCache) APP._staleKeysCache = {};
    if (APP._staleKeysCache[athleteId]) return APP._staleKeysCache[athleteId];
    const entries = getAthleteHistory(athleteId); // newest-first
    const stale = new Set();
    if (!entries || entries.length === 0) {
      APP._staleKeysCache[athleteId] = stale;
      return stale;
    }
    // Find the newest date that actually has data (skip empty worksheet entries)
    let newestDate = null;
    for (let ei = 0; ei < entries.length; ei++) {
      const vals = entries[ei].values;
      const hasData = Object.keys(vals).some(function (k) {
        return vals[k] !== null && vals[k] !== undefined && vals[k] !== "";
      });
      if (hasData) {
        newestDate = entries[ei].date;
        break;
      }
    }
    if (!newestDate) {
      // No test entries with actual data → nothing is stale
      APP._staleKeysCache[athleteId] = stale;
      return stale;
    }
    // For each metric, find which DATE provides its value (first non-null, newest-first)
    for (const mk of TEST_METRIC_KEYS) {
      let foundDate = null;
      for (let ei = 0; ei < entries.length; ei++) {
        const v = entries[ei].values[mk.jsonKey];
        if (v !== null && v !== undefined && v !== "") {
          foundDate = entries[ei].date;
          break;
        }
      }
      // Stale only if the metric IS in test history but from an OLDER date.
      // If foundDate is null, the metric isn't in any test → use JSON baseline → not stale.
      if (foundDate && foundDate < newestDate) {
        stale.add(mk.key);
      }
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
    APP._staleKeysCache[athleteId] = stale;
    return stale;
  }
  Object.assign(APP, {
    getWeekKey, fmtWeekLabel, getWeightLog, saveWeightLog, logWeight,
    getWeightHistory, getTestHistory, setTestHistory, getAthleteHistory,
    saveTestEntry, deleteTestEntry, currentTestValues,
    getTestNotes, setTestNotes, noteKey,
    computeTestAverages, buildAvgSummaryHTML, buildAvgTableRows,
    getPrevTestValues, getStaleKeys,
  });
})();
