import assert from "node:assert/strict";
import { test } from "node:test";
import { canRun, parseComment } from "./parse-comment.ts";

test("parseComment parses /gitcut and /video alias with options", () => {
  assert.deepEqual(parseComment("/gitcut"), { kind: "dispatch", dispatch: { mode: "plan" } });
  assert.deepEqual(parseComment("/video"), { kind: "dispatch", dispatch: { mode: "plan" } });
  assert.deepEqual(
    parseComment("/video plan routes=/a,/b url=https://pr-1.vercel.app site=my-app clickup=86abc format=1:1 style=kinetic-bold captions=on"),
    {
      kind: "dispatch",
      dispatch: {
        mode: "plan",
        routes: "/a,/b",
        url: "https://pr-1.vercel.app",
        site: "my-app",
        clickup: "86abc",
        format: "square",
        style: "kinetic-bold",
        captions: "on",
      },
    },
  );
  assert.deepEqual(parseComment("/video approve"), { kind: "dispatch", dispatch: { mode: "render" } });
  assert.deepEqual(parseComment("/video recapture"), { kind: "dispatch", dispatch: { mode: "recapture" } });
  assert.equal(parseComment("/video help").kind, "help");
  assert.equal(parseComment("just a normal comment").kind, "ignore");
});

test("parseComment handles multiline /video edit requests and rejects invalid options", () => {
  const edit = parseComment("/video edit\n- shorter intro\n- brighter accent");
  assert.equal(edit.kind, "dispatch");
  if (edit.kind === "dispatch") {
    assert.equal(edit.dispatch.mode, "edit");
    assert.equal(edit.dispatch.request, "- shorter intro\n- brighter accent");
  }
  assert.equal(parseComment("/video edit").kind, "error");
  assert.equal(parseComment("/video plan url=javascript:alert(1)").kind, "error");
  assert.equal(parseComment("/video plan style=not-a-style").kind, "error");
  assert.equal(parseComment("/video approve url=https://example.com").kind, "error");
  assert.equal(parseComment("/video approve style=editorial-light").kind, "error");
  assert.equal(parseComment("/video nope").kind, "error");
});

test("canRun allows admin, maintain, write only", () => {
  assert.ok(canRun("write"));
  assert.ok(canRun("admin"));
  assert.ok(!canRun("read"));
  assert.ok(!canRun(undefined));
});
