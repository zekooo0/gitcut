import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectProviders,
  extractOpenCodeText,
  formatProvidersTable,
  getBaseUrlForProvider,
  normalizeProvider,
  resolveProvider,
} from "./providers.ts";

test("normalizeProvider accepts canonical names and popular aliases", () => {
  assert.equal(normalizeProvider("auto"), "auto");
  assert.equal(normalizeProvider("Claude"), "claude");
  assert.equal(normalizeProvider("claude_code"), "claude");
  assert.equal(normalizeProvider("openai-codex"), "codex");
  assert.equal(normalizeProvider("chatgpt"), "openai");
  assert.equal(normalizeProvider("google"), "gemini");
  assert.equal(normalizeProvider("gemini-cli"), "gemini-cli");
  assert.equal(normalizeProvider("open-code"), "opencode");
  assert.equal(normalizeProvider("grok"), "xai");
  assert.equal(normalizeProvider("open-router"), "openrouter");
  assert.equal(normalizeProvider("lmstudio"), "openai-compatible");
  assert.equal(normalizeProvider("nonexistent"), null);
});

test("resolveProvider auto-detects installed CLIs and API keys cleanly", () => {
  // Creative mode prefers installed CLI when available
  const rCli = resolveProvider("auto", {
    purpose: "creative",
    env: { OPENAI_API_KEY: "sk-test" },
    hasBin: (b) => b === "codex",
  });
  assert.equal(rCli.id, "codex");

  // Plan mode prefers fast direct API when key is set
  const rPlan = resolveProvider("auto", {
    purpose: "plan",
    env: { GEMINI_API_KEY: "gem-test" },
    hasBin: (b) => b === "claude",
  });
  assert.equal(rPlan.id, "gemini");
  assert.equal(rPlan.model, "gemini-2.5-flash");

  // Direct API fallback when no CLI is installed
  const rApi = resolveProvider("auto", {
    purpose: "creative",
    env: { OPENROUTER_API_KEY: "or-test" },
    hasBin: () => false,
  });
  assert.equal(rApi.id, "openrouter");
  assert.equal(rApi.baseUrl, "https://openrouter.ai/api/v1");

  // Friendly bridge: --provider gemini falls back to gemini-cli if installed without API key
  const rBridge = resolveProvider("gemini", {
    purpose: "creative",
    env: {},
    hasBin: (b) => b === "gemini",
  });
  assert.equal(rBridge.id, "gemini-cli");

  // Global user config applies when no explicit provider/model is requested
  const rCfg = resolveProvider("", {
    purpose: "creative",
    env: {},
    userConfig: { provider: "opencode", model: "anthropic/claude-sonnet-4-5" },
    hasBin: (b) => b === "opencode" || b === "claude",
  });
  assert.equal(rCfg.id, "opencode");
  assert.equal(rCfg.model, "anthropic/claude-sonnet-4-5");

  // Explicit --provider overrides saved global config (and ignores stale model)
  const rOverride = resolveProvider("codex", {
    purpose: "creative",
    env: {},
    userConfig: { provider: "opencode", model: "anthropic/claude-sonnet-4-5" },
    hasBin: (b) => b === "codex" || b === "opencode",
  });
  assert.equal(rOverride.id, "codex");
  assert.equal(rOverride.model, "");

  // Throws helpful error when nothing is configured
  assert.throws(() => resolveProvider("auto", { env: {}, hasBin: () => false }), /No AI provider found/);
});

test("getBaseUrlForProvider normalizes Ollama and custom base URLs", () => {
  assert.equal(getBaseUrlForProvider("ollama", {}), "http://127.0.0.1:11434/v1");
  assert.equal(getBaseUrlForProvider("ollama", { OLLAMA_HOST: "http://gpu:11434/" }), "http://gpu:11434/v1");
  assert.equal(getBaseUrlForProvider("ollama", { OLLAMA_HOST: "http://gpu:11434/v1" }), "http://gpu:11434/v1");
  assert.equal(
    getBaseUrlForProvider("openai-compatible", { AI_BASE_URL: "https://my.proxy/v1/" }),
    "https://my.proxy/v1",
  );
});

test("extractOpenCodeText concatenates JSONL text events", () => {
  const sample = [
    JSON.stringify({ type: "step_start" }),
    JSON.stringify({ type: "text", part: { text: '{"routes":["/"]' } }),
    JSON.stringify({ type: "text", part: { text: ',"why":"ok"}' } }),
    JSON.stringify({ type: "step_finish" }),
  ].join("\n");
  assert.equal(extractOpenCodeText(sample), '{"routes":["/"],"why":"ok"}');
});

test("detectProviders and formatProvidersTable list CLIs and direct APIs", () => {
  const statuses = detectProviders({ env: { OPENAI_API_KEY: "sk-1" }, hasBin: (b) => b === "opencode" });
  const text = formatProvidersTable(statuses);
  assert.match(text, /✓ opencode/);
  assert.match(text, /✓ openai/);
  assert.match(text, /openrouter/);
  assert.match(text, /ollama/);
});
