import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPlan, canRun, parseCommand, workflowInputs } from "../commands.js";

test("parseCommand: verbs (supports /gitcut and /video alias)", () => {
  assert.deepEqual(parseCommand("/gitcut"), { kind: "dispatch", dispatch: { mode: "plan" } });
  assert.deepEqual(parseCommand("/video"), { kind: "dispatch", dispatch: { mode: "plan" } });
  assert.deepEqual(parseCommand("/gitcut plan"), { kind: "dispatch", dispatch: { mode: "plan" } });
  assert.deepEqual(parseCommand("/gitcut approve"), { kind: "dispatch", dispatch: { mode: "render" } });
  assert.deepEqual(parseCommand("/VIDEO Recapture"), { kind: "dispatch", dispatch: { mode: "recapture" } });
  assert.deepEqual(parseCommand("/gitcut help"), { kind: "help" });
});

test("parseCommand: options", () => {
  assert.deepEqual(parseCommand("/video plan routes=/settings/store,/reports clickup=86abc"), {
    kind: "dispatch",
    dispatch: { mode: "plan", routes: "/settings/store,/reports", clickup: "86abc" },
  });
  assert.deepEqual(parseCommand("/video routes=/a"), {
    kind: "dispatch",
    dispatch: { mode: "plan", routes: "/a" },
  });
});

test("parseCommand: site, url, format, style, provider, model, and captions options", () => {
  assert.deepEqual(
    parseCommand("/video plan site=acme-app url=https://pr-42.preview.example.com format=9:16 style=editorial-light provider=openrouter model=anthropic/claude-sonnet-4.5 captions=on"),
    {
      kind: "dispatch",
      dispatch: {
        mode: "plan",
        site: "acme-app",
        url: "https://pr-42.preview.example.com",
        format: "vertical",
        style: "editorial-light",
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4.5",
        captions: "on",
      },
    },
  );
  assert.equal(parseCommand("/video plan site=../etc").kind, "error");
  assert.equal(parseCommand("/video plan url=javascript:alert(1)").kind, "error");
  assert.equal(parseCommand("/video plan format=4:3").kind, "error");
  assert.equal(parseCommand("/video plan style=rainbow").kind, "error");
  assert.equal(parseCommand("/video plan provider=bogus").kind, "error");
  assert.equal(parseCommand("/video plan model=bad;rm").kind, "error");
  assert.equal(parseCommand("/video plan captions=maybe").kind, "error");
  assert.equal(parseCommand("/video approve site=x").kind, "error");
  assert.equal(parseCommand("/video approve url=https://example.com").kind, "error");
  assert.equal(parseCommand("/video approve format=square").kind, "error");
  assert.equal(parseCommand("/video approve style=kinetic-bold").kind, "error");
  assert.equal(parseCommand("/video approve provider=openai").kind, "error");
  assert.deepEqual(
    workflowInputs(
      { owner: "o", repo: "r", number: 1 },
      { mode: "plan", site: "s", url: "https://example.com", format: "square", style: "kinetic-bold", provider: "gemini", model: "gemini-2.5-pro", captions: "on" },
    ),
    { mode: "plan", pr: "o/r#1", site: "s", url: "https://example.com", format: "square", style: "kinetic-bold", provider: "gemini", model: "gemini-2.5-pro", captions: "on" },
  );
});

test("parseCommand: only the first line counts; other text is ignored", () => {
  assert.equal(parseCommand("looks good\n/video"), null);
  assert.equal(parseCommand("please run /video"), null);
  assert.deepEqual(parseCommand("/video approve\nthanks!"), { kind: "dispatch", dispatch: { mode: "render" } });
});

test("parseCommand: errors", () => {
  assert.equal(parseCommand("/video deploy").kind, "error");
  assert.equal(parseCommand("/video plan routes=").kind, "error");
  assert.equal(parseCommand("/video plan routes=;rm -rf /").kind, "error");
  assert.equal(parseCommand("/video plan foo=bar").kind, "error");
  assert.equal(parseCommand("/video approve routes=/a").kind, "error");
});

test("canRun: write access or more", () => {
  for (const p of ["admin", "maintain", "write"]) assert.ok(canRun(p));
  for (const p of ["triage", "read", "none", undefined]) assert.ok(!canRun(p));
});

test("autoPlan", () => {
  const labeled = (name) => ({ action: "labeled", label: { name } });
  const merged = (title, merged = true) => ({ action: "closed", pull_request: { merged, title } });
  assert.ok(autoPlan(labeled("gitcut")));
  assert.ok(!autoPlan(labeled("bug")));
  assert.ok(!autoPlan(labeled("gitcut"), { mode: "off" }));
  assert.ok(!autoPlan(merged("feat(reports): x")));
  assert.ok(autoPlan(merged("feat(reports): x"), { mode: "feat-merged" }));
  assert.ok(autoPlan(merged("feat: x"), { mode: "feat-merged" }));
  assert.ok(!autoPlan(merged("feat(reports): x", false), { mode: "feat-merged" }));
  assert.ok(!autoPlan(merged("fix: x"), { mode: "feat-merged" }));
  assert.ok(!autoPlan(merged("feature flag cleanup"), { mode: "feat-merged" }));
});

test("workflowInputs: strings only, optional keys omitted", () => {
  assert.deepEqual(workflowInputs({ owner: "o", repo: "r", number: 7 }, { mode: "plan" }), {
    mode: "plan",
    pr: "o/r#7",
  });
  assert.deepEqual(
    workflowInputs({ owner: "o", repo: "r", number: 7 }, { mode: "plan", routes: "/a", clickup: "x1" }),
    { mode: "plan", pr: "o/r#7", routes: "/a", clickup: "x1" },
  );
});

test("parseCommand: engine= is gone (no template)", () => {
  assert.equal(parseCommand("/video plan engine=template").kind, "error");
});

test("parseCommand: edit takes the free text, all lines", () => {
  assert.deepEqual(parseCommand("/video edit shorter intro, lighter background"), {
    kind: "dispatch",
    dispatch: { mode: "edit", request: "shorter intro, lighter background" },
  });
  const multi = parseCommand("/video edit\n- slower stats scene\n- use routes=/x as text");
  assert.equal(multi.dispatch.request, "- slower stats scene\n- use routes=/x as text");
  assert.equal(parseCommand("/video edit").kind, "error");
  assert.equal(parseCommand("/video edit " + "x".repeat(4000)).kind, "error");
  assert.equal(workflowInputs({ owner: "o", repo: "r", number: 1 }, { mode: "edit", request: "hi" }).request, "hi");
});
