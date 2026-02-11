/* ===================================================
   data.js — Load + process the workbook JSON export
   Computes all derived metrics matching the Excel workbook:
   • Derived Sprint (velocity, acceleration, force, impulse, momentum, power)
   • Derived Strength & Power (Sayers peak power, relative strength, utilisation)
   • Z-scores across all key metrics
   • Percentile rankings and tier assignments (Scorecard)
   • Group standards / benchmarks
   =================================================== */

(function () {
  "use strict";

  /* ---------- Constants (mirrored from workbook Constants sheet) ---------- */
  const C = {
    LB_TO_KG: 0.45359237,
    IN_TO_CM: 2.54,
    TEN_YD_M: 9.144,
    TWENTY_YD_M: 18.288,
    G: 9.81,
    SAYERS_A: 60.7,
    SAYERS_B: 45.3,
    SAYERS_C: -2055,
    MS_TO_MPH: 2.23694,
  };

  /* ---------- helpers ---------- */
  function num(v) {
    if (v === null || v === undefined || v === "" || v === "N/A") return null;
    if (typeof v === "string" && v.startsWith("=")) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function txt(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.startsWith("=")) return null;
    return String(v).trim() || null;
  }

  /* Sport → position → group mapping */
  const SPORT_POSITIONS = {
    Football: {
      positions: ["RB", "WR", "DB", "QB", "TE", "LB", "OL", "DL"],
      groups: {
        Skill: ["RB", "WR", "DB"],
        "Big Skill": ["QB", "TE", "LB"],
        Linemen: ["OL", "DL"],
      },
    },
    Soccer: {
      positions: ["GK", "MF", "ATK", "DEF"],
      groups: {
        Speed: ["ATK", "MF"],
        Physical: ["DEF", "GK"],
      },
    },
    Baseball: {
      positions: ["IF", "OF", "P", "C"],
      groups: {
        "Position Player": ["IF", "OF"],
        Battery: ["P", "C"],
      },
    },
    Basketball: {
      positions: ["Guard", "Big"],
      groups: {
        Guard: ["Guard"],
        Big: ["Big"],
      },
    },
  };

  function posGroup(pos, sport) {
    if (!pos) return "Other";
    const p = pos.toUpperCase();
    const sp = SPORT_POSITIONS[sport || "Football"];
    if (!sp) return "Other";
    for (const g in sp.groups) {
      if (sp.groups[g].map((x) => x.toUpperCase()).includes(p)) return g;
    }
    return "Other";
  }

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function rd(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    return +v.toFixed(d);
  }

  /* ---------- Statistical helpers ---------- */
  function mean(arr) {
    const vals = arr.filter((v) => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  function stddev(arr) {
    const vals = arr.filter((v) => v !== null && v !== undefined);
    if (vals.length < 2) return null;
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
  }

  function percentileOf(val, sortedArr) {
    if (val === null || !sortedArr || sortedArr.length === 0) return null;
    if (sortedArr.length === 1) return 50; // single data point — no meaningful rank
    let below = 0,
      equal = 0;
    for (const v of sortedArr) {
      if (v < val) below++;
      else if (v === val) equal++;
    }
    // Mid-rank scaled to [0, 100]: lowest = 0, highest = 100, ties share midpoint
    const rank = below + (equal - 1) / 2;
    return Math.round((rank / (sortedArr.length - 1)) * 100);
  }

  function pctValue(sortedArr, p) {
    if (!sortedArr || sortedArr.length === 0) return null;
    const idx = (p / 100) * (sortedArr.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedArr[lo];
    return +(
      sortedArr[lo] +
      (sortedArr[hi] - sortedArr[lo]) * (idx - lo)
    ).toFixed(1);
  }

  function tierFromPct(pct) {
    if (pct === null) return null;
    if (pct >= 90) return "elite";
    if (pct >= 75) return "strong";
    if (pct >= 50) return "solid";
    if (pct >= 25) return "competitive";
    return "developing";
  }

  /* ---------- HS Performance Standards (absolute thresholds) ---------- */
  /* Based on NSCA HS norms, state combine data, and published S&C literature.
     Each array = [Elite, Excellent, Good, Average] thresholds.
     Values at/above threshold earn that tier (at/below for inverted metrics like 40yd).
     Nested by Sport → Position Group. */
  const HS_STANDARDS = {
    _tiers: ["elite", "excellent", "good", "average", "below"],
    _labels: ["Elite", "Excellent", "Good", "Average", "Below Avg"],
    _scores: { elite: 5, excellent: 4, good: 3, average: 2, below: 1 },
    _meta: [
      { key: "forty", label: "40-Yard Dash", unit: "s", invert: true },
      { key: "bench", label: "Bench 1RM", unit: "lb" },
      { key: "squat", label: "Squat 1RM", unit: "lb" },
      { key: "vert", label: "Vertical Jump", unit: "in" },
      { key: "broad", label: "Broad Jump", unit: "in" },
      { key: "medball", label: "Med Ball Throw", unit: "in" },
      { key: "relBench", label: "Relative Bench", unit: "xBW" },
      { key: "relSquat", label: "Relative Squat", unit: "xBW" },
      { key: "mbRel", label: "MB Relative", unit: "in/lb" },
      { key: "vMax", label: "Max Velocity", unit: "m/s" },
      { key: "v10Max", label: "Best 10yd Vel", unit: "m/s" },
      { key: "peakPower", label: "Peak Power", unit: "W" },
      { key: "relPeakPower", label: "Rel Peak Power", unit: "W/kg" },
      { key: "F1", label: "Sprint Force", unit: "N" },
      { key: "momMax", label: "Peak Momentum", unit: "kg\u00B7m/s" },
    ],
    /* --- Grade-based age-adjustment factors (grade 6–12) --- */
    _ageFactors: {
      12: 1.0,
      11: 0.93,
      10: 0.87,
      9: 0.8,
      8: 0.72,
      7: 0.65,
      6: 0.58,
    },
    /* ===== Football ===== */
    Football: {
      Skill: {
        forty: [4.75, 4.95, 5.15, 5.35],
        bench: [205, 175, 145, 115],
        squat: [335, 285, 235, 185],
        vert: [33, 29, 25, 21],
        broad: [106, 98, 90, 82],
        medball: [185, 165, 148, 130],
        relBench: [1.3, 1.1, 0.9, 0.7],
        relSquat: [1.9, 1.65, 1.4, 1.15],
        mbRel: [1.1, 0.95, 0.8, 0.65],
        vMax: [9.0, 8.5, 8.0, 7.5],
        v10Max: [9.0, 8.5, 8.0, 7.5],
        peakPower: [5200, 4600, 4000, 3500],
        relPeakPower: [70, 62, 55, 48],
        F1: [120, 100, 85, 70],
        momMax: [680, 600, 520, 440],
      },
      "Big Skill": {
        forty: [4.95, 5.15, 5.35, 5.6],
        bench: [255, 215, 175, 140],
        squat: [350, 300, 250, 200],
        vert: [31, 27, 23, 19],
        broad: [103, 95, 87, 79],
        medball: [200, 178, 158, 138],
        relBench: [1.4, 1.2, 1.0, 0.8],
        relSquat: [1.85, 1.6, 1.35, 1.1],
        mbRel: [1.05, 0.9, 0.78, 0.65],
        vMax: [8.8, 8.3, 7.8, 7.3],
        v10Max: [8.8, 8.3, 7.8, 7.3],
        peakPower: [5800, 5100, 4400, 3800],
        relPeakPower: [68, 60, 53, 46],
        F1: [130, 110, 92, 75],
        momMax: [770, 680, 590, 500],
      },
      Linemen: {
        forty: [5.25, 5.5, 5.75, 6.0],
        bench: [290, 250, 210, 170],
        squat: [375, 325, 275, 225],
        vert: [29, 25, 21, 17],
        broad: [98, 90, 82, 74],
        medball: [210, 188, 168, 148],
        relBench: [1.35, 1.15, 0.95, 0.75],
        relSquat: [1.7, 1.45, 1.25, 1.05],
        mbRel: [0.95, 0.82, 0.72, 0.6],
        vMax: [8.4, 7.9, 7.4, 6.9],
        v10Max: [8.4, 7.9, 7.4, 6.9],
        peakPower: [6300, 5500, 4800, 4100],
        relPeakPower: [58, 52, 46, 40],
        F1: [140, 120, 100, 82],
        momMax: [880, 780, 680, 580],
      },
    },
    /* ===== Soccer ===== */
    Soccer: {
      Speed: {
        forty: [4.85, 5.05, 5.25, 5.45],
        bench: [155, 135, 115, 95],
        squat: [275, 235, 200, 165],
        vert: [30, 26, 22, 18],
        broad: [102, 94, 86, 78],
        medball: [170, 152, 136, 120],
        relBench: [1.05, 0.9, 0.75, 0.6],
        relSquat: [1.7, 1.45, 1.2, 1.0],
        mbRel: [1.1, 0.95, 0.8, 0.65],
        vMax: [8.9, 8.4, 7.9, 7.4],
        v10Max: [8.9, 8.4, 7.9, 7.4],
        peakPower: [4600, 4050, 3500, 3000],
        relPeakPower: [68, 60, 53, 46],
        F1: [110, 92, 78, 64],
        momMax: [600, 530, 460, 390],
      },
      Physical: {
        forty: [5.0, 5.2, 5.4, 5.65],
        bench: [175, 150, 125, 100],
        squat: [295, 255, 215, 175],
        vert: [28, 24, 20, 16],
        broad: [98, 90, 82, 74],
        medball: [180, 162, 145, 128],
        relBench: [1.1, 0.95, 0.8, 0.65],
        relSquat: [1.65, 1.4, 1.2, 1.0],
        mbRel: [1.0, 0.87, 0.75, 0.62],
        vMax: [8.6, 8.1, 7.6, 7.1],
        v10Max: [8.6, 8.1, 7.6, 7.1],
        peakPower: [5000, 4400, 3800, 3300],
        relPeakPower: [64, 57, 50, 43],
        F1: [118, 100, 84, 68],
        momMax: [660, 580, 500, 420],
      },
    },
    /* ===== Baseball ===== */
    Baseball: {
      "Position Player": {
        forty: [4.85, 5.05, 5.25, 5.45],
        bench: [185, 160, 135, 110],
        squat: [295, 255, 215, 175],
        vert: [30, 26, 22, 18],
        broad: [102, 94, 86, 78],
        medball: [185, 166, 148, 130],
        relBench: [1.15, 1.0, 0.85, 0.7],
        relSquat: [1.75, 1.5, 1.25, 1.05],
        mbRel: [1.1, 0.95, 0.8, 0.65],
        vMax: [8.8, 8.3, 7.8, 7.3],
        v10Max: [8.8, 8.3, 7.8, 7.3],
        peakPower: [4800, 4250, 3700, 3200],
        relPeakPower: [67, 59, 52, 45],
        F1: [112, 95, 80, 65],
        momMax: [620, 545, 470, 400],
      },
      Battery: {
        forty: [5.1, 5.3, 5.5, 5.75],
        bench: [200, 170, 145, 120],
        squat: [310, 268, 225, 185],
        vert: [28, 24, 20, 16],
        broad: [98, 90, 82, 74],
        medball: [195, 175, 155, 138],
        relBench: [1.2, 1.05, 0.88, 0.72],
        relSquat: [1.65, 1.4, 1.2, 1.0],
        mbRel: [1.0, 0.87, 0.75, 0.62],
        vMax: [8.4, 7.9, 7.4, 6.9],
        v10Max: [8.4, 7.9, 7.4, 6.9],
        peakPower: [5200, 4580, 3960, 3400],
        relPeakPower: [62, 55, 48, 42],
        F1: [122, 103, 87, 72],
        momMax: [700, 618, 535, 455],
      },
    },
    /* ===== Basketball ===== */
    Basketball: {
      Guard: {
        forty: [4.7, 4.9, 5.1, 5.3],
        bench: [165, 140, 118, 95],
        squat: [275, 238, 200, 165],
        vert: [34, 30, 26, 22],
        broad: [106, 98, 90, 82],
        medball: [168, 150, 134, 118],
        relBench: [1.1, 0.95, 0.8, 0.65],
        relSquat: [1.7, 1.45, 1.2, 1.0],
        mbRel: [1.1, 0.95, 0.8, 0.65],
        vMax: [9.0, 8.5, 8.0, 7.5],
        v10Max: [9.0, 8.5, 8.0, 7.5],
        peakPower: [4400, 3900, 3400, 2950],
        relPeakPower: [70, 62, 55, 48],
        F1: [108, 90, 76, 62],
        momMax: [580, 510, 440, 375],
      },
      Big: {
        forty: [5.05, 5.25, 5.5, 5.75],
        bench: [215, 185, 155, 125],
        squat: [325, 280, 235, 190],
        vert: [30, 26, 22, 18],
        broad: [100, 92, 84, 76],
        medball: [195, 175, 155, 138],
        relBench: [1.2, 1.05, 0.88, 0.72],
        relSquat: [1.65, 1.4, 1.2, 1.0],
        mbRel: [0.95, 0.82, 0.72, 0.6],
        vMax: [8.5, 8.0, 7.5, 7.0],
        v10Max: [8.5, 8.0, 7.5, 7.0],
        peakPower: [5600, 4950, 4300, 3700],
        relPeakPower: [60, 54, 48, 42],
        F1: [132, 112, 95, 78],
        momMax: [780, 690, 600, 510],
      },
    },
  };

  /* Grade a single value against absolute HS standards.
     sport = "Football"|"Soccer"|"Baseball"|"Basketball"
     grade = 6–12 (null = no adjustment)
     ageAdj = true to apply grade-based scaling */
  function gradeValue(val, metricKey, sport, group, grade, ageAdj) {
    const sportStds = HS_STANDARDS[sport || "Football"];
    if (!sportStds) return null;
    const gs = sportStds[group];
    if (!gs || !gs[metricKey] || val === null || val === undefined) return null;
    let thresholds = gs[metricKey];
    const inverted = HS_STANDARDS._meta.find(
      (m) => m.key === metricKey,
    )?.invert;

    // Apply age-adjustment: scale thresholds down for younger grades
    if (ageAdj && grade !== null && grade !== undefined) {
      const clampedGrade = Math.max(6, Math.min(12, grade));
      const factor = HS_STANDARDS._ageFactors[clampedGrade];
      if (factor !== undefined && factor !== 1.0) {
        thresholds = thresholds.map((t) =>
          inverted ? rd(t / factor, 2) : rd(t * factor, 2),
        );
      }
    }

    for (let i = 0; i < thresholds.length; i++) {
      if (inverted ? val <= thresholds[i] : val >= thresholds[i]) {
        return {
          tier: HS_STANDARDS._tiers[i],
          label: HS_STANDARDS._labels[i],
          score: HS_STANDARDS._scores[HS_STANDARDS._tiers[i]],
        };
      }
    }
    return { tier: "below", label: "Below Avg", score: 1 };
  }

  function overallGradeTier(score) {
    if (score >= 4.5) return "elite";
    if (score >= 3.5) return "excellent";
    if (score >= 2.5) return "good";
    if (score >= 1.5) return "average";
    return "below";
  }

  function overallGradeLabel(score) {
    if (score >= 4.5) return "Elite";
    if (score >= 3.5) return "Excellent";
    if (score >= 2.5) return "Good";
    if (score >= 1.5) return "Average";
    return "Below Avg";
  }

  /* ---------- Process raw JSON ---------- */
  function processData(raw) {
    if (raw.constants) Object.assign(C, raw.constants);

    // Check for age-adjusted standards toggle
    const ageAdj = localStorage.getItem("lc_age_adjusted") === "true";

    const athletes = [];
    const positions = new Set();

    for (const a of raw.athletes) {
      const name = txt(a.name);
      if (!name) continue;

      const pos = txt(a.position);
      const sport = txt(a.sport) || "Football";
      const grade = num(a.grade);
      const trainingAge = grade !== null ? Math.max(0, grade - 8) : null;
      const group = posGroup(pos, sport);
      const wt = num(a.weight_lb);
      const ht = num(a.height_in);
      if (pos) positions.add(pos);

      const s020 = num(a.sprint_020);
      const s2030 = num(a.sprint_2030);
      const s3040 = num(a.sprint_3040);
      const sprintNotes = txt(a.sprint_notes);

      let forty = null;
      if (s020 !== null && s2030 !== null && s3040 !== null) {
        forty = rd(s020 + s2030 + s3040, 2);
      }

      const vert = num(a.vert_in);
      const broad = num(a.broad_in);
      const bench = num(a.bench_1rm);
      const squat = num(a.squat_1rm);
      const medball = num(a.medball_in);

      // Unit conversions
      const massKg = wt !== null ? rd(wt * C.LB_TO_KG, 2) : null;
      const htCm = ht !== null ? rd(ht * C.IN_TO_CM, 1) : null;
      const vertCm = vert !== null ? rd(vert * C.IN_TO_CM, 1) : null;
      const broadCm = broad !== null ? rd(broad * C.IN_TO_CM, 1) : null;
      const benchKg = bench !== null ? rd(bench * C.LB_TO_KG, 1) : null;
      const squatKg = squat !== null ? rd(squat * C.LB_TO_KG, 1) : null;

      // Derived Sprint
      const d1 = C.TWENTY_YD_M;
      const d2 = C.TEN_YD_M;
      const d3 = C.TEN_YD_M;

      const v1 = s020 !== null && s020 > 0 ? rd(d1 / s020, 3) : null;
      const v2 = s2030 !== null && s2030 > 0 ? rd(d2 / s2030, 3) : null;
      const v3 = s3040 !== null && s3040 > 0 ? rd(d3 / s3040, 3) : null;

      const vMax =
        v1 !== null || v2 !== null || v3 !== null
          ? rd(Math.max(...[v1, v2, v3].filter((v) => v !== null)), 3)
          : null;

      // Best 10-yard split velocity (from 20-30 or 30-40 segment)
      const v10Max =
        v2 !== null || v3 !== null
          ? rd(Math.max(...[v2, v3].filter((v) => v !== null)), 3)
          : null;

      // Top speed in MPH (convert vMax from m/s)
      const topMph = vMax !== null ? rd(vMax * C.MS_TO_MPH, 1) : null;

      const a1 =
        v1 !== null && s020 !== null && s020 > 0 ? rd(v1 / s020, 3) : null;
      const a2 =
        v2 !== null && v1 !== null && s2030 !== null && s2030 > 0
          ? rd((v2 - v1) / s2030, 3)
          : null;
      const a3 =
        v3 !== null && v2 !== null && s3040 !== null && s3040 > 0
          ? rd((v3 - v2) / s3040, 3)
          : null;

      const F1 = massKg !== null && a1 !== null ? rd(massKg * a1, 1) : null;
      const F2 = massKg !== null && a2 !== null ? rd(massKg * a2, 1) : null;
      const F3 = massKg !== null && a3 !== null ? rd(massKg * a3, 1) : null;

      const imp1 = F1 !== null && s020 !== null ? rd(F1 * s020, 1) : null;
      const imp2 = F2 !== null && s2030 !== null ? rd(F2 * s2030, 1) : null;
      const imp3 = F3 !== null && s3040 !== null ? rd(F3 * s3040, 1) : null;

      const mom1 = massKg !== null && v1 !== null ? rd(massKg * v1, 1) : null;
      const mom2 = massKg !== null && v2 !== null ? rd(massKg * v2, 1) : null;
      const mom3 = massKg !== null && v3 !== null ? rd(massKg * v3, 1) : null;

      // Peak momentum at best 10-yd velocity
      const momMax =
        massKg !== null && v10Max !== null ? rd(massKg * v10Max, 1) : null;

      const pow1 = F1 !== null && v1 !== null ? rd(F1 * v1, 1) : null;
      const pow2 = F2 !== null && v2 !== null ? rd(F2 * v2, 1) : null;
      const pow3 = F3 !== null && v3 !== null ? rd(F3 * v3, 1) : null;

      // Derived Strength & Power
      const relBench = bench !== null && wt !== null && wt > 0 ? rd(bench / wt, 2) : null;
      const relSquat = squat !== null && wt !== null && wt > 0 ? rd(squat / wt, 2) : null;
      const mbRel = medball !== null && wt !== null && wt > 0 ? rd(medball / wt, 2) : null;

      const peakPowerRaw =
        vertCm !== null && massKg !== null
          ? C.SAYERS_A * vertCm + C.SAYERS_B * massKg + C.SAYERS_C
          : null;
      // Clamp to 0 — Sayers formula can go negative for very light/young athletes
      const peakPower = peakPowerRaw !== null ? rd(Math.max(0, peakPowerRaw), 0) : null;
      const relPeakPower =
        peakPower !== null && peakPower > 0 && massKg !== null && massKg > 0
          ? rd(peakPower / massKg, 1)
          : null;
      const strengthUtil =
        F1 !== null && squatKg !== null && squatKg > 0
          ? rd(F1 / (squatKg * C.G), 3)
          : null;

      athletes.push({
        id: a.id,
        name,
        initials: initials(name),
        position: pos,
        sport,
        grade,
        trainingAge,
        group,
        height: ht,
        heightCm: htCm,
        weight: wt,
        massKg,
        sprint020: s020,
        sprint2030: s2030,
        sprint3040: s3040,
        sprintNotes,
        forty,
        vert,
        vertCm,
        broad,
        broadCm,
        bench,
        benchKg,
        squat,
        squatKg,
        medball,
        v1,
        v2,
        v3,
        vMax,
        v10Max,
        topMph,
        a1,
        a2,
        a3,
        F1,
        F2,
        F3,
        imp1,
        imp2,
        imp3,
        mom1,
        mom2,
        mom3,
        momMax,
        pow1,
        pow2,
        pow3,
        relBench,
        relSquat,
        mbRel,
        peakPower,
        relPeakPower,
        strengthUtil,
        // placeholders
        zMB: null,
        zBench: null,
        zSquat: null,
        zVert: null,
        zBroad: null,
        zForty: null,
        zF1: null,
        zVMax: null,
        zPeakPower: null,
        zRelBench: null,
        zRelSquat: null,
        zMBRel: null,
        mbPctTeam: null,
        mbPctGroup: null,
        mbTier: null,
        explosiveUpper: null,
        totalExplosive: null,
        scorecard: {},
      });
    }

    // Z-scores
    const zMetrics = [
      { key: "medball", zKey: "zMB" },
      { key: "bench", zKey: "zBench" },
      { key: "squat", zKey: "zSquat" },
      { key: "vert", zKey: "zVert" },
      { key: "broad", zKey: "zBroad" },
      { key: "forty", zKey: "zForty", invert: true },
      { key: "F1", zKey: "zF1" },
      { key: "vMax", zKey: "zVMax" },
      { key: "peakPower", zKey: "zPeakPower" },
      { key: "relBench", zKey: "zRelBench" },
      { key: "relSquat", zKey: "zRelSquat" },
      { key: "mbRel", zKey: "zMBRel" },
    ];
    const MIN_Z_SAMPLE = 5; // z-scores need ≥5 data points to be meaningful
    const statsSummary = {};
    for (const m of zMetrics) {
      const vals = athletes.map((a) => a[m.key]).filter((v) => v !== null);
      const mn = mean(vals);
      const sd = stddev(vals);
      const lowN = vals.length < MIN_Z_SAMPLE;
      statsSummary[m.key] = { mean: mn, sd, n: vals.length, lowN };
      for (const a of athletes) {
        if (a[m.key] !== null && mn !== null && sd !== null && sd > 0) {
          let z = (a[m.key] - mn) / sd;
          if (m.invert) z = -z;
          a[m.zKey] = rd(z, 2);
          if (lowN) a[m.zKey + "_lowN"] = true; // flag for UI
        }
      }
    }

    // Composite indices
    for (const a of athletes) {
      if (a.zMBRel !== null && a.zRelBench !== null)
        a.explosiveUpper = rd(0.6 * a.zMBRel + 0.4 * a.zRelBench, 2);
      else if (a.zMBRel !== null) a.explosiveUpper = rd(a.zMBRel, 2);
      else if (a.zRelBench !== null) a.explosiveUpper = rd(a.zRelBench, 2);

      const parts = [],
        weights = [];
      if (a.explosiveUpper !== null) {
        parts.push(a.explosiveUpper * 0.45);
        weights.push(0.45);
      }
      if (a.zPeakPower !== null) {
        parts.push(a.zPeakPower * 0.3);
        weights.push(0.3);
      }
      if (a.zVMax !== null) {
        parts.push(a.zVMax * 0.25);
        weights.push(0.25);
      }
      if (parts.length > 0) {
        a.totalExplosive = rd(
          parts.reduce((s, v) => s + v, 0) / weights.reduce((s, w) => s + w, 0),
          2,
        );
      }
    }

    // Medball percentiles
    const groupedMB = {};
    for (const a of athletes) {
      if (a.medball === null) continue;
      if (!groupedMB[a.group]) groupedMB[a.group] = [];
      groupedMB[a.group].push(a.medball);
    }
    for (const g in groupedMB) groupedMB[g].sort((a, b) => a - b);
    const allMB = athletes
      .filter((a) => a.medball !== null)
      .map((a) => a.medball)
      .sort((a, b) => a - b);

    for (const a of athletes) {
      if (a.medball !== null) {
        a.mbPctTeam = percentileOf(a.medball, allMB);
        a.mbPctGroup = groupedMB[a.group]
          ? percentileOf(a.medball, groupedMB[a.group])
          : null;
        a.mbTier = tierFromPct(a.mbPctTeam);
      }
    }

    // Scorecard
    const scorecardMetrics = [
      { key: "bench", label: "Bench 1RM", unit: "lb" },
      { key: "squat", label: "Squat 1RM", unit: "lb" },
      { key: "relBench", label: "Rel Bench", unit: "xBW" },
      { key: "relSquat", label: "Rel Squat", unit: "xBW" },
      { key: "medball", label: "Med Ball", unit: "in" },
      { key: "mbRel", label: "MB Relative", unit: "in/lb" },
      { key: "vert", label: "Vertical Jump", unit: "in" },
      { key: "broad", label: "Broad Jump", unit: "in" },
      { key: "forty", label: "40 yd Dash", unit: "s", invert: true },
      { key: "vMax", label: "Max Velocity", unit: "m/s" },
      { key: "F1", label: "Sprint Force", unit: "N" },
      { key: "momMax", label: "Peak Momentum", unit: "kg·m/s" },
      { key: "peakPower", label: "Peak Power", unit: "W" },
    ];

    for (const sm of scorecardMetrics) {
      const vals = athletes
        .map((a) => a[sm.key])
        .filter((v) => v !== null)
        .sort((a, b) => a - b);
      for (const a of athletes) {
        if (a[sm.key] !== null) {
          let pct = percentileOf(a[sm.key], vals);
          if (sm.invert) pct = 100 - pct;
          a.scorecard[sm.key] = {
            value: a[sm.key],
            percentile: pct,
            tier: tierFromPct(pct),
          };
        }
      }
    }

    // Absolute grades (HS Performance Standards)
    const gradeableKeys = HS_STANDARDS._meta.map((m) => m.key);
    for (const a of athletes) {
      a.grades = {};
      const scores = [];
      for (const mk of gradeableKeys) {
        if (a[mk] !== null && a[mk] !== undefined) {
          const g = gradeValue(a[mk], mk, a.sport, a.group, a.grade, ageAdj);
          if (g) {
            a.grades[mk] = g;
            scores.push(g.score);
          }
        }
      }
      if (scores.length >= 3) {
        const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
        a.overallGrade = {
          score: rd(avg, 1),
          label: overallGradeLabel(avg),
          tier: overallGradeTier(avg),
          count: scores.length,
        };
      } else {
        a.overallGrade = null;
      }
    }

    // Group standards
    // Collect all active groups dynamically from athletes
    const groupStandards = {};
    const stdMetricKeys = [
      "medball",
      "bench",
      "squat",
      "vert",
      "broad",
      "forty",
    ];
    const allGroups = new Set(athletes.map((a) => a.group));
    for (const grp of allGroups) {
      const ga = athletes.filter((a) => a.group === grp);
      if (ga.length === 0) continue;
      const stds = {};
      for (const mKey of stdMetricKeys) {
        const vals = ga
          .map((a) => a[mKey])
          .filter((v) => v !== null)
          .sort((a, b) => a - b);
        if (vals.length === 0) continue;
        stds[mKey] = {
          n: vals.length,
          min: vals[0],
          max: vals[vals.length - 1],
          p10: pctValue(vals, 10),
          p25: pctValue(vals, 25),
          p50: pctValue(vals, 50),
          p75: pctValue(vals, 75),
          p90: pctValue(vals, 90),
        };
      }
      groupStandards[grp] = stds;
    }

    // Testing Log
    const testingLog = (raw.testing_log || []).map((e) => ({
      date: txt(e.date),
      athleteId: e.athlete_id,
      name: txt(e.name),
      test: txt(e.test),
      sprint020: num(e.split_020),
      sprint2030: num(e.split_2030),
      sprint3040: num(e.split_3040),
      location: txt(e.location),
      vert: num(e.vert),
      broad: num(e.broad),
      bench: num(e.bench),
      squat: num(e.squat),
      medball: num(e.medball),
    }));

    // Data quality warnings
    const warnings = [];
    const countWith = (key) => athletes.filter((a) => a[key] !== null).length;
    if (countWith("vert") < 5)
      warnings.push({
        metric: "Vertical Jump",
        n: countWith("vert"),
        msg: "Vert, Peak Power, and related z-scores are based on very few data points.",
      });
    if (countWith("broad") < 5)
      warnings.push({
        metric: "Broad Jump",
        n: countWith("broad"),
        msg: "Broad jump data is too sparse for reliable percentiles.",
      });
    if (countWith("forty") < 5)
      warnings.push({
        metric: "Sprint / 40-yd",
        n: countWith("forty"),
        msg: "Sprint data is limited — velocity and force metrics should be interpreted cautiously.",
      });
    // Flag suspicious individual values
    const flags = [];
    for (const a of athletes) {
      if (a.bench !== null && a.squat !== null && a.bench > a.squat) {
        flags.push({
          athlete: a.name,
          id: a.id,
          msg:
            "Bench (" + a.bench + ") > Squat (" + a.squat + ") — verify data.",
        });
      }
      if (a.squat !== null && a.weight !== null && a.squat / a.weight < 0.4) {
        flags.push({
          athlete: a.name,
          id: a.id,
          msg:
            "Squat (" +
            a.squat +
            " lb) is very low relative to body weight (" +
            a.weight +
            " lb) — possible data entry error.",
        });
      }
    }

    return {
      exportDate: raw.meta?.export_date || raw.exportDate || "N/A",
      notes: raw.meta?.notes || [],
      constants: C,
      athletes,
      hsStandards: HS_STANDARDS,
      sportPositions: SPORT_POSITIONS,
      ageAdjusted: ageAdj,
      positions: [...positions].sort(),
      groupStandards,
      stats: statsSummary,
      groupedMB,
      testingLog,
      testingWeekPlan: raw.testing_week_plan || [],
      benchmarks: raw.benchmarks || {},
      scorecardMetrics,
      warnings,
      flags,
    };
  }

  /* ---------- Fetch + expose ---------- */
  // Make processData accessible for re-processing after edits
  window._processData = processData;
  window._rawDataCache = null;

  fetch("data/athletes.json")
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load data");
      return r.json();
    })
    .then((raw) => {
      window._rawDataCache = JSON.parse(JSON.stringify(raw)); // deep clone original

      // Apply saved additions from localStorage
      const savedAdded = localStorage.getItem("lc_added");
      if (savedAdded) {
        try {
          const added = JSON.parse(savedAdded);
          for (const a of added) {
            if (!raw.athletes.find((x) => x.id === a.id)) {
              raw.athletes.push(a);
            }
          }
        } catch (e) {
          console.warn("Failed to apply saved additions:", e);
        }
      }

      // Apply saved deletions from localStorage
      const savedDeleted = localStorage.getItem("lc_deleted");
      if (savedDeleted) {
        try {
          const deleted = JSON.parse(savedDeleted);
          raw.athletes = raw.athletes.filter((a) => !deleted.includes(a.id));
        } catch (e) {
          console.warn("Failed to apply saved deletions:", e);
        }
      }

      // Apply any saved edits from localStorage
      const savedEdits = localStorage.getItem("lc_edits");
      if (savedEdits) {
        try {
          const edits = JSON.parse(savedEdits);
          for (const edit of edits) {
            const athlete = raw.athletes.find((a) => a.id === edit.id);
            if (athlete) Object.assign(athlete, edit.changes);
          }
        } catch (e) {
          console.warn("Failed to apply saved edits:", e);
        }
      }

      // Apply latest test date values as current data
      const savedTestH = localStorage.getItem("lc_test_history");
      if (savedTestH) {
        try {
          const testH = JSON.parse(savedTestH);
          const testIds = Object.keys(testH);
          for (let ti = 0; ti < testIds.length; ti++) {
            const tAid = testIds[ti];
            const tEntries = testH[tAid];
            if (!tEntries || tEntries.length === 0) continue;
            let latestDate = tEntries[0].date;
            for (let tj = 1; tj < tEntries.length; tj++) {
              if (tEntries[tj].date > latestDate)
                latestDate = tEntries[tj].date;
            }
            const tAthlete = raw.athletes.find((a) => a.id === tAid);
            if (!tAthlete) continue;
            for (let tk = 0; tk < tEntries.length; tk++) {
              if (tEntries[tk].date !== latestDate) continue;
              const vals = tEntries[tk].values;
              for (const vk in vals) {
                const v = vals[vk];
                if (v === null || v === undefined || v === "") continue;
                // Guard against NaN/Infinity from corrupted localStorage
                if (typeof v === "number" && !isFinite(v)) continue;
                tAthlete[vk] = v;
              }
            }
          }
        } catch (e) {
          console.warn("Failed to apply latest test data:", e);
        }
      }

      window.CLUB = processData(raw);
      document.dispatchEvent(new Event("club-data-ready"));
    })
    .catch((err) => {
      console.error("Data load error:", err);
      const el = document.getElementById("loadingIndicator");
      if (el) {
        const safeMsg = String(err.message).replace(/[<>&"']/g, function (c) {
          return {
            "<": "&lt;",
            ">": "&gt;",
            "&": "&amp;",
            '"': "&quot;",
            "'": "&#39;",
          }[c];
        });
        el.innerHTML =
          '<div style="padding:2rem;text-align:center;color:#ef4444;"><h2>Error loading data</h2><p>' +
          safeMsg +
          "</p></div>";
      }
    });
})();
