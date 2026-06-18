export function authErrorMessage(status, payload = {}) {
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  return status === 401 ? "Authentication required." : "Authentication is temporarily unavailable.";
}

export function isUnauthorizedResponse(response) {
  return response?.status === 401;
}

async function authRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(authErrorMessage(response.status, payload));
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getSession() {
  return authRequest("/api/auth/session");
}

export function login(email, password) {
  return authRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return authRequest("/api/auth/logout", { method: "POST" });
}
