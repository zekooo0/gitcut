/**
 * Discover a page: print its headings, buttons, inputs, tabs and the scroll container.
 * Feeds the brief step (the LLM must use REAL labels) and helps write capture.json by hand.
 *
 *   node scripts/discover.ts <site-or-json-path-or-url> <path> [--json]
 *   e.g. CAPTURE_STORAGE_STATE=../.auth/staging.json node scripts/discover.ts example /dashboard
 *   e.g. node scripts/discover.ts http://localhost:3000 /settings
 */
import { assertSignedIn, loadSite, openSession, settle } from "./lib/session.ts";

const [siteArg, path, flag] = process.argv.slice(2);
if (!siteArg || !path) {
  console.error("usage: node scripts/discover.ts <site-or-json-path-or-url> <path> [--json]");
  process.exit(2);
}
const site = /^https?:\/\//i.test(siteArg) ? loadSite({ baseUrl: siteArg }) : loadSite({ site: siteArg });
const { browser, page, url } = await openSession(site, { dpr: 1 });
await page.goto(url(path));
await settle(page);
assertSignedIn(page, site, path);
await page.waitForTimeout(900);

const info = await page.evaluate(() => {
  const vis = (e: Element) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (e: Element) => {
    const r = e.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  };
  const parseRgb = (css: string): [number, number, number, number] | null => {
    const m = css.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
  };
  const toHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const saturation = (r: number, g: number, b: number) => {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };

  // Extract real computed CSS theme tokens so videos match the website's visual language.
  const bodyCs = getComputedStyle(document.body);
  const htmlCs = getComputedStyle(document.documentElement);
  const bgRgb = (() => {
    const b = parseRgb(bodyCs.backgroundColor);
    if (b && b[3] > 0.1) return b;
    const h = parseRgb(htmlCs.backgroundColor);
    if (h && h[3] > 0.1) return h;
    return [255, 255, 255, 1] as [number, number, number, number];
  })();
  const textRgb = parseRgb(bodyCs.color) ?? [17, 24, 39, 1];
  const mode = luminance(bgRgb[0], bgRgb[1], bgRgb[2]) >= 0.5 ? "light" : "dark";

  // Find dominant brand accent from visible buttons/CTAs/links with real color saturation.
  let accent: string | undefined;
  let bestScore = 0;
  for (const el of [...document.querySelectorAll<HTMLElement>("button,a,[role=button]")].filter(vis).slice(0, 80)) {
    const cs = getComputedStyle(el);
    for (const raw of [cs.backgroundColor, cs.borderColor, cs.color]) {
      const rgb = parseRgb(raw);
      if (!rgb || rgb[3] < 0.5) continue;
      const sat = saturation(rgb[0], rgb[1], rgb[2]);
      const lum = luminance(rgb[0], rgb[1], rgb[2]);
      if (sat < 0.28 || lum < 0.08 || lum > 0.94) continue;
      const isFilledBg = raw === cs.backgroundColor ? 2.0 : 1.0;
      const score = sat * isFilledBg;
      if (score > bestScore) {
        bestScore = score;
        accent = toHex(rgb[0], rgb[1], rgb[2]);
      }
    }
  }

  // Find a card/surface background that differs slightly from body background.
  let surface: string | undefined;
  let radius: string | undefined;
  const bgHex = toHex(bgRgb[0], bgRgb[1], bgRgb[2]);
  for (const el of [...document.querySelectorAll<HTMLElement>("section,article,main,div,button")].filter(vis).slice(0, 120)) {
    const cs = getComputedStyle(el);
    if (!radius && el.tagName === "BUTTON" && cs.borderRadius && cs.borderRadius !== "0px") {
      radius = cs.borderRadius;
    }
    const rgb = parseRgb(cs.backgroundColor);
    if (!surface && rgb && rgb[3] > 0.7) {
      const hex = toHex(rgb[0], rgb[1], rgb[2]);
      if (hex !== bgHex && saturation(rgb[0], rgb[1], rgb[2]) < 0.2) surface = hex;
    }
  }

  const h1 = document.querySelector<HTMLElement>("h1,h2");
  const cleanFont = (f: string) => f.split(",")[0]?.replace(/["']/g, "").trim() || undefined;
  const metaContent = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content?.trim() || undefined;
  const theme = {
    mode,
    background: bgHex,
    surface,
    text: toHex(textRgb[0], textRgb[1], textRgb[2]),
    accent,
    headingFont: cleanFont(h1 ? getComputedStyle(h1).fontFamily : bodyCs.fontFamily),
    bodyFont: cleanFont(bodyCs.fontFamily),
    radius,
    metaDescription: metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]'),
    ogTitle: metaContent('meta[property="og:title"]'),
  };

  const scrollers = [...document.querySelectorAll<HTMLElement>("*")]
    .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20)
    .map((e) => ({ tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 60), box: box(e), scrollHeight: e.scrollHeight }));
  const pick = (sel: string) =>
    [...document.querySelectorAll(sel)]
      .filter(vis)
      .map((e) => {
        const text = ((e as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 80);
        const aria = e.getAttribute("aria-label") || undefined;
        return {
          text: text || aria || "",
          // accessible name, when it differs from the visible text (role selectors match THIS)
          name: aria && aria !== text ? aria : undefined,
          box: box(e),
          href: e.getAttribute("href") || undefined,
          role: e.getAttribute("role") || ({ A: "link", BUTTON: "button" } as Record<string, string>)[e.tagName] || e.tagName.toLowerCase(),
        };
      })
      .filter((x) => x.text);
  return {
    url: location.href,
    title: document.title,
    theme,
    headings: pick("h1,h2,h3,h4"),
    buttons: pick("button,[role=button],a[href]").slice(0, 120),
    tabs: pick("[role=tab]"),
    inputs: [...document.querySelectorAll("input,select,textarea")].filter(vis).map((e) => ({
      name: e.getAttribute("name"),
      placeholder: e.getAttribute("placeholder"),
      label: e.getAttribute("aria-label"),
      box: box(e),
    })),
    scrollers,
    text: document.body.innerText.slice(0, 4000),
  };
});
await browser.close();

if (flag === "--json") console.log(JSON.stringify(info, null, 1));
else {
  console.log(`${info.title}  ${info.url}`);
  console.log(`scroll containers: ${JSON.stringify(info.scrollers)}`);
  for (const k of ["headings", "tabs", "buttons"] as const)
    console.log(`\n# ${k}\n` + info[k].map((x) => `  ${x.text}  @${x.box.join(",")}`).join("\n"));
  console.log(`\n# inputs\n` + info.inputs.map((x) => `  ${JSON.stringify(x)}`).join("\n"));
}
