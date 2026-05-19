import { authJson, getSessionFromRequest, withSecurityHeaders } from "../_lib/auth.js";

const DATA_KEY = "lifting-club-athletes-json";
const META_KEY = "lifting-club-athletes-meta";
const MAX_KV_VALUE_BYTES = 24 * 1024 * 1024;

function getStore(env) {
  return env && env.LIFTING_CLUB_KV;
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function hasObjectShape(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateData(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.athletes)) {
    throw new Error("Invalid data: expected a JSON object with an athletes array.");
  }
  if (data.athletes.length === 0) {
    throw new Error("Invalid data: athletes array is empty.");
  }
  const ids = new Set();
  const errors = [];
  for (let i = 0; i < data.athletes.length; i++) {
    const athlete = data.athletes[i];
    const label = "athlete #" + (i + 1);
    if (!hasObjectShape(athlete)) {
      errors.push(label + " is not an object");
      continue;
    }
    const id = cleanText(athlete.id);
    const name = cleanText(athlete.name);
    if (!id) errors.push(label + " is missing an id");
    if (!name) errors.push(label + " is missing a name");
    if (id && ids.has(id)) errors.push("duplicate athlete id " + id);
    if (id) ids.add(id);
  }
  if (data.test_history !== undefined && !hasObjectShape(data.test_history)) {
    errors.push("test_history must be an object");
  }
  if (data.test_notes !== undefined && !hasObjectShape(data.test_notes)) {
    errors.push("test_notes must be an object");
  }
  if (data.weight_log !== undefined && !hasObjectShape(data.weight_log)) {
    errors.push("weight_log must be an object");
  }
  if (errors.length) {
    throw new Error("Invalid data: " + errors.slice(0, 6).join("; "));
  }
}

async function fallbackStaticData(context) {
  if (context.env && context.env.ASSETS && typeof context.env.ASSETS.fetch === "function") {
    const assetUrl = new URL("/data/athletes.json", context.request.url);
    const response = await context.env.ASSETS.fetch(new Request(assetUrl, context.request));
    if (response && response.ok) {
      const next = new Response(response.body, response);
      next.headers.set("Cache-Control", "no-store");
      next.headers.set("X-Data-Source", "static-fallback");
      return withSecurityHeaders(next);
    }
  }

  return authJson(
    { ok: false, error: "No Cloudflare data has been published and the static fallback is unavailable." },
    { status: 503 },
  );
}

export async function onRequestGet(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session) {
    return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const store = getStore(context.env);
  if (!store) {
    return fallbackStaticData(context);
  }

  const json = await store.get(DATA_KEY);
  if (!json) {
    return fallbackStaticData(context);
  }

  return authJson(JSON.parse(json), {
    headers: {
      "X-Data-Source": "cloudflare-kv",
    },
  });
}

export async function onRequestPost(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session) {
    return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return authJson({ ok: false, error: "Only admin can publish dashboard data." }, { status: 403 });
  }

  const store = getStore(context.env);
  if (!store) {
    return authJson(
      { ok: false, error: "Cloudflare KV binding LIFTING_CLUB_KV is not configured." },
      { status: 503 },
    );
  }

  let data;
  try {
    data = await context.request.json();
    validateData(data);
  } catch (err) {
    return authJson({ ok: false, error: err.message || "Invalid JSON upload." }, { status: 400 });
  }

  const previousDataVersion =
    typeof data.previousDataVersion === "string" ? data.previousDataVersion : null;
  delete data.previousDataVersion;

  const forcePublish = context.request.headers.get("X-LC-Force-Publish") === "true";
  const existingJson = await store.get(DATA_KEY);
  if (existingJson && !forcePublish) {
    let existingVersion = null;
    try {
      const existingData = JSON.parse(existingJson);
      existingVersion = typeof existingData.dataVersion === "string" ? existingData.dataVersion : null;
    } catch {
      existingVersion = null;
    }
    if (existingVersion && previousDataVersion !== existingVersion) {
      return authJson(
        {
          ok: false,
          error: "Cloud data changed since this browser loaded it. Reload Cloud Data before saving again.",
          currentDataVersion: existingVersion,
        },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  data.dataVersion = now;
  data.exportDate = data.exportDate || now;
  data.source = data.source || "Lifting Club Dashboard";
  if (data.meta && typeof data.meta === "object") data.meta.export_date = now;

  const json = JSON.stringify(data);
  const size = byteLength(json);
  if (size > MAX_KV_VALUE_BYTES) {
    return authJson(
      { ok: false, error: "Data is too large for a single Cloudflare KV item." },
      { status: 413 },
    );
  }

  await store.put(DATA_KEY, json);
  await store.put(
    META_KEY,
    JSON.stringify({
      updatedAt: now,
      updatedBy: session.username,
      athleteCount: data.athletes.length,
      bytes: size,
    }),
  );

  return authJson({
    ok: true,
    dataVersion: now,
    athleteCount: data.athletes.length,
    bytes: size,
  });
}
