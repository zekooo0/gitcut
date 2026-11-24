/**
 * One-time helper (run on a laptop, not in CI): get the YouTube refresh token for the channel.
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node scripts/youtube-auth.ts
 * Opens nothing by itself: it prints a link. Open it, sign in with the Google account that owns the
 * channel, allow "Upload videos", and the refresh token is printed here. Save it as the GitHub secret
 * YOUTUBE_REFRESH_TOKEN. The token is only ever shown in this terminal; never paste it into a chat.
 */
import { createServer } from "node:http";

const { YOUTUBE_CLIENT_ID: id, YOUTUBE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first (a Google OAuth client of type 'Desktop app').");
  process.exit(2);
}
const PORT = 8765;
const redirect = `http://127.0.0.1:${PORT}`;
const link =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload",
    access_type: "offline",
    prompt: "consent",
  });

const server = createServer(async (req, res) => {
  const code = new URL(req.url ?? "/", redirect).searchParams.get("code");
  if (!code) {
    res.end("No code yet.");
    return;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { refresh_token?: string; error?: string };
  res.end(j.refresh_token ? "Done. You can close this tab and go back to the terminal." : `Failed: ${j.error}`);
  console.log(j.refresh_token ? `\nYOUTUBE_REFRESH_TOKEN=${j.refresh_token}\n` : `\nGoogle said: ${j.error}`);
  server.close();
});
server.listen(PORT, "127.0.0.1", () => console.log(`Open this link and sign in:\n\n${link}\n`));
