/**
 * Capture runner: capture.json -> captures/*.png + positions.json + layout.json
 *
 *   node scripts/capture.ts public/features/<slug>
 *
 * Sign-in: see scripts/lib/session.ts (saved storage state locally, DEMO_EMAIL/DEMO_PASSWORD in CI).
 * Authoring rules: docs/authoring.md.
 *
 * Every pixel is the live app at DPR 2. Positions are measured in the DOM, never guessed.
 */
import { type Locator } from "playwright";
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSignedIn, hideCss as hideCssFor, loadSite, openSession, settle as settleFor, type Site } from "./lib/session.ts";

type Target = string; // any Playwright selector: "text=Date range", "role=button[name='Save']", "css=..."
type Action =
  | { click: Target }
  | { fill: Target; value: string }
  | { select: Target; value: string }
  | { press: string }
  | { hover: Target }
  | { waitFor: Target }
  | { wait: number }
  | { goto: string };
/** A Playwright selector, or exact visible text (searched inside the panel for panel shots);
 *  card: true walks up to the enclosing card (radius >= 8 with a border, a shadow or its own fill);
 *  field: true walks up to the smallest box holding the label AND its value or input. */
type ElementRef =
  | Target
  | { text: string; card?: boolean; field?: boolean; nth?: number; global?: boolean };
type Shot = {
  name: string;
  url?: string;
  actions?: Action[];
  waitFor?: Target;
  /** window = the viewport; panel = the scroll container (stitched); element = one element */
  kind: "window" | "panel" | "element";
  element?: Target;
  /** panel only: false = only the visible part of the panel (a menu-open state). Default true. */
  full?: boolean;
  elements?: Record<string, ElementRef>;
};
type CaptureSpec = Partial<Site> & {
  /** sites/<name>.json supplies baseUrl, login, panel, hide; fields here override it. */
  site?: string;
  shots: Shot[];
};

type Rect = [number, number, number, number];
type Positions = Record<string, { size: [number, number]; elements: Record<string, Rect> }>;

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/capture.ts public/features/<slug>");
  process.exit(2);
}
const spec = JSON.parse(readFileSync(join(dir, "capture.json"), "utf8")) as CaptureSpec;
const outCaps = join(dir, "captures");
mkdirSync(outCaps, { recursive: true });
const site = loadSite(spec, dir);
const VP = { width: 1440, height: 900, dpr: 2, ...site.viewport };
const DPR = VP.dpr ?? 2;

const { browser, page, url } = await openSession(site);
const hideCss = () => hideCssFor(page, site);
const settle = () => settleFor(page);
// Park the mouse off any hover target: a resting cursor bakes hover states into the frames.
const park = () => page.mouse.move(VP.width - 4, 4);

/**
 * page.locator(sel).first(), forgiving about the ROLE in a role selector: the LLM writes
 * role=link[name=/x/i] for what the page renders as a button (or the reverse). The name is
 * what matters, so when the given role finds nothing, try the same name as another
 * clickable role. Any other selector is used as is.
 */
const CLICKABLE = ["button", "link", "tab", "menuitem", "option", "checkbox", "radio"];
// roles that render the same thing; a data grid (MUI DataGrid) is role=grid, not role=table
const ROLE_FAMILIES = [CLICKABLE, ["table", "grid", "treegrid"], ["list", "listbox"]];
/**
 * The LLM often names a form field by its label or by the placeholder it saw in the code
 * ("Select environment"), while the live field is filled and shows a value instead. Try the
 * text as a field label, then as a placeholder. `t` is a text= pattern: /re/flags or plain.
 */
