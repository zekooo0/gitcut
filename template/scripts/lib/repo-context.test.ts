import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRepoBriefMarkdown, extractReadmeImages, parseRepoTarget } from "./repo-context.ts";

test("parseRepoTarget recognizes GitHub URLs, owner/repo slugs, and local paths", () => {
  assert.deepEqual(parseRepoTarget("https://github.com/zekooo0/gitcut"), {
    kind: "github",
    owner: "zekooo0",
    repo: "gitcut",
  });
  assert.deepEqual(parseRepoTarget("https://github.com/zekooo0/gitcut.git"), {
    kind: "github",
    owner: "zekooo0",
    repo: "gitcut",
  });
  assert.deepEqual(parseRepoTarget("https://github.com/zekooo0/gitcut/tree/v2"), {
    kind: "github",
    owner: "zekooo0",
    repo: "gitcut",
    ref: "v2",
  });
  assert.deepEqual(parseRepoTarget("zekooo0/gitcut"), {
    kind: "github",
    owner: "zekooo0",
    repo: "gitcut",
  });
  assert.deepEqual(parseRepoTarget("./my-repo"), { kind: "local", path: "./my-repo" });
  assert.deepEqual(parseRepoTarget("/home/user/app"), { kind: "local", path: "/home/user/app" });
  assert.deepEqual(parseRepoTarget("."), { kind: "local", path: "." });
});

test("extractReadmeImages extracts local relative images and skips remote/traversal URLs", () => {
  const md = `
![Banner](./docs/hero.png)
![Badge](https://img.shields.io/badge/build-passing-green)
<img src="assets/demo.webp?raw=1" width="600" />
![Evil](../secret.png)
![Dup](docs/hero.png)
`;
  assert.deepEqual(extractReadmeImages(md), ["docs/hero.png", "assets/demo.webp"]);
});

test("buildRepoBriefMarkdown includes repo metadata, files, assets, and README", () => {
  const md = buildRepoBriefMarkdown({
    meta: {
      mode: "repo",
      name: "gitcut",
      fullName: "zekooo0/gitcut",
      description: "Turn PRs into product videos",
      url: "https://github.com/zekooo0/gitcut",
      language: "TypeScript",
      stars: 120,
      license: "Apache-2.0",
      topics: ["remotion", "playwright"],
    },
    readme: "# GitCut\nInstall with `npm i gitcut`.",
    topFiles: ["README.md", "package.json"],
    assets: ["hero.png"],
  });
  assert.match(md, /^# gitcut/);
  assert.match(md, /Language: TypeScript · Stars: 120 · License: Apache-2\.0/);
  assert.match(md, /- hero\.png/);
  assert.match(md, /Install with `npm i gitcut`\./);
});
