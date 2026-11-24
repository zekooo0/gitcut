/**
 * Multi-provider AI registry, auto-detection, and unified single-turn completion runner.
 * Zero external dependencies — supports both agentic CLIs (Claude Code, OpenAI Codex,
 * Google Gemini CLI, OpenCode) and direct HTTP APIs (Anthropic, OpenAI, Google Gemini,
 * OpenRouter, DeepSeek, xAI/Grok, Groq, Mistral, Ollama, and any OpenAI-compatible server).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ConcreteProviderId =
  | "claude"
  | "codex"
  | "gemini-cli"
  | "opencode"
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "deepseek"
  | "xai"
  | "groq"
  | "mistral"
  | "ollama"
  | "openai-compatible";

export type ProviderId = "auto" | ConcreteProviderId;

export type ProviderKind = "cli" | "api";
export type ApiProtocol = "cli" | "anthropic" | "openai" | "gemini";

export type ProviderInfo = {
  id: ConcreteProviderId;
  label: string;
  shortHint: string;
  kind: ProviderKind;
  protocol: ApiProtocol;
  bin?: string;
  envKeys: string[];
  baseUrlEnv?: string;
  defaultBaseUrl?: string;
  defaultModel: string;
  defaultPlanModel: string;
  popularModels: string[];
  setupHint: string;
};

export const PROVIDER_CATALOG: Record<ConcreteProviderId, ProviderInfo> = {
  claude: {
    id: "claude",
    label: "Claude Code CLI",
    shortHint: "Anthropic Claude Code subscription or API",
    kind: "cli",
    protocol: "cli",
    bin: "claude",
    envKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    defaultModel: "sonnet",
    defaultPlanModel: "sonnet",
    popularModels: ["sonnet", "opus", "haiku"],
    setupHint: "Install: `npm i -g @anthropic-ai/claude-code`, then run `claude` to sign in (or set CLAUDE_CODE_OAUTH_TOKEN).",
  },
  codex: {
    id: "codex",
    label: "OpenAI Codex CLI",
    shortHint: "ChatGPT Plus/Pro subscription or OpenAI key",
    kind: "cli",
    protocol: "cli",
    bin: "codex",
    envKeys: ["OPENAI_API_KEY"],
    defaultModel: "",
    defaultPlanModel: "",
    popularModels: ["gpt-5.4", "gpt-5.3-codex", "o3"],
    setupHint: "Install: `npm i -g @openai/codex`, then run `codex` to sign in (or set OPENAI_API_KEY).",
  },
  "gemini-cli": {
    id: "gemini-cli",
    label: "Google Gemini CLI",
    shortHint: "Google account sign-in or GEMINI_API_KEY",
    kind: "cli",
    protocol: "cli",
    bin: "gemini",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultModel: "",
    defaultPlanModel: "",
    popularModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    setupHint: "Install: `npm i -g @google/gemini-cli`, then run `gemini` to sign in (or set GEMINI_API_KEY).",
  },
  opencode: {
    id: "opencode",
    label: "OpenCode CLI",
    shortHint: "75+ models via OpenCode (provider/model)",
    kind: "cli",
    protocol: "cli",
    bin: "opencode",
    envKeys: [],
    defaultModel: "",
    defaultPlanModel: "",
    popularModels: ["anthropic/claude-sonnet-4-5", "openai/gpt-5", "google/gemini-2.5-pro", "openrouter/auto"],
    setupHint: "Install: https://opencode.ai, then run `opencode auth login`.",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic API",
    shortHint: "Direct Claude API via ANTHROPIC_API_KEY",
    kind: "api",
    protocol: "anthropic",
    envKeys: ["ANTHROPIC_API_KEY"],
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    defaultPlanModel: "claude-sonnet-4-5",
    popularModels: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    setupHint: "Set ANTHROPIC_API_KEY (from https://console.anthropic.com).",
  },
  openai: {
    id: "openai",
    label: "OpenAI API",
    shortHint: "Direct OpenAI API via OPENAI_API_KEY",
    kind: "api",
    protocol: "openai",
    envKeys: ["OPENAI_API_KEY"],
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5",
    defaultPlanModel: "gpt-4.1",
    popularModels: ["gpt-5", "gpt-4.1", "gpt-4o", "o3"],
    setupHint: "Set OPENAI_API_KEY (from https://platform.openai.com/api-keys).",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini API",
    shortHint: "Direct Gemini API via GEMINI_API_KEY",
    kind: "api",
    protocol: "gemini",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    baseUrlEnv: "GEMINI_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-pro",
    defaultPlanModel: "gemini-2.5-flash",
    popularModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    setupHint: "Set GEMINI_API_KEY (from https://aistudio.google.com/apikey).",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter API",
    shortHint: "200+ models via OPENROUTER_API_KEY",
    kind: "api",
    protocol: "openai",
    envKeys: ["OPENROUTER_API_KEY"],
    baseUrlEnv: "OPENROUTER_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4.5",
    defaultPlanModel: "anthropic/claude-sonnet-4.5",
    popularModels: [
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-5",
      "google/gemini-2.5-pro",
      "deepseek/deepseek-chat-v3-0324",
      "qwen/qwen3-coder",
    ],
    setupHint: "Set OPENROUTER_API_KEY (from https://openrouter.ai/keys).",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek API",
    shortHint: "DeepSeek Chat / Reasoner via DEEPSEEK_API_KEY",
    kind: "api",
    protocol: "openai",
    envKeys: ["DEEPSEEK_API_KEY"],
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    defaultPlanModel: "deepseek-chat",
    popularModels: ["deepseek-chat", "deepseek-reasoner"],
    setupHint: "Set DEEPSEEK_API_KEY (from https://platform.deepseek.com).",
  },
  xai: {
    id: "xai",
    label: "xAI (Grok) API",
    shortHint: "Grok models via XAI_API_KEY",
    kind: "api",
    protocol: "openai",
    envKeys: ["XAI_API_KEY"],
    baseUrlEnv: "XAI_BASE_URL",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    defaultPlanModel: "grok-3-mini",
    popularModels: ["grok-4", "grok-3", "grok-3-mini"],
    setupHint: "Set XAI_API_KEY (from https://console.x.ai).",
  },
  groq: {
    id: "groq",
    label: "Groq API",
    shortHint: "Ultra-fast inference via GROQ_API_KEY",
    kind: "api",
    protocol: "openai",
    envKeys: ["GROQ_API_KEY"],
    baseUrlEnv: "GROQ_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    defaultPlanModel: "llama-3.3-70b-versatile",
    popularModels: ["llama-3.3-70b-versatile", "qwen/qwen3-32b"],
    setupHint: "Set GROQ_API_KEY (from https://console.groq.com).",
  },
  mistral: {
    id: "mistral",
    label: "Mistral API",
    shortHint: "Codestral / Mistral Large via MISTRAL_API_KEY",
    kind: "api",
    protocol: "openai",
    envKeys: ["MISTRAL_API_KEY"],
    baseUrlEnv: "MISTRAL_BASE_URL",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    defaultPlanModel: "mistral-small-latest",
    popularModels: ["mistral-large-latest", "codestral-latest", "devstral-medium-latest"],
    setupHint: "Set MISTRAL_API_KEY (from https://console.mistral.ai).",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (Local)",
    shortHint: "Local models via OLLAMA_HOST (free & offline)",
    kind: "api",
    protocol: "openai",
    envKeys: ["OLLAMA_HOST", "OLLAMA_MODEL"],
    baseUrlEnv: "OLLAMA_HOST",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5-coder:32b",
    defaultPlanModel: "qwen2.5-coder:14b",
    popularModels: ["qwen2.5-coder:32b", "qwen3:32b", "llama3.3:70b", "deepseek-r1:32b"],
    setupHint: "Install Ollama (https://ollama.com), pull a tool-capable model, and set OLLAMA_MODEL.",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-Compatible API",
    shortHint: "Any custom base URL (LM Studio, vLLM, Together, Azure)",
    kind: "api",
    protocol: "openai",
    envKeys: ["AI_BASE_URL", "OPENAI_BASE_URL"],
    baseUrlEnv: "AI_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "default",
    defaultPlanModel: "default",
    popularModels: ["custom-model-name"],
    setupHint: "Set AI_BASE_URL (or OPENAI_BASE_URL) and optional AI_API_KEY / OPENAI_API_KEY.",
  },
};

export const VALID_PROVIDERS: ProviderId[] = [
  "auto",
  ...(Object.keys(PROVIDER_CATALOG) as ConcreteProviderId[]),
];

const PROVIDER_ALIASES: Record<string, ProviderId> = {
  auto: "auto",
  claude: "claude",
  "claude-code": "claude",
  claudecode: "claude",
  codex: "codex",
  "openai-codex": "codex",
  "gemini-cli": "gemini-cli",
  geminicli: "gemini-cli",
  opencode: "opencode",
  "open-code": "opencode",
  anthropic: "anthropic",
  openai: "openai",
  gpt: "openai",
  chatgpt: "openai",
  gemini: "gemini",
  google: "gemini",
  "google-gemini": "gemini",
  openrouter: "openrouter",
  "open-router": "openrouter",
  deepseek: "deepseek",
  xai: "xai",
  grok: "xai",
  groq: "groq",
  mistral: "mistral",
  ollama: "ollama",
  "openai-compatible": "openai-compatible",
  compatible: "openai-compatible",
  custom: "openai-compatible",
  lmstudio: "openai-compatible",
  vllm: "openai-compatible",
};

export function normalizeProvider(raw: string | undefined | null): ProviderId | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!s) return null;
  return PROVIDER_ALIASES[s] ?? null;
}

export function commandExists(bin: string): boolean {
  const res = spawnSync("which", [bin], { encoding: "utf8" });
  return res.status === 0 && Boolean(res.stdout.trim());
}

export type ProviderStatus = {
  info: ProviderInfo;
  available: boolean;
  reason: string;
};

export function getApiKeyForProvider(
  id: ConcreteProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const info = PROVIDER_CATALOG[id];
  for (const k of info.envKeys) {
    const v = env[k]?.trim();
    if (v && k !== "OLLAMA_HOST" && k !== "OLLAMA_MODEL" && k !== "AI_BASE_URL" && k !== "OPENAI_BASE_URL") {
      return v;
    }
  }
  if (id === "openai-compatible") {
    return env.AI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "not-required";
  }
  if (id === "ollama") {
    return env.OLLAMA_API_KEY?.trim() || "ollama";
  }
  return undefined;
}

export function getBaseUrlForProvider(
  id: ConcreteProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const info = PROVIDER_CATALOG[id];
  if (id === "ollama") {
    const host = (env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "");
    return host.endsWith("/v1") ? host : `${host}/v1`;
  }
  if (id === "openai-compatible") {
    return (env.AI_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || info.defaultBaseUrl || "").replace(/\/+$/, "");
  }
  const override = info.baseUrlEnv ? env[info.baseUrlEnv]?.trim() : undefined;
  return (override || info.defaultBaseUrl || "").replace(/\/+$/, "");
}

export function detectProviders(
  opts: { env?: NodeJS.ProcessEnv; hasBin?: (bin: string) => boolean } = {},
): ProviderStatus[] {
  const env = opts.env ?? process.env;
  const hasBin = opts.hasBin ?? commandExists;

  const order: ConcreteProviderId[] = [
    "claude",
    "codex",
    "gemini-cli",
    "opencode",
    "anthropic",
    "openai",
    "gemini",
    "openrouter",
    "deepseek",
    "xai",
    "mistral",
    "groq",
    "ollama",
    "openai-compatible",
  ];

  return order.map((id) => {
    const info = PROVIDER_CATALOG[id];
    if (info.kind === "cli") {
      const installed = Boolean(info.bin && hasBin(info.bin));
      return {
        info,
        available: installed,
        reason: installed ? `CLI installed (${info.bin})` : `CLI not installed`,
      };
    }
    if (id === "ollama") {
      const configured = Boolean(env.OLLAMA_HOST?.trim() || env.OLLAMA_MODEL?.trim() || hasBin("ollama"));
      return {
        info,
        available: configured,
        reason: configured ? getBaseUrlForProvider("ollama", env) : "not detected",
      };
    }
    if (id === "openai-compatible") {
      const configured = Boolean(env.AI_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim());
      return {
        info,
        available: configured,
        reason: configured ? getBaseUrlForProvider("openai-compatible", env) : "AI_BASE_URL not set",
      };
    }
    const matchedKey = info.envKeys.find((k) => Boolean(env[k]?.trim()));
    return {
      info,
      available: Boolean(matchedKey),
      reason: matchedKey ? `${matchedKey} set` : `${info.envKeys[0]} not set`,
    };
  });
}

export type ResolvedProvider = {
  id: ConcreteProviderId;
  info: ProviderInfo;
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

/**
 * Resolve the provider + model for either the creative director (`purpose: "creative"`)
 * or the JSON planner (`purpose: "plan"`).
 */
