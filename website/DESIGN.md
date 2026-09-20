# WhoBack landing page design graph

## Job

Help a curious Instagram user answer one question quickly: can WhoBack show
follow relationships without asking for their password or sending their graph
to a WhoBack backend?

## Content flow

```text
Arrive
  -> see a WhoBack popup docked to a browser session
  -> read the relationship snapshot
  -> follow the scan execution path
  -> inspect the privacy ledger
  -> download and manually install the release
```

## Surface graph

```text
Hero<C: promise + before/after proof + CTA>
  -> ProofRail<C: session, answer, local result>
  -> MetricSnapshot<C: followers, following, relationship states>
  -> ScanTimeline<C: ready, sync, done>
  -> RecoveryState<C: paused checkpoint>
  -> PrivacyLedger<C: explicit data contract>
  -> InstallDock<C: download, extract, load unpacked>
```

The memorable surface is the Hero: a floating navigation pill, one centered
promise, and a before/after proof pair. The browser-session card explains the
starting context; the WhoBack popup card shows the useful result. This borrows
the reference composition without turning the landing page into a generic SaaS
dashboard or inventing a live Instagram connection.

## Visual system

The landing page shares the extension's visual tokens so the visitor can
recognize the product before installing it:

- `#F3F4F8` is the canvas and `#FFFFFF` is the panel surface.
- `#0C0E16` is ink and `#596071` is muted text.
- `#4437D6` is the brand action color; `#E5E3FF` is its soft state.
- The hero uses a soft blue/lavender gradient derived from the brand-purple
  family; it is a presentation layer, not a new semantic token.
- `#176B3D`, `#B42330`, and `#925400` are positive, danger, and warning
  states used in metric surfaces and recovery messaging.
- Inter is the only type family, matching the extension.
- Surface cards use the extension's line, radius, and `0 10px 30px` shadow
  recipe. Layout is compact and product-led rather than editorial.
- The hero is intentionally airy and high-contrast: dark ink headline, white
  proof cards, brand-purple action, and semantic positive/danger/warning states.

## State and behavior contract

- The page is static and does not require account data, a backend, or an auth
  state before it can render.
- The product preview is an illustrative extension snapshot, clearly marked as
  a sample; it does not pretend to be a live Instagram connection.
- The scan timeline and recovery panel are explanatory state surfaces. They do
  not run a scan and do not claim live progress.
- The popup preview has four interactive sample views: Overview, Don't follow
  back, Mutual, and You follow. Switching a view updates the headline, metric
  cards, and sample rows in the same surface.
- Motion is limited to the popup's first entrance, tab-panel continuity, and
  press/focus feedback. Reduced motion removes spatial and blur movement while
  keeping the selected state and content change visible.
- The only automatic motion is a short hero scan reveal. Reduced motion removes
  it without changing the content flow.
- Keyboard focus uses a visible signal-red outline. The page reflows the
  two-column surfaces into a single reading column below the tablet breakpoint.

## Product boundary

The landing page does not promise official Instagram API access, server-side
storage, guaranteed rate-limit avoidance, or Chrome Web Store distribution.
Those limits remain visible near the privacy and install decisions.
