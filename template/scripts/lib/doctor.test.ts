import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDoctorReport, parseGitHubRemote, runDoctorChecks } from "./doctor.ts";

test("parseGitHubRemote parses HTTPS and SSH GitHub remotes", () => {
  assert.deepEqual(parseGitHubRemote("https://github.com/zekooo0/gitcut.git"), { owner: "zekooo0", repo: "gitcut" });
  assert.deepEqual(parseGitHubRemote("https://github.com/acme/web-app"), { owner: "acme", repo: "web-app" });
  assert.deepEqual(parseGitHubRemote("git@github.com:acme/web-app.git"), { owner: "acme", repo: "web-app" });
  assert.equal(parseGitHubRemote("https://gitlab.com/acme/web-app.git"), null);
});

test("formatDoctorReport fails only when a required check fails", () => {
  const okReport = formatDoctorReport([
    { name: "Node.js", required: true, ok: true, detail: "v24.0.0" },
    { name: "FFmpeg", required: false, ok: false, detail: "missing", fix: "brew install ffmpeg" },
  ]);
  assert.equal(okReport.passed, true);
  assert.match(okReport.text, /Ready!/);

  const failReport = formatDoctorReport([
    { name: "Claude Code CLI", required: true, ok: false, detail: "missing", fix: "install it" },
  ]);
  assert.equal(failReport.passed, false);
  assert.match(failReport.text, /Fix the items marked with ✗/);
});

test("runDoctorChecks reports Node.js and audio mode cleanly", () => {
  const checks = runDoctorChecks({ skipAuth: true, env: {} });
  const nodeCheck = checks.find((c) => c.name.startsWith("Node.js"));
  assert.ok(nodeCheck?.ok);
  const audioCheck = checks.find((c) => c.name.startsWith("Audio"));
  assert.ok(audioCheck?.ok);
  assert.match(audioCheck!.detail, /silent\/captioned/);
});
