/**
 * One signed-in browser session for a site (capture, discover and brief share it).
 *
 * Sign-in order:
 *   1. CAPTURE_STORAGE_STATE=<file>  a saved Playwright storage state (local runs)
 *   2. site.login + the env vars it names (CI: repository secrets DEMO_EMAIL / DEMO_PASSWORD)
 */
import { chromium, type Browser, type Page } from "playwright";
import { loadSite, loadSiteForDir, type ProductInfo, type Site } from "./site.ts";

export { loadSite, loadSiteForDir, type ProductInfo, type Site };

export const openSession = async (
  site: Site,
  opts: { dpr?: number } = {},
): Promise<{ browser: Browser; page: Page; url: (p: string) => string }> => {
  const vp = { width: 1440, height: 900, dpr: 2, ...site.viewport };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: opts.dpr ?? vp.dpr ?? 2,
    storageState: process.env.CAPTURE_STORAGE_STATE || undefined,
  });
  const page = await ctx.newPage();
  const url = (p: string) => new URL(p, site.baseUrl).toString();

  if (!process.env.CAPTURE_STORAGE_STATE && site.login) {
    const L = site.login;
    await page.goto(url(L.url));
    for (const [sel, envName] of Object.entries(L.fields)) {
      const v = process.env[envName];
      if (!v) throw new Error(`login: env var ${envName} is not set`);
      await page.locator(sel).fill(v);
    }
    if (L.check) await page.locator(L.check).check().catch(() => {});
    await page.locator(L.submit).first().click();
    // Signed in = the URL left the signed-out pages. Never test for a word: the login page itself
    // says "Sign in to your admin dashboard", so a text check passes while still signed out.
    const out = L.loggedOut ?? "/auth/";
    try {
      await page.waitForURL((u) => !u.pathname.startsWith(out), { timeout: 30000 });
    } catch {
      const msg = await page
        .evaluate(() =>
          [...document.querySelectorAll("[role=alert], [class*=error i], [class*=toast i], .Mui-error")]
            .map((e) => (e as HTMLElement).innerText.trim())
            .filter(Boolean)
            .join(" / "),
        )
        .catch(() => "");
      throw new Error(`sign-in failed: still on ${page.url()}${msg ? `; the page says: ${msg}` : ""}`);
    }
    if (L.waitFor) await page.locator(L.waitFor).first().waitFor({ timeout: 30000 });
  }
  return { browser, page, url };
};

/** Throw if a navigation bounced back to the sign-in page (no access, or the session ended). */
export const assertSignedIn = (page: Page, site: Site, wanted: string) => {
  const out = site.login?.loggedOut ?? "/auth/";
  if (site.login && new URL(page.url()).pathname.startsWith(out))
    throw new Error(`opening ${wanted} sent the browser to ${page.url()}: the demo user is signed out or has no access`);
};

export const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
};

export const hideCss = async (page: Page, site: Site) => {
  if (!site.hide?.length) return;
  await page.addStyleTag({ content: `${site.hide.join(",")}{visibility:hidden !important}` });
};
