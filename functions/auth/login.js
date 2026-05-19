import {
  authJson,
  createSessionCookie,
  loginFailure,
  parseLoginBody,
  renderLoginPage,
  verifyCredentials,
} from "../_lib/auth.js";

function wantsJson(request) {
  return (
    request.headers.get("X-LC-Auth-Mode") === "json" ||
    (request.headers.get("Accept") || "").includes("application/json")
  );
}

function safeRedirectTarget(value) {
  const target = String(value || "/");
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return renderLoginPage({ next: safeRedirectTarget(url.searchParams.get("next")) });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await parseLoginBody(context.request);
  } catch (_err) {
    return loginFailure(context.request, "Could not read login form.", 400);
  }

  const user = await verifyCredentials(body.username, body.password, context.env);
  if (!user) {
    return loginFailure(context.request, "Invalid login or password.", 401);
  }

  const cookie = await createSessionCookie(user, context.env);
  if (wantsJson(context.request)) {
    return authJson(
      { ok: true, user },
      {
        headers: { "Set-Cookie": cookie },
      },
    );
  }

  const url = new URL(context.request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeRedirectTarget(url.searchParams.get("next")),
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}
