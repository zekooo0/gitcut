import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDiscordBody,
  buildLinearComment,
  buildSlackBody,
  extractLinearKey,
  signWebhook,
} from "./notify.ts";

test("extractLinearKey finds explicit key, Linear URL, or issue identifier", () => {
  assert.equal(extractLinearKey("anything", "eng-42"), "ENG-42");
  assert.equal(extractLinearKey("Fixes https://linear.app/acme/issue/FE-128/dark-mode"), "FE-128");
  assert.equal(extractLinearKey("feat/ENG-7-billing-tab"), "ENG-7");
  assert.equal(extractLinearKey("no linear key here"), undefined);
});

test("buildSlackBody, buildDiscordBody, and buildLinearComment include all links", () => {
  const payload = {
    event: "video.rendered" as const,
    title: "Dark mode",
    videoUrl: "https://example.com/dark-mode.mp4",
    youtubeUrl: "https://youtube.com/watch?v=abc",
    captionsUrl: "https://example.com/captions.srt",
    prUrl: "https://github.com/acme/app/pull/12",
  };
  const slack = buildSlackBody(payload);
  assert.match(slack.blocks[0].text.text, /Download MP4/);
  assert.match(slack.blocks[0].text.text, /Watch on YouTube/);
  assert.match(slack.blocks[0].text.text, /Subtitles/);

  const discord = buildDiscordBody(payload);
  assert.match(discord.embeds[0].description, /\[Watch on YouTube\]/);
  assert.match(discord.embeds[0].description, /\[Pull Request\]/);

  const linear = buildLinearComment(payload);
  assert.match(linear, /Video: https:\/\/example\.com\/dark-mode\.mp4/);
  assert.match(linear, /YouTube: https:\/\/youtube\.com\/watch\?v=abc/);
});

test("signWebhook produces deterministic sha256 HMAC", () => {
  const sig = signWebhook('{"ok":true}', "secret");
  assert.match(sig, /^sha256=[a-f0-9]{64}$/);
  assert.equal(sig, signWebhook('{"ok":true}', "secret"));
});
