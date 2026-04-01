/* ===================================================
   data.js — Load + clean the raw JSON export
   Resolves Excel formula placeholders, computes groups,
   and exposes a clean `window.CLUB` object for app.js
   =================================================== */

(function () {
  'use strict';

  /* ---------- helpers ---------- */
  function num(v) {
    if (v === null || v === undefined || v === '' || v === 'N/A') return null;
    if (typeof v === 'string' && v.startsWith('=')) return null;   // unevaluated formula
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function txt(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.startsWith('=')) return null;
    return String(v).trim() || null;
  }

  function posGroup(pos) {
    if (!pos) return 'Other';
    const p = pos.toUpperCase();
    if (['RB', 'WR', 'DB'].includes(p)) return 'Skill';
    if (['QB', 'TE', 'LB'].includes(p)) return 'Big Skill';
    if (['OL', 'DL'].includes(p)) return 'Linemen';
    return 'Other';
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ---------- Process raw JSON ---------- */
  function processData(raw) {
    const athletes = [];
    const positions = new Set();

    for (const a of raw.athletes) {
      const name = txt(a.name);
      if (!name) continue;                         // skip blank rows

      const pos  = txt(a.position);
      const group = posGroup(pos);
      const wt   = num(a.weight_lb);
      if (pos) positions.add(pos);

      // Sprint
      const sp = a.tests?.sprint_splits || {};
      const s020  = num(sp['0–20 yd (s)']) ?? num(sp['0\u201320 yd (s)']);
      const s2030 = num(sp['20–30 yd (s)']) ?? num(sp['20\u201330 yd (s)']);
      const s3040 = num(sp['30–40 yd (s)']) ?? num(sp['30\u201340 yd (s)']);
      let forty = null;
      if (s020 !== null && s2030 !== null && s3040 !== null) {
        forty = +(s020 + s2030 + s3040).toFixed(2);
      }

      // Jump & Strength
      const js = a.tests?.jump_strength || {};
      const vert  = num(js['Vertical Jump (in)']);
      const broad = num(js['Broad Jump (in)']);
      const bench = num(js['Bench 1RM (lb)']);
      const squat = num(js['Squat 1RM (lb)']);

      // Med Ball
      const mb = a.tests?.med_ball || {};
      const medball = num(mb['Seated MB 10lb (in)']);

      // Derived: relative values
      const relBench = (bench !== null && wt) ? +(bench / wt).toFixed(2) : null;
      const relSquat = (squat !== null && wt) ? +(squat / wt).toFixed(2) : null;
      const mbRel    = (medball !== null && wt) ? +(medball / wt).toFixed(2) : null;

      // Z-scores from export
      const zs = a.analytics?.z_scores || {};
      const zMB = num(zs.medball_in);

      // Indices
      const idx = a.analytics?.indices || {};
      const explosiveUpper = num(idx.explosive_upper_index);
      const totalExplosive = num(idx.total_explosive_index);

      athletes.push({
        id: a.athlete_id,
        name,
        initials: initials(name),
        position: pos,
        group,
        weight: wt,
        sprint020: s020,
        sprint2030: s2030,
        sprint3040: s3040,
        forty,
        vert,
        broad,
        bench,
        squat,
        medball,
        relBench,
        relSquat,
        mbRel,
        zMB,
        explosiveUpper,
        totalExplosive
      });
    }

    // ---- Compute team-wide percentiles for medball by group ----
    const groupedMB = {};
    for (const a of athletes) {
      if (a.medball === null) continue;
      if (!groupedMB[a.group]) groupedMB[a.group] = [];
      groupedMB[a.group].push(a.medball);
    }

    // Sort each group
    for (const g in groupedMB) {
      groupedMB[g].sort((a, b) => a - b);
    }

    function percentileOf(val, sortedArr) {
      if (!sortedArr || sortedArr.length === 0) return null;
      let count = 0;
      for (const v of sortedArr) { if (v < val) count++; }
      return Math.round((count / sortedArr.length) * 100);
    }

    function tierFromPct(pct) {
      if (pct === null) return null;
      if (pct >= 90) return 'elite';
      if (pct >= 75) return 'strong';
      if (pct >= 50) return 'solid';
      if (pct >= 25) return 'competitive';
      return 'developing';
    }

    // Assign percentiles + tiers
    for (const a of athletes) {
      if (a.medball !== null && groupedMB[a.group]) {
        a.mbPctGroup = percentileOf(a.medball, groupedMB[a.group]);
        a.mbTier = tierFromPct(a.mbPctGroup);
      } else {
        a.mbPctGroup = null;
        a.mbTier = null;
      }

      // Also compute team-wide percentile
      const allMB = athletes.filter(x => x.medball !== null).map(x => x.medball).sort((a, b) => a - b);
      if (a.medball !== null) {
        a.mbPctTeam = percentileOf(a.medball, allMB);
      } else {
        a.mbPctTeam = null;
      }
    }

    // ---- Compute group standards (percentile bands) ----
    function pctValue(sortedArr, p) {
      if (!sortedArr || sortedArr.length === 0) return null;
      const idx = (p / 100) * (sortedArr.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return sortedArr[lo];
      return +(sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo)).toFixed(1);
    }

    const groupStandards = {};
    for (const g in groupedMB) {
      const arr = groupedMB[g];
      groupStandards[g] = {
        n: arr.length,
        p10: pctValue(arr, 10),
        p25: pctValue(arr, 25),
        p50: pctValue(arr, 50),
        p75: pctValue(arr, 75),
        p90: pctValue(arr, 90),
        min: arr[0],
        max: arr[arr.length - 1],
      };
    }

    // ---- Metric stats ----
    const metricStats = raw.metric_stats || {};
    const mbMean = num(metricStats.medball_in?.mean);
    const mbSD   = num(metricStats.medball_in?.sd);
    const mbN    = num(metricStats.medball_in?.n);

    return {
      exportDate: raw.meta?.export_date || 'N/A',
      notes: raw.meta?.notes || [],
      athletes,
      positions: [...positions].sort(),
      groupStandards,
      stats: { mbMean, mbSD, mbN },
      groupedMB
    };
  }

  /* ---------- Fetch + expose ---------- */
  fetch('data/athletes.json')
    .then(r => { if (!r.ok) throw new Error('Failed to load data'); return r.json(); })
    .then(raw => {
      window.CLUB = processData(raw);
      document.dispatchEvent(new Event('club-data-ready'));
    })
    .catch(err => {
      console.error('Data load error:', err);
      document.body.innerHTML = '<div style="padding:3rem;text-align:center;color:#ef4444;"><h2>Error loading data</h2><p>' + err.message + '</p></div>';
    });
})();
