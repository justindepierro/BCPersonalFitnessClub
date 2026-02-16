/* ===================================================
   constants.js — Application constants & data objects
   =================================================== */

(function () {
  "use strict";
  const APP = window.APP;

  const ESC_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  const GRADE_TIER_LABELS = {
    elite: "Elite",
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    below: "Below Avg",
  };
  const GRADE_TIER_COLORS = {
    elite: "#a78bfa",
    excellent: "#4ade80",
    good: "#60a5fa",
    average: "#facc15",
    below: "#f87171",
  };
  const GRADE_TIER_ORDER = ["elite", "excellent", "good", "average", "below"];

  /** Map a percentile (0–100) to a grade-system tier for display consistency.
      The canonical percentile tier vocabulary (strong/solid/competitive/developing)
      is used for scorecard tiers; this mapping uses grade tiers (elite/excellent/
      good/average/below) when displaying percentiles alongside grade data
      (e.g. cohort column, profile badge) for uniform badge styling. */
  function pctToGradeTier(pct) {
    if (pct === null || pct === undefined) return "below";
    if (pct >= 90) return "elite";
    if (pct >= 75) return "excellent";
    if (pct >= 50) return "good";
    if (pct >= 25) return "average";
    return "below";
  }

  /* ---------- Test History Metric Keys ---------- */
  const TEST_METRIC_KEYS = [
    { key: "weight", jsonKey: "weight_lb", label: "Weight", unit: "lb" },
    { key: "bench", jsonKey: "bench_1rm", label: "Bench 1RM", unit: "lb" },
    { key: "squat", jsonKey: "squat_1rm", label: "Squat 1RM", unit: "lb" },
    { key: "medball", jsonKey: "medball_in", label: "Med Ball", unit: "in" },
    { key: "vert", jsonKey: "vert_in", label: "Vertical", unit: "in" },
    { key: "broad", jsonKey: "broad_in", label: "Broad Jump", unit: "in" },
    {
      key: "sprint020",
      jsonKey: "sprint_020",
      label: "0-20 yd",
      unit: "s",
      lower: true,
    },
    {
      key: "sprint2030",
      jsonKey: "sprint_2030",
      label: "20-30 yd",
      unit: "s",
      lower: true,
    },
    {
      key: "sprint3040",
      jsonKey: "sprint_3040",
      label: "30-40 yd",
      unit: "s",
      lower: true,
    },
    {
      key: "proAgility",
      jsonKey: "pro_agility",
      label: "5-10-5",
      unit: "s",
      lower: true,
    },
    {
      key: "lDrill",
      jsonKey: "l_drill",
      label: "L-Drill",
      unit: "s",
      lower: true,
    },
    {
      key: "backpedal",
      jsonKey: "backpedal",
      label: "Backpedal",
      unit: "s",
      lower: true,
    },
    {
      key: "wDrill",
      jsonKey: "w_drill",
      label: "W-Drill",
      unit: "s",
      lower: true,
    },
  ];

  /* ---------- Test History helpers ---------- */

  /* Compute team averages, min, max for a set of athlete values */

  /* ---------- Metric Descriptions (for tooltips) ---------- */
  const METRIC_INFO = {
    bench: {
      name: "Bench Press 1RM",
      unit: "lb",
      measures: "Maximum upper-body pressing strength",
      tellsYou:
        "How much force an athlete can produce horizontally through the chest, shoulders, and triceps. Key for blocking and stiff-arms.",
    },
    squat: {
      name: "Back Squat 1RM",
      unit: "lb",
      measures: "Maximum lower-body strength",
      tellsYou:
        "Overall leg drive capacity — foundational for sprinting, jumping, and changing direction.",
    },
    relBench: {
      name: "Relative Bench",
      unit: "xBW",
      measures: "Bench press normalized to body weight",
      tellsYou:
        "Upper-body strength pound-for-pound. A 1.0+ xBW bench is a solid HS benchmark.",
    },
    relSquat: {
      name: "Relative Squat",
      unit: "xBW",
      measures: "Squat normalized to body weight",
      tellsYou:
        "Lower-body strength pound-for-pound. Higher values correlate with faster sprint acceleration.",
    },
    medball: {
      name: "Seated Med Ball Throw",
      unit: "in",
      measures: "Upper-body explosive power (10 lb ball)",
      tellsYou:
        "How quickly an athlete can generate and release upper-body force. Great predictor of hitting/throwing power.",
    },
    mbRel: {
      name: "Med Ball Relative",
      unit: "in/lb",
      measures: "Med ball throw normalized to body weight",
      tellsYou:
        "Explosive power efficiency — lighter athletes with big throws score high here.",
    },
    vert: {
      name: "Vertical Jump",
      unit: "in",
      measures: "Lower-body explosive power (counter-movement)",
      tellsYou:
        "Ability to generate force vertically in a short time. Correlates with acceleration and change of direction.",
    },
    broad: {
      name: "Broad Jump",
      unit: "in",
      measures: "Horizontal explosive power",
      tellsYou:
        "Combines leg strength and coordination for horizontal displacement. Good general athleticism indicator.",
    },
    forty: {
      name: "40-Yard Dash",
      unit: "s",
      measures: "Linear sprint speed over 40 yards",
      tellsYou:
        "Overall speed. Lower is better. Combines acceleration (0-20) and top-end speed (20-40).",
    },
    vMax: {
      name: "Max Velocity",
      unit: "m/s",
      measures: "Highest velocity achieved across all splits",
      tellsYou:
        "The athlete's top speed. Important for breakaway plays and closing speed on defense.",
    },
    v10Max: {
      name: "Best 10-yd Velocity",
      unit: "m/s",
      measures: "Highest velocity from a 10-yard segment (20-30 or 30-40)",
      tellsYou:
        "Top-end speed over a pure 10-yard window, without the acceleration bias of the first 20 yards.",
    },
    v1: {
      name: "Velocity 0–20 yd",
      unit: "m/s",
      measures: "Average velocity over first 20 yards",
      tellsYou:
        "Acceleration-phase speed. Includes reaction time and first-step quickness.",
    },
    v2: {
      name: "Velocity 20–30 yd",
      unit: "m/s",
      measures: "Average velocity during transition phase",
      tellsYou:
        "Speed as the athlete transitions from acceleration to top speed.",
    },
    v3: {
      name: "Velocity 30–40 yd",
      unit: "m/s",
      measures: "Average velocity during top-speed phase",
      tellsYou:
        "Ability to maintain or increase speed — flags speed endurance issues if slower than 20-30 split.",
    },
    proAgility: {
      name: "5-10-5 Pro Agility",
      unit: "s",
      measures: "Lateral quickness and change-of-direction speed",
      tellsYou:
        "How quickly an athlete can decelerate, redirect, and re-accelerate laterally. Key for skill-position players.",
    },
    lDrill: {
      name: "L-Drill (3-Cone)",
      unit: "s",
      measures: "Multi-directional agility and body control",
      tellsYou:
        "Tests short-area quickness through 90° and 180° cuts. Correlates with ability to navigate traffic.",
    },
    backpedal: {
      name: "Backpedal (10+10)",
      unit: "s",
      measures: "10-yd backpedal + 10-yd forward sprint",
      tellsYou:
        "Ability to retreat and transition to forward speed. Critical for DBs, LBs, and any zone-coverage athlete.",
    },
    wDrill: {
      name: "W-Drill (5-Cone)",
      unit: "s",
      measures: "Open-hip agility and footwork through weaving pattern",
      tellsYou:
        "Tests fluid hip transitions and change of direction at multiple angles. Designed for DBs and coverage players.",
    },
    a1: {
      name: "Acceleration (0–20)",
      unit: "m/s\u00B2",
      measures: "Rate of velocity change from standstill",
      tellsYou:
        "How quickly the athlete gets up to speed. Critical first-step quickness metric.",
    },
    a2: {
      name: "Acceleration (20–30)",
      unit: "m/s\u00B2",
      measures: "Rate of velocity change in transition",
      tellsYou: "Continued acceleration ability. Positive = still speeding up.",
    },
    a3: {
      name: "Acceleration (30–40)",
      unit: "m/s\u00B2",
      measures: "Rate of velocity change at top speed",
      tellsYou:
        "Often near zero or negative. Negative means decelerating — flags speed endurance issues.",
    },
    F1: {
      name: "Sprint Force (0–20)",
      unit: "N",
      measures:
        "Average horizontal force during acceleration (mass \u00D7 acceleration)",
      tellsYou:
        "How much force the athlete applies to the ground during the drive phase. Bigger + faster athletes produce more.",
    },
    F2: {
      name: "Sprint Force (20–30)",
      unit: "N",
      measures: "Average horizontal force in transition",
      tellsYou:
        "Force production during the transition phase. Should be lower than F1 as acceleration decreases.",
    },
    F3: {
      name: "Sprint Force (30–40)",
      unit: "N",
      measures: "Average horizontal force at top speed",
      tellsYou:
        "May be negative if decelerating. Low or negative values flag mechanics or endurance issues.",
    },
    imp1: {
      name: "Impulse (0–20)",
      unit: "N\u00B7s",
      measures: "Force \u00D7 time during acceleration phase",
      tellsYou:
        "Total force applied over time. Higher impulse = more momentum built up during acceleration.",
    },
    mom1: {
      name: "Momentum (0–20)",
      unit: "kg\u00B7m/s",
      measures: "Mass \u00D7 velocity at end of 0-20 yd",
      tellsYou:
        "How hard the athlete is to stop at various points. Heavier + faster = more momentum.",
    },
    mom3: {
      name: "Momentum (30–40)",
      unit: "kg\u00B7m/s",
      measures: "Mass \u00D7 velocity at end of sprint",
      tellsYou:
        'Peak momentum at the end of the sprint — the "freight train" factor.',
    },
    momMax: {
      name: "Peak Momentum (best 10yd)",
      unit: "kg\u00B7m/s",
      measures: "Mass \u00D7 best 10-yard split velocity",
      tellsYou:
        'How much momentum the athlete carries at their top 10-yd speed. The "how hard are you to tackle" number. Higher = more force needed to stop them.',
    },
    pow1: {
      name: "Sprint Power (0–20)",
      unit: "W",
      measures: "Force \u00D7 velocity during acceleration",
      tellsYou:
        "Mechanical power output during the drive phase. Combines strength and speed.",
    },
    pow2: {
      name: "Sprint Power (20–30)",
      unit: "W",
      measures: "Force \u00D7 velocity in transition",
      tellsYou: "Power output during transition phase.",
    },
    pow3: {
      name: "Sprint Power (30–40)",
      unit: "W",
      measures: "Force \u00D7 velocity at top speed",
      tellsYou: "Power output at top speed. May drop if decelerating.",
    },
    peakPower: {
      name: "Sayers Peak Power",
      unit: "W",
      measures: "Estimated peak power from vertical jump and body mass",
      tellsYou:
        "Total lower-body power output. Validated formula (Sayers et al.) used in NFL Combine and college S&C.",
    },
    relPeakPower: {
      name: "Relative Peak Power",
      unit: "W/kg",
      measures: "Peak power divided by body mass",
      tellsYou:
        "Power-to-weight ratio. Higher values mean more explosive per pound — important for speed positions.",
    },
    strengthUtil: {
      name: "Strength Utilisation",
      unit: "",
      measures:
        "Sprint force \u00F7 (squat force), i.e. F1 / (squat_kg \u00D7 g)",
      tellsYou:
        "What percentage of max strength is used during sprinting. Low values mean the athlete is strong but isn't applying it to running.",
    },
    zMB: {
      name: "MB Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou:
        "How far above or below the team average. Positive = above average, negative = below.",
    },
    zBench: {
      name: "Bench Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou:
        "Bench press ranking relative to the team. +1.0 = one standard deviation above average.",
    },
    zSquat: {
      name: "Squat Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Squat ranking relative to the team.",
    },
    zVert: {
      name: "Vert Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Vertical jump ranking relative to the team.",
    },
    zForty: {
      name: "40-yd Z-Score",
      unit: "",
      measures:
        "Standard deviations from team mean (inverted — higher = faster)",
      tellsYou:
        "Speed ranking relative to the team. Positive = faster than average.",
    },
    zF1: {
      name: "Sprint Force Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Sprint force ranking relative to the team.",
    },
    zPeakPower: {
      name: "Peak Power Z-Score",
      unit: "",
      measures: "Standard deviations from team mean",
      tellsYou: "Peak power ranking relative to the team.",
    },
    explosiveUpper: {
      name: "Explosive Upper Index",
      unit: "",
      measures: "0.6 \u00D7 z(MB_rel) + 0.4 \u00D7 z(Rel Bench)",
      tellsYou:
        "Composite score combining upper-body explosive power and strength. Higher = more explosive upper body.",
    },
    totalExplosive: {
      name: "Total Explosive Index",
      unit: "",
      measures:
        "0.45 \u00D7 ExpUpper + 0.30 \u00D7 z(PP) + 0.25 \u00D7 z(vMax)",
      tellsYou:
        "Overall explosiveness score combining upper-body power, lower-body power, and speed.",
    },
    height: {
      name: "Height",
      unit: "in",
      measures: "Standing height",
      tellsYou: "Affects leverage, reach, and position suitability.",
    },
    weight: {
      name: "Body Weight",
      unit: "lb",
      measures: "Body mass",
      tellsYou: "Affects force production, momentum, and position suitability.",
    },
    massKg: {
      name: "Mass",
      unit: "kg",
      measures: "Body mass in metric",
      tellsYou: "Used in physics calculations (force, momentum, power).",
    },
    sprint020: {
      name: "0–20 yd Split",
      unit: "s",
      measures: "Time for first 20 yards from standstill",
      tellsYou:
        "Acceleration ability. Includes reaction/start. Lower is better.",
    },
    sprint2030: {
      name: "20–30 yd Split",
      unit: "s",
      measures: "Time for 10 yards during transition",
      tellsYou: "Transition from acceleration to top speed. Lower is better.",
    },
    sprint3040: {
      name: "30–40 yd Split",
      unit: "s",
      measures: "Time for final 10 yards",
      tellsYou:
        "Top-end speed maintenance. If slower than 20-30 split, athlete is decelerating.",
    },
  };

  Object.assign(APP, {
    ESC_MAP, GRADE_TIER_LABELS, GRADE_TIER_COLORS, GRADE_TIER_ORDER,
    TEST_METRIC_KEYS, METRIC_INFO, pctToGradeTier,
  });
})();
