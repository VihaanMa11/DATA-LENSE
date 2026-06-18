import test from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage, isUnauthorizedResponse } from "../src/authClient.js";

test("authErrorMessage uses a server message without leaking response details", () => {
  assert.equal(authErrorMessage(401, { error: "Email or password is incorrect." }), "Email or password is incorrect.");
  assert.equal(authErrorMessage(500, {}), "Authentication is temporarily unavailable.");
});

test("isUnauthorizedResponse recognizes only HTTP 401", () => {
  assert.equal(isUnauthorizedResponse({ status: 401 }), true);
  assert.equal(isUnauthorizedResponse({ status: 403 }), false);
  assert.equal(isUnauthorizedResponse(null), false);
});
