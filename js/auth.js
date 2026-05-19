/* ===================================================
   auth.js — Cloudflare auth role UI + cloud data sync
   =================================================== */

(function () {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  let currentUser = null;

  document.documentElement.dataset.authRole = "loading";

  function isDataRequest(input, init) {
    const method =
      (init && init.method) ||
      (input && typeof input === "object" && input.method) ||
      "GET";
    if (String(method).toUpperCase() !== "GET") return false;

    const url =
      typeof input === "string"
        ? input
        : input && input.url
          ? input.url
          : String(input || "");
    return /(^|\/)data\/athletes\.json(?:[?#].*)?$/.test(url);
  }

  window.fetch = function (input, init) {
    if (isDataRequest(input, init)) {
      return nativeFetch("/api/data", {
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }).catch(function () {
        return nativeFetch(input, init);
      });
    }
    return nativeFetch(input, init);
  };

  function safeLSGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function showToast(message, type) {
    if (window.APP && typeof window.APP.showToast === "function") {
      window.APP.showToast(message, type || "info");
      return;
    }
    console.log(message);
  }

  function isAdmin() {
    return currentUser && currentUser.role === "admin";
  }

  function installRoleGuard() {
    document.addEventListener(
      "click",
      function (event) {
        if (isAdmin()) return;
        const blocked = event.target.closest(
          [
            "[data-auth-admin-only]",
            "[data-click='openEditPanel']",
            "[data-click='addAthlete']",
            "[data-click='deleteCurrentAthlete']",
            "[data-click='undoAthleteEdits']",
            "[data-click='saveSnapshot']",
            "[data-click='loadSnapshot']",
            "[data-click='resetToOriginal']",
            "[data-click='importJSON']",
            "#importJsonInput",
          ].join(","),
        );
        if (!blocked) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        showToast("Athlete login is view-only. Log in as admin to change data.", "warn");
      },
      true,
    );
  }

  function addUserPill(user) {
    const header = document.querySelector(".header-inner");
    if (!header || document.getElementById("authUserPill")) return;
    const pill = document.createElement("div");
    pill.id = "authUserPill";
    pill.className = "auth-user-pill";
    const label = user && user.label ? user.label : "Local";
    pill.innerHTML =
      "<strong>" +
      label +
      "</strong><span>access</span><a class=\"auth-logout-link\" href=\"/auth/logout\">Log out</a>";
    header.appendChild(pill);
  }

  async function loadCurrentUser() {
    const isLocal =
      location.protocol === "file:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";
    try {
      const response = await nativeFetch("/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        location.href = "/auth/login";
        return null;
      }
      if (!response.ok) throw new Error("No Cloudflare auth session.");
      const data = await response.json();
      return data.user || null;
    } catch {
      if (!isLocal) {
        location.href = "/auth/login";
        return null;
      }
      return {
        username: "local",
        role: "admin",
        label: "Local Admin",
      };
    }
  }

  function toRawAthlete(a, now) {
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
      sprint_fly10: a.sprintFly10,
      sprint_notes: a.sprintNotes || null,
      pro_agility: a.proAgility,
      l_drill: a.lDrill,
      backpedal: a.backpedal,
      w_drill: a.wDrill,
      forty: a.forty,
      relBench: a.relBench,
      relSquat: a.relSquat,
      mbRel: a.mbRel,
      vMax: a.vMax,
      v10Max: a.v10Max,
      vFly10: a.vFly10,
      peakPower: a.peakPower,
      relPeakPower: a.relPeakPower,
      overallGrade: a.overallGrade ? a.overallGrade.label : null,
      gradeScore: a.overallGrade ? a.overallGrade.score : null,
      lastUpdated: now,
    };
  }

  function buildCurrentDataExport() {
    const D = window.CLUB;
    if (!D || !Array.isArray(D.athletes)) {
      throw new Error("Dashboard data has not loaded yet.");
    }

    const now = new Date().toISOString();
    const exportData = {
      exportDate: now,
      source: "Lifting Club Dashboard",
      dataVersion: now,
      athleteCount: D.athletes.length,
      athletes: D.athletes.map(function (athlete) {
        return toRawAthlete(athlete, now);
      }),
    };

    if (window._rawDataCache) {
      if (window._rawDataCache.meta) exportData.meta = structuredClone(window._rawDataCache.meta);
      if (window._rawDataCache.constants) {
        exportData.constants = structuredClone(window._rawDataCache.constants);
      }
      if (window._rawDataCache.testing_week_plan) {
        exportData.testing_week_plan = structuredClone(window._rawDataCache.testing_week_plan);
      }
      if (window._rawDataCache.benchmarks) {
        exportData.benchmarks = structuredClone(window._rawDataCache.benchmarks);
      }
    }

    const testHistory = safeLSGet("lc_test_history", {});
    if (testHistory && Object.keys(testHistory).length) {
      exportData.test_history = testHistory;
    }

    return exportData;
  }

  function replaceCurrentData(data) {
    localStorage.removeItem("lc_edits");
    localStorage.removeItem("lc_added");
    localStorage.removeItem("lc_deleted");
    if (data.dataVersion) localStorage.setItem("lc_dataVersion", data.dataVersion);
    if (data.test_history) {
      localStorage.setItem("lc_test_history", JSON.stringify(data.test_history));
    }
    window._rawDataCache = structuredClone(data);
    if (typeof window._processData === "function") {
      window.CLUB = window._processData(structuredClone(data));
    }
    if (window.APP) {
      if (typeof window.APP.invalidateAthleteMap === "function") window.APP.invalidateAthleteMap();
      if (typeof window.APP.refreshAthleteDropdowns === "function") window.APP.refreshAthleteDropdowns();
      if (typeof window.APP.refreshPositionFilter === "function") window.APP.refreshPositionFilter();
      if (typeof window.APP.reRenderAll === "function") window.APP.reRenderAll();
      if (typeof window.APP.updateDataStatus === "function") window.APP.updateDataStatus();
    }
  }

  window.publishCloudData = async function () {
    if (!isAdmin()) {
      showToast("Only admin can publish Cloudflare data.", "error");
      return;
    }
    let payload;
    try {
      payload = buildCurrentDataExport();
    } catch (err) {
      showToast(err.message, "error");
      return;
    }
    if (
      !confirm(
        "Publish the current dashboard data to Cloudflare? Athlete logins will see this version after reload.",
      )
    ) {
      return;
    }

    try {
      const response = await nativeFetch("/api/data", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Cloudflare publish failed.");
      }
      payload.dataVersion = result.dataVersion;
      payload.exportDate = result.dataVersion;
      replaceCurrentData(payload);
      showToast("Cloud data published for " + result.athleteCount + " athletes.", "success");
    } catch (err) {
      showToast(err.message || "Cloudflare publish failed.", "error");
    }
  };

  window.reloadCloudData = async function () {
    if (!isAdmin() && !confirm("Reload the latest Cloudflare data?")) return;
    try {
      const response = await nativeFetch("/api/data", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await response.json();
      if (!response.ok || !data.athletes) {
        throw new Error(data.error || "Could not reload Cloudflare data.");
      }
      replaceCurrentData(data);
      showToast("Cloud data reloaded.", "success");
    } catch (err) {
      showToast(err.message || "Could not reload Cloudflare data.", "error");
    }
  };

  document.addEventListener("DOMContentLoaded", async function () {
    currentUser = await loadCurrentUser();
    if (!currentUser) return;
    document.documentElement.dataset.authRole = currentUser.role;
    window.LC_AUTH_USER = currentUser;
    addUserPill(currentUser);
    installRoleGuard();
  });
})();