const asField = async (t: string): Promise<Locator | null> => {
  const re = t.match(/^\/(.*)\/([a-z]*)$/);
  const what: string | RegExp = re ? new RegExp(re[1], re[2]) : t.replace(/^["']|["']$/g, "");
  for (const [how, l] of [
    ["label", page.getByLabel(what)],
    ["placeholder", page.getByPlaceholder(what)],
  ] as const) {
    if ((await l.count()) > 0) {
      console.warn(`  text=${t} found nothing; using the field with that ${how}`);
      return l.first();
    }
  }
  return null;
};

// a bare tag the LLM writes for something a component library draws with divs
const TAG_TO_ROLE: Record<string, string> = { table: "table", ul: "list", ol: "list" };
const loc = async (sel0: string, waitMs = 8000): Promise<Locator> => {
  const tag = sel0.match(/^(table|ul|ol)(\s*>>.*)?$/);
  const sel = tag ? `role=${TAG_TO_ROLE[tag[1]]}${tag[2] ?? ""}` : sel0;
  const first = page.locator(sel).first();
  const tx = sel.match(/^text=(.+)$/);
  if (tx) {
    if (await first.waitFor({ timeout: waitMs }).then(() => true, () => false)) return first;
    return (await asField(tx[1])) ?? first;
  }
  // role=<role>[<attrs>]<rest>, e.g. role=link[name=/x/i] or role=table >> nth=0
  const m = sel.match(/^role=(\w+)(\[[^\]]*\])?(.*)$/);
  if (!m) return first;
  const [, role, attrs = "", rest] = m;
  if (await first.waitFor({ timeout: waitMs }).then(() => true, () => false)) return first;
  const family = ROLE_FAMILIES.find((f) => f.includes(role)) ?? CLICKABLE;
  for (const r of family) {
    if (r === role) continue;
    const alt = page.locator(`role=${r}${attrs}${rest}`).first();
    if ((await alt.count()) > 0) {
      console.warn(`  selector ${sel} found nothing; using role=${r}${attrs}${rest}`);
      return alt;
    }
  }
  // The accessible name can come from an aria-label that differs from the visible text
  // ("Pending reports: 1" vs "Pending reports (1)"); try the same pattern as visible text.
  const name = attrs.match(/^\[name=(\/.*\/[a-z]*|"[^"]*"|'[^']*')\]$/);
  if (name) {
    const t = name[1].startsWith("/") ? name[1] : name[1].slice(1, -1);
    const alt = page.locator(`text=${t}`).first();
    if ((await alt.count()) > 0) {
      console.warn(`  selector ${sel} found nothing; using text=${t}`);
      return alt;
    }
  }
  return first; // let the caller fail with the original selector in the message
};

/* ---------- helpers that run in the page ---------- */
const findPanel = async (): Promise<Locator> => {
  if (site.panel && site.panel !== "auto") {
    const loc = page.locator(site.panel).first();
    await loc.evaluate((e) => {
      document.querySelectorAll("[data-fv-panel]").forEach((x) => x.removeAttribute("data-fv-panel"));
      e.setAttribute("data-fv-panel", "1");
    });
    return loc;
  }
  // Tag the largest scrollable element (at least 40% of viewport), else fall back to the document root.
  await page.evaluate(() => {
    document.querySelectorAll("[data-fv-panel]").forEach((e) => e.removeAttribute("data-fv-panel"));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const els = [...document.querySelectorAll<HTMLElement>("*")].filter((e) => {
      if (e === document.documentElement || e === document.body) return false;
      const s = getComputedStyle(e);
      return (
        /(auto|scroll)/.test(s.overflowY) &&
        e.scrollHeight > e.clientHeight + 20 &&
        e.clientWidth >= vw * 0.4 &&
        e.clientHeight >= vh * 0.4
      );
    });
    els.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    (els[0] ?? document.documentElement).setAttribute("data-fv-panel", "1");
  });
  return page.locator("[data-fv-panel]").first();
};

type PanelGeometry = {
  isRoot: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  sh: number;
  scrollTop: number;
};

/** Compute viewport-clamped geometry for a panel (handles scrolled documentElement safely). */
const getPanelGeometry = async (panel: Locator): Promise<PanelGeometry> =>
  panel.evaluate((e) => {
    const isRoot = e === document.documentElement || e === document.body;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (isRoot) {
      return {
        isRoot: true,
        x: 0,
        y: 0,
        w: Math.max(1, Math.min(Math.floor(e.clientWidth || vw), vw)),
        h: Math.max(1, Math.min(Math.floor(e.clientHeight || vh), vh)),
        sh: Math.max(e.scrollHeight, document.body?.scrollHeight ?? 0, vh),
        scrollTop: window.scrollY || document.documentElement.scrollTop || document.body?.scrollTop || 0,
      };
    }
    const r = e.getBoundingClientRect();
    const x = Math.max(0, Math.min(Math.floor(r.left), vw - 1));
    const y = Math.max(0, Math.min(Math.floor(r.top), vh - 1));
    const w = Math.max(1, Math.min(Math.floor(e.clientWidth || r.width), vw - x));
    const h = Math.max(1, Math.min(Math.floor(e.clientHeight || r.height), vh - y));
    return {
      isRoot: false,
      x,
      y,
      w,
      h,
      sh: Math.max(e.scrollHeight, h),
      scrollTop: e.scrollTop || 0,
    };
  });

/** Jump scroll immediately even when CSS `scroll-behavior: smooth` is active. */
const scrollPanelInstant = async (panel: Locator, top: number): Promise<number> =>
  panel.evaluate((e, t) => {
    const isRoot = e === document.documentElement || e === document.body;
    if (isRoot) {
      window.scrollTo({ top: t, left: 0, behavior: "instant" });
      return window.scrollY || document.documentElement.scrollTop || document.body?.scrollTop || 0;
    }
    e.scrollTo({ top: t, behavior: "instant" });
    return e.scrollTop;
  }, top);

/** Names of the elements the last measure() call could not find. */
let missing: string[] = [];

/** Measure named elements, relative to `origin` (a box in CSS px) plus scroll offset, x DPR. */
const measure = async (
  refs: Record<string, ElementRef> | undefined,
  origin: { x: number; y: number; scrollTop: number },
  scope: string | null = null,
): Promise<Record<string, Rect>> => {
  const out: Record<string, Rect> = {};
  missing = [];
  for (const [name, ref] of Object.entries(refs ?? {})) {
    let b: number[] | null;
    if (typeof ref === "string") {
      // in a panel shot, prefer a match inside the panel (the same label can sit in the menu)
      const inPanel = scope ? page.locator(scope).locator(ref).first() : null;
      const l = inPanel && (await inPanel.count()) > 0 ? inPanel : await loc(ref);
      // boundingBox() on a locator with no match waits the full action timeout (30 s)
      const bb = (await l.count()) > 0 ? await l.boundingBox({ timeout: 5000 }).catch(() => null) : null;
      b = bb ? [bb.x, bb.y, bb.width, bb.height] : null;
    } else {
      b = await page.evaluate(([r, sc]) => {
        const isCard = (e: HTMLElement) => {
          const s = getComputedStyle(e);
          // a card is rounded and stands out: a border, a shadow, or a fill that differs
          // from its parent's (a grey tile on a white page has neither border nor shadow)
          const bg = s.backgroundColor;
          const filled =
            bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg) &&
            !!e.parentElement && getComputedStyle(e.parentElement).backgroundColor !== bg;
          return (
            parseFloat(s.borderTopLeftRadius) >= 8 &&
            (parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none" || filled)
          );
        };
        let el: HTMLElement | null = null;
        const want = r.text.trim().toLowerCase();
        const root = (!r.global && sc && document.querySelector(sc)) || document.body;
        const shown = (e: HTMLElement) => {
          for (let p: HTMLElement | null = e; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (s.visibility === "hidden" || s.opacity === "0" || s.display === "none") return false;
          }
          return true;
        };
        const hits = [...root.querySelectorAll<HTMLElement>("*")].filter((e) => {
          if (e.offsetParent === null) return false;
          const bb = e.getBoundingClientRect();
          return (
            bb.width > 0 &&
            bb.height > 0 &&
            e.innerText?.trim().toLowerCase() === want &&
            shown(e)
          );
        });
        // the innermost element with exactly this text, in reading order (top, then left)
        hits.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (
            a.innerText.length - b.innerText.length ||
            Math.round(ra.top - rb.top) ||
            Math.round(ra.left - rb.left) ||
            ra.width - rb.width
          );
        });
        // drop ancestors of an earlier hit (same text, wider box)
        const inner = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)));
        el = inner[r.nth ?? 0] ?? null;
        if (el && r.field) {
          const label = el.innerText.trim();
          let p: HTMLElement | null = el.parentElement;
          while (
            p &&
            p !== document.body &&
            p.innerText.trim() === label &&
            !p.querySelector("input,select,textarea,[role=combobox]")
          )
            p = p.parentElement;
          if (p && p !== document.body) el = p;
        } else if (el && r.card) {
          const w0 = el.getBoundingClientRect().width;
          let p: HTMLElement | null = el;
          while (p && p !== document.body && !(isCard(p) && p.getBoundingClientRect().width >= w0))
            p = p.parentElement;
          if (p && p !== document.body) el = p;
        }
        if (!el) return null;
        const bx = el.getBoundingClientRect();
        return [bx.left, bx.top, bx.width, bx.height];
      }, [ref, scope] as const);
      if (!b) {
        const f = await asField(ref.text);
        const bb = f && (await f.boundingBox().catch(() => null));
        if (bb) b = [bb.x, bb.y, bb.width, bb.height];
      }
    }
    if (!b) {
      // Skip, do not fail: the screenshot is fine and the film can do without one highlight.
      // STRICT_ELEMENTS=1 restores the old behaviour.
      if (process.env.STRICT_ELEMENTS === "1")
        throw new Error(`element "${name}" not found (${JSON.stringify(ref)})`);
      console.warn(`::warning::element "${name}" not found (${JSON.stringify(ref)}); skipped`);
      missing.push(name);
      continue;
    }
    out[name] = [
      Math.round((b[0] - origin.x) * DPR),
      Math.round((b[1] - origin.y + origin.scrollTop) * DPR),
      Math.round(b[2] * DPR),
      Math.round(b[3] * DPR),
    ];
  }
  return out;
};

