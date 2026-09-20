# WhoBack

WhoBack is a local-first Chrome extension that shows Instagram relationship state without asking for your Instagram password or requiring an export.

## What it does

- Detects the Instagram account already signed in on `instagram.com`.
- Reads the signed-in account ID from Instagram's `ds_user_id` browser cookie instead of spending a network request on identity lookup.
- Scans following and followers through the active Instagram web session.
- Shows mutuals, accounts that do not follow you back, and accounts you do not follow back.
- Stores versioned scan checkpoints locally so interrupted scans resume from the last cursor instead of page 1.
- Stores up to 30 completed snapshots to detect new followers and unfollowers.
- Provides a compact popup, detailed side panel, search, profile links, guarded auto-sync, and settings.

## Scan runtime

The production data path is:

```text
Instagram browser session
        ↓
ds_user_id cookie
        ↓
viewer ID (zero network requests)
        ↓
MAIN-world relationship scanner
        ↓
following pages → checkpoint after every page
        ↓
followers pages → checkpoint after every page
        ↓
normalized snapshot
        ↓
relationship diff
```

The scanner is intentionally conservative:

- one active scanner per Instagram tab
- 1.5–3 second jitter between ordinary pages
- ~20 second longer pause every 5 completed pages
- immediate hard stop on HTTP 429 or Instagram block/checkpoint signals
- partial progress is persisted locally and resumed manually after cooldown
- no automatic retry loop after a rate limit

## Stack

- WXT 0.21 / Manifest V3
- React 19 + TypeScript
- Tailwind CSS 4.3
- Chrome Storage + Cookies + Scripting + Alarms + Side Panel APIs
- Vitest

## Development

```bash
corepack enable
pnpm install
pnpm dev
```

Production build:

```bash
pnpm check
pnpm zip
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome for local testing.

## Privacy

WhoBack does not collect Instagram passwords. It reads only the Instagram account ID cookie (`ds_user_id`) needed to identify the signed-in account; it does not copy the Instagram password or session token to an application server. Relationship checkpoints and snapshots are stored locally in extension storage. The current implementation has no application backend.

## Reliability note

Instagram does not expose an official consumer API for full follower/following lists. WhoBack therefore relies on Instagram's internal web relationship endpoints and the user's existing browser session. These endpoints, schemas, page sizes, and rate limits are undocumented and can change. WhoBack minimizes request volume, preserves resumable progress, and stops on rate-limit/block responses, but it cannot guarantee Instagram will never rate-limit a scan.
