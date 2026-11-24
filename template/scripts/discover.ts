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