/** Stitch the whole scroll container into one PNG (DPR px), or capture only the visible slice when full=false. */
const stitchPanel = async (panel: Locator, file: string, full: boolean) => {
  const g = await getPanelGeometry(panel);
  const clip = { x: g.x, y: g.y, width: g.w, height: g.h };
  if (!full) {
    await park();
    const buf = await page.screenshot({ clip, scale: "device" });
    const meta = await sharp(buf).metadata();
    const W = meta.width ?? Math.round(g.w * DPR);
    const H = meta.height ?? Math.round(g.h * DPR);
    writeFileSync(file, buf);
    return { geo: g, size: [W, H] as [number, number] };
  }

  const parts: { input: Buffer; top: number; left: number; width: number; bottom: number }[] = [];
  let maxSh = g.sh;
  let top = 0;
  let prev = -1;
  for (let step = 0; step < 60; step++) {
    const st = await scrollPanelInstant(panel, top);
    if (st === prev) break; // the container would not scroll further
    prev = st;
    await page.waitForTimeout(200);
    await park();
    const cur = await getPanelGeometry(panel);
    maxSh = Math.max(maxSh, cur.sh);
    const buf = await page.screenshot({ clip, scale: "device" });
    const meta = await sharp(buf).metadata();
    const tileW = meta.width ?? Math.round(g.w * DPR);
    const tileH = meta.height ?? Math.round(g.h * DPR);
    const offsetTop = Math.round(st * DPR);
    parts.push({ input: buf, top: offsetTop, left: 0, width: tileW, bottom: offsetTop + tileH });
    if (st + g.h >= maxSh - 1) break;
    top = st + g.h;
  }
  await scrollPanelInstant(panel, 0);
  const W = Math.max(Math.round(g.w * DPR), ...parts.map((p) => p.width));
  const H = Math.max(Math.round(maxSh * DPR), ...parts.map((p) => p.bottom));
  await sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } })
    .composite(parts.map(({ input, top: t, left }) => ({ input, top: t, left })))
    .png()
    .toFile(file);
  return { geo: g, size: [W, H] as [number, number] };
};

