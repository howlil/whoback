import { chromium, expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(repoRoot, '.output', 'chrome-mv3');
const instagramFixture = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Instagram fixture</title></head>
  <body>
    <header>
      <nav>
        <a aria-label="Profile" href="/howlil/" style="display:block;width:48px;height:48px">
          <img alt="howlil" width="48" height="48" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />
        </a>
      </nav>
    </header>
  </body>
</html>`;

type StoredState = {
  account: { username: string; platformUserId?: string } | null;
  snapshots: Array<Record<string, unknown>>;
  sync: { phase: string; progress: number };
};

async function readState(page: Page): Promise<StoredState | undefined> {
  return page.evaluate(async () => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome: {
        storage: {
          local: {
            get: (key: string) => Promise<Record<string, unknown>>;
          };
        };
      };
    }).chrome;
    const stored = await chromeApi.storage.local.get('whoback-state');
    return stored['whoback-state'] as StoredState | undefined;
  });
}

async function clearState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome: { storage: { local: { clear: () => Promise<void> } } };
    }).chrome;
    await chromeApi.storage.local.clear();
  });
}

async function extensionId(context: BrowserContext): Promise<string> {
  const serviceWorker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker');
  return new URL(serviceWorker.url()).hostname;
}

async function fulfillInstagramRoute(route: Route) {
  const url = new URL(route.request().url());
  const pathName = url.pathname;

  if (!pathName.startsWith('/api/v1/')) {
    await route.fulfill({ status: 200, contentType: 'text/html', body: instagramFixture });
    return;
  }

  let body: Record<string, unknown>;
  if (pathName === '/api/v1/users/42/info/') {
    body = { status: 'ok', user: { following_count: 2, follower_count: 2 } };
  } else if (pathName === '/api/v1/friendships/42/following/') {
    body = {
      status: 'ok',
      users: [
        { pk: '1', username: 'mutual' },
        { pk: '2', username: 'ghost' },
      ],
      has_more: false,
    };
  } else if (pathName === '/api/v1/friendships/42/followers/') {
    body = {
      status: 'ok',
      users: [{ pk: '1', username: 'mutual' }],
      has_more: false,
    };
  } else if (pathName === '/api/v1/friendships/show/2/') {
    body = { status: 'ok', followed_by: false, following: true };
  } else {
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test('detects the signed-in account, completes a scan, and renders the result in the sidepanel', async ({}, testInfo) => {
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    // Chromium does not load unpacked MV3 extensions in headless mode.
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    await context.route('https://www.instagram.com/**', fulfillInstagramRoute);
    const id = await extensionId(context);
    const instagram = await context.newPage();
    await instagram.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });

    const storagePage = await context.newPage();
    await storagePage.goto(`chrome-extension://${id}/options.html`);
    await expect.poll(async () => (await readState(storagePage))?.account?.username).toBe('howlil');

    // Clear the automatic content-script report so popup probing must use REQUEST_ACCOUNT.
    await clearState(storagePage);
    await storagePage.close();

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByText('@howlil')).toBeVisible();
    await expect(popup.getByText('Ready for your first check')).toBeVisible();

    // Mirror the production viewer identity source without using a real Instagram session.
    await context.addCookies([{
      name: 'ds_user_id',
      value: '42',
      domain: '.instagram.com',
      path: '/',
      secure: true,
    }]);
    await popup.getByRole('button', { name: 'Check now' }).click();
    await expect.poll(async () => (await readState(popup))?.sync.phase, { timeout: 20_000 }).toBe('complete');

    await expect(popup.getByText("Don't follow you back")).toBeVisible();
    await expect(popup.getByText('View details')).toBeVisible();

    const sidepanel = await context.newPage();
    await sidepanel.goto(`chrome-extension://${id}/sidepanel.html`);
    await expect(sidepanel.getByText('@howlil')).toBeVisible();
    await expect(sidepanel.getByText('@ghost')).toBeVisible();
    await expect(sidepanel.getByText('Fast scan skipped the full follower list')).toBeVisible();
  } finally {
    await context.close();
  }
});
