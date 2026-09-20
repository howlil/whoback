# WhoBack landing page design graph

## Content call graph

```text
Visitor arrives
  -> Understand product in one sentence
  -> See the actual UI language
  -> Verify the product answers the core use case
  -> Understand how installation works
  -> Understand privacy / limitations
  -> Download the latest release
```

Primary claim:
- See who follows back without handing over an Instagram password.

Supporting proof:
- Uses the Instagram session already open in the browser.
- Local-first; no WhoBack application backend.
- Saves progress for interrupted scans.
- Open source and manually installable from GitHub Releases.

Deliberately excluded:
- fake testimonials
- fake logos
- fake user counts
- fake performance claims
- pricing
- "AI-powered" positioning
- generic startup copy
- unsupported security guarantees

## Design graph

```text
Existing extension tokens
  -> white page canvas
  -> navy product anchor
  -> muted borders
  -> semantic result colors
  -> restrained card radius
  -> compact type scale
  -> product screenshot rendered as UI
```

Motion is limited to the hero product preview and result-card reveal. The rest of the page is intentionally static so the motion communicates product state instead of decorating the page.
