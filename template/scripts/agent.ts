/**
 * Built-in zero-dependency universal creative agent for direct HTTP API providers
 * (Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, xAI/Grok, Groq, Mistral,
 * Ollama, and any OpenAI-compatible endpoint).
 *
 * Emits Claude-compatible stream-json JSONL on stdout so `stream-progress.ts` renders
 * identical live progress across every AI provider.
 *
 *   node scripts/agent.ts --provider openai --model gpt-5 --skill /path/to/shotcraft --task "..."
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { resolveProvider, type ResolvedProvider } from "./lib/providers.ts";

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResult = {
  text: string;
  image?: { mimeType: string; base64: string; path: string };
  isError?: boolean;
};

const MAX_TOOL_TEXT = 20_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function truncateMiddle(text: string, max = MAX_TOOL_TEXT): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.4);
  const tail = max - head - 80;
  return `${text.slice(0, head)}\n... [${text.length - head - tail} chars omitted] ...\n${text.slice(-tail)}`;
}

function listTree(root: string, maxDepth = 3, depth = 0, prefix = ""): string[] {
  if (depth > maxDepth || !existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.name !== "node_modules" && e.name !== ".git")
    .sort((a, b) => a.name.localeCompare(b.name));
  const out: string[] = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(`${rel}/`);
      if (depth < maxDepth) out.push(...listTree(join(root, e.name), maxDepth, depth + 1, rel));
    } else {
      out.push(rel);
    }
    if (out.length >= 250) {
      out.push("... (truncated)");
      break;
    }
  }
  return out;
}

/** Execute one built-in agent tool inside `cwd` (and readable `skillDir`). */
export function executeTool(
  name: string,
  input: Record<string, unknown>,
  cwd: string,
): ToolResult {
  const resolvePath = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));

  try {
    if (name === "Read") {
      const rawPath = String(input.file_path ?? input.path ?? "").trim();
      if (!rawPath) return { text: "Error: file_path is required.", isError: true };
      const abs = resolvePath(rawPath);
      if (!existsSync(abs)) return { text: `Error: file not found: ${abs}`, isError: true };
      const st = statSync(abs);
      if (st.isDirectory()) {
        return { text: listTree(abs, 2).join("\n") || "(empty directory)" };
      }
      const ext = extname(abs).toLowerCase();
      if (IMAGE_MIME[ext]) {
        if (st.size > MAX_IMAGE_BYTES) {
          return { text: `Image ${rawPath} (${st.size} bytes; too large to inline).` };
        }
        const b64 = readFileSync(abs).toString("base64");
        return {
          text: `Loaded image ${rawPath} (${st.size} bytes, ${IMAGE_MIME[ext]}).`,
          image: { mimeType: IMAGE_MIME[ext], base64: b64, path: rawPath },
        };
      }
      const full = readFileSync(abs, "utf8");
      const lines = full.split("\n");
      const offset = Math.max(1, Number(input.offset ?? 1) || 1);
      const limit = Math.min(800, Math.max(1, Number(input.limit ?? 600) || 600));
      const slice = lines.slice(offset - 1, offset - 1 + limit);
      const body = slice.map((l, i) => `${offset + i}: ${l}`).join("\n");
      const more = offset - 1 + slice.length < lines.length ? `\n... (${lines.length - (offset - 1 + slice.length)} more lines)` : "";
      return { text: truncateMiddle(body + more) };
    }

    if (name === "Write") {
      const rawPath = String(input.file_path ?? input.path ?? "").trim();
      if (!rawPath) return { text: "Error: file_path is required.", isError: true };
      const content = String(input.content ?? "");
      const abs = resolvePath(rawPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
      return { text: `Wrote ${content.length} bytes to ${rawPath}.` };
    }

    if (name === "Edit") {
      const rawPath = String(input.file_path ?? input.path ?? "").trim();
      const oldStr = String(input.old_string ?? "");
      const newStr = String(input.new_string ?? "");
      const replaceAll = Boolean(input.replace_all);
      if (!rawPath || !oldStr) return { text: "Error: file_path and old_string are required.", isError: true };
      const abs = resolvePath(rawPath);
      if (!existsSync(abs)) return { text: `Error: file not found: ${abs}`, isError: true };
      const src = readFileSync(abs, "utf8");
      const count = src.split(oldStr).length - 1;
      if (count === 0) return { text: `Error: old_string not found in ${rawPath}.`, isError: true };
      if (count > 1 && !replaceAll) {
        return { text: `Error: old_string appeared ${count} times in ${rawPath}; pass replace_all=true or provide more context.`, isError: true };
      }
      const next = replaceAll ? src.replaceAll(oldStr, newStr) : src.replace(oldStr, newStr);
      writeFileSync(abs, next, "utf8");
      return { text: `Edited ${rawPath} (${replaceAll ? count : 1} replacement${count > 1 && replaceAll ? "s" : ""}).` };
    }

    if (name === "List") {
      const rawPath = String(input.path ?? ".").trim() || ".";
      const maxDepth = Math.min(5, Math.max(1, Number(input.max_depth ?? 3) || 3));
      const abs = resolvePath(rawPath);
      if (!existsSync(abs)) return { text: `Error: path not found: ${abs}`, isError: true };
      return { text: listTree(abs, maxDepth).join("\n") || "(empty)" };
    }

    if (name === "Bash") {
      const cmd = String(input.command ?? "").trim();
      if (!cmd) return { text: "Error: command is required.", isError: true };
      const timeout = Math.min(10 * 60_000, Math.max(5_000, Number(input.timeout_ms ?? 300_000) || 300_000));
      const res = spawnSync("bash", ["-c", cmd], {
        cwd,
        encoding: "utf8",
        timeout,
        maxBuffer: 20 * 1024 * 1024,
      });
      const out = [res.stdout?.trim(), res.stderr?.trim()].filter(Boolean).join("\n");
      const status = res.status ?? (res.signal ? 128 : 1);
      const summary = `exit ${status}${out ? `\n${truncateMiddle(out)}` : ""}`;
      return { text: summary, isError: status !== 0 };
    }

    return { text: `Error: unknown tool "${name}".`, isError: true };
  } catch (err) {
    return { text: `Error: ${(err as Error).message}`, isError: true };
  }
}

