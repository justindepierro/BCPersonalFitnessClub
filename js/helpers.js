/* ===================================================
   helpers.js — Formatting & cell rendering utilities
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;
  const {
    ESC_MAP,
  } = APP;

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return ESC_MAP[c];
    });
  }

  /** Escape a value for embedding inside onclick="fn('VALUE')" */
  function escJs(s) {
    return esc(String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
  }

  /* ---------- Debounce helper ---------- */
  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ---------- Sorted athletes cache ---------- */
  function sortedAthletes() {
    return window.CLUB.athletes.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
  }

  /* ---------- Format height (inches to ft'in") ---------- */
  function fmtHeight(h) {
    if (h === null || h === undefined) return "N/A";
    const ft = Math.floor(h / 12);
    const ins = h % 12;
    return ft + "'" + (Number.isInteger(ins) ? ins : ins.toFixed(1)) + '"';
  }

  /* ---------- Format grade as ordinal (6th, 7th, … 12th) ---------- */
  function ordGrade(g) {
    if (g === null || g === undefined) return "N/A";
    const s = ["th", "st", "nd", "rd"];
    const v = g % 100;
    return g + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- Tier label from average score — delegates to data.js source of truth ---------- */
  function tierLabelFromAvg(avg) {
    return window._gradeHelpers.overallGradeLabel(avg);
  }

  /* ========== HELPERS ========== */
  function fmt(v, decimals) {
    if (v === null || v === undefined) return "—";
    if (typeof decimals === "number") return v.toFixed(decimals);
    return String(v);
  }

  function fmtZ(z) {
    if (z === null || z === undefined) return '<span class="na">—</span>';
    const cls = z > 0.5 ? "z-pos" : z < -0.5 ? "z-neg" : "z-avg";
    return `<span class="${cls}">${z >= 0 ? "+" : ""}${z.toFixed(2)}</span>`;
  }

  function formatLogDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /* Shared helper: builds age-adjustment factor table rows HTML */
  function buildAgeFactorRows(ageFactors, ageFactorsSpeed) {
    return Object.entries(ageFactors)
      .sort((a, b) => b[0] - a[0])
      .map(([g, f]) => {
        const sf = ageFactorsSpeed[g];
        return `<tr><td>${g}th</td><td>${f.toFixed(2)}</td><td>${sf.toFixed(2)}</td><td>${f === 1 ? "Full standard (baseline)" : "Strength × " + f.toFixed(2) + ", Speed × " + sf.toFixed(2)}</td></tr>`;
      })
      .join("");
  }

  function tierBadge(tier) {
    if (!tier) return "";
    const labels = {
      elite: "Elite",
      strong: "Strong",
      solid: "Solid",
      competitive: "Competitive",
      developing: "Developing",
    };
    return `<span class="tier-badge tier-${tier}">${labels[tier] || tier}</span>`;
  }

  function pctBarHTML(pct, colorVar) {
    if (pct === null || pct === undefined) return "";
    const col =
      colorVar ||
      (pct >= 75
        ? "var(--green)"
        : pct >= 50
          ? "var(--blue)"
          : pct >= 25
            ? "var(--yellow)"
            : "var(--red)");
    return `<div class="pct-bar-wrap"><div class="pct-bar-bg"><div class="pct-bar-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
  }

  function tdNum(val, decimals, opts) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const stale = opts && opts.stale;
    const v = fmt(val, decimals);
    const cls = stale ? "num stale-val" : "num";
    const title = stale ? ' title="Previous test data"' : "";
    return `<td class="${cls}"${title}>${v}</td>`;
  }

  // Heat map background color from grade tier (subtle transparent tints)
  function heatBg(grade) {
    if (!grade) return "";
    const colors = {
      elite: "rgba(167,139,250,.15)",
      excellent: "rgba(74,222,128,.13)",
      good: "rgba(96,165,250,.12)",
      average: "rgba(250,204,21,.10)",
      below: "rgba(248,113,113,.12)",
    };
    return colors[grade.tier]
      ? ' style="background:' + colors[grade.tier] + '"'
      : "";
  }

  function tdGraded(val, decimals, grade, opts) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const stale = opts && opts.stale;
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    if (!grade) {
      const cls = stale ? "num stale-val" : "num";
      const title = stale ? ' title="Previous test data"' : "";
      return `<td class="${cls}"${title}>${v}</td>`;
    }
    const staleCls = stale ? " stale-val" : "";
    const titleText = stale ? `${grade.label} (previous test data)` : grade.label;
    return `<td class="num${staleCls} grade-text-${grade.tier}" title="${titleText}"${heatBg(grade)}>${v}</td>`;
  }

  function tdNumColored(val, decimals, opts) {
    if (val === null || val === undefined) return '<td class="num na">—</td>';
    const stale = opts && opts.stale;
    const v = typeof decimals === "number" ? val.toFixed(decimals) : val;
    const cls = val < 0 ? "z-neg" : val > 0 ? "z-pos" : "";
    const staleCls = stale ? " stale-val" : "";
    const title = stale ? ' title="Previous test data"' : "";
    return `<td class="num${staleCls} ${cls}"${title}>${v}</td>`;
  }

  function gradeBadge(grade) {
    if (!grade) return "";
    return `<span class="grade-badge grade-bg-${grade.tier}" title="${grade.label}">${grade.label}</span>`;
  }

  function overallGradeCell(og) {
    if (!og) return '<td class="na">—</td>';
    return `<td class="grade-overall" data-sort-value="${og.score}" title="${og.label} — based on ${og.count} metrics, avg ${og.score}/5">
      <span class="grade-badge grade-bg-${og.tier}">${og.label}</span>
      <span class="grade-score">${og.score}</span>
    </td>`;
  }
  Object.assign(APP, {
    esc, escJs, debounce, sortedAthletes, fmtHeight, ordGrade,
    tierLabelFromAvg, fmt, fmtZ, formatLogDate, buildAgeFactorRows,
    tierBadge, pctBarHTML, tdNum, heatBg, tdGraded, tdNumColored,
    gradeBadge, overallGradeCell,
  });
})();
