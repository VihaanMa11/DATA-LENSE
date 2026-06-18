export const ACCESS_COOKIE = "dl_access_token";
export const REFRESH_COOKIE = "dl_refresh_token";
export const AUTHORIZED_EMAIL = String(process.env.AUTHORIZED_EMAIL || "testw065@gmail.com").trim().toLowerCase();

export function isAuthorizedEmail(email) {
  return String(email || "").trim().toLowerCase() === AUTHORIZED_EMAIL;
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
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => sessionCookie(name, "", { secure, maxAge: 0 }));
}

export function createRequireAuth({ getUser, secure = false }) {
  return async function requireAuth(request, response, next) {
    const accessToken = parseCookies(request.headers.cookie)[ACCESS_COOKIE];
    if (!accessToken) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }
    try {
      const user = await getUser(accessToken);
      if (!isAuthorizedEmail(user?.email)) {
        response.setHeader("Set-Cookie", clearSessionCookies({ secure }));
        response.status(401).json({ error: "This account is not authorized for this dashboard." });
        return;
      }
      request.authUser = user;
      next();
    } catch {
      response.setHeader("Set-Cookie", clearSessionCookies({ secure }));
      response.status(401).json({ error: "Authentication required." });
    }
  };
}
