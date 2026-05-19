import { authJson, clearSessionCookie } from "../_lib/auth.js";

function wantsJson(request) {
  return (
    request.headers.get("X-LC-Auth-Mode") === "json" ||
    (request.headers.get("Accept") || "").includes("application/json")
  );
}

function logoutResponse(request) {
  const cookie = clearSessionCookie();
  if (wantsJson(request)) {
    return authJson(
      { ok: true },
      {
        headers: { "Set-Cookie": cookie },
      },
    );
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}

export function onRequestGet(context) {
  return logoutResponse(context.request);
}

export function onRequestPost(context) {
  return logoutResponse(context.request);
}
