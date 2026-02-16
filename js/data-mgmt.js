/* ===================================================
   data-mgmt.js — CSV Export, Snapshots, Settings,
   Rebuild, Add/Delete Athlete
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    esc,
    escJs,
    getAthleteById,
    invalidateAthleteMap,
    showToast,
    safeLSGet,
    safeLSSet,
    markTabsDirty,
    renderIfDirty,
    getTestHistory,
    setTestHistory,
  } = APP;

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
    const rawCopy = structuredClone(window._rawDataCache);

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
    APP.refreshSnapshotList();
    APP.updateDataStatus();
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
    window.CLUB = window._processData(structuredClone(snap.data));
    APP.reRenderAll();
    APP.updateDataStatus();
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
    APP.refreshSnapshotList();
    APP.updateDataStatus();
  };

  /* ---------- Standards / Feature Toggle Helper ---------- */
  function _toggleSetting(storageKey, elementIds, on, toastMsg) {
    safeLSSet(storageKey, on ? "true" : "false");
    for (const id of elementIds) {
      const el = document.getElementById(id);
      if (el) el.checked = on;
    }
    APP.rebuildFromStorage();
    markTabsDirty();
    const activeTab = document.querySelector(".tab.active");
    if (activeTab) renderIfDirty(activeTab.dataset.tab);
    renderProfile();
    if (toastMsg) showToast(toastMsg, "info");
  }

  window.toggleAgeAdjusted = function (on) {
    _toggleSetting("lc_age_adjusted", ["ageAdjToggle", "overviewAgeToggle"], on,
      on ? "Age-adjusted standards enabled — grades scaled by training age"
         : "Age-adjusted standards disabled — using senior (12th grade) standards");
  };

  /* ---------- Overview Relatives Toggle ---------- */
  window.toggleOverviewRelatives = function (on) {
    safeLSSet("lc_show_relatives", on ? "true" : "false");
    renderOverview();
  };

  window.toggleBodyAdjusted = function (on) {
    _toggleSetting("lc_body_adjusted", ["bodyAdjToggle", "overviewBodyToggle"], on,
      on ? "Body-adjusted standards enabled — thresholds scaled by weight class & height"
         : "Body-adjusted standards disabled — using baseline thresholds");
  };

  window.toggleCohortMode = function (on) {
    _toggleSetting("lc_cohort_mode", ["cohortToggle", "overviewCohortToggle"], on,
      on ? "Cohort percentiles enabled — ranking against peers with same body profile & position"
         : "Cohort percentiles disabled");
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
    const raw = structuredClone(window._rawDataCache);
    window.CLUB = window._processData(raw);
    // Close edit panel if open
    const panel = document.getElementById("editPanel");
    if (panel && panel.classList.contains("open")) closeEditPanel();
    APP.reRenderAll();
    APP.updateDataStatus();
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
    const rawCopy = structuredClone(window._rawDataCache);

    // Build coach timestamp lookup from original JSON
    const coachTimestamps = {};
    for (let ci = 0; ci < rawCopy.athletes.length; ci++) {
      const ca = rawCopy.athletes[ci];
      if (ca.lastUpdated) coachTimestamps[ca.id] = ca.lastUpdated;
    }

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

    // Apply test history values as current data.
    // Test history (including coach-provided entries from the JSON) is applied
    // unconditionally.  Newest-first sorting ensures the latest value wins.
    const testH = getTestHistory();
    const testIds = Object.keys(testH);
    for (let ti = 0; ti < testIds.length; ti++) {
      const tAid = testIds[ti];
      const tEntries = testH[tAid];
      if (!tEntries || tEntries.length === 0) continue;
      const tAthlete = rawCopy.athletes.find(function (a) {
        return a.id === tAid;
      });
      if (!tAthlete) continue;
      // Sort entries newest-first
      const sorted = tEntries.slice().sort(function (a, b) {
        return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
      });
      const applied = {}; // track which jsonKeys we've already set
      for (let si = 0; si < sorted.length; si++) {
        const vals = sorted[si].values;
        for (const vk in vals) {
          if (applied[vk]) continue; // already set from a newer entry
          if (vals[vk] !== null && vals[vk] !== undefined && vals[vk] !== "") {
            if (typeof vals[vk] === "number" && !isFinite(vals[vk])) continue;
            tAthlete[vk] = vals[vk];
            applied[vk] = true;
          }
        }
      }
    }

    // Apply edits AFTER test history so manual edits take priority.
    // Only apply edits whose timestamp is newer than coach's lastUpdated.
    const edits = safeLSGet("lc_edits", []);
    for (const edit of edits) {
      const athlete = rawCopy.athletes.find(function (a) {
        return a.id === edit.id;
      });
      if (!athlete) continue;
      const cTS = coachTimestamps[edit.id] || "";
      const eTS = edit.timestamp || "";
      if (cTS && eTS && eTS <= cTS) continue; // stale edit, skip
      Object.assign(athlete, edit.changes);
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
    const h = getTestHistory();
    const existingDates = {}; // "date|label" -> true
    const allIds = Object.keys(h);
    for (let hi = 0; hi < allIds.length; hi++) {
      for (let hj = 0; hj < h[allIds[hi]].length; hj++) {
        const ent = h[allIds[hi]][hj];
        existingDates[ent.date + "|" + ent.label] = true;
      }
    }
    const dateKeys = Object.keys(existingDates);
    if (dateKeys.length > 0) {
      if (!h[id]) h[id] = [];
      for (let dk = 0; dk < dateKeys.length; dk++) {
        const parts = dateKeys[dk].split("|");
        h[id].push({
          date: parts[0],
          label: parts.slice(1).join("|"),
          values: {},
        });
      }
      setTestHistory(h);
    }

    // Rebuild & re-render
    APP.rebuildFromStorage();
    APP.reRenderAll();
    APP.updateDataStatus();

    // Select the new athlete and open the edit panel
    document.getElementById("athleteSelect").value = id;
    showTab("profiles");
    renderProfile();
    openEditPanel(id);

    const testMsg =
      dateKeys.length > 0
        ? " — " + dateKeys.length + " test date(s) pre-populated"
        : "";
    showToast("Added " + name.trim() + " (" + id + ")" + testMsg, "success");
  };

  /* ========== DELETE ATHLETE ========== */
  window.deleteCurrentAthlete = function () {
    // Determine which athlete to delete
    let id = APP.editingAthleteId || document.getElementById("athleteSelect").value;
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
    if (APP.editingAthleteId === id) {
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
    APP.rebuildFromStorage();

    // Clear the athlete selector
    document.getElementById("athleteSelect").value = "";
    document.getElementById("profileContent").innerHTML =
      '<p class=\"placeholder-text\">Select an athlete to view their profile.</p>';

    APP.reRenderAll();
    APP.updateDataStatus();

    showToast("Deleted " + displayName + " (" + id + ")", "info");
  };

  Object.assign(APP, { refreshSnapshotList, updateDataStatus, rebuildFromStorage, reRenderAll, refreshAthleteDropdowns, refreshPositionFilter });
})();
