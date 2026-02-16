/* ===================================================
   edit-panel.js — Edit panel, JSON import/export, boot
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    escJs,
    ordGrade,
    sortedAthletes,
    fmt,
    getAthleteById,
    showToast,
    safeLSGet,
    safeLSSet,
    markTabsDirty,
    renderIfDirty,
    chartAnimOpts,
    getAthleteHistory,
    currentTestValues,
    saveTestEntry,
    deleteTestEntry,
    logWeight,
    getTestHistory,
    setTestHistory,
    TEST_METRIC_KEYS,
    METRIC_INFO,
    rebuildFromStorage,
    reRenderAll,
    refreshSnapshotList,
    updateDataStatus,
    refreshAthleteDropdowns,
    refreshPositionFilter,
    renderConstants,
    handleSort,
  } = APP;

  /* ========== EDIT PANEL (slide-in) ========== */




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
    APP._editPanelSnapshot = {};
    for (let si = 0; si < EDITABLE_FIELDS.length; si++) {
      const sf = EDITABLE_FIELDS[si];
      const val = a[sf.key] !== undefined ? a[sf.key] : null;
      if (sf.type === "number") {
        APP._editPanelSnapshot[sf.jsonKey] =
          val !== null && val !== undefined ? parseFloat(val) : null;
      } else if (sf.key === "grade") {
        APP._editPanelSnapshot[sf.jsonKey] =
          val !== null && val !== undefined ? parseInt(val, 10) : null;
      } else {
        APP._editPanelSnapshot[sf.jsonKey] = val || null;
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
      for (let hi = 0; hi < history.length; hi++) {
        const he = history[hi];
        let metricsWithData = 0;
        let metricChips = "";
        for (let tki = 0; tki < TEST_METRIC_KEYS.length; tki++) {
          const tkVal = he.values[TEST_METRIC_KEYS[tki].jsonKey];
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
        const s020 = he.values.sprint_020, s2030 = he.values.sprint_2030, s3040 = he.values.sprint_3040;
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
        const _heId = escJs(a.id);
        const _heDate = escJs(he.date);
        const _heLabel = escJs(he.label);
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
    for (let pti = 0; pti < TEST_METRIC_KEYS.length; pti++) {
      const ptk = TEST_METRIC_KEYS[pti];
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
    if (APP.autoSaveTimer) clearTimeout(APP.autoSaveTimer);
    APP.autoSaveTimer = setTimeout(doAutoSave, 800);

    // Show typing indicator
    const statusEl = document.getElementById("autoSaveStatus");
    if (statusEl) {
      statusEl.textContent = "typing…";
      statusEl.classList.add("visible");
    }
  }

  function doAutoSave() {
    if (!APP.editingAthleteId) return;

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
      const origVal = APP._editPanelSnapshot[f.jsonKey];
      // Only record if value actually differs from original
      if (newVal !== origVal && !(newVal == null && origVal == null)) {
        changes[f.jsonKey] = newVal;
      }
    }

    // Save to localStorage
    let edits = safeLSGet("lc_edits", []);
    const existing = edits.find(function (e) {
      return e.id === APP.editingAthleteId;
    });
    if (Object.keys(changes).length === 0) {
      // No changes — remove any existing edit entry for this athlete
      if (existing) {
        edits = edits.filter(function (e) {
          return e.id !== APP.editingAthleteId;
        });
      }
    } else if (existing) {
      existing.changes = changes;
      existing.timestamp = new Date().toISOString();
    } else {
      edits.push({
        id: APP.editingAthleteId,
        changes: changes,
        timestamp: new Date().toISOString(),
      });
    }
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Also log weight to weekly weight log if weight changed
    if (changes.weight_lb !== undefined && changes.weight_lb !== null) {
      logWeight(APP.editingAthleteId, changes.weight_lb);
    }

    // Reprocess data
    APP.rebuildFromStorage();

    // Skip chart animations during auto-save re-renders
    APP._skipChartAnimation = true;

    // Re-render only active tab + profile
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    APP.updateDataStatus();

    // Keep athlete selected & profile visible
    const athSel = document.getElementById("athleteSelect");
    if (athSel) athSel.value = APP.editingAthleteId;
    if (!activeTab || activeTab.dataset.tab !== "profiles") {
      renderProfile();
    }

    APP._skipChartAnimation = false;

    // Update the edit panel nav dropdown
    populateEditAthleteSelect();
    document.getElementById("editAthleteSelect").value = APP.editingAthleteId;

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
      return e.id === APP.editingAthleteId;
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
    if (!APP.editingAthleteId) return;
    const D = window.CLUB;
    const a = getAthleteById(APP.editingAthleteId);
    if (!a) return;

    const dateStr = prompt(
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
    let label = prompt(
      "Enter a label for this test (e.g. 'Spring 2025', 'Pre-Season'):",
      "",
    );
    if (label === null) return;
    if (!label.trim()) label = dateStr;

    const vals = currentTestValues(a);
    saveTestEntry(a.id, dateStr, label.trim(), vals);
    showToast(
      "Saved test entry: " + label.trim() + " (" + dateStr + ")",
      "success",
    );
    APP.buildEditFields(a); // refresh the edit panel
    renderProfile();
  };

  window.openAddPreviousTest = function () {
    // Reset form to "add" mode
    const form = document.getElementById("prevTestForm");
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
    for (let i = 0; i < TEST_METRIC_KEYS.length; i++) {
      const el = document.getElementById(
        "prevTest_" + TEST_METRIC_KEYS[i].jsonKey,
      );
      if (el) el.value = "";
    }
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  window.editHistoryEntry = function (athleteId, date, label) {
    const history = getAthleteHistory(athleteId);
    let entry = null;
    for (let i = 0; i < history.length; i++) {
      if (history[i].date === date && history[i].label === label) {
        entry = history[i];
        break;
      }
    }
    if (!entry) {
      showToast("Test entry not found.", "error");
      return;
    }

    const form = document.getElementById("prevTestForm");
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
    for (let i = 0; i < TEST_METRIC_KEYS.length; i++) {
      const mk = TEST_METRIC_KEYS[i];
      const el = document.getElementById("prevTest_" + mk.jsonKey);
      if (el) {
        const v = entry.values[mk.jsonKey];
        el.value = v !== null && v !== undefined ? v : "";
      }
    }

    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  window.closePrevTestForm = function () {
    const form = document.getElementById("prevTestForm");
    if (form) form.style.display = "none";
  };

  window.submitPreviousTest = function () {
    if (!APP.editingAthleteId) return;
    const dateEl = document.getElementById("prevTestDate");
    const labelEl = document.getElementById("prevTestLabel");
    if (!dateEl || !dateEl.value) {
      showToast("Please enter a test date.", "warn");
      return;
    }

    const dateStr = dateEl.value;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
      isNaN(new Date(dateStr + "T00:00:00").getTime())
    ) {
      showToast("Invalid date format. Please use YYYY-MM-DD.", "warn");
      return;
    }
    const label = (labelEl && labelEl.value.trim()) || dateStr;

    const vals = {};
    for (let i = 0; i < TEST_METRIC_KEYS.length; i++) {
      const mk = TEST_METRIC_KEYS[i];
      const el = document.getElementById("prevTest_" + mk.jsonKey);
      if (el && el.value.trim() !== "") {
        vals[mk.jsonKey] = parseFloat(el.value);
      } else {
        vals[mk.jsonKey] = null;
      }
    }

    // If in edit mode, delete the original entry first
    const editMode = document.getElementById("prevTestEditMode");
    if (editMode && editMode.value === "edit") {
      const origDate = document.getElementById("prevTestOrigDate").value;
      const origLabel = document.getElementById("prevTestOrigLabel").value;
      deleteTestEntry(APP.editingAthleteId, origDate, origLabel);
    }

    saveTestEntry(APP.editingAthleteId, dateStr, label, vals);

    const isEdit = editMode && editMode.value === "edit";
    showToast(
      (isEdit ? "Updated" : "Saved") + " test: " + label + " (" + dateStr + ")",
      "success",
    );

    // Refresh edit panel & profile
    APP.rebuildFromStorage();
    markTabsDirty();
    const a = getAthleteById(APP.editingAthleteId);
    if (a) APP.buildEditFields(a);
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
    APP.editingAthleteId = id;

    // Populate the nav dropdown
    populateEditAthleteSelect();
    document.getElementById("editAthleteSelect").value = id;

    // Set title
    document.getElementById("editPanelTitle").textContent = "Edit: " + a.name;

    // Build fields
    APP.buildEditFields(a);

    // Open panel with animation
    document.getElementById("editPanel").classList.add("open");
    document.getElementById("editPanelBackdrop").classList.add("open");

    // Also select this athlete in the main profile tab
    document.getElementById("athleteSelect").value = id;
    renderProfile();
  };

  window.closeEditPanel = function () {
    // Flush any pending auto-save before closing
    if (APP.autoSaveTimer) {
      clearTimeout(APP.autoSaveTimer);
      APP.autoSaveTimer = null;
      doAutoSave();
    }
    document.getElementById("editPanel").classList.remove("open");
    document.getElementById("editPanelBackdrop").classList.remove("open");
    APP.editingAthleteId = null;
  };

  window.editPanelSelectAthlete = function (id) {
    if (!id) return;
    // Flush any pending auto-save for previous athlete
    if (APP.autoSaveTimer) {
      clearTimeout(APP.autoSaveTimer);
      APP.autoSaveTimer = null;
      doAutoSave();
    }
    openEditPanel(id);
  };

  window.editPanelPrev = function () {
    if (APP.autoSaveTimer) {
      clearTimeout(APP.autoSaveTimer);
      APP.autoSaveTimer = null;
      doAutoSave();
    }
    const sorted = sortedAthletes();
    if (sorted.length === 0) return;
    let idx = sorted.findIndex(function (a) {
      return a.id === APP.editingAthleteId;
    });
    if (idx <= 0) idx = sorted.length;
    openEditPanel(sorted[idx - 1].id);
  };

  window.editPanelNext = function () {
    if (APP.autoSaveTimer) {
      clearTimeout(APP.autoSaveTimer);
      APP.autoSaveTimer = null;
      doAutoSave();
    }
    const sorted = sortedAthletes();
    if (sorted.length === 0) return;
    let idx = sorted.findIndex(function (a) {
      return a.id === APP.editingAthleteId;
    });
    if (idx >= sorted.length - 1) idx = -1;
    openEditPanel(sorted[idx + 1].id);
  };

  /* ---------- Undo & athlete-level export ---------- */
  window.undoAthleteEdits = function () {
    if (!APP.editingAthleteId) return;
    let edits = safeLSGet("lc_edits", []);
    edits = edits.filter(function (e) {
      return e.id !== APP.editingAthleteId;
    });
    safeLSSet("lc_edits", JSON.stringify(edits));

    // Reprocess from original + remaining edits
    APP.rebuildFromStorage();
    APP.reRenderAll();
    APP.updateDataStatus();

    // Refresh the panel with original data
    const a = getAthleteById(APP.editingAthleteId);
    if (a) {
      APP.buildEditFields(a);
      document.getElementById("editPanelTitle").textContent = "Edit: " + a.name;
      populateEditAthleteSelect();
      document.getElementById("editAthleteSelect").value = APP.editingAthleteId;
    }
    showToast("Changes undone for this athlete.", "info");
  };

  window.exportAthleteJSON = function () {
    if (!APP.editingAthleteId) return;
    const a = getAthleteById(APP.editingAthleteId);
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
      lastUpdated: new Date().toISOString(),
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
      const modals = document.querySelectorAll(".modal-overlay");
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
    const now = new Date().toISOString();
    const exportData = {
      exportDate: now,
      source: "BC Personal Fitness Club Dashboard",
      dataVersion: now,
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
          lastUpdated: now,
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
    const testHist = getTestHistory();
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
            lastUpdated:
              a.lastUpdated || data.dataVersion || new Date().toISOString(),
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
          dataVersion: data.dataVersion || new Date().toISOString(),
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

        // Store the dataVersion from the imported file so future loads
        // recognise it and don't re-purge localStorage.
        if (data.dataVersion) {
          localStorage.setItem("lc_dataVersion", data.dataVersion);
        }

        /* --- Restore test history if present in import --- */
        if (data.test_history && typeof data.test_history === "object") {
          safeLSSet("lc_test_history", JSON.stringify(data.test_history));
        } else {
          localStorage.removeItem("lc_test_history");
        }

        /* --- Set new raw cache and reprocess --- */
        window._rawDataCache = structuredClone(rawData);
        window.CLUB = window._processData(rawData);
        APP.reRenderAll();
        APP.updateDataStatus();
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


  /* ---------- Boot ---------- */
  document.addEventListener("club-data-ready", function () {
    // Hide loading indicator
    const loadingEl = document.getElementById("loadingIndicator");
    if (loadingEl) loadingEl.style.display = "none";

    const D = window.CLUB;
    document.getElementById("exportDate").textContent = D.exportDate;

    // Restore all toggle states from localStorage
    function restoreToggle(elementId, storageKey) {
      const el = document.getElementById(elementId);
      if (el) el.checked = localStorage.getItem(storageKey) === "true";
    }
    const togglePairs = [
      [["ageAdjToggle", "overviewAgeToggle"], "lc_age_adjusted"],
      [["overviewRelToggle"], "lc_show_relatives"],
      [["bodyAdjToggle", "overviewBodyToggle"], "lc_body_adjusted"],
      [["cohortToggle", "overviewCohortToggle"], "lc_cohort_mode"],
    ];
    for (const [ids, key] of togglePairs) {
      for (const id of ids) restoreToggle(id, key);
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
    APP.refreshSnapshotList();

    // Only render the visible tab; mark the rest dirty for lazy rendering
    markTabsDirty();
    renderOverview();
    APP._tabDirty["overview"] = false;
    renderConstants();
    APP._tabDirty["constants"] = false;
    APP.updateDataStatus();

    // Sortable bindings (delegated to survive thead rebuilds)
    document.querySelectorAll(".data-table.sortable").forEach((table) => {
      table.addEventListener("click", function (ev) {
        const th = ev.target.closest("th[data-sort]");
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
  Object.assign(APP, { buildEditFields, populateEditAthleteSelect });
})();