/* ---------- shots ---------- */
const positions: Positions = {};
const layout: { window?: { src: string; width: number }; panel?: { x: number; y: number; w: number } } = {};

for (const shot of spec.shots) {
  try {
    await runShot(shot);
  } catch (err) {
    const dbg = join(outCaps, `_error-${shot.name}.png`);
    await page.screenshot({ path: dbg }).catch(() => {});
    const labels = await page
      .evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("button,a,[role=tab],[role=button],[role=option]")]
          .filter((e) => e.offsetParent !== null)
          .map((e) => JSON.stringify(e.innerText.trim().replace(/\s+/g, " ").slice(0, 40)))
          .filter((t) => t !== '""')
          .slice(0, 80)
          .join(" "),
      )
      .catch(() => "");
    console.error(`\nshot "${shot.name}" failed at ${page.url()}\n  screenshot: ${dbg}\n  clickable: ${labels}\n`);
    await browser.close();
    throw err;
  }
}

async function runShot(shot: Shot) {
  const t0 = Date.now();
  if (shot.url) {
    await page.goto(url(shot.url));
    await settle();
    assertSignedIn(page, site, shot.url);
    await hideCss();
  }
  for (const a of shot.actions ?? []) {
    if ("click" in a) await (await loc(a.click)).click();
    else if ("fill" in a) await (await loc(a.fill)).fill(a.value);
    else if ("select" in a) await (await loc(a.select)).selectOption(a.value);
    else if ("press" in a) await page.keyboard.press(a.press);
    else if ("hover" in a) await (await loc(a.hover)).hover();
    else if ("waitFor" in a) await (await loc(a.waitFor, 30000)).waitFor({ timeout: 30000 });
    else if ("wait" in a) await page.waitForTimeout(a.wait);
    else if ("goto" in a) {
      await page.goto(url(a.goto));
      await settle();
      await hideCss();
    }
  }
  // Wait for CONTENT, not for the framework: a beat taken at "loaded" lands on a spinner.
  if (shot.waitFor) await page.locator(shot.waitFor).first().waitFor({ timeout: 30000 });
  await settle();
  const file = join(outCaps, `${shot.name}.png`);

  if (shot.kind === "window") {
    await park();
    await page.screenshot({ path: file, scale: "device" });
    const elements = await measure(shot.elements, { x: 0, y: 0, scrollTop: 0 });
    const size: [number, number] = [VP.width * DPR, VP.height * DPR];
    positions[shot.name] = { size, elements };
    layout.window ??= { src: shot.name, width: size[0] };
    // the panel offset inside the window capture
    const panel = await findPanel();
    const g = await getPanelGeometry(panel);
    layout.panel ??= { x: Math.round(g.x * DPR), y: Math.round(g.y * DPR), w: Math.round(g.w * DPR) };
  } else if (shot.kind === "panel") {
    const panel = await findPanel();
    const full = shot.full ?? true;
    if (full) await scrollPanelInstant(panel, 0);
    const g0 = await getPanelGeometry(panel);
    const elements = await measure(
      shot.elements,
      { x: g0.x, y: g0.y, scrollTop: full ? g0.scrollTop : 0 },
      "[data-fv-panel]",
    );
    const { size } = await stitchPanel(panel, file, full);
    positions[shot.name] = { size, elements };
  } else {
    if (!shot.element) throw new Error(`shot ${shot.name}: kind "element" needs "element"`);
    const el = await loc(shot.element);
    await park();
    await el.screenshot({ path: file, scale: "device" });
    const bb = (await el.boundingBox())!;
    const elements = await measure(shot.elements, { x: bb.x, y: bb.y, scrollTop: 0 });
    positions[shot.name] = {
      size: [Math.round(bb.width * DPR), Math.round(bb.height * DPR)],
      elements,
    };
  }
  const p = positions[shot.name];
  // record what was skipped, so the film step (and a human) can see it
  if (missing.length) (p as { missing?: string[] }).missing = [...missing];
  const named = Object.keys(shot.elements ?? {}).length;
  if (named > 0 && Object.keys(p.elements).length === 0)
    throw new Error(`shot ${shot.name}: none of its ${named} elements was found; wrong page?`);
  console.log(
    `${shot.name.padEnd(24)} ${shot.kind.padEnd(7)} ${p.size.join("x").padEnd(10)} ` +
      `${Object.keys(p.elements).length} elements  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

writeFileSync(join(dir, "positions.json"), JSON.stringify(positions, null, 1) + "\n");
writeFileSync(join(dir, "layout.json"), JSON.stringify(layout, null, 2) + "\n");
console.log(`layout: ${JSON.stringify(layout)}`);
await browser.close();