export const TOOL_DEFINITIONS = [
  {
    name: "Read",
    description: "Read a text file (with line numbers) or inspect an image file (.png, .jpg, .webp) at a path.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Relative or absolute path to read." },
        offset: { type: "integer", description: "Optional 1-based start line for text files." },
        limit: { type: "integer", description: "Optional max number of lines (default 600)." },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Write",
    description: "Create or overwrite a file with UTF-8 content (parent directories created automatically).",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to write." },
        content: { type: "string", description: "Full file contents." },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "Edit",
    description: "Replace an exact string in an existing file.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to edit." },
        old_string: { type: "string", description: "Exact text to replace." },
        new_string: { type: "string", description: "Replacement text." },
        replace_all: { type: "boolean", description: "Replace every occurrence if true." },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "List",
    description: "List files and folders under a directory (skips node_modules and .git).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (default '.')." },
        max_depth: { type: "integer", description: "Max recursion depth (1-5, default 3)." },
      },
    },
  },
  {
    name: "Bash",
    description: "Run a shell command in the workspace (e.g. npm run render, remotion still, ffmpeg, eleven CLI).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Bash command string." },
        timeout_ms: { type: "integer", description: "Optional timeout in ms (default 300000)." },
      },
      required: ["command"],
    },
  },
] as const;

function emitEvent(obj: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, init);
      if ((r.status < 500 && r.status !== 429) || i >= tries) return r;
    } catch (err) {
      if (i >= tries) throw err;
    }
    await new Promise((res) => setTimeout(res, 2000 * 2 ** (i - 1)));
  }
}

const SYSTEM_PROMPT = `You are GitCut's autonomous Creative Director & Remotion engineer.
You have full access to Read, Write, Edit, List, and Bash tools in the current workspace.
Work methodically end-to-end without asking questions:
1. Read ./BRIEF.md (or ./EDIT.md) and all relevant inputs first.
2. Follow every instruction in the brief — write ./STRATEGY.md first on new films, study the shotcraft cards, generate audio if enabled, write Remotion code, render QA stills and inspect them with Read, then render ./out/video.mp4 and verify it exists.
3. Finish with a brief confirmation only after all required output files exist on disk.`;

