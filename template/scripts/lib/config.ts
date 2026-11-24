/**
 * Global user configuration stored at ~/.config/gitcut/config.json
 * (respects GITCUT_CONFIG and XDG_CONFIG_HOME). Zero external dependencies.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { FormatName } from "./format.ts";
import type { ProviderId } from "./providers.ts";
import type { StyleName } from "./style.ts";

export type UserConfig = {
  provider?: ProviderId;
  model?: string;
  format?: FormatName;
  style?: StyleName;
  captions?: boolean;
  audio?: "auto" | "elevenlabs" | "silent";
};

export function getUserConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GITCUT_CONFIG?.trim()) return env.GITCUT_CONFIG.trim();
  const base = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "gitcut", "config.json");
}

export function loadUserConfig(env: NodeJS.ProcessEnv = process.env): UserConfig {
  const p = getUserConfigPath(env);
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return {};
    return raw as UserConfig;
  } catch {
    return {};
  }
}

export function saveUserConfig(cfg: UserConfig, env: NodeJS.ProcessEnv = process.env): string {
  const p = getUserConfigPath(env);
  mkdirSync(dirname(p), { recursive: true });
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v !== undefined && v !== "") cleaned[k] = v;
  }
  writeFileSync(p, JSON.stringify(cleaned, null, 2) + "\n", "utf8");
  return p;
}

export function updateUserConfig(patch: Partial<UserConfig>, env: NodeJS.ProcessEnv = process.env): { path: string; config: UserConfig } {
  const current = loadUserConfig(env);
  const next: UserConfig = { ...current, ...patch };
  // If provider changed without an explicit model override, drop stale model from previous provider.
  if (patch.provider !== undefined && patch.provider !== current.provider && patch.model === undefined) {
    delete next.model;
  }
  if (patch.model === "") delete next.model;
  const path = saveUserConfig(next, env);
  return { path, config: loadUserConfig(env) };
}

export function resetUserConfig(env: NodeJS.ProcessEnv = process.env): string {
  const p = getUserConfigPath(env);
  if (existsSync(p)) rmSync(p, { force: true });
  return p;
}

export function formatUserConfig(cfg: UserConfig, configPath: string): string {
  const lines = [
    `GitCut global config (${configPath})`,
    "",
    `  provider   ${cfg.provider ?? "auto (not set)"}`,
    `  model      ${cfg.model ?? "(provider default)"}`,
  ];
  if (cfg.format) lines.push(`  format     ${cfg.format}`);
  if (cfg.style) lines.push(`  style      ${cfg.style}`);
  if (cfg.captions !== undefined) lines.push(`  captions   ${cfg.captions ? "on" : "off"}`);
  if (cfg.audio) lines.push(`  audio      ${cfg.audio}`);
  lines.push(
    "",
    "Update anytime:",
    "  gitcut config                                      # interactive picker",
    "  gitcut config set --provider codex --model gpt-5.4 # set directly",
    "  gitcut config reset                                # reset to auto",
  );
  return lines.join("\n");
}
