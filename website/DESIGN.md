# WhoBack landing page design graph

## Job

Help a curious Instagram user answer one question quickly: can WhoBack show
follow relationships without asking for their password or sending their graph
to a WhoBack backend?

## Content flow

```text
Arrive
  -> understand the relationship question and primary CTA
  -> read the relationship snapshot preview
  -> follow the scan execution path
  -> inspect the privacy ledger
  -> download and manually install the release
```

## Surface graph

```text
Hero<C: promise + CTA>
  -> FeatureShowcase<C: relationship states + scan changes>
  -> ScanTimeline<C: ready, sync, done>
  -> PrivacyLedger<C: explicit data contract>
  -> InstallDock<C: download, extract, load unpacked>
```

The memorable surface is the Hero: a floating navigation pill, one centered
promise, and a direct download CTA. The feature board provides the product
proof below it without inventing a live Instagram connection or requiring a
generic SaaS dashboard.

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
- Inter is used for interface text; Georgia is reserved for large editorial headings so the landing page has one clear display style.
- Surface cards use the extension's line, radius, and `0 10px 30px` shadow
  recipe. Layout is compact and product-led rather than editorial.
- The hero is intentionally airy and high-contrast: dark ink headline, white
  proof cards, brand-purple action, and semantic positive/danger/warning states.

## State and behavior contract

- The page is static and does not require account data, a backend, or an auth
  state before it can render.
- The feature board, workflow cards, and scan summary are illustrative static
  surfaces; they do not pretend to be a live Instagram connection.
- Motion is limited to section reveals, illustrative counters, and pointer
  feedback. Reduced motion removes movement while keeping the content visible.
- Keyboard focus uses a visible signal-red outline. The page reflows the
  two-column surfaces into a single reading column below the tablet breakpoint.

## Product boundary

The landing page does not promise official Instagram API access, server-side
storage, guaranteed rate-limit avoidance, or Chrome Web Store distribution.
Those limits remain visible near the privacy and install decisions.
