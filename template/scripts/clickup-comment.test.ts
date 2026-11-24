import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClickUpComment, extractClickUpId } from "./clickup-comment.ts";

test("buildClickUpComment includes video, optional YouTube URL, and PR URL", () => {
  const withoutYt = buildClickUpComment({
    title: "Add dark mode",
    video: "https://example.com/video.mp4",
    prUrl: "https://github.com/acme/app/pull/42",
  });
  assert.equal(
    withoutYt,
    'Feature video ready for "Add dark mode".\nVideo: https://example.com/video.mp4\nPR: https://github.com/acme/app/pull/42',
  );

  const withYt = buildClickUpComment({
    title: "Add dark mode",
    video: "https://example.com/video.mp4",
    youtube: "https://www.youtube.com/watch?v=abc123",
    prUrl: "https://github.com/acme/app/pull/42",
  });
  assert.equal(
    withYt,
    'Feature video ready for "Add dark mode".\nVideo: https://example.com/video.mp4\nYouTube: https://www.youtube.com/watch?v=abc123\nPR: https://github.com/acme/app/pull/42',
  );
});

test("extractClickUpId prefers explicit id, then ClickUp URL, then CU- prefix", () => {
  assert.equal(extractClickUpId("https://app.clickup.com/t/86abc", "explicit1"), "explicit1");
  assert.equal(extractClickUpId("See https://app.clickup.com/t/12345/86xyz99"), "86xyz99");
  assert.equal(extractClickUpId("feat/CU-99ab-dark-mode"), "99ab");
  assert.equal(extractClickUpId("no task here"), undefined);
});
