/* ===================================================
   auth.js — Cloudflare auth role UI + cloud data sync
   =================================================== */

(function () {
  "use strict";

  const nativeFetch = window.fetch.bind(window);
  let currentUser = null;
  let suppressChangeTracking = 0;
  const AUTO_CLOUD_SAVE_DELAY_MS = 4500;
  const DATA_SYNC_KEYS = new Set([
    "lc_edits",
    "lc_added",
    "lc_deleted",
    "lc_test_history",
    "lc_test_notes",
    "lc_weight_log",
  ]);
  const cloudSave = {
    status: "idle",
    dirty: false,
    saving: false,
    timer: null,
    changeSerial: 0,
    lastKnownVersion: null,
    lastSavedAt: null,
    lastError: null,
    pendingReason: null,
  };

  document.documentElement.dataset.authRole = "loading";

  function isLocalView() {
    return (
      location.protocol === "file:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
    );
  }

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
      const fallbackToStaticData = function () {
        return nativeFetch(input, init);
      };
      return nativeFetch("/api/data", {
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      })
        .then(function (response) {
          if (response.ok || !isLocalView()) return response;
          return fallbackToStaticData();
        })
        .catch(fallbackToStaticData);
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

  function safeLSRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeLSSetRaw(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn("localStorage write failed for " + key + ":", err);
    }
  }

  function safeLSRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn("localStorage remove failed for " + key + ":", err);
    }
  }

  cloudSave.lastKnownVersion = safeLSRaw("lc_dataVersion");

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

  function canUseCloudApi() {
    return location.protocol !== "file:" && currentUser && currentUser.username !== "local";
  }

  function updateStatusUI() {
    if (window.APP && typeof window.APP.updateDataStatus === "function") {
      window.APP.updateDataStatus();
    }
  }

  function formatSaveTime(date) {
    if (!date) return "";
    try {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function scheduleCloudSave(delay) {
    if (cloudSave.timer) clearTimeout(cloudSave.timer);
    if (!isAdmin() || !canUseCloudApi()) return;
    cloudSave.timer = setTimeout(function () {
      cloudSave.timer = null;
      saveCloudData({ manual: false });
    }, delay);
  }

  function flushPendingAutoSave() {
    if (
      window.APP &&
      typeof window.APP.flushPendingAutoSave === "function" &&
      window.APP.flushPendingAutoSave()
    ) {
      return true;
    }
    return false;
  }

  function markDataChanged(reason, options) {
    if (suppressChangeTracking) return;
    if (options && options.key && !DATA_SYNC_KEYS.has(options.key)) return;
    if (!isAdmin()) return;

    cloudSave.changeSerial += 1;
    cloudSave.dirty = true;
    cloudSave.pendingReason = reason || "data changes";
    cloudSave.lastError = null;

    if (!canUseCloudApi()) {
      cloudSave.status = "local-only";
      updateStatusUI();
      return;
    }

    cloudSave.status = cloudSave.saving ? "saving" : "pending";
    updateStatusUI();
    scheduleCloudSave(options && options.immediate ? 0 : AUTO_CLOUD_SAVE_DELAY_MS);
  }

  function withoutDataChangeTracking(fn) {
    suppressChangeTracking += 1;
    try {
      return fn();
    } finally {
      suppressChangeTracking -= 1;
    }
  }

  function getCloudSaveSummary() {
    if (!isAdmin()) return null;
    if (!canUseCloudApi()) {
      return {
        status: "local-only",
        text: "Cloud save unavailable in this local view",
      };
    }
    if (cloudSave.status === "saving") {
      return { status: "saving", text: "Saving to Cloudflare..." };
    }
    if (cloudSave.status === "error") {
      return {
        status: "error",
        text: "Cloud save failed: " + (cloudSave.lastError || "retry needed"),
      };
    }
    if (cloudSave.status === "pending" || cloudSave.dirty) {
      return { status: "pending", text: "Cloud save queued" };
    }
    if (cloudSave.lastSavedAt) {
      return {
        status: "saved",
        text: "Cloud saved " + formatSaveTime(cloudSave.lastSavedAt),
      };
    }
    return { status: "idle", text: "Cloud ready" };
  }

  function resetCloudSaveState(dataVersion) {
    if (cloudSave.timer) clearTimeout(cloudSave.timer);
    cloudSave.timer = null;
    cloudSave.dirty = false;
    cloudSave.saving = false;
    cloudSave.status = "saved";
    cloudSave.lastError = null;
    cloudSave.pendingReason = null;
    cloudSave.lastSavedAt = new Date();
    if (dataVersion) cloudSave.lastKnownVersion = dataVersion;
    updateStatusUI();
  }

  window.markDataChanged = markDataChanged;
  window.getCloudSaveSummary = getCloudSaveSummary;
  window.suspendDataChangeTracking = withoutDataChangeTracking;
  window.resetCloudSaveState = resetCloudSaveState;

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
    const labelEl = document.createElement("strong");
    labelEl.textContent = label;
    const accessEl = document.createElement("span");
    accessEl.textContent = "access";
    pill.appendChild(labelEl);
    pill.appendChild(accessEl);
    if (!user || user.username !== "local") {
      const logoutEl = document.createElement("a");
      logoutEl.className = "auth-logout-link";
      logoutEl.href = "/auth/logout";
      logoutEl.textContent = "Log out";
      pill.appendChild(logoutEl);
    }
    header.appendChild(pill);
  }

  async function loadCurrentUser() {
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
      if (!isLocalView()) {
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

    const testNotes = safeLSGet("lc_test_notes", {});
    if (testNotes && Object.keys(testNotes).length) {
      exportData.test_notes = testNotes;
    }

    const weightLog = safeLSGet("lc_weight_log", {});
    if (weightLog && Object.keys(weightLog).length) {
      exportData.weight_log = weightLog;
    }

    return exportData;
  }

  function storeOptionalCollection(key, value) {
    if (value && typeof value === "object" && Object.keys(value).length) {
      safeLSSetRaw(key, JSON.stringify(value));
    } else {
      safeLSRemove(key);
    }
  }

  function replaceCurrentData(data, options) {
    const cleanData = structuredClone(data);
    delete cleanData.previousDataVersion;

    withoutDataChangeTracking(function () {
      safeLSRemove("lc_edits");
      safeLSRemove("lc_added");
      safeLSRemove("lc_deleted");
      if (cleanData.dataVersion) safeLSSetRaw("lc_dataVersion", cleanData.dataVersion);
      storeOptionalCollection("lc_test_history", cleanData.test_history);
      storeOptionalCollection("lc_test_notes", cleanData.test_notes);
      storeOptionalCollection("lc_weight_log", cleanData.weight_log);
    });

    if (cleanData.dataVersion) cloudSave.lastKnownVersion = cleanData.dataVersion;
    window._rawDataCache = structuredClone(cleanData);
    if (window.APP && typeof window.APP.rebuildFromStorage === "function") {
      window.APP.rebuildFromStorage();
    } else if (typeof window._processData === "function") {
      window.CLUB = window._processData(structuredClone(cleanData));
    }
    if (window.APP) {
      if (typeof window.APP.invalidateAthleteMap === "function") window.APP.invalidateAthleteMap();
      if (typeof window.APP.refreshAthleteDropdowns === "function") window.APP.refreshAthleteDropdowns();
      if (typeof window.APP.refreshPositionFilter === "function") window.APP.refreshPositionFilter();
      if (typeof window.APP.reRenderAll === "function") window.APP.reRenderAll();
      if (typeof window.APP.refreshEditPanelAfterDataSync === "function") {
        window.APP.refreshEditPanelAfterDataSync(options && options.keepInputs);
      }
      if (typeof window.APP.updateDataStatus === "function") window.APP.updateDataStatus();
    }
  }

  async function saveCloudData(options) {
    options = options || {};
    if (!isAdmin()) {
      showToast("Only admin can publish Cloudflare data.", "error");
      return false;
    }
    if (!canUseCloudApi()) {
      cloudSave.status = "local-only";
      updateStatusUI();
      showToast("Cloud save is available from the Cloudflare site or Cloudflare dev server.", "warn");
      return false;
    }
    if (cloudSave.saving) {
      if (options.manual) showToast("Cloud save is already running.", "info");
      return false;
    }

    flushPendingAutoSave();

    let payload;
    try {
      payload = buildCurrentDataExport();
    } catch (err) {
      showToast(err.message, "error");
      return false;
    }

    const previousDataVersion =
      cloudSave.lastKnownVersion ||
      safeLSRaw("lc_dataVersion") ||
      (window._rawDataCache && window._rawDataCache.dataVersion) ||
      null;
    if (previousDataVersion) payload.previousDataVersion = previousDataVersion;

    if (cloudSave.timer) {
      clearTimeout(cloudSave.timer);
      cloudSave.timer = null;
    }

    const startSerial = cloudSave.changeSerial;
    cloudSave.saving = true;
    cloudSave.dirty = false;
    cloudSave.status = "saving";
    cloudSave.lastError = null;
    updateStatusUI();

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
        const err = new Error(result.error || "Cloudflare publish failed.");
        err.status = response.status;
        err.result = result;
        throw err;
      }
      payload.dataVersion = result.dataVersion;
      payload.exportDate = result.dataVersion;
      delete payload.previousDataVersion;
      cloudSave.lastKnownVersion = result.dataVersion;
      safeLSSetRaw("lc_dataVersion", result.dataVersion);

      if (cloudSave.changeSerial === startSerial && !cloudSave.dirty) {
        replaceCurrentData(payload, { keepInputs: true });
        cloudSave.status = "saved";
        cloudSave.lastSavedAt = new Date();
        cloudSave.lastError = null;
        cloudSave.pendingReason = null;
        if (options.manual) {
          showToast("Cloud data saved for " + result.athleteCount + " athletes.", "success");
        }
      } else {
        cloudSave.status = "pending";
        cloudSave.dirty = true;
        scheduleCloudSave(AUTO_CLOUD_SAVE_DELAY_MS);
        if (options.manual) {
          showToast("Cloud save finished. Newer edits are queued next.", "info");
        }
      }
      return true;
    } catch (err) {
      cloudSave.status = "error";
      cloudSave.dirty = true;
      cloudSave.lastError = err.message || "Cloudflare publish failed.";
      if (err.status === 409) {
        showToast(
          "Cloud data changed somewhere else. Reload Cloud Data before saving again.",
          "error",
        );
      } else {
        showToast(cloudSave.lastError, "error");
      }
      return false;
    } finally {
      cloudSave.saving = false;
      updateStatusUI();
    }
  }

  window.publishCloudData = function () {
    return saveCloudData({ manual: true });
  };

  window.reloadCloudData = async function () {
    if (!isAdmin() && !confirm("Reload the latest Cloudflare data?")) return;
    flushPendingAutoSave();
    if (
      isAdmin() &&
      (cloudSave.dirty || cloudSave.status === "pending" || cloudSave.status === "error") &&
      !confirm("Reload Cloudflare data? Any queued local changes in this browser will be discarded.")
    ) {
      return;
    }
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
      resetCloudSaveState(data.dataVersion || null);
      showToast("Cloud data reloaded.", "success");
    } catch (err) {
      showToast(err.message || "Could not reload Cloudflare data.", "error");
    }
  };

  window.addEventListener("online", function () {
    if (isAdmin() && cloudSave.dirty && canUseCloudApi()) {
      cloudSave.status = "pending";
      scheduleCloudSave(1000);
      updateStatusUI();
    }
  });

  window.addEventListener("beforeunload", function (event) {
    if (!isAdmin()) return;
    if (!(cloudSave.dirty || cloudSave.status === "pending" || cloudSave.status === "saving")) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("club-data-ready", function () {
    const loadedVersion =
      (window._rawDataCache && window._rawDataCache.dataVersion) || safeLSRaw("lc_dataVersion");
    if (loadedVersion) cloudSave.lastKnownVersion = loadedVersion;
    updateStatusUI();
  });

  document.addEventListener("DOMContentLoaded", async function () {
    currentUser = await loadCurrentUser();
    if (!currentUser) return;
    document.documentElement.dataset.authRole = currentUser.role;
    window.LC_AUTH_USER = currentUser;
    addUserPill(currentUser);
    installRoleGuard();
    updateStatusUI();
  });
})();
