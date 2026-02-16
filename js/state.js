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
  function _doTabSwitch(tabId) {
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
  }

  window.showTab = function (tabId) {
    if (document.startViewTransition) {
      document.startViewTransition(function () { _doTabSwitch(tabId); });
    } else {
      _doTabSwitch(tabId);
    }
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
    APP.markTabsDirty();
    var activeTab = document.querySelector(".tab.active");
    if (activeTab) APP.renderIfDirty(activeTab.dataset.tab);
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

  /* ---------- Animated number counter ---------- */
  function animateCounters(container) {
    if (!container) return;
    var els = container.querySelectorAll(".value");
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        var text = el.textContent.trim();
        // Extract leading number (int or float)
        var match = text.match(/^([\d.]+)/);
        if (!match) return;
        var target = parseFloat(match[1]);
        if (isNaN(target) || target === 0) return;
        var suffix = text.slice(match[1].length);
        var isFloat = match[1].indexOf(".") !== -1;
        var decimals = isFloat ? (match[1].split(".")[1] || "").length : 0;
        var duration = 400;
        var start = performance.now();
        function step(now) {
          var elapsed = now - start;
          var progress = Math.min(elapsed / duration, 1);
          // ease-out cubic
          var ease = 1 - Math.pow(1 - progress, 3);
          var current = target * ease;
          el.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)) + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      })(els[i]);
    }
  }

  /* ---------- Mobile card-view table helper ---------- */
  function applyCardViewLabels(tableWrap) {
    if (!tableWrap) return;
    tableWrap.classList.add("card-view-mobile");
    var headers = tableWrap.querySelectorAll("thead th");
    var rows = tableWrap.querySelectorAll("tbody tr");
    var labels = [];
    for (var h = 0; h < headers.length; h++) {
      labels.push(headers[h].textContent.trim());
    }
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll("td");
      for (var c = 0; c < cells.length && c < labels.length; c++) {
        cells[c].setAttribute("data-label", labels[c]);
      }
    }
  }

  /* ---------- Chart.js theme helper ---------- */
  function getChartTheme() {
    var s = getComputedStyle(document.documentElement);
    var v = function (prop) { return s.getPropertyValue(prop).trim(); };
    return {
      grid: v("--chart-grid") || "rgba(255,255,255,0.06)",
      tick: v("--chart-tick") || "#8b90a0",
      text: v("--text") || "#e4e6ed",
      surface: v("--surface") || "#1a1d27",
      border: v("--border") || "#2e3345",
      bg: v("--bg") || "#0f1117",
      accent: v("--accent") || "#6c63ff",
      purple: v("--purple") || "#a78bfa",
      green: v("--green") || "#4ade80",
      blue: v("--blue") || "#60a5fa",
      yellow: v("--yellow") || "#facc15",
      red: v("--red") || "#f87171",
      orange: v("--orange") || "#f97316",
      muted: v("--text-muted") || "#9ba0b2",
    };
  }

  /* ---------- Arrow-key tab navigation (Item 16) ---------- */
  document.addEventListener("keydown", function (e) {
    var target = e.target;
    if (!target.classList.contains("tab")) return;
    var tabs = Array.from(document.querySelectorAll(".tab[role='tab']"));
    var idx = tabs.indexOf(target);
    if (idx === -1) return;
    var next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (idx + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (idx - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = tabs.length - 1;
    }
    if (next !== -1) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  });

  /* ---------- Keyboard shortcuts (Item 17) ---------- */
  document.addEventListener("keydown", function (e) {
    // Ctrl/Cmd+K → focus search input
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      var search = document.getElementById("rosterSearch");
      if (search) { search.focus(); search.select(); }
      // Switch to overview tab if not already there
      var activeTab = document.querySelector(".tab.active");
      if (activeTab && activeTab.dataset.tab !== "overview") showTab("overview");
      return;
    }
    // Escape → close panels/modals
    if (e.key === "Escape") {
      // Close edit panel if open
      var editPanel = document.querySelector(".edit-panel.open");
      if (editPanel && window.closeEditPanel) { window.closeEditPanel(); return; }
      // Close any open modal
      var modal = document.querySelector(".modal-overlay[style*='flex']");
      if (modal) { modal.style.display = "none"; return; }
    }
    // Alt+1-9 → switch to tab by number
    if (e.altKey && e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      var tabBtns = document.querySelectorAll(".tab[role='tab']");
      var tabIdx = parseInt(e.key) - 1;
      if (tabIdx < tabBtns.length) {
        tabBtns[tabIdx].click();
      }
    }
  });

  /* ---------- Drag-to-reorder tabs (Item 22) ---------- */
  (function initDragTabs() {
    var nav = document.querySelector(".tabs[role='tablist']");
    if (!nav) return;
    var dragging = null;

    // Restore saved order
    var saved = safeLSGet("lc_tab_order", null);
    if (saved && Array.isArray(saved)) {
      var tabs = Array.from(nav.querySelectorAll(".tab[role='tab']"));
      var tabMap = {};
      tabs.forEach(function (t) { tabMap[t.dataset.tab] = t; });
      saved.forEach(function (id) {
        if (tabMap[id]) nav.appendChild(tabMap[id]);
      });
    }

    // Make tabs draggable
    nav.querySelectorAll(".tab[role='tab']").forEach(function (tab) {
      tab.setAttribute("draggable", "true");
    });

    nav.addEventListener("dragstart", function (e) {
      if (!e.target.classList.contains("tab")) return;
      dragging = e.target;
      e.target.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
    });

    nav.addEventListener("dragend", function (e) {
      if (dragging) dragging.style.opacity = "";
      dragging = null;
      nav.querySelectorAll(".tab").forEach(function (t) {
        t.classList.remove("drag-over");
      });
    });

    nav.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var target = e.target.closest(".tab[role='tab']");
      if (!target || target === dragging) return;
      nav.querySelectorAll(".tab").forEach(function (t) {
        t.classList.remove("drag-over");
      });
      target.classList.add("drag-over");
    });

    nav.addEventListener("drop", function (e) {
      e.preventDefault();
      var target = e.target.closest(".tab[role='tab']");
      if (!target || !dragging || target === dragging) return;
      // Insert dragged tab before or after target
      var tabs = Array.from(nav.querySelectorAll(".tab[role='tab']"));
      var dragIdx = tabs.indexOf(dragging);
      var dropIdx = tabs.indexOf(target);
      if (dragIdx < dropIdx) {
        nav.insertBefore(dragging, target.nextSibling);
      } else {
        nav.insertBefore(dragging, target);
      }
      // Save order
      var newOrder = Array.from(nav.querySelectorAll(".tab[role='tab']")).map(function (t) {
        return t.dataset.tab;
      });
      safeLSSet("lc_tab_order", newOrder);
      target.classList.remove("drag-over");
    });
  })();

  Object.assign(APP, {
    getAthleteMap, getAthleteById, invalidateAthleteMap,
    chartAnimOpts, destroyChart,
    safeLSGet, safeLSSet, showToast,
    markTabsDirty, renderIfDirty, refreshIcons, animateCounters,
    applyCardViewLabels, getChartTheme,
  });
})();
