/**
 * Pluggable post-render notifiers: Slack, Discord, signed generic webhook, and Linear.
 * Every channel is optional and activated by its environment variable(s).
 *
 *   node scripts/notify.ts --title "Dark mode" --video <url> [--youtube <url>]
 *                          [--captions <url>] [--pr owner/repo#123] [--pr-url <url>]
 *                          [--format landscape] [--linear ENG-123]
 *
 * Env:
 *   SLACK_WEBHOOK_URL     Incoming Slack webhook URL
 *   DISCORD_WEBHOOK_URL   Discord webhook URL
 *   NOTIFY_WEBHOOK_URL    Generic JSON webhook URL
 *   NOTIFY_WEBHOOK_SECRET Optional HMAC-SHA256 secret (sets X-GitCut-Signature: sha256=...)
 *   LINEAR_API_KEY        Linear personal/OAuth API key (comments on linked Linear issue)
 *   GH_TOKEN              Optional: reads PR title/body/url when --pr is passed without --title/--pr-url
 */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { parseArgs } from "node:util";

export type NotifyPayload = {
  event: "video.rendered";
  title: string;
  videoUrl: string;
  youtubeUrl?: string;
  captionsUrl?: string;
  prUrl?: string;
  format?: string;
};

export function extractLinearKey(text: string, explicit?: string): string | undefined {
  if (explicit?.trim()) return explicit.trim().toUpperCase();
  const fromUrl = text.match(/linear\.app\/[^/\s]+\/issue\/([A-Z][A-Z0-9]+-\d+)/i)?.[1];
  if (fromUrl) return fromUrl.toUpperCase();
  // Match common Linear identifiers like ENG-123 or FE-42 in PR body/branch
  const bare = text.match(/\b([A-Z]{2,10}-\d{1,6})\b/)?.[1];
  return bare ? bare.toUpperCase() : undefined;
}

export function buildSlackBody(p: NotifyPayload) {
  const links = [`<${p.videoUrl}|Download MP4>`];
  if (p.youtubeUrl) links.push(`<${p.youtubeUrl}|Watch on YouTube>`);
  if (p.captionsUrl) links.push(`<${p.captionsUrl}|Subtitles>`);
  if (p.prUrl) links.push(`<${p.prUrl}|Pull Request>`);
  return {
    text: `Feature video ready: ${p.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🎬 Feature video ready: ${p.title}*\n${links.join("  ·  ")}`,
        },
      },
    ],
  };
}

export function buildDiscordBody(p: NotifyPayload) {
  const lines = [`[Download MP4](${p.videoUrl})`];
  if (p.youtubeUrl) lines.push(`[Watch on YouTube](${p.youtubeUrl})`);
  if (p.captionsUrl) lines.push(`[Subtitles](${p.captionsUrl})`);
  if (p.prUrl) lines.push(`[Pull Request](${p.prUrl})`);
  return {
    embeds: [
      {
        title: `🎬 Feature video ready: ${p.title}`,
        description: lines.join(" · "),
        color: 0x2563eb,
      },
    ],
  };
}

export function signWebhook(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function buildLinearComment(p: NotifyPayload): string {
  const lines = [`🎬 Feature video ready for **${p.title}**`, `- Video: ${p.videoUrl}`];
  if (p.youtubeUrl) lines.push(`- YouTube: ${p.youtubeUrl}`);
  if (p.captionsUrl) lines.push(`- Subtitles: ${p.captionsUrl}`);
  if (p.prUrl) lines.push(`- PR: ${p.prUrl}`);
  return lines.join("\n");
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: json,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function commentLinear(apiKey: string, issueKey: string, body: string) {
  const lookup = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($id: String!) { issue(id: $id) { id identifier } }`,
      variables: { id: issueKey },
    }),
  });
  if (!lookup.ok) throw new Error(`Linear lookup ${lookup.status}`);
  const found = (await lookup.json()) as { data?: { issue?: { id: string } } };
  const issueId = found.data?.issue?.id;
  if (!issueId) throw new Error(`Linear issue ${issueKey} not found`);

  const create = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { success } }`,
      variables: { issueId, body },
    }),
  });
  if (!create.ok) throw new Error(`Linear comment ${create.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: a } = parseArgs({
    options: {
      title: { type: "string" },
      video: { type: "string" },
      youtube: { type: "string" },
      captions: { type: "string" },
      pr: { type: "string" },
      "pr-url": { type: "string" },
      format: { type: "string" },
      linear: { type: "string" },
    },
  });
  if (!a.video) {
    console.error("usage: node scripts/notify.ts --video <url> [--title <t>] [--pr owner/repo#123] [--youtube <url>] [--captions <url>] [--linear ENG-123]");
    process.exit(2);
  }

  let title = a.title;
  let prUrl = a["pr-url"];
  let prText = "";
  if (a.pr) {
    const [, repo, n] = a.pr.match(/^(.+)#(\d+)$/) ?? [];
    if (repo && n) {
      const pr = JSON.parse(
        execFileSync("gh", ["pr", "view", n, "-R", repo, "--json", "title,body,headRefName,url"], { encoding: "utf8" }),
      ) as { title: string; body?: string; headRefName: string; url: string };
      title ||= pr.title;
      prUrl ||= pr.url;
      prText = `${pr.title} ${pr.body ?? ""} ${pr.headRefName}`;
    }
  }

  const payload: NotifyPayload = {
    event: "video.rendered",
    title: title || "Feature video",
    videoUrl: a.video,
    ...(a.youtube ? { youtubeUrl: a.youtube } : {}),
    ...(a.captions ? { captionsUrl: a.captions } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(a.format ? { format: a.format } : {}),
  };

  const results: string[] = [];
  const errors: string[] = [];

  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await postJson(process.env.SLACK_WEBHOOK_URL, buildSlackBody(payload));
      results.push("slack");
    } catch (e) {
      errors.push(`slack: ${(e as Error).message}`);
    }
  }
  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      await postJson(process.env.DISCORD_WEBHOOK_URL, buildDiscordBody(payload));
      results.push("discord");
    } catch (e) {
      errors.push(`discord: ${(e as Error).message}`);
    }
  }
  if (process.env.NOTIFY_WEBHOOK_URL) {
    try {
      const json = JSON.stringify(payload);
      const headers: Record<string, string> = {};
      if (process.env.NOTIFY_WEBHOOK_SECRET) {
        headers["X-GitCut-Signature"] = signWebhook(json, process.env.NOTIFY_WEBHOOK_SECRET);
      }
      await postJson(process.env.NOTIFY_WEBHOOK_URL, payload, headers);
      results.push("webhook");
    } catch (e) {
      errors.push(`webhook: ${(e as Error).message}`);
    }
  }
  if (process.env.LINEAR_API_KEY) {
    const key = extractLinearKey(prText, a.linear);
    if (key) {
      try {
        await commentLinear(process.env.LINEAR_API_KEY, key, buildLinearComment(payload));
        results.push(`linear(${key})`);
      } catch (e) {
        errors.push(`linear(${key}): ${(e as Error).message}`);
      }
    }
  }

  if (results.length) console.log(`Notified: ${results.join(", ")}`);
  else if (!errors.length) console.log("No notification channels configured; skipped.");
  if (errors.length) {
    for (const err of errors) console.warn(`::warning::notify failed (${err})`);
    process.exit(1);
  }
}
