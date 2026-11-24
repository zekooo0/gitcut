/**
 * Drives the real Probot app with webhook payloads. GitHub is a fake fetch that records every
 * request and answers from a small route table, so the test checks the exact API calls.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { Probot, ProbotOctokit } from "probot";
import app from "../index.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

let calls;
let permission;
const fakeFetch = async (url, init = {}) => {
  const u = new URL(url);
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ method, path: u.pathname, body });
  const json = (status, data) =>
    new Response(status === 204 ? null : JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  if (method === "POST" && /^\/app\/installations\/\d+\/access_tokens$/.test(u.pathname))
    return json(201, { token: "ghs_test", expires_at: "2099-01-01T00:00:00Z", permissions: {}, repository_selection: "all" });
  if (method === "GET" && u.pathname === "/repos/acme/gitcut/installation")
    return json(200, { id: 222 });
  if (method === "GET" && /\/collaborators\/[^/]+\/permission$/.test(u.pathname))
    return json(200, { permission });
  if (method === "POST" && /\/actions\/workflows\/gitcut\.yml\/dispatches$/.test(u.pathname))
    return json(204);
  if (method === "POST" && /\/issues\/\d+\/comments$/.test(u.pathname)) return json(201, { id: 1 });
  if (method === "POST" && /\/issues\/comments\/\d+\/reactions$/.test(u.pathname)) return json(201, { id: 1 });
  return json(404, { message: `no fake for ${method} ${u.pathname}` });
};

let probot;
beforeEach(() => {
  calls = [];
  permission = "write";
  process.env.VIDEO_REPO = "acme/gitcut";
  delete process.env.AUTO_PLAN;
  probot = new Probot({
    appId: 123,
    privateKey,
    Octokit: ProbotOctokit.defaults({
      retry: { enabled: false },
      throttle: { enabled: false },
      request: { fetch: fakeFetch },
    }),
  });
  probot.load(app);
});

const repository = { name: "web-app", owner: { login: "acme" } };
const commentEvent = (body, user = { login: "alice", type: "User" }) => ({
  name: "issue_comment",
  id: "1",
  payload: {
    action: "created",
    installation: { id: 111 },
    repository,
    issue: { number: 857, pull_request: { url: "x" } },
    comment: { id: 99, body, user },
  },
});

const find = (re, method = "POST") => calls.filter((c) => c.method === method && re.test(c.path));

test("/gitcut plan dispatches the workflow with the PR and options, then acknowledges", async () => {
  await probot.receive(commentEvent("/gitcut plan routes=/settings/profile"));
  const d = find(/\/repos\/acme\/gitcut\/actions\/workflows\/gitcut\.yml\/dispatches$/);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].body, {
    ref: "main",
    inputs: { mode: "plan", pr: "acme/web-app#857", routes: "/settings/profile" },
  });
  // the dispatch went out with the VIDEO repo's installation (222), found through the App JWT
  assert.equal(find(/\/app\/installations\/222\/access_tokens$/).length, 1);
  assert.equal(find(/\/issues\/comments\/99\/reactions$/).length, 1);
  const ack = find(/\/repos\/acme\/web-app\/issues\/857\/comments$/);
  assert.equal(ack.length, 1);
  assert.match(ack[0].body.body, /Planning the feature video/);
});

test("/video approve renders", async () => {
  await probot.receive(commentEvent("/video approve"));
  const d = find(/\/dispatches$/);
  assert.equal(d[0].body.inputs.mode, "render");
});

test("a user without write access is refused, nothing dispatched", async () => {
  permission = "read";
  await probot.receive(commentEvent("/video"));
  assert.equal(find(/\/dispatches$/).length, 0);
  const c = find(/\/issues\/857\/comments$/);
  assert.match(c[0].body.body, /only people with write access/);
});

test("bad command: help reply, nothing dispatched", async () => {
  await probot.receive(commentEvent("/video deploy"));
  assert.equal(find(/\/dispatches$/).length, 0);
  assert.match(find(/\/issues\/857\/comments$/)[0].body.body, /Unknown command/);
});

test("bot comments and non-commands are ignored", async () => {
  await probot.receive(commentEvent("/gitcut", { login: "gitcut[bot]", type: "Bot" }));
  await probot.receive(commentEvent("LGTM"));
  assert.equal(calls.filter((c) => c.method === "POST" && !/access_tokens/.test(c.path)).length, 0);
});

test("comments on plain issues are ignored", async () => {
  const ev = commentEvent("/gitcut");
  delete ev.payload.issue.pull_request;
  await probot.receive(ev);
  assert.equal(find(/\/dispatches$/).length, 0);
});

test("works on any repo the App is installed on: replies there, dispatches to the video repo", async () => {
  const ev = commentEvent("/video");
  ev.payload.repository = { name: "customer-portal", owner: { login: "example-org" } };
  ev.payload.installation = { id: 333 };
  await probot.receive(ev);
  assert.deepEqual(find(/\/dispatches$/)[0].body.inputs, { mode: "plan", pr: "example-org/customer-portal#857" });
  assert.equal(find(/\/repos\/acme\/gitcut\/actions\/workflows\//).length, 1);
  assert.equal(find(/\/repos\/example-org\/customer-portal\/issues\/857\/comments$/).length, 1);
  assert.equal(find(/\/app\/installations\/333\/access_tokens$/).length, 1); // source repo's install
});

test("the trigger label starts a plan", async () => {
  await probot.receive({
    name: "pull_request",
    id: "2",
    payload: {
      action: "labeled",
      installation: { id: 111 },
      repository,
      label: { name: "gitcut" },
      pull_request: { number: 860, merged: false, title: "feat: x" },
    },
  });
  const d = find(/\/dispatches$/);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].body.inputs, { mode: "plan", pr: "acme/web-app#860" });
});
