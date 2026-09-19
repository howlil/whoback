# WhoBack

WhoBack is a local-first Chrome extension that shows Instagram relationship state without asking for your Instagram password or requiring an export.

## What it does

- Detects the Instagram account already signed in on `instagram.com`.
- Scans followers and following from a background Instagram tab.
- Shows mutuals, accounts that do not follow you back, and accounts you do not follow back.
- Stores up to 30 local snapshots to detect new followers and unfollowers.
- Provides a compact popup, detailed side panel, search, profile links, auto-sync, and settings.

## Stack

- WXT 0.21 / Manifest V3
- React 19 + TypeScript
- Tailwind CSS 4.3
- Chrome Storage + Alarms + Side Panel APIs
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

WhoBack does not collect Instagram passwords. Relationship snapshots are stored locally in the browser extension storage. The current implementation has no application backend.

## Reliability note

Instagram does not expose an official API for this consumer follower/following use case. WhoBack therefore reads the relationship lists rendered by Instagram. Instagram UI changes may require collector updates.
