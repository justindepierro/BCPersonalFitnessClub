/* ===================================================
   test-views.js — Test History UI (modal, calendar, compare)
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    escJs,
    fmt,
    formatLogDate,
    getAthleteById,
    showToast,
    safeLSGet,
    safeLSSet,
    markTabsDirty,
    renderIfDirty,
    getTestHistory,
    setTestHistory,
    getAthleteHistory,
    saveTestEntry,
    deleteTestEntry,
    currentTestValues,
    computeTestAverages,
    buildAvgSummaryHTML,
    buildAvgTableRows,
    getTestNotes,
    setTestNotes,
    noteKey,
    TEST_METRIC_KEYS,
  } = APP;

  /* ========== TEST HISTORY — Shared Helpers ========== */
  function closeTestHistoryModal() {
    const existing = document.querySelector(".test-history-modal");
    if (existing) existing.remove();
  }

  function refreshProfileIfVisible() {
    const pid = document.getElementById("athleteSelect").value;
    if (pid) renderProfile();
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
    for (let ti = 0; ti < shown.length; ti++) {
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

    for (let mi = 0; mi < TEST_METRIC_KEYS.length; mi++) {
      const mk = TEST_METRIC_KEYS[mi];
      const curVal = current[mk.jsonKey];
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
      for (let si = 0; si < shown.length; si++) {
        const hVal = shown[si].values[mk.jsonKey];
        html +=
          '<td class="num">' +
          (hVal !== null && hVal !== undefined ? hVal : "—") +
          "</td>";
      }
      // Delta column
      let newV = null, oldV = null;
      if (shown.length >= 2) {
        newV = shown[0].values[mk.jsonKey];
        oldV = shown[1].values[mk.jsonKey];
      } else if (shown.length === 1) {
        newV = curVal;
        oldV = shown[0].values[mk.jsonKey];
      }
      if (shown.length >= 1) {
        if (newV != null && oldV != null) {
          const delta = newV - oldV;
          const pctChange =
            oldV !== 0 ? Math.round((delta / Math.abs(oldV)) * 100) : 0;
          const improved = mk.lower ? delta < 0 : delta > 0;
          const declined = mk.lower ? delta > 0 : delta < 0;
          const cls = improved
            ? "delta-up"
            : declined
              ? "delta-down"
              : "delta-flat";
          const arrow = improved ? "▲" : declined ? "▼" : "—";
          const sign = delta > 0 ? "+" : "";
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
    const curForty = a.forty;
    html +=
      '<tr class="progress-composite"><td><strong>40 yd Total</strong> <small>s</small></td>';
    html += '<td class="num">' + (curForty != null ? curForty : "—") + "</td>";
    for (let fi = 0; fi < shown.length; fi++) {
      const fv = shown[fi].values;
      const hForty =
        fv.sprint_020 != null &&
        fv.sprint_2030 != null &&
        fv.sprint_3040 != null
          ? +(fv.sprint_020 + fv.sprint_2030 + fv.sprint_3040).toFixed(2)
          : null;
      html += '<td class="num">' + (hForty !== null ? hForty : "—") + "</td>";
    }
    if (shown.length >= 2) {
      const fvNewer = shown[0].values;
      const fvOlder = shown[1].values;
      const newerForty =
        fvNewer.sprint_020 != null &&
        fvNewer.sprint_2030 != null &&
        fvNewer.sprint_3040 != null
          ? +(
              fvNewer.sprint_020 +
              fvNewer.sprint_2030 +
              fvNewer.sprint_3040
            ).toFixed(2)
          : null;
      const olderForty =
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
        const fd = newerForty - olderForty;
        const fpct =
          olderForty !== 0 ? Math.round((fd / Math.abs(olderForty)) * 100) : 0;
        const fImproved = fd < 0;
        const fDeclined = fd > 0;
        const fCls = fImproved
          ? "delta-up"
          : fDeclined
            ? "delta-down"
            : "delta-flat";
        const fArrow = fImproved ? "▲" : fDeclined ? "▼" : "—";
        const fSign = fd > 0 ? "+" : "";
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
      const fvLast = shown[0].values;
      const lastForty =
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
        const fd1 = curForty - lastForty;
        const fpct1 =
          lastForty !== 0 ? Math.round((fd1 / Math.abs(lastForty)) * 100) : 0;
        const fImproved1 = fd1 < 0;
        const fDeclined1 = fd1 > 0;
        const fCls1 = fImproved1
          ? "delta-up"
          : fDeclined1
            ? "delta-down"
            : "delta-flat";
        const fArrow1 = fImproved1 ? "▲" : fDeclined1 ? "▼" : "—";
        const fSign1 = fd1 > 0 ? "+" : "";
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
    for (let di = 0; di < shown.length; di++) {
      const _eId = escJs(a.id);
      const _eDate = escJs(shown[di].date);
      const _eLabel = escJs(shown[di].label);
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
        '\')},300)" title="Edit this test"><i data-lucide="pencil" class="icon"></i></button>';
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
    APP.rebuildFromStorage();
    APP.reRenderAll();
    // Refresh edit panel if open for this athlete
    if (APP.editingAthleteId === athleteId) {
      const a = getAthleteById(athleteId);
      if (a) APP.buildEditFields(a);
    }
    showToast("Deleted test entry: " + label, "info");
  };

  /* --- Save ALL athletes' current data as a test date --- */
  window.saveAllAsTestDate = function () {
    const D = window.CLUB;
    const tested = D.athletes.filter(function (a) {
      return Object.keys(a.scorecard).length > 0;
    });
    if (tested.length === 0) {
      showToast("No athletes with test data to save.", "warn");
      return;
    }

    const dateStr = prompt(
      "Enter test date (YYYY-MM-DD):",
      new Date().toISOString().slice(0, 10),
    );
    if (!dateStr) return;
    let label = prompt(
      'Enter a label for this test (e.g. "Pre-Season 2026", "Winter Testing"):',
      "",
    );
    if (label === null) return;
    if (!label.trim()) label = dateStr;
    label = label.trim();

    let count = 0;
    for (let i = 0; i < tested.length; i++) {
      const a = tested[i];
      const vals = currentTestValues(a);
      // Only save if at least one non-null metric
      let hasData = false;
      for (const k in vals) {
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
    const id = document.getElementById("athleteSelect").value;
    if (id) renderProfile();
  };

  /* --- helpers for test notes --- */

  /* --- Collect testMap from history --- */
  function buildTestMap() {
    const h = getTestHistory();
    const athleteIds = Object.keys(h);
    const notes = getTestNotes();
    const testMap = {};
    for (let i = 0; i < athleteIds.length; i++) {
      const aid = athleteIds[i];
      const entries = h[aid];
      for (let j = 0; j < entries.length; j++) {
        const e = entries[j];
        const key = e.label + "|" + e.date;
        if (!testMap[key]) {
          const nk = noteKey(e.date, e.label);
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
        const found = getAthleteById(aid);
        const aName = found ? found.name : aid;
        testMap[key].athletes.push(aName);
        let mCount = 0;
        for (let mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
          const v = e.values[TEST_METRIC_KEYS[mk].jsonKey];
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
    const result = buildTestMap();
    const testMap = result.testMap;
    const athleteIds = result.athleteIds;
    const D = window.CLUB;

    const tests = Object.values(testMap).sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });

    let totalEntries = 0;
    for (let t = 0; t < tests.length; t++) totalEntries += tests[t].count;

    // Build test cards
    let cards = "";
    for (let ci = 0; ci < tests.length; ci++) {
      const test = tests[ci];
      const safeDate = esc(test.date);
      const rawLabelLower = test.label.toLowerCase();
      const escapedDate = escJs(test.date);
      const escapedLabel = escJs(test.label);

      // Data completeness
      const totalMetricSlots =
        test.athleteDetails.length * TEST_METRIC_KEYS.length;
      let filledMetricSlots = 0;
      for (let fmi = 0; fmi < test.athleteDetails.length; fmi++) {
        filledMetricSlots += test.athleteDetails[fmi].metrics;
      }
      const completePct =
        totalMetricSlots > 0
          ? Math.round((filledMetricSlots / totalMetricSlots) * 100)
          : 0;

      // Is this the most recent test?
      const isLatest = ci === 0;

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
        "')\"><i data-lucide=\"pencil\" class=\"icon\"></i> Rename</button>";
      cards +=
        "<button onclick=\"changeTestDate('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"calendar\" class=\"icon\"></i> Change Date</button>";
      cards +=
        "<button onclick=\"duplicateTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"copy\" class=\"icon\"></i> Duplicate</button>";
      cards +=
        "<button onclick=\"editTestNote('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"notebook-pen\" class=\"icon\"></i> Notes</button>";
      cards +=
        "<button onclick=\"addAthletesToTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"plus\" class=\"icon\"></i> Add Athletes</button>";
      cards +=
        "<button onclick=\"removeAthleteFromTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"minus\" class=\"icon\"></i> Remove Athlete</button>";
      cards +=
        "<button onclick=\"exportSingleTest('" +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"share\" class=\"icon\"></i> Export</button>";
      cards +=
        '<button class="th-more-danger" onclick="deleteBulkTestEntry(\'' +
        escapedDate +
        "','" +
        escapedLabel +
        "')\"><i data-lucide=\"trash-2\" class=\"icon\"></i> Delete</button>";
      cards += "</div></div>";
      cards += "</div>";
      // Expandable detail
      cards +=
        '<div class="th-detail" id="thDetail' + ci + '" style="display:none">';
      cards += '<table class="th-detail-table"><thead><tr><th>Athlete</th>';
      for (let hk = 0; hk < TEST_METRIC_KEYS.length; hk++) {
        cards += "<th>" + TEST_METRIC_KEYS[hk].label + "</th>";
      }
      cards += "</tr></thead><tbody>";
      for (let ai = 0; ai < test.athleteDetails.length; ai++) {
        const ad = test.athleteDetails[ai];
        cards += "<tr><td><strong>" + esc(ad.name) + "</strong></td>";
        for (let vk = 0; vk < TEST_METRIC_KEYS.length; vk++) {
          const jsonKey = TEST_METRIC_KEYS[vk].jsonKey;
          const val = ad.values[jsonKey];
          const displayVal = val !== null && val !== undefined ? val : "—";
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
      const testStats = computeTestAverages(test.athleteDetails);
      cards +=
        "</tbody><tfoot>" +
        buildAvgTableRows(testStats, true) +
        "</tfoot></table>";
      cards += buildAvgSummaryHTML(testStats);
      cards += "</div>";
      cards += "</div>";
    }

    const emptyState =
      athleteIds.length === 0
        ? '<div class="th-empty"><div class="th-empty-icon"><i data-lucide="bar-chart-3" class="icon" style="width:2.5rem;height:2.5rem"></i></div><h3>No Test History Yet</h3><p>Save your first test baseline to start tracking athlete progress over time.</p><button class="btn btn-primary" onclick="document.querySelector(\'.test-history-modal\').remove(); saveAllAsTestDate()"><i data-lucide="calendar-plus" class="icon"></i> Save Current Team Data</button></div>'
        : "";

    const bodyHTML =
      '<div class="th-modal-body">' +
      '<div class="th-modal-header">' +
      "<h2><i data-lucide=\"clipboard-list\" class=\"icon\"></i> Test History Manager</h2>" +
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
          '<button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.test-history-modal\').remove(); saveAllAsTestDate()"><i data-lucide="calendar-plus" class="icon"></i> Save New Test Date</button>' +
          '<button class="btn btn-sm" onclick="exportTestHistoryOnly()"><i data-lucide="share" class="icon"></i> Export All</button>' +
          '<label class="btn btn-sm" style="cursor:pointer"><i data-lucide="upload" class="icon"></i> Import<input type="file" accept=".json" onchange="importTestHistoryOnly(this)" style="display:none" /></label>' +
          (tests.length >= 2
            ? '<button class="btn btn-sm" onclick="compareTests()"><i data-lucide="git-compare" class="icon"></i> Compare Tests</button>'
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
          '<button class="btn btn-sm th-view-btn" data-view="calendar" onclick="switchThView(\'calendar\')">☰ Calendar</button>' +
          "</div>" +
          "</div>"
        : "") +
      (emptyState ||
        '<div id="thListView" class="th-card-list">' + cards + "</div>") +
      '<div id="thCalendarView" class="th-calendar-wrap" style="display:none"></div>' +
      '<div class="th-new-test-bar"><button class="btn btn-primary" onclick="openNewTestEntry()"><i data-lucide="plus" class="icon"></i> Start New Test Session</button></div>' +
      '<p class="th-footer-note">Test history is included in full JSON exports and restored on import.</p>' +
      "</div>";

    // Remove existing modal if open
    closeTestHistoryModal();

    // Show as a modal overlay
    const overlay = document.createElement("div");
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
    const listEl = document.getElementById("thListView");
    const calEl = document.getElementById("thCalendarView");
    if (!listEl || !calEl) return;
    const btns = document.querySelectorAll(".th-view-btn");
    for (let i = 0; i < btns.length; i++) {
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
    const wrap = document.getElementById("thCalendarView");
    if (!wrap) return;

    // Group tests by YYYY-MM
    const byMonth = {};
    const allDates = [];
    for (let i = 0; i < tests.length; i++) {
      const d = tests[i].date;
      const ym = d.substring(0, 7); // "YYYY-MM"
      if (!byMonth[ym]) byMonth[ym] = {};
      const day = parseInt(d.substring(8, 10), 10);
      if (!byMonth[ym][day]) byMonth[ym][day] = [];
      byMonth[ym][day].push(tests[i]);
      if (allDates.indexOf(d) === -1) allDates.push(d);
    }

    // Sort months chronologically (newest first)
    const months = Object.keys(byMonth).sort(function (a, b) {
      return a > b ? -1 : a < b ? 1 : 0;
    });

    const MONTH_NAMES = [
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
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let html = "";
    for (let mi = 0; mi < months.length; mi++) {
      const ym = months[mi];
      const parts = ym.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const monthName = MONTH_NAMES[month];
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDow = new Date(year, month, 1).getDay(); // 0=Sun

      // Count total sessions this month
      const monthTests = byMonth[ym];
      let sessionCount = 0;
      for (const dk in monthTests) sessionCount += monthTests[dk].length;

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
      for (let dh = 0; dh < 7; dh++) {
        html += '<div class="cal-dow">' + DAY_NAMES[dh] + "</div>";
      }
      // Leading blanks
      for (let lb = 0; lb < firstDow; lb++) {
        html += '<div class="cal-day cal-blank"></div>';
      }
      // Days
      for (let day = 1; day <= daysInMonth; day++) {
        const dayTests = monthTests[day] || [];
        const hasTests = dayTests.length > 0;
        const dayClass = "cal-day" + (hasTests ? " cal-has-test" : "");
        if (hasTests) {
          html += '<div class="' + dayClass + '" onclick="calDayClick(this)">';
          html += '<span class="cal-day-num">' + day + "</span>";
          html += '<div class="cal-dots">';
          for (let dt = 0; dt < dayTests.length; dt++) {
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
          for (let dt2 = 0; dt2 < dayTests.length; dt2++) {
            const t = dayTests[dt2];
            const eDate = escJs(t.date);
            const eLabel = escJs(t.label);
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
    html += '<div class="cal-timeline-title"><i data-lucide="calendar" class="icon"></i> Chronological Timeline</div>';
    // Sort tests oldest to newest for timeline
    const sorted = tests.slice().sort(function (a, b) {
      return a.date > b.date ? 1 : a.date < b.date ? -1 : 0;
    });
    for (let ti = 0; ti < sorted.length; ti++) {
      const st = sorted[ti];
      const eDate2 = escJs(st.date);
      const eLabel2 = escJs(st.label);
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
    const detail = el.querySelector(".cal-day-detail");
    if (!detail) return;
    // Close any other open details
    const allOpen = document.querySelectorAll('.cal-day-detail[style*="block"]');
    for (let i = 0; i < allOpen.length; i++) {
      if (allOpen[i] !== detail) allOpen[i].style.display = "none";
    }
    detail.style.display = detail.style.display === "none" ? "block" : "none";
  };

  /* --- Inline cell editing in test history modal --- */
  window.inlineEditCell = function (td) {
    // Don't re-enter if already editing
    if (td.querySelector("input")) return;
    let current = td.textContent.trim();
    if (current === "—") current = "";
    td.classList.add("ie-editing");
    const input = document.createElement("input");
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
        const cells = Array.from(
          td.closest("table").querySelectorAll(".ie-cell"),
        );
        const idx = cells.indexOf(td);
        const next = ev.shiftKey ? cells[idx - 1] : cells[idx + 1];
        if (next) next.click();
      }
    });
  };

  window.commitInlineEdit = function (td, input) {
    const newVal = input.value.trim();
    const original = input.getAttribute("data-original");
    const aid = td.getAttribute("data-aid");
    const date = td.getAttribute("data-date");
    const label = td.getAttribute("data-label");
    const key = td.getAttribute("data-key");
    td.classList.remove("ie-editing");

    // No change
    if (newVal === original) {
      td.textContent = original || "—";
      return;
    }

    // Update localStorage
    const h = getTestHistory();
    if (!h[aid]) h[aid] = [];
    let found = false;
    for (let i = 0; i < h[aid].length; i++) {
      if (h[aid][i].date === date && h[aid][i].label === label) {
        if (newVal === "") {
          h[aid][i].values[key] = null;
        } else {
          const parsed = parseFloat(newVal);
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
      const parsedNew = newVal === "" ? null : parseFloat(newVal);
      if (parsedNew !== null && isNaN(parsedNew)) {
        td.textContent = original || "—";
        return;
      }
      const newEntry = { date: date, label: label, values: {} };
      newEntry.values[key] = parsedNew;
      h[aid].push(newEntry);
    }
    setTestHistory(h);
    APP._staleKeysCache = null;
    APP.rebuildFromStorage();

    // Update cell display
    td.textContent = newVal || "—";
    td.classList.add("ie-saved");
    setTimeout(function () {
      td.classList.remove("ie-saved");
    }, 800);

    // Update progress column if in test entry worksheet
    const row = td.closest("tr");
    if (row) {
      const progressCell = row.querySelector(".te-progress");
      if (progressCell) {
        const cells = row.querySelectorAll(".ie-cell");
        let filled = 0;
        cells.forEach(function (c) {
          const t = c.textContent.trim();
          if (t && t !== "—") filled++;
        });
        const pct = Math.round((filled / TEST_METRIC_KEYS.length) * 100);
        progressCell.textContent = pct + "%";
        progressCell.className =
          "te-progress " +
          (pct === 100 ? "te-complete" : pct > 0 ? "te-partial" : "te-none");
      }
    }

    // Refresh profile if visible
    const selId = document.getElementById("athleteSelect").value;
    if (selId) renderProfile();
  };

  window.toggleTestDetail = function (idx) {
    const el = document.getElementById("thDetail" + idx);
    if (!el) return;
    el.style.display = el.style.display === "none" ? "block" : "none";
  };

  window.renameTestDate = function (date, oldLabel) {
    let newLabel = prompt(
      'Rename test "' + oldLabel + '" (' + date + "):",
      oldLabel,
    );
    if (newLabel === null || !newLabel.trim() || newLabel.trim() === oldLabel)
      return;
    newLabel = newLabel.trim();
    const h = getTestHistory();
    const ids = Object.keys(h);
    let renamed = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === oldLabel) {
          h[ids[i]][j].label = newLabel;
          renamed++;
        }
      }
    }
    setTestHistory(h);
    // Migrate test notes to new label
    const notes = getTestNotes();
    const oldNk = noteKey(date, oldLabel);
    const newNk = noteKey(date, newLabel);
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
    refreshProfileIfVisible();
  };

  window.exportSingleTest = function (date, label) {
    const h = getTestHistory();
    const exportObj = {
      source: "BC Personal Fitness Club — Test Export",
      exportDate: new Date().toISOString(),
      testDate: date,
      testLabel: label,
      entries: [],
    };
    const ids = Object.keys(h);
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          const found = getAthleteById(ids[i]);
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
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
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
    const h = getTestHistory();
    if (Object.keys(h).length === 0) {
      showToast("No test history to export.", "warn");
      return;
    }
    // Enrich with athlete names for readability
    const exportObj = {
      source: "BC Personal Fitness Club — Full Test History",
      exportDate: new Date().toISOString(),
      test_history: h,
      athlete_names: {},
    };
    const ids = Object.keys(h);
    for (let i = 0; i < ids.length; i++) {
      const found = getAthleteById(ids[i]);
      if (found) exportObj.athlete_names[ids[i]] = found.name;
    }
    const json = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const link = document.createElement("a");
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
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        let histData = null;

        // Support full export format
        if (data.test_history && typeof data.test_history === "object") {
          histData = data.test_history;
        }
        // Support single-test export format
        else if (data.entries && Array.isArray(data.entries)) {
          histData = {};
          for (let i = 0; i < data.entries.length; i++) {
            const en = data.entries[i];
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

        const incoming = Object.keys(histData);
        const mode = confirm(
          "Found test data for " +
            incoming.length +
            ' athlete(s) in "' +
            file.name +
            '".\n\n' +
            "OK = Merge with existing history\nCancel = Replace all existing history",
        );

        if (mode) {
          // Merge
          const h = getTestHistory();
          for (let ai = 0; ai < incoming.length; ai++) {
            const aid = incoming[ai];
            if (!h[aid]) h[aid] = [];
            const newEntries = histData[aid];
            for (let ni = 0; ni < newEntries.length; ni++) {
              const ne = newEntries[ni];
              // Skip duplicates
              let exists = false;
              for (let ei = 0; ei < h[aid].length; ei++) {
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
        refreshProfileIfVisible();
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
    closeTestHistoryModal();

    const today = new Date().toISOString().slice(0, 10);
    let dateStr = prefillDate || null;
    let label = prefillLabel || null;

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

    const D = window.CLUB;
    const athletes = D.athletes.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    const h = getTestHistory();

    // Ensure every athlete has an entry for this date+label (even if empty)
    for (let i = 0; i < athletes.length; i++) {
      const aid = athletes[i].id;
      if (!h[aid]) h[aid] = [];
      const exists = h[aid].some(function (e) {
        return e.date === dateStr && e.label === label;
      });
      if (!exists) {
        h[aid].push({ date: dateStr, label: label, values: {} });
      }
    }
    setTestHistory(h);

    // Build the worksheet table
    const safeDate = esc(dateStr);
    const safeLabel = esc(label);
    let rows = "";
    let filledCount = 0;
    for (let ai = 0; ai < athletes.length; ai++) {
      const a = athletes[ai];
      let entry = null;
      if (h[a.id]) {
        for (let ei = 0; ei < h[a.id].length; ei++) {
          if (h[a.id][ei].date === dateStr && h[a.id][ei].label === label) {
            entry = h[a.id][ei];
            break;
          }
        }
      }
      const vals = entry ? entry.values : {};
      let metricCount = 0;
      rows += "<tr>";
      rows += '<td class="te-athlete-name">' + esc(a.name) + "</td>";
      for (let mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
        const key = TEST_METRIC_KEYS[mk].jsonKey;
        const val = vals[key];
        const display = val !== null && val !== undefined ? val : "";
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
      const pct = Math.round((metricCount / TEST_METRIC_KEYS.length) * 100);
      const pctClass =
        pct === 100 ? "te-complete" : pct > 0 ? "te-partial" : "te-none";
      rows += '<td class="te-progress ' + pctClass + '">' + pct + "%</td>";
      rows += "</tr>";
    }

    let bodyHTML =
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
    for (let hk = 0; hk < TEST_METRIC_KEYS.length; hk++) {
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
    const wsStats = computeTestAverages(
      athletes.map(function (a) {
        let entry = null;
        if (h[a.id]) {
          for (let ei2 = 0; ei2 < h[a.id].length; ei2++) {
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

    const overlay = document.createElement("div");
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
    const h = getTestHistory();
    const ids = Object.keys(h);
    const edits = safeLSGet("lc_edits", []);
    let count = 0;

    for (let i = 0; i < ids.length; i++) {
      const aid = ids[i];
      for (let j = 0; j < h[aid].length; j++) {
        if (h[aid][j].date === date && h[aid][j].label === label) {
          const vals = h[aid][j].values;
          const changes = {};
          let hasData = false;
          for (const k in vals) {
            if (vals[k] !== null && vals[k] !== undefined) {
              changes[k] = vals[k];
              hasData = true;
            }
          }
          if (hasData) {
            const existing = edits.find(function (e) {
              return e.id === aid;
            });
            if (existing) {
              Object.assign(existing.changes, changes);
              existing.timestamp = new Date().toISOString();
            } else {
              edits.push({
                id: aid,
                changes: changes,
                timestamp: new Date().toISOString(),
              });
            }
            count++;
          }
          break;
        }
      }
    }

    safeLSSet("lc_edits", JSON.stringify(edits));
    APP.rebuildFromStorage();
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    APP.updateDataStatus();
    refreshProfileIfVisible();
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
    const h = getTestHistory();
    let count = 0;
    const ids = Object.keys(h);
    for (let i = 0; i < ids.length; i++) {
      const before = h[ids[i]].length;
      h[ids[i]] = h[ids[i]].filter(function (e) {
        return !(e.date === date && e.label === label);
      });
      count += before - h[ids[i]].length;
      if (h[ids[i]].length === 0) delete h[ids[i]];
    }
    setTestHistory(h);
    showToast("Deleted " + count + ' entries for "' + label + '"', "info");
    // Close and re-open to refresh
    closeTestHistoryModal();
    viewSavedTests();
    // Refresh profile if open
    refreshProfileIfVisible();
  };

  /* --- Change the date of a test session --- */
  window.changeTestDate = function (oldDate, label) {
    let newDate = prompt(
      'Change date for "' + label + '" (currently ' + oldDate + "):",
      oldDate,
    );
    if (!newDate || !newDate.trim() || newDate.trim() === oldDate) return;
    newDate = newDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      showToast("Invalid date format. Use YYYY-MM-DD.", "error");
      return;
    }
    const h = getTestHistory();
    const ids = Object.keys(h);
    let changed = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === oldDate && h[ids[i]][j].label === label) {
          h[ids[i]][j].date = newDate;
          changed++;
        }
      }
    }
    setTestHistory(h);
    // Migrate notes
    const notes = getTestNotes();
    const oldNk = noteKey(oldDate, label);
    const newNk = noteKey(newDate, label);
    if (notes[oldNk]) {
      notes[newNk] = notes[oldNk];
      delete notes[oldNk];
      setTestNotes(notes);
    }
    showToast(
      "Changed date to " + newDate + " (" + changed + " entries)",
      "success",
    );
    APP.rebuildFromStorage();
    closeTestHistoryModal();
    viewSavedTests();
    refreshProfileIfVisible();
  };

  /* --- Duplicate a test session --- */
  window.duplicateTest = function (date, label) {
    let newDate = prompt("Date for the duplicate (YYYY-MM-DD):", date);
    if (!newDate || !newDate.trim()) return;
    newDate = newDate.trim();
    let newLabel = prompt("Label for the duplicate:", label + " (copy)");
    if (!newLabel || !newLabel.trim()) return;
    newLabel = newLabel.trim();
    if (newDate === date && newLabel === label) {
      showToast("Duplicate must have a different date or label.", "warn");
      return;
    }
    const h = getTestHistory();
    const ids = Object.keys(h);
    let duped = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          // Deep clone values
          const clonedVals = structuredClone(h[ids[i]][j].values);
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
    closeTestHistoryModal();
    viewSavedTests();
  };

  /* --- Edit notes on a test session --- */
  window.editTestNote = function (date, label) {
    const notes = getTestNotes();
    const nk = noteKey(date, label);
    const current = notes[nk] || "";
    const newNote = prompt('Notes for "' + label + '" (' + date + "):", current);
    if (newNote === null) return;
    if (newNote.trim()) {
      notes[nk] = newNote.trim();
    } else {
      delete notes[nk];
    }
    setTestNotes(notes);
    showToast(newNote.trim() ? "Note saved." : "Note cleared.", "success");
    closeTestHistoryModal();
    viewSavedTests();
  };

  /* --- Add athletes to an existing test session --- */
  window.addAthletesToTest = function (date, label) {
    const D = window.CLUB;
    const h = getTestHistory();
    // Find athletes NOT in this test
    const inTest = {};
    const ids = Object.keys(h);
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          inTest[ids[i]] = true;
          break;
        }
      }
    }
    const missing = D.athletes.filter(function (a) {
      return !inTest[a.id];
    });
    if (missing.length === 0) {
      showToast("All athletes are already in this test.", "info");
      return;
    }
    const names = missing
      .map(function (a, idx) {
        return idx + 1 + ". " + a.name;
      })
      .join("\n");
    let reply = prompt(
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
    let toAdd = [];
    if (reply === "all") {
      toAdd = missing;
    } else {
      const nums = reply.split(",").map(function (s) {
        return parseInt(s.trim(), 10);
      });
      for (let ni = 0; ni < nums.length; ni++) {
        if (nums[ni] >= 1 && nums[ni] <= missing.length) {
          toAdd.push(missing[nums[ni] - 1]);
        }
      }
    }
    if (toAdd.length === 0) {
      showToast("No valid athletes selected.", "warn");
      return;
    }
    for (let ai = 0; ai < toAdd.length; ai++) {
      const aid = toAdd[ai].id;
      if (!h[aid]) h[aid] = [];
      h[aid].push({ date: date, label: label, values: {} });
    }
    setTestHistory(h);
    showToast(
      "Added " + toAdd.length + ' athlete(s) to "' + label + '"',
      "success",
    );
    closeTestHistoryModal();
    viewSavedTests();
  };

  /* --- Remove an athlete from a test session --- */
  window.removeAthleteFromTest = function (date, label) {
    const D = window.CLUB;
    const h = getTestHistory();
    // Find athletes IN this test
    const inTest = [];
    const ids = Object.keys(h);
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < h[ids[i]].length; j++) {
        if (h[ids[i]][j].date === date && h[ids[i]][j].label === label) {
          const found = getAthleteById(ids[i]);
          inTest.push({ id: ids[i], name: found ? found.name : ids[i] });
          break;
        }
      }
    }
    if (inTest.length === 0) {
      showToast("No athletes in this test.", "warn");
      return;
    }
    const names = inTest
      .map(function (a, idx) {
        return idx + 1 + ". " + a.name;
      })
      .join("\n");
    const reply = prompt(
      'Remove athletes from "' +
        label +
        '" (' +
        date +
        "):\n\n" +
        names +
        "\n\nEnter numbers separated by commas (e.g. 1,3):",
    );
    if (!reply || !reply.trim()) return;
    const nums = reply
      .trim()
      .split(",")
      .map(function (s) {
        return parseInt(s.trim(), 10);
      });
    let removed = 0;
    for (let ni = 0; ni < nums.length; ni++) {
      if (nums[ni] >= 1 && nums[ni] <= inTest.length) {
        const rid = inTest[nums[ni] - 1].id;
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
    closeTestHistoryModal();
    viewSavedTests();
    refreshProfileIfVisible();
  };

  /* --- More actions dropdown toggle --- */
  window.toggleThMore = function (btn) {
    const menu = btn.nextElementSibling;
    const isOpen = menu.classList.contains("th-more-open");
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
    const cards = document.querySelectorAll("#thListView .th-card");
    for (let i = 0; i < cards.length; i++) {
      const label = cards[i].getAttribute("data-label") || "";
      const date = cards[i].getAttribute("data-date") || "";
      const match =
        !query || label.indexOf(query) >= 0 || date.indexOf(query) >= 0;
      cards[i].style.display = match ? "" : "none";
    }
  };

  /* --- Sort test cards --- */
  window.sortTestCards = function (mode) {
    const list = document.getElementById("thListView");
    if (!list) return;
    const cards = Array.from(list.querySelectorAll(".th-card"));
    cards.sort(function (a, b) {
      const aDate = a.getAttribute("data-date") || "";
      const bDate = b.getAttribute("data-date") || "";
      const aLabel = a.getAttribute("data-label") || "";
      const bLabel = b.getAttribute("data-label") || "";
      // Count athletes from the stat text
      const aCount = parseInt(
        (a.querySelector(".th-stat strong") || {}).textContent || "0",
        10,
      );
      const bCount = parseInt(
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
    for (let i = 0; i < cards.length; i++) list.appendChild(cards[i]);
  };

  /* --- Compare two test sessions side-by-side --- */
  window.compareTests = function () {
    const result = buildTestMap();
    const tests = Object.values(result.testMap).sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });
    if (tests.length < 2) {
      showToast("Need at least 2 test sessions to compare.", "warn");
      return;
    }

    const options = tests
      .map(function (t, i) {
        return i + 1 + ". " + t.label + " (" + t.date + ")";
      })
      .join("\n");
    const pick1 = prompt(
      "Compare Tests — pick FIRST test:\n\n" + options + "\n\nEnter number:",
    );
    if (!pick1) return;
    const idx1 = parseInt(pick1.trim(), 10) - 1;
    if (isNaN(idx1) || idx1 < 0 || idx1 >= tests.length) {
      showToast("Invalid selection.", "warn");
      return;
    }

    const pick2 = prompt(
      'Pick SECOND test to compare with "' +
        tests[idx1].label +
        '":\n\n' +
        options +
        "\n\nEnter number:",
    );
    if (!pick2) return;
    const idx2 = parseInt(pick2.trim(), 10) - 1;
    if (isNaN(idx2) || idx2 < 0 || idx2 >= tests.length || idx2 === idx1) {
      showToast("Invalid or same selection.", "warn");
      return;
    }

    const t1 = tests[idx1];
    const t2 = tests[idx2];
    // Determine older/newer
    const older = t1.date <= t2.date ? t1 : t2;
    const newer = t1.date <= t2.date ? t2 : t1;

    // Build athlete lookup for both
    const olderMap = {};
    for (let oi = 0; oi < older.athleteDetails.length; oi++)
      olderMap[older.athleteDetails[oi].id] = older.athleteDetails[oi];
    const newerMap = {};
    for (let ni = 0; ni < newer.athleteDetails.length; ni++)
      newerMap[newer.athleteDetails[ni].id] = newer.athleteDetails[ni];
    // All athlete IDs in either
    const allIds = {};
    for (const ki in olderMap) allIds[ki] = true;
    for (const ki2 in newerMap) allIds[ki2] = true;

    let html = '<div class="th-modal-body">';
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
    for (let mk = 0; mk < TEST_METRIC_KEYS.length; mk++) {
      html += "<th>" + TEST_METRIC_KEYS[mk].label + "</th>";
    }
    html += "</tr></thead><tbody>";

    const sortedIds = Object.keys(allIds).sort(function (a, b) {
      const na = (getAthleteById(a) || {}).name || a;
      const nb = (getAthleteById(b) || {}).name || b;
      return na.localeCompare(nb);
    });

    for (let si = 0; si < sortedIds.length; si++) {
      const aid = sortedIds[si];
      const found = getAthleteById(aid);
      const name = found ? found.name : aid;
      const oEntry = olderMap[aid];
      const nEntry = newerMap[aid];
      html += "<tr><td><strong>" + esc(name) + "</strong></td>";
      for (let cmk = 0; cmk < TEST_METRIC_KEYS.length; cmk++) {
        const jk = TEST_METRIC_KEYS[cmk].jsonKey;
        const lower = TEST_METRIC_KEYS[cmk].lower;
        const oVal = oEntry ? oEntry.values[jk] : null;
        const nVal = nEntry ? nEntry.values[jk] : null;
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
          const diff = nVal - oVal;
          const improved = lower ? diff < 0 : diff > 0;
          const declined = lower ? diff > 0 : diff < 0;
          const cls = improved
            ? "delta-up"
            : declined
              ? "delta-down"
              : "delta-flat";
          const arrow = improved ? "▲" : declined ? "▼" : "—";
          const sign = diff > 0 ? "+" : "";
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
    const existingTh = document.querySelector(".test-history-modal");
    if (existingTh) existingTh.remove();

    const overlay = document.createElement("div");
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

  Object.assign(APP, { buildProgressSection });
})();
