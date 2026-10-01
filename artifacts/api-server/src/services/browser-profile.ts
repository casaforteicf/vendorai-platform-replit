import { type CookieData, type Page } from "puppeteer-core";

export type BrowserProfileState = {
  version: 1;
  cookies: CookieData[];
  origins: Record<string, {
    localStorage: Record<string, string>;
  }>;
  capturedAt: string;
};

export async function captureBrowserProfile(page: Page): Promise<BrowserProfileState> {
  const cookies = await page.cookies();
  const originState = await page.evaluate(() => {
    const values: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key) values[key] = localStorage.getItem(key) ?? "";
    }
    return { origin: location.origin, localStorage: values };
  }).catch(() => null);

  return {
    version: 1,
    cookies,
    origins: originState ? {
      [originState.origin]: { localStorage: originState.localStorage },
    } : {},
    capturedAt: new Date().toISOString(),
  };
}

export async function restoreBrowserProfileBeforeNavigation(
  page: Page,
  profile?: BrowserProfileState,
) {
  if (profile?.cookies?.length) {
    await page.setCookie(...profile.cookies).catch(() => undefined);
  }
}

export async function restoreBrowserProfileAfterNavigation(
  page: Page,
  profile?: BrowserProfileState,
) {
  if (!profile) return false;
  const currentOrigin = await page.evaluate(() => location.origin).catch(() => "");
  const saved = profile.origins[currentOrigin];
  if (!saved || !Object.keys(saved.localStorage).length) return false;
  await page.evaluate((values) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
  }, saved.localStorage);
  return true;
}

export function mergeBrowserProfiles(
  previous: BrowserProfileState | undefined,
  next: BrowserProfileState,
): BrowserProfileState {
  return {
    version: 1,
    cookies: next.cookies,
    origins: { ...(previous?.origins ?? {}), ...next.origins },
    capturedAt: next.capturedAt,
  };
}
