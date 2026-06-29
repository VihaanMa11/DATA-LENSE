import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_COOKIE,
  authConfigured,
  checkPassword,
  clearSessionCookies,
  createRequireAuth,
  expectedToken,
  parseCookies,
  sessionCookie,
} from "../server/auth.js";

process.env.DASHBOARD_PASSWORD = "secret-pass";
process.env.SESSION_SECRET = "test-secret";

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("authConfigured reflects whether DASHBOARD_PASSWORD is set", () => {
  assert.equal(authConfigured(), true);
});

test("checkPassword accepts the exact password and rejects everything else", () => {
  assert.equal(checkPassword("secret-pass"), true);
  assert.equal(checkPassword("wrong"), false);
  assert.equal(checkPassword(""), false);
});

test("expectedToken is deterministic and a 64-char hex digest", () => {
  const token = expectedToken();
  assert.equal(token, expectedToken());
  assert.match(token, /^[a-f0-9]{64}$/);
});

test("createRequireAuth rejects requests without a session cookie", () => {
  const middleware = createRequireAuth({ secure: false });
  const response = responseRecorder();
  let nextCalls = 0;
  middleware({ headers: {} }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "Authentication required.");
  assert.equal(nextCalls, 0);
});

test("createRequireAuth passes when the cookie matches the expected token", () => {
  const middleware = createRequireAuth({ secure: false });
  const request = { headers: { cookie: `${ACCESS_COOKIE}=${expectedToken()}` } };
  const response = responseRecorder();
  let nextCalls = 0;
  middleware(request, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});

test("createRequireAuth rejects a wrong token and clears the cookie", () => {
  const middleware = createRequireAuth({ secure: true });
  const response = responseRecorder();
  middleware({ headers: { cookie: `${ACCESS_COOKIE}=wrong-token` } }, response, () => {});
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["Set-Cookie"].length, 1);
  assert.match(response.headers["Set-Cookie"][0], /Secure/);
});

test("parseCookies decodes cookie values and ignores malformed pairs", () => {
  assert.deepEqual(parseCookies("theme=light; dl_access_token=a%20b; malformed"), {
    theme: "light",
    dl_access_token: "a b",
  });
  assert.deepEqual(parseCookies(""), {});
});

test("sessionCookie serializes an HTTP-only same-site production cookie", () => {
  const cookie = sessionCookie(ACCESS_COOKIE, "token value", { secure: true, maxAge: 3600 });
  assert.match(cookie, /^dl_access_token=token%20value;/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=3600/);
});

test("clearSessionCookies expires the access cookie", () => {
  const cookies = clearSessionCookies({ secure: false });
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], new RegExp(`^${ACCESS_COOKIE}=`));
  assert.match(cookies[0], /Max-Age=0/);
  assert.match(cookies[0], /HttpOnly/);
});
