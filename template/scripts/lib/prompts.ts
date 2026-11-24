/**
 * Zero-dependency interactive terminal UI prompts (arrow-key select, confirm, text input, banner).
 * Uses Node's built-in readline/TTY APIs and always restores cursor + raw mode on exit or Ctrl+C.
 */
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
};

const isColor = () => Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
export const style = {
  bold: (s: string) => (isColor() ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (isColor() ? `\x1b[2m${s}\x1b[0m` : s),
  cyan: (s: string) => (isColor() ? `\x1b[36m${s}\x1b[0m` : s),
  green: (s: string) => (isColor() ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isColor() ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (isColor() ? `\x1b[31m${s}\x1b[0m` : s),
};

export function renderBanner(version: string): string {
  const title = `🎬 GitCut  v${version}`;
  const sub = "Turn PRs, live apps, or GitHub READMEs into videos";
  const w = Math.max(title.length, sub.length) + 4;
  const top = `┌${"─".repeat(w)}┐`;
  const bot = `└${"─".repeat(w)}┘`;
  const pad = (s: string, visualLen: number) => `│  ${s}${" ".repeat(Math.max(1, w - 2 - visualLen))}│`;
  return [
    "",
    style.cyan(top),
    pad(style.bold(title), title.length), // 🎬 is surrogate pair (length 2) and 2 cells wide
    pad(style.dim(sub), sub.length),
    style.cyan(bot),
    "",
  ].join("\n");
}

export function renderSummaryBox(rows: [string, string][]): string {
  const labelW = Math.max(...rows.map(([k]) => k.length)) + 2;
  const lines = rows.map(([k, v]) => `  ${style.dim(k.padEnd(labelW))} ${v}`);
  return ["", style.bold("  Summary"), ...lines, ""].join("\n");
}

export function formatSelectFrame<T extends string>(
  title: string,
  options: SelectOption<T>[],
  index: number,
): string[] {
  const labelW = Math.max(...options.map((o) => o.label.length)) + 2;
  const lines = [`${style.cyan("◆")} ${style.bold(title)}`];
  options.forEach((opt, i) => {
    const active = i === index;
    const bullet = active ? style.cyan("●") : style.dim("○");
    const label = active ? style.bold(style.cyan(opt.label.padEnd(labelW))) : opt.label.padEnd(labelW);
    const hint = opt.hint ? style.dim(opt.hint) : "";
    lines.push(`  ${bullet} ${label}${hint}`);
  });
  lines.push(style.dim("  ↑/↓ to move · Enter to select · Ctrl+C to cancel"));
  return lines;
}

/** Interactive arrow-key selector (falls back to numbered prompt if raw TTY is unavailable). */
export async function selectPrompt<T extends string>(
  title: string,
  options: SelectOption<T>[],
  initialIndex = 0,
): Promise<T> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(`\n${title}`);
      options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}${o.hint ? ` — ${o.hint}` : ""}`));
      const ans = (await rl.question(`Choose 1-${options.length} [${initialIndex + 1}]: `)).trim();
      const idx = Math.max(0, Math.min(options.length - 1, (Number(ans) || initialIndex + 1) - 1));
      return options[idx].value;
    } finally {
      rl.close();
    }
  }

  let index = Math.max(0, Math.min(options.length - 1, initialIndex));
  let renderedLines = 0;

  const draw = () => {
    if (renderedLines > 0) {
      process.stdout.write(`\x1b[${renderedLines}A\x1b[J`);
    }
    const lines = formatSelectFrame(title, options, index);
    process.stdout.write(lines.join("\n") + "\n");
    renderedLines = lines.length;
  };

  return await new Promise<T>((resolve, reject) => {
    emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write("\x1b[?25l"); // hide cursor
    draw();

    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      process.stdout.write("\x1b[?25h"); // restore cursor
      if (!wasRaw) process.stdin.setRawMode(false);
      process.stdin.pause();
    };

    const onKey = (_str: string, key: { name?: string; ctrl?: boolean } = {}) => {
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        if (renderedLines > 0) process.stdout.write(`\x1b[${renderedLines}A\x1b[J`);
        cleanup();
        process.stdout.write(`${style.yellow("✖")} Cancelled.\n`);
        reject(new Error("CANCELLED"));
        return;
      }
      if (key.name === "up" || key.name === "k") {
        index = (index - 1 + options.length) % options.length;
        draw();
      } else if (key.name === "down" || key.name === "j") {
        index = (index + 1) % options.length;
        draw();
      } else if (key.name && /^[1-9]$/.test(key.name)) {
        const n = Number(key.name) - 1;
        if (n < options.length) {
          index = n;
          draw();
        }
      } else if (key.name === "return" || key.name === "enter") {
        const chosen = options[index];
        if (renderedLines > 0) process.stdout.write(`\x1b[${renderedLines}A\x1b[J`);
        cleanup();
        process.stdout.write(`${style.green("✓")} ${style.bold(title)}  ${style.cyan(chosen.label)}\n`);
        resolve(chosen.value);
      }
    };

    process.stdin.on("keypress", onKey);
  });
}

/** Interactive Yes/No confirm prompt. */
export async function confirmPrompt(title: string, defaultValue = true): Promise<boolean> {
  const val = await selectPrompt(
    title,
    [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    defaultValue ? 0 : 1,
  );
  return val === "yes";
}

/** Interactive text input with optional default and validation. */
export async function textPrompt(
  title: string,
  opts: { defaultValue?: string; placeholder?: string; validate?: (v: string) => string | null } = {},
): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const onSigint = () => {
    rl.close();
    process.stdout.write(`\n${style.yellow("✖")} Cancelled.\n`);
    process.exit(130);
  };
  process.once("SIGINT", onSigint);
  try {
    while (true) {
      const hint = opts.defaultValue
        ? style.dim(` [${opts.defaultValue}]`)
        : opts.placeholder
          ? style.dim(` (${opts.placeholder})`)
          : "";
      const raw = (await rl.question(`${style.cyan("◆")} ${style.bold(title)}${hint}: `)).trim();
      const value = raw || opts.defaultValue || "";
      const err = opts.validate ? opts.validate(value) : null;
      if (err) {
        console.log(`  ${style.red("!")} ${err}`);
        continue;
      }
      if (process.stdout.isTTY) {
        process.stdout.write(`\x1b[1A\x1b[2K${style.green("✓")} ${style.bold(title)}  ${style.cyan(value || "(none)")}\n`);
      }
      return value;
    }
  } finally {
    process.off("SIGINT", onSigint);
    rl.close();
  }
}
