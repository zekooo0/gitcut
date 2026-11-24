import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { executeTool } from "./agent.ts";

test("agent built-in tools Read, Write, Edit, List, and Bash work inside workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "gitcut-agent-test-"));
  try {
    const w = executeTool("Write", { file_path: "sub/hello.txt", content: "hello world\nline two\n" }, dir);
    assert.ok(!w.isError);
    assert.equal(readFileSync(join(dir, "sub/hello.txt"), "utf8"), "hello world\nline two\n");

    const r = executeTool("Read", { file_path: "sub/hello.txt" }, dir);
    assert.ok(!r.isError);
    assert.match(r.text, /1: hello world/);

    const e = executeTool("Edit", { file_path: "sub/hello.txt", old_string: "world", new_string: "gitcut" }, dir);
    assert.ok(!e.isError);
    assert.equal(readFileSync(join(dir, "sub/hello.txt"), "utf8"), "hello gitcut\nline two\n");

    const l = executeTool("List", { path: "." }, dir);
    assert.ok(!l.isError);
    assert.match(l.text, /sub\/hello\.txt/);

    // Image Read returns base64 inline attachment
    const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    writeFileSync(join(dir, "tiny.png"), pngBytes);
    const img = executeTool("Read", { file_path: "tiny.png" }, dir);
    assert.ok(!img.isError);
    assert.equal(img.image?.mimeType, "image/png");
    assert.equal(img.image?.base64, pngBytes.toString("base64"));

    const b = executeTool("Bash", { command: "echo hi-from-bash" }, dir);
    assert.ok(!b.isError);
    assert.match(b.text, /hi-from-bash/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