export function resolveProvider(
  requested: string | undefined | null,
  opts: {
    model?: string;
    purpose?: "creative" | "plan";
    env?: NodeJS.ProcessEnv;
    hasBin?: (bin: string) => boolean;
  } = {},
): ResolvedProvider {
  const env = opts.env ?? process.env;
  const hasBin = opts.hasBin ?? commandExists;
  const purpose = opts.purpose ?? "creative";
  const rawReq = (requested ?? "").trim();
  const normalized = rawReq ? normalizeProvider(rawReq) : "auto";
  if (rawReq && !normalized) {
    throw new Error(`Unknown AI provider "${rawReq}". Valid providers: ${VALID_PROVIDERS.join(", ")}`);
  }

  const statuses = detectProviders({ env, hasBin });
  const isAvail = (id: ConcreteProviderId) => statuses.some((s) => s.info.id === id && s.available);

  let chosen: ConcreteProviderId | null = null;

  if (!normalized || normalized === "auto") {
    // In planning mode, direct API keys are fastest (single HTTP call); otherwise fall back to CLIs.
    // In creative mode, prefer native coding CLIs when installed, else any configured API provider.
    const preference: ConcreteProviderId[] =
      purpose === "plan"
        ? [
            "anthropic",
            "openai",
            "gemini",
            "openrouter",
            "deepseek",
            "xai",
            "mistral",
            "groq",
            "claude",
            "codex",
            "gemini-cli",
            "opencode",
            "openai-compatible",
            "ollama",
          ]
        : [
            "claude",
            "codex",
            "gemini-cli",
            "opencode",
            "anthropic",
            "openai",
            "gemini",
            "openrouter",
            "deepseek",
            "xai",
            "mistral",
            "groq",
            "openai-compatible",
            "ollama",
          ];

    // Special case: if CLAUDE_CODE_OAUTH_TOKEN is explicitly set (e.g. GitHub Actions), prefer claude CLI first.
    if (env.CLAUDE_CODE_OAUTH_TOKEN?.trim() && isAvail("claude")) {
      chosen = "claude";
    } else {
      chosen = preference.find((id) => isAvail(id)) ?? null;
    }

    if (!chosen) {
      throw new Error(
        "No AI provider found. Install one of `claude`, `codex`, `gemini`, or `opencode` — OR set an API key " +
          "(ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, or OLLAMA_HOST).",
      );
    }
  } else {
    // Smart bridge for friendly names: e.g. `--provider openai` uses OpenAI API if key is set,
    // or falls back to Codex CLI if only `codex` is installed (and vice versa for gemini/claude).
    if (normalized === "openai" && !isAvail("openai") && isAvail("codex")) {
      chosen = "codex";
    } else if (normalized === "gemini" && !isAvail("gemini") && isAvail("gemini-cli")) {
      chosen = "gemini-cli";
    } else if (normalized === "claude" && !isAvail("claude") && isAvail("anthropic")) {
      chosen = "anthropic";
    } else {
      chosen = normalized;
    }
  }

  const info = PROVIDER_CATALOG[chosen];
  const envModel =
    (chosen === "ollama" ? env.OLLAMA_MODEL?.trim() : undefined) ||
    (purpose === "plan" ? env.BRIEF_MODEL?.trim() : env.CREATIVE_MODEL?.trim()) ||
    env.AI_MODEL?.trim();
  const model =
    opts.model?.trim() ||
    envModel ||
    (purpose === "plan" ? info.defaultPlanModel : info.defaultModel);

  const apiKey = info.kind === "api" ? getApiKeyForProvider(chosen, env) : undefined;
  const baseUrl = info.kind === "api" ? getBaseUrlForProvider(chosen, env) : undefined;

  return { id: chosen, info, model, baseUrl, apiKey };
}

