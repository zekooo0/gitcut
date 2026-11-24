/**
 * YouTube upload helpers (YouTube Data API v3, plain fetch, no dependencies).
 * Auth is a long-lived OAuth refresh token for the channel's Google account.
 */

export type Privacy = "private" | "unlisted" | "public";

export type DescriptionOptions = {
  productName?: string;
  description?: string;
  website?: string;
  extra?: string;
};

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;

/** Title for the video: strips a conventional-commit prefix and optionally prefixes "<productName>: ". */
export function buildTitle(prTitle: string, productName?: string): string {
  const clean = prTitle
    .replace(/^\s*(feat|fix|chore|docs|refactor|perf|style|test|ci|build)(\([^)]*\))?!?:\s*/i, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const body = clean || "new feature";
  const prefix = (productName ?? "").replace(/[<>]/g, "").trim();
  const title = prefix ? `${prefix}: ${body}` : body;
  return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
}

/** Description: public text only. Never the PR link or anything from a private repo. */
export function buildDescription(opts: DescriptionOptions | string = {}): string {
  const { productName, description, website, extra }: DescriptionOptions =
    typeof opts === "string" ? { extra: opts } : opts;
  const lead =
    description?.trim() ||
    (productName?.trim() ? `A new feature in ${productName.trim()}.` : "Product feature walkthrough.");
  const text = [lead, extra?.trim(), website?.trim()]
    .filter(Boolean)
    .join("\n\n")
    .replace(/[<>]/g, "");
  return text.slice(0, MAX_DESCRIPTION);
}

export function parsePrivacy(value: string | undefined): Privacy {
  const v = (value ?? "").trim().toLowerCase();
  return v === "public" || v === "unlisted" ? v : "private"; // anything else: private (safe)
}

export async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(`Google sign-in failed (${r.status}): ${j.error ?? ""} ${j.error_description ?? ""}`.trim());
  }
  return j.access_token;
}

/** Upload an MP4 and return the watch URL. */
export async function uploadVideo(opts: {
  accessToken: string;
  bytes: Uint8Array;
  title: string;
  description: string;
  privacy: Privacy;
}): Promise<{ id: string; url: string }> {
  const start = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(opts.bytes.byteLength),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: { title: opts.title, description: opts.description, categoryId: "28" }, // 28 = Science & Technology
        status: { privacyStatus: opts.privacy, selfDeclaredMadeForKids: false },
      }),
    },
  );
  if (!start.ok) throw new Error(`YouTube upload could not start (${start.status}): ${await start.text()}`);
  const location = start.headers.get("location");
  if (!location) throw new Error("YouTube did not return an upload address.");

  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(opts.bytes.byteLength) },
    body: opts.bytes as BodyInit,
  });
  const j = (await put.json().catch(() => ({}))) as { id?: string };
  if (!put.ok || !j.id) throw new Error(`YouTube upload failed (${put.status}).`);
  return { id: j.id, url: `https://www.youtube.com/watch?v=${j.id}` };
}
