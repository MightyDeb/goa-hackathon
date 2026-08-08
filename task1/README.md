# HH Goa 2026 — Builder ID Card Generator

Format B from [the build plan](HH_Goa_2026_Build_Plan.md), built for latency first.

Upload a photo → get a finished card. No login, no signup, no server round trip
anywhere in the flow that produces the card.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

---

## The latency argument

The entire critical path — decode, composite, template switch, export — runs on
the client. The only network call in the whole app is the desktop share fallback,
and mobile never makes it.

Measured against the production build in headless Chromium on this machine, with
each step allowed to settle rather than measured under contention. The app
prints these live in its own status line, so they're verifiable at any time
rather than just claimed here.

| Step | Cost |
|---|---|
| Steady-state preview frame (drag, typing, zoom) | **0.8 ms**, 25/25 samples identical |
| Template switch, warm | 0.8 ms |
| Template switch, cold (first bake of that design) | 4.5–6.9 ms |
| Photo decode + downscale, 12 MP (3000×4000) | 256 ms |
| Full-size 1080×1350 PNG export (bake + draw + encode) | 44–87 ms |
| First Load JS | 117 kB |

Caveat on how to read these: headless Chromium here runs without GPU
acceleration, so compositing numbers are conservative and PNG encoding is
roughly representative. Numbers taken while several exports were racing each
other read ~10× worse; those are a measurement artifact, not the user's
experience, because the export is debounced to fire once after the user stops.

### How it gets there

**A card is on screen before the user does anything.** The page prerenders
static, and the canvas paints a complete card — grid, type, placeholder slot —
on the first frame. There is no empty state to wait through, so "upload to
result" starts from a card, not from a spinner.

**Background artwork is pre-cropped and pre-encoded.** The three source JPEGs
were re-encoded to WebP at exactly the card's design size (1080×1350) — 956 kB
down to 482 kB, and no runtime resampling. The default template's image is
`<link rel="preload">`ed so it starts downloading with the HTML; the other two
load at idle. Crucially the card paints immediately on each template's fallback
colour and swaps the artwork in on arrival, so a slow image never blocks first
paint. Layers baked before their image landed are deliberately not cached, or
the card would stay imageless for the rest of the session.

**Static layers are baked once.** Every template's backdrop, decorations and
overlays are rendered into two offscreen canvases per resolution
([lib/renderCard.ts](lib/renderCard.ts) `bakeLayers`). A frame is then two
`drawImage` blits + one clipped photo draw + text — hence 0.3 ms. The cache is
LRU-bounded to 8 entries because a full-size layer pair is ~11 MB.

**Drag never re-renders React.** The photo transform lives in a ref, not state.
`pointermove` writes the ref and schedules a single `requestAnimationFrame`;
multiple events in one frame coalesce into one paint. React re-renders zero
times during a drag.

**Decode happens off the main thread.** `createImageBitmap(File)` instead of
`new Image()`, with `imageOrientation: "from-image"` so EXIF-rotated iPhone
portraits land upright. The result is downscaled once to a 1600 px working
bitmap; every later drag, zoom and template switch draws from that, not from the
12 MP original.

**heic2any is never downloaded unless it's needed.** It's a ~1 MB dependency
behind a dynamic `import()` that only fires when native decoding has actually
thrown *and* the file looks like HEIC. It is not in the 117 kB first load.
(iOS Safari usually decodes HEIC natively, so this is a genuine fallback.)

**Fonts are self-hosted and pre-loaded.** `next/font` inlines Space Grotesk,
JetBrains Mono and Inter at build time — no Google Fonts round trip. Every
weight the templates draw with is explicitly `document.fonts.load()`ed and
awaited before the first text draw, per plan §6.

**The export is pre-warmed, off the interaction path.** 450 ms after the user
stops editing *and* on the next idle callback, the full-size PNG renders in the
background and is cached against a scene key. Tapping Download or Share usually
hands over an already-built blob instead of starting a 1080×1350 render inside
the click handler — which also keeps the user activation alive for
`navigator.share`. The double gate matters: that work is ~70 ms of main thread,
which would be a visible hitch if it landed mid-drag.

