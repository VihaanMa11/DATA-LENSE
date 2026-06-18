import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  createRequireAuth,
  isAuthorizedEmail,
  parseCookies,
  sessionCookie,
} from "../server/auth.js";

test("isAuthorizedEmail accepts only the normalized approved account", () => {
  assert.equal(isAuthorizedEmail(" TestW065@gmail.com "), true);
  assert.equal(isAuthorizedEmail("another@example.com"), false);
  assert.equal(isAuthorizedEmail(""), false);
});

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

test("createRequireAuth rejects requests without an access cookie", async () => {
  let lookupCalls = 0;
  const middleware = createRequireAuth({
    getUser: async () => { lookupCalls += 1; },
    secure: false,
  });
  const response = responseRecorder();
  let nextCalls = 0;
  await middleware({ headers: {} }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "Authentication required.");
  assert.equal(lookupCalls, 0);
  assert.equal(nextCalls, 0);
});

test("createRequireAuth passes the approved Supabase user to the route", async () => {
  const user = { id: "user-1", email: "testw065@gmail.com" };
  const middleware = createRequireAuth({ getUser: async (token) => {
    assert.equal(token, "access-token");
    return user;
  } });
  const request = { headers: { cookie: `${ACCESS_COOKIE}=access-token` } };
  const response = responseRecorder();
  let nextCalls = 0;
  await middleware(request, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(request.authUser, user);
});

test("createRequireAuth rejects unauthorized Supabase users and clears cookies", async () => {
  const middleware = createRequireAuth({
    getUser: async () => ({ id: "user-2", email: "another@example.com" }),
    secure: true,
  });
  const response = responseRecorder();
  await middleware({ headers: { cookie: `${ACCESS_COOKIE}=access-token` } }, response, () => {});
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "This account is not authorized for this dashboard.");
  assert.equal(response.headers["Set-Cookie"].length, 2);
  response.headers["Set-Cookie"].forEach((cookie) => assert.match(cookie, /Secure/));
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

test("clearSessionCookies expires both authentication cookies", () => {
  const cookies = clearSessionCookies({ secure: false });
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], new RegExp(`^${ACCESS_COOKIE}=`));
  assert.match(cookies[1], new RegExp(`^${REFRESH_COOKIE}=`));
  cookies.forEach((cookie) => {
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/);
  });
});