async function runAnthropicLoop(resolved: ResolvedProvider, task: string, cwd: string, maxTurns: number): Promise<number> {
  const messages: Record<string, unknown>[] = [{ role: "user", content: task }];
  const tools = TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  let turns = 0;
  for (let turn = 1; turn <= maxTurns; turn++) {
    turns = turn;
    // Prune inline base64 images older than 4 turns to stay well within context limits.
    if (messages.length > 8) {
      for (const m of messages.slice(0, -6)) {
        if (Array.isArray(m.content)) {
          for (const block of m.content as Record<string, any>[]) {
            if (block.type === "tool_result" && Array.isArray(block.content)) {
              block.content = block.content.map((c: Record<string, any>) =>
                c.type === "image" ? { type: "text", text: "[earlier image omitted]" } : c,
              );
            }
          }
        }
      }
    }

    const r = await fetchWithRetry(`${resolved.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": resolved.apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      }),
    });
    if (!r.ok) throw new Error(`Anthropic API (${r.status}): ${await r.text()}`);
    const data = (await r.json()) as { content?: Record<string, any>[]; stop_reason?: string };
    const content = data.content ?? [];
    messages.push({ role: "assistant", content });

    const calls = content.filter((b) => b.type === "tool_use");
    if (!calls.length) break;

    emitEvent({ type: "assistant", message: { content: calls } });
    const toolResults: Record<string, unknown>[] = [];
    for (const c of calls) {
      const res = executeTool(String(c.name), (c.input ?? {}) as Record<string, unknown>, cwd);
      if (res.image) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: c.id,
          content: [
            { type: "text", text: res.text },
            {
              type: "image",
              source: { type: "base64", media_type: res.image.mimeType, data: res.image.base64 },
            },
          ],
        });
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: c.id,
          is_error: Boolean(res.isError),
          content: res.text,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return turns;
}

const VISION_OPENAI_PROVIDERS = new Set(["openai", "openrouter", "xai", "mistral"]);

async function runOpenAiLoop(resolved: ResolvedProvider, task: string, cwd: string, maxTurns: number): Promise<number> {
  const messages: Record<string, any>[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];
  const tools = TOOL_DEFINITIONS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${resolved.apiKey!}`,
  };
  if (resolved.id === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/zekooo0/gitcut";
    headers["X-Title"] = "GitCut";
  }

  let allowImages = VISION_OPENAI_PROVIDERS.has(resolved.id);
  let turns = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    turns = turn;
    // Strip old inline image_url payloads to prevent context bloat
    if (messages.length > 10) {
      for (const m of messages.slice(0, -6)) {
        if (m.role === "user" && Array.isArray(m.content)) {
          m.content = "[earlier inspected image omitted]";
        }
      }
    }

    const body = JSON.stringify({
      model: resolved.model,
      messages,
      tools,
      tool_choice: "auto",
    });

    let r = await fetchWithRetry(`${resolved.baseUrl}/chat/completions`, { method: "POST", headers, body });
    // If a non-vision model rejects image_url with 400, strip images and retry seamlessly.
    if (r.status === 400 && allowImages) {
      const errText = await r.text();
      if (/image|vision|multimodal/i.test(errText)) {
        allowImages = false;
        for (const m of messages) {
          if (m.role === "user" && Array.isArray(m.content)) m.content = "[image inspection unsupported by this model]";
        }
        r = await fetchWithRetry(`${resolved.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: resolved.model, messages, tools, tool_choice: "auto" }),
        });
      } else {
        throw new Error(`${resolved.info.label} (400): ${errText}`);
      }
    }
    if (!r.ok) throw new Error(`${resolved.info.label} (${r.status}): ${await r.text()}`);

    const data = (await r.json()) as {
      choices?: { message?: { role?: string; content?: string | null; tool_calls?: any[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);

    const toolCalls = msg.tool_calls ?? [];
    if (!toolCalls.length) break;

    const emitted = toolCalls.map((tc: any) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return { type: "tool_use", id: tc.id, name: tc.function?.name, input: parsed };
    });
    emitEvent({ type: "assistant", message: { content: emitted } });

    const pendingImages: { mimeType: string; base64: string; path: string }[] = [];
    for (const tc of emitted) {
      const res = executeTool(String(tc.name), tc.input, cwd);
      messages.push({ role: "tool", tool_call_id: tc.id, content: res.text });
      if (res.image && allowImages) pendingImages.push(res.image);
    }

    if (pendingImages.length) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Attached image(s) from Read: ${pendingImages.map((i) => i.path).join(", ")}` },
          ...pendingImages.map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
        ],
      });
    }
  }
  return turns;
}

