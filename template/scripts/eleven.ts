// ElevenLabs for the creative agent: voice-over, music and sound effects.
//
// The agent runs with every permission and reads the PR text, so it never gets the API key.
// CI starts this file as a local proxy that holds the key; the agent calls the proxy.
//
//   serve:  printf %s "$KEY" | node scripts/eleven.ts serve      key on stdin, never in env/argv
//   client (ELEVEN_URL=http://127.0.0.1:8790):
//     node scripts/eleven.ts tts   "<line>" out.mp3 [--prev "<line before>"] [--next "<line after>"]
//     node scripts/eleven.ts music "<prompt, no brand names>" <seconds> out.mp3
//     node scripts/eleven.ts sfx   "<sound>" out.mp3 [seconds]
//     node scripts/eleven.ts usage
//   The client prints the file's duration in seconds (ffprobe), which is the timeline.
//
// The voice, the models and a per-run cap are fixed here, not by the agent.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// Default: ElevenLabs premade "George" voice; override with ELEVEN_VOICE_ID.
const VOICE = process.env.ELEVEN_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const PORT = Number(process.env.ELEVEN_PORT || 8790);
const URL_ = process.env.ELEVEN_URL || `http://127.0.0.1:${PORT}`;
const API = "https://api.elevenlabs.io/v1";
const FORMAT = "output_format=mp3_44100_128"; // _192 is refused on lower plans
// per run: enough for a film, a few retakes and one edit; stops a looping agent from
// spending the month's credits
const CAP = { ttsChars: 3000, musicCalls: 3, musicSeconds: 150, sfxCalls: 25 };
// SFX arrive at full scale and covered the voice; the proxy sets every SFX to this peak, about
// 12 dB under the voice peaks of a normal mix, so the film cannot get a loud one.
const SFX_PEAK_DB = -20;

function levelPeak(audio: Buffer, target: number): Buffer {
  const probe = spawnSync("ffmpeg", ["-hide_banner", "-i", "pipe:0", "-af", "volumedetect", "-f", "null", "-"], { input: audio });
  const max = /max_volume: (-?[\d.]+) dB/.exec(String(probe.stderr))?.[1];
  if (probe.status !== 0 || max == null) throw new Error("SFX levelling needs ffmpeg");
  const out = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-af", `volume=${(target - Number(max)).toFixed(1)}dB`,
    "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"], { input: audio, maxBuffer: 64 << 20 });
  if (out.status !== 0 || !out.stdout.length) throw new Error(`SFX levelling failed: ${String(out.stderr).slice(0, 300)}`);
  return out.stdout;
}

const [cmd, ...args] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
}

