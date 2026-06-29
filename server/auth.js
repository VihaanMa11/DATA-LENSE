import crypto from "node:crypto";

// Shared-password gate. No database, no user accounts — one password (DASHBOARD_PASSWORD)
// unlocks the dashboard. A successful login sets an HMAC session cookie that the
// middleware validates statelessly on every /api request.

export const ACCESS_COOKIE = "dl_access_token";

const password = () => String(process.env.DASHBOARD_PASSWORD || "");
const secret = () => String(process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "datalens-dev-secret");

export function authConfigured() {
  return Boolean(password());
}

export function checkPassword(input) {
  const expected = password();
  if (!expected) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Deterministic session token derived from the secret — same value every time,
// so the middleware can verify it without storing any session state.
export function expectedToken() {
  return crypto.createHmac("sha256", secret()).update("datalens-session-v1").digest("hex");
}

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function sessionCookie(name, value, { secure = false, maxAge } = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(String(value || ""))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (Number.isFinite(maxAge)) attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookies({ secure = false } = {}) {
  return [sessionCookie(ACCESS_COOKIE, "", { secure, maxAge: 0 })];
}

export function createRequireAuth({ secure = false } = {}) {
  return function requireAuth(request, response, next) {
    const token = parseCookies(request.headers.cookie)[ACCESS_COOKIE];
    if (token && token === expectedToken()) {
      next();
      return;
    }
    response.setHeader("Set-Cookie", clearSessionCookies({ secure }));
    response.status(401).json({ error: "Authentication required." });
  };
}
