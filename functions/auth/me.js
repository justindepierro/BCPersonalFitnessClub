import { authJson, getSessionFromRequest } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const user = await getSessionFromRequest(context.request, context.env);
  if (!user) {
    return authJson({ authenticated: false }, { status: 401 });
  }

  return authJson({
    authenticated: true,
    user,
  });
}
