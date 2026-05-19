import {
  authJson,
  getSessionFromRequest,
  isAuthRoute,
  renderLoginPage,
  withSecurityHeaders,
} from "./_lib/auth.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (isAuthRoute(url.pathname) || url.pathname.startsWith("/cdn-cgi/")) {
    return withSecurityHeaders(await context.next());
  }

  const session = await getSessionFromRequest(context.request, context.env);
  if (session) {
    return withSecurityHeaders(await context.next());
  }

  const acceptsHtml = (context.request.headers.get("Accept") || "").includes("text/html");
  if (context.request.method === "GET" && acceptsHtml) {
    return renderLoginPage({ next: `${url.pathname}${url.search}` });
  }

  return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
}
