/**
 * Upload the approved MP4 to YouTube and print the watch URL.
 *   node scripts/youtube-upload.ts --file out/<slug>.mp4 --pr owner/repo#123 [--dir public/features/<slug>] [--site <name>] [--privacy private|unlisted|public]
 * Env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, GH_TOKEN (to read the PR title),
 *      YOUTUBE_PRIVACY (default: private), optional PRODUCT_NAME / PRODUCT_DESCRIPTION / PRODUCT_WEBSITE.
 * Writes "youtube_url=<url>" and "youtube_privacy=<privacy>" to $GITHUB_OUTPUT when set.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadSite, loadSiteForDir } from "./lib/site.ts";
import { buildDescription, buildTitle, parsePrivacy, refreshAccessToken, uploadVideo } from "./lib/youtube.ts";

const { values: a } = parseArgs({
  options: {
    file: { type: "string" },
    pr: { type: "string" },
    dir: { type: "string" },
    site: { type: "string" },
    privacy: { type: "string" },
  },
});
const { YOUTUBE_CLIENT_ID: id, YOUTUBE_CLIENT_SECRET: secret, YOUTUBE_REFRESH_TOKEN: refresh } = process.env;
if (!a.file || !a.pr) {
  console.error("usage: node scripts/youtube-upload.ts --file <mp4> --pr owner/repo#123 [--dir <featureDir>] [--site <name>] [--privacy private|unlisted|public]");
  process.exit(2);
}
if (!id || !secret || !refresh) {
  console.log("YouTube is not set up (YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN missing); skipped.");
  process.exit(0);
}

const [, repo, n] = a.pr.match(/^(.+)#(\d+)$/) ?? [];
const pr = JSON.parse(execFileSync("gh", ["pr", "view", n, "-R", repo, "--json", "title"], { encoding: "utf8" })) as {
  title: string;
};
const site = a.site ? loadSite({ site: a.site }) : a.dir ? loadSiteForDir(a.dir) : null;
const productName = process.env.PRODUCT_NAME || site?.product?.name;
const description = process.env.PRODUCT_DESCRIPTION || site?.product?.description;
const website = process.env.PRODUCT_WEBSITE || site?.product?.website;

const privacy = parsePrivacy(a.privacy ?? process.env.YOUTUBE_PRIVACY);
const accessToken = await refreshAccessToken(id, secret, refresh);
const { url } = await uploadVideo({
  accessToken,
  bytes: readFileSync(a.file),
  title: buildTitle(pr.title, productName),
  description: buildDescription({ productName, description, website }),
  privacy,
});
console.log(`Uploaded to YouTube (${privacy}): ${url}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `youtube_url=${url}\nyoutube_privacy=${privacy}\n`);