/** Extract assistant text from an OpenCode `--format json` JSONL stream. */
export function extractOpenCodeText(jsonl: string): string {
  const chunks: string[] = [];
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const ev = JSON.parse(trimmed) as Record<string, any>;
      if (ev.type === "text" && typeof ev.part?.text === "string") {
        chunks.push(ev.part.text);
      } else if (typeof ev.text === "string") {
        chunks.push(ev.text);
      }
    } catch {
      // ignore non-json log lines
    }
  }
  return chunks.join("").trim();
}

/** Unified single-turn completion across ALL API & CLI providers (used by brief.ts). */
export async function callTextCompletion(opts: {
  provider?: string;
  model?: string;
  system: string;
  user: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ text: string; resolved: ResolvedProvider }> {
  const env = opts.env ?? process.env;
  const resolved = resolveProvider(opts.provider || env.BRIEF_PROVIDER || env.AI_PROVIDER || "auto", {
    model: opts.model,
    purpose: "plan",
    env,
  });

  if (resolved.info.protocol === "anthropic") {
    if (!resolved.apiKey) throw new Error(`${resolved.info.label}: ${resolved.info.setupHint}`);
    const r = await fetch(`${resolved.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": resolved.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: resolved.model,
        max_tokens: 8000,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as { content?: { text?: string }[] };
    return { text: (j.content ?? []).map((c) => c.text ?? "").join(""), resolved };
  }

  if (resolved.info.protocol === "openai") {
    if (!resolved.apiKey) throw new Error(`${resolved.info.label}: ${resolved.info.setupHint}`);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      Authorization: `Bearer ${resolved.apiKey}`,
    };
    if (resolved.id === "openrouter") {
      headers["HTTP-Referer"] = "https://github.com/zekooo0/gitcut";
      headers["X-Title"] = "GitCut";
    }
    const r = await fetch(`${resolved.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: resolved.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!r.ok) throw new Error(`${resolved.info.label}: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: j.choices?.[0]?.message?.content ?? "", resolved };
  }

  if (resolved.info.protocol === "gemini") {
    if (!resolved.apiKey) throw new Error(`${resolved.info.label}: ${resolved.info.setupHint}`);
    const url = `${resolved.baseUrl}/models/${encodeURIComponent(resolved.model)}:generateContent?key=${encodeURIComponent(resolved.apiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
      }),
    });
    if (!r.ok) throw new Error(`Gemini: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return { text, resolved };
  }

  // CLI single-turn fallback
  const combinedPrompt = `${opts.system}\n\n${opts.user}`;

  if (resolved.id === "claude") {
    const childEnv = { ...env };
    if (!childEnv.ANTHROPIC_API_KEY) delete childEnv.ANTHROPIC_API_KEY;
    const args = ["-p", "--system-prompt", opts.system, "--max-turns", "1", "--output-format", "json"];
    if (resolved.model) args.push("--model", resolved.model);
    const out = execFileSync("claude", args, {
      input: opts.user,
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    const j = JSON.parse(out) as { is_error?: boolean; result?: string };
    if (j.is_error) throw new Error(`Claude Code: ${j.result ?? out.slice(0, 500)}`);
    return { text: j.result ?? "", resolved };
  }

  if (resolved.id === "codex") {
    const tmp = mkdtempSync(join(tmpdir(), "gitcut-codex-"));
    const outFile = join(tmp, "last.txt");
    try {
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "-o",
        outFile,
      ];
      if (resolved.model) args.push("-m", resolved.model);
      args.push("-");
      execFileSync("codex", args, {
        input: combinedPrompt,
        env,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: 10 * 60_000,
      });
      return { text: readFileSync(outFile, "utf8"), resolved };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  if (resolved.id === "gemini-cli") {
    const args = ["-p", "Follow the instructions provided on stdin and respond with JSON only.", "--skip-trust", "--output-format", "json"];
    if (resolved.model) args.push("-m", resolved.model);
    const out = execFileSync("gemini", args, {
      input: combinedPrompt,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    try {
      const j = JSON.parse(out) as { response?: string; text?: string };
      return { text: j.response ?? j.text ?? out, resolved };
    } catch {
      return { text: out, resolved };
    }
  }

  if (resolved.id === "opencode") {
    const args = ["run", "--format", "json", "--archived"];
    if (resolved.model) args.push("--model", resolved.model);
    args.push(combinedPrompt);
    const out = execFileSync("opencode", args, {
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    return { text: extractOpenCodeText(out) || out, resolved };
  }

  throw new Error(`Unsupported provider: ${resolved.id}`);
}

export function formatProvidersTable(statuses: ProviderStatus[]): string {
  const lines = [
    "GitCut AI Providers (use --provider <id> --model <name>)",
    "",
    "  Agentic CLIs (subscription or API key):",
  ];
  for (const s of statuses.filter((x) => x.info.kind === "cli")) {
    const icon = s.available ? "✓" : "○";
    lines.push(`    ${icon} ${s.info.id.padEnd(18)} ${s.info.label.padEnd(22)} ${s.reason}`);
  }
  lines.push("", "  Direct API Providers (built-in multimodal agent, zero CLI install):");
  for (const s of statuses.filter((x) => x.info.kind === "api")) {
    const icon = s.available ? "✓" : "○";
    lines.push(`    ${icon} ${s.info.id.padEnd(18)} ${s.info.label.padEnd(22)} ${s.reason}`);
  }
  lines.push(
    "",
    "Examples:",
    "  gitcut repo owner/repo --provider claude --model sonnet",
    "  gitcut repo owner/repo --provider codex --model gpt-5.4",
    "  gitcut repo owner/repo --provider gemini --model gemini-2.5-pro",
    "  gitcut repo owner/repo --provider opencode --model anthropic/claude-sonnet-4-5",
    "  gitcut repo owner/repo --provider openrouter --model deepseek/deepseek-chat-v3-0324",
    "  gitcut repo owner/repo --provider ollama --model qwen2.5-coder:32b",
  );
  return lines.join("\n");
}