---

## Structure

```
lib/templates.ts    3 TemplateConfig objects — all visual difference lives here
lib/renderCard.ts   the single renderCard(ctx, data, config, fonts, scale)
lib/decor.ts        procedural decoration painters (seeded, never Math.random)
lib/image.ts        decode / HEIC / downscale pipeline
lib/titles.ts       50 curated builder titles, fully local
lib/shareStore.ts   fallback-share storage (Vercel Blob, or local fs in dev)
components/Studio.tsx   the whole interactive studio
app/share/[id]/     server-rendered OG page for the tweet-intent fallback
```

`renderCard` is the only drawing path. Adding a fourth template means adding a
config object — no new component, no new code path.

Decorations use a seeded PRNG rather than `Math.random()` on purpose: grain and
barcode patterns must be pixel-identical in the preview and in the downloaded
file, or the user downloads something they didn't approve.

## Templates

| | Artwork | Layout |
|---|---|---|
| **Beach Flat-Lay** | `bg-1` | Near-full-bleed rounded portrait, kelly-green ring, left-aligned display type |
| **Palm Road** | `bg-2` | Centred circular badge, gold ring, symmetric lanyard-ID layout |
| **Chapel Green** | `bg-3` | Hard-edged asymmetric crop, translucent meta panel, ticket-stub perforation and barcode |

All three carry the **Hacker House गोवा logo**, the dates **28–31 OCT 2026**, and
the **#BUILDING THE FUTURE — AIxCRYPTO** tag alongside `#FrameInGoa`. Those three
strings live in `EVENT_DATES`, `EVENT_TAG` and `LOGO_SRC` at the top of
[lib/templates.ts](lib/templates.ts), so changing a date or the tag is a
one-line edit that updates every template.

Logos are drawn from a `LogoLayer` whose height is derived from the asset's own
aspect ratio — a replacement logo of different proportions can't come out
stretched — and they bake into the same cached static layer as the decorations,
so a frame stays two blits no matter how many marks the card carries.

Three different layouts and photo-slot shapes, not three palettes of the same
card (plan §2). Each illustration sits at ~90% opacity under a green wash, with
top and bottom scrims carrying text legibility — the artwork stays recognisable
instead of being washed out until it may as well not be there.

### Palette

Kelly green surfaces, golden yellow type. Worth noting *why* it isn't literally
gold-on-kelly-green: `#FFD230` on `#4CBB17` is about **1.8:1** contrast, which
is unreadable. So kelly green carries accents, rings, pills and borders, while
surfaces use deep kelly-green shades — putting body text at ~13:1 and accents
at ~7:1, both past WCAG AA.

## Share

Per plan §4 there is **no X API and no auto-posting** — that would require
OAuth, which is the login wall the brief rules out.

There are two independent share actions, not one that guesses:

1. **Share on X** — always opens X's own compose box pre-filled with the caption
   and a link to `/share/[id]`, whose OG tags render the card as the preview
   image. Available on every device.
2. **Share…** — `navigator.share({ files: [card] })`, the OS share sheet with the
   real PNG attached. Nothing is uploaded. Only shown when the browser actually
   supports file sharing, feature-detected at mount with `navigator.canShare`
   rather than sniffed from the user agent.

**These are not the same result.** "Share on X" produces a *link preview card* —
a large thumbnail under your tweet text — because `intent/tweet` accepts only
`text` and `url`; attaching a real image would need the API and OAuth. "Share…"
passes the actual PNG file into the composer, so the card posts as a genuine
attached photo. Mobile users should prefer it.

`/share/[id]` is a **server component**, so `og:image` and
`twitter:card=summary_large_image` are in the initial HTML — X's crawler doesn't
run JavaScript. IDs are random per generated image and never reused, so X's
per-URL preview cache can't serve a stale card (plan §9).

