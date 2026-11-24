/**
 * Post the finished video on the PR's ClickUp task (notifies the task's assignees and watchers).
 *   node scripts/clickup-comment.ts --pr owner/repo#123 --video <url> [--youtube <url>] [--clickup <taskId>]
 * Env: CLICKUP_TOKEN, GH_TOKEN or GITHUB_TOKEN (reads the PR body for the task link).
 */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

export function buildClickUpComment(opts: {
  title: string;
  video: string;
  prUrl: string;
  youtube?: string;
}): string {
  const lines = [`Feature video ready for "${opts.title}".`, `Video: ${opts.video}`];
  if (opts.youtube) lines.push(`YouTube: ${opts.youtube}`);
  lines.push(`PR: ${opts.prUrl}`);
  return lines.join("\n");
}

export function extractClickUpId(text: string, explicit?: string): string | undefined {
  return (
    explicit ||
    text.match(/app\.clickup\.com\/t\/(?:\d+\/)?([a-z0-9]+)/i)?.[1] ||
    text.match(/\bCU-([a-z0-9]+)/i)?.[1]
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: a } = parseArgs({
    options: { pr: { type: "string" }, video: { type: "string" }, youtube: { type: "string" }, clickup: { type: "string" } },
  });
  if (!a.pr || !a.video) {
    console.error("usage: node scripts/clickup-comment.ts --pr owner/repo#123 --video <url> [--youtube <url>] [--clickup id]");
    process.exit(2);
  }
  const [, repo, n] = a.pr.match(/^(.+)#(\d+)$/) ?? [];
  const pr = JSON.parse(
    execFileSync("gh", ["pr", "view", n, "-R", repo, "--json", "title,body,headRefName,url"], { encoding: "utf8" }),
  ) as { title: string; body?: string; headRefName: string; url: string };
  const id = extractClickUpId(`${pr.body ?? ""} ${pr.headRefName}`, a.clickup);
  if (!id) {
    console.log("No ClickUp task linked in the PR; skipped.");
    process.exit(0);
  }
  const r = await fetch(`https://api.clickup.com/api/v2/task/${id}/comment`, {
    method: "POST",
    headers: { Authorization: process.env.CLICKUP_TOKEN!, "Content-Type": "application/json" },
    body: JSON.stringify({
      comment_text: buildClickUpComment({
        title: pr.title,
        video: a.video,
        youtube: a.youtube,
        prUrl: pr.url,
      }),
      notify_all: true,
    }),
  });
  if (!r.ok) {
    console.error(`ClickUp ${id}: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  console.log(`Commented on ClickUp task ${id}.`);
}
