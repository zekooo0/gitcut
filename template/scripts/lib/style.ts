/**
 * Visual style presets & website design-token integration.
 * Prevents LLM mode-collapse into generic dark-navy + blue-glow videos by giving each film
 * an explicit visual system derived either from the live website's real CSS theme or a
 * distinct art-direction preset.
 */

export type StyleName =
  | "auto"
  | "brand-native"
  | "editorial-light"
  | "soft-studio"
  | "kinetic-bold"
  | "terminal-brutalist"
  | "dark-glow";

export type ConcreteStyleName = Exclude<StyleName, "auto">;

export type ExtractedTheme = {
  mode: "light" | "dark";
  background: string;
  surface?: string;
  text: string;
  accent?: string;
  headingFont?: string;
  bodyFont?: string;
  radius?: string;
  metaDescription?: string;
  ogTitle?: string;
};

export type StyleSpec = {
  name: ConcreteStyleName;
  label: string;
  summary: string;
  palette: {
    background: string;
    surface: string;
    ink: string;
    muted: string;
    accent: string;
  };
  typography: string;
  motion: string;
  forbidden: string[];
  recommendedCards: string[];
};

const PRESETS: Record<Exclude<ConcreteStyleName, "brand-native">, StyleSpec> = {
  "editorial-light": {
    name: "editorial-light",
    label: "Editorial Light",
    summary: "Warm magazine/paper aesthetic with crisp charcoal ink, expressive serif headlines, and Swiss grid rules.",
    palette: {
      background: "#F6F3EC",
      surface: "#FFFFFF",
      ink: "#141413",
      muted: "#5C5A54",
      accent: "#C84B31",
    },
    typography: "Expressive serif display headlines (Instrument Serif or Playfair Display) paired with clean humanist sans (Plus Jakarta Sans) and crisp hairline 1px dividers.",
    motion: "Editorial poise: calm ease-out reveals, paper-slide wipes, underline draws, zero bounce, zero neon.",
    forbidden: [
      "NO dark or navy backgrounds (#070B16, #0A0E1A, etc.)",
      "NO radial blue/purple ambient glows or neon borders",
      "NO generic Inter-only dark SaaS cards",
    ],
    recommendedCards: [
      "typography/paper-title-card.md",
      "typography/marker-underline-title.md",
      "typography/document-typewriter-reveal.md",
      "ui-entrance/deck-deal-flyin.md",
      "transition/page-turn-transitions.md",
      "outro/ui-strip-away-outro.md",
    ],
  },
  "soft-studio": {
    name: "soft-studio",
    label: "Soft Studio (Light Keynote)",
    summary: "Airy alabaster daylight studio with soft multi-layered shadows, floating rounded UI cards, and gentle Apple-keynote spring physics.",
    palette: {
      background: "#F8FAFC",
      surface: "#FFFFFF",
      ink: "#0F172A",
      muted: "#64748B",
      accent: "#0D9488",
    },
    typography: "Geometric modern sans (Plus Jakarta Sans or DM Sans) with generous whitespace and subtle pill labels.",
    motion: "Smooth, buoyant keynote springs with clean camera rise/tilt and soft shadow depth.",
    forbidden: [
      "NO dark backgrounds or cyber/neon glows",
      "NO harsh 0px brutalist borders",
    ],
    recommendedCards: [
      "opening/crane-rise-reveal.md",
      "ui-entrance/card-stack.md",
      "ui-entrance/carousel-3d.md",
      "effects/aurora-bloom-bg-flip.md",
      "transition/circle-match-iris.md",
      "outro/outro-group-photo-launch.md",
    ],
  },
  "kinetic-bold": {
    name: "kinetic-bold",
    label: "Kinetic Bold (Launch Trailer)",
    summary: "High-energy poster launch trailer with full-bleed color-block scene flips, oversized display type, and punchy rhythmic cuts.",
    palette: {
      background: "#111111",
      surface: "#FFFFFF",
      ink: "#FFFFFF",
      muted: "#A1A1AA",
      accent: "#FF4D2D",
    },
    typography: "Oversized tight-tracked display type (Space Grotesk or Syne or Archivo Black) — alternate full-bleed vivid accent scenes, stark white scenes, and deep black scenes.",
    motion: "Snappy, high-energy cuts with bold scale slams, word relays, and white-flash transitions.",
    forbidden: [
      "NO sleepy uniform dark-navy background across all scenes — alternate bold full-bleed color blocks!",
      "NO soft blurry radial glows",
    ],
    recommendedCards: [
      "opening/text-as-mask.md",
      "typography/outline-word-fill.md",
      "typography/word-relay-filmstrip.md",
      "effects/slam-entrance-moves.md",
      "rhythm/beat-cut-moves.md",
      "transition/white-flash-logo-simplify-cut.md",
    ],
  },
  "terminal-brutalist": {
    name: "terminal-brutalist",
    label: "Terminal Brutalist",
    summary: "Raw engineering aesthetic: stark high-contrast monochrome with razor-sharp 1–2px borders, 0px corners, monospace grids, and a single electric accent.",
    palette: {
      background: "#0D0D0D",
      surface: "#161616",
      ink: "#F4F4F0",
      muted: "#8A8A85",
      accent: "#B6FF3B",
    },
    typography: "Monospace-first (IBM Plex Mono or JetBrains Mono) with bold geometric uppercase labels, index numbers ([01], [02]), and visible grid lines.",
    motion: "Mechanical, crisp, zero-blur snap transitions, bracket scans, and typewriter reveals.",
    forbidden: [
      "NO soft rounded glassmorphism or blurry blue radial glows",
      "NO generic macOS 3-dot traffic lights unless showing a real terminal",
    ],
    recommendedCards: [
      "opening/stroke-segment-build.md",
      "typography/brace-expand.md",
      "typography/typewriter-moves.md",
      "effects/scan-bracket-sweep.md",
      "rhythm/panel-grid-moves.md",
      "outro/ui-to-brand-morph.md",
    ],
  },
  "dark-glow": {
    name: "dark-glow",
    label: "Dark Glow",
    summary: "Sleek midnight obsidian stage with controlled ambient lighting, crisp glass surfaces, and calm precision.",
    palette: {
      background: "#070B16",
      surface: "#10172A",
      ink: "#F8FAFC",
      muted: "#94A3B8",
      accent: "#3B82F6",
    },
    typography: "Clean neo-grotesque sans (Inter or Geist) with JetBrains Mono for code/metrics.",
    motion: "Calm ease-out motion, spotlight sweeps, and controlled depth layering.",
    forbidden: ["NO overcrowded text or muddy low-contrast overlays"],
    recommendedCards: [
      "opening/spotlight-hero-card.md",
      "effects/spotlight-sweep-moves.md",
      "camera/depth-layer-moves.md",
      "ui-entrance/list-reveal.md",
      "outro/logo-shrink-wordmark-lockup.md",
    ],
  },
};