The share page deliberately carries **no `noindex` meta**. Keeping these pages
out of search is done in [app/robots.ts](app/robots.ts), which disallows
`/share/` for `*` while allowing Twitterbot and the other link-preview
crawlers. A meta `noindex` applies to every bot and risks suppressing the
preview card itself.

**The preview only works from a public URL.** A `localhost` link produces no
card at all — X's crawler runs on X's servers and cannot reach your machine.
Deploy first, then test the real thing.

The fallback tab is opened synchronously inside the click handler and pointed at
X after the upload resolves; opening it after the `await` gets it blocked.

Caption: `I'm now officially a [Builder Title] at HH Goa 2026 🏖️ — [Name] #FrameInGoa`

## Deploy

Deploys to Vercel as-is. For production:

- Create a **Vercel Blob** store; `BLOB_READ_WRITE_TOKEN` is set automatically.
  Without it the app falls back to local filesystem storage, which works in dev
  but does not persist across serverless invocations.
- Set `CRON_SECRET`. [vercel.json](vercel.json) runs `/api/cleanup` daily, which
  deletes fallback-share uploads older than 30 days — these are anonymous, so
  without a TTL storage grows unbounded (plan §9).

---

## Test status

Verified in headless Chromium against the production build:

- [x] Layout at 360/390/430/560/700/860/899/1000 px: no horizontal overflow, column
      centred, card within 72% of viewport height at every width
- [x] Card updates live on every input — typing, role, reroll, photo upload
- [x] No hydration mismatch; no page errors on load
- [x] Portrait, landscape and square photos; off-centre subject repositioned correctly
- [x] Pan clamping — the photo can never expose the slot background at any zoom
- [x] 45-character name: capped at 24 in the input, auto-shrinks to fit on all 3 templates
- [x] Reroll never returns the same title twice in a row; fully local, no network
- [x] Template switch re-renders instantly with the same data, photo position preserved
- [x] Download produces a real, openable 1080×1350 PNG
- [x] Fallback share upload → `/share/[id]` → `og:image` serves a 172 kB PNG
- [x] Caption carries the personalised builder title and `#FrameInGoa`
- [x] No login/signup/X-auth anywhere in the flow
- [x] Zero console errors, zero failed requests

### Bugs found and fixed by testing in dev mode

Three of these only reproduce under `next dev`, which is why a production-build
test pass missed them:

- **Render loop wedged permanently.** The boot effect's cleanup cancelled a
  pending animation frame but left `frameRef.current` set. `schedule()` reads a
  non-null handle as "a frame is already queued", so every later call returned
  early and the canvas never repainted again. StrictMode's mount → unmount →
  remount triggers it on every dev load — the card was blank and ignored all
  input.
- **Hydration mismatch.** The builder title was rolled inside `useState`, so
  `Math.random()` ran during render on both server and client and produced two
  different titles. Now seeded deterministically and randomised after mount.
- **First sizing pass could be skipped.** `scaleRef` was seeded to `0.5`, and
  `resize()` bails when the new scale matches the old one — so a stage landing
  on exactly 540 CSS px at dpr 1 left the canvas at its default 300×150.
- **Card overflowed the viewport between ~560 and 900 px.** Single column was
  already correct, but the stage was unconstrained, so the 4:5 card grew taller
  than the screen and pushed the controls out of view.

### Still needs a real device, and can't be faked in a headless browser

- [ ] **HEIC upload from a real iPhone in Safari** — the native-decode-first path
      is written and the heic2any fallback is wired, but only a real HEIC file
      from a real iPhone proves which branch actually runs
- [ ] **`navigator.share` with files on iOS Safari and Android Chrome** — capability
      detection is correct, but the OS share sheet itself is untested
- [ ] **Link preview against a deployed `/share/[id]`** — the tags are correct
      and served in the initial HTML (verified), but a `localhost` URL can never
      render a card, so only a public deploy proves it. X's own card validator
      is retired; paste the deployed URL into opengraph.xyz or post it from a
      throwaway account
- [ ] Real-device layout check on a small phone (tested at responsive widths only)
