const SESSION_COOKIE = "lc_auth";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const DEFAULT_PASSWORD_HASHES = {
  admin: "8e1f104f4d9c1bcb7ba68b95411832868306a703e8952efb6d475fabacbd0ea8",
  athlete: "47ea6815a35aaed8833db0fcf727421de1ff2ecff94ec936dd3c565136a740d4",
};

const DEFAULT_SESSION_SECRET = "lifting-club-change-this-session-secret";

const USERS = {
  admin: {
    role: "admin",
    label: "Admin",
    hashEnv: "AUTH_ADMIN_PASSWORD_SHA256",
    defaultHash: DEFAULT_PASSWORD_HASHES.admin,
  },
  athlete: {
    role: "athlete",
    label: "Athlete",
    hashEnv: "AUTH_ATHLETE_PASSWORD_SHA256",
    defaultHash: DEFAULT_PASSWORD_HASHES.athlete,
  },
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function textEncoder() {
  return new TextEncoder();
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncodeJson(value) {
  return bytesToBase64Url(textEncoder().encode(JSON.stringify(value)));
}

function base64UrlDecodeJson(value) {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right) return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= left.charCodeAt(i % left.length) ^ right.charCodeAt(i % right.length);
  }
  return diff === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder().encode(value));
  return bytesToHex(digest);
}

async function getSigningKey(env) {
  const secret = String((env && env.AUTH_SESSION_SECRET) || DEFAULT_SESSION_SECRET);
  return crypto.subtle.importKey(
    "raw",
    textEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload, env) {
  const key = await getSigningKey(env);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder().encode(payload));
  return bytesToBase64Url(signature);
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return (
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}

function wantsJson(request) {
  return (
    request.headers.get("X-LC-Auth-Mode") === "json" ||
    (request.headers.get("Accept") || "").includes("application/json")
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isAuthRoute(pathname) {
  return pathname === "/auth/login" || pathname === "/auth/logout" || pathname === "/auth/me";
}

export function authJson(data, init = {}) {
  return withSecurityHeaders(
    new Response(JSON.stringify(data), {
      ...init,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(init.headers || {}),
      },
    }),
  );
}

export function withSecurityHeaders(response, extraHeaders = {}) {
  const next = new Response(response.body, response);
  Object.entries({ ...SECURITY_HEADERS, ...extraHeaders }).forEach(([key, value]) => {
    if (!next.headers.has(key)) next.headers.set(key, value);
  });
  return next;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function verifyCredentials(username, password, env) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  const user = USERS[cleanUsername];
  if (!user) return null;

  const expectedHash = String((env && env[user.hashEnv]) || user.defaultHash).trim().toLowerCase();
  const actualHash = await sha256Hex(`${cleanUsername}:${String(password || "")}`);
  if (!timingSafeEqual(actualHash, expectedHash)) return null;

  return {
    username: cleanUsername,
    role: user.role,
    label: user.label,
  };
}

export async function createSessionCookie(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncodeJson({
    username: user.username,
    role: user.role,
    label: user.label,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
  const signature = await signPayload(payload, env);
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export async function getSessionFromRequest(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    const expectedSignature = await signPayload(payload, env);
    if (!timingSafeEqual(signature, expectedSignature)) return null;

    const session = base64UrlDecodeJson(payload);
    if (!session || !USERS[session.username] || USERS[session.username].role !== session.role) {
      return null;
    }
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;

    return {
      username: session.username,
      role: session.role,
      label: session.label || USERS[session.username].label,
      loginAt: session.iat ? new Date(session.iat * 1000).toISOString() : "",
      expiresAt: new Date(session.exp * 1000).toISOString(),
    };
  } catch (_err) {
    return null;
  }
}

export function renderLoginPage(opts = {}) {
  const message = opts.message || "";
  const nextPath = opts.next || "/";
  const escapedMessage = escapeHtml(message);
  const encodedNext = encodeURIComponent(nextPath);

  return withSecurityHeaders(
    new Response(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lifting Club Login</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e4e6ed;
    }
    form {
      width: min(100%, 390px);
      display: grid;
      gap: 14px;
      padding: 28px;
      border-radius: 10px;
      background: #1a1d27;
      border: 1px solid #2e3345;
      box-shadow: 0 24px 70px rgba(0,0,0,.28);
    }
    .brand {
      color: #6c63ff;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 { margin: 0; font-size: 28px; line-height: 1.1; }
    p { margin: -4px 0 4px; color: #9ba0b2; font-size: 14px; line-height: 1.5; }
    label { display: grid; gap: 6px; color: #c8ccd8; font-size: 13px; font-weight: 700; }
    select,
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #2e3345;
      border-radius: 8px;
      font: inherit;
      color: #e4e6ed;
      background: #242836;
    }
    select:focus,
    input:focus { outline: none; border-color: #6c63ff; box-shadow: 0 0 0 3px rgba(108,99,255,.18); }
    button {
      min-height: 44px;
      border: 0;
      border-radius: 8px;
      background: #6c63ff;
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    .error { min-height: 20px; color: #f87171; font-size: 13px; font-weight: 800; }
  </style>
</head>
<body>
  <form method="post" action="/auth/login?next=${encodedNext}" autocomplete="off">
    <div class="brand">Lifting Club</div>
    <h1>Team Login</h1>
    <p>Sign in as admin to upload and edit data, or as athlete for read-only access.</p>
    <label>Login
      <select name="username" autocomplete="username" required autofocus>
        <option value="athlete">Athlete</option>
        <option value="admin">Admin</option>
      </select>
    </label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
    <div class="error">${escapedMessage}</div>
    <button type="submit">Log In</button>
  </form>
</body>
</html>`,
      {
        status: opts.status || 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    ),
  );
}

export async function parseLoginBody(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return request.json();
  }
  const form = await request.formData();
  return {
    username: form.get("username"),
    password: form.get("password"),
  };
}

export function loginFailure(request, message, status = 401) {
  if (wantsJson(request)) {
    return authJson({ ok: false, error: message }, { status });
  }
  return renderLoginPage({ message, status });
}
