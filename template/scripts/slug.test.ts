import assert from "node:assert/strict";
import { test } from "node:test";
import { slugFor } from "./slug.ts";

test("slugFor combines repo name and cleaned branch name", () => {
  assert.equal(slugFor("acme/web-app", "feat/dark-mode"), "web-app-dark-mode");
  assert.equal(slugFor("acme/web-app", "feature/User_Profile!"), "web-app-user-profile");
  assert.equal(slugFor("acme/web-app", "fix/login-bug"), "web-app-login-bug");
});

test("slugFor truncates to 60 characters without trailing dashes", () => {
  const s = slugFor("acme/very-long-repo", "a-".repeat(40));
  assert.ok(s.length <= 60);
  assert.ok(!s.endsWith("-"));
});