const AUTO_REPO_POOL: Exclude<ConcreteStyleName, "brand-native" | "dark-glow">[] = [
  "editorial-light",
  "soft-studio",
  "kinetic-bold",
  "terminal-brutalist",
];

export const VALID_STYLES: StyleName[] = [
  "auto",
  "brand-native",
  "editorial-light",
  "soft-studio",
  "kinetic-bold",
  "terminal-brutalist",
  "dark-glow",
];

export function normalizeStyle(raw: string | undefined): StyleName | null {
  if (!raw) return "auto";
  const v = raw.trim().toLowerCase().replace(/_/g, "-");
  return (VALID_STYLES as string[]).includes(v) ? (v as StyleName) : null;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildBrandNative(theme: ExtractedTheme, accentOverride?: string): StyleSpec {
  const isLight = theme.mode === "light";
  const accent = accentOverride || theme.accent || (isLight ? "#C84B31" : "#38BDF8");
  const bg = theme.background || (isLight ? "#FFFFFF" : "#0B0E14");
  const surface = theme.surface || (isLight ? "#F8FAFC" : "#151923");
  const ink = theme.text || (isLight ? "#111827" : "#F8FAFC");
  const muted = isLight ? "#52525B" : "#9CA3AF";
  const heading = theme.headingFont || "the site's own heading font (or closest Google Font match)";
  const body = theme.bodyFont || "the site's own body font";

  return {
    name: "brand-native",
    label: `Brand-Native (${isLight ? "Light" : "Dark"} — matched to live site)`,
    summary: `Directly matches the live website's real ${isLight ? "light" : "dark"} design system extracted from computed CSS.`,
    palette: { background: bg, surface, ink, muted, accent },
    typography: `Match the live site's typography: headings in ${heading}, body in ${body}; match corner radius (${theme.radius || "8px"}).`,
    motion: isLight
      ? "Clean, confident daylight product motion with crisp shadows and natural UI transitions matching the live site."
      : "High-contrast precision motion anchored in the live site's real dark surfaces and brand accent.",
    forbidden: isLight
      ? [
          "DO NOT invent a dark/navy background! The live website is LIGHT — keep the film bright and native to its real palette.",
          "DO NOT use unrelated default blue glows unless the site's actual accent is blue.",
        ]
      : [
          "DO NOT ignore the site's extracted accent color or fall back to generic blue (#2563EB) if the site uses a different brand color.",
        ],
    recommendedCards: isLight
      ? [
          "opening/crane-rise-reveal.md",
          "opening/brand-ink-open.md",
          "camera/cursor-flyover.md",
          "typography/marker-underline-title.md",
          "ui-entrance/deck-deal-flyin.md",
          "transition/page-turn-transitions.md",
          "outro/ui-strip-away-outro.md",
        ]
      : [
          "opening/spotlight-hero-card.md",
          "camera/depth-layer-moves.md",
          "effects/scanline-annotate-focus.md",
          "effects/brand-frame-snap.md",
          "typography/vertical-word-roll-blur-cycle.md",
          "transition/line-carry-transition.md",
          "outro/ui-to-brand-morph.md",
        ],
  };
}

export function resolveStyle(
  requested: string | undefined,
  opts: { theme?: ExtractedTheme | null; seed?: string; accentOverride?: string } = {},
): StyleSpec {
  const norm = normalizeStyle(requested);
  if (!norm) {
    throw new Error(`Unknown style "${requested}". Valid styles: ${VALID_STYLES.join(", ")}.`);
  }

  let chosen: ConcreteStyleName;
  if (norm === "auto") {
    if (opts.theme) {
      chosen = "brand-native";
    } else {
      const idx = hashSeed(opts.seed || "gitcut") % AUTO_REPO_POOL.length;
      chosen = AUTO_REPO_POOL[idx];
    }
  } else if (norm === "brand-native" && !opts.theme) {
    chosen = "editorial-light";
  } else {
    chosen = norm;
  }

  if (chosen === "brand-native" && opts.theme) {
    return buildBrandNative(opts.theme, opts.accentOverride);
  }

  const base = PRESETS[chosen as Exclude<ConcreteStyleName, "brand-native">];
  return {
    ...base,
    palette: {
      ...base.palette,
      ...(opts.accentOverride ? { accent: opts.accentOverride } : {}),
    },
  };
}

export function renderStyleBriefSection(spec: StyleSpec, theme?: ExtractedTheme | null): string {
  const extractedBlock = theme
    ? `\nExtracted live-website design tokens (also in \`./input/theme.json\`):
- Mode: **${theme.mode}** · Background: \`${theme.background}\`${theme.surface ? ` · Surface: \`${theme.surface}\`` : ""} · Ink: \`${theme.text}\`${theme.accent ? ` · Site accent: \`${theme.accent}\`` : ""}
- Fonts: heading \`${theme.headingFont || "unknown"}\`, body \`${theme.bodyFont || "unknown"}\` · Radius: \`${theme.radius || "unknown"}\`\n`
    : "";

  return `## Visual direction: ${spec.label} (\`${spec.name}\`)
${spec.summary}
${extractedBlock}
Required palette & typography:
- Background: \`${spec.palette.background}\` · Surface: \`${spec.palette.surface}\` · Primary ink: \`${spec.palette.ink}\` · Muted ink: \`${spec.palette.muted}\` · Accent: \`${spec.palette.accent}\`
- Typography: ${spec.typography}
- Motion feel: ${spec.motion}

Anti-cliché constraints (MUST obey):
${spec.forbidden.map((r) => `- ${r}`).join("\n")}

Preferred shot cards for this style (pick at least 2 of your 3–5 cards from here or closely matching ones in \`./input/shots.md\`):
${spec.recommendedCards.map((c) => `- ${c}`).join("\n")}`;
}
