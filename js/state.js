/* ===================================================
   state.js — Shared application state & core utilities
   Initializes window.APP namespace used by all modules.
   =================================================== */

(function () {
  "use strict";

  const APP = (window.APP = {
    charts: {
      lb: null, profileRadar: null, profilePct: null,
      profileSprint: null, profileDonut: null,
      profileQuadrant: null, profileProgress: null,
      cmp: null, _cmpCharts: [],
    },
    _athleteMap: null,
    _testHistoryCache: null,
    _prevTestCache: null,
    _staleKeysCache: null,
    _normCache: new Map(),
    _gradingSportCache: {},
    _skipChartAnimation: false,
    _tabDirty: {},
    editingAthleteId: null,
    autoSaveTimer: null,
    _editPanelSnapshot: null,
    renderers: {},
  });

  /* ---------- Athlete Map ---------- */
  function getAthleteMap() {
    if (APP._athleteMap) return APP._athleteMap;
    APP._athleteMap = new Map();
    const athletes = window.CLUB ? window.CLUB.athletes : [];
    for (let i = 0; i < athletes.length; i++) {
      APP._athleteMap.set(athletes[i].id, athletes[i]);
    }
    return APP._athleteMap;
  }
  function getAthleteById(id) {
    return getAthleteMap().get(id) || null;
  }
  function invalidateAthleteMap() {
    APP._athleteMap = null;
  }

  /* ---------- Chart helpers ---------- */
  function chartAnimOpts() {
    return APP._skipChartAnimation ? { animation: false } : {};
  }
  function destroyChart(ref) {
    if (ref) ref.destroy();
    return null;
  }

  /* ---------- Safe localStorage ---------- */
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

  /* ---------- Toast ---------- */
  function showToast(msg, type) {
    type = type || "info";
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const t = document.createElement("div");
    t.className = "toast toast-" + type;
    const span = document.createElement("span");
    span.textContent = msg;
    const btn = document.createElement("button");
    btn.className = "toast-dismiss";
    btn.setAttribute("aria-label", "Dismiss");
    btn.innerHTML = "&times;";
    btn.addEventListener("click", function () { t.remove(); });
    t.appendChild(span);
    t.appendChild(btn);
    container.appendChild(t);
    const dur = type === "error" ? 6000 : 3200;
    setTimeout(function () { t.remove(); }, dur);
  }

  /* ---------- Lazy rendering ---------- */
  function markTabsDirty() {
    const tabs = [
      "overview", "leaderboards", "sprint", "strength", "scorecard",
      "log", "plan", "constants", "groups", "profiles", "compare",
    ];
    for (const t of tabs) APP._tabDirty[t] = true;
    APP._normCache.clear();
    APP._prevTestCache = null;
    APP._staleKeysCache = null;
  }
  function renderIfDirty(tabId) {
    if (!APP._tabDirty[tabId]) return;
    APP._tabDirty[tabId] = false;
    const fn = APP.renderers[tabId];
    if (fn) fn();
  }

  /* ---------- Tab switching ---------- */
  window.showTab = function (tabId) {
    const prevTab = document.querySelector(".tab.active");
    if (prevTab) {
      const prevId = prevTab.dataset.tab;
      if (prevId === "profiles") {
        APP.charts.profileRadar = destroyChart(APP.charts.profileRadar);
        APP.charts.profilePct = destroyChart(APP.charts.profilePct);
        APP.charts.profileSprint = destroyChart(APP.charts.profileSprint);
        APP.charts.profileDonut = destroyChart(APP.charts.profileDonut);
        APP.charts.profileQuadrant = destroyChart(APP.charts.profileQuadrant);
        APP.charts.profileProgress = destroyChart(APP.charts.profileProgress);
      }
      if (prevId === "leaderboards")
        APP.charts.lb = destroyChart(APP.charts.lb);
      if (prevId === "compare" && APP._destroyAllCmpCharts)
        APP._destroyAllCmpCharts();
    }
    document.querySelectorAll(".tab").forEach(function (t) {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle("active", isActive);
      t.setAttribute("aria-selected", String(isActive));
      t.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    document.querySelectorAll(".tab-panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + tabId);
    });
    renderIfDirty(tabId);
  };

  /* ---------- Theme (light/dark) ---------- */
  function getTheme() {
    const saved = localStorage.getItem("lc_theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lc_theme", theme);
  }
  applyTheme(getTheme());

  window.toggleTheme = function () {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    // Re-render active charts so Chart.js picks up new colors
    if (APP._themeChangeCallback) APP._themeChangeCallback();
  };

  /* ---------- Lucide icon refresh ---------- */
  let _iconDebounce = null;
  function refreshIcons() {
    if (window.lucide) lucide.createIcons();
  }
  // Auto-refresh Lucide icons when DOM changes
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(function () {
      clearTimeout(_iconDebounce);
      _iconDebounce = setTimeout(refreshIcons, 80);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  Object.assign(APP, {
    getAthleteMap, getAthleteById, invalidateAthleteMap,
    chartAnimOpts, destroyChart,
    safeLSGet, safeLSSet, showToast,
    markTabsDirty, renderIfDirty, refreshIcons,
  });
})();