async function runGeminiLoop(resolved: ResolvedProvider, task: string, cwd: string, maxTurns: number): Promise<number> {
  const contents: Record<string, any>[] = [{ role: "user", parts: [{ text: task }] }];
  const tools = [
    {
      functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
  const endpoint = `${resolved.baseUrl}/models/${encodeURIComponent(resolved.model)}:generateContent?key=${encodeURIComponent(resolved.apiKey!)}`;

  let turns = 0;
  for (let turn = 1; turn <= maxTurns; turn++) {
    turns = turn;
    // Prune older inlineData images to stay lean
    if (contents.length > 8) {
      for (const c of contents.slice(0, -6)) {
        if (Array.isArray(c.parts)) {
          c.parts = c.parts.map((p: Record<string, any>) =>
            p.inlineData ? { text: "[earlier image omitted]" } : p,
          );
        }
      }
    }

    const r = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools,
      }),
    });
    if (!r.ok) throw new Error(`Gemini API (${r.status}): ${await r.text()}`);
    const data = (await r.json()) as {
      candidates?: { content?: { role?: string; parts?: Record<string, any>[] } }[];
    };
    const modelContent = data.candidates?.[0]?.content;
    const parts = modelContent?.parts ?? [];
    if (!parts.length) break;
    // Preserve exact model parts (including thoughtSignature for Gemini thinking models).
    contents.push({ role: "model", parts });

    const fnCalls = parts.filter((p) => p.functionCall);
    if (!fnCalls.length) break;

    emitEvent({
      type: "assistant",
      message: {
        content: fnCalls.map((p, idx) => ({
          type: "tool_use",
          id: `gem_${turn}_${idx}`,
          name: p.functionCall.name,
          input: p.functionCall.args ?? {},
        })),
      },
    });

    const responseParts: Record<string, any>[] = [];
    for (const p of fnCalls) {
      const fn = p.functionCall as { name: string; args?: Record<string, unknown> };
      const res = executeTool(fn.name, fn.args ?? {}, cwd);
      responseParts.push({
        functionResponse: {
          name: fn.name,
          response: { output: res.text, isError: Boolean(res.isError) },
        },
      });
      if (res.image) {
        responseParts.push({
          inlineData: { mimeType: res.image.mimeType, data: res.image.base64 },
        });
      }
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return turns;
}

async function main() {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", default: "auto" },
      model: { type: "string" },
      skill: { type: "string" },
      task: { type: "string" },
      "max-turns": { type: "string" },
    },
  });

  const task = values.task?.trim();
  if (!task) {
    console.error("usage: node scripts/agent.ts --provider <id> [--model <m>] --task <prompt>");
    process.exit(2);
  }

  const resolved = resolveProvider(values.provider, {
    model: values.model,
    purpose: "creative",
  });

  if (resolved.info.kind !== "api") {
    console.error(`Provider "${resolved.id}" is a CLI agent, not an HTTP API provider.`);
    process.exit(2);
  }
  if (!resolved.apiKey) {
    console.error(`Missing credentials for ${resolved.info.label}. ${resolved.info.setupHint}`);
    process.exit(1);
  }

  const maxTurns = Math.max(5, Math.min(120, Number(values["max-turns"] || process.env.AGENT_MAX_TURNS || 60) || 60));
  const cwd = process.cwd();
  const fullTask = values.skill
    ? `${task}\n\nNote: The video-shotcraft skill directory is readable at: ${values.skill}`
    : task;

  const t0 = Date.now();
  let turns = 0;
  if (resolved.info.protocol === "anthropic") {
    turns = await runAnthropicLoop(resolved, fullTask, cwd, maxTurns);
  } else if (resolved.info.protocol === "gemini") {
    turns = await runGeminiLoop(resolved, fullTask, cwd, maxTurns);
  } else {
    turns = await runOpenAiLoop(resolved, fullTask, cwd, maxTurns);
  }

  emitEvent({ type: "result", num_turns: turns, duration_ms: Date.now() - t0 });
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  await main();
}