async function serve() {
  const key = (await new Promise<string>((res) => {
    let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => res(s));
  })).trim();
  if (!key) { console.error("serve: no key on stdin"); process.exit(1); }
  const used = { ttsChars: 0, ttsCalls: 0, musicCalls: 0, musicSeconds: 0, sfxCalls: 0, errors: 0 };
  const log = process.env.ELEVEN_USAGE; // JSON lines; creative.sh reads it after the agent

  async function call(path: string, body: object): Promise<Buffer> {
    for (let i = 1; ; i++) {
      const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}${FORMAT}`, {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      const text = (await r.text()).slice(0, 500);
      if ((r.status === 429 || r.status >= 500) && i < 4) { await new Promise((s) => setTimeout(s, 2000 * i)); continue; }
      throw new Error(`ElevenLabs ${r.status}: ${text}`);
    }
  }

  createServer(async (req, res) => {
    const fail = (code: number, msg: string) => { used.errors++; res.writeHead(code, { "content-type": "text/plain" }).end(msg); };
    if (req.method === "GET" && req.url === "/usage") return res.end(JSON.stringify({ used, cap: CAP }));
    if (req.method !== "POST") return fail(404, "POST /tts | /music | /sfx");
    let raw = ""; for await (const c of req) raw += c;
    let b: any; try { b = JSON.parse(raw); } catch { return fail(400, "body must be JSON"); }
    try {
      let audio: Buffer;
      if (req.url === "/tts") {
        const text = String(b.text || "").trim();
        if (!text) return fail(400, "text is empty");
        if (used.ttsChars + text.length > CAP.ttsChars) return fail(429, `voice cap reached (${CAP.ttsChars} characters per run)`);
        audio = await call(`/text-to-speech/${VOICE}`, {
          text, model_id: "eleven_multilingual_v2",
          previous_text: b.previous_text || undefined, next_text: b.next_text || undefined,
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
        });
        used.ttsChars += text.length; used.ttsCalls++;
      } else if (req.url === "/music") {
        const prompt = String(b.prompt || "").trim();
        const sec = Number(b.seconds);
        if (!prompt || !(sec >= 3 && sec <= 120)) return fail(400, "prompt and seconds (3-120) are required");
        if (used.musicCalls + 1 > CAP.musicCalls || used.musicSeconds + sec > CAP.musicSeconds)
          return fail(429, `music cap reached (${CAP.musicCalls} tracks / ${CAP.musicSeconds} s per run)`);
        audio = await call(`/music`, { prompt, music_length_ms: Math.round(sec * 1000), force_instrumental: true });
        used.musicCalls++; used.musicSeconds += sec;
      } else if (req.url === "/sfx") {
        const text = String(b.text || "").trim();
        const sec = b.seconds == null ? undefined : Number(b.seconds);
        if (!text || (sec != null && !(sec >= 0.5 && sec <= 10))) return fail(400, "text, optional seconds 0.5-10");
        if (used.sfxCalls + 1 > CAP.sfxCalls) return fail(429, `sfx cap reached (${CAP.sfxCalls} per run)`);
        audio = levelPeak(await call(`/sound-generation`, { text, duration_seconds: sec, prompt_influence: 0.5 }), SFX_PEAK_DB);
        used.sfxCalls++;
      } else return fail(404, "POST /tts | /music | /sfx");
      if (log) appendFileSync(log, JSON.stringify({ kind: req.url!.slice(1), bytes: audio.length, used }) + "\n");
      res.writeHead(200, { "content-type": "audio/mpeg" }).end(audio);
    } catch (e: any) {
      fail(502, e.message);
    }
  }).listen(PORT, "127.0.0.1", () => console.log(`eleven proxy on 127.0.0.1:${PORT}, voice ${VOICE}`));
}

async function client() {
  let path: string, body: object, out: string;
  if (cmd === "usage") { console.log(await (await fetch(`${URL_}/usage`)).text()); return; }
  if (cmd === "tts") {
    const prev = flag("--prev"), next = flag("--next");
    [out] = args.slice(1); path = "/tts"; body = { text: args[0], previous_text: prev, next_text: next };
  } else if (cmd === "music") {
    out = args[2]; path = "/music"; body = { prompt: args[0], seconds: Number(args[1]) };
  } else if (cmd === "sfx") {
    out = args[1]; path = "/sfx"; body = { text: args[0], seconds: args[2] ? Number(args[2]) : undefined };
  } else {
    console.error("usage: eleven.ts serve | tts <text> <out.mp3> [--prev t] [--next t] | music <prompt> <seconds> <out.mp3> | sfx <text> <out.mp3> [seconds] | usage");
    process.exit(2);
  }
  if (!out!) { console.error("missing output file"); process.exit(2); }
  const r = await fetch(`${URL_}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { console.error(`failed (${r.status}): ${await r.text()}`); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  let dur = "?";
  try {
    dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
  } catch { /* no ffprobe: the agent measures it itself */ }
  console.log(`${out} ${dur} s`);
}

(cmd === "serve" ? serve() : client()).catch((e) => { console.error(e.message || e); process.exit(1); });
