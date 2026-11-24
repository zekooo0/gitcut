import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPreviewUrl } from "./preview-url.ts";

test("detectPreviewUrl prefers successful Preview deployment statuses", () => {
  const url = detectPreviewUrl({
    deployments: [
      { environment: "Production", state: "success", environmentUrl: "https://app.example.com", createdAt: "2026-01-02T00:00:00Z" },
      { environment: "Preview", state: "success", environmentUrl: "https://my-app-git-feat.vercel.app/login", createdAt: "2026-01-01T00:00:00Z" },
      { environment: "Preview", state: "failure", environmentUrl: "https://broken.vercel.app", createdAt: "2026-01-03T00:00:00Z" },
    ],
  });
  assert.equal(url, "https://my-app-git-feat.vercel.app");
});

test("detectPreviewUrl extracts labeled links and hosting domains from PR comments", () => {
  assert.equal(
    detectPreviewUrl({
      comments: [
        { author: "vercel[bot]", body: "| [Visit Preview](https://pr-42.custom-preview.example.com/app) |", createdAt: "2026-01-01T00:00:00Z" },
      ],
    }),
    "https://pr-42.custom-preview.example.com",
  );
  assert.equal(
    detectPreviewUrl({
      comments: [
        { author: "netlify[bot]", body: "Deploy ready: https://deploy-preview-7--acme.netlify.app/", createdAt: "2026-01-01T00:00:00Z" },
      ],
    }),
    "https://deploy-preview-7--acme.netlify.app",
  );
  assert.equal(
    detectPreviewUrl({
      comments: [
        { author: "cloudflare-pages[bot]", body: "Preview: https://abc123.acme-docs.pages.dev", createdAt: "2026-01-01T00:00:00Z" },
      ],
    }),
    "https://abc123.acme-docs.pages.dev",
  );
});

test("detectPreviewUrl ignores dashboard links and returns null when none match", () => {
  assert.equal(
    detectPreviewUrl({
      comments: [{ body: "Check https://vercel.com/acme/project/deployments" }],
    }),
    null,
  );
});
